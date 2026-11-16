/* Учебная модель межмолекулярных энергий. Не квантовая химия:
   точечные заряды, наведённая поляризация и Леннард-Джонс / Бэкингем.
   Цифры подобраны так, чтобы минимум лежал в учебном диапазоне. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IXLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KE = 1389.35457644382; // кДж·Å/(моль·e²)
  const POL = 694.67728822191; // −½αE²: кДж/моль · Å / (e² · Å³) при |F| в e/Å²
  const KCAL = 4.184;
  const DEG = Math.PI / 180;

  const EL = {
    H:  { sigma: 2.2, eps: 0.06, alpha: 0.39 },
    C:  { sigma: 3.40, eps: 0.30, alpha: 1.45 },
    N:  { sigma: 3.25, eps: 0.40, alpha: 1.10 },
    O:  { sigma: 3.12, eps: 0.42, alpha: 0.85 },
    F:  { sigma: 2.95, eps: 0.28, alpha: 0.56 },
    S:  { sigma: 3.60, eps: 1.00, alpha: 2.90 },
    Cl: { sigma: 3.50, eps: 1.05, alpha: 2.18 },
    Br: { sigma: 3.75, eps: 1.35, alpha: 3.05 },
    I:  { sigma: 4.05, eps: 1.70, alpha: 5.35 },
    Se: { sigma: 3.85, eps: 1.40, alpha: 3.77 },
    Te: { sigma: 4.15, eps: 1.80, alpha: 5.50 },
    Na: { sigma: 2.55, eps: 0.12, alpha: 0.18 },
    K:  { sigma: 3.45, eps: 0.18, alpha: 0.83 },
    Li: { sigma: 2.05, eps: 0.06, alpha: 0.03 },
    Ar: { sigma: 3.385, eps: 1.00, alpha: 1.64 }
  };

  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vmul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm(a) { const l = len(a) || 1; return vmul(a, 1 / l); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  function p3(v) { return { x: v[0], y: v[1], z: v[2] }; }
  function xyz(p) { return [p.x, p.y, p.z]; }

  function perpPrefer(v, prefer) {
    const p = vsub(prefer, vmul(v, dot(prefer, v)));
    if (len(p) > 1e-8) return norm(p);
    const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
    const t = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
    return norm(cross(v, t));
  }
  function rotateAround(axis, vec, angle) {
    const k = norm(axis), c = Math.cos(angle), s = Math.sin(angle);
    return vadd(vadd(vmul(vec, c), vmul(cross(k, vec), s)), vmul(k, dot(k, vec) * (1 - c)));
  }
  function angAt(a, b, c) {
    const u = norm(vsub(a, b)), v = norm(vsub(c, b));
    return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / DEG;
  }

  function at(el, v, frag, o) {
    o = o || {};
    const d = EL[el] || EL.C;
    return {
      el: el, x: v[0], y: v[1], z: v[2], frag: frag,
      q: o.q == null ? 0 : o.q,
      sigma: o.sigma == null ? d.sigma : o.sigma,
      eps: o.eps == null ? d.eps : o.eps,
      alpha: o.alpha == null ? d.alpha : o.alpha,
      site: !!o.site,
      role: o.role || '',
      wall: o.wall || null
    };
  }

  /** Атом A на расстоянии rDA от D, угол D–H–A = angDeg (180 — линейно). */
  function placeA(D, H, rDA, angDeg) {
    const phi = (180 - angDeg) * DEG;
    const away = norm(vsub(H, D));
    const side = perpPrefer(away, [1, 0, 0]);
    const HAhat = norm(vadd(vmul(away, Math.cos(phi)), vmul(side, Math.sin(phi))));
    const P = vsub(H, D);
    const b = 2 * dot(P, HAhat);
    const c = dot(P, P) - rDA * rDA;
    let disc = b * b - 4 * c;
    if (disc < 0) disc = 0;
    const t = (-b + Math.sqrt(disc)) / 2;
    const A = vadd(H, vmul(HAhat, Math.max(0.15, t)));
    return { A: A, toH: vmul(HAhat, -1), side: side };
  }

  /** Точка на расстоянии r от apex, угол back–apex–front = angDeg. */
  function placeFront(back, apex, r, angDeg) {
    const phi = (180 - angDeg) * DEG;
    const axis = norm(vsub(apex, back));
    const side = perpPrefer(axis, [0, 1, 0]);
    const dir = norm(vadd(vmul(axis, Math.cos(phi)), vmul(side, Math.sin(phi))));
    return { front: vadd(apex, vmul(dir, r)), dir: dir, side: side, axis: axis };
  }

  function frameAt(toH, angAdeg, dihDeg) {
    const side0 = perpPrefer(toH, [1, 0, 0]);
    const side = rotateAround(toH, side0, (dihDeg || 0) * DEG);
    const ang = angAdeg * DEG;
    const bis = norm(vadd(vmul(toH, Math.cos(ang)), vmul(side, Math.sin(ang))));
    let n = cross(bis, toH);
    if (len(n) < 1e-6) n = side;
    n = norm(n);
    return { bis: bis, n: n, side: side };
  }

  function kappaOf(I, eps, T) {
    if (!I || I <= 0) return 0;
    const TT = T || 298.15;
    const ee = eps || 1;
    return 0.329 * Math.sqrt(Math.max(0, I) * (78.4 / ee) * (298.15 / TT));
  }

  function indDamp(r) {
    const u = r / 2.35;
    const f = 1 - Math.exp(-u * u * u);
    return f;
  }

  function f6TT(x) {
    let term = 1, sum = 1;
    const n = Math.min(x, 40);
    for (let k = 1; k <= 6; k++) { term *= n / k; sum += term; }
    return 1 - Math.exp(-n) * sum;
  }

  function pairTerms(ai, aj, r, eps, kappa, buck) {
    const r0 = Math.max(r, 0.12);
    const screen = kappa > 0 ? Math.exp(-kappa * r0) : 1;
    let elec = 0, dir = 0;
    const qq = ai.q * aj.q;
    if (qq) {
      const c = KE * qq * screen / (eps * r0);
      if (ai.role === 'hole' || aj.role === 'hole') dir += c;
      else elec += c;
    }
    let disp = 0, exch = 0;
    if (!ai.site && !aj.site && ai.eps > 0 && aj.eps > 0 && ai.sigma > 0 && aj.sigma > 0) {
      const sig = 0.5 * (ai.sigma + aj.sigma);
      const ee = Math.sqrt(ai.eps * aj.eps);
      if (buck) {
        const rm = sig * Math.pow(2, 1 / 6);
        const C6 = 2 * ee * Math.pow(rm, 6);
        const b = 12 / rm;
        const A = ee * Math.exp(12);
        const x = b * r0;
        disp += -f6TT(x) * C6 / Math.pow(r0, 6);
        exch += A * Math.exp(-Math.min(x, 60));
      } else {
        const sr6 = Math.pow(sig / r0, 6);
        exch += 4 * ee * sr6 * sr6;
        disp += -4 * ee * sr6;
      }
    }
    if (ai.wall && aj.el === ai.wall.el) exch += born(ai.wall, r0);
    if (aj.wall && ai.el === aj.wall.el) exch += born(aj.wall, r0);
    return { elec: elec, dir: dir, disp: disp, exch: exch };
  }

  function born(w, r) {
    return w.A * Math.exp(-Math.min(r / w.rho, 60));
  }

  function induction(targets, sources, eps, kappa, ascale) {
    let U = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alpha || t.site) continue;
      let fx = 0, fy = 0, fz = 0;
      for (let j = 0; j < sources.length; j++) {
        const s = sources[j];
        if (!s.q) continue;
        const dx = t.x - s.x, dy = t.y - s.y, dz = t.z - s.z;
        const r = Math.max(Math.hypot(dx, dy, dz), 0.2);
        const yuk = kappa > 0 ? Math.exp(-kappa * r) * (1 + kappa * r) : 1;
        const f = s.q * yuk * indDamp(r) / (eps * r * r * r);
        fx += dx * f; fy += dy * f; fz += dz * f;
      }
      U += -POL * t.alpha * ascale * (fx * fx + fy * fy + fz * fz);
    }
    return U;
  }

  function energyOf(atoms, geom, buck) {
    const eps = geom.eps || 1;
    const ascale = geom.ascale == null ? 1 : geom.ascale;
    const kappa = kappaOf(geom.I, eps, geom.T || 298.15);
    const qmul = geom.qscale == null ? 1 : geom.qscale;
    const scaled = atoms.map(a => ({ ...a, q: a.q * qmul, alpha: a.alpha * ascale }));
    const A = scaled.filter(a => a.frag === 'A');
    const B = scaled.filter(a => a.frag === 'B');
    const parts = { elec: 0, ind: 0, disp: 0, exch: 0, dir: 0, enth: 0, entr: 0, keesom: 0, debye: 0, london: 0 };
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B.length; j++) {
        const t = pairTerms(A[i], B[j], dist(A[i], B[j]), eps, kappa, buck);
        parts.elec += t.elec; parts.dir += t.dir; parts.disp += t.disp; parts.exch += t.exch;
      }
    }
    parts.ind += induction(A, B, eps, kappa, 1);
    parts.ind += induction(B, A, eps, kappa, 1);
    return parts;
  }

  function totalOf(parts, keys) {
    let s = 0;
    for (let i = 0; i < keys.length; i++) s += parts[keys[i]] || 0;
    return s;
  }

  function hbDir(m, p) {
    if (!p) return 0;
    const delta = (180 - m.ang) * DEG;
    const c = Math.max(0, Math.cos(delta));
    const angTerm = Math.pow(c, p.n || 2);
    let acc = 1;
    if (p.angA0 != null && m.angA != null) {
      const d = (m.angA - p.angA0) / (p.angAw || 30);
      acc = Math.exp(-0.5 * d * d);
    }
    const rad = Math.exp(-((m.rHA - p.r0) * (m.rHA - p.r0)) / (2 * (p.w || 0.35) * (p.w || 0.35)));
    return -p.E0 * angTerm * acc * rad;
  }

  function recenter(atoms, pts) {
    if (!pts.length) return;
    const a = pts[0], b = pts[1] || pts[0];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    const sh = (p) => { p.x -= mx; p.y -= my; p.z -= mz; };
    atoms.forEach(sh);
    pts.forEach(sh);
    // Камера смотрит вдоль z. Если контакт вытянут по z, кладём его в плоскость экрана.
    const all = atoms.concat(pts);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, minz = Infinity, maxz = -Infinity;
    all.forEach(p => {
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
      if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z;
    });
    if ((maxz - minz) > (maxx - minx) && (maxz - minz) > (maxy - miny)) {
      all.forEach(p => { const x = p.x; p.x = p.z; p.z = -x; });
    }
  }

  function metricRows(list) {
    return list.filter(Boolean).map(x => ({ name: x[0], value: x[1], unit: x[2] }));
  }

  // ---------- фрагменты ----------

  function waterMol(origin, bis, n, frag, qH, lj) {
    const r = 0.9572, half = 52.26 * DEG;
    const O = at('O', origin, frag, { q: -2 * qH, sigma: lj.sigma, eps: lj.eps, alpha: lj.aO });
    const d1 = norm(vadd(vmul(bis, Math.cos(half)), vmul(n, Math.sin(half))));
    const d2 = norm(vadd(vmul(bis, Math.cos(half)), vmul(n, -Math.sin(half))));
    const H1 = at('H', vadd(origin, vmul(d1, r)), frag, { q: qH, eps: 0, sigma: 0, alpha: lj.aH });
    const H2 = at('H', vadd(origin, vmul(d2, r)), frag, { q: qH, eps: 0, sigma: 0, alpha: lj.aH });
    return { atoms: [O, H1, H2], bonds: [] };
  }

  function buildWater(g) {
    const qH = 0.397;
    const lj = { sigma: 3.29, eps: 0.55, aO: 1.45, aH: 0.10 };
    const rOH = 0.9572, a = 104.52 * DEG;
    const O1 = at('O', [0, 0, 0], 'A', { q: -2 * qH, sigma: lj.sigma, eps: lj.eps, alpha: lj.aO });
    const H1 = at('H', [0, 0, rOH], 'A', { q: qH, eps: 0, sigma: 0, alpha: lj.aH });
    const H2 = at('H', [-Math.sin(a) * rOH, 0, Math.cos(a) * rOH], 'A', { q: qH, eps: 0, sigma: 0, alpha: lj.aH });
    const placed = placeA(xyz(O1), xyz(H1), g.r, g.ang);
    const fr = frameAt(placed.toH, g.angA, g.dih);
    const acc = waterMol(placed.A, fr.bis, fr.n, 'B', qH, lj);
    const atoms = [O1, H1, H2].concat(acc.atoms);
    const bonds = [[0, 1], [0, 2], [3, 4], [3, 5]];
    const HA = dist(H1, acc.atoms[0]);
    const ang = angAt(xyz(O1), xyz(H1), xyz(acc.atoms[0]));
    const mid = vadd(xyz(acc.atoms[1]), xyz(acc.atoms[2]));
    const midp = p3(vmul(mid, 0.5));
    const angA = angAt(xyz(H1), xyz(acc.atoms[0]), [midp.x, midp.y, midp.z]);
    const line = [p3(xyz(O1)), p3(xyz(acc.atoms[0]))];
    const angles = [
      [p3(xyz(O1)), p3(xyz(H1)), p3(xyz(acc.atoms[0]))],
      [p3(xyz(H1)), p3(xyz(acc.atoms[0])), midp]
    ];
    recenter(atoms, line.concat(angles[0], angles[1]));
    const m = { ang: ang, angA: angA, rHA: HA };
    return {
      atoms: atoms, bonds: bonds, line: line, angles: angles, holes: [], shells: [],
      metrics: metricRows([
        ['O···O', dist(atoms[0], atoms[3]), 'Å'],
        ['H···O', dist(atoms[1], atoms[3]), 'Å'],
        ['угол O–H···O', ang, '°'],
        ['угол при акцепторе', angA, '°']
      ]),
      dir: hbDir(m, { E0: 9.4, n: 4, r0: 2.00, w: 0.42, angA0: 120, angAw: 34 }),
      m: m
    };
  }

  function formamideDonor(qH) {
    const rNH = 1.02, rNC = 1.35, rCO = 1.23, rCH = 1.11, rNH2 = 1.01;
    const N = at('N', [0, 0, 0], 'A', { q: -0.55, eps: 0.45, sigma: 3.28, alpha: 1.0 });
    const H = at('H', [0, 0, rNH], 'A', { q: qH, eps: 0, sigma: 0, alpha: 0.1 });
    const a = 121 * DEG;
    const C = at('C', [Math.sin(-a) * rNC, 0, Math.cos(-a) * rNC], 'A', { q: 0.45, eps: 0.32, sigma: 3.4, alpha: 1.3 });
    const nc = norm(xyz(C));
    const rot = norm(cross(nc, [0, 1, 0]));
    const angO = 124 * DEG;
    let dirO = norm(vadd(vmul(nc, Math.cos(angO)), vmul(rot, Math.sin(angO))));
    let dirO2 = norm(vadd(vmul(nc, Math.cos(angO)), vmul(rot, -Math.sin(angO))));
    if (len(vsub(vadd(xyz(C), vmul(dirO, rCO)), xyz(H))) < len(vsub(vadd(xyz(C), vmul(dirO2, rCO)), xyz(H)))) dirO = dirO2;
    const O = at('O', vadd(xyz(C), vmul(dirO, rCO)), 'A', { q: -0.50, eps: 0.40, sigma: 3.05, alpha: 0.8 });
    const dirH = norm(vadd(vmul(nc, Math.cos(115 * DEG)), vmul(rot, Math.sin(115 * DEG))));
    const Hc = at('H', vadd(xyz(C), vmul(dirH, rCH)), 'A', { q: 0.05, eps: 0.04, sigma: 2.2, alpha: 0.2 });
    const H2 = at('H', [Math.sin(a) * rNH2, 0, Math.cos(a) * rNH2], 'A', { q: 0.35, eps: 0.02, sigma: 1.8, alpha: 0.1 });
    // сумма зарядов донора ≈ 0: -0.55+qH+0.45-0.50+0.05+0.35 = qH-0.20. Подстроим N.
    N.q = -0.35 - qH;
    const atoms = [N, H, C, O, Hc, H2];
    const bonds = [[0, 1, 1], [0, 2, 1], [2, 3, 2], [2, 4, 1], [0, 5, 1]];
    return { atoms: atoms, bonds: bonds };
  }

  function formaldehyde(A, bis, n, frag, qO) {
    const rCO = 1.21, rCH = 1.11;
    const O = at('O', A, frag, { q: qO, eps: 0.48, sigma: 3.06, alpha: 0.85 });
    const C = at('C', vadd(A, vmul(bis, rCO)), frag, { q: -qO * 0.72, eps: 0.30, sigma: 3.4, alpha: 1.2 });
    const side = n;
    const h1 = norm(vadd(vmul(bis, Math.cos(121 * DEG)), vmul(side, Math.sin(121 * DEG))));
    const h2 = norm(vadd(vmul(bis, Math.cos(121 * DEG)), vmul(side, -Math.sin(121 * DEG))));
    const H1 = at('H', vadd(xyz(C), vmul(h1, rCH)), frag, { q: -qO * 0.14, eps: 0.04, sigma: 2.2, alpha: 0.2 });
    const H2 = at('H', vadd(xyz(C), vmul(h2, rCH)), frag, { q: -qO * 0.14, eps: 0.04, sigma: 2.2, alpha: 0.2 });
    return { atoms: [O, C, H1, H2], bonds: [[0, 1, 2], [1, 2, 1], [1, 3, 1]] };
  }

  function buildAmide(g) {
    const qH = 0.38;
    const don = formamideDonor(qH);
    const D = don.atoms[0], H = don.atoms[1];
    const placed = placeA(xyz(D), xyz(H), g.r, g.ang);
    const fr = frameAt(placed.toH, g.angA, g.dih);
    const acc = formaldehyde(placed.A, fr.bis, fr.n, 'B', -0.48);
    const base = don.atoms.length;
    const bonds = don.bonds.concat(acc.bonds.map(b => [b[0] + base, b[1] + base, b[2] || 1]));
    const atoms = don.atoms.concat(acc.atoms);
    const ang = angAt(xyz(D), xyz(H), xyz(acc.atoms[0]));
    const angA = angAt(xyz(H), xyz(acc.atoms[0]), xyz(acc.atoms[1]));
    const line = [p3(xyz(D)), p3(xyz(acc.atoms[0]))];
    const angles = [
      [p3(xyz(D)), p3(xyz(H)), p3(xyz(acc.atoms[0]))],
      [p3(xyz(H)), p3(xyz(acc.atoms[0])), p3(xyz(acc.atoms[1]))]
    ];
    const rHA = dist(H, acc.atoms[0]);
    recenter(atoms, line.concat(angles[0], angles[1]));
    return {
      atoms: atoms, bonds: bonds, line: line, angles: angles, holes: [], shells: [],
      metrics: metricRows([
        ['N···O', dist(atoms[0], atoms[base]), 'Å'],
        ['H···O', dist(atoms[1], atoms[base]), 'Å'],
        ['угол N–H···O', ang, '°'],
        ['угол H···O=C', angA, '°']
      ]),
      dir: hbDir({ ang: ang, angA: angA, rHA: rHA }, { E0: 5.0, n: 4, r0: 1.98, w: 0.42, angA0: 130, angAw: 30 })
    };
  }

  function ammonia(A, bis, n, frag, qH) {
    const r = 1.015, beta = 68.2 * DEG;
    const N = at('N', A, frag, { q: -3 * qH, eps: 0.55, sigma: 3.30, alpha: 1.15 });
    const atoms = [N];
    for (let k = 0; k < 3; k++) {
      const az = k * 120 * DEG;
      const dir = norm(vadd(vmul(bis, Math.cos(beta)), vmul(
        vadd(vmul(n, Math.cos(az)), vmul(cross(bis, n), Math.sin(az))),
        Math.sin(beta)
      )));
      atoms.push(at('H', vadd(A, vmul(dir, r)), frag, { q: qH, eps: 0, sigma: 0, alpha: 0.1 }));
    }
    return { atoms: atoms, bonds: [[0, 1], [0, 2], [0, 3]] };
  }

  function buildOHN(g) {
    const qH = 0.40;
    const lj = { sigma: 3.10, eps: 0.38, aO: 0.7, aH: 0.08 };
    const rOH = 0.9572, a = 104.52 * DEG;
    const O1 = at('O', [0, 0, 0], 'A', { q: -2 * qH, sigma: lj.sigma, eps: lj.eps, alpha: lj.aO });
    const H1 = at('H', [0, 0, rOH], 'A', { q: qH, eps: 0, sigma: 0, alpha: lj.aH });
    const H2 = at('H', [-Math.sin(a) * rOH, 0, Math.cos(a) * rOH], 'A', { q: qH, eps: 0, sigma: 0, alpha: lj.aH });
    const placed = placeA(xyz(O1), xyz(H1), g.r, g.ang);
    const fr = frameAt(placed.toH, g.angA, g.dih);
    const acc = ammonia(placed.A, fr.bis, fr.n, 'B', 0.27);
    const atoms = [O1, H1, H2].concat(acc.atoms);
    const bonds = [[0, 1], [0, 2]].concat(acc.bonds.map(b => [b[0] + 3, b[1] + 3]));
    const ang = angAt(xyz(O1), xyz(H1), xyz(acc.atoms[0]));
    const mid = vmul(vadd(vadd(xyz(acc.atoms[1]), xyz(acc.atoms[2])), xyz(acc.atoms[3])), 1 / 3);
    const angA = angAt(xyz(H1), xyz(acc.atoms[0]), mid);
    const line = [p3(xyz(O1)), p3(xyz(acc.atoms[0]))];
    const angles = [
      [p3(xyz(O1)), p3(xyz(H1)), p3(xyz(acc.atoms[0]))],
      [p3(xyz(H1)), p3(xyz(acc.atoms[0])), p3(mid)]
    ];
    const rHA = dist(H1, acc.atoms[0]);
    recenter(atoms, line.concat(angles[0], angles[1]));
    return {
      atoms: atoms, bonds: bonds, line: line, angles: angles, holes: [], shells: [],
      metrics: metricRows([
        ['O···N', dist(atoms[0], atoms[3]), 'Å'],
        ['H···N', dist(atoms[1], atoms[3]), 'Å'],
        ['угол O–H···N', ang, '°'],
        ['угол при азоте', angA, '°']
      ]),
      dir: hbDir({ ang: ang, angA: angA, rHA: rHA }, { E0: 5.5, n: 4, r0: 1.95, w: 0.42, angA0: 175, angAw: 36 })
    };
  }

  function buildHF(g) {
    const q = 0.415;
    const rHF = 0.917;
    const F1 = at('F', [0, 0, 0], 'A', { q: -q, eps: 0.42, sigma: 3.02, alpha: 0.55 });
    const H1 = at('H', [0, 0, rHF], 'A', { q: q, eps: 0, sigma: 0, alpha: 0.05 });
    const placed = placeA(xyz(F1), xyz(H1), g.r, g.ang);
    const fr = frameAt(placed.toH, g.angA, g.dih);
    const F2 = at('F', placed.A, 'B', { q: -q, eps: 0.42, sigma: 3.02, alpha: 0.55 });
    const H2 = at('H', vadd(placed.A, vmul(fr.bis, rHF)), 'B', { q: q, eps: 0, sigma: 0, alpha: 0.05 });
    const atoms = [F1, H1, F2, H2];
    const bonds = [[0, 1], [2, 3]];
    const ang = angAt(xyz(F1), xyz(H1), xyz(F2));
    const angA = angAt(xyz(H1), xyz(F2), xyz(H2));
    const line = [p3(xyz(F1)), p3(xyz(F2))];
    const angles = [
      [p3(xyz(F1)), p3(xyz(H1)), p3(xyz(F2))],
      [p3(xyz(H1)), p3(xyz(F2)), p3(xyz(H2))]
    ];
    const rHA = dist(H1, F2);
    recenter(atoms, line.concat(angles[0], angles[1]));
    return {
      atoms: atoms, bonds: bonds, line: line, angles: angles, holes: [], shells: [],
      metrics: metricRows([
        ['F···F', dist(atoms[0], atoms[2]), 'Å'],
        ['H···F', dist(atoms[1], atoms[2]), 'Å'],
        ['угол F–H···F', ang, '°'],
        ['угол H···F–H', angA, '°']
      ]),
      dir: hbDir({ ang: ang, angA: angA, rHA: rHA }, { E0: 6.0, n: 4, r0: 1.85, w: 0.34, angA0: 115, angAw: 32 })
    };
  }

  function addMethyl(Cpos, away, n, frag, qC, qH) {
    const rCH = 1.09;
    const atoms = [at('C', Cpos, frag, { q: qC, eps: 0.28, sigma: 3.4, alpha: 1.2 })];
    const bonds = [];
    for (let k = 0; k < 3; k++) {
      const az = (k * 120 + 20) * DEG;
      const dir = norm(vadd(vmul(away, Math.cos(109.47 * DEG)), vmul(
        vadd(vmul(n, Math.cos(az)), vmul(cross(away, n), Math.sin(az))),
        Math.sin(109.47 * DEG)
      )));
      atoms.push(at('H', vadd(Cpos, vmul(dir, rCH)), frag, { q: qH, eps: 0.04, sigma: 2.3, alpha: 0.15 }));
      bonds.push([0, k + 1]);
    }
    return { atoms: atoms, bonds: bonds };
  }

  function buildCF3X(g, spec) {
    // C в начале, галоген по +z, акцептор дальше
    const bond = spec.bond;
    const Cpos = [0, 0, 0];
    const Xpos = [0, 0, bond];
    const qF = spec.qF, qC = spec.qC, qBelt = spec.qBelt, qHole = spec.qHole;
    const atoms = [];
    const C = at('C', Cpos, 'A', { q: qC, eps: 0.32, sigma: 3.4, alpha: 1.2 });
    const X = at(spec.el, Xpos, 'A', { q: qBelt, eps: spec.epsX, sigma: spec.sigX, alpha: spec.aX });
    atoms.push(C, X);
    const bonds = [[0, 1, 1]];
    const axis = [0, 0, 1];
    for (let k = 0; k < 3; k++) {
      const az = k * 120 * DEG;
      const dir = norm([Math.sin(109.47 * DEG) * Math.cos(az), Math.sin(109.47 * DEG) * Math.sin(az), Math.cos(109.47 * DEG)]);
      // 109° от +z — фторы смотрят назад
      const d = [Math.sin(108 * DEG) * Math.cos(az), Math.sin(108 * DEG) * Math.sin(az), -Math.cos(108 * DEG)];
      atoms.push(at('F', vadd(Cpos, vmul(norm(d), 1.33)), 'A', { q: qF, eps: 0.25, sigma: 2.95, alpha: 0.5 }));
      bonds.push([0, atoms.length - 1, 1]);
    }
    const holePos = vadd(Xpos, vmul(axis, spec.holeD));
    atoms.push(at(spec.el, holePos, 'A', { q: qHole, site: true, role: 'hole', eps: 0, sigma: 0, alpha: 0 }));
    const placed = placeFront(Cpos, Xpos, g.r, g.ang);
    const toX = vmul(placed.dir, -1);
    const fr = frameAt(toX, g.angA == null ? 160 : g.angA, g.dih || 0);
    const acc = formaldehyde(placed.front, fr.bis, fr.n, 'B', spec.qO);
    const base = atoms.length;
    // hole is last of donor before we concat — base includes hole
    const bonds2 = bonds.concat(acc.bonds.map(b => [b[0] + base, b[1] + base, b[2] || 1]));
    const all = atoms.concat(acc.atoms);
    const oAcc = acc.atoms[0];
    const ang = angAt(Cpos, Xpos, xyz(oAcc));
    const angA = angAt(Xpos, xyz(oAcc), xyz(acc.atoms[1]));
    const line = [p3(Xpos), p3(xyz(oAcc))];
    const angles = [
      [p3(Cpos), p3(Xpos), p3(xyz(oAcc))],
      [p3(Xpos), p3(xyz(oAcc)), p3(xyz(acc.atoms[1]))]
    ];
    const holes = [p3(holePos)];
    recenter(all, line.concat(angles[0], angles[1], holes));
    const sym = spec.el;
    return {
      atoms: all, bonds: bonds2, line: line, angles: angles, holes: holes, shells: [],
      metrics: metricRows([
        [sym + '···O', dist(all[1], all[base]), 'Å'],
        ['угол C–' + sym + '···O', ang, '°'],
        ['угол ' + sym + '···O=C', angA, '°']
      ]),
      dir: 0
    };
  }

  function ringAtoms(kind, frag, center, xAx, yAx, zAx) {
    const Rc = 1.395, Rh = kind === 'c6f6' ? 1.33 : 1.08;
    const qC = kind === 'c6f6' ? 0.105 : (kind === 'cat' ? -0.115 : -0.125);
    const qH = kind === 'c6f6' ? -0.105 : -qC;
    const elH = kind === 'c6f6' ? 'F' : 'H';
    const atoms = [];
    const localBonds = [];
    for (let i = 0; i < 6; i++) {
      const th = i * 60 * DEG;
      const c = [Rc * Math.cos(th), Rc * Math.sin(th), 0];
      const h = [(Rc + Rh) * Math.cos(th), (Rc + Rh) * Math.sin(th), 0];
      const to = (p) => vadd(center, vadd(vmul(xAx, p[0]), vadd(vmul(yAx, p[1]), vmul(zAx, p[2]))));
      const sigC = 3.48, epsC = kind === 'cat' ? 0.20 : 0.365;
      atoms.push(at('C', to(c), frag, { q: qC, sigma: sigC, eps: epsC, alpha: kind === 'cat' ? 0.78 : 1.15 }));
      const hOpt = elH === 'F'
        ? { q: qH, sigma: 2.95, eps: 0.14, alpha: 0.40 }
        : { q: qH, sigma: 2.42, eps: 0.10, alpha: kind === 'cat' ? 0.12 : 0.22 };
      atoms.push(at(elH, to(h), frag, hOpt));
      localBonds.push([i * 2, ((i + 1) % 6) * 2, 1]);
      localBonds.push([i * 2, i * 2 + 1, 1]);
    }
    return { atoms: atoms, bonds: localBonds };
  }

  function basisTilt(tiltDeg, twistDeg) {
    const t = tiltDeg * DEG, w = (twistDeg || 0) * DEG;
    // исходные оси, затем поворот вокруг z (twist) и вокруг y (tilt)
    let x = [Math.cos(w), Math.sin(w), 0];
    let y = [-Math.sin(w), Math.cos(w), 0];
    let z = [0, 0, 1];
    const rotY = (v) => [v[0] * Math.cos(t) + v[2] * Math.sin(t), v[1], -v[0] * Math.sin(t) + v[2] * Math.cos(t)];
    return { x: rotY(x), y: rotY(y), z: rotY(z) };
  }

  function buildPi(g, kindB) {
    const A = ringAtoms('bz', 'A', [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const ax = basisTilt(g.tilt || 0, g.twist || 0);
    const center = [g.off || 0, g.offy || 0, g.r];
    const B = ringAtoms(kindB, 'B', center, ax.x, ax.y, ax.z);
    const atoms = A.atoms.concat(B.atoms);
    const bonds = A.bonds.concat(B.bonds.map(b => [b[0] + 12, b[1] + 12, 1]));
    const cA = { x: 0, y: 0, z: 0 }, cB = { x: center[0], y: center[1], z: center[2] };
    const line = [cA, cB];
    // для T-формы подпись угла между плоскостями — сам наклон
    recenter(atoms, line);
    const nameB = kindB === 'c6f6' ? 'C6F6' : 'C6H6';
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([
        ['высота центра', g.r, 'Å'],
        ['смещение', Math.hypot(g.off || 0, g.offy || 0), 'Å'],
        ['наклон', g.tilt || 0, '°'],
        [nameB === 'C6H6' ? 'R центров' : 'R центров', Math.hypot(g.r, g.off || 0, g.offy || 0), 'Å']
      ])
    };
  }

  function buildCation(g, spec) {
    const ring = ringAtoms('cat', 'A', [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const pos = [g.off || 0, g.offy || 0, g.r];
    const extra = [];
    const bonds = ring.bonds.slice();
    if (spec.kind === 'ion') {
      extra.push(at(spec.el, pos, 'B', { q: spec.q, sigma: spec.sigma, eps: spec.eps, alpha: spec.alpha }));
    } else if (spec.kind === 'nh4') {
      const qH = 0.42, qN = -0.68;
      const N = at('N', pos, 'B', { q: qN, sigma: 3.15, eps: 0.35, alpha: 0.9 });
      extra.push(N);
      const base = 12;
      // один H вверх, три вниз-вбок
      extra.push(at('H', vadd(pos, [0, 0, 1.02]), 'B', { q: qH, eps: 0.02, sigma: 1.6, alpha: 0.05 }));
      bonds.push([base, base + 1]);
      for (let k = 0; k < 3; k++) {
        const az = k * 120 * DEG;
        const dir = [Math.sin(109.47 * DEG) * Math.cos(az), Math.sin(109.47 * DEG) * Math.sin(az), Math.cos(109.47 * DEG)];
        extra.push(at('H', vadd(pos, vmul(dir, 1.02)), 'B', { q: qH, eps: 0.02, sigma: 1.6, alpha: 0.05 }));
        bonds.push([base, base + 2 + k]);
      }
    } else if (spec.kind === 'nme4') {
      const qC = 0.10, qN = -0.20, qH = 0.10;
      // 4*0.10 + (−0.20) + 12*0.10 = 0.4 - 0.2 + 1.2 = 1.4. Слишком много.
      // N −0.4? Let me set: each methyl group net +0.25, N 0.
      const N = at('N', pos, 'B', { q: 0.0, sigma: 3.2, eps: 0.25, alpha: 0.8 });
      extra.push(N);
      const base = 12;
      const dirs = [[0, 0, 1]];
      for (let k = 0; k < 3; k++) {
        const az = k * 120 * DEG;
        dirs.push([Math.sin(109.47 * DEG) * Math.cos(az), Math.sin(109.47 * DEG) * Math.sin(az), Math.cos(109.47 * DEG)]);
      }
      dirs.forEach((d, i) => {
        const Cpos = vadd(pos, vmul(norm(d), 1.48));
        extra.push(at('C', Cpos, 'B', { q: -0.20, sigma: 3.4, eps: 0.28, alpha: 1.0 }));
        bonds.push([base, base + 1 + i * 4]);
        const away = norm(d);
        const n = perpPrefer(away, [1, 0, 0]);
        for (let h = 0; h < 3; h++) {
          const az = h * 120 * DEG;
          const hd = norm(vadd(vmul(away, Math.cos(109 * DEG)), vmul(
            vadd(vmul(n, Math.cos(az)), vmul(cross(away, n), Math.sin(az))),
            Math.sin(109 * DEG))));
          extra.push(at('H', vadd(Cpos, vmul(hd, 1.09)), 'B', { q: 0.10, eps: 0.03, sigma: 2.2, alpha: 0.1 }));
          bonds.push([base + 1 + i * 4, base + 1 + i * 4 + 1 + h]);
        }
      });
      // charge: N 0 + 4*(−0.20) + 12*(0.10) = −0.8 + 1.2 = +0.4. Fix N to +0.6.
      extra[0].q = 0.6;
    }
    const atoms = ring.atoms.concat(extra);
    const cen = { x: 0, y: 0, z: 0 };
    const ionP = { x: pos[0], y: pos[1], z: pos[2] };
    const line = [cen, ionP];
    recenter(atoms, line);
    const R = Math.hypot(g.r, g.off || 0, g.offy || 0);
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([
        ['высота над кольцом', g.r, 'Å'],
        ['боковой сдвиг', Math.hypot(g.off || 0, g.offy || 0), 'Å'],
        ['R до центра', R, 'Å']
      ])
    };
  }

  function buildCHPi(g, kind) {
    const ring = ringAtoms('bz', 'A', [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    // H на оси, r — расстояние H···центр; угол C–H···центр
    const Hoff = [g.off || 0, 0, 0];
    const Hz = Math.sqrt(Math.max(0.25, g.r * g.r - Hoff[0] * Hoff[0]));
    const Hpos = [Hoff[0], 0, Hz];
    const cen = [0, 0, 0];
    const placed = placeFront(cen, Hpos, kind === 'chcl3' ? 1.09 : 1.09, g.ang);
    // placeFront puts front at distance r from apex along the angle. We want C at 1.09 from H, opposite the centroid when ang=180.
    // placeFront(back=centroid, apex=H, r=bond, ang) : angle centroid–H–C.
    const Cpos = placed.front;
    const atoms = ring.atoms.slice();
    const bonds = ring.bonds.slice();
    const base = atoms.length;
    if (kind === 'ch4') {
      const qH = 0.045, qC = -0.225;
      atoms.push(at('C', Cpos, 'B', { q: qC, sigma: 3.55, eps: 0.07, alpha: 0.8 }));
      atoms.push(at('H', Hpos, 'B', { q: 0.09, eps: 0.008, sigma: 1.6, alpha: 0.08 }));
      bonds.push([base, base + 1]);
      const axis = norm(vsub(Cpos, Hpos));
      const n = perpPrefer(axis, [1, 0, 0]);
      for (let k = 0; k < 3; k++) {
        const az = k * 120 * DEG;
        const d = norm(vadd(vmul(axis, Math.cos(109.47 * DEG)), vmul(
          vadd(vmul(n, Math.cos(az)), vmul(cross(axis, n), Math.sin(az))),
          Math.sin(109.47 * DEG))));
        atoms.push(at('H', vadd(Cpos, vmul(d, 1.09)), 'B', { q: qH, eps: 0.04, sigma: 2.4, alpha: 0.15 }));
        bonds.push([base, atoms.length - 1]);
      }
    } else {
      // CHCl3: H положительнее, Cl отрицательные
      const qH = 0.28, qC = 0.05, qCl = -0.11;
      atoms.push(at('C', Cpos, 'B', { q: qC, sigma: 3.4, eps: 0.30, alpha: 1.2 }));
      atoms.push(at('H', Hpos, 'B', { q: qH, eps: 0.02, sigma: 1.8, alpha: 0.15 }));
      bonds.push([base, base + 1]);
      const axis = norm(vsub(Cpos, Hpos));
      const n = perpPrefer(axis, [1, 0, 0]);
      for (let k = 0; k < 3; k++) {
        const az = k * 120 * DEG;
        const d = norm(vadd(vmul(axis, Math.cos(109.5 * DEG)), vmul(
          vadd(vmul(n, Math.cos(az)), vmul(cross(axis, n), Math.sin(az))),
          Math.sin(109.5 * DEG))));
        atoms.push(at('Cl', vadd(Cpos, vmul(d, 1.76)), 'B', { q: qCl, eps: 1.0, sigma: 3.45, alpha: 2.0 }));
        bonds.push([base, atoms.length - 1]);
      }
    }
    const line = [p3(cen), { x: Hpos[0], y: Hpos[1], z: Hpos[2] }];
    const angPts = [p3(cen), { x: Hpos[0], y: Hpos[1], z: Hpos[2] }, { x: Cpos[0], y: Cpos[1], z: Cpos[2] }];
    const ang = angAt(cen, Hpos, Cpos);
    recenter(atoms, line.concat(angPts));
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [angPts], holes: [], shells: [],
      metrics: metricRows([
        ['H···центр', Math.hypot(Hpos[0], Hpos[1], Hpos[2]), 'Å'],
        ['угол C–H···π', ang, '°'],
        ['сдвиг', Math.abs(g.off || 0), 'Å']
      ]),
      dir: hbDir({ ang: ang, rHA: g.r, angA: null }, { E0: kind === 'chcl3' ? 3.2 : 1.2, n: 2, r0: kind === 'chcl3' ? 2.5 : 2.7, w: 0.55 })
    };
  }

  function buildChalcogen(g, spec) {
    // R2Ch: Ch в нуле, два углерода, σ-дырки напротив связей
    const cang = (spec.angle || 100) * DEG;
    const bond = spec.bond;
    const half = cang / 2;
    const C1 = [Math.sin(half) * bond, 0, -Math.cos(half) * bond];
    const C2 = [-Math.sin(half) * bond, 0, -Math.cos(half) * bond];
    const qCh = -2 * spec.qC - 6 * spec.qH - 2 * spec.qHole;
    const Ch = at(spec.el, [0, 0, 0], 'A', { q: qCh, eps: spec.eps, sigma: spec.sigma, alpha: spec.alpha });
    const atoms = [Ch];
    const bonds = [];
    // метилы
    const n = [0, 1, 0];
    const m1 = addMethyl(C1, norm(C1), n, 'A', spec.qC, spec.qH);
    const m2 = addMethyl(C2, norm(C2), n, 'A', spec.qC, spec.qH);
    // пересоберём индексы вручную
    const all = [Ch];
    const bds = [];
    function append(frag, attachTo) {
      const base = all.length;
      frag.atoms.forEach(a => all.push(a));
      frag.bonds.forEach(b => bds.push([b[0] + base, b[1] + base, b[2] || 1]));
      bds.push([attachTo, base, 1]);
    }
    append(m1, 0);
    append(m2, 0);
    // дырки: продолжение связей C→Ch за халькоген (противоположно углероду)
    const h1 = vmul(norm(vsub([0, 0, 0], C1)), spec.holeD);
    const h2 = vmul(norm(vsub([0, 0, 0], C2)), spec.holeD);
    all.push(at(spec.el, h1, 'A', { q: spec.qHole, site: true, role: 'hole', eps: 0, sigma: 0, alpha: 0 }));
    all.push(at(spec.el, h2, 'A', { q: spec.qHole, site: true, role: 'hole', eps: 0, sigma: 0, alpha: 0 }));
    // акцептор подходит вдоль первой дырки (направление h1)
    const axis = norm(h1);
    const apex = [0, 0, 0];
    const back = C1; // угол C–Ch···B, 180 = вдоль дырки
    // placeFront: угол back-apex-front. back=C1, apex=Ch=0, направление дырки противоположно C1, то есть 180° даёт front вдоль h1.
    const placed = placeFront(C1, apex, g.r, g.ang);
    const fr = frameAt(vmul(placed.dir, -1), g.angA || 160, g.dih || 0);
    let acc, accBonds;
    if (spec.base === 'N') {
      acc = ammonia(placed.front, placed.dir, fr.n, 'B', 0.34);
      // азот смотрит неподелённой парой на халькоген: bisector гидрогенов дальше, то есть bis = placed.dir
      // ammonia() ставит H вдоль bis. Нам нужно, чтобы неподелённая пара (против bis) смотрела на Ch,
      // значит bis (направление к H) = placed.dir (дальше от Ch). Да, bis = placed.dir. Пересоберём.
      acc = ammonia(placed.front, placed.dir, fr.n, 'B', 0.34);
    } else {
      acc = formaldehyde(placed.front, placed.dir, fr.n, 'B', spec.qO || -0.50);
    }
    const base = all.length;
    acc.bonds.forEach(b => bds.push([b[0] + base, b[1] + base, b[2] || 1]));
    acc.atoms.forEach(a => all.push(a));
    const acc0 = acc.atoms[0];
    const ang = angAt(C1, apex, xyz(acc0));
    const line = [p3(apex), p3(xyz(acc0))];
    const angles = [[p3(C1), p3(apex), p3(xyz(acc0))]];
    const holes = [p3(h1), p3(h2)];
    recenter(all, line.concat(angles[0], holes));
    return {
      atoms: all, bonds: bds, line: line, angles: angles, holes: holes, shells: [],
      metrics: metricRows([
        [spec.el + '···' + (spec.base === 'N' ? 'N' : 'O'), dist(all[0], all[base]), 'Å'],
        ['угол C–' + spec.el + '···B', ang, '°']
      ])
    };
  }

  function buildAr(g) {
    const A = at('Ar', [0, 0, 0], 'A', { q: 0, sigma: 3.385, eps: 1.0, alpha: 0 });
    const B = at('Ar', [g.r, 0, 0], 'B', { q: 0, sigma: 3.385, eps: 1.0, alpha: 0 });
    const atoms = [A, B];
    const line = [p3(xyz(A)), p3(xyz(B))];
    recenter(atoms, line);
    return {
      atoms: atoms, bonds: [], line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([['Ar···Ar', g.r, 'Å']])
    };
  }

  function methane(pos, frag, axis) {
    const qH = 0.055, qC = -0.22;
    const C = at('C', pos, frag, { q: qC, sigma: 3.50, eps: 0.42, alpha: 1.0 });
    const atoms = [C];
    const bonds = [];
    const dirs = [[0, 0, 1]];
    const ax = norm(axis || [0, 0, 1]);
    // тетраэдр относительно axis
    const n = perpPrefer(ax, [1, 0, 0]);
    const four = [ax];
    for (let k = 0; k < 3; k++) {
      const az = k * 120 * DEG;
      four.push(norm(vadd(vmul(ax, Math.cos(109.47 * DEG)), vmul(
        vadd(vmul(n, Math.cos(az)), vmul(cross(ax, n), Math.sin(az))),
        Math.sin(109.47 * DEG)))));
    }
    four.forEach((d, i) => {
      atoms.push(at('H', vadd(pos, vmul(d, 1.09)), frag, { q: qH, eps: 0.05, sigma: 2.50, alpha: 0.2 }));
      bonds.push([0, i + 1]);
    });
    return { atoms: atoms, bonds: bonds };
  }

  function buildCH4pair(g) {
    const A = methane([0, 0, 0], 'A', [0, 0, 1]);
    const ang = (g.ang || 0) * DEG;
    const axis = [Math.sin(ang), 0, Math.cos(ang)];
    const B = methane([g.r, 0, 0], 'B', axis);
    const atoms = A.atoms.concat(B.atoms.map(a => a));
    const bonds = A.bonds.concat(B.bonds.map(b => [b[0] + A.atoms.length, b[1] + A.atoms.length]));
    const line = [{ x: 0, y: 0, z: 0 }, { x: g.r, y: 0, z: 0 }];
    recenter(atoms, line);
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([['C···C', g.r, 'Å'], ['поворот', g.ang || 0, '°']]),
      mol: { eps: 1.15, sigma: 3.58, mu: 0, alpha: 2.6, I: 12.6 }
    };
  }

  function buildHCl(g) {
    const q = 0.176, bl = 1.275;
    // Диполи в плоскости yz, центры разведены по x. ang = 0 — диполь +z, 180 — антипараллель.
    function mol(pos, ang, frag) {
      const ax = [0, Math.sin(ang * DEG), Math.cos(ang * DEG)];
      const Cl = at('Cl', vadd(pos, vmul(ax, -bl * 0.5)), frag, { q: -q, sigma: 3.55, eps: 1.15, alpha: 2.3 });
      const H = at('H', vadd(pos, vmul(ax, bl * 0.5)), frag, { q: q, eps: 0.03, sigma: 1.9, alpha: 0.3 });
      return { atoms: [Cl, H], bonds: [[0, 1]] };
    }
    const A = mol([0, 0, 0], 0, 'A');
    const B = mol([g.r, 0, 0], g.ang, 'B');
    const atoms = A.atoms.concat(B.atoms);
    const bonds = [[0, 1], [2, 3]];
    const line = [p3(xyz(A.atoms[0])), p3(xyz(B.atoms[0]))];
    const ang = angAt(xyz(A.atoms[1]), xyz(A.atoms[0]), xyz(B.atoms[0]));
    recenter(atoms, line);
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([
        ['Cl···Cl', dist(atoms[0], atoms[2]), 'Å'],
        ['угол диполя 2', g.ang, '°']
      ]),
      mol: { eps: 2.4, sigma: 3.55, mu: 1.08, alpha: 2.63, I: 12.74 }
    };
  }

  function buriedArea(r, R) {
    if (r >= 2 * R) return 0;
    const rr = Math.max(r, 0.4);
    const h = R - rr / 2;
    if (h <= 0) return 0;
    return 2 * 2 * Math.PI * R * h;
  }

  function buildHydro(g, spec) {
    // две молекулы, r — расстояние центров; площадь по эффективной сфере R
    let atoms, bonds, shells;
    if (spec.shape === 'ch4') {
      const A = methane([0, 0, 0], 'A', [1, 0, 0]);
      const B = methane([g.r, 0, 0], 'B', [-1, 0, 0]);
      atoms = A.atoms.concat(B.atoms);
      bonds = A.bonds.concat(B.bonds.map(b => [b[0] + 5, b[1] + 5]));
    } else if (spec.shape === 'c2') {
      function eth(pos, frag, sign) {
        const C1 = at('C', pos, frag, { q: -0.18, sigma: 3.5, eps: 0.32, alpha: 0.9 });
        const C2 = at('C', vadd(pos, [sign * 1.53, 0, 0]), frag, { q: -0.18, sigma: 3.5, eps: 0.32, alpha: 0.9 });
        const out = [];
        out.push(C1, C2);
        const b = [[0, 1]];
        [[C1, -sign], [C2, sign]].forEach((pair, idx) => {
          const c = pair[0], s = pair[1];
          for (let k = 0; k < 3; k++) {
            const az = (k * 120 + idx * 60) * DEG;
            const d = norm([s * Math.cos(109 * DEG), Math.sin(109 * DEG) * Math.cos(az), Math.sin(109 * DEG) * Math.sin(az)]);
            out.push(at('H', vadd(xyz(c), vmul(d, 1.09)), frag, { q: 0.06, eps: 0.04, sigma: 2.4, alpha: 0.15 }));
            b.push([idx, out.length - 1]);
          }
        });
        return { atoms: out, bonds: b };
      }
      const A = eth([0, 0, 0], 'A', -1);
      const B = eth([g.r, 0, 0], 'B', 1);
      atoms = A.atoms.concat(B.atoms);
      bonds = A.bonds.concat(B.bonds.map(b => [b[0] + A.atoms.length, b[1] + A.atoms.length]));
    } else {
      const A = ringAtoms('bz', 'A', [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
      const B = ringAtoms('bz', 'B', [g.r, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
      atoms = A.atoms.concat(B.atoms);
      bonds = A.bonds.concat(B.bonds.map(b => [b[0] + 12, b[1] + 12]));
    }
    // у гидрофобной модели ЛДж на атомах гасим, стенку даёт отдельный член (иначе двойной счёт)
    atoms.forEach(a => { a.eps = 0; a.q = 0; a.alpha = 0; });
    const line = [{ x: 0, y: 0, z: 0 }, { x: g.r, y: 0, z: 0 }];
    shells = [
      { x: 0, y: 0, z: 0, r: spec.R * 0.72 },
      { x: g.r, y: 0, z: 0, r: spec.R * 0.72 }
    ];
    recenter(atoms, line.concat(shells));
    const area = buriedArea(g.r, spec.R);
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [], holes: [], shells: shells,
      metrics: metricRows([
        ['R центров', g.r, 'Å'],
        ['скрытая площадь', area, 'Å²']
      ]),
      hydro: { area: area, R: spec.R, p: spec.p, sig: spec.sig, well: spec.well }
    };
  }

  function hydroParts(block, g) {
    const T = g.T || 298.15;
    const T0 = 298.15;
    const p = block.hydro.p;
    const gs = g.gscale == null ? 1 : g.gscale;
    const A = block.hydro.area;
    const cp = p.cp;
    const h = (p.h0 + cp * (T - T0)) * gs;
    const s = (p.s0 + cp * Math.log(T / T0)) * gs;
    const enth = h * A;
    const entr = -T * s * A;
    // мягкая стенка + небольшая дисперсионная яма (контакт в воде)
    const r = Math.max(g.r, 0.5);
    const sig = block.hydro.sig;
    const sr6 = Math.pow(sig / r, 6);
    const ee = block.hydro.well;
    return { elec: 0, ind: 0, disp: -4 * ee * sr6, exch: 4 * ee * sr6 * sr6, dir: 0, enth: enth, entr: entr, keesom: 0, debye: 0, london: 0 };
  }

  function buildNaCl(g) {
    const Na = at('Na', [0, 0, 0], 'A', { q: 1, eps: 0, sigma: 0, alpha: 0, wall: { el: 'Cl', A: 4740, rho: 0.72 } });
    const Cl = at('Cl', [g.r, 0, 0], 'B', { q: -1, eps: 0, sigma: 0, alpha: 0 });
    const atoms = [Na, Cl];
    const line = [p3([0, 0, 0]), p3([g.r, 0, 0])];
    recenter(atoms, line);
    return {
      atoms: atoms, bonds: [], line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([['Na⁺···Cl⁻', g.r, 'Å']])
    };
  }

  function buildSalt(g) {
    // карбоксилат в плоскости xy, гуанидиний справа, r = N···O
    const Oy = 1.15;
    const qO = -0.78, qCc = 0.64, qCm = -0.08;
    const O1 = at('O', [0, Oy, 0], 'A', { q: qO, sigma: 3.15, eps: 0.55, alpha: 0.7 });
    const O2 = at('O', [0, -Oy, 0], 'A', { q: qO, sigma: 3.15, eps: 0.55, alpha: 0.7 });
    const Cc = at('C', [-0.70, 0, 0], 'A', { q: qCc, sigma: 3.4, eps: 0.2, alpha: 1.1 });
    const Cm = at('C', [-2.20, 0, 0], 'A', { q: qCm, sigma: 3.5, eps: 0.25, alpha: 1.0 });
    const atoms = [O1, O2, Cc, Cm];
    const bonds = [[0, 2, 2], [1, 2, 1], [2, 3, 1]];
    // метильные H
    for (let k = 0; k < 3; k++) {
      const az = k * 120 * DEG;
      const d = [-Math.cos(109 * DEG), Math.sin(109 * DEG) * Math.cos(az), Math.sin(109 * DEG) * Math.sin(az)];
      atoms.push(at('H', vadd([-2.20, 0, 0], vmul(norm(d), 1.09)), 'A', { q: 0, eps: 0.03, sigma: 2.2, alpha: 0.1 }));
      bonds.push([3, atoms.length - 1]);
    }
    // гуанидиний: N···O = r, два N напротив двух O
    const Nx = g.r;
    const qN = -0.75, qHg = 0.42, qCg = 0.64;
    // 3*(-0.75)+0.64+6*0.42 = -2.25+0.64+2.52 = 0.91 ≈ +1. Подправим C.
    const Cg = at('C', [Nx + 0.665, 0, 0], 'B', { q: 0.73, sigma: 3.35, eps: 0.2, alpha: 1.0 });
    const N1 = at('N', [Nx, Oy, 0], 'B', { q: qN, sigma: 3.35, eps: 0.70, alpha: 0.9 });
    const N2 = at('N', [Nx, -Oy, 0], 'B', { q: qN, sigma: 3.35, eps: 0.70, alpha: 0.9 });
    const N3 = at('N', [Nx + 0.665 + 1.33, 0, 0], 'B', { q: qN, sigma: 3.35, eps: 0.70, alpha: 0.9 });
    const gAtoms = [Cg, N1, N2, N3];
    const baseG = atoms.length;
    atoms.push(Cg, N1, N2, N3);
    bonds.push([baseG, baseG + 1], [baseG, baseG + 2], [baseG, baseG + 3]);
    function nh(Nidx, toward, outward) {
      const Np = xyz(atoms[Nidx]);
      const h1 = vadd(Np, vmul(norm(toward), 1.01));
      const h2 = vadd(Np, vmul(norm(outward), 1.01));
      atoms.push(at('H', h1, 'B', { q: qHg, eps: 0, sigma: 0, alpha: 0.05 }));
      bonds.push([Nidx, atoms.length - 1]);
      atoms.push(at('H', h2, 'B', { q: qHg, eps: 0.02, sigma: 1.5, alpha: 0.05 }));
      bonds.push([Nidx, atoms.length - 1]);
    }
    nh(baseG + 1, [-1, 0, 0], [0.2, 1, 0]);
    nh(baseG + 2, [-1, 0, 0], [0.2, -1, 0]);
    nh(baseG + 3, [1, 0, 0], [0.3, 0.4, 0.8]);
    const line = [p3(xyz(O1)), p3(xyz(N1))];
    const angles = [[p3(xyz(Cc)), p3(xyz(O1)), p3(xyz(N1))]];
    recenter(atoms, line.concat(angles[0]));
    const no = dist(atoms[0], atoms[baseG + 1]);
    return {
      atoms: atoms, bonds: bonds, line: line, angles: angles, holes: [], shells: [],
      metrics: metricRows([
        ['N···O', no, 'Å'],
        ['O···O', dist(atoms[0], atoms[1]), 'Å']
      ])
    };
  }

  function buildNaWater(g) {
    const qH = 0.41;
    const Na = at('Na', [0, 0, 0], 'A', {
      q: 1, eps: 0.08, sigma: 2.35, alpha: 0.12,
      wall: { el: 'O', A: 10500, rho: 0.37 }
    });
    // вода: кислород на оси z, угол поворота ang (0 = O к катиону, H наружу)
    const ang = (g.ang || 0) * DEG;
    const bis = [Math.sin(ang), 0, Math.cos(ang)];
    const n = [0, 1, 0];
    const Opos = [0, 0, g.r];
    const half = 52.26 * DEG;
    const O = at('O', Opos, 'B', { q: -2 * qH, sigma: 3.15, eps: 0.25, alpha: 0.95 });
    const d1 = norm(vadd(vmul(bis, Math.cos(half)), vmul(n, Math.sin(half))));
    const d2 = norm(vadd(vmul(bis, Math.cos(half)), vmul(n, -Math.sin(half))));
    const H1 = at('H', vadd(Opos, vmul(d1, 0.957)), 'B', { q: qH, eps: 0, sigma: 0, alpha: 0.1 });
    const H2 = at('H', vadd(Opos, vmul(d2, 0.957)), 'B', { q: qH, eps: 0, sigma: 0, alpha: 0.1 });
    const atoms = [Na, O, H1, H2];
    const bonds = [[1, 2], [1, 3]];
    const line = [p3([0, 0, 0]), p3(Opos)];
    recenter(atoms, line);
    return {
      atoms: atoms, bonds: bonds, line: line, angles: [], holes: [], shells: [],
      metrics: metricRows([
        ['Na⁺···O', g.r, 'Å'],
        ['поворот воды', g.ang || 0, '°']
      ])
    };
  }

  // аналитика Кеезома / Дебая / Лондона, кДж/моль
  const eC = 1.602176634e-19;
  const eps0 = 8.8541878128e-12;
  const kB = 1.380649e-23;
  const NA = 6.02214076e23;
  const Deb = 3.335640951981521e-30;
  function toKJ(J) { return J * NA / 1000; }
  function keesomE(mu1, mu2, r, T) {
    if (!mu1 || !mu2) return 0;
    const u1 = mu1 * Deb, u2 = mu2 * Deb;
    const rr = Math.max(r, 0.3) * 1e-10;
    const pref = 1 / (4 * Math.PI * eps0);
    const U = -(u1 * u1 * u2 * u2) * pref * pref / (3 * kB * T * Math.pow(rr, 6));
    return toKJ(U);
  }
  function debyeE(mu1, a2, mu2, a1, r) {
    const aSI = (a) => (a || 0) * 4 * Math.PI * eps0 * 1e-30;
    const u1 = (mu1 || 0) * Deb, u2 = (mu2 || 0) * Deb;
    const rr = Math.max(r, 0.3) * 1e-10;
    const pref = 1 / (4 * Math.PI * eps0);
    const U = -(u1 * u1 * aSI(a2) + u2 * u2 * aSI(a1)) * pref * pref / Math.pow(rr, 6);
    return toKJ(U);
  }
  function londonE(a1, I1, a2, I2, r) {
    const A1 = a1 * 1e-30, A2 = a2 * 1e-30;
    const i1 = I1 * eC, i2 = I2 * eC;
    const Ired = (i1 * i2) / (i1 + i2);
    const rr = Math.max(r, 0.3) * 1e-10;
    const U = -1.5 * Ired * A1 * A2 / Math.pow(rr, 6);
    return toKJ(U);
  }

  function avgVdW(mol, r, T, buck) {
    const rm = mol.sigma * Math.pow(2, 1 / 6);
    let attr, exch;
    if (buck) {
      const b = buckPair(mol.eps, mol.sigma, r);
      attr = b.disp; exch = b.exch;
    } else {
      const sr6 = Math.pow(mol.sigma / Math.max(r, 0.3), 6);
      attr = -4 * mol.eps * sr6;
      exch = 4 * mol.eps * sr6 * sr6;
    }
    const Ek = Math.abs(keesomE(mol.mu, mol.mu, r, T));
    const Ed = Math.abs(debyeE(mol.mu, mol.alpha, mol.mu, mol.alpha, r));
    const El = Math.abs(londonE(mol.alpha, mol.I, mol.alpha, mol.I, r));
    const s = Ek + Ed + El || 1;
    return {
      elec: 0, ind: 0, disp: 0, dir: 0, enth: 0, entr: 0,
      keesom: attr * Ek / s,
      debye: attr * Ed / s,
      london: attr * El / s,
      exch: exch
    };
  }
  function buckPair(eps, sigma, r) {
    const rm = sigma * Math.pow(2, 1 / 6);
    const C6 = 2 * eps * Math.pow(rm, 6);
    const b = 12 / rm;
    const A = eps * Math.exp(12);
    const x = b * Math.max(r, 0.2);
    return { disp: -f6TT(x) * C6 / Math.pow(Math.max(r, 0.2), 6), exch: A * Math.exp(-Math.min(x, 60)) };
  }

  const PARTS = {
    std: [
      ['elec', 'Электростатика', '#2563eb'],
      ['ind', 'Индукция', '#7c3aed'],
      ['disp', 'Дисперсия', '#d97706'],
      ['exch', 'Отталкивание', '#dc2626'],
      ['dir', 'Направленный член', '#059669']
    ],
    vdw: [
      ['elec', 'Диполь–диполь (ориентация)', '#2563eb'],
      ['ind', 'Индукция', '#7c3aed'],
      ['disp', 'Дисперсия (Лондон)', '#d97706'],
      ['exch', 'Отталкивание', '#dc2626']
    ],
    avg: [
      ['keesom', 'Кеезом (усреднение)', '#2563eb'],
      ['debye', 'Дебай', '#7c3aed'],
      ['london', 'Лондон', '#d97706'],
      ['exch', 'Отталкивание', '#dc2626']
    ],
    hp: [
      ['enth', 'ΔH (площадь)', '#ea580c'],
      ['entr', '−TΔS', '#0284c7'],
      ['disp', 'Дисперсия контакта', '#d97706'],
      ['exch', 'Стерическая стенка', '#dc2626']
    ],
    hb: [
      ['elec', 'Электростатика', '#2563eb'],
      ['ind', 'Индукция', '#7c3aed'],
      ['disp', 'Дисперсия', '#d97706'],
      ['exch', 'Отталкивание', '#dc2626'],
      ['dir', 'Перенос заряда', '#059669']
    ],
    hole: [
      ['elec', 'Электростатика остова', '#2563eb'],
      ['dir', 'σ-дырка', '#dc2626'],
      ['ind', 'Индукция', '#7c3aed'],
      ['disp', 'Дисперсия', '#d97706'],
      ['exch', 'Отталкивание', '#b45309']
    ]
  };

  function partList(keys, parts) {
    return keys.map(k => ({ key: k[0], name: k[1], color: k[2], value: parts[k[0]] || 0 }));
  }

  const DISCLAIMER = 'Упрощённая учебная модель: точечные заряды, изотропная поляризация и потенциал Леннард-Джонса (или Бэкингема). Она показывает, как энергия зависит от геометрии и какого порядка величина, и не заменяет расчёт CCSD(T) или силовое поле с параметрами под конкретную пару.';

  const TYPES = [
    { id: 'hb', name: 'Водородная связь', color: '#0284c7' },
    { id: 'xb', name: 'Галогенная связь', color: '#7c3aed' },
    { id: 'chb', name: 'Халькогенная связь', color: '#c2410c' },
    { id: 'vdw', name: 'Ван-дер-Ваальс', color: '#0f766e' },
    { id: 'hp', name: 'Гидрофобный эффект', color: '#475569' },
    { id: 'pp', name: 'π–π стэкинг', color: '#d97706' },
    { id: 'cat', name: 'Катион–π', color: '#059669' },
    { id: 'chpi', name: 'CH–π', color: '#0369a1' },
    { id: 'el', name: 'Электростатика', color: '#e11d48' }
  ];

  function ctrl(key, label, min, max, step, unit) {
    return { key: key, label: label, min: min, max: max, step: step, unit: unit };
  }

  const commonQ = [
    ctrl('eps', 'Диэлектрическая проницаемость ε', 1, 80, 0.5, ''),
    ctrl('qscale', 'Масштаб зарядов', 0.4, 1.6, 0.02, '×'),
    ctrl('ascale', 'Масштаб поляризуемости', 0, 2, 0.05, '×')
  ];

  const lesson = {};

  lesson.hb = {
    equations: [
      { tex: 'E = E_{\\mathrm{эл}} + E_{\\mathrm{инд}} + E_{\\mathrm{дисп}} + E_{\\mathrm{отт}} + E_{\\mathrm{пз}}', display: true },
      { tex: 'E_{\\mathrm{эл}} = \\dfrac{1}{4\\pi\\varepsilon_0\\,\\varepsilon}\\sum_{i\\in A,\\,j\\in B}\\dfrac{q_i q_j}{r_{ij}}', display: true },
      { tex: 'E_{\\mathrm{инд}} = -\\dfrac{1}{2}\\sum_k \\alpha_k |\\mathbf{F}_k|^2', display: true },
      { tex: 'E_{\\mathrm{ЛД}} = 4\\varepsilon_{ij}\\left[\\left(\\dfrac{\\sigma_{ij}}{r}\\right)^{12}-\\left(\\dfrac{\\sigma_{ij}}{r}\\right)^{6}\\right]', display: true },
      { tex: 'E_{\\mathrm{пз}} \\propto -\\cos^{n}\\!\\delta_{DHA}\\;\\exp\\!\\left(-\\dfrac{(r_{HA}-r_0)^2}{2w^2}\\right)', display: true }
    ],
    glossary: [
      ['q', 'точечный заряд в долях электрона'],
      ['ε', 'относительная диэлектрическая проницаемость (в газе ε = 1)'],
      ['α', 'поляризуемость атома, Å³'],
      ['F', 'электрическое поле другого фрагмента'],
      ['σ, ε_ЛД', 'параметры Леннард-Джонса: размер и глубина ямы пары'],
      ['δ_DHA', 'отклонение угла D–H···A от 180°'],
      ['E_пз', 'направленный член переноса заряда, маленький у умеренной H-связи']
    ],
    ranges: 'По Джеффри умеренная водородная связь (вода, спирты, амиды) — примерно 17–63 кДж/моль, расстояние H···A 1,5–2,2 Å. Слабая (часто C–H···O) — меньше 17 кДж/моль и длиннее 2,2 Å. Сильная, частично ковалентная (FHF⁻), — 63–167 кДж/моль и 1,2–1,5 Å. Димер воды в газе: O···O около 2,9 Å и около −20 кДж/моль.',
    refs: [
      'Jeffrey G. A. An Introduction to Hydrogen Bonding. Oxford University Press, 1997.',
      'Arunan E. et al. Definition of the hydrogen bond (IUPAC Recommendations 2011). Pure Appl. Chem. 2011, 83, 1637–1641.',
      'Steiner T. The hydrogen bond in the solid state. Angew. Chem. Int. Ed. 2002, 41, 48–76.'
    ]
  };

  lesson.xb = {
    equations: [
      { tex: 'E = E_{\\mathrm{остов}} + E_{\\sigma} + E_{\\mathrm{инд}} + E_{\\mathrm{дисп}} + E_{\\mathrm{отт}}', display: true },
      { tex: 'E_{\\sigma} = \\dfrac{1}{4\\pi\\varepsilon_0\\,\\varepsilon}\\dfrac{q_{\\sigma} q_{B}}{r_{\\sigma B}}', display: true },
      { tex: '\\text{предпочтение линейности: } E(\\theta) \\sim \\cos^{n}\\theta,\\quad \\theta = \\angle C{-}X{\\cdots}B', display: true }
    ],
    glossary: [
      ['q_σ', 'положительный заряд σ-дырки на продолжении связи C–X'],
      ['q_B', 'отрицательный заряд основания Льюиса (O, N)'],
      ['θ', 'угол C–X···B; по определению IUPAC связь стремится к 180°'],
      ['n', 'чем больше n, тем уже «конус» притяжения вдоль оси']
    ],
    ranges: 'Галогенная связь обычно короче суммы ван-дер-ваальсовых радиусов и почти линейна (часто > 160°). Энергия растёт в ряду Cl < Br < I и если рядом электроотрицательные заместители (CF₃, C₆F₅): от нескольких кДж/моль у C–Cl до примерно 15–30 кДж/моль у иода с хорошим основанием.',
    refs: [
      'Desiraju G. R. et al. Definition of the halogen bond (IUPAC Recommendations 2013). Pure Appl. Chem. 2013, 85, 1711–1713.',
      'Cavallo G. et al. The halogen bond. Chem. Rev. 2016, 116, 2478–2601.',
      'Politzer P., Murray J. S., Clark T. Halogen bonding and other σ-hole interactions. Phys. Chem. Chem. Phys. 2013, 15, 11178–11189.'
    ]
  };

  lesson.chb = {
    equations: [
      { tex: 'E = E_{\\mathrm{эл}} + E_{\\sigma} + E_{\\mathrm{инд}} + E_{\\mathrm{дисп}} + E_{\\mathrm{отт}}', display: true },
      { tex: '\\text{две σ-дырки напротив двух ковалентных связей } R{-}Ch', display: true }
    ],
    glossary: [
      ['Ch', 'халькоген S, Se или Te'],
      ['σ-дырка', 'область положительного потенциала на продолжении связи R–Ch'],
      ['угол R–Ch···B', 'близок к 180°, как у галогенной связи']
    ],
    ranges: 'Халькогенная связь обычно слабее галогенной у того же периода, но растёт вниз по группе: S < Se < Te. Типичные контакты S···O около 3,1–3,4 Å и несколько кДж/моль; у Te с азотом или кислородом бывает 15–25 кДж/моль. В модели это порядок величины, не константа из базы.',
    refs: [
      'Aakeroy C. B. et al. Definition of the chalcogen bond (IUPAC Recommendations 2019). Pure Appl. Chem. 2019, 91, 1889–1892.',
      'Vogel L., Wonner P., Huber S. M. Chalcogen bonding. Angew. Chem. Int. Ed. 2019, 58, 1880–1891.'
    ]
  };

  lesson.vdw = {
    equations: [
      { tex: 'E_{\\mathrm{Кеезом}} = -\\dfrac{1}{3}\\dfrac{\\mu_1^2\\mu_2^2}{(4\\pi\\varepsilon_0)^2 k_B T\\, r^6}', display: true },
      { tex: 'E_{\\mathrm{Дебай}} = -\\dfrac{\\mu_1^2\\alpha_2 + \\mu_2^2\\alpha_1}{(4\\pi\\varepsilon_0)^2 r^6}', display: true },
      { tex: 'E_{\\mathrm{Лондон}} = -\\dfrac{3}{2}\\dfrac{I_1 I_2}{I_1+I_2}\\dfrac{\\alpha_1\\alpha_2}{r^6}', display: true },
      { tex: 'E_{\\mathrm{ЛД}} = 4\\varepsilon\\left[\\left(\\dfrac{\\sigma}{r}\\right)^{12}-\\left(\\dfrac{\\sigma}{r}\\right)^{6}\\right]', display: true },
      { tex: 'E_{\\mathrm{Бэк}} = A e^{-br} - f_6(br)\\,\\dfrac{C_6}{r^6}', display: true }
    ],
    glossary: [
      ['μ', 'дипольный момент, дебай'],
      ['α', 'поляризуемость (объёмная), Å³'],
      ['I', 'энергия ионизации'],
      ['T', 'температура: в формуле Кеезома притяжение слабеет при нагреве'],
      ['f_6', 'демпфирование Танга–Тённиса, чтобы −C6/r^6 не побеждало на очень коротком r']
    ],
    ranges: 'Ar···Ar: минимум около 3,8 Å и около −1 кДж/моль — почти чистый Лондон. CH₄···CH₄ чуть глубже, тоже дисперсия. У HCl есть постоянный диполь: при фиксированной ориентации электростатика может быть сильнее кеесомовского среднего. Само среднее Кеезома справедливо, только если энергия ориентации меньше kT; на коротком расстоянии смотрите режим «как в 3D». В яме Леннард-Джонса притяжение −2ε, отталкивание +ε, итог −ε.',
    refs: [
      'London F. Zur Theorie und Systematik der Molekularkräfte. Z. Phys. 1930, 63, 245–279.',
      'Israelachvili J. N. Intermolecular and Surface Forces. Academic Press.',
      'Lennard-Jones J. E. Cohesion. Proc. Phys. Soc. 1931, 43, 461–482.',
      'Buckingham R. A. The classical equation of state of gaseous helium, neon and argon. Proc. R. Soc. Lond. A 1938, 168, 264–283.'
    ]
  };

  lesson.hp = {
    equations: [
      { tex: '\\Delta G(T) = \\Delta H - T\\Delta S + \\Delta C_p\\left[(T-T_0) - T\\ln\\dfrac{T}{T_0}\\right]', display: true },
      { tex: '\\Delta H = h(T)\\, A(r),\\quad \\Delta S = s(T)\\, A(r)', display: true },
      { tex: 'A(r) = 4\\pi R\\,(R - r/2)\\quad (r < 2R)', display: true }
    ],
    glossary: [
      ['A', 'площадь, которую две сферы «прячут» друг у друга, Å²'],
      ['R', 'эффективный радиус с первой сольватной оболочкой, не ван-дер-ваальсов радиус атома'],
      ['ΔS > 0', 'вода, отпущенная с поверхности, даёт рост энтропии — член −TΔS тянет молекулы друг к другу'],
      ['ΔC_p', 'теплоёмкость ассоциации; из-за неё зависимость от температуры не линейна'],
      ['T', 'температура, K']
    ],
    ranges: 'Для малых углеводородов в воде контактный минимум потенциала средней силы — порядка нескольких кДж/моль около 3,8–4,2 Å. Это не вакуумная энергия пары: в газе метан держит дисперсия (вкладка Ван-дер-Ваальс), в воде добавляется энтропия растворителя. Модель намеренно простая (две сферы и площадь) и чуть усилена, чтобы яму было видно на графике.',
    refs: [
      'Kauzmann W. Some factors in the interpretation of protein denaturation. Adv. Protein Chem. 1959, 14, 1–63.',
      'Chandler D. Interfaces and the driving force of hydrophobic assembly. Nature 2005, 437, 640–647.',
      'Southall N. T., Dill K. A., Haymet A. D. J. A view of the hydrophobic effect. J. Phys. Chem. B 2002, 106, 521–533.'
    ]
  };

  lesson.pp = {
    equations: [
      { tex: 'E = E_{q} + E_{\\mathrm{инд}} + E_{\\mathrm{ЛД}}', display: true },
      { tex: 'q_{\\mathrm{C}} = -q,\\quad q_{\\mathrm{H}} = +q \\quad (\\text{бензол: торец +, грани −})', display: true },
      { tex: 'q_{\\mathrm{C}} = +q,\\quad q_{\\mathrm{F}} = -q \\quad (\\text{гексафторбензол: грани +})', display: true }
    ],
    glossary: [
      ['q', 'заряд Хантера–Сандерса: π-облако против σ-каркаса, у бензола квадруполь Q_zz < 0'],
      ['высота', 'расстояние между центрами по оси стопки'],
      ['смещение', 'параллельный сдвиг, при котором стопка становится parallel-displaced'],
      ['наклон', '0° — плоскости параллельны, 90° — T-образная форма']
    ],
    ranges: 'Димер бензола: parallel-displaced и T-форма около −11 кДж/моль (−2,6 ккал/моль), сэндвич слабее — грани отталкиваются электростатически, хотя дисперсия как раз любит полное перекрытие. У C₆H₆···C₆F₆ квадруполи противоположны, и сэндвич уже выгоден. Тепловая карта — энергия при текущей высоте и наклоне, когда двигают сдвиг x и y.',
    refs: [
      'Hunter C. A., Sanders J. K. M. The nature of π–π interactions. J. Am. Chem. Soc. 1990, 112, 5525–5534.',
      'Sinnokrot M. O., Sherrill C. D. Highly accurate coupled cluster potential energy curves for the benzene dimer. J. Phys. Chem. A 2004, 108, 10200–10207.',
      'Tsuzuki S., Honda K., Uchimaru T., Mikami M., Tanabe K. Origin of attraction and directionality of the π/π interaction. J. Am. Chem. Soc. 2002, 124, 104–112.'
    ]
  };

  lesson.cat = {
    equations: [
      { tex: 'E = \\sum_{i}\\dfrac{1}{4\\pi\\varepsilon_0\\,\\varepsilon}\\dfrac{q_{+} q_i}{r_i} - \\dfrac{1}{2}\\sum_k \\alpha_k |\\mathbf{F}_k|^2 + E_{\\mathrm{ЛД}}', display: true },
      { tex: '\\text{в газе } \\varepsilon = 1;\\ \\text{в воде притяжение падает примерно как } 1/\\varepsilon \\text{ и } 1/\\varepsilon^2', display: true }
    ],
    glossary: [
      ['q₊', 'заряд катиона (+1, у NH₄⁺ и NMe₄⁺ размазан по атомам)'],
      ['q_i', 'заряды кольца: C отрицательный, H положительный — грань бензола притягивает катион'],
      ['α', 'поляризация кольца даёт заметную долю энергии, особенно у маленьких ионов'],
      ['высота', 'расстояние от центра кольца до иона вдоль нормали']
    ],
    ranges: 'В газе Na⁺·бензол около −90…−120 кДж/моль (в обзоре Догерти часто −28 ккал/моль ≈ −117 кДж/моль; модель выставлена на −100). Li⁺ ближе и сильнее, K⁺ дальше и слабее. NH₄⁺ сопоставим с K⁺, NMe₄⁺ слабее: заряд спрятан за метилами. В воде (ε ~ 80) газовое число не сохраняется.',
    refs: [
      'Dougherty D. A. The cation−π interaction. Acc. Chem. Res. 2013, 46, 885–893.',
      'Ma J. C., Dougherty D. A. The cation−π interaction. Chem. Rev. 1997, 97, 1303–1324.',
      'Mecozzi S., West A. P., Dougherty D. A. Cation−π interactions in simple aromatics. Proc. Natl. Acad. Sci. USA 1996, 93, 10566–10571.'
    ]
  };

  lesson.chpi = {
    equations: [
      { tex: 'E = E_{\\mathrm{эл}}(q_{\\mathrm{H}},\\,q_{\\pi}) + E_{\\mathrm{инд}} + E_{\\mathrm{дисп}} + E_{\\mathrm{отт}} + E_{\\mathrm{напр}}', display: true },
      { tex: 'E_{\\mathrm{напр}} \\propto -\\cos^{n}\\delta\\;\\exp\\!\\left(-\\dfrac{(r-r_0)^2}{2w^2}\\right)', display: true }
    ],
    glossary: [
      ['δ', 'отклонение угла C–H···центра кольца от 180°'],
      ['r', 'расстояние от водорода C–H до центра кольца'],
      ['π', 'отрицательная грань бензола в той же схеме зарядов, что и для π–π']
    ],
    ranges: 'CH₄···бензол — слабый контакт, около −5…−7 кДж/моль, заметная доля дисперсии. CHCl₃···бензол сильнее: водород кислее. Это не классическая водородная связь Джеффри, а мягкий CH–π контакт; угол C–H···π предпочитает быть ближе к 180°.',
    refs: [
      'Nishio M. The CH/π hydrogen bond in chemistry. Phys. Chem. Chem. Phys. 2011, 13, 13873–13900.',
      'Tsuzuki S., Fujii A. Nature and physical origin of CH/π interaction. Phys. Chem. Chem. Phys. 2008, 10, 2584–2594.'
    ]
  };

  lesson.el = {
    equations: [
      { tex: 'E_{\\mathrm{Кулон}} = \\dfrac{1}{4\\pi\\varepsilon_0\\,\\varepsilon}\\dfrac{q_1 q_2}{r}', display: true },
      { tex: 'E_{\\mathrm{ДХ}} = \\dfrac{1}{4\\pi\\varepsilon_0\\,\\varepsilon}\\dfrac{q_1 q_2}{r}\\,e^{-\\kappa r}', display: true },
      { tex: '\\kappa\\,[\\text{Å}^{-1}] \\approx 0{,}329\\sqrt{ I\\,\\dfrac{78{,}4}{\\varepsilon}\\,\\dfrac{298}{T} }', display: true },
      { tex: 'E_{\\mathrm{ион-диполь}} \\sim -\\dfrac{1}{4\\pi\\varepsilon_0\\,\\varepsilon}\\dfrac{|q|\\mu\\cos\\theta}{r^2}', display: true }
    ],
    glossary: [
      ['ε', 'диэлектрическая проницаемость: 1 в газе, ~78 у воды, в белке часто берут эффективные 4–20'],
      ['I', 'ионная сила, моль/л'],
      ['κ', 'обратная дебаевская длина; множитель 0,329 относится к воде при 25 °C и пересчитан на другие ε и T'],
      ['θ', 'угол между полем иона и диполем воды'],
      ['стенка', 'у NaCl короткое отталкивание Борна–Майера A·e^(−r/ρ), оно не делится на ε']
    ],
    ranges: 'Молекула NaCl в газе: минимум около 2,36 Å и около −410 кДж/моль. В воде тот же закон с ε = 78 даёт уже единицы–десятки кДж/моль, а постоянное ε на расстоянии контакта — грубое приближение. Солевой мостик карбоксилат···гуанидиний в газе очень глубокий; с ε ≈ 20 остаётся гораздо более мелкая яма. Na⁺···H₂O в газе около −100 кДж/моль при Na···O ≈ 2,2–2,3 Å.',
    refs: [
      'Debye P., Hückel E. Zur Theorie der Elektrolyte. Phys. Z. 1923, 24, 185–206.',
      'Honig B., Nicholls A. Classical electrostatics in biology and chemistry. Science 1995, 268, 1144–1149.',
      'Marcus Y., Hefter G. Ion pairing. Chem. Rev. 2006, 106, 4585–4621.'
    ]
  };

  function packPreset(p) {
    p.defaults = p.defaults || {};
    ['eps', 'qscale', 'ascale', 'T', 'I', 'gscale'].forEach(k => {
      if (p.defaults[k] == null) {
        if (k === 'eps' || k === 'qscale' || k === 'ascale' || k === 'gscale') p.defaults[k] = 1;
        if (k === 'T') p.defaults[k] = 298;
        if (k === 'I') p.defaults[k] = 0;
      }
    });
    return p;
  }

  const hbCtrl = [
    ctrl('r', 'Расстояние тяжёлых атомов', 2.35, 5.2, 0.01, 'Å'),
    ctrl('ang', 'Угол D–H···A', 90, 180, 1, '°'),
    ctrl('angA', 'Угол при акцепторе', 80, 180, 1, '°'),
    ctrl('dih', 'Двугранный угол', 0, 180, 1, '°')
  ].concat(commonQ);

  const PRESETS = [];

  function add(p) { PRESETS.push(packPreset(p)); }

  add({
    id: 'water', type: 'hb', name: 'Вода · O–H···O',
    group: 'донор H–O–H, акцептор H–O–H',
    build: buildWater, partKeys: 'hb', scan: 'r',
    controls: [
      ctrl('r', 'O···O', 2.35, 5.2, 0.01, 'Å'),
      ctrl('ang', 'Угол O–H···O', 90, 180, 1, '°'),
      ctrl('angA', 'Угол при акцепторе', 80, 180, 1, '°'),
      ctrl('dih', 'Двугранный угол', 0, 180, 1, '°')
    ].concat(commonQ),
    defaults: { r: 2.90, ang: 175, angA: 120, dih: 180 },
    chart2: { key: 'ang', label: 'Угол O–H···O, °' },
    blurb: 'Классический димер воды. Умеренная связь, в основном электростатика.'
  });
  add({
    id: 'amide', type: 'hb', name: 'Амид · N–H···O=C',
    group: 'формамид и формальдегид',
    build: buildAmide, partKeys: 'hb', scan: 'r',
    controls: [
      ctrl('r', 'N···O', 2.45, 5.2, 0.01, 'Å'),
      ctrl('ang', 'Угол N–H···O', 90, 180, 1, '°'),
      ctrl('angA', 'Угол H···O=C', 90, 180, 1, '°'),
      ctrl('dih', 'Двугранный угол', 0, 180, 1, '°')
    ].concat(commonQ),
    defaults: { r: 2.95, ang: 170, angA: 130, dih: 180 },
    chart2: { key: 'ang', label: 'Угол N–H···O, °' },
    blurb: 'Одна водородная связь пептидного типа, не циклический димер.'
  });
  add({
    id: 'ohn', type: 'hb', name: 'O–H···N',
    group: 'вода и аммиак',
    build: buildOHN, partKeys: 'hb', scan: 'r',
    controls: [
      ctrl('r', 'O···N', 2.40, 5.2, 0.01, 'Å'),
      ctrl('ang', 'Угол O–H···N', 90, 180, 1, '°'),
      ctrl('angA', 'Угол при азоте', 120, 180, 1, '°'),
      ctrl('dih', 'Двугранный угол', 0, 180, 1, '°')
    ].concat(commonQ),
    defaults: { r: 2.90, ang: 175, angA: 175, dih: 0 },
    chart2: { key: 'ang', label: 'Угол O–H···N, °' },
    blurb: 'Кислород — донор, азот аммиака — акцептор.'
  });
  add({
    id: 'hf', type: 'hb', name: 'F–H···F',
    group: 'димер фтороводорода',
    build: buildHF, partKeys: 'hb', scan: 'r',
    controls: [
      ctrl('r', 'F···F', 2.30, 4.8, 0.01, 'Å'),
      ctrl('ang', 'Угол F–H···F', 90, 180, 1, '°'),
      ctrl('angA', 'Угол H···F–H', 80, 180, 1, '°'),
      ctrl('dih', 'Двугранный угол', 0, 180, 1, '°')
    ].concat(commonQ),
    defaults: { r: 2.75, ang: 170, angA: 115, dih: 180 },
    chart2: { key: 'ang', label: 'Угол F–H···F, °' },
    blurb: 'Димер HF, не ион FHF⁻. Сильнее воды, но всё ещё «умеренная» связь по Джеффри.'
  });

  function addX(id, name, spec, r0, blurb) {
    add({
      id: id, type: 'xb', name: name, group: spec.group, blurb: blurb,
      build: (g) => buildCF3X(g, spec), partKeys: 'hole', scan: 'r',
      controls: [
        ctrl('r', spec.el + '···O', 2.4, 5.5, 0.01, 'Å'),
        ctrl('ang', 'Угол C–' + spec.el + '···O', 90, 180, 1, '°'),
        ctrl('angA', 'Угол ' + spec.el + '···O=C', 90, 180, 1, '°'),
        ctrl('dih', 'Двугранный угол', 0, 180, 1, '°')
      ].concat(commonQ),
      defaults: { r: r0, ang: 180, angA: 160, dih: 0 },
      chart2: { key: 'ang', label: 'Угол C–X···O, °' }
    });
  }
  addX('cf3i-o', 'CF₃I ··· O=C', {
    el: 'I', bond: 2.14, holeD: 1.05, qF: -0.18, qC: 0.42, qBelt: -0.18, qHole: 0.30, qO: -0.48,
    epsX: 1.55, sigX: 3.85, aX: 4.2, group: 'CF₃I и формальдегид'
  }, 3.05, 'Иод у CF₃: выраженная σ-дырка на продолжении связи C–I.');
  addX('cf3br-o', 'CF₃Br ··· O=C', {
    el: 'Br', bond: 1.93, holeD: 0.95, qF: -0.17, qC: 0.36, qBelt: -0.11, qHole: 0.26, qO: -0.46,
    epsX: 1.25, sigX: 3.62, aX: 2.8, group: 'CF₃Br и формальдегид'
  }, 3.15, 'Бром слабее иода, контакт длиннее.');
  addX('cf3cl-o', 'CF₃Cl ··· O=C', {
    el: 'Cl', bond: 1.76, holeD: 0.82, qF: -0.16, qC: 0.32, qBelt: -0.08, qHole: 0.24, qO: -0.45,
    epsX: 1.05, sigX: 3.45, aX: 2.0, group: 'CF₃Cl и формальдегид'
  }, 3.25, 'Хлор — самая слабая σ-дырка в этом ряду.');

  add({
    id: 'c6f5i-n', type: 'xb', name: 'C₆F₅I ··· N',
    group: 'пентафториодбензол и аммиак',
    blurb: 'Электронодефицитный иод против неподелённой пары азота.',
    partKeys: 'hole', scan: 'r',
    controls: [
      ctrl('r', 'I···N', 2.4, 5.6, 0.01, 'Å'),
      ctrl('ang', 'Угол C–I···N', 90, 180, 1, '°'),
      ctrl('dih', 'Поворот акцептора', 0, 180, 1, '°')
    ].concat(commonQ),
    defaults: { r: 3.30, ang: 180, dih: 0, angA: 180 },
    chart2: { key: 'ang', label: 'Угол C–I···N, °' },
    build: function (g) {
      const Rc = 1.395;
      const atoms = [];
      const bonds = [];
      // кольцо в плоскости xy, связь C–I вдоль +x
      for (let i = 0; i < 6; i++) {
        const th = i * 60 * DEG - Math.PI;
        const c = [Rc * Math.cos(th), Rc * Math.sin(th), 0];
        atoms.push(at('C', c, 'A', { q: 0.12, sigma: 3.45, eps: 0.32, alpha: 1.2 }));
        if (i === 0) {
          atoms.push(at('I', [Rc + 2.08, 0, 0], 'A', { q: -0.20, sigma: 3.90, eps: 1.6, alpha: 4.4 }));
          bonds.push([0, 1, 1]);
        } else {
          const f = [(Rc + 1.33) * Math.cos(th), (Rc + 1.33) * Math.sin(th), 0];
          atoms.push(at('F', f, 'A', { q: -0.16, sigma: 2.95, eps: 0.22, alpha: 0.45 }));
          bonds.push([i * 2, i * 2 + 1, 1]);
        }
        bonds.push([i * 2, ((i + 1) % 6) * 2, 1]);
      }
      // заряд кольца: 6*0.12 + (−0.20) + 5*(−0.16) = 0.72 − 0.20 − 0.80 = −0.28. Дырка +0.28.
      const Ipos = [Rc + 2.08, 0, 0];
      const Cipso = [-Rc, 0, 0];
      const hole = vadd(Ipos, [1.05, 0, 0]);
      atoms.push(at('I', hole, 'A', { q: 0.28, site: true, role: 'hole', eps: 0, sigma: 0, alpha: 0 }));
      const placed = placeFront(Cipso, Ipos, g.r, g.ang);
      const fr = frameAt(vmul(placed.dir, -1), 180, g.dih || 0);
      const acc = ammonia(placed.front, placed.dir, fr.n, 'B', 0.33);
      const base = atoms.length;
      acc.bonds.forEach(b => bonds.push([b[0] + base, b[1] + base]));
      acc.atoms.forEach(a => atoms.push(a));
      const line = [p3(Ipos), p3(xyz(acc.atoms[0]))];
      const angles = [[p3(Cipso), p3(Ipos), p3(xyz(acc.atoms[0]))]];
      const holes = [p3(hole)];
      const ang = angAt(Cipso, Ipos, xyz(acc.atoms[0]));
      recenter(atoms, line.concat(angles[0], holes));
      return {
        atoms: atoms, bonds: bonds, line: line, angles: angles, holes: holes, shells: [],
        metrics: metricRows([
          ['I···N', dist(atoms[1], atoms[base]), 'Å'],
          ['угол C–I···N', ang, '°']
        ])
      };
    }
  });

  function addCh(id, name, spec, r0, blurb) {
    add({
      id: id, type: 'chb', name: name, group: spec.group, blurb: blurb,
      build: (g) => buildChalcogen(g, spec), partKeys: 'hole', scan: 'r',
      controls: [
        ctrl('r', spec.el + '···' + spec.base, 2.5, 5.6, 0.01, 'Å'),
        ctrl('ang', 'Угол C–' + spec.el + '···' + spec.base, 90, 180, 1, '°'),
        ctrl('dih', 'Поворот акцептора', 0, 180, 1, '°')
      ].concat(commonQ),
      defaults: { r: r0, ang: 180, dih: 0 },
      chart2: { key: 'ang', label: 'Угол C–Ch···B, °' }
    });
  }
  addCh('mes-o', 'Me₂S ··· O', {
    el: 'S', base: 'O', bond: 1.81, angle: 99, holeD: 0.95,
    qCh: -0.20, qC: -0.05, qH: 0.04, qHole: 0.13, qO: -0.48,
    eps: 1.05, sigma: 3.55, alpha: 2.6,
    group: 'диметилсульфид и формальдегид'
  }, 3.30, 'Слабая σ-дырка серы.');
  addCh('mese-o', 'Me₂Se ··· O', {
    el: 'Se', base: 'O', bond: 1.94, angle: 96, holeD: 1.05,
    qCh: -0.22, qC: -0.04, qH: 0.035, qHole: 0.185, qO: -0.48,
    eps: 1.35, sigma: 3.75, alpha: 3.5,
    group: 'диметилселенид и формальдегид'
  }, 3.20, 'Селен заметнее серы.');
  addCh('mete-n', 'Me₂Te ··· N', {
    el: 'Te', base: 'N', bond: 2.14, angle: 94, holeD: 1.15,
    qCh: 0, qC: -0.02, qH: 0.02, qHole: 0.22, qO: -0.45,
    eps: 1.35, sigma: 3.80, alpha: 4.6,
    group: 'диметилтеллурид и аммиак'
  }, 3.40, 'Теллур — самая глубокая яма в ряду.');

  add({
    id: 'ar', type: 'vdw', name: 'Ar ··· Ar',
    group: 'два атома аргона',
    blurb: 'Почти чистая дисперсия Лондона плюс отталкивание оболочек.',
    build: buildAr, partKeys: 'vdw', scan: 'r',
    toggles: [{ key: 'buck', label: 'Бэкингем вместо Леннард-Джонса' }, { key: 'avg', label: 'Формулы 1/r⁶ (здесь совпадает с Лондоном)' }],
    controls: [ctrl('r', 'Ar···Ar', 3.0, 7.0, 0.01, 'Å'), ctrl('T', 'Температура', 80, 400, 1, 'K')].concat([commonQ[0]]),
    defaults: { r: 3.80, ang: 0, T: 298 },
    chart2: { key: 'T', label: 'Температура, K' },
    mol: { eps: 1.0, sigma: 3.385, mu: 0, alpha: 1.641, I: 15.76 }
  });
  add({
    id: 'ch4', type: 'vdw', name: 'CH₄ ··· CH₄',
    group: 'два метана',
    blurb: 'Дисперсия; маленький октуполь, электростатика слабая.',
    build: buildCH4pair, partKeys: 'vdw', scan: 'r',
    toggles: [{ key: 'buck', label: 'Бэкингем вместо Леннард-Джонса' }, { key: 'avg', label: 'Тепловое усреднение Кеезом–Дебай–Лондон' }],
    controls: [
      ctrl('r', 'C···C', 3.1, 7.0, 0.01, 'Å'),
      ctrl('ang', 'Поворот второй молекулы', 0, 180, 1, '°'),
      ctrl('T', 'Температура', 80, 400, 1, 'K')
    ].concat(commonQ),
    defaults: { r: 3.90, ang: 0, T: 298 },
    chart2: { key: 'ang', label: 'Поворот, °' },
    mol: { eps: 1.15, sigma: 3.58, mu: 0, alpha: 2.59, I: 12.61 }
  });
  add({
    id: 'hcl', type: 'vdw', name: 'HCl ··· HCl',
    group: 'два хлороводорода',
    blurb: 'Есть диполь: бок о бок и «голова к хвосту» отличаются. Усреднение по углам — отдельный переключатель.',
    build: buildHCl, partKeys: 'vdw', scan: 'r',
    toggles: [{ key: 'buck', label: 'Бэкингем вместо Леннард-Джонса' }, { key: 'avg', label: 'Тепловое усреднение (Кеезом, Дебай, Лондон)' }],
    controls: [
      ctrl('r', 'Расстояние центров', 3.2, 8.0, 0.01, 'Å'),
      ctrl('ang', 'Направление диполя 2', 0, 360, 1, '°'),
      ctrl('T', 'Температура', 80, 400, 1, 'K')
    ].concat(commonQ),
    defaults: { r: 3.9, ang: 180, T: 298 },
    chart2: { key: 'ang', label: 'Угол диполя, °' },
    mol: { eps: 2.2, sigma: 3.62, mu: 1.08, alpha: 2.63, I: 12.74 }
  });

  add({
    id: 'hp-ch4', type: 'hp', name: 'CH₄ ··· CH₄ в воде',
    group: 'две гидратные сферы',
    blurb: 'Потенциал средней силы: площадь контакта, энтропия воды и короткая стенка.',
    build: (g) => buildHydro(g, { shape: 'ch4', R: 3.25, sig: 3.72, well: 0.55, p: { h0: 0.018, s0: 0.000235, cp: -0.00012 } }),
    partKeys: 'hp', scan: 'r',
    controls: [
      ctrl('r', 'C···C', 3.2, 7.5, 0.01, 'Å'),
      ctrl('T', 'Температура', 273, 370, 1, 'K'),
      ctrl('gscale', 'Масштаб γ', 0.4, 1.8, 0.02, '×')
    ],
    defaults: { r: 3.95, T: 298, gscale: 1 },
    chart2: { key: 'T', label: 'Температура, K' }
  });
  add({
    id: 'hp-c2', type: 'hp', name: 'C₂H₆ ··· C₂H₆ в воде',
    group: 'два этана',
    blurb: 'Больше поверхность — глубже яма, чем у метана.',
    build: (g) => buildHydro(g, { shape: 'c2', R: 3.7, sig: 4.05, well: 0.7, p: { h0: 0.016, s0: 0.00022, cp: -0.0001 } }),
    partKeys: 'hp', scan: 'r',
    controls: [
      ctrl('r', 'R центров', 3.4, 8.5, 0.01, 'Å'),
      ctrl('T', 'Температура', 273, 370, 1, 'K'),
      ctrl('gscale', 'Масштаб γ', 0.4, 1.8, 0.02, '×')
    ],
    defaults: { r: 4.3, T: 298, gscale: 1 },
    chart2: { key: 'T', label: 'Температура, K' }
  });
  add({
    id: 'hp-bz', type: 'hp', name: 'Два бензола в воде',
    group: 'гидрофобная ПСС, не вакуумный π–π',
    blurb: 'Это не стопка из вкладки π–π: здесь растворитель, а не квадруполь в газе.',
    build: (g) => buildHydro(g, { shape: 'bz', R: 4.3, sig: 4.6, well: 0.85, p: { h0: 0.014, s0: 0.00020, cp: -0.00008 } }),
    partKeys: 'hp', scan: 'r',
    controls: [
      ctrl('r', 'R центров', 3.6, 10, 0.01, 'Å'),
      ctrl('T', 'Температура', 273, 370, 1, 'K'),
      ctrl('gscale', 'Масштаб γ', 0.4, 1.8, 0.02, '×')
    ],
    defaults: { r: 5.2, T: 298, gscale: 1 },
    chart2: { key: 'T', label: 'Температура, K' }
  });

  function addPi(id, name, kindB, def, blurb, group) {
    add({
      id: id, type: 'pp', name: name, group: group, blurb: blurb,
      build: (g) => buildPi(g, kindB), partKeys: 'std', scan: 'r',
      controls: [
        ctrl('r', 'Высота центра', 2.8, 7.5, 0.01, 'Å'),
        ctrl('off', 'Смещение x', -3.5, 3.5, 0.02, 'Å'),
        ctrl('offy', 'Смещение y', -3.5, 3.5, 0.02, 'Å'),
        ctrl('tilt', 'Наклон (0 параллельно, 90 T-форма)', 0, 90, 1, '°'),
        ctrl('twist', 'Поворот в плоскости', 0, 60, 1, '°')
      ].concat(commonQ),
      defaults: def,
      chart2: { key: 'tilt', label: 'Наклон, °' },
      heat: { x: 'off', y: 'offy', xmin: -3.2, xmax: 3.2, ymin: -3.2, ymax: 3.2, xlabel: 'Смещение x, Å', ylabel: 'Смещение y, Å' }
    });
  }
  addPi('pd', 'Бензол, parallel-displaced', 'bz', { r: 3.50, off: 1.60, offy: 0, tilt: 0, twist: 30 },
    'Сдвиг снимает отталкивание граней и оставляет дисперсию.', 'бензол / бензол');
  addPi('sw', 'Бензол, сэндвич', 'bz', { r: 3.70, off: 0, offy: 0, tilt: 0, twist: 30 },
    'Полное перекрытие: дисперсия максимальна, электростатика граней мешает.', 'бензол / бензол');
  addPi('tshape', 'Бензол, T-форма', 'bz', { r: 4.95, off: 0, offy: 0, tilt: 90, twist: 0 },
    'Водород смотрит в отрицательную грань — электростатика помогает.', 'бензол / бензол');
  addPi('c6f6', 'Бензол ··· C₆F₆', 'c6f6', { r: 3.55, off: 0, offy: 0, tilt: 0, twist: 30 },
    'Противоположные квадруполи: сэндвич уже выгоден.', 'бензол / гексафторбензол');

  function addCat(id, name, spec, r0, rmin, rmax, blurb) {
    add({
      id: id, type: 'cat', name: name, group: spec.group || (name + ' над бензолом'), blurb: blurb,
      build: (g) => buildCation(g, spec), partKeys: 'std', scan: 'r',
      controls: [
        ctrl('r', 'Высота над кольцом', rmin, rmax, 0.01, 'Å'),
        ctrl('off', 'Боковой сдвиг', 0, 3.2, 0.02, 'Å')
      ].concat(commonQ),
      defaults: { r: r0, off: 0, offy: 0 },
      chart2: { key: 'off', label: 'Боковой сдвиг, Å' },
      heat: { x: 'off', y: 'r', xmin: 0, xmax: 3, ymin: rmin, ymax: Math.min(rmax, r0 + 2.2), xlabel: 'Сдвиг, Å', ylabel: 'Высота, Å' }
    });
  }
  addCat('li', 'Li⁺ · бензол', { kind: 'ion', el: 'Li', q: 1, sigma: 2.10, eps: 0.04, alpha: 0.02, group: 'Li⁺ над бензолом' }, 1.90, 1.45, 5.5, 'Самый маленький ион: близко и очень прочно.');
  addCat('na', 'Na⁺ · бензол', { kind: 'ion', el: 'Na', q: 1, sigma: 2.90, eps: 0.07, alpha: 0.10, group: 'Na⁺ над бензолом' }, 2.40, 1.8, 6.0, 'Опорная точка Догерти: газовая фаза, около −100 кДж/моль.');
  addCat('k', 'K⁺ · бензол', { kind: 'ion', el: 'K', q: 1, sigma: 3.55, eps: 0.12, alpha: 0.5, group: 'K⁺ над бензолом' }, 2.90, 2.2, 6.5, 'Дальше и слабее натрия.');
  addCat('nh4', 'NH₄⁺ · бензол', { kind: 'nh4', group: 'аммоний над бензолом' }, 2.95, 2.2, 6.5, 'Заряд на водородах, три из них чуть ближе к кольцу.');
  addCat('nme4', 'NMe₄⁺ · бензол', { kind: 'nme4', group: 'тетраметиламмоний над бензолом' }, 4.35, 3.6, 7.5, 'Азот далеко: метилы не пускают заряд к π-грани.');

  add({
    id: 'ch4pi', type: 'chpi', name: 'CH₄ · бензол',
    group: 'метан над кольцом',
    blurb: 'Слабый CH–π: и электростатика водорода, и дисперсия.',
    build: (g) => buildCHPi(g, 'ch4'), partKeys: 'hb', scan: 'r',
    controls: [
      ctrl('r', 'H···центр', 2.15, 5.5, 0.01, 'Å'),
      ctrl('ang', 'Угол C–H···π', 90, 180, 1, '°'),
      ctrl('off', 'Боковой сдвиг', 0, 2.5, 0.02, 'Å')
    ].concat(commonQ),
    defaults: { r: 2.70, ang: 180, off: 0 },
    chart2: { key: 'ang', label: 'Угол C–H···π, °' }
  });
  add({
    id: 'chcl3', type: 'chpi', name: 'CHCl₃ · бензол',
    group: 'хлороформ над кольцом',
    blurb: 'Водород хлороформа положительнее, контакт глубже, чем у метана.',
    build: (g) => buildCHPi(g, 'chcl3'), partKeys: 'hb', scan: 'r',
    controls: [
      ctrl('r', 'H···центр', 2.05, 5.5, 0.01, 'Å'),
      ctrl('ang', 'Угол C–H···π', 90, 180, 1, '°'),
      ctrl('off', 'Боковой сдвиг', 0, 2.5, 0.02, 'Å')
    ].concat(commonQ),
    defaults: { r: 2.95, ang: 180, off: 0 },
    chart2: { key: 'ang', label: 'Угол C–H···π, °' }
  });

  add({
    id: 'nacl', type: 'el', name: 'Na⁺ ··· Cl⁻',
    group: 'ионная пара',
    blurb: 'Кулон и стенка Борна–Майера. В газе яма огромная; ε и ионная сила её гасят.',
    build: buildNaCl, partKeys: 'std', scan: 'r',
    controls: [
      ctrl('r', 'Na⁺···Cl⁻', 1.9, 8, 0.01, 'Å'),
      ctrl('eps', 'Диэлектрическая проницаемость ε', 1, 80, 0.5, ''),
      ctrl('I', 'Ионная сила', 0, 2, 0.01, 'М'),
      ctrl('T', 'Температура (для κ)', 273, 370, 1, 'K')
    ],
    defaults: { r: 2.36, eps: 1, I: 0, T: 298, qscale: 1, ascale: 1 },
    chart2: { key: 'eps', label: 'ε' }
  });
  add({
    id: 'salt', type: 'el', name: 'Карбоксилат ··· гуанидиний',
    group: 'бидентатный солевой мостик',
    blurb: 'Asp/Glu против Arg в учебном виде. Покрутите ε: 1 — газ, 20 — «белок», 78 — вода.',
    build: buildSalt, partKeys: 'std', scan: 'r',
    controls: [
      ctrl('r', 'N···O', 2.4, 6.5, 0.01, 'Å'),
      ctrl('eps', 'Диэлектрическая проницаемость ε', 1, 80, 0.5, ''),
      ctrl('I', 'Ионная сила', 0, 2, 0.01, 'М'),
      ctrl('T', 'Температура (для κ)', 273, 370, 1, 'K'),
      ctrl('qscale', 'Масштаб зарядов', 0.5, 1.4, 0.02, '×')
    ],
    defaults: { r: 2.85, eps: 1, I: 0, T: 298, qscale: 1, ascale: 1 },
    chart2: { key: 'eps', label: 'ε' }
  });
  add({
    id: 'naw', type: 'el', name: 'Na⁺ ··· вода',
    group: 'ион и диполь',
    blurb: 'Кислород смотрит на катион. Поворот воды ломает притяжение.',
    build: buildNaWater, partKeys: 'std', scan: 'r',
    controls: [
      ctrl('r', 'Na⁺···O', 1.85, 5.5, 0.01, 'Å'),
      ctrl('ang', 'Поворот воды (0 — O к Na⁺)', 0, 180, 1, '°'),
      ctrl('eps', 'Диэлектрическая проницаемость ε', 1, 80, 0.5, ''),
      ctrl('I', 'Ионная сила', 0, 1, 0.01, 'М'),
      ctrl('qscale', 'Масштаб зарядов', 0.6, 1.4, 0.02, '×'),
      ctrl('ascale', 'Масштаб поляризуемости', 0, 2, 0.05, '×')
    ],
    defaults: { r: 2.25, ang: 0, eps: 1, I: 0, T: 298, qscale: 1, ascale: 1 },
    chart2: { key: 'ang', label: 'Поворот воды, °' }
  });

  const byId = {};
  PRESETS.forEach(p => { byId[p.id] = p; });

  function keysFor(preset, geom) {
    if (preset.type === 'vdw' && geom.avg) return PARTS.avg;
    return PARTS[preset.partKeys] || PARTS.std;
  }

  function evaluate(preset, geom) {
    const g = Object.assign({}, preset.defaults, geom || {});
    const block = preset.build(g);
    let parts;
    if (block.hydro) parts = hydroParts(block, g);
    else if (preset.type === 'vdw' && g.avg) parts = avgVdW(preset.mol, g.r, g.T || 298, !!g.buck);
    else {
      parts = energyOf(block.atoms, g, !!g.buck);
      if (block.dir) parts.dir += block.dir;
    }
    const keys = keysFor(preset, g);
    const keyNames = keys.map(k => k[0]);
    const total = totalOf(parts, keyNames);
    return {
      total: total,
      parts: parts,
      partList: partList(keys, parts),
      atoms: block.atoms,
      bonds: block.bonds,
      line: block.line,
      angles: block.angles,
      holes: block.holes,
      shells: block.shells,
      metrics: block.metrics,
      geom: g,
      preset: preset
    };
  }

  function minimum(preset, geom) {
    const g0 = Object.assign({}, preset.defaults, geom || {});
    const key = preset.scan || 'r';
    const c = preset.controls.find(x => x.key === key);
    let a = c.min, b = c.max;
    let best = null;
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const t = a + (b - a) * i / N;
      const g = Object.assign({}, g0, { [key]: t });
      const e = evaluate(preset, g);
      if (!best || e.total < best.total) best = { total: e.total, at: t };
    }
    // золотое сечение вокруг лучшей точки
    const span = (b - a) / N;
    let lo = Math.max(a, best.at - span), hi = Math.min(b, best.at + span);
    const phi = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
    let f1 = evaluate(preset, Object.assign({}, g0, { [key]: x1 })).total;
    let f2 = evaluate(preset, Object.assign({}, g0, { [key]: x2 })).total;
    for (let k = 0; k < 18; k++) {
      if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - phi * (hi - lo); f1 = evaluate(preset, Object.assign({}, g0, { [key]: x1 })).total; }
      else { lo = x1; x1 = x2; f1 = f2; x2 = lo + phi * (hi - lo); f2 = evaluate(preset, Object.assign({}, g0, { [key]: x2 })).total; }
    }
    const at = (lo + hi) / 2;
    const e = evaluate(preset, Object.assign({}, g0, { [key]: at }));
    return { key: key, at: at, total: e.total, parts: e.parts, edge: Math.abs(at - a) < 1e-3 || Math.abs(at - b) < 1e-3 };
  }

  function scan(preset, geom, key, n) {
    const g0 = Object.assign({}, preset.defaults, geom || {});
    const c = preset.controls.find(x => x.key === key);
    const N = n || 70;
    const xs = [];
    const series = {};
    for (let i = 0; i <= N; i++) {
      const t = c.min + (c.max - c.min) * i / N;
      xs.push(t);
      const e = evaluate(preset, Object.assign({}, g0, { [key]: t }));
      e.partList.forEach(p => {
        if (!series[p.key]) series[p.key] = [];
        series[p.key].push(p.value);
      });
      if (!series.total) series.total = [];
      series.total.push(e.total);
    }
    return { key: key, xs: xs, series: series, xlabel: c.label + (c.unit ? ', ' + c.unit : '') };
  }

  function heatmap(preset, geom, n) {
    const spec = preset.heat;
    if (!spec) return null;
    const N = n || 23;
    const g0 = Object.assign({}, preset.defaults, geom || {});
    const xs = [], ys = [], z = [];
    for (let ix = 0; ix < N; ix++) xs.push(spec.xmin + (spec.xmax - spec.xmin) * ix / (N - 1));
    for (let iy = 0; iy < N; iy++) ys.push(spec.ymin + (spec.ymax - spec.ymin) * iy / (N - 1));
    for (let iy = 0; iy < N; iy++) {
      const row = [];
      for (let ix = 0; ix < N; ix++) {
        const g = Object.assign({}, g0, { [spec.x]: xs[ix], [spec.y]: ys[iy] });
        row.push(evaluate(preset, g).total);
      }
      z.push(row);
    }
    return { xs: xs, ys: ys, z: z, xlabel: spec.xlabel, ylabel: spec.ylabel, mx: g0[spec.x], my: g0[spec.y] };
  }

  function presetsOf(type) { return PRESETS.filter(p => p.type === type); }
  function getPreset(id) { return byId[id] || null; }
  function getType(id) { return TYPES.find(t => t.id === id) || null; }

  const ALIAS = { pi: 'pp', pipi: 'pp', halogen: 'xb', hbond: 'hb', chalcogen: 'chb', cation: 'cat', electrostatic: 'el', vdw: 'vdw' };

  function stateFromSearch(search) {
    const q = new URLSearchParams(search || '');
    let type = q.get('type') || 'hb';
    if (ALIAS[type]) type = ALIAS[type];
    if (!getType(type)) type = 'hb';
    let id = q.get('preset') || '';
    let preset = getPreset(id);
    if (!preset || preset.type !== type) preset = presetsOf(type)[0];
    const geom = Object.assign({}, preset.defaults);
    preset.controls.forEach(c => {
      if (q.has(c.key)) {
        const v = parseFloat(q.get(c.key));
        if (isFinite(v)) geom[c.key] = Math.min(c.max, Math.max(c.min, v));
      }
    });
    // короткие имена из примера в задании: ang уже есть; r тоже
    if (q.get('avg') === '1') geom.avg = true;
    if (q.get('buck') === '1') geom.buck = true;
    const unit = q.get('unit') === 'kcal' ? 'kcal' : 'kJ';
    const theme = q.get('theme') === 'dark' ? 'dark' : (q.get('theme') === 'light' ? 'light' : '');
    return { type: type, preset: preset, geom: geom, unit: unit, theme: theme };
  }

  function toQuery(preset, geom, unit, theme) {
    const q = new URLSearchParams();
    q.set('type', preset.type);
    q.set('preset', preset.id);
    preset.controls.forEach(c => {
      const v = geom[c.key];
      if (v == null) return;
      const d = preset.defaults[c.key];
      if (typeof v === 'number' && Math.abs(v - d) < 1e-9) return;
      q.set(c.key, String(Math.round(v * 1000) / 1000));
    });
    if (geom.avg) q.set('avg', '1');
    if (geom.buck) q.set('buck', '1');
    if (unit === 'kcal') q.set('unit', 'kcal');
    if (theme) q.set('theme', theme);
    const s = q.toString();
    return s ? ('?' + s) : '';
  }

  return {
    KE: KE, KCAL: KCAL, TYPES: TYPES, PRESETS: PRESETS, lesson: lesson, DISCLAIMER: DISCLAIMER,
    presetsOf: presetsOf, getPreset: getPreset, getType: getType,
    evaluate: evaluate, minimum: minimum, scan: scan, heatmap: heatmap,
    stateFromSearch: stateFromSearch, toQuery: toQuery,
    keesomE: keesomE, debyeE: debyeE, londonE: londonE
  };
});
