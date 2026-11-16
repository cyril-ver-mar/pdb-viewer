/* Точечные группы: таблицы характеров, операции, молекулы. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const C36 = PHI;                 // 2 cos 36°
  const C72 = PHI - 1;             // 2 cos 72°
  const C108 = 1 - PHI;            // 2 cos 108°
  const C144 = -PHI;               // 2 cos 144°

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mulv(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
  function unit(a) { const n = norm(a) || 1; return mulv(a, 1 / n); }
  function dist(a, b) { return norm(sub(a, b)); }
  function deg(d) { return d * Math.PI / 180; }

  function det3(R) {
    return R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1])
      - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
      + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  }
  function mulM(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return R;
  }
  function apply(R, p) {
    return [
      R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
      R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
      R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]
    ];
  }
  function trace(R) { return R[0][0] + R[1][1] + R[2][2]; }
  function quant(R) { return R.map(row => row.map(v => Math.round(v * 1e8) / 1e8)); }
  function sameM(A, B) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (Math.abs(A[i][j] - B[i][j]) > 1e-6) return false;
    return true;
  }
  function rotZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }
  function rotAxis(axis, ang) {
    const u = unit(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const [x, y, z] = u;
    return [
      [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
      [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
      [t * x * z - s * y, t * y * z + s * x, t * z * z + c]
    ];
  }
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const INV = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]];
  const SIG_H = [[1, 0, 0], [0, 1, 0], [0, 0, -1]];
  const SIG_XZ = [[1, 0, 0], [0, -1, 0], [0, 0, 1]]; // нормаль y
  const SIG_YZ = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]; // нормаль x
  function mirror(normal) {
    const n = unit(normal);
    const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] -= 2 * n[i] * n[j];
    return R;
  }
  function axisOfProper(R) {
    let ax = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
    if (norm(ax) < 1e-5) {
      const S = R.map((row, i) => row.map((v, j) => v + (i === j ? 1 : 0)));
      let best = -1, col = 0;
      for (let j = 0; j < 3; j++) {
        const n = Math.hypot(S[0][j], S[1][j], S[2][j]);
        if (n > best) { best = n; col = j; }
      }
      ax = [S[0][col], S[1][col], S[2][col]];
    }
    ax = unit(ax);
    if (ax[2] < -1e-8 || (Math.abs(ax[2]) < 1e-8 && ax[1] < -1e-8) || (Math.abs(ax[2]) < 1e-8 && Math.abs(ax[1]) < 1e-8 && ax[0] < 0)) ax = mulv(ax, -1);
    return ax;
  }
  function signature(R) {
    const tr = trace(R), det = det3(R), proper = det > 0.5;
    if (proper && Math.abs(tr - 3) < 1e-4) return { kind: 'E', n: 1, tr, axis: [0, 0, 1], sang: 0 };
    if (!proper && tr < -2.9) return { kind: 'i', n: 2, tr, axis: [0, 0, 1], sang: 0 };
    if (!proper && Math.abs(tr - 1) < 1e-3) {
      const normal = axisOfProper(R.map(row => row.map(v => -v)));
      return { kind: 'm', n: 2, tr, axis: normal, normal };
    }
    if (proper) {
      const c = clamp((tr - 1) / 2, -1, 1);
      const ang = Math.acos(c);
      let M = quant(R), n = 0;
      for (let k = 1; k <= 10; k++) {
        if (sameM(M, I3)) { n = k; break; }
        M = quant(mulM(M, R));
      }
      if (!n) n = Math.max(2, Math.round(TAU / Math.max(ang, 1e-4)));
      const axis = axisOfProper(R);
      return { kind: 'C', n, tr, ang, sang: signedAngle(R, axis), axis };
    }
    const Rp = R.map(row => row.map(v => -v));
    const trp = trace(Rp);
    const c = clamp((trp - 1) / 2, -1, 1);
    const ang = Math.acos(c);
    const n = Math.max(1, Math.round(TAU / Math.max(ang, 1e-6)));
    const axis = axisOfProper(Rp);
    let sang = Math.atan2(R[1][0], R[0][0]);
    if (sang < -1e-8) sang += TAU;
    return { kind: 'S', n, tr, ang, sang, axis };
  }
  function signedAngle(R, axis) {
    const a = unit(axis);
    let v = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    v = unit(sub(v, mulv(a, dot(v, a))));
    const Rv = apply(R, v);
    let ang = Math.atan2(dot(a, cross(v, Rv)), dot(v, Rv));
    if (ang < -1e-8) ang += TAU;
    return ang;
  }
  function alongZ(axis) { return Math.abs(axis[2]) > 0.85; }
  function inXY(axis) { return Math.abs(axis[2]) < 0.25; }
  function azim(axis) {
    let a = Math.atan2(axis[1], axis[0]) * 180 / Math.PI;
    if (a < 0) a += 180;
    if (a >= 180) a -= 180;
    return a;
  }
  function modBucket(axis, step) {
    let a = azim(axis) % step;
    if (a > step / 2) a -= step;
    return Math.abs(a);
  }
  function cubicBucket(axis) {
    const a = axis.map(v => Math.abs(v)).sort((x, y) => y - x);
    if (a[1] < 0.25) return '100';
    if (a[2] < 0.25 && Math.abs(a[0] - a[1]) < 0.25) return '110';
    if (Math.abs(a[0] - a[1]) < 0.25 && Math.abs(a[1] - a[2]) < 0.25) return '111';
    return 'other';
  }

  function closeGroup(gens) {
    const ops = [quant(I3)];
    const queue = gens.map(quant);
    while (queue.length) {
      const g = queue.pop();
      for (const op of ops.slice()) {
        const p = quant(mulM(g, op));
        if (!ops.some(o => sameM(o, p))) { ops.push(p); queue.push(p); }
        if (ops.length > 260) throw new Error('замыкание > 260');
      }
    }
    return ops;
  }

  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function subNum(k) { return String(k).split('').map(d => SUB[d] || d).join(''); }
  function prettyOp(sig, power) {
    if (sig.kind === 'E') return 'E';
    if (sig.kind === 'i') return 'i';
    if (sig.kind === 'm') return 'σ';
    if (sig.kind === 'C') return 'C' + subNum(sig.n) + (power > 1 ? sup(power) : '');
    if (sig.kind === 'S') return 'S' + subNum(sig.n) + (power > 1 ? sup(power) : '');
    return '?';
  }
  function sup(k) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[k] || String(k); }

  function buildOps(gens, classOf) {
    const mats = closeGroup(gens);
    const ops = mats.map(R => {
      const sig = signature(R);
      let power = 1;
      if ((sig.kind === 'C' || sig.kind === 'S') && sig.n > 1 && sig.sang) {
        power = Math.round(sig.sang / (TAU / sig.n)) % sig.n;
        if (power <= 0) power = 1;
      }
      const cls = classOf(sig, R);
      return { R, sig, power, cls, label: prettyOp(sig, power) };
    });
    return ops;
  }

  function checkTable(g) {
    const sizes = g.classes.map(c => c.size);
    const order = sizes.reduce((a, b) => a + b, 0);
    if (order !== g.order) throw new Error(g.id + ' сумма классов ' + order + ' ≠ ' + g.order);
    const irs = g.irreps;
    for (let i = 0; i < irs.length; i++) {
      if (irs[i].chi.length !== sizes.length) throw new Error(g.id + ' ' + irs[i].name + ' длина');
      let nrm = 0;
      for (let k = 0; k < sizes.length; k++) nrm += sizes[k] * irs[i].chi[k] * irs[i].chi[k];
      const red = nrm / order;
      if (Math.abs(red - 1) > 1e-3 && Math.abs(red - 2) > 1e-3) throw new Error(g.id + ' ' + irs[i].name + ' норма ' + red);
      irs[i].norm = Math.round(red);
      for (let j = 0; j < i; j++) {
        let d = 0;
        for (let k = 0; k < sizes.length; k++) d += sizes[k] * irs[i].chi[k] * irs[j].chi[k];
        if (Math.abs(d) > 1e-3) throw new Error(g.id + ' не ортогональны ' + irs[i].name + '·' + irs[j].name + '=' + d);
      }
    }
  }

  function ir(name, chi, lin, quad, rot) { return { name, chi, lin: lin || '', quad: quad || '', rot: rot || '' }; }

  const groups = [];
  const byId = new Map();
  function add(g) {
    g.classes.forEach((c, i) => { c.index = i; });
    if (!g.infinite) checkTable(g);
    g.polar = !!g.polar;
    g.chiral = !!g.chiral;
    g.centrosym = !!g.centrosym;
    groups.push(g);
    byId.set(g.id, g);
  }

  // ——— низкая симметрия ———
  add({ id: 'C1', name: 'C₁', hm: '1', order: 1, family: 'C1', n: 1, polar: true, chiral: true, blurb: 'Нет симметрии, кроме тождества. Молекула и полярна, и хиральна.',
    classes: [{ label: 'E', size: 1, kind: 'E' }],
    irreps: [ir('A', [1], 'x, y, z', 'все квадратичные', 'R_x, R_y, R_z')],
    gens: [], classOf: s => s.kind === 'E' ? 0 : -1 });
  add({ id: 'Cs', name: 'Cₛ', hm: 'm', order: 2, family: 'Cs', n: 1, polar: true, chiral: false, blurb: 'Только зеркальная плоскость. Полярная, не хиральная.',
    classes: [{ label: 'E', size: 1, kind: 'E' }, { label: 'σₕ', size: 1, kind: 'm', sub: 'h' }],
    irreps: [ir('A′', [1, 1], 'x, y', 'x², y², z², xy', 'R_z'), ir('A″', [1, -1], 'z', 'xz, yz', 'R_x, R_y')],
    gens: [SIG_H], classOf: s => s.kind === 'E' ? 0 : s.kind === 'm' ? 1 : -1 });
  add({ id: 'Ci', name: 'Cᵢ', hm: '1̄', order: 2, family: 'Ci', n: 1, polar: false, chiral: false, centrosym: true, blurb: 'Только центр инверсии. Неполярная и нехиральная.',
    classes: [{ label: 'E', size: 1, kind: 'E' }, { label: 'i', size: 1, kind: 'i' }],
    irreps: [ir('A_g', [1, 1], '', 'x², y², z², xy, xz, yz', 'R_x, R_y, R_z'), ir('A_u', [1, -1], 'x, y, z', '', '')],
    gens: [INV], classOf: s => s.kind === 'E' ? 0 : 1 });

  function addCyclic(n) {
    const classes = [];
    for (let k = 0; k < n; k++) classes.push({ label: k === 0 ? 'E' : 'C' + subNum(n) + (k > 1 ? sup(k) : ''), size: 1, kind: k === 0 ? 'E' : 'C', n });
    const irs = [ir('A', Array(n).fill(1), 'z', 'x²+y², z²', 'R_z')];
    if (n % 2 === 0) {
      const chi = [];
      for (let k = 0; k < n; k++) chi.push(k % 2 === 0 ? 1 : -1);
      irs.push(ir('B', chi, '', '', ''));
    }
    const pairs = Math.floor((n - 1) / 2);
    for (let e = 1; e <= pairs; e++) {
      if (n % 2 === 0 && e === n / 2) continue;
      const chi = [];
      for (let k = 0; k < n; k++) chi.push(2 * Math.cos(TAU * e * k / n));
      const lin = e === 1 ? '(x, y)' : '';
      const rot = e === 1 ? '(R_x, R_y)' : '';
      const quad = e === 2 ? '(x²−y², xy)' : e === 1 ? '(xz, yz)' : '';
      irs.push(ir('E' + subNum(e), chi, lin, quad, rot));
    }
    const gens = [rotZ(TAU / n)];
    add({
      id: 'C' + n, name: 'C' + subNum(n), hm: String(n), order: n, family: 'Cn', n, polar: true, chiral: true,
      blurb: 'Ось C' + subNum(n) + '. Полярная и хиральная: нет несобственных осей.',
      classes, irreps: irs, gens,
      classOf: s => {
        if (s.kind === 'E') return 0;
        if (s.kind !== 'C') return -1;
        return Math.round(s.sang / (TAU / n)) % n;
      }
    });
  }
  [2, 3, 4, 5, 6].forEach(addCyclic);

  // C2v: молекула в плоскости yz. Столбцы E, C2, σv(xz), σv′(yz)
  add({
    id: 'C2v', name: 'C₂ᵥ', hm: 'mm2', order: 4, family: 'Cnv', n: 2, polar: true, chiral: false,
    blurb: 'Вода, SO₂, CH₂Cl₂. Полярная (ось C₂), не хиральная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' },
      { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: 'σᵥ(xz)', size: 1, kind: 'm', sub: 'v' },
      { label: 'σᵥ′(yz)', size: 1, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1], 'z', 'x², y², z²'),
      ir('A₂', [1, 1, -1, -1], '', 'xy', 'R_z'),
      ir('B₁', [1, -1, 1, -1], 'x', 'xz', 'R_y'),
      ir('B₂', [1, -1, -1, 1], 'y', 'yz', 'R_x')
    ],
    gens: [rotZ(Math.PI), SIG_XZ],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'C') return 1;
      if (s.kind === 'm' && Math.abs(s.normal[1]) > 0.8) return 2;
      if (s.kind === 'm') return 3;
      return -1;
    }
  });

  add({
    id: 'C3v', name: 'C₃ᵥ', hm: '3m', order: 6, family: 'Cnv', n: 3, polar: true, chiral: false,
    blurb: 'Аммиак, CHCl₃. Диполь вдоль C₃.',
    classes: [
      { label: 'E', size: 1, kind: 'E' },
      { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 },
      { label: '3σᵥ', size: 3, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1], 'z', 'x²+y², z²'),
      ir('A₂', [1, 1, -1], '', '', 'R_z'),
      ir('E', [2, -1, 0], '(x, y)', '(x²−y², xy), (xz, yz)', '(R_x, R_y)')
    ],
    gens: [rotZ(TAU / 3), SIG_XZ],
    classOf: s => s.kind === 'E' ? 0 : s.kind === 'C' ? 1 : s.kind === 'm' ? 2 : -1
  });

  add({
    id: 'C4v', name: 'C₄ᵥ', hm: '4mm', order: 8, family: 'Cnv', n: 4, polar: true, chiral: false,
    blurb: 'Квадратная пирамида, BrF₅. Полярная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' },
      { label: '2C₄', size: 2, kind: 'C', n: 4, axes: 1 },
      { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: '2σᵥ', size: 2, kind: 'm', sub: 'v' },
      { label: '2σ_d', size: 2, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1], 'z', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, -1, -1], '', '', 'R_z'),
      ir('B₁', [1, -1, 1, 1, -1], '', 'x²−y²'),
      ir('B₂', [1, -1, 1, -1, 1], '', 'xy'),
      ir('E', [2, 0, -2, 0, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)')
    ],
    gens: [rotZ(Math.PI / 2), SIG_XZ],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'C' && s.n === 4) return 1;
      if (s.kind === 'C') return 2;
      if (s.kind === 'm') return modBucket(s.normal, 90) < 20 ? 3 : 4;
      return -1;
    }
  });

  function addCnvHigh(n, cos1, cos2) {
    // C5v, C6v: E, 2C5/C6, 2C5² or C3+C2 for C6, n σv
    // Handled individually below
  }

  add({
    id: 'C5v', name: 'C₅ᵥ', hm: '5m', order: 10, family: 'Cnv', n: 5, polar: true, chiral: false,
    blurb: 'Закрытый металлоцен вроде (η⁵-C₅H₅)M–L. Полярная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' },
      { label: '2C₅', size: 2, kind: 'C', n: 5, axes: 1 },
      { label: '2C₅²', size: 2, kind: 'C', n: 5, axes: 1 },
      { label: '5σᵥ', size: 5, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1], 'z', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, -1], '', '', 'R_z'),
      ir('E₁', [2, C72, C144, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)'),
      ir('E₂', [2, C144, C72, 0], '', '(x²−y², xy)')
    ],
    gens: [rotZ(TAU / 5), SIG_XZ],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'm') return 3;
      if (s.kind === 'C') {
        const p = Math.round(s.ang / (TAU / 5));
        return (p === 1 || p === 4) ? 1 : 2;
      }
      return -1;
    }
  });

  add({
    id: 'C6v', name: 'C₆ᵥ', hm: '6mm', order: 12, family: 'Cnv', n: 6, polar: true, chiral: false,
    blurb: 'Шестиугольная пирамида. Полярная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' },
      { label: '2C₆', size: 2, kind: 'C', n: 6, axes: 1 },
      { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 },
      { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: '3σᵥ', size: 3, kind: 'm', sub: 'v' },
      { label: '3σ_d', size: 3, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1, 1], 'z', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, 1, -1, -1], '', '', 'R_z'),
      ir('B₁', [1, -1, 1, -1, 1, -1], '', ''),
      ir('B₂', [1, -1, 1, -1, -1, 1], '', ''),
      ir('E₁', [2, 1, -1, -2, 0, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)'),
      ir('E₂', [2, -1, -1, 2, 0, 0], '', '(x²−y², xy)')
    ],
    gens: [rotZ(TAU / 6), SIG_XZ],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'C' && s.n === 6) return 1;
      if (s.kind === 'C' && s.n === 3) return 2;
      if (s.kind === 'C') return 3;
      if (s.kind === 'm') return modBucket(s.normal, 60) < 15 ? 4 : 5;
      return -1;
    }
  });

  // Cnh
  add({
    id: 'C2h', name: 'C₂ₕ', hm: '2/m', order: 4, family: 'Cnh', n: 2, polar: false, chiral: false, centrosym: true,
    blurb: 'trans-N₂F₂, транс-дихлорэтилен. Центросимметричная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: 'i', size: 1, kind: 'i' }, { label: 'σₕ', size: 1, kind: 'm', sub: 'h' }
    ],
    irreps: [
      ir('A_g', [1, 1, 1, 1], '', 'x², y², z², xy', 'R_z'),
      ir('B_g', [1, -1, 1, -1], '', 'xz, yz', 'R_x, R_y'),
      ir('A_u', [1, 1, -1, -1], 'z', ''),
      ir('B_u', [1, -1, -1, 1], 'x, y', '')
    ],
    gens: [rotZ(Math.PI), SIG_H],
    classOf: s => s.kind === 'E' ? 0 : s.kind === 'C' ? 1 : s.kind === 'i' ? 2 : 3
  });
  add({
    id: 'C3h', name: 'C₃ₕ', hm: '6̄', order: 6, family: 'Cnh', n: 3, polar: false, chiral: false,
    blurb: 'Борная кислота в плоской форме. S₃ совпадает с C₃ₕ.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'C₃', size: 1, kind: 'C', n: 3 }, { label: 'C₃²', size: 1, kind: 'C', n: 3 },
      { label: 'σₕ', size: 1, kind: 'm', sub: 'h' }, { label: 'S₃', size: 1, kind: 'S', n: 3 }, { label: 'S₃⁵', size: 1, kind: 'S', n: 3 }
    ],
    irreps: [
      ir('A′', [1, 1, 1, 1, 1, 1], '', 'x²+y², z²', 'R_z'),
      ir('E′', [2, -1, -1, 2, -1, -1], '(x, y)', '(x²−y², xy)'),
      ir('A″', [1, 1, 1, -1, -1, -1], 'z', ''),
      ir('E″', [2, -1, -1, -2, 1, 1], '', '(xz, yz)', '(R_x, R_y)')
    ],
    gens: [rotZ(TAU / 3), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'm') return 3;
      const p = Math.round(s.sang / (TAU / 3)) % 3;
      if (s.kind === 'C') return p === 1 ? 1 : 2;
      if (s.kind === 'S') return p === 1 ? 4 : 5;
      return -1;
    }
  });
  add({
    id: 'C4h', name: 'C₄ₕ', hm: '4/m', order: 8, family: 'Cnh', n: 4, polar: false, chiral: false, centrosym: true,
    blurb: 'Ось C₄ и σₕ, есть центр инверсии.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'C₄', size: 1, kind: 'C', n: 4 }, { label: 'C₂', size: 1, kind: 'C', n: 2 }, { label: 'C₄³', size: 1, kind: 'C', n: 4 },
      { label: 'i', size: 1, kind: 'i' }, { label: 'S₄³', size: 1, kind: 'S', n: 4 }, { label: 'σₕ', size: 1, kind: 'm', sub: 'h' }, { label: 'S₄', size: 1, kind: 'S', n: 4 }
    ],
    irreps: [
      ir('A_g', [1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y², z²', 'R_z'),
      ir('B_g', [1, -1, 1, -1, 1, -1, 1, -1], '', 'x²−y², xy'),
      ir('E_g', [2, 0, -2, 0, 2, 0, -2, 0], '', '(xz, yz)', '(R_x, R_y)'),
      ir('A_u', [1, 1, 1, 1, -1, -1, -1, -1], 'z', ''),
      ir('B_u', [1, -1, 1, -1, -1, 1, -1, 1], '', ''),
      ir('E_u', [2, 0, -2, 0, -2, 0, 2, 0], '(x, y)', '')
    ],
    gens: [rotZ(Math.PI / 2), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 4;
      if (s.kind === 'm') return 6;
      const p = Math.round(s.sang / (Math.PI / 2)) % 4;
      if (s.kind === 'C') return { 1: 1, 2: 2, 3: 3 }[p] ?? -1;
      if (s.kind === 'S') return p === 1 ? 7 : 5;
      return -1;
    }
  });
  add({
    id: 'C6h', name: 'C₆ₕ', hm: '6/m', order: 12, family: 'Cnh', n: 6, polar: false, chiral: false, centrosym: true,
    blurb: 'Ось C₆ и горизонтальная плоскость.',
    classes: ['E', 'C₆', 'C₃', 'C₂', 'C₃²', 'C₆⁵', 'i', 'S₃⁵', 'S₆⁵', 'σₕ', 'S₆', 'S₃'].map(l => ({ label: l, size: 1, kind: l === 'E' ? 'E' : l === 'i' ? 'i' : l === 'σₕ' ? 'm' : l[0] === 'S' ? 'S' : 'C' })),
    irreps: [
      ir('A_g', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y², z²', 'R_z'),
      ir('B_g', [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1], '', ''),
      ir('E1g', [2, 1, -1, -2, -1, 1, 2, 1, -1, -2, -1, 1], '', '(xz, yz)', '(R_x, R_y)'),
      ir('E2g', [2, -1, -1, 2, -1, -1, 2, -1, -1, 2, -1, -1], '', '(x²−y², xy)'),
      ir('A_u', [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1], 'z', ''),
      ir('B_u', [1, -1, 1, -1, 1, -1, -1, 1, -1, 1, -1, 1], '', ''),
      ir('E1u', [2, 1, -1, -2, -1, 1, -2, -1, 1, 2, 1, -1], '(x, y)', ''),
      ir('E2u', [2, -1, -1, 2, -1, -1, -2, 1, 1, -2, 1, 1], '', '')
    ],
    gens: [rotZ(TAU / 6), SIG_H],
    classOf: () => 0
  });

  // The C6h classOf above is a placeholder — replaced after I verify element order by angle.
  // I'll overwrite classOf below once ops are not built yet. classOf is used at ops() time, so I can replace it before first ops() call.

  add({
    id: 'D2', name: 'D₂', hm: '222', order: 4, family: 'Dn', n: 2, polar: false, chiral: true,
    blurb: 'Три взаимно перпендикулярные оси C₂. Хиральная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'C₂(z)', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: 'C₂(y)', size: 1, kind: 'C', n: 2, axes: 1 }, { label: 'C₂(x)', size: 1, kind: 'C', n: 2, axes: 1 }
    ],
    irreps: [
      ir('A', [1, 1, 1, 1], '', 'x², y², z²'),
      ir('B₁', [1, 1, -1, -1], 'z', 'xy', 'R_z'),
      ir('B₂', [1, -1, 1, -1], 'y', 'xz', 'R_y'),
      ir('B₃', [1, -1, -1, 1], 'x', 'yz', 'R_x')
    ],
    gens: [rotZ(Math.PI), rotAxis([1, 0, 0], Math.PI)],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (Math.abs(s.axis[2]) > 0.8) return 1;
      if (Math.abs(s.axis[1]) > 0.8) return 2;
      return 3;
    }
  });
  add({
    id: 'D3', name: 'D₃', hm: '32', order: 6, family: 'Dn', n: 3, polar: false, chiral: true,
    blurb: '[Co(en)₃]³⁺. Хиральная, три оси C₂.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 }, { label: '3C₂', size: 3, kind: 'C', n: 2, axes: 3 }
    ],
    irreps: [
      ir('A₁', [1, 1, 1], '', 'x²+y², z²'),
      ir('A₂', [1, 1, -1], 'z', '', 'R_z'),
      ir('E', [2, -1, 0], '(x, y)', '(x²−y², xy), (xz, yz)', '(R_x, R_y)')
    ],
    gens: [rotZ(TAU / 3), rotAxis([1, 0, 0], Math.PI)],
    classOf: s => s.kind === 'E' ? 0 : s.n === 3 ? 1 : 2
  });
  add({
    id: 'D4', name: 'D₄', hm: '422', order: 8, family: 'Dn', n: 4, polar: false, chiral: true,
    blurb: 'Четыре оси: C₄ и перпендикулярные C₂. Хиральная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₄', size: 2, kind: 'C', n: 4, axes: 1 }, { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: '2C₂′', size: 2, kind: 'C', n: 2, axes: 2 }, { label: '2C₂″', size: 2, kind: 'C', n: 2, axes: 2 }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, -1, -1], 'z', '', 'R_z'),
      ir('B₁', [1, -1, 1, 1, -1], '', 'x²−y²'),
      ir('B₂', [1, -1, 1, -1, 1], '', 'xy'),
      ir('E', [2, 0, -2, 0, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)')
    ],
    gens: [rotZ(Math.PI / 2), rotAxis([1, 0, 0], Math.PI)],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.n === 4) return 1;
      if (alongZ(s.axis)) return 2;
      return modBucket(s.axis, 90) < 20 ? 3 : 4;
    }
  });
  add({
    id: 'D5', name: 'D₅', hm: '52', order: 10, family: 'Dn', n: 5, polar: false, chiral: true,
    blurb: 'Пять осей C₂ поперёк C₅. Хиральная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₅', size: 2, kind: 'C', n: 5, axes: 1 },
      { label: '2C₅²', size: 2, kind: 'C', n: 5, axes: 1 }, { label: '5C₂', size: 5, kind: 'C', n: 2, axes: 5 }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, -1], 'z', '', 'R_z'),
      ir('E₁', [2, C72, C144, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)'),
      ir('E₂', [2, C144, C72, 0], '', '(x²−y², xy)')
    ],
    gens: [rotZ(TAU / 5), rotAxis([1, 0, 0], Math.PI)],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.n === 2) return 3;
      const p = Math.round(s.ang / (TAU / 5));
      return (p === 1 || p === 4) ? 1 : 2;
    }
  });
  add({
    id: 'D6', name: 'D₆', hm: '622', order: 12, family: 'Dn', n: 6, polar: false, chiral: true,
    blurb: 'Хиральный «шестигранник» без плоскостей.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₆', size: 2, kind: 'C', n: 6, axes: 1 }, { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 },
      { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 }, { label: '3C₂′', size: 3, kind: 'C', n: 2, axes: 3 }, { label: '3C₂″', size: 3, kind: 'C', n: 2, axes: 3 }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, 1, -1, -1], 'z', '', 'R_z'),
      ir('B₁', [1, -1, 1, -1, 1, -1], '', ''),
      ir('B₂', [1, -1, 1, -1, -1, 1], '', ''),
      ir('E₁', [2, 1, -1, -2, 0, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)'),
      ir('E₂', [2, -1, -1, 2, 0, 0], '', '(x²−y², xy)')
    ],
    gens: [rotZ(TAU / 6), rotAxis([1, 0, 0], Math.PI)],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.n === 6) return 1;
      if (s.n === 3) return 2;
      if (alongZ(s.axis)) return 3;
      return modBucket(s.axis, 60) < 15 ? 4 : 5;
    }
  });

  // Dnh
  add({
    id: 'D2h', name: 'D₂ₕ', hm: 'mmm', order: 8, family: 'Dnh', n: 2, polar: false, chiral: false, centrosym: true,
    blurb: 'Этилен. Три оси C₂ и три плоскости.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'C₂(z)', size: 1, kind: 'C', n: 2 }, { label: 'C₂(y)', size: 1, kind: 'C', n: 2 }, { label: 'C₂(x)', size: 1, kind: 'C', n: 2 },
      { label: 'i', size: 1, kind: 'i' }, { label: 'σ(xy)', size: 1, kind: 'm', sub: 'h' }, { label: 'σ(xz)', size: 1, kind: 'm', sub: 'v' }, { label: 'σ(yz)', size: 1, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A_g', [1, 1, 1, 1, 1, 1, 1, 1], '', 'x², y², z²'),
      ir('B1g', [1, 1, -1, -1, 1, 1, -1, -1], '', 'xy', 'R_z'),
      ir('B2g', [1, -1, 1, -1, 1, -1, 1, -1], '', 'xz', 'R_y'),
      ir('B3g', [1, -1, -1, 1, 1, -1, -1, 1], '', 'yz', 'R_x'),
      ir('A_u', [1, 1, 1, 1, -1, -1, -1, -1], '', ''),
      ir('B1u', [1, 1, -1, -1, -1, -1, 1, 1], 'z', ''),
      ir('B2u', [1, -1, 1, -1, -1, 1, -1, 1], 'y', ''),
      ir('B3u', [1, -1, -1, 1, -1, 1, 1, -1], 'x', '')
    ],
    gens: [rotZ(Math.PI), rotAxis([1, 0, 0], Math.PI), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 4;
      if (s.kind === 'C') {
        if (Math.abs(s.axis[2]) > 0.8) return 1;
        if (Math.abs(s.axis[1]) > 0.8) return 2;
        return 3;
      }
      if (Math.abs(s.normal[2]) > 0.8) return 5;
      if (Math.abs(s.normal[1]) > 0.8) return 6;
      return 7;
    }
  });
  add({
    id: 'D3h', name: 'D₃ₕ', hm: '6̄m2', order: 12, family: 'Dnh', n: 3, polar: false, chiral: false,
    blurb: 'BF₃, PCl₅, заслонённый этан. Плоская тройная ось.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 }, { label: '3C₂', size: 3, kind: 'C', n: 2, axes: 3 },
      { label: 'σₕ', size: 1, kind: 'm', sub: 'h' }, { label: '2S₃', size: 2, kind: 'S', n: 3, axes: 1 }, { label: '3σᵥ', size: 3, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A₁′', [1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A₂′', [1, 1, -1, 1, 1, -1], '', '', 'R_z'),
      ir('E′', [2, -1, 0, 2, -1, 0], '(x, y)', '(x²−y², xy)'),
      ir('A₁″', [1, 1, 1, -1, -1, -1], '', ''),
      ir('A₂″', [1, 1, -1, -1, -1, 1], 'z', ''),
      ir('E″', [2, -1, 0, -2, 1, 0], '', '(xz, yz)', '(R_x, R_y)')
    ],
    gens: [rotZ(TAU / 3), rotAxis([1, 0, 0], Math.PI), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'C' && s.n === 3) return 1;
      if (s.kind === 'C') return 2;
      if (s.kind === 'm' && alongZ(s.normal)) return 3;
      if (s.kind === 'm') return 5;
      return 4;
    }
  });
  add({
    id: 'D4h', name: 'D₄ₕ', hm: '4/mmm', order: 16, family: 'Dnh', n: 4, polar: false, chiral: false, centrosym: true,
    blurb: 'XeF₄, квадратный комплекс. Центросимметричная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₄', size: 2, kind: 'C', n: 4, axes: 1 }, { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: '2C₂′', size: 2, kind: 'C', n: 2, axes: 2 }, { label: '2C₂″', size: 2, kind: 'C', n: 2, axes: 2 },
      { label: 'i', size: 1, kind: 'i' }, { label: '2S₄', size: 2, kind: 'S', n: 4, axes: 1 }, { label: 'σₕ', size: 1, kind: 'm', sub: 'h' },
      { label: '2σᵥ', size: 2, kind: 'm', sub: 'v' }, { label: '2σ_d', size: 2, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A1g', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A2g', [1, 1, 1, -1, -1, 1, 1, 1, -1, -1], '', '', 'R_z'),
      ir('B1g', [1, -1, 1, 1, -1, 1, -1, 1, 1, -1], '', 'x²−y²'),
      ir('B2g', [1, -1, 1, -1, 1, 1, -1, 1, -1, 1], '', 'xy'),
      ir('Eg', [2, 0, -2, 0, 0, 2, 0, -2, 0, 0], '', '(xz, yz)', '(R_x, R_y)'),
      ir('A1u', [1, 1, 1, 1, 1, -1, -1, -1, -1, -1], '', ''),
      ir('A2u', [1, 1, 1, -1, -1, -1, -1, -1, 1, 1], 'z', ''),
      ir('B1u', [1, -1, 1, 1, -1, -1, 1, -1, -1, 1], '', ''),
      ir('B2u', [1, -1, 1, -1, 1, -1, 1, -1, 1, -1], '', ''),
      ir('Eu', [2, 0, -2, 0, 0, -2, 0, 2, 0, 0], '(x, y)', '')
    ],
    gens: [rotZ(Math.PI / 2), rotAxis([1, 0, 0], Math.PI), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 5;
      if (s.kind === 'C' && s.n === 4) return 1;
      if (s.kind === 'C' && alongZ(s.axis)) return 2;
      if (s.kind === 'C') return modBucket(s.axis, 90) < 20 ? 3 : 4;
      if (s.kind === 'S') return 6;
      if (s.kind === 'm' && alongZ(s.normal)) return 7;
      if (s.kind === 'm') return modBucket(s.normal, 90) < 20 ? 8 : 9;
      return -1;
    }
  });
  add({
    id: 'D6h', name: 'D₆ₕ', hm: '6/mmm', order: 24, family: 'Dnh', n: 6, polar: false, chiral: false, centrosym: true,
    blurb: 'Бензол. C₂′ через атомы, C₂″ через связи; σᵥ через атомы, σ_d через связи.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₆', size: 2, kind: 'C', n: 6, axes: 1 }, { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 },
      { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 }, { label: '3C₂′', size: 3, kind: 'C', n: 2, axes: 3 }, { label: '3C₂″', size: 3, kind: 'C', n: 2, axes: 3 },
      { label: 'i', size: 1, kind: 'i' }, { label: '2S₃', size: 2, kind: 'S', n: 3, axes: 1 }, { label: '2S₆', size: 2, kind: 'S', n: 6, axes: 1 },
      { label: 'σₕ', size: 1, kind: 'm', sub: 'h' }, { label: '3σ_d', size: 3, kind: 'm', sub: 'd' }, { label: '3σᵥ', size: 3, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A1g', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A2g', [1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1], '', '', 'R_z'),
      ir('B1g', [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1], '', ''),
      ir('B2g', [1, -1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1], '', ''),
      ir('E1g', [2, 1, -1, -2, 0, 0, 2, 1, -1, -2, 0, 0], '', '(xz, yz)', '(R_x, R_y)'),
      ir('E2g', [2, -1, -1, 2, 0, 0, 2, -1, -1, 2, 0, 0], '', '(x²−y², xy)'),
      ir('A1u', [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1], '', ''),
      ir('A2u', [1, 1, 1, 1, -1, -1, -1, -1, -1, -1, 1, 1], 'z', ''),
      ir('B1u', [1, -1, 1, -1, 1, -1, -1, 1, -1, 1, -1, 1], '', ''),
      ir('B2u', [1, -1, 1, -1, -1, 1, -1, 1, -1, 1, 1, -1], '', ''),
      ir('E1u', [2, 1, -1, -2, 0, 0, -2, -1, 1, 2, 0, 0], '(x, y)', ''),
      ir('E2u', [2, -1, -1, 2, 0, 0, -2, 1, 1, -2, 0, 0], '', '')
    ],
    gens: [rotZ(TAU / 6), rotAxis([1, 0, 0], Math.PI), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 6;
      if (s.kind === 'C' && s.n === 6) return 1;
      if (s.kind === 'C' && s.n === 3) return 2;
      if (s.kind === 'C' && alongZ(s.axis)) return 3;
      if (s.kind === 'C') return modBucket(s.axis, 60) < 15 ? 4 : 5;
      if (s.kind === 'm' && alongZ(s.normal)) return 9;
      if (s.kind === 'm') return modBucket(s.normal, 60) < 15 ? 11 : 10;
      if (s.kind === 'S') return s.tr < -1 ? 7 : 8;
      return -1;
    }
  });

  // D5h eclipsed ferrocene
  add({
    id: 'D5h', name: 'D₅ₕ', hm: '10̄m2', order: 20, family: 'Dnh', n: 5, polar: false, chiral: false,
    blurb: 'Заслонённый ферроцен. Плоскость σₕ между кольцами нет — кольца друг над другом.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₅', size: 2, kind: 'C', n: 5, axes: 1 }, { label: '2C₅²', size: 2, kind: 'C', n: 5, axes: 1 },
      { label: '5C₂', size: 5, kind: 'C', n: 2, axes: 5 }, { label: 'σₕ', size: 1, kind: 'm', sub: 'h' },
      { label: '2S₅', size: 2, kind: 'S', n: 5, axes: 1 }, { label: '2S₅³', size: 2, kind: 'S', n: 5, axes: 1 }, { label: '5σᵥ', size: 5, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('A₁′', [1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A₂′', [1, 1, 1, -1, 1, 1, 1, -1], '', '', 'R_z'),
      ir('E₁′', [2, C72, C144, 0, 2, C72, C144, 0], '(x, y)', ''),
      ir('E₂′', [2, C144, C72, 0, 2, C144, C72, 0], '', '(x²−y², xy)'),
      ir('A₁″', [1, 1, 1, 1, -1, -1, -1, -1], '', ''),
      ir('A₂″', [1, 1, 1, -1, -1, -1, -1, 1], 'z', ''),
      ir('E₁″', [2, C72, C144, 0, -2, -C72, -C144, 0], '', '(xz, yz)', '(R_x, R_y)'),
      ir('E₂″', [2, C144, C72, 0, -2, -C144, -C72, 0], '', '')
    ],
    gens: [rotZ(TAU / 5), rotAxis([1, 0, 0], Math.PI), SIG_H],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'C' && s.n === 2) return 3;
      if (s.kind === 'C') {
        const p = Math.round(s.ang / (TAU / 5));
        return (p === 1 || p === 4) ? 1 : 2;
      }
      if (s.kind === 'm' && alongZ(s.normal)) return 4;
      if (s.kind === 'm') return 7;
      if (s.kind === 'S') return s.tr > -1 ? 5 : 6;
      return -1;
    }
  });

  // Dnd
  add({
    id: 'D2d', name: 'D₂d', hm: '4̄2m', order: 8, family: 'Dnd', n: 2, polar: false, chiral: false,
    blurb: 'Аллен. Ось S₄, две оси C₂ и две плоскости σ_d.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2S₄', size: 2, kind: 'S', n: 4, axes: 1 }, { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 },
      { label: '2C₂′', size: 2, kind: 'C', n: 2, axes: 2 }, { label: '2σ_d', size: 2, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A₂', [1, 1, 1, -1, -1], '', '', 'R_z'),
      ir('B₁', [1, -1, 1, 1, -1], '', 'x²−y²'),
      ir('B₂', [1, -1, 1, -1, 1], 'z', 'xy'),
      ir('E', [2, 0, -2, 0, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)')
    ],
    gens: [mulM(SIG_H, rotZ(Math.PI / 2)), rotAxis([1, 1, 0], Math.PI)],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'S') return 1;
      if (s.kind === 'C' && alongZ(s.axis)) return 2;
      if (s.kind === 'C') return 3;
      return 4;
    }
  });
  add({
    id: 'D3d', name: 'D₃d', hm: '3̄m', order: 12, family: 'Dnd', n: 3, polar: false, chiral: false, centrosym: true,
    blurb: 'Заторможенный этан и кресло циклогексана. Есть центр инверсии.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₃', size: 2, kind: 'C', n: 3, axes: 1 }, { label: '3C₂', size: 3, kind: 'C', n: 2, axes: 3 },
      { label: 'i', size: 1, kind: 'i' }, { label: '2S₆', size: 2, kind: 'S', n: 6, axes: 1 }, { label: '3σ_d', size: 3, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A1g', [1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A2g', [1, 1, -1, 1, 1, -1], '', '', 'R_z'),
      ir('Eg', [2, -1, 0, 2, -1, 0], '', '(x²−y², xy), (xz, yz)', '(R_x, R_y)'),
      ir('A1u', [1, 1, 1, -1, -1, -1], '', ''),
      ir('A2u', [1, 1, -1, -1, -1, 1], 'z', ''),
      ir('Eu', [2, -1, 0, -2, 1, 0], '(x, y)', '')
    ],
    gens: [rotZ(TAU / 3), rotAxis([1, 0, 0], Math.PI), INV],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 3;
      if (s.kind === 'C' && s.n === 3) return 1;
      if (s.kind === 'C') return 2;
      if (s.kind === 'm') return 5;
      return 4;
    }
  });
  add({
    id: 'D5d', name: 'D₅d', hm: '5̄m', order: 20, family: 'Dnd', n: 5, polar: false, chiral: false, centrosym: true,
    blurb: 'Заторможенный ферроцен. Центросимметричный.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C₅', size: 2, kind: 'C', n: 5, axes: 1 }, { label: '2C₅²', size: 2, kind: 'C', n: 5, axes: 1 },
      { label: '5C₂', size: 5, kind: 'C', n: 2, axes: 5 }, { label: 'i', size: 1, kind: 'i' },
      { label: '2S₁₀', size: 2, kind: 'S', n: 10, axes: 1 }, { label: '2S₁₀³', size: 2, kind: 'S', n: 10, axes: 1 }, { label: '5σ_d', size: 5, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A1g', [1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('A2g', [1, 1, 1, -1, 1, 1, 1, -1], '', '', 'R_z'),
      ir('E1g', [2, C72, C144, 0, 2, -C36, -C108, 0], '', '(xz, yz)', '(R_x, R_y)'),
      ir('E2g', [2, C144, C72, 0, 2, C72, C144, 0], '', '(x²−y², xy)'),
      ir('A1u', [1, 1, 1, 1, -1, -1, -1, -1], '', ''),
      ir('A2u', [1, 1, 1, -1, -1, -1, -1, 1], 'z', ''),
      ir('E1u', [2, C72, C144, 0, -2, C36, C108, 0], '(x, y)', ''),
      ir('E2u', [2, C144, C72, 0, -2, -C72, -C144, 0], '', '')
    ],
    gens: [rotZ(TAU / 5), rotAxis([Math.cos(deg(18)), Math.sin(deg(18)), 0], Math.PI), INV],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 4;
      if (s.kind === 'C' && s.n === 2) return 3;
      if (s.kind === 'C') {
        const p = Math.round(s.ang / (TAU / 5));
        return (p === 1 || p === 4) ? 1 : 2;
      }
      if (s.kind === 'm') return 7;
      if (s.kind === 'S') return s.tr > 0 ? 5 : 6;
      return -1;
    }
  });

  // Sn
  add({
    id: 'S4', name: 'S₄', hm: '4̄', order: 4, family: 'Sn', n: 4, polar: false, chiral: false,
    blurb: 'Только зеркально-поворотная ось S₄. Не полярна и не хиральна.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'S₄', size: 1, kind: 'S', n: 4 }, { label: 'C₂', size: 1, kind: 'C', n: 2, axes: 1 }, { label: 'S₄³', size: 1, kind: 'S', n: 4 }
    ],
    irreps: [
      ir('A', [1, 1, 1, 1], '', 'x²+y², z²', 'R_z'),
      ir('B', [1, -1, 1, -1], 'z', 'x²−y², xy'),
      ir('E', [2, 0, -2, 0], '(x, y)', '(xz, yz)', '(R_x, R_y)')
    ],
    gens: [mulM(SIG_H, rotZ(Math.PI / 2))],
    classOf: s => s.kind === 'E' ? 0 : s.kind === 'C' ? 2 : (s.ang < Math.PI / 2 + 0.2 && s.ang > 0.2 ? (s.ang < 2 ? 1 : 3) : 3)
  });
  add({
    id: 'S6', name: 'S₆', hm: '3̄', order: 6, family: 'Sn', n: 6, polar: false, chiral: false, centrosym: true,
    blurb: 'S₆ = C₃ᵢ. Ось C₃ и центр инверсии.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: 'C₃', size: 1, kind: 'C', n: 3 }, { label: 'C₃²', size: 1, kind: 'C', n: 3 },
      { label: 'i', size: 1, kind: 'i' }, { label: 'S₆⁵', size: 1, kind: 'S', n: 6 }, { label: 'S₆', size: 1, kind: 'S', n: 6 }
    ],
    irreps: [
      ir('A_g', [1, 1, 1, 1, 1, 1], '', 'x²+y², z²', 'R_z'),
      ir('E_g', [2, -1, -1, 2, -1, -1], '', '(x²−y², xy), (xz, yz)', '(R_x, R_y)'),
      ir('A_u', [1, 1, 1, -1, -1, -1], 'z', ''),
      ir('E_u', [2, -1, -1, -2, 1, 1], '(x, y)', '')
    ],
    gens: [mulM(SIG_H, rotZ(TAU / 6))],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 3;
      if (s.kind === 'C') return Math.round(s.ang / (TAU / 3)) === 1 ? 1 : 2;
      return s.tr < -1 ? 4 : 5;
    }
  });

  // T, Td, Th, O, Oh
  const C3body = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
  add({
    id: 'T', name: 'T', hm: '23', order: 12, family: 'T', n: 3, polar: false, chiral: true,
    blurb: 'Четыре оси C₃ и три C₂, без плоскостей. Хиральная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '8C₃', size: 8, kind: 'C', n: 3, axes: 4 }, { label: '3C₂', size: 3, kind: 'C', n: 2, axes: 3 }
    ],
    irreps: [
      ir('A', [1, 1, 1], '', 'x²+y²+z²'),
      ir('E', [2, -1, 2], '', '(2z²−x²−y², x²−y²)'),
      ir('T', [3, 0, -1], '(x, y, z)', '', '(R_x, R_y, R_z)')
    ],
    gens: [C3body, rotZ(Math.PI)],
    classOf: s => s.kind === 'E' ? 0 : s.n === 3 ? 1 : 2
  });
  add({
    id: 'Td', name: 'Td', hm: '4̄3m', order: 24, family: 'Td', n: 3, polar: false, chiral: false,
    blurb: 'Метан, CCl₄. Тетраэдр: 4 оси C₃, 3 оси C₂, 6 осей S₄, 6 плоскостей σ_d.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '8C₃', size: 8, kind: 'C', n: 3, axes: 4 }, { label: '3C₂', size: 3, kind: 'C', n: 2, axes: 3 },
      { label: '6S₄', size: 6, kind: 'S', n: 4, axes: 3 }, { label: '6σ_d', size: 6, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1], '', 'x²+y²+z²'),
      ir('A₂', [1, 1, 1, -1, -1], '', ''),
      ir('E', [2, -1, 2, 0, 0], '', '(2z²−x²−y², x²−y²)'),
      ir('T₁', [3, 0, -1, 1, -1], '', '', '(R_x, R_y, R_z)'),
      ir('T₂', [3, 0, -1, -1, 1], '(x, y, z)', '(xy, xz, yz)')
    ],
    gens: [C3body, mulM(SIG_H, rotZ(Math.PI / 2))],
    classOf: s => s.kind === 'E' ? 0 : s.kind === 'C' && s.n === 3 ? 1 : s.kind === 'C' ? 2 : s.kind === 'S' ? 3 : 4
  });
  add({
    id: 'Th', name: 'Tₕ', hm: 'm3̄', order: 24, family: 'Th', n: 3, polar: false, chiral: false, centrosym: true,
    blurb: 'Тетраэдр плюс центр инверсии. Редко у молекул (например, некоторые комплексы).',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '8C₃', size: 8, kind: 'C', n: 3, axes: 4 }, { label: '3C₂', size: 3, kind: 'C', n: 2, axes: 3 },
      { label: 'i', size: 1, kind: 'i' }, { label: '8S₆', size: 8, kind: 'S', n: 6, axes: 4 }, { label: '3σₕ', size: 3, kind: 'm', sub: 'h' }
    ],
    irreps: [
      ir('A_g', [1, 1, 1, 1, 1, 1], '', 'x²+y²+z²'),
      ir('E_g', [2, -1, 2, 2, -1, 2], '', '(2z²−x²−y², x²−y²)'),
      ir('T_g', [3, 0, -1, 3, 0, -1], '', '', '(R_x, R_y, R_z)'),
      ir('A_u', [1, 1, 1, -1, -1, -1], '', ''),
      ir('E_u', [2, -1, 2, -2, 1, -2], '', ''),
      ir('T_u', [3, 0, -1, -3, 0, 1], '(x, y, z)', '')
    ],
    gens: [C3body, rotZ(Math.PI), INV],
    classOf: s => s.kind === 'E' ? 0 : s.kind === 'i' ? 3 : s.kind === 'C' && s.n === 3 ? 1 : s.kind === 'C' ? 2 : s.kind === 'm' ? 5 : 4
  });
  add({
    id: 'O', name: 'O', hm: '432', order: 24, family: 'O', n: 4, polar: false, chiral: true,
    blurb: 'Вращения октаэдра без плоскостей и инверсии. Хиральная.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '8C₃', size: 8, kind: 'C', n: 3, axes: 4 }, { label: '6C₂', size: 6, kind: 'C', n: 2, axes: 6 },
      { label: '6C₄', size: 6, kind: 'C', n: 4, axes: 3 }, { label: '3C₂′', size: 3, kind: 'C', n: 2, axes: 3 }
    ],
    irreps: [
      ir('A₁', [1, 1, 1, 1, 1], '', 'x²+y²+z²'),
      ir('A₂', [1, 1, -1, -1, 1], '', ''),
      ir('E', [2, -1, 0, 0, 2], '', '(2z²−x²−y², x²−y²)'),
      ir('T₁', [3, 0, -1, 1, -1], '(x, y, z)', '', '(R_x, R_y, R_z)'),
      ir('T₂', [3, 0, 1, -1, -1], '', '(xy, xz, yz)')
    ],
    gens: [rotZ(Math.PI / 2), C3body],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.n === 3) return 1;
      if (s.n === 4) return 3;
      return cubicBucket(s.axis) === '100' ? 4 : 2;
    }
  });
  add({
    id: 'Oh', name: 'Oₕ', hm: 'm3̄m', order: 48, family: 'Oh', n: 4, polar: false, chiral: false, centrosym: true,
    blurb: 'SF₆, [Fe(CN)₆]³⁻. Октаэдр: инверсия, 3C₄, 4C₃, 6σ_d, 3σₕ.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '8C₃', size: 8, kind: 'C', n: 3, axes: 4 }, { label: '6C₂', size: 6, kind: 'C', n: 2, axes: 6 },
      { label: '6C₄', size: 6, kind: 'C', n: 4, axes: 3 }, { label: '3C₂′', size: 3, kind: 'C', n: 2, axes: 3 },
      { label: 'i', size: 1, kind: 'i' }, { label: '6S₄', size: 6, kind: 'S', n: 4, axes: 3 }, { label: '8S₆', size: 8, kind: 'S', n: 6, axes: 4 },
      { label: '3σₕ', size: 3, kind: 'm', sub: 'h' }, { label: '6σ_d', size: 6, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('A1g', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y²+z²'),
      ir('A2g', [1, 1, -1, -1, 1, 1, -1, 1, 1, -1], '', ''),
      ir('Eg', [2, -1, 0, 0, 2, 2, 0, -1, 2, 0], '', '(2z²−x²−y², x²−y²)'),
      ir('T1g', [3, 0, -1, 1, -1, 3, 1, 0, -1, -1], '', '', '(R_x, R_y, R_z)'),
      ir('T2g', [3, 0, 1, -1, -1, 3, -1, 0, -1, 1], '', '(xy, xz, yz)'),
      ir('A1u', [1, 1, 1, 1, 1, -1, -1, -1, -1, -1], '', ''),
      ir('A2u', [1, 1, -1, -1, 1, -1, 1, -1, -1, 1], '', ''),
      ir('Eu', [2, -1, 0, 0, 2, -2, 0, 1, -2, 0], '', ''),
      ir('T1u', [3, 0, -1, 1, -1, -3, -1, 0, 1, 1], '(x, y, z)', ''),
      ir('T2u', [3, 0, 1, -1, -1, -3, 1, 0, 1, -1], '', '')
    ],
    gens: [rotZ(Math.PI / 2), C3body, INV],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 5;
      if (s.kind === 'C' && s.n === 3) return 1;
      if (s.kind === 'C' && s.n === 4) return 3;
      if (s.kind === 'C') return cubicBucket(s.axis) === '100' ? 4 : 2;
      if (s.kind === 'S') return s.n === 4 ? 6 : 7;
      if (s.kind === 'm') return cubicBucket(s.normal) === '100' ? 8 : 9;
      return -1;
    }
  });

  // I, Ih — генераторы: C5 вокруг (0,1,φ), C3 по (111), C2 по z, для Ih ещё инверсия
  const axis5 = [0, 1, PHI];
  add({
    id: 'I', name: 'I', hm: '532', order: 60, family: 'I', n: 5, polar: false, chiral: true,
    blurb: 'Вращения икосаэдра. Хиральная, без зеркал. 6 осей C₅, 10 осей C₃, 15 осей C₂.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '12C₅', size: 12, kind: 'C', n: 5, axes: 6 }, { label: '12C₅²', size: 12, kind: 'C', n: 5, axes: 6 },
      { label: '20C₃', size: 20, kind: 'C', n: 3, axes: 10 }, { label: '15C₂', size: 15, kind: 'C', n: 2, axes: 15 }
    ],
    irreps: [
      ir('A', [1, 1, 1, 1, 1], '', 'x²+y²+z²'),
      ir('T₁', [3, PHI, 1 - PHI, 0, -1], '(x, y, z)', '', '(R_x, R_y, R_z)'),
      ir('T₂', [3, 1 - PHI, PHI, 0, -1], '', ''),
      ir('G', [4, -1, -1, 1, 0], '', ''),
      ir('H', [5, 0, 0, -1, 1], '', '(2z²−x²−y² и др.)')
    ],
    gens: [rotAxis(axis5, TAU / 5), C3body, rotZ(Math.PI)],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.n === 3) return 3;
      if (s.n === 2) return 4;
      const p = Math.round(s.ang / (TAU / 5));
      return (p === 1 || p === 4) ? 1 : 2;
    }
  });
  add({
    id: 'Ih', name: 'Iₕ', hm: '53̄m', order: 120, family: 'Ih', n: 5, polar: false, chiral: false, centrosym: true,
    blurb: 'C₆₀, B₁₂H₁₂²⁻. Икосаэдр с центром инверсии.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '12C₅', size: 12, kind: 'C', n: 5, axes: 6 }, { label: '12C₅²', size: 12, kind: 'C', n: 5, axes: 6 },
      { label: '20C₃', size: 20, kind: 'C', n: 3, axes: 10 }, { label: '15C₂', size: 15, kind: 'C', n: 2, axes: 15 },
      { label: 'i', size: 1, kind: 'i' }, { label: '12S₁₀', size: 12, kind: 'S', n: 10, axes: 6 }, { label: '12S₁₀³', size: 12, kind: 'S', n: 10, axes: 6 },
      { label: '20S₆', size: 20, kind: 'S', n: 6, axes: 10 }, { label: '15σ', size: 15, kind: 'm', sub: 'd' }
    ],
    irreps: [
      ir('Ag', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '', 'x²+y²+z²'),
      ir('T1g', [3, PHI, 1 - PHI, 0, -1, 3, PHI, 1 - PHI, 0, -1], '', '', '(R_x, R_y, R_z)'),
      ir('T2g', [3, 1 - PHI, PHI, 0, -1, 3, 1 - PHI, PHI, 0, -1], '', ''),
      ir('Gg', [4, -1, -1, 1, 0, 4, -1, -1, 1, 0], '', ''),
      ir('Hg', [5, 0, 0, -1, 1, 5, 0, 0, -1, 1], '', 'квадратичные'),
      ir('Au', [1, 1, 1, 1, 1, -1, -1, -1, -1, -1], '', ''),
      ir('T1u', [3, PHI, 1 - PHI, 0, -1, -3, -PHI, PHI - 1, 0, 1], '(x, y, z)', ''),
      ir('T2u', [3, 1 - PHI, PHI, 0, -1, -3, PHI - 1, -PHI, 0, 1], '', ''),
      ir('Gu', [4, -1, -1, 1, 0, -4, 1, 1, -1, 0], '', ''),
      ir('Hu', [5, 0, 0, -1, 1, -5, 0, 0, 1, -1], '', '')
    ],
    gens: [rotAxis(axis5, TAU / 5), C3body, rotZ(Math.PI), INV],
    classOf: s => {
      if (s.kind === 'E') return 0;
      if (s.kind === 'i') return 5;
      if (s.kind === 'm') return 9;
      if (s.kind === 'C' && s.n === 3) return 3;
      if (s.kind === 'C' && s.n === 2) return 4;
      if (s.kind === 'C') {
        const p = Math.round(s.ang / (TAU / 5));
        return (p === 1 || p === 4) ? 1 : 2;
      }
      if (s.kind === 'S') {
        if (s.tr < -1) return 6;
        if (s.tr > 0.3) return 7;
        return 8;
      }
      return -1;
    }
  });

  // бесконечные
  add({
    id: 'Cinfv', name: 'C∞ᵥ', hm: '∞m', order: Infinity, family: 'Cinfv', n: Infinity, polar: true, chiral: false, infinite: true,
    blurb: 'Линейная молекула без центра инверсии: HCl, CO, HCN. Диполь вдоль оси.',
    classes: [
      { label: 'E', size: 1, kind: 'E' }, { label: '2C∞^φ', size: 2, kind: 'C' }, { label: '∞σᵥ', size: 1, kind: 'm', sub: 'v' }
    ],
    irreps: [
      ir('Σ⁺', [1, 1, 1], 'z', 'x²+y², z²'),
      ir('Σ⁻', [1, 1, -1], '', '', 'R_z'),
      ir('Π', [2, '2cos φ', 0], '(x, y)', '(xz, yz)', '(R_x, R_y)'),
      ir('Δ', [2, '2cos 2φ', 0], '', '(x²−y², xy)'),
      ir('Φ', [2, '2cos 3φ', 0], '', '')
    ],
    gens: [], classOf: () => 0
  });
  add({
    id: 'Dinfh', name: 'D∞ₕ', hm: '∞/mm', order: Infinity, family: 'Dinfh', n: Infinity, polar: false, chiral: false, centrosym: true, infinite: true,
    blurb: 'Линейная с центром инверсии: CO₂, H₂, ацетилен. Правило альтернативного запрета.',
    classes: [
      { label: 'E', size: 1 }, { label: '2C∞^φ', size: 2 }, { label: '∞σᵥ', size: 1 }, { label: 'i', size: 1 }, { label: '2S∞^φ', size: 2 }, { label: '∞C₂', size: 1 }
    ],
    irreps: [
      ir('Σg⁺', [1, 1, 1, 1, 1, 1], '', 'x²+y², z²'),
      ir('Σg⁻', [1, 1, -1, 1, 1, -1], '', '', 'R_z'),
      ir('Πg', [2, '2cos φ', 0, 2, '-2cos φ', 0], '', '(xz, yz)', '(R_x, R_y)'),
      ir('Δg', [2, '2cos 2φ', 0, 2, '2cos 2φ', 0], '', '(x²−y², xy)'),
      ir('Σu⁺', [1, 1, 1, -1, -1, -1], 'z', ''),
      ir('Σu⁻', [1, 1, -1, -1, -1, 1], '', ''),
      ir('Πu', [2, '2cos φ', 0, -2, '2cos φ', 0], '(x, y)', ''),
      ir('Δu', [2, '2cos 2φ', 0, -2, '-2cos 2φ', 0], '', '')
    ],
    gens: [], classOf: () => 0
  });

  // Починить C6h classOf сейчас, до кэша операций
  byId.get('C6h').classOf = s => {
    if (s.kind === 'E') return 0;
    if (s.kind === 'i') return 6;
    if (s.kind === 'm') return 9;
    const p = Math.round(s.sang / (TAU / 6)) % 6;
    if (s.kind === 'C') return p;
    if (s.kind === 'S') return { 1: 10, 2: 11, 4: 7, 5: 8 }[p] ?? -1;
    return -1;
  };
  byId.get('S4').classOf = s => {
    if (s.kind === 'E') return 0;
    if (s.kind === 'C') return 2;
    const p = Math.round(s.sang / (Math.PI / 2)) % 4;
    return p === 1 ? 1 : 3;
  };
  byId.get('S6').classOf = s => {
    if (s.kind === 'E') return 0;
    if (s.kind === 'i') return 3;
    const p = Math.round(s.sang / (TAU / 6)) % 6;
    if (s.kind === 'C') return p === 2 ? 1 : 2;
    return p === 1 ? 5 : 4;
  };

  const opCache = new Map();
  function operations(id) {
    if (opCache.has(id)) return opCache.get(id);
    const g = byId.get(id);
    if (!g) throw new Error(id);
    if (g.infinite) {
      const ops = [
        { R: I3, sig: signature(I3), cls: 0, label: 'E', power: 1 },
        { R: rotZ(deg(40)), sig: signature(rotZ(deg(40))), cls: 1, label: 'C∞', power: 1 },
        { R: SIG_XZ, sig: signature(SIG_XZ), cls: 2, label: 'σᵥ', power: 1 }
      ];
      if (id === 'Dinfh') {
        ops.push({ R: INV, sig: signature(INV), cls: 3, label: 'i', power: 1 });
        ops.push({ R: mulM(SIG_H, rotZ(deg(40))), sig: signature(mulM(SIG_H, rotZ(deg(40)))), cls: 4, label: 'S∞', power: 1 });
        ops.push({ R: rotAxis([1, 0, 0], Math.PI), sig: signature(rotAxis([1, 0, 0], Math.PI)), cls: 5, label: 'C₂', power: 1 });
      }
      ops.forEach(o => { o.kind = o.sig.kind; o.axis = o.sig.axis; o.normal = o.sig.normal; });
      opCache.set(id, ops);
      return ops;
    }
    const ops = buildOps(g.gens, g.classOf);
    const counts = g.classes.map(() => 0);
    ops.forEach(o => {
      if (o.cls == null || o.cls < 0 || !g.classes[o.cls]) {
        throw new Error(id + ' операция без класса ' + o.label + ' kind=' + o.sig.kind + ' n=' + o.sig.n + ' tr=' + o.sig.tr.toFixed(3));
      }
      counts[o.cls]++;
      const c = g.classes[o.cls];
      o.kind = o.sig.kind;
      o.axis = o.sig.axis;
      o.normal = o.sig.normal;
      if (c.kind === 'm') o.label = c.label.replace(/^\d+/, '') || 'σ';
      else if (o.kind === 'C' || o.kind === 'S') o.label = prettyOp(o.sig, o.power);
      else o.label = prettyOp(o.sig, 1);
    });
    g.classes.forEach((c, i) => {
      if (counts[i] !== c.size) throw new Error(id + ' класс ' + c.label + ' ' + counts[i] + '≠' + c.size);
    });
    if (ops.length !== g.order) throw new Error(id + ' порядок операций ' + ops.length);
    opCache.set(id, ops);
    return ops;
  }

  function loci(id) {
    const g = byId.get(id);
    const ops = operations(id).filter(o => o.kind !== 'E');
    const axes = [];
    const planes = [];
    let inv = null;
    function findAxis(list, axis, n) {
      const u = unit(axis);
      return list.find(a => Math.abs(dot(a.axis, u)) > 0.98 && a.n === n);
    }
    ops.forEach(o => {
      if (o.kind === 'i') inv = { kind: 'point', label: 'i', origin: [0, 0, 0] };
      if (o.kind === 'C' && o.axis) {
        let hit = findAxis(axes, o.axis, o.sig.n);
        if (!hit) axes.push({ kind: 'axis', n: o.sig.n, axis: unit(o.axis), label: 'C' + subNum(o.sig.n), ops: [o] });
        else hit.ops.push(o);
      }
      if (o.kind === 'S' && o.axis) {
        let hit = findAxis(axes, o.axis, o.sig.n);
        if (!hit) axes.push({ kind: 'saxis', n: o.sig.n, axis: unit(o.axis), label: 'S' + subNum(o.sig.n), ops: [o] });
      }
      if (o.kind === 'm' && o.normal) {
        const u = unit(o.normal);
        if (!planes.some(p => Math.abs(dot(p.normal, u)) > 0.98)) {
          const cls = g.classes[o.cls] || {};
          const sub = cls.sub || (Math.abs(u[2]) > 0.85 ? 'h' : 'v');
          const lab = sub === 'h' ? 'σₕ' : sub === 'd' ? 'σ_d' : 'σᵥ';
          planes.push({ kind: 'plane', sub, normal: u, label: lab });
        }
      }
    });
    // на одной прямой оставляем ось старшего порядка как главную, но S и C оба рисуем если разные
    return { axes, planes, inv };
  }

  function reduce(pgId, gamma) {
    const g = byId.get(pgId);
    if (g.infinite) return [];
    return g.irreps.map(irrep => {
      let s = 0;
      g.classes.forEach((c, i) => { s += c.size * gamma[i] * irrep.chi[i]; });
      const n = s / g.order;
      return { name: irrep.name, n: Math.round(n * 1000) / 1000, ir: irrep };
    }).filter(x => Math.abs(x.n) > 1e-6);
  }

  function projectGamma(pgId, chiOfOp) {
    const g = byId.get(pgId);
    const ops = operations(pgId);
    const gamma = g.classes.map(() => null);
    ops.forEach(o => {
      const chi = chiOfOp(o);
      if (gamma[o.cls] == null) gamma[o.cls] = chi;
    });
    return gamma.map(v => v || 0);
  }

  const RCOV = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, S: 1.05, CL: 1.02, BR: 1.2, P: 1.07, B: 0.84, FE: 1.32, XE: 1.3, CO: 1.26, I: 1.39 };
  function bondsOf(atoms) {
    const b = [];
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
      const ei = atoms[i].el.toUpperCase(), ej = atoms[j].el.toUpperCase();
      if (ei === 'H' && ej === 'H') continue;
      const lim = ((RCOV[ei] || 0.8) + (RCOV[ej] || 0.8)) * 1.35;
      const d = dist(atoms[i].pos, atoms[j].pos);
      if (d > 0.5 && d < Math.max(lim, 1.15)) b.push([i, j]);
    }
    return b;
  }
  function A(el, pos) { return { el, pos }; }

  function ringCarbons(n, r, z) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = TAU * k / n;
      out.push(A('C', [r * Math.cos(a), r * Math.sin(a), z]));
    }
    return out;
  }

  const molecules = [];
  const molBy = new Map();
  function addMol(m) {
    m.atoms.forEach(a => { if (!a.pos) return; });
    m.bonds = m.bonds || bondsOf(m.atoms);
    molecules.push(m);
    molBy.set(m.id, m);
  }

  function h2o() {
    const bl = 0.958, ang = deg(104.5) / 2;
    const y = bl * Math.sin(ang), z = bl * Math.cos(ang);
    return [A('O', [0, 0, 0]), A('H', [0, y, z]), A('H', [0, -y, z])];
  }
  function so2() {
    const bl = 1.43, ang = deg(119.2) / 2;
    return [A('S', [0, 0, 0]), A('O', [0, bl * Math.sin(ang), bl * Math.cos(ang)]), A('O', [0, -bl * Math.sin(ang), bl * Math.cos(ang)])];
  }
  function nh3() {
    const bl = 1.012, alpha = deg(106.7);
    const c = Math.cos(alpha);
    const cosb = Math.sqrt((c + 0.5) / 1.5);
    const sinb = Math.sqrt(1 - cosb * cosb);
    const z = bl * cosb, r = bl * sinb;
    return [A('N', [0, 0, 0]), A('H', [r, 0, z]), A('H', [-r / 2, r * Math.sqrt(3) / 2, z]), A('H', [-r / 2, -r * Math.sqrt(3) / 2, z])];
  }
  function tetra(elC, ligands) {
    // ligands: [{el, len}] по 4 вершинам
    const raw = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const atoms = [A(elC, [0, 0, 0])];
    raw.forEach((v, i) => atoms.push(A(ligands[i].el, mulv(unit(v), ligands[i].len))));
    return atoms;
  }
  function ch4() { return tetra('C', [{ el: 'H', len: 1.09 }, { el: 'H', len: 1.09 }, { el: 'H', len: 1.09 }, { el: 'H', len: 1.09 }]); }
  function ccl4() { return tetra('C', [{ el: 'Cl', len: 1.77 }, { el: 'Cl', len: 1.77 }, { el: 'Cl', len: 1.77 }, { el: 'Cl', len: 1.77 }]); }
  function chfclbr() { return tetra('C', [{ el: 'H', len: 1.09 }, { el: 'F', len: 1.35 }, { el: 'Cl', len: 1.77 }, { el: 'Br', len: 1.94 }]); }
  function chcl3() {
    const ang = deg(108.5);
    const bl = 1.76;
    const z = bl * Math.cos(ang), r = bl * Math.sin(ang);
    return [
      A('C', [0, 0, 0]), A('H', [0, 0, 1.09]),
      A('Cl', [r, 0, z]), A('Cl', [-r / 2, r * Math.sqrt(3) / 2, z]), A('Cl', [-r / 2, -r * Math.sqrt(3) / 2, z])
    ];
  }
  function sf6() {
    const d = 1.56, a = [A('S', [0, 0, 0])];
    [[d, 0, 0], [-d, 0, 0], [0, d, 0], [0, -d, 0], [0, 0, d], [0, 0, -d]].forEach(p => a.push(A('F', p)));
    return a;
  }
  function bf3() {
    const d = 1.31, a = [A('B', [0, 0, 0])];
    for (let k = 0; k < 3; k++) a.push(A('F', [d * Math.cos(TAU * k / 3), d * Math.sin(TAU * k / 3), 0]));
    return a;
  }
  function benzene() {
    const rc = 1.395, rh = rc + 1.084, a = [];
    for (let k = 0; k < 6; k++) {
      const t = TAU * k / 6;
      a.push(A('C', [rc * Math.cos(t), rc * Math.sin(t), 0]));
    }
    for (let k = 0; k < 6; k++) {
      const t = TAU * k / 6;
      a.push(A('H', [rh * Math.cos(t), rh * Math.sin(t), 0]));
    }
    return a;
  }
  function ethane(staggered) {
    const cc = 1.535, ch = 1.095, ang = deg(111.2);
    const dz = ch * Math.cos(ang), r = ch * Math.sin(ang);
    const zc = cc / 2;
    const a = [A('C', [0, 0, -zc]), A('C', [0, 0, zc])];
    for (let k = 0; k < 3; k++) {
      const t = TAU * k / 3;
      a.push(A('H', [r * Math.cos(t), r * Math.sin(t), -zc + dz]));
    }
    const shift = staggered ? TAU / 6 : 0;
    for (let k = 0; k < 3; k++) {
      const t = TAU * k / 3 + shift;
      a.push(A('H', [r * Math.cos(t), r * Math.sin(t), zc - dz]));
    }
    if (staggered) {
      const R = rotZ(deg(30));
      a.forEach(at => { at.pos = apply(R, at.pos); });
    }
    return a;
  }
  function allene() {
    const cc = 1.31, ch = 1.08, ang = deg(118.5);
    // угол C–C–H от оси: (360-118.5)/2 от продолжения? для sp2 угол C-C-H ≈ 120.75, от направления к центру
    const theta = deg((360 - 118.5) / 2);
    const hz = ch * Math.cos(Math.PI - theta); // отрицательный относительно направления к центру? 
    // от концевого C к центру +z для нижнего. Угол между (к центру) и C–H = theta
    const rad = ch * Math.sin(theta);
    const zoff = -ch * Math.cos(theta); // дальше от центра, если theta>90
    const a = [A('C', [0, 0, 0]), A('C', [0, 0, -cc]), A('C', [0, 0, cc])];
    a.push(A('H', [rad, 0, -cc + zoff]), A('H', [-rad, 0, -cc + zoff]));
    a.push(A('H', [0, rad, cc - zoff]), A('H', [0, -rad, cc - zoff]));
    return a;
  }
  function pentadiene() {
    const base = allene();
    // заменить H (rad,0,z) и его образ при C2 (x,y,z)->(y,x,-z)
    const R = [[0, 1, 0], [1, 0, 0], [0, 0, -1]];
    const hIdx = base.map((at, i) => at.el === 'H' ? i : -1).filter(i => i >= 0);
    const i0 = hIdx[0];
    const target = apply(R, base[i0].pos);
    let i1 = hIdx.find(i => dist(base[i].pos, target) < 0.15);
    const dir0 = unit(sub(base[i0].pos, base[1].pos));
    const c0 = vadd(base[i0].pos, mulv(dir0, 0.55));
    const dir1 = unit(sub(base[i1].pos, base[2].pos));
    const c1 = vadd(base[i1].pos, mulv(dir1, 0.55));
    base[i0] = A('C', c0);
    base[i1] = A('C', c1);
    // три H у каждого метила, согласованные с C2
    function methylH(cPos, back) {
      const u = unit(sub(cPos, back));
      let tmp = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const e1 = unit(cross(u, tmp)), e2 = cross(u, e1);
      const hs = [];
      for (let k = 0; k < 3; k++) {
        const t = TAU * k / 3 + 0.4;
        const dir = unit(vadd(mulv(u, Math.cos(deg(109))), vadd(mulv(e1, Math.sin(deg(109)) * Math.cos(t)), mulv(e2, Math.sin(deg(109)) * Math.sin(t)))));
        hs.push(vadd(cPos, mulv(dir, 1.09)));
      }
      return hs;
    }
    const hA = methylH(c0, base[1].pos);
    hA.forEach(p => base.push(A('H', p)));
    hA.forEach(p => base.push(A('H', apply(R, p))));
    const axis = [1, 1, 0];
    const align = rotAlign(axis, [0, 0, 1]);
    base.forEach(at => { at.pos = apply(align, at.pos); });
    return base;
  }
  function h2o2() {
    const oo = 1.48, oh = 0.97, theta = deg(100), dih = deg(112);
    const O1 = [-oo / 2, 0, 0], O2 = [oo / 2, 0, 0];
    const delta = (Math.PI - dih) / 2;
    const vx = Math.cos(theta), vy = Math.sin(theta) * Math.cos(delta), vz = Math.sin(theta) * Math.sin(delta);
    const H1 = vadd(O1, mulv([vx, vy, vz], oh));
    const H2 = [-H1[0], -H1[1], H1[2]];
    return [A('O', O1), A('O', O2), A('H', H1), A('H', H2)];
  }
  function n2f2() {
    const nn = 1.23, nf = 1.40, theta = deg(114);
    const N1 = [-nn / 2, 0, 0], N2 = [nn / 2, 0, 0];
    const F1 = vadd(N1, mulv([Math.cos(theta), Math.sin(theta), 0], nf));
    const F2 = [-F1[0], -F1[1], 0];
    return [A('N', N1), A('N', N2), A('F', F1), A('F', F2)];
  }
  function pcl5() {
    const a = [A('P', [0, 0, 0]), A('Cl', [0, 0, 2.14]), A('Cl', [0, 0, -2.14])];
    for (let k = 0; k < 3; k++) a.push(A('Cl', [2.02 * Math.cos(TAU * k / 3), 2.02 * Math.sin(TAU * k / 3), 0]));
    return a;
  }
  function xef4() {
    const d = 1.95;
    return [A('Xe', [0, 0, 0]), A('F', [d, 0, 0]), A('F', [-d, 0, 0]), A('F', [0, d, 0]), A('F', [0, -d, 0])];
  }
  function brf5() {
    const ang = deg(85), bl = 1.77, ba = 1.69;
    const a = [A('Br', [0, 0, 0]), A('F', [0, 0, ba])];
    const z = bl * Math.cos(ang), r = bl * Math.sin(ang);
    for (let k = 0; k < 4; k++) a.push(A('F', [r * Math.cos(TAU * k / 4), r * Math.sin(TAU * k / 4), z]));
    return a;
  }
  function co2() { return [A('C', [0, 0, 0]), A('O', [0, 0, 1.16]), A('O', [0, 0, -1.16])]; }
  function hcl() { return [A('Cl', [0, 0, -0.2]), A('H', [0, 0, 1.07])]; }
  function ethylene() {
    const cc = 1.34, ch = 1.08, theta = deg(121.3);
    const zc = cc / 2;
    const rad = ch * Math.sin(theta), zoff = -ch * Math.cos(theta);
    return [
      A('C', [0, 0, -zc]), A('C', [0, 0, zc]),
      A('H', [rad, 0, -zc + zoff]), A('H', [-rad, 0, -zc + zoff]),
      A('H', [rad, 0, zc - zoff]), A('H', [-rad, 0, zc - zoff])
    ];
  }
  function cyclohexane() {
    const a = 1.535;
    const R = a * Math.sqrt(8 / 9), h = a / 6;
    const C = [];
    for (let k = 0; k < 6; k++) {
      const t = TAU * k / 6;
      C.push([R * Math.cos(t), R * Math.sin(t), (k % 2 === 0 ? h : -h)]);
    }
    const twist = rotZ(deg(30));
    C.forEach((p, i) => { C[i] = apply(twist, p); });
    const atoms = C.map(p => A('C', p));
    C.forEach((p, k) => {
      const prev = C[(k + 5) % 6], next = C[(k + 1) % 6];
      const n1 = unit(sub(prev, p)), n2 = unit(sub(next, p));
      const u = unit(vadd(n1, n2));
      const v = unit(cross(n1, n2));
      const Acoef = -1 / Math.sqrt(3), B = Math.sqrt(2 / 3);
      atoms.push(A('H', vadd(p, mulv(vadd(mulv(u, Acoef), mulv(v, B)), 1.10))));
      atoms.push(A('H', vadd(p, mulv(vadd(mulv(u, Acoef), mulv(v, -B)), 1.10))));
    });
    return atoms;
  }
  function ferrocene(staggered) {
    const rc = 1.21, rh = rc + 1.08, z = 1.66;
    const a = [A('Fe', [0, 0, 0])];
    const shift = staggered ? deg(36) : 0;
    for (let k = 0; k < 5; k++) {
      const t = TAU * k / 5;
      a.push(A('C', [rc * Math.cos(t), rc * Math.sin(t), z]));
      a.push(A('H', [rh * Math.cos(t), rh * Math.sin(t), z]));
    }
    for (let k = 0; k < 5; k++) {
      const t = TAU * k / 5 + shift;
      a.push(A('C', [rc * Math.cos(t), rc * Math.sin(t), -z]));
      a.push(A('H', [rh * Math.cos(t), rh * Math.sin(t), -z]));
    }
    return a;
  }
  function c60() {
    const phi = PHI;
    const seeds = [[0, 1, 3 * phi], [1, 2 + phi, 2 * phi], [2, 1 + 2 * phi, phi]];
    const set = new Map();
    seeds.forEach(s => {
      const perms = [[s[0], s[1], s[2]], [s[2], s[0], s[1]], [s[1], s[2], s[0]]];
      perms.forEach(p => {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          const a = p[0] === 0 ? 0 : sx * p[0];
          const b = p[1] === 0 ? 0 : sy * p[1];
          const c = p[2] === 0 ? 0 : sz * p[2];
          const key = [a, b, c].map(v => v.toFixed(5)).join(',');
          set.set(key, [a, b, c]);
        }
      });
    });
    let pts = [...set.values()];
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i], pts[j]);
      if (d > 0.2 && d < min) min = d;
    }
    const sc = 1.40 / min;
    return pts.map(p => A('C', mulv(p, sc)));
  }
  function coen3() {
    const bite = deg(85), rN = 1.97;
    const a0 = rN * Math.sqrt((1 + Math.cos(bite)) / 2);
    const rho = Math.sqrt(Math.max(0, rN * rN - a0 * a0));
    const psi = deg(48);
    const N1 = [a0, rho * Math.cos(psi), rho * Math.sin(psi)];
    let best = null;
    const half = 0.76;
    for (let cx = 1.55; cx <= 2.7; cx += 0.015) {
      for (let ang = 0.2; ang < Math.PI - 0.05; ang += 0.03) {
        const cy = half * Math.cos(ang), cz = half * Math.sin(ang);
        const d = Math.hypot(cx - N1[0], cy - N1[1], cz - N1[2]);
        const err = Math.abs(d - 1.48);
        if (!best || err < best.err) best = { err, cx, cy, cz };
      }
    }
    const C1 = [best.cx, best.cy, best.cz];
    const N2 = [N1[0], -N1[1], -N1[2]];
    const C2p = [C1[0], -C1[1], -C1[2]];
    const ligand = [N1, N2, C1, C2p];
    const atoms = [A('Co', [0, 0, 0])];
    for (let k = 0; k < 3; k++) {
      const R = rotZ(TAU * k / 3);
      ligand.forEach((p, i) => atoms.push(A(i < 2 ? 'N' : 'C', apply(R, p))));
    }
    return atoms;
  }
  function ch2clf() {
    return [
      A('C', [0, 0, 0]),
      A('Cl', [0, 1.2, 0]),
      A('F', [1.05, -0.45, 0]),
      A('H', [-0.55, -0.45, 0.9]),
      A('H', [-0.55, -0.45, -0.9])
    ];
  }
  function rotAlign(from, to) {
    const a = unit(from), b = unit(to), c = cross(a, b), d = dot(a, b);
    if (d > 0.9999) return I3;
    if (d < -0.9999) return rotAxis([1, 0, 0], Math.PI);
    const K = [[0, -c[2], c[1]], [c[2], 0, -c[0]], [-c[1], c[0], 0]];
    const K2 = mulM(K, K);
    const s = 1 / (1 + d);
    return I3.map((row, i) => row.map((v, j) => v + K[i][j] + K2[i][j] * (1 - d) / (norm(c) * norm(c) || 1)));
  }
  function mesoCi() {
    const C1 = [0.77, 0, 0];
    const dirs = [[-0.45, 0.85, 0.35], [-0.55, -0.45, 0.85], [-0.35, -0.55, -0.85]];
    const lens = [1.35, 1.77, 1.09];
    const els = ['F', 'Cl', 'H'];
    const atoms = [A('C', C1), A('C', mulv(C1, -1))];
    dirs.forEach((d, i) => {
      const p = vadd(C1, mulv(unit(d), lens[i]));
      atoms.push(A(els[i], p));
      atoms.push(A(els[i], mulv(p, -1)));
    });
    return atoms;
  }
  function propellerC3() {
    // три одинаковых «флюгера» OH, повёрнутых в одну сторону
    const bo = 1.36, oh = 0.96, tilt = deg(25);
    const a = [A('B', [0, 0, 0])];
    for (let k = 0; k < 3; k++) {
      const t = TAU * k / 3;
      const O = [bo * Math.cos(t), bo * Math.sin(t), 0];
      const radial = unit(O);
      const tang = [-Math.sin(t), Math.cos(t), 0];
      const dir = unit(vadd(mulv(radial, Math.cos(tilt)), vadd(mulv([0, 0, 1], Math.sin(tilt) * 0.75), mulv(tang, Math.sin(tilt) * 0.55))));
      a.push(A('O', O));
      a.push(A('H', vadd(O, mulv(dir, oh))));
    }
    return a;
  }

  function symOk(atoms, R, tol) {
    return atoms.every(a => atoms.some(b => dist(apply(R, a.pos), b.pos) < tol && a.el === b.el));
  }

  addMol({ id: 'H2O', name: 'Вода', formula: 'H₂O', pg: 'C2v', note: 'Угол 104,5°. Две плоскости σᵥ, ось C₂.', atoms: h2o() });
  addMol({ id: 'SO2', name: 'Диоксид серы', formula: 'SO₂', pg: 'C2v', note: 'Изогнутая, полярная. Сравните с CO₂.', atoms: so2() });
  addMol({ id: 'NH3', name: 'Аммиак', formula: 'NH₃', pg: 'C3v', note: 'Пирамида, диполь вдоль C₃.', atoms: nh3() });
  addMol({ id: 'CHCl3', name: 'Хлороформ', formula: 'CHCl₃', pg: 'C3v', note: 'Полярный. Сравните с CCl₄.', atoms: chcl3() });
  addMol({ id: 'CH4', name: 'Метан', formula: 'CH₄', pg: 'Td', note: 'Тетраэдр. Неполярный.', atoms: ch4() });
  addMol({ id: 'CCl4', name: 'Четырёххлористый углерод', formula: 'CCl₄', pg: 'Td', note: 'Неполярный тетраэдр.', atoms: ccl4() });
  addMol({ id: 'SF6', name: 'Гексафторид серы', formula: 'SF₆', pg: 'Oh', note: 'Октаэдр.', atoms: sf6() });
  addMol({ id: 'BF3', name: 'Трифторид бора', formula: 'BF₃', pg: 'D3h', note: 'Плоский треугольник.', atoms: bf3() });
  addMol({ id: 'PCl5', name: 'Пентахлорид фосфора', formula: 'PCl₅', pg: 'D3h', note: 'Тригональная бипирамида.', atoms: pcl5() });
  addMol({ id: 'C6H6', name: 'Бензол', formula: 'C₆H₆', pg: 'D6h', note: 'Плоский шестиугольник.', atoms: benzene() });
  addMol({ id: 'C2H6s', name: 'Этан, заторможенный', formula: 'C₂H₆', pg: 'D3d', note: 'Конформация D₃d, есть центр инверсии.', atoms: ethane(true) });
  addMol({ id: 'C2H6e', name: 'Этан, заслонённый', formula: 'C₂H₆', pg: 'D3h', note: 'Конформация D₃h, есть σₕ.', atoms: ethane(false) });
  addMol({ id: 'allene', name: 'Аллен', formula: 'C₃H₄', pg: 'D2d', note: 'Перпендикулярные концевые плоскости, ось S₄.', atoms: allene() });
  addMol({ id: 'pentadiene', name: '2,3-Пентадиен', formula: 'C₅H₈', pg: 'C2', note: 'Хиральный аллен: ось C₂ и нет зеркал.', atoms: pentadiene() });
  addMol({ id: 'H2O2', name: 'Пероксид водорода', formula: 'H₂O₂', pg: 'C2', note: 'Скошенная форма, хиральная ось C₂.', atoms: h2o2() });
  addMol({ id: 'CHFClBr', name: 'Бромхлорфторметан', formula: 'CHFClBr', pg: 'C1', note: 'Четыре разных заместителя. Хиральный центр.', atoms: chfclbr() });
  addMol({ id: 'N2F2', name: 'trans-Дифтордиазен', formula: 'N₂F₂', pg: 'C2h', note: 'Плоский транс-изомер: C₂, σₕ и центр инверсии.', atoms: n2f2() });
  addMol({ id: 'XeF4', name: 'Тетрафторид ксенона', formula: 'XeF₄', pg: 'D4h', note: 'Плоский квадрат.', atoms: xef4() });
  addMol({ id: 'C60', name: 'Фуллерен C₆₀', formula: 'C₆₀', pg: 'Ih', note: 'Усечённый икосаэдр. 6 осей C₅.', atoms: c60() });
  addMol({ id: 'CO2', name: 'Диоксид углерода', formula: 'CO₂', pg: 'Dinfh', note: 'Линейный, неполярный. Правило альтернативного запрета.', atoms: co2() });
  addMol({ id: 'HCl', name: 'Хлороводород', formula: 'HCl', pg: 'Cinfv', note: 'Линейный, полярный.', atoms: hcl() });
  addMol({ id: 'C6H12', name: 'Циклогексан, кресло', formula: 'C₆H₁₂', pg: 'D3d', note: 'Кресло: ось C₃ и центр инверсии.', atoms: cyclohexane() });
  addMol({ id: 'FeCp2s', name: 'Ферроцен, заторможенный', formula: 'Fe(C₅H₅)₂', pg: 'D5d', note: 'Кольца повёрнуты на 36°. В газе обычно D₅d.', atoms: ferrocene(true) });
  addMol({ id: 'FeCp2e', name: 'Ферроцен, заслонённый', formula: 'Fe(C₅H₅)₂', pg: 'D5h', note: 'Кольца друг над другом.', atoms: ferrocene(false) });
  addMol({ id: 'Coen3', name: '[Co(en)₃]³⁺', formula: '[Co(en)₃]³⁺', pg: 'D3', note: 'Трис-хелат, пропеллер Λ/Δ. Хиральный, группа D₃. Модель без водородов en.', atoms: coen3() });
  addMol({ id: 'CH2ClF', name: 'Хлорфторметан', formula: 'CH₂ClF', pg: 'Cs', note: 'Одна плоскость симметрии.', atoms: ch2clf() });
  addMol({ id: 'meso', name: 'meso-CHFCl–CHFCl', formula: 'C₂H₂F₂Cl₂', pg: 'Ci', note: 'Анти-конформация: только центр инверсии.', atoms: mesoCi() });
  addMol({ id: 'C2H4', name: 'Этилен', formula: 'C₂H₄', pg: 'D2h', note: 'Плоская молекула, три оси C₂.', atoms: ethylene() });
  addMol({ id: 'BrF5', name: 'Пентафторид брома', formula: 'BrF₅', pg: 'C4v', note: 'Квадратная пирамида.', atoms: brf5() });
  addMol({ id: 'propC3', name: 'Пропеллер C₃', formula: 'B(OH)₃*', pg: 'C3', note: 'Учебная модель: три одинаковых наклона, нет плоскостей. Настоящая борная кислота плоская (C₃ₕ).', atoms: propellerC3() });

  function modesOf(mol) {
    if (mol.id === 'H2O') {
      const O = mol.atoms[0].pos, H1 = mol.atoms[1].pos, H2 = mol.atoms[2].pos;
      const u1 = unit(sub(H1, O)), u2 = unit(sub(H2, O));
      const sym = [mulv(vadd(u1, u2), -0.15), u1, u2];
      const asym = [mulv(sub(u1, u2), -0.2), u1, mulv(u2, -1)];
      const bendN1 = unit(cross(cross(u1, [0, 0, 1]), u1));
      const bendN2 = unit(cross(cross(u2, [0, 0, 1]), u2));
      // знаки: раздвигать угол — H от оси z в стороны +y и -y
      const bend = [mulv(vadd(bendN1, bendN2), -0.1), mulv(bendN1, Math.sign(H1[1]) || 1), mulv(bendN2, Math.sign(H2[1]) || 1)];
      return [
        { id: 'ss', name: 'ν₁ симметричное растяжение', irrep: 'A₁', ir: true, raman: true, vec: sym },
        { id: 'be', name: 'ν₂ деформационное', irrep: 'A₁', ir: true, raman: true, vec: bend },
        { id: 'as', name: 'ν₃ антисимметричное растяжение', irrep: 'B₂', ir: true, raman: true, vec: asym }
      ];
    }
    if (mol.id === 'CO2') {
      const s = [[0, 0, 0], [0, 0, 1], [0, 0, -1]];
      const as = [[0, 0, -0.4], [0, 0, 1], [0, 0, 1]];
      const be = [[0, -0.3, 0], [0, 1, 0], [0, 1, 0]];
      return [
        { id: 'sg', name: 'Σg⁺ симметричное растяжение', irrep: 'Σg⁺', ir: false, raman: true, vec: s },
        { id: 'su', name: 'Σu⁺ антисимметричное', irrep: 'Σu⁺', ir: true, raman: false, vec: as },
        { id: 'pi', name: 'Πu деформационное', irrep: 'Πu', ir: true, raman: false, vec: be }
      ];
    }
    if (mol.id === 'CH4') {
      const C = mol.atoms[0].pos;
      const us = mol.atoms.slice(1).map(a => unit(sub(a.pos, C)));
      const sym = [mulv(us.reduce((s, u) => vadd(s, u), [0, 0, 0]), -0.05)].concat(us);
      return [
        { id: 'a1', name: 'ν₁ A₁ дыхание (КР)', irrep: 'A₁', ir: false, raman: true, vec: sym }
      ];
    }
    return [];
  }

  function vib(molId) {
    const mol = molBy.get(molId);
    const g = byId.get(mol.pg);
    if (g.infinite) {
      return { infinite: true, text: mol.pg === 'Dinfh'
        ? 'CO₂: Σg⁺ (только КР), Σu⁺ (только ИК), Πu (только ИК, дважды вырождено). Центр инверсии запрещает одновременную активность.'
        : 'HCl: одна мода Σ⁺ активна и в ИК, и в КР.' };
    }
    const ops = operations(mol.pg);
    const gamma3N = projectGamma(mol.pg, o => {
      let chi = 0;
      mol.atoms.forEach(a => {
        const p = apply(o.R, a.pos);
        if (dist(p, a.pos) < 0.12) chi += trace(o.R);
      });
      return chi;
    });
    const gammaT = projectGamma(mol.pg, o => trace(o.R));
    const gammaR = projectGamma(mol.pg, o => (det3(o.R) > 0 ? 1 : -1) * trace(o.R));
    const gammaV = gamma3N.map((v, i) => v - gammaT[i] - gammaR[i]);
    const parts = reduce(mol.pg, gammaV);
    return { gamma3N, gammaT, gammaR, gammaV, parts, modes: modesOf(mol), order: g.order, classes: g.classes };
  }

  function nmr(molId) {
    const mol = molBy.get(molId);
    const ops = operations(mol.pg);
    const used = new Set();
    const out = {};
    mol.atoms.forEach((a, i) => {
      if (used.has(i)) return;
      const orbit = [];
      mol.atoms.forEach((b, j) => {
        if (used.has(j) || b.el !== a.el) return;
        const equiv = ops.some(o => dist(apply(o.R, a.pos), b.pos) < 0.15);
        if (equiv) { orbit.push(j); used.add(j); }
      });
      const el = a.el;
      if (!out[el]) out[el] = [];
      out[el].push(orbit);
    });
    return Object.keys(out).map(el => ({ el, signals: out[el].length, orbits: out[el] }));
  }

  function motif(pgId) {
    const g = byId.get(pgId);
    if (g.infinite) {
      if (pgId === 'Cinfv') return molBy.get('HCl');
      return molBy.get('CO2');
    }
    const ops = operations(pgId);
    const seeds = [[1.25, 0.38, 0.22], [0.72, 0.95, 0.48]];
    const atoms = [];
    seeds.forEach((s, si) => {
      const seen = [];
      ops.forEach(o => {
        const p = apply(o.R, s);
        if (!seen.some(q => dist(q, p) < 0.08)) { seen.push(p); atoms.push(A(si ? 'H' : 'C', p)); }
      });
    });
    return { id: 'motif-' + pgId, name: 'Модель ' + g.name, formula: g.name, pg: pgId, note: 'Фигура общего положения: орбита точки под действием группы.', atoms, bonds: bondsOf(atoms), motif: true };
  }

  const flow = {
    start: 'lin',
    nodes: {
      lin: { q: 'Молекула линейная?', yes: 'lin2', no: 'high' },
      lin2: { q: 'Концы одинаковые (есть центр инверсии)?', yes: 'Dinfh', no: 'Cinfv' },
      high: { q: 'Есть несколько осей порядка выше 2?', yes: 'multi', no: 'maxn' },
      multi: { q: 'Какие высокие оси вы видите?', choices: [
        { t: 'Шесть осей C₅', next: 'ico' },
        { t: 'Три оси C₄', next: 'oct' },
        { t: 'Четыре оси C₃ и нет C₄', next: 'tet' }
      ] },
      ico: { q: 'Есть центр инверсии или зеркала?', yes: 'Ih', no: 'I' },
      oct: { q: 'Есть центр инверсии?', yes: 'Oh', no: 'O' },
      tet: { q: 'Есть центр инверсии?', yes: 'Th', no: 'tet2' },
      tet2: { q: 'Есть плоскости или оси S₄?', yes: 'Td', no: 'T' },
      maxn: { q: 'Наибольший порядок собственной оси Cn?', choices: [1, 2, 3, 4, 5, 6].map(n => ({ t: n === 1 ? 'Только C₁ (осей Cn нет)' : 'C' + subNum(n), next: 'n' + n })) },
      n1: { q: 'Есть плоскость симметрии?', yes: 'Cs', no: 'n1b' },
      n1b: { q: 'Есть центр инверсии?', yes: 'Ci', no: 'C1' },
      perp: { q: 'Есть n осей C₂, перпендикулярных главной?', yes: 'famD', no: 'famC' },
      famD: { q: 'Есть горизонтальная плоскость σₕ (перпендикулярная главной оси)?', yes: 'Dnh', no: 'famDd' },
      famDd: { q: 'Есть вертикальные плоскости между осями C₂ (σ_d)?', yes: 'Dnd', no: 'Dn' },
      famC: { q: 'Есть горизонтальная плоскость σₕ?', yes: 'Cnh', no: 'famCv' },
      famCv: { q: 'Есть n вертикальных плоскостей?', yes: 'Cnv', no: 'famS' },
      famS: { q: 'Есть зеркально-поворотная ось S₂ₙ?', yes: 'Sn', no: 'Cn' }
    }
  };
  [2, 3, 4, 5, 6].forEach(n => { flow.nodes['n' + n] = { goto: 'perp', n }; });
  flow.nodes.n1 = flow.nodes.n1;

  function familyId(fam, n) {
    if (fam === 'Cn') return 'C' + n;
    if (fam === 'Cnv') return 'C' + n + 'v';
    if (fam === 'Cnh') return 'C' + n + 'h';
    if (fam === 'Dn') return 'D' + n;
    if (fam === 'Dnh') return 'D' + n + 'h';
    if (fam === 'Dnd') return 'D' + n + 'd';
    if (fam === 'Sn') {
      const m = { 2: 'S4', 3: 'S6', 4: 'S4', 5: 'S6' };
      // S_{2n}: n=2 → S4, n=3 → S6. S8/S10 не заведены отдельно.
      if (n === 2) return 'S4';
      if (n === 3) return 'S6';
      return null;
    }
    return fam;
  }

  function selftest() {
    const errors = [];
    groups.forEach(g => {
      if (g.infinite) return;
      try { operations(g.id); }
      catch (e) { errors.push(e.message); }
    });
    const checks = [
      ['H2O', 'C2v'], ['NH3', 'C3v'], ['CH4', 'Td'], ['SF6', 'Oh'], ['C6H6', 'D6h'],
      ['C2H6s', 'D3d'], ['C2H6e', 'D3h'], ['allene', 'D2d'], ['H2O2', 'C2'], ['CHFClBr', 'C1'],
      ['N2F2', 'C2h'], ['XeF4', 'D4h'], ['C60', 'Ih'], ['C6H12', 'D3d'], ['FeCp2s', 'D5d'],
      ['FeCp2e', 'D5h'], ['Coen3', 'D3'], ['pentadiene', 'C2'], ['meso', 'Ci'], ['CH2ClF', 'Cs'],
      ['BrF5', 'C4v'], ['propC3', 'C3'], ['C2H4', 'D2h'], ['SO2', 'C2v'], ['CHCl3', 'C3v']
    ];
    checks.forEach(([id, pg]) => {
      const mol = molBy.get(id);
      if (!mol) { errors.push('нет молекулы ' + id); return; }
      const ops = operations(pg);
      const bad = ops.filter(o => !symOk(mol.atoms, o.R, id === 'C60' || id === 'Coen3' || id === 'C6H12' ? 0.18 : 0.08));
      if (bad.length) errors.push(id + ' не держит ' + pg + ' (' + bad.length + ' оп., напр. ' + bad[0].label + ')');
    });
    const vibH = vib('H2O');
    const got = vibH.parts.filter(p => p.n).map(p => p.n + p.name).join('+');
    const a1 = vibH.parts.find(p => p.name === 'A₁');
    const b2 = vibH.parts.find(p => p.name === 'B₂');
    if (!a1 || Math.abs(a1.n - 2) > 0.01 || !b2 || Math.abs(b2.n - 1) > 0.01) errors.push('H2O колебания ' + got);
    const vb = vib('C6H6');
    const irOnly = vb.parts.filter(p => p.n && p.ir.lin && /[xyz]/.test(p.ir.lin)).map(p => p.name).sort().join(',');
    if (irOnly !== 'A2u,E1u' && irOnly !== 'E1u,A2u') errors.push('бензол ИК ' + irOnly);
    if (c60().length !== 60) errors.push('C60 атомов ' + c60().length);
    return errors;
  }

  root.SYM = root.SYM || {};
  Object.assign(root.SYM, {
    groups, byId, molecules, molBy, operations, loci, reduce, vib, nmr, motif, flow, familyId,
    apply, dist, unit, vadd, sub, mulv, rotAxis, rotZ, I3, INV, pgSelftest: selftest, modesOf, prettyOp
  });
  root.SYM.pg = id => byId.get(id);
  root.SYM.mol = id => molBy.get(id);
})(typeof window !== 'undefined' ? window : globalThis);
