/* 3D-сцена симметрии на 3Dmol.js: молекулы, ячейка, анимация операций. */
(function (root) {
  'use strict';
  const SYM = root.SYM;
  const Jmol = {
    H: '#f2f2f2', C: '#909090', N: '#3050f8', O: '#ff2010', F: '#90e050', S: '#ffff30',
    P: '#ff8000', CL: '#1ff01f', BR: '#a62929', B: '#ffb5b5', FE: '#e06633', XE: '#429eb0', CO: '#f090a0', I: '#940094'
  };
  function elColor(el) { return Jmol[String(el || '').toUpperCase()] || '#cccccc'; }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mulv(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
  function unit(a) { const n = norm(a) || 1; return mulv(a, 1 / n); }
  function apply(R, p) {
    return [
      R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
      R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
      R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]
    ];
  }
  function mulM(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return R;
  }
  function det3(R) {
    return R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  }
  function inv3(M) {
    const d = det3(M);
    const A = [
      [M[1][1] * M[2][2] - M[1][2] * M[2][1], M[0][2] * M[2][1] - M[0][1] * M[2][2], M[0][1] * M[1][2] - M[0][2] * M[1][1]],
      [M[1][2] * M[2][0] - M[1][0] * M[2][2], M[0][0] * M[2][2] - M[0][2] * M[2][0], M[0][2] * M[1][0] - M[0][0] * M[1][2]],
      [M[1][0] * M[2][1] - M[1][1] * M[2][0], M[0][1] * M[2][0] - M[0][0] * M[2][1], M[0][0] * M[1][1] - M[0][1] * M[1][0]]
    ];
    return A.map(row => row.map(v => v / d));
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
  function xyz(atoms) {
    let s = atoms.length + '\nsym\n';
    atoms.forEach(a => { s += a.el + ' ' + a.pos[0].toFixed(4) + ' ' + a.pos[1].toFixed(4) + ' ' + a.pos[2].toFixed(4) + '\n'; });
    return s;
  }
  function paintKekule(atoms) {
    if (!atoms || atoms.length < 3) return;
    const el = a => String(a.elem || '').toUpperCase();
    const d = (i, j) => Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z);
    const idOf = new Map();
    atoms.forEach((a, i) => { if (!a.bonds) a.bonds = []; if (!a.bondOrder) a.bondOrder = []; idOf.set(a.index != null ? a.index : i, i); });
    const nbrs = atoms.map(a => (a.bonds || []).map(b => idOf.has(b) ? idOf.get(b) : -1).filter(j => j >= 0));
    const cov = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, S: 1.05, CL: 1.02, BR: 1.2, FE: 1.32, I: 1.39 };
    const linked = nbrs.map(n => new Set(n));
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
      if (linked[i].has(j)) continue;
      const ei = el(atoms[i]), ej = el(atoms[j]);
      if (ei === 'H' && ej === 'H') continue;
      const lim = ((cov[ei] || 0.77) + (cov[ej] || 0.77)) * 1.25;
      const dist = d(i, j);
      if (dist > 0.4 && dist < Math.max(lim, 1.15)) {
        const ii = atoms[i].index != null ? atoms[i].index : i;
        const jj = atoms[j].index != null ? atoms[j].index : j;
        atoms[i].bonds.push(jj); atoms[i].bondOrder.push(1);
        atoms[j].bonds.push(ii); atoms[j].bondOrder.push(1);
        nbrs[i].push(j); nbrs[j].push(i);
        linked[i].add(j); linked[j].add(i);
      }
    }
    const setOrder = (i, j, order) => {
      const ii = atoms[i].index != null ? atoms[i].index : i;
      const jj = atoms[j].index != null ? atoms[j].index : j;
      let bi = atoms[i].bonds.indexOf(jj); if (bi < 0) bi = atoms[i].bonds.indexOf(j);
      let bj = atoms[j].bonds.indexOf(ii); if (bj < 0) bj = atoms[j].bonds.indexOf(i);
      if (bi >= 0) atoms[i].bondOrder[bi] = order;
      if (bj >= 0) atoms[j].bondOrder[bj] = order;
    };
    const hasDouble = atoms.map(() => false);
    atoms.forEach((a, i) => {
      const cs = nbrs[i].filter(j => el(atoms[j]) === 'C');
      if (cs.length === 1 && d(i, cs[0]) < 1.38 && i < cs[0]) { setOrder(i, cs[0], 2); hasDouble[i] = hasDouble[cs[0]] = true; return; }
      if (cs.length < 2) return;
      const ds = cs.map(j => d(i, j));
      const min = Math.min.apply(null, ds), max = Math.max.apply(null, ds);
      if (max - min < 0.045) return;
      const j = cs[ds.indexOf(min)];
      if (j > i) setOrder(i, j, 2);
      hasDouble[i] = true; hasDouble[j] = true;
    });
    const rings = [];
    const seen = new Set();
    for (let s = 0; s < atoms.length && rings.length < 40; s++) {
      if (el(atoms[s]) !== 'C' && el(atoms[s]) !== 'N') continue;
      const stack = [[s, [s]]];
      let guard = 0;
      while (stack.length && guard < 20000) {
        guard++;
        const cur = stack.pop();
        const v = cur[0], path = cur[1];
        if (path.length > 6) continue;
        nbrs[v].forEach(w => {
          if (el(atoms[w]) !== 'C' && el(atoms[w]) !== 'N') return;
          if (w === s && (path.length === 5 || path.length === 6)) {
            const key = path.slice().sort((a, b) => a - b).join(',');
            if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
          } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
        });
      }
    }
    const hexes = new Map();
    const ekey = (i, j) => (i < j ? i + ',' + j : j + ',' + i);
    rings.filter(r => r.length === 6).forEach(ring => {
      for (let k = 0; k < 6; k++) {
        const kk = ekey(ring[k], ring[(k + 1) % 6]);
        hexes.set(kk, (hexes.get(kk) || 0) + 1);
      }
    });
    hexes.forEach((c, kk) => {
      if (c < 2) return;
      const parts = kk.split(',').map(Number);
      setOrder(parts[0], parts[1], 2);
      hasDouble[parts[0]] = hasDouble[parts[1]] = true;
    });
    rings.filter(r => r.length === 6).forEach(ring => {
      if (ring.some(i => hasDouble[i])) return;
      let sum = 0;
      for (let k = 0; k < ring.length; k++) sum += d(ring[k], ring[(k + 1) % ring.length]);
      if (sum / ring.length > 1.5) return;
      [0, 2, 4].forEach(k => { setOrder(ring[k], ring[(k + 1) % 6], 2); hasDouble[ring[k]] = hasDouble[ring[(k + 1) % 6]] = true; });
    });
    rings.filter(r => r.length === 5).forEach(ring => {
      if (ring.filter(i => !hasDouble[i]).length < 4) return;
      let sum = 0;
      for (let k = 0; k < 5; k++) sum += d(ring[k], ring[(k + 1) % 5]);
      if (sum / 5 > 1.55 || sum / 5 < 1.2) return;
      setOrder(ring[0], ring[1], 2);
      setOrder(ring[2], ring[3], 2);
      hasDouble[ring[0]] = hasDouble[ring[1]] = hasDouble[ring[2]] = hasDouble[ring[3]] = true;
    });
  }
  function cellBasis(sys) {
    const d = x => x * Math.PI / 180;
    let a, b, c, al, be, ga;
    if (sys === 'cubic') { a = b = c = 8; al = be = ga = 90; }
    else if (sys === 'tetragonal') { a = b = 7.2; c = 10.4; al = be = ga = 90; }
    else if (sys === 'orthorhombic') { a = 7; b = 9; c = 11; al = be = ga = 90; }
    else if (sys === 'hexagonal' || sys === 'trigonal') { a = b = 8; c = 12; al = be = 90; ga = 120; }
    else if (sys === 'monoclinic') { a = 8; b = 10; c = 9; al = 90; be = 108; ga = 90; }
    else { a = 8; b = 9.2; c = 10; al = 82; be = 98; ga = 108; }
    al = d(al); be = d(be); ga = d(ga);
    const cg = Math.cos(ga), sg = Math.sin(ga);
    const v1 = [a, 0, 0];
    const v2 = [b * cg, b * sg, 0];
    const cx = c * Math.cos(be);
    const cy = c * (Math.cos(al) - Math.cos(be) * cg) / sg;
    const cz = Math.sqrt(Math.max(1e-8, c * c - cx * cx - cy * cy));
    return [v1, v2, [cx, cy, cz]];
  }
  function toCart(basis, f) {
    return [
      f[0] * basis[0][0] + f[1] * basis[1][0] + f[2] * basis[2][0],
      f[0] * basis[0][1] + f[1] * basis[1][1] + f[2] * basis[2][1],
      f[0] * basis[0][2] + f[1] * basis[1][2] + f[2] * basis[2][2]
    ];
  }
  function wrap1(x) { let v = x % 1; if (v < 0) v += 1; return v; }
  function applyFrac(R, t, f) {
    const p = apply(R, f);
    return [wrap1(p[0] + t[0]), wrap1(p[1] + t[1]), wrap1(p[2] + t[2])];
  }

  function Stage(el, opts) {
    this.el = el;
    this.opts = opts || {};
    this.viewer = root.$3Dmol.createViewer(el, (window.gl3dConfig || Object)({ backgroundColor: '#0e1526', antialias: true, disableFog: true }));
    this.base = [];
    this.atoms = [];
    this._raf = 0;
    this._model = null;
  }
  Stage.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };
  Stage.prototype.clear = function () {
    this.stop();
    this.viewer.clear();
    this._model = null;
    this.viewer.render();
  };
  Stage.prototype._style = function () {
    if (!this._model) return;
    this._model.setStyle({}, { stick: { radius: 0.12, colorscheme: 'Jmol', doubleBondScaling: 0.5 }, sphere: { scale: 0.28, colorscheme: 'Jmol' } });
  };
  Stage.prototype.setAtoms = function (atoms, opt) {
    this.stop();
    this.viewer.removeAllModels();
    this.viewer.removeAllShapes();
    this.viewer.removeAllLabels();
    this.base = atoms.map(a => a.pos.slice());
    this.meta = atoms.map(a => ({ el: a.el }));
    const model = this.viewer.addModel(xyz(atoms), 'xyz');
    this._model = model;
    paintKekule(model.atoms || model.selectedAtoms({}));
    this._style();
    this.atomObjs = model.selectedAtoms({});
    if (opt && opt.labels && atoms.length <= 18) this._labels(true);
    this.viewer.zoomTo();
    this.viewer.render();
  };
  Stage.prototype._labels = function (create) {
    if (!this.atomObjs) return;
    if (create) {
      this.viewer.removeAllLabels();
      this.lab = this.atomObjs.map((a, i) => this.viewer.addLabel(String(i + 1), {
        position: { x: a.x, y: a.y, z: a.z }, backgroundColor: elColor(this.meta[i].el), backgroundOpacity: 0.8,
        fontColor: '#111', fontSize: 12, borderThickness: 0, inFront: true
      }));
    } else if (this.lab) {
      this.atomObjs.forEach((a, i) => { if (this.lab[i]) this.lab[i].setPosition({ x: a.x, y: a.y, z: a.z }); });
    }
  };
  Stage.prototype.setPositions = function (pos) {
    if (!this.atomObjs) return;
    for (let i = 0; i < pos.length && i < this.atomObjs.length; i++) {
      this.atomObjs[i].x = pos[i][0];
      this.atomObjs[i].y = pos[i][1];
      this.atomObjs[i].z = pos[i][2];
    }
    if (this.lab) {
      this.atomObjs.forEach((a, i) => {
        const lab = this.lab[i];
        if (!lab) return;
        if (lab.stylespec) lab.stylespec.position = { x: a.x, y: a.y, z: a.z };
        if (lab.sprite && lab.sprite.position) lab.sprite.position.set(a.x, a.y, a.z);
      });
    }
    try { this.viewer.render(); } catch (e) { /* кадр анимации */ }
  };
  Stage.prototype.play = function (stepper, ms, done) {
    this.stop();
    const t0 = (root.performance || performance).now();
    const dur = ms || 1100;
    const loop = (now) => {
      let u = 1;
      try {
        u = Math.min(1, (now - t0) / dur);
        if (!isFinite(u)) u = 1;
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        this.setPositions(stepper(e));
      } catch (err) { u = 1; }
      if (u < 1) this._raf = requestAnimationFrame(loop);
      else { this._raf = 0; if (done) done(); }
    };
    this._raf = requestAnimationFrame(loop);
  };
  Stage.prototype.restore = function () { this.setPositions(this.base); };

  function axisColor(n, kind) {
    if (kind === 'saxis' || kind === 'screw') return '#f59e0b';
    if (n >= 6) return '#22d3ee';
    if (n === 5) return '#a78bfa';
    if (n === 4) return '#34d399';
    if (n === 3) return '#fb923c';
    return '#f87171';
  }
  Stage.prototype.drawAxis = function (axis, origin, opt) {
    const u = unit(axis), o = origin || [0, 0, 0], L = (opt && opt.len) || 3.2;
    const a = add(o, mulv(u, -L)), b = add(o, mulv(u, L));
    const col = (opt && opt.color) || axisColor(opt && opt.n, opt && opt.kind);
    this.viewer.addCylinder({ start: { x: a[0], y: a[1], z: a[2] }, end: { x: b[0], y: b[1], z: b[2] }, radius: (opt && opt.radius) || 0.06, color: col, opacity: 0.95, fromCap: 1, toCap: 1 });
    if (opt && opt.arrow !== false) {
      const tip = add(o, mulv(u, L * 0.72));
      const tip2 = add(tip, mulv(u, 0.45));
      this.viewer.addArrow({ start: { x: tip[0], y: tip[1], z: tip[2] }, end: { x: tip2[0], y: tip2[1], z: tip2[2] }, radius: 0.09, color: col, mid: 1 });
    }
  };
  Stage.prototype.drawPlane = function (normal, origin, opt) {
    const n = unit(normal), o = origin || [0, 0, 0];
    const col = (opt && opt.color) || '0x38bdf8';
    const h = 0.02;
    this.viewer.addCylinder({
      start: { x: o[0] - n[0] * h, y: o[1] - n[1] * h, z: o[2] - n[2] * h },
      end: { x: o[0] + n[0] * h, y: o[1] + n[1] * h, z: o[2] + n[2] * h },
      radius: (opt && opt.radius) || 2.4, color: col, opacity: 0.28, fromCap: 1, toCap: 1
    });
  };
  Stage.prototype.drawPoint = function (origin, opt) {
    const o = origin || [0, 0, 0];
    this.viewer.addSphere({ center: { x: o[0], y: o[1], z: o[2] }, radius: (opt && opt.radius) || 0.18, color: (opt && opt.color) || '#facc15', opacity: 0.95 });
  };
  Stage.prototype.showLoci = function (pack, opt) {
    const lim = (opt && opt.limit) || 24;
    (pack.axes || []).slice(0, lim).forEach(ax => this.drawAxis(ax.axis, [0, 0, 0], { n: ax.n, kind: ax.kind, len: 2.8 }));
    (pack.planes || []).slice(0, 12).forEach(p => this.drawPlane(p.normal, [0, 0, 0], { radius: 2.15 }));
    if (pack.inv) this.drawPoint(pack.inv.origin);
    this.viewer.render();
  };

  function reflectPoint(p, normal, origin) {
    const n = unit(normal), o = origin || [0, 0, 0];
    const v = sub(p, o);
    return add(o, sub(v, mulv(n, 2 * dot(v, n))));
  }

  function stepperFor(op, base) {
    const kind = op.kind || op.sig && op.sig.kind;
    const axis = unit((op.axis || (op.sig && op.sig.axis) || [0, 0, 1]));
    const normal = unit((op.normal || (op.sig && op.sig.normal) || axis));
    if (kind === 'E' || kind === 'id') return () => base.map(p => p.slice());
    if (kind === 'C' || kind === 'rot') {
      const n = (op.sig && op.sig.n) || op.order || 2;
      const ang = (op.power ? op.power : 1) * (Math.PI * 2 / n);
      const use = op.angle != null ? op.angle : ang;
      return t => base.map(p => apply(rotAxis(axis, use * t), p));
    }
    if (kind === 'm' || kind === 'mirror' || kind === 'sigma') {
      const tgt = base.map(p => reflectPoint(p, normal, [0, 0, 0]));
      return t => base.map((p, i) => lerp(p, tgt[i], t));
    }
    if (kind === 'i' || kind === 'inv') {
      const tgt = base.map(p => mulv(p, -1));
      return t => base.map((p, i) => lerp(p, tgt[i], t));
    }
    if (kind === 'S' || kind === 'sn') {
      const n = (op.sig && op.sig.n) || 4;
      const ang = Math.PI * 2 / n;
      return t => {
        if (t < 0.5) return base.map(p => apply(rotAxis(axis, ang * (t * 2)), p));
        const mid = base.map(p => apply(rotAxis(axis, ang), p));
        const end = mid.map(p => reflectPoint(p, axis, [0, 0, 0]));
        return mid.map((p, i) => lerp(p, end[i], (t - 0.5) * 2));
      };
    }
    return t => base.map(p => p.slice());
  }

  Stage.prototype.animateOp = function (op, ms, done) {
    const step = stepperFor(op, this.base);
    this.play(step, ms || 1200, () => { this.restore(); if (done) done(); });
  };

  function cartFrame(basis) {
    const B = [basis[0], basis[1], basis[2]];
    const M = [
      [B[0][0], B[1][0], B[2][0]],
      [B[0][1], B[1][1], B[2][1]],
      [B[0][2], B[1][2], B[2][2]]
    ];
    return { M, Minv: inv3(M), basis };
  }
  function cartOfOp(desc, frame) {
    const R = desc.op[0].map(row => row.map(v => v / 24));
    const t = desc.op[1].map(v => v / 24);
    const Rc = mulM(frame.M, mulM(R, frame.Minv));
    const tc = toCart(frame.basis, t);
    const tr = Rc[0][0] + Rc[1][1] + Rc[2][2];
    const proper = det3(Rc) > 0;
    let ang = 0, axis = [0, 0, 1];
    if (proper && Math.abs(tr - 3) > 1e-3) {
      ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
      axis = unit([Rc[2][1] - Rc[1][2], Rc[0][2] - Rc[2][0], Rc[1][0] - Rc[0][1]]);
    } else if (!proper && Math.abs(tr - 1) < 0.2) {
      const Rp = Rc.map(row => row.map(v => -v));
      axis = unit([Rp[2][1] - Rp[1][2], Rp[0][2] - Rp[2][0], Rp[1][0] - Rp[0][1]]);
    }
    return { R, t, Rc, tc, ang, axis, proper, kind: desc.kind, label: desc.label };
  }

  function cellCorners(basis) {
    const c = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) c.push(toCart(basis, [i, j, k]));
    return c;
  }
  Stage.prototype.drawCell = function (basis) {
    const corners = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) corners.push(toCart(basis, [i, j, k]));
    const idx = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
    // corner order: i + 2j + 4k
    idx.forEach(([a, b]) => {
      this.viewer.addCylinder({
        start: { x: corners[a][0], y: corners[a][1], z: corners[a][2] },
        end: { x: corners[b][0], y: corners[b][1], z: corners[b][2] },
        radius: 0.035, color: '#94a3b8', opacity: 0.85
      });
    });
  };

  function motifOf(group) {
    const pack = SYM.hall.groupOps(group.hall);
    const seeds = [[0.12, 0.17, 0.08], [0.18, 0.22, 0.14]];
    let chosen = seeds[0];
    for (const s of [[0.13, 0.21, 0.07], [0.11, 0.17, 0.23], [0.19, 0.08, 0.27], [0.07, 0.29, 0.13]]) {
      const seen = new Set();
      let ok = true;
      pack.ops.forEach(op => {
        const R = op[0].map(row => row.map(v => v / 24));
        const t = op[1].map(v => v / 24);
        const p = applyFrac(R, t, s);
        const key = p.map(v => v.toFixed(3)).join(',');
        if (seen.has(key)) ok = false;
        seen.add(key);
      });
      if (ok && seen.size === pack.ops.length) { chosen = s; break; }
    }
    return { seed: chosen, pack };
  }

  Stage.prototype.showSpaceGroup = function (group, opt) {
    this.stop();
    this.viewer.removeAllModels();
    this.viewer.removeAllShapes();
    this.viewer.removeAllLabels();
    const basis = cellBasis(group.sys);
    this.frame = cartFrame(basis);
    this.basis = basis;
    this.drawCell(basis);
    const mot = motifOf(group);
    this.sg = { group, mot };
    const atoms = [];
    const asym = [];
    mot.pack.ops.forEach((op, i) => {
      const R = op[0].map(row => row.map(v => v / 24));
      const t = op[1].map(v => v / 24);
      const f = applyFrac(R, t, mot.seed);
      const p = toCart(basis, f);
      const el = i === 0 ? 'O' : 'C';
      atoms.push({ el, pos: p, frac: f, i });
      if (i === 0) asym.push(p);
    });
    // вторая точка мотива — только асимметричная единица и её образы, если операций не слишком много
    if (mot.pack.ops.length <= 96) {
      const seed2 = [mot.seed[0] + 0.06, mot.seed[1] + 0.02, mot.seed[2] + 0.05];
      mot.pack.ops.forEach((op, i) => {
        const R = op[0].map(row => row.map(v => v / 24));
        const t = op[1].map(v => v / 24);
        atoms.push({ el: 'H', pos: toCart(basis, applyFrac(R, t, seed2)) });
      });
    }
    this.base = atoms.map(a => a.pos.slice());
    this.meta = atoms.map(a => ({ el: a.el }));
    const model = this.viewer.addModel(xyz(atoms), 'xyz');
    this._model = model;
    model.setStyle({}, { sphere: { scale: 0.22, colorscheme: 'Jmol' }, stick: { radius: 0.05, colorscheme: 'Jmol' } });
    this.atomObjs = model.selectedAtoms({});
    this.viewer.zoomTo();
    this.viewer.render();
    return { n: mot.pack.ops.length, seed: mot.seed };
  };

  Stage.prototype.animateSpaceOp = function (desc, ms, done) {
    if (!this.frame || !this.sg) return;
    const info = cartOfOp(desc, this.frame);
    const base = this.base.map(p => p.slice());
    const kind = desc.kind;
    let step;
    if (kind === 'id' || kind === 'cen') {
      const shift = toCart(this.basis, desc.op[1].map(v => v / 24));
      step = t => base.map(p => add(p, mulv(shift, t)));
    } else if (kind === 'rot' || kind === 'screw') {
      const ang = info.ang || Math.PI;
      const axis = info.axis;
      const screw = kind === 'screw' ? (desc.screw || 0) : 0;
      const along = toCart(this.basis, mulv(unit(desc.axis || [0, 0, 1]), screw));
      step = t => base.map(p => add(apply(rotAxis(axis, ang * t), p), mulv(along, t)));
    } else if (kind === 'mirror' || kind === 'glide') {
      const n = info.axis;
      const tgt = base.map(p => reflectPoint(p, n, mulv(info.tc, 0.5)));
      const glide = desc.glide ? toCart(this.basis, desc.glide) : [0, 0, 0];
      step = t => {
        if (kind === 'glide' && t > 0.55) {
          const mid = base.map((p, i) => lerp(p, tgt[i], 1));
          return mid.map(p => add(p, mulv(glide, (t - 0.55) / 0.45)));
        }
        const u = kind === 'glide' ? t / 0.55 : t;
        return base.map((p, i) => lerp(p, tgt[i], Math.min(1, u)));
      };
    } else if (kind === 'inv') {
      const c = toCart(this.basis, (desc.origin || [0, 0, 0]).map(v => ((v % 1) + 1) % 1));
      step = t => base.map(p => lerp(p, add(c, sub(c, p)), t));
    } else if (kind === 'sn') {
      const ang = info.ang || Math.PI / 2;
      step = t => {
        if (t < 0.5) return base.map(p => apply(rotAxis(info.axis, ang * t * 2), p));
        const mid = base.map(p => apply(rotAxis(info.axis, ang), p));
        const end = mid.map(p => reflectPoint(p, info.axis, [0, 0, 0]));
        return mid.map((p, i) => lerp(p, end[i], (t - 0.5) * 2));
      };
    } else step = () => base;
    this.play(step, ms || 1400, () => { this.setPositions(base); if (done) done(); });
  };

  Stage.prototype.showSpaceElements = function (descs, opt) {
    if (!this.frame) return;
    const limit = (opt && opt.limit) || 16;
    const shown = { rot: 0, screw: 0, mirror: 0, glide: 0, inv: 0, sn: 0 };
    descs.forEach(d => {
      if (d.kind === 'id' || d.kind === 'cen') return;
      if ((shown[d.kind] || 0) >= (d.kind === 'inv' ? 4 : 4)) return;
      if ((shown.rot || 0) + (shown.screw || 0) + (shown.mirror || 0) + (shown.glide || 0) > limit) return;
      shown[d.kind] = (shown[d.kind] || 0) + 1;
      const info = cartOfOp(d, this.frame);
      if (d.kind === 'rot' || d.kind === 'screw' || d.kind === 'sn') {
        this.drawAxis(info.axis, mulv(info.tc, 0), { n: d.order, kind: d.kind === 'rot' ? 'axis' : 'screw', len: 4.2, color: d.kind === 'screw' ? '#fbbf24' : undefined });
      } else if (d.kind === 'mirror' || d.kind === 'glide') {
        this.drawPlane(info.axis, toCart(this.basis, [0.5, 0.5, 0.5]), { radius: 3.2, color: d.kind === 'glide' ? '0xfbbf24' : '0x38bdf8' });
      } else if (d.kind === 'inv') {
        this.drawPoint(toCart(this.basis, (d.origin || [0, 0, 0])), { radius: 0.16 });
      }
    });
    this.viewer.render();
  };

  root.SYM.Stage = Stage;
  root.SYM.viewHelpers = { cellBasis, toCart, elColor, reflectPoint, stepperFor };
})(typeof window !== 'undefined' ? window : globalThis);
