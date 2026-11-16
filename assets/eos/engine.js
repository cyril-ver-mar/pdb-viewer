/* Уравнения состояния газов: чистые функции, без DOM.
   Единицы внутри: P — Па, Vm — м³/моль, T — К, a, b — СИ.
   Источники констант указаны в EOS.SOURCES и на странице eos.html. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EOS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const R = 8.314462618;
  const NA = 6.02214076e23;
  const kB = R / NA;
  const BAR = 1e5;
  const ATM = 101325;
  const E2 = Math.E * Math.E;

  const OMEGA = {
    rkA: 1 / (9 * (Math.pow(2, 1 / 3) - 1)),
    rkB: (Math.pow(2, 1 / 3) - 1) / 3,
    prA: 0.4572355289213822,
    prB: 0.07779607390388846,
    prZc: 0.30740130869870383
  };

  const HS_RED = [1, 0.625, 0.2869495, 0.110252, 0.03888198, 0.01302354, 0.0041832, 0.001698];

  const EOS_LIST = [
    { id: 'ideal', name: 'Идеальный газ', short: 'идеал.' },
    { id: 'virial', name: 'Вириальное разложение', short: 'вириал' },
    { id: 'vdw', name: 'Ван-дер-Ваальс', short: 'ВдВ' },
    { id: 'rk', name: 'Редлих–Квонг', short: 'RK' },
    { id: 'srk', name: 'Соаве–Редлих–Квонг', short: 'SRK' },
    { id: 'pr', name: 'Пенг–Робинсон', short: 'PR' },
    { id: 'berthelot', name: 'Бертло', short: 'Бертло' },
    { id: 'dieterici', name: 'Дитеричи', short: 'Дитеричи' },
    { id: 'bb', name: 'Битти–Бриджмен', short: 'BB' },
    { id: 'bwr', name: 'Бенедикт–Вебб–Рубин', short: 'BWR' }
  ];

  const VIRIAL_SOURCES = [
    { id: 'vdw', name: 'Разложение Ван-дер-Ваальса' },
    { id: 'hs', name: 'Твёрдые сферы' },
    { id: 'lj', name: 'Леннард-Джонс (B численно)' },
    { id: 'exp', name: 'Эксперимент: B(T), старшие — ВдВ' }
  ];

  /* Pc в бар, Vc в см³/моль. fit: B = a − b·exp(c/T), B в см³/моль.
     bPoints: [T, B] из таблиц Эткинса (AIP). LJ: Reid–Prausnitz–Poling, вязкость. */
  function G(o) {
    o.Pc = o.PcBar * BAR;
    o.Vc = o.VcCm * 1e-6;
    o.lj = { eps: o.eps, sigma: o.sigma };
    o.fit = { a: o.fa, b: o.fb, c: o.fc, tMin: o.tMin, tMax: o.tMax };
    return o;
  }

  const GASES = [
    G({ id: 'He', formula: 'He', name: 'Гелий', M: 0.0040026, shape: 'he', src: 'NIST', Tc: 5.1953, PcBar: 2.2746, VcCm: 57.4, omega: -0.382, eps: 10.22, sigma: 2.551, fa: 114.1, fb: 98.7, fc: 3.245, tMin: 7, tMax: 150, bPoints: [[100, 11.4], [273, 12.0], [373, 11.3], [600, 10.4]], bb: { A0: 0.0216, a: 0.05984, B0: 0.01400, b: 0, c: 40 } }),
    G({ id: 'Ne', formula: 'Ne', name: 'Неон', M: 0.0201797, shape: 'ne', src: 'NIST', Tc: 44.4918, PcBar: 26.786, VcCm: 41.7, omega: -0.0387, eps: 32.8, sigma: 2.820, fa: 81.0, fb: 63.6, fc: 30.7, tMin: 44, tMax: 973, bPoints: [[100, -6.0], [273, 10.4], [373, 12.3], [600, 13.8]], bb: { A0: 0.2125, a: 0.02196, B0: 0.02060, b: 0, c: 1010 } }),
    G({ id: 'Ar', formula: 'Ar', name: 'Аргон', M: 0.039948, shape: 'ar', src: 'NIST', Tc: 150.687, PcBar: 48.63, VcCm: 74.59, omega: -0.0022, eps: 93.3, sigma: 3.542, fa: 154.2, fb: 119.3, fc: 105.1, tMin: 80, tMax: 1024, bPoints: [[100, -187.0], [273, -21.7], [373, -4.2], [600, 11.9]], cPoints: [[273, 1200]], bb: { A0: 1.2907, a: 0.02328, B0: 0.03931, b: 0, c: 5.99e4 }, boyleExp: 411.5 }),
    G({ id: 'Kr', formula: 'Kr', name: 'Криптон', M: 0.083798, shape: 'kr', src: 'CRC', Tc: 209.48, PcBar: 55.25, VcCm: 91.2, omega: 0.005, eps: 178.9, sigma: 3.655, fa: 189.6, fb: 148.0, fc: 145.3, tMin: 110, tMax: 700, bPoints: [[273, -62.9], [373, -28.7], [600, 1.7]], boyleExp: 575 }),
    G({ id: 'Xe', formula: 'Xe', name: 'Ксенон', M: 0.131293, shape: 'xe', src: 'NIST', Tc: 289.733, PcBar: 58.42, VcCm: 118.0, omega: 0.00363, eps: 231.0, sigma: 4.047, fa: 245.6, fb: 190.9, fc: 200.2, tMin: 160, tMax: 650, bPoints: [[273, -153.7], [373, -81.7], [600, -19.6]], boyleExp: 768 }),
    G({ id: 'H2', formula: 'H₂', name: 'Водород', M: 0.00201588, shape: 'h2', src: 'NIST', Tc: 33.145, PcBar: 12.964, VcCm: 64.5, omega: -0.219, eps: 59.7, sigma: 2.827, fa: 315.0, fb: 289.7, fc: 9.47, tMin: 14, tMax: 400, bPoints: [[100, -2.0], [273, 13.7], [373, 15.6]], bb: { A0: 0.1975, a: -0.00506, B0: 0.02096, b: -0.04359, c: 504 }, boyleExp: 110 }),
    G({ id: 'N2', formula: 'N₂', name: 'Азот', M: 0.0280134, shape: 'n2', src: 'NIST', Tc: 126.192, PcBar: 33.958, VcCm: 89.42, omega: 0.0372, eps: 71.4, sigma: 3.798, fa: 185.4, fb: 141.8, fc: 88.7, tMin: 75, tMax: 700, bPoints: [[100, -160.0], [273, -10.5], [373, 6.2], [600, 21.7]], bb: { A0: 1.3445, a: 0.02617, B0: 0.05046, b: -0.00691, c: 4.20e4 }, boyleExp: 327.2 }),
    G({ id: 'O2', formula: 'O₂', name: 'Кислород', M: 0.0319988, shape: 'o2', src: 'NIST', Tc: 154.581, PcBar: 50.43, VcCm: 73.37, omega: 0.0222, eps: 106.7, sigma: 3.467, fa: 152.8, fb: 117.0, fc: 108.8, tMin: 90, tMax: 400, bPoints: [[100, -197.5], [273, -22.0], [373, -3.7], [600, 12.9]], bb: { A0: 1.4911, a: 0.02562, B0: 0.04624, b: 0.004208, c: 4.80e4 }, boyleExp: 405.9 }),
    G({ id: 'CO', formula: 'CO', name: 'Монооксид углерода', M: 0.0280101, shape: 'co', src: 'CRC', Tc: 132.86, PcBar: 34.935, VcCm: 93.1, omega: 0.049, eps: 91.7, sigma: 3.690, fa: 202.6, fb: 154.2, fc: 94.2, tMin: 90, tMax: 573, bPoints: [] }),
    G({ id: 'CO2', formula: 'CO₂', name: 'Диоксид углерода', M: 0.0440095, shape: 'co2', src: 'NIST', Tc: 304.1282, PcBar: 73.773, VcCm: 94.118, omega: 0.22394, eps: 195.2, sigma: 3.941, fa: 137.6, fb: 87.7, fc: 325.7, tMin: 220, tMax: 1100, bPoints: [[273, -142], [373, -72.2], [600, -12.4]], bb: { A0: 5.0065, a: 0.07132, B0: 0.10476, b: 0.07235, c: 6.60e5 }, boyleExp: 714.8 }),
    G({ id: 'CH4', formula: 'CH₄', name: 'Метан', M: 0.0160428, shape: 'ch4', src: 'NIST', Tc: 190.564, PcBar: 45.992, VcCm: 98.63, omega: 0.01142, eps: 148.6, sigma: 3.758, fa: 206.4, fb: 159.5, fc: 133.0, tMin: 110, tMax: 600, bPoints: [[273, -53.6], [373, -21.2], [600, 8.1]], bb: { A0: 2.2769, a: 0.01855, B0: 0.05587, b: -0.01587, c: 1.283e5 }, bwr: { a: 0.0494, A0: 1.855, b: 0.00338004, B0: 0.0426, c: 2545, C0: 22567, alpha: 1.24359e-4, gamma: 0.006 }, boyleExp: 510 }),
    G({ id: 'C2H6', formula: 'C₂H₆', name: 'Этан', M: 0.030069, shape: 'c2h6', src: 'NIST', Tc: 305.32, PcBar: 48.722, VcCm: 145.6, omega: 0.0995, eps: 215.7, sigma: 4.443, fa: 267.3, fb: 191.5, fc: 256, tMin: 210, tMax: 500, bPoints: [] }),
    G({ id: 'C3H8', formula: 'C₃H₈', name: 'Пропан', M: 0.0440956, shape: 'c3h8', src: 'NIST', Tc: 369.89, PcBar: 42.512, VcCm: 200, omega: 0.1521, eps: 237.1, sigma: 5.118, fa: 322.8, fb: 220.3, fc: 350, tMin: 240, tMax: 330, bPoints: [] }),
    G({ id: 'C4H10', formula: 'н-C₄H₁₀', name: 'н-Бутан', M: 0.0581222, shape: 'c4h10', src: 'NIST', Tc: 425.125, PcBar: 37.96, VcCm: 255, omega: 0.201, eps: 531.4, sigma: 4.687, fa: 165.4, fb: 135.4, fc: 555, tMin: 250, tMax: 400, bPoints: [] }),
    G({ id: 'NH3', formula: 'NH₃', name: 'Аммиак', M: 0.0170305, shape: 'nh3', src: 'CRC', Tc: 405.5, PcBar: 113.5, VcCm: 72.5, omega: 0.253, eps: 558.3, sigma: 2.900, fa: 44.3, fb: 23.6, fc: 766.6, tMin: 273, tMax: 573, bPoints: [], bb: { A0: 2.3930, a: 0.17031, B0: 0.03415, b: 0.19112, c: 4.7687e6 } }),
    G({ id: 'H2O', formula: 'H₂O', name: 'Вода', M: 0.01801528, shape: 'h2o', src: 'NIST', Tc: 647.096, PcBar: 220.64, VcCm: 55.95, omega: 0.3443, eps: 809.1, sigma: 2.641, fa: 33.0, fb: 15.2, fc: 1300.7, tMin: 293, tMax: 1248, bPoints: [] }),
    G({ id: 'Cl2', formula: 'Cl₂', name: 'Хлор', M: 0.070906, shape: 'cl2', src: 'CRC', Tc: 416.9, PcBar: 79.8, VcCm: 124, omega: 0.069, eps: 316.0, sigma: 4.217, fa: 201.9, fb: 131.8, fc: 409.9, tMin: 360, tMax: 700, bPoints: [] }),
    G({ id: 'SO2', formula: 'SO₂', name: 'Диоксид серы', M: 0.064064, shape: 'so2', src: 'CRC', Tc: 430.8, PcBar: 78.8, VcCm: 122, omega: 0.251, eps: 335.4, sigma: 4.112, fa: 134.4, fb: 72.5, fc: 606.5, tMin: 265, tMax: 473, bPoints: [] })
  ];

  const SOURCES = {
    critical: 'Tc, Pc, Vc, ω — NIST Chemistry WebBook (SRD 69), где есть рекомендованные константы; иначе CRC Handbook / таблицы физической химии (Atkins, данные AIP, KL).',
    lj: 'ε/k и σ — эффективный сферический потенциал Леннард-Джонса по вязкости: Reid, Prausnitz, Poling, The Properties of Gases and Liquids, 4-е изд.',
    virial: 'Гладкая кривая B(T) = a − b·exp(c/T) (см³/моль) — эмпирическая подгонка, коэффициенты из сводок физической химии; точки — таблица Эткинса (AIP). Первичные измерения собраны у Dymond & Smith. Для Ar при 273 К в той же таблице C = 1200 см⁶/моль².',
    bb: 'Константы Битти–Бриджмена — классические учебные таблицы (л, атм). Есть не для всех газов.',
    bwr: 'Константы Бенедикта–Вебба–Рубина для метана — классический набор (л, атм). Для остальных газов в страницу не встроены.',
    ab: 'a и b Ван-дер-Ваальса, Редлиха–Квонга, Соаве, Пенга–Робинсона, Бертло и Дитеричи считаются из Tc, Pc (и ω), а не подгоняются отдельно.'
  };

  function gasById(id) {
    for (let i = 0; i < GASES.length; i++) if (GASES[i].id === id) return GASES[i];
    return null;
  }

  function clampN(n) {
    n = n | 0;
    if (n < 1) return 1;
    if (n > 8) return 8;
    return n;
  }

  function vdwAB(Tc, Pc) {
    return {
      a: (27 / 64) * R * R * Tc * Tc / Pc,
      b: R * Tc / (8 * Pc)
    };
  }

  function criticalFromVdW(a, b) {
    const Tc = (8 * a) / (27 * R * b);
    const Pc = a / (27 * b * b);
    const Vc = 3 * b;
    return { Tc: Tc, Pc: Pc, Vc: Vc, Zc: Pc * Vc / (R * Tc) };
  }

  function criticalFromBerthelot(a, b) {
    const Tc = Math.sqrt((8 * a) / (27 * R * b));
    const Pc = R * Tc / (8 * b);
    const Vc = 3 * b;
    return { Tc: Tc, Pc: Pc, Vc: Vc, Zc: 0.375 };
  }

  function criticalFromDieterici(a, b) {
    const Tc = a / (4 * R * b);
    const Pc = R * Tc / (E2 * b);
    const Vc = 2 * b;
    return { Tc: Tc, Pc: Pc, Vc: Vc, Zc: 2 / E2 };
  }

  function vdwParams(gas) {
    if (gas.aSI > 0 && gas.bSI > 0) return { a: gas.aSI, b: gas.bSI };
    return vdwAB(gas.Tc, gas.Pc);
  }

  function srkM(omega) { return 0.480 + 1.574 * omega - 0.176 * omega * omega; }
  function prKappa(omega) { return 0.37464 + 1.54226 * omega - 0.26992 * omega * omega; }

  function alphaSoave(m, Tr) {
    const s = 1 + m * (1 - Math.sqrt(Math.max(Tr, 1e-8)));
    return s * s;
  }

  /* Параметры кубического (и близкого) уравнения при температуре T. a — в тех единицах, как в формуле. */
  function cubicParams(id, gas, T) {
    const Tc = gas.Tc, Pc = gas.Pc, w = gas.omega || 0;
    if (!(Tc > 0) || !(Pc > 0)) return null;
    const Tr = T / Tc;
    if (id === 'vdw') return vdwParams(gas);
    if (id === 'rk') {
      return {
        a: OMEGA.rkA * R * R * Math.pow(Tc, 2.5) / Pc,
        b: OMEGA.rkB * R * Tc / Pc
      };
    }
    if (id === 'srk') {
      const ac = OMEGA.rkA * R * R * Tc * Tc / Pc;
      const m = srkM(w);
      return { a: ac * alphaSoave(m, Tr), b: OMEGA.rkB * R * Tc / Pc, ac: ac, m: m };
    }
    if (id === 'pr') {
      const ac = OMEGA.prA * R * R * Tc * Tc / Pc;
      const kappa = prKappa(w);
      return { a: ac * alphaSoave(kappa, Tr), b: OMEGA.prB * R * Tc / Pc, ac: ac, kappa: kappa };
    }
    if (id === 'berthelot') {
      return {
        a: (27 / 64) * R * R * Tc * Tc * Tc / Pc,
        b: R * Tc / (8 * Pc)
      };
    }
    if (id === 'dieterici') {
      return {
        a: 4 * R * R * Tc * Tc / (Pc * E2),
        b: R * Tc / (Pc * E2)
      };
    }
    return null;
  }

  function modelCritical(id, gas) {
    if (!gas || !(gas.Tc > 0) || !(gas.Pc > 0)) return null;
    if (id === 'vdw') {
      const p = vdwParams(gas);
      return criticalFromVdW(p.a, p.b);
    }
    if (id === 'berthelot') {
      const p = cubicParams('berthelot', gas, gas.Tc);
      return criticalFromBerthelot(p.a, p.b);
    }
    if (id === 'dieterici') {
      const p = cubicParams('dieterici', gas, gas.Tc);
      return criticalFromDieterici(p.a, p.b);
    }
    if (id === 'rk' || id === 'srk') {
      const b = OMEGA.rkB * R * gas.Tc / gas.Pc;
      const Zc = 1 / 3;
      return { Tc: gas.Tc, Pc: gas.Pc, Vc: Zc * R * gas.Tc / gas.Pc, Zc: Zc, b: b };
    }
    if (id === 'pr') {
      return {
        Tc: gas.Tc,
        Pc: gas.Pc,
        Vc: OMEGA.prZc * R * gas.Tc / gas.Pc,
        Zc: OMEGA.prZc,
        b: OMEGA.prB * R * gas.Tc / gas.Pc
      };
    }
    return null;
  }

  function hasParams(id, gas) {
    if (id === 'bb') return !!(gas && gas.bb);
    if (id === 'bwr') return !!(gas && gas.bwr);
    return true;
  }

  function pressureBB(gas, T, Vm) {
    const p = gas.bb;
    if (!p) return NaN;
    const V = Vm * 1000;
    if (!(V > 0)) return NaN;
    const Rbb = R / 101.325;
    const A = p.A0 * (1 - p.a / V);
    const B = p.B0 * (1 - p.b / V);
    const eps = p.c / (V * T * T * T);
    const Patm = (Rbb * T * (1 - eps) * (V + B) - A) / (V * V);
    return Patm * ATM;
  }

  function pressureBWR(gas, T, Vm) {
    const p = gas.bwr;
    if (!p) return NaN;
    const V = Vm * 1000;
    if (!(V > 0)) return NaN;
    const Rbb = R / 101.325;
    const V2 = V * V, V3 = V2 * V, V6 = V3 * V3;
    const t1 = Rbb * T / V;
    const t2 = (p.B0 * Rbb * T - p.A0 - p.C0 / (T * T)) / V2;
    const t3 = (p.b * Rbb * T - p.a) / V3;
    const t4 = p.a * p.alpha / V6;
    const t5 = (p.c * (1 + p.gamma / V2) / (V3 * T * T)) * Math.exp(-p.gamma / V2);
    return (t1 + t2 + t3 + t4 + t5) * ATM;
  }

  function bwrTerms(gas, T, Vm) {
    const p = gas.bwr;
    const V = Vm * 1000;
    const Rbb = R / 101.325;
    const V2 = V * V, V3 = V2 * V, V6 = V3 * V3;
    const toPa = ATM;
    return [
      { name: 'RT/V', key: 'ideal', value: Rbb * T / V * toPa, meaning: 'идеальный член' },
      { name: '1/V²', key: 'v2', value: (p.B0 * Rbb * T - p.A0 - p.C0 / (T * T)) / V2 * toPa, meaning: 'второй вириальный член BWR' },
      { name: '1/V³', key: 'v3', value: (p.b * Rbb * T - p.a) / V3 * toPa, meaning: 'третий член' },
      { name: 'aα/V⁶', key: 'v6', value: p.a * p.alpha / V6 * toPa, meaning: 'плотная поправка' },
      { name: 'экспонента', key: 'exp', value: (p.c * (1 + p.gamma / V2) / (V3 * T * T)) * Math.exp(-p.gamma / V2) * toPa, meaning: 'экспоненциальный член c, γ' }
    ];
  }

  function bbTerms(gas, T, Vm) {
    const p = gas.bb;
    const V = Vm * 1000;
    const Rbb = R / 101.325;
    const A = p.A0 * (1 - p.a / V);
    const B = p.B0 * (1 - p.b / V);
    const eps = p.c / (V * T * T * T);
    const toPa = ATM;
    const kinetic = Rbb * T * (1 - eps) * (V + B) / (V * V);
    const attr = -A / (V * V);
    return [
      { name: 'RT(1−ε)(V+B)/V²', key: 'kin', value: kinetic * toPa, meaning: 'кинетический член с поправками B и ε = c/(VT³)' },
      { name: '−A/V²', key: 'attr', value: attr * toPa, meaning: 'притяжение, A = A₀(1 − a/V)' }
    ];
  }

  function vdwVirialCoeffs(a, b, T, n) {
    const coeffs = [];
    let bp = b;
    for (let k = 1; k <= n; k++) {
      let term = bp;
      if (k === 1) term = b - a / (R * T);
      coeffs.push(term);
      bp *= b;
    }
    return coeffs;
  }

  function hardSphereB0(gas) {
    const sigma = (gas.lj && gas.lj.sigma ? gas.lj.sigma : 3.5) * 1e-10;
    return (2 / 3) * Math.PI * NA * sigma * sigma * sigma;
  }

  function hsCoeffs(gas, n) {
    const b0 = hardSphereB0(gas);
    const c = [];
    let p = b0;
    for (let i = 0; i < n; i++) {
      const red = i < HS_RED.length ? HS_RED[i] : HS_RED[HS_RED.length - 1];
      c.push(red * p);
      p *= b0;
    }
    return c;
  }

  function ljBstar(Tstar) {
    if (!(Tstar > 0)) return NaN;
    const x0 = 0.4;
    const xmax = 16;
    const n = 800;
    const h = (xmax - x0) / n;
    function f(x) {
      const inv2 = 1 / (x * x);
      const inv6 = inv2 * inv2 * inv2;
      const u = 4 * (inv6 * inv6 - inv6);
      const arg = -u / Tstar;
      const e = arg < -80 ? 0 : Math.exp(arg);
      return (e - 1) * x * x;
    }
    let acc = -Math.pow(x0, 3) / 3;
    let s = f(x0) + f(xmax);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(x0 + i * h);
    acc += s * h / 3;
    return -3 * acc;
  }

  const ljGridCache = new Map();
  function ljGrid(eps) {
    let g = ljGridCache.get(eps);
    if (g) return g;
    g = [];
    for (let i = 0; i <= 64; i++) {
      const Ts = 0.45 * Math.pow(40 / 0.45, i / 64);
      g.push([Ts, ljBstar(Ts)]);
    }
    ljGridCache.set(eps, g);
    return g;
  }

  function ljBstarFast(Tstar) {
    if (Tstar < 0.45 || Tstar > 40) return ljBstar(Tstar);
    const g = ljGrid(1);
    let lo = 0, hi = g.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (g[m][0] < Tstar) lo = m; else hi = m;
    }
    const t = (Math.log(Tstar) - Math.log(g[lo][0])) / (Math.log(g[hi][0]) - Math.log(g[lo][0]));
    return g[lo][1] * (1 - t) + g[hi][1] * t;
  }

  /* Грубая таблица C* = C/b0² для LJ 12-6 (порядок величины классических расчётов, не подгонка под эксперимент). */
  const LJ_CSTAR = [[0.6, -0.7], [0.8, 0.05], [1, 0.43], [1.2, 0.55], [1.5, 0.59], [2, 0.44], [2.5, 0.38], [3, 0.35], [4, 0.33], [5, 0.31], [8, 0.29], [15, 0.28]];

  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const t = (x - table[i - 1][0]) / (table[i][0] - table[i - 1][0]);
        return table[i - 1][1] * (1 - t) + table[i][1] * t;
      }
    }
    return table[table.length - 1][1];
  }

  function ljB(gas, T) {
    const eps = gas.lj.eps, sigma = gas.lj.sigma * 1e-10;
    const Tstar = T / eps;
    const b0 = (2 / 3) * Math.PI * NA * sigma * sigma * sigma;
    return ljBstarFast(Tstar) * b0;
  }

  function expBcm(gas, T) {
    const f = gas.fit;
    if (!f || !(f.b > 0)) return NaN;
    return f.a - f.b * Math.exp(f.c / T);
  }

  function expB(gas, T) {
    const b = expBcm(gas, T);
    return b * 1e-6;
  }

  function virialInfo(gas, T, n, source) {
    n = clampN(n);
    source = source || 'vdw';
    const notes = [];
    let coeffs;
    if (source === 'vdw') {
      const p = vdwParams(gas);
      coeffs = vdwVirialCoeffs(p.a, p.b, T, n);
      notes.push('B = b − a/RT, а для k ≥ 2 коэффициент при 1/Vₘᵏ равен bᵏ — точное разложение уравнения Ван-дер-Ваальса.');
    } else if (source === 'hs') {
      coeffs = hsCoeffs(gas, n);
      notes.push('Твёрдые сферы: B = b₀ = (2/3)πNₐσ³, дальше известные отношения Bₙ/b₀ⁿ⁻¹ (σ — газокинетический диаметр Леннард-Джонса). От температуры не зависят.');
    } else if (source === 'lj') {
      const B = ljB(gas, T);
      coeffs = [B];
      const b0 = hardSphereB0(gas);
      if (n >= 2) {
        const Cs = interp(LJ_CSTAR, T / gas.lj.eps);
        coeffs.push(Cs * b0 * b0);
        notes.push('B(T) считается численным интегралом потенциала Леннард-Джонса. C* — грубая учебная таблица. Старшие члены — как у твёрдых сфер, чтобы было видно, как ряд наполняется.');
      }
      if (n >= 3) {
        const hs = hsCoeffs(gas, n);
        for (let i = 2; i < n; i++) coeffs.push(hs[i]);
      }
    } else {
      const B = expB(gas, T);
      coeffs = [isFinite(B) ? B : 0];
      const f = gas.fit;
      if (f && (T < f.tMin || T > f.tMax)) notes.push('T вне диапазона подгонки B(T) (' + f.tMin + '–' + f.tMax + ' К): кривая — экстраполяция.');
      else notes.push('B(T) — эмпирическая формула a − b·exp(c/T).');
      if (n >= 2) {
        let C = 0;
        let usedPoint = false;
        const pts = gas.cPoints || [];
        if (pts.length === 1 && Math.abs(T - pts[0][0]) < 25) {
          C = pts[0][1] * 1e-12;
          usedPoint = true;
          notes.push('C взят из таблицы при ' + pts[0][0] + ' К (рядом с текущей T).');
        }
        if (!usedPoint) notes.push('Экспериментальный C(T) в базе почти нигде не задан, поэтому C и старшие члены добраны из разложения Ван-дер-Ваальса — это уже модель, не измерение.');
        if (!usedPoint) {
          const p = vdwParams(gas);
          const v = vdwVirialCoeffs(p.a, p.b, T, n);
          for (let i = 1; i < n; i++) coeffs.push(v[i]);
        } else {
          coeffs.push(C);
          const p = vdwParams(gas);
          const v = vdwVirialCoeffs(p.a, p.b, T, n);
          for (let i = 2; i < n; i++) coeffs.push(v[i]);
        }
      }
    }
    return { coeffs: coeffs, source: source, notes: notes };
  }

  function zFromCoeffs(coeffs, Vm) {
    let Z = 1;
    let p = 1 / Vm;
    for (let i = 0; i < coeffs.length; i++) {
      Z += coeffs[i] * p;
      p /= Vm;
    }
    return Z;
  }

  function pressureFormCoeffs(volCoeffs, T) {
    const RT = R * T;
    const B = volCoeffs[0] || 0;
    const C = volCoeffs.length > 1 ? volCoeffs[1] : 0;
    const D = volCoeffs.length > 2 ? volCoeffs[2] : 0;
    const out = [B / RT];
    if (volCoeffs.length > 1) out.push((C - B * B) / (RT * RT));
    if (volCoeffs.length > 2) out.push((D - 3 * B * C + 2 * B * B * B) / (RT * RT * RT));
    return out;
  }

  function zPressureSeries(volCoeffs, T, P) {
    const pc = pressureFormCoeffs(volCoeffs, T);
    let Z = 1;
    let p = P;
    for (let i = 0; i < pc.length; i++) {
      Z += pc[i] * p;
      p *= P;
    }
    return Z;
  }

  function pressure(id, gas, T, Vm, opts) {
    opts = opts || {};
    if (!(T > 0) || !(Vm > 0) || !gas) return NaN;
    if (id === 'ideal') return R * T / Vm;
    if (id === 'virial') {
      const info = virialInfo(gas, T, opts.nTerms || 4, opts.source || 'vdw');
      return zFromCoeffs(info.coeffs, Vm) * R * T / Vm;
    }
    if (id === 'bb') return pressureBB(gas, T, Vm);
    if (id === 'bwr') return pressureBWR(gas, T, Vm);
    const q = cubicParams(id, gas, T);
    if (!q) return NaN;
    if (!(Vm > q.b)) return NaN;
    if (id === 'vdw') return R * T / (Vm - q.b) - q.a / (Vm * Vm);
    if (id === 'rk') return R * T / (Vm - q.b) - q.a / (Math.sqrt(T) * Vm * (Vm + q.b));
    if (id === 'srk') return R * T / (Vm - q.b) - q.a / (Vm * (Vm + q.b));
    if (id === 'pr') return R * T / (Vm - q.b) - q.a / (Vm * Vm + 2 * q.b * Vm - q.b * q.b);
    if (id === 'berthelot') return R * T / (Vm - q.b) - q.a / (T * Vm * Vm);
    if (id === 'dieterici') return (R * T / (Vm - q.b)) * Math.exp(-q.a / (R * T * Vm));
    return NaN;
  }

  function compressibility(id, gas, T, Vm, opts) {
    const P = pressure(id, gas, T, Vm, opts);
    if (!isFinite(P)) return NaN;
    return P * Vm / (R * T);
  }

  const TERM_NAMES = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const TERM_MEANING = [
    'пары молекул: B < 0 — притяжение сильнее исключённого объёма',
    'тройные столкновения',
    'четверные конфигурации',
    'пятый вириальный член',
    'шестой вириальный член',
    'седьмой вириальный член',
    'восьмой вириальный член',
    'девятый вириальный член'
  ];

  function breakdown(id, gas, T, Vm, opts) {
    opts = opts || {};
    const P = pressure(id, gas, T, Vm, opts);
    if (id === 'ideal' || id === 'virial') {
      const coeffs = id === 'ideal' ? [] : virialInfo(gas, T, opts.nTerms || 4, opts.source || 'vdw').coeffs;
      const parts = [{ name: 'RT/Vₘ', key: 'ideal', value: R * T / Vm, meaning: 'идеальный газ, точечные молекулы без взаимодействия' }];
      let inv = 1 / (Vm * Vm);
      for (let i = 0; i < coeffs.length; i++) {
        parts.push({
          name: TERM_NAMES[i] + '·RT/Vₘ^' + (i + 2),
          key: 'vir' + i,
          value: R * T * coeffs[i] * inv,
          meaning: TERM_MEANING[i]
        });
        inv /= Vm;
      }
      return { P: P, parts: parts };
    }
    if (id === 'bb' && gas.bb) return { P: P, parts: bbTerms(gas, T, Vm) };
    if (id === 'bwr' && gas.bwr) return { P: P, parts: bwrTerms(gas, T, Vm) };
    const q = cubicParams(id, gas, T);
    if (!q || !(Vm > q.b)) return { P: P, parts: [{ name: 'P', key: 'p', value: P, meaning: '' }] };
    const ideal = R * T / Vm;
    const free = R * T / (Vm - q.b);
    const parts = [
      { name: 'RT/Vₘ', key: 'ideal', value: ideal, meaning: 'идеальный вклад' },
      { name: 'отталкивание', key: 'rep', value: free - ideal, meaning: 'собственный объём: RT/(Vₘ − b) − RT/Vₘ' },
      { name: 'притяжение', key: 'attr', value: P - free, meaning: id === 'dieterici' ? 'экспонента Дитеричи уменьшает давление' : 'член с a (притяжение) снижает давление' }
    ];
    return { P: P, parts: parts };
  }

  function integrateP(fn, V1, V2) {
    if (!(V2 > V1)) return 0;
    const n = 240;
    const u1 = Math.log(V1), u2 = Math.log(V2), h = (u2 - u1) / n;
    function g(i) {
      const V = Math.exp(u1 + i * h);
      const P = fn(V);
      return isFinite(P) ? P * V : 0;
    }
    let s = g(0) + g(n);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g(i);
    return s * h / 3;
  }

  function maxwell(id, gas, T, opts) {
    opts = opts || {};
    if (id === 'ideal' || !gas || !(T > 0)) return null;
    if ((id === 'bb' && !gas.bb) || (id === 'bwr' && !gas.bwr)) return null;
    const crit = modelCritical(id, gas);
    if (crit && T >= crit.Tc * 0.999) return null;
    const q = cubicParams(id, gas, T);
    const b = q && q.b > 0 ? q.b : 0;
    const Vc = (crit && crit.Vc) || gas.Vc || 1e-4;
    const lo = b > 0 ? b * 1.02 : Math.max(Vc * 0.2, 1e-6);
    let hi = Math.max(Vc * 60, lo * 100, 0.05);
    function Pp(V) { return pressure(id, gas, T, V, opts); }
    function dP(V) {
      const h = V * 2e-4;
      const p1 = Pp(V + h), p2 = Pp(V - h);
      if (!isFinite(p1) || !isFinite(p2)) return NaN;
      return (p1 - p2) / (2 * h);
    }
    const extrema = [];
    const N = 360;
    let Vprev = lo;
    let sprev = dP(lo);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const V = Math.exp(Math.log(lo) * (1 - t) + Math.log(hi) * t);
      const s = dP(V);
      if (isFinite(sprev) && isFinite(s)) {
        if (sprev < 0 && s >= 0) extrema.push({ type: 'min', V: 0.5 * (Vprev + V) });
        if (sprev > 0 && s <= 0) extrema.push({ type: 'max', V: 0.5 * (Vprev + V) });
      }
      Vprev = V;
      sprev = s;
    }
    let Vmin = null, Vmax = null, bestGap = 0;
    for (let i = 0; i < extrema.length; i++) {
      if (extrema[i].type !== 'min') continue;
      for (let j = i + 1; j < extrema.length; j++) {
        if (extrema[j].type !== 'max') continue;
        const Pmin = Pp(extrema[i].V), Pmax = Pp(extrema[j].V);
        if (isFinite(Pmin) && isFinite(Pmax) && Pmax - Pmin > bestGap) {
          bestGap = Pmax - Pmin;
          Vmin = extrema[i].V;
          Vmax = extrema[j].V;
        }
        break;
      }
    }
    if (Vmin == null || !(Vmax > Vmin)) return null;
    function polish(V, sign) {
      let v = V;
      for (let k = 0; k < 12; k++) {
        const h = v * 1e-4;
        const dp = dP(v);
        const d2 = (Pp(v + h) - 2 * Pp(v) + Pp(v - h)) / (h * h);
        if (!isFinite(dp) || !isFinite(d2) || Math.abs(d2) < 1e-30) break;
        const step = dp / d2;
        v -= step;
        if (Math.abs(step) < v * 1e-6) break;
      }
      return v > lo ? v : V;
    }
    Vmin = polish(Vmin, -1);
    Vmax = polish(Vmax, 1);
    if (!(Vmax > Vmin)) return null;
    const PspinL = Pp(Vmin);
    const PspinH = Pp(Vmax);
    if (!(PspinH > PspinL) || !isFinite(PspinL) || !isFinite(PspinH)) return null;

    function rootIn(V1, V2, Psat) {
      let a = V1, bV = V2;
      let fa = Pp(a) - Psat, fb = Pp(bV) - Psat;
      if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
      for (let i = 0; i < 48; i++) {
        const m = 0.5 * (a + bV);
        const fm = Pp(m) - Psat;
        if (!isFinite(fm)) return NaN;
        if (fa * fm <= 0) { bV = m; fb = fm; }
        else { a = m; fa = fm; }
      }
      return 0.5 * (a + bV);
    }

    function residualAt(Psat) {
      const Vl = rootIn(lo, Vmin, Psat);
      const Vmid = rootIn(Vmin, Vmax, Psat);
      let Vg = rootIn(Vmax, hi, Psat);
      if (!isFinite(Vg)) {
        hi *= 2;
        Vg = rootIn(Vmax, hi, Psat);
      }
      if (!(Vl > 0) || !(Vmid > Vl) || !(Vg > Vmid)) return null;
      const integ = integrateP(Pp, Vl, Vg);
      return { Vl: Vl, Vmid: Vmid, Vg: Vg, residual: integ - Psat * (Vg - Vl), integ: integ };
    }

    let loP = Math.max(PspinL, 50);
    let hiP = PspinH * 0.999;
    if (!(hiP > loP)) return null;
    let a = residualAt(loP);
    let bR = residualAt(hiP);
    if (!a || !bR) {
      const grid = [];
      for (let i = 0; i <= 24; i++) {
        const Psat = loP + (hiP - loP) * i / 24;
        const r = residualAt(Psat);
        if (r) grid.push({ Psat: Psat, r: r });
      }
      let found = null;
      for (let i = 1; i < grid.length; i++) {
        if (grid[i - 1].r.residual * grid[i].r.residual <= 0) { found = [grid[i - 1], grid[i]]; break; }
      }
      if (!found) return null;
      loP = found[0].Psat; hiP = found[1].Psat;
      a = found[0].r; bR = found[1].r;
    }
    if (a.residual * bR.residual > 0) return null;
    let best = null;
    for (let k = 0; k < 48; k++) {
      const mid = 0.5 * (loP + hiP);
      const r = residualAt(mid);
      if (!r) break;
      best = r;
      best.Psat = mid;
      const scale = Math.abs(mid) * Math.max(r.Vg - r.Vl, 1e-8);
      if (Math.abs(r.residual) < scale * 1e-5) break;
      if (r.residual * a.residual > 0) { loP = mid; a = r; }
      else { hiP = mid; bR = r; }
    }
    if (!best) return null;
    const low = integrateP(Pp, best.Vl, best.Vmid) - best.Psat * (best.Vmid - best.Vl);
    const high = integrateP(Pp, best.Vmid, best.Vg) - best.Psat * (best.Vg - best.Vmid);
    return {
      Psat: best.Psat,
      Vl: best.Vl,
      Vg: best.Vg,
      Vmid: best.Vmid,
      areaLow: low,
      areaHigh: high,
      residual: low + high,
      VspinL: Vmin,
      VspinH: Vmax,
      PspinL: PspinL,
      PspinH: PspinH,
      Tc: crit && crit.Tc,
      Pc: crit && crit.Pc,
      Vc: crit && crit.Vc
    };
  }

  const domeCache = new Map();
  function saturationDome(id, gas, opts) {
    const crit = modelCritical(id, gas);
    if (!crit) return null;
    const p = vdwParams(gas);
    const key = [id, gas.id, gas.Tc, gas.Pc, gas.omega, p.a, p.b, (opts && opts.nTerms) || '', (opts && opts.source) || ''].join('|');
    if (domeCache.has(key)) return domeCache.get(key);
    const liq = [], vap = [];
    for (let i = 0; i <= 8; i++) {
      const Tr = 0.82 + (0.98 - 0.82) * i / 8;
      const mx = maxwell(id, gas, crit.Tc * Tr, opts);
      if (!mx || !(mx.Psat > 0)) continue;
      liq.push([mx.Vl, mx.Psat]);
      vap.push([mx.Vg, mx.Psat]);
    }
    liq.push([crit.Vc, crit.Pc]);
    vap.push([crit.Vc, crit.Pc]);
    const dome = { liq: liq, vap: vap, crit: crit };
    domeCache.set(key, dome);
    return dome;
  }

  function lever(Vl, Vg, Vm) {
    if (!(Vg > Vl) || !(Vm > 0)) return null;
    const xV = (Vm - Vl) / (Vg - Vl);
    const xL = 1 - xV;
    return {
      xV: xV,
      xL: xL,
      phiV: xV * Vg / Vm,
      phiL: xL * Vl / Vm
    };
  }

  function phase(id, gas, T, Vm, opts) {
    const P = pressure(id, gas, T, Vm, opts);
    const crit = modelCritical(id, gas);
    const mx = maxwell(id, gas, T, opts);
    if (mx && Vm > mx.Vl && Vm < mx.Vg) {
      const lv = lever(mx.Vl, mx.Vg, Vm);
      return { kind: 'two', P: mx.Psat, loopP: P, mx: mx, crit: crit, xV: lv.xV, xL: lv.xL, phiV: lv.phiV, phiL: lv.phiL };
    }
    let kind = 'gas';
    if (mx && Vm <= mx.Vl) kind = 'liquid';
    else if (mx && Vm >= mx.Vg) kind = 'vapor';
    else if (crit && T >= crit.Tc && isFinite(P) && P > crit.Pc) kind = 'scf';
    else if (crit && T >= crit.Tc) kind = 'fluid';
    return { kind: kind, P: P, loopP: P, mx: mx, crit: crit };
  }

  function boyleVdW(gas) {
    const p = vdwParams(gas);
    return p.a / (R * p.b);
  }

  function boyleExpFit(gas) {
    const f = gas.fit;
    if (!f || !(f.a > f.b) || !(f.b > 0) || !(f.c > 0)) return NaN;
    return f.c / Math.log(f.a / f.b);
  }

  function boyleLJ(gas) {
    let lo = 2.2, hi = 6;
    let flo = ljBstar(lo), fhi = ljBstar(hi);
    if (!(flo < 0 && fhi > 0)) return NaN;
    for (let i = 0; i < 40; i++) {
      const m = 0.5 * (lo + hi);
      const fm = ljBstar(m);
      if (fm < 0) { lo = m; flo = fm; } else { hi = m; fhi = fm; }
    }
    return 0.5 * (lo + hi) * gas.lj.eps;
  }

  function bOfT(gas, T, source) {
    if (source === 'vdw') return vdwParams(gas).b - vdwParams(gas).a / (R * T);
    if (source === 'hs') return hardSphereB0(gas);
    if (source === 'lj') return ljB(gas, T);
    return expB(gas, T);
  }

  function meanDistance(Vm) { return Math.cbrt(Vm / NA); }

  function numberDensity(Vm) { return NA / Vm; }

  function meanFreePath(T, P, diameter) {
    if (!(P > 0) || !(diameter > 0) || !(T > 0)) return NaN;
    return kB * T / (Math.SQRT2 * Math.PI * diameter * diameter * P);
  }

  function collisionDiameter(gas) {
    if (gas.lj && gas.lj.sigma) return gas.lj.sigma * 1e-10;
    const b = vdwParams(gas).b;
    return Math.cbrt(b / ((2 / 3) * Math.PI * NA));
  }

  function vrms(T, M) { return Math.sqrt(3 * R * T / M); }
  function vmp(T, M) { return Math.sqrt(2 * R * T / M); }
  function vavg(T, M) { return Math.sqrt(8 * R * T / (Math.PI * M)); }

  function gauss() {
    let u = Math.random() || 1e-12;
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sampleMaxwell(T, M) {
    const s = Math.sqrt(R * T / M);
    const vx = gauss() * s, vy = gauss() * s, vz = gauss() * s;
    return { vx: vx, vy: vy, vz: vz, speed: Math.hypot(vx, vy, vz) };
  }

  function mbPdf(v, T, M) {
    if (!(v >= 0) || !(T > 0) || !(M > 0)) return 0;
    const a = M / (2 * R * T);
    const pref = 4 * Math.PI * v * v * Math.pow(M / (2 * Math.PI * R * T), 1.5);
    return pref * Math.exp(-a * v * v);
  }

  function boxForDensity(Vm, targetN, Lmax) {
    const n = NA / Vm;
    targetN = targetN || 28;
    Lmax = Lmax || 25e-9;
    let L = Math.cbrt(targetN / n);
    if (L > Lmax) L = Lmax;
    if (L < 1.2e-9) L = 1.2e-9;
    let N = Math.round(n * L * L * L);
    if (N > 48) {
      N = 48;
      L = Math.cbrt(N / n);
    }
    if (N < 1) N = 1;
    return { L: L, N: N, n: n, d: Math.cbrt(Vm / NA), exactN: n * L * L * L };
  }

  function samples(id, gas, T, vMin, vMax, count, opts, log) {
    const xs = [], ys = [];
    count = count || 180;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const V = log ? Math.exp(Math.log(vMin) * (1 - t) + Math.log(vMax) * t) : vMin + t * (vMax - vMin);
      const P = pressure(id, gas, T, V, opts);
      if (isFinite(P)) { xs.push(V); ys.push(P); }
    }
    return { xs: xs, ys: ys };
  }

  function selfTest() {
    const fails = [];
    function check(name, cond, extra) {
      if (!cond) fails.push(name + (extra != null ? ' (' + extra + ')' : ''));
    }
    const co2 = gasById('CO2');
    const ab = vdwAB(co2.Tc, co2.Pc);
    const crit = criticalFromVdW(ab.a, ab.b);
    check('CO2 Tc из a,b', Math.abs(crit.Tc - 304.1282) < 1e-6, crit.Tc);
    check('CO2 Pc ≈ 73.8 бар', Math.abs(crit.Pc / BAR - 73.773) < 1e-6, crit.Pc / BAR);
    check('CO2 Tc около 304 К', Math.abs(crit.Tc - 304) < 0.2);
    check('CO2 Pc около 73.8 бар', Math.abs(crit.Pc / BAR - 73.8) < 0.05);
    check('Vc ВдВ = 3b', Math.abs(crit.Vc - 3 * ab.b) < 1e-12);

    const ar = gasById('Ar');
    const tb = boyleVdW(ar);
    const ratio = tb / ar.Tc;
    check('Ar TB/Tc = 27/8', Math.abs(ratio - 27 / 8) < 1e-9, ratio);
    check('Ar TB примерно 3 Tc', ratio > 3 && ratio < 3.5, ratio);
    check('Ar TB = a/(Rb)', Math.abs(tb - vdwParams(ar).a / (R * vdwParams(ar).b)) < 1e-8);

    const T = 320;
    const b = vdwParams(co2).b;
    const Vm = 5 * b;
    const Pexact = pressure('vdw', co2, T, Vm);
    const P6 = pressure('virial', co2, T, Vm, { nTerms: 6, source: 'vdw' });
    const P2 = pressure('virial', co2, T, Vm, { nTerms: 2, source: 'vdw' });
    const e6 = Math.abs(P6 - Pexact) / Math.abs(Pexact);
    const e2 = Math.abs(P2 - Pexact) / Math.abs(Pexact);
    check('вириал n=6 сходится к ВдВ', e6 < 0.005, e6);
    check('n=6 точнее n=2', e6 < e2 * 0.5, e6 + ' vs ' + e2);

    const mx = maxwell('vdw', co2, 280);
    check('Максвелл CO2 280 К нашёлся', !!(mx && mx.Psat > 0 && mx.Vg > mx.Vl), mx && mx.Psat);
    if (mx) {
      const scale = Math.abs(mx.Psat * (mx.Vg - mx.Vl));
      check('площади Максвелла равны', Math.abs(mx.areaLow + mx.areaHigh) / scale < 0.01, (mx.areaLow + mx.areaHigh) / scale);
      check('доли рычага дают 1', Math.abs(mx.areaHigh) > 0 && Math.abs(Math.abs(mx.areaLow) - Math.abs(mx.areaHigh)) / Math.abs(mx.areaHigh) < 0.02);
      const mid = 0.5 * (mx.Vl + mx.Vg);
      const lv = lever(mx.Vl, mx.Vg, mid);
      check('φж + φп = 1', Math.abs(lv.phiL + lv.phiV - 1) < 1e-9, lv.phiL + lv.phiV);
      const p = vdwParams(co2);
      const analytic = (R * 280 * Math.log((mx.Vg - p.b) / (mx.Vl - p.b)) + p.a * (1 / mx.Vg - 1 / mx.Vl)) - mx.Psat * (mx.Vg - mx.Vl);
      check('аналитическая площадь ВдВ ≈ 0', Math.abs(analytic) / scale < 0.01, analytic / scale);
    }

    const Bs = ljBstar(1);
    check('LJ B*(T*=1) ≈ −2.54', Math.abs(Bs - (-2.538)) < 0.04, Bs);
    const TbStar = boyleLJ(ar) / ar.lj.eps;
    check('LJ температура Бойля T* ≈ 3.42', TbStar > 3.3 && TbStar < 3.55, TbStar);

    const B273 = expBcm(ar, 273);
    check('Ar B(273) рядом с таблицей −21.7', Math.abs(B273 - (-21.7)) < 2, B273);
    const fitBoyle = boyleExpFit(ar);
    check('подгонка Бойля Ar около 411 К', Math.abs(fitBoyle - 411.5) < 8, fitBoyle);

    const Bc = vdwVirialCoeffs(3, 0.05, 300, 3);
    const pf = pressureFormCoeffs(Bc, 300);
    check('B′ = B/RT', Math.abs(pf[0] - Bc[0] / (R * 300)) < 1e-12);
    check('C′ = (C−B²)/(RT)²', Math.abs(pf[1] - (Bc[1] - Bc[0] * Bc[0]) / Math.pow(R * 300, 2)) < 1e-12);

    const br = breakdown('vdw', co2, 300, 8 * b);
    const sum = br.parts.reduce(function (s, p) { return s + p.value; }, 0);
    check('разложение ВдВ суммируется в P', Math.abs(sum - br.P) / Math.abs(br.P) < 1e-9, sum);

    const n2 = gasById('N2');
    const Vm1 = R * 300 / ATM;
    const Zbb = compressibility('bb', n2, 300, Vm1);
    check('BB азот при ~1 атм, Z≈1', Zbb > 0.9 && Zbb < 1.1, Zbb);
    const ch4 = gasById('CH4');
    const Zbwr = compressibility('bwr', ch4, 300, Vm1);
    check('BWR метан при ~1 атм, Z≈1', Zbwr > 0.85 && Zbwr < 1.15, Zbwr);

    let pdf = 0;
    const M = ar.M;
    const vmax = 8 * vrms(300, M);
    const h = vmax / 400;
    for (let i = 0; i < 400; i++) pdf += mbPdf((i + 0.5) * h, 300, M) * h;
    check('Максвелл нормирован', Math.abs(pdf - 1) < 0.01, pdf);

    const prC = modelCritical('pr', co2);
    check('PR критическая T совпадает с Tc', Math.abs(prC.Tc - co2.Tc) < 1e-8);
    check('PR Zc ≈ 0.307', Math.abs(prC.Zc - 0.3074) < 0.001);

    return { ok: fails.length === 0, fails: fails, detail: { e6: e6, e2: e2, mx: mx, Bs: Bs, TbStar: TbStar, B273: B273, Zbb: Zbb, Zbwr: Zbwr } };
  }

  return {
    R: R, NA: NA, kB: kB, BAR: BAR, ATM: ATM, OMEGA: OMEGA,
    EOS_LIST: EOS_LIST, VIRIAL_SOURCES: VIRIAL_SOURCES, GASES: GASES, SOURCES: SOURCES,
    gasById: gasById, hasParams: hasParams,
    vdwAB: vdwAB, vdwParams: vdwParams, cubicParams: cubicParams,
    criticalFromVdW: criticalFromVdW, criticalFromBerthelot: criticalFromBerthelot, criticalFromDieterici: criticalFromDieterici,
    modelCritical: modelCritical,
    pressure: pressure, compressibility: compressibility, breakdown: breakdown,
    virialInfo: virialInfo, zFromCoeffs: zFromCoeffs, pressureFormCoeffs: pressureFormCoeffs, zPressureSeries: zPressureSeries,
    vdwVirialCoeffs: vdwVirialCoeffs, ljBstar: ljBstar, ljB: ljB, expB: expB, expBcm: expBcm, bOfT: bOfT,
    boyleVdW: boyleVdW, boyleExpFit: boyleExpFit, boyleLJ: boyleLJ,
    maxwell: maxwell, saturationDome: saturationDome, lever: lever, phase: phase, integrateP: integrateP,
    meanDistance: meanDistance, numberDensity: numberDensity, meanFreePath: meanFreePath, collisionDiameter: collisionDiameter,
    vrms: vrms, vmp: vmp, vavg: vavg, sampleMaxwell: sampleMaxwell, mbPdf: mbPdf, gauss: gauss,
    boxForDensity: boxForDensity, samples: samples, selfTest: selfTest
  };
});
