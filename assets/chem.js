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

  function minCov(el) {
    if (el === 'C' || el === 'Si') return 4;
    if (el === 'N' || el === 'P') return 3;
    if (el === 'O' || el === 'S') return 2;
    return 1;
  }

  function cellVectors(cryst) {
    const m = cryst && cryst.matrix && (cryst.matrix.elements || cryst.matrix);
    if (!m || m[0] == null) return null;
    return [
      { x: m[0], y: m[1], z: m[2] },
      { x: m[3], y: m[4], z: m[5] },
      { x: m[6], y: m[7], z: m[8] }
    ];
  }

  // Соседи за гранью ячейки (Si–O в кварце) закрывают валентность, но в модель не добавляются.
  function periodicBonds(atoms, cryst) {
    const v = cellVectors(cryst);
    if (!v) return;
    const images = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      if (!i && !j && !k) continue;
      images.push({
        x: v[0].x * i + v[1].x * j + v[2].x * k,
        y: v[0].y * i + v[1].y * j + v[2].y * k,
        z: v[0].z * i + v[1].z * j + v[2].z * k
      });
    }
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const ea = elOf(a);
      a._cellBonds = 0;
      if (ea === 'H' || METALS.has(elKey(ea))) continue;
      if (a.bonds.length >= minCov(ea)) continue;
      for (let j = 0; j < atoms.length; j++) {
        const b = atoms[j];
        const eb = elOf(b);
        if (eb === 'H' || METALS.has(elKey(eb))) continue;
        const cut = 1.2 * (covOf(ea) + covOf(eb));
        for (const im of images) {
          const d = Math.hypot(a.x - (b.x + im.x), a.y - (b.y + im.y), a.z - (b.z + im.z));
          if (d <= cut && d > 0.4) a._cellBonds++;
        }
      }
    }
  }

  function inferBonds(atoms, cryst) {
    const byIndex = new Map();
    atoms.forEach((a, i) => { if (a && a.index != null) byIndex.set(a.index, i); });
    for (const a of atoms) {
      if (!a.bonds) a.bonds = [];
      if (!a.bondOrder) a.bondOrder = [];
      // 3Dmol хранит в bonds поле .index, а расстановка H индексирует массив.
      a.bonds = a.bonds.map(b => {
        if (atoms[b] && (atoms[b].index === b || atoms[b].index == null)) return b;
        const i = byIndex.get(b);
        return i == null ? b : i;
      });
      while (a.bondOrder.length < a.bonds.length) a.bondOrder.push(1);
    }
    const cell = 2.3;
    const buckets = new Map();
    const key = (a) => Math.floor(a.x / cell) + ',' + Math.floor(a.y / cell) + ',' + Math.floor(a.z / cell);
    atoms.forEach((a, i) => {
      const k = key(a);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    });
    const cands = [];
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      if (elOf(a) === 'H') continue;
      const ix = Math.floor(a.x / cell), iy = Math.floor(a.y / cell), iz = Math.floor(a.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = buckets.get((ix + dx) + ',' + (iy + dy) + ',' + (iz + dz));
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = atoms[j];
          if (elOf(b) === 'H') continue;
          if (METALS.has(elKey(elOf(a))) || METALS.has(elKey(elOf(b)))) continue;
          if (a.bonds.indexOf(j) >= 0) continue;
          const cut = 1.2 * (covOf(elOf(a)) + covOf(elOf(b)));
          const d = dist(a, b);
          if (d <= cut && d > 0.4) cands.push({ i, j, d });
        }
      }
    }
    cands.sort((p, q) => p.d - q.d);
    for (const c of cands) {
      const a = atoms[c.i], b = atoms[c.j];
      if (a.bonds.indexOf(c.j) >= 0) continue;
      // Не достраивать уже насыщенный атом: у белка связи из файла,
      // а у кварца кремний и кислород как раз недокоординаны.
      if (a.bonds.length >= minCov(elOf(a)) && b.bonds.length >= minCov(elOf(b))) continue;
      a.bonds.push(c.j); a.bondOrder.push(1);
      b.bonds.push(c.i); b.bondOrder.push(1);
    }
    periodicBonds(atoms, cryst);
  }

  function neighbors(atoms, i) {
    const a = atoms[i];
    const out = [];
    for (const j of a.bonds || []) if (atoms[j]) out.push(j);
    return out;
  }

  const TET = Math.acos(-1 / 3); // 109.471°
  const SP2_AA = new Set('PHE:CD1 PHE:CD2 PHE:CE1 PHE:CE2 PHE:CZ TYR:CD1 TYR:CD2 TYR:CE1 TYR:CE2 TRP:CD1 TRP:NE1 TRP:CZ2 TRP:CE3 TRP:CZ3 TRP:CH2 HIS:ND1 HIS:CD2 HIS:CE1 ARG:NE ARG:NH1 ARG:NH2 ASN:ND2 GLN:NE2'.split(' '));
  const NA_RES = new Set('A C G U T I DA DC DG DT DU DI RA RC RG RU ADE CYT GUA THY URA'.split(' '));
  const WATERS_RES = new Set('HOH WAT H2O DOD TIP'.split(' '));

  function bondLenOf(el) { return BL[el] || 1.0; }

  const SIDE_DOUBLES = {
    PHE: [['CG', 'CD2'], ['CD1', 'CE1'], ['CE2', 'CZ']],
    TYR: [['CG', 'CD2'], ['CD1', 'CE1'], ['CE2', 'CZ']],
    TRP: [['CG', 'CD1'], ['CD2', 'CE2'], ['CE3', 'CZ3'], ['CZ2', 'CH2']],
    HIS: [['CG', 'CD2'], ['CE1', 'NE2']],
    ARG: [['CZ', 'NH1']],
    ASN: [['CG', 'OD1']],
    GLN: [['CD', 'OE1']],
    ASP: [['CG', 'OD1']],
    GLU: [['CD', 'OE1']]
  };
  const NA_KIND = { A: 'A', DA: 'A', ADE: 'A', RA: 'A', G: 'G', DG: 'G', GUA: 'G', RG: 'G', C: 'C', DC: 'C', CYT: 'C', RC: 'C', T: 'T', DT: 'T', THY: 'T', U: 'U', DU: 'U', URA: 'U', RU: 'U' };
  const NA_DOUBLES = {
    A: [['N1', 'C6'], ['C2', 'N3'], ['C4', 'C5'], ['N7', 'C8']],
    G: [['C6', 'O6'], ['N3', 'C2'], ['C4', 'C5'], ['N7', 'C8']],
    C: [['C2', 'O2'], ['N3', 'C4'], ['C5', 'C6']],
    T: [['C2', 'O2'], ['C4', 'O4'], ['C5', 'C6']],
    U: [['C2', 'O2'], ['C4', 'O4'], ['C5', 'C6']]
  };

  function bondSlot(atoms, i, j) {
    const a = atoms[i];
    if (!a || !a.bonds) return -1;
    let k = a.bonds.indexOf(j);
    if (k >= 0) return k;
    const other = atoms[j];
    if (other && other.index != null) k = a.bonds.indexOf(other.index);
    return k;
  }

  function ringPlanar(atoms, ring) {
    const c = { x: 0, y: 0, z: 0 };
    ring.forEach(i => { c.x += atoms[i].x; c.y += atoms[i].y; c.z += atoms[i].z; });
    c.x /= ring.length; c.y /= ring.length; c.z /= ring.length;
    const n = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < ring.length; k++) {
      const a = atoms[ring[k]], b = atoms[ring[(k + 1) % ring.length]];
      n.x += (a.y - c.y) * (b.z - c.z) - (a.z - c.z) * (b.y - c.y);
      n.y += (a.z - c.z) * (b.x - c.x) - (a.x - c.x) * (b.z - c.z);
      n.z += (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
    }
    const ln = Math.hypot(n.x, n.y, n.z) || 1;
    let max = 0;
    for (const i of ring) {
      const a = atoms[i];
      max = Math.max(max, Math.abs((a.x - c.x) * n.x + (a.y - c.y) * n.y + (a.z - c.z) * n.z) / ln);
    }
    return max < 0.2;
  }

  function kekulizeRings(atoms, rings, setOrder) {
    const key = (i, j) => (i < j ? i + ',' + j : j + ',' + i);
    const chosen = new Map();
    atoms.forEach((a, i) => {
      for (let k = 0; k < (a.bonds || []).length; k++) {
        const j = a.bonds[k];
        const jj = atoms[j] ? j : atoms.findIndex(b => b && b.index === j);
        if (jj <= i || jj < 0) continue;
        if ((a.bondOrder[k] || 1) >= 2) chosen.set(key(i, jj), a.bondOrder[k]);
      }
    });
    const used = (i) => {
      let n = 0;
      chosen.forEach((o, kk) => {
        if (o < 2) return;
        const [p, q] = kk.split(',').map(Number);
        if (p === i || q === i) n++;
      });
      return n;
    };
    const assign = (i, j, order) => {
      const kk = key(i, j);
      if (chosen.has(kk)) return chosen.get(kk) === order || (order === 1 && chosen.get(kk) < 2) || (order >= 2 && chosen.get(kk) >= 2);
      if (bondSlot(atoms, i, j) < 0) return false;
      if (order >= 2 && (used(i) >= 1 || used(j) >= 1)) return false;
      chosen.set(kk, order);
      return true;
    };
    const ordered = rings.slice().sort((a, b) => b.length - a.length);
    function solve(r) {
      if (r >= ordered.length) return true;
      const ring = ordered[r];
      const n = ring.length;
      const phases = [];
      if (n === 6) phases.push([0, 2, 4], [1, 3, 5]);
      else for (let s = 0; s < 5; s++) phases.push([s, (s + 2) % 5]);
      for (const ph of phases) {
        const snap = new Map(chosen);
        const doubles = new Set(ph);
        let good = true;
        for (let k = 0; k < n; k++) {
          if (!assign(ring[k], ring[(k + 1) % n], doubles.has(k) ? 2 : 1)) { good = false; break; }
        }
        if (good && solve(r + 1)) return true;
        chosen.clear();
        snap.forEach((v, kk) => chosen.set(kk, v));
      }
      return false;
    }
    if (!solve(0)) return;
    chosen.forEach((order, kk) => {
      if (order < 2) return;
      const [i, j] = kk.split(',').map(Number);
      setOrder(i, j, 2);
    });
  }

  function ensureBondOrders(atoms) {
    let anyMulti = false;
    for (const a of atoms) {
      if (!a.bonds) a.bonds = [];
      if (!a.bondOrder) a.bondOrder = [];
      while (a.bondOrder.length < a.bonds.length) a.bondOrder.push(1);
      if (a.bondOrder.length > a.bonds.length) a.bondOrder.length = a.bonds.length;
      for (const o of a.bondOrder) if (o > 1) anyMulti = true;
    }
    const setOrder = (i, j, order) => {
      const bi = bondSlot(atoms, i, j);
      const bj = bondSlot(atoms, j, i);
      if (bi >= 0) atoms[i].bondOrder[bi] = order;
      if (bj >= 0) atoms[j].bondOrder[bj] = order;
    };
    // SDF/MOL уже несут порядки связей — не переписывать их геометрией.
    if (anyMulti) return;
    const byRes = new Map();
    atoms.forEach((a, i) => {
      const resn = String(a.resn || '').trim().toUpperCase();
      if (!resn) return;
      const key = resn + '|' + (a.chain || '') + '|' + a.resi;
      if (!byRes.has(key)) byRes.set(key, []);
      byRes.get(key).push(i);
    });
    byRes.forEach((idxs, key) => {
      const resn = key.split('|')[0];
      const byName = new Map();
      idxs.forEach(i => byName.set(aname(atoms[i]).replace(/\*/g, "'"), i));
      const link = (na, nb) => {
        const i = byName.get(na), j = byName.get(nb);
        if (i == null || j == null) return;
        if (bondSlot(atoms, i, j) >= 0) setOrder(i, j, 2);
      };
      if (AA.has(resn)) {
        link('C', 'O');
        (SIDE_DOUBLES[resn] || []).forEach(p => link(p[0], p[1]));
      }
      const kind = NA_KIND[resn];
      if (kind) (NA_DOUBLES[kind] || []).forEach(p => link(p[0], p[1]));
    });
    const templated = (a) => {
      const r = String(a.resn || '').trim().toUpperCase();
      return AA.has(r) || !!NA_KIND[r] || WATERS_RES.has(r);
    };
    if (!atoms.some(a => !templated(a) && elOf(a) !== 'H')) return;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      if (templated(a)) continue;
      for (let k = 0; k < a.bonds.length; k++) {
        const j = a.bonds[k];
        const jj = atoms[j] ? j : -1;
        if (jj <= i) continue;
        const b = atoms[jj];
        if (!b || templated(b)) continue;
        const ea = elOf(a), eb = elOf(b);
        const d = dist(a, b);
        const pair = [ea, eb].sort().join('');
        if ((pair === 'CC' || pair === 'CN') && d < 1.23) setOrder(i, jj, 3);
        else if (pair === 'CO' && d < 1.30 && (neighbors(atoms, ea === 'O' ? i : jj).length <= 1)) setOrder(i, jj, 2);
        else if (pair === 'NN' && d < 1.30) setOrder(i, jj, 2);
      }
    }
    const rings = [];
    const seen = new Set();
    const allowed = atoms.map((a, i) => !templated(a) && elOf(a) !== 'H' && elOf(a) !== 'D');
    const adj = atoms.map((a, i) => (a.bonds || []).map(b => (atoms[b] ? b : atoms.findIndex(x => x && x.index === b))).filter(j => j >= 0 && allowed[j] && allowed[i]));
    for (let s = 0; s < atoms.length && rings.length < 48; s++) {
      if (!allowed[s]) continue;
      const stack = [[s, [s]]];
      let guard = 0;
      while (stack.length && guard < 5000) {
        guard++;
        const [v, path] = stack.pop();
        if (path.length > 6) continue;
        for (const w of adj[v]) {
          if (w === s && (path.length === 5 || path.length === 6)) {
            const key = path.slice().sort((a, b) => a - b).join(',');
            if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
          } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
        }
      }
    }
    const aromatic = rings.filter(ring => {
      if (!ring.every(i => {
        const e = elOf(atoms[i]);
        const deg = adj[i].length;
        return (e === 'C' || e === 'N' || e === 'O') && deg >= 2 && deg <= 3;
      })) return false;
      let sum = 0;
      for (let k = 0; k < ring.length; k++) sum += dist(atoms[ring[k]], atoms[ring[(k + 1) % ring.length]]);
      const avg = sum / ring.length;
      if (avg < 1.28 || avg > 1.48) return false;
      return ringPlanar(atoms, ring);
    });
    kekulizeRings(atoms, aromatic, setOrder);
  }

  function findSmallRings(atoms) {
    const rings = [];
    const seen = new Set();
    const adj = atoms.map((_, i) => neighbors(atoms, i).filter(j => {
      const e = elOf(atoms[j]);
      return e === 'C' || e === 'N' || e === 'O' || e === 'S';
    }));
    for (let s = 0; s < atoms.length && rings.length < 40; s++) {
      const stack = [[s, [s]]];
      let guard = 0;
      while (stack.length && guard < 4000) {
        guard++;
        const [v, path] = stack.pop();
        if (path.length > 6) continue;
        for (const w of adj[v]) {
          if (w === s && path.length >= 5) {
            const key = path.slice().sort((a, b) => a - b).join(',');
            if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
          } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
        }
      }
    }
    return rings;
  }

  function orderSum(a, atoms) {
    let s = 0;
    for (let k = 0; k < (a.bonds || []).length; k++) {
      const j = a.bonds[k];
      if (!atoms[j]) continue;
      const o = a.bondOrder && a.bondOrder[k];
      s += (o > 0 ? o : 1);
    }
    return s + (a._cellBonds || 0);
  }

  function valenceOf(el, heavyDeg) {
    if (METALS.has(elKey(el)) || el === 'F' || el === 'Cl' || el === 'Br' || el === 'I') return heavyDeg ? heavyDeg : 0;
    if (el === 'C') return 4;
    if (el === 'N') return 3;
    if (el === 'O') return 2;
    if (el === 'S') return heavyDeg >= 4 ? heavyDeg : 2;
    if (el === 'P') return heavyDeg >= 4 ? heavyDeg : 3;
    if (el === 'Si') return 4;
    return 0;
  }

  function aaPlan(resn, name, atom, atoms, nbrs) {
    if (name === 'N') {
      if (resn === 'PRO') return { n: 0, hyb: 'sp3' };
      const prev = nbrs.some(j => aname(atoms[j]) === 'C' && (atoms[j].resi !== atom.resi || atoms[j].chain !== atom.chain));
      return prev ? { n: 1, hyb: 'sp2' } : { n: 3, hyb: 'sp3' };
    }
    if (name === 'CA') return { n: resn === 'GLY' ? 2 : 1, hyb: 'sp3' };
    if (name === 'C' || name === 'O') return { n: 0, hyb: 'sp2' };
    if (name === 'OXT') return { n: 1, hyb: 'sp3' };
    if (resn === 'CYS' && name === 'SG') {
      const bridged = nbrs.some(j => aname(atoms[j]) === 'SG' && (atoms[j].resi !== atom.resi || atoms[j].chain !== atom.chain));
      return { n: bridged ? 0 : 1, hyb: 'sp3' };
    }
    const table = AA_H[resn] || {};
    if (!(name in table)) return { n: 0, hyb: 'sp3' };
    const hyb = SP2_AA.has(resn + ':' + name) ? 'sp2' : 'sp3';
    return { n: table[name], hyb };
  }

  function naPlan(resn, name) {
    const rna = resn === 'A' || resn === 'C' || resn === 'G' || resn === 'U' || resn === 'I' || resn[0] === 'R';
    const base = {
      A: { C2: [1, 'sp2'], C8: [1, 'sp2'], N6: [2, 'sp2'] },
      DA: { C2: [1, 'sp2'], C8: [1, 'sp2'], N6: [2, 'sp2'] },
      ADE: { C2: [1, 'sp2'], C8: [1, 'sp2'], N6: [2, 'sp2'] },
      G: { C8: [1, 'sp2'], N1: [1, 'sp2'], N2: [2, 'sp2'] },
      DG: { C8: [1, 'sp2'], N1: [1, 'sp2'], N2: [2, 'sp2'] },
      GUA: { C8: [1, 'sp2'], N1: [1, 'sp2'], N2: [2, 'sp2'] },
      C: { C5: [1, 'sp2'], C6: [1, 'sp2'], N4: [2, 'sp2'] },
      DC: { C5: [1, 'sp2'], C6: [1, 'sp2'], N4: [2, 'sp2'] },
      CYT: { C5: [1, 'sp2'], C6: [1, 'sp2'], N4: [2, 'sp2'] },
      T: { C6: [1, 'sp2'], N3: [1, 'sp2'], C7: [3, 'sp3'], C5M: [3, 'sp3'] },
      DT: { C6: [1, 'sp2'], N3: [1, 'sp2'], C7: [3, 'sp3'], C5M: [3, 'sp3'] },
      THY: { C6: [1, 'sp2'], N3: [1, 'sp2'], C7: [3, 'sp3'], C5M: [3, 'sp3'] },
      U: { C5: [1, 'sp2'], C6: [1, 'sp2'], N3: [1, 'sp2'] },
      DU: { C5: [1, 'sp2'], C6: [1, 'sp2'], N3: [1, 'sp2'] },
      URA: { C5: [1, 'sp2'], C6: [1, 'sp2'], N3: [1, 'sp2'] }
    };
    const key = base[resn] ? resn : (rna ? resn.replace(/^R/, '') : resn);
    const spec = (base[key] || base[resn] || {})[name];
    if (spec) return { n: spec[0], hyb: spec[1] };
    if (name === "C1'" || name === "C3'" || name === "C4'") return { n: 1, hyb: 'sp3' };
    if (name === "C5'") return { n: 2, hyb: 'sp3' };
    if (name === "C2'") return { n: rna ? 1 : 2, hyb: 'sp3' };
    if (name === "O2'" && rna) return { n: 1, hyb: 'sp3' };
    return null;
  }

  function planFor(a, atoms, nbrs) {
    const resn = (a.resn || '').trim().toUpperCase();
    const name = aname(a).replace(/\*/g, "'");
    if (WATERS_RES.has(resn) && (name === 'O' || name === 'OW')) return { n: 2, hyb: 'sp3', water: true };
    if (AA.has(resn)) return aaPlan(resn, name, a, atoms, nbrs);
    if (NA_RES.has(resn) || /'/.test(name)) {
      const p = naPlan(resn, name);
      if (p) return p;
      if (NA_RES.has(resn)) return { n: 0, hyb: 'sp3' };
    }
    return null;
  }

  function planeNormal(atom, atoms, nbrIdx) {
    if (!nbrIdx.length) return { x: 0, y: 0, z: 1 };
    const j = nbrIdx[0];
    const nj = neighbors(atoms, j).filter(k => k !== atom._i && elOf(atoms[k]) !== 'H');
    let k = nj.find(t => elOf(atoms[t]) === 'O') ?? nj.find(t => elOf(atoms[t]) === 'N') ?? nj[0];
    const toN = sub(atoms[j], atom);
    if (k == null) return perp(toN);
    return norm(cross(toN, sub(atoms[k], atoms[j])));
  }

  function placeDirs(origin, neighPos, nH, hyb, extra) {
    const u = neighPos.map(p => norm(sub(p, origin)));
    const put = [];
    const push = (dir) => put.push(norm(dir));
    if (extra && extra.water) {
      const axis = extra.toward ? norm(sub(extra.toward, origin)) : { x: 1, y: 0, z: 0 };
      const p = perp(axis);
      const half = TET / 2;
      push(add(scale(axis, Math.cos(half)), scale(p, Math.sin(half))));
      push(add(scale(axis, Math.cos(half)), scale(p, -Math.sin(half))));
      return put.slice(0, nH);
    }
    if (hyb === 'sp' && u.length >= 1 && nH === 1) { push(scale(u[0], -1)); return put; }
    if (hyb === 'sp2' && nH === 1 && u.length >= 2) {
      push(scale(add(u[0], u[1]), -1));
      return put;
    }
    if (hyb === 'sp2' && nH === 2 && u.length >= 1) {
      const n = extra && extra.normal && len(extra.normal) > 0.1 ? norm(extra.normal) : perp(u[0]);
      const p = norm(cross(n, u[0]));
      const s = Math.sqrt(3) / 2;
      push(add(scale(u[0], -0.5), scale(p, s)));
      push(add(scale(u[0], -0.5), scale(p, -s)));
      return put;
    }
    if (hyb === 'sp3' && nH === 1 && u.length === 2) {
      const nrm = norm(cross(u[0], u[1]));
      const m = norm(add(u[0], u[1]));
      const half = TET / 2;
      push(add(scale(m, -Math.cos(half)), scale(nrm, Math.sin(half))));
      return put;
    }
    if (hyb === 'sp3' && nH === 1 && u.length >= 3) {
      push(scale(add(add(u[0], u[1]), u[2]), -1));
      return put;
    }
    if (hyb === 'sp3' && nH === 2 && u.length >= 2) {
      const n = norm(cross(u[0], u[1]));
      const m = norm(add(u[0], u[1]));
      const half = TET / 2;
      push(add(scale(m, -Math.cos(half)), scale(n, Math.sin(half))));
      push(add(scale(m, -Math.cos(half)), scale(n, -Math.sin(half))));
      return put;
    }
    if (hyb === 'sp3' && nH === 1 && u.length === 1) {
      const dir = cone(u[0], extra && extra.aim ? norm(sub(extra.aim, origin)) : staggerRadial(u[0], extra && extra.stagger));
      push(dir);
      return put;
    }
    if (hyb === 'sp3' && nH >= 2 && u.length === 1) {
      const radial = staggerRadial(u[0], extra && extra.stagger);
      const ortho = norm(cross(u[0], radial));
      const count = Math.min(nH, 3);
      const cosA = Math.cos(TET), sinA = Math.sin(TET);
      for (let k = 0; k < count; k++) {
        const phi = k * 2 * Math.PI / count;
        const rad = add(scale(radial, Math.cos(phi)), scale(ortho, Math.sin(phi)));
        push(add(scale(u[0], cosA), scale(rad, sinA)));
      }
      return put;
    }
    if (u.length >= 1 && nH === 1) { push(scale(u[0], -1)); return put; }
    return put;
  }

  function staggerRadial(axis, points) {
    if (points && points.length) {
      let acc = { x: 0, y: 0, z: 0 };
      for (const p of points) {
        const d = norm(p);
        acc = add(acc, sub(d, scale(axis, dot(d, axis))));
      }
      if (len(acc) > 1e-4) {
        const radial = norm(acc);
        const side = norm(cross(axis, radial));
        const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
        return norm(add(scale(radial, c), scale(side, s)));
      }
    }
    return perp(axis);
  }

  function cone(axis, aim) {
    const cosA = Math.cos(TET), sinA = Math.sin(TET);
    let radial = sub(aim, scale(axis, dot(aim, axis)));
    if (len(radial) < 1e-4) radial = perp(axis);
    else radial = norm(radial);
    return norm(add(scale(axis, cosA), scale(radial, sinA)));
  }

  function hbondAim(atom, atoms, forbid) {
    let best = null;
    for (let j = 0; j < atoms.length; j++) {
      if (forbid.has(j)) continue;
      const e = elOf(atoms[j]);
      if (e !== 'O' && e !== 'N') continue;
      const d = dist(atom, atoms[j]);
      if (d < 2.3 || d > 3.3) continue;
      if (!best || d < best.d) best = { d, p: atoms[j] };
    }
    return best && best.p;
  }

  function hName(parentName, idx, total) {
    const map = {
      N: ['H', 'H2', 'H3'], CA: ['HA', 'HA2', 'HA3'], CB: ['HB', 'HB2', 'HB3'],
      CG: ['HG', 'HG2', 'HG3'], CG1: ['HG11', 'HG12', 'HG13'], CG2: ['HG21', 'HG22', 'HG23'],
      CD: ['HD', 'HD2', 'HD3'], CD1: ['HD1', 'HD11', 'HD12', 'HD13'], CD2: ['HD2', 'HD21', 'HD22', 'HD23'],
      CE: ['HE', 'HE2', 'HE3'], CE1: ['HE1'], CE2: ['HE2'], CE3: ['HE3'],
      CZ: ['HZ'], CZ2: ['HZ2'], CZ3: ['HZ3'], CH2: ['HH2'],
      ND1: ['HD1'], ND2: ['HD21', 'HD22'], NE: ['HE'], NE1: ['HE1'], NE2: ['HE21', 'HE22'],
      NH1: ['HH11', 'HH12'], NH2: ['HH21', 'HH22'], NZ: ['HZ1', 'HZ2', 'HZ3'],
      OG: ['HG'], OG1: ['HG1'], OH: ['HH'], SG: ['HG'], OXT: ['HXT'],
      "C1'": ["H1'"], "C2'": ["H2'", "H2''"], "C3'": ["H3'"], "C4'": ["H4'"], "C5'": ["H5'", "H5''"], "O2'": ["HO2'"],
      N1: ['H1'], N2: ['H21', 'H22'], N3: ['H3'], N4: ['H41', 'H42'], N6: ['H61', 'H62'],
      C2: ['H2'], C5: ['H5'], C6: ['H6'], C7: ['H71', 'H72', 'H73'], C8: ['H8']
    };
    const list = map[parentName];
    if (list && list[idx]) return list[idx];
    return total === 1 ? 'H' : 'H' + (idx + 1);
  }

  function addHydrogens(atoms, cryst) {
    if (!atoms || !atoms.length) return { atoms: [], added: 0, warn: '' };
    if (atoms.length > 20000) return { atoms: [], added: 0, warn: 'Слишком много атомов, чтобы добавить водороды на телефоне.' };
    inferBonds(atoms, cryst);
    ensureBondOrders(atoms);
    const warn = atoms.length > 8000 ? 'Большая структура: водороды ставятся по шаблону остатков.' : '';
    const made = [];
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      a._i = i;
      const e = elOf(a);
      if (e === 'H' || e === 'D') continue;
      const nbrs = neighbors(atoms, i);
      const heavyIdx = [];
      const hIdx = [];
      for (const j of nbrs) (elOf(atoms[j]) === 'H' ? hIdx : heavyIdx).push(j);
      for (let j = 0; j < atoms.length; j++) {
        if (hIdx.indexOf(j) >= 0 || heavyIdx.indexOf(j) >= 0) continue;
        if (elOf(atoms[j]) !== 'H') continue;
        if (dist(a, atoms[j]) < 1.25) hIdx.push(j);
      }
      let plan = planFor(a, atoms, nbrs);
      if (!plan) {
        if (atoms.length > 12000) continue;
        const heavyDeg = heavyIdx.length;
        const val = valenceOf(e, heavyDeg);
        const used = orderSum(a, atoms);
        const n = Math.max(0, Math.round((val - used) * 2) / 2);
        // дробная ароматическая валентность: не хватает целого H
        const missingInt = Math.max(0, Math.round(val - used));
        let hyb = 'sp3';
        if (e === 'C' || e === 'N') {
          const filled = heavyDeg + missingInt;
          hyb = filled <= 2 ? 'sp' : filled === 3 ? 'sp2' : 'sp3';
        } else if (e === 'O' && heavyDeg >= 2) hyb = 'sp3';
        else if ((e === 'O' || e === 'S') && heavyDeg === 1) hyb = 'sp3';
        plan = { n: missingInt, hyb };
        if (n <= 0) plan.n = 0;
      }
      const missing = Math.max(0, plan.n - hIdx.length);
      if (!missing) continue;
      const neighPos = heavyIdx.map(j => atoms[j]);
      const extra = {};
      if (plan.water) {
        extra.water = true;
        const aim = hbondAim(a, atoms, new Set([i, ...heavyIdx, ...hIdx]));
        if (aim) extra.toward = aim;
      } else if (plan.hyb === 'sp2' && missing >= 2 && heavyIdx.length === 1) {
        extra.normal = planeNormal(a, atoms, heavyIdx);
      } else if (plan.hyb === 'sp3' && heavyIdx.length === 1 && (missing === 3 || missing === 1)) {
        const j = heavyIdx[0];
        extra.stagger = neighbors(atoms, j).filter(k => k !== i && elOf(atoms[k]) !== 'H').map(k => sub(atoms[k], atoms[j]));
        if (missing === 1 && (e === 'O' || e === 'S')) {
          const aim = hbondAim(a, atoms, new Set([i, j, ...hIdx]));
          if (aim) extra.aim = aim;
        }
      }
      const dirs = placeDirs(a, neighPos, plan.n, plan.hyb, extra);
      const bondLen = bondLenOf(e);
      const existing = hIdx.map(j => atoms[j]);
      let placed = 0;
      const pname = aname(a).replace(/\*/g, "'");
      for (let t = 0; t < dirs.length && placed < missing; t++) {
        const p = add(a, scale(dirs[t], bondLen));
        if (existing.some(h => dist(h, p) < 0.55)) continue;
        made.push({
          x: p.x, y: p.y, z: p.z, elem: 'H', parent: i, hyb: plan.hyb,
          resn: a.resn, resi: a.resi, chain: a.chain, hetflag: a.hetflag,
          atom: hName(pname, hIdx.length + placed, plan.n), bonds: []
        });
        placed++;
      }
    }
    return { atoms: made, added: made.length, warn };
  }

  function attachHydrogens(model, made) {
    if (!made || !made.atoms.length) return 0;
    const start = model.atoms.length;
    model.addAtoms(made.atoms.map((h, n) => ({
      x: h.x, y: h.y, z: h.z, elem: 'H', resn: h.resn, resi: h.resi, chain: h.chain,
      hetflag: !!h.hetflag, atom: h.atom, serial: start + n + 1, altLoc: '', bonds: [], bondOrder: [], addedH: true
    })));
    for (let i = 0; i < made.atoms.length; i++) {
      const h = model.atoms[start + i];
      const p = model.atoms[made.atoms[i].parent];
      if (!p || !h) continue;
      if (!p.bonds) p.bonds = [];
      if (!p.bondOrder) p.bondOrder = [];
      while (p.bondOrder.length < p.bonds.length) p.bondOrder.push(1);
      if (p.bonds.indexOf(h.index) < 0) {
        p.bonds.push(h.index);
        p.bondOrder.push(1);
      }
      h.bonds = [p.index];
      h.bondOrder = [1];
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
    AA, IX, addHydrogens, attachHydrogens, ensureBondOrders, assignCharges, chargeHex, hpHex, findInteractions, elOf, dist
  };
})();
