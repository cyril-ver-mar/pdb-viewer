/* Учебное силовое поле (связи, углы, торсионы, vdW) и FIRE.
   Не MMFF: числа в ккал/моль — для сравнения шагов одного и того же поля. */
(function (root) {
  'use strict';
  const VDW = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, S: 1.8, F: 1.47, Cl: 1.75, Br: 1.85, I: 1.98, P: 1.8, Li: 1.82, Na: 2.27, K: 2.75, Rb: 3.03, Cs: 3.43, Fe: 2.0, Cu: 1.4, Zn: 1.39, Ni: 1.63 };
  const METAL = { Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Cu: 2, Zn: 2, Ni: 2, Fe: 2 };
  const RCOV = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05, F: 0.57, Cl: 1.02, Br: 1.2, I: 1.39, P: 1.07, Li: 1.28, Na: 1.66, K: 2.03, Fe: 1.32, Cu: 1.32, Zn: 1.22, Ni: 1.24 };

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function addS(a, b, s) { a[0] += b[0] * s; a[1] += b[1] * s; a[2] += b[2] * s; }

  function r0of(e1, e2, order) {
    const pair = [e1, e2].sort().join('-');
    if ((order || 1) >= 2 && pair === 'C-O') return 1.22;
    if ((order || 1) >= 2 && pair === 'C-C') return 1.34;
    if ((order || 1) >= 2 && pair === 'C-N') return 1.29;
    if ((order || 1) >= 2 && pair === 'N-N') return 1.25;
    const T = { 'C-C': 1.53, 'C-O': 1.43, 'C-N': 1.47, 'C-S': 1.81, 'C-H': 1.09, 'N-H': 1.01, 'O-H': 0.97, 'C-Br': 1.94, 'C-Cl': 1.77, 'C-I': 2.12, 'I-I': 2.67, 'S-O': 1.46, 'N-O': 1.4 };
    if (T[pair]) return T[pair];
    return (RCOV[e1] || 0.77) + (RCOV[e2] || 0.77);
  }
  function vdwOf(el) { return VDW[el] || 1.7; }

  function prepare(mol, opt) {
    opt = opt || {};
    const atoms = mol.atoms.map((a, i) => ({
      el: a.el || 'C',
      x: a.x, y: a.y, z: a.z,
      role: a.role || 'host',
      ion: !!(a.ion || METAL[a.el]),
      freeze: !!(a.freeze || (opt.freezeHost && (a.role || 'host') !== 'guest') || (opt.freezeGuest && a.role === 'guest'))
    }));
    const bonds = (mol.bonds || []).map(b => ({
      i: b.i, j: b.j, order: b.order || 1,
      r0: b.r0 || r0of(atoms[b.i].el, atoms[b.j].el, b.order || 1)
    })).filter(b => atoms[b.i] && atoms[b.j]);
    const nbr = atoms.map(() => []);
    bonds.forEach(b => { nbr[b.i].push(b.j); nbr[b.j].push(b.i); });
    const angles = [];
    for (let j = 0; j < atoms.length; j++) {
      const nb = nbr[j];
      if (nb.length < 2) continue;
      const th0 = (atoms[j].el === 'C' && nb.length === 3 && bonds.some(b => (b.i === j || b.j === j) && b.order >= 2)) ? 120 * Math.PI / 180
        : (nb.length === 3 && atoms[j].el !== 'C' ? 120 * Math.PI / 180 : 109.47 * Math.PI / 180);
      const sp2 = th0 > 2;
      for (let a = 0; a < nb.length; a++) for (let c = a + 1; c < nb.length; c++) {
        angles.push({ i: nb[a], j: j, k: nb[c], th0: sp2 && atoms[j].el === 'C' ? 120 * Math.PI / 180 : th0 });
      }
    }
    const ban = new Set();
    bonds.forEach(b => { ban.add(b.i + ':' + b.j); ban.add(b.j + ':' + b.i); });
    angles.forEach(a => { ban.add(a.i + ':' + a.k); ban.add(a.k + ':' + a.i); });
    const tors = [];
    bonds.forEach(b => {
      const left = nbr[b.i].filter(k => k !== b.j);
      const right = nbr[b.j].filter(k => k !== b.i);
      if (!left.length || !right.length) return;
      const nPer = b.order >= 2 ? 2 : 3;
      const V = b.order >= 2 ? 8 : 0.9;
      left.forEach(i => right.forEach(l => {
        if (i === l) return;
        tors.push({ i: i, j: b.i, k: b.j, l: l, n: nPer, V: V });
      }));
    });
    return { atoms: atoms, bonds: bonds, angles: angles, tors: tors.slice(0, 800), ban: ban, nbr: nbr };
  }

  function xyz(atoms) { return atoms.map(a => [a.x, a.y, a.z]); }
  function write(atoms, x) { for (let i = 0; i < atoms.length; i++) { atoms[i].x = x[i][0]; atoms[i].y = x[i][1]; atoms[i].z = x[i][2]; } }

  function dihedral(a, b, c, d) {
    const b1 = sub(b, a), b2 = sub(c, b), b3 = sub(d, c);
    const n1 = cross(b1, b2), n2 = cross(b2, b3);
    const l1 = len(n1), l2 = len(n2), l2b = len(b2);
    if (l1 < 1e-8 || l2 < 1e-8 || l2b < 1e-8) return 0;
    const u1 = [n1[0] / l1, n1[1] / l1, n1[2] / l1];
    const u2 = [n2[0] / l2, n2[1] / l2, n2[2] / l2];
    const m = [b2[0] / l2b, b2[1] / l2b, b2[2] / l2b];
    return Math.atan2(dot(cross(u1, u2), m), dot(u1, u2));
  }

  function energy(sys, x, opt) {
    const atoms = sys.atoms;
    let e = 0;
    const kB = 320, kA = 70, kR = 0.08;
    const kPos = opt.kPos || 0;
    const x0 = opt.x0;
    for (let bi = 0; bi < sys.bonds.length; bi++) {
      const b = sys.bonds[bi];
      const d = sub(x[b.i], x[b.j]);
      const r = len(d) || 1e-6;
      const diff = r - b.r0;
      e += 0.5 * kB * diff * diff;
    }
    for (let ai = 0; ai < sys.angles.length; ai++) {
      const an = sys.angles[ai];
      const rij = sub(x[an.i], x[an.j]), rkj = sub(x[an.k], x[an.j]);
      const nij = len(rij) || 1e-6, nkj = len(rkj) || 1e-6;
      const c = Math.max(-1, Math.min(1, dot(rij, rkj) / (nij * nkj)));
      const th = Math.acos(c);
      const dth = th - an.th0;
      e += 0.5 * kA * dth * dth;
    }
    for (let ti = 0; ti < sys.tors.length; ti++) {
      const t = sys.tors[ti];
      const phi = dihedral(x[t.i], x[t.j], x[t.k], x[t.l]);
      e += 0.5 * t.V * (1 + Math.cos(t.n * phi));
    }
    const n = atoms.length;
    const cut = 8;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (sys.ban.has(i + ':' + j)) continue;
        const d = sub(x[i], x[j]);
        const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (r2 > cut * cut || r2 < 1e-8) continue;
        const r = Math.sqrt(r2);
        const sig = 0.89 * (vdwOf(atoms[i].el) + vdwOf(atoms[j].el));
        const sr = sig / r;
        const sr6 = sr * sr * sr * sr * sr * sr;
        e += kR * (sr6 * sr6 - 2 * sr6);
      }
    }
    if (kPos > 0 && x0) {
      for (let i = 0; i < n; i++) {
        const d = sub(x[i], x0[i]);
        e += 0.5 * kPos * dot(d, d);
      }
    }
    return e;
  }

  function forces(sys, x, opt) {
    const n = x.length;
    const f = Array.from({ length: n }, () => [0, 0, 0]);
    const kB = 320, kA = 70, kR = 0.08;
    const atoms = sys.atoms;
    for (let bi = 0; bi < sys.bonds.length; bi++) {
      const b = sys.bonds[bi];
      const d = sub(x[b.i], x[b.j]);
      const r = len(d) || 1e-6;
      const diff = r - b.r0;
      const s = kB * diff / r;
      addS(f[b.i], d, -s);
      addS(f[b.j], d, s);
    }
    for (let ai = 0; ai < sys.angles.length; ai++) {
      const an = sys.angles[ai];
      const rij = sub(x[an.i], x[an.j]), rkj = sub(x[an.k], x[an.j]);
      const nij = len(rij) || 1e-6, nkj = len(rkj) || 1e-6;
      const cos = Math.max(-0.999999, Math.min(0.999999, dot(rij, rkj) / (nij * nkj)));
      const th = Math.acos(cos);
      const sin = Math.sqrt(Math.max(1e-8, 1 - cos * cos));
      const dci = sub([rkj[0] / (nij * nkj), rkj[1] / (nij * nkj), rkj[2] / (nij * nkj)], [rij[0] * cos / (nij * nij), rij[1] * cos / (nij * nij), rij[2] * cos / (nij * nij)]);
      const dck = sub([rij[0] / (nij * nkj), rij[1] / (nij * nkj), rij[2] / (nij * nkj)], [rkj[0] * cos / (nkj * nkj), rkj[1] * cos / (nkj * nkj), rkj[2] * cos / (nkj * nkj)]);
      const fac = -1 / sin;
      const dti = [dci[0] * fac, dci[1] * fac, dci[2] * fac];
      const dtk = [dck[0] * fac, dck[1] * fac, dck[2] * fac];
      const dtj = [-(dti[0] + dtk[0]), -(dti[1] + dtk[1]), -(dti[2] + dtk[2])];
      const w = -kA * (th - an.th0);
      addS(f[an.i], dti, w); addS(f[an.j], dtj, w); addS(f[an.k], dtk, w);
    }
    const eps = 1.5e-4;
    for (let ti = 0; ti < sys.tors.length; ti++) {
      const t = sys.tors[ti];
      const ids = [t.i, t.j, t.k, t.l];
      const phi = dihedral(x[t.i], x[t.j], x[t.k], x[t.l]);
      const dedp = -0.5 * t.V * t.n * Math.sin(t.n * phi);
      for (let a = 0; a < 4; a++) {
        const id = ids[a];
        for (let dim = 0; dim < 3; dim++) {
          x[id][dim] += eps;
          let ph2 = dihedral(x[t.i], x[t.j], x[t.k], x[t.l]);
          x[id][dim] -= eps;
          let dphi = ph2 - phi;
          if (dphi > Math.PI) dphi -= 2 * Math.PI;
          if (dphi < -Math.PI) dphi += 2 * Math.PI;
          f[id][dim] -= dedp * dphi / eps;
        }
      }
    }
    const cut = 8;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (sys.ban.has(i + ':' + j)) continue;
        const d = sub(x[i], x[j]);
        const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (r2 > cut * cut || r2 < 1e-6) continue;
        const r = Math.sqrt(r2);
        const sig = 0.89 * (vdwOf(atomsEl(sys, i)) + vdwOf(atomsEl(sys, j)));
        const sr = sig / r;
        const sr6 = sr * sr * sr * sr * sr * sr;
        const sr12 = sr6 * sr6;
        const dedr = kR * (-12 * sr12 / r + 12 * sr6 / r);
        const s = dedr / r;
        addS(f[i], d, -s);
        addS(f[j], d, s);
      }
    }
    if ((opt.kPos || 0) > 0 && opt.x0) {
      for (let i = 0; i < n; i++) {
        const d = sub(x[i], opt.x0[i]);
        addS(f[i], d, -(opt.kPos));
      }
    }
    return f;
  }
  function atomsEl(sys, i) { return sys.atoms[i].el; }

  function rmsd(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const dx = a[i][0] - b[i][0], dy = a[i][1] - b[i][1], dz = a[i][2] - b[i][2];
      s += dx * dx + dy * dy + dz * dz;
    }
    return Math.sqrt(s / Math.max(1, a.length));
  }

  function minimize(mol, opt, onStep) {
    opt = opt || {};
    const steps = opt.steps || 60;
    const sys = prepare(mol, opt);
    const x0 = xyz(sys.atoms);
    const x = x0.map(p => p.slice());
    const ref = x0.map(p => p.slice());
    const runOpt = { kPos: opt.kPos || 0, x0: ref };
    let e = energy(sys, x, runOpt);
    const e0 = e;
    const trace = [e];
    let v = x.map(() => [0, 0, 0]);
    let dt = opt.dt || 0.004;
    const maxMove = opt.maxMove || 0;
    let used = 0;
    for (let step = 0; step < steps; step++) {
      const f = forces(sys, x, runOpt);
      let fn = 0;
      for (let i = 0; i < x.length; i++) {
        if (sys.atoms[i].freeze) { v[i][0] = v[i][1] = v[i][2] = 0; continue; }
        fn += dot(f[i], v[i]);
      }
      if (fn < 0) {
        v = x.map(() => [0, 0, 0]);
        dt *= 0.5;
      } else dt = Math.min(dt * 1.05, 0.012);
      let maxF = 0;
      for (let i = 0; i < x.length; i++) maxF = Math.max(maxF, len(f[i]));
      const clip = maxF > 80 ? 80 / maxF : 1;
      for (let i = 0; i < x.length; i++) {
        if (sys.atoms[i].freeze) continue;
        v[i][0] = 0.65 * v[i][0] + dt * f[i][0] * clip;
        v[i][1] = 0.65 * v[i][1] + dt * f[i][1] * clip;
        v[i][2] = 0.65 * v[i][2] + dt * f[i][2] * clip;
        const mv = len(v[i]);
        if (mv > 0.08) { v[i][0] *= 0.08 / mv; v[i][1] *= 0.08 / mv; v[i][2] *= 0.08 / mv; }
        x[i][0] += v[i][0];
        x[i][1] += v[i][1];
        x[i][2] += v[i][2];
        if (maxMove > 0) {
          const d = sub(x[i], ref[i]);
          const L = len(d);
          if (L > maxMove) { x[i][0] = ref[i][0] + d[0] * maxMove / L; x[i][1] = ref[i][1] + d[1] * maxMove / L; x[i][2] = ref[i][2] + d[2] * maxMove / L; }
        }
        if (!isFinite(x[i][0])) { x[i][0] = ref[i][0]; x[i][1] = ref[i][1]; x[i][2] = ref[i][2]; }
      }
      const en = energy(sys, x, runOpt);
      if (!isFinite(en) || en > e * 1.8 + 50) {
        for (let i = 0; i < x.length; i++) { x[i][0] -= v[i][0]; x[i][1] -= v[i][1]; x[i][2] -= v[i][2]; v[i][0] = v[i][1] = v[i][2] = 0; }
        dt *= 0.4;
      } else {
        e = en;
        used = step + 1;
      }
      if (step % 2 === 0) trace.push(e);
      if (onStep && step % 3 === 0) onStep({ step: step, energy: e, coords: x.map(p => p.slice()) });
      if (dt < 1e-6) break;
    }
    if (e > e0) {
      for (let i = 0; i < x.length; i++) x[i] = ref[i].slice();
      e = e0;
    }
    return {
      energy0: e0,
      energy1: e,
      coords: x,
      rmsd: rmsd(ref, x),
      steps: used,
      trace: trace,
      ff: 'JS-UFF',
      engine: 'js'
    };
  }

  function binding(mol, opt) {
    const host = { atoms: mol.atoms.filter(a => a.role !== 'guest'), bonds: [] };
    const guestAtoms = mol.atoms.map((a, i) => ({ a: a, i: i })).filter(o => o.a.role === 'guest');
    const mapH = new Map();
    mol.atoms.forEach((a, i) => { if (a.role !== 'guest') mapH.set(i, mapH.size); });
    const mapG = new Map();
    guestAtoms.forEach(o => mapG.set(o.i, mapG.size));
    mol.bonds.forEach(b => {
      if (mapH.has(b.i) && mapH.has(b.j)) host.bonds.push({ i: mapH.get(b.i), j: mapH.get(b.j), order: b.order, r0: b.r0 });
    });
    const guest = { atoms: guestAtoms.map(o => o.a), bonds: [] };
    mol.bonds.forEach(b => {
      if (mapG.has(b.i) && mapG.has(b.j)) guest.bonds.push({ i: mapG.get(b.i), j: mapG.get(b.j), order: b.order, r0: b.r0 });
    });
    const steps = Math.min(opt.steps || 40, 40);
    const ec = minimize(mol, Object.assign({}, opt, { steps: steps }));
    const eh = host.atoms.length ? minimize(host, { steps: steps }) : { energy1: 0 };
    const eg = guest.atoms.length ? minimize(guest, { steps: steps }) : { energy1: 0 };
    return { complex: ec.energy1, host: eh.energy1, guest: eg.energy1, bind: ec.energy1 - eh.energy1 - eg.energy1, ff: ec.ff };
  }

  const api = { minimize: minimize, binding: binding, energyOf: function (mol, opt) { const sys = prepare(mol, opt || {}); const x = xyz(sys.atoms); return energy(sys, x, { kPos: 0 }); }, METAL: METAL };
  root.SupraFF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
