/* Небольшие графики на canvas: линии, гистограмма, маркер. */
(function () {
  'use strict';

  function niceStep(span, count) {
    var rough = Math.abs(span) / Math.max(1, count);
    if (!(rough > 0)) return 1;
    var pow = Math.pow(10, Math.floor(Math.log10(rough)));
    var err = rough / pow;
    if (err >= 7) return 10 * pow;
    if (err >= 3) return 5 * pow;
    if (err >= 1.4) return 2 * pow;
    return pow;
  }

  function niceTicks(min, max, count) {
    var step = niceStep(max - min, count);
    var start = Math.ceil((min - step * 1e-6) / step) * step;
    var out = [];
    for (var v = start; v <= max + step * 0.01 && out.length < 8; v += step) {
      out.push(Math.abs(v) < step * 1e-3 ? 0 : v);
    }
    return out;
  }

  function tickLabel(v) {
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1000 || a < 0.01)) return v.toExponential(0);
    if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
    return (Math.round(v * 100) / 100).toString();
  }

  function draw(ctx, w, h, opt, colors) {
    var pad = opt.pad || { l: 46, r: 14, t: 16, b: 34 };
    var x0 = opt.xMin, x1 = opt.xMax, y0 = opt.yMin, y1 = opt.yMax;
    if (!(x1 > x0)) { x0 = 0; x1 = 1; }
    if (!(y1 > y0)) { y0 = 0; y1 = 1; }
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    function X(x) { return pad.l + (x - x0) / (x1 - x0) * pw; }
    function Y(y) { return pad.t + (y1 - y) / (y1 - y0) * ph; }
    function pixToX(px) { return x0 + (px - pad.l) / pw * (x1 - x0); }

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);

    if (opt.bands) {
      for (var b = 0; b < opt.bands.length; b++) {
        var band = opt.bands[b];
        var yA = Y(band.y1);
        var yB = Y(band.y0);
        ctx.fillStyle = band.color;
        ctx.fillRect(pad.l, Math.min(yA, yB), pw, Math.abs(yB - yA));
      }
    }

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.muted;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var xt = opt.xTicks || niceTicks(x0, x1, Math.max(2, Math.round(pw / 70)));
    for (var i = 0; i < xt.length; i++) {
      var xx = X(xt[i]);
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, pad.t + ph);
      ctx.stroke();
      ctx.fillText(tickLabel(xt[i]), xx, pad.t + ph + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var yt = opt.yTicks || niceTicks(y0, y1, Math.max(2, Math.round(ph / 46)));
    for (var j = 0; j < yt.length; j++) {
      var yy = Y(yt[j]);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + pw, yy);
      ctx.stroke();
      ctx.fillText(tickLabel(yt[j]), pad.l - 6, yy);
    }

    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();

    if (opt.vlines) {
      ctx.save();
      for (var v = 0; v < opt.vlines.length; v++) {
        var vl = opt.vlines[v];
        var xv = X(vl.x);
        ctx.strokeStyle = vl.color || colors.acc2;
        ctx.setLineDash(vl.dash || [4, 3]);
        ctx.beginPath();
        ctx.moveTo(xv, pad.t);
        ctx.lineTo(xv, pad.t + ph);
        ctx.stroke();
        if (vl.label) {
          ctx.setLineDash([]);
          ctx.fillStyle = vl.color || colors.acc2;
          ctx.font = '600 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(vl.label, xv, pad.t + 12);
        }
      }
      ctx.restore();
    }
    if (opt.hlines) {
      for (var hli = 0; hli < opt.hlines.length; hli++) {
        var hl = opt.hlines[hli];
        ctx.strokeStyle = hl.color || colors.good;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(hl.y));
        ctx.lineTo(pad.l + pw, Y(hl.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    var series = opt.series || [];
    for (var s = 0; s < series.length; s++) {
      var ser = series[s];
      ctx.beginPath();
      var started = false;
      ctx.strokeStyle = ser.color || colors.acc;
      ctx.lineWidth = ser.width || 2.2;
      ctx.lineJoin = 'round';
      ctx.setLineDash(ser.dash || []);
      var pts = ser.pts;
      for (var p = 0; p < pts.length; p++) {
        var pt = pts[p];
        if (!isFinite(pt.y) || !isFinite(pt.x)) { started = false; continue; }
        var px = X(pt.x);
        var py = Y(pt.y);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    if (opt.marker && isFinite(opt.marker.x)) {
      var mx = X(opt.marker.x);
      var my = isFinite(opt.marker.y) ? Y(opt.marker.y) : null;
      ctx.fillStyle = opt.marker.color || colors.acc2;
      ctx.strokeStyle = colors.card;
      ctx.lineWidth = 2;
      if (my != null) {
        ctx.beginPath();
        ctx.arc(mx, my, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.fillStyle = colors.muted;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    if (opt.xLabel) ctx.fillText(opt.xLabel, pad.l + pw / 2, h - 1);
    if (opt.yLabel) {
      ctx.save();
      ctx.translate(12, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText(opt.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    return { X: X, Y: Y, pixToX: pixToX, pad: pad };
  }

  function hist(ctx, w, h, opt, colors) {
    var counts = opt.counts || [];
    var bins = counts.length || 1;
    var maxC = 1;
    for (var i = 0; i < bins; i++) if (counts[i] > maxC) maxC = counts[i];
    var pts = [];
    for (var b = 0; b < bins; b++) {
      var x = opt.min + (b + 0.5) * (opt.max - opt.min) / bins;
      pts.push({ x: x, y: counts[b] });
    }
    draw(ctx, w, h, {
      xMin: opt.min,
      xMax: opt.max,
      yMin: 0,
      yMax: maxC * 1.08,
      xLabel: opt.xLabel || 'ω',
      yLabel: opt.yLabel || 'число k',
      series: [{ color: colors.acc, width: 1.5, pts: pts }],
      pad: { l: 44, r: 10, t: 12, b: 32 }
    }, colors);
    var pad = { l: 44, r: 10, t: 12, b: 32 };
    var pw = w - pad.l - pad.r;
    var ph = h - pad.t - pad.b;
    var bw = pw / bins;
    ctx.save();
    ctx.fillStyle = colors.acc;
    ctx.globalAlpha = 0.85;
    for (var k = 0; k < bins; k++) {
      var bh = (counts[k] / (maxC * 1.08)) * ph;
      ctx.fillRect(pad.l + k * bw + 0.5, pad.t + ph - bh, Math.max(1, bw - 1), bh);
    }
    ctx.restore();
  }

  globalThis.LChart = { draw: draw, hist: hist, niceTicks: niceTicks };
})();
