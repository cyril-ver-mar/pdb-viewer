/* Электроны: свободные, почти свободные, сильная связь, волна Блоха, поверхность Ферми. */
(function () {
  'use strict';
  var M = function () { return globalThis.LatticeMath; };
  var COLORS = ['#1f6fd6', '#e26a3d', '#0e8f62', '#7c5cbf', '#c43b6e'];

  function num(v, d) {
    if (!isFinite(v)) return '∞';
    var n = v.toFixed(d == null ? 3 : d);
    return n;
  }
  function setv(id, text, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (value != null) el.dataset.value = String(value);
  }
  function tEff(state) {
    var t = Math.abs(state.t);
    return state.orb === 'p' ? -t : t;
  }
  function bandMass(state) {
    var k = state.k * Math.PI;
    if (state.el === 'tb') {
      var curv = 2 * tEff(state) * Math.cos(k);
      if (Math.abs(curv) < 1e-8) return { value: Infinity, text: 'зона плоская, масса расходится' };
      var m = 1 / curv;
      return {
        value: m,
        text: (m >= 0 ? 'электрон на дне, m* > 0' : 'дырка на потолке, m* < 0') + '. Единицы ħ = 1, a = 1: на краю зоны |m*| = 1/(2|t|).'
      };
    }
    var fn = function (kk) {
      if (state.el === 'free') return kk * kk;
      var kappa = kk / Math.PI;
      var kr = fold(kappa);
      var bands = M().nfeBands(kr * Math.PI, 1, state.U * Math.PI * Math.PI, 3);
      return bands[0].E;
    };
    var ms = M().mstarOf(fn, k);
    var ratio = !isFinite(ms.m) ? Infinity : 2 * ms.m;
    return {
      value: ratio,
      text: !isFinite(ratio) ? 'зона плоская' : (ratio >= 0 ? 'm*/m > 0, электронная кривизна нижней зоны' : 'm*/m < 0, дырочная кривизна нижней зоны')
    };
  }

  function fold(kappa) {
    var y = ((kappa + 1) % 2 + 2) % 2 - 1;
    return y;
  }

  function energyAt(state, kappa) {
    var t = tEff(state);
    var k = kappa * Math.PI;
    if (state.el === 'tb') return M().tb1(k, 1, state.eps, t);
    if (state.el === 'free') return kappa * kappa;
    var kr = fold(kappa);
    var bands = M().nfeBands(kr * Math.PI, 1, state.U * Math.PI * Math.PI, 3);
    var target = kappa;
    var best = bands[0], score = Infinity;
    for (var i = 0; i < bands.length; i++) {
      var guess = kr + 2 * bands[i].n;
      var d = Math.abs(guess - target);
      if (d < score) { score = d; best = bands[i]; }
    }
    return best.E / (Math.PI * Math.PI);
  }

  function bandsReduced(state, kappa) {
    if (state.el === 'tb') return [M().tb1(kappa * Math.PI, 1, state.eps, tEff(state))];
    if (state.el === 'free') {
      var out = [];
      for (var n = -2; n <= 2; n++) out.push((kappa + 2 * n) * (kappa + 2 * n));
      out.sort(function (a, b) { return a - b; });
      return out;
    }
    var raw = M().nfeBands(kappa * Math.PI, 1, state.U * Math.PI * Math.PI, 3);
    return raw.map(function (b) { return b.E / (Math.PI * Math.PI); });
  }

  function sync(state) {
    var t = Math.abs(state.t);
    var width = M().tbBandwidth(t);
    setv('tbWidth', num(width, 3), width);
    var lo = state.eps - 2 * t;
    var hi = state.eps + 2 * t;
    setv('tbLo', num(state.orb === 'p' ? state.eps - 2 * t : lo, 3), state.orb === 'p' ? state.eps - 2 * t : lo);
    setv('tbHi', num(state.orb === 'p' ? state.eps + 2 * t : hi, 3), state.orb === 'p' ? state.eps + 2 * t : hi);
    var kAbs = state.k * Math.PI / Math.max(0.05, state.a);
    var lam = Math.abs(kAbs) < 1e-4 ? Infinity : M().TAU / Math.abs(kAbs);
    setv('lambdaNow', isFinite(lam) ? num(lam / state.a, 2) + ' a' : '∞', isFinite(lam) ? lam / state.a : 1e9);
    var mass = bandMass(state);
    setv('mstar', num(mass.value, 3), mass.value);
    var kind = document.getElementById('mstarKind');
    if (kind) kind.textContent = mass.text;
    var fill = state.fill;
    var metal = fill > 0.04 && fill < 1.96;
    var b1 = document.getElementById('metal1');
    if (b1) {
      b1.textContent = metal ? 'металл' : 'изолятор';
      b1.className = 'badge ' + (metal ? 'metal' : 'ins');
      b1.dataset.value = metal ? 'metal' : 'insulator';
    }
    var b2 = document.getElementById('metal2');
    if (b2) {
      b2.textContent = metal ? 'металл' : 'изолятор';
      b2.className = 'badge ' + (metal ? 'metal' : 'ins');
    }
    setv('nfeGap', num(2 * Math.abs(state.U), 3), 2 * Math.abs(state.U));
    var kNote = document.getElementById('kNote');
    if (kNote) {
      if (state.k < 0.04) kNote.textContent = state.orb === 'p'
        ? 'k = 0: p-орбитали в фазе, соседние лепестки смотрят друг на друга разными знаками — антисвязывание, потолок зоны.'
        : 'k = 0: все s-орбитали в одной фазе — связывающая комбинация, дно зоны.';
      else if (Math.abs(state.k - 1) < 0.05) kNote.textContent = state.orb === 'p'
        ? 'k = π/a: знаки p-орбиталей чередуются, лепестки между атомами совпадают — связывание, дно перевёрнутой зоны. λ = 2a.'
        : 'k = π/a: знаки чередуются — антисвязывание, потолок зоны. Стоячая волна, λ = 2a.';
      else kNote.textContent = 'Промежуточное k: огибающая e^{ikx} имеет длину волны λ = 2π/k. Соседние атомы сдвинуты по фазе на ka.';
    }
  }

  function seriesFor(state) {
    var scheme = state.scheme;
    var el = state.el;
    var x0 = scheme === 'red' ? -1 : -3;
    var x1 = scheme === 'red' ? 1 : 3;
    var N = scheme === 'red' ? 80 : 120;
    var series = [];
    if (el === 'free' && scheme === 'ext') {
      var pts = [];
      for (var i = 0; i <= N; i++) {
        var x = x0 + (x1 - x0) * i / N;
        pts.push({ x: x, y: x * x });
      }
      series.push({ color: COLORS[0], pts: pts, width: 2.4 });
    } else if (el === 'free' && scheme === 'per') {
      for (var rep = -1; rep <= 1; rep++) {
        for (var n = 0; n <= 3; n++) {
          var ptsP = [];
          for (var j = 0; j <= 40; j++) {
            var xr = -1 + 2 * j / 40;
            ptsP.push({ x: xr + 2 * rep, y: (xr + 2 * (n - 1)) * (xr + 2 * (n - 1)) });
          }
          series.push({ color: COLORS[n % COLORS.length], pts: ptsP, width: 1.8 });
        }
      }
    } else if (el === 'tb' && scheme === 'ext') {
      var pt = [];
      for (var q = 0; q <= N; q++) {
        var xq = x0 + (x1 - x0) * q / N;
        pt.push({ x: xq, y: M().tb1(xq * Math.PI, 1, state.eps, tEff(state)) });
      }
      series.push({ color: COLORS[0], pts: pt, width: 2.4 });
    } else {
      var nBands = el === 'tb' ? 1 : 4;
      var buckets = [];
      for (var b = 0; b < nBands; b++) buckets.push([]);
      var steps = scheme === 'per' ? 50 : 70;
      var copies = scheme === 'per' ? [-2, 0, 2] : [0];
      for (var c = 0; c < copies.length; c++) {
        for (var s = 0; s <= steps; s++) {
          var xr2 = -1 + 2 * s / steps;
          var ys = bandsReduced(state, xr2).slice(0, nBands);
          for (var bi = 0; bi < ys.length; bi++) buckets[bi].push({ x: xr2 + copies[c], y: ys[bi] });
        }
        for (var z = 0; z < nBands; z++) buckets[z].push({ x: NaN, y: NaN });
      }
      for (var k = 0; k < buckets.length; k++) series.push({ color: COLORS[k % COLORS.length], pts: buckets[k], width: 2.2 });
    }
    var yMin = 0;
    var yMax = scheme === 'ext' ? 9.5 : 5.2;
    if (el === 'tb') {
      yMin = state.eps - 2.5 * Math.abs(state.t);
      yMax = state.eps + 2.5 * Math.abs(state.t);
    }
    var mx = state.k;
    if (mx < x0 || mx > x1) mx = fold(state.k);
    var yMark = energyAt(state, mx);
    return { series: series, x0: x0, x1: x1, yMin: yMin, yMax: yMax, yMark: yMark, mx: mx };
  }

  function drawBand(state, colors) {
    var canvas = document.getElementById('cvBand');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var pack = seriesFor(state);
    var vlines = [{ x: 1, label: 'π/a', color: colors.muted, dash: [3, 3] }, { x: -1, color: colors.muted, dash: [3, 3] }];
    if (state.el === 'tb') {
      var kF = M().kFermi1d(state.fill, 1) / Math.PI;
      vlines.push({ x: kF, label: 'kF', color: colors.good, dash: [4, 3] });
      vlines.push({ x: -kF, color: colors.good, dash: [4, 3] });
    }
    var plot = LChart.draw(fit.ctx, fit.w, fit.h, {
      xMin: pack.x0, xMax: pack.x1, yMin: pack.yMin, yMax: pack.yMax,
      xLabel: 'k / (π/a)',
      yLabel: state.el === 'tb' ? 'E' : 'E / E₀',
      series: pack.series,
      vlines: vlines,
      marker: { x: pack.mx, y: pack.yMark, color: colors.acc2 }
    }, colors);
    canvas._pixToK = function (px) {
      var v = plot.pixToX(px);
      if (v < pack.x0) v = pack.x0;
      if (v > pack.x1) v = pack.x1;
      return v;
    };
  }

  function drawFs(state, colors) {
    var canvas = document.getElementById('cvFs');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var pad = 16;
    var reach = Math.PI * 1.05;
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, pad), w, h, pad);
    var n = 56;
    var grid = [];
    var energies = [];
    var t = tEff(state);
    for (var j = 0; j < n; j++) {
      var row = [];
      for (var i = 0; i < n; i++) {
        var kx = -Math.PI + (i + 0.5) * 2 * Math.PI / n;
        var ky = -Math.PI + (j + 0.5) * 2 * Math.PI / n;
        var E = M().tb2(kx, ky, 1, state.eps, t);
        row.push(E);
        energies.push(E);
      }
      grid.push(row);
    }
    var Ef = M().fermiFromFilling(energies, state.fill);
    setv('efNow', num(Ef, 3), Ef);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (grid[y][x] > Ef) continue;
        var p0 = map.toS(-Math.PI + x * 2 * Math.PI / n, -Math.PI + y * 2 * Math.PI / n);
        var p1 = map.toS(-Math.PI + (x + 1) * 2 * Math.PI / n, -Math.PI + (y + 1) * 2 * Math.PI / n);
        ctx.fillStyle = colors.z1;
        ctx.fillRect(p1[0], p1[1], p0[0] - p1[0], p0[1] - p1[1]);
      }
    }
    ctx.beginPath();
    ctx.strokeStyle = colors.acc2;
    ctx.lineWidth = 2;
    for (var yy = 0; yy < n - 1; yy++) {
      for (var xx = 0; xx < n - 1; xx++) {
        var c00 = grid[yy][xx] <= Ef ? 1 : 0;
        var c10 = grid[yy][xx + 1] <= Ef ? 1 : 0;
        var c01 = grid[yy + 1][xx] <= Ef ? 1 : 0;
        var c11 = grid[yy + 1][xx + 1] <= Ef ? 1 : 0;
        var bits = c00 | (c10 << 1) | (c11 << 2) | (c01 << 3);
        if (bits === 0 || bits === 15) continue;
        var x0 = -Math.PI + (xx + 0.5) * 2 * Math.PI / n;
        var y0 = -Math.PI + (yy + 0.5) * 2 * Math.PI / n;
        var x1 = -Math.PI + (xx + 1.5) * 2 * Math.PI / n;
        var y1 = -Math.PI + (yy + 1.5) * 2 * Math.PI / n;
        var xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        var segs = {
          1: [[x0, ym], [xm, y0]], 2: [[xm, y0], [x1, ym]], 4: [[x1, ym], [xm, y1]], 8: [[xm, y1], [x0, ym]],
          3: [[x0, ym], [x1, ym]], 6: [[xm, y0], [xm, y1]], 9: [[xm, y0], [xm, y1]], 12: [[x0, ym], [x1, ym]],
          7: [[x0, ym], [xm, y1]], 11: [[xm, y0], [x1, ym]], 13: [[x1, ym], [xm, y1]], 14: [[xm, y0], [x0, ym]],
          5: [[x0, ym], [xm, y0]], 10: [[xm, y0], [x1, ym]]
        };
        var sg = segs[bits];
        if (!sg) continue;
        for (var s = 0; s < sg.length; s += 1) {
          if (s % 1 === 0 && sg[s + 1]) {
            var a = map.toS(sg[s][0], sg[s][1]);
            var b = map.toS(sg[s + 1][0], sg[s + 1][1]);
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
          }
        }
      }
    }
    ctx.stroke();
    var box = [M().v2(-Math.PI, -Math.PI), M().v2(Math.PI, -Math.PI), M().v2(Math.PI, Math.PI), M().v2(-Math.PI, Math.PI)];
    LDraw.poly(ctx, box.map(function (p) { var s = map.toS(p.x, p.y); return { x: s[0], y: s[1] }; }), { stroke: colors.fg, lw: 1.6 });
    var labels = [{ n: 'Γ', x: 0, y: 0 }, { n: 'X', x: Math.PI, y: 0 }, { n: 'M', x: Math.PI, y: Math.PI }];
    for (var L = 0; L < labels.length; L++) {
      var sp = map.toS(labels[L].x, labels[L].y);
      LDraw.text(ctx, labels[L].n, sp[0] + 8, sp[1] - 8, { halo: colors.card, color: colors.fg });
    }
    var pathCanvas = document.getElementById('cvTbPath');
    if (!pathCanvas) return;
    var pf = LDraw.fit(pathCanvas);
    var stops = M().squareStops(1);
    var sampled = M().samplePath(stops, 40, function (kx, ky) { return M().tb2(kx, ky, 1, state.eps, t); });
    LChart.draw(pf.ctx, pf.w, pf.h, {
      xMin: 0, xMax: sampled.length,
      yMin: state.eps - 4.3 * Math.abs(t),
      yMax: state.eps + 4.3 * Math.abs(t),
      xLabel: 'Γ–X–M–Γ',
      yLabel: 'E',
      series: [{ color: colors.acc, pts: sampled.pts.map(function (p) { return { x: p.d, y: p.y }; }), width: 2.3 }],
      vlines: sampled.ticks.map(function (tk) { return { x: tk.d, label: tk.name, color: colors.muted, dash: [3, 3] }; }),
      hlines: [{ y: Ef, color: colors.acc2 }],
      xTicks: sampled.ticks.map(function (tk) { return tk.d; })
    }, colors);
    setv('tb2Width', num(M().tb2Bandwidth(t), 3), M().tb2Bandwidth(t));
  }

  function drawBloch(state, colors) {
    var canvas = document.getElementById('cvBloch');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var a = state.a;
    var k = state.k * Math.PI / a;
    var orb = state.orb;
    var sigma = 0.36 * a;
    var nShow = 7;
    var x0 = -nShow * a * 0.5;
    var x1 = nShow * a * 0.5;
    var samples = [];
    var rMax = 1e-6, iMax = 1e-6, aMax = 1e-6;
    var steps = 360;
    for (var i = 0; i <= steps; i++) {
      var x = x0 + (x1 - x0) * i / steps;
      var p = M().blochPsi(x, k, a, orb, sigma, 8);
      samples.push({ x: x, re: p.re, im: p.im, abs2: p.abs2 });
      rMax = Math.max(rMax, Math.abs(p.re));
      iMax = Math.max(iMax, Math.abs(p.im));
      aMax = Math.max(aMax, p.abs2);
    }
    var pad = 16;
    var base = h * 0.62;
    var amp = h * 0.28;
    function X(x) { return pad + (x - x0) / (x1 - x0) * (w - 2 * pad); }
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(pad, base);
    ctx.lineTo(w - pad, base);
    ctx.stroke();
    var mode = state.psi || 're';
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    var nodes = 0;
    var prev = 0;
    for (var s = 0; s < samples.length; s++) {
      var sm = samples[s];
      var val = mode === 'im' ? sm.im / iMax : mode === 'abs' ? sm.abs2 / aMax : sm.re / rMax;
      var px = X(sm.x);
      var py = base - val * amp;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      if (mode !== 'abs' && s > 0 && prev * (mode === 'im' ? sm.im : sm.re) < 0) nodes++;
      prev = mode === 'im' ? sm.im : sm.re;
    }
    ctx.strokeStyle = mode === 'im' ? colors.acc2 : colors.acc;
    ctx.stroke();
    if (Math.abs(k) > 0.05 && mode !== 'abs') {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.2;
      for (var e = 0; e <= steps; e++) {
        var xe = x0 + (x1 - x0) * e / steps;
        var env = Math.cos(k * xe);
        var pxe = X(xe);
        var pye = base - env * amp * 0.72;
        if (e === 0) ctx.moveTo(pxe, pye);
        else ctx.lineTo(pxe, pye);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (var n = -nShow; n <= nShow; n++) {
      var xn = n * a;
      if (xn < x0 || xn > x1) continue;
      LDraw.circle(ctx, X(xn), base, 7, { fill: colors.fg, stroke: colors.card, lw: 2 });
    }
    setv('nodeNow', String(nodes), nodes);
    LDraw.text(ctx, mode === 'abs' ? '|ψ|²' : (mode === 'im' ? 'Im ψ' : 'Re ψ'), 12, 16, { halo: colors.card, color: colors.muted, align: 'left', font: '12px sans-serif' });
  }

  function drawFourier(state, colors) {
    var canvas = document.getElementById('cvFour');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var k = state.k * Math.PI / state.a;
    var sigma = 0.36 * state.a;
    var coeffs = M().planeWaveCoeffs(k, state.a, state.orb, sigma, 5);
    var pad = { l: 36, r: 12, t: 16, b: 28 };
    var qMin = coeffs[0].q, qMax = coeffs[coeffs.length - 1].q;
    var span = (qMax - qMin) || 1;
    qMin -= span * 0.08;
    qMax += span * 0.08;
    function X(q) { return pad.l + (q - qMin) / (qMax - qMin) * (w - pad.l - pad.r); }
    var base = h - pad.b;
    ctx.strokeStyle = colors.muted;
    ctx.beginPath();
    ctx.moveTo(pad.l, base);
    ctx.lineTo(w - pad.r, base);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = colors.good;
    ctx.lineWidth = 1.4;
    var curveN = 80;
    for (var i = 0; i <= curveN; i++) {
      var q = qMin + (qMax - qMin) * i / curveN;
      var amp = M().orbitalFT(q, state.orb, sigma);
      var maxA = coeffs.reduce(function (m, c) { return Math.max(m, c.amp); }, 1e-9);
      var py = base - (amp / maxA) * (h - pad.t - pad.b - 8);
      if (i === 0) ctx.moveTo(X(q), py);
      else ctx.lineTo(X(q), py);
    }
    ctx.stroke();
    var bw = Math.max(6, (w - pad.l - pad.r) / coeffs.length * 0.45);
    for (var c = 0; c < coeffs.length; c++) {
      var cf = coeffs[c];
      var x = X(cf.q);
      var bh = cf.norm * (h - pad.t - pad.b - 10);
      ctx.fillStyle = colors.acc;
      ctx.fillRect(x - bw / 2, base - bh, bw, bh);
      LDraw.text(ctx, cf.n === 0 ? 'k' : (cf.n > 0 ? 'k+' + cf.n + 'G' : 'k' + cf.n + 'G'), x, base + 12, { halo: colors.card, color: colors.muted, font: '10px sans-serif' });
    }
  }

  function draw(state, colors) {
    drawBand(state, colors);
    drawFs(state, colors);
    drawBloch(state, colors);
    drawFourier(state, colors);
  }
  function onBand(px) {
    var canvas = document.getElementById('cvBand');
    if (!canvas || !canvas._pixToK) return null;
    return canvas._pixToK(px);
  }

  globalThis.LSecElectron = { sync: sync, draw: draw, onBand: onBand, tEff: tEff };
})();
