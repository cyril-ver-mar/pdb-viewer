/* Жёсткие учебные модели. Связи не меняют длину: фрагмент либо едет целиком, либо крутится вокруг связи. */
(function (root) {
  'use strict';
  const MM = root.MM;
  const G = MM.G;
  const Rig = MM.Rig;

  const COL = {
    stator: '#8b95a7', rotor: '#f08a24', alkene: '#22d3ee', methyl: '#fb7185', stereo: '#e11d48',
    ring: '#3b82f6', stop: '#475569', ttf: '#16a34a', dnp: '#f43f5e', s: '#eab308', o: '#fb7185',
    n: '#38bdf8', terpy: '#4ade80', cu: '#ea7a2f', axle: '#64748b', surf: '#d08a5a', tip: '#e2e8f0',
    c60: '#334155', gamma: '#f59e0b', tight: '#16a34a', loose: '#eab308', open: '#94a3b8',
    mem: '#d6d3d1', gear: '#0ea5e9', gear2: '#f59e0b', pawl: '#a855f7', lattice: '#cbd5e1',
    headA: '#f08a24', headB: '#2563eb', mt: '#94a3b8'
  };

  function naph(rig, attach, normal, hint, color, frag) {
    const b = G.basis(normal, hint);
    const raw = [
      [2.42, 0.70], [1.21, 1.40], [0, 0.70], [0, -0.70], [1.21, -1.40], [2.42, -0.70],
      [-1.21, 1.40], [-2.42, 0.70], [-2.42, -0.70], [-1.21, -1.40]
    ];
    const ax = 2.42, ay = 0.70;
    const ids = raw.map(function (xy) {
      const dx = -(xy[0] - ax);
      const dy = xy[1] - ay;
      return rig.atom(G.add(attach, G.add(G.mul(b.x, dx), G.mul(b.y, dy))), color, 0.3, frag);
    });
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6], [6, 7], [7, 8], [8, 9], [9, 3]];
    const doubles = { '0-1': 1, '2-3': 1, '4-5': 1, '6-7': 1, '8-9': 1 };
    pairs.forEach(function (p) {
      const ord = doubles[p[0] + '-' + p[1]] ? 2 : 1;
      rig.bond(ids[p[0]], ids[p[1]], color, ord === 2 ? 0.055 : 0.065, ord);
    });
    return ids;
  }

  function blob(rig, center, color, frag, scale) {
    const s = scale || 1;
    const edge = 1.42 * s;
    const offs = [[0, 0, 0], [edge, 0, 0], [edge * 0.5, edge * 0.866, 0], [edge * 0.5, edge * 0.289, edge * 0.816]];
    const ids = offs.map(function (o) { return rig.atom(G.add(center, o), color, 0.32 * s, frag); });
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) rig.bond(ids[i], ids[j], color, 0.06);
    return ids;
  }

  /* ---------- 1. Феринга: ротор крутится вокруг оси C=C ---------- */
  let ferRig = null;
  let ferStar = null;
  function feringaRig() {
    if (ferRig) return ferRig;
    const rig = new Rig();
    const S = COL.stator;
    const R = 1.40;
    const bond = 1.50;
    function side(sign) {
      const dir = G.norm([sign * 2.1, 1.55, 0]);
      const center = G.mul(dir, -(R + bond));
      return rig.ring(6, center, [0, 0, 1], dir, R, S, 0.32, 'stator');
    }
    const left = side(1);
    const right = side(-1);
    const c9 = rig.atom([0, 0, 0], COL.alkene, 0.36, 'stator');
    rig.bond(c9, left[0], COL.alkene, 0.08);
    rig.bond(c9, right[0], COL.alkene, 0.08);
    const alk = rig.atom([0, bond, 0], COL.alkene, 0.36, 'rotor');
    rig.bond(c9, alk, COL.alkene, 0.09, 2);
    const star = rig.atom([0, bond + 1.50, 0], COL.stereo, 0.34, 'rotor');
    ferStar = [0, bond + 1.50, 0];
    rig.bond(alk, star, COL.rotor, 0.08);
    const nap = naph(rig, [0, bond + 1.50 + 1.49, 0.15], [1, 0, 0], [0, 1, 0], COL.rotor, 'rotor');
    rig.bond(star, nap[0], COL.rotor, 0.08);
    rig.atoms[nap[3]].tag = 'wing';
    const methyl = rig.atom([-0.35, ferStar[1] - 0.2, 1.62], COL.methyl, 0.32, 'methyl', 'move');
    rig.bond(star, methyl, COL.methyl, 0.075);
    rig.seal();
    ferRig = rig;
    return rig;
  }
  function feringa(p) {
    const rig = feringaRig();
    const Y = [0, 1, 0];
    const origin = [0, 0, 0];
    const axial = (1 - p.axial) * 0.65;
    rig.pose({
      rotor: [{ spin: [origin, Y, p.theta] }],
      methyl: [{ spin: [ferStar, [1, 0, 0], axial] }, { spin: [origin, Y, p.theta] }]
    });
    const hot = p.excited > 0.25;
    rig.atoms.forEach(function (a) {
      if (a.frag === 'stator' && a.c !== COL.stator && !hot) return;
    });
    const alk = rig.atoms.find(function (a, i) { return rig.base[i][1] === 1.5 && a.frag === 'rotor'; });
    rig.atoms.forEach(function (a, i) {
      if (Math.abs(rig.base[i][0]) < 1e-6 && Math.abs(rig.base[i][2]) < 1e-6 && (Math.abs(rig.base[i][1]) < 1e-6 || Math.abs(rig.base[i][1] - 1.5) < 1e-6)) {
        a.c = hot ? '#a5f3fc' : COL.alkene;
        a.r = hot ? 0.46 : 0.36;
      }
    });
    rig.setLabel(0, p.h + ' · ' + (p.form === 'устойчивая' ? 'уст.' : 'неуст.'), [0.4, 2.2, 2.5]);
    if (!rig.labels.length) rig.label([0.4, 2.2, 2.5], p.h);
    rig.labels[0].text = p.h + ' · ' + (p.form === 'устойчивая' ? 'уст.' : 'неуст.');
    return rig;
  }

  /* ---------- 2. Наноавтомобиль: колёса крутятся вокруг оси, шасси едет целиком ---------- */
  const cars = {};
  function makeCar(part) {
    if (cars[part]) return cars[part];
    const rig = new Rig();
    const sp = 2.7;
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 7; i++) {
        const x = (i - 3 + (j % 2 ? 0.5 : 0)) * sp;
        const y = (j - 2) * sp * 0.866;
        rig.atom([x, y, 0], COL.surf, 0.55, 'surf');
      }
    }
    const hubs = [];
    const zHub = 2.8;
    const zBody = zHub + 2.9;
    const corners = [[-2.6, -1.8], [2.6, -1.8], [2.6, 1.8], [-2.6, 1.8]];
    corners.forEach(function (c, idx) {
      const hub = rig.atom([c[0], c[1], zHub], COL.axle, 0.28, 'body');
      const ySign = c[1] >= 0 ? 1 : -1;
      const axlePt = [c[0], c[1] + ySign * 1.50, zHub];
      hubs.push(axlePt);
      const axleId = rig.atom(axlePt, COL.axle, 0.26, 'w' + idx);
      rig.bond(hub, axleId, COL.axle, 0.08);
      const mid = rig.atom([c[0], c[1], zHub + 1.45], COL.stator, 0.26, 'body');
      const top = rig.atom([c[0], c[1], zBody], COL.stator, 0.3, 'body');
      rig.bond(hub, mid, COL.stator, 0.08);
      rig.bond(mid, top, COL.stator, 0.08);
      if (part === 'tour') addCage(rig, axlePt, axleId, 'w' + idx);
      else addPaddle(rig, axlePt, axleId, 'w' + idx, idx === 0);
    });
    linkFrame(rig, corners, zBody);
    for (let i = 0; i < 4; i++) rig.atom([0, 0, 6.4 + i * 1.45], COL.tip, 0.22, 'tip');
    rig.chain(lastIds(rig, 4), COL.tip, 0.06);
    rig.seal();
    cars[part] = { rig: rig, hubs: hubs, zHub: zHub };
    return cars[part];
  }
  function findAtom(rig, p) {
    for (let i = 0; i < rig.atoms.length; i++) {
      const a = rig.atoms[i].p;
      if (Math.abs(a[0] - p[0]) < 1e-6 && Math.abs(a[1] - p[1]) < 1e-6 && Math.abs(a[2] - p[2]) < 1e-6) return i;
    }
    return -1;
  }
  function lastIds(rig, n) {
    const ids = [];
    for (let i = rig.atoms.length - n; i < rig.atoms.length; i++) ids.push(i);
    return ids;
  }
  function addPaddle(rig, center, axleId, frag, tag) {
    const b = G.basis([0, 1, 0], [1, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * Math.PI / 3;
      const dir = G.add(G.mul(b.x, Math.cos(a)), G.mul(b.y, Math.sin(a)));
      const id = rig.atom(G.add(center, G.mul(dir, 1.40)), COL.rotor, 0.3, frag, tag && i === 0 ? 'move' : '');
      rig.bond(axleId, id, COL.rotor, 0.07);
    }
  }
  function addCage(rig, axlePt, axleId, frag) {
    const ySign = axlePt[1] >= 0 ? 1 : -1;
    const center = [axlePt[0], axlePt[1] + ySign * 1.35, axlePt[2]];
    const rings = [];
    [-0.7, 0.7].forEach(function (dy, ri) {
      const ring = [];
      for (let j = 0; j < 6; j++) {
        const a = j / 6 * Math.PI * 2;
        const p = [center[0] + Math.cos(a) * 1.20, center[1] + dy, center[2] + Math.sin(a) * 1.20];
        ring.push(rig.atom(p, COL.c60, 0.22, frag, ri === 0 && j === 0 ? 'move' : ''));
      }
      rig.chain(ring, COL.c60, 0.05);
      rig.bond(ring[0], ring[5], COL.c60, 0.05);
      rings.push(ring);
    });
    for (let j = 0; j < 6; j++) rig.bond(rings[0][j], rings[1][j], COL.c60, 0.05);
    rig.bond(axleId, rings[0][0], COL.c60, 0.05);
  }
  function linkFrame(rig, corners, z) {
    const ids = corners.map(function (c) { return findAtom(rig, [c[0], c[1], z]); });
    for (let e = 0; e < 4; e++) {
      const a = rig.atoms[ids[e]].p;
      const b = rig.atoms[ids[(e + 1) % 4]].p;
      const steps = 3;
      let prev = ids[e];
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const id = rig.atom([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z], COL.stator, 0.26, 'body');
        rig.bond(prev, id, COL.stator, 0.08);
        prev = id;
      }
      rig.bond(prev, ids[(e + 1) % 4], COL.stator, 0.08);
    }
  }
  function nearest(rig, ids, p) { return ids[0]; }
  function nearestBody(rig, p) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < rig.atoms.length; i++) {
      if (rig.atoms[i].frag !== 'body') continue;
      const d = G.len(G.sub(rig.atoms[i].p, p));
      if (d > 0.2 && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function nanocar(st) {
    const pack = makeCar(st.part === 'tour' ? 'tour' : 'feringa');
    const rig = pack.rig;
    const ang = -st.x / 1.15;
    const shift = [st.x, 0, 0];
    const ops = { body: [{ trans: shift }], tip: [{ trans: shift }] };
    pack.hubs.forEach(function (h, i) {
      ops['w' + i] = [{ spin: [h, [0, 1, 0], ang + (i % 2 ? 0.4 : 0)] }, { trans: shift }];
    });
    rig.pose(ops);
    const hot = (st.pulse || 0) > 0.35;
    const tips = rig._byFrag.tip || [];
    tips.forEach(function (i) { rig.atoms[i].c = hot ? '#fde68a' : COL.tip; });
    return rig;
  }

  /* ---------- 3. Ротаксан: кольцо только скользит по оси ---------- */
  let shutRig = null;
  function shuttleRig() {
    if (shutRig) return shutRig;
    const rig = new Rig();
    const ids = [];
    for (let x = -7.5; x <= 7.5; x += 1.45) ids.push(rig.atom([x, 0, 0], COL.axle, 0.28, 'axle'));
    rig.chain(ids, COL.axle, 0.09);
    stopper(rig, ids[0], -1);
    stopper(rig, ids[ids.length - 1], 1);
    station(rig, -3.2, COL.ttf, 'TTF');
    station(rig, 3.2, COL.dnp, 'DNP');
    const ring = rig.ring(16, [0, 0, 0], [1, 0, 0], [0, 1, 0], 3.15, COL.ring, 0.28, 'ring');
    rig.atoms[ring[0]].tag = 'move';
    rig.atoms[ring[4]].c = '#1d4ed8';
    rig.atoms[ring[12]].c = '#1d4ed8';
    rig.tidyKey = 'machine|shuttle';
    rig.seal();
    shutRig = rig;
    return rig;
  }
  function stopper(rig, axleId, sign) {
    const p = rig.atoms[axleId].p;
    const hub = rig.atom([p[0] + sign * 1.50, 0, 0], COL.stop, 0.4, 'axle');
    rig.bond(axleId, hub, COL.stop, 0.09);
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * Math.PI / 3;
      const id = rig.atom([p[0] + sign * 2.55, Math.cos(a) * 1.35, Math.sin(a) * 1.35], COL.stop, 0.42, 'axle');
      rig.bond(hub, id, COL.stop, 0.08);
    }
  }
  function station(rig, x, color, fragName) {
    const axle = nearestAxle(rig, x);
    const link = rig.atom([x, 1.45, 0], color, 0.3, 'axle');
    rig.bond(axle, link, color, 0.07);
    const a = rig.atom([x + 0.72, 1.45, 1.25], color, 0.28, 'axle');
    const b = rig.atom([x - 0.72, 1.45, -1.25], color, 0.28, 'axle');
    rig.bond(link, a, color, 0.065);
    rig.bond(link, b, color, 0.065);
  }
  function nearestAxle(rig, x) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < rig.atoms.length; i++) {
      if (rig.atoms[i].frag !== 'axle') continue;
      const d = Math.abs(rig.atoms[i].p[0] - x) + Math.abs(rig.atoms[i].p[1]) + Math.abs(rig.atoms[i].p[2]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function shuttle(st) {
    const rig = shuttleRig();
    const x = Math.max(-5.6, Math.min(5.6, st.x));
    rig.pose({ ring: [{ trans: [x, 0, 0] }] });
    return rig;
  }

  /* ---------- 4. Катенан: кольцо крутится в своей плоскости ---------- */
  let catRig = null;
  function catenaneRig() {
    if (catRig) return catRig;
    const rig = new Rig();
    const a = rig.ring(18, [0, 0, 0], [0, 0, 1], [1, 0, 0], 4.05, COL.stator, 0.3, 'ringA');
    rig.atoms[a[0]].c = COL.n;
    rig.atoms[a[1]].c = COL.n;
    const b = rig.ring(18, [4.05, 0, 0], [0, 1, 0], [1, 0, 0], 4.05, '#64748b', 0.3, 'ringB');
    rig.atoms[b[9]].c = COL.n;
    rig.atoms[b[8]].c = COL.n;
    rig.atoms[b[0]].c = COL.terpy;
    rig.atoms[b[1]].c = COL.terpy;
    rig.atoms[b[17]].c = COL.terpy;
    rig.atoms[b[9]].tag = 'move';
    rig.atom([0, 1.45, 0], COL.cu, 0.42, 'cu');
    rig.tidyKey = 'machine|catenane';
    rig.seal();
    catRig = rig;
    return rig;
  }
  function catenane(st) {
    const rig = catenaneRig();
    rig.pose({ ringB: [{ spin: [[4.05, 0, 0], [0, 1, 0], st.angle] }] });
    rig._byFrag.cu.forEach(function (i) { rig.atoms[i].c = st.cu2 ? '#2563eb' : COL.cu; });
    return rig;
  }

  /* ---------- 5. Мышца, лифт, насос ---------- */
  let muscleRig = null;
  function muscleModel() {
    if (muscleRig) return muscleRig;
    const rig = new Rig();
    filament(rig, 0, 'A');
    filament(rig, 5.6, 'B');
    rig.tidyKey = 'machine|muscle';
    rig.seal();
    muscleRig = rig;
    return rig;
  }
  function filament(rig, y, frag) {
    const ids = [];
    for (let i = 0; i < 7; i++) ids.push(rig.atom([-4.5 + i * 1.5, y, 0], COL.axle, 0.26, frag));
    rig.chain(ids, COL.axle, 0.08);
    const hub = rig.atom([-6.0, y, 0], COL.stop, 0.36, frag);
    rig.bond(ids[0], hub, COL.stop, 0.08);
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3;
      const id = rig.atom([-7.15, y + Math.cos(a) * 0.85, Math.sin(a) * 0.85], COL.stop, 0.32, frag);
      rig.bond(hub, id, COL.stop, 0.07);
    }
    const other = y === 0 ? 5.8 : 0;
    const ringX = y === 0 ? -2.4 : 1.6;
    const ring = rig.ring(12, [ringX, other, 0], [1, 0, 0], [0, 1, 0], 2.05, COL.ring, 0.26, frag);
    let face = ring[0], faceD = 1e9;
    ring.forEach(function (id) {
      const d = Math.abs(rig.atoms[id].p[1] - y);
      if (d < faceD) { faceD = d; face = id; }
    });
    const anchor = ids[Math.max(0, Math.min(ids.length - 1, Math.round((ringX + 4.5) / 1.5)))];
    const a = rig.atoms[anchor].p, b = rig.atoms[face].p;
    const span = G.len(G.sub(b, a));
    const n = Math.max(1, Math.round(span / 1.45));
    let prev = anchor;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const id = rig.atom([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], COL.ring, 0.24, frag);
      rig.bond(prev, id, COL.ring, 0.07);
      prev = id;
    }
    rig.bond(prev, face, COL.ring, 0.07);
    if (frag === 'A') rig.atoms[ring[0]].tag = 'move';
  }
  function muscle(st) {
    const rig = muscleModel();
    const s = (st.ext - 0.5) * 1.6;
    rig.pose({
      A: [{ trans: [s, 0, 0] }],
      B: [{ trans: [-s, 0, 0] }]
    });
    return rig;
  }

  let elevRig = null;
  function elevatorModel() {
    if (elevRig) return elevRig;
    const rig = new Rig();
    const xs = [-6.4, 0, 6.4];
    xs.forEach(function (x) {
      const ids = [];
      for (let k = 0; k < 8; k++) ids.push(rig.atom([x, -5.2 + k * 1.48, 0], COL.axle, 0.26, 'axle'));
      rig.chain(ids, COL.axle, 0.08);
      const low = rig.atom([x, -2.2, 1.35], COL.n, 0.32, 'axle');
      const high = rig.atom([x, 2.2, 1.35], COL.dnp, 0.32, 'axle');
      rig.bond(nearestY(rig, x, -2.2), low, COL.n, 0.07);
      rig.bond(nearestY(rig, x, 2.2), high, COL.dnp, 0.07);
    });
    const rings = xs.map(function (x, i) {
      return rig.ring(12, [x, 0, 0], [0, 1, 0], [1, 0, 0], 2.55, COL.ring, 0.26, 'plat');
    });
    for (let i = 1; i < rings.length; i++) {
      const bridge = rig.atom([(xs[i - 1] + xs[i]) / 2, 0, 0], COL.ring, 0.26, 'plat');
      rig.bond(closestTo(rig, rings[i - 1], rig.atoms[bridge].p), bridge, COL.ring, 0.07);
      rig.bond(bridge, closestTo(rig, rings[i], rig.atoms[bridge].p), COL.ring, 0.07);
    }
    rig.atoms[rings[1][0]].tag = 'move';
    rig.seal();
    elevRig = rig;
    return rig;
  }
  function nearestY(rig, x, y) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < rig.atoms.length; i++) {
      const p = rig.atoms[i].p;
      const d = Math.abs(p[0] - x) + Math.abs(p[1] - y) + Math.abs(p[2]);
      if (rig.atoms[i].frag === 'axle' && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function closestTo(rig, ids, p) {
    let best = ids[0], bd = 1e9;
    ids.forEach(function (id) {
      const d = G.len(G.sub(rig.atoms[id].p, p));
      if (d < bd) { bd = d; best = id; }
    });
    return best;
  }
  function elevator(st) {
    const rig = elevatorModel();
    const y = -2.2 + Math.max(0, Math.min(1, st.level)) * 4.4;
    rig.pose({ plat: [{ trans: [0, y, 0] }] });
    return rig;
  }

  let pumpRig = null;
  function pumpModel() {
    if (pumpRig) return pumpRig;
    const rig = new Rig();
    const ids = [];
    for (let x = -6; x <= 8; x += 1.45) ids.push(rig.atom([x, 0, 0], COL.axle, 0.26, 'axle'));
    rig.chain(ids, COL.axle, 0.08);
    rig.ring(16, [-4.2, 0, 0], [1, 0, 0], [0, 1, 0], 3.55, COL.stator, 0.26, 'gate');
    const bumpA = rig.atom([0, 0, 0.7], COL.methyl, 0.28, 'axle');
    const bumpB = rig.atom([0, 0, -0.7], COL.methyl, 0.28, 'axle');
    const at = nearestY(rig, 0, 0);
    rig.bond(at, bumpA, COL.methyl, 0.07);
    rig.bond(at, bumpB, COL.methyl, 0.07);
    const moving = rig.ring(14, [0, 0, 0], [1, 0, 0], [0, 1, 0], 2.15, COL.ring, 0.26, 'ring');
    rig.atoms[moving[0]].tag = 'move';
    [-2.2, 2.4, 5.2].forEach(function () {});
    rig.ring(14, [6.6, 0, 0], [1, 0, 0], [0, 1, 0], 2.15, '#1d4ed8', 0.24, 'kept');
    rig.seal();
    pumpRig = rig;
    return rig;
  }
  function pump(st) {
    const rig = pumpModel();
    const slots = [-5.4, -2.4, 1.2, 3.6];
    const stage = Math.max(0, Math.min(3, st.stage | 0));
    const u = Math.max(0, Math.min(1, st.u || 0));
    const x = stage < 3 ? slots[stage] + (slots[stage + 1] - slots[stage]) * u : slots[3];
    rig.pose({ ring: [{ trans: [x, 0, 0] }] });
    return rig;
  }

  /* ---------- 6. Шестерни ---------- */
  function addGear(rig, origin, frag, color, tag) {
    const bh1 = rig.atom(G.add(origin, [0, 0, 0.72]), color, 0.3, frag);
    const bh2 = rig.atom(G.add(origin, [0, 0, -0.72]), color, 0.3, frag);
    rig.bond(bh1, bh2, color, 0.08);
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * Math.PI / 3;
      const rad = [Math.cos(a), Math.sin(a), 0];
      const p1 = G.add(origin, G.mul(rad, 1.55));
      const p2 = G.add(origin, G.mul(rad, 2.95));
      const i1 = rig.atom(p1, color, 0.28, frag, tag && i === 0 ? 'move' : '');
      const i2 = rig.atom(p2, color, 0.28, frag);
      rig.bond(bh1, i1, color, 0.07);
      rig.bond(bh2, i1, color, 0.07);
      rig.bond(i1, i2, color, 0.07);
    }
  }
  let gearRig = null, kellyRig = null, gyroRig = null, screwRig = null;
  function gearsPair() {
    if (gearRig) return gearRig;
    const rig = new Rig();
    addGear(rig, [-3.55, 0, 0], 'g1', COL.gear, true);
    addGear(rig, [3.55, 0, 0], 'g2', COL.gear2, false);
    rig.seal();
    gearRig = rig;
    return rig;
  }
  function kellyModel() {
    if (kellyRig) return kellyRig;
    const rig = new Rig();
    addGear(rig, [0, 0, 0], 'rotor', COL.gear, true);
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const a = -0.5 + i * 0.22;
      ids.push(rig.atom([Math.cos(a) * (4.6 + i * 0.15), Math.sin(a) * (4.6 + i * 0.15), (i - 2.5) * 0.35], COL.pawl, 0.3, 'pawl'));
    }
    rig.chain(ids, COL.pawl, 0.08);
    rig.seal();
    kellyRig = rig;
    return rig;
  }
  function gyroModel() {
    if (gyroRig) return gyroRig;
    const rig = new Rig();
    const axle = [];
    [-4.5, -3.0, 3.0, 4.5].forEach(function (z) {
      axle.push(rig.atom([0, 0, z], COL.stator, 0.28, 'axle'));
    });
    rig.bond(axle[0], axle[1], COL.stator, 0.08);
    rig.bond(axle[2], axle[3], COL.stator, 0.08);
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3;
      const n = rig.atom([Math.cos(a) * 1.45, Math.sin(a) * 1.45, 4.5], COL.stator, 0.3, 'axle');
      const s = rig.atom([Math.cos(a) * 1.45, Math.sin(a) * 1.45, -4.5], COL.stator, 0.3, 'axle');
      rig.bond(axle[3], n, COL.stator, 0.07);
      rig.bond(axle[0], s, COL.stator, 0.07);
    }
    const ring = rig.ring(6, [0, 0, 0], [0, 1, 0], [0, 0, 1], 1.40, COL.rotor, 0.3, 'ring');
    rig.bond(ring[0], nearestZ(rig, 1.4), COL.rotor, 0.08);
    rig.bond(ring[3], nearestZ(rig, -1.4), COL.rotor, 0.08);
    rig.atoms[ring[1]].tag = 'move';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      rig.atom([Math.cos(a) * 6.2, Math.sin(a) * 6.2, -2.4], COL.lattice, 0.34, 'lat');
      rig.atom([Math.cos(a) * 6.2, Math.sin(a) * 6.2, 2.4], COL.lattice, 0.34, 'lat');
    }
    rig.seal();
    gyroRig = rig;
    return rig;
  }
  function nearestZ(rig, z) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < rig.atoms.length; i++) {
      if (rig.atoms[i].frag !== 'axle') continue;
      const d = Math.abs(rig.atoms[i].p[2] - z) + Math.abs(rig.atoms[i].p[0]) + Math.abs(rig.atoms[i].p[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function screwModel() {
    if (screwRig) return screwRig;
    const rig = new Rig();
    const axle = [];
    for (let i = 0; i < 8; i++) axle.push(rig.atom([0, -3.5 + i * 1.45, 0], COL.axle, 0.26, 'screw'));
    rig.chain(axle, COL.axle, 0.08);
    for (let blade = 0; blade < 3; blade++) {
      let prev = null;
      for (let s = 0; s < 8; s++) {
        const y = -3.5 + s * 1.45;
        const a = blade * 2 * Math.PI / 3 + s * 0.55;
        const p = [Math.cos(a) * 1.55, y, Math.sin(a) * 1.55];
        const id = rig.atom(p, COL.rotor, 0.26, 'screw', blade === 0 && s === 4 ? 'move' : '');
        const ax = axle[s];
        rig.bond(ax, id, COL.rotor, 0.06);
        if (prev != null) rig.bond(prev, id, COL.rotor, 0.06);
        prev = id;
      }
    }
    rig.ring(16, [0, 0, 0], [0, 1, 0], [1, 0, 0], 3.3, COL.stator, 0.26, 'nut');
    rig.seal();
    screwRig = rig;
    return rig;
  }
  function gears(st) {
    if (st.part === 'kelly') {
      const rig = kellyModel();
      rig.pose({ rotor: [{ spin: [[0, 0, 0], [0, 0, 1], st.angle] }] });
      return rig;
    }
    if (st.part === 'gyro') {
      const rig = gyroModel();
      rig.pose({ ring: [{ spin: [[0, 0, 0], [0, 0, 1], st.angle] }] });
      return rig;
    }
    if (st.part === 'screw') {
      const rig = screwModel();
      const shift = Math.max(-1.2, Math.min(1.2, st.shift || 0));
      rig.pose({ screw: [{ spin: [[0, 0, 0], [0, 1, 0], st.angle] }, { trans: [0, shift, 0] }] });
      return rig;
    }
    const rig = gearsPair();
    rig.pose({
      g1: [{ spin: [[-3.55, 0, 0], [0, 0, 1], st.angle] }],
      g2: [{ spin: [[3.55, 0, 0], [0, 0, 1], -st.angle + Math.PI / 3] }]
    });
    return rig;
  }

  /* ---------- 7. Схемы биомашин ---------- */
  let atpRig = null, flagRig = null, kinRig = null;
  function atpModel() {
    if (atpRig) return atpRig;
    const rig = new Rig();
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * Math.PI / 3 - Math.PI / 2;
      const c = [Math.cos(a) * 3.6, Math.sin(a) * 3.6, 1.4];
      blob(rig, c, [COL.tight, COL.loose, COL.open][i], 'lobe', 1);
    }
    const gamma = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const bend = (1 - t) * 0.9;
      gamma.push(rig.atom([bend, 0, 2.2 - t * 4.6], COL.gamma, 0.34, 'rotor', i === 2 ? 'move' : ''));
    }
    rig.chain(gamma, COL.gamma, 0.1);
    const ring = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      ring.push(rig.atom([Math.cos(a) * 2.3, Math.sin(a) * 2.3, -3.3], '#fdba74', 0.36, 'rotor'));
    }
    rig.chain(ring, '#fdba74', 0.08);
    rig.bond(ring[0], ring[ring.length - 1], '#fdba74', 0.08);
    rig.bond(gamma[gamma.length - 1], ring[0], COL.gamma, 0.08);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      rig.atom([Math.cos(a) * 5.4, Math.sin(a) * 5.4, -3.1], COL.mem, 0.36, 'mem');
    }
    rig.seal();
    atpRig = rig;
    return rig;
  }
  function atp(st) {
    const rig = atpModel();
    const ang = (st.step + (st.u || 0)) * 2 * Math.PI / 3;
    rig.pose({ rotor: [{ spin: [[0, 0, 0], [0, 0, 1], ang] }] });
    return rig;
  }
  function flagModel() {
    if (flagRig) return flagRig;
    const rig = new Rig();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      rig.atom([Math.cos(a) * 8.4, 0, Math.sin(a) * 8.4], COL.mem, 0.3, 'mem');
      rig.atom([Math.cos(a) * 9.9, 1.4, Math.sin(a) * 9.9], '#a8a29e', 0.28, 'mem');
    }
    rig.ring(12, [0, -1.3, 0], [0, 1, 0], [1, 0, 0], 2.3, COL.stator, 0.26, 'bearing');
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * Math.PI * 2;
      blob(rig, [Math.cos(a) * 5.2, 0.4, Math.sin(a) * 5.2], COL.loose, 'stator', 0.85);
    }
    const fil = [];
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const a = t * 2.4 * Math.PI * 2;
      fil.push(rig.atom([1.25 * Math.cos(a), 1.3 + t * 8.5, 1.25 * Math.sin(a)], COL.rotor, 0.28, 'rotor', i === 6 ? 'move' : ''));
    }
    rig.chain(fil, COL.rotor, 0.08);
    const rod = rig.atom([0, 0.4, 0], COL.axle, 0.3, 'rotor');
    rig.bond(rod, fil[0], COL.rotor, 0.08);
    rig.seal();
    flagRig = rig;
    return rig;
  }
  function flag(st) {
    const rig = flagModel();
    rig.pose({ rotor: [{ spin: [[0, 0, 0], [0, 1, 0], st.phase] }] });
    return rig;
  }
  function kinModel() {
    if (kinRig) return kinRig;
    const rig = new Rig();
    const mt = [];
    for (let i = 0; i < 10; i++) mt.push(rig.atom([i * 2.2, 0, 0], i % 2 ? '#cbd5e1' : COL.mt, 0.55, 'mt'));
    rig.chain(mt, COL.mt, 0.1);
    kinRig = rig;
    kinRig._heads = true;
    return rig;
  }
  function kinesin(st) {
    const rig = new Rig();
    const mt = [];
    for (let i = 0; i < 12; i++) mt.push(rig.atom([i * 1.5, 0, 0], i % 2 ? '#cbd5e1' : COL.mt, 0.4, 'mt'));
    rig.chain(mt, COL.mt, 0.08);
    const heads = headCenters(st.n || 0, st.u || 0);
    const headIds = heads.map(function (c, h) {
      const ids = headBlob(rig, c, h === 0 ? COL.headA : COL.headB, 'h' + h);
      if (h === (st.n || 0) % 2) rig.atoms[ids[0]].tag = 'move';
      return ids[0];
    });
    const L = 1.42;
    const pts = fabrik(heads[0], heads[1], 4, L);
    let prev = headIds[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const id = rig.atom(pts[i], COL.stereo, 0.22, 'neck');
      rig.bond(prev, id, COL.stereo, 0.05);
      prev = id;
    }
    rig.bond(prev, headIds[1], COL.stereo, 0.05);
    rig.seal();
    return rig;
  }
  function headBlob(rig, center, color, frag) {
    const offs = [[0, 0, 0], [0, 1.5, 0], [0.7, 1.2, 0], [-0.7, 1.2, 0]];
    const ids = offs.map(function (o) { return rig.atom(G.add(center, o), color, 0.3, frag); });
    rig.bond(ids[0], ids[1], color, 0.06);
    rig.bond(ids[0], ids[2], color, 0.06);
    rig.bond(ids[0], ids[3], color, 0.06);
    rig.bond(ids[1], ids[2], color, 0.06);
    rig.bond(ids[1], ids[3], color, 0.06);
    return ids;
  }
  function findNear(rig, p) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < rig.atoms.length; i++) {
      const d = G.len(G.sub(rig.atoms[i].p, p));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function headCenters(n, u) {
    const swing = n % 2;
    const leadX = 3 + (n % 5) * 2.2;
    const trailX = leadX - 4.4;
    const stand = [leadX, 2.5, 0];
    const endX = leadX + 4.4;
    const ang = Math.PI * (1 - MM.smooth(u));
    const cx = (trailX + endX) / 2;
    const R = (endX - trailX) / 2;
    const moving = [cx + R * Math.cos(ang), 2.6 + Math.sin(ang) * R * 0.85, 0];
    return swing === 0 ? [moving, stand] : [stand, moving];
  }
  function fabrik(a, b, n, L) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t + Math.sin(Math.PI * t) * 1.8
      ]);
    }
    for (let iter = 0; iter < 16; iter++) {
      pts[n] = b.slice();
      for (let i = n - 1; i >= 1; i--) {
        const d = G.sub(pts[i], pts[i + 1]);
        const len = G.len(d) || 1;
        pts[i] = G.add(pts[i + 1], G.mul(d, L / len));
      }
      pts[0] = a.slice();
      for (let i = 1; i <= n; i++) {
        const d = G.sub(pts[i], pts[i - 1]);
        const len = G.len(d) || 1;
        pts[i] = G.add(pts[i - 1], G.mul(d, L / len));
      }
    }
    pts[0] = a.slice();
    pts[n] = b.slice();
    return pts;
  }

  function rest(name) {
    if (name === 'shuttle') return shuttleRig();
    if (name === 'catenane') return catenaneRig();
    if (name === 'muscle') return muscleModel();
    return null;
  }
  root.MM.builds = {
    feringa: feringa,
    nanocar: nanocar,
    shuttle: shuttle,
    catenane: catenane,
    muscle: muscle,
    elevator: elevator,
    pump: pump,
    gears: gears,
    atp: atp,
    flag: flag,
    kinesin: kinesin,
    rest: rest
  };
})(typeof window !== 'undefined' ? window : globalThis);
