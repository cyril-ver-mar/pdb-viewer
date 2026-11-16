/* Фононы: цепочка, дисперсия, 2D-моды, плотность состояний, теплоёмкость. */
(function () {
  'use strict';
  var M = function () { return globalThis.LatticeMath; };

  function num(v, d) {
    if (!isFinite(v)) return '∞';
    return v.toFixed(d == null ? 3 : d);
  }
  function setv(id, text, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (value != null) el.dataset.value = String(value);
  }

  function springs(state) {
    if (state.springs === 'alt') return { K1: state.K1, K2: state.K2 };
    return { K1: state.K, K2: state.K };
  }
  function kappa(state) { return state.k; }
  function kAbs(state) { return state.k * Math.PI / state.a; }

  function monoPack(state) {
    var k = kAbs(state);
    var w = M().omegaMono(k, state.K, state.m, state.a);
    return {
      w: w,
      max: M().omegaMonoMax(state.K, state.m),
      vg: M().vgMono(k, state.K, state.m, state.a),
      vp: M().vpMono(k, state.K, state.m, state.a)
    };
  }

  function sync(state) {
    var pack = monoPack(state);
    setv('omegaMax', num(pack.max), pack.max);
    var sp = springs(state);
    var edges = M().diatomicGapEdges(state.m1, state.m2, state.K);
    var at = M().diatomicOmega(Math.PI / state.a, state.m1, state.m2, sp.K1, sp.K2, state.a);
    setv('edgeM1', num(Math.sqrt(2 * state.K / state.m1)), Math.sqrt(2 * state.K / state.m1));
    setv('edgeM2', num(Math.sqrt(2 * state.K / state.m2)), Math.sqrt(2 * state.K / state.m2));
    setv('gapLo', num(edges.lo), edges.lo);
    setv('gapHi', num(edges.hi), edges.hi);
    setv('edgeAc', num(at.ac), at.ac);
    setv('edgeOp', num(at.op), at.op);
    var wNow, vg, vp;
    if (state.chain === 'mono') {
      wNow = pack.w; vg = pack.vg; vp = pack.vp;
    } else {
      var om = M().diatomicOmega(kAbs(state), state.m1, state.m2, sp.K1, sp.K2, state.a);
      wNow = state.branch === 'op' ? om.op : om.ac;
      var self = state;
      vg = M().vgNum(function (k) {
        var o = M().diatomicOmega(k, self.m1, self.m2, sp.K1, sp.K2, self.a);
        return self.branch === 'op' ? o.op : o.ac;
      }, kAbs(state));
      vp = Math.abs(kAbs(state)) < 1e-6 ? vg : wNow / Math.abs(kAbs(state));
    }
    setv('omegaNow', num(wNow), wNow);
    setv('vgNow', num(vg), vg);
    setv('vpNow', num(vp), vp);
    var note = document.getElementById('standNote');
    if (note) {
      var standing = state.chain === 'mono' && Math.abs(Math.abs(state.k) - 1) < 0.04;
      note.hidden = !standing;
    }
    var alias = document.getElementById('aliasNote');
    if (alias) alias.hidden = String(state.alias) === '0';
  }

  function drawChain(state, colors, phase) {
    var canvas = document.getElementById('cvChain');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var a = state.a;
    var k = kAbs(state);
    var pol = state.pol;
    var N = state.chain === 'di' ? 7 : 12;
    var length = state.chain === 'di' ? (N - 0.5) * a : (N - 1) * a;
    var pad = 28;
    var sx = (w - 2 * pad) / length;
    var yWave = h * 0.30;
    var yChain = h * 0.72;
    var amp = Math.min(34, h * 0.16);
    function X(x) { return pad + x * sx; }

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, yWave);
    ctx.lineTo(w - pad, yWave);
    ctx.stroke();

    function strokeWave(kWave, color, dash) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash || []);
      var steps = 240;
      for (var i = 0; i <= steps; i++) {
        var x = length * i / steps;
        var u = Math.sin(kWave * x - phase);
        var px = X(x), py = yWave - u * amp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    strokeWave(k, colors.acc, []);
    if (String(state.alias) !== '0') strokeWave(k + M().TAU / a, colors.acc2, [5, 4]);

    var sp = springs(state);
    var mode = null;
    if (state.chain === 'di') mode = M().diatomicMode(k, state.m1, state.m2, sp.K1, sp.K2, a, state.branch);

    var atoms = [];
    if (state.chain === 'mono') {
      for (var n = 0; n < N; n++) {
        var u = Math.sin(k * n * a - phase);
        atoms.push({ x: n * a, u: u, kind: 1, r: 9 });
      }
    } else {
      for (var c = 0; c < N; c++) {
        var u1 = M().dispAtom(mode, 1, phase, k * c * a);
        var u2 = M().dispAtom(mode, 2, phase, k * c * a);
        var heavy = state.m2 >= state.m1;
        atoms.push({ x: c * a, u: u1, kind: 1, r: heavy ? 8 : 11 });
        atoms.push({ x: c * a + a / 2, u: u2, kind: 2, r: heavy ? 12 : 8 });
      }
    }
    for (var s = 0; s < atoms.length; s++) {
      var dot = atoms[s];
      LDraw.circle(ctx, X(dot.x), yWave - dot.u * amp, 4, { fill: dot.kind === 2 ? colors.acc2 : colors.acc, stroke: colors.card, lw: 1 });
    }

    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.4;
    for (var q = 0; q < atoms.length - 1; q++) {
      var A = atoms[q], B = atoms[q + 1];
      var x1 = X(A.x) + (pol === 'L' ? A.u * amp * 0.55 : 0);
      var x2 = X(B.x) + (pol === 'L' ? B.u * amp * 0.55 : 0);
      var y1 = yChain + (pol === 'T' ? -A.u * amp * 0.7 : 0);
      var y2 = yChain + (pol === 'T' ? -B.u * amp * 0.7 : 0);
      spring(ctx, x1, y1, x2, y2, colors.muted);
    }
    for (var t = 0; t < atoms.length; t++) {
      var at = atoms[t];
      var ax = X(at.x) + (pol === 'L' ? at.u * amp * 0.55 : 0);
      var ay = yChain + (pol === 'T' ? -at.u * amp * 0.7 : 0);
      LDraw.circle(ctx, ax, ay, at.r, {
        fill: at.kind === 2 ? colors.acc2 : colors.acc,
        stroke: colors.card,
        lw: 2
      });
    }
    LDraw.text(ctx, 'u(x)', 8, yWave, { halo: colors.card, color: colors.muted, align: 'left', font: '12px sans-serif' });
    var lam = Math.abs(k) > 1e-4 ? M().TAU / Math.abs(k) : Infinity;
    LDraw.text(ctx, isFinite(lam) ? 'λ = ' + num(lam / a, 2) + ' a' : 'λ → ∞', w - 10, 14, { halo: colors.card, color: colors.fg, align: 'right', font: '600 12px sans-serif' });
  }

  function spring(ctx, x1, y1, x2, y2, color) {
    var dx = x2 - x1, dy = y2 - y1;
    var L = Math.hypot(dx, dy) || 1;
    var ux = dx / L, uy = dy / L, px = -uy, py = ux;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    var coils = 7, n = 28, amp = 5;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var wiggle = Math.sin(t * coils * Math.PI * 2) * (t > 0.08 && t < 0.92 ? amp : 0);
      var x = x1 + dx * t + px * wiggle;
      var y = y1 + dy * t + py * wiggle;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawDisp(state, colors) {
    var canvas = document.getElementById('cvDisp');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var a = state.a;
    var sp = springs(state);
    var ptsAc = [], ptsOp = [], ptsM = [];
    var steps = 160;
    var kMax = 2;
    for (var i = 0; i <= steps; i++) {
      var kappa = kMax * i / steps;
      var k = kappa * Math.PI / a;
      if (state.chain === 'mono') {
        ptsM.push({ x: kappa, y: M().omegaMono(k, state.K, state.m, a) });
      } else {
        var o = M().diatomicOmega(k, state.m1, state.m2, sp.K1, sp.K2, a);
        ptsAc.push({ x: kappa, y: o.ac });
        ptsOp.push({ x: kappa, y: o.op });
      }
    }
    var yMax = state.chain === 'mono'
      ? M().omegaMonoMax(state.K, state.m) * 1.15
      : (M().diatomicOmega(0, state.m1, state.m2, sp.K1, sp.K2, a).op * 1.15 || 1);
    var k = kAbs(state);
    var yMark;
    if (state.chain === 'mono') yMark = M().omegaMono(k, state.K, state.m, a);
    else {
      var om = M().diatomicOmega(k, state.m1, state.m2, sp.K1, sp.K2, a);
      yMark = state.branch === 'op' ? om.op : om.ac;
    }
    var bands = [];
    if (state.chain === 'di' && Math.abs(sp.K1 - sp.K2) < 1e-6) {
      var gap = M().diatomicGapEdges(state.m1, state.m2, state.K);
      bands.push({ y0: gap.lo, y1: gap.hi, color: 'rgba(226,106,61,.18)' });
    }
    var series = state.chain === 'mono'
      ? [{ color: colors.acc, pts: ptsM, width: 2.4 }]
      : [{ color: colors.acc, pts: ptsAc, width: 2.4 }, { color: colors.acc2, pts: ptsOp, width: 2.4 }];
    var plot = LChart.draw(fit.ctx, fit.w, fit.h, {
      xMin: 0, xMax: kMax, yMin: 0, yMax: yMax,
      xLabel: 'k / (π/a)',
      yLabel: 'ω',
      series: series,
      vlines: [{ x: 1, label: 'π/a', color: colors.muted, dash: [3, 3] }],
      bands: bands,
      marker: { x: Math.max(0, Math.min(kMax, state.k)), y: yMark, color: colors.acc2 }
    }, colors);
    canvas._pixToK = function (px) {
      var v = plot.pixToX(px);
      if (v < 0) v = 0;
      if (v > kMax) v = kMax;
      return v;
    };
  }

  function stopsOf(state) {
    return state.lat2 === 'hex' ? M().hexStops(state.a) : M().squareStops(state.a);
  }
  function omega2(state, kx, ky) {
    if (state.lat2 === 'hex') return M().omegaHex(kx, ky, state.K, state.m, state.a);
    return M().omegaSquare(kx, ky, state.K, state.m, state.a);
  }

  function drawPath(state, colors) {
    var canvas = document.getElementById('cvPath');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var stops = stopsOf(state);
    var sampled = M().samplePath(stops, 48, function (kx, ky) { return omega2(state, kx, ky); });
    var yMax = 0.01;
    for (var i = 0; i < sampled.pts.length; i++) if (sampled.pts[i].y > yMax) yMax = sampled.pts[i].y;
    var u = Math.max(0, Math.min(1, state.kp));
    var here = M().pathAt(stops, u);
    var yHere = omega2(state, here.x, here.y);
    var dHere = u * sampled.length;
    LChart.draw(fit.ctx, fit.w, fit.h, {
      xMin: 0, xMax: sampled.length, yMin: 0, yMax: yMax * 1.12,
      xLabel: state.lat2 === 'hex' ? 'Γ–M–K–Γ' : 'Γ–X–M–Γ',
      yLabel: 'ω',
      series: [{ color: colors.acc, pts: sampled.pts.map(function (p) { return { x: p.d, y: p.y }; }), width: 2.4 }],
      vlines: sampled.ticks.map(function (t) { return { x: t.d, label: t.name, color: colors.muted, dash: [3, 3] }; }),
      marker: { x: dHere, y: yHere, color: colors.acc2 },
      xTicks: sampled.ticks.map(function (t) { return t.d; })
    }, colors);
    canvas._path = sampled;
  }

  function drawMode(state, colors, phase) {
    var canvas = document.getElementById('cvMode');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var stops = stopsOf(state);
    var k = M().pathAt(stops, state.kp);
    var kl = Math.hypot(k.x, k.y);
    var ux = kl > 1e-8 ? k.x / kl : 1;
    var uy = kl > 1e-8 ? k.y / kl : 0;
    var px = -uy, py = ux;
    var a = state.a;
    var atoms = [];
    if (state.lat2 === 'hex') {
      var d = M().directVectors('hex', a, a, 60);
      for (var n1 = -3; n1 <= 3; n1++) {
        for (var n2 = -3; n2 <= 3; n2++) {
          var x = n1 * d.a1.x + n2 * d.a2.x;
          var y = n1 * d.a1.y + n2 * d.a2.y;
          if (x * x + y * y > (3.2 * a) * (3.2 * a)) continue;
          atoms.push({ x: x, y: y });
        }
      }
    } else {
      for (var i = -3; i <= 3; i++) {
        for (var j = -3; j <= 3; j++) atoms.push({ x: i * a, y: j * a });
      }
    }
    var reach = 3.6 * a;
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, 16), w, h, 16);
    var amp = a * 0.28;
    for (var s = 0; s < atoms.length; s++) {
      var R = atoms[s];
      var u = Math.sin(k.x * R.x + k.y * R.y - phase);
      var dx = 0, dy = 0, rad = 8;
      if (state.pol === 'T') { dx = px * u * amp; dy = py * u * amp; }
      else if (state.pol === 'Z') rad = 6 + u * 4;
      else { dx = ux * u * amp; dy = uy * u * amp; }
      var sp = map.toS(R.x + dx, R.y + dy);
      var col = state.pol === 'Z'
        ? (u >= 0 ? colors.acc : colors.acc2)
        : colors.acc;
      LDraw.circle(ctx, sp[0], sp[1], rad, { fill: col, stroke: colors.card, lw: 1.5 });
    }
    if (kl > 1e-6) {
      var c0 = map.toS(0, 0);
      var c1 = map.toS(ux * a * 1.3, uy * a * 1.3);
      LDraw.arrow(ctx, c0[0], c0[1], c1[0], c1[1], colors.acc2, 2);
      LDraw.text(ctx, 'k', c1[0] + 8, c1[1], { halo: colors.card, color: colors.acc2 });
    }
  }

  function drawDos(state, colors) {
    var canvas = document.getElementById('cvDos');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var vals = [];
    var a = state.a;
    var sp = springs(state);
    if (state.dos === 'square' || state.dos === 'hex') {
      var n = 36;
      for (var ix = 0; ix < n; ix++) {
        for (var iy = 0; iy < n; iy++) {
          var s = (ix + 0.5) / n - 0.5;
          var t = (iy + 0.5) / n - 0.5;
          var stops = state.dos === 'hex' ? M().directVectors('hex', a, a, 60) : M().directVectors('square', a, a, 90);
          var rec = M().reciprocal(stops.a1, stops.a2);
          var kx = s * rec.b1.x + t * rec.b2.x;
          var ky = s * rec.b1.y + t * rec.b2.y;
          vals.push(state.dos === 'hex' ? M().omegaHex(kx, ky, state.K, state.m, a) : M().omegaSquare(kx, ky, state.K, state.m, a));
        }
      }
    } else if (state.chain === 'di') {
      for (var i = 0; i <= 240; i++) {
        var k = (i / 240) * Math.PI / a;
        var o = M().diatomicOmega(k, state.m1, state.m2, sp.K1, sp.K2, a);
        vals.push(o.ac, o.op);
      }
    } else {
      for (var j = 0; j <= 300; j++) {
        var kk = (j / 300) * Math.PI / a;
        vals.push(M().omegaMono(kk, state.K, state.m, a));
      }
    }
    var hist = M().histogram(vals, 28);
    LChart.hist(fit.ctx, fit.w, fit.h, { counts: hist.counts, min: hist.min, max: hist.max, xLabel: 'ω', yLabel: 'g(ω)' }, colors);
  }

  function drawHeat(state, colors) {
    var canvas = document.getElementById('cvHeat');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var td = Math.max(20, state.td);
    var te = Math.max(20, state.te);
    var tmax = Math.max(td, te) * 1.6;
    var deb = [], ein = [];
    var n = 80;
    for (var i = 1; i <= n; i++) {
      var T = tmax * i / n;
      deb.push({ x: T, y: M().debyeCV(T, td) });
      ein.push({ x: T, y: M().einsteinCV(T, te) });
    }
    var Tm = Math.max(1, Math.min(tmax, state.Tm));
    LChart.draw(fit.ctx, fit.w, fit.h, {
      xMin: 0, xMax: tmax, yMin: 0, yMax: 3.3,
      xLabel: 'T, К',
      yLabel: 'Cᵥ / Nk',
      series: [
        { color: colors.acc, pts: deb, width: 2.4 },
        { color: colors.acc2, pts: ein, width: 2.4, dash: [6, 4] }
      ],
      vlines: [{ x: Tm, color: colors.muted, dash: [3, 3] }],
      hlines: [{ y: 3, color: colors.good }]
    }, colors);
    setv('cvDebye', num(M().debyeCV(Tm, td), 3), M().debyeCV(Tm, td));
    setv('cvEinstein', num(M().einsteinCV(Tm, te), 3), M().einsteinCV(Tm, te));
  }

  function draw(state, colors, phase) {
    drawChain(state, colors, phase || 0);
    drawDisp(state, colors);
    drawPath(state, colors);
    drawMode(state, colors, phase || 0);
    drawDos(state, colors);
    drawHeat(state, colors);
  }
  function drawAnim(state, colors, phase) {
    drawChain(state, colors, phase || 0);
    drawMode(state, colors, phase || 0);
  }

  function onDisp(px) {
    var canvas = document.getElementById('cvDisp');
    if (!canvas || !canvas._pixToK) return null;
    return canvas._pixToK(px);
  }
  function onPath(px) {
    var canvas = document.getElementById('cvPath');
    if (!canvas || !canvas._path) return null;
    var fit = canvas.getBoundingClientRect();
    var padL = 46, padR = 14;
    var pw = fit.width - padL - padR;
    var x = padL + (px - padL);
    var frac = (px - padL) / pw;
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    void x;
    return frac;
  }

  globalThis.LSecPhonon = { sync: sync, draw: draw, drawAnim: drawAnim, onDisp: onDisp, onPath: onPath, monoPack: monoPack };
})();
