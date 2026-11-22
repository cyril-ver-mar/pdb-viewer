"""Тестовый .mae со сценой Maestro (для тестов импорта): 2 структуры.
CT1 «18-краун-6 · K⁺ (сцена)»: краун шарики-палочки, углероды зелёные (RGB), K⁺ шарик фиолетовый,
6 связей K–O нулевого порядка, часть H скрыта, подпись у K. CT2 «18-краун-6 (трубки)»: трубки, первый O — CPK, без иона."""
import math, sys
ZN = {'H': 1, 'C': 6, 'N': 7, 'O': 8, 'K': 19}
def read_sdf(p):
    L = open(p).read().splitlines()
    na, nb = int(L[3][:3]), int(L[3][3:6])
    at = [(float(l[:10]), float(l[10:20]), float(l[20:30]), l[31:34].strip()) for l in L[4:4 + na]]
    bd = [(int(l[:3]), int(l[3:6]), int(l[6:9])) for l in L[4 + na:4 + na + nb]]
    return at, bd
def ct(title, at, bd, arep, brep, color, vis, label):
    out = ['f_m_ct {', ' s_m_title', ' s_m_entry_name', ' i_m_ct_format', ' :::', ' "%s"' % title, ' "%s"' % title, ' 2',
           ' m_atom[%d] {' % len(at), '  # First column is atom index #', '  i_m_mmod_type', '  r_m_x_coord', '  r_m_y_coord', '  r_m_z_coord',
           '  i_m_residue_number', '  s_m_pdb_residue_name', '  i_m_color', '  i_m_atomic_number', '  i_m_formal_charge', '  s_m_color_rgb',
           '  i_m_representation', '  i_m_visibility', '  s_m_pdb_atom_name', '  s_m_label_format', '  s_m_label_user_text', '  :::']
    for i, (x, y, z, e) in enumerate(at):
        c = color(i, e)
        out.append('  %d 1 %.6f %.6f %.6f 1 "CRN " %d %d %d %s %d %d "%s" %s %s' % (
            i + 1, x, y, z, {'C': 2, 'H': 21, 'O': 70}.get(e, 9), ZN[e], 1 if e == 'K' else 0, c, arep(i, e), vis(i, e),
            ' %-3s' % (e + str(i + 1))[:4], '"%UT"' if label(i, e) else '<>', '"%s"' % label(i, e) if label(i, e) else '<>'))
    out += ['  :::', ' }', ' m_bond[%d] {' % len(bd), '  # First column is bond index #', '  i_m_from', '  i_m_to', '  i_m_order', '  i_m_from_rep', '  i_m_to_rep', '  :::']
    for k, (a, b, o) in enumerate(bd):
        out.append('  %d %d %d %d %d %d' % (k + 1, a, b, o, brep(a, b, o), brep(a, b, o)))
    out += ['  :::', ' }', '}']
    return '\n'.join(out)
at, bd = read_sdf('structures/_supra/crown/complexes/6-K.sdf')
bd = [b for b in bd if at[b[0]-1][3] != 'K' and at[b[1]-1][3] != 'K']
kix = [i for i, a in enumerate(at) if a[3] == 'K'][0]
oix = [i for i, a in enumerate(at) if a[3] == 'O']
bd1 = bd + [(kix + 1, o + 1, 0) for o in oix]
hseen = [0]
def vis1(i, e):
    return 0 if e == 'H' and i % 2 == 0 else 1
ct1 = ct('18-краун-6 · K⁺ (сцена)', at, bd1, lambda i, e: 3,
         lambda a, b, o: 1 if o == 0 else 3,
         lambda i, e: {'C': '33CC33', 'O': 'FF2F2F', 'H': 'FFFFFF', 'K': '8F40D4'}[e], vis1, lambda i, e: 'K⁺' if e == 'K' else '')
at2 = [a for a in at if a[3] != 'K']
ct2 = ct('18-краун-6 (трубки)', at2, bd, lambda i, e: 2 if i == 0 else 0, lambda a, b, o: 2,
         lambda i, e: {'C': 'A0A0A0', 'O': 'FF2F2F', 'H': 'FFFFFF'}[e], lambda i, e: 1, lambda i, e: '')
open(sys.argv[1], 'w').write('{\n s_m_m2io_version\n :::\n 2.0.0\n}\n\n' + ct1 + '\n\n' + ct2 + '\n')
