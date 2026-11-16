/* Сборка страницы: адрес, тема, разделы, QR. */
(function () {
  'use strict';

  var DEFAULTS = {
    sec: 'lattice', dim: '2', lat: 'hex', a: 1, b: 1.4, gam: 75,
    bz3: 'fcc', ca: 1.633, spin3: '1',
    chain: 'mono', m: 1, K: 1, m1: 1, m2: 2, K1: 1, K2: 0.6, springs: 'same',
    k: 0.5, pol: 'L', branch: 'ac', alias: '0', lat2: 'square', kp: 0.42, dos: 'chain',
    el: 'tb', scheme: 'red', U: 0.15, t: 1, eps: 0, fill: 1, orb: 's', psi: 're',
    lam: 1, ang: 120, basis: 'crect', sep: 0.5, f2: 1, delta: 0.2,
    td: 300, te: 300, Tm: 120, amp: 0.35, play: '1', theme: ''
  };
  var NUM = {
    a: 1, b: 1, gam: 1, ca: 1, m: 1, K: 1, m1: 1, m2: 1, K1: 1, K2: 1,
    k: 1, kp: 1, U: 1, t: 1, eps: 1, fill: 1, lam: 1, ang: 1, sep: 1, f2: 1,
    delta: 1, td: 1, te: 1, Tm: 1, amp: 1
  };
  var state = Object.assign({}, DEFAULTS);
  var phase = 0;
  var colors = null;

  function $(id) { return document.getElementById(id); }

  function readURL() {
    var q = new URLSearchParams(location.search);
    q.forEach(function (v, k) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) return;
      if (NUM[k]) {
        var n = parseFloat(v);
        if (isFinite(n)) state[k] = n;
      } else state[k] = v;
    });
    if (state.sec !== 'lattice' && state.sec !== 'phonon' && state.sec !== 'electron' && state.sec !== 'more') state.sec = 'lattice';
  }

  function shareQuery() {
    var keep = {
      lattice: ['sec', 'dim', 'lat', 'a', 'b', 'gam', 'bz3', 'ca'],
      phonon: ['sec', 'chain', 'k', 'm', 'K', 'm1', 'm2', 'K1', 'K2', 'springs', 'pol', 'branch', 'alias', 'lat2', 'kp', 'dos', 'td', 'te'],
      electron: ['sec', 'el', 'scheme', 'k', 't', 'U', 'eps', 'fill', 'orb', 'psi', 'a'],
      more: ['sec', 'lam', 'ang', 'basis', 'sep', 'f2', 'delta', 'lat', 'a', 'b', 'amp', 't']
    };
    var q = new URLSearchParams();
    var keys = keep[state.sec] || ['sec'];
    if (state.theme) keys = keys.concat(['theme']);
    keys.forEach(function (k) {
      if (state[k] == null || state[k] === '') return;
      q.set(k, String(state[k]));
    });
    return q.toString();
  }

  function writeURL() {
    var next = shareQuery();
    if (location.search.replace(/^\?/, '') !== next) {
      history.replaceState(null, '', next ? '?' + next : location.pathname);
    }
  }

  function fmt(v, digits) {
    var n = Number(v);
    if (!isFinite(n)) return '—';
    return n.toFixed(digits == null ? 2 : digits).replace('.', ',');
  }

  function applyTheme() {
    var root = document.documentElement;
    if (state.theme === 'dark' || state.theme === 'light') root.dataset.theme = state.theme;
    else delete root.dataset.theme;
    colors = LDraw.colors();
  }

  function showSection() {
    document.querySelectorAll('[data-sec-panel]').forEach(function (el) {
      el.hidden = el.getAttribute('data-sec-panel') !== state.sec;
    });
    document.querySelectorAll('#secnav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.sec === state.sec);
    });
  }

  function applyShow() {
    document.querySelectorAll('[data-show]').forEach(function (el) {
      var ok = true;
      el.dataset.show.split(/\s+/).forEach(function (part) {
        var bits = part.split(':');
        if (bits[1].split('|').indexOf(String(state[bits[0]])) < 0) ok = false;
      });
      el.hidden = !ok;
    });
  }

  function syncControls() {
    document.querySelectorAll('[data-set]').forEach(function (b) {
      b.classList.toggle('on', String(state[b.dataset.set]) === String(b.dataset.val));
    });
    document.querySelectorAll('input[type=range][data-key]').forEach(function (inp) {
      var key = inp.dataset.key;
      if (document.activeElement !== inp && state[key] != null) inp.value = state[key];
      var label = inp.parentElement && inp.parentElement.querySelector('b');
      if (label && label.id && label.id.indexOf('o-') === 0) label.textContent = fmt(state[key], inp.dataset.digits);
    });
    var alias = $('ckAlias');
    if (alias) alias.checked = String(state.alias) !== '0';
    var spin = $('ckSpin');
    if (spin) spin.checked = String(state.spin3) !== '0';
    var play = $('btnPlay');
    if (play) {
      var paused = String(state.play) === '0';
      play.textContent = paused ? '▶ Пуск' : '⏸';
      play.classList.toggle('need-play', paused);
      play.setAttribute('aria-label', paused ? 'Запустить анимацию' : 'Пауза анимации');
    }
  }

  function safe(name, fn) {
    try { fn(); }
    catch (e) {
      var box = $('err');
      if (box) {
        box.hidden = false;
        box.textContent = name + ': ' + (e && e.message ? e.message : e);
      }
    }
  }

  function refresh(opts) {
    opts = opts || {};
    applyTheme();
    showSection();
    applyShow();
    syncControls();
    safe('решётка', function () { LSecLattice.sync(state); });
    safe('фононы', function () { LSecPhonon.sync(state); });
    safe('электроны', function () { LSecElectron.sync(state); });
    safe('ещё', function () { LSecMore.sync(state); });
    drawActive();
    if (!opts.skipUrl) writeURL();
  }

  function drawActive() {
    var panel = document.querySelector('[data-sec-panel="' + state.sec + '"]');
    if (panel) panel.getBoundingClientRect();
    colors = LDraw.colors();
    if (state.sec === 'lattice') safe('рис. решётка', function () { LSecLattice.draw(state, colors); });
    if (state.sec === 'phonon') safe('рис. фононы', function () { LSecPhonon.draw(state, colors, phase); });
    if (state.sec === 'electron') safe('рис. электроны', function () { LSecElectron.draw(state, colors); });
    if (state.sec === 'more') safe('рис. ещё', function () { LSecMore.draw(state, colors); });
  }

  function setState(partial) {
    Object.keys(partial).forEach(function (k) { state[k] = partial[k]; });
    refresh();
  }

  function visualOmega() {
    var a = state.a;
    var k = state.k * Math.PI / a;
    if (state.chain !== 'di') return LatticeMath.omegaMono(k, state.K, state.m, a);
    var K1 = state.springs === 'alt' ? state.K1 : state.K;
    var K2 = state.springs === 'alt' ? state.K2 : state.K;
    var o = LatticeMath.diatomicOmega(k, state.m1, state.m2, K1, K2, a);
    return state.branch === 'op' ? o.op : o.ac;
  }

  document.body.addEventListener('click', function (e) {
    var sec = e.target.closest('#secnav button');
    if (sec) { state.sec = sec.dataset.sec; refresh(); return; }
    var chip = e.target.closest('[data-set]');
    if (chip) { state[chip.dataset.set] = NUM[chip.dataset.set] ? parseFloat(chip.dataset.val) : chip.dataset.val; refresh(); }
  });
  document.body.addEventListener('input', function (e) {
    var key = e.target.dataset && e.target.dataset.key;
    if (!key) return;
    var v = parseFloat(e.target.value);
    if (isFinite(v)) state[key] = v;
    refresh();
  });
  $('ckAlias').addEventListener('change', function () { state.alias = $('ckAlias').checked ? '1' : '0'; refresh(); });
  $('ckSpin').addEventListener('change', function () { state.spin3 = $('ckSpin').checked ? '1' : '0'; refresh(); });
  $('btnPlay').addEventListener('click', function () { state.play = String(state.play) === '0' ? '1' : '0'; refresh(); });
  $('btnTheme').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : state.theme === 'light' ? '' : 'dark';
    refresh();
  });
  $('bzReset').addEventListener('click', function () { LSecLattice.resetView(); state.spin3 = '1'; refresh(); });

  LDraw.bindX($('cvDisp'), function (px) {
    var k = LSecPhonon.onDisp(px);
    if (k == null) return;
    state.k = Math.round(k * 1000) / 1000;
    refresh();
  });
  LDraw.bindX($('cvPath'), function (px) {
    var u = LSecPhonon.onPath(px);
    if (u == null) return;
    state.kp = Math.round(u * 1000) / 1000;
    refresh();
  });
  LDraw.bindX($('cvBand'), function (px) {
    var k = LSecElectron.onBand(px);
    if (k == null) return;
    state.k = Math.round(k * 1000) / 1000;
    refresh();
  });

  function renderMath() {
    if (!window.katex) return;
    document.querySelectorAll('[data-tex]').forEach(function (el) {
      try {
        katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: el.dataset.display !== 'inline' });
      } catch (e) { /* формула остаётся текстом */ }
    });
  }

  function openShare() {
    var url = location.href;
    $('shareUrl').value = url;
    drawQR($('qr'), url);
    $('sheet').hidden = false;
  }
  function drawQR(canvas, text) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, W);
    if (!window.qrcode) return;
    var q = qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    var n = q.getModuleCount();
    var quiet = 4;
    var cell = Math.floor(W / (n + quiet * 2)) || 1;
    var off = Math.floor((W - cell * n) / 2);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    }
  }
  $('btnShare').addEventListener('click', openShare);
  $('closeShare').addEventListener('click', function () { $('sheet').hidden = true; });
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) $('sheet').hidden = true; });
  $('copyUrl').addEventListener('click', function () {
    var t = $('shareUrl').value;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(function () {});
    else { $('shareUrl').select(); document.execCommand('copy'); }
    $('copyUrl').textContent = 'Скопировано';
    setTimeout(function () { $('copyUrl').textContent = 'Копировать'; }, 1200);
  });

  readURL();
  if (window.PVMotion && !PVMotion.autoplay() && !new URLSearchParams(location.search).has('play')) state.play = '0';
  renderMath();
  refresh({ skipUrl: true });
  requestAnimationFrame(function () { drawActive(); });

  var last = 0;
  function frame(ts) {
    try {
      var dt = Math.min(0.05, last ? (ts - last) / 1000 : 0);
      if (!isFinite(dt) || dt < 0) dt = 0;
      last = ts;
      if (String(state.play) !== '0' && state.sec === 'phonon') {
        var w = visualOmega();
        var cap = state.chain === 'di'
          ? LatticeMath.diatomicOmega(0, state.m1, state.m2, state.K, state.K, state.a).op
          : LatticeMath.omegaMonoMax(state.K, state.m);
        phase += dt * (cap > 1e-6 ? Math.min(1.2, w / cap) : 0) * Math.PI * 2 / 1.2;
        safe('кадр', function () { LSecPhonon.drawAnim(state, colors || LDraw.colors(), phase); });
      }
      if (state.sec === 'lattice' && state.dim === '3') {
        safe('3d', function () { LSecLattice.tick(dt, state, colors || LDraw.colors()); });
      }
    } catch (e) { /* кадр не обрывает цикл */ }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', function () { drawActive(); });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { drawActive(); });
    ro.observe(document.querySelector('main'));
  }

  var check = LatticeMath.selfCheck();
  if (!check.ok) {
    var box = $('err');
    box.hidden = false;
    box.textContent = check.errors.join('; ');
  }

  globalThis.LATTICE = {
    math: LatticeMath,
    get state() { return state; },
    set: setState,
    readouts: function () {
      var a = state.a;
      var gap = LatticeMath.diatomicGapEdges(state.m1, state.m2, state.K);
      var hex = LatticeMath.bzPolygon('hex', a, a, 60);
      var radii = hex.poly.map(function (p) { return LatticeMath.len2(p); });
      var fcc = LatticeMath.brillouin3d('fcc', a);
      var edge = LatticeMath.diatomicOmega(Math.PI / a, state.m1, state.m2, state.K, state.K, a);
      return {
        omegaMax: LatticeMath.omegaMonoMax(state.K, state.m),
        omegaAtPi: LatticeMath.omegaMono(Math.PI / a, state.K, state.m, a),
        gapLo: gap.lo,
        gapHi: gap.hi,
        edgeM1: Math.sqrt(2 * state.K / state.m1),
        edgeM2: Math.sqrt(2 * state.K / state.m2),
        edgeAc: edge.ac,
        edgeOp: edge.op,
        hexSides: hex.poly.length,
        hexK: LatticeMath.hexK(a).x,
        hexR: Math.max.apply(null, radii),
        fccShape: fcc.shape,
        fccFaces: fcc.counts.faces,
        fccHex: fcc.counts.hex,
        fccSq: fcc.counts.square,
        fccVert: fcc.counts.vertices,
        tbWidth: LatticeMath.tbBandwidth(Math.abs(state.t)),
        nfeGap: LatticeMath.nfeGap(state.U)
      };
    }
  };
})();
