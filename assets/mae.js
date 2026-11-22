/* Импорт Schrödinger Maestro (.mae / .maegz) со сценой Maestro.
   Файл — текстовые блоки: f_m_ct { свойства ::: значения  m_atom[N] { … }  m_bond[M] { … } }.
   Сохраняем: координаты, элементы, формальные заряды, имена атомов/остатков/цепей, порядки связей,
   цвет атома (s_m_color_rgb или номер i_m_color), представление атома (i_m_representation:
   0 нет, 1 кружок, 2 CPK, 3 шарик) и половин связей (i_m_from_rep/i_m_to_rep: 0 нет, 1 каркас,
   2 трубка, 3 палочка шаростержневой), видимость (i_m_visibility), пользовательские подписи
   (s_m_label_format/s_m_label_user_text) и связи нулевого порядка (рисуются пунктиром).
   Работает в браузере (window.PVMae) и в Node (require). */
(function (root) {
  'use strict';
  const ELEM = ('X H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os ' +
    'Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  // Номера цветов Maestro (палитра colors.res), проверенные по файлам Schrödinger (серый, белый, синий, красный).
  // Обычно рядом есть s_m_color_rgb — он главнее. Прочие номера без RGB → цвет элемента (Jmol).
  const MAE_COLORS = { 2: 'A0A0A0', 21: 'FFFFFF', 43: '5757FF', 70: 'FF2F2F' };
  const REP_ATOM = { 0: 'none', 1: 'circle', 2: 'cpk', 3: 'ball' };
  const REP_BOND = { 0: 'none', 1: 'wire', 2: 'tube', 3: 'ball' };

  // ---------- токены ----------
  function tokenize(text) {
    const out = []; const n = text.length; let i = 0;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue; }
      if (c === 35) { // # комментарий #
        const j = text.indexOf('#', i + 1); i = j < 0 ? n : j + 1; continue;
      }
      if (c === 34) { // "строка"
        let j = i + 1, s = '';
        while (j < n && text.charCodeAt(j) !== 34) {
          if (text.charCodeAt(j) === 92 && j + 1 < n) { s += text[j + 1]; j += 2; } else { s += text[j]; j++; }
        }
        out.push({ v: s, s: i, e: j + 1, q: true }); i = j + 1; continue;
      }
      if (c === 123 || c === 125) { out.push({ v: text[i], s: i, e: i + 1 }); i++; continue; }
      let j = i;
      while (j < n) { const d = text.charCodeAt(j); if (d === 32 || d === 9 || d === 10 || d === 13 || d === 123 || d === 125) break; j++; }
      out.push({ v: text.slice(i, j), s: i, e: j }); i = j;
    }
    return out;
  }
  function typed(key, t) {
    if (!t || (!t.q && t.v === '<>')) return undefined;
    const v = t.v, p = key[0];
    if (p === 'i') { const x = parseInt(v, 10); return isNaN(x) ? undefined : x; }
    if (p === 'r') { const x = parseFloat(v); return isNaN(x) ? undefined : x; }
    if (p === 'b') return v === '1' || v === 'true';
    return v;
  }

  // ---------- блоки ----------
  function parse(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const T = tokenize(text); let p = 0;
    const need = (v) => { const t = T[p++]; if (!t || t.v !== v || t.q) throw new Error('Файл .mae повреждён: ожидалось «' + v + '» (позиция ' + (t ? t.s : 'конец') + ')'); return t; };
    function block(name, startTok) {
      const m = /^(.*)\[(\d+)\]$/.exec(name);
      const b = { name: m ? m[1] : name, keys: [], props: {}, blocks: [], s: startTok.s };
      while (p < T.length && !(T[p].v === ':::' && !T[p].q)) {
        if (T[p].v === '}' && !T[p].q) { p++; b.e = T[p - 1].e; return b; } // пустой блок
        b.keys.push(T[p++].v);
      }
      need(':::');
      if (m) {
        const nrow = parseInt(m[2], 10), w = b.keys.length + 1; b.rows = [];
        for (let r = 0; r < nrow; r++) {
          const row = {};
          for (let k = 0; k < b.keys.length; k++) row[b.keys[k]] = typed(b.keys[k], T[p + 1 + k]);
          p += w; b.rows.push(row);
        }
        need(':::');
        const end = need('}'); b.e = end.e; return b;
      }
      for (const k of b.keys) b.props[k] = typed(k, T[p++]);
      while (p < T.length) {
        const t = T[p];
        if (t.v === '}' && !t.q) { p++; b.e = t.e; return b; }
        p++;
        if (T[p] && T[p].v === '{' && !T[p].q) { p++; b.blocks.push(block(t.v, t)); }
        else throw new Error('Файл .mae повреждён около «' + t.v + '»');
      }
      throw new Error('Файл .mae обрывается (нет закрывающей «}»)');
    }
    const top = []; let header = null;
    while (p < T.length) {
      const t = T[p];
      if (t.v === '{' && !t.q) { p++; header = block('', t); continue; }
      p++;
      if (T[p] && T[p].v === '{') { p++; top.push(block(t.v, t)); }
      else throw new Error('Это не файл Maestro (.mae): неожиданное «' + t.v + '»');
    }
    const cts = [];
    for (const b of top) {
      if (b.name !== 'f_m_ct' && b.name !== 'p_m_ct') continue;
      cts.push(ctOf(b, text));
    }
    if (!cts.length) throw new Error('В файле .mae нет структур (блоков f_m_ct).');
    return { header: header ? text.slice(header.s, header.e) : '', cts };
  }
  function sub(b, name) { return b.blocks.find(x => x.name === name) || null; }
  function elemOf(row) {
    const z = row.i_m_atomic_number;
    if (z > 0 && ELEM[z]) return ELEM[z];
    const nm = String(row.s_m_pdb_atom_name || row.s_m_atom_name || '').trim();
    const m = /^([A-Z][a-z]?)/.exec(nm);
    return m ? m[1] : 'X';
  }
  function colorOf(row) {
    const rgb = String(row.s_m_color_rgb || '').trim();
    if (/^[0-9a-f]{6}$/i.test(rgb)) return rgb.toUpperCase();
    const ix = row.i_m_color;
    return ix != null && MAE_COLORS[ix] ? MAE_COLORS[ix] : '';
  }
  function ctOf(b, text) {
    const A = sub(b, 'm_atom'), Bd = sub(b, 'm_bond');
    const atoms = (A && A.rows || []).map((r, i) => ({
      i, elem: elemOf(r), x: r.r_m_x_coord || 0, y: r.r_m_y_coord || 0, z: r.r_m_z_coord || 0,
      name: String(r.s_m_pdb_atom_name || r.s_m_atom_name || '').trim(),
      resn: String(r.s_m_pdb_residue_name || '').trim(), resi: r.i_m_residue_number, chain: String(r.s_m_chain_name || '').trim(),
      charge: r.i_m_formal_charge || 0, pcharge: r.r_m_charge1,
      color: colorOf(r), colorIndex: r.i_m_color,
      rep: r.i_m_representation != null ? r.i_m_representation : null,
      visible: r.i_m_visibility == null ? true : r.i_m_visibility !== 0,
      label: labelOf(r), labelColor: r.i_m_label_color
    }));
    const seen = new Set(), bonds = []; let dup = 0;
    for (const r of (Bd && Bd.rows) || []) {
      const a = (r.i_m_from || 0) - 1, c = (r.i_m_to || 0) - 1;
      if (a < 0 || c < 0 || a >= atoms.length || c >= atoms.length || a === c) continue;
      const key = a < c ? a + '-' + c : c + '-' + a;
      if (seen.has(key)) { dup++; continue; } // та же связь ещё раз (часто в обратную сторону: 5–4 после 4–5) — первая главнее
      seen.add(key);
      bonds.push({ a, b: c, order: r.i_m_order == null ? 1 : r.i_m_order, repA: r.i_m_from_rep != null ? r.i_m_from_rep : null, repB: r.i_m_to_rep != null ? r.i_m_to_rep : null });
    }
    return {
      title: String(b.props.s_m_title || '').trim(), entryName: String(b.props.s_m_entry_name || '').trim(),
      props: b.props, atoms, bonds, dupBonds: dup, raw: text.slice(b.s, b.e)
    };
  }
  function labelOf(r) {
    const f = String(r.s_m_label_format || '').trim();
    if (!f) return '';
    const ut = String(r.s_m_label_user_text || '').trim();
    const elem = elemOf(r), nm = String(r.s_m_pdb_atom_name || r.s_m_atom_name || '').trim();
    const fc = r.i_m_formal_charge || 0;
    const map = { UT: ut, EL: elem, AT: nm || elem, AN: nm || elem, PA: nm || elem, NU: '', RN: String(r.s_m_pdb_residue_name || '').trim() + (r.i_m_residue_number != null ? r.i_m_residue_number : ''), FC: fc ? (Math.abs(fc) > 1 ? Math.abs(fc) : '') + (fc > 0 ? '+' : '−') : '' };
    const s = f.replace(/%([A-Z]{2})/g, (_, k) => map[k] != null ? String(map[k]) : '').replace(/\s+/g, ' ').trim();
    return s;
  }

  // ---------- сводка и выбор структуры ----------
  function formula(atoms) {
    const cnt = {};
    for (const a of atoms) cnt[a.elem] = (cnt[a.elem] || 0) + 1;
    const keys = Object.keys(cnt).sort((x, y) => (x === 'C' ? -2 : x === 'H' ? -1 : 0) - (y === 'C' ? -2 : y === 'H' ? -1 : 0) || (x < y ? -1 : x > y ? 1 : 0));
    const hasC = !!cnt.C;
    const ord = hasC ? keys : Object.keys(cnt).sort();
    return ord.map(k => k + (cnt[k] > 1 ? cnt[k] : '')).join('');
  }
  // атомы ближе 0.5 Å друг к другу (лишний атом поверх другого) — только для отчёта, ничего не удаляем
  function overlaps(atoms, lim) {
    lim = lim || 0.5; const out = [];
    if (atoms.length > 20000) return out;
    const key = (x, y, z) => Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z);
    const grid = new Map();
    for (const a of atoms) { const k = key(a.x, a.y, a.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(a); }
    for (const a of atoms) {
      const gx = Math.floor(a.x), gy = Math.floor(a.y), gz = Math.floor(a.z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const b of grid.get((gx + dx) + ',' + (gy + dy) + ',' + (gz + dz)) || []) {
          if (b.i <= a.i) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          if (d < lim) out.push({ a: a.i + 1, b: b.i + 1, ea: a.elem, eb: b.elem, na: a.name, nb: b.name, d: Math.round(d * 100) / 100 });
        }
      }
    }
    return out;
  }
  function summary(text) {
    const f = parse(text);
    return f.cts.map((ct, i) => {
      const reps = {}, breps = {};
      for (const a of ct.atoms) { const k = REP_ATOM[a.rep] || String(a.rep); reps[k] = (reps[k] || 0) + 1; }
      for (const b of ct.bonds) for (const r of [b.repA, b.repB]) { const k = REP_BOND[r] || String(r); breps[k] = (breps[k] || 0) + 1; }
      return {
        index: i, title: ct.title, entryName: ct.entryName, atoms: ct.atoms.length, bonds: ct.bonds.length,
        zeroOrder: ct.bonds.filter(b => b.order === 0).length, hidden: ct.atoms.filter(a => !a.visible).length,
        colors: [...new Set(ct.atoms.map(a => a.color).filter(Boolean))].length,
        formula: formula(ct.atoms), atomReps: reps, bondReps: breps,
        labels: ct.atoms.filter(a => a.label).length,
        duplicateBonds: ct.dupBonds || 0,
        overlaps: overlaps(ct.atoms)
      };
    });
  }
  // «#ct=2» (с 1), «#ct=all» — оставить в тексте только нужные структуры
  function extract(text, spec) {
    if (spec == null || spec === '' || spec === 'all') return text;
    const f = parse(text);
    const want = String(spec).split(',').map(s => parseInt(s, 10) - 1).filter(i => i >= 0 && i < f.cts.length);
    if (!want.length) throw new Error('В файле .mae нет структуры №' + spec + ' (всего ' + f.cts.length + ').');
    return (f.header ? f.header + '\n\n' : '') + want.map(i => f.cts[i].raw).join('\n\n') + '\n';
  }
  function ctCount(text) { try { return parse(text).cts.length; } catch (e) { return 0; } }

  // ---------- атомы для 3Dmol (все структуры файла в одной сцене) ----------
  function to3Dmol(text) {
    const f = typeof text === 'string' ? parse(text) : text;
    const atoms = [], zob = [], labels = [];
    let off = 0, anyRep = false;
    f.cts.forEach((ct, ci) => {
      const bondRep = new Array(ct.atoms.length).fill(null);
      const nb = new Array(ct.atoms.length).fill(0);
      for (const a of ct.atoms) {
        if (a.rep != null) anyRep = true;
        atoms.push({
          index: off + a.i, serial: off + a.i + 1, elem: a.elem, x: a.x, y: a.y, z: a.z,
          atom: a.name || a.elem, resn: a.resn || '', resi: a.resi != null ? a.resi : '', chain: a.chain || '',
          hetflag: false, formalCharge: a.charge, partialCharge: a.pcharge, bonds: [], bondOrder: [],
          maeColor: a.color, maeRep: a.rep, maeVis: a.visible, maeCt: ci, maeLabel: a.label
        });
        if (a.label && a.visible) labels.push({ i: off + a.i, text: a.label });
      }
      for (const b of ct.bonds) {
        const A = off + b.a, B = off + b.b;
        if (b.order === 0) { zob.push([A, B]); continue; }
        if (b.repA != null) { bondRep[b.a] = Math.max(bondRep[b.a] == null ? -1 : bondRep[b.a], b.repA); anyRep = true; }
        if (b.repB != null) { bondRep[b.b] = Math.max(bondRep[b.b] == null ? -1 : bondRep[b.b], b.repB); anyRep = true; }
        nb[b.a]++; nb[b.b]++;
        const ord = b.order > 3 ? 1.5 : b.order;
        atoms[A].bonds.push(B); atoms[A].bondOrder.push(ord);
        atoms[B].bonds.push(A); atoms[B].bondOrder.push(ord);
      }
      for (const a of ct.atoms) { atoms[off + a.i].maeBondRep = bondRep[a.i]; atoms[off + a.i].maeBonded = nb[a.i] > 0; }
      off += ct.atoms.length;
    });
    return { atoms, zob, labels, hasRep: anyRep, cts: f.cts.length, titles: f.cts.map(c => c.title) };
  }
  // стиль 3Dmol по представлению Maestro (цвет добавляет просмотрщик)
  function styleKey(a) {
    if (!a.maeVis) return 'hide';
    const ar = a.maeRep == null ? -1 : a.maeRep, br = a.maeBondRep == null ? -1 : a.maeBondRep;
    return ar + '|' + br + '|' + (a.maeBonded ? 1 : 0);
  }
  function styleFor(key, col, hasRep) {
    if (key === 'hide') return {};
    let [ar, br, bonded] = key.split('|').map(Number);
    if (!hasRep) { ar = 3; br = 3; } // в файле нет сцены — шарики и палочки
    if (ar < 0) ar = 0;
    if (br < 0) br = ar === 3 ? 3 : 1;
    const s = {};
    if (bonded) {
      if (br === 1) s.line = Object.assign({ linewidth: 2 }, col);
      else if (br === 2) s.stick = Object.assign({ radius: 0.18, doubleBondScaling: 0.55 }, col);
      else if (br === 3) s.stick = Object.assign({ radius: 0.12, doubleBondScaling: 0.5 }, col);
    }
    if (ar === 2) s.sphere = Object.assign({ scale: 1.0 }, col);
    else if (ar === 3) s.sphere = Object.assign({ scale: 0.27 }, col);
    else if (ar === 1) s.sphere = Object.assign({ scale: 0.12 }, col);
    else if (!bonded) s.sphere = Object.assign({ scale: 0.18 }, col); // одиночный атом в каркасе: Maestro рисует крестик
    return s;
  }
  // радиус пунктира связи нулевого порядка
  function zobRadius(a, b) {
    const r = x => (x && x.maeBondRep === 1) || (x && x.maeBondRep == null && x.maeRep !== 3 && x.maeRep !== 2) ? 0.04 : 0.065;
    return Math.max(r(a), r(b));
  }

  const api = { parse, summary, overlaps, extract, ctCount, to3Dmol, styleKey, styleFor, zobRadius, formula, tokenize, MAE_COLORS, REP_ATOM, REP_BOND, ELEM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PVMae = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
