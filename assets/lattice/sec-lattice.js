/* Прямая и обратная решётка, ячейка Вигнера–Зейтца, зоны Бриллюэна, 3D-форма. */
(function () {
  'use strict';
  var M = function () { return globalThis.LatticeMath; };
  var view = null;

  function fmt(v) {
    if (!isFinite(v)) return '—';
    var s = (Math.round(v * 1000) / 1000).toFixed(3);
    return s.replace(/\.?0+$/, '').replace('.', ',');
  }
  function fmtVec(v) { return '(' + fmt(v.x) + '; ' + fmt(v.y) + ')'; }

  function sync(state) {
    var d = M().directVectors(state.lat, state.a, state.b, state.gam);
    var r = M().reciprocal(d.a1, d.a2);
    var set = function (id, text, value) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      if (value != null) el.dataset.value = String(value);
    };
    if (state.dim === '1') {
      set('outA1', fmt(state.a));
      set('outB1', fmt(2 * Math.PI / state.a));
    } else {
      set('outA1', fmtVec(d.a1));
      set('outA2', fmtVec(d.a2));
      set('outB1', fmtVec(r.b1));
      set('outB2', fmtVec(r.b2));
      set('outArea', fmt(r.area));
      set('outDot', fmt(M().dot2(r.b1, d.a1)) + ' ; ' + fmt(M().dot2(r.b1, d.a2)) + ' ; ' + fmt(M().dot2(r.b2, d.a1)) + ' ; ' + fmt(M().dot2(r.b2, d.a2)));
    }
    var K = M().hexK(state.a);
    set('hexK', fmt(K.x), K.x);
    var model = M().brillouin3d(state.bz3, state.a, state.ca);
    set('bzShape', model.shape, model.shape);
    set('bzTitle', model.title);
    set('bzCounts', model.counts.faces + ' граней, ' + model.counts.vertices + ' вершин', model.counts.faces);
    set('bzHex', String(model.counts.hex || 0), model.counts.hex || 0);
    set('bzSq', String(model.counts.square || 0), model.counts.square || 0);
    set('bzBlurb', model.blurb);
    var bEl = document.getElementById('in-b');
    var gEl = document.getElementById('in-gam');
    if (bEl) bEl.disabled = state.lat === 'square' || state.lat === 'hex';
    if (gEl) gEl.disabled = state.lat !== 'oblique';
    if (view) view.auto = String(state.spin3) !== '0';
  }

  function draw1d(state, colors) {
    var a = state.a;
    var direct = LDraw.fit(document.getElementById('cvDirect'));
    var recip = LDraw.fit(document.getElementById('cvRecip'));
    paintLine(direct, colors, a, false);
    paintLine(recip, colors, a, true);
  }

  function paintLine(fit, colors, a, reciprocal) {
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var reach = reciprocal ? 3.2 * (2 * Math.PI / a) : 3.4 * a;
    var pad = 28;
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, pad), w, h, pad);
    var y = map.toS(0, 0)[1];
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(w - 18, y);
    ctx.stroke();
    if (!reciprocal) {
      var left = map.toS(-a / 2, 0)[0];
      var right = map.toS(a / 2, 0)[0];
      ctx.fillStyle = colors.z1;
      ctx.fillRect(Math.min(left, right), y - 28, Math.abs(right - left), 56);
      LDraw.text(ctx, 'ячейка ВЗ', (left + right) / 2, y + 46, { halo: colors.card, color: colors.acc, font: '600 12px sans-serif' });
      for (var n = -4; n <= 4; n++) {
        var p = map.toS(n * a, 0);
        LDraw.circle(ctx, p[0], p[1], 7, { fill: colors.acc });
      }
      var o = map.toS(0, 0);
      var aEnd = map.toS(a, 0);
      LDraw.arrow(ctx, o[0], o[1] - 46, aEnd[0], o[1] - 46, colors.acc);
      LDraw.text(ctx, 'a', (o[0] + aEnd[0]) / 2, o[1] - 60, { halo: colors.card, color: colors.acc });
    } else {
      var b = 2 * Math.PI / a;
      var zones = [
        { x0: -0.5 * b, x1: 0.5 * b, col: colors.z1, name: '1-я ЗБ' },
        { x0: -1.5 * b, x1: -0.5 * b, col: colors.z2, name: '' },
        { x0: 0.5 * b, x1: 1.5 * b, col: colors.z2, name: '2-я' },
        { x0: -2.5 * b, x1: -1.5 * b, col: colors.z3, name: '' },
        { x0: 1.5 * b, x1: 2.5 * b, col: colors.z3, name: '3-я' }
      ];
      for (var z = 0; z < zones.length; z++) {
        var z0 = map.toS(zones[z].x0, 0)[0];
        var z1 = map.toS(zones[z].x1, 0)[0];
        ctx.fillStyle = zones[z].col;
        ctx.fillRect(Math.min(z0, z1), y - 26, Math.abs(z1 - z0), 52);
        if (zones[z].name) LDraw.text(ctx, zones[z].name, (z0 + z1) / 2, y + 40, { halo: colors.card, color: colors.fg, font: '600 11px sans-serif' });
      }
      for (var m = -4; m <= 4; m++) {
        var g = map.toS(m * b, 0);
        LDraw.circle(ctx, g[0], g[1], m === 0 ? 6 : 5, { fill: m === 0 ? colors.acc2 : colors.acc2 });
        if (m !== 0) {
          var br = map.toS((m - 0.5) * b, 0);
          ctx.strokeStyle = colors.fg;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(br[0], y - 18);
          ctx.lineTo(br[0], y + 18);
          ctx.stroke();
        }
      }
      LDraw.text(ctx, 'Γ', map.toS(0, 0)[0], y - 40, { halo: colors.card, color: colors.fg });
      LDraw.text(ctx, 'плоскости Брэгга', w / 2, 16, { halo: colors.card, color: colors.muted, font: '12px sans-serif' });
      var o2 = map.toS(0, 0);
      var bEnd = map.toS(b, 0);
      LDraw.arrow(ctx, o2[0], o2[1] - 48, bEnd[0], o2[1] - 48, colors.acc2);
      LDraw.text(ctx, 'b = 2π/a', (o2[0] + bEnd[0]) / 2, o2[1] - 64, { halo: colors.card, color: colors.acc2, font: '600 12px sans-serif' });
    }
  }

  function draw2d(state, colors) {
    var d = M().directVectors(state.lat, state.a, state.b, state.gam);
    var pack = M().bzPolygon(state.lat, state.a, state.b, state.gam);
    var direct = LDraw.fit(document.getElementById('cvDirect'));
    var recip = LDraw.fit(document.getElementById('cvRecip'));
    var reachD = 3.1 * Math.max(M().len2(d.a1), M().len2(d.a2));
    paintDirect(direct, colors, d, reachD);
    var reachR = 3.15 * Math.max(M().len2(pack.recip.b1), M().len2(pack.recip.b2));
    paintRecip(recip, colors, pack, reachR);
  }

  function paintDirect(fit, colors, d, reach) {
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var pad = 18;
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, pad), w, h, pad);
    var pts = M().latticePoints(d.a1, d.a2, 4);
    var cell = M().voronoi(pts, { x: 0, y: 0 }, reach * 2);
    var sp = cell.map(function (p) { var s = map.toS(p.x, p.y); return { x: s[0], y: s[1] }; });
    LDraw.poly(ctx, sp, { fill: colors.z1, stroke: colors.acc, lw: 2 });
    if (d.kind === 'crect') {
      var rect = [M().v2(0, 0), M().v2(d.a, 0), M().v2(d.a, d.b), M().v2(0, d.b)];
      LDraw.poly(ctx, rect.map(function (p) { var s = map.toS(p.x, p.y); return { x: s[0], y: s[1] }; }), { stroke: colors.muted, dash: [5, 4], lw: 1.3 });
    } else {
      var prim = [M().v2(0, 0), d.a1, M().add2(d.a1, d.a2), d.a2];
      LDraw.poly(ctx, prim.map(function (p) { var s = map.toS(p.x, p.y); return { x: s[0], y: s[1] }; }), { stroke: colors.muted, dash: [4, 3], lw: 1.2 });
    }
    for (var i = 0; i < pts.length; i++) {
      var s = map.toS(pts[i].x, pts[i].y);
      if (s[0] < -10 || s[0] > w + 10 || s[1] < -10 || s[1] > h + 10) continue;
      LDraw.circle(ctx, s[0], s[1], 5.5, { fill: colors.acc, stroke: colors.card, lw: 1.5 });
    }
    var o = map.toS(0, 0);
    var e1 = map.toS(d.a1.x, d.a1.y);
    var e2 = map.toS(d.a2.x, d.a2.y);
    LDraw.arrow(ctx, o[0], o[1], e1[0], e1[1], colors.acc);
    LDraw.arrow(ctx, o[0], o[1], e2[0], e2[1], colors.good);
    LDraw.text(ctx, 'a₁', e1[0] + 8, e1[1] - 8, { halo: colors.card, color: colors.acc });
    LDraw.text(ctx, 'a₂', e2[0] + 8, e2[1] + 8, { halo: colors.card, color: colors.good });
    LDraw.text(ctx, 'ячейка Вигнера–Зейтца', 16, 16, { halo: colors.card, color: colors.muted, align: 'left', font: '12px sans-serif' });
  }

  function paintRecip(fit, colors, pack, reach) {
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var pad = 18;
    var map = LDraw.mapper(LDraw.squareBounds(reach, w, h, pad), w, h, pad);
    var gs = pack.gs;
    var step = w > 700 ? 3 : 4;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var world = map.toW(x + step / 2, y + step / 2);
        var z = M().zoneIndex(world.x, world.y, gs);
        if (z === 1) ctx.fillStyle = colors.z1;
        else if (z === 2) ctx.fillStyle = colors.z2;
        else if (z === 3) ctx.fillStyle = colors.z3;
        else continue;
        ctx.fillRect(x, y, step, step);
      }
    }
    ctx.save();
    ctx.strokeStyle = colors.fg;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    var lines = gs.filter(function (g) { return !(g.i === 0 && g.j === 0); });
    lines.sort(function (a, b) { return (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y); });
    lines = lines.slice(0, 10);
    for (var i = 0; i < lines.length; i++) {
      var g = lines[i];
      var mid = map.toS(g.x / 2, g.y / 2);
      var px = -g.y, py = g.x;
      var pl = Math.hypot(px, py) || 1;
      var far = map.toS(g.x / 2 + px / pl * reach, g.y / 2 + py / pl * reach);
      var far2 = map.toS(g.x / 2 - px / pl * reach, g.y / 2 - py / pl * reach);
      ctx.beginPath();
      ctx.moveTo(far[0], far[1]);
      ctx.lineTo(far2[0], far2[1]);
      ctx.stroke();
      void mid;
    }
    ctx.restore();
    var bz = pack.poly.map(function (p) { var s = map.toS(p.x, p.y); return { x: s[0], y: s[1] }; });
    LDraw.poly(ctx, bz, { stroke: colors.fg, lw: 2.4 });
    for (var j = 0; j < gs.length; j++) {
      var s = map.toS(gs[j].x, gs[j].y);
      if (s[0] < 0 || s[0] > w || s[1] < 0 || s[1] > h) continue;
      LDraw.circle(ctx, s[0], s[1], gs[j].i === 0 && gs[j].j === 0 ? 5 : 3.5, { fill: colors.acc2 });
    }
    var o = map.toS(0, 0);
    var b1 = map.toS(pack.recip.b1.x, pack.recip.b1.y);
    var b2 = map.toS(pack.recip.b2.x, pack.recip.b2.y);
    LDraw.arrow(ctx, o[0], o[1], b1[0], b1[1], colors.acc2);
    LDraw.arrow(ctx, o[0], o[1], b2[0], b2[1], colors.good);
    LDraw.text(ctx, 'b₁', b1[0] + 10, b1[1] - 8, { halo: colors.card, color: colors.acc2 });
    LDraw.text(ctx, 'b₂', b2[0] + 10, b2[1] + 10, { halo: colors.card, color: colors.good });
    var pts = pack.points;
    for (var p = 0; p < pts.length; p++) {
      var sp = map.toS(pts[p].x, pts[p].y);
      LDraw.circle(ctx, sp[0], sp[1], 4, { fill: colors.fg, stroke: colors.card, lw: 1.5 });
      LDraw.text(ctx, pts[p].name, sp[0] + 10, sp[1] - 12, { halo: colors.card, color: colors.fg, font: '700 14px sans-serif' });
    }
    LDraw.text(ctx, '1, 2 и 3-я зоны', 16, 16, { halo: colors.card, color: colors.muted, align: 'left', font: '12px sans-serif' });
  }

  function draw3(state, colors) {
    var canvas = document.getElementById('cv3');
    if (!canvas) return;
    if (!view) view = new LView3D(canvas);
    view.setModel(M().brillouin3d(state.bz3, state.a, state.ca));
    view.draw(colors);
  }

  function draw(state, colors) {
    if (state.dim === '1') draw1d(state, colors);
    else if (state.dim === '3') draw3(state, colors);
    else draw2d(state, colors);
  }

  function tick(dt, state, colors) {
    if (state.dim !== '3' || !view) return;
    view.tick(dt);
    view.draw(colors);
  }

  function resetView() { if (view) view.reset(); }

  globalThis.LSecLattice = { sync: sync, draw: draw, tick: tick, resetView: resetView };
})();
