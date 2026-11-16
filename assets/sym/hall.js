/* Разбор символа Холла и замыкание группы. Алгоритм как в gemmi (DEN = 24):
   generators_from_hall + Dimino. Данные групп — в sgtable.js. */
(function (root) {
  'use strict';
  const DEN = 24;
  const EXP = [0,
    1,2,2,2,4,2,2,4,4,4,4,8,4,4,8,
    4,4,4,4,8,8,16,8,8,4,4,4,4,4,4,
    4,4,4,4,8,8,8,8,8,8,8,16,16,8,8,8,
    8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,
    16,16,16,16,16,16,32,32,16,16,16,16,
    4,4,4,4,8,8,4,8,8,8,8,8,16,16,
    8,8,8,8,8,8,8,8,16,16,8,8,8,8,8,8,8,8,16,16,16,16,
    8,8,8,8,8,8,8,8,16,16,16,16,
    16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,
    3,3,3,9,6,18,6,6,6,6,6,6,18,
    6,6,6,6,18,18,12,12,12,12,36,36,
    6,6,6,6,6,6,6,12,12,12,12,12,12,12,12,12,12,12,12,
    12,12,12,12,24,24,24,24,
    12,48,24,12,24,24,24,96,96,48,24,48,
    24,24,96,96,48,24,24,48,24,96,48,24,96,48,
    48,48,48,48,192,192,192,192,96,96];

  function truncDiv(a, b) { return a < 0 ? -Math.floor((-a) / b) : Math.floor(a / b); }
  function wrapTran(t) {
    const o = t.slice();
    for (let i = 0; i < 3; i++) {
      let v = o[i];
      if (v >= DEN) v = v % DEN;
      else if (v < 0) v = ((v + 1) % DEN) + DEN - 1;
      o[i] = v;
    }
    return o;
  }
  function detRot(r) {
    return r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1])
      - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
      + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
  }
  function combine(a, b) {
    const rot = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const tran = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      tran[i] = a[1][i] * DEN;
      for (let j = 0; j < 3; j++) {
        rot[i][j] = truncDiv(a[0][i][0] * b[0][0][j] + a[0][i][1] * b[0][1][j] + a[0][i][2] * b[0][2][j], DEN);
        tran[i] += a[0][i][j] * b[1][j];
      }
      tran[i] = truncDiv(tran[i], DEN);
    }
    return [rot, tran];
  }
  function mul(a, b) {
    const c = combine(a, b);
    return [c[0], wrapTran(c[1])];
  }
  function inverse(op) {
    const rot = op[0], tran = op[1], detr = detRot(rot), d2 = DEN * DEN;
    const invr = [
      [truncDiv(d2 * (rot[1][1] * rot[2][2] - rot[2][1] * rot[1][2]), detr),
        truncDiv(d2 * (rot[0][2] * rot[2][1] - rot[0][1] * rot[2][2]), detr),
        truncDiv(d2 * (rot[0][1] * rot[1][2] - rot[0][2] * rot[1][1]), detr)],
      [truncDiv(d2 * (rot[1][2] * rot[2][0] - rot[1][0] * rot[2][2]), detr),
        truncDiv(d2 * (rot[0][0] * rot[2][2] - rot[0][2] * rot[2][0]), detr),
        truncDiv(d2 * (rot[1][0] * rot[0][2] - rot[0][0] * rot[1][2]), detr)],
      [truncDiv(d2 * (rot[1][0] * rot[2][1] - rot[2][0] * rot[1][1]), detr),
        truncDiv(d2 * (rot[2][0] * rot[0][1] - rot[0][0] * rot[2][1]), detr),
        truncDiv(d2 * (rot[0][0] * rot[1][1] - rot[1][0] * rot[0][1]), detr)]
    ];
    const invt = [0, 0, 0];
    for (let i = 0; i < 3; i++) invt[i] = truncDiv(-tran[0] * invr[i][0] - tran[1] * invr[i][1] - tran[2] * invr[i][2], DEN);
    return [invr, invt];
  }
  function ident() { return [[[DEN, 0, 0], [0, DEN, 0], [0, 0, DEN]], [0, 0, 0]]; }
  function negRot(rot) { return rot.map(row => row.map(v => -v)); }
  function rotKey(rot) { return rot.map(r => r.join(',')).join(';'); }

  function hallRotationZ(N) {
    const d = DEN;
    if (N === 1) return [[d, 0, 0], [0, d, 0], [0, 0, d]];
    if (N === 2) return [[-d, 0, 0], [0, -d, 0], [0, 0, d]];
    if (N === 3) return [[0, -d, 0], [d, -d, 0], [0, 0, d]];
    if (N === 4) return [[0, -d, 0], [d, 0, 0], [0, 0, d]];
    if (N === 6) return [[d, -d, 0], [d, 0, 0], [0, 0, d]];
    if (N === "'") return [[0, -d, 0], [-d, 0, 0], [0, 0, -d]];
    if (N === '"') return [[0, d, 0], [d, 0, 0], [0, 0, -d]];
    if (N === '*') return [[0, 0, d], [d, 0, 0], [0, d, 0]];
    throw new Error('ось ' + N);
  }
  function hallTranslation(sym) {
    const h = DEN / 2, q = DEN / 4;
    const m = { a: [h, 0, 0], b: [0, h, 0], c: [0, 0, h], n: [h, h, h], u: [q, 0, 0], v: [0, q, 0], w: [0, 0, q], d: [q, q, q] };
    if (!m[sym]) throw new Error('сдвиг ' + sym);
    return m[sym];
  }
  function alterOrder(r, i, j, k) {
    return [
      [r[i][i], r[i][j], r[i][k]],
      [r[j][i], r[j][j], r[j][k]],
      [r[k][i], r[k][j], r[k][k]]
    ];
  }
  function hallMatrixSymbol(token, pos, prev) {
    const neg = token[0] === '-';
    const p = neg ? token.slice(1) : token;
    if (!p || p[0] < '1' || p[0] === '5' || p[0] > '6') throw new Error('токен ' + token);
    const N = p.charCodeAt(0) - 48;
    let fractional = 0, principal = '', diagonal = '';
    const tran = [0, 0, 0];
    for (let i = 1; i < p.length; i++) {
      const ch = p[i];
      if (ch >= '1' && ch <= '5') {
        if (fractional) throw new Error('два индекса ' + token);
        fractional = ch.charCodeAt(0) - 48;
      } else if (ch === "'" || ch === '"' || ch === '*') diagonal = ch;
      else if (ch === 'x' || ch === 'y' || ch === 'z') principal = ch;
      else {
        const tv = hallTranslation(ch);
        tran[0] += tv[0]; tran[1] += tv[1]; tran[2] += tv[2];
      }
    }
    if (!principal && !diagonal) {
      if (pos === 1) principal = 'z';
      else if (pos === 2 && N === 2) {
        if (prev === 2 || prev === 4) principal = 'x';
        else if (prev === 3 || prev === 6) diagonal = "'";
        else throw new Error('нет оси ' + token);
      } else if (pos === 3 && N === 3) diagonal = '*';
      else if (N !== 1) throw new Error('нет оси ' + token);
    }
    let rot = hallRotationZ(diagonal || N);
    if (neg) rot = negRot(rot);
    if (principal === 'x') rot = alterOrder(rot, 2, 0, 1);
    else if (principal === 'y') rot = alterOrder(rot, 1, 2, 0);
    if (fractional) {
      if (!principal) throw new Error('дробный сдвиг без оси ' + token);
      tran[principal.charCodeAt(0) - 120] += (DEN / N) * fractional;
    }
    return { op: [rot, tran], N };
  }
  function centring(lat) {
    const h = DEN / 2, t = (DEN / 3) | 0, d = 2 * t;
    const L = lat.toUpperCase();
    if (L === 'P') return [[0, 0, 0]];
    if (L === 'A') return [[0, 0, 0], [0, h, h]];
    if (L === 'B') return [[0, 0, 0], [h, 0, h]];
    if (L === 'C') return [[0, 0, 0], [h, h, 0]];
    if (L === 'I') return [[0, 0, 0], [h, h, h]];
    if (L === 'R') return [[0, 0, 0], [d, t, t], [t, d, d]];
    if (L === 'F') return [[0, 0, 0], [0, h, h], [h, 0, h], [h, h, 0]];
    throw new Error('решётка ' + lat);
  }
  function findRot(ops, rot) {
    const k = rotKey(rot);
    for (let i = 0; i < ops.length; i++) if (rotKey(ops[i][0]) === k) return ops[i];
    return null;
  }
  function addMissing(symOps) {
    if (symOps.length <= 1) return symOps;
    const gen = symOps.slice(1);
    symOps = symOps.slice(0, 2);
    const idrot = rotKey(ident()[0]);
    let g = mul(symOps[1], symOps[1]);
    let guard = 0;
    while (rotKey(g[0]) !== idrot) {
      symOps.push(g);
      g = mul(g, symOps[1]);
      if (++guard > 80) throw new Error('степени');
    }
    for (let i = 1; i < gen.length; i++) {
      const coset = [ident()];
      const initSize = symOps.length;
      for (;;) {
        const ln = coset.length;
        for (let j = 0; j < ln; j++) {
          for (let n = 0; n < i + 1; n++) {
            const sg = mul(gen[n], coset[j]);
            if (!findRot(symOps, sg[0])) {
              symOps.push(sg);
              for (let k = 1; k < initSize; k++) symOps.push(mul(sg, symOps[k]));
              coset.push(sg);
            }
          }
        }
        if (ln === coset.length) break;
        if (symOps.length > 1024) throw new Error('слишком много операций');
      }
    }
    return symOps;
  }
  function changeBasis(sym, cen, cob) {
    const inv = inverse(cob);
    const newSym = [sym[0]];
    for (let i = 1; i < sym.length; i++) newSym.push(mul(mul(cob, sym[i]), inv));
    const newCen = [cen[0]];
    const I = ident()[0];
    for (let i = 1; i < cen.length; i++) {
      const prod = mul(mul(cob, [I, cen[i]]), inv);
      newCen.push(prod[1]);
    }
    const uniq = [];
    newCen.forEach(c => { if (!uniq.some(u => u[0] === c[0] && u[1] === c[1] && u[2] === c[2])) uniq.push(c); });
    return [newSym, uniq];
  }
  function parseShift(inner) {
    const parts = inner.trim().split(/\s+/);
    const tran = [0, 0, 0];
    for (let i = 0; i < 3; i++) tran[i] = (Number(parts[i]) % 12) * (DEN / 12);
    return [ident()[0], tran];
  }
  function generatorsFromHall(hall) {
    const toks = String(hall).trim().replace(/_/g, ' ').split(/\s+/);
    let lat = toks[0];
    let centro = false;
    if (lat[0] === '-') { centro = true; lat = lat.slice(1); }
    let cen = centring(lat);
    let sym = [ident()];
    let prev = 0, counter = 0, i = 1;
    for (; i < toks.length; i++) {
      const tok = toks[i];
      if (tok[0] === '(') break;
      counter++;
      if (tok !== '1') {
        const parsed = hallMatrixSymbol(tok, counter, prev);
        sym.push(parsed.op);
        prev = parsed.N;
      }
    }
    if (centro) sym.push([negRot(ident()[0]), [0, 0, 0]]);
    if (i < toks.length) {
      const joined = toks.slice(i).join(' ');
      const inner = joined.slice(joined.indexOf('(') + 1, joined.indexOf(')'));
      const cb = changeBasis(sym, cen, parseShift(inner));
      sym = cb[0]; cen = cb[1];
    }
    return { sym, cen };
  }
  function expand(sym, cen) {
    const ops = [];
    const seen = new Set();
    sym.forEach(s => cen.forEach(c => {
      const t = wrapTran([s[1][0] + c[0], s[1][1] + c[1], s[1][2] + c[2]]);
      const key = rotKey(s[0]) + '|' + t.join(',');
      if (seen.has(key)) return;
      seen.add(key);
      ops.push([s[0], t]);
    }));
    return ops;
  }
  const cache = new Map();
  function groupOps(hall) {
    if (cache.has(hall)) return cache.get(hall);
    const g = generatorsFromHall(hall);
    g.sym = addMissing(g.sym);
    g.ops = expand(g.sym, g.cen);
    cache.set(hall, g);
    return g;
  }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  function frac(n) {
    if (!n) return '';
    const g = gcd(n, DEN);
    const num = n / g, den = DEN / g;
    const sign = num > 0 ? '+' : '-';
    const a = Math.abs(num);
    return sign + (den === 1 ? String(a) : a + '/' + den);
  }
  function triplet(op) {
    const rot = op[0], tran = op[1], names = ['x', 'y', 'z'];
    const parts = [];
    for (let i = 0; i < 3; i++) {
      let s = '';
      for (let j = 0; j < 3; j++) {
        const c = truncDiv(rot[i][j], DEN);
        if (!c) continue;
        if (c === 1) s += (s ? '+' : '') + names[j];
        else if (c === -1) s += '-' + names[j];
        else s += (s && c > 0 ? '+' : '') + c + names[j];
      }
      const f = frac(tran[i]);
      if (f) s += f;
      parts.push(s || '0');
    }
    return parts.join(', ');
  }

  function rotType(op) {
    const trDen = op[0][0][0] + op[0][1][1] + op[0][2][2];
    const det = detRot(op[0]);
    const tr = truncDiv(trDen, DEN);
    const table = [0, 0, 2, 3, 4, 6, 1];
    if (Math.abs(det) === DEN * DEN * DEN && tr * DEN === trDen && Math.abs(tr) <= 3) {
      return det > 0 ? table[3 + tr] : -table[3 - tr];
    }
    return 0;
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function unit(a) { const n = norm(a) || 1; return scale(a, 1 / n); }

  /** Ось (собственный вектор) в дробных координатах и точка на ней. */
  function axisPoint(R, t, lambda) {
    const A = R.map((row, i) => row.map((v, j) => v / DEN - (i === j ? lambda : 0)));
    const b = t.map(v => -v / DEN);
    // решаем A x = b в наименьших квадратах, фиксируя одну свободную координату
    let best = null;
    for (let free = 0; free < 3; free++) {
      const idx = [0, 1, 2].filter(k => k !== free);
      const M = [[A[idx[0]][idx[0]], A[idx[0]][idx[1]]], [A[idx[1]][idx[0]], A[idx[1]][idx[1]]]];
      const bb = [b[idx[0]], b[idx[1]]];
      const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      if (Math.abs(det) < 1e-8) continue;
      const x1 = (bb[0] * M[1][1] - M[0][1] * bb[1]) / det;
      const x2 = (M[0][0] * bb[1] - bb[0] * M[1][0]) / det;
      const x = [0, 0, 0];
      x[idx[0]] = x1; x[idx[1]] = x2;
      const resid = [0, 0, 0];
      for (let i = 0; i < 3; i++) resid[i] = A[i][0] * x[0] + A[i][1] * x[1] + A[i][2] * x[2] - b[i];
      const err = norm(resid);
      if (!best || err < best.err) best = { x, err };
    }
    return best ? best.x : [0, 0, 0];
  }
  function properAxis(R) {
    const Rf = R.map(row => row.map(v => v / DEN));
    let ax = [Rf[2][1] - Rf[1][2], Rf[0][2] - Rf[2][0], Rf[1][0] - Rf[0][1]];
    if (norm(ax) < 1e-6) {
      const S = Rf.map((row, i) => row.map((v, j) => v + (i === j ? 1 : 0)));
      let col = 0, best = -1;
      for (let j = 0; j < 3; j++) {
        const n = Math.hypot(S[0][j], S[1][j], S[2][j]);
        if (n > best) { best = n; col = j; }
      }
      ax = [S[0][col], S[1][col], S[2][col]];
    }
    return unit(ax);
  }

  function nearLattice(tran, cen) {
    const list = cen && cen.length ? cen : [[0, 0, 0]];
    return list.some(c => [0, 1, 2].every(i => {
      let d = tran[i] - c[i];
      d %= DEN;
      if (d < 0) d += DEN;
      return d < 2 || d > DEN - 2;
    }));
  }
  function classify(op, cen) {
    const type = rotType(op);
    const R = op[0], t = op[1].map(v => v / DEN);
    if (type === 1) {
      const pure = nearLattice(op[1], [[0, 0, 0]]);
      if (pure) return { kind: 'id', type, order: 1, label: '1', axis: [0, 0, 1], origin: [0, 0, 0], screw: 0 };
      return { kind: 'cen', type, order: 1, label: 't', axis: [0, 0, 1], origin: [0, 0, 0], screw: 0, glide: t };
    }
    if (type === -1) {
      const origin = t.map(v => v / 2);
      return { kind: 'inv', type, order: 2, label: '1̄', axis: [0, 0, 1], origin, screw: 0 };
    }
    const proper = type > 0;
    const fold = Math.abs(type === -2 ? 2 : type);
    let axis;
    if (proper) axis = properAxis(R);
    else if (type === -2) axis = properAxis(negRot(R));
    else axis = properAxis(negRot(R));
    // параллельная и перпендикулярная части сдвига (в дробном базисе, вдоль оси как вектора компонент)
    const intr = intrinsicTran(op, fold);
    const along = dot(intr.map(v => v / DEN), axis);
    const para = scale(axis, along);
    const perp = [intr[0] / DEN - para[0], intr[1] / DEN - para[1], intr[2] / DEN - para[2]];
    const lattice = nearLattice(intr, cen);
    const origin = axisPoint(R, op[1], proper || type === -1 ? 1 : -1);
    if (type === -2) {
      const glide = !lattice;
      return { kind: glide ? 'glide' : 'mirror', type, order: 2, label: glide ? glideName(perp) : 'm', axis, normal: axis, origin, screw: 0, glide: glide ? perp : [0, 0, 0] };
    }
    if (!proper) {
      const name = type === -3 ? '3̄' : type === -4 ? '4̄' : '6̄';
      return { kind: 'sn', type, order: fold === 3 ? 6 : fold * 2, label: name, axis, origin, screw: 0 };
    }
    const screw = !lattice;
    const mark = screw ? screwSymbol(fold, along) : '';
    return { kind: screw ? 'screw' : 'rot', type, order: fold, label: String(fold) + mark, axis, origin, screw: screw ? along - Math.round(along) : 0 };
  }
  function intrinsicTran(op, fold) {
    const acc = [0, 0, 0];
    let Rpow = [[DEN, 0, 0], [0, DEN, 0], [0, 0, DEN]];
    const t = op[1];
    for (let k = 0; k < fold; k++) {
      for (let i = 0; i < 3; i++) acc[i] += truncDiv(Rpow[i][0] * t[0] + Rpow[i][1] * t[1] + Rpow[i][2] * t[2], DEN);
      Rpow = combine([Rpow, [0, 0, 0]], op)[0];
    }
    return acc.map(v => truncDiv(v, fold));
  }
  function glideName(perp) {
    const a = perp.map(v => Math.abs(v - Math.round(v)));
    const nz = a.map(v => v > 0.05);
    const n = nz.filter(Boolean).length;
    if (n >= 2) return 'n';
    if (nz[0]) return 'a';
    if (nz[1]) return 'b';
    if (nz[2]) return 'c';
    return 'g';
  }
  function screwSymbol(fold, along) {
    let f = along - Math.floor(along);
    if (f < 0) f += 1;
    const k = Math.round(f * fold);
    if (!k || k === fold) return '';
    const sub = '₀₁₂₃₄₅₆₇₈₉'[k] || String(k);
    return sub;
  }

  function hasPhase(t, hkl) {
    return ((hkl[0] * t[0] + hkl[1] * t[1] + hkl[2] * t[2]) % DEN) !== 0;
  }
  function applyHkl(rot, hkl) {
    const r = [0, 0, 0];
    for (let i = 0; i < 3; i++) r[i] = rot[0][i] * hkl[0] + rot[1][i] * hkl[1] + rot[2][i] * hkl[2];
    return r;
  }
  function systematicallyAbsent(group, hkl) {
    const g = groupOps(group.hall);
    for (let i = 1; i < g.cen.length; i++) if (hasPhase(g.cen[i], hkl)) return true;
    const denh = [DEN * hkl[0], DEN * hkl[1], DEN * hkl[2]];
    for (let i = 1; i < g.sym.length; i++) {
      const img = applyHkl(g.sym[i][0], hkl);
      if (img[0] === denh[0] && img[1] === denh[1] && img[2] === denh[2]) {
        for (let c = 0; c < g.cen.length; c++) {
          const t = [g.sym[i][1][0] + g.cen[c][0], g.sym[i][1][1] + g.cen[c][1], g.sym[i][1][2] + g.cen[c][2]];
          if (hasPhase(t, hkl)) return true;
        }
      }
    }
    return false;
  }

  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆' };
  function prettyToken(tok) {
    const m = /^(-?)([2346])([1-6])(.*)$/.exec(tok);
    if (!m) {
      if (tok === '-1') return '1̄';
      if (tok === '-3') return '3̄';
      if (tok === '-4') return '4̄';
      if (tok === '-6') return '6̄';
      return tok;
    }
    const n = +m[2], k = +m[3];
    const ok = (n === 2 && k === 1) || (n === 3 && k <= 2) || (n === 4 && k <= 3) || (n === 6 && k <= 5);
    if (!ok || m[1]) return (m[1] ? (n === 3 ? '3̄' : n === 4 ? '4̄' : n === 6 ? '6̄' : '-' + n) : tok);
    return m[2] + (SUB[m[3]] || m[3]) + m[4].replace('/', '/');
  }
  function prettyHM(hm) {
    let parts = hm.split(/\s+/);
    if (parts.length > 3 && parts[1] === '1' && parts[parts.length - 1] === '1') parts = [parts[0]].concat(parts.slice(2, -1));
    return parts.map(p => p.split('/').map((bit, i) => (i ? '/' : '') + prettyBit(bit)).join('')).join('');
  }
  function prettyBit(bit) {
    if (bit[0] === '-' && bit.length > 1) {
      const rest = bit.slice(1);
      const sym = rest === '1' ? '1̄' : rest === '3' ? '3̄' : rest === '4' ? '4̄' : rest === '6' ? '6̄' : '-' + rest;
      return sym;
    }
    return prettyToken(bit).replace('/', '');
  }
  function prettyFull(hm) {
    return hm.split(/\s+/).map(tok => {
      if (tok.includes('/')) {
        const [a, b] = tok.split('/');
        return prettyBit(a) + '/' + b;
      }
      return prettyBit(tok);
    }).join(' ');
  }

  const SYS_RU = {
    triclinic: 'триклинная', monoclinic: 'моноклинная', orthorhombic: 'ромбическая',
    tetragonal: 'тетрагональная', trigonal: 'тригональная', hexagonal: 'гексагональная', cubic: 'кубическая'
  };
  const LAT_RU = { P: 'примитивная (P)', A: 'базоцентрированная A', B: 'базоцентрированная B', C: 'базоцентрированная C', I: 'объёмноцентрированная (I)', F: 'гранецентрированная (F)', R: 'ромбоэдрическая (R)' };

  const byNumber = new Map();
  function table() { return root.SYM_SG || []; }
  function ensureIndex() {
    if (byNumber.size) return;
    table().forEach(g => byNumber.set(g.n, g));
  }
  function get(n) { ensureIndex(); return byNumber.get(+n) || null; }
  function opsOf(n) {
    const g = get(n);
    if (!g) throw new Error('нет группы ' + n);
    return groupOps(g.hall).ops;
  }
  function multiplicity(n) { return EXP[n]; }
  function describe(n) {
    const g = get(n);
    const pack = groupOps(g.hall);
    return pack.ops.map(op => Object.assign({ op, triplet: triplet(op) }, classify(op, pack.cen)));
  }

  function selftest() {
    const bad = [];
    for (let n = 1; n <= 230; n++) {
      const g = get(n);
      if (!g) { bad.push('нет ' + n); continue; }
      let len = 0;
      try { len = opsOf(n).length; } catch (e) { bad.push(n + ' ' + e.message); continue; }
      if (len !== EXP[n]) bad.push(n + ' ' + g.hall + ' ' + len + '!=' + EXP[n]);
    }
    const p21c = opsOf(14).map(triplet).sort();
    const expect = ['x, y, z', '-x, y+1/2, -z+1/2', '-x, -y, -z', 'x, -y+1/2, z+1/2'].sort();
    if (p21c.join(' | ') !== expect.join(' | ')) bad.push('P21/c ' + p21c.join('; '));
    const g14 = get(14);
    if (!systematicallyAbsent(g14, [0, 1, 0])) bad.push('010 должно погаснуть');
    if (systematicallyAbsent(g14, [0, 2, 0])) bad.push('020 не гаснет');
    if (!systematicallyAbsent(g14, [1, 0, 1])) bad.push('101 должно погаснуть');
    if (systematicallyAbsent(g14, [1, 1, 1])) bad.push('111 не систематическое');
    if (opsOf(225).length !== 192) bad.push('Fm-3m');
    if (opsOf(230).length !== 96) bad.push('Ia-3d');
    return bad;
  }

  root.SYM = root.SYM || {};
  root.SYM.hall = {
    DEN, EXP, get, opsOf, multiplicity, triplet, classify, describe, rotType, groupOps,
    systematicallyAbsent, prettyHM, prettyFull, SYS_RU, LAT_RU, selftest, table
  };
})(typeof window !== 'undefined' ? window : globalThis);
