/* Холст: масштаб под плотность пикселей, цвета темы, стрелки и подписи. */
(function () {
  'use strict';

  function cssColors() {
    var s = getComputedStyle(document.documentElement);
    function g(name, fallback) {
      var v = s.getPropertyValue(name);
      v = v ? v.trim() : '';
      return v || fallback;
    }
    return {
      fg: g('--fg', '#1b2433'),
      muted: g('--muted', '#5c6b82'),
      acc: g('--acc', '#1f6fd6'),
      acc2: g('--acc2', '#e26a3d'),
      good: g('--good', '#0e8f62'),
      grid: g('--grid', 'rgba(27,36,51,.08)'),
      card: g('--card', '#fff'),
      bg: g('--bg', '#eef2f8'),
      z1: g('--zone1', 'rgba(31,111,214,.38)'),
      z2: g('--zone2', 'rgba(232,148,42,.40)'),
      z3: g('--zone3', 'rgba(18,160,110,.36)'),
      line: g('--line', '#d5deec')
    };
  }

  function fit(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var box = window.PVMotion ? PVMotion.cssBox(canvas, 320, 220) : null;
    var r = canvas.getBoundingClientRect();
    var w = box ? box.w : Math.max(2, r.width);
    var h = box ? box.h : Math.max(2, r.height);
    var W = Math.round(w * dpr);
    var H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /** Квадратные мировые единицы, чтобы шестиугольник и окружность не сплющивались. */
  function squareBounds(reach, w, h, pad) {
    var pw = Math.max(1, w - 2 * pad);
    var ph = Math.max(1, h - 2 * pad);
    var aspect = pw / ph;
    var rx = reach;
    var ry = reach;
    if (aspect > 1) rx = reach * aspect;
    else ry = reach / aspect;
    return { minX: -rx, maxX: rx, minY: -ry, maxY: ry };
  }

  function mapper(bounds, w, h, pad) {
    var x0 = bounds.minX, x1 = bounds.maxX, y0 = bounds.minY, y1 = bounds.maxY;
    var sx = (x1 - x0) || 1;
    var sy = (y1 - y0) || 1;
    function toS(x, y) {
      return [
        pad + (x - x0) / sx * (w - 2 * pad),
        h - pad - (y - y0) / sy * (h - 2 * pad)
      ];
    }
    function toW(px, py) {
      return {
        x: x0 + (px - pad) / (w - 2 * pad) * sx,
        y: y0 + (h - pad - py) / (h - 2 * pad) * sy
      };
    }
    return { toS: toS, toW: toW };
  }

  function text(ctx, str, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = o.font || '600 13px sans-serif';
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    ctx.lineWidth = o.lw || 4;
    ctx.strokeStyle = o.halo || '#fff';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = o.color || '#142033';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function arrow(ctx, x1, y1, x2, y2, color, width) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var L = Math.hypot(dx, dy) || 1;
    var ux = dx / L;
    var uy = dy / L;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * 2, y2 - uy * 2);
    ctx.stroke();
    var ah = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * ah - uy * 4.2, y2 - uy * ah + ux * 4.2);
    ctx.lineTo(x2 - ux * ah + uy * 4.2, y2 - uy * ah - ux * 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function poly(ctx, pts, o) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.lw || 1.6;
      ctx.setLineDash(o.dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function circle(ctx, x, y, r, o) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1.5; ctx.stroke(); }
  }

  /** Горизонтальное перетаскивание и короткое нажатие. Вертикальный жест остаётся прокрутке. */
  function bindX(canvas, onX) {
    var pid = null, sx = 0, sy = 0, drag = false, moved = false;
    canvas.addEventListener('pointerdown', function (e) {
      pid = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      drag = false;
      moved = false;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) return;
      var dx = e.clientX - sx;
      var dy = e.clientY - sy;
      if (!drag) {
        if (Math.hypot(dx, dy) < 7) return;
        moved = true;
        if (Math.abs(dy) > Math.abs(dx)) { pid = null; return; }
        drag = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* уже захвачен */ }
      }
      var rect = canvas.getBoundingClientRect();
      onX(e.clientX - rect.left, rect.width);
    });
    function end(e) {
      if (e.pointerId !== pid && pid != null) return;
      if (!moved) {
        var rect = canvas.getBoundingClientRect();
        onX(e.clientX - rect.left, rect.width);
      }
      pid = null;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', function () { pid = null; });
  }

  globalThis.LDraw = {
    colors: cssColors,
    fit: fit,
    squareBounds: squareBounds,
    mapper: mapper,
    text: text,
    arrow: arrow,
    poly: poly,
    circle: circle,
    bindX: bindX
  };
})();
