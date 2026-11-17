#!/usr/bin/env python3
"""Выравнивание краун-эфиров для просмотрщика наборов (?set=_supra/crown/...).

Вход: structures/_supra/crown/original/*.sdf (файлы учителя, не меняются).
Выход: structures/_supra/crown/complexes/*.sdf, annel/*.sdf, *.set.json, align-report.json.

Каждая структура переносится ЖЁСТКО (поворот + сдвиг, без отражений) целиком;
внутренняя геометрия не меняется. Подгонка (Кабш) идёт только по атомам макроцикла:
кольцевые O и C, связанные с этими O (для аннелированных — 18-членное ядро 18-краун-6).
Соответствие атомов: обход цикла, перебор циклических сдвигов (O→O) и двух направлений.

Система координат (одна для всех размеров): центроид атомов цикла в начале координат,
нормаль к средней плоскости цикла вдоль +z, ион металла эталона (K⁺) на стороне +z.
Эталон для каждого размера — комплекс N-K; остальные (свободный краун, 1:1, сэндвичи)
накладываются на него. Аннелированные K⁺-комплексы накладываются на 6-K.
Запуск: python3 tools/align_crowns.py
"""
import json, math, os, re, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BASE = os.path.join(ROOT, 'structures', '_supra', 'crown')
ORIG = os.path.join(BASE, 'original')
METALS = ['Li', 'Na', 'K', 'Rb', 'Cs']
NAME = {4: '12-краун-4', 5: '15-краун-5', 6: '18-краун-6', 7: '21-краун-7'}
CAVITY = {4: '1,2–1,5', 5: '1,7–2,2', 6: '2,6–3,2', 7: '3,4–4,3'}       # диаметр полости, Å (Педерсен)
ION_D = {'Li': 1.52, 'Na': 2.04, 'K': 2.76, 'Rb': 3.04, 'Cs': 3.34}     # 2·r ионный (Шеннон, КЧ 6), Å
ION_TXT = {'Li': 'Li⁺', 'Na': 'Na⁺', 'K': 'K⁺', 'Rb': 'Rb⁺', 'Cs': 'Cs⁺'}


def read_sdf(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    n, nb = int(lines[3][0:3]), int(lines[3][3:6])
    xyz, el = [], []
    for l in lines[4:4 + n]:
        xyz.append([float(l[0:10]), float(l[10:20]), float(l[20:30])])
        el.append(l[31:34].strip())
    bonds = []
    for l in lines[4 + n:4 + n + nb]:
        bonds.append((int(l[0:3]) - 1, int(l[3:6]) - 1, int(l[6:9])))
    return {'lines': lines, 'n': n, 'xyz': np.array(xyz), 'el': el, 'bonds': bonds}


def write_sdf(mol, xyz, path, title=None):
    lines = list(mol['lines'])
    if title is not None:
        lines[0] = title
    for i in range(mol['n']):
        l = lines[4 + i]
        lines[4 + i] = '%10.4f%10.4f%10.4f' % tuple(xyz[i]) + l[30:]
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))


def rings(mol):
    """Список макроциклов (по порядку обхода): O и C, связанные с кольцевыми O."""
    nb = {i: set() for i in range(mol['n'])}
    for a, b, _ in mol['bonds']:
        nb[a].add(b); nb[b].add(a)
    el = mol['el']
    O = {i for i in range(mol['n']) if el[i] == 'O'}
    core = set(O) | {j for i in O for j in nb[i] if el[j] == 'C'}
    adj = {i: [j for j in nb[i] if j in core] for i in core}
    assert all(len(v) == 2 for v in adj.values()), 'ядро цикла не 2-связно'
    seen, out = set(), []
    for start in sorted(O):
        if start in seen:
            continue
        cyc, prev, cur = [start], None, start
        while True:
            nxt = [j for j in adj[cur] if j != prev]
            nxt = min(nxt) if prev is None else nxt[0]
            if nxt == start:
                break
            cyc.append(nxt); prev, cur = cur, nxt
        seen |= set(cyc)
        out.append(cyc)
    return out


def kabsch(P, Q):
    """R, t: R·P + t ≈ Q (только поворот, det R = +1)."""
    pc, qc = P.mean(0), Q.mean(0)
    H = (P - pc).T @ (Q - qc)
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1, 1, d])
    R = Vt.T @ D @ U.T
    return R, qc - R @ pc


def mappings(cyc):
    """Все циклические обходы, начинающиеся с O (O ложится на O), в обе стороны."""
    n = len(cyc)
    for direction in (1, -1):
        seq = cyc if direction == 1 else [cyc[0]] + cyc[:0:-1]
        for s in range(0, n, 3):
            yield seq[s:] + seq[:s]


def metal_idx(mol):
    return [i for i, e in enumerate(mol['el']) if e in METALS]


def fit(mol, cyc, ref_xyz, prefer_up=True, tol=0.15):
    """Лучшее жёсткое наложение цикла cyc молекулы на ref_xyz (атомы цикла эталона по порядку)."""
    cands = []
    for m in mappings(cyc):
        P = mol['xyz'][m]
        R, t = kabsch(P, ref_xyz)
        rmsd = float(np.sqrt(((P @ R.T + t - ref_xyz) ** 2).sum(1).mean()))
        X = mol['xyz'] @ R.T + t
        cands.append((rmsd, R, t, X))
    best = min(c[0] for c in cands)
    near = [c for c in cands if c[0] <= best + tol]
    mi = metal_idx(mol)
    if prefer_up and mi:
        # почти равные наложения (симметрия цикла): берём то, где ион над кольцом (+z), как у эталона
        near.sort(key=lambda c: (-round(float(c[3][mi[0], 2]), 2), c[0]))
    else:
        near.sort(key=lambda c: c[0])
    return near[0]


def canon(mol, cyc):
    """Каноническая система эталона: центроид цикла в 0, нормаль вдоль z, ион на +z, первый O на +y."""
    P = mol['xyz'][cyc]
    c = P.mean(0)
    _, _, Vt = np.linalg.svd(P - c)
    nrm = Vt[2]
    mi = metal_idx(mol)
    if mi and np.dot(mol['xyz'][mi[0]] - c, nrm) < 0:
        nrm = -nrm
    o0 = P[0] - c
    y = o0 - np.dot(o0, nrm) * nrm
    y /= np.linalg.norm(y)
    x = np.cross(y, nrm)
    R = np.array([x, y, nrm])           # строки — новые оси
    if np.linalg.det(R) < 0:
        R[0] = -R[0]
    return (mol['xyz'] - c) @ R.T


def dist_rmsd(A, B):
    dA = np.linalg.norm(A[:, None] - A[None], axis=2)
    dB = np.linalg.norm(B[:, None] - B[None], axis=2)
    return float(np.sqrt(((dA - dB) ** 2).mean())), float(np.abs(dA - dB).max())


def geom(X, mol, cyc):
    """Ион: среднее M–O, расстояние до средней плоскости атомов O цикла (у сэндвича — ближайшего кольца)."""
    mi = metal_idx(mol)
    if not mi:
        return None
    rs = rings(mol)
    if len(rs) > 1:
        gs = [geom1(X, mol, c, mi) for c in rs]
        return min(gs, key=lambda g: g['mo'])
    return geom1(X, mol, cyc, mi)


def geom1(X, mol, cyc, mi):
    M = X[mi[0]]
    Oi = [i for i in cyc if mol['el'][i] == 'O']
    Ox = X[Oi]
    c = Ox.mean(0)
    _, _, Vt = np.linalg.svd(Ox - c)
    h = abs(float(np.dot(M - c, Vt[2])))
    mo = float(np.linalg.norm(Ox - M, axis=1).mean())
    return {'mo': round(mo, 2), 'h': round(h, 2)}


def where(h, plane):
    if h < 0.05:
        return 'ион лежит в средней плоскости ' + plane
    return 'ион на %s Å над средней плоскостью %s' % (rnum(h), plane)


def rnum(x):
    return ('%.2f' % x).replace('.', ',')


report = {'convention': 'rigid (R,t), Kabsch on macrocycle atoms; ring centroid at 0, normal +z', 'items': []}


def process(fname, outdir, ref_xyz, mol=None, which_ring=None, canonical=False):
    mol = mol or read_sdf(os.path.join(ORIG, fname))
    rs = rings(mol)
    if canonical:
        X = canon(mol, rs[0])
        rmsd = 0.0
        cyc = rs[0]
    else:
        best = None
        for k, cyc_ in enumerate(rs):
            r = fit(mol, cyc_, ref_xyz)
            # сэндвич: подгоняем то кольцо, после наложения которого второе кольцо оказывается сверху (+z), как ион у 1:1
            score = r[0]
            if len(rs) > 1:
                other = [i for j, c in enumerate(rs) if j != k for i in c]
                if r[3][other, 2].mean() < 0:
                    score += 100
            if best is None or score < best[0]:
                best = (score, r, cyc_)
        _, (rmsd, R, t, X), cyc = best
    dr, dmax = dist_rmsd(mol['xyz'], X)
    os.makedirs(outdir, exist_ok=True)
    write_sdf(mol, X, os.path.join(outdir, fname))
    # проверка по записанному файлу (округление до 1e-4 Å)
    back = read_sdf(os.path.join(outdir, fname))
    dr2, dmax2 = dist_rmsd(mol['xyz'], back['xyz'])
    ring_now = X[cyc]
    rc = ring_now.mean(0)
    rec = {'file': os.path.relpath(os.path.join(outdir, fname), BASE), 'atoms': mol['n'], 'rings': len(rs),
           'ring_atoms': len(cyc), 'fit_rmsd': round(rmsd, 3), 'dist_rmsd': dr, 'dist_rmsd_file': dr2,
           'dist_max_file': dmax2, 'ring_centroid': [round(float(v), 3) for v in rc], 'geom': geom(X, mol, cyc)}
    report['items'].append(rec)
    return mol, X, cyc, rec


def ring_ref(X, cyc):
    return X[cyc]


def main():
    cx_items, an_items = [], []
    os.makedirs(BASE, exist_ok=True)
    outc = os.path.join(BASE, 'complexes')
    outa = os.path.join(BASE, 'annel')
    refs = {}
    for N in (4, 5, 6, 7):
        # эталон: N-K в канонической системе
        mol, X, cyc, rec = process('%d-K.sdf' % N, outc, None, canonical=True)
        # порядок атомов цикла эталона: начинаем с первого O, как в canon
        refs[N] = X[cyc]
        name = NAME[N]
        files = [('%d.sdf' % N, {'size': str(N), 'cx': '0'}, name, None)]
        for M in METALS:
            files.append(('%d-%s.sdf' % (N, M), {'size': str(N), 'cx': '1', 'metal': M, 'ratio': '1'}, '%s · %s' % (name, ION_TXT[M]), M))
            files.append(('%d%d-%s.sdf' % (N, N, M), {'size': str(N), 'cx': '1', 'metal': M, 'ratio': '2'}, '(%s)₂ · %s — сэндвич' % (name, ION_TXT[M]), M))
        for f, sel, title, M in files:
            if not os.path.exists(os.path.join(ORIG, f)):
                print('нет файла', f); continue
            if f == '%d-K.sdf' % N:
                r = rec
            else:
                _, _, _, r = process(f, outc, refs[N])
            d = 'Полость %s ≈ %s Å.' % (name, CAVITY[N])
            if M:
                g = r['geom']
                d += ' Диаметр иона %s %s Å. Среднее расстояние %s–O %s Å; %s.' % (
                    ION_TXT[M], rnum(ION_D[M]), M, rnum(g['mo']), where(g['h'], 'атомов O ближайшего кольца' if sel.get('ratio') == '2' else 'атомов O'))
                if sel.get('ratio') == '2':
                    d += ' Сэндвич 2 : 1: ион зажат между двумя кольцами.'
            cx_items.append({'file': 'complexes/' + f, 'title': title, 'desc': d, 'sel': sel})
    # аннелирование: всё на 6-K
    TYPES = {'B': 'бензо', 'cH': 'циклогексано'}
    DEG = [('', '1', 'моно'), ('D', '2', 'ди'), ('Tri', '3', 'три'), ('Tetra', '4', 'тетра'), ('H', '6', 'гекса')]
    an_items.append({'file': 'complexes/6-K.sdf', 'title': '18-краун-6 · K⁺', 'desc': 'Эталон без аннелированных колец: гибкий цикл из шести звеньев –CH₂CH₂O–.', 'sel': {'type': '0'}})
    missing = []
    for t, tname in TYPES.items():
        for pre, n, dname in DEG:
            f = '%s%s-6-K.sdf' % (pre, t)
            if not os.path.exists(os.path.join(ORIG, f)):
                missing.append(f); continue
            _, _, _, r = process(f, outa, refs[6])
            word = (dname + tname) if dname != 'моно' else tname
            title = '%s-18-краун-6 · K⁺' % word.capitalize()
            g = r['geom']
            cnt = int(n)
            adj = ('бензольное' if t == 'B' else 'циклогексановое') if cnt == 1 else ('бензольных' if t == 'B' else 'циклогексановых')
            noun = 'кольцо' if cnt == 1 else ('кольца' if cnt < 5 else 'колец')
            d = '%s %s %s сочленено с циклом 18-краун-6: чем больше колец, тем жёстче цикл. Среднее K–O %s Å; %s.' % (
                cnt, adj, noun, rnum(g['mo']), where(g['h'], 'O₆'))
            if cnt > 1:
                d = d.replace('сочленено', 'сочленены')
            an_items.append({'file': 'annel/' + f, 'title': title, 'desc': d, 'sel': {'type': t, 'deg': n}})
    # самый крупный объект набора — для начального масштаба
    def extent(path):
        m = read_sdf(os.path.join(BASE, path))
        return float(np.linalg.norm(m['xyz'], axis=1).max())
    def fit_item(items):
        e = [extent(it['file']) for it in items]
        return int(np.argmax(e)), round(max(e), 2)
    fc, rc = fit_item(cx_items)
    fa, ra = fit_item(an_items)
    common = {'keep': True, 'params': {'style': 'ballstick'}, 'ions': True,
              'home': {'tilt': -70}, 'note': 'Создано tools/align_crowns.py: все структуры наложены по атомам макроцикла, поворот + сдвиг.'}
    complexes = dict(common, title='Краун-эфиры и их комплексы', fitItem=fc, radius=rc,
                     description='Свободные краун-эфиры от 12-краун-4 до 21-краун-7 и их комплексы с ионами щелочных металлов: 1 : 1 и сэндвич 2 : 1.',
                     controls=[
                         {'key': 'size', 'label': 'Размер цикла', 'options': [{'v': str(N), 't': NAME[N]} for N in (4, 5, 6, 7)]},
                         {'key': 'cx', 'type': 'toggle', 'label': 'Показать комплекс с ионом', 'on': '1', 'off': '0'},
                         {'key': 'metal', 'label': 'Ион металла', 'when': {'cx': '1'}, 'options': [{'v': M, 't': ION_TXT[M]} for M in METALS]},
                         {'key': 'ratio', 'label': 'Состав', 'when': {'cx': '1'}, 'options': [{'v': '1', 't': '1 : 1'}, {'v': '2', 't': 'Сэндвич 2 : 1'}]}
                     ],
                     default={'size': '6', 'cx': '1', 'metal': 'K', 'ratio': '1'}, items=cx_items)
    annel = dict(common, title='Аннелирование краун-эфиров', fitItem=fa, radius=ra,
                 description='18-краун-6 · K⁺ с бензольными и циклогексановыми кольцами: как жёсткость цикла меняется с числом колец.',
                 controls=[
                     {'key': 'type', 'label': 'Сочленённые кольца', 'options': [{'v': '0', 't': 'Нет (18-краун-6)'}, {'v': 'B', 't': 'Бензо'}, {'v': 'cH', 't': 'Циклогексано'}]},
                     {'key': 'deg', 'label': 'Сколько колец', 'when': {'type': ['B', 'cH']}, 'options': [{'v': n, 't': '%s (%s)' % (dn.capitalize(), n)} for _, n, dn in DEG]}
                 ],
                 default={'type': 'B', 'deg': '2'}, items=an_items)
    for name, obj in (('complexes', complexes), ('annel', annel)):
        with open(os.path.join(BASE, name + '.set.json'), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write('\n')
    report['missing_annel'] = missing
    worst = max(r['dist_max_file'] for r in report['items'])
    report['worst_internal_distance_change_A'] = worst
    with open(os.path.join(BASE, 'align-report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print('структур:', len(report['items']), 'нет:', missing)
    print('макс. изменение межатомного расстояния (после записи, 4 знака):', worst)
    print('RMSD расстояний до записи (float):', max(r['dist_rmsd'] for r in report['items']))
    for r in report['items']:
        print('%-26s rings=%d ring=%2d fit=%.3f  centroid=%s geom=%s' % (r['file'], r['rings'], r['ring_atoms'], r['fit_rmsd'], r['ring_centroid'], r['geom']))


if __name__ == '__main__':
    main()
