/* Семь учебных машин: упрощённая геометрия и цикл, не координаты из кристалла. */
(function (root) {
  'use strict';
  const MM = root.MM;
  const G = MM.G;

  const COL = {
    stator: '#8b95a7',
    rotor: '#f08a24',
    alkene: '#22d3ee',
    methyl: '#fb7185',
    stereo: '#e11d48',
    ring: '#3b82f6',
    stop: '#475569',
    ttf: '#16a34a',
    dnp: '#f43f5e',
    s: '#eab308',
    o: '#fb7185',
    n: '#38bdf8',
    terpy: '#4ade80',
    cu1: '#ea7a2f',
    cu2: '#2563eb',
    axle: '#64748b',
    surf: '#d08a5a',
    tip: '#e2e8f0',
    tipHot: '#fde68a',
    c60: '#334155',
    gamma: '#f59e0b',
    tight: '#16a34a',
    loose: '#eab308',
    open: '#94a3b8',
    mem: '#d6d3d1',
    mem2: '#a8a29e',
    mt: '#94a3b8',
    headA: '#f08a24',
    headB: '#2563eb',
    gear: '#0ea5e9',
    gear2: '#f59e0b',
    pawl: '#a855f7',
    lattice: '#cbd5e1'
  };

  function naphthalene(mol, attach, normal, hint, color) {
    const b = G.basis(normal, hint);
    const raw = [
      [2.42, 0.70], [1.21, 1.40], [0, 0.70], [0, -0.70], [1.21, -1.40], [2.42, -0.70],
      [-1.21, 1.40], [-2.42, 0.70], [-2.42, -0.70], [-1.21, -1.40]
    ];
    const ids = [];
    for (let i = 0; i < raw.length; i++) {
      const dx = -(raw[i][0] - 2.42);
      const dy = raw[i][1] - 0.70;
      const p = G.add(attach, G.add(G.mul(b.x, dx), G.mul(b.y, dy)));
      ids.push(mol.atom(p, color, 0.32));
    }
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6], [6, 7], [7, 8], [8, 9], [9, 3]];
    for (let k = 0; k < pairs.length; k++) mol.bond(ids[pairs[k][0]], ids[pairs[k][1]], color, 0.065, 1);
    return ids;
  }

  function blob(mol, center, color, scale, tag) {
    const s = scale || 1;
    const offs = [[0, 0, 0], [0.55, 0.15, 0.1], [-0.4, 0.35, -0.1], [0.1, -0.45, 0.25], [0.2, 0.1, -0.45]];
    const ids = [];
    for (let i = 0; i < offs.length; i++) {
      ids.push(mol.atom(G.add(center, G.mul(offs[i], s)), color, 0.42 * s, i === 0 ? (tag || '') : ''));
    }
    mol.chain(ids, color, 0.08 * s);
    return ids;
  }

  function groundSeries(fn, x0, x1) {
    return MM.sample(fn, x0, x1, 80);
  }

  /* ---------- 1. Феринга ---------- */
  const FER_KEYS = [
    { theta: 0.40, axial: 1, slip: 0, h: 'M', form: 'устойчивая' },
    { theta: Math.PI - 0.50, axial: 0.02, slip: 0.45, h: 'P', form: 'неустойчивая' },
    { theta: Math.PI + 0.40, axial: 1, slip: 0, h: 'P', form: 'устойчивая' },
    { theta: 2 * Math.PI - 0.50, axial: 0.02, slip: -0.45, h: 'M', form: 'неустойчивая' }
  ];
  function ferKey(i) {
    const idx = ((i % 4) + 4) % 4;
    const turns = Math.floor(i / 4);
    const k = FER_KEYS[idx];
    return { theta: k.theta + turns * 2 * Math.PI, axial: k.axial, slip: k.slip, h: k.h, form: k.form };
  }
  function ferEase(seg, u) {
    if (seg % 2 === 0) return MM.smooth(MM.clamp(u / 0.92, 0, 1));
    return MM.smooth(u);
  }
  function ferParams(seg, u) {
    const a = ferKey(seg);
    const b = ferKey(seg + 1);
    const t = ferEase(seg, u);
    return {
      theta: MM.lerp(a.theta, b.theta, t),
      axial: MM.lerp(a.axial, b.axial, t),
      slip: MM.lerp(a.slip, b.slip, t),
      h: t < 0.55 ? a.h : b.h,
      form: t < 0.55 ? a.form : b.form,
      photo: seg % 2 === 0,
      excited: seg % 2 === 0 ? Math.sin(Math.PI * MM.clamp(u, 0, 1)) : 0
    };
  }
  function ferGround(x) {
    const z = ((x % 4) + 4) % 4;
    const seg = Math.min(3, Math.floor(z));
    const t = z - seg;
    if (seg % 2 === 0) return MM.lerp(0, 22, t);
    return MM.lerp(22, 0, t) + 74 * Math.sin(Math.PI * t);
  }
  let ferCurve = null;

  function buildFeringa(p) {
    const mol = new MM.Molecule();
    const S = COL.stator;
    const left = mol.ring(6, [-2.05, -2.2, 0], [0, 0, 1], [1, 0, 0], 1.39, S, 0.32, 1);
    const right = mol.ring(6, [2.05, -2.2, 0], [0, 0, 1], [1, 0, 0], 1.39, S, 0.32, 1);
    const c9 = mol.atom([0, 0, 0], COL.alkene, 0.38);
    const topL = mol.closest(left, [0, 0, 0]);
    const topR = mol.closest(right, [0, 0, 0]);
    mol.bond(c9, topL, S, 0.08);
    mol.bond(c9, topR, S, 0.08);
    const bridge = mol.atom([0, -3.55, 0], S, 0.32);
    mol.bond(bridge, mol.closest(left, [0, -3.55, 0]), S, 0.075);
    mol.bond(bridge, mol.closest(right, [0, -3.55, 0]), S, 0.075);
    const m1 = mol.atom([-1.25, -0.35, 0.9], S, 0.3);
    const m2 = mol.atom([1.25, -0.35, -0.9], S, 0.3);
    mol.bond(m1, mol.closest(left, mol.atoms[m1].p), S, 0.07);
    mol.bond(m2, mol.closest(right, mol.atoms[m2].p), S, 0.07);

    const ids = [];
    const alk = mol.atom([0, 1.34, 0], COL.alkene, 0.38);
    ids.push(alk);
    mol.bond(c9, alk, COL.alkene, 0.09, 2);
    const starP = [0.12, 2.74, 0.06];
    const star = mol.atom(starP, COL.stereo, 0.36);
    ids.push(star);
    mol.bond(alk, star, COL.rotor, 0.09);
    const axDir = G.norm(G.lerp([1, 0.12, 0.02], [0.08, 0.2, 1], p.axial));
    const me = mol.atom(G.add(starP, G.mul(axDir, 1.5)), COL.methyl, 0.32);
    ids.push(me);
    mol.bond(star, me, COL.methyl, 0.075);
    const nap = naphthalene(mol, [0.02, 4.2, p.slip], [0, 0, 1], [0, 1, 0], COL.rotor);
    for (let i = 0; i < nap.length; i++) ids.push(nap[i]);
    mol.bond(star, nap[0], COL.rotor, 0.08);
    mol.transform(ids, [0, 0, 0], [0, 1, 0], p.theta);
    mol.atoms[me].tag = 'move';
    mol.atoms[nap[4]].tag = 'wing';
    if (p.excited > 0.25) {
      mol.atoms[c9].c = '#67e8f9';
      mol.atoms[alk].c = '#a5f3fc';
      mol.atoms[c9].r = 0.46;
      mol.atoms[alk].r = 0.46;
    }
    mol.label([0.2, 2.2, 2.6], p.h + ' · ' + (p.form === 'устойчивая' ? 'уст.' : 'неуст.'));
    return mol;
  }

  const feringa = {
    id: 'feringa',
    kicker: '1 · Световой ротор',
    title: 'Мотор Феринги',
    subtitle: 'Переполненный алкен 2-го поколения: четыре шага на полный оборот',
    legend: [
      ['#8b95a7', 'статор'],
      ['#f08a24', 'ротор'],
      ['#e11d48', 'хиральный центр'],
      ['#22d3ee', 'ось C=C']
    ],
    view: { rx: 0.7, ry: -0.45, zoom: 0.78 },
    init() { return { seg: 0, u: 0, playing: true, speed: 1, light: 70, tempC: 20, dG: 85 }; },
    setStep(st, step) { st.seg = MM.clamp((step | 0) - 1, 0, 3); st.u = 0; },
    stepOf(st) { return st.seg + 1; },
    partOf() { return ''; },
    tick(st, dt) {
      if (!st.playing) return;
      const photo = st.seg % 2 === 0;
      const T = st.tempC + 273.15;
      const k = photo ? (0.02 * st.light / 100) : MM.eyring(st.dG, T);
      st.kShow = k;
      const dur = MM.visualStepSeconds(k);
      if (!isFinite(dur)) return;
      st.u += dt * st.speed / dur;
      if (st.u >= 1) { st.u -= 1; st.seg = (st.seg + 1) % 4; }
    },
    step(st) { st.seg = (st.seg + 1) % 4; st.u = 0; },
    scene(st) { return buildFeringa(ferParams(st.seg, st.u)); },
    chart(st) {
      if (!ferCurve) ferCurve = groundSeries(ferGround, 0, 4);
      const x = st.seg + st.u;
      const onEx = st.seg % 2 === 0 && st.u > 0.2 && st.u < 0.9;
      return {
        yLabel: 'кДж/моль',
        xMin: 0, xMax: 4, yMin: -8, yMax: 100,
        yTicks: 4,
        xTicks: [
          { x: 0.15, label: 'M уст.' },
          { x: 1.05, label: 'P неуст.' },
          { x: 2.15, label: 'P уст.' },
          { x: 3.05, label: 'M неуст.' }
        ],
        barrier: 85,
        barrierLabel: 'ΔG‡ теплового шага',
        series: [{ color: null, pts: ferCurve, width: 2.4 }],
        excitedBand: true,
        excitedLabel: onEx ? 'S1 · молекула в возбуждённом состоянии' : 'S1 — квант света, не в масштабе оси',
        marker: { x: x, y: ferGround(x), onExcited: onEx }
      };
    },
    readout(st) {
      const T = st.tempC + 273.15;
      const kT = MM.eyring(st.dG, T);
      const kL = 0.02 * Math.max(0, st.light) / 100;
      const p = ferParams(st.seg, st.u);
      const phase = p.photo ? 'фотоизомеризация E/Z' : 'тепловая инверсия спирали';
      return 'Шаг ' + (st.seg + 1) + ' из 4 · ' + phase + '. Спиральность ' + p.h + ', форма ' + p.form + '. '
        + 'k тепл. = ' + MM.formatK(kT) + ' с⁻¹, t½ ' + MM.halfLife(kT) + ' (Эйринг, ΔG‡ ' + MM.comma(st.dG, 0) + ' кДж/моль, T ' + MM.comma(T, 0) + ' K). '
        + 'k света ≈ ' + MM.formatK(kL) + ' с⁻¹ — учебная пропорция яркости, не сечение поглощения.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Следующий шаг' },
      { type: 'slider', key: 'light', min: 0, max: 100, step: 1, label: 'Интенсивность света', unit: '%' },
      { type: 'slider', key: 'tempC', min: -20, max: 120, step: 1, label: 'Температура', unit: '°C' },
      { type: 'slider', key: 'dG', min: 60, max: 100, step: 1, label: 'Барьер ΔG‡ теплового шага', unit: 'кДж/моль' },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p>Мотор второго поколения — <b>переполненный алкен</b>. Серая нижняя половина — статор (упрощённый флуорен), оранжевая верхняя — ротор. Розовый атом — стереоцентр с метильной группой, голубая связь — ось C=C, вокруг которой и считается поворот.</p>'
      + '<p>Полный оборот — четыре шага, и все они идут в одну сторону:</p><ol>'
      + '<li>Устойчивый изомер: спиральность M, метил стоит псевдоаксиально.</li>'
      + '<li>Свет вызывает E/Z-изомеризацию. Ротор перескакивает примерно на пол-оборота, спиральность меняется на P, метил оказывается псевдоэкваториальным. Это неустойчивый изомер.</li>'
      + '<li>Тепловая инверсия спирали: лопасть проскальзывает мимо статора, метил возвращается в аксиальное положение. Полуоборот завершён.</li>'
      + '<li>Второй квант и вторая инверсия доводят ротор до 360°.</li></ol>'
      + '<p>Свет сам по себе не «крутит шестерёнку вперёд вечно»: он перебрасывает молекулу в неустойчивую форму, а тепловой шаг необратимо сбрасывает напряжение. При нулевой яркости фотошаг останавливается. Температура входит в тепловые шаги по уравнению Эйринга k = (k<sub>B</sub>T/h)·exp(−ΔG‡/RT). ΔG‡ на ползунке — учебное число в диапазоне быстрых моторов 2-го поколения. На экране время сжато, но какой из двух шагов медленнее, следует из этих k.</p>',
    refs: [
      'Koumura N., Zijlstra R. W. J., van Delden R. A., Harada N., Feringa B. L. Light-driven monodirectional molecular rotor. Nature, 1999, 401, 152–155.',
      'Koumura N., Geertsema E. M., van Gelder M. B., Meetsma A., Feringa B. L. Second generation of light-driven molecular motors. Journal of the American Chemical Society, 2002, 124, 5037–5051.',
      'Feringa B. L. The Art of Building Small: From Molecular Switches to Motors (Nobel Lecture). Angewandte Chemie International Edition, 2017, 56, 11060–11078.'
    ]
  };

  /* ---------- 2. Наноавтомобиль ---------- */
  function hexSurface(mol, nx, ny, sp) {
    const ids = [];
    const x0 = -((nx - 1) * sp) / 2;
    const y0 = -((ny - 1) * sp * Math.sqrt(3) / 2) / 2;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + (j % 2 ? 0.5 : 0)) * sp;
        const y = y0 + j * sp * Math.sqrt(3) / 2;
        ids.push(mol.atom([x, y, 0], COL.surf, 0.58));
      }
    }
    return ids;
  }
  function paddle(mol, center, axis, angle, color, tag) {
    const ids = [];
    const hub = mol.atom(center, color, 0.36);
    ids.push(hub);
    const b = G.basis(axis, [0, 0, 1]);
    for (let i = 0; i < 3; i++) {
      const a = angle + i * 2 * Math.PI / 3;
      const dir = G.add(G.mul(b.x, Math.cos(a)), G.mul(b.y, Math.sin(a)));
      const p1 = G.add(center, G.mul(dir, 0.85));
      const p2 = G.add(center, G.mul(dir, 1.55));
      const i1 = mol.atom(p1, color, 0.26);
      const i2 = mol.atom(p2, color, 0.3, tag && i === 0 ? 'move' : '');
      mol.bond(hub, i1, color, 0.07);
      mol.bond(i1, i2, color, 0.07);
      ids.push(i1, i2);
    }
    return ids;
  }
  function cage(mol, center, axis, angle, radius, color, tag) {
    const b = G.basis(axis, [0, 0, 1]);
    const ids = [];
    const rings = 3;
    const segs = 7;
    for (let i = 0; i < rings; i++) {
      const phi = Math.PI * (i + 1) / (rings + 1);
      const ring = [];
      for (let j = 0; j < segs; j++) {
        const th = angle + (j / segs) * Math.PI * 2 + (i % 2) * 0.28;
        const lx = radius * Math.sin(phi) * Math.cos(th);
        const ly = radius * Math.cos(phi);
        const lz = radius * Math.sin(phi) * Math.sin(th);
        const p = G.add(center, G.add(G.mul(b.n, ly), G.add(G.mul(b.x, lx), G.mul(b.y, lz))));
        const id = mol.atom(p, color, 0.2, tag && i === 1 && j === 0 ? 'move' : '');
        ring.push(id);
        ids.push(id);
      }
      mol.chain(ring, color, 0.04);
      mol.bond(ring[0], ring[ring.length - 1], color, 0.04);
    }
    const top = mol.atom(G.add(center, G.mul(b.n, radius)), color, 0.2);
    const bot = mol.atom(G.add(center, G.mul(b.n, -radius)), color, 0.2);
    ids.push(top, bot);
    return ids;
  }
  function buildNanocar(st) {
    const mol = new MM.Molecule();
    hexSurface(mol, 7, 5, 2.55);
    const car = [];
    const mark = (id) => { car.push(id); return id; };
    const zBody = 3.15;
    const zWheel = 1.72;
    if (st.part === 'tour') {
      const yAxis = [0, 1, 0];
      const corners = [[-3.3, -2.05], [3.3, -2.05], [-3.3, 2.05], [3.3, 2.05]];
      for (let i = 0; i < corners.length; i++) {
        const ids = cage(mol, [corners[i][0], corners[i][1], zWheel], yAxis, -st.x / 1.45 + i, 1.35, COL.c60, i === 0);
        for (let k = 0; k < ids.length; k++) car.push(ids[k]);
      }
      const rod = mol.ring(6, [0, 0, zBody], [0, 0, 1], [1, 0, 0], 1.25, COL.stator, 0.28, 1);
      rod.forEach(mark);
      const left = mol.ring(6, [-2.5, 0, zBody], [0, 0, 1], [1, 0, 0], 1.15, COL.stator, 0.26, 1);
      const right = mol.ring(6, [2.5, 0, zBody], [0, 0, 1], [1, 0, 0], 1.15, COL.stator, 0.26, 1);
      left.forEach(mark); right.forEach(mark);
      const a = mark(mol.atom([-1.35, 0, zBody], COL.alkene, 0.24));
      const b = mark(mol.atom([1.35, 0, zBody], COL.alkene, 0.24));
      mol.bond(a, mol.closest(rod, mol.atoms[a].p), COL.alkene, 0.05);
      mol.bond(b, mol.closest(rod, mol.atoms[b].p), COL.alkene, 0.05);
      mol.bond(a, mol.closest(left, mol.atoms[a].p), COL.alkene, 0.05, 2);
      mol.bond(b, mol.closest(right, mol.atoms[b].p), COL.alkene, 0.05, 2);
      mol.label([0, 0, zBody + 1.6], 'шасси Tour');
    } else {
      const frame = [[-2.4, -1.15], [2.4, -1.15], [2.4, 1.15], [-2.4, 1.15]];
      const fids = frame.map(p => mark(mol.atom([p[0], p[1], zBody], COL.stator, 0.3)));
      mol.chain(fids, COL.stator, 0.09);
      mol.bond(fids[3], fids[0], COL.stator, 0.09);
      const mid = mol.ring(6, [0, 0, zBody], [0, 0, 1], [1, 0, 0], 1.2, COL.stator, 0.28, 1);
      mid.forEach(mark);
      const corners = [[-2.4, -1.7], [2.4, -1.7], [-2.4, 1.7], [2.4, 1.7]];
      for (let i = 0; i < 4; i++) {
        const ids = paddle(mol, [corners[i][0], corners[i][1], zWheel], [0, 1, 0], -st.x / 1.35 + (i % 2 ? 0.4 : 0), COL.rotor, i === 0);
        for (let k = 0; k < ids.length; k++) car.push(ids[k]);
        const leg = mark(mol.atom([corners[i][0], corners[i][1], (zBody + zWheel) / 2], COL.stator, 0.24));
        mol.bond(leg, fids[i], COL.stator, 0.07);
        mol.bond(leg, ids[0], COL.stator, 0.07);
      }
      mol.label([0, 0, zBody + 1.5], '4 мотора');
    }
    mol.translate(car, [st.x, 0, 0]);
    const hot = st.pulse || 0;
    for (let i = 0; i < 5; i++) {
      mol.atom([st.x, 0, 5.4 + i * 0.55], hot > 0.35 ? COL.tipHot : COL.tip, 0.18 + i * 0.16);
    }
    mol.label([st.x, 2.6, 6.2], hot > 0.35 ? 'импульс' : 'игла СТМ');
    return mol;
  }
  function carEnergy(x) {
    const period = 2.15;
    const z = ((x % period) + period) % period;
    return 8 + 28 * Math.pow(Math.sin(Math.PI * z / period), 2);
  }
  const nanocar = {
    id: 'nanocar',
    kicker: '2 · На поверхности',
    title: 'Наноавтомобиль',
    subtitle: 'Полный привод Феринги, 2011, и фуллереновые колёса Тура, 2005',
    legend: [
      ['#d08a5a', 'поверхность Cu / Au'],
      ['#f08a24', 'роторы-колёса'],
      ['#334155', 'C60'],
      ['#e2e8f0', 'игла СТМ']
    ],
    view: { rx: 0.95, ry: -0.35, zoom: 0.72 },
    parts: ['feringa', 'tour'],
    init() { return { part: 'feringa', x: -2, pulse: 0, acc: 0, playing: true, speed: 1, voltage: 75, tempC: 80, hops: 0 }; },
    setPart(st, part) { if (part === 'tour' || part === 'feringa') st.part = part; },
    setStep(st, step) {
      const n = Math.max(1, step | 0);
      st.hops = n - 1;
      st.x = -2 + (n - 1) * 2.15;
    },
    stepOf(st) { return (st.hops % 8) + 1; },
    partOf(st) { return st.part; },
    tick(st, dt) {
      if (!st.playing) return;
      const noise = Math.sqrt((st.tempC + 273.15) / 300);
      st.x += MM.randn() * noise * 0.22 * Math.sqrt(dt) * st.speed;
      let rate = st.part === 'feringa'
        ? (st.voltage / 100) * 0.85 * st.speed
        : Math.max(0, (st.tempC - 30) / 80) * 0.75 * st.speed;
      st.acc += rate * dt;
      if (st.acc >= 1) {
        st.acc -= 1;
        st.x += 2.15;
        st.pulse = 1;
        st.hops++;
      }
      st.pulse *= Math.exp(-dt * 4.5);
      if (st.x > 7.5) st.x = -7.5;
    },
    step(st) { st.x += 2.15; st.pulse = 1; st.hops++; if (st.x > 7.5) st.x = -7.5; },
    scene: buildNanocar,
    chart(st) {
      const x = ((st.x % 2.15) + 2.15) % 2.15;
      return {
        yLabel: 'кДж/моль',
        xMin: 0, xMax: 2.15, yMin: 0, yMax: 50,
        xTicks: [{ x: 0.1, label: 'ямка' }, { x: 1.05, label: 'барьер' }, { x: 2.0, label: 'ямка' }],
        series: [{ pts: groundSeries(carEnergy, 0, 2.15), width: 2.4 }],
        barrier: 36,
        barrierLabel: 'активация шага',
        excitedBand: st.part === 'feringa',
        excitedLabel: st.pulse > 0.3 ? 'неупругий электрон с иглы' : 'импульс СТМ поднимает машину над барьером',
        marker: { x: x, y: carEnergy(x), onExcited: st.pulse > 0.45 }
      };
    },
    readout(st) {
      const mode = st.part === 'feringa'
        ? 'Четыре световых мотора как колёса. На Cu(111) их толкают электроны иглы СТМ, не нагрев.'
        : 'Колёса — C60, шасси — олиго(фениленэтинилен). На золоте машина ползёт, когда поверхность греют.';
      return mode + ' Шагов вперёд: ' + st.hops + '. Смещение ' + MM.comma(st.x, 2) + ' Å (схема). Между импульсами остаётся только дрожание.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Один шаг' },
      { type: 'chips', key: 'part', options: [
        { id: 'feringa', label: '4×4 Феринга, 2011' },
        { id: 'tour', label: 'Фуллерены Тура, 2005' }
      ] },
      { type: 'slider', key: 'voltage', min: 0, max: 100, step: 1, label: 'Частота импульсов СТМ', unit: '%' },
      { type: 'slider', key: 'tempC', min: 0, max: 200, step: 1, label: 'Температура поверхности', unit: '°C' },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p><b>Машина Феринги (2011)</b> — жёсткое шасси и четыре односторонних ротора вместо колёс. На грани Cu(111) сама по себе она почти не едет: направленный шаг возникает, когда игла сканирующего туннельного микроскопа даёт неупругий электрон и мотор делает оборот, отталкиваясь от поверхности.</p>'
      + '<p><b>Наноавтомобиль Тура (2005)</b> — другое устройство. Колёса — фуллерены C60, «рама» — жёсткие фениленовые стержни с тройными связями. На Au(111) его вели нагревом: молекула диффундирует, а вытянутая форма задаёт предпочтительное направление. Это не полный привод.</p>'
      + '<p>В апреле 2017 в Тулузе прошла Nanocar Race: шесть команд вели одномолекулярные машины иглой СТМ по золоту. «Руль» там — последовательность электронных возбуждений, а не миниатюрная копия автомобильной механики. Решётка и C60 на экране упрощены.</p>',
    refs: [
      'Kudernac T., Ruangsupapichat N., Parschau M., Maciá B., Katsonis N., Harutyunyan S. R., Ernst K.-H., Feringa B. L. Electrically driven directional motion of a four-wheeled molecule on a metal surface. Nature, 2011, 479, 208–211.',
      'Shirai Y., Osgood A. J., Zhao Y., Kelly K. F., Tour J. M. Directional Control in Thermally Driven Single-Molecule Nanocars. Nano Letters, 2005, 5, 2330–2334.',
      'Rapenne G., Joachim C. The first nanocar race. Nature Reviews Materials, 2017, 2, 17040.'
    ]
  };

  /* ---------- 3. Ротаксан ---------- */
  function Vshuttle(x, ox) {
    const well = (x0, depth, w) => -depth * Math.exp(-((x - x0) * (x - x0)) / (2 * w * w));
    let v = 16 + well(-3.15, ox ? 8 : 34, 0.8) + well(3.15, ox ? 32 : 14, 0.8);
    v += ox ? -1.5 * x : 0.6 * x;
    if (x < -6.3) v += 50 * (x + 6.3) * (x + 6.3);
    if (x > 6.3) v += 50 * (x - 6.3) * (x - 6.3);
    return v;
  }
  function stopper(mol, x, sign) {
    const ids = [];
    const hub = mol.atom([x, 0, 0], COL.stop, 0.42);
    ids.push(hub);
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * Math.PI / 3;
      const p = [x + sign * 0.7, Math.cos(a) * 1.15, Math.sin(a) * 1.15];
      const id = mol.atom(p, COL.stop, 0.48);
      mol.bond(hub, id, COL.stop, 0.09);
      ids.push(id);
    }
    return ids;
  }
  function stationTTF(mol, x) {
    const ids = [];
    const shift = (dx, dy, dz) => [x + dx, dy, dz];
    const L = [[0.2, 0.55, 0], [0.95, 1.15, 0], [1.7, 0.45, 0], [1.7, -0.45, 0], [0.95, -1.15, 0]];
    const prev = [];
    for (let i = 0; i < L.length; i++) {
      const c = (i === 1 || i === 4) ? COL.s : COL.ttf;
      prev.push(mol.atom(shift(L[i][0] - 1.7, L[i][1], L[i][2]), c, 0.3));
    }
    mol.chain(prev, COL.ttf, 0.07);
    mol.bond(prev[0], prev[4], COL.ttf, 0.07);
    const nxt = [];
    for (let i = 0; i < L.length; i++) {
      const c = (i === 1 || i === 4) ? COL.s : COL.ttf;
      const p = L[i];
      nxt.push(mol.atom(shift(1.7 - p[0], p[1], p[2]), c, 0.3));
    }
    mol.chain(nxt, COL.ttf, 0.07);
    mol.bond(nxt[0], nxt[4], COL.ttf, 0.07);
    mol.bond(prev[0], nxt[0], COL.alkene, 0.08, 2);
    ids.push.apply(ids, prev);
    ids.push.apply(ids, nxt);
    return ids;
  }
  function stationDNP(mol, x) {
    const ids = naphthalene(mol, [x + 1.3, 0, 0], [0, 0, 1], [1, 0, 0], COL.dnp);
    const o1 = mol.atom([x + 1.3, 1.35, 0.15], COL.o, 0.32);
    const o2 = mol.atom([x - 1.1, -1.15, 0.15], COL.o, 0.32);
    mol.bond(o1, ids[0], COL.o, 0.07);
    mol.bond(o2, mol.closest(ids, mol.atoms[o2].p), COL.o, 0.07);
    ids.push(o1, o2);
    return ids;
  }
  function cbpqt(mol, x) {
    const y = 1.85;
    const z = 1.25;
    const corners = [[x, y, z], [x, -y, z], [x, -y, -z], [x, y, -z]];
    const ids = [];
    for (let e = 0; e < 4; e++) {
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      for (let s = 0; s < 3; s++) {
        const t = s / 3;
        const p = G.lerp(a, b, t);
        const nitro = (e % 2 === 0 && s === 1);
        ids.push(mol.atom(p, nitro ? '#1d4ed8' : COL.ring, nitro ? 0.36 : 0.28));
      }
    }
    mol.chain(ids, COL.ring, 0.07);
    mol.bond(ids[ids.length - 1], ids[0], COL.ring, 0.07);
    return ids;
  }
  function buildShuttle(st) {
    const mol = new MM.Molecule();
    const axle = [];
    for (let x = -5.2; x <= 5.2; x += 1.05) axle.push(mol.atom([x, 0, 0], COL.axle, 0.26));
    mol.chain(axle, COL.axle, 0.09);
    stopper(mol, -6.3, -1);
    stopper(mol, 6.3, 1);
    mol.bond(axle[0], mol.closest([axle[0]], [-6.3, 0, 0]), COL.axle, 0.08);
    stationTTF(mol, -3.15);
    stationDNP(mol, 3.15);
    const ring = cbpqt(mol, st.x);
    mol.atoms[ring[0]].tag = 'move';
    mol.label([-3.15, 0, 2.15], st.ox ? 'TTF²⁺' : 'TTF');
    mol.label([3.15, 0, 2.15], 'DNP');
    mol.label([st.x, 0, -2.35], 'CBPQT⁴⁺');
    return mol;
  }
  const rotaxane = {
    id: 'rotaxane',
    kicker: '3 · Челнок',
    title: 'Ротаксановый челнок',
    subtitle: 'Кольцо CBPQT⁴⁺ между станциями TTF и DNP',
    legend: [
      ['#16a34a', 'TTF'],
      ['#eab308', 'сера'],
      ['#f43f5e', 'DNP'],
      ['#3b82f6', 'кольцо CBPQT⁴⁺']
    ],
    view: { rx: 0.55, ry: -0.2, zoom: 0.7 },
    init() { return { x: -3.15, v: 0, ox: false, playing: true, speed: 1, tempC: 25, dwell: 0 }; },
    setStep(st, step) {
      st.ox = (step | 0) >= 2;
      st.x = st.ox ? 3.15 : -3.15;
      st.dwell = 0;
    },
    stepOf(st) { return st.ox ? 2 : 1; },
    partOf() { return ''; },
    tick(st, dt) {
      if (!st.playing) return;
      const T = (st.tempC + 273.15) / 300;
      const d = 0.06;
      const F = -(Vshuttle(st.x + d, st.ox) - Vshuttle(st.x - d, st.ox)) / (2 * d);
      st.x += st.speed * (F * 0.09 * dt + MM.randn() * 1.05 * Math.sqrt(T) * Math.sqrt(dt));
      st.x = MM.clamp(st.x, -6.4, 6.4);
      const target = st.ox ? 3.15 : -3.15;
      if (Math.abs(st.x - target) < 0.55) st.dwell += dt;
      else st.dwell = 0;
      if (st.dwell > 1.6 / st.speed) { st.ox = !st.ox; st.dwell = 0; }
    },
    step(st) {
      st.ox = !st.ox;
      st.x = st.ox ? 3.15 : -3.15;
      st.dwell = 0;
    },
    scene: buildShuttle,
    chart(st) {
      const fn = x => Vshuttle(x, st.ox);
      return {
        yLabel: 'кДж/моль',
        xMin: -7, xMax: 7, yMin: -30, yMax: 40,
        xTicks: [{ x: -3.2, label: 'TTF' }, { x: 0, label: 'ось' }, { x: 3.2, label: 'DNP' }],
        series: [{ pts: groundSeries(fn, -7, 7), width: 2.4 }],
        marker: { x: st.x, y: fn(st.x), onExcited: false }
      };
    },
    readout(st) {
      const where = st.x < 0 ? 'ближе к TTF' : 'ближе к DNP';
      return (st.ox ? 'TTF окислен до TTF²⁺: кольцо с него сходит.' : 'TTF нейтрален: кольцо сидит на TTF, это более глубокая яма.')
        + ' Сейчас кольцо ' + where + ' (' + MM.comma(st.x, 2) + ' Å). Шум пропорционален температуре — это и есть броуновское движение вдоль оси.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Скачок к станции' },
      { type: 'action', id: 'ox', label: 'Окислить', run(st) { st.ox = true; st.dwell = 0; }, on(st) { return st.ox; } },
      { type: 'action', id: 'red', label: 'Восстановить', run(st) { st.ox = false; st.dwell = 0; }, on(st) { return !st.ox; } },
      { type: 'slider', key: 'tempC', min: 0, max: 120, step: 1, label: 'Температура (шум)', unit: '°C' },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p>Ротаксан — ось с объёмными заглушками и кольцо, которое с оси уже не снять. В бистабильном челноке Стоддарта кольцо — тетракатионный циклофан <b>CBPQT⁴⁺</b>. На оси две станции: богатый электронами <b>TTF</b> (зелёный, с жёлтой серой) и более бедный <b>DNP</b> (нафталин с двумя кислородами).</p>'
      + '<p>Пока TTF нейтрален, яма на нём глубже, и кольцо проводит там больше времени. Окисление до TTF²⁺ делает эту станцию отталкивающей: ландшафт переворачивается, и кольцо уходит на DNP. Восстановление возвращает его назад. По дороге кольцо не «едет мотором», а <b>диффундирует</b>. Переключение только меняет, какая яма глубже. Это энергетический храповик: реагент или электрод платит за смену ландшафта. В равновесии без расхода энергии направленного челнока нет — иначе это был бы вечный двигатель.</p>',
    refs: [
      'Anelli P. L., Spencer N., Stoddart J. F. A molecular shuttle. Journal of the American Chemical Society, 1991, 113, 5131–5133.',
      'Bissell R. A., Córdova E., Kaifer A. E., Stoddart J. F. A chemically and electrochemically switchable molecular shuttle. Nature, 1994, 369, 133–137.',
      'Jeppesen J. O., Perkins J., Becher J., Stoddart J. F. Slow Shuttling in an Amphiphilic Bistable [2]Rotaxane Incorporating a Tetrathiafulvalene Unit. Angewandte Chemie International Edition, 2001, 40, 1216–1221.',
      'Stoddart J. F. Mechanically Interlocked Molecules (MIMs) — Molecular Shuttles, Switches, and Machines (Nobel Lecture). Angewandte Chemie International Edition, 2017, 56, 11094–11125.'
    ]
  };

  /* ---------- 4. Катенан ---------- */
  function buildCatenane(st) {
    const mol = new MM.Molecule();
    const ringA = mol.ring(16, [0, 0, 0], [0, 0, 1], [1, 0, 0], 3.55, COL.stator, 0.3, 1);
    const n1 = mol.atom([1.15, 0.55, 0.15], COL.n, 0.34);
    const n2 = mol.atom([1.15, -0.55, 0.15], COL.n, 0.34);
    mol.bond(n1, mol.closest(ringA, mol.atoms[n1].p), COL.n, 0.06);
    mol.bond(n2, mol.closest(ringA, mol.atoms[n2].p), COL.n, 0.06);
    const ringB = mol.ring(16, [3.5, 0, 0], [0, 1, 0], [1, 0, 0], 3.5, '#64748b', 0.3, 1);
    mol.atoms[ringB[8]].c = COL.n;
    mol.atoms[ringB[7]].c = COL.n;
    mol.atoms[ringB[0]].c = COL.terpy;
    mol.atoms[ringB[1]].c = COL.terpy;
    mol.atoms[ringB[15]].c = COL.terpy;
    mol.transform(ringB, [3.5, 0, 0], [0, 1, 0], st.angle);
    mol.atoms[ringB[8]].tag = 'move';
    mol.atom([0.35, 0, 0.25], st.cu2 ? COL.cu2 : COL.cu1, 0.48);
    mol.label([0.2, 0, 2.3], st.cu2 ? 'Cu(II)' : 'Cu(I)');
    mol.label([3.5, 2.4, 0], st.angle < Math.PI / 2 || st.angle > 1.5 * Math.PI ? 'phen' : 'terpy');
    return mol;
  }
  function Vcat(ang, cu2) {
    const wells = cu2 ? [18, 0] : [0, 16];
    const t = (1 - Math.cos(ang)) / 2;
    return MM.lerp(wells[0], wells[1], t) + 22 * Math.sin(Math.PI * t);
  }
  const catenane = {
    id: 'catenane',
    kicker: '4 · Два кольца',
    title: 'Катенан и пируэт',
    subtitle: 'Медный шаблон Соважа: кольцо поворачивается при смене Cu(I)/Cu(II)',
    legend: [
      ['#8b95a7', 'кольцо-статор'],
      ['#38bdf8', 'фенантролин, N'],
      ['#4ade80', 'терпиридин'],
      ['#ea7a2f', 'Cu(I) / синий Cu(II)']
    ],
    view: { rx: 0.65, ry: 0.4, zoom: 0.8 },
    init() { return { angle: 0, cu2: false, playing: true, speed: 1, dwell: 0 }; },
    setStep(st, step) {
      st.cu2 = (step | 0) >= 2;
      st.angle = st.cu2 ? Math.PI : 0;
      st.dwell = 0;
    },
    stepOf(st) { return st.cu2 ? 2 : 1; },
    partOf() { return ''; },
    tick(st, dt) {
      if (!st.playing) return;
      const target = st.cu2 ? Math.PI : 0;
      let d = st.angle - target;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      st.angle += st.speed * ((-d) * 1.8 * dt + MM.randn() * 0.12 * Math.sqrt(dt));
      if (st.angle < -0.4) st.angle = -0.4;
      if (st.angle > Math.PI + 0.4) st.angle = Math.PI + 0.4;
      if (Math.abs(d) < 0.25) st.dwell += dt; else st.dwell = 0;
      if (st.dwell > 1.5 / st.speed) { st.cu2 = !st.cu2; st.dwell = 0; }
    },
    step(st) {
      st.cu2 = !st.cu2;
      st.angle = st.cu2 ? Math.PI : 0;
      st.dwell = 0;
    },
    scene: buildCatenane,
    chart(st) {
      const fn = a => Vcat(a, st.cu2);
      return {
        yLabel: 'кДж/моль',
        xMin: 0, xMax: 180, yMin: -5, yMax: 45,
        xTicks: [{ x: 8, label: 'phen · Cu' }, { x: 90, label: 'барьер' }, { x: 168, label: 'terpy · Cu' }],
        series: [{ pts: MM.sample(a => fn(a * Math.PI / 180), 0, 180, 60), width: 2.4 }],
        marker: { x: MM.clamp(st.angle, 0, Math.PI) * 180 / Math.PI, y: fn(MM.clamp(st.angle, 0, Math.PI)), onExcited: false }
      };
    },
    readout(st) {
      const deg = MM.comma(st.angle * 180 / Math.PI, 0);
      return (st.cu2 ? 'Cu(II) предпочитает пятикоординационное окружение: к меди подходит терпиридин.' : 'Cu(I) тетраэдрический: оба фенантролина держат медь, кольцо в исходной позиции.')
        + ' Угол пируэта ' + deg + '°.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Переключить Cu' },
      { type: 'action', id: 'cu1', label: 'Cu(I)', run(st) { st.cu2 = false; st.dwell = 0; }, on(st) { return !st.cu2; } },
      { type: 'action', id: 'cu2', label: 'Cu(II)', run(st) { st.cu2 = true; st.dwell = 0; }, on(st) { return st.cu2; } },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p>Катенан — два кольца, продетые друг в друга как звенья цепи. Соваж собирал их вокруг иона меди: два фенантролина встают тетраэдром вокруг Cu(I), и циклизация замыкает кольца уже сцепленными. Медь потом можно удалить, сцепление остаётся.</p>'
      + '<p>Если на одном кольце есть вторая станция — терпиридин, — окисление Cu(I) → Cu(II) меняет любимое координационное число с 4 на 5. Кольцо поворачивается (пируэт), и у меди оказывается терпиридин. Восстановление возвращает фенантролин. Опять же крутит не «мотор внутри кольца», а смена энергии связывания. Геометрия на экране — схема топологии, не кристалл катената.</p>',
    refs: [
      'Dietrich-Buchecker C. O., Sauvage J.-P., Kintzinger J.-P. Une nouvelle famille de molecules: les metallo-catenanes. Tetrahedron Letters, 1983, 24, 5095–5098.',
      'Dietrich-Buchecker C. O., Sauvage J.-P., Kern J.-M. Templated synthesis of interlocked macrocyclic ligands, the catenands. Journal of the American Chemical Society, 1984, 106, 3043–3045.',
      'Livoreil A., Dietrich-Buchecker C. O., Sauvage J.-P. Electrochemically Triggered Swinging of a [2]-Catenate. Journal of the American Chemical Society, 1994, 116, 9399–9400.',
      'Sauvage J.-P. From Chemical Topology to Molecular Machines (Nobel Lecture). Angewandte Chemie International Edition, 2017, 56, 11080–11093.'
    ]
  };

  /* ---------- 5. Мышца, лифт, насос ---------- */
  function buildMuscle(ext) {
    const mol = new MM.Molecule();
    const span = MM.lerp(4.2, 8.2, ext);
    function filament(y, dir) {
      const ids = [];
      for (let i = -3; i <= 3; i++) ids.push(mol.atom([dir * span * 0.55 + i * 0.95, y, 0], COL.axle, 0.26));
      mol.chain(ids, COL.axle, 0.08);
      stopper(mol, dir * span + (dir > 0 ? 0.4 : -0.4), dir);
      mol.bond(ids[dir > 0 ? ids.length - 1 : 0], mol.closest(ids, [dir * span, y, 0]), COL.axle, 0.07);
      return ids;
    }
    const a = filament(1.15, 1);
    const b = filament(-1.15, -1);
    const ringA = mol.ring(10, [-span * 0.15, -1.15, 0], [1, 0, 0], [0, 1, 0], 1.55, COL.ring, 0.26, 1);
    const ringB = mol.ring(10, [span * 0.15, 1.15, 0], [1, 0, 0], [0, 1, 0], 1.55, COL.ring, 0.26, 1);
    mol.atoms[ringA[0]].tag = 'move';
    mol.bond(ringB[0], a[0], COL.ring, 0.05);
    mol.label([0, 2.6, 0], ext > 0.5 ? 'растянута' : 'сокращена');
    return mol;
  }
  function buildElevator(level) {
    const mol = new MM.Molecule();
    const ys = [-2.4, 2.3];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 2.4;
      for (let k = 0; k < 6; k++) mol.atom([x, -3.2 + k * 1.25, 0], COL.axle, 0.24);
      mol.atom([x, ys[0], 0.7], COL.n, 0.36);
      mol.atom([x, ys[1], 0.7], COL.dnp, 0.34);
      mol.atom([x, ys[1] + 0.7, 0.7], COL.dnp, 0.3);
    }
    const y = MM.lerp(ys[0], ys[1], level);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 2.4;
      const ring = mol.ring(8, [x, y, 0], [0, 1, 0], [1, 0, 0], 1.15, COL.ring, 0.24, 1);
      ids.push(ring[0]);
      if (i) mol.bond(ids[i - 1], ids[i], COL.ring, 0.08);
    }
    mol.atoms[ids[1]].tag = 'move';
    mol.label([3.6, ys[0], 0], 'NH₂⁺');
    mol.label([3.6, ys[1], 0], 'bipy');
    mol.label([0, y + 1.8, 0], level > 0.5 ? 'верх' : 'низ');
    return mol;
  }
  function buildPump(st) {
    const mol = new MM.Molecule();
    for (let x = -1; x <= 8; x += 0.9) mol.atom([x, 0, 0], COL.axle, 0.24);
    mol.ring(12, [-3.2, 0, 0], [1, 0, 0], [0, 1, 0], 1.7, COL.stator, 0.26, 1);
    mol.atom([-0.2, 0, 1.15], COL.methyl, 0.36);
    mol.atom([-0.2, 0, -1.15], COL.methyl, 0.36);
    const slots = [-4.6, -1.7, 0.8, 3.2];
    const x = slots[Math.min(3, st.stage)] + (st.stage < 3 ? (slots[st.stage + 1] - slots[st.stage]) * MM.smooth(st.u) : 0);
    const ring = mol.ring(10, [x, 0, 0], [1, 0, 0], [0, 1, 0], 1.35, COL.ring, 0.24, 1);
    mol.atoms[ring[0]].tag = 'move';
    for (let i = 0; i < st.collected; i++) {
      mol.atom([5.2 + i * 1.3, 0, 0], COL.ring, 0.55);
    }
    mol.label([-3.2, 2.3, 0], 'ворота');
    mol.label([0, 2.3, 0], 'барьер');
    return mol;
  }
  const muscle = {
    id: 'muscle',
    kicker: '5 · Ход поршня',
    title: 'Мышца, лифт и насос',
    subtitle: 'Скольжение колец меняет длину, высоту или число запасённых колец',
    legend: [
      ['#64748b', 'ось'],
      ['#3b82f6', 'кольцо'],
      ['#38bdf8', 'аммоний'],
      ['#f43f5e', 'бипиридин']
    ],
    view: { rx: 0.5, ry: -0.35, zoom: 0.75 },
    parts: ['muscle', 'elevator', 'pump'],
    init() { return { part: 'muscle', ext: 1, target: 0, level: 0, stage: 0, u: 0, collected: 0, playing: true, speed: 1 }; },
    setPart(st, part) {
      if (part === 'muscle' || part === 'elevator' || part === 'pump') st.part = part;
    },
    setStep(st, step) {
      const n = Math.max(1, step | 0);
      if (st.part === 'pump') { st.stage = (n - 1) % 4; st.u = 0; }
      else if (st.part === 'elevator') { st.level = n % 2 ? 0 : 1; st.target = st.level; }
      else { st.ext = n % 2 ? 1 : 0; st.target = st.ext; }
    },
    stepOf(st) {
      if (st.part === 'pump') return st.stage + 1;
      if (st.part === 'elevator') return st.level > 0.5 ? 2 : 1;
      return st.ext > 0.5 ? 1 : 2;
    },
    partOf(st) { return st.part; },
    tick(st, dt) {
      if (!st.playing) return;
      const sp = st.speed;
      if (st.part === 'muscle') {
        st.ext += (st.target - st.ext) * Math.min(1, dt * 1.6 * sp);
        if (Math.abs(st.ext - st.target) < 0.04) st.target = st.target > 0.5 ? 0 : 1;
      } else if (st.part === 'elevator') {
        st.level += (st.target - st.level) * Math.min(1, dt * 1.6 * sp);
        if (Math.abs(st.level - st.target) < 0.04) st.target = st.target > 0.5 ? 0 : 1;
      } else {
        st.u += dt * 0.55 * sp;
        if (st.u >= 1) {
          st.u = 0;
          st.stage++;
          if (st.stage >= 4) { st.stage = 0; st.collected = Math.min(4, st.collected + 1); }
        }
      }
    },
    step(st) {
      if (st.part === 'pump') {
        st.u = 0;
        st.stage++;
        if (st.stage >= 4) { st.stage = 0; st.collected = Math.min(4, st.collected + 1); }
      } else if (st.part === 'elevator') st.target = st.level > 0.5 ? 0 : 1;
      else st.target = st.ext > 0.5 ? 0 : 1;
    },
    scene(st) {
      if (st.part === 'elevator') return buildElevator(st.level);
      if (st.part === 'pump') return buildPump(st);
      return buildMuscle(st.ext);
    },
    chart(st) {
      if (st.part === 'pump') {
        const xs = [0, 1, 2, 3, 4];
        const ys = [8, 4, 36, 6, 8];
        const pts = xs.map((x, i) => [x, ys[i]]);
        return {
          yLabel: 'кДж/моль', xMin: 0, xMax: 4, yMin: 0, yMax: 48,
          xTicks: [{ x: 0.2, label: 'раствор' }, { x: 1, label: 'захват' }, { x: 2, label: 'барьер' }, { x: 3.2, label: 'на цепи' }],
          series: [{ pts: pts, width: 2.4 }],
          marker: { x: st.stage + st.u, y: MM.lerp(ys[st.stage], ys[Math.min(4, st.stage + 1)], st.u), onExcited: st.stage === 2 }
        };
      }
      const x = st.part === 'elevator' ? st.level : 1 - st.ext;
      const y = 20 * Math.pow(Math.sin(Math.PI * x), 2);
      return {
        yLabel: 'кДж/моль', xMin: 0, xMax: 1, yMin: 0, yMax: 30,
        xTicks: st.part === 'elevator'
          ? [{ x: 0.05, label: 'кислота, низ' }, { x: 0.95, label: 'основание, верх' }]
          : [{ x: 0.05, label: 'растянута' }, { x: 0.95, label: 'сокращена' }],
        series: [{ pts: groundSeries(t => 20 * Math.pow(Math.sin(Math.PI * t), 2), 0, 1), width: 2.4 }],
        marker: { x: x, y: y, onExcited: false }
      };
    },
    readout(st) {
      if (st.part === 'pump') return 'Стадия ' + (st.stage + 1) + ' из 4. Колец, уже запертых на цепи: ' + st.collected + '. Каждый цикл тратит окислительно-восстановительную энергию.';
      if (st.part === 'elevator') return st.level > 0.5 ? 'Платформа у бипиридиновых станций (среда основная, аммоний депротонирован).' : 'Платформа у аммониевых станций: краун-эфир держит NH₂⁺.';
      return st.ext > 0.5 ? 'Димер растянут: кольца у дальних станций.' : 'Димер сокращён: нити въехали друг в друга, концевые группы сблизились.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Шаг цикла' },
      { type: 'chips', key: 'part', options: [
        { id: 'muscle', label: 'Мышца' },
        { id: 'elevator', label: 'Лифт' },
        { id: 'pump', label: 'Насос' }
      ] },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p><b>Мышца</b> — димер-«ромашка»: каждая нить и ось, и кольцо одновременно, продетое в партнёра. Смена иона (в работе Соважа — перестройка координации) переносит кольца на другие станции, и расстояние между заглушками то растёт, то падает. Это один молекулярный саркомер, без ансамбля белка.</p>'
      + '<p><b>Лифт</b> Стоддарта — платформа из трёх колец на треноге. В кислоте кольца держатся за аммоний и платформа внизу. Основание снимает протоны, платформа уходит вверх к бипиридинию. Кислота возвращает её вниз.</p>'
      + '<p><b>Насос</b> проводит кольцо из раствора через ворота и оставляет его на цепи. Обратный ход закрыт, потому что редокс-цикл меняет барьер не симметрично. В равновесии кольцо с той же вероятностью возвращалось бы назад. На экране ворота, барьер и уже собранные кольца — схема, не структурная формула.</p>',
    refs: [
      'Jiménez M. C., Dietrich-Buchecker C., Sauvage J.-P. Towards Synthetic Molecular Muscles: Contraction and Stretching of a Linear Rotaxane Dimer. Angewandte Chemie International Edition, 2000, 39, 3284–3287.',
      'Badjić J. D., Balzani V., Credi A., Silvi S., Stoddart J. F. A Molecular Elevator. Science, 2004, 303, 1845–1849.',
      'Cheng C., McGonigal P. R., Schneebeli S. T., Li H., Vermeulen N. A., Ke C., Stoddart J. F. An artificial molecular pump. Nature Nanotechnology, 2015, 10, 547–553.'
    ]
  };

  /* ---------- 6. Шестерни, храповик, гироскоп, винт ---------- */
  function triptycene(mol, origin, axis, angle, color, tag) {
    const b = G.basis(axis, [1, 0, 0]);
    const ids = [];
    const bh1 = mol.atom(G.add(origin, G.mul(b.n, 0.75)), color, 0.3);
    const bh2 = mol.atom(G.add(origin, G.mul(b.n, -0.75)), color, 0.3);
    mol.bond(bh1, bh2, color, 0.06);
    ids.push(bh1, bh2);
    for (let i = 0; i < 3; i++) {
      const a = angle + i * 2 * Math.PI / 3;
      const radial = G.add(G.mul(b.x, Math.cos(a)), G.mul(b.y, Math.sin(a)));
      const tangent = G.add(G.mul(b.x, -Math.sin(a)), G.mul(b.y, Math.cos(a)));
      const center = G.add(origin, G.mul(radial, 2.35));
      const ring = mol.ring(6, center, tangent, radial, 1.28, color, 0.26, 1);
      for (let k = 0; k < ring.length; k++) ids.push(ring[k]);
      if (tag && i === 0) mol.atoms[ring[0]].tag = 'move';
    }
    return ids;
  }
  function buildGears(st) {
    const mol = new MM.Molecule();
    if (st.part === 'gears') {
      triptycene(mol, [-2.35, 0, 0], [0, 0, 1], st.angle, COL.gear, true);
      triptycene(mol, [2.35, 0, 0], [0, 0, 1], -st.angle + Math.PI / 3, COL.gear2, false);
      mol.label([0, 0, 3.4], 'зацепление');
    } else if (st.part === 'kelly') {
      triptycene(mol, [0, 0, 0], [0, 0, 1], st.angle, COL.gear, true);
      const pawl = [];
      for (let i = 0; i < 7; i++) {
        const a = -0.4 + i * 0.28;
        const r = 3.5 + i * 0.15;
        pawl.push(mol.atom([Math.cos(a) * r, Math.sin(a) * r, (i - 3) * 0.08], COL.pawl, 0.3));
      }
      mol.chain(pawl, COL.pawl, 0.08);
      mol.label([0, -3.6, 1.5], st.fuel ? 'есть топливо' : 'равновесие');
    } else if (st.part === 'gyro') {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        mol.atom([Math.cos(a) * 4.2, Math.sin(a) * 4.2, -2.2], COL.lattice, 0.35);
        mol.atom([Math.cos(a) * 4.2, Math.sin(a) * 4.2, 2.2], COL.lattice, 0.35);
      }
      const caps = [[0, 0, -2.4], [0, 0, 2.4]];
      caps.forEach(c => {
        const id = mol.atom(c, COL.stator, 0.4);
        for (let k = 0; k < 3; k++) {
          const a = k * 2 * Math.PI / 3;
          const p = [c[0] + Math.cos(a) * 1.5, c[1] + Math.sin(a) * 1.5, c[2]];
          const h = mol.atom(p, COL.stator, 0.32);
          mol.bond(id, h, COL.stator, 0.08);
        }
      });
      mol.atom([0, 0, -1.15], COL.rotor, 0.26);
      mol.atom([0, 0, 1.15], COL.rotor, 0.26);
      const ring = mol.ring(6, [0, 0, 0], [0, 0, 1], [1, 0, 0], 1.35, COL.rotor, 0.3, 1);
      mol.transform(ring, [0, 0, 0], [0, 0, 1], st.angle);
      mol.atoms[ring[0]].tag = 'move';
      mol.label([0, 0, 3.5], 'ротатор');
    } else {
      const nut = mol.ring(14, [0, 0, 0], [0, 1, 0], [1, 0, 0], 2.5, COL.stator, 0.26, 1);
      const ids = [];
      for (let i = 0; i < 3; i++) {
        for (let s = 0; s < 8; s++) {
          const a = st.angle + i * 2 * Math.PI / 3 + s * 0.42;
          const r = 0.35 + s * 0.28;
          const y = (s - 3.5) * 0.48;
          ids.push(mol.atom([r * Math.cos(a), y, r * Math.sin(a)], COL.rotor, 0.26, i === 0 && s === 7 ? 'move' : ''));
        }
      }
      const shown = ((st.shift % 4) + 4) % 4 - 1.2;
      mol.translate(ids, [0, shown, 0]);
      mol.label([0, 3.3, 0], st.driven ? 'винт ведут' : 'только тепло');
    }
    return mol;
  }
  const gears = {
    id: 'gears',
    kicker: '6 · Зацепление',
    title: 'Шестерни, храповик, гироскоп, винт',
    subtitle: 'Коррелированное вращение ещё не мотор. В равновесии направление не выбирается',
    legend: [
      ['#0ea5e9', 'триптицен'],
      ['#f59e0b', 'вторая шестерня'],
      ['#a855f7', 'собачка Келли'],
      ['#f08a24', 'ротатор']
    ],
    view: { rx: 0.85, ry: -0.4, zoom: 0.78 },
    parts: ['gears', 'kelly', 'gyro', 'screw'],
    init() { return { part: 'gears', angle: 0.4, w: 0, playing: true, speed: 1, tempC: 25, fuel: false, fuelTo: 0, driven: false, shift: 0, turns: 0 }; },
    setPart(st, part) {
      if (this.parts.indexOf(part) >= 0) {
        st.part = part;
        st.fuel = false;
        st.driven = part === 'screw' ? st.driven : false;
      }
    },
    setStep(st, step) {
      const n = Math.max(0, (step | 0) - 1);
      st.angle = n * Math.PI / 3;
      st.fuel = false;
    },
    stepOf(st) { return 1 + (Math.floor((st.angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 3)) % 6); },
    partOf(st) { return st.part; },
    tick(st, dt) {
      if (!st.playing) return;
      const sp = st.speed;
      if (st.part === 'gears' || st.part === 'gyro') {
        st.angle += dt * (st.part === 'gyro' ? 2.4 : 0.9) * sp;
      } else if (st.part === 'kelly') {
        if (st.fuel) {
          st.angle += dt * 1.5 * sp;
          if (st.angle >= st.fuelTo) { st.angle = st.fuelTo; st.fuel = false; st.w = 0; }
        } else {
          const F = -Math.sin(3 * st.angle) * 16;
          const noise = Math.sqrt((st.tempC + 273.15) / 300);
          st.w = st.w * (1 - Math.min(1, dt * 3.2)) + F * dt * 0.22 * sp + MM.randn() * noise * 1.35 * Math.sqrt(dt) * sp;
          st.angle += st.w * dt * 2.4;
        }
      } else {
        if (st.driven) {
          st.angle += dt * 1.4 * sp;
          st.shift = (st.angle - st.angle0) * 0.42;
        } else {
          st.angle += MM.randn() * Math.sqrt(dt) * 0.7 * sp;
          st.shift += MM.randn() * Math.sqrt(dt) * 0.04 * sp;
          st.shift *= (1 - Math.min(1, dt * 0.4));
        }
      }
    },
    step(st) {
      if (st.part === 'kelly') {
        st.fuel = true;
        st.fuelTo = st.angle + 2 * Math.PI / 3;
        st.w = 0;
      } else if (st.part === 'screw') {
        st.driven = !st.driven;
        st.angle0 = st.angle;
        if (!st.driven) st.shift = 0;
      } else st.angle += Math.PI / 3;
    },
    scene: buildGears,
    chart(st) {
      if (st.part === 'kelly') {
        const fn = th => 18 * (1 - Math.cos(3 * th * Math.PI / 180));
        const tilt = st.fuel ? -8 * ((st.fuelTo - st.angle) / (2 * Math.PI / 3)) : 0;
        return {
          yLabel: 'кДж/моль', xMin: 0, xMax: 120, yMin: -10, yMax: 40,
          xTicks: [{ x: 10, label: '0°' }, { x: 60, label: 'барьер' }, { x: 110, label: '120°' }],
          series: [{ pts: MM.sample(x => fn(x) + (st.fuel ? -10 * x / 120 : 0), 0, 120, 60), width: 2.4 }],
          barrier: 36,
          barrierLabel: st.fuel ? 'барьер снижен топливом' : 'барьеры в обе стороны равны',
          marker: { x: ((st.angle * 180 / Math.PI) % 120 + 120) % 120, y: fn(((st.angle * 180 / Math.PI) % 120 + 120) % 120) + tilt, onExcited: st.fuel }
        };
      }
      if (st.part === 'screw') {
        return {
          yLabel: 'сдвиг, Å', xMin: -2, xMax: 8, yMin: -2, yMax: 8,
          xTicks: [{ x: 0, label: 'старт' }, { x: 6, label: 'ход винта' }],
          series: [{ pts: [[-2, 0], [8, st.driven ? 6 : 0]], width: 2 }],
          marker: { x: MM.clamp(st.shift, -2, 8), y: MM.clamp(st.shift, -2, 8), onExcited: st.driven }
        };
      }
      const period = st.part === 'gyro' ? 8 : 22;
      const fn = x => period * Math.pow(Math.sin(3 * x * Math.PI / 180), 2);
      const deg = ((st.angle * 180 / Math.PI) % 120 + 120) % 120;
      return {
        yLabel: 'кДж/моль', xMin: 0, xMax: 120, yMin: 0, yMax: Math.max(12, period + 4),
        xTicks: [{ x: 20, label: '0°' }, { x: 60, label: '60°' }, { x: 100, label: '120°' }],
        series: [{ pts: MM.sample(fn, 0, 120, 60), width: 2.4 }],
        marker: { x: deg, y: fn(deg), onExcited: false }
      };
    },
    readout(st) {
      const deg = MM.comma(st.angle * 180 / Math.PI, 0);
      if (st.part === 'gears') return 'Угол первой шестерни ' + deg + '°. Вторая крутится в противофазе: так устроено зацепление триптиценов. Направление всё равно случайное, это не мотор.';
      if (st.part === 'kelly') return st.fuel
        ? 'Идёт химический шаг, как в системе 1999 года с фосгеном: один барьер временно снят, ротор проходит 120° и останавливается.'
        : 'Равновесие, как в храповике 1997 года. Суммарный угол ' + deg + '° гуляет в обе стороны. Средний ход к нулю, барьеры симметричны.';
      if (st.part === 'gyro') return 'Фениленовый ротатор крутится внутри статора. Решётка вокруг почти неподвижна — картина амфидинамического кристалла. Барьер маленький, направление не выбрано.';
      return st.driven
        ? 'Винт вращают извне, поэтому поворот связан со сдвигом. Смещение ' + MM.comma(st.shift, 2) + ' Å.'
        : 'Только тепло: лопасти дрожат, среднего хода нет. Смещение ' + MM.comma(st.shift, 2) + ' Å.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Шаг / топливо / привод' },
      { type: 'chips', key: 'part', options: [
        { id: 'gears', label: 'Шестерни' },
        { id: 'kelly', label: 'Храповик Келли' },
        { id: 'gyro', label: 'Гироскоп' },
        { id: 'screw', label: 'Винт' }
      ] },
      { type: 'slider', key: 'tempC', min: 0, max: 150, step: 1, label: 'Температура', unit: '°C', when(st) { return st.part === 'kelly'; } },
      { type: 'action', id: 'fuel', label: 'Дать топливо (120°)', when(st) { return st.part === 'kelly'; }, run(st) { st.fuel = true; st.fuelTo = st.angle + 2 * Math.PI / 3; }, on(st) { return st.fuel; } },
      { type: 'action', id: 'drive', label: 'Крутить винт', when(st) { return st.part === 'screw'; }, run(st) { st.driven = !st.driven; st.angle0 = st.angle; if (!st.driven) st.shift = 0; }, on(st) { return st.driven; } },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p><b>Триптиценовые шестерни</b> (Мислоу, Ивамура) передают поворот: лопасть одной входит между лопастями другой. Корреляция есть, предпочтительного направления нет. Это зубчатая передача, а не мотор.</p>'
      + '<p><b>Храповик Келли (1997)</b> выглядит как храповик: триптицен и спиральная «собачка». В равновесии он не даёт сетевого вращения. Барьер по и против часовой одинаков, броуновские шаги компенсируются. Это молекулярная версия храповика Фейнмана и прямой запрет второго закона. <b>Система 1999 года</b> проходит 120° только потому, что химическая реакция (фосген) на время убирает один барьер и необратимо тратится. Кнопка «топливо» показывает именно этот, уже неравновесный шаг.</p>'
      + '<p><b>Молекулярный гироскоп</b> Гарсиа-Гарибая — ротатор на оси внутри громоздкого статора в кристалле. Кристалл амфидинамический: часть решётки жёсткая, часть быстро крутится. Направления это само по себе не выбирает.</p>'
      + '<p><b>Винт</b> связывает вращение и перенос, только если его крутят. Сам по себе, в тепловом равновесии, он так же часто идёт назад. Жгутик бактерий работает по той же геометрии, но его крутит протонный поток, а не «тепло комнаты».</p>',
    refs: [
      'Iwamura H., Mislow K. Stereochemical consequences of dynamic gearing. Accounts of Chemical Research, 1988, 21, 175–182.',
      'Kelly T. R., Tellitu I., Sestelo J. P. In Search of Molecular Ratchets. Angewandte Chemie International Edition, 1997, 36, 1866–1868.',
      'Kelly T. R., De Silva H., Silva R. A. Unidirectional rotary motion in a molecular system. Nature, 1999, 401, 150–152.',
      'Khuong T.-A. V., Nuñez J. E., Godinez C. E., Garcia-Garibay M. A. Crystalline Molecular Machines: A Quest Toward Solid-State Dynamics and Function. Accounts of Chemical Research, 2006, 39, 413–422.',
      'Feynman R. P., Leighton R. B., Sands M. The Feynman Lectures on Physics. Vol. I, Chapter 46. Ratchet and pawl.'
    ]
  };

  /* ---------- 7. Биология ---------- */
  const ATP_STATE = [
    { name: 'T', text: 'T · ATP', color: COL.tight },
    { name: 'L', text: 'L · ADP+Pi', color: COL.loose },
    { name: 'O', text: 'O · пусто', color: COL.open }
  ];
  function buildATP(st) {
    const mol = new MM.Molecule();
    const ang = (st.step + MM.smooth(st.u)) * 2 * Math.PI / 3;
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * Math.PI / 3 - Math.PI / 2;
      const state = ATP_STATE[(i + st.step) % 3];
      const center = [Math.cos(a) * 3.3, Math.sin(a) * 3.3, 1.2];
      blob(mol, center, state.color, 1.15);
      mol.label([Math.cos(a) * 5.1, Math.sin(a) * 5.1, 1.4], state.text);
    }
    const gamma = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const bend = (1 - t) * 0.85;
      const p = [Math.cos(ang) * bend, Math.sin(ang) * bend, 2.4 - t * 5.2];
      gamma.push(mol.atom(p, COL.gamma, 0.38 - t * 0.06, i === 2 ? 'move' : ''));
    }
    mol.chain(gamma, COL.gamma, 0.12);
    for (let i = 0; i < 12; i++) {
      const a = ang + i / 12 * Math.PI * 2;
      mol.atom([Math.cos(a) * 2.4, Math.sin(a) * 2.4, -3.6], '#fdba74', 0.42);
    }
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      mol.atom([Math.cos(a) * 5.2, Math.sin(a) * 5.2, -3.2], COL.mem, 0.4);
    }
    mol.label([0, 0, 2.8], 'γ');
    mol.label([0, 0, -4.6], 'c-кольцо');
    return mol;
  }
  function buildFlagella(st) {
    const mol = new MM.Molecule();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      mol.atom([Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4], COL.mem, 0.32);
      mol.atom([Math.cos(a) * 4.6, 0.15, Math.sin(a) * 4.6], COL.mem2, 0.28);
      mol.atom([Math.cos(a) * 3.4, 0.7, Math.sin(a) * 3.4], COL.mem2, 0.28);
    }
    mol.ring(12, [0, -0.7, 0], [0, 1, 0], [1, 0, 0], 1.8, COL.stator, 0.26, 1);
    mol.ring(10, [0, -1.6, 0], [0, 1, 0], [1, 0, 0], 1.3, COL.gear, 0.24, 1);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2;
      blob(mol, [Math.cos(a) * 3.1, 0.2, Math.sin(a) * 3.1], COL.loose, 0.55);
    }
    const n = 28;
    const ids = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = st.phase + t * 3.2 * Math.PI * 2 * (st.dir >= 0 ? 1 : 1);
      const y = 1.2 + t * 10;
      const r = 1.15;
      ids.push(mol.atom([r * Math.cos(a), y, r * Math.sin(a)], COL.rotor, 0.3, i === 8 ? 'move' : ''));
    }
    mol.chain(ids, COL.rotor, 0.09);
    mol.label([2.8, -1.5, 0], 'статор');
    mol.label([0, 6, 2.2], st.dir >= 0 ? 'против часовой' : 'по часовой');
    return mol;
  }
  function kinesinCenters(n, u) {
    const swing = n % 2;
    const leadX = 2.1 + n * 4.3;
    const trailX = leadX - 4.3;
    const stand = [leadX, 2.15, 0];
    const endX = leadX + 4.3;
    const ang = Math.PI * (1 - MM.smooth(u));
    const cx = (trailX + endX) / 2;
    const R = (endX - trailX) / 2;
    const moving = [cx + R * Math.cos(ang), 2.15 + Math.sin(ang) * R * 0.72, 0];
    return swing === 0 ? [moving, stand] : [stand, moving];
  }
  function buildKinesin(st) {
    const mol = new MM.Molecule();
    for (let i = 0; i < 8; i++) {
      const x = i * 4.3;
      mol.atom([x, 0, 0], i % 2 ? '#cbd5e1' : COL.mt, 0.7);
      mol.atom([x + 1.7, 0, 0], i % 2 ? COL.mt : '#cbd5e1', 0.62);
    }
    const heads = kinesinCenters(st.n, st.u);
    const colors = [COL.headA, COL.headB];
    const ids = [];
    for (let h = 0; h < 2; h++) {
      const b = blob(mol, heads[h], colors[h], 0.85, h === (st.n % 2) ? 'move' : '');
      ids.push(b[0]);
    }
    const neck = mol.tube([
      heads[0],
      [(heads[0][0] + heads[1][0]) / 2, Math.min(heads[0][1], heads[1][1]) + 0.8, 0.3],
      heads[1]
    ], COL.stereo, 0.18, 0.05);
    mol.label([heads[0][0], heads[0][1] + 1.5, 0], 'голова');
    mol.label([2, -1.5, 0], 'микротрубочка · 8 нм');
    return mol;
  }
  const bio = {
    id: 'bio',
    kicker: '7 · Для сравнения',
    title: 'Живые машины',
    subtitle: 'АТФ-синтаза, бактериальный жгутик и кинезин',
    legend: [
      ['#16a34a', 'T, плотная'],
      ['#eab308', 'L, рыхлая'],
      ['#94a3b8', 'O, открытая'],
      ['#f59e0b', 'ротор γ']
    ],
    view: { rx: 0.85, ry: -0.45, zoom: 0.72 },
    parts: ['atp', 'flag', 'kinesin'],
    init() { return { part: 'atp', step: 0, u: 0, phase: 0, dir: 1, n: 0, playing: true, speed: 1 }; },
    setPart(st, part) { if (this.parts.indexOf(part) >= 0) st.part = part; },
    setStep(st, step) {
      const n = Math.max(1, step | 0) - 1;
      if (st.part === 'atp') { st.step = n % 3; st.u = 0; }
      else if (st.part === 'kinesin') { st.n = n % 6; st.u = 0; }
      else st.phase = n * 0.8;
    },
    stepOf(st) {
      if (st.part === 'atp') return st.step + 1;
      if (st.part === 'kinesin') return (st.n % 6) + 1;
      return 1 + (Math.floor(Math.abs(st.phase) / 1.2) % 6);
    },
    partOf(st) { return st.part; },
    tick(st, dt) {
      if (!st.playing) return;
      const sp = st.speed;
      if (st.part === 'atp') {
        st.u += dt * 0.45 * sp;
        if (st.u >= 1) { st.u = 0; st.step = (st.step + 1) % 3; }
      } else if (st.part === 'flag') {
        st.phase += dt * st.dir * 2.6 * sp;
      } else {
        st.u += dt * 0.55 * sp;
        if (st.u >= 1) { st.u = 0; st.n++; }
      }
    },
    step(st) {
      if (st.part === 'atp') { st.u = 0; st.step = (st.step + 1) % 3; }
      else if (st.part === 'flag') st.dir *= -1;
      else { st.u = 0; st.n++; }
    },
    scene(st) {
      if (st.part === 'flag') return buildFlagella(st);
      if (st.part === 'kinesin') return buildKinesin(st);
      return buildATP(st);
    },
    chart(st) {
      if (st.part === 'flag') {
        const x = ((st.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return {
          yLabel: 'усл. энергия', xMin: 0, xMax: 6.28, yMin: 0, yMax: 20,
          xTicks: [{ x: 0.3, label: '0' }, { x: 3.1, label: 'π' }, { x: 5.8, label: '2π' }],
          series: [{ pts: MM.sample(t => 6 + 4 * Math.sin(t * 6), 0, 6.28, 70), width: 2.2 }],
          marker: { x: x, y: 6 + 4 * Math.sin(x * 6), onExcited: false }
        };
      }
      if (st.part === 'kinesin') {
        const x = (st.n % 4) + st.u;
        const fn = t => 22 * Math.pow(Math.sin(Math.PI * ((t % 1 + 1) % 1)), 2) + 8 * (t % 1);
        return {
          yLabel: 'кДж/моль', xMin: 0, xMax: 4, yMin: 0, yMax: 40,
          xTicks: [{ x: 0.2, label: 'шаг 8 нм' }, { x: 2, label: 'АТФ' }, { x: 3.6, label: 'вперёд' }],
          series: [{ pts: MM.sample(fn, 0, 4, 80), width: 2.2 }],
          marker: { x: x, y: fn(x), onExcited: st.u > 0.15 && st.u < 0.85 }
        };
      }
      const x = st.step + st.u;
      const fn = t => {
        const f = (t % 1 + 1) % 1;
        return 48 - 16 * Math.floor(t) + 18 * Math.sin(Math.PI * f);
      };
      return {
        yLabel: 'кДж/моль', xMin: 0, xMax: 3, yMin: -10, yMax: 70,
        xTicks: [{ x: 0.2, label: '0°' }, { x: 1, label: '120°' }, { x: 2, label: '240°' }, { x: 2.8, label: '360°' }],
        series: [{ pts: MM.sample(t => 30 + 22 * Math.sin(Math.PI * ((t % 1 + 1) % 1)), 0, 3, 90), width: 2.2 }],
        barrier: 52,
        barrierLabel: 'порядок энергии АТФ в клетке',
        marker: { x: x, y: 30 + 22 * Math.sin(Math.PI * st.u), onExcited: false }
      };
    },
    readout(st) {
      if (st.part === 'flag') return (st.dir >= 0 ? 'Вращение против часовой стрелки — клетка плывёт прямо (run).' : 'По часовой — жгут перестраивается, клетка кувыркается (tumble).') + ' Энергия — протонный или натриевый градиент, не АТФ.';
      if (st.part === 'kinesin') return 'Шаг ' + ((st.n % 8) + 1) + ' · рука об руку, 8 нм на одну АТФ. Задняя голова отрывается и диффундирует вперёд, стыковка шейного линкера задаёт направление.';
      const names = ['плотная T', 'рыхлая L', 'открытая O'];
      return 'Шаг ' + (st.step + 1) + ' из 3 · γ повернулась на ' + (st.step * 120) + '°. Сайт, в который смотрит ротор, открыт. Три сайта обходят состояния T → O → L. На оборот — около трёх АТФ.';
    },
    controls: [
      { type: 'play' },
      { type: 'step', label: 'Шаг / реверс' },
      { type: 'chips', key: 'part', options: [
        { id: 'atp', label: 'АТФ-синтаза' },
        { id: 'flag', label: 'Жгутик' },
        { id: 'kinesin', label: 'Кинезин' }
      ] },
      { type: 'slider', key: 'speed', min: 0.25, max: 3, step: 0.05, label: 'Скорость показа', unit: '×' }
    ],
    explain: '<p><b>АТФ-синтаза.</b> Протоны через Fo крутят кольцо c и асимметричный ротор γ внутри F1. Три каталитических сайта на β-субъединицах по очереди бывают плотными (T, АТФ уже собрана), рыхлыми (L, связаны ADP и фосфат) и открытыми (O, продукты вышли, субстраты заходят). Это механизм смены связывания Бойера. Один шаг — 120°. Кристалл F1 бычьей митохондрии — PDB <b>1BMF</b>.</p>'
      + '<p><a href="index.html?id=1BMF&style=cartoon&color=chain&spin=1">Открыть F1 в просмотрщике (PDB 1BMF)</a>. Параметр <code>id</code> — код RCSB. Ссылка <code>?pdb=</code> на этом сайте открывает файл репозитория, не банк структур.</p>'
      + '<p><b>Жгутик бактерии</b> — протонная (или натриевая) турбина в мембране. Статор MotA/MotB стоит, ротор и крюк крутят спиральную нить. Смена направления переключает «плыть» и «кувырок». Нить удобно смотреть как PDB 1UCU, но файл большой.</p>'
      + '<p><a href="index.html?id=1UCU&style=cartoon&spin=1">Нить жгутика, PDB 1UCU</a></p>'
      + '<p><b>Кинезин</b> идёт по микротрубочке рука об руку: задняя голова, отпустив ADP, перелетает вперёд на 16 нм, а центр масс сдвигается на 8 нм. На каждый шаг тратится АТФ. Структура димера моторных доменов — PDB <b>3KIN</b>.</p>'
      + '<p><a href="index.html?id=3KIN&style=cartoon&color=chain&spin=1">Открыть кинезин (PDB 3KIN)</a></p>'
      + '<p>Общее с синтетическими машинами: направленность появляется, только когда химическая энергия или градиент ионов делает ландшафт несимметричным. Броуновское движение никуда не девается — оно и переносит голову кинезина, и проворачивает γ, когда барьер уже снят.</p>',
    refs: [
      'Abrahams J. P., Leslie A. G. W., Lutter R., Walker J. E. Structure at 2.8 Å resolution of F1-ATPase from bovine heart mitochondria. Nature, 1994, 370, 621–628. PDB 1BMF.',
      'Noji H., Yasuda R., Yoshida M., Kinosita K. Jr. Direct observation of the rotation of F1-ATPase. Nature, 1997, 386, 299–302.',
      'Boyer P. D. The ATP synthase — a splendid molecular machine. Annual Review of Biochemistry, 1997, 66, 717–749.',
      'Berg H. C. The Rotary Motor of Bacterial Flagella. Annual Review of Biochemistry, 2003, 72, 19–54.',
      'Yonekura K., Maki-Yonekura S., Namba K. Complete atomic model of the bacterial flagellar filament by electron cryomicroscopy. Nature, 2003, 424, 643–650. PDB 1UCU.',
      'Kozielski F., Sack S., Marx A., Thormählen M., Schönbrunn E., Biou V., Thompson A., Mandelkow E.-M., Mandelkow E. The crystal structure of dimeric kinesin and implications for microtubule-dependent motility. Cell, 1997, 91, 985–994. PDB 3KIN.',
      'Yildiz A., Tomishige M., Vale R. D., Selvin P. R. Kinesin Walks Hand-Over-Hand. Science, 2004, 303, 676–678.',
      'Vale R. D., Milligan R. A. The Way Things Move: Looking Under the Hood of Molecular Motor Proteins. Science, 2000, 288, 88–95.'
    ]
  };

  root.MM.machines = [feringa, nanocar, rotaxane, catenane, muscle, gears, bio];
})(typeof window !== 'undefined' ? window : globalThis);
