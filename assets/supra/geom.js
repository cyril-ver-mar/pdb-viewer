/* Учебные 3D-модели супрамолекулярных хозяев.
   Геометрия собирается из фрагментов (без SMILES) и коротко релаксируется:
   связь, угол, мягкое отталкивание и слабая привязка к исходной форме.
   Это не кристаллическая структура. */
(function (root) {
  'use strict';

  const VDW = { H: 1.10, C: 1.70, N: 1.55, O: 1.52, S: 1.80, F: 1.47, Cl: 1.75, Br: 1.85, I: 1.98, Li: 1.82, Na: 2.27, K: 2.75, Rb: 3.03, Cs: 3.43, Fe: 2.00, Cu: 1.40, Zn: 1.39, Ni: 1.63 };
  const METAL = { Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Cu: 2, Zn: 2, Ni: 2, Fe: 2 };

  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function len(a) { return Math.hypot(a.x, a.y, a.z); }
  function norm(a) { const l = len(a); return l < 1e-12 ? { x: 0, y: 0, z: 0 } : mul(a, 1 / l); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function centroid(arr) {
    const c = { x: 0, y: 0, z: 0 };
    if (!arr.length) return c;
    arr.forEach(p => { c.x += p.x; c.y += p.y; c.z += p.z; });
    return mul(c, 1 / arr.length);
  }
  function avg(xs) { return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0; }
  function perp(v) {
    const a = Math.abs(v.x), b = Math.abs(v.y), c = Math.abs(v.z);
    const t = a <= b && a <= c ? { x: 1, y: 0, z: 0 } : b <= c ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    return norm(cross(v, t));
  }
  function vdw(el) { return VDW[el] || 1.7; }

  function fromInternal(a, b, c, bond, angleDeg, torsionDeg) {
    const ang = angleDeg * Math.PI / 180;
    const tor = torsionDeg * Math.PI / 180;
    const vab = norm(sub(b, a));
    let ref = sub(sub(c, b), mul(vab, dot(sub(c, b), vab)));
    ref = len(ref) < 1e-8 ? perp(vab) : norm(ref);
    const ort = norm(cross(vab, ref));
    const dir = add(mul(vab, Math.cos(ang)), add(mul(ref, Math.sin(ang) * Math.cos(tor)), mul(ort, Math.sin(ang) * Math.sin(tor))));
    return add(a, mul(norm(dir), bond));
  }

  function defaultR(e1, e2, order) {
    const pair = [e1, e2].map(e => String(e).toUpperCase()).sort().join('-');
    if (order >= 2 && pair === 'C-O') return 1.22;
    if (order >= 2 && pair === 'C-C') return 1.34;
    if (order >= 2 && pair === 'C-N') return 1.29;
    if (order >= 2 && pair === 'N-N') return 1.25;
    const T = {
      'C-C': 1.53, 'C-O': 1.43, 'C-N': 1.47, 'C-S': 1.82, 'C-H': 1.09, 'N-H': 1.01, 'O-H': 0.97,
      'C-BR': 1.94, 'BR-C': 1.94, 'C-I': 2.12, 'I-I': 2.67, 'N-O': 1.40, 'O-S': 1.46, 'S-O': 1.46,
      'C-CL': 1.77, 'CL-C': 1.77, 'N-N': 1.40
    };
    return T[pair] || 1.50;
  }

  function Mol(name) {
    this.name = name || 'supra';
    this.atoms = [];
    this.bonds = [];
    this.meta = {};
  }
  Mol.prototype.add = function (el, x, y, z, opt) {
    const a = Object.assign({
      el: el, x: x, y: y, z: z, h: 0, hyb: 3, role: 'host', group: 0, q: 0,
      donor: false, probe: false, formal: null, ion: false, name: ''
    }, opt || {});
    a.i = this.atoms.length;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) {
      a.x = 0; a.y = 0; a.z = 0; a.bad = true;
    }
    this.atoms.push(a);
    return a;
  };
  Mol.prototype.link = function (a, b, order, r0) {
    if (!a || !b) return this;
    const i = a.i, j = b.i;
    const o = order || 1;
    this.bonds.push({ i: i, j: j, order: o >= 4 ? 1 : o, r0: r0 || defaultR(this.atoms[i].el, this.atoms[j].el, o) });
    return this;
  };
  Mol.prototype.byName = function (name) { return this.atoms.filter(a => a.name === name); };

  function hDirs(atom, nbrs, need) {
    const bond = atom.el === 'O' ? 0.97 : atom.el === 'N' ? 1.01 : 1.09;
    const vecs = nbrs.map(n => norm(sub(n, atom))).filter(v => len(v) > 0.2);
    if (need === 2 && vecs.length >= 2) {
      const u = vecs[0], v = vecs[1];
      const mid = add(u, v);
      const side = cross(u, v);
      if (len(mid) > 1e-4 && len(side) > 1e-4) {
        const back = norm(mul(norm(mid), -1));
        const p = norm(side);
        const half = 54.74 * Math.PI / 180;
        const c = Math.cos(half), s = Math.sin(half);
        return [mul(norm(add(mul(back, c), mul(p, s))), bond), mul(norm(add(mul(back, c), mul(p, -s))), bond)];
      }
    }
    if (need === 3 && vecs.length === 1) {
      const u = vecs[0];
      const b = perp(u), c = norm(cross(u, b));
      const ang = 109.47 * Math.PI / 180;
      const comp = Math.cos(ang), pr = Math.sin(ang);
      const out = [];
      for (let k = 0; k < 3; k++) {
        const phi = 2 * Math.PI * k / 3;
        out.push(mul(norm(add(mul(u, comp), add(mul(b, pr * Math.cos(phi)), mul(c, pr * Math.sin(phi))))), bond));
      }
      return out;
    }
    if (need === 1 && vecs.length >= 1) {
      let s = { x: 0, y: 0, z: 0 };
      vecs.forEach(v => { s = add(s, v); });
      if (len(s) < 1e-4) s = perp(vecs[0]);
      return [mul(norm(mul(s, -1)), bond)];
    }
    const dirs = [];
    for (let k = 0; k < need; k++) {
      dirs.push(norm({
        x: Math.sin(k * 2.399 + 0.4),
        y: Math.cos(k * 1.71 + 0.2),
        z: Math.sin(k * 1.13 + 1.1)
      }));
    }
    for (let it = 0; it < 48; it++) {
      for (let k = 0; k < need; k++) {
        let f = { x: 0, y: 0, z: 0 };
        vecs.forEach(v => { const d = sub(dirs[k], v); const L = len(d) || 0.15; f = add(f, mul(d, 1 / (L * L))); });
        for (let j = 0; j < need; j++) if (j !== k) {
          const d = sub(dirs[k], dirs[j]); const L = len(d) || 0.15; f = add(f, mul(d, 1 / (L * L)));
        }
        dirs[k] = norm(add(dirs[k], mul(f, 0.18)));
      }
    }
    return dirs.map(d => mul(d, bond));
  }

  function addHydrogens(mol) {
    const n0 = mol.atoms.length;
    const nbr = mol.atoms.map(() => []);
    mol.bonds.forEach(b => { if (b.i < n0 && b.j < n0) { nbr[b.i].push(b.j); nbr[b.j].push(b.i); } });
    const extra = [];
    const extraB = [];
    for (let i = 0; i < n0; i++) {
      const a = mol.atoms[i];
      const need = a.h | 0;
      if (need <= 0 || a.el === 'H') continue;
      const pos = nbr[i].map(j => mol.atoms[j]);
      const dirs = hDirs(a, pos, need);
      dirs.forEach(d => {
        const hi = n0 + extra.length;
        extra.push({
          el: 'H', x: a.x + d.x, y: a.y + d.y, z: a.z + d.z, h: 0, hyb: 0,
          role: a.role, group: a.group, q: 0, donor: false, probe: false, formal: null,
          ion: false, name: '', i: hi
        });
        extraB.push({ i: i, j: hi, order: 1, r0: a.el === 'O' ? 0.97 : a.el === 'N' ? 1.01 : 1.09 });
      });
      a.h = 0;
    }
    extra.forEach(h => mol.atoms.push(h));
    extraB.forEach(b => mol.bonds.push(b));
  }

  function relax(mol, steps, kPos) {
    const atoms = mol.atoms;
    const n = atoms.length;
    if (!n || steps <= 0) return;
    const x0 = new Float64Array(n * 3);
    const x = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { x[i * 3] = x0[i * 3] = atoms[i].x; x[i * 3 + 1] = x0[i * 3 + 1] = atoms[i].y; x[i * 3 + 2] = x0[i * 3 + 2] = atoms[i].z; }
    const nbrs = atoms.map(() => []);
    mol.bonds.forEach(b => { nbrs[b.i].push(b.j); nbrs[b.j].push(b.i); });
    const angles = [];
    for (let j = 0; j < n; j++) {
      const nb = nbrs[j];
      if (nb.length < 2 || atoms[j].el === 'H' && nb.length < 2) {
        /* apex */
      }
      const th0 = (atoms[j].hyb === 2 ? 120 : (atoms[j].ang || 109.5)) * Math.PI / 180;
      for (let a = 0; a < nb.length; a++) for (let b = a + 1; b < nb.length; b++) {
        angles.push({ i: nb[a], j: j, k: nb[b], th0: th0 });
      }
    }
    const ban = new Set();
    mol.bonds.forEach(b => { ban.add(b.i + ':' + b.j); ban.add(b.j + ':' + b.i); });
    angles.forEach(a => { ban.add(a.i + ':' + a.k); ban.add(a.k + ':' + a.i); });
    const kB = 70, kA = 18, kR = 8, kp = kPos == null ? 2.2 : kPos;
    const vx = new Float64Array(n * 3);
    let dt = 0.012;
    const saved = x.slice();
    for (let step = 0; step < steps; step++) {
      const g = new Float64Array(n * 3);
      const at = i => ({ x: x[i * 3], y: x[i * 3 + 1], z: x[i * 3 + 2] });
      const addG = (i, v, s) => { g[i * 3] += v.x * s; g[i * 3 + 1] += v.y * s; g[i * 3 + 2] += v.z * s; };
      for (let bi = 0; bi < mol.bonds.length; bi++) {
        const b = mol.bonds[bi];
        const pi = at(b.i), pj = at(b.j);
        const d = sub(pi, pj);
        const r = len(d) || 1e-6;
        const diff = r - b.r0;
        const s = kB * diff / r;
        addG(b.i, d, s); addG(b.j, d, -s);
      }
      for (let ai = 0; ai < angles.length; ai++) {
        const an = angles[ai];
        const pi = at(an.i), pj = at(an.j), pk = at(an.k);
        const rij = sub(pi, pj), rkj = sub(pk, pj);
        const nij = len(rij) || 1e-6, nkj = len(rkj) || 1e-6;
        const cos = clamp(dot(rij, rkj) / (nij * nkj), -0.999999, 0.999999);
        const theta = Math.acos(cos);
        const sin = Math.sqrt(Math.max(1e-8, 1 - cos * cos));
        const dcos_i = sub(mul(rkj, 1 / (nij * nkj)), mul(rij, cos / (nij * nij)));
        const dcos_k = sub(mul(rij, 1 / (nij * nkj)), mul(rkj, cos / (nkj * nkj)));
        const fac = -1 / sin;
        const dti = mul(dcos_i, fac), dtk = mul(dcos_k, fac);
        const dtj = mul(add(dti, dtk), -1);
        const w = kA * (theta - an.th0);
        addG(an.i, dti, w); addG(an.j, dtj, w); addG(an.k, dtk, w);
      }
      if (kp > 0) {
        for (let i = 0; i < n; i++) {
          g[i * 3] += kp * (x[i * 3] - x0[i * 3]);
          g[i * 3 + 1] += kp * (x[i * 3 + 1] - x0[i * 3 + 1]);
          g[i * 3 + 2] += kp * (x[i * 3 + 2] - x0[i * 3 + 2]);
        }
      }
      const cut = 5.2;
      for (let i = 0; i < n; i++) {
        if (atoms[i].freeze) continue;
        const pi = at(i);
        for (let j = i + 1; j < n; j++) {
          if (ban.has(i + ':' + j)) continue;
          const pj = at(j);
          const dx = pi.x - pj.x, dy = pi.y - pj.y, dz = pi.z - pj.z;
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 > cut * cut || r2 < 1e-8) continue;
          const r = Math.sqrt(r2);
          const sig = 0.82 * (vdw(atoms[i].el) + vdw(atoms[j].el));
          if (r >= sig) continue;
          const s = kR * (sig - r) / r;
          g[i * 3] -= dx * s; g[i * 3 + 1] -= dy * s; g[i * 3 + 2] -= dz * s;
          g[j * 3] += dx * s; g[j * 3 + 1] += dy * s; g[j * 3 + 2] += dz * s;
        }
      }
      let maxG = 0;
      for (let i = 0; i < g.length; i++) maxG = Math.max(maxG, Math.abs(g[i]));
      const clip = 3.5;
      const sc = maxG > clip ? clip / maxG : 1;
      let runaway = false;
      for (let i = 0; i < n; i++) {
        if (atoms[i].freeze) continue;
        for (let t = 0; t < 3; t++) {
          const idx = i * 3 + t;
          vx[idx] = 0.55 * vx[idx] + g[idx] * sc;
          x[idx] -= dt * vx[idx];
          if (!Number.isFinite(x[idx])) runaway = true;
        }
      }
      if (runaway) { x.set(saved); break; }
    }
    let bad = false;
    for (let i = 0; i < n; i++) if (!Number.isFinite(x[i * 3])) bad = true;
    if (bad) return;
    for (let i = 0; i < n; i++) { atoms[i].x = x[i * 3]; atoms[i].y = x[i * 3 + 1]; atoms[i].z = x[i * 3 + 2]; }
  }

  function finish(mol, steps, kPos) {
    addHydrogens(mol);
    relax(mol, steps == null ? 28 : steps, kPos);
    return mol;
  }

  function formulaOf(atoms) {
    const c = {};
    atoms.forEach(a => { c[a.el] = (c[a.el] || 0) + 1; });
    const rest = Object.keys(c).filter(e => e !== 'C' && e !== 'H').sort();
    const seq = [];
    if (c.C) seq.push('C');
    if (c.H) seq.push('H');
    rest.forEach(e => seq.push(e));
    return seq.map(e => e + (c[e] > 1 ? c[e] : '')).join('');
  }
  function hasNaN(mol) {
    return mol.atoms.some(a => !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z));
  }
  function bondReport(mol) {
    let s = 0, m = 0, n = 0;
    mol.bonds.forEach(b => {
      const d = Math.abs(dist(mol.atoms[b.i], mol.atoms[b.j]) - b.r0);
      s += d; m = Math.max(m, d); n++;
    });
    return { mean: n ? s / n : 0, max: m, n: n };
  }
  function centerMol(mol, pred) {
    const list = mol.atoms.filter(pred || (a => a.role === 'host' || a.role === 'host2'));
    const c = centroid(list.length ? list : mol.atoms);
    mol.atoms.forEach(a => { a.x -= c.x; a.y -= c.y; a.z -= c.z; });
    return c;
  }

  function sdfOf(mol) {
    const a = mol.atoms, b = mol.bonds;
    let s = (mol.name || 'supra') + '\n  supra-builder\n\n';
    s += String(a.length).padStart(3) + String(b.length).padStart(3) + '  0  0  0  0  0  0  0  0999 V2000\n';
    a.forEach(at => {
      const el = at.el.length === 1 ? at.el + ' ' : at.el;
      s += at.x.toFixed(4).padStart(10) + at.y.toFixed(4).padStart(10) + at.z.toFixed(4).padStart(10) + ' ' + el.padEnd(3, ' ') + ' 0  0  0  0  0  0  0  0  0  0  0  0\n';
    });
    b.forEach(bond => {
      s += String(bond.i + 1).padStart(3) + String(bond.j + 1).padStart(3) + String(bond.order || 1).padStart(3) + '  0  0  0  0\n';
    });
    s += 'M  END\n$$$$\n';
    return s;
  }
  function pdbName(el) {
    const e = el.length === 1 ? el.toUpperCase() : el.toUpperCase();
    return e.length === 1 ? ' ' + e + '  ' : e.padEnd(4, ' ').slice(0, 4);
  }
  function pdbOf(mol) {
    let s = 'HEADER    SUPRA\n';
    mol.atoms.forEach((at, i) => {
      const el = at.el.length > 1 ? at.el[0].toUpperCase() + at.el.slice(1).toLowerCase() : at.el.toUpperCase();
      const sym = (at.el.length === 1 ? ' ' + at.el.toUpperCase() : at.el.toUpperCase().slice(0, 2)).padStart(2, ' ');
      let line = 'HETATM';
      line += String(i + 1).padStart(5);
      line += ' ' + pdbName(at.el);
      line += ' LIG A';
      line += '   1    ';
      line += at.x.toFixed(3).padStart(8) + at.y.toFixed(3).padStart(8) + at.z.toFixed(3).padStart(8);
      line += '  1.00  0.00          ';
      line += sym;
      s += line + '\n';
    });
    mol.bonds.forEach(b => {
      const nbr = [b.j + 1];
      mol.bonds.forEach(c => {
        if (c === b) return;
        if (c.i === b.i) nbr.push(c.j + 1);
        else if (c.j === b.i) nbr.push(c.i + 1);
      });
      const uniq = [...new Set(nbr)].slice(0, 4);
      if (!uniq.length) return;
      let line = 'CONECT' + String(b.i + 1).padStart(5);
      uniq.forEach(k => { line += String(k).padStart(5); });
      s += line + '\n';
    });
    s += 'END\n';
    return s;
  }

  function benzenePoints(origin, axisX, axisY, R) {
    R = R || 1.395;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      pts.push(add(origin, add(mul(axisX, R * Math.cos(a)), mul(axisY, R * Math.sin(a)))));
    }
    return pts;
  }
  function linkRing(mol, atoms, r0, order) {
    for (let k = 0; k < atoms.length; k++) mol.link(atoms[k], atoms[(k + 1) % atoms.length], order || 1, r0);
  }
  function bridgePoint(A, B, r) {
    const d = dist(A, B) || 1e-6;
    const mid = lerp(A, B, 0.5);
    const dir = norm(sub(B, A));
    let side = cross(dir, { x: 0, y: 0, z: 1 });
    if (len(side) < 1e-4) side = { x: 0, y: 1, z: 0 };
    side = norm(side);
    const hh = Math.sqrt(Math.max(0, r * r - Math.min(r * r, (d / 2) * (d / 2))));
    const p1 = add(mid, mul(side, hh)), p2 = add(mid, mul(side, -hh));
    const r1 = Math.hypot(p1.x, p1.y), r2 = Math.hypot(p2.x, p2.y);
    return r1 >= r2 ? p1 : p2;
  }
  function radialAt(ang) { return { x: Math.cos(ang), y: Math.sin(ang), z: 0 }; }
  function tangentAt(ang) { return { x: -Math.sin(ang), y: Math.cos(ang), z: 0 }; }

  function hetOf(mode, index, m) {
    if (mode === 'S') return { el: 'S', h: 0, donor: true };
    if (mode === 'NH') return { el: 'N', h: 1, donor: true };
    if (mode === 'NMe') return { el: 'N', h: 0, donor: true, methyl: true };
    if (mode === 'diaza') {
      const on = index === 0 || index === Math.floor(m / 2);
      return on ? { el: 'N', h: 1, donor: true } : { el: 'O', h: 0, donor: true };
    }
    if (mode === 'NOS') {
      const seq = [{ el: 'O', h: 0 }, { el: 'N', h: 1 }, { el: 'S', h: 0 }];
      const s = seq[index % 3];
      return { el: s.el, h: s.h, donor: true };
    }
    return { el: 'O', h: 0, donor: true };
  }

function bondDX(el) { return el === 'S' ? 1.81 : el === 'N' ? 1.47 : 1.43; }
function solveEthylene(D, r1, r2) {
  let best = null;
  for (let i = 0; i < 120; i++) {
    const p = 0.15 + i * 0.015;
    const h2 = r1 * r1 - p * p;
    if (h2 <= 0.02) continue;
    const rest = D - p;
    for (let j = 0; j < 120; j++) {
      const q = 0.15 + j * 0.015;
      const h2b = r2 * r2 - q * q;
      if (h2b <= 0.02) continue;
      const along = rest - q;
      const h = Math.sqrt(h2), hb = Math.sqrt(h2b);
      const cc = Math.hypot(along, h + hb);
      const err = Math.abs(cc - 1.52);
      if (!best || err < best.err) best = { p: p, q: q, h: h, hb: hb, err: err };
    }
  }
  return best;
}
function buildCrown(state) {
  const m = clamp(state.n | 0 || 6, 3, 10);
  const mol = new Mol(m * 3 + '-crown-' + m);
  const holeTab = { 3: 0.55, 4: 0.95, 5: 1.35, 6: 2.05, 7: 2.95, 8: 3.75, 9: 4.4, 10: 5.0 };
  let R = (VDW.O + (holeTab[m] || (0.6 * m - 1)) / 2);
  if (state.het === 'S') R += 0.45;
  if (state.het === 'NH' || state.het === 'NMe') R += 0.12;
  const units = [];
  for (let i = 0; i < m; i++) {
    const ang = 2 * Math.PI * i / m;
    const rad = radialAt(ang);
    const z = (i % 2 === 0 ? 0.12 : -0.12);
    const het = hetOf(state.het, i, m);
    const A = mol.add(het.el, rad.x * R, rad.y * R, z, { h: het.h, donor: true, probe: 'hole', name: 'D' + i, hyb: 3 });
    if (het.methyl) {
      const Me = mol.add('C', A.x + rad.x * 1.47, A.y + rad.y * 1.47, A.z + 0.2, { h: 3, hyb: 3 });
      mol.link(A, Me, 1, 1.47);
      A.h = 0;
    }
    units.push({ A: A, rad: rad, i: i });
  }
  for (let i = 0; i < m; i++) {
    const u = units[i], v = units[(i + 1) % m];
    const r1 = bondDX(u.A.el), r2 = bondDX(v.A.el);
    const D = dist(u.A, v.A);
    const sol = solveEthylene(D, r1, r2) || { p: 0.7, q: 0.7, h: 0.9, hb: 0.9 };
    const T = norm(sub(v.A, u.A));
    const sign = (i % 2 === 0) ? 1 : -1;
    const Z = { x: 0, y: 0, z: 1 };
    const c1p = add(add(u.A, mul(T, sol.p)), mul(Z, sol.h * sign));
    const c2p = add(add(v.A, mul(T, -sol.q)), mul(Z, -sol.hb * sign));
    const c1 = mol.add('C', c1p.x, c1p.y, c1p.z, { h: 2, hyb: 3, name: 'C' + i + 'a' });
    const c2 = mol.add('C', c2p.x, c2p.y, c2p.z, { h: 2, hyb: 3, name: 'C' + i + 'b' });
    u.c1 = c1; u.c2 = c2;
    mol.link(u.A, c1, 1, r1);
    mol.link(c1, c2, 1, 1.52);
    mol.link(c2, v.A, 1, r2);
  }
    const ann = String(state.ann || '0');
    const annUnits = ann === '1' ? [0] : (ann === '2' || ann === 'cy') ? [0, Math.floor(m / 2)] : [];
    annUnits.forEach(i => {
      if (i >= m) return;
      const u = units[i];
      u.c1.h = ann === 'cy' ? 1 : 0;
      u.c2.h = ann === 'cy' ? 1 : 0;
      u.c1.hyb = ann === 'cy' ? 3 : 2;
      u.c2.hyb = ann === 'cy' ? 3 : 2;
      const outward = u.rad;
      const pts = benzeneFromEdge(u.c1, u.c2, outward);
      if (ann === 'cy') {
        pts.forEach((p, k) => { p.z += (k % 2 === 0 ? 0.45 : -0.45); });
      }
      const carbons = pts.map((p, k) => mol.add('C', p.x, p.y, p.z, {
        h: ann === 'cy' ? 2 : 1, hyb: ann === 'cy' ? 3 : 2, name: 'F' + i + k
      }));
      if (ann === 'cy') {
        mol.link(u.c1, carbons[0], 1, 1.53);
        for (let k = 0; k < carbons.length - 1; k++) mol.link(carbons[k], carbons[k + 1], 1, 1.53);
        mol.link(carbons[carbons.length - 1], u.c2, 1, 1.53);
      } else {
        mol.link(u.c1, carbons[0], 1, 1.40);
        for (let k = 0; k < carbons.length - 1; k++) mol.link(carbons[k], carbons[k + 1], 1, 1.39);
        mol.link(carbons[carbons.length - 1], u.c2, 1, 1.40);
      }
    });
    if (state.sub === 'Me' || state.sub === 'MeAll') {
      const targets = state.sub === 'Me' ? [units[0].c1] : units.reduce((acc, u) => acc.concat([u.c1, u.c2]), []);
      targets.forEach(c => {
        if (c.h < 1 || c.hyb === 2) return;
        c.h -= 1;
        const dir = norm({ x: c.x, y: c.y, z: 0.2 });
        const Me = mol.add('C', c.x + dir.x * 1.53, c.y + dir.y * 1.53, c.z + 0.4, { h: 3, hyb: 3 });
        mol.link(c, Me, 1, 1.53);
      });
    }
    mol.meta.kind = 'crown';
    mol.meta.m = m;
    mol.hostFormulaHint = null;
    const hostSnap = null;
    void hostSnap;
    finish(mol, 18, 6);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    if (state.sandwich === '1' || state.sandwich === 1 || state.sandwich === true) {
      makeSandwich(mol, state.guest === 'Na' ? 2.45 : state.guest === 'Li' ? 2.15 : 2.75);
    }
    return mol;
  }

  function benzeneFromEdge(c1, c2, outward) {
    const e1 = norm(sub(c2, c1));
    let n = cross(e1, outward);
    if (len(n) < 1e-6) n = { x: 0, y: 0, z: 1 };
    n = norm(n);
    let e2 = norm(cross(n, e1));
    if (dot(e2, outward) < 0) e2 = mul(e2, -1);
    const L = 1.40;
    const mid = lerp(c1, c2, 0.5);
    const center = add(mid, mul(e2, L * Math.sqrt(3) / 2));
    const v1 = sub(c1, center);
    let ang = Math.atan2(dot(v1, e2), dot(v1, e1));
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = ang + k * Math.PI / 3;
      pts.push(add(center, add(mul(e1, L * Math.cos(a)), mul(e2, L * Math.sin(a)))));
    }
    if (dist(pts[1], c2) > dist(pts[5], c2)) {
      return [pts[4], pts[3], pts[2], pts[1]].slice(0, 4);
    }
    return [pts[2], pts[3], pts[4], pts[5]];
  }

  function makeSandwich(mol, target) {
    const donors = mol.atoms.filter(a => a.donor);
    const c = centroid(donors.length ? donors : mol.atoms);
    mol.atoms.forEach(a => { a.x -= c.x; a.y -= c.y; a.z -= c.z; });
    const d0 = donors[0] || mol.atoms[0];
    const radial = Math.hypot(d0.x, d0.y);
    let dz = Math.sqrt(Math.max(0.25, target * target - Math.min(radial * radial, target * target * 0.92)));
    dz = Math.max(1.7, dz);
    const n = mol.atoms.length;
    mol.atoms.forEach(a => { a.z -= dz; });
    const copies = mol.atoms.map(a => {
      const b = Object.assign({}, a, { z: a.z + 2 * dz, i: a.i + n, group: 1, role: 'host' });
      return b;
    });
    const bonds2 = mol.bonds.map(b => ({ i: b.i + n, j: b.j + n, order: b.order, r0: b.r0 }));
    copies.forEach(a => mol.atoms.push(a));
    bonds2.forEach(b => mol.bonds.push(b));
    mol.meta.sandwich = true;
  }

  function attachArm(mol, pivot, dir, length, donor) {
    let prev = pivot;
    let p = { x: pivot.x, y: pivot.y, z: pivot.z };
    const step = norm(dir);
    for (let k = 0; k < length; k++) {
      p = add(p, mul(step, 1.52));
      p = add(p, { x: 0, y: 0, z: (k % 2 === 0 ? 0.35 : -0.25) });
      const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, role: 'host' });
      mol.link(prev, c, 1, prev.el === 'N' || prev.el === 'O' || prev.el === 'S' ? defaultR(prev.el, 'C', 1) : 1.53);
      prev = c;
    }
    if (donor === 'OH') {
      p = add(p, mul(step, 1.43));
      const o = mol.add('O', p.x, p.y, p.z, { h: 1, hyb: 3, donor: true });
      mol.link(prev, o, 1, 1.43);
    } else if (donor === 'NH2') {
      p = add(p, mul(step, 1.47));
      const n = mol.add('N', p.x, p.y, p.z, { h: 2, hyb: 3, donor: true });
      mol.link(prev, n, 1, 1.47);
    } else if (donor === 'OMe') {
      p = add(p, mul(step, 1.43));
      const o = mol.add('O', p.x, p.y, p.z, { h: 0, hyb: 3, donor: true });
      mol.link(prev, o, 1, 1.43);
      const me = mol.add('C', o.x + step.x * 1.43, o.y + step.y * 1.43, o.z + 0.2, { h: 3, hyb: 3 });
      mol.link(o, me, 1, 1.43);
    } else if (donor === 'SMe') {
      p = add(p, mul(step, 1.81));
      const s = mol.add('S', p.x, p.y, p.z, { h: 0, donor: true });
      mol.link(prev, s, 1, 1.81);
      const me = mol.add('C', s.x + step.x * 1.81, s.y + step.y * 1.81, s.z, { h: 3 });
      mol.link(s, me, 1, 1.81);
    }
  }

  function buildLariat(state) {
    const base = Object.assign({}, state, { het: state.pivot === 'N' ? 'diaza' : (state.het || 'O'), sandwich: '0', ann: state.ann || '0' });
    if (state.pivot === 'N') base.het = 'diaza';
    const mol = buildCrown(base);
    /* buildCrown already added H and relaxed. Attach arm on heavy atom and add only new H. */
    const pivots = mol.atoms.filter(a => a.name && a.name[0] === 'D' && a.el !== 'H');
    let pivot = pivots[0];
    if (state.pivot === 'N') pivot = pivots.find(a => a.el === 'N') || pivot;
    else pivot = mol.atoms.find(a => a.name === 'C0a') || pivot;
    if (!pivot) return mol;
    if (state.pivot !== 'N' && pivot.el === 'C') {
      /* remove one H already present */
      stripOneH(mol, pivot);
    }
    if (state.pivot === 'N' && pivot.el === 'N') stripOneH(mol, pivot);
    const dir = norm(add(norm({ x: pivot.x, y: pivot.y, z: 0 }), { x: 0, y: 0, z: 0.45 }));
    dropMarked(mol);
    attachArm(mol, pivot, dir, clamp(state.arm | 0 || 2, 1, 4), state.donor || 'OMe');
    addHydrogens(mol);
    relax(mol, 12, 3);
    mol.meta.kind = 'lariat';
    mol.meta.hostFormula = formulaOf(mol.atoms.filter(a => a.role !== 'guest'));
    mol.name = 'lariat-' + (state.pivot === 'N' ? 'N' : 'C');
    return mol;
  }

  function stripOneH(mol, heavy) {
    const hs = mol.bonds.filter(b => {
      const o = b.i === heavy.i ? mol.atoms[b.j] : b.j === heavy.i ? mol.atoms[b.i] : null;
      return o && o.el === 'H';
    });
    if (!hs.length) return;
    const b = hs[0];
    const hi = b.i === heavy.i ? b.j : b.i;
    mol.bonds = mol.bonds.filter(x => x.i !== hi && x.j !== hi);
    mol.atoms[hi].el = 'X';
    mol.atoms[hi].role = 'drop';
    mol.atoms[hi].x = heavy.x;
    mol.atoms[hi].y = heavy.y;
    mol.atoms[hi].z = heavy.z;
  }

  function dropMarked(mol) {
    const keep = [];
    const map = new Map();
    mol.atoms.forEach(a => {
      if (a.role === 'drop' || a.el === 'X') return;
      map.set(a.i, keep.length);
      a.i = keep.length;
      keep.push(a);
    });
    mol.atoms = keep;
    mol.bonds = mol.bonds.filter(b => map.has(b.i) && map.has(b.j)).map(b => ({ i: map.get(b.i), j: map.get(b.j), order: b.order, r0: b.r0 }));
    mol.atoms.forEach((a, i) => { a.i = i; });
  }

  function buildPodand(state) {
    const mol = new Mol('podand');
    if (state.pod === 'tripod') {
      const n = clamp(state.podN | 0 || 2, 1, 3);
      const N = mol.add('N', 0, 0, 0, { h: 0, hyb: 3, donor: true, probe: 'hole' });
      const dirs = [
        norm({ x: 1, y: 1, z: 1 }),
        norm({ x: -1, y: 1, z: -0.3 }),
        norm({ x: 0.2, y: -1, z: 0.4 })
      ];
      for (let arm = 0; arm < 3; arm++) {
        let prev = N;
        let p = { x: 0, y: 0, z: 0 };
        const d = dirs[arm];
        const side = perp(d);
        for (let k = 0; k < n; k++) {
          p = add(p, mul(d, 1.50));
          p = add(p, mul(side, k % 2 === 0 ? 0.35 : -0.35));
          const c1 = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3 });
          mol.link(prev, c1, 1, prev === N ? 1.47 : 1.43);
          p = add(p, mul(d, 1.50));
          const c2 = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3 });
          mol.link(c1, c2, 1, 1.53);
          p = add(p, mul(d, 1.42));
          const o = mol.add('O', p.x, p.y, p.z, { h: 0, hyb: 3, donor: true, probe: 'hole' });
          mol.link(c2, o, 1, 1.43);
          prev = o;
        }
        const me = mol.add('C', p.x + d.x * 1.43, p.y + d.y * 1.43, p.z + d.z * 1.43, { h: 3 });
        mol.link(prev, me, 1, 1.43);
      }
      mol.meta.kind = 'podand';
      finish(mol, 20, 1.2);
      mol.meta.hostFormula = formulaOf(mol.atoms);
      return mol;
    }
    const n = clamp(state.podN | 0 || state.n | 0 || 4, 1, 7);
    let prev = mol.add('C', 0, 0, 0, { h: 3, hyb: 3, name: 'Me' });
    let p = { x: 0, y: 0, z: 0 };
    const tors = [180, 180, 65];
    for (let k = 0; k < n; k++) {
      const o = mol.add('O', 0, 0, 0, { h: 0, donor: true, probe: k === Math.floor(n / 2) ? 'hole' : false });
      const c1 = mol.add('C', 0, 0, 0, { h: 2 });
      const c2 = mol.add('C', 0, 0, 0, { h: 2 });
      const anchor = prev;
      const back = k === 0 ? { x: -1, y: 0.2, z: 0.1 } : mol.atoms[Math.max(0, anchor.i - 1)];
      o.x = fromInternal(anchor, back, { x: anchor.x, y: anchor.y + 1, z: anchor.z }, 1.43, 109.5, tors[k % 3]).x;
      const op = fromInternal(anchor, back.x != null && back.el ? back : { x: anchor.x - 1, y: anchor.y, z: anchor.z }, { x: anchor.x, y: anchor.y + 1, z: anchor.z }, 1.43, 112, 180);
      o.x = op.x; o.y = op.y; o.z = op.z;
      const p1 = fromInternal(o, anchor, back.el ? back : { x: anchor.x - 1, y: 0.3, z: 0 }, 1.43, 112, 180);
      c1.x = p1.x; c1.y = p1.y; c1.z = p1.z;
      const p2 = fromInternal(c1, o, anchor, 1.53, 109.5, 70 * (k % 2 === 0 ? 1 : -1));
      c2.x = p2.x; c2.y = p2.y; c2.z = p2.z;
      mol.link(anchor, o, 1, 1.43);
      mol.link(o, c1, 1, 1.43);
      mol.link(c1, c2, 1, 1.53);
      prev = c2;
      p = p2;
    }
    const endO = fromInternal(prev, mol.atoms[prev.i - 1], mol.atoms[Math.max(0, prev.i - 2)], 1.43, 109.5, 180);
    const o2 = mol.add('O', endO.x, endO.y, endO.z, { h: 0, donor: true });
    mol.link(prev, o2, 1, 1.43);
    const mep = fromInternal(o2, prev, mol.atoms[prev.i - 1], 1.43, 112, 180);
    const me = mol.add('C', mep.x, mep.y, mep.z, { h: 3 });
    mol.link(o2, me, 1, 1.43);
    mol.meta.kind = 'podand';
    finish(mol, 24, 0.6);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    mol.name = 'glyme-' + n;
    return mol;
  }

function parseCrypt(s) {
  const raw = String(s || '222');
  const parts = raw.indexOf('.') >= 0 ? raw.split('.') : raw.replace(/[^0-9]/g, '').split('');
  const out = parts.map(x => clamp(parseInt(x, 10) || 1, 1, 3)).filter(x => x >= 1).slice(0, 3);
  while (out.length < 3) out.push(out[out.length - 1] || 2);
  return out;
}
function buildCrypt(state) {
  const spec = parseCrypt(state.crypt || '222');
    const mol = new Mol('crypt-' + spec.join('.'));
const maxK = Math.max.apply(null, spec);
  const h = 1.25 + maxK * 0.78;
    const N1 = mol.add('N', 0, 0, h, { h: 0, hyb: 3, donor: true, name: 'N1' });
    const N2 = mol.add('N', 0, 0, -h, { h: 0, hyb: 3, donor: true, name: 'N2' });
    spec.forEach((k, bi) => {
      const ang = 2 * Math.PI * bi / 3;
      const nAtoms = 3 * k + 2;
      const bulge = 1.25 + k * 0.78;
      let prev = N1;
      const chain = [];
      for (let i = 1; i <= nAtoms; i++) {
        const t = i / (nAtoms + 1);
        const z = h * (1 - 2 * t);
        const radial = bulge * Math.sin(Math.PI * t);
        const pattern = [];
        for (let u = 0; u < k; u++) pattern.push('C', 'C', 'O');
        pattern.push('C', 'C');
        const el = pattern[i - 1];
        const atom = mol.add(el, radial * Math.cos(ang), radial * Math.sin(ang), z, {
          h: el === 'C' ? 2 : 0, hyb: 3, donor: el === 'O', probe: el === 'O' ? 'hole' : false, name: 'B' + bi + '_' + i
        });
        chain.push(atom);
        mol.link(prev, atom, 1, defaultR(prev.el, el, 1));
        prev = atom;
      }
      mol.link(prev, N2, 1, defaultR(prev.el, 'N', 1));
    });
    const iso = state.iso || 'in';
    if (iso === 'out' || iso === 'inout') invertBridgehead(mol, N1);
    if (iso === 'out') invertBridgehead(mol, N2);
    mol.meta.kind = 'crypt';
    mol.meta.crypt = spec.join('.');
    finish(mol, 30, 1.3);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }
  function invertBridgehead(mol, N) {
    const nbr = mol.bonds.filter(b => b.i === N.i || b.j === N.i).map(b => mol.atoms[b.i === N.i ? b.j : b.i]);
    if (nbr.length < 3) return;
    const c = centroid(nbr);
    N.x = 2 * c.x - N.x; N.y = 2 * c.y - N.y; N.z = 2 * c.z - N.z;
  }

  function buildSpherand(state) {
    const hemi = state.sph === 'hemi';
    const m = hemi ? 3 : 6;
    const mol = new Mol(hemi ? 'hemispherand' : 'spherand');
    const R0 = hemi ? 3.4 : 3.15;
    const units = [];
    for (let i = 0; i < m; i++) {
      const ang = 2 * Math.PI * i / (hemi ? 5.2 : m) - (hemi ? 0.55 : 0);
      const rad = radialAt(ang), tan = tangentAt(ang);
      const tilt = 0.55;
      const axisIn = norm(add(mul(rad, -Math.cos(tilt)), { x: 0, y: 0, z: (i % 2 === 0 ? 0.45 : -0.45) }));
      const origin = add(mul(rad, R0), { x: 0, y: 0, z: 0 });
      const pts = benzenePoints(origin, axisIn, tan, 1.40);
      const atoms = pts.map((p, k) => mol.add('C', p.x, p.y, p.z, {
        h: (k === 0 || k === 1 || k === 5) ? 0 : 1,
        hyb: 2,
        name: 'S' + i + k
      }));
      linkRing(mol, atoms, 1.39, 1);
      const inward = norm(sub(pts[0], origin));
      const O = mol.add('O', pts[0].x + inward.x * 1.36, pts[0].y + inward.y * 1.36, pts[0].z + inward.z * 1.36, { h: 0, donor: true, probe: 'hole', hyb: 3 });
      mol.link(atoms[0], O, 1, 1.36);
      const up = (i % 2 === 0 ? 0.7 : -0.7);
      const Me = mol.add('C', O.x + inward.x * 0.7, O.y + inward.y * 0.7, O.z + inward.z * 0.35 + up, { h: 3 });
      mol.link(O, Me, 1, 1.43);
      units.push({ atoms: atoms, rad: rad, tan: tan });
    }
    for (let i = 0; i < (hemi ? m - 1 : m); i++) {
      const a = units[i].atoms;
      const b = units[(i + 1) % m].atoms;
      const orthoA = dot(a[1], units[i].tan) > dot(a[5], units[i].tan) ? a[1] : a[5];
      const orthoB = dot(b[1], units[i].tan) > dot(b[5], units[i].tan) ? b[5] : b[1];
      mol.link(orthoA, orthoB, 1, 1.48);
      orthoA.h = 0; orthoB.h = 0;
    }
    if (hemi) {
      const a = units[0], b = units[m - 1];
      const endA = dot(a.atoms[1], a.tan) < dot(a.atoms[5], a.tan) ? a.atoms[1] : a.atoms[5];
      const endB = dot(b.atoms[1], b.tan) > dot(b.atoms[5], b.tan) ? b.atoms[1] : b.atoms[5];
      endA.h = 0; endB.h = 0;
      const chainEls = ['O', 'C', 'C', 'O', 'C', 'C', 'O'];
      let prev = endA;
      chainEls.forEach((el, k) => {
        const t = (k + 1) / (chainEls.length + 1);
        const p = lerp(endA, endB, t);
        p.z -= 1.3 * Math.sin(Math.PI * t);
        p.x *= 1.08; p.y *= 1.08;
        const atom = mol.add(el, p.x, p.y, p.z, { h: el === 'C' ? 2 : 0, donor: el === 'O', hyb: 3 });
        mol.link(prev, atom, 1, defaultR(prev.el, el, 1));
        prev = atom;
      });
      mol.link(prev, endB, 1, defaultR(prev.el, 'C', 1));
    }
    mol.meta.kind = 'spherand';
    finish(mol, 26, 2.4);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }

  function glycolurilTemplate() {
    return {
      Ca: { x: 0.78, y: 0.25, z: 0.05 },
      Cb: { x: -0.78, y: 0.25, z: -0.05 },
      N1: { x: 1.20, y: -0.05, z: 1.18 },
      N3: { x: -1.20, y: -0.05, z: 1.18 },
      N2: { x: 1.20, y: -0.05, z: -1.18 },
      N4: { x: -1.20, y: -0.05, z: -1.18 },
      Ct: { x: 0, y: -0.55, z: 1.92 },
      Ot: { x: 0, y: -1.15, z: 3.05 },
      Cu: { x: 0, y: -0.55, z: -1.92 },
      Ou: { x: 0, y: -1.15, z: -3.05 }
    };
  }
  function mapLocal(p, origin, ex, ey, ez) {
    return add(origin, add(mul(ex, p.x), add(mul(ey, p.y), mul(ez, p.z))));
  }

  function buildCB(state) {
    const n = clamp(state.n | 0 || 6, 5, 8);
    const mol = new Mol('CB' + n);
    const tmpl = glycolurilTemplate();
    const target = 2.48;
    let lo = 2.2, hi = 8.5, R = 4;
    for (let it = 0; it < 16; it++) {
      R = (lo + hi) / 2;
      const a1 = placeGly(tmpl, 0, n, R).N1;
      const a2 = placeGly(tmpl, 1, n, R).N3;
      const gap = Math.hypot(a1.x - a2.x, a1.y - a2.y, a1.z - a2.z);
      if (gap > target) hi = R; else lo = R;
    }
    const units = [];
    for (let i = 0; i < n; i++) {
      const g = placeGly(tmpl, i, n, R);
      const atoms = {};
      Object.keys(g).forEach(key => {
        const p = g[key];
        const el = key[0] === 'O' ? 'O' : key[0] === 'N' ? 'N' : 'C';
        const isCH = key === 'Ca' || key === 'Cb';
        const isCO = key === 'Ct' || key === 'Cu';
        atoms[key] = mol.add(el, p.x, p.y, p.z, {
          h: isCH ? 1 : 0,
          hyb: isCH ? 3 : 2,
          donor: el === 'O',
          probe: (key === 'Ot') ? 'hole' : false,
          name: key + i
        });
      });
      mol.link(atoms.Ca, atoms.Cb, 1, 1.54);
      mol.link(atoms.Ca, atoms.N1, 1, 1.46);
      mol.link(atoms.Ca, atoms.N2, 1, 1.46);
      mol.link(atoms.Cb, atoms.N3, 1, 1.46);
      mol.link(atoms.Cb, atoms.N4, 1, 1.46);
      mol.link(atoms.N1, atoms.Ct, 1, 1.37);
      mol.link(atoms.N3, atoms.Ct, 1, 1.37);
      mol.link(atoms.Ct, atoms.Ot, 2, 1.22);
      mol.link(atoms.N2, atoms.Cu, 1, 1.37);
      mol.link(atoms.N4, atoms.Cu, 1, 1.37);
      mol.link(atoms.Cu, atoms.Ou, 2, 1.22);
      units.push(atoms);
    }
    for (let i = 0; i < n; i++) {
      const a = units[i], b = units[(i + 1) % n];
      addMethylene(mol, a.N1, b.N3);
      addMethylene(mol, a.N2, b.N4);
    }
    mol.meta.kind = 'cb';
    mol.meta.n = n;
    finish(mol, 22, 2.8);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }
  function placeGly(tmpl, i, n, R) {
    const ang = 2 * Math.PI * i / n;
    const ex = tangentAt(ang), ey = radialAt(ang), ez = { x: 0, y: 0, z: 1 };
    const origin = mul(ey, R);
    const out = {};
    Object.keys(tmpl).forEach(k => { out[k] = mapLocal(tmpl[k], origin, ex, ey, ez); });
    return out;
  }
  function addMethylene(mol, n1, n2) {
    const p = bridgePoint(n1, n2, 1.47);
    const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, name: 'M' });
    mol.link(n1, c, 1, 1.47);
    mol.link(n2, c, 1, 1.47);
    return c;
  }

  function buildGlucoseLocal() {
    const atoms = [];
    const put = (name, el, pos, opt) => {
      const a = Object.assign({ name: name, el: el, x: pos.x, y: pos.y, z: pos.z, h: 0, hyb: 3 }, opt || {});
      atoms.push(a);
      return a;
    };
    const C1 = put('C1', 'C', { x: 0, y: 0, z: 0 }, { h: 1 });
    const C2 = put('C2', 'C', { x: 1.526, y: 0, z: 0 }, { h: 1 });
    const C3 = put('C3', 'C', fromInternal(C2, C1, { x: 1.526, y: 1, z: 0 }, 1.526, 110.5, 60), { h: 1 });
    const C4 = put('C4', 'C', fromInternal(C3, C2, C1, 1.526, 110.5, -60), { h: 1 });
    const C5 = put('C5', 'C', fromInternal(C4, C3, C2, 1.526, 110.5, 60), { h: 1 });
    const O5 = put('O5', 'O', fromInternal(C5, C4, C3, 1.42, 109.5, -60), { h: 0 });
    const bonds = [[C1, C2], [C2, C3], [C3, C4], [C4, C5], [C5, O5], [O5, C1]];
    const ring = [C1, C2, C3, C4, C5, O5];
    const c = centroid(ring);
    let normal = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < ring.length; i++) normal = add(normal, cross(sub(ring[i], c), sub(ring[(i + 1) % ring.length], c)));
    normal = norm(normal);
    function dirOf(atom, mode) {
      const nbs = bonds.filter(b => b[0] === atom || b[1] === atom).map(b => b[0] === atom ? b[1] : b[0]);
      let s = { x: 0, y: 0, z: 0 };
      nbs.forEach(q => { s = add(s, norm(sub(q, atom))); });
      const disp = dot(sub(atom, c), normal);
      const axial = mul(normal, disp >= 0 ? 1 : -1);
      if (mode === 'ax') return norm(axial);
      let eq = norm(mul(len(s) ? s : { x: 1, y: 0, z: 0 }, -1));
      eq = sub(eq, mul(normal, dot(eq, normal)));
      return norm(len(eq) < 1e-4 ? perp(normal) : eq);
    }
    function placeSub(atom, el, mode, dist0, opt) {
      const d = dirOf(atom, mode);
      return put(opt.name, el, add(atom, mul(d, dist0)), opt);
    }
    const Og = placeSub(C1, 'O', 'ax', 1.43, { name: 'Og', h: 0, donor: false });
    const O2 = placeSub(C2, 'O', 'eq', 1.43, { name: 'O2', h: 1 });
    const O3 = placeSub(C3, 'O', 'eq', 1.43, { name: 'O3', h: 1 });
    const C6 = placeSub(C5, 'C', 'eq', 1.53, { name: 'C6', h: 2 });
    const d6 = dirOf(C5, 'eq');
    const side = perp(d6);
    const O6 = put('O6', 'O', add(C6, add(mul(norm(add(d6, mul(side, 0.4))), 1.43), mul(normal, 0.15))), { h: 1 });
    return { atoms: atoms, bonds: bonds.concat([[C1, Og], [C2, O2], [C3, O3], [C5, C6], [C6, O6]]), normal: normal };
  }

  function rotatePoint(p, axis, ang) {
    const k = norm(axis);
    const co = Math.cos(ang), si = Math.sin(ang);
    const t = dot(k, p);
    const cr = cross(k, p);
    return {
      x: p.x * co + cr.x * si + k.x * t * (1 - co),
      y: p.y * co + cr.y * si + k.y * t * (1 - co),
      z: p.z * co + cr.z * si + k.z * t * (1 - co)
    };
  }
  function alignVec(v, target) {
    const a = norm(v), b = norm(target);
    const c = cross(a, b);
    const d = clamp(dot(a, b), -1, 1);
    if (len(c) < 1e-8) {
      if (d > 0) return p => ({ x: p.x, y: p.y, z: p.z });
      const ax = perp(a);
      return p => rotatePoint(p, ax, Math.PI);
    }
    const ang = Math.acos(d);
    return p => rotatePoint(p, c, ang);
  }

  function orientResidue(res) {
    const by = name => res.atoms.find(a => a.name === name);
    const ring = ['C1', 'C2', 'C3', 'C4', 'C5', 'O5'].map(by);
    const c = centroid(ring);
    res.atoms.forEach(a => { a.x -= c.x; a.y -= c.y; a.z -= c.z; });
    const C6 = by('C6'), C1 = by('C1'), C4 = by('C4');
    let f = alignVec(C6, { x: 0, y: 0, z: 1 });
    res.atoms.forEach(a => { const p = f(a); a.x = p.x; a.y = p.y; a.z = p.z; });
    const tang = sub(C1, C4);
    const xy = { x: tang.x, y: tang.y, z: 0 };
    if (len(xy) > 1e-4) {
      const ang = Math.atan2(xy.y, xy.x);
      res.atoms.forEach(a => {
        const p = rotatePoint(a, { x: 0, y: 0, z: 1 }, -ang);
        a.x = p.x; a.y = p.y; a.z = p.z;
      });
    }
    return res;
  }

  function buildCD(state) {
    const n = clamp(state.n | 0 || 7, 6, 8);
    const res0 = orientResidue(buildGlucoseLocal());
    const C1 = res0.atoms.find(a => a.name === 'C1');
    const C4 = res0.atoms.find(a => a.name === 'C4');
    const span = C1.x - C4.x;
    let lo = 2.5, hi = 9, R = 5;
    const tilt = 0.22;
    function placed(Rtry) {
      const ang = 2 * Math.PI / n;
      const p1 = placeResAtom(C1, 0, Rtry, tilt);
      const p4 = placeResAtom(C4, ang, Rtry, tilt);
      return dist(p1, p4);
    }
    for (let it = 0; it < 18; it++) {
      R = (lo + hi) / 2;
      if (placed(R) > 2.38) hi = R; else lo = R;
    }
    void span;
    const mol = new Mol('CD' + n);
    const copies = [];
    for (let i = 0; i < n; i++) {
      const map = {};
      res0.atoms.forEach(src => {
        const p = placeResAtom(src, 2 * Math.PI * i / n, R, tilt);
        const a = mol.add(src.el, p.x, p.y, p.z, {
          h: src.h, hyb: src.hyb || 3, name: src.name + i,
          probe: (src.name === 'C3' || src.name === 'C5') ? 'hole' : false,
          donor: src.name === 'O2' || src.name === 'O3' || src.name === 'O6'
        });
        map[src.name] = a;
      });
      res0.bonds.forEach(b => {
        const na = b[0].name, nb = b[1].name;
        if (na === 'Og' || nb === 'Og') return;
        mol.link(map[na], map[nb], 1, defaultR(map[na].el, map[nb].el, 1));
      });
      copies.push(map);
    }
    for (let i = 0; i < n; i++) {
      const Og = copies[i].Og;
      const C1i = copies[i].C1;
      const C4n = copies[(i + 1) % n].C4;
      const p = bridgePoint(C1i, C4n, 1.43);
      Og.x = p.x; Og.y = p.y; Og.z = p.z;
      mol.link(C1i, Og, 1, 1.43);
      mol.link(Og, C4n, 1, 1.43);
    }
    const mod = state.mod || 'OH';
    if (mod === 'Me' || mod === 'HP') {
      copies.forEach(map => {
        ['O2', 'O3', 'O6'].forEach(nm => {
          if (mod === 'HP' && nm === 'O3') return;
          const o = map[nm];
          o.h = 0;
          const dir = norm({ x: o.x, y: o.y, z: nm === 'O6' ? 1 : -0.3 });
          if (mod === 'Me') {
            const c = mol.add('C', o.x + dir.x * 1.43, o.y + dir.y * 1.43, o.z + dir.z * 1.43, { h: 3 });
            mol.link(o, c, 1, 1.43);
          } else {
            let prev = o;
            const seq = [{ el: 'C', h: 2 }, { el: 'C', h: 1 }, { el: 'C', h: 3 }, { el: 'O', h: 1 }];
            seq.forEach((s, k) => {
              const p2 = add(prev, mul(dir, 1.45 + k * 0.05));
              if (s.el === 'O') { p2.x += 0.8; p2.z += 0.4; }
              const a = mol.add(s.el, p2.x, p2.y, p2.z, { h: s.h, hyb: 3 });
              mol.link(prev, a, 1, defaultR(prev.el, s.el, 1));
              prev = a;
            });
            const branch = map[nm];
            void branch;
          }
        });
      });
    }
    mol.meta.kind = 'cd';
    mol.meta.n = n;
    finish(mol, 18, 3.2);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }
  function placeResAtom(src, ang, R, tilt) {
    const rad = radialAt(ang), tan = tangentAt(ang);
    let p = { x: src.x, y: src.y, z: src.z };
    p = rotatePoint(p, { x: 1, y: 0, z: 0 }, tilt);
    const ex = tan, ez = { x: -rad.x * Math.sin(tilt), y: -rad.y * Math.sin(tilt), z: Math.cos(tilt) };
    const ey = norm(cross(ez, ex));
    const origin = mul(rad, R);
    return mapLocal({ x: p.x, y: p.y, z: p.z }, origin, ex, ey, ez);
  }

  function buildCalix(state) {
    const allowed = [4, 5, 6, 8];
    let n = state.n | 0 || 4;
    if (allowed.indexOf(n) < 0) n = allowed.reduce((b, v) => Math.abs(v - n) < Math.abs(b - n) ? v : b, 4);
    const mol = new Mol('calix' + n);
    const conf = state.conf || 'cone';
    const flipped = new Set();
    if (n === 4 && conf === 'pcone') flipped.add(0);
    if (n === 4 && conf === '12alt') { flipped.add(0); flipped.add(1); }
    if (n === 4 && conf === '13alt') { flipped.add(0); flipped.add(2); }
    const tilt = 52 * Math.PI / 180;
    let lo = 2.2, hi = 8, R = 4;
    function gapAt(Rv) {
      const u0 = calixUnit(0, n, Rv, tilt, flipped.has(0));
      const u1 = calixUnit(1, n, Rv, tilt, flipped.has(1 % n));
      return dist(u0.plus, u1.minus);
    }
    for (let it = 0; it < 16; it++) {
      R = (lo + hi) / 2;
      if (gapAt(R) > 2.52) hi = R; else lo = R;
    }
    const units = [];
    for (let i = 0; i < n; i++) {
      const u = calixUnit(i, n, R, tilt, flipped.has(i));
      const atoms = u.pts.map((p, k) => mol.add('C', p.x, p.y, p.z, {
        h: (k === 2 || k === 4) ? 1 : 0,
        hyb: 2,
        name: 'A' + i + k,
        probe: k === 3 ? 'upper' : false
      }));
      linkRing(mol, atoms, 1.39, 1);
      const oDir = norm(sub(u.pts[0], u.origin));
      const O = mol.add('O', u.pts[0].x + oDir.x * 1.38, u.pts[0].y + oDir.y * 1.38, u.pts[0].z + oDir.z * 1.38, {
        h: 1, hyb: 3, donor: true, probe: 'hole', name: 'O' + i
      });
      mol.link(atoms[0], O, 1, 1.38);
      const upper = state.upper || 'tBu';
      const pDir = norm(sub(u.pts[3], u.origin));
      if (upper === 'tBu') {
        const q = mol.add('C', u.pts[3].x + pDir.x * 1.54, u.pts[3].y + pDir.y * 1.54, u.pts[3].z + pDir.z * 1.54, { h: 0, hyb: 3 });
        mol.link(atoms[3], q, 1, 1.54);
        const b = perp(pDir), c = norm(cross(pDir, b));
        for (let m = 0; m < 3; m++) {
          const phi = 2 * Math.PI * m / 3;
          const dir = norm(add(mul(pDir, 0.35), add(mul(b, Math.cos(phi)), mul(c, Math.sin(phi)))));
          const me = mol.add('C', q.x + dir.x * 1.53, q.y + dir.y * 1.53, q.z + dir.z * 1.53, { h: 3 });
          mol.link(q, me, 1, 1.53);
        }
      } else if (upper === 'SO3') {
        const S = mol.add('S', u.pts[3].x + pDir.x * 1.78, u.pts[3].y + pDir.y * 1.78, u.pts[3].z + pDir.z * 1.78, { h: 0, hyb: 3, formal: 0 });
        mol.link(atoms[3], S, 1, 1.78);
        const b = perp(pDir), c = norm(cross(pDir, b));
        for (let m = 0; m < 3; m++) {
          const phi = 2 * Math.PI * m / 3;
          const dir = norm(add(mul(pDir, 0.45), add(mul(b, Math.cos(phi)), mul(c, Math.sin(phi)))));
          const o = mol.add('O', S.x + dir.x * 1.46, S.y + dir.y * 1.46, S.z + dir.z * 1.46, { h: 0, formal: -0.33 });
          mol.link(S, o, m === 0 ? 2 : 1, 1.46);
        }
      } else {
        atoms[3].h = 1;
      }
      units.push({ atoms: atoms, O: O, plus: u.plus, minus: u.minus, tan: u.tan });
    }
    for (let i = 0; i < n; i++) {
      const left = pickTan(units[i], 1);
      const right = pickTan(units[(i + 1) % n], -1);
      const p = bridgePoint(left, right, 1.51);
      const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, name: 'BR' + i });
      mol.link(left, c, 1, 1.51);
      mol.link(right, c, 1, 1.51);
    }
    const lower = state.lower || 'OH';
    units.forEach(u => {
      if (lower === 'OH') return;
      u.O.h = 0;
      const d = norm(sub(u.O, u.atoms[0]));
      if (lower === 'OMe') {
        const c = mol.add('C', u.O.x + d.x * 1.43, u.O.y + d.y * 1.43, u.O.z + d.z * 1.43, { h: 3 });
        mol.link(u.O, c, 1, 1.43);
      } else if (lower === 'OPr') {
        let prev = u.O;
        for (let k = 0; k < 3; k++) {
          const c = mol.add('C', prev.x + d.x * 1.5 + (k === 1 ? 0.3 : 0), prev.y + d.y * 1.5, prev.z + d.z * 1.5 - k * 0.15, { h: k === 2 ? 3 : 2 });
          mol.link(prev, c, 1, 1.43 + (k ? 0.1 : 0));
          prev = c;
        }
      }
    });
    if (lower === 'crown' && n === 4) {
      units[0].O.h = 0; units[2].O.h = 0;
      const els = ['C', 'C', 'O', 'C', 'C', 'O', 'C', 'C'];
      let prev = units[0].O;
      els.forEach((el, k) => {
        const t = (k + 1) / (els.length + 1);
        const p = lerp(units[0].O, units[2].O, t);
        p.z -= 1.55 * Math.sin(Math.PI * t);
        const a = mol.add(el, p.x, p.y, p.z, { h: el === 'C' ? 2 : 0, donor: el === 'O' });
        mol.link(prev, a, 1, defaultR(prev.el, el, 1));
        prev = a;
      });
      mol.link(prev, units[2].O, 1, 1.43);
    }
    mol.meta.kind = 'calix';
    mol.meta.n = n;
    finish(mol, 16, 3.5);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }
  function calixUnit(i, n, R, tilt, flip) {
    const ang = 2 * Math.PI * i / n;
    const rad = radialAt(ang), tan = tangentAt(ang);
    const t = flip ? -tilt : tilt;
    const lower = norm(add(mul(rad, -Math.sin(t)), { x: 0, y: 0, z: -Math.cos(t) }));
    const origin = mul(rad, R);
    const pts = benzenePoints(origin, lower, tan, 1.395);
    let plus = pts[1], minus = pts[5];
    if (dot(pts[1], tan) < dot(pts[5], tan)) { plus = pts[5]; minus = pts[1]; }
    return { pts: pts, origin: origin, plus: plus, minus: minus, tan: tan };
  }
  function pickTan(unit, sign) {
    const a = unit.atoms[1], b = unit.atoms[5];
    const da = dot(a, unit.tan), db = dot(b, unit.tan);
    return sign > 0 ? (da >= db ? a : b) : (da <= db ? a : b);
  }

  function buildPillar(state) {
    const n = clamp(state.n | 0 || 5, 5, 6);
    const mol = new Mol('pillar' + n);
    const chi = state.chir === 'm' ? -1 : 1;
    const twist = chi * 20 * Math.PI / 180;
    let lo = 2.8, hi = 8, R = 4.2;
    function gapAt(Rv) {
      const u0 = pillarUnit(0, n, Rv, twist);
      const u1 = pillarUnit(1, n, Rv, twist);
      return dist(u0.plus, u1.minus);
    }
    for (let it = 0; it < 16; it++) {
      R = (lo + hi) / 2;
      if (gapAt(R) > 2.55) hi = R; else lo = R;
    }
    const units = [];
    for (let i = 0; i < n; i++) {
      const u = pillarUnit(i, n, R, twist);
      const atoms = u.pts.map((p, k) => mol.add('C', p.x, p.y, p.z, {
        h: (k === 2 || k === 5) ? 1 : 0, hyb: 2, name: 'P' + i + k
      }));
      linkRing(mol, atoms, 1.39, 1);
      [0, 3].forEach(k => {
        const dir = norm(sub(u.pts[k], u.origin));
        const O = mol.add('O', u.pts[k].x + dir.x * 1.37, u.pts[k].y + dir.y * 1.37, u.pts[k].z + dir.z * 1.37, { h: 0, donor: true, hyb: 3 });
        mol.link(atoms[k], O, 1, 1.37);
        const lenM = state.rim === 'OEt' ? 2 : 1;
        let prev = O;
        for (let m = 0; m < lenM; m++) {
          const c = mol.add('C', prev.x + dir.x * 1.43, prev.y + dir.y * 1.43, prev.z + dir.z * 1.43, { h: m === lenM - 1 ? 3 : 2 });
          mol.link(prev, c, 1, 1.43);
          prev = c;
        }
      });
      units.push({ atoms: atoms, tan: u.tan });
    }
    for (let i = 0; i < n; i++) {
      const left = pickTan(units[i], 1);
      const right = pickTan(units[(i + 1) % n], -1);
      const p = bridgePoint(left, right, 1.51);
      const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3 });
      mol.link(left, c, 1, 1.51);
      mol.link(right, c, 1, 1.51);
    }
    units.forEach(u => {
      let best = u.atoms[0], br = 1e9;
      u.atoms.forEach(a => { const r = Math.hypot(a.x, a.y); if (r < br) { br = r; best = a; } });
      best.probe = 'hole';
    });
    mol.meta.kind = 'pillar';
    mol.meta.n = n;
    finish(mol, 14, 3.2);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }
  function pillarUnit(i, n, R, twist) {
    const ang = 2 * Math.PI * i / n;
    const rad = radialAt(ang), tan = tangentAt(ang);
    const up = { x: 0, y: 0, z: 1 };
    const eUp = norm(add(mul(up, Math.cos(twist)), mul(tan, Math.sin(twist))));
    const eTan = norm(add(mul(tan, Math.cos(twist)), mul(up, -Math.sin(twist))));
    const origin = mul(rad, R);
    const pts = benzenePoints(origin, eUp, eTan, 1.395);
    return { pts: pts, origin: origin, plus: pts[1], minus: pts[4], tan: tan };
  }

  function buildAza(state) {
    const kind = state.aza || 'cyclen';
    if (kind === 'cyclam') return buildCyclam();
    return buildCyclen();
  }
  function buildCyclen() {
    const mol = new Mol('cyclen');
    const R = 2.15;
    const Ns = [];
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 4 + i * Math.PI / 2;
      const z = i % 2 ? 0.25 : -0.25;
      Ns.push(mol.add('N', R * Math.cos(ang), R * Math.sin(ang), z, { h: 1, donor: true, probe: 'hole', hyb: 3 }));
    }
    for (let i = 0; i < 4; i++) {
      const a = Ns[i], b = Ns[(i + 1) % 4];
      const mid = lerp(a, b, 0.5);
      const out = norm({ x: mid.x, y: mid.y, z: 0 });
      const c1 = mol.add('C', lerp(a, b, 0.35).x + out.x * 0.25, lerp(a, b, 0.35).y + out.y * 0.25, (a.z + b.z) / 2 + 0.45, { h: 2 });
      const c2 = mol.add('C', lerp(a, b, 0.65).x + out.x * 0.25, lerp(a, b, 0.65).y + out.y * 0.25, (a.z + b.z) / 2 - 0.45, { h: 2 });
      mol.link(a, c1, 1, 1.47); mol.link(c1, c2, 1, 1.53); mol.link(c2, b, 1, 1.47);
    }
    mol.meta.kind = 'aza';
    finish(mol, 24, 1.8);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }
  function buildCyclam() {
    const mol = new Mol('cyclam');
    const seq = [2, 3, 2, 3];
    const Ns = [];
    for (let i = 0; i < 4; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 2;
      const R = i % 2 ? 2.15 : 2.45;
      Ns.push(mol.add('N', R * Math.cos(ang), R * Math.sin(ang) * 0.85, (i % 2 ? 0.2 : -0.2), { h: 1, donor: true, probe: 'hole' }));
    }
    for (let i = 0; i < 4; i++) {
      const a = Ns[i], b = Ns[(i + 1) % 4];
      const k = seq[i];
      let prev = a;
      for (let t = 1; t <= k; t++) {
        const p = lerp(a, b, t / (k + 1));
        p.z += (t % 2 === 0 ? 0.45 : -0.35);
        p.x *= 1.06; p.y *= 1.06;
        const c = mol.add('C', p.x, p.y, p.z, { h: 2 });
        mol.link(prev, c, 1, prev.el === 'N' ? 1.47 : 1.53);
        prev = c;
      }
      mol.link(prev, b, 1, 1.47);
    }
    mol.meta.kind = 'aza';
    finish(mol, 22, 1.6);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }

  function buildPorphyrin(state) {
    const mol = new Mol('porphin');
    const metal = state.metal || 'none';
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2;
      const rad = radialAt(ang), tan = tangentAt(ang);
      const N = mol.add('N', rad.x * 2.05, rad.y * 2.05, (i % 2 ? 0.05 : -0.05), {
        h: metal === 'none' && i % 2 === 0 ? 1 : 0, hyb: 2, donor: true, probe: 'hole', name: 'N' + i
      });
      const ca1 = mol.add('C', rad.x * 2.85 + tan.x * 1.15, rad.y * 2.85 + tan.y * 1.15, 0.1, { h: 0, hyb: 2 });
      const ca2 = mol.add('C', rad.x * 2.85 - tan.x * 1.15, rad.y * 2.85 - tan.y * 1.15, -0.1, { h: 0, hyb: 2 });
      const cb1 = mol.add('C', rad.x * 4.15 + tan.x * 0.72, rad.y * 4.15 + tan.y * 0.72, 0.12, { h: 1, hyb: 2 });
      const cb2 = mol.add('C', rad.x * 4.15 - tan.x * 0.72, rad.y * 4.15 - tan.y * 0.72, -0.12, { h: 1, hyb: 2 });
      mol.link(N, ca1, 1, 1.37); mol.link(N, ca2, 1, 1.37);
      mol.link(ca1, cb1, 1, 1.40); mol.link(ca2, cb2, 1, 1.40); mol.link(cb1, cb2, 1, 1.36);
      N._ca1 = ca1; N._ca2 = ca2;
    }
    const Ns = mol.atoms.filter(a => a.name && a.name[0] === 'N' && a.el === 'N');
    for (let i = 0; i < 4; i++) {
      const a = Ns[i], b = Ns[(i + 1) % 4];
      const p = lerp(a._ca1, b._ca2, 0.5);
      const meso = mol.add('C', p.x * 1.02, p.y * 1.02, p.z, { h: 1, hyb: 2 });
      mol.link(a._ca1, meso, 1, 1.40);
      mol.link(meso, b._ca2, 1, 1.40);
    }
    if (metal && metal !== 'none') {
      const ion = mol.add(metal, 0, 0, 0, { h: 0, ion: true, formal: 2, role: 'guest', probe: false, freeze: true });
      mol.meta.builtInGuest = true;
      void ion;
    }
    mol.meta.kind = 'porphin';
    finish(mol, 18, 3);
    mol.meta.hostFormula = formulaOf(mol.atoms.filter(a => !a.ion));
    return mol;
  }

  function buildBlueBox() {
    const mol = new Mol('CBPQT');
    function pyr(origin, xAx, yAx) {
      const pts = benzenePoints(origin, xAx, yAx, 1.38);
      const atoms = pts.map((p, k) => mol.add(k === 0 ? 'N' : 'C', p.x, p.y, p.z, {
        h: (k === 0 || k === 3) ? 0 : 1, hyb: 2, formal: k === 0 ? 1 : 0
      }));
      linkRing(mol, atoms, 1.38, 1);
      return { atoms: atoms, N: atoms[0], para: atoms[3] };
    }
    const dx = 3.4;
    const left1 = pyr({ x: -dx, y: -1.4, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 });
    const left2 = pyr({ x: -dx, y: 1.4, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    mol.link(left1.para, left2.para, 1, 1.48);
    const right1 = pyr({ x: dx, y: -1.4, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 });
    const right2 = pyr({ x: dx, y: 1.4, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    mol.link(right1.para, right2.para, 1, 1.48);
    function side(y, nL, nR) {
      const origin = { x: 0, y: y, z: 0 };
      const pts = benzenePoints(origin, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1.40);
      const atoms = pts.map((p, k) => mol.add('C', p.x, p.y, p.z, { h: (k === 0 || k === 3) ? 0 : 1, hyb: 2 }));
      linkRing(mol, atoms, 1.39, 1);
      const cL = bridgePoint(atoms[0], nL, 1.50);
      const cR = bridgePoint(atoms[3], nR, 1.50);
      const L = mol.add('C', cL.x, cL.y, cL.z, { h: 2, hyb: 3 });
      const R = mol.add('C', cR.x, cR.y, cR.z, { h: 2, hyb: 3 });
      mol.link(atoms[0], L, 1, 1.51); mol.link(L, nL, 1, 1.47);
      mol.link(atoms[3], R, 1, 1.51); mol.link(R, nR, 1, 1.47);
    }
    side(3.55, left2.N, right2.N);
    side(-3.55, left1.N, right1.N);
    mol.meta.kind = 'bluebox';
    finish(mol, 20, 2.2);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }

  function buildCTV() {
    const mol = new Mol('CTV');
    const n = 3, R = 3.15, tilt = 48 * Math.PI / 180;
    const units = [];
    for (let i = 0; i < n; i++) {
      const ang = 2 * Math.PI * i / n;
      const rad = radialAt(ang), tan = tangentAt(ang);
      const lower = norm(add(mul(rad, -Math.sin(tilt)), { x: 0, y: 0, z: -Math.cos(tilt) }));
      const origin = mul(rad, R);
      const pts = benzenePoints(origin, lower, tan, 1.40);
      const atoms = pts.map((p, k) => mol.add('C', p.x, p.y, p.z, { h: (k === 0 || k === 4) ? 1 : 0, hyb: 2 }));
      linkRing(mol, atoms, 1.39, 1);
      [2, 3].forEach(k => {
        const dir = norm(sub(pts[k], origin));
        const O = mol.add('O', pts[k].x + dir.x * 1.37, pts[k].y + dir.y * 1.37, pts[k].z + dir.z * 1.37, { h: 0 });
        mol.link(atoms[k], O, 1, 1.37);
        const me = mol.add('C', O.x + dir.x * 1.43, O.y + dir.y * 1.43, O.z + dir.z * 1.43 + 0.25, { h: 3 });
        mol.link(O, me, 1, 1.43);
      });
      units.push({ atoms: atoms, tan: tan });
    }
    for (let i = 0; i < n; i++) {
      const left = pickTan(units[i], 1);
      const right = pickTan(units[(i + 1) % n], -1);
      const p = bridgePoint(left, right, 1.51);
      const c = mol.add('C', p.x, p.y, p.z - 0.2, { h: 2 });
      mol.link(left, c, 1, 1.51); mol.link(right, c, 1, 1.51);
    }
    mol.meta.kind = 'ctv';
    finish(mol, 12, 3.5);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }

  function buildResorcinarene(cavitand) {
    const mol = new Mol(cavitand ? 'cavitand' : 'resorcinarene');
    const n = 4, R = 3.5, tilt = 50 * Math.PI / 180;
    const units = [];
    for (let i = 0; i < n; i++) {
      const ang = 2 * Math.PI * i / n + Math.PI / n;
      const rad = radialAt(ang), tan = tangentAt(ang);
      const lower = norm(add(mul(rad, -Math.sin(tilt)), { x: 0, y: 0, z: -Math.cos(tilt) }));
      const origin = mul(rad, R);
      const pts = benzenePoints(origin, lower, tan, 1.395);
      const atoms = pts.map((p, k) => mol.add('C', p.x, p.y, p.z, { h: (k === 0 || k === 3) ? 1 : 0, hyb: 2 }));
      linkRing(mol, atoms, 1.39, 1);
      const oxy = {};
      [2, 4].forEach(idx => {
        const dir = norm(sub(pts[idx], origin));
        const O = mol.add('O', pts[idx].x + dir.x * 1.36, pts[idx].y + dir.y * 1.36, pts[idx].z + dir.z * 1.36, { h: cavitand ? 0 : 1, donor: true, name: 'RO' + i + idx });
        mol.link(atoms[idx], O, 1, 1.36);
        oxy[idx] = O;
      });
      const bPlus = dot(atoms[1], tan) >= dot(atoms[5], tan) ? atoms[1] : atoms[5];
      const bMinus = bPlus === atoms[1] ? atoms[5] : atoms[1];
      units.push({ atoms: atoms, tan: tan, plus: bPlus, minus: bMinus, oPlus: dot(oxy[2], tan) >= dot(oxy[4], tan) ? oxy[2] : oxy[4], oMinus: dot(oxy[2], tan) >= dot(oxy[4], tan) ? oxy[4] : oxy[2] });
    }
    for (let i = 0; i < n; i++) {
      const left = units[i].plus;
      const right = units[(i + 1) % n].minus;
      const p = bridgePoint(left, right, 1.52);
      p.z -= 0.35;
      const c = mol.add('C', p.x, p.y, p.z, { h: 1, hyb: 3 });
      mol.link(left, c, 1, 1.51); mol.link(right, c, 1, 1.51);
      const d = norm({ x: p.x, y: p.y, z: -0.4 });
      const me = mol.add('C', c.x + d.x * 1.53, c.y + d.y * 1.53, c.z + d.z * 1.53, { h: 3 });
      mol.link(c, me, 1, 1.53);
    }
    if (cavitand) {
      for (let i = 0; i < n; i++) {
        const o1 = units[i].oPlus, o2 = units[(i + 1) % n].oMinus;
        const p = bridgePoint(o1, o2, 1.42); p.z += 0.35;
        const c = mol.add('C', p.x, p.y, p.z, { h: 2 });
        mol.link(o1, c, 1, 1.42); mol.link(c, o2, 1, 1.42);
      }
    }
    mol.meta.kind = cavitand ? 'cavitand' : 'resorcin';
    finish(mol, cavitand ? 24 : 14, cavitand ? 1.4 : 3.2);
    mol.meta.hostFormula = formulaOf(mol.atoms);
    return mol;
  }

  function ringCarbons(mol, radius, n, center, ex, ey, group) {
    const atoms = [];
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n;
      const p = add(center, add(mul(ex, radius * Math.cos(a)), mul(ey, radius * Math.sin(a))));
      atoms.push(mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, group: group, role: 'host' }));
    }
    for (let i = 0; i < n; i++) mol.link(atoms[i], atoms[(i + 1) % n], 1, 1.53);
    return atoms;
  }
  function chainFromAtom(mol, start, to) {
    const d = dist(start, to);
    const n = Math.max(2, Math.round(d / 1.53));
    let prev = start;
    const atoms = [];
    for (let i = 1; i <= n; i++) {
      const p = lerp(start, to, i / n);
      const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, group: start.group, role: 'host' });
      mol.link(prev, c, 1, 1.53);
      prev = c;
      atoms.push(c);
    }
    return atoms;
  }
  function chainAlong(mol, from, to, group) {
    const d = dist(from, to);
    const n = Math.max(1, Math.round(d / 1.53));
    let prev = null;
    const atoms = [];
    for (let i = 0; i <= n; i++) {
      const p = lerp(from, to, i / n);
      const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, group: group });
      if (prev) mol.link(prev, c, 1, 1.53);
      prev = c;
      atoms.push(c);
    }
    return atoms;
  }

  function addAdamantane(mol, origin, axis, group, mode) {
    const s = 1.54 / Math.sqrt(3);
    let bh = [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]].map(p => ({ x: p[0], y: p[1], z: p[2] }));
    const f = alignVec({ x: s, y: s, z: s }, axis || { x: 0, y: 0, z: 1 });
    bh = bh.map(p => add(origin, f(p)));
    const B = bh.map((p, i) => mol.add('C', p.x, p.y, p.z, { h: i === 0 && mode ? 0 : 1, hyb: 3, group: group, role: group === 0 ? 'host' : 'guest' }));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const mid = lerp(B[i], B[j], 0.5);
      const out = norm(sub(mid, origin));
      const half = dist(B[i], B[j]) / 2;
      const h = Math.sqrt(Math.max(0.05, 1.54 * 1.54 - half * half));
      const p = add(mid, mul(out, h));
      const c = mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, group: group, role: B[0].role });
      mol.link(B[i], c, 1, 1.54); mol.link(c, B[j], 1, 1.54);
    }
    return B[0];
  }

  function buildTopo(state) {
    const kind = state.topo || 'cat2';
    const mol = new Mol(kind);
    if (kind === 'cat2' || kind === 'cat3') {
      const R = 3.7, n = 24;
      ringCarbons(mol, R, n, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0);
      if (kind === 'cat2') {
        ringCarbons(mol, R, n, { x: 2.3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1);
      } else {
        ringCarbons(mol, 3.5, 22, { x: -5.4, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 1);
        ringCarbons(mol, 3.5, 22, { x: 5.4, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 2);
      }
    } else if (kind === 'rot' || kind === 'pseudo') {
      ringCarbons(mol, 3.6, 22, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 0);
      const axle = chainAlong(mol, { x: -5.2, y: 0.3, z: 0 }, { x: 5.2, y: 0.3, z: 0 }, 1);
      axle.forEach(a => { a.role = 'guest'; });
      if (kind === 'rot') {
        addAdamantane(mol, { x: -7.3, y: 0.3, z: 0 }, { x: 1, y: 0, z: 0 }, 1, 'link');
        const head = mol.atoms.filter(a => a.group === 1 && a.h === 0 && a.el === 'C').slice(-1)[0];
        if (head && axle[0]) mol.link(axle[0], head, 1, 1.54);
        addAdamantane(mol, { x: 7.3, y: 0.3, z: 0 }, { x: -1, y: 0, z: 0 }, 1, 'link');
        const heads = mol.atoms.filter(a => a.group === 1 && a.el === 'C' && a.h === 0);
        const last = heads[heads.length - 1];
        if (last) mol.link(axle[axle.length - 1], last, 1, 1.54);
      } else {
        axle[0].h = 3; axle[axle.length - 1].h = 3;
      }
    } else if (kind === 'daisy') {
      const ringA = ringCarbons(mol, 3.5, 22, { x: -4.2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 0);
      const ringB = ringCarbons(mol, 3.5, 22, { x: 4.2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 1);
      const attA = ringA.reduce((b, a) => a.z > b.z ? a : b);
      const attB = ringB.reduce((b, a) => a.z < b.z ? a : b);
      attA.h = 1; attB.h = 1;
      const armA = chainFromAtom(mol, attA, { x: 8.4, y: 0.4, z: 0.2 });
      const armB = chainFromAtom(mol, attB, { x: -8.4, y: -0.4, z: -0.2 });
      const headA = addAdamantane(mol, { x: 10.1, y: 0.4, z: 0.2 }, { x: -1, y: 0, z: 0 }, 0, 'link');
      const headB = addAdamantane(mol, { x: -10.1, y: -0.4, z: -0.2 }, { x: 1, y: 0, z: 0 }, 1, 'link');
      mol.link(armA[armA.length - 1], headA, 1, 1.54);
      mol.link(armB[armB.length - 1], headB, 1, 1.54);
      mol.atoms.forEach(a => { a.role = 'host'; });
    } else {
      const fn = kind === 'trefoil' ? trefoilPoint
        : kind === 'penta' ? pentaPoint
        : kind === 'solomon' ? null
        : kind === 'borro' ? null
        : trefoilPoint;
      if (kind === 'solomon') {
        addCurve(mol, t => solomonPoint(0, t), 0);
        addCurve(mol, t => solomonPoint(1, t), 1);
      } else if (kind === 'borro') {
        for (let k = 0; k < 3; k++) addCurve(mol, t => borromeanPoint(k, t), k);
      } else addCurve(mol, fn, 0);
    }
    mol.meta.kind = 'topo';
    mol.meta.topo = kind;
    finish(mol, kind === 'cat2' || kind === 'cat3' || kind === 'rot' || kind === 'pseudo' || kind === 'daisy' ? 10 : 0, 8);
    mol.meta.hostFormula = formulaOf(mol.atoms.filter(a => a.role !== 'guest'));
    return mol;
  }
  function addCurve(mol, fn, group) {
    const pts = resampleLoop(fn, 1.53);
    const atoms = pts.map(p => mol.add('C', p.x, p.y, p.z, { h: 2, hyb: 3, group: group }));
    for (let i = 0; i < atoms.length; i++) mol.link(atoms[i], atoms[(i + 1) % atoms.length], 1, 1.53);
  }
  function resampleLoop(fn, step) {
    const N = 900;
    const raw = [];
    for (let i = 0; i <= N; i++) raw.push(fn(2 * Math.PI * i / N));
    const acc = [0];
    for (let i = 1; i < raw.length; i++) acc.push(acc[i - 1] + dist(raw[i], raw[i - 1]));
    const total = acc[acc.length - 1];
    const n = Math.max(18, Math.round(total / step));
    const pts = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const want = (k * total) / n;
      while (j < acc.length - 2 && acc[j + 1] < want) j++;
      const span = (acc[j + 1] - acc[j]) || 1;
      pts.push(lerp(raw[j], raw[Math.min(raw.length - 1, j + 1)], clamp((want - acc[j]) / span, 0, 1)));
    }
    return pts;
  }
  function trefoilPoint(t) {
    return mul({ x: Math.sin(t) + 2 * Math.sin(2 * t), y: Math.cos(t) - 2 * Math.cos(2 * t), z: -Math.sin(3 * t) }, 1.05);
  }
  function pentaPoint(t) {
    const R = 3.1, r = 1.35, p = 5, q = 2;
    return {
      x: (R + r * Math.cos(q * t)) * Math.cos(p * t),
      y: (R + r * Math.cos(q * t)) * Math.sin(p * t),
      z: 1.35 * r * Math.sin(q * t)
    };
  }
  function solomonPoint(c, t) {
    const R = 3.3, r = 1.15;
    const tt = t;
    const x = (R + r * Math.cos(2 * tt)) * Math.cos(tt + c * Math.PI);
    const y = (R + r * Math.cos(2 * tt)) * Math.sin(tt + c * Math.PI);
    const z = r * Math.sin(2 * tt) * (c === 0 ? 1 : 1) + (c === 0 ? 0 : 0);
    return { x: x, y: y, z: z * (c === 1 ? -1 : 1) };
  }
  function borromeanPoint(k, t) {
    const a = 3.6, b = 1.35;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    const z = 0.95 * Math.sin(2 * t);
    const rot = k * 2 * Math.PI / 3 + 0.15 * k;
    return { x: x * Math.cos(rot) - y * Math.sin(rot), y: x * Math.sin(rot) + y * Math.cos(rot), z: z };
  }

  function buildGuest(id) {
    const mol = new Mol(id || 'guest');
    if (!id || id === 'none') return mol;
    if (METAL[id] && id !== 'Fe' && id !== 'Cu' && id !== 'Zn' && id !== 'Ni') {
      mol.add(id, 0, 0, 0, { h: 0, ion: true, formal: METAL[id], role: 'guest', freeze: true });
      return mol;
    }
    if (id === 'NH4') {
      const N = mol.add('N', 0, 0, 0, { h: 0, formal: 1, role: 'guest', hyb: 3 });
      const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      dirs.forEach(d => {
        const v = norm({ x: d[0], y: d[1], z: d[2] });
        const h = mol.add('H', v.x * 1.02, v.y * 1.02, v.z * 1.02, { role: 'guest' });
        mol.link(N, h, 1, 1.02);
      });
      return mol;
    }
    if (id === 'I2') {
      const a = mol.add('I', 0, 0, -1.335, { role: 'guest' });
      const b = mol.add('I', 0, 0, 1.335, { role: 'guest' });
      mol.link(a, b, 1, 2.67);
      return mol;
    }
    if (id === 'BrBu') {
      let prev = mol.add('Br', 0, 0, -3.2, { role: 'guest' });
      for (let k = 0; k < 4; k++) {
        const c = mol.add('C', 0, (k % 2 ? 0.25 : -0.15), -1.7 + k * 1.53, { h: 2, role: 'guest' });
        mol.link(prev, c, 1, prev.el === 'Br' ? 1.94 : 1.53);
        prev = c;
      }
      const br = mol.add('Br', prev.x, prev.y, prev.z + 1.94, { role: 'guest' });
      mol.link(prev, br, 1, 1.94);
      addHydrogens(mol);
      return mol;
    }
    if (id === 'Fc') {
      for (let ring = 0; ring < 2; ring++) {
        const z = ring ? 1.66 : -1.66;
        const twist = ring ? Math.PI / 5 : 0;
        const cs = [];
        for (let k = 0; k < 5; k++) {
          const a = twist + k * 2 * Math.PI / 5;
          cs.push(mol.add('C', 1.21 * Math.cos(a), 1.21 * Math.sin(a), z, { h: 1, hyb: 2, role: 'guest' }));
        }
        for (let k = 0; k < 5; k++) mol.link(cs[k], cs[(k + 1) % 5], 1, 1.42);
      }
      mol.add('Fe', 0, 0, 0, { ion: true, formal: 0, role: 'guest', freeze: true });
      addHydrogens(mol);
      return mol;
    }
    if (id === 'naph') {
      const a = benzenePoints({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1.40);
      const A = a.map((p, k) => mol.add('C', p.x, p.y, p.z, { h: (k === 0 || k === 1) ? 0 : 1, hyb: 2, role: 'guest' }));
      linkRing(mol, A, 1.39, 1);
      const extra = benzeneFromEdge(A[0], A[1], { x: 0, y: -1, z: 0 });
      const B = extra.map(p => mol.add('C', p.x, p.y, p.z, { h: 1, hyb: 2, role: 'guest' }));
      mol.link(A[1], B[0], 1, 1.40);
      for (let k = 0; k < B.length - 1; k++) mol.link(B[k], B[k + 1], 1, 1.39);
      mol.link(B[B.length - 1], A[0], 1, 1.40);
      addHydrogens(mol);
      return mol;
    }
    if (id === 'MV' || id === 'MV2') {
      function ring(zC, nAt) {
        const pts = benzenePoints({ x: 0, y: 0, z: zC }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, 1.38);
        const atoms = pts.map((p, k) => mol.add(k === nAt ? 'N' : 'C', p.x, p.y, p.z, {
          h: (k === nAt || k === (nAt + 3) % 6) ? 0 : 1, hyb: 2, role: 'guest', formal: k === nAt ? 1 : 0
        }));
        linkRing(mol, atoms, 1.38, 1);
        return atoms;
      }
      const A = ring(-2.12, 3);
      const B = ring(2.12, 0);
      mol.link(A[0], B[3], 1, 1.48);
      const m1 = mol.add('C', A[3].x, A[3].y, A[3].z - 1.47, { h: 3, role: 'guest' });
      const m2 = mol.add('C', B[0].x, B[0].y, B[0].z + 1.47, { h: 3, role: 'guest' });
      mol.link(A[3], m1, 1, 1.47); mol.link(B[0], m2, 1, 1.47);
      addHydrogens(mol);
      return mol;
    }
    if (id === 'azo' || id === 'azoCis') {
      const cis = id === 'azoCis';
      const N1 = mol.add('N', 0, 0, -0.62, { h: 0, hyb: 2, role: 'guest' });
      const N2 = mol.add('N', 0, 0, 0.62, { h: 0, hyb: 2, role: 'guest' });
      mol.link(N1, N2, 2, 1.25);
      function phenyl(anchor, other, sign) {
        const dir = norm(sub(anchor, other));
        const side = cis ? norm(add(perp(dir), { x: 0.2 * sign, y: 0.8 * sign, z: 0 })) : perp(dir);
        const origin = add(anchor, mul(dir, 2.85));
        if (cis) origin.x += 1.1 * sign;
        const pts = benzenePoints(origin, mul(dir, -1), side, 1.40);
        const atoms = pts.map((p, k) => mol.add('C', p.x, p.y, p.z, { h: k === 0 ? 0 : 1, hyb: 2, role: 'guest' }));
        linkRing(mol, atoms, 1.39, 1);
        mol.link(anchor, atoms[0], 1, 1.43);
      }
      phenyl(N1, N2, 1); phenyl(N2, N1, -1);
      addHydrogens(mol);
      return mol;
    }
    if (id === 'AdNH3' || id === 'AdCOO') {
      const head = addAdamantane(mol, { x: 0, y: 0, z: -0.6 }, { x: 0, y: 0, z: 1 }, 9, 'link');
      mol.atoms.forEach(a => { a.role = 'guest'; a.group = 9; });
      if (id === 'AdNH3') {
        const N = mol.add('N', head.x, head.y, head.z + 1.47, { h: 3, formal: 1, role: 'guest', hyb: 3 });
        mol.link(head, N, 1, 1.47);
      } else {
        const C = mol.add('C', head.x, head.y, head.z + 1.52, { h: 0, hyb: 2, role: 'guest' });
        mol.link(head, C, 1, 1.52);
        const o1 = mol.add('O', C.x + 1.05, C.y, C.z + 0.65, { h: 0, formal: -0.5, role: 'guest' });
        const o2 = mol.add('O', C.x - 1.05, C.y, C.z + 0.65, { h: 0, formal: -0.5, role: 'guest' });
        mol.link(C, o1, 2, 1.25); mol.link(C, o2, 1, 1.25);
      }
      addHydrogens(mol);
      return mol;
    }
    return mol;
  }

  function translateGuest(g, center, extra) {
    if (!g.atoms.length) return;
    const c = centroid(g.atoms);
    g.atoms.forEach(a => {
      a.x += center.x - c.x + (extra ? extra.x : 0);
      a.y += center.y - c.y + (extra ? extra.y : 0);
      a.z += center.z - c.z + (extra ? extra.z : 0);
    });
  }
  function mergeGuest(host, g) {
    const base = host.atoms.length;
    g.atoms.forEach(a => { a.i = base + a.i; a.role = 'guest'; host.atoms.push(a); });
    g.bonds.forEach(b => host.bonds.push({ i: b.i + base, j: b.j + base, order: b.order, r0: b.r0 }));
  }

  function cavityOf(mol) {
    const holes = mol.atoms.filter(a => a.probe === 'hole');
    const host = mol.atoms.filter(a => a.role === 'host');
    const center = centroid(holes.length ? holes : host);
    if (holes.length < 3) return { center: center, diameter: null, portal: null };
    const radial = holes.map(a => Math.hypot(a.x - center.x, a.y - center.y));
    const meanR = avg(radial);
    const vw = avg(holes.map(a => vdw(a.el)));
    const zS = Math.max.apply(null, holes.map(a => a.z)) - Math.min.apply(null, holes.map(a => a.z));
    let diameter;
    if (zS < Math.max(1.2, meanR * 0.85)) diameter = 2 * Math.max(0.25, meanR - vw);
    else diameter = 2 * Math.max(0.25, avg(holes.map(a => dist(a, center) - vdw(a.el))));
    const upperAtoms = mol.atoms.filter(a => a.probe === 'upper');
    let upper = null;
    if (upperAtoms.length >= 3) {
      const ru = avg(upperAtoms.map(a => Math.hypot(a.x - center.x, a.y - center.y)));
      const vu = avg(upperAtoms.map(a => vdw(a.el)));
      upper = 2 * Math.max(0.25, ru - vu);
    }
    if (upper && diameter != null && diameter < 1.2 && upper > diameter) diameter = upper;
    return { center: center, diameter: diameter, upper: upper };
  }

  function contactsOf(mol) {
    const out = [];
    const atoms = mol.atoms;
    const ions = atoms.filter(a => a.ion || (METAL[a.el] && a.el !== 'Fe'));
    ions.forEach(ion => {
      atoms.forEach(d => {
        if (d === ion || !d.donor) return;
        const r = dist(ion, d);
        if (r < 3.5 && r > 1.4) out.push({ i: ion.i, j: d.i, kind: 'metal' });
      });
    });
    const pol = atoms.filter(a => (a.el === 'N' || a.el === 'O') && a.role !== 'drop');
    for (let i = 0; i < pol.length; i++) for (let j = i + 1; j < pol.length; j++) {
      if (atoms[pol[i].i] && atoms[pol[j].i] && pol[i].role === pol[j].role) continue;
      const r = dist(pol[i], pol[j]);
      if (r >= 2.5 && r <= 3.25) out.push({ i: pol[i].i, j: pol[j].i, kind: 'hb' });
    }
    atoms.forEach((h, hi) => {
      if (h.el !== 'H') return;
      const parentB = mol.bonds.find(b => b.i === hi || b.j === hi);
      if (!parentB) return;
      const parent = atoms[parentB.i === hi ? parentB.j : parentB.i];
      if (!parent || (parent.el !== 'N' && parent.el !== 'O')) return;
      atoms.forEach(acc => {
        if (acc.el !== 'O' && acc.el !== 'N') return;
        if (acc.role === parent.role) return;
        const r = dist(h, acc);
        if (r >= 1.35 && r <= 2.6) out.push({ i: hi, j: acc.i, kind: 'hb' });
      });
    });
    const seen = new Set();
    return out.filter(c => {
      const k = c.kind + ':' + Math.min(c.i, c.j) + ':' + Math.max(c.i, c.j);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 80);
  }

  function assignSimpleCharges(mol) {
    mol.atoms.forEach(a => {
      if (a.formal != null) a.q = a.formal;
      else if (a.ion && METAL[a.el]) a.q = METAL[a.el];
      else if (a.el === 'H') a.q = 0.05;
      else a.q = 0;
    });
    const nbr = mol.atoms.map(() => []);
    mol.bonds.forEach(b => { nbr[b.i].push(b.j); nbr[b.j].push(b.i); });
    mol.atoms.forEach((a, i) => {
      if (a.formal != null || a.ion) return;
      const ns = nbr[i].map(j => mol.atoms[j]);
      if (a.el === 'O') a.q = ns.some(n => n.el === 'H') ? -0.55 : -0.40;
      else if (a.el === 'N') a.q = ns.some(n => n.el === 'H') ? -0.45 : -0.35;
      else if (a.el === 'S') a.q = -0.15;
      else if (a.el === 'C') {
        const pull = ns.filter(n => n.el === 'O' || n.el === 'N').length;
        a.q = pull ? 0.12 * pull : -0.05;
      }
    });
    try {
      if (root.PVChem && root.PVChem.assignCharges) {
        const wrap = mol.atoms.map(a => ({ x: a.x, y: a.y, z: a.z, elem: a.el, bonds: [] }));
        mol.bonds.forEach(b => { wrap[b.i].bonds.push(b.j); wrap[b.j].bonds.push(b.i); });
        root.PVChem.assignCharges(wrap, { isMacro: false });
        mol.atoms.forEach((a, i) => {
          if (a.formal != null) a.q = a.formal;
          else if (a.ion && METAL[a.el]) a.q = METAL[a.el];
          else if (wrap[i].partialCharge != null && isFinite(wrap[i].partialCharge)) a.q = wrap[i].partialCharge;
        });
      }
    } catch (e) { /* учебная раскраска уже стоит */ }
  }

  function placeGuests(mol, state) {
    const cav = cavityOf(mol);
    const center = cav.center || { x: 0, y: 0, z: 0 };
    const gname = state.guest || 'none';
    if (mol.meta.builtInGuest && (!gname || gname === 'none' || gname === 'metal')) {
      /* металл уже в порфирине / цикламе добавляется ниже отдельно */
    }
    if (state.azaMetal && state.azaMetal !== 'none' && (mol.meta.kind === 'aza')) {
      const ion = mol.add(state.azaMetal, center.x, center.y, center.z, { ion: true, formal: METAL[state.azaMetal] || 2, role: 'guest', freeze: true, h: 0 });
      void ion;
    }
    if (!gname || gname === 'none') return cav;
    if (gname === 'ternary') {
      const a = buildGuest('MV'), b = buildGuest('naph');
      translateGuest(a, center, { x: -1.6, y: 0, z: 0 });
      translateGuest(b, center, { x: 1.7, y: 0.4, z: 0 });
      mergeGuest(mol, a); mergeGuest(mol, b);
      return cav;
    }
    const g = buildGuest(gname);
    let extra = { x: 0, y: 0, z: 0 };
    if (gname === 'AdNH3' || gname === 'AdCOO') extra = { x: 0, y: 0, z: 0.4 };
    if ((state.sandwich === '1' || mol.meta.sandwich) && METAL[gname]) extra = { x: 0, y: 0, z: 0 };
    translateGuest(g, mol.meta.sandwich ? { x: 0, y: 0, z: 0 } : center, mol.meta.sandwich ? { x: 0, y: 0, z: 0 } : extra);
    mergeGuest(mol, g);
    return cav;
  }

  function clean(mol) {
    if (mol.atoms.some(a => a.el === 'X' || a.role === 'drop')) dropMarked(mol);
  }

  function build(state) {
    state = state || {};
    const c = state.c || 'crown';
    let mol;
    if (c === 'crown') mol = buildCrown(state);
    else if (c === 'lariat') mol = buildLariat(state);
    else if (c === 'podand') mol = buildPodand(state);
    else if (c === 'crypt') mol = buildCrypt(state);
    else if (c === 'spherand') mol = buildSpherand(state);
    else if (c === 'cb') mol = buildCB(state);
    else if (c === 'cd') mol = buildCD(state);
    else if (c === 'calix') mol = buildCalix(state);
    else if (c === 'pillar') mol = buildPillar(state);
    else if (c === 'aza') mol = buildAza(state);
    else if (c === 'other') {
      const o = state.other || 'porphin';
      if (o === 'porphin') mol = buildPorphyrin(state);
      else if (o === 'bluebox') mol = buildBlueBox();
      else if (o === 'ctv') mol = buildCTV();
      else if (o === 'resorcin') mol = buildResorcinarene(false);
      else if (o === 'cavitand') mol = buildResorcinarene(true);
      else mol = buildPorphyrin(state);
    } else if (c === 'topo') mol = buildTopo(state);
    else mol = buildCrown(state);
    clean(mol);
    if (!mol.meta.sandwich) mol.meta.hostFormula = formulaOf(mol.atoms.filter(a => a.role !== 'guest' && a.el !== 'X'));
    else if (!mol.meta.hostFormula) mol.meta.hostFormula = formulaOf(mol.atoms.filter(a => a.role === 'host' && a.group === 0));
    const hostFormula = mol.meta.hostFormula;
    centerMol(mol, a => a.role === 'host');
    const cav = placeGuests(mol, state);
    assignSimpleCharges(mol);
    const contacts = (state.contacts === '0') ? [] : contactsOf(mol);
    const nan = hasNaN(mol);
    return {
      mol: mol,
      name: mol.name,
      hostFormula: hostFormula,
      formula: formulaOf(mol.atoms.filter(a => a.el !== 'X')),
      atomCount: mol.atoms.length,
      hostAtomCount: mol.atoms.filter(a => a.role === 'host').length,
      nan: nan,
      cavity: cav,
      contacts: contacts,
      report: bondReport(mol),
      meta: mol.meta
    };
  }

  root.SupraGeom = {
    build: build, formulaOf: formulaOf, sdfOf: sdfOf, pdbOf: pdbOf, hasNaN: hasNaN, bondReport: bondReport,
    VDW: VDW, METAL: METAL
  };
})(typeof window !== 'undefined' ? window : globalThis);
