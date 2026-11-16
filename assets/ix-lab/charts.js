/* Графики на canvas: линии вкладов, столбик и тепловая карта. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IXCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function themeOf(name) {
    const dark = name === 'dark';
    return {
      bg: 'transparent',
      fg: dark ? '#e8eef7' : '#1d2433',
      muted: dark ? '#93a0b5' : '#5c6b82',
      grid: dark ? 'rgba(255,255,255,.08)' : 'rgba(20,30,50,.08)',
      zero: dark ? 'rgba(255,255,255,.35)' : 'rgba(20,30,50,.35)',
      mark: dark ? '#f8fafc' : '#0f172a'
    };
  }

  function setup(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = (typeof window !== 'undefined' && window.PVMotion) ? PVMotion.cssBox(canvas, 320, 200) : null;
    const w = box ? box.w : (canvas.clientWidth || 320);
    const h = box ? box.h : (canvas.clientHeight || 200);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function nice(lo, hi) {
    if (!isFinite(lo) || !isFinite(hi)) return [-1, 1];
    if (lo === hi) { lo -= 1; hi += 1; }
    if (lo < 0 && hi > Math.max(40, -lo * 3)) hi = Math.max(25, -lo * 1.6);
    const pad = (hi - lo) * 0.1;
    return [lo - pad, hi + pad];
  }

  function ticks(a, b, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n);
    return out;
  }

  function fmt(v) {
    const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
    return s.replace('.', ',').replace('-', '−');
  }

  function drawLines(canvas, opt) {
    const th = themeOf(opt.theme);
    const S = setup(canvas);
    const ctx = S.ctx;
    const padL = 48, padR = 12, padT = 16, padB = 32;
    const series = opt.series || [];
    let lo = Infinity, hi = -Infinity;
    series.forEach(s => (s.ys || []).forEach(v => {
      if (!isFinite(v)) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }));
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    const yr = nice(lo, hi);
    const xs = opt.xs || [];
    const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const X = t => padL + (S.w - padL - padR) * ((t - x0) / ((x1 - x0) || 1));
    const Y = v => padT + (S.h - padT - padB) * (1 - (v - yr[0]) / ((yr[1] - yr[0]) || 1));

    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid;
    ctx.fillStyle = th.muted;
    ticks(yr[0], yr[1], 4).forEach(v => {
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(S.w - padR, y); ctx.stroke();
      ctx.fillText(fmt(v), 4, y + 3);
    });
    ticks(x0, x1, 4).forEach(t => {
      const x = X(t);
      ctx.fillText(fmt(t), x - 10, S.h - 14);
    });
    const y0 = Y(0);
    if (y0 > padT && y0 < S.h - padB) {
      ctx.strokeStyle = th.zero;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(S.w - padR, y0); ctx.stroke();
      ctx.setLineDash([]);
    }
    series.forEach(s => {
      ctx.beginPath();
      ctx.lineWidth = s.width || 1.6;
      ctx.strokeStyle = s.color;
      let started = false;
      (s.ys || []).forEach((v, i) => {
        if (!isFinite(v)) return;
        const x = X(xs[i]), y = Y(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    if (opt.markerX != null && isFinite(opt.markerX)) {
      const x = X(opt.markerX);
      ctx.strokeStyle = th.mark;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, S.h - padB); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = th.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(opt.xlabel || '', padL, S.h - 2);
    return S;
  }

  function drawLegend(canvas, items, themeName) {
    const th = themeOf(themeName);
    const width = canvas.clientWidth || 320;
    const probe = canvas.getContext('2d');
    probe.font = '12px system-ui, sans-serif';
    let x = 4, y = 8;
    items.forEach(it => {
      const label = it.name + '  ' + fmt(it.value);
      const tw = probe.measureText(label).width + 22;
      if (x + tw > width - 4) { x = 4; y += 20; }
      x += tw + 8;
    });
    canvas.style.height = (y + 16) + 'px';
    const S = setup(canvas);
    const ctx = S.ctx;
    ctx.font = '12px system-ui, sans-serif';
    x = 4; y = 8;
    items.forEach(it => {
      const label = it.name + '  ' + fmt(it.value);
      const tw = ctx.measureText(label).width + 22;
      if (x + tw > S.w - 4) { x = 4; y += 20; }
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, 12, 8, 2) : ctx.rect(x, y, 12, 8);
      ctx.fill();
      ctx.fillStyle = th.fg;
      ctx.fillText(label, x + 16, y + 8);
      x += tw + 8;
    });
  }

  function heatColor(t) {
    // синий — притяжение, белый — ноль, красный — отталкивание
    const x = Math.max(0, Math.min(1, t));
    const r = x < 0.5 ? Math.round(255 * (x / 0.5)) : 255;
    const g = x < 0.5 ? Math.round(80 + 175 * (x / 0.5)) : Math.round(255 - 180 * ((x - 0.5) / 0.5));
    const b = x < 0.5 ? Math.round(255 - 40 * (x / 0.5)) : Math.round(80 * (1 - (x - 0.5) / 0.5));
    return [r, g, b];
  }

  function drawHeat(canvas, opt) {
    const th = themeOf(opt.theme);
    const S = setup(canvas);
    const ctx = S.ctx;
    const z = opt.z || [];
    const ny = z.length, nx = (z[0] || []).length;
    if (!nx || !ny) return;
    const vals = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (isFinite(z[j][i])) vals.push(z[j][i]);
    vals.sort((a, b) => a - b);
    const lo = vals[0], hiRaw = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.92))];
    let hi = hiRaw;
    if (lo < 0 && hi > Math.max(30, -lo * 2)) hi = Math.max(10, -lo * 1.2);
    const padL = 42, padB = 28, padT = 10, padR = 12;
    const W = S.w - padL - padR, H = S.h - padT - padB;
    const img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = (z[j][i] - lo) / ((hi - lo) || 1);
        const c = heatColor(t);
        const p = ((ny - 1 - j) * nx + i) * 4;
        img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
      }
    }
    const off = document.createElement('canvas');
    off.width = nx; off.height = ny;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, padL, padT, W, H);
    ctx.strokeStyle = th.grid;
    ctx.strokeRect(padL, padT, W, H);
    ctx.fillStyle = th.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(fmt(opt.xs[0]), padL, S.h - 12);
    ctx.fillText(fmt(opt.xs[nx - 1]), padL + W - 24, S.h - 12);
    ctx.fillText(fmt(opt.ys[0]), 2, padT + H);
    ctx.fillText(fmt(opt.ys[ny - 1]), 2, padT + 10);
    ctx.fillText(opt.xlabel || '', padL + 8, S.h - 1);
    if (opt.mx != null && opt.my != null) {
      const x = padL + W * ((opt.mx - opt.xs[0]) / ((opt.xs[nx - 1] - opt.xs[0]) || 1));
      const y = padT + H * (1 - (opt.my - opt.ys[0]) / ((opt.ys[ny - 1] - opt.ys[0]) || 1));
      ctx.strokeStyle = th.mark;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = th.muted;
    ctx.fillText('синий — ниже, красный — выше', padL, 10);
  }

  return { drawLines: drawLines, drawLegend: drawLegend, drawHeat: drawHeat };
});
