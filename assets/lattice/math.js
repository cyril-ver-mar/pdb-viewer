/* Физика кристаллических решёток: векторы, зоны Бриллюэна, фононы, зоны электронов.
   Чистые функции, без DOM. Единицы: ħ = 1, энергия свободного электрона E = k² (то есть ħ²/2m = 1). */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function hypot2(x, y) { return Math.sqrt(x * x + y * y); }

  function v2(x, y) { return { x: x, y: y }; }
  function add2(a, b) { return v2(a.x + b.x, a.y + b.y); }
  function sub2(a, b) { return v2(a.x - b.x, a.y - b.y); }
  function mul2(a, s) { return v2(a.x * s, a.y * s); }
  function dot2(a, b) { return a.x * b.x + a.y * b.y; }
  function len2(a) { return hypot2(a.x, a.y); }
  function cross2(a, b) { return a.x * b.y - a.y * b.x; }

  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function add3(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub3(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function mul3(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function len3(a) { return Math.sqrt(dot3(a, a)); }
  function cross3(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function norm3(a) {
    var L = len3(a) || 1;
    return mul3(a, 1 / L);
  }

  /** Примитивные векторы. hex: γ = 60°, |a1| = |a2| = a. crect: примитивная ячейка центрированной прямоугольной. */
  function directVectors(kind, a, b, gamDeg) {
    a = Math.max(0.05, a);
    b = Math.max(0.05, b || a);
    var g = clamp(gamDeg == null ? 90 : gamDeg, 20, 160) * Math.PI / 180;
    if (kind === 'square') return { a1: v2(a, 0), a2: v2(0, a), a: a, b: a, gam: 90, kind: kind };
    if (kind === 'rect') return { a1: v2(a, 0), a2: v2(0, b), a: a, b: b, gam: 90, kind: kind };
    if (kind === 'hex') return { a1: v2(a, 0), a2: v2(a / 2, a * Math.sqrt(3) / 2), a: a, b: a, gam: 60, kind: kind };
    if (kind === 'crect') return { a1: v2(a / 2, -b / 2), a2: v2(a / 2, b / 2), a: a, b: b, gam: 90, kind: kind };
    return { a1: v2(a, 0), a2: v2(b * Math.cos(g), b * Math.sin(g)), a: a, b: b, gam: g * 180 / Math.PI, kind: 'oblique' };
  }

  /** b1, b2 такие, что bi·aj = 2π δij. area = a1 × a2. */
  function reciprocal(a1, a2) {
    var A = cross2(a1, a2);
    if (Math.abs(A) < 1e-12) A = 1e-12;
    var b1 = v2(TAU * a2.y / A, TAU * (-a2.x) / A);
    var b2 = v2(TAU * (-a1.y) / A, TAU * a1.x / A);
    return { b1: b1, b2: b2, area: A };
  }

  function latticePoints(v1, v2, n) {
    var pts = [];
    for (var i = -n; i <= n; i++) {
      for (var j = -n; j <= n; j++) {
        pts.push({ x: i * v1.x + j * v2.x, y: i * v1.y + j * v2.y, i: i, j: j });
      }
    }
    return pts;
  }

  function clipHalf(poly, nx, ny, c) {
    var out = [];
    var m = poly.length;
    for (var i = 0; i < m; i++) {
      var A = poly[i];
      var B = poly[(i + 1) % m];
      var da = nx * A.x + ny * A.y;
      var db = nx * B.x + ny * B.y;
      var inA = da <= c + 1e-9;
      var inB = db <= c + 1e-9;
      if (inA && inB) out.push(B);
      else if (inA && !inB) {
        var t = (c - da) / (db - da);
        out.push(v2(A.x + t * (B.x - A.x), A.y + t * (B.y - A.y)));
      } else if (!inA && inB) {
        var t2 = (c - da) / (db - da);
        out.push(v2(A.x + t2 * (B.x - A.x), A.y + t2 * (B.y - A.y)));
        out.push(B);
      }
    }
    return out;
  }

  function dedupePoly(poly) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      var q = out.length ? out[out.length - 1] : null;
      if (!q || hypot2(p.x - q.x, p.y - q.y) > 1e-7) out.push(p);
    }
    if (out.length > 2 && hypot2(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-7) out.pop();
    return out;
  }

  /** Ячейка Вороного вокруг origin по набору узлов (включая или нет сам origin). */
  function voronoi(points, origin, reach) {
    var R = reach || 1e6;
    var poly = [v2(-R, -R), v2(R, -R), v2(R, R), v2(-R, R)];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var dx = p.x - origin.x;
      var dy = p.y - origin.y;
      if (dx * dx + dy * dy < 1e-16) continue;
      var mx = (origin.x + p.x) / 2;
      var my = (origin.y + p.y) / 2;
      poly = clipHalf(poly, dx, dy, dx * mx + dy * my);
      if (poly.length < 3) break;
    }
    return dedupePoly(poly);
  }

  /** Номер зоны Бриллюэна: 1 + число векторов G, для которых k по другую сторону плоскости Брэгга. */
  function zoneIndex(kx, ky, gs) {
    var n = 1;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      if (g.i === 0 && g.j === 0) continue;
      var kg = kx * g.x + ky * g.y;
      var g2 = g.x * g.x + g.y * g.y;
      if (kg > g2 * 0.5 + 1e-8) n++;
    }
    return n;
  }

  function specialPoints2d(kind, a, b) {
    var pi = Math.PI;
    if (kind === 'square') {
      return [
        { name: 'Γ', x: 0, y: 0 },
        { name: 'X', x: pi / a, y: 0 },
        { name: 'M', x: pi / a, y: pi / a }
      ];
    }
    if (kind === 'rect') {
      return [
        { name: 'Γ', x: 0, y: 0 },
        { name: 'X', x: pi / a, y: 0 },
        { name: 'Y', x: 0, y: pi / b },
        { name: 'M', x: pi / a, y: pi / b }
      ];
    }
    if (kind === 'hex') {
      var K = 4 * pi / (3 * a);
      var Mlen = 2 * pi / (a * Math.sqrt(3));
      var ang = pi / 6;
      return [
        { name: 'Γ', x: 0, y: 0 },
        { name: 'M', x: Mlen * Math.cos(ang), y: Mlen * Math.sin(ang) },
        { name: 'K', x: K, y: 0 }
      ];
    }
    return [{ name: 'Γ', x: 0, y: 0 }];
  }

  function hexK(a) { return v2(4 * Math.PI / (3 * a), 0); }

  function bzPolygon(kind, a, b, gam) {
    var d = directVectors(kind, a, b, gam);
    var r = reciprocal(d.a1, d.a2);
    var gs = latticePoints(r.b1, r.b2, 4);
    var reach = 8 * Math.max(len2(r.b1), len2(r.b2));
    var poly = voronoi(gs, v2(0, 0), reach);
    return { poly: poly, direct: d, recip: r, gs: gs, points: specialPoints2d(kind, d.a, d.b) };
  }

  /* ---------- фононы ---------- */

  function omegaMono(k, Ks, m, a) {
    return 2 * Math.sqrt(Ks / m) * Math.abs(Math.sin(k * a / 2));
  }
  function omegaMonoMax(Ks, m) { return 2 * Math.sqrt(Ks / m); }

  /** Знаковая групповая скорость. В первой зоне |v_g| = a√(K/m) |cos(ka/2)|. */
  function vgMono(k, Ks, m, a) {
    var s = Math.sin(k * a / 2);
    var c = Math.cos(k * a / 2);
    if (Math.abs(s) < 1e-10) {
      if (c < 0) return 0;
      return (k < 0 ? -1 : 1) * a * Math.sqrt(Ks / m);
    }
    return a * Math.sqrt(Ks / m) * c * Math.sign(s);
  }
  function vpMono(k, Ks, m, a) {
    if (Math.abs(k) < 1e-8) return a * Math.sqrt(Ks / m);
    return omegaMono(k, Ks, m, a) / Math.abs(k);
  }

  /**
   * Двухатомная цепочка: ячейка длины a, атомы m1 и m2, пружины K1 и K2.
   * При K1 = K2 = K на границе зоны ω = √(2K/m1) и √(2K/m2).
   */
  function diatomicOmega2(k, m1, m2, K1, K2, a) {
    var S = K1 + K2;
    var c = Math.cos(k * a);
    var C2 = K1 * K1 + K2 * K2 + 2 * K1 * K2 * c;
    var disc = S * S * (m1 + m2) * (m1 + m2) - 4 * m1 * m2 * (S * S - C2);
    if (disc < 0) disc = 0;
    var root = Math.sqrt(disc);
    var den = 2 * m1 * m2;
    return {
      ac: Math.max(0, (S * (m1 + m2) - root) / den),
      op: Math.max(0, (S * (m1 + m2) + root) / den)
    };
  }
  function diatomicOmega(k, m1, m2, K1, K2, a) {
    var w2 = diatomicOmega2(k, m1, m2, K1, K2, a);
    return { ac: Math.sqrt(w2.ac), op: Math.sqrt(w2.op) };
  }

  /** Края щели при одинаковых пружинах: нижний √(2K/m_тяж), верхний √(2K/m_лёг). */
  function diatomicGapEdges(m1, m2, Ks) {
    var heavy = Math.max(m1, m2);
    var light = Math.min(m1, m2);
    var lo = Math.sqrt(2 * Ks / heavy);
    var hi = Math.sqrt(2 * Ks / light);
    return { lo: lo, hi: hi, gap: hi - lo, heavy: heavy, light: light };
  }

  function diatomicMode(k, m1, m2, K1, K2, a, branch) {
    var om = diatomicOmega(k, m1, m2, K1, K2, a);
    var w = branch === 'op' ? om.op : om.ac;
    var w2 = w * w;
    var S = K1 + K2;
    var th = k * a;
    var denR = K1 + K2 * Math.cos(th);
    var denI = -K2 * Math.sin(th);
    var d2 = denR * denR + denI * denI;
    var Ar = 1, Ai = 0, Br = 0, Bi = 0;
    if (d2 < 1e-12) {
      var wA = Math.sqrt(S / m1);
      var wB = Math.sqrt(S / m2);
      if (Math.abs(w - wA) <= Math.abs(w - wB)) { Ar = 1; Br = 0; }
      else { Ar = 0; Br = 1; }
    } else {
      var num = S - m1 * w2;
      Br = num * denR / d2;
      Bi = -num * denI / d2;
    }
    var amp = Math.max(1, Math.hypot(Ar, Ai), Math.hypot(Br, Bi));
    return { w: w, Ar: Ar / amp, Ai: Ai / amp, Br: Br / amp, Bi: Bi / amp };
  }

  function dispAtom(mode, which, phase, kna) {
    var pr = which === 2 ? mode.Br : mode.Ar;
    var pi = which === 2 ? mode.Bi : mode.Ai;
    var phi = kna - phase;
    return pr * Math.sin(phi) + pi * Math.cos(phi);
  }

  function vgNum(fn, k) {
    var dk = 1e-4;
    return (fn(k + dk) - fn(k - dk)) / (2 * dk);
  }

  function omegaSquare(kx, ky, Ks, m, a) {
    var sx = Math.sin(kx * a / 2);
    var sy = Math.sin(ky * a / 2);
    return Math.sqrt((4 * Ks / m) * (sx * sx + sy * sy));
  }
  function omegaHex(kx, ky, Ks, m, a) {
    var s = 0;
    for (var n = 0; n < 6; n++) {
      var th = n * Math.PI / 3;
      s += 1 - Math.cos(kx * a * Math.cos(th) + ky * a * Math.sin(th));
    }
    return Math.sqrt((Ks / m) * s);
  }

  function samplePath(stops, steps, yFn) {
    var pts = [];
    var ticks = [{ d: 0, name: stops[0].name }];
    var dist = 0;
    for (var s = 0; s < stops.length - 1; s++) {
      var A = stops[s], B = stops[s + 1];
      var L = hypot2(B.x - A.x, B.y - A.y) || 1e-9;
      for (var i = 0; i <= steps; i++) {
        if (s > 0 && i === 0) continue;
        var t = i / steps;
        var kx = A.x + (B.x - A.x) * t;
        var ky = A.y + (B.y - A.y) * t;
        pts.push({ d: dist + L * t, kx: kx, ky: ky, y: yFn(kx, ky) });
      }
      dist += L;
      ticks.push({ d: dist, name: B.name });
    }
    return { pts: pts, ticks: ticks, length: dist };
  }

  function pathAt(stops, u) {
    var segs = [];
    var total = 0;
    for (var s = 0; s < stops.length - 1; s++) {
      var L = hypot2(stops[s + 1].x - stops[s].x, stops[s + 1].y - stops[s].y);
      segs.push(L);
      total += L;
    }
    var target = clamp(u, 0, 1) * total;
    var acc = 0;
    for (var i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= target || i === segs.length - 1) {
        var t = segs[i] ? (target - acc) / segs[i] : 0;
        t = clamp(t, 0, 1);
        return {
          x: stops[i].x + (stops[i + 1].x - stops[i].x) * t,
          y: stops[i].y + (stops[i + 1].y - stops[i].y) * t
        };
      }
      acc += segs[i];
    }
    return { x: stops[0].x, y: stops[0].y };
  }

  function squareStops(a) {
    var p = Math.PI / a;
    return [{ name: 'Γ', x: 0, y: 0 }, { name: 'X', x: p, y: 0 }, { name: 'M', x: p, y: p }, { name: 'Γ', x: 0, y: 0 }];
  }
  function hexStops(a) {
    var K = 4 * Math.PI / (3 * a);
    var Mlen = 2 * Math.PI / (a * Math.sqrt(3));
    var ang = Math.PI / 6;
    return [
      { name: 'Γ', x: 0, y: 0 },
      { name: 'M', x: Mlen * Math.cos(ang), y: Mlen * Math.sin(ang) },
      { name: 'K', x: K, y: 0 },
      { name: 'Γ', x: 0, y: 0 }
    ];
  }

  function histogram(values, bins) {
    var min = Infinity, max = -Infinity, i;
    for (i = 0; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    if (max - min < 1e-9) max = min + 1;
    var counts = [];
    for (i = 0; i < bins; i++) counts.push(0);
    var w = (max - min) / bins;
    for (i = 0; i < values.length; i++) {
      var idx = Math.floor((values[i] - min) / w);
      if (idx < 0) idx = 0;
      if (idx >= bins) idx = bins - 1;
      counts[idx]++;
    }
    return { min: min, max: max, w: w, counts: counts };
  }

  function debyeKernel(x) {
    if (x < 1e-4) return x * x;
    var em = Math.exp(-x);
    var d = 1 - em;
    return x * x * x * x * em / (d * d);
  }
  /** C_V / (N k_B). При высокой температуре → 3. */
  function debyeCV(T, theta) {
    if (!(T > 0) || !(theta > 0)) return 0;
    var xmax = theta / T;
    if (xmax < 1e-3) return 3;
    var steps = 200;
    var dx = xmax / steps;
    var sum = debyeKernel(0) + debyeKernel(xmax);
    for (var i = 1; i < steps; i++) {
      sum += (i % 2 === 0 ? 2 : 4) * debyeKernel(i * dx);
    }
    return 9 * Math.pow(T / theta, 3) * (sum * dx / 3);
  }
  function einsteinCV(T, theta) {
    if (!(T > 0) || !(theta > 0)) return 0;
    var x = theta / T;
    if (x < 1e-3) return 3;
    var ex = Math.exp(Math.min(80, x));
    return 3 * x * x * ex / ((ex - 1) * (ex - 1));
  }

  /* ---------- электроны ---------- */

  function jacobi(A) {
    var n = A.length;
    var M = [];
    var V = [];
    var i, j, k;
    for (i = 0; i < n; i++) {
      M.push(A[i].slice());
      var row = [];
      for (j = 0; j < n; j++) row.push(i === j ? 1 : 0);
      V.push(row);
    }
    for (var iter = 0; iter < 48; iter++) {
      var p = 0, q = 1, max = 0;
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          var av = Math.abs(M[i][j]);
          if (av > max) { max = av; p = i; q = j; }
        }
      }
      if (max < 1e-12) break;
      var app = M[p][p], aqq = M[q][q], apq = M[p][q];
      var tau = (aqq - app) / (2 * apq);
      var tt = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      var cc = 1 / Math.sqrt(1 + tt * tt);
      var ss = tt * cc;
      for (k = 0; k < n; k++) {
        if (k === p || k === q) continue;
        var mkp = M[k][p], mkq = M[k][q];
        M[k][p] = M[p][k] = cc * mkp - ss * mkq;
        M[k][q] = M[q][k] = ss * mkp + cc * mkq;
      }
      M[p][p] = cc * cc * app - 2 * ss * cc * apq + ss * ss * aqq;
      M[q][q] = ss * ss * app + 2 * ss * cc * apq + cc * cc * aqq;
      M[p][q] = M[q][p] = 0;
      for (k = 0; k < n; k++) {
        var vkp = V[k][p], vkq = V[k][q];
        V[k][p] = cc * vkp - ss * vkq;
        V[k][q] = ss * vkp + cc * vkq;
      }
    }
    var values = [];
    for (i = 0; i < n; i++) values.push(M[i][i]);
    return { values: values, vectors: V };
  }

  /** Почти свободный электрон: V = 2 U cos(2π x / a), щель ≈ 2|U| на границе. */
  function nfeBands(k, a, U, nG) {
    nG = nG == null ? 4 : nG;
    var ns = [];
    var n;
    for (n = -nG; n <= nG; n++) ns.push(n);
    var N = ns.length;
    var H = [];
    for (var i = 0; i < N; i++) H.push(new Array(N).fill(0));
    var G0 = TAU / a;
    for (var r = 0; r < N; r++) {
      var kk = k + ns[r] * G0;
      H[r][r] = kk * kk;
      for (var c = 0; c < N; c++) {
        var dg = ns[r] - ns[c];
        if (dg === 1 || dg === -1) H[r][c] += U;
      }
    }
    var ev = jacobi(H);
    var bands = ev.values.map(function (val, idx) {
      var best = 0, bi = 0;
      for (var t = 0; t < N; t++) {
        var amp = Math.abs(ev.vectors[t][idx]);
        if (amp > best) { best = amp; bi = t; }
      }
      return { E: val, n: ns[bi], kext: k + ns[bi] * G0 };
    });
    bands.sort(function (p, q) { return p.E - q.E; });
    return bands;
  }

  /** Двухволновая щель ровно 2|U| (первая плоскость Брэгга). */
  function nfeGap(U) { return 2 * Math.abs(U); }

  function tb1(k, a, eps, t) { return eps - 2 * t * Math.cos(k * a); }
  function tbBandwidth(t) { return 4 * Math.abs(t); }
  function tb2(kx, ky, a, eps, t) {
    return eps - 2 * t * Math.cos(kx * a) - 2 * t * Math.cos(ky * a);
  }
  function tb2Bandwidth(t) { return 8 * Math.abs(t); }

  /** m* = 1 / (d²E/dk²) при ħ = 1. Для E = ε − 2t cos(ka): m*(0) = 1/(2 t a²). */
  function curvature(fn, k) {
    var dk = 1e-3;
    return (fn(k + dk) - 2 * fn(k) + fn(k - dk)) / (dk * dk);
  }
  function mstarOf(fn, k) {
    var c = curvature(fn, k);
    if (Math.abs(c) < 1e-8) return { curv: c, m: Infinity };
    return { curv: c, m: 1 / c };
  }

  function fermiFromFilling(energies, filling) {
    var s = energies.slice().sort(function (a, b) { return a - b; });
    var f = clamp(filling / 2, 0, 1);
    var idx = Math.round(f * (s.length - 1));
    return s[idx];
  }

  /** k_F при заполнении filling электронов на ячейку (со спином) для одной 1D-зоны. */
  function kFermi1d(filling, a) { return clamp(filling, 0, 2) * Math.PI / (2 * a); }

  function gaussianFT(q, sigma) {
    return sigma * Math.sqrt(TAU) * Math.exp(-0.5 * sigma * sigma * q * q);
  }
  /** |φ̃(q)| для s- или p-орбитали. */
  function orbitalFT(q, orb, sigma) {
    var g = gaussianFT(q, sigma);
    if (orb === 'p') return sigma * sigma * Math.abs(q) * g;
    return g;
  }

  /**
   * ψ(x) = Σ_n exp(i k n a) φ(x − n a)
   * s: φ = exp(−x²/2σ²); p: φ = (x/σ) exp(−x²/2σ²)
   */
  function blochPsi(x, k, a, orb, sigma, nCells) {
    var re = 0, im = 0;
    var sig2 = sigma * sigma;
    for (var n = -nCells; n <= nCells; n++) {
      var dx = x - n * a;
      if (dx * dx > 18 * sig2) continue;
      var g = Math.exp(-0.5 * dx * dx / sig2);
      var phi = orb === 'p' ? (dx / sigma) * g : g;
      var ph = k * n * a;
      re += Math.cos(ph) * phi;
      im += Math.sin(ph) * phi;
    }
    return { re: re, im: im, abs2: re * re + im * im };
  }

  /** Коэффициенты плоских волн c(k+G) ∝ φ̃(k+G). */
  function planeWaveCoeffs(k, a, orb, sigma, nG) {
    var out = [];
    var max = 0;
    var n;
    for (n = -nG; n <= nG; n++) {
      var q = k + n * TAU / a;
      var amp = orbitalFT(q, orb, sigma);
      out.push({ n: n, q: q, amp: amp });
      if (amp > max) max = amp;
    }
    for (n = 0; n < out.length; n++) out[n].norm = max > 0 ? out[n].amp / max : 0;
    return out;
  }

  function peierls(k, a, t, delta) {
    var t1 = t * (1 + delta);
    var t2 = t * (1 - delta);
    var rad = Math.sqrt(Math.max(0, t1 * t1 + t2 * t2 + 2 * t1 * t2 * Math.cos(k * a)));
    return { minus: -rad, plus: rad, gap: 2 * Math.abs(t1 - t2), t1: t1, t2: t2 };
  }

  function structureFactor(basis, h, kk) {
    var re = 0, im = 0;
    for (var i = 0; i < basis.length; i++) {
      var atom = basis[i];
      var ph = TAU * (h * atom.x + kk * atom.y);
      re += atom.f * Math.cos(ph);
      im += atom.f * Math.sin(ph);
    }
    return { re: re, im: im, mag2: re * re + im * im };
  }

  /* ---------- 3D зоны ---------- */

  function unique3(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var dup = false;
      for (var j = 0; j < out.length; j++) {
        var q = out[j];
        if (Math.abs(q.x - p.x) < 1e-7 && Math.abs(q.y - p.y) < 1e-7 && Math.abs(q.z - p.z) < 1e-7) { dup = true; break; }
      }
      if (!dup) out.push(p);
    }
    return out;
  }
  function centroid3(pts) {
    var c = v3(0, 0, 0);
    for (var i = 0; i < pts.length; i++) c = add3(c, pts[i]);
    return mul3(c, 1 / (pts.length || 1));
  }
  function orderLoop(verts, normal) {
    var c = centroid3(verts);
    var n = norm3(normal);
    var tmp = Math.abs(n.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
    var t1 = norm3(cross3(n, tmp));
    var t2 = cross3(n, t1);
    var arr = verts.map(function (v) {
      var d = sub3(v, c);
      return { v: v, a: Math.atan2(dot3(d, t2), dot3(d, t1)) };
    });
    arr.sort(function (p, q) { return p.a - q.a; });
    return arr.map(function (p) { return p.v; });
  }
  function outward(verts) {
    if (verts.length < 3) return { verts: verts, n: v3(0, 0, 1) };
    var n = cross3(sub3(verts[1], verts[0]), sub3(verts[2], verts[0]));
    var c = centroid3(verts);
    if (dot3(n, c) < 0) {
      verts = verts.slice().reverse();
      n = mul3(n, -1);
    }
    return { verts: verts, n: norm3(n) };
  }

  function buildFcc(a) {
    var s = TAU / a;
    var raw = [];
    var base = [
      [1, 0.5, 0], [1, 0, 0.5], [0.5, 1, 0], [0, 1, 0.5], [0.5, 0, 1], [0, 0.5, 1]
    ];
    for (var b = 0; b < base.length; b++) {
      for (var sx = -1; sx <= 1; sx += 2) {
        for (var sy = -1; sy <= 1; sy += 2) {
          for (var sz = -1; sz <= 1; sz += 2) {
            raw.push(v3(sx * base[b][0] * s, sy * base[b][1] * s, sz * base[b][2] * s));
          }
        }
      }
    }
    var verts = unique3(raw);
    var faces = [];
    var axis = ['x', 'y', 'z'];
    for (var ax = 0; ax < 3; ax++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var sel = verts.filter(function (v) { return Math.abs(v[axis[ax]] - sgn * s) < 1e-5 * s; });
        var normal = v3(0, 0, 0);
        normal[axis[ax]] = sgn;
        var loop = orderLoop(sel, normal);
        var face = outward(loop);
        face.type = 'square';
        faces.push(face);
      }
    }
    for (var hx = -1; hx <= 1; hx += 2) {
      for (var hy = -1; hy <= 1; hy += 2) {
        for (var hz = -1; hz <= 1; hz += 2) {
          var selh = verts.filter(function (v) {
            return Math.abs(hx * v.x + hy * v.y + hz * v.z - 1.5 * s) < 1e-4 * s;
          });
          var faceh = outward(orderLoop(selh, v3(hx, hy, hz)));
          faceh.type = 'hex';
          faces.push(faceh);
        }
      }
    }
    var points = [
      { name: 'Γ', p: v3(0, 0, 0) },
      { name: 'X', p: v3(s, 0, 0) },
      { name: 'L', p: v3(s / 2, s / 2, s / 2) },
      { name: 'W', p: v3(s, s / 2, 0) },
      { name: 'K', p: v3(0.75 * s, 0.75 * s, 0) },
      { name: 'U', p: v3(s, 0.25 * s, 0.25 * s) }
    ];
    return pack3('fcc', 'truncated-octahedron', 'усечённый октаэдр', verts, faces, points,
      'ГЦК-решётка, первая зона — усечённый октаэдр. Квадратные грани смотрят на X, шестиугольные — на L.');
  }

  function buildBcc(a) {
    var s = TAU / a;
    var verts = [];
    var ax = ['x', 'y', 'z'];
    for (var i = 0; i < 3; i++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var v = v3(0, 0, 0);
        v[ax[i]] = sgn * s;
        verts.push(v);
      }
    }
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sy = -1; sy <= 1; sy += 2) {
        for (var sz = -1; sz <= 1; sz += 2) verts.push(v3(sx * s / 2, sy * s / 2, sz * s / 2));
      }
    }
    var normals = [];
    var pairs = [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]];
    for (var p = 0; p < pairs.length; p++) {
      normals.push(pairs[p]);
      normals.push([-pairs[p][0], -pairs[p][1], -pairs[p][2]]);
    }
    var faces = [];
    for (var n = 0; n < normals.length; n++) {
      var ni = normals[n];
      var sel = verts.filter(function (vv) {
        return Math.abs(ni[0] * vv.x + ni[1] * vv.y + ni[2] * vv.z - s) < 1e-4 * s;
      });
      var face = outward(orderLoop(sel, v3(ni[0], ni[1], ni[2])));
      face.type = 'rhombus';
      faces.push(face);
    }
    var points = [
      { name: 'Γ', p: v3(0, 0, 0) },
      { name: 'H', p: v3(s, 0, 0) },
      { name: 'N', p: v3(s / 2, s / 2, 0) },
      { name: 'P', p: v3(s / 2, s / 2, s / 2) }
    ];
    return pack3('bcc', 'rhombic-dodecahedron', 'ромбододекаэдр', verts, faces, points,
      'ОЦК-решётка, первая зона — ромбододекаэдр. Центры граней — точки N, вершины — H и P.');
  }

  function buildSc(a) {
    var s = Math.PI / a;
    var verts = [];
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sy = -1; sy <= 1; sy += 2) {
        for (var sz = -1; sz <= 1; sz += 2) verts.push(v3(sx * s, sy * s, sz * s));
      }
    }
    var faces = [];
    var axis = ['x', 'y', 'z'];
    for (var ax = 0; ax < 3; ax++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var sel = verts.filter(function (v) { return Math.abs(v[axis[ax]] - sgn * s) < 1e-6 * s; });
        var normal = v3(0, 0, 0);
        normal[axis[ax]] = sgn;
        var face = outward(orderLoop(sel, normal));
        face.type = 'square';
        faces.push(face);
      }
    }
    var points = [
      { name: 'Γ', p: v3(0, 0, 0) },
      { name: 'X', p: v3(s, 0, 0) },
      { name: 'M', p: v3(s, s, 0) },
      { name: 'R', p: v3(s, s, s) }
    ];
    return pack3('sc', 'cube', 'куб', verts, faces, points,
      'Простая кубическая решётка: первая зона — куб со стороной 2π/a. X — центр грани, M — середина ребра, R — вершина.');
  }

  function buildHcp(a, ca) {
    var c = Math.max(0.2, ca) * a;
    var R = 4 * Math.PI / (3 * a);
    var hz = Math.PI / c;
    var verts = [];
    var zsgn, i;
    for (zsgn = -1; zsgn <= 1; zsgn += 2) {
      for (i = 0; i < 6; i++) {
        var th = i * Math.PI / 3;
        verts.push(v3(R * Math.cos(th), R * Math.sin(th), zsgn * hz));
      }
    }
    var faces = [];
    var bottom = outward(verts.slice(0, 6));
    bottom.type = 'hex';
    faces.push(bottom);
    var top = outward(verts.slice(6, 12));
    top.type = 'hex';
    faces.push(top);
    for (i = 0; i < 6; i++) {
      var j = (i + 1) % 6;
      var rect = outward([verts[i], verts[j], verts[j + 6], verts[i + 6]]);
      rect.type = 'rect';
      faces.push(rect);
    }
    var Mlen = 2 * Math.PI / (a * Math.sqrt(3));
    var Mang = Math.PI / 6;
    var points = [
      { name: 'Γ', p: v3(0, 0, 0) },
      { name: 'A', p: v3(0, 0, hz) },
      { name: 'K', p: v3(R, 0, 0) },
      { name: 'H', p: v3(R, 0, hz) },
      { name: 'M', p: v3(Mlen * Math.cos(Mang), Mlen * Math.sin(Mang), 0) },
      { name: 'L', p: v3(Mlen * Math.cos(Mang), Mlen * Math.sin(Mang), hz) }
    ];
    return pack3('hcp', 'hexagonal-prism', 'шестиугольная призма', verts, faces, points,
      'ГПУ: призма. K и H — рёбра (K на середине, H на верхнем конце), A — центр шестиугольника, M и L — центры боковых граней.');
  }

  function pack3(id, shape, title, verts, faces, points, blurb) {
    var counts = { vertices: verts.length, faces: faces.length, hex: 0, square: 0, rhombus: 0, rect: 0 };
    for (var i = 0; i < faces.length; i++) {
      var t = faces[i].type;
      if (counts[t] != null) counts[t]++;
      else counts[t] = 1;
    }
    return { id: id, shape: shape, title: title, vertices: verts, faces: faces, points: points, counts: counts, blurb: blurb };
  }

  function brillouin3d(kind, a, ca) {
    if (kind === 'bcc') return buildBcc(a);
    if (kind === 'sc') return buildSc(a);
    if (kind === 'hcp') return buildHcp(a, ca || Math.sqrt(8 / 3));
    return buildFcc(a);
  }

  function ewald(b1, b2, lambda, angleRad, shells) {
    var kmag = TAU / Math.max(0.05, lambda);
    var kx = kmag * Math.cos(angleRad);
    var ky = kmag * Math.sin(angleRad);
    var pts = latticePoints(b1, b2, shells || 5);
    var hits = [];
    for (var i = 0; i < pts.length; i++) {
      var g = pts[i];
      if (g.i === 0 && g.j === 0) continue;
      var d = hypot2(g.x + kx, g.y + ky);
      var err = Math.abs(d - kmag) / kmag;
      if (err < 0.02) hits.push(g);
    }
    return { k: v2(kx, ky), center: v2(-kx, -ky), radius: kmag, hits: hits, points: pts };
  }

  function morseTurnAverage(energy) {
    var E = clamp(energy, 0.02, 0.92);
    var xs = [];
    var ws = [];
    var x, V, wsum = 0, xsum = 0;
    for (x = -1.6; x <= 5; x += 0.01) {
      var e = Math.exp(-x);
      V = (1 - e) * (1 - e);
      if (V >= E) continue;
      var speed = Math.sqrt(E - V);
      var w = 1 / Math.max(0.04, speed);
      xs.push(x);
      ws.push(w);
      wsum += w;
      xsum += w * x;
    }
    return { mean: wsum ? xsum / wsum : 0, E: E, xs: xs, ws: ws };
  }

  function selfCheck() {
    var errors = [];
    function near(name, got, exp, tol) {
      if (!(Math.abs(got - exp) <= tol)) errors.push(name + ': ' + got + ' != ' + exp);
    }
    var a = 1, Ks = 1, m = 1;
    near('mono max', omegaMono(Math.PI / a, Ks, m, a), 2 * Math.sqrt(Ks / m), 1e-9);
    near('vg edge', vgMono(Math.PI / a, Ks, m, a), 0, 1e-9);
    var gap = diatomicGapEdges(1, 2, 1);
    var edge = diatomicOmega(Math.PI, 1, 2, 1, 1, 1);
    near('gap lo', edge.ac, gap.lo, 1e-9);
    near('gap hi', edge.op, gap.hi, 1e-9);
    near('sqrt m2', gap.lo, Math.sqrt(2 * 1 / 2), 1e-12);
    near('sqrt m1', gap.hi, Math.sqrt(2 * 1 / 1), 1e-12);
    var bz = bzPolygon('hex', 1, 1, 60);
    near('hex sides', bz.poly.length, 6, 0);
    var kd = 0;
    for (var i = 0; i < bz.poly.length; i++) kd = Math.max(kd, len2(bz.poly[i]));
    near('K radius', kd, 4 * Math.PI / 3, 1e-6);
    var Kpt = hexK(1);
    near('Kx', Kpt.x, 4 * Math.PI / 3, 1e-12);
    var dvec = directVectors('hex', 1, 1, 60);
    var rec = reciprocal(dvec.a1, dvec.a2);
    near('b·a', dot2(rec.b1, dvec.a1), TAU, 1e-8);
    near('b1·a2', dot2(rec.b1, dvec.a2), 0, 1e-8);
    var fcc = brillouin3d('fcc', 1);
    near('fcc faces', fcc.counts.faces, 14, 0);
    near('fcc hex', fcc.counts.hex, 8, 0);
    near('fcc sq', fcc.counts.square, 6, 0);
    near('fcc vert', fcc.counts.vertices, 24, 0);
    if (fcc.shape !== 'truncated-octahedron') errors.push('fcc shape');
    var bcc = brillouin3d('bcc', 1);
    near('bcc faces', bcc.counts.faces, 12, 0);
    near('bcc rhomb', bcc.counts.rhombus, 12, 0);
    if (bcc.shape !== 'rhombic-dodecahedron') errors.push('bcc shape');
    var hcp = brillouin3d('hcp', 1, Math.sqrt(8 / 3));
    near('hcp faces', hcp.counts.faces, 8, 0);
    near('tb width', tbBandwidth(1.7), 4 * 1.7, 1e-12);
    near('tb ends', Math.abs(tb1(0, 1, 0, 1) - tb1(Math.PI, 1, 0, 1)), 4, 1e-12);
    near('nfe gap', nfeGap(0.35), 0.7, 1e-12);
    var bands = nfeBands(Math.PI, 1, 0.25, 4);
    near('nfe numerical gap', bands[1].E - bands[0].E, 0.5, 0.02);
    near('debye hot', debyeCV(1e6, 300), 3, 1e-3);
    near('einstein hot', einsteinCV(1e6, 300), 3, 1e-4);
    var crect = bzPolygon('crect', 1.2, 0.8, 90);
    if (crect.poly.length < 4) errors.push('crect poly ' + crect.poly.length);
    return { ok: errors.length === 0, errors: errors };
  }

  var API = {
    TAU: TAU,
    clamp: clamp,
    v2: v2, add2: add2, sub2: sub2, mul2: mul2, dot2: dot2, len2: len2,
    v3: v3, add3: add3, sub3: sub3, mul3: mul3, dot3: dot3, len3: len3, norm3: norm3,
    directVectors: directVectors,
    reciprocal: reciprocal,
    latticePoints: latticePoints,
    voronoi: voronoi,
    zoneIndex: zoneIndex,
    specialPoints2d: specialPoints2d,
    hexK: hexK,
    bzPolygon: bzPolygon,
    omegaMono: omegaMono,
    omegaMonoMax: omegaMonoMax,
    vgMono: vgMono,
    vpMono: vpMono,
    diatomicOmega: diatomicOmega,
    diatomicGapEdges: diatomicGapEdges,
    diatomicMode: diatomicMode,
    dispAtom: dispAtom,
    vgNum: vgNum,
    omegaSquare: omegaSquare,
    omegaHex: omegaHex,
    samplePath: samplePath,
    pathAt: pathAt,
    squareStops: squareStops,
    hexStops: hexStops,
    histogram: histogram,
    debyeCV: debyeCV,
    einsteinCV: einsteinCV,
    nfeBands: nfeBands,
    nfeGap: nfeGap,
    tb1: tb1,
    tbBandwidth: tbBandwidth,
    tb2: tb2,
    tb2Bandwidth: tb2Bandwidth,
    curvature: curvature,
    mstarOf: mstarOf,
    fermiFromFilling: fermiFromFilling,
    kFermi1d: kFermi1d,
    orbitalFT: orbitalFT,
    blochPsi: blochPsi,
    planeWaveCoeffs: planeWaveCoeffs,
    peierls: peierls,
    structureFactor: structureFactor,
    brillouin3d: brillouin3d,
    ewald: ewald,
    morseTurnAverage: morseTurnAverage,
    selfCheck: selfCheck
  };

  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  g.LatticeMath = API;
})();
