/* Холст для изотерм, вириала и «водопада». Без внешней библиотеки графиков. */
(function (root, factory) {
  const api = factory();
  if (root) root.EOSCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function niceStep(span, count) {
    const raw = Math.abs(span) / Math.max(1, count);
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const e = raw / p;
    const n = e <= 1.2 ? 1 : e <= 2.5 ? 2 : e <= 6 ? 5 : 10;
    return n * p;
  }

  function linearTicks(min, max) {
    const step = niceStep(max - min, 5);
    const start = Math.ceil((min - step * 1e-8) / step) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 0.01 && ticks.length < 8; v += step) ticks.push(v);
    return ticks;
  }

  function logTicks(min, max) {
    const ticks = [];
    const a = Math.floor(Math.log10(min));
    const b = Math.ceil(Math.log10(max));
    for (let e = a; e <= b; e++) {
      const v = Math.pow(10, e);
      if (v >= min * 0.999 && v <= max * 1.001) ticks.push(v);
    }
    if (ticks.length < 2) {
      const mid = Math.sqrt(min * max);
      ticks.push(mid);
    }
    return ticks;
  }

  function tickText(v) {
    if (!isFinite(v)) return '';
    const ax = Math.abs(v);
    if (ax === 0) return '0';
    if (ax < 0.01 || ax >= 10000) return v.toExponential(0).replace('e+', 'e');
    if (ax >= 100) return String(Math.round(v));
    if (ax >= 10) return (Math.round(v * 10) / 10).toString();
    if (ax >= 1) return (Math.round(v * 100) / 100).toString();
    return (Math.round(v * 1000) / 1000).toString();
  }

  function prepare(canvas, height) {
    const w = canvas.clientWidth || 320;
    const h = height || 260;
    if (canvas._cssH !== h) {
      canvas._cssH = h;
      canvas.style.height = h + 'px';
    }
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function draw(canvas, spec) {
    const height = spec.height || 260;
    const box = prepare(canvas, height);
    const ctx = box.ctx, w = box.w, h = box.h;
    const c = spec.colors || { fg: '#1d2433', muted: '#5c6b82', grid: '#e6ebf3', bg: '#ffffff' };
    const padL = spec.padL || 52;
    const pad = { l: padL, r: 10, t: 12, b: spec.xLabel ? 36 : 28 };
    const plot = { x: pad.l, y: pad.t, w: Math.max(10, w - pad.l - pad.r), h: Math.max(10, h - pad.t - pad.b) };
    const logX = !!spec.logX;
    let xMin = spec.xMin, xMax = spec.xMax, yMin = spec.yMin, yMax = spec.yMax;
    const series = spec.series || [];
    if (xMin == null || xMax == null || yMin == null || yMax == null) {
      let xs = [], ys = [];
      series.forEach(function (s) {
        for (let i = 0; i < s.xs.length; i++) {
          const x = s.xs[i], y = s.ys[i];
          if (isFinite(x) && isFinite(y) && (!logX || x > 0)) { xs.push(x); ys.push(y); }
        }
      });
      if (!xs.length) {
        ctx.fillStyle = c.muted;
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillText(spec.empty || 'Нет точек', 16, 28);
        canvas._map = null;
        return null;
      }
      if (xMin == null) xMin = Math.min.apply(null, xs);
      if (xMax == null) xMax = Math.max.apply(null, xs);
      if (yMin == null) yMin = Math.min.apply(null, ys);
      if (yMax == null) yMax = Math.max.apply(null, ys);
    }
    if (spec.includeZero) {
      yMin = Math.min(yMin, 0);
      yMax = Math.max(yMax, 0);
    }
    if (!(xMax > xMin)) { xMax = xMin + 1; }
    if (!(yMax > yMin)) { const d = Math.abs(yMin) || 1; yMin -= d * 0.1; yMax += d * 0.1; }
    if (!logX) {
      const px = (xMax - xMin) * 0.04;
      if (spec.xMin == null) xMin -= px;
      if (spec.xMax == null) xMax += px;
    }
    if (spec.yMin == null || spec.yMax == null) {
      const py = (yMax - yMin) * 0.08;
      if (spec.yMin == null) yMin -= py;
      if (spec.yMax == null) yMax += py;
    }
    if (logX) {
      xMin = Math.max(xMin, 1e-12);
      xMax = Math.max(xMax, xMin * 1.01);
    }

    function xPix(x) {
      let t;
      if (logX) t = (Math.log(x) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin));
      else t = (x - xMin) / (xMax - xMin);
      return plot.x + Math.max(0, Math.min(1, t)) * plot.w;
    }
    function yPix(y) {
      const t = (y - yMin) / (yMax - yMin);
      return plot.y + (1 - Math.max(-0.2, Math.min(1.2, t))) * plot.h;
    }
    function xOf(px) {
      const t = (px - plot.x) / plot.w;
      if (logX) return Math.exp(Math.log(xMin) + t * (Math.log(xMax) - Math.log(xMin)));
      return xMin + t * (xMax - xMin);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    ctx.fillStyle = c.plot || 'transparent';
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);

    const xt = logX ? logTicks(xMin, xMax) : linearTicks(xMin, xMax);
    const yt = linearTicks(yMin, yMax);
    ctx.lineWidth = 1;
    ctx.strokeStyle = c.grid;
    ctx.fillStyle = c.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xt.forEach(function (v) {
      const x = xPix(v);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    });
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yt.forEach(function (v) {
      const y = yPix(v);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });

    (spec.shades || []).forEach(function (sh) {
      if (!sh.xs || sh.xs.length < 2) return;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < sh.xs.length; i++) {
        const x = sh.xs[i], y = sh.ys[i];
        if (!isFinite(x) || !isFinite(y) || (logX && x <= 0)) { started = false; continue; }
        const px = xPix(x), py = yPix(y);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      for (let i = sh.xs.length - 1; i >= 0; i--) {
        const x = sh.xs[i];
        if (!isFinite(x) || (logX && x <= 0)) continue;
        const y2 = typeof sh.y2 === 'number' ? sh.y2 : (sh.y2 && sh.y2[i]);
        if (!isFinite(y2)) continue;
        ctx.lineTo(xPix(x), yPix(y2));
      }
      ctx.closePath();
      ctx.fillStyle = sh.color;
      ctx.fill();
    });

    (spec.hLines || []).forEach(function (ln) {
      if (!isFinite(ln.y)) return;
      ctx.beginPath();
      ctx.setLineDash(ln.dash || [5, 4]);
      ctx.strokeStyle = ln.color || c.muted;
      ctx.lineWidth = 1.4;
      const y = yPix(ln.y);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    (spec.vLines || []).forEach(function (ln) {
      if (!isFinite(ln.x) || (logX && ln.x <= 0)) return;
      ctx.beginPath();
      ctx.setLineDash(ln.dash || [4, 3]);
      ctx.strokeStyle = ln.color || c.muted;
      ctx.lineWidth = 1.2;
      const x = xPix(ln.x);
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    series.forEach(function (s) {
      ctx.beginPath();
      ctx.lineWidth = s.width || 2;
      ctx.strokeStyle = s.color;
      ctx.setLineDash(s.dash || []);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      let started = false;
      for (let i = 0; i < s.xs.length; i++) {
        const x = s.xs[i], y = s.ys[i];
        if (!isFinite(x) || !isFinite(y) || (logX && x <= 0)) { started = false; continue; }
        const px = xPix(x), py = yPix(y);
        if (py < plot.y - 40 || py > plot.y + plot.h + 40) { started = false; continue; }
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    (spec.markers || []).forEach(function (m) {
      if (!isFinite(m.x) || !isFinite(m.y) || (logX && m.x <= 0)) return;
      const px = xPix(m.x), py = yPix(m.y);
      ctx.beginPath();
      ctx.fillStyle = m.color || '#111';
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = 2;
      ctx.arc(px, py, m.r || 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();

    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);

    ctx.fillStyle = c.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xt.forEach(function (v) {
      ctx.fillText(tickText(v), xPix(v), plot.y + plot.h + 4);
    });
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yt.forEach(function (v) {
      ctx.fillText(tickText(v), plot.x - 6, yPix(v));
    });
    ctx.fillStyle = c.fg;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    if (spec.xLabel) ctx.fillText(spec.xLabel, plot.x + plot.w / 2, h - 2);
    if (spec.yLabel) {
      ctx.save();
      ctx.translate(13, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText(spec.yLabel, 0, 0);
      ctx.restore();
    }

    const map = {
      plot: plot, xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, logX: logX,
      xPix: xPix, yPix: yPix, xOf: xOf, w: w, h: h
    };
    canvas._map = map;
    return map;
  }

  function waterfall(canvas, parts, colors, height) {
    const box = prepare(canvas, height || 220);
    const ctx = box.ctx, w = box.w, h = box.h;
    const c = colors;
    if (!parts || !parts.length) {
      ctx.fillStyle = c.muted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Нет разложения', 12, 24);
      return;
    }
    const steps = [];
    let acc = 0;
    parts.forEach(function (p) {
      const from = acc;
      acc += p.value;
      steps.push({ name: p.name, from: from, to: acc, value: p.value, total: false });
    });
    steps.push({ name: 'итог P', from: 0, to: acc, value: acc, total: true });
    let yMin = 0, yMax = 0;
    steps.forEach(function (s) {
      yMin = Math.min(yMin, s.from, s.to);
      yMax = Math.max(yMax, s.from, s.to);
    });
    if (!(yMax > yMin)) { yMax = 1; yMin = -1; }
    const padY = (yMax - yMin) * 0.12;
    yMin -= padY;
    yMax += padY;
    const pad = { l: 16, r: 12, t: 16, b: 48 };
    const plotH = h - pad.t - pad.b;
    const n = steps.length;
    const gap = 10;
    const bw = Math.max(8, (w - pad.l - pad.r - gap * (n - 1)) / n);
    function yPix(v) { return pad.t + (1 - (v - yMin) / (yMax - yMin)) * plotH; }
    const y0 = yPix(0);
    ctx.strokeStyle = c.grid;
    ctx.beginPath();
    ctx.moveTo(pad.l, y0);
    ctx.lineTo(w - pad.r, y0);
    ctx.stroke();
    steps.forEach(function (s, i) {
      const x = pad.l + i * (bw + gap);
      const y1 = yPix(s.from), y2 = yPix(s.to);
      const top = Math.min(y1, y2), bh = Math.max(2, Math.abs(y2 - y1));
      ctx.fillStyle = s.total ? '#2563eb' : (s.value >= 0 ? '#059669' : '#e11d48');
      ctx.globalAlpha = s.total ? 0.9 : 0.85;
      ctx.fillRect(x, top, bw, bh);
      ctx.globalAlpha = 1;
      if (i < n - 1) {
        ctx.strokeStyle = c.muted;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x + bw, yPix(s.to));
        ctx.lineTo(x + bw + gap, yPix(steps[i + 1].from));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = c.fg;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name;
      ctx.fillText(label, x + bw / 2, h - 42);
      ctx.fillStyle = c.muted;
      ctx.font = '10px system-ui, sans-serif';
      const val = tickText(s.value);
      ctx.fillText(val, x + bw / 2, h - 26);
    });
  }

  return { draw: draw, waterfall: waterfall, tickText: tickText };
});
