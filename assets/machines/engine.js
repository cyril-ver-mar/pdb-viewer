/* Учебные модели молекулярных машин: геометрия, сцена 3Dmol, график энергии. */
(function (root) {
  'use strict';

  const KB = 1.380649e-23;
  const HPLANCK = 6.62607015e-34;
  const R = 8.314462618;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function randn() {
    let u = 1 - Math.random();
    let v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const G = {
    add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    len(a) { return Math.hypot(a[0], a[1], a[2]); },
    norm(a) {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
    lerp(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; },
    rot(p, axis, ang) {
      const k = G.norm(axis);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const d = G.dot(k, p);
      const cr = G.cross(k, p);
      return [
        p[0] * c + cr[0] * s + k[0] * d * (1 - c),
        p[1] * c + cr[1] * s + k[1] * d * (1 - c),
        p[2] * c + cr[2] * s + k[2] * d * (1 - c)
      ];
    },
    around(p, origin, axis, ang) { return G.add(origin, G.rot(G.sub(p, origin), axis, ang)); },
    basis(axis, hint) {
      const n = G.norm(axis);
      let x = G.sub(hint, G.mul(n, G.dot(hint, n)));
      if (G.len(x) < 1e-6) {
        const tmp = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        x = G.sub(tmp, G.mul(n, G.dot(tmp, n)));
      }
      x = G.norm(x);
      const y = G.norm(G.cross(n, x));
      return { n: n, x: x, y: y };
    }
  };

  function Molecule() {
    this.atoms = [];
    this.bonds = [];
    this.labels = [];
  }
  Molecule.prototype.atom = function (p, c, r, tag) {
    const i = this.atoms.length;
    this.atoms.push({ p: [p[0], p[1], p[2]], c: c, r: r == null ? 0.33 : r, tag: tag || '' });
    return i;
  };
  Molecule.prototype.bond = function (i, j, c, r, order) {
    if (i == null || j == null || i < 0 || j < 0 || i === j) return;
    const ord = order || 1;
    this.bonds.push({ a: i, b: j, c: c || '#94a3b8', r: r == null ? 0.08 : r, order: ord, bondOrder: ord });
  };
  Molecule.prototype.chain = function (ids, c, r) {
    for (let k = 1; k < ids.length; k++) this.bond(ids[k - 1], ids[k], c, r, 1);
  };
  Molecule.prototype.label = function (p, text) {
    this.labels.push({ p: [p[0], p[1], p[2]], text: text });
  };
  Molecule.prototype.transform = function (ids, origin, axis, ang) {
    for (let k = 0; k < ids.length; k++) {
      const a = this.atoms[ids[k]];
      if (a) a.p = G.around(a.p, origin, axis, ang);
    }
  };
  Molecule.prototype.translate = function (ids, d) {
    for (let k = 0; k < ids.length; k++) {
      const a = this.atoms[ids[k]];
      if (a) a.p = G.add(a.p, d);
    }
  };
  Molecule.prototype.ring = function (n, center, axis, hint, radius, color, atomR, order) {
    const b = G.basis(axis, hint);
    const ids = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const p = G.add(center, G.add(G.mul(b.x, radius * Math.cos(a)), G.mul(b.y, radius * Math.sin(a))));
      ids.push(this.atom(p, color, atomR == null ? 0.32 : atomR));
    }
    for (let i = 0; i < n; i++) {
      const ord = n === 6 && i % 2 === 0 ? 2 : (order || 1);
      this.bond(ids[i], ids[(i + 1) % n], color, ord >= 2 ? 0.07 : 0.065, ord);
    }
    return ids;
  };
  Molecule.prototype.closest = function (ids, p) {
    let best = ids[0];
    let bd = 1e9;
    for (let k = 0; k < ids.length; k++) {
      const d = G.len(G.sub(this.atoms[ids[k]].p, p));
      if (d < bd) { bd = d; best = ids[k]; }
    }
    return best;
  };
  Molecule.prototype.tube = function (pts, color, atomR, bondR) {
    const ids = [];
    for (let i = 0; i < pts.length; i++) ids.push(this.atom(pts[i], color, atomR == null ? 0.28 : atomR));
    this.chain(ids, color, bondR == null ? 0.07 : bondR);
    return ids;
  };

  /* Жёсткие фрагменты: связи задаются один раз, кадр только двигает координаты. */
  function Rig() {
    this.atoms = [];
    this.bonds = [];
    this.labels = [];
    this.base = null;
    this._byFrag = null;
  }
  Rig.prototype.atom = function (p, c, r, frag, tag) {
    const i = this.atoms.length;
    this.atoms.push({ p: [p[0], p[1], p[2]], c: c, r: r == null ? 0.32 : r, frag: frag || 'fixed', tag: tag || '', elem: 'C' });
    return i;
  };
  Rig.prototype.bond = function (i, j, c, r, order) {
    if (i == null || j == null || i < 0 || j < 0 || i === j) return;
    const ord = order || 1;
    this.bonds.push({ a: i, b: j, c: c || '#94a3b8', r: r == null ? 0.08 : r, order: ord, bondOrder: ord });
  };
  Rig.prototype.chain = function (ids, c, r) {
    for (let k = 1; k < ids.length; k++) this.bond(ids[k - 1], ids[k], c, r, 1);
  };
  Rig.prototype.label = function (p, text) {
    this.labels.push({ p: p.slice(), text: text });
  };
  Rig.prototype.ring = function (n, center, axis, hint, radius, color, atomR, frag) {
    const b = G.basis(axis, hint);
    const ids = [];
    const R = radius;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const p = G.add(center, G.add(G.mul(b.x, R * Math.cos(a)), G.mul(b.y, R * Math.sin(a))));
      ids.push(this.atom(p, color, atomR == null ? 0.3 : atomR, frag));
    }
    for (let i = 0; i < n; i++) {
      const ord = n === 6 && i % 2 === 0 ? 2 : 1;
      this.bond(ids[i], ids[(i + 1) % n], color, ord >= 2 ? 0.055 : 0.07, ord);
    }
    return ids;
  };
  Rig.prototype.seal = function () {
    this.base = this.atoms.map(a => [a.p[0], a.p[1], a.p[2]]);
    this._byFrag = {};
    for (let i = 0; i < this.atoms.length; i++) {
      const f = this.atoms[i].frag;
      (this._byFrag[f] || (this._byFrag[f] = [])).push(i);
    }
    this.labels0 = this.labels.map(l => ({ p: l.p.slice(), text: l.text }));
    return this;
  };
  Rig.prototype.pose = function (ops) {
    for (let i = 0; i < this.atoms.length; i++) {
      const b = this.base[i];
      const p = this.atoms[i].p;
      p[0] = b[0]; p[1] = b[1]; p[2] = b[2];
    }
    const names = Object.keys(ops || {});
    for (let n = 0; n < names.length; n++) {
      const ids = this._byFrag[names[n]];
      if (!ids) continue;
      const steps = ops[names[n]];
      const list = Array.isArray(steps) ? steps : [steps];
      for (let s = 0; s < list.length; s++) {
        const step = list[s];
        if (step.trans) {
          const d = step.trans;
          for (let k = 0; k < ids.length; k++) {
            const p = this.atoms[ids[k]].p;
            p[0] += d[0]; p[1] += d[1]; p[2] += d[2];
          }
        } else if (step.spin) {
          const o = step.spin[0], ax = step.spin[1], ang = step.spin[2];
          if (!ang) continue;
          for (let k = 0; k < ids.length; k++) {
            this.atoms[ids[k]].p = G.around(this.atoms[ids[k]].p, o, ax, ang);
          }
        }
      }
    }
    return this;
  };
  Rig.prototype.setLabel = function (i, text, p) {
    if (!this.labels[i]) return;
    if (text != null) this.labels[i].text = text;
    if (p) { this.labels[i].p[0] = p[0]; this.labels[i].p[1] = p[1]; this.labels[i].p[2] = p[2]; }
  };

  function eyring(dGkJ, T) {
    if (!(T > 0)) return 0;
    const dG = dGkJ * 1000;
    return (KB * T / HPLANCK) * Math.exp(-dG / (R * T));
  }
  function comma(x, d) {
    if (!isFinite(x)) return '—';
    return x.toFixed(d).replace('.', ',');
  }
  function formatK(k) {
    if (!(k > 0) || !isFinite(k)) return '0';
    if (k >= 0.01 && k < 100) {
      const d = k >= 10 ? 1 : k >= 1 ? 2 : 3;
      return comma(k, d);
    }
    const parts = k.toExponential(2).split('e');
    const man = parts[0].replace('.', ',');
    const exp = String(parseInt(parts[1], 10)).replace('-', '−').replace(/\d/g, function (d) {
      return '⁰¹²³⁴⁵⁶⁷⁸⁹'[d];
    });
    return man + '·10' + exp;
  }
  function formatTime(t) {
    if (!(t > 0) || !isFinite(t)) return '∞';
    if (t < 1e-6) return comma(t * 1e9, 1) + ' нс';
    if (t < 1e-3) return comma(t * 1e6, 1) + ' мкс';
    if (t < 1) return comma(t * 1e3, 1) + ' мс';
    if (t < 90) return comma(t, 1) + ' с';
    if (t < 5400) return comma(t / 60, 1) + ' мин';
    if (t < 172800) return comma(t / 3600, 1) + ' ч';
    if (t < 86400 * 60) return comma(t / 86400, 1) + ' сут';
    return comma(t / (86400 * 365), 1) + ' лет';
  }
  function halfLife(k) { return k > 0 ? formatTime(Math.LN2 / k) : '∞'; }

  /* Сжатие реального k в длительность шага на экране: порядок сохраняется, абсолютное время — нет. */
  function visualStepSeconds(k) {
    if (!(k > 0)) return Infinity;
    const t = Math.LN2 / k;
    return clamp(0.55 * Math.pow(t, 0.28), 0.45, 16);
  }

  function themeName() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function viewerBg() { return themeName() === 'dark' ? '#10182a' : '#f3f6fb'; }
  function chartPalette() {
    const dark = themeName() === 'dark';
    return {
      dark: dark,
      bg: dark ? '#10182a' : '#f8fafc',
      fg: dark ? '#e8eef9' : '#1d2433',
      muted: dark ? '#93a0b8' : '#5c6b82',
      grid: dark ? 'rgba(148,163,184,.22)' : 'rgba(30,41,59,.12)',
      ground: dark ? '#7cb3ff' : '#1f6fd6',
      excited: dark ? '#ffb07a' : '#e07a3d',
      marker: '#e11d48',
      barrier: dark ? '#f87171' : '#b91c1c'
    };
  }

  function sample(fn, x0, x1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n;
      pts.push([x, fn(x)]);
    }
    return pts;
  }

  function drawChart(canvas, spec) {
    if (!canvas || !spec) return;
    const pal = chartPalette();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = window.PVMotion ? PVMotion.cssBox(canvas, 320, 180) : null;
    const w = box ? box.w : (canvas.clientWidth || 320);
    const h = box ? box.h : (canvas.clientHeight || 180);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);

    const pad = { l: 42, r: 12, t: 16, b: 28 };
    const x0 = spec.xMin, x1 = spec.xMax, y0 = spec.yMin, y1 = spec.yMax;
    const X = x => pad.l + (x - x0) / (x1 - x0) * (w - pad.l - pad.r);
    const Y = y => pad.t + (1 - (y - y0) / (y1 - y0)) * (h - pad.t - pad.b);

    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = pal.muted;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = spec.yTicks || 4;
    for (let i = 0; i <= yTicks; i++) {
      const yv = y0 + (y1 - y0) * i / yTicks;
      const yy = Y(yv);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(w - pad.r, yy);
      ctx.stroke();
      ctx.fillText(String(Math.round(yv)), pad.l - 6, yy);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = spec.xTicks || [];
    for (let i = 0; i < xTicks.length; i++) {
      const xv = xTicks[i].x;
      ctx.fillText(xTicks[i].label, X(xv), h - pad.b + 8);
    }
    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(spec.yLabel || '', 0, 0);
    ctx.restore();

    if (spec.barrier != null) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = pal.barrier;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(spec.barrier));
      ctx.lineTo(w - pad.r, Y(spec.barrier));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pal.barrier;
      ctx.textAlign = 'left';
      ctx.fillText(spec.barrierLabel || 'ΔG‡', pad.l + 4, Y(spec.barrier) - 12);
      ctx.restore();
    }

    function strokeSeries(series) {
      ctx.save();
      ctx.lineWidth = series.width || 2;
      ctx.strokeStyle = series.color || pal.ground;
      if (series.dash) ctx.setLineDash(series.dash);
      ctx.beginPath();
      let open = false;
      const pts = series.pts || [];
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i][0];
        const y = pts[i][1];
        if (y == null || !isFinite(y)) { open = false; continue; }
        const px = X(x);
        const py = Y(clamp(y, y0, y1));
        if (!open) { ctx.moveTo(px, py); open = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    (spec.series || []).forEach(strokeSeries);

    if (spec.excitedBand && spec.markerOnExcited) {
      ctx.save();
      ctx.fillStyle = pal.excited;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(pad.l, pad.t, w - pad.l - pad.r, 22);
      ctx.restore();
    }
    if (spec.excitedBand) {
      ctx.fillStyle = pal.excited;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(spec.excitedLabel || 'S1 (не в масштабе)', w - pad.r, pad.t + 2);
    }

    if (spec.marker) {
      const mx = X(clamp(spec.marker.x, x0, x1));
      let my;
      if (spec.marker.onExcited) my = pad.t + 12;
      else my = Y(clamp(spec.marker.y, y0, y1));
      ctx.strokeStyle = pal.marker;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(mx, pad.t);
      ctx.lineTo(mx, h - pad.b);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.marker;
      ctx.beginPath();
      ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function Viewer(el) {
    this.el = el;
    this.ok = false;
    this.framed = false;
    this.bg = '';
    this.view = { rx: 0.42, ry: -0.55, zoom: 0.82 };
    try {
      this.viewer = $3Dmol.createViewer(el, {
        backgroundColor: viewerBg(),
        antialias: true,
        disableFog: true,
        cartoonQuality: 4
      });
      this.ok = true;
      this.bg = viewerBg();
    } catch (err) {
      this.error = err;
      el.innerHTML = '<p class="view-fallback">3D-сцена не запустилась в этом браузере.</p>';
    }
  }
  Viewer.prototype.setView = function (view) {
    if (view) this.view = view;
  };
  Viewer.prototype.setBg = function (hex) {
    if (!this.ok || this.bg === hex) return;
    this.bg = hex;
    this.viewer.setBackgroundColor(hex);
  };
  Viewer.prototype.resetCam = function () {
    this.framed = false;
  };
  Viewer.prototype.dropModels = function () {
    if (!this.ok) return;
    this.viewer.removeAllModels();
    this.viewer.removeAllShapes();
    this.viewer.removeAllLabels();
    this.framed = false;
    this._real = null;
  };
  Viewer.prototype.resize = function () {
    if (!this.ok) return;
    this.viewer.resize();
    this.viewer.render();
  };
  Viewer.prototype.draw = function (scene) {
    if (!this.ok) return null;
    const v = this.viewer;
    v.removeAllShapes();
    v.removeAllLabels();
    const atoms = scene.atoms;
    const bonds = scene.bonds;
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i];
      const A = atoms[b.a] && atoms[b.a].p;
      const B = atoms[b.b] && atoms[b.b].p;
      if (!A || !B) continue;
      if (b.order >= 2) {
        const d = G.sub(B, A);
        let off = G.cross(d, [0, 0, 1]);
        if (G.len(off) < 0.15) off = G.cross(d, [0, 1, 0]);
        off = G.mul(G.norm(off), 0.13);
        v.addCylinder({
          start: { x: A[0] + off[0], y: A[1] + off[1], z: A[2] + off[2] },
          end: { x: B[0] + off[0], y: B[1] + off[1], z: B[2] + off[2] },
          radius: (b.r || 0.08) * 0.75, color: b.c, fromCap: 1, toCap: 1, quality: 6
        });
        v.addCylinder({
          start: { x: A[0] - off[0], y: A[1] - off[1], z: A[2] - off[2] },
          end: { x: B[0] - off[0], y: B[1] - off[1], z: B[2] - off[2] },
          radius: (b.r || 0.08) * 0.75, color: b.c, fromCap: 1, toCap: 1, quality: 6
        });
      } else {
        v.addCylinder({
          start: { x: A[0], y: A[1], z: A[2] },
          end: { x: B[0], y: B[1], z: B[2] },
          radius: b.r || 0.08, color: b.c, fromCap: 1, toCap: 1, quality: 6
        });
      }
    }
    let move = null;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      if (!isFinite(a.p[0]) || !isFinite(a.p[1]) || !isFinite(a.p[2])) continue;
      v.addSphere({ center: { x: a.p[0], y: a.p[1], z: a.p[2] }, radius: a.r, color: a.c, quality: 1 });
      if (a.tag === 'move') move = a.p;
    }
    const labels = scene.labels || [];
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      v.addLabel(l.text, {
        position: { x: l.p[0], y: l.p[1], z: l.p[2] },
        backgroundColor: '#0f172a',
        backgroundOpacity: 0.9,
        fontColor: '#ffffff',
        fontSize: 13,
        borderThickness: 0,
        showBackground: true,
        inFront: true
      });
    }
    if (!this.framed) {
      const view = this.view || {};
      v.zoomTo();
      v.zoom(view.zoom == null ? 0.82 : view.zoom, 0);
      if (view.rx) v.rotate(view.rx, 'x');
      if (view.ry) v.rotate(view.ry, 'y');
      this.framed = true;
    }
    v.render();
    return move;
  };

  function drawQR(canvas, text) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, W);
    if (typeof qrcode !== 'function') {
      ctx.fillStyle = '#334155';
      ctx.font = '14px sans-serif';
      ctx.fillText('QR недоступен', 16, W / 2);
      return;
    }
    const nBytes = new TextEncoder().encode(text).length;
    const q = qrcode(0, nBytes < 500 ? 'M' : 'L');
    q.addData(text, 'Byte');
    q.make();
    const n = q.getModuleCount();
    const quiet = 4;
    const cell = Math.floor(W / (n + quiet * 2)) || 1;
    const off = Math.floor((W - cell * n) / 2);
    ctx.fillStyle = '#0f172a';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
      }
    }
  }

  root.MM = {
    G: G,
    Molecule: Molecule,
    Rig: Rig,
    clamp: clamp,
    lerp: lerp,
    smooth: smooth,
    randn: randn,
    eyring: eyring,
    comma: comma,
    formatK: formatK,
    formatTime: formatTime,
    halfLife: halfLife,
    visualStepSeconds: visualStepSeconds,
    themeName: themeName,
    viewerBg: viewerBg,
    drawChart: drawChart,
    Viewer: Viewer,
    drawQR: drawQR,
    sample: sample,
    R: R
  };
})(typeof window !== 'undefined' ? window : globalThis);
