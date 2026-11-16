/* Страница «Молекулярные машины»: карточки, URL, QR, цикл анимации. */
(function () {
  'use strict';
  const MM = window.MM;
  const $ = (sel, root) => (root || document).querySelector(sel);

  function themeExplicit() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  try {
    const saved = localStorage.getItem('mm-theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* приватный режим */ }

  const params = new URLSearchParams(location.search);
  const cards = [];
  let activeId = params.get('m') || 'feringa';

  function urlFor(machine, state) {
    const u = new URL('machines.html', location.href);
    u.searchParams.set('m', machine.id);
    u.searchParams.set('step', String(machine.stepOf(state)));
    const part = machine.partOf(state);
    if (part) u.searchParams.set('part', part);
    if (state.model && state.model !== 'scheme') u.searchParams.set('view', state.model);
    if (state.repr && state.repr !== 'trace') u.searchParams.set('repr', state.repr);
    if (state.membrane === 'on') u.searchParams.set('mem', '1');
    return u.href;
  }
  function syncUrl() {
    const card = cards.find(c => c.machine.id === activeId) || cards[0];
    if (!card) return;
    const next = urlFor(card.machine, card.state);
    const cur = new URL(location.href);
    const nxt = new URL(next);
    if (cur.search !== nxt.search) history.replaceState(null, '', nxt.pathname + nxt.search);
  }

  function renderLegend(host, items) {
    host.innerHTML = '';
    items.forEach(pair => {
      const span = document.createElement('span');
      const i = document.createElement('i');
      i.style.background = pair[0];
      span.appendChild(i);
      span.appendChild(document.createTextNode(pair[1]));
      host.appendChild(span);
    });
  }

  function buildControls(card) {
    const host = card.controlsEl;
    const machine = card.machine;
    const st = card.state;
    machine.controls.forEach(ctrl => {
      if (ctrl.type === 'play') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-play';
        b.textContent = st.playing ? 'Пауза' : '▶ Пуск';
        b.classList.toggle('need-play', !st.playing);
        b.setAttribute('aria-pressed', st.playing ? 'true' : 'false');
        b.addEventListener('click', () => {
          st.playing = !st.playing;
          b.textContent = st.playing ? 'Пауза' : '▶ Пуск';
          b.classList.toggle('need-play', !st.playing);
          b.setAttribute('aria-pressed', st.playing ? 'true' : 'false');
          activeId = machine.id;
          syncUrl();
        });
        card.playBtn = b;
        host.appendChild(b);
      } else if (ctrl.type === 'step') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn sec btn-step';
        b.textContent = ctrl.label || 'Шаг';
        b.addEventListener('click', () => {
          machine.step(st);
          activeId = machine.id;
          syncUrl();
        });
        host.appendChild(b);
      } else if (ctrl.type === 'action') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn sec';
        b.textContent = ctrl.label;
        b.addEventListener('click', () => {
          ctrl.run(st);
          activeId = machine.id;
          syncUrl();
        });
        b._ctrl = ctrl;
        card.actions.push(b);
        host.appendChild(b);
      } else if (ctrl.type === 'chips') {
        const box = document.createElement('div');
        box.className = 'chips';
        box._ctrl = ctrl;
        ctrl.options.forEach(opt => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip';
          b.textContent = opt.label;
          b.dataset.part = opt.id;
          if (st[ctrl.key] === opt.id) b.classList.add('on');
          b.addEventListener('click', () => {
            st[ctrl.key] = opt.id;
            if (ctrl.key === 'part' && machine.setPart) machine.setPart(st, opt.id);
            box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.part === opt.id));
            if (ctrl.key === 'part' || ctrl.key === 'model') {
              card.viewer.setView(machine.view);
              card.viewer.resetCam();
            }
            activeId = machine.id;
            syncUrl();
          });
          box.appendChild(b);
        });
        card.chipBoxes.push(box);
        host.appendChild(box);
      } else if (ctrl.type === 'slider') {
        const wrap = document.createElement('div');
        wrap.className = 'slider';
        wrap._ctrl = ctrl;
        const lab = document.createElement('label');
        const name = document.createElement('span');
        name.textContent = ctrl.label;
        const out = document.createElement('output');
        out.textContent = sliderText(st[ctrl.key], ctrl);
        lab.appendChild(name);
        lab.appendChild(out);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(ctrl.min);
        input.max = String(ctrl.max);
        input.step = String(ctrl.step);
        input.value = String(st[ctrl.key]);
        input.setAttribute('aria-label', ctrl.label);
        input.addEventListener('input', () => {
          st[ctrl.key] = Number(input.value);
          out.textContent = sliderText(st[ctrl.key], ctrl);
          activeId = machine.id;
        });
        input.addEventListener('change', syncUrl);
        wrap.appendChild(lab);
        wrap.appendChild(input);
        card.sliders.push({ wrap: wrap, out: out, input: input, ctrl: ctrl });
        host.appendChild(wrap);
      }
    });
  }
  function sliderText(v, ctrl) {
    const n = Number(v);
    const text = (Math.abs(n - Math.round(n)) < 1e-6) ? String(Math.round(n)) : String(Math.round(n * 100) / 100).replace('.', ',');
    return ctrl.unit ? text + ' ' + ctrl.unit : text;
  }

  function makeCard(machine) {
    const st = machine.init();
    if (window.PVMotion && !PVMotion.autoplay()) st.playing = false;
    if (params.get('m') === machine.id) {
      const part = params.get('part');
      if (part && machine.setPart) machine.setPart(st, part);
      if (params.has('step')) machine.setStep(st, parseInt(params.get('step'), 10) || 1);
      if (params.get('view') === 'real') st.model = 'real';
      const repr = params.get('repr');
      if (repr === 'trace' || repr === 'cartoon' || repr === 'surface') st.repr = repr;
      if (params.get('mem') === '1') st.membrane = 'on';
    }
    const art = document.createElement('article');
    art.className = 'card';
    art.id = 'm-' + machine.id;
    art.dataset.machine = machine.id;
    art.innerHTML = '<header class="card-h"><div class="kicker"></div><h2></h2><p class="sub"></p></header>'
      + '<div class="card-body"><div><div class="stage" data-pose="0,0,0" data-step="1"><div class="viewer"></div>'
      + '<button type="button" class="cam">Камера</button></div><div class="legend"></div><div class="controls"></div><p class="readout"></p></div>'
      + '<div><canvas class="chart"></canvas><div class="explain"></div><h3>Статьи</h3><ol class="refs"></ol>'
      + '<button type="button" class="btn sec share-btn">Ссылка и QR</button></div></div>';
    art.querySelector('.kicker').textContent = machine.kicker;
    art.querySelector('h2').textContent = machine.title;
    art.querySelector('.sub').textContent = machine.subtitle;
    art.querySelector('.explain').innerHTML = machine.explain;
    const refs = art.querySelector('.refs');
    machine.refs.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      refs.appendChild(li);
    });
    renderLegend(art.querySelector('.legend'), machine.legend);
    const stage = art.querySelector('.stage');
    const viewerEl = art.querySelector('.viewer');
    const card = {
      machine: machine,
      state: st,
      art: art,
      stage: stage,
      viewer: null,
      canvas: art.querySelector('.chart'),
      readout: art.querySelector('.readout'),
      controlsEl: art.querySelector('.controls'),
      sliders: [],
      actions: [],
      chipBoxes: [],
      sig: ''
    };
    card.viewer = new MM.Viewer(viewerEl);
    card.viewer.setView(machine.view);
    buildControls(card);
    const tidyName = { rotaxane: 'shuttle', catenane: 'catenane', muscle: 'muscle' }[machine.id];
    if (tidyName && window.SupraFF && MM.builds.rest) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn sec';
      b.textContent = '⚡ Минимизировать покой';
      b.title = 'Силовое поле только для покоя. Дальше фрагменты едут жёстко, как раньше.';
      b.addEventListener('click', () => {
        const rig = MM.builds.rest(tidyName);
        if (!rig || !rig.base) return;
        const mol = {
          atoms: rig.base.map((p, i) => ({ el: (rig.atoms[i] && rig.atoms[i].elem) || 'C', x: p[0], y: p[1], z: p[2] })),
          bonds: rig.bonds.map(bd => ({ i: bd.a, j: bd.b, order: bd.order || 1 }))
        };
        const res = window.SupraFF.minimize(mol, { steps: 36, kPos: 50, maxMove: 0.2 });
        res.coords.forEach((c, i) => { rig.base[i][0] = c[0]; rig.base[i][1] = c[1]; rig.base[i][2] = c[2]; });
        b.textContent = 'E ' + res.energy0.toFixed(0) + ' → ' + res.energy1.toFixed(0) + ' ккал/моль';
      });
      card.controlsEl.appendChild(b);
    }
    art.querySelector('.cam').addEventListener('click', () => {
      card.viewer.setView(machine.view);
      card.viewer.resetCam();
    });
    art.querySelector('.share-btn').addEventListener('click', () => openShare(machine, st));
    art.addEventListener('pointerdown', () => { activeId = machine.id; });
    return card;
  }

  const dlg = document.getElementById('share');
  function openShare(machine, state) {
    activeId = machine.id;
    syncUrl();
    const href = urlFor(machine, state);
    $('#share-title').textContent = machine.title;
    const input = $('#share-url');
    input.value = href;
    MM.drawQR($('#qr'), href);
    $('#share-open').href = href;
    if (dlg.showModal) {
      if (!dlg.open) dlg.showModal();
    } else dlg.setAttribute('open', '');
  }
  $('#share-close').addEventListener('click', () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
  $('#share-copy').addEventListener('click', async () => {
    const text = $('#share-url').value;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      const input = $('#share-url');
      input.focus();
      input.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    }
    $('#share-copy').textContent = ok ? 'Скопировано' : 'Выделите ссылку';
    setTimeout(() => { $('#share-copy').textContent = 'Копировать'; }, 1600);
  });
  $('#theme').addEventListener('click', () => {
    const next = themeExplicit() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('mm-theme', next); } catch (e) { /* ignore */ }
    $('#theme').textContent = next === 'dark' ? 'Светлая' : 'Тёмная';
    cards.forEach(c => { c.viewer.setBg(MM.viewerBg()); c.viewer.viewer && c.viewer.viewer.render(); });
  });
  $('#theme').textContent = themeExplicit() === 'dark' ? 'Светлая' : 'Тёмная';

  const list = document.getElementById('list');
  const toc = document.getElementById('toc');
  MM.machines.forEach(machine => {
    const a = document.createElement('a');
    a.href = '#m-' + machine.id;
    a.textContent = machine.title;
    a.dataset.m = machine.id;
    a.addEventListener('click', () => { activeId = machine.id; syncUrl(); });
    toc.appendChild(a);
    const card = makeCard(machine);
    cards.push(card);
    list.appendChild(card.art);
  });

  function paint(card) {
    const machine = card.machine;
    const st = card.state;
    let scene = null;
    try { scene = machine.scene(st); }
    catch (e) {
      if (!card._sceneErr) { card._sceneErr = true; console.error(e); }
      return;
    }
    card.viewer.setBg(MM.viewerBg());
    const wantReal = st.model === 'real' && (st.part === 'atp' || st.part === 'flag') && window.MMReal;
    let move = null;
    try {
      if (wantReal) {
        if (card._realKey !== st.part) {
          card._realKey = st.part;
          card.viewer.dropModels();
        }
        window.MMReal.show(card, st);
      } else {
        if (card._realKey) { card.viewer.dropModels(); card._realKey = ''; }
        move = card.viewer.draw(scene);
      }
    } catch (e) {
      if (!card._drawErr) { card._drawErr = true; console.error(e); }
    }
    const pose = wantReal && card.stage.dataset.rotor
      ? card.stage.dataset.rotor
      : (move ? move.map(v => v.toFixed(3)).join(',') : card.stage.dataset.pose || '0,0,0');
    if (!wantReal) card.stage.dataset.pose = pose;
    card.stage.dataset.step = String(machine.stepOf(st));
    card.stage.dataset.part = machine.partOf(st) || '';
    try { MM.drawChart(card.canvas, machine.chart(st)); }
    catch (e) {
      if (!card._chartErr) { card._chartErr = true; console.error(e); }
    }
    const html = machine.readout(st);
    if (card._html !== html) { card._html = html; card.readout.innerHTML = html; }
    card.actions.forEach(b => {
      const ctrl = b._ctrl;
      const show = !ctrl.when || ctrl.when(st);
      b.classList.toggle('hidden', !show);
      if (ctrl.on) b.classList.toggle('on', !!ctrl.on(st));
    });
    card.sliders.forEach(s => {
      const show = !s.ctrl.when || s.ctrl.when(st);
      s.wrap.classList.toggle('hidden', !show);
    });
    card.chipBoxes.forEach(box => {
      const ctrl = box._ctrl;
      const show = !ctrl.when || ctrl.when(st);
      box.classList.toggle('hidden', !show);
      box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.part === String(st[ctrl.key])));
    });
    const sig = machine.stepOf(st) + '|' + (machine.partOf(st) || '');
    if (card.sig !== sig) {
      card.sig = sig;
      if (machine.id === activeId) syncUrl();
      const link = toc.querySelector('[data-m="' + machine.id + '"]');
      if (link && machine.id === activeId) {
        toc.querySelectorAll('a').forEach(x => x.classList.toggle('on', x === link));
      }
    }
  }

  function onScreen(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -120 && r.top < window.innerHeight + 120 && r.width > 0;
  }
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const live = onScreen(card.art);
      if (!live && card._drew) continue;
      if (live) {
        try { card.machine.tick(card.state, dt); }
        catch (e) {
          if (!card._tickErr) { card._tickErr = true; console.error(e); }
        }
      }
      paint(card);
      card._drew = true;
    }
    requestAnimationFrame(frame);
  }

  const want = document.getElementById('m-' + (params.get('m') || ''));
  if (want) want.scrollIntoView({ block: 'start' });
  window.addEventListener('resize', () => cards.forEach(c => c.viewer.resize()));
  requestAnimationFrame(frame);
  window.__MM = { cards: cards, MM: MM };
})();
