/* Сосуд: куб со стороной L, молекулы в масштабе, скорости Максвелла.
   Это срез-проекция настоящего 3D-ящика, число частиц N = NA·L³/Vm. */
(function (root, factory) {
  const api = factory();
  if (root) root.EOSVessel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EL = {
    H: { r: 1.20, color: '#e8eef6' },
    He: { r: 1.40, color: '#7dd3fc' },
    C: { r: 1.70, color: '#64748b' },
    N: { r: 1.55, color: '#3b82f6' },
    O: { r: 1.52, color: '#ef4444' },
    Ne: { r: 1.54, color: '#22d3ee' },
    S: { r: 1.80, color: '#eab308' },
    Cl: { r: 1.75, color: '#22c55e' },
    Ar: { r: 1.88, color: '#a78bfa' },
    Kr: { r: 2.02, color: '#c084fc' },
    Xe: { r: 2.16, color: '#818cf8' }
  };
  const MASS = { H: 1.008, He: 4.003, C: 12.011, N: 14.007, O: 15.999, Ne: 20.18, S: 32.06, Cl: 35.45, Ar: 39.95, Kr: 83.8, Xe: 131.3 };

  function com(atoms) {
    let m = 0, x = 0, y = 0, z = 0;
    atoms.forEach(function (a) {
      const mass = MASS[a.el] || 12;
      m += mass; x += mass * a.x; y += mass * a.y; z += mass * a.z;
    });
    const out = atoms.map(function (a) {
      return {
        el: a.el,
        x: a.x - x / m,
        y: a.y - y / m,
        z: a.z - z / m,
        r: (EL[a.el] || EL.C).r,
        color: (EL[a.el] || EL.C).color
      };
    });
    const bonds = [];
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const d = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y, out[i].z - out[j].z);
        const h = out[i].el === 'H' || out[j].el === 'H';
        if (d > 0.4 && d < (h ? 1.35 : 2.15)) bonds.push([i, j]);
      }
    }
    let ext = 0;
    out.forEach(function (a) { ext = Math.max(ext, Math.hypot(a.x, a.y, a.z) + a.r); });
    return { atoms: out, bonds: bonds, extentA: ext };
  }

  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }
  function norm(a) {
    const L = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / L, y: a.y / L, z: a.z / L };
  }
  function basis(w) {
    const tmp = Math.abs(w.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const u = norm(cross(tmp, w));
    const v = cross(w, u);
    return { u: u, v: v, w: w };
  }
  function terminalH(origin, towardNeighbor, bond, phi0) {
    const polar = Math.acos(-1 / 3);
    const B = basis(towardNeighbor);
    const hs = [];
    const ct = Math.cos(polar), st = Math.sin(polar);
    for (let i = 0; i < 3; i++) {
      const phi = phi0 + i * 2 * Math.PI / 3;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      hs.push({
        el: 'H',
        x: origin.x + bond * (B.w.x * ct + B.u.x * st * cp + B.v.x * st * sp),
        y: origin.y + bond * (B.w.y * ct + B.u.y * st * cp + B.v.y * st * sp),
        z: origin.z + bond * (B.w.z * ct + B.u.z * st * cp + B.v.z * st * sp)
      });
    }
    return hs;
  }
  function methyleneH(origin, d1, d2, bond) {
    const s = norm({ x: d1.x + d2.x, y: d1.y + d2.y, z: d1.z + d2.z });
    const p = norm(cross(d1, d2));
    const c = 1 / Math.sqrt(3), sa = Math.sqrt(2 / 3);
    return [-1, 1].map(function (sign) {
      return {
        el: 'H',
        x: origin.x + bond * (-s.x * c + p.x * sa * sign),
        y: origin.y + bond * (-s.y * c + p.y * sa * sign),
        z: origin.z + bond * (-s.z * c + p.z * sa * sign)
      };
    });
  }
  function alkane(n) {
    const CC = 1.53, CH = 1.094, ang = 112 * Math.PI / 180;
    const carbons = [{ x: 0, y: 0, z: 0 }];
    let dir = { x: 1, y: 0, z: 0 };
    for (let i = 1; i < n; i++) {
      const prev = carbons[i - 1];
      carbons.push({ x: prev.x + CC * dir.x, y: prev.y + CC * dir.y, z: prev.z + CC * dir.z });
      const turn = (i % 2 ? 1 : -1) * (Math.PI - ang);
      const c = Math.cos(turn), s = Math.sin(turn);
      dir = { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c, z: 0 };
    }
    const atoms = carbons.map(function (p) { return { el: 'C', x: p.x, y: p.y, z: p.z }; });
    function nbr(i) {
      const dirs = [];
      if (i > 0) dirs.push(norm({ x: carbons[i - 1].x - carbons[i].x, y: carbons[i - 1].y - carbons[i].y, z: 0 }));
      if (i < n - 1) dirs.push(norm({ x: carbons[i + 1].x - carbons[i].x, y: carbons[i + 1].y - carbons[i].y, z: 0 }));
      return dirs;
    }
    for (let i = 0; i < n; i++) {
      const d = nbr(i);
      if (d.length === 1) atoms.push.apply(atoms, terminalH(carbons[i], d[0], CH, i * 0.4));
      else atoms.push.apply(atoms, methyleneH(carbons[i], d[0], d[1], CH));
    }
    return com(atoms);
  }

  function buildShapes() {
    const polar = Math.acos(-1 / 3);
    const eth = (function () {
      const L = 1.535, b = 1.094;
      const atoms = [{ el: 'C', x: 0, y: 0, z: 0 }, { el: 'C', x: L, y: 0, z: 0 }];
      for (let i = 0; i < 3; i++) {
        const phi = i * 2 * Math.PI / 3;
        const phi2 = phi + Math.PI / 3;
        atoms.push({ el: 'H', x: b * Math.cos(polar), y: b * Math.sin(polar) * Math.cos(phi), z: b * Math.sin(polar) * Math.sin(phi) });
        atoms.push({ el: 'H', x: L - b * Math.cos(polar), y: b * Math.sin(polar) * Math.cos(phi2), z: b * Math.sin(polar) * Math.sin(phi2) });
      }
      return com(atoms);
    })();
    const meth = (function () {
      const s = 1.087 / Math.sqrt(3);
      const h = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      return com([{ el: 'C', x: 0, y: 0, z: 0 }].concat(h.map(function (p) { return { el: 'H', x: p[0] * s, y: p[1] * s, z: p[2] * s }; })));
    })();
    const nh3 = (function () {
      const bond = 1.012, alpha = 106.7 * Math.PI / 180;
      const cos2 = (Math.cos(alpha) + 0.5) / 1.5;
      const beta = Math.acos(Math.min(1, Math.sqrt(Math.max(0, cos2))));
      const atoms = [{ el: 'N', x: 0, y: 0, z: 0 }];
      for (let i = 0; i < 3; i++) {
        const phi = i * 2 * Math.PI / 3;
        atoms.push({
          el: 'H',
          x: bond * Math.sin(beta) * Math.cos(phi),
          y: bond * Math.sin(beta) * Math.sin(phi),
          z: bond * Math.cos(beta)
        });
      }
      return com(atoms);
    })();
    function bent(center, outer, bond, angleDeg) {
      const a = angleDeg * Math.PI / 180;
      return com([
        { el: center, x: 0, y: 0, z: 0 },
        { el: outer, x: bond, y: 0, z: 0 },
        { el: outer, x: bond * Math.cos(a), y: bond * Math.sin(a), z: 0 }
      ]);
    }
    function sphere(el) { return com([{ el: el, x: 0, y: 0, z: 0 }]); }
    function lin2(a, b, bond) {
      return com([{ el: a, x: -bond / 2, y: 0, z: 0 }, { el: b, x: bond / 2, y: 0, z: 0 }]);
    }
    return {
      he: sphere('He'), ne: sphere('Ne'), ar: sphere('Ar'), kr: sphere('Kr'), xe: sphere('Xe'),
      h2: lin2('H', 'H', 0.741),
      n2: lin2('N', 'N', 1.098),
      o2: lin2('O', 'O', 1.207),
      co: lin2('C', 'O', 1.128),
      cl2: lin2('Cl', 'Cl', 1.988),
      co2: com([{ el: 'O', x: -1.162, y: 0, z: 0 }, { el: 'C', x: 0, y: 0, z: 0 }, { el: 'O', x: 1.162, y: 0, z: 0 }]),
      h2o: bent('O', 'H', 0.958, 104.5),
      so2: bent('S', 'O', 1.431, 119.3),
      nh3: nh3,
      ch4: meth,
      c2h6: eth,
      c3h8: alkane(3),
      c4h10: alkane(4)
    };
  }

  const SHAPES = buildShapes();

  function rotate(p, ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const y1 = p.y * cx - p.z * sx;
    const z1 = p.y * sx + p.z * cx;
    const cy = Math.cos(ay), sy = Math.sin(ay);
    return { x: p.x * cy + z1 * sy, y: y1, z: -p.x * sy + z1 * cy, r: p.r, color: p.color, el: p.el };
  }

  function Vessel(canvas, hist) {
    this.canvas = canvas;
    this.hist = hist;
    this.molecules = [];
    this.running = true;
    this.samples = [];
    this._raf = 0;
    this._last = 0;
    this.s = null;
    const self = this;
    this._loop = function (t) { self.frame(t); };
  }

  Vessel.prototype.start = function () {
    if (this._raf) return;
    this._last = 0;
    this._raf = requestAnimationFrame(this._loop);
  };
  Vessel.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  Vessel.prototype.setState = function (s) {
    const prev = this.s;
    this.s = s;
    const rebuild = !prev || prev.gasId !== s.gasId || prev.N !== s.N || prev.kind !== s.kind || Math.abs(prev.L - s.L) / s.L > 0.03 || (s.kind === 'two' && Math.abs((prev.phiL || 0) - s.phiL) > 0.04);
    if (rebuild) this.rebuild();
    else if (prev && prev.T !== s.T) this.rescale(prev.T, s.T);
    if (rebuild || !prev || prev.T !== s.T) this.seedHist();
    this.draw();
    this.drawHist();
  };

  Vessel.prototype.seedHist = function () {
    const s = this.s;
    this.samples = [];
    for (let i = 0; i < 420; i++) this.samples.push(s.sample().speed);
  };

  Vessel.prototype.rescale = function (t0, t1) {
    const k = Math.sqrt(t1 / t0);
    this.molecules.forEach(function (m) {
      m.vx *= k; m.vy *= k; m.vz *= k;
      m.omega *= k;
    });
    this.samples = this.samples.map(function (v) { return v * k; });
  };

  Vessel.prototype.rebuild = function () {
    const s = this.s;
    const list = [];
    const N = s.N;
    const L = s.L;
    const two = s.kind === 'two' && s.phiL > 0.02 && s.phiL < 0.98;
    const Nl = two ? Math.max(0, Math.min(N, Math.round(N * s.xL))) : (s.kind === 'liquid' ? N : 0);
    const regions = two ? [
      { n: Nl, y0: 0, y1: Math.max(1e-12, s.phiL * L), region: 'liquid' },
      { n: N - Nl, y0: Math.min(L - 1e-12, s.phiL * L), y1: L, region: 'gas' }
    ] : [{ n: N, y0: 0, y1: L, region: s.kind || 'gas' }];
    const shape = SHAPES[s.shape] || SHAPES.ar;
    const self = this;
    regions.forEach(function (reg) {
      if (reg.n <= 0 || !(reg.y1 > reg.y0)) return;
      const pos = lattice(reg.n, L, reg.y0, reg.y1);
      for (let i = 0; i < reg.n; i++) {
        const smp = s.sample();
        const vScale = (L / 2.4) / Math.max(s.vrms, 1);
        list.push({
          x: pos[i].x, y: pos[i].y, z: pos[i].z,
          vx: smp.vx * vScale, vy: smp.vy * vScale, vz: smp.vz * vScale,
          ax: Math.random() * 6.28, ay: Math.random() * 6.28,
          omega: (0.6 + Math.random()) * Math.sqrt(s.T / 300) * (Math.random() < 0.5 ? -1 : 1),
          region: reg.region,
          y0: reg.y0, y1: reg.y1,
          shape: shape,
          m: s.M
        });
      }
    });
    this.molecules = list;
    this.shape = shape;
  };

  function lattice(n, L, y0, y1) {
    const ny = Math.max(1, Math.round(Math.cbrt(n) * Math.max(0.4, (y1 - y0) / L) * 1.4));
    const nx = Math.max(1, Math.ceil(Math.sqrt(n / ny)));
    const nz = Math.max(1, Math.ceil(n / (nx * ny)));
    const pos = [];
    for (let iy = 0; iy < ny && pos.length < n; iy++) {
      for (let ix = 0; ix < nx && pos.length < n; ix++) {
        for (let iz = 0; iz < nz && pos.length < n; iz++) {
          const jx = (ix + (iy % 2) * 0.5) / nx;
          pos.push({
            x: ((jx % 1) + 0.5 / nx) * L,
            y: y0 + ((iy + 0.5) / ny) * (y1 - y0),
            z: ((iz + 0.5) / nz) * L
          });
        }
      }
    }
    while (pos.length < n) pos.push({ x: Math.random() * L, y: y0 + Math.random() * (y1 - y0), z: Math.random() * L });
    return pos;
  }

  Vessel.prototype.step = function (dt) {
    const s = this.s;
    const mol = this.molecules;
    const sub = 4;
    const h = dt / sub;
    const minDist = Math.max(s.sigma, 1e-11);
    const attract = s.d < s.sigma * 3.2;
    const vCap = (s.L / 2.4) * 3.2;
    for (let step = 0; step < sub; step++) {
      for (let i = 0; i < mol.length; i++) {
        const a = mol[i];
        a.x += a.vx * h; a.y += a.vy * h; a.z += a.vz * h;
        a.ax += a.omega * h;
      }
      for (let i = 0; i < mol.length; i++) {
        for (let j = i + 1; j < mol.length; j++) {
          if (mol[i].region !== mol[j].region) continue;
          collide(mol[i], mol[j], minDist, attract, s, h);
        }
      }
      for (let i = 0; i < mol.length; i++) bounds(mol[i], s.L, minDist * 0.45, vCap);
    }
    if (this.samples.length) {
      for (let k = 0; k < 8; k++) {
        const i = (Math.random() * this.samples.length) | 0;
        this.samples[i] = s.sample().speed;
      }
    }
  };

  function collide(a, b, minDist, attract, s, h) {
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let r = Math.hypot(dx, dy, dz);
    if (r < 1e-15) { dx = 1e-15; r = 1e-15; }
    const reach = minDist * 1.65;
    if (r > reach) return;
    const nx = dx / r, ny = dy / r, nz = dz / r;
    if (r < minDist) {
      const overlap = minDist - r;
      const tm = a.m + b.m;
      a.x -= nx * overlap * (b.m / tm);
      a.y -= ny * overlap * (b.m / tm);
      a.z -= nz * overlap * (b.m / tm);
      b.x += nx * overlap * (a.m / tm);
      b.y += ny * overlap * (a.m / tm);
      b.z += nz * overlap * (a.m / tm);
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
      if (rel > 0) {
        const J = 2 * rel / (1 / a.m + 1 / b.m);
        a.vx -= J * nx / a.m; a.vy -= J * ny / a.m; a.vz -= J * nz / a.m;
        b.vx += J * nx / b.m; b.vy += J * ny / b.m; b.vz += J * nz / b.m;
      }
    } else if (attract) {
      const depth = (reach - r) / (reach - minDist);
      const epsT = Math.min(1.6, (s.eps || 100) / Math.max(30, s.T));
      const dv = depth * epsT * (s.L / 2.4) * 1.4 * h;
      a.vx += nx * dv; a.vy += ny * dv; a.vz += nz * dv;
      b.vx -= nx * dv; b.vy -= ny * dv; b.vz -= nz * dv;
    }
  }

  function bounds(m, L, rad, vCap) {
    const sp = Math.hypot(m.vx, m.vy, m.vz);
    if (sp > vCap) { const k = vCap / sp; m.vx *= k; m.vy *= k; m.vz *= k; }
    if (m.x < rad) { m.x = rad; if (m.vx < 0) m.vx *= -1; }
    if (m.x > L - rad) { m.x = L - rad; if (m.vx > 0) m.vx *= -1; }
    if (m.z < rad) { m.z = rad; if (m.vz < 0) m.vz *= -1; }
    if (m.z > L - rad) { m.z = L - rad; if (m.vz > 0) m.vz *= -1; }
    if (m.y < m.y0) { m.y = m.y0; if (m.vy < 0) m.vy *= -1; }
    if (m.y > m.y1) { m.y = m.y1; if (m.vy > 0) m.vy *= -1; }
  }

  Vessel.prototype.frame = function (t) {
    try {
      if (!this._last) this._last = t;
      let dt = (t - this._last) / 1000;
      this._last = t;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;
      if (this.running && this.s && dt > 0) this.step(dt);
      this.draw();
      if (this.running) this.drawHist();
    } catch (e) { /* кадр не должен обрывать цикл */ }
    this._raf = requestAnimationFrame(this._loop);
  };

  Vessel.prototype.project = function (x, y, z, L) {
    const X = (x - L / 2) + (z - L / 2) * 0.55;
    const Y = (y - L / 2) * 0.92 - (z - L / 2) * 0.34;
    return [X, Y, z + y * 0.15];
  };

  Vessel.prototype.mapper = function (w, h) {
    const L = this.s.L;
    const self = this;
    const corners = [];
    for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
      corners.push(self.project(ix * L, iy * L, iz * L, L));
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    corners.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 18;
    const s = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2 - 18) / (maxY - minY || 1));
    const ox = pad + ((w - pad * 2) - (maxX - minX) * s) / 2;
    const oy = h - pad - 8;
    return function (x, y, z) {
      const p = self.project(x, y, z, L);
      return [ox + (p[0] - minX) * s, oy - (p[1] - minY) * s, p[2], s];
    };
  };

  Vessel.prototype.draw = function () {
    const canvas = this.canvas;
    const s = this.s;
    if (!s) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const box = window.PVMotion ? PVMotion.cssBox(canvas, 320, 280) : { w: canvas.clientWidth || 320, h: 280 };
    const w = box.w;
    const h = Math.max(240, Math.min(460, Math.round(w * 0.78)));
    if (canvas._cssH !== h) { canvas._cssH = h; canvas.style.height = h + 'px'; }
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = document.documentElement.dataset.theme === 'dark';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = dark ? '#101826' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    const map = this.mapper(w, h);
    const L = s.L;
    function edge(a, b, col, width) {
      const A = map(a[0], a[1], a[2]);
      const B = map(b[0], b[1], b[2]);
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.lineWidth = width;
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(B[0], B[1]);
      ctx.stroke();
    }
    const edgeCol = dark ? 'rgba(180,200,230,.45)' : 'rgba(40,60,90,.35)';
    const face = function (pts, color) {
      ctx.beginPath();
      pts.forEach(function (p, i) {
        const q = map(p[0], p[1], p[2]);
        if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    face([[0, 0, 0], [L, 0, 0], [L, 0, L], [0, 0, L]], dark ? 'rgba(77,163,255,.08)' : 'rgba(31,111,214,.06)');
    if (s.kind === 'two') {
      const y = s.phiL * L;
      face([[0, 0, 0], [L, 0, 0], [L, y, 0], [0, y, 0]], dark ? 'rgba(37,99,235,.16)' : 'rgba(37,99,235,.12)');
      face([[0, y, 0], [L, y, 0], [L, y, L], [0, y, L]], dark ? 'rgba(125,211,252,.18)' : 'rgba(37,99,235,.16)');
    }
    [[0, 0, 0], [L, 0, 0], [0, 0, L], [L, 0, L]].forEach(function (p) {
      edge(p, [p[0], L, p[2]], edgeCol, 1);
    });
    edge([0, 0, 0], [L, 0, 0], edgeCol, 1);
    edge([0, 0, L], [L, 0, L], edgeCol, 1);
    edge([0, 0, 0], [0, 0, L], edgeCol, 1);
    edge([L, 0, 0], [L, 0, L], edgeCol, 1);

    const mols = this.molecules.slice().sort(function (a, b) { return a.z - b.z; });
    const angstrom = 1e-10;
    for (let i = 0; i < mols.length; i++) {
      const m = mols[i];
      const atoms = m.shape.atoms.map(function (a) {
        return rotate({ x: a.x * angstrom, y: a.y * angstrom, z: a.z * angstrom, r: a.r, color: a.color, el: a.el }, m.ax, m.ay);
      });
      const projected = atoms.map(function (a) {
        const q = map(m.x + a.x, m.y + a.y, m.z + a.z);
        return { x: q[0], y: q[1], r: Math.max(1.1, a.r * angstrom * q[3]), color: a.color, z: q[2] };
      });
      ctx.lineWidth = 1;
      ctx.strokeStyle = dark ? 'rgba(15,23,42,.65)' : 'rgba(30,41,59,.45)';
      m.shape.bonds.forEach(function (b) {
        const A = projected[b[0]], B = projected[b[1]];
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      });
      projected.sort(function (a, b) { return a.z - b.z; }).forEach(function (a) {
        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.arc(a.x - a.r * 0.28, a.y - a.r * 0.32, a.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    edge([0, L, 0], [L, L, 0], edgeCol, 1.3);
    edge([0, L, L], [L, L, L], edgeCol, 1.3);
    edge([0, L, 0], [0, L, L], edgeCol, 1.3);
    edge([L, L, 0], [L, L, L], edgeCol, 1.3);

    const dPx = s.d * map(s.d, 0, 0)[3];
    const sigPx = s.sigma * map(s.sigma, 0, 0)[3];
    const barX = 12, barY = h - 16;
    ctx.strokeStyle = dark ? '#e7edf7' : '#1d2433';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + Math.max(8, dPx), barY);
    ctx.moveTo(barX, barY - 4);
    ctx.lineTo(barX, barY + 4);
    ctx.moveTo(barX + dPx, barY - 4);
    ctx.lineTo(barX + dPx, barY + 4);
    ctx.stroke();
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(barX, barY + 5, Math.max(2, sigPx), 3);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = dark ? '#e7edf7' : '#1d2433';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('d', barX, barY - 3);
    ctx.fillStyle = '#ea580c';
    ctx.fillText('σ', barX + Math.max(8, dPx) + 6, barY + 2);

    ctx.fillStyle = dark ? '#e7edf7' : '#1d2433';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Сосуд  ' + s.N + ' мол.', 10, 8);
    if (s.kind === 'two') {
      ctx.fillText('низ — жидкость, верх — пар', 10, 26);
    } else {
      const names = { liquid: 'жидкость', vapor: 'пар', gas: 'газ', scf: 'сверхкритический флюид', fluid: 'флюид' };
      ctx.fillText(names[s.kind] || 'газ', 10, 26);
    }

    const inset = 74;
    const ix = w - inset - 8, iy = 8;
    ctx.fillStyle = dark ? 'rgba(15,23,42,.72)' : 'rgba(255,255,255,.8)';
    ctx.strokeStyle = dark ? 'rgba(180,200,230,.3)' : 'rgba(40,60,90,.2)';
    roundRect(ctx, ix, iy, inset, inset, 8);
    ctx.fill();
    ctx.stroke();
    const shape = this.shape || SHAPES.ar;
    const ext = shape.extentA * angstrom;
    const sc = (inset * 0.38) / (ext || 1e-10);
    const cx = ix + inset / 2, cy = iy + inset / 2 + 4;
    const ang = (this.molecules[0] && this.molecules[0].ax) || 0.4;
    const atoms = shape.atoms.map(function (a) {
      return rotate({ x: a.x * angstrom, y: a.y * angstrom, z: a.z * angstrom, r: a.r, color: a.color }, ang, 0.5);
    }).sort(function (a, b) { return a.z - b.z; });
    atoms.forEach(function (a) {
      ctx.beginPath();
      ctx.fillStyle = a.color;
      ctx.strokeStyle = 'rgba(30,41,59,.4)';
      ctx.arc(cx + a.x * sc, cy - a.y * sc, Math.max(2, a.r * angstrom * sc), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.fillStyle = dark ? '#9aa8c0' : '#5c6b82';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('форма', cx, iy + 12);

    canvas.dataset.ready = '1';
    canvas.dataset.n = String(s.N);
    canvas.dataset.kind = s.kind;
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Vessel.prototype.drawHist = function () {
    const canvas = this.hist;
    const s = this.s;
    if (!canvas || !s) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = window.PVMotion ? PVMotion.cssBox(canvas, 320, 150).w : (canvas.clientWidth || 320);
    const h = 150;
    if (canvas._cssH !== h) { canvas._cssH = h; canvas.style.height = h + 'px'; }
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const dark = document.documentElement.dataset.theme === 'dark';
    const vmax = s.vrms * 2.6;
    const bins = 18;
    const counts = new Array(bins).fill(0);
    const data = this.samples;
    for (let i = 0; i < data.length; i++) {
      const k = Math.floor(data[i] / vmax * bins);
      if (k >= 0 && k < bins) counts[k]++;
    }
    let expectMax = 0;
    const binW0 = vmax / bins;
    for (let i = 0; i < bins; i++) {
      const vm = (i + 0.5) * binW0;
      expectMax = Math.max(expectMax, s.pdf(vm) * binW0 * Math.max(1, data.length));
    }
    const maxC = Math.max(1, Math.max.apply(null, counts), expectMax);
    const pad = { l: 36, r: 8, t: 16, b: 28 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const bw = pw / bins;
    ctx.fillStyle = dark ? 'rgba(77,163,255,.45)' : 'rgba(31,111,214,.35)';
    for (let i = 0; i < bins; i++) {
      const bh = (counts[i] / maxC) * ph;
      ctx.fillRect(pad.l + i * bw + 1, pad.t + ph - bh, bw - 2, bh);
    }
    let pdfMax = 0;
    const pdf = [];
    for (let i = 0; i <= 60; i++) {
      const v = vmax * i / 60;
      const y = s.pdf(v);
      pdf.push(y);
      if (y > pdfMax) pdfMax = y;
    }
    const samplesPerBin = data.length / bins;
    const binW = vmax / bins;
    ctx.beginPath();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2;
    for (let i = 0; i < pdf.length; i++) {
      const x = pad.l + (i / 60) * pw;
      const expect = pdf[i] * binW * data.length;
      const y = pad.t + ph - (expect / (maxC || 1)) * ph;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const xrms = pad.l + (s.vrms / vmax) * pw;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = dark ? '#e7edf7' : '#1d2433';
    ctx.beginPath();
    ctx.moveTo(xrms, pad.t);
    ctx.lineTo(xrms, pad.t + ph);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = dark ? '#9aa8c0' : '#5c6b82';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('v, м/с', pad.l + pw / 2, h - 6);
    ctx.textAlign = 'left';
    ctx.fillText('0', pad.l, h - 14);
    ctx.fillText(Math.round(vmax).toString(), pad.l + pw - 24, h - 14);
    ctx.fillStyle = '#ea580c';
    ctx.fillText('Максвелл', pad.l + 4, 12);
    ctx.fillStyle = dark ? '#e7edf7' : '#1d2433';
    ctx.fillText('vср.кв.', xrms + 4, 12);
  };

  return { Vessel: Vessel, shapes: SHAPES };
});
