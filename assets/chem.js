/* Водороды, заряды и невалентные контакты. Без тяжёлых WASM-библиотек: на телефоне в классе важнее скорость. */
(function () {
  'use strict';
  const AA = new Set('ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL MSE SEC PYL'.split(' '));
  const METALS = new Set('NA K MG CA FE ZN CU MN CO NI LI BA SR CD HG'.split(' '));
  const VDW = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, F: 1.47, P: 1.8, S: 1.8, CL: 1.75, BR: 1.85, I: 1.98, NA: 2.27, K: 2.75, MG: 1.73, CA: 2.31, SI: 2.1, FE: 2.0, ZN: 1.39, B: 1.92 };
  const COV = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, P: 1.07, S: 1.05, CL: 1.02, BR: 1.2, I: 1.39, SI: 1.11, B: 0.84, NA: 1.66, K: 2.03, MG: 1.41, CA: 1.76, FE: 1.32, ZN: 1.22 };
  const BL = { C: 1.09, N: 1.01, O: 0.96, S: 1.34, P: 1.42, SI: 1.48 };
  const KD = { ILE: 4.5, VAL: 4.2, LEU: 3.8, PHE: 2.8, CYS: 2.5, MET: 1.9, ALA: 1.8, GLY: -0.4, THR: -0.7, SER: -0.8, TRP: -0.9, TYR: -1.3, PRO: -1.6, HIS: -3.2, GLU: -3.5, GLN: -3.5, ASP: -3.5, ASN: -3.5, LYS: -3.9, ARG: -4.5 };
  const AA_H = {
    ALA: { CB: 3 }, ARG: { CB: 2, CG: 2, CD: 2, NE: 1, NH1: 2, NH2: 2 }, ASN: { CB: 2, ND2: 2 }, ASP: { CB: 2 },
    CYS: { CB: 2, SG: 1 }, GLN: { CB: 2, CG: 2, NE2: 2 }, GLU: { CB: 2, CG: 2 }, GLY: {},
    HIS: { CB: 2, ND1: 1, CD2: 1, CE1: 1 }, ILE: { CB: 1, CG1: 2, CG2: 3, CD1: 3 },
    LEU: { CB: 2, CG: 1, CD1: 3, CD2: 3 }, LYS: { CB: 2, CG: 2, CD: 2, CE: 2, NZ: 3 }, MET: { CB: 2, CG: 2, CE: 3 },
    PHE: { CB: 2, CD1: 1, CD2: 1, CE1: 1, CE2: 1, CZ: 1 }, PRO: { CB: 2, CG: 2, CD: 2 },
    SER: { CB: 2, OG: 1 }, THR: { CB: 1, OG1: 1, CG2: 3 }, TRP: { CB: 2, CD1: 1, NE1: 1, CZ2: 1, CE3: 1, CZ3: 1, CH2: 1 },
    TYR: { CB: 2, CD1: 1, CD2: 1, CE1: 1, CE2: 1, OH: 1 }, VAL: { CB: 1, CG1: 3, CG2: 3 }, MSE: { CB: 2, CG: 2, CE: 3 }
  };
  const RINGS = {
    PHE: ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'], TYR: ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'],
    HIS: ['CG', 'ND1', 'CD2', 'CE1', 'NE2'], TRP: ['CG', 'CD1', 'CD2', 'NE1', 'CE2'], TRP6: ['CD2', 'CE2', 'CE3', 'CZ2', 'CZ3', 'CH2']
  };
  const IX = {
    hb: { name: 'Водородная связь', color: '#0284c7' },
    xb: { name: 'Галогенная связь', color: '#7c3aed' },
    salt: { name: 'Солевой мостик / ионная', color: '#e11d48' },
    pi: { name: 'π–π стэкинг', color: '#d97706' },
    cat: { name: 'Катион–π', color: '#059669' },
    hp: { name: 'Гидрофобный контакт', color: '#64748b' },
    vdw: { name: 'Короткий контакт (< суммы vdW)', color: '#94a3b8' }
  };

  function elOf(a) {
    let e = (a && a.elem) || '';
    if (!e && a && a.atom) e = String(a.atom).replace(/[^A-Za-z]/g, '').slice(0, 2);
    e = String(e);
    if (e.length <= 1) return e.toUpperCase();
    const up = e.toUpperCase();
    if (up === 'CL' || up === 'BR') return up === 'CL' ? 'Cl' : 'Br';
    return e[0].toUpperCase() + e.slice(1).toLowerCase();
  }
  function elKey(e) { return e === 'Cl' ? 'CL' : e === 'Br' ? 'BR' : e.toUpperCase(); }
  function aname(a) { return String((a && a.atom) || '').trim().toUpperCase(); }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function len(a) { return Math.hypot(a.x, a.y, a.z); }
  function norm(a) { const l = len(a) || 1; return scale(a, 1 / l); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  function angle(a, b, c) {
    const u = sub(a, b), v = sub(c, b);
    const d = len(u) * len(v) || 1;
    return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / d))) * 180 / Math.PI;
  }
  function perp(v) {
    const a = Math.abs(v.x), b = Math.abs(v.y), c = Math.abs(v.z);
    const t = a <= b && a <= c ? { x: 1, y: 0, z: 0 } : b <= c ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    return norm(cross(v, t));
  }
  function covOf(e) { return COV[elKey(e)] || 0.77; }
  function vdwOf(e) { return VDW[elKey(e)] || 1.7; }

  function inferBonds(atoms) {
    const has = atoms.some(a => a.bonds && a.bonds.length);
    if (has) return;
    const cell = 2.3;
    const buckets = new Map();
    const key = (a) => Math.floor(a.x / cell) + ',' + Math.floor(a.y / cell) + ',' + Math.floor(a.z / cell);
    atoms.forEach((a, i) => { const k = key(a); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); a.bonds = []; });
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const ix = Math.floor(a.x / cell), iy = Math.floor(a.y / cell), iz = Math.floor(a.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = buckets.get((ix + dx) + ',' + (iy + dy) + ',' + (iz + dz));
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = atoms[j];
          if (METALS.has(elKey(elOf(a))) || METALS.has(elKey(elOf(b)))) continue;
          const cut = 1.25 * (covOf(elOf(a)) + covOf(elOf(b)));
          if (dist(a, b) <= cut && dist(a, b) > 0.4) { a.bonds.push(j); b.bonds.push(i); }
        }
      }
    }
  }

  function neighbors(atoms, i) {
    const a = atoms[i];
    const out = [];
    for (const j of a.bonds || []) if (atoms[j]) out.push(j);
    return out;
  }

  function desiredHeavy(el, heavyEls, dists) {
    const heavy = heavyEls.length;
    if (METALS.has(elKey(el))) return 0;
    if (el === 'Cl' || el === 'Br' || el === 'I' || el === 'F') return 0;
    const short = (sym, lim) => heavyEls.some((e, k) => e === sym && dists[k] < lim);
    if (el === 'C') {
      const uns = heavyEls.some((e, k) => (e === 'C' && dists[k] < 1.46) || ((e === 'N' || e === 'O') && dists[k] < 1.38));
      const trip = heavyEls.some((e, k) => (e === 'C' && dists[k] < 1.25) || (e === 'N' && dists[k] < 1.2));
      if (heavy >= 4) return 0;
      if (heavy === 3) return uns ? 0 : 1;
      if (heavy === 2) return uns ? 1 : 2;
      if (heavy === 1) return trip ? 1 : uns ? 2 : 3;
      return 0;
    }
    if (el === 'N') {
      if (heavy >= 3) return 0;
      if (heavy === 2) return 1;
      if (heavy === 1) return 2;
      return 0;
    }
    if (el === 'O') {
      if (heavy >= 2) return 0;
      if (heavy === 1) return short('C', 1.3) ? 0 : 1;
      return 0;
    }
    if (el === 'S') return heavy >= 2 ? 0 : heavy === 1 ? 1 : 0;
    if (el === 'Si') return Math.max(0, 4 - heavy);
    if (el === 'P') return heavy >= 3 ? 0 : Math.max(0, 3 - heavy);
    return 0;
  }

  function templateH(a, atoms, nbrs) {
    const resn = (a.resn || '').trim().toUpperCase();
    if (!AA.has(resn)) return null;
    const name = aname(a);
    if (name === 'N') {
      if (resn === 'PRO') return 0;
      const otherRes = nbrs.some(j => (atoms[j].resn || '').trim() && (atoms[j].resi !== a.resi || atoms[j].chain !== a.chain) && elOf(atoms[j]) === 'C');
      return otherRes ? 1 : 3;
    }
    const table = AA_H[resn];
    if (!table || !(name in table)) return name === 'C' || name === 'CA' || name === 'O' || name === 'OXT' ? 0 : null;
    if ((resn === 'CYS') && name === 'SG') {
      const bridged = nbrs.some(j => elOf(atoms[j]) === 'S' && aname(atoms[j]) === 'SG' && !(atoms[j].resi === a.resi && atoms[j].chain === a.chain));
      return bridged ? 0 : 1;
    }
    return table[name];
  }

  function place(origin, neighPos, nH, bondLen, el) {
    if (nH <= 0) return [];
    const pts = neighPos.map(p => norm(sub(p, origin)));
    const out = [];
    const put = (dir) => out.push(add(origin, scale(norm(dir), bondLen)));
    if (pts.length === 0) {
      const axes = [{ x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }];
      for (let i = 0; i < nH && i < 4; i++) put(axes[i]);
      return out;
    }
    if (pts.length === 1 && nH === 1) {
      if (el === 'C') { put(scale(pts[0], -1)); return out; }
      const axis = scale(pts[0], -1);
      const p = perp(axis), q = norm(cross(axis, p));
      const alpha = 70.53 * Math.PI / 180;
      put(add(scale(axis, Math.cos(alpha)), scale(p, Math.sin(alpha))));
      return out;
    }
    if (pts.length === 1 && nH >= 2) {
      const axis = scale(pts[0], -1);
      const p = perp(axis), q = norm(cross(axis, p));
      const alpha = nH === 2 ? (60 * Math.PI / 180) : (70.53 * Math.PI / 180);
      const count = Math.min(nH, 3);
      for (let k = 0; k < count; k++) {
        const phi = (nH === 2 ? -0.5 : 0) + k * 2 * Math.PI / count;
        put(add(scale(axis, Math.cos(alpha)), add(scale(p, Math.cos(phi) * Math.sin(alpha)), scale(q, Math.sin(phi) * Math.sin(alpha)))));
      }
      return out;
    }
    if (pts.length === 2 && nH === 1) {
      const b = norm(add(pts[0], pts[1]));
      const n = norm(cross(pts[0], pts[1]));
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(pts[0], pts[1])))) * 180 / Math.PI;
      if (ang > 150) put(scale(b, -1));
      else if (ang > 115) put(add(scale(b, -1), scale(n, 0.15)));
      else put(add(scale(b, -0.6), scale(n, 0.8)));
      return out;
    }
    if (pts.length === 2 && nH >= 2) {
      const b = norm(add(pts[0], pts[1]));
      const n = norm(cross(pts[0], pts[1]));
      put(add(scale(b, -0.55), scale(n, 0.84)));
      put(add(scale(b, -0.55), scale(n, -0.84)));
      return out;
    }
    if (pts.length >= 3 && nH >= 1) {
      const b = norm(add(add(pts[0], pts[1]), pts[2]));
      if (len(add(add(pts[0], pts[1]), pts[2])) < 0.35) put(norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))));
      else put(scale(b, -1));
      return out;
    }
    return out;
  }

  function addHydrogens(atoms) {
    if (!atoms || atoms.length > 20000) return { atoms: [], added: 0, warn: atoms && atoms.length > 20000 ? 'Слишком много атомов, чтобы добавить водороды на телефоне.' : '' };
    inferBonds(atoms);
    const warn = atoms.length > 8000 ? 'Молекула большая: водороды ставятся только по шаблону остатков и могут занять пару секунд.' : '';
    const big = atoms.length > 8000;
    const made = [];
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const e = elOf(a);
      if (e === 'H' || e === 'D') continue;
      const nbrs = neighbors(atoms, i);
      const heavyIdx = [];
      const hIdx = [];
      for (const j of nbrs) (elOf(atoms[j]) === 'H' ? hIdx : heavyIdx).push(j);
      if (!hIdx.length) {
        for (let j = 0; j < atoms.length; j++) {
          if (elOf(atoms[j]) !== 'H') continue;
          if (dist(a, atoms[j]) < 1.35) hIdx.push(j);
        }
      }
      let want = templateH(a, atoms, nbrs);
      if (want == null) {
        if (big) continue;
        const valence = { C: 4, N: 3, O: 2, S: 2, P: 3, Si: 4 }[e];
        let orderSum = 0, multiple = false;
        for (let k = 0; k < (a.bonds || []).length; k++) {
          const j = a.bonds[k];
          if (!atoms[j] || elOf(atoms[j]) === 'H') continue;
          const ord = a.bondOrder && a.bondOrder[k];
          if (ord > 1) multiple = true;
          orderSum += ord > 0 ? ord : 1;
        }
        if (multiple && valence) want = Math.max(0, valence - orderSum);
        else {
          const els = heavyIdx.map(j => elOf(atoms[j]));
          const ds = heavyIdx.map(j => dist(a, atoms[j]));
          want = desiredHeavy(e, els, ds);
        }
      }
      const missing = Math.max(0, want - hIdx.length);
      if (!missing) continue;
      const bondLen = BL[e] || 1.0;
      const pts = place(a, heavyIdx.map(j => atoms[j]), missing, bondLen, e);
      pts.forEach((p, k) => made.push({
        x: p.x, y: p.y, z: p.z, elem: 'H', parent: i,
        resn: a.resn, resi: a.resi, chain: a.chain, hetflag: a.hetflag,
        atom: 'H' + (hIdx.length + k + 1), bonds: []
      }));
    }
    return { atoms: made, added: made.length, warn };
  }

  function attachHydrogens(model, made) {
    if (!made || !made.atoms.length) return 0;
    const start = model.atoms.length;
    model.addAtoms(made.atoms.map(h => ({ x: h.x, y: h.y, z: h.z, elem: 'H', resn: h.resn, resi: h.resi, chain: h.chain, hetflag: h.hetflag, atom: h.atom, bonds: [] })));
    for (let i = 0; i < made.atoms.length; i++) {
      const h = model.atoms[start + i];
      const p = model.atoms[made.atoms[i].parent];
      if (!p || !h) continue;
      if (!p.bonds) p.bonds = [];
      p.bonds.push(h.index);
      h.bonds = [p.index];
    }
    return made.added;
  }

  // ---------- заряды ----------
  const GP = {
    H: [7.17, 6.24, -0.56],
    'C3': [7.98, 9.18, 1.88], 'C2': [8.79, 9.32, 1.51], 'C1': [10.39, 9.45, 0.73],
    'N3': [11.54, 10.82, 1.36], 'N2': [12.87, 11.15, 0.85], 'N1': [15.68, 11.7, -0.27],
    'O3': [14.18, 12.92, 1.39], 'O2': [17.07, 13.79, 0.47],
    S: [10.14, 9.13, 1.38], F: [14.66, 13.85, 2.31], Cl: [11, 9.69, 1.35], Br: [10.08, 8.47, 1.16], I: [9.9, 7.96, 0.96],
    P: [8.9, 8.32, 0.96], Si: [7.3, 6.57, 0.7]
  };
  function gpKey(a, atoms) {
    const e = elOf(a);
    if (e === 'H') return 'H';
    if (e === 'F' || e === 'Cl' || e === 'Br' || e === 'I' || e === 'S' || e === 'P' || e === 'Si') return e === 'S' ? 'S' : e;
    const deg = (a.bonds || []).filter(j => atoms[j] && elOf(atoms[j]) !== 'H').length + (a.bonds || []).filter(j => atoms[j] && elOf(atoms[j]) === 'H').length;
    const hyb = deg >= 4 ? '3' : deg === 3 ? '2' : '1';
    if (e === 'C' || e === 'N' || e === 'O') return e + (e === 'O' && deg <= 1 ? '2' : e === 'O' ? '3' : hyb);
    return null;
  }
  function gasteiger(atoms) {
    const q = atoms.map(() => 0);
    const keys = atoms.map(a => gpKey(a, atoms));
    if (keys.every(k => !k)) return null;
    for (let iter = 1; iter <= 6; iter++) {
      const damp = Math.pow(0.5, iter);
      const chi = keys.map((k, i) => {
        const p = k && GP[k]; if (!p) return 0;
        return p[0] + p[1] * q[i] + p[2] * q[i] * q[i];
      });
      const dq = q.map(() => 0);
      for (let i = 0; i < atoms.length; i++) {
        for (const j of atoms[i].bonds || []) {
          if (j < i || !atoms[j]) continue;
          const ci = chi[i], cj = chi[j];
          if (!isFinite(ci) || !isFinite(cj) || ci === cj) continue;
          if (ci > cj) {
            const d = damp * (ci - cj) / ci;
            dq[i] -= d; dq[j] += d;
          } else {
            const d = damp * (cj - ci) / cj;
            dq[j] -= d; dq[i] += d;
          }
        }
      }
      for (let i = 0; i < q.length; i++) q[i] = Math.max(-1.5, Math.min(1.5, q[i] + dq[i]));
    }
    atoms.forEach((a, i) => { a.partialCharge = keys[i] ? q[i] : 0; });
    return 'Гастайгер (PEOE), качественно';
  }
  function templateCharges(atoms) {
    for (const a of atoms) {
      const resn = (a.resn || '').toUpperCase();
      const name = aname(a);
      const e = elOf(a);
      let q = 0;
      if (e === 'H') q = 0.3;
      else if (name === 'O' || name === 'OXT') q = -0.55;
      else if (name === 'C') q = 0.55;
      else if (name === 'N') q = resn === 'PRO' ? -0.2 : -0.4;
      else if ((resn === 'ASP' && (name === 'OD1' || name === 'OD2')) || (resn === 'GLU' && (name === 'OE1' || name === 'OE2'))) q = -0.8;
      else if (resn === 'LYS' && name === 'NZ') q = 0.9;
      else if (resn === 'ARG' && (name === 'NH1' || name === 'NH2')) q = 0.55;
      else if (resn === 'ARG' && name === 'NE') q = 0.2;
      else if ((resn === 'SER' && name === 'OG') || (resn === 'THR' && name === 'OG1') || (resn === 'TYR' && name === 'OH')) q = -0.55;
      else if (METALS.has(elKey(e))) q = e === 'Mg' || e === 'Ca' || e === 'Zn' || e === 'Fe' ? 2 : 1;
      else if (e === 'Cl' || e === 'Br' || e === 'I' || e === 'F') q = -1;
      a.partialCharge = q;
    }
    return 'шаблон остатков (упрощённо, в духе AMBER)';
  }
  function assignCharges(atoms, stats) {
    if (!atoms || !atoms.length) return '';
    inferBonds(atoms);
    const macro = stats && stats.isMacro;
    const heavy = atoms.filter(a => elOf(a) !== 'H').length;
    if (!macro && heavy > 0 && heavy <= 400) return gasteiger(atoms) || templateCharges(atoms);
    return templateCharges(atoms);
  }
  function chargeHex(q) {
    if (q == null || !isFinite(+q)) return '#d1d5db';
    const t = Math.max(-1, Math.min(1, (+q) / 0.6));
    const u = Math.abs(t);
    const g = Math.round(255 * (1 - u));
    if (t >= 0) return '#' + [255, g, g].map(v => v.toString(16).padStart(2, '0')).join('');
    return '#' + [g, g, 255].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function hpHex(atom) {
    const resn = (atom.resn || '').toUpperCase();
    const v = KD[resn];
    if (v == null) {
      const e = elOf(atom);
      if (e === 'C') return '#f59e0b';
      if (e === 'O' || e === 'N') return '#38bdf8';
      return '#cbd5e1';
    }
    const t = Math.max(-1, Math.min(1, v / 4.5));
    const u = Math.abs(t);
    const mid = Math.round(255 * (1 - u));
    if (t >= 0) return '#' + [245, Math.round(158 + (255 - 158) * (1 - u)), Math.round(11 + (255 - 11) * (1 - u))].map(n => n.toString(16).padStart(2, '0')).join('');
    return '#' + [Math.round(56 + mid * 0.4), Math.round(189 * (1 - u) + 255 * u * 0), 248].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
  }

  // ---------- взаимодействия ----------
  function pairKey(i, j) { return i < j ? i + ':' + j : j + ':' + i; }
  function bondedSet(atoms) {
    const b12 = new Set(), b13 = new Set();
    for (let i = 0; i < atoms.length; i++) {
      const n = neighbors(atoms, i);
      for (let a = 0; a < n.length; a++) {
        b12.add(pairKey(i, n[a]));
        for (let b = a + 1; b < n.length; b++) b13.add(pairKey(n[a], n[b]));
        for (const k of neighbors(atoms, n[a])) if (k !== i) b13.add(pairKey(i, k));
      }
    }
    return { b12, b13 };
  }
  function excluded(ex, i, j) { const k = pairKey(i, j); return ex.b12.has(k) || ex.b13.has(k); }
  function differentSite(a, b) {
    if (a.resi == null || b.resi == null) return true;
    return !(a.chain === b.chain && a.resi === b.resi);
  }
  function scopeOk(a, b, opt, focus) {
    const sel = (opt.ixsel || 'all');
    if (sel === 'chain') return a.chain && b.chain && a.chain !== b.chain;
    if (sel === 'ligand') {
      const la = !!(a.hetflag && !AA.has((a.resn || '').toUpperCase()));
      const lb = !!(b.hetflag && !AA.has((b.resn || '').toUpperCase()));
      return la !== lb;
    }
    if (sel === 'res') {
      if (!focus) return false;
      const near = (p) => (p.chain === focus.chain && String(p.resi) === String(focus.resi)) || dist(p, focus) <= (parseFloat(opt.ixrad) || 8);
      return near(a) || near(b);
    }
    return differentSite(a, b);
  }
  function loops(atoms, cutoff, fn) {
    const cell = cutoff;
    const buckets = new Map();
    const bk = (x, y, z) => x + ',' + y + ',' + z;
    atoms.forEach((a, i) => {
      const k = bk(Math.floor(a.x / cell), Math.floor(a.y / cell), Math.floor(a.z / cell));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    });
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const ix = Math.floor(a.x / cell), iy = Math.floor(a.y / cell), iz = Math.floor(a.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = buckets.get(bk(ix + dx, iy + dy, iz + dz));
        if (!list) continue;
        for (const j of list) if (j > i) fn(i, j, dist(a, atoms[j]));
      }
    }
  }
  function ringOf(atoms, members) {
    const pts = members.map(i => atoms[i]).filter(Boolean);
    if (pts.length < 3) return null;
    const c = pts.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 });
    const centroid = scale(c, 1 / pts.length);
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    return { centroid, normal: n, ids: members };
  }
  function collectRings(atoms) {
    const rings = [];
    const byRes = new Map();
    atoms.forEach((a, i) => {
      const k = (a.chain || '') + ':' + a.resi + ':' + (a.resn || '');
      if (!byRes.has(k)) byRes.set(k, []);
      byRes.get(k).push(i);
    });
    for (const idxs of byRes.values()) {
      const resn = (atoms[idxs[0]].resn || '').toUpperCase();
      const names = {};
      for (const i of idxs) names[aname(atoms[i])] = i;
      const addRing = (list) => {
        const ids = list.map(n => names[n]).filter(x => x != null);
        const r = ringOf(atoms, ids);
        if (r) rings.push(r);
      };
      if (RINGS[resn]) addRing(RINGS[resn]);
      if (resn === 'TRP') addRing(RINGS.TRP6);
    }
    if (rings.length < 40 && atoms.length < 600) {
      const seen = new Set();
      const adj = atoms.map((a, i) => neighbors(atoms, i).filter(j => {
        const e = elOf(atoms[j]);
        return e === 'C' || e === 'N';
      }));
      for (let s = 0; s < atoms.length; s++) {
        const e0 = elOf(atoms[s]);
        if (e0 !== 'C' && e0 !== 'N') continue;
        const stack = [[s, [s]]];
        while (stack.length) {
          const [v, path] = stack.pop();
          if (path.length > 6) continue;
          for (const w of adj[v] || []) {
            if (w === s && path.length >= 5) {
              const cyc = path.slice().sort((a, b) => a - b).join(',');
              if (!seen.has(cyc)) { seen.add(cyc); const r = ringOf(atoms, path); if (r) rings.push(r); }
            } else if (!path.includes(w) && w > s) stack.push([w, path.concat(w)]);
          }
        }
        if (rings.length > 40) break;
      }
    }
    return rings.slice(0, 40);
  }
  function labelAtom(a) {
    const e = elOf(a);
    const bits = [e];
    if (a.resn && a.resi != null) bits.push((a.resn || '') + ' ' + a.resi + (a.chain ? ' ' + a.chain : ''));
    if (a.atom && a.atom !== e) bits.push(a.atom);
    return bits.join(' ');
  }
  function findInteractions(atoms, opt) {
    opt = opt || {};
    const types = new Set(String(opt.ix || '').split(/[,+\s]+/).filter(Boolean));
    if (!types.size || !atoms || atoms.length < 2 || atoms.length > 15000) {
      return { list: [], truncated: false, warn: atoms && atoms.length > 15000 ? 'Для такой большой структуры контакты на телефоне не считаются.' : '' };
    }
    inferBonds(atoms);
    const ex = bondedSet(atoms);
    const covalent = (i, j) => {
      if (METALS.has(elKey(elOf(atoms[i]))) || METALS.has(elKey(elOf(atoms[j])))) return false;
      return excluded(ex, i, j);
    };
    const list = [];
    const seen = new Set();
    const push = (rec) => {
      if (list.length >= 250) return;
      const k = rec.type + ':' + rec.i + ':' + rec.j;
      if (seen.has(k)) return;
      seen.add(k);
      list.push(rec);
    };
    let focus = null;
    if ((opt.ixsel || '') === 'res' && opt.ixres) {
      const resi = parseInt(opt.ixres, 10);
      const chain = opt.ixch || '';
      focus = atoms.find(a => a.resi === resi && (!chain || a.chain === chain) && aname(a) === 'CA') || atoms.find(a => a.resi === resi && (!chain || a.chain === chain));
    }
    const donors = [], acceptors = [];
    atoms.forEach((a, i) => {
      const e = elOf(a);
      if (e === 'N' || e === 'O' || e === 'S') {
        const hs = neighbors(atoms, i).filter(j => elOf(atoms[j]) === 'H');
        if (hs.length) donors.push({ i, hs });
        else donors.push({ i, hs: [] });
        acceptors.push(i);
      }
    });
    if (types.has('hb')) {
      for (const d of donors) for (const ai of acceptors) {
        if (d.i === ai || covalent(d.i, ai)) continue;
        if (!scopeOk(atoms[d.i], atoms[ai], opt, focus)) continue;
        if (d.hs.length) {
          for (const h of d.hs) {
            const dh = dist(atoms[h], atoms[ai]);
            const ang = angle(atoms[d.i], atoms[h], atoms[ai]);
            if (dh >= 1.4 && dh <= 2.6 && ang >= 120) {
              push({ type: 'hb', i: h, j: ai, p: atoms[h], q: atoms[ai], dist: dh, angle: ang, text: 'H-связь ' + labelAtom(atoms[d.i]) + '–H···' + labelAtom(atoms[ai]) + '  ' + dh.toFixed(2) + ' Å, ' + ang.toFixed(0) + '°' });
            }
          }
        } else {
          const dA = dist(atoms[d.i], atoms[ai]);
          if (dA >= 2.5 && dA <= 3.3) push({ type: 'hb', i: d.i, j: ai, p: atoms[d.i], q: atoms[ai], dist: dA, angle: null, text: 'H-связь (без H) ' + labelAtom(atoms[d.i]) + '···' + labelAtom(atoms[ai]) + '  ' + dA.toFixed(2) + ' Å' });
        }
      }
    }
    if (types.has('xb')) {
      atoms.forEach((a, i) => {
        const e = elOf(a);
        if (e !== 'Cl' && e !== 'Br' && e !== 'I') return;
        const carbon = neighbors(atoms, i).find(j => elOf(atoms[j]) === 'C');
        if (carbon == null) return;
        for (let j = 0; j < atoms.length; j++) {
          if (j === i || covalent(i, j)) continue;
          const ae = elOf(atoms[j]);
          if (ae !== 'N' && ae !== 'O' && ae !== 'S') continue;
          if (!scopeOk(a, atoms[j], opt, focus)) continue;
          const d = dist(a, atoms[j]);
          const lim = vdwOf(e) + vdwOf(ae);
          const ang = angle(atoms[carbon], a, atoms[j]);
          if (d < lim && d > 2 && ang >= 140) push({ type: 'xb', i, j, p: a, q: atoms[j], dist: d, angle: ang, text: 'Галогенная ' + labelAtom(a) + '···' + labelAtom(atoms[j]) + '  ' + d.toFixed(2) + ' Å, ' + ang.toFixed(0) + '°' });
        }
      });
    }
    const posName = (a) => {
      const n = aname(a), r = (a.resn || '').toUpperCase(), e = elOf(a);
      if (METALS.has(elKey(e)) && e !== 'Cl') return true;
      if (r === 'LYS' && n === 'NZ') return true;
      if (r === 'ARG' && (n === 'NH1' || n === 'NH2' || n === 'NE')) return true;
      if (r === 'HIS' && (n === 'ND1' || n === 'NE2')) return true;
      return false;
    };
    const negName = (a) => {
      const n = aname(a), r = (a.resn || '').toUpperCase(), e = elOf(a);
      if (e === 'Cl' || e === 'Br' || e === 'I' || e === 'F') return true;
      if ((r === 'ASP' && (n === 'OD1' || n === 'OD2')) || (r === 'GLU' && (n === 'OE1' || n === 'OE2'))) return true;
      if (n === 'OXT') return true;
      return false;
    };
    if (types.has('salt')) {
      const P = [], N = [];
      atoms.forEach((a, i) => { if (posName(a)) P.push(i); if (negName(a)) N.push(i); });
      for (const i of P) for (const j of N) {
        if (i === j || covalent(i, j) || !scopeOk(atoms[i], atoms[j], opt, focus)) continue;
        const d = dist(atoms[i], atoms[j]);
        if (d < 4.0) push({ type: 'salt', i, j, p: atoms[i], q: atoms[j], dist: d, angle: null, text: 'Ионный контакт ' + labelAtom(atoms[i]) + '···' + labelAtom(atoms[j]) + '  ' + d.toFixed(2) + ' Å' });
      }
    }
    const rings = (types.has('pi') || types.has('cat')) ? collectRings(atoms) : [];
    if (types.has('pi')) {
      for (let a = 0; a < rings.length; a++) for (let b = a + 1; b < rings.length; b++) {
        const A = rings[a], B = rings[b];
        if (A.ids[0] != null && B.ids[0] != null && !scopeOk(atoms[A.ids[0]], atoms[B.ids[0]], opt, focus)) continue;
        const d = dist(A.centroid, B.centroid);
        if (d < 3.2 || d > 6.0) continue;
        const na = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(A.normal, B.normal))))) * 180 / Math.PI;
        const face = na < 30 && d < 5.2;
        const tee = na > 60 && na < 120 && d < 5.6;
        if (!face && !tee) continue;
        push({ type: 'pi', i: A.ids[0], j: B.ids[0], p: A.centroid, q: B.centroid, dist: d, angle: na, text: (face ? 'π–π плоскость ' : 'π–π T-форма ') + d.toFixed(2) + ' Å, угол нормалей ' + na.toFixed(0) + '°' });
      }
    }
    if (types.has('cat')) {
      atoms.forEach((a, i) => {
        if (!posName(a)) return;
        for (const r of rings) {
          if (r.ids.includes(i)) continue;
          const d = dist(a, r.centroid);
          if (d >= 3 && d <= 6) push({ type: 'cat', i, j: r.ids[0], p: a, q: r.centroid, dist: d, angle: null, text: 'Катион–π ' + labelAtom(a) + '  ' + d.toFixed(2) + ' Å' });
        }
      });
    }
    if (types.has('hp') || types.has('vdw')) {
      loops(atoms, 4.5, (i, j, d) => {
        if (covalent(i, j) || !scopeOk(atoms[i], atoms[j], opt, focus)) return;
        const ei = elOf(atoms[i]), ej = elOf(atoms[j]);
        if (types.has('hp') && ei === 'C' && ej === 'C' && d >= 3 && d <= 4.2) {
          push({ type: 'hp', i, j, p: atoms[i], q: atoms[j], dist: d, angle: null, text: 'Гидрофобный ' + labelAtom(atoms[i]) + '···' + labelAtom(atoms[j]) + '  ' + d.toFixed(2) + ' Å' });
        }
        if (types.has('vdw')) {
          const lim = vdwOf(ei) + vdwOf(ej);
          if (d < lim - 0.15 && d > 1.2 && !(ei === 'H' && ej === 'H')) {
            push({ type: 'vdw', i, j, p: atoms[i], q: atoms[j], dist: d, angle: null, text: 'Короткий контакт ' + labelAtom(atoms[i]) + '···' + labelAtom(atoms[j]) + '  ' + d.toFixed(2) + ' Å (vdW ' + lim.toFixed(2) + ')' });
          }
        }
      });
    }
    return { list, truncated: list.length >= 250, warn: '' };
  }

  window.PVChem = {
    AA, IX, addHydrogens, attachHydrogens, assignCharges, chargeHex, hpHex, findInteractions, elOf, dist
  };
})();
