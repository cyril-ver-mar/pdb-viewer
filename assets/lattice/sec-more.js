/* Дифракция, структурный фактор, Пайерлсовский переход, качественное тепловое расширение. */
(function () {
  'use strict';
  var M = function () { return globalThis.LatticeMath; };

  function num(v, d) {
    if (!isFinite(v)) return '—';
    return v.toFixed(d == null ? 2 : d);
  }
  function setv(id, text, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (value != null) el.dataset.value = String(value);
  }

  function basisOf(state) {
    if (state.basis === 'd1') return [{ x: 0, y: 0, f: 1 }, { x: state.sep, y: 0, f: state.f2 }];
    if (state.basis === 'prim') return [{ x: 0, y: 0, f: 1 }];
    return [{ x: 0, y: 0, f: 1 }, { x: 0.5, y: 0.5, f: state.f2 }];
  }

  function sync(state) {
    var p = M().peierls(Math.PI / state.a, state.a, Math.abs(state.t), state.delta);
    setv('peierlsGap', num(p.gap, 3), p.gap);
    var ms = document.getElementById('mstarMore');
    if (ms) {
      var src = document.getElementById('mstar');
      ms.textContent = src ? src.textContent : '—';
      ms.dataset.value = src ? src.dataset.value : '';
    }
    var kind = document.getElementById('mstarKindMore');
    var srcK = document.getElementById('mstarKind');
    if (kind && srcK) kind.textContent = srcK.textContent;
  }

  function drawEwald(state, colors) {
    var canvas = document.getElementById('cvEwald');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var kind = state.lat === 'hex' || state.lat === 'square' || state.lat === 'rect' || state.lat === 'crect' ? state.lat : 'square';
    var d = M().directVectors(kind, state.a, state.b, state.gam);
    var rec = M().reciprocal(d.a1, d.a2);
    var lam = Math.max(0.3, state.lam) * state.a;
    var ang = state.ang * Math.PI / 180;
    var ew = M().ewald(rec.b1, rec.b2, lam, ang, 4);
    var reach = Math.max(ew.radius * 2.3, M().len2(rec.b1) * 3);
    var pad = 16;
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, pad), w, h, pad);
    var c = map.toS(ew.center.x, ew.center.y);
    var rpx = map.toS(ew.center.x + ew.radius, ew.center.y)[0] - c[0];
    ctx.beginPath();
    ctx.strokeStyle = colors.acc;
    ctx.lineWidth = 1.6;
    ctx.arc(c[0], c[1], Math.abs(rpx), 0, Math.PI * 2);
    ctx.stroke();
    var o = map.toS(0, 0);
    var tip = map.toS(ew.k.x, ew.k.y);
    LDraw.arrow(ctx, c[0], c[1], o[0], o[1], colors.good, 2);
    LDraw.text(ctx, 'k', (c[0] + o[0]) / 2, (c[1] + o[1]) / 2 - 10, { halo: colors.card, color: colors.good, font: '12px sans-serif' });
    var hits = 0;
    for (var i = 0; i < ew.points.length; i++) {
      var g = ew.points[i];
      var sp = map.toS(g.x, g.y);
      if (sp[0] < -8 || sp[0] > w + 8 || sp[1] < -8 || sp[1] > h + 8) continue;
      var hit = ew.hits.some(function (q) { return q.i === g.i && q.j === g.j; });
      if (hit) hits++;
      LDraw.circle(ctx, sp[0], sp[1], hit ? 6 : 3.2, { fill: hit ? colors.acc2 : colors.fg });
      if (hit) {
        var kout = { x: ew.k.x + g.x, y: ew.k.y + g.y };
        var end = map.toS(kout.x * 0.35, kout.y * 0.35);
        LDraw.arrow(ctx, o[0], o[1], end[0], end[1], colors.acc2, 1.6);
      }
    }
    setv('ewaldHits', String(ew.hits.length), ew.hits.length);
    var note = document.getElementById('braggNote');
    if (note) {
      note.textContent = ew.hits.length
        ? 'Узлы на сфере Эвальда: ' + ew.hits.map(function (g) { return g.i + ',' + g.j; }).join('; ') + '. Для них выполняется условие Брэгга.'
        : 'Сфера проходит через Γ и не задевает другие узлы. Уменьшите λ (больше сфера) или поверните кристалл. Первое отражение возможно при λ < 2d.';
    }
    drawScreen(state, colors, ew);
  }

  function drawScreen(state, colors, ew) {
    var canvas = document.getElementById('cvDiff');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.38;
    ctx.beginPath();
    ctx.strokeStyle = colors.line;
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    function spot(angle, color, label) {
      var x = cx + Math.cos(angle) * R * 0.78;
      var y = cy - Math.sin(angle) * R * 0.78;
      LDraw.circle(ctx, x, y, 7, { fill: color });
      if (label) LDraw.text(ctx, label, x, y - 16, { halo: colors.card, color: colors.fg, font: '11px sans-serif' });
    }
    var ang0 = Math.atan2(ew.k.y, ew.k.x);
    spot(ang0, colors.good, '0');
    for (var i = 0; i < ew.hits.length; i++) {
      var g = ew.hits[i];
      var kout = { x: ew.k.x + g.x, y: ew.k.y + g.y };
      spot(Math.atan2(kout.y, kout.x), colors.acc2, g.i + '' + g.j);
    }
    LDraw.text(ctx, 'экран', 12, 16, { halo: colors.card, color: colors.muted, align: 'left', font: '12px sans-serif' });
  }

  function drawSF(state, colors) {
    var canvas = document.getElementById('cvSF');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var basis = basisOf(state);
    var a = state.a, b = state.basis === 'crect' ? state.b : state.a;
    var b1 = { x: M().TAU / a, y: 0 };
    var b2 = { x: 0, y: M().TAU / b };
    var reach = 3.3 * Math.max(b1.x, b2.y);
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, 20), w, h, 20);
    var absent = 0, present = 0;
    var rows = [];
    for (var hkl = -3; hkl <= 3; hkl++) {
      for (var k = -3; k <= 3; k++) {
        if (state.basis === 'd1' && k !== 0) continue;
        var S = M().structureFactor(basis, hkl, k);
        var pos = { x: hkl * b1.x, y: k * b2.y };
        var sp = map.toS(pos.x, pos.y);
        var mag = Math.sqrt(S.mag2);
        if (S.mag2 < 1e-6) {
          absent++;
          LDraw.circle(ctx, sp[0], sp[1], 7, { stroke: colors.muted, lw: 1.4 });
        } else {
          present++;
          LDraw.circle(ctx, sp[0], sp[1], 3 + mag * 2.2, { fill: colors.acc });
        }
        if (Math.abs(hkl) <= 2 && Math.abs(k) <= 2) rows.push({ h: hkl, k: k, s: S.mag2 });
      }
    }
    var host = document.getElementById('sfTable');
    if (host) {
      host.innerHTML = '';
      rows.sort(function (p, q) { return Math.abs(p.h) + Math.abs(p.k) - Math.abs(q.h) - Math.abs(q.k); });
      for (var i = 0; i < rows.length && i < 12; i++) {
        var td = document.createElement('span');
        td.textContent = rows[i].h + '' + rows[i].k + ': ' + (rows[i].s < 1e-4 ? '0' : num(rows[i].s, 2));
        if (rows[i].s < 1e-4) td.className = 'miss';
        host.appendChild(td);
      }
    }
    var note = document.getElementById('sfNote');
    if (note) {
      if (state.basis === 'crect') note.textContent = 'Центрированная ячейка: S = 1 + exp(iπ(h+k)). При нечётном h+k рефлекс погашен. Живых пятен ' + present + ', погашено ' + absent + '.';
      else if (state.basis === 'd1') note.textContent = 'Цепочка с базисом: |S|² = f₁² + f₂² + 2 f₁ f₂ cos(2π h u). При u = 1/2 и f₁ = f₂ нечётные h гаснут.';
      else note.textContent = 'Один атом в ячейке: структурный фактор не обращается в нуль, систематических погасаний нет.';
    }
  }

  function drawPeierls(state, colors) {
    var canvas = document.getElementById('cvPeierls');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var a = state.a;
    var t = Math.abs(state.t);
    var delta = state.delta;
    var lo = [], hi = [];
    for (var i = 0; i <= 80; i++) {
      var kappa = i / 80;
      var k = kappa * Math.PI / a;
      var p = M().peierls(k, a, t, delta);
      lo.push({ x: kappa, y: p.minus });
      hi.push({ x: kappa, y: p.plus });
    }
    var gap = M().peierls(Math.PI / a, a, t, delta).gap;
    LChart.draw(fit.ctx, fit.w, fit.h, {
      xMin: 0, xMax: 1, yMin: -2.3 * t, yMax: 2.3 * t,
      xLabel: 'k / (π/a)',
      yLabel: 'E',
      series: [
        { color: colors.acc, pts: lo, width: 2.4 },
        { color: colors.acc2, pts: hi, width: 2.4 }
      ],
      bands: gap > 1e-4 ? [{ y0: -gap / 2, y1: gap / 2, color: 'rgba(226,106,61,.18)' }] : [],
      hlines: [{ y: 0, color: colors.muted }],
      vlines: [{ x: 1, label: 'граница', color: colors.muted, dash: [3, 3] }]
    }, colors);
    var chain = document.getElementById('cvDimer');
    if (!chain) return;
    var cf = LDraw.fit(chain);
    var ctx = cf.ctx, w = cf.w, h = cf.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var n = 8;
    var y = h * 0.55;
    var span = w - 36;
    var base = span / n;
    var shorten = delta * base * 0.35;
    var x = 18;
    for (var c = 0; c < n; c++) {
      LDraw.circle(ctx, x, y, 10, { fill: c % 2 ? colors.acc2 : colors.acc, stroke: colors.card, lw: 2 });
      if (c < n - 1) {
        var step = base + (c % 2 === 0 ? -shorten : shorten);
        ctx.strokeStyle = colors.fg;
        ctx.lineWidth = c % 2 === 0 ? 3.2 : 1.3;
        ctx.beginPath();
        ctx.moveTo(x + 12, y);
        ctx.lineTo(x + step - 12, y);
        ctx.stroke();
        x += step;
      }
    }
    LDraw.text(ctx, 'полиацетилен: =C—C=C—C=', w / 2, 18, { halo: colors.card, color: colors.fg, font: '600 13px sans-serif' });
  }

  function drawMorse(state, colors) {
    var canvas = document.getElementById('cvMorse');
    if (!canvas) return;
    var fit = LDraw.fit(canvas);
    var E = Math.max(0.04, Math.min(0.9, state.amp));
    var avg = M().morseTurnAverage(E);
    var pts = [];
    for (var i = 0; i <= 80; i++) {
      var x = -1.4 + 5.4 * i / 80;
      var e = Math.exp(-x);
      pts.push({ x: x, y: (1 - e) * (1 - e) });
    }
    LChart.draw(fit.ctx, fit.w, fit.h, {
      xMin: -1.4, xMax: 4, yMin: 0, yMax: 1.05,
      xLabel: 'α (r − r₀)',
      yLabel: 'V',
      series: [{ color: colors.acc, pts: pts, width: 2.3 }],
      hlines: [{ y: E, color: colors.acc2 }],
      vlines: [{ x: avg.mean, label: '⟨r⟩', color: colors.good, dash: [4, 3] }, { x: 0, color: colors.muted, dash: [2, 3] }]
    }, colors);
    setv('morseMean', num(avg.mean, 3), avg.mean);
  }

  function draw(state, colors) {
    drawEwald(state, colors);
    drawSF(state, colors);
    drawPeierls(state, colors);
    drawMorse(state, colors);
  }

  globalThis.LSecMore = { sync: sync, draw: draw };
})();
