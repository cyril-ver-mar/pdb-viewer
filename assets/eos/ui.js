/* Страница уравнений состояния: связывает движок, графики и сосуд. */
(function () {
  'use strict';
  const EOS = window.EOS;
  const Charts = window.EOSCharts;
  const $ = function (id) { return document.getElementById(id); };
  const COLORS = {
    ideal: '#64748b', virial: '#0f766e', vdw: '#2563eb', rk: '#db2777', srk: '#ea580c',
    pr: '#059669', berthelot: '#7c3aed', dieterici: '#0891b2', bb: '#ca8a04', bwr: '#be123c', sum: '#111827'
  };
  const TERM_COLORS = ['#2563eb', '#db2777', '#ea580c', '#059669', '#7c3aed', '#0891b2', '#ca8a04', '#be123c'];
  const PU = { Pa: { f: 1, label: 'Па' }, bar: { f: 1e5, label: 'бар' }, atm: { f: 101325, label: 'атм' } };
  const VU = { L: { f: 0.001, label: 'л/моль' }, m3: { f: 1, label: 'м³/моль' } };
  const PHASE_NAME = {
    two: 'две фазы (жидкость + пар)', liquid: 'жидкость', vapor: 'пар',
    gas: 'газ', scf: 'сверхкритический флюид', fluid: 'флюид выше Tc'
  };

  const state = {
    gasId: 'CO2', T: 280, Vm: null,
    eosOn: { ideal: true, vdw: true, pr: true },
    focus: 'vdw', n: 4, source: 'vdw',
    pu: 'bar', vu: 'L', tu: 'K',
    logX: false, reduced: false, compare: false,
    lAuto: true, Lnm: 4, theme: 'auto', override: null,
    vMin: null, vMax: null
  };

  let vessel = null;
  let quizGas = '';
  let urlTimer = 0;
  let drag = false;

  function colors() {
    const s = getComputedStyle(document.body);
    const pick = function (name, fallback) {
      const v = s.getPropertyValue(name).trim();
      return v || fallback;
    };
    return { fg: pick('--fg', '#1d2433'), muted: pick('--muted', '#5c6b82'), grid: pick('--grid', '#e6ebf3'), bg: pick('--card', '#fff') };
  }
  function fmt(x, sig) {
    if (!isFinite(x)) return '—';
    const ax = Math.abs(x);
    if (ax === 0) return '0';
    if (ax < 1e-3 || ax >= 1e5) return x.toExponential(3);
    sig = sig || 4;
    const n = Math.max(0, Math.min(6, sig - 1 - Math.floor(Math.log10(ax))));
    return (Math.round(x * Math.pow(10, n)) / Math.pow(10, n)).toString();
  }
  function gasBase() { return EOS.gasById(state.gasId) || EOS.GASES[0]; }
  function workingGas() {
    const g = Object.assign({}, gasBase());
    if (state.override) {
      if (isFinite(state.override.Tc)) g.Tc = state.override.Tc;
      if (isFinite(state.override.Pc)) g.Pc = state.override.Pc;
      if (isFinite(state.override.Vc)) g.Vc = state.override.Vc;
      if (isFinite(state.override.omega)) g.omega = state.override.omega;
      if (isFinite(state.override.M)) g.M = state.override.M;
      if (isFinite(state.override.aSI) && isFinite(state.override.bSI)) {
        g.aSI = state.override.aSI;
        g.bSI = state.override.bSI;
      }
    }
    return g;
  }
  function opts() { return { nTerms: state.n, source: state.source }; }
  function pUnit() { return PU[state.pu] || PU.bar; }
  function vUnit() { return VU[state.vu] || VU.L; }
  function showT(K) { return state.tu === 'C' ? (K - 273.15) : K; }
  function tLabel() { return state.tu === 'C' ? '°C' : 'К'; }

  function vmBounds(gas) {
    const b = EOS.vdwParams(gas).b;
    return { lo: Math.max(b * 1.08, 1.8e-5), hi: 0.04 };
  }
  function vmToSlider(Vm, gas) {
    const b = vmBounds(gas);
    const t = (Math.log(Math.min(b.hi, Math.max(b.lo, Vm))) - Math.log(b.lo)) / (Math.log(b.hi) - Math.log(b.lo));
    return Math.round(t * 1000);
  }
  function sliderToVm(u, gas) {
    const b = vmBounds(gas);
    const t = u / 1000;
    return Math.exp(Math.log(b.lo) * (1 - t) + Math.log(b.hi) * t);
  }
  function defaultVm(gas) {
    const mx = EOS.maxwell(state.focus, gas, state.T, opts());
    if (mx && mx.Vg > mx.Vl * 1.02 && mx.Psat > 0) {
      return mx.Vg * mx.Vl / (0.62 * mx.Vl + 0.38 * mx.Vg);
    }
    const b = EOS.vdwParams(gas).b;
    return Math.min(0.003, Math.max(10 * b, 4e-4));
  }

  function readUrl() {
    const q = new URLSearchParams(location.search);
    if (q.get('gas') && EOS.gasById(q.get('gas'))) state.gasId = q.get('gas');
    if (q.get('T') && isFinite(+q.get('T'))) state.T = Math.min(1100, Math.max(20, +q.get('T')));
    if (q.get('Vm') && isFinite(+q.get('Vm'))) state.Vm = +q.get('Vm') / 1000;
    if (q.get('eos')) {
      const set = {};
      q.get('eos').split(',').forEach(function (id) { if (COLORS[id]) set[id] = true; });
      if (Object.keys(set).length) state.eosOn = set;
      state.focus = (q.get('focus') && COLORS[q.get('focus')]) ? q.get('focus') : q.get('eos').split(',')[0];
    }
    if (q.get('n')) state.n = Math.max(1, Math.min(8, +q.get('n') || 4));
    if (q.get('src')) state.source = q.get('src');
    if (PU[q.get('pu')]) state.pu = q.get('pu');
    if (VU[q.get('vu')]) state.vu = q.get('vu');
    if (q.get('tu') === 'C' || q.get('tu') === 'K') state.tu = q.get('tu');
    state.logX = q.get('log') === '1';
    state.reduced = q.get('red') === '1';
    state.compare = q.get('cmp') === '1';
    if (q.get('a') && q.get('b')) {
      state.override = { aSI: +q.get('a') / 10, bSI: +q.get('b') / 1000 };
    }
  }

  function writeUrl() {
    const q = new URLSearchParams();
    q.set('gas', state.gasId);
    q.set('T', String(Math.round(state.T)));
    if (state.Vm) q.set('Vm', (state.Vm * 1000).toPrecision(4));
    const eos = EOS.EOS_LIST.map(function (e) { return e.id; }).filter(function (id) { return state.eosOn[id]; });
    if (!eos.length) eos.push(state.focus);
    q.set('eos', eos.join(','));
    if (state.focus && state.focus !== eos[0]) q.set('focus', state.focus);
    q.set('n', String(state.n));
    if (state.source !== 'vdw') q.set('src', state.source);
    if (state.pu !== 'bar') q.set('pu', state.pu);
    if (state.vu !== 'L') q.set('vu', state.vu);
    if (state.tu !== 'K') q.set('tu', state.tu);
    if (state.logX) q.set('log', '1');
    if (state.reduced) q.set('red', '1');
    if (state.compare) q.set('cmp', '1');
    if (state.override && isFinite(state.override.aSI)) {
      q.set('a', (state.override.aSI * 10).toPrecision(4));
      q.set('b', (state.override.bSI * 1000).toPrecision(4));
    }
    const url = location.pathname + '?' + q.toString();
    $('shareUrl').value = location.origin + url;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () { history.replaceState(null, '', url); drawQR(); }, 200);
    drawQR();
  }

  function drawQR() {
    const canvas = $('qr');
    const text = $('shareUrl').value;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!text || typeof qrcode !== 'function') return;
    try {
      const q = qrcode(0, text.length > 180 ? 'L' : 'M');
      q.addData(text, 'Byte');
      q.make();
      const n = q.getModuleCount();
      const cell = Math.floor(canvas.width / (n + 8)) || 1;
      const off = Math.floor((canvas.width - cell * n) / 2);
      ctx.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    } catch (e) { /* длинная ссылка */ }
  }

  function fillStatic() {
    const gasSel = $('gas');
    const focus = $('focus');
    EOS.GASES.forEach(function (g) {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.formula + ' — ' + g.name;
      gasSel.appendChild(o);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = g.formula;
      b.dataset.id = g.id;
      b.addEventListener('click', function () { state.gasId = g.id; state.override = null; state.Vm = null; syncControls(); render(); });
      $('gasChips').appendChild(b);
    });
    EOS.EOS_LIST.forEach(function (e) {
      const o = document.createElement('option');
      o.value = e.id; o.textContent = e.name;
      focus.appendChild(o);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tog';
      b.dataset.id = e.id;
      b.style.borderColor = COLORS[e.id];
      b.textContent = e.short;
      b.addEventListener('click', function () {
        state.eosOn[e.id] = !state.eosOn[e.id];
        if (!Object.keys(state.eosOn).some(function (k) { return state.eosOn[k]; })) state.eosOn[e.id] = true;
        render();
      });
      $('eosBoxes').appendChild(b);
    });
    const pu = $('pu'), vu = $('vu'), tu = $('tu'), src = $('virSrc');
    Object.keys(PU).forEach(function (k) { const o = document.createElement('option'); o.value = k; o.textContent = PU[k].label; pu.appendChild(o); });
    Object.keys(VU).forEach(function (k) { const o = document.createElement('option'); o.value = k; o.textContent = VU[k].label; vu.appendChild(o); });
    tu.innerHTML = '<option value="K">К</option><option value="C">°C</option>';
    EOS.VIRIAL_SOURCES.forEach(function (s) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; src.appendChild(o); });
    $('srcFoot').textContent = EOS.SOURCES.critical + ' ' + EOS.SOURCES.lj + ' ' + EOS.SOURCES.virial + ' ' + EOS.SOURCES.ab + ' ' + EOS.SOURCES.bb + ' ' + EOS.SOURCES.bwr;
    $('srcNote').textContent = 'Строка «a, b» — Ван-дер-Ваальс из Tc и Pc. ε/k и σ — Леннард-Джонс. B(298 K) — формула a − b·exp(c/T), если 298 K внутри диапазона.';
  }

  function syncControls() {
    const gas = workingGas();
    $('gas').value = state.gasId;
    $('focus').value = state.focus;
    $('tSlider').value = String(Math.round(state.T));
    $('vSlider').value = String(vmToSlider(state.Vm || defaultVm(gas), gas));
    $('pu').value = state.pu;
    $('vu').value = state.vu;
    $('tu').value = state.tu;
    $('nSlider').value = String(state.n);
    $('virSrc').value = state.source;
    $('logX').checked = state.logX;
    $('reduced').checked = state.reduced;
    $('compare').checked = state.compare;
    $('lAuto').checked = state.lAuto;
    $('lSlider').disabled = state.lAuto;
    $('lSlider').value = String(state.Lnm);
    document.querySelectorAll('#gasChips .chip').forEach(function (b) { b.classList.toggle('on', b.dataset.id === state.gasId); });
    document.querySelectorAll('#eosBoxes .tog').forEach(function (b) {
      const ok = EOS.hasParams(b.dataset.id, gas);
      b.disabled = !ok;
      b.classList.toggle('on', !!state.eosOn[b.dataset.id] && ok);
      b.title = ok ? '' : 'Для этого газа нет констант';
    });
    const ab = EOS.vdwParams(gas);
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.formgrid')) return;
    $('fTc').value = fmt(gas.Tc, 6);
    $('fPc').value = fmt(gas.Pc / 1e5, 6);
    $('fVc').value = fmt(gas.Vc * 1e6, 5);
    $('fW').value = String(gas.omega);
    $('fM').value = fmt(gas.M * 1000, 5);
    $('fA').value = fmt(ab.a * 10, 6);
    $('fB').value = fmt(ab.b * 1000, 6);
  }

  function legend(el, items) {
    el.innerHTML = '';
    items.forEach(function (it) {
      const s = document.createElement('span');
      s.innerHTML = '<i></i>' + it.name;
      s.querySelector('i').style.background = it.color;
      el.appendChild(s);
    });
  }

  function chartH() { return window.innerWidth >= 800 ? 300 : 230; }

  function renderFacts(gas) {
    const ab = EOS.vdwParams(gas);
    const c = EOS.criticalFromVdW(ab.a, ab.b);
    const tb = ab.a / (EOS.R * ab.b);
    const el = $('modelFacts');
    el.dataset.tc = String(c.Tc);
    el.dataset.pc = String(c.Pc / 1e5);
    el.dataset.tb = String(tb);
    el.dataset.ratio = String(tb / c.Tc);
    el.dataset.a = String(ab.a * 10);
    el.dataset.b = String(ab.b * 1000);
    el.innerHTML = 'ВдВ: a = ' + fmt(ab.a * 10, 4) + ' л²·бар/моль², b = ' + fmt(ab.b * 1000, 4) + ' л/моль. ' +
      'Из этих a и b: T<sub>c</sub> = <b>' + fmt(c.Tc, 5) + ' К</b>, P<sub>c</sub> = <b>' + fmt(c.Pc / 1e5, 4) + ' бар</b>, V<sub>c</sub> = 3b = ' + fmt(c.Vc * 1000, 4) + ' л/моль. ' +
      'Температура Бойля T<sub>B</sub> = a/(Rb) = <b>' + fmt(tb, 5) + ' К</b> = ' + fmt(tb / c.Tc, 4) + ' T<sub>c</sub>.';
    const a2 = parseFloat($('fA').value), b2 = parseFloat($('fB').value);
    const prev = $('critPreview');
    if (a2 > 0 && b2 > 0) {
      const c2 = EOS.criticalFromVdW(a2 / 10, b2 / 1000);
      prev.textContent = 'По числам в полях: Tc = ' + fmt(c2.Tc, 5) + ' К, Pc = ' + fmt(c2.Pc / 1e5, 4) + ' бар, TB = ' + fmt((a2 / 10) / (EOS.R * (b2 / 1000)), 5) + ' К.';
    }
  }

  function renderState(gas, ph) {
    const P = ph.P;
    const Z = isFinite(P) ? P * state.Vm / (EOS.R * state.T) : NaN;
    $('tOut').textContent = fmt(showT(state.T), 4) + ' ' + tLabel() + (state.tu === 'C' ? '  (' + fmt(state.T, 4) + ' К)' : '  (' + fmt(state.T - 273.15, 3) + ' °C)');
    $('vOut').textContent = fmt(state.Vm / vUnit().f, 4) + ' ' + vUnit().label;
    $('nOut').textContent = String(state.n) + ' (' + ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].slice(0, state.n).join(', ') + ')';
    const box = $('stateReadout');
    box.dataset.t = String(state.T);
    box.dataset.n = String(state.n);
    box.dataset.eos = EOS.EOS_LIST.map(function (e) { return e.id; }).filter(function (id) { return state.eosOn[id]; }).join(',');
    box.dataset.focus = state.focus;
    box.dataset.gas = gas.id;
    box.textContent = gas.formula + ', ' + fmt(state.T, 4) + ' К, Vₘ = ' + fmt(state.Vm * 1000, 4) + ' л/моль. ' +
      'Равновесное P = ' + fmt(P / pUnit().f, 4) + ' ' + pUnit().label + ', Z = ' + fmt(Z, 4) + '. ' +
      (PHASE_NAME[ph.kind] || '');
  }

  function renderVessel(gas, ph) {
    let L = state.Lnm * 1e-9;
    const target = EOS.boxForDensity(state.Vm, 28, 20e-9);
    if (state.lAuto) L = target.L;
    let N = Math.round(EOS.NA * L * L * L / state.Vm);
    let capped = false;
    if (N > 48) { N = 48; L = Math.cbrt(N * state.Vm / EOS.NA); capped = true; }
    if (N < 1) { N = 1; L = Math.cbrt(state.Vm / EOS.NA); }
    state._L = L;
    state._N = N;
    const d = EOS.meanDistance(state.Vm);
    const sigma = EOS.collisionDiameter(gas);
    const lam = EOS.meanFreePath(state.T, ph.P, sigma);
    const two = ph.kind === 'two';
    $('phaseBanner').className = 'banner' + (two ? '' : '');
    $('phaseBanner').textContent = two
      ? ('Сосуществование: доля пара по веществу xп = ' + fmt(ph.xV, 3) + ', по объёму φп = ' + fmt(ph.phiV, 3) + '. Правило рычага. P = Pнас = ' + fmt(ph.P / pUnit().f, 4) + ' ' + pUnit().label + '.')
      : ('Одна фаза: ' + (PHASE_NAME[ph.kind] || 'газ') + '.');
    vessel.setState({
      gasId: gas.id, shape: gas.shape, T: state.T, M: gas.M, Vm: state.Vm,
      L: L, N: N, kind: ph.kind, phiL: two ? ph.phiL : 0, xL: two ? ph.xL : 0,
      sigma: sigma, d: d, vrms: EOS.vrms(state.T, gas.M), eps: gas.lj.eps,
      sample: function () { return EOS.sampleMaxwell(state.T, gas.M); },
      pdf: function (v) { return EOS.mbPdf(v, state.T, gas.M); }
    });
    const lamTxt = isFinite(lam) ? fmt(lam * 1e9, 3) + ' нм' : '— (в петле или при P ≤ 0 формула пробега не для этого P)';
    $('vesselStats').innerHTML =
      '<dt>L куба</dt><dd>' + fmt(L * 1e9, 3) + ' нм' + (capped ? ' (уменьшено, чтобы N ≤ 48)' : '') + '</dd>' +
      '<dt>N</dt><dd>' + N + '  (N<sub>A</sub> L³/Vₘ = ' + fmt(EOS.NA * L * L * L / state.Vm, 3) + ')</dd>' +
      '<dt>d = (Vₘ/N<sub>A</sub>)<sup>1/3</sup></dt><dd>' + fmt(d * 1e9, 3) + ' нм</dd>' +
      '<dt>σ (Леннард-Джонс)</dt><dd>' + fmt(sigma * 1e9, 3) + ' нм,  d/σ = ' + fmt(d / sigma, 3) + '</dd>' +
      '<dt>размер по vdW</dt><dd>' + fmt((vessel.shape ? vessel.shape.extentA * 2 : 0) / 10, 3) + ' нм (диаметр по ван-дер-ваальсовой поверхности)</dd>' +
      '<dt>λ = kT / (√2 π σ² P)</dt><dd>' + lamTxt + '</dd>' +
      '<dt>v<sub>ср.кв.</sub></dt><dd>' + fmt(EOS.vrms(state.T, gas.M), 4) + ' м/с;  v<sub>нв</sub> = ' + fmt(EOS.vmp(state.T, gas.M), 4) + ' м/с</dd>';
    if (ph.kind === 'liquid' || ph.kind === 'two') {
      $('vesselStats').innerHTML += '<dt>Про пробел</dt><dd>Формула λ — для разреженного газа. В жидкости молекулы почти всё время в контакте, пробег порядка размера молекулы.</dd>';
    }
  }

  function renderBreak(gas, ph) {
    const br = EOS.breakdown(state.focus, gas, state.T, state.Vm, opts());
    const pu = pUnit().f;
    const parts = br.parts.filter(function (p) { return isFinite(p.value); }).map(function (p) {
      return { name: p.name, value: p.value / pu, meaning: p.meaning };
    });
    Charts.waterfall($('waterfall'), parts, colors(), 210);
    const focusName = (EOS.EOS_LIST.filter(function (e) { return e.id === state.focus; })[0] || {}).name || state.focus;
    let lead = 'Модель «' + focusName + '» при текущих T и Vₘ. Столбики в ' + pUnit().label + ' складываются в P.';
    if (ph.kind === 'two') lead += ' Это давление петли в точке Vₘ, оно не равно Pнас: равновесие — горизонталь Максвелла, ' + fmt(ph.P / pu, 4) + ' ' + pUnit().label + '.';
    $('breakLead').textContent = lead;
    const list = $('breakList');
    list.innerHTML = '';
    br.parts.forEach(function (p) {
      const row = document.createElement('p');
      row.className = 'note';
      row.textContent = p.name + ': ' + fmt(p.value / pu, 4) + ' ' + pUnit().label + ' — ' + (p.meaning || '');
      list.appendChild(row);
    });
    const sum = br.parts.reduce(function (s, p) { return s + (isFinite(p.value) ? p.value : 0); }, 0);
    const row = document.createElement('p');
    row.className = 'facts';
    row.textContent = 'Сумма = ' + fmt(sum / pu, 4) + ' ' + pUnit().label + (isFinite(br.P) ? ', уравнение даёт P = ' + fmt(br.P / pu, 4) : '');
    list.appendChild(row);
  }

  function activeEos(gas) {
    return EOS.EOS_LIST.map(function (e) { return e.id; }).filter(function (id) {
      return state.eosOn[id] && EOS.hasParams(id, gas);
    });
  }

  function renderPV(gas, ph) {
    const c = colors();
    if (!EOS.hasParams(state.focus, gas)) state.focus = 'vdw';
    const focus = state.focus;
    const critF = EOS.modelCritical(focus, gas) || { Tc: gas.Tc, Pc: gas.Pc, Vc: gas.Vc || 1e-4 };
    const ids = activeEos(gas);
    if (ids.indexOf(focus) < 0) ids.unshift(focus);
    let vMin = state.vMin, vMax = state.vMax;
    const b = (EOS.cubicParams(focus, gas, state.T) || {}).b || EOS.vdwParams(gas).b;
    if (!(vMin > 0) || !(vMax > vMin)) {
      vMin = Math.max(b * 1.12, 2e-5);
      vMax = Math.max((ph.mx && ph.mx.Vg > 0 ? ph.mx.Vg * 3.2 : 0.004), state.Vm * 1.6, 0.00045);
      if (state.Vm > vMax * 0.92) vMax = state.Vm * 1.25;
      if (state.Vm < vMin) vMin = state.Vm * 0.8;
    }
    $('vRangeRow').style.display = state.reduced ? 'none' : 'flex';
    if (!state.reduced) {
      if (document.activeElement !== $('vMin')) $('vMin').value = fmt(vMin / vUnit().f, 4);
      if (document.activeElement !== $('vMax')) $('vMax').value = fmt(vMax / vUnit().f, 4);
    }
    const series = [];
    const legendItems = [];
    const gases = state.compare ? ['Ar', 'CO2', 'CH4', 'H2O'] : [gas.id];
    if (state.compare && gases.indexOf(gas.id) < 0) gases.push(gas.id);
    const Tr = state.T / ((EOS.modelCritical(focus, gas) || gas).Tc || gas.Tc);
    function pushSeries(id, g, T, name, width) {
      const crit = EOS.modelCritical(id, g) || { Tc: g.Tc, Pc: g.Pc, Vc: g.Vc || 1e-4 };
      const lo = state.reduced ? crit.Vc * 0.55 : vMin;
      const hi = state.reduced ? crit.Vc * 18 : vMax;
      if (!(hi > lo)) return;
      const samp = EOS.samples(id, g, T, lo, hi, 200, opts(), true);
      const xs = [], ys = [];
      for (let i = 0; i < samp.xs.length; i++) {
        const V = samp.xs[i], P = samp.ys[i];
        const x = state.reduced ? V / crit.Vc : V / vUnit().f;
        const y = state.reduced ? P / crit.Pc : P / pUnit().f;
        if (isFinite(x) && isFinite(y)) { xs.push(x); ys.push(y); }
      }
      series.push({ name: name, color: COLORS[id] || '#333', width: width || 2, xs: xs, ys: ys });
      legendItems.push({ name: name, color: COLORS[id] || '#333' });
    }
    if (state.compare) {
      gases.forEach(function (gid) {
        const g = gid === gas.id ? gas : EOS.gasById(gid);
        const crit = EOS.modelCritical(focus, g) || g;
        const T = state.reduced ? Tr * crit.Tc : state.T;
        pushSeries(focus, g, T, g.formula + ' ' + (EOS.EOS_LIST.filter(function (e) { return e.id === focus; })[0].short), 2);
      });
    } else {
      ids.forEach(function (id) {
        const meta = EOS.EOS_LIST.filter(function (e) { return e.id === id; })[0];
        pushSeries(id, gas, state.T, meta.short, id === focus ? 2.6 : 1.8);
      });
    }
    const shades = [];
    const hLines = [];
    const markers = [];
    const vLines = [];
    if (ph.mx && ph.P > 0 && !state.compare) {
      const mx = ph.mx;
      function branch(V1, V2, color) {
        const xs = [], ys = [];
        for (let i = 0; i <= 48; i++) {
          const V = V1 + (V2 - V1) * i / 48;
          const P = EOS.pressure(focus, gas, state.T, V, opts());
          xs.push(state.reduced ? V / critF.Vc : V / vUnit().f);
          ys.push(state.reduced ? P / critF.Pc : P / pUnit().f);
        }
        shades.push({ xs: xs, ys: ys, y2: state.reduced ? mx.Psat / critF.Pc : mx.Psat / pUnit().f, color: color });
      }
      branch(mx.Vl, mx.Vmid, 'rgba(37,99,235,.28)');
      branch(mx.Vmid, mx.Vg, 'rgba(234,88,12,.28)');
      hLines.push({ y: state.reduced ? mx.Psat / critF.Pc : mx.Psat / pUnit().f, color: '#ea580c', dash: [6, 4] });
    }
    if (!state.compare) {
      const dome = EOS.saturationDome(focus, gas, opts());
      if (dome && dome.liq.length > 2) {
        const xs = [], ys = [];
        dome.liq.forEach(function (p) {
          xs.push(state.reduced ? p[0] / critF.Vc : p[0] / vUnit().f);
          ys.push(state.reduced ? p[1] / critF.Pc : p[1] / pUnit().f);
        });
        for (let i = dome.vap.length - 1; i >= 0; i--) {
          xs.push(state.reduced ? dome.vap[i][0] / critF.Vc : dome.vap[i][0] / vUnit().f);
          ys.push(state.reduced ? dome.vap[i][1] / critF.Pc : dome.vap[i][1] / pUnit().f);
        }
        const domeColor = document.documentElement.dataset.theme === 'dark' ? '#e2e8f0' : '#0f172a';
        series.push({ name: 'насыщение', color: domeColor, width: 1.5, dash: [2, 3], xs: xs, ys: ys });
        legendItems.push({ name: 'кривая насыщения', color: domeColor });
      }
    }
    const dotP = ph.P;
    markers.push({
      x: state.reduced ? state.Vm / critF.Vc : state.Vm / vUnit().f,
      y: state.reduced ? dotP / critF.Pc : dotP / pUnit().f,
      color: '#111827', r: 5
    });
    if (critF && critF.Pc) {
      markers.push({
        x: state.reduced ? 1 : critF.Vc / vUnit().f,
        y: state.reduced ? 1 : critF.Pc / pUnit().f,
        color: '#be123c', r: 4
      });
      if (!state.reduced && gas.Vc && Math.abs(gas.Vc - critF.Vc) / critF.Vc > 0.05) {
        markers.push({ x: gas.Vc / vUnit().f, y: gas.Pc / pUnit().f, color: '#111827', r: 3.5 });
      }
    }
    let yMin = null, yMax = null;
    const pCap = state.reduced ? 2.4 : (critF.Pc ? 2.6 * critF.Pc / pUnit().f : 200);
    const ys = [];
    series.forEach(function (s) { s.ys.forEach(function (y, i) { if (isFinite(y) && y < pCap && y > -0.7 * Math.abs(pCap)) ys.push(y); }); });
    if (ys.length) {
      ys.sort(function (a, b) { return a - b; });
      yMin = Math.min(0, ys[Math.floor(ys.length * 0.02)]);
      yMax = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.97))] * 1.08;
      if (!(yMax > yMin)) yMax = yMin + 1;
    }
    const xLabel = state.reduced ? 'Vr = V / Vc модели' : 'Vₘ, ' + vUnit().label;
    const yLabel = state.reduced ? 'Pr = P / Pc' : 'P, ' + pUnit().label;
    Charts.draw($('pv'), {
      series: series, shades: shades, hLines: hLines, vLines: vLines, markers: markers,
      xLabel: xLabel, yLabel: yLabel, logX: state.logX, yMin: yMin, yMax: yMax,
      colors: c, height: chartH(), includeZero: true
    });
    legend($('legendPv'), legendItems.concat([{ name: 'точка состояния', color: '#111827' }, { name: 'крит. точка модели', color: '#be123c' }]));
    const note = $('pvNote');
    if (ph.mx && ph.kind) {
      const scale = Math.abs(ph.mx.Psat * (ph.mx.Vg - ph.mx.Vl)) || 1;
      const rel = Math.abs(ph.mx.areaLow + ph.mx.areaHigh) / scale;
      note.dataset.areaRel = String(rel);
      note.dataset.psat = String(ph.mx.Psat / 1e5);
      note.textContent = 'Построение Максвелла при ' + fmt(state.T, 4) + ' К: Pнас = ' + fmt(ph.mx.Psat / pUnit().f, 4) + ' ' + pUnit().label +
        ', Vж = ' + fmt(ph.mx.Vl / vUnit().f, 4) + ', Vп = ' + fmt(ph.mx.Vg / vUnit().f, 4) + ' ' + vUnit().label +
        '. Площади петель: ' + fmt(Math.abs(ph.mx.areaLow) / 100, 3) + ' и ' + fmt(Math.abs(ph.mx.areaHigh) / 100, 3) + ' бар·л/моль. Относительная разница ' + fmt(rel * 100, 3) + ' %.';
    } else {
      note.dataset.areaRel = '';
      note.textContent = critF && state.T >= critF.Tc * 0.999
        ? 'Выше критической температуры петли нет: жидкость и пар неразличимы.'
        : 'У этой модели при таких условиях горизонтали Максвелла нет (или нет констант).';
    }
    if (state.reduced) {
      note.textContent += state.compare
        ? ' Приведённые координаты: у ВдВ кривые разных газов совпадают (закон соответственных состояний). У Пенга–Робинсона остаётся ω, поэтому газы чуть расходятся.'
        : ' Оси отнесены к критической точке модели. Включите «несколько газов», чтобы увидеть совпадение.';
    }
  }

  function renderVirial(gas) {
    const c = colors();
    const p = EOS.vdwParams(gas);
    const b = p.b;
    const T = state.T;
    const info = EOS.virialInfo(gas, T, state.n, state.source);
    const lo = Math.max(b * 2.2, 4e-5), hi = Math.max(b * 28, lo * 2);
    const nPt = 90;
    const termSeries = [];
    const legendItems = [];
    const idealXs = [], idealYs = [];
    const sumXs = [], sumYs = [];
    for (let i = 0; i < nPt; i++) {
      const t = i / (nPt - 1);
      const V = Math.exp(Math.log(lo) * (1 - t) + Math.log(hi) * t);
      idealXs.push(V * 1000);
      idealYs.push((EOS.R * T / V) / 1e5);
      let sum = EOS.R * T / V;
      sumXs.push(V * 1000);
      let inv = 1 / (V * V);
      for (let k = 0; k < info.coeffs.length; k++) {
        const contrib = EOS.R * T * info.coeffs[k] * inv;
        sum += contrib;
        if (!termSeries[k]) termSeries[k] = { xs: [], ys: [] };
        termSeries[k].xs.push(V * 1000);
        termSeries[k].ys.push(contrib / 1e5);
        inv /= V;
      }
      sumYs.push(sum / 1e5);
    }
    const series = [{ name: 'RT/V', color: '#64748b', width: 1.5, dash: [4, 3], xs: idealXs, ys: idealYs }];
    legendItems.push({ name: 'RT/Vₘ', color: '#64748b' });
    const names = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    termSeries.forEach(function (s, k) {
      series.push({ name: names[k], color: TERM_COLORS[k], width: 1.6, xs: s.xs, ys: s.ys });
      legendItems.push({ name: names[k], color: TERM_COLORS[k] });
    });
    const sumColor = document.documentElement.dataset.theme === 'dark' ? '#f8fafc' : '#111827';
    series.push({ name: 'сумма', color: sumColor, width: 2.6, xs: sumXs, ys: sumYs });
    legendItems.push({ name: 'сумма', color: sumColor });
    Charts.draw($('virP'), { series: series, xLabel: 'Vₘ, л/моль', yLabel: 'вклад в P, бар', colors: c, height: 240, logX: true });
    legend($('legendVir'), legendItems);

    const zSeries = [];
    const vdwZ = { xs: [], ys: [] };
    const virZ = { xs: [], ys: [] };
    const expZ = { xs: [], ys: [] };
    for (let i = 0; i < 80; i++) {
      const t = i / 79;
      const V = Math.exp(Math.log(lo) * (1 - t) + Math.log(hi * 2) * t);
      const Pv = EOS.pressure('vdw', gas, T, V);
      const Pi = EOS.pressure('virial', gas, T, V, opts());
      if (isFinite(Pv) && Pv > 0 && Pv < (gas.Pc || 1e7) * 3) {
        vdwZ.xs.push(Pv / 1e5); vdwZ.ys.push(Pv * V / (EOS.R * T));
      }
      if (isFinite(Pi) && Pi > 0 && Pi < (gas.Pc || 1e7) * 3) {
        virZ.xs.push(Pi / 1e5); virZ.ys.push(Pi * V / (EOS.R * T));
      }
    }
    const pMax = (gas.Pc || 5e6) * 1.2;
    for (let i = 1; i <= 40; i++) {
      const P = pMax * i / 40;
      const Z = EOS.zPressureSeries(info.coeffs, T, P);
      if (isFinite(Z) && Math.abs(Z) < 4) { expZ.xs.push(P / 1e5); expZ.ys.push(Z); }
    }
    zSeries.push({ name: 'ВдВ', color: COLORS.vdw, xs: vdwZ.xs, ys: vdwZ.ys, width: 2 });
    zSeries.push({ name: 'вириал по V', color: COLORS.virial, xs: virZ.xs, ys: virZ.ys, width: 2 });
    zSeries.push({ name: 'ряд по P', color: '#ea580c', xs: expZ.xs, ys: expZ.ys, dash: [5, 3], width: 1.6 });
    Charts.draw($('virZ'), { series: zSeries, xLabel: 'P, бар', yLabel: 'Z', colors: c, height: 220, includeZero: false });

    const tLo = Math.max(30, gas.fit ? gas.fit.tMin * 0.8 : 40);
    const tHi = Math.min(1200, Math.max(EOS.boyleVdW(gas) * 1.25, 600));
    function curve(source, color, width, dash) {
      const xs = [], ys = [];
      for (let i = 0; i <= 60; i++) {
        const TT = tLo + (tHi - tLo) * i / 60;
        const B = EOS.bOfT(gas, TT, source);
        xs.push(state.tu === 'C' ? TT - 273.15 : TT);
        ys.push(B * 1e6);
      }
      return { name: source, color: color, width: width, dash: dash || [], xs: xs, ys: ys };
    }
    const bSeries = [
      curve('vdw', COLORS.vdw, 2),
      curve('lj', '#7c3aed', 2),
      curve('exp', '#ea580c', 2, [4, 3])
    ];
    const px = [], py = [];
    (gas.bPoints || []).forEach(function (pt) {
      px.push(state.tu === 'C' ? pt[0] - 273.15 : pt[0]);
      py.push(pt[1]);
    });
    if (px.length) bSeries.push({ name: 'опыт', color: '#111827', width: 0, xs: px, ys: py });
    const tbV = EOS.boyleVdW(gas);
    const tbE = EOS.boyleExpFit(gas);
    const vLines = [{ x: state.tu === 'C' ? tbV - 273.15 : tbV, color: COLORS.vdw, label: 'TB ВдВ' }];
    if (isFinite(tbE)) vLines.push({ x: state.tu === 'C' ? tbE - 273.15 : tbE, color: '#ea580c' });
    Charts.draw($('virB'), {
      series: bSeries, vLines: vLines, markers: px.map(function (x, i) { return { x: x, y: py[i], color: '#111827', r: 3.5 }; }),
      xLabel: 'T, ' + tLabel(), yLabel: 'B, см³/моль', colors: c, height: 230, includeZero: true
    });

    const conv = [];
    const maxN = state.n;
    for (let n = 1; n <= maxN; n++) {
      const xs = [], ys = [];
      for (let i = 0; i < 70; i++) {
        const t = i / 69;
        const V = Math.exp(Math.log(b * 3) * (1 - t) + Math.log(b * 20) * t);
        const P = EOS.pressure('virial', gas, T, V, { nTerms: n, source: 'vdw' });
        xs.push(V * 1000); ys.push(P / 1e5);
      }
      conv.push({ name: 'n=' + n, color: TERM_COLORS[(n - 1) % TERM_COLORS.length], width: 1.4, xs: xs, ys: ys });
    }
    const ex = { xs: [], ys: [] };
    for (let i = 0; i < 70; i++) {
      const t = i / 69;
      const V = Math.exp(Math.log(b * 3) * (1 - t) + Math.log(b * 20) * t);
      ex.xs.push(V * 1000); ex.ys.push(EOS.pressure('vdw', gas, T, V) / 1e5);
    }
    conv.push({ name: 'ВдВ', color: sumColor, width: 2.4, xs: ex.xs, ys: ex.ys });
    Charts.draw($('virConv'), { series: conv, xLabel: 'Vₘ, л/моль', yLabel: 'P, бар', colors: c, height: 230, logX: true });

    const VmTest = 5 * b;
    const Pexact = EOS.pressure('vdw', gas, T, VmTest);
    const P6 = EOS.pressure('virial', gas, T, VmTest, { nTerms: Math.max(state.n, 6), source: 'vdw' });
    const Pn = EOS.pressure('virial', gas, T, VmTest, { nTerms: state.n, source: 'vdw' });
    const rel = Math.abs(Pn - Pexact) / Math.abs(Pexact);
    const rel6 = Math.abs(P6 - Pexact) / Math.abs(Pexact);
    const box = $('virText');
    box.dataset.rel = String(rel);
    box.dataset.rel6 = String(rel6);
    const pf = EOS.pressureFormCoeffs(info.coeffs, T);
    let txt = info.notes.join(' ');
    txt += ' При Vₘ = 5b (' + fmt(VmTest * 1000, 3) + ' л/моль) ряд из ' + state.n + ' членов ВдВ отличается от точной кривой на ' + fmt(rel * 100, 3) + ' %.';
    txt += ' Шесть членов — на ' + fmt(rel6 * 100, 4) + ' %.';
    if (pf.length > 1) txt += ' Сейчас B′ = ' + fmt(pf[0], 3) + ' 1/Па, C′ = ' + fmt(pf[1], 3) + ' 1/Па².';
    const fitB = EOS.boyleExpFit(gas);
    txt += ' Бойль по ВдВ: ' + fmt(tbV, 4) + ' К';
    if (isFinite(fitB)) txt += '; по опытной подгонке B(T)=0 около ' + fmt(fitB, 4) + ' К' + (gas.boyleExp ? ' (таблица ' + gas.boyleExp + ' К)' : '') + '.';
    else txt += '.';
    box.textContent = txt;
  }

  function renderEquations() {
    const host = $('equations');
    if (host.dataset.ready) return;
    host.dataset.ready = '1';
    const blocks = [
      ['Идеальный газ', 'P = \\dfrac{RT}{V_m}, \\qquad Z = \\dfrac{P V_m}{RT} = 1',
        '<p>R — газовая постоянная, T — абсолютная температура, V<sub>m</sub> — объём одного моля. Z = 1 означает: молекулы — точки, друг друга не чувствуют. Давление — только удары о стенку.</p>'],
      ['Вириал по объёму', 'Z = 1 + \\dfrac{B}{V_m} + \\dfrac{C}{V_m^2} + \\dfrac{D}{V_m^3} + \\cdots',
        '<p>B — про пары молекул. Если притяжение сильнее собственного объёма, B &lt; 0 и Z &lt; 1. C — про тройки, дальше — более плотные компании. Ряд хорош при умеренной плотности и расходится, когда V<sub>m</sub> сравнимо с b.</p>'],
      ['Вириал по давлению', 'Z = 1 + B\' P + C\' P^2 + \\cdots',
        '<p>Те же столкновения, но аргумент — давление. Связь с объёмными коэффициентами:</p>'],
      ['', 'B\' = \\dfrac{B}{RT}, \\qquad C\' = \\dfrac{C - B^2}{(RT)^2}',
        '<p>B′ имеет размерность 1/давление. При температуре Бойля B = 0, значит и B′ = 0: газ дольше всех притворяется идеальным.</p>'],
      ['Ван-дер-Ваальс', '\\left(P + \\dfrac{a}{V_m^2}\\right)(V_m - b) = RT',
        '<p>b — объём, куда центры молекул не пускают друг друга (отталкивание, «собственный объём»). a/V<sub>m</sub>² — внутреннее давление притяжения: молекулы у стенки тянут назад, и на стенку приходится меньший удар. В явном виде:</p>'],
      ['', 'P = \\dfrac{RT}{V_m - b} - \\dfrac{a}{V_m^2}',
        '<p>Первый член больше идеального RT/V<sub>m</sub> (молекулам тесно), второй его уменьшает.</p>'],
      ['Откуда B, C, … у ВдВ', '\\dfrac{V_m}{V_m-b} = \\dfrac{1}{1-b/V_m} = \\sum_{k=0}^{\\infty}\\left(\\dfrac{b}{V_m}\\right)^k',
        '<p>Подставьте в Z = V<sub>m</sub>/(V<sub>m</sub>−b) − a/(RT V<sub>m</sub>):</p>'],
      ['', 'Z = 1 + \\dfrac{b - a/RT}{V_m} + \\dfrac{b^2}{V_m^2} + \\dfrac{b^3}{V_m^3} + \\cdots',
        '<p>Поэтому B = b − a/RT, C = b², D = b³, … Притяжение сидит только во втором коэффициенте. Температура Бойля — где B = 0:</p>'],
      ['Температура Бойля', 'T_B = \\dfrac{a}{Rb} = \\dfrac{27}{8} T_c \\approx 3{,}375\\, T_c',
        '<p>У реального аргона Бойль около 411 К, а модель ВдВ даёт 3,375 T<sub>c</sub> ≈ 509 К. Порядок тот же, число — грубое. Ниже T<sub>B</sub> притяжение побеждает при малых давлениях.</p>'],
      ['a и b из критической точки', 'a = \\dfrac{27 R^2 T_c^2}{64 P_c}, \\quad b = \\dfrac{R T_c}{8 P_c}',
        '<p>В критической точке (∂P/∂V)<sub>T</sub> = 0 и (∂²P/∂V²)<sub>T</sub> = 0. Отсюда же обратно:</p>'],
      ['', 'T_c = \\dfrac{8a}{27 R b}, \\quad P_c = \\dfrac{a}{27 b^2}, \\quad V_c = 3b, \\quad Z_c = \\dfrac{3}{8}',
        '<p>У настоящих газов Z<sub>c</sub> ближе к 0,27–0,30, не к 0,375. Поэтому ВдВ учебная модель, а не таблица свойств.</p>'],
      ['Редлих–Квонг', 'P = \\dfrac{RT}{V_m-b} - \\dfrac{a}{\\sqrt{T}\\, V_m (V_m+b)}',
        '<p>Притяжение слабеет с ростом T (множитель 1/√T) и зависит от объёма мягче, чем a/V². Константы из T<sub>c</sub>, P<sub>c</sub>: a = Ω<sub>a</sub> R² T<sub>c</sub><sup>2,5</sup>/P<sub>c</sub>, b = Ω<sub>b</sub> R T<sub>c</sub>/P<sub>c</sub>, Ω<sub>a</sub> ≈ 0,4275, Ω<sub>b</sub> ≈ 0,08664. Z<sub>c</sub> = 1/3.</p>'],
      ['Соаве–Редлих–Квонг', 'P = \\dfrac{RT}{V_m-b} - \\dfrac{a\\,\\alpha(T)}{V_m(V_m+b)}',
        '<p>α = [1 + m(1 − √T<sub>r</sub>)]², m = 0,480 + 1,574 ω − 0,176 ω². Ацентрический фактор ω говорит, насколько молекула «не круглая» и насколько её давление пара отличается от простого флюида. У аргона ω ≈ 0, у воды ≈ 0,34.</p>'],
      ['Пенг–Робинсон', 'P = \\dfrac{RT}{V_m-b} - \\dfrac{a\\,\\alpha(T)}{V_m^2 + 2b V_m - b^2}',
        '<p>Знаменатель притяжения другой, Z<sub>c</sub> ≈ 0,307 — ближе к опыту, чем 3/8. κ = 0,37464 + 1,54226 ω − 0,26992 ω², α устроен как у Соаве. На приведённых осях разные газы уже не ложатся в одну кривую: их различает ω.</p>'],
      ['Бертло', '\\left(P + \\dfrac{a}{T V_m^2}\\right)(V_m - b) = RT',
        '<p>Как ВдВ, но притяжение ещё делят на T. Из критической точки b тот же, что у ВдВ, а a = 27 R² T<sub>c</sub>³ / (64 P<sub>c</sub>). V<sub>c</sub> = 3b, Z<sub>c</sub> = 3/8.</p>'],
      ['Дитеричи', 'P = \\dfrac{RT}{V_m-b}\\,\\exp\\!\\left(-\\dfrac{a}{RT V_m}\\right)',
        '<p>Притяжение не вычитается, а умножает «свободный» член на экспоненту меньше единицы. Критические соотношения: V<sub>c</sub> = 2b, T<sub>c</sub> = a/(4Rb), P<sub>c</sub> = a/(4e² b²), Z<sub>c</sub> = 2/e² ≈ 0,271 — уже похоже на опыт.</p>'],
      ['Битти–Бриджмен', 'P = \\dfrac{RT(1-\\varepsilon)}{V_m^2}(V_m + B) - \\dfrac{A}{V_m^2}',
        '<p>A = A₀(1 − a/V<sub>m</sub>), B = B₀(1 − b/V<sub>m</sub>), ε = c/(V<sub>m</sub> T³). Пять эмпирических чисел на газ, не из одних T<sub>c</sub> и P<sub>c</sub>. В странице они есть для части газов (классические таблицы, литры и атмосферы).</p>'],
      ['Бенедикт–Вебб–Рубин', 'P = \\dfrac{RT}{V} + \\dfrac{B_0 RT - A_0 - C_0/T^2}{V^2} + \\dfrac{bRT - a}{V^3} + \\dfrac{a\\alpha}{V^6} + \\dfrac{c}{V^3 T^2}\\left(1+\\dfrac{\\gamma}{V^2}\\right)\\mathrm{e}^{-\\gamma/V^2}',
        '<p>Восемь констант. Хорошо описывает лёгкие углеводороды там, где константы измерены. Здесь численно включён метан; для остальных газов уравнение показано, изотерма не строится.</p>'],
      ['Длина и скорости', 'd = \\left(\\dfrac{V_m}{N_A}\\right)^{1/3}, \\qquad \\lambda = \\dfrac{kT}{\\sqrt{2}\\,\\pi \\sigma^2 P}, \\qquad v_{\\mathrm{rms}} = \\sqrt{\\dfrac{3RT}{M}}',
        '<p>d — среднее расстояние между молекулами. σ — диаметр, на котором потенциал Леннард-Джонса равен нулю. λ — газокинетический пробег. В двухфазной области доли задаёт рычаг: x<sub>п</sub> = (V<sub>m</sub> − V<sub>ж</sub>)/(V<sub>п</sub> − V<sub>ж</sub>), а доля объёма пара φ<sub>п</sub> = x<sub>п</sub> V<sub>п</sub> / V<sub>m</sub>.</p>']
    ];
    blocks.forEach(function (b) {
      const sec = document.createElement('div');
      sec.className = 'block';
      if (b[0]) {
        const h = document.createElement('h3');
        h.textContent = b[0];
        sec.appendChild(h);
      }
      const eq = document.createElement('div');
      eq.className = 'eq';
      if (window.katex) {
        try { katex.render(b[1], eq, { displayMode: true, throwOnError: false, output: 'html' }); }
        catch (err) { eq.textContent = b[1]; }
      } else eq.textContent = b[1];
      sec.appendChild(eq);
      const div = document.createElement('div');
      div.innerHTML = b[2];
      sec.appendChild(div);
      host.appendChild(sec);
    });
  }

  function renderTable(gas) {
    const table = $('dataTable');
    const pu = 'бар', vu = 'л/моль';
    let html = '<thead><tr><th>Газ</th><th>Tc, К</th><th>Pc, бар</th><th>Vc, см³</th><th>ω</th><th>a ВдВ</th><th>b, л/моль</th><th>ε/k, К</th><th>σ, Å</th><th>B(298)</th><th></th></tr></thead><tbody>';
    EOS.GASES.forEach(function (g) {
      const ab = EOS.vdwAB(g.Tc, g.Pc);
      const B = (g.fit && 298 >= g.fit.tMin && 298 <= g.fit.tMax) ? EOS.expBcm(g, 298) : NaN;
      html += '<tr class="' + (g.id === gas.id ? 'on' : '') + '"><td>' + g.formula + '</td><td>' + fmt(g.Tc, 5) + '</td><td>' + fmt(g.Pc / 1e5, 4) +
        '</td><td>' + fmt(g.Vc * 1e6, 4) + '</td><td>' + g.omega + '</td><td>' + fmt(ab.a * 10, 4) + '</td><td>' + fmt(ab.b * 1000, 4) +
        '</td><td>' + g.lj.eps + '</td><td>' + g.lj.sigma + '</td><td>' + (isFinite(B) ? fmt(B, 4) : '—') +
        '</td><td><button type="button" class="linkish" data-pick="' + g.id + '">открыть</button></td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
    table.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gasId = b.dataset.pick;
        state.override = null;
        state.Vm = null;
        syncControls();
        render();
        location.hash = '#controls';
      });
    });
  }

  function renderQuiz(gas) {
    quizGas = gas.id;
    const ab = EOS.vdwParams(gas);
    const aL = ab.a * 10, bL = ab.b * 1000;
    const Rbar = EOS.R / 100;
    const Tq = 300;
    const VmL = 1;
    const Vm = 0.001;
    const P = EOS.pressure('vdw', gas, Tq, Vm);
    const Z = P * Vm / (EOS.R * Tq);
    const tb = ab.a / (EOS.R * ab.b);
    const host = $('quiz');
    host.innerHTML =
      '<div class="q"><p><b>1.</b> Чему равен Z идеального газа при любых T и V<sub>m</sub>?</p><input id="q1" type="number" step="any" inputmode="decimal"><p id="a1"></p></div>' +
      '<div class="q"><p><b>2.</b> Температура Бойля ' + gas.formula + ' по Ван-дер-Ваальсу, кельвины. T<sub>B</sub> = a/(R b).</p><input id="q2" type="number" step="any" inputmode="decimal"><p id="a2"></p></div>' +
      '<div class="q"><p><b>3.</b> ' + gas.formula + ', модель ВдВ, T = 300 К, V<sub>m</sub> = 1 л/моль. a = ' + fmt(aL, 4) + ' л²·бар/моль², b = ' + fmt(bL, 4) + ' л/моль, R = ' + fmt(Rbar, 5) + ' л·бар/(моль·К). Найдите Z = P V<sub>m</sub> /(R T).</p><input id="q3" type="number" step="any" inputmode="decimal"><p id="a3"></p></div>' +
      '<div class="q"><p><b>4.</b> Что уравнивает построение Максвелла на петле ВдВ?</p><select id="q4"><option value="">выберите</option><option value="p">давления в минимуме и максимуме</option><option value="a">площади между изотермой и изобарой</option><option value="v">объёмы жидкости и пара</option></select><p id="a4"></p></div>' +
      '<button class="btn" id="btnQuiz" type="button">Проверить</button>';
    host.dataset.z = String(Z);
    host.dataset.tb = String(tb);
    $('btnQuiz').addEventListener('click', function () {
      grade($('q1'), $('a1'), 1, 0.02, 'У идеального газа Z = 1 при любых условиях. Это определение.');
      grade($('q2'), $('a2'), tb, Math.abs(tb) * 0.03, 'T_B = a/(Rb) = ' + fmt(tb, 5) + ' К = ' + fmt(tb / gas.Tc, 4) + ' T_c.');
      grade($('q3'), $('a3'), Z, Math.max(0.02, Math.abs(Z) * 0.04), 'P = RT/(V−b) − a/V², затем Z = PV/RT = ' + fmt(Z, 4) + '.');
      const ok = $('q4').value === 'a';
      $('a4').className = ok ? 'ok' : 'bad';
      $('a4').textContent = ok ? 'Да. Две петли имеют равные площади, и химические потенциалы жидкости и пара совпадают.' : 'Нужны равные площади между изотермой и горизонталью Pнас.';
    });
  }
  function grade(input, out, answer, tol, text) {
    const v = parseFloat(input.value);
    const ok = isFinite(v) && Math.abs(v - answer) <= tol;
    out.className = ok ? 'ok' : 'bad';
    out.textContent = (ok ? 'Верно. ' : 'Пока не то. ') + text;
  }

  function render() {
    const gas = workingGas();
    if (!(state.Vm > 0)) state.Vm = defaultVm(gas);
    const ph = EOS.phase(state.focus, gas, state.T, state.Vm, opts());
    renderFacts(gas);
    renderState(gas, ph);
    renderVessel(gas, ph);
    renderBreak(gas, ph);
    renderPV(gas, ph);
    renderVirial(gas);
    renderEquations();
    if ($('dataTable').dataset.gas !== gas.id || state.override) {
      $('dataTable').dataset.gas = gas.id;
      renderTable(gas);
    }
    if (quizGas !== gas.id) renderQuiz(gas);
    syncControls();
    writeUrl();
  }

  function bind() {
    $('gas').addEventListener('change', function () { state.gasId = $('gas').value; state.override = null; state.Vm = null; render(); });
    $('focus').addEventListener('change', function () { state.focus = $('focus').value; state.eosOn[state.focus] = true; render(); });
    $('tSlider').addEventListener('input', function () { state.T = +$('tSlider').value; render(); });
    $('vSlider').addEventListener('input', function () { state.Vm = sliderToVm(+$('vSlider').value, workingGas()); render(); });
    $('pu').addEventListener('change', function () { state.pu = $('pu').value; render(); });
    $('vu').addEventListener('change', function () { state.vu = $('vu').value; render(); });
    $('tu').addEventListener('change', function () { state.tu = $('tu').value; render(); });
    $('nSlider').addEventListener('input', function () { state.n = +$('nSlider').value; render(); });
    $('virSrc').addEventListener('change', function () { state.source = $('virSrc').value; render(); });
    $('logX').addEventListener('change', function () { state.logX = $('logX').checked; render(); });
    $('reduced').addEventListener('change', function () { state.reduced = $('reduced').checked; render(); });
    $('compare').addEventListener('change', function () { state.compare = $('compare').checked; render(); });
    $('lAuto').addEventListener('change', function () { state.lAuto = $('lAuto').checked; render(); });
    $('lSlider').addEventListener('input', function () { state.lAuto = false; $('lAuto').checked = false; state.Lnm = +$('lSlider').value; render(); });
    $('btnPause').addEventListener('click', function () {
      vessel.running = !vessel.running;
      syncPause();
    });
    $('btnTheme').addEventListener('click', function () {
      const dark = document.documentElement.dataset.theme === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('eos-theme', dark ? 'light' : 'dark'); } catch (e) {}
      render();
    });
    $('vRangeReset').addEventListener('click', function () { state.vMin = null; state.vMax = null; render(); });
    function readRange() {
      const gas = workingGas();
      const a = parseFloat($('vMin').value), b = parseFloat($('vMax').value);
      if (a > 0 && b > a) {
        state.vMin = a * vUnit().f;
        state.vMax = b * vUnit().f;
        render();
      }
    }
    $('vMin').addEventListener('change', readRange);
    $('vMax').addEventListener('change', readRange);
    const pv = $('pv');
    function dragTo(ev) {
      const map = pv._map;
      if (!map) return;
      const rect = pv.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      if (x < map.plot.x || x > map.plot.x + map.plot.w) return;
      let V = map.xOf(x);
      const gas = workingGas();
      const crit = EOS.modelCritical(state.focus, gas) || { Vc: gas.Vc || 1e-4 };
      if (state.reduced) V = V * crit.Vc;
      else V = V * vUnit().f;
      if (V > 0) { state.Vm = V; render(); }
    }
    pv.addEventListener('pointerdown', function (ev) { drag = true; pv.setPointerCapture(ev.pointerId); dragTo(ev); });
    pv.addEventListener('pointermove', function (ev) { if (drag) dragTo(ev); });
    pv.addEventListener('pointerup', function () { drag = false; });
    pv.addEventListener('pointercancel', function () { drag = false; });
    $('btnAB').addEventListener('click', function () {
      const Tc = parseFloat($('fTc').value), Pc = parseFloat($('fPc').value) * 1e5;
      if (!(Tc > 0) || !(Pc > 0)) return;
      const ab = EOS.vdwAB(Tc, Pc);
      $('fA').value = fmt(ab.a * 10, 6);
      $('fB').value = fmt(ab.b * 1000, 6);
      renderFacts(workingGas());
    });
    $('btnApply').addEventListener('click', applyForm);
    $('btnReset').addEventListener('click', function () { state.override = null; syncControls(); render(); });
    ['fTc', 'fPc', 'fVc', 'fW', 'fM', 'fA', 'fB'].forEach(function (id) {
      $(id).addEventListener('input', function () { renderFacts(workingGas()); });
    });
    $('btnCopy').addEventListener('click', function () {
      const text = $('shareUrl').value;
      const done = function () { $('copyMsg').textContent = 'Скопировано.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(function () { $('shareUrl').select(); done(); });
      else { $('shareUrl').select(); done(); }
    });
    window.addEventListener('resize', function () { render(); });
  }

  function applyForm() {
    const Tc = parseFloat($('fTc').value);
    const Pc = parseFloat($('fPc').value) * 1e5;
    const Vc = parseFloat($('fVc').value) * 1e-6;
    const omega = parseFloat($('fW').value);
    const M = parseFloat($('fM').value) / 1000;
    const a = parseFloat($('fA').value);
    const b = parseFloat($('fB').value);
    state.override = {};
    if (Tc > 0) state.override.Tc = Tc;
    if (Pc > 0) state.override.Pc = Pc;
    if (Vc > 0) state.override.Vc = Vc;
    if (isFinite(omega)) state.override.omega = omega;
    if (M > 0) state.override.M = M;
    if (a > 0 && b > 0) { state.override.aSI = a / 10; state.override.bSI = b / 1000; }
    render();
  }

  function syncPause() {
    const b = $('btnPause');
    if (!b || !vessel) return;
    const on = !!vessel.running;
    b.textContent = on ? 'Пауза' : '▶ Пуск';
    b.classList.toggle('need-play', !on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function boot() {
    readUrl();
    fillStatic();
    bind();
    vessel = new window.EOSVessel.Vessel($('vessel'), $('hist'));
    if (window.PVMotion && !PVMotion.autoplay()) vessel.running = false;
    const gas = workingGas();
    if (!(state.Vm > 0)) state.Vm = defaultVm(gas);
    syncControls();
    render();
    syncPause();
    vessel.start();
    setTimeout(function () {
      const r = EOS.selfTest();
      const el = $('selftest');
      el.dataset.ok = r.ok ? '1' : '0';
      el.textContent = r.ok ? 'Внутренняя проверка модели пройдена: критическая точка CO₂, Бойль аргона, сходимость вириала, площади Максвелла.' : ('Проверка не сошлась: ' + r.fails.join('; '));
    }, 60);
  }
  boot();
})();
