/* Страница «Симметрия»: точечные группы, ячейка, свойства, квизы. */
(function () {
  'use strict';
  const SYM = window.SYM;
  const $ = id => document.getElementById(id);
  const app = $('app');
  const EXAMPLES = {
    2: [{ name: 'органические кристаллы', note: 'P1̄ часто встречается у молекул' }],
    14: [{ name: 'самая частая группа органики', note: 'P2₁/c' }],
    15: [{ name: 'C2/c', note: 'тоже очень частая' }],
    19: [{ name: 'хиральные органические кристаллы', note: 'P2₁2₁2₁' }],
    62: [{ name: 'оливин и многие неорганические' }],
    136: [{ name: 'рутил TiO₂', note: 'P4₂/mnm' }],
    152: [{ name: 'α-кварц', cod: '1011097', entry: 'Кристаллы/quartz', note: 'пьезоэлектрик' }],
    167: [{ name: 'кальцит CaCO₃', note: 'R3̄c, гексагональные оси' }],
    186: [{ name: 'графит этого каталога', cod: '9008569', entry: 'Кристаллы/graphite', note: 'в файле COD группа P6₃mc' }],
    194: [{ name: 'лёд Ih и идеальный графит', note: 'P6₃/mmc' }],
    221: [{ name: 'CsCl, перовскит', note: 'Pm3̄m' }],
    225: [{ name: 'NaCl, галит', cod: '1000041', entry: 'Кристаллы/nacl' }],
    227: [{ name: 'алмаз', cod: '9008564', entry: 'Кристаллы/diamond', note: 'Fd3̄m, выбор начала 1' }]
  };

  const q = new URLSearchParams(location.search);
  const state = {
    tab: q.get('tab') || (q.get('quiz') ? 'quiz' : q.get('sg') ? 'sg' : 'pg'),
    pg: q.get('pg') || 'C2v',
    mol: q.get('mol') || 'H2O',
    op: q.get('op') || '',
    sg: Number(q.get('sg') || 14),
    showEl: false,
    labels: true,
    flow: null,
    quiz: null,
    qi: 0,
    answers: [],
    streak: 0,
    locked: false,
    timer: q.get('timer') ? Number(q.get('timer')) : 0
  };
  if (!SYM.pg(state.pg)) state.pg = 'C2v';
  if (!SYM.mol(state.mol)) state.mol = (SYM.molecules.find(m => m.pg === state.pg) || SYM.molecules[0]).id;
  else if (q.get('mol') && SYM.mol(state.mol).pg) state.pg = SYM.mol(state.mol).pg;

  let pgStage = null, sgStage = null, propStage = null, quizStage = null;
  let sgCache = null, sgDesc = null;

  function tex(node, formula) {
    if (!node) return;
    if (window.katex) window.katex.render(formula, node, { throwOnError: false, displayMode: false });
    else node.textContent = formula;
  }
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  // карточка-свёртка: на телефоне теория закрыта, состояние помнится (общая оболочка assets/ui)
  function asFold(card, id, title, defOpen) {
    const key = 'ui-fold:symmetry:' + id;
    let saved = null;
    try { saved = localStorage.getItem(key); } catch (e) { /* приватный режим */ }
    const det = el('details', card.className + ' ui-fold');
    det.dataset.fold = id;
    det.open = saved === '1' || (saved == null && (defOpen || window.innerWidth > 820));
    const sum = el('summary', '', title);
    det.appendChild(sum);
    const body = el('div', 'ui-fold-body');
    Array.from(card.childNodes).forEach((k, i) => { if (!(i === 0 && k.tagName === 'H2')) body.appendChild(k); });
    det.appendChild(body);
    det.addEventListener('toggle', () => { try { localStorage.setItem(key, det.open ? '1' : '0'); } catch (e) { /* нет */ } });
    return det;
  }
  // длинный ряд чипов → выпадающий список на телефоне
  function chipSelect(box, label, onPick) {
    const s = el('select', 'big ui-narrow-only');
    s.setAttribute('aria-label', label);
    const items = Array.from(box.querySelectorAll('button'));
    items.forEach((b, i) => { const o = el('option'); o.value = String(i); o.textContent = b.textContent; if (b.classList.contains('on')) o.selected = true; s.appendChild(o); });
    s.onchange = () => { const b = items[Number(s.value)]; if (b) b.click(); if (onPick) onPick(); };
    box.classList.add('ui-wide-only');
    return s;
  }
  function btn(text, cls, fn) {
    const b = el('button', cls || 'chip'); b.type = 'button'; b.textContent = text; b.onclick = fn; return b;
  }
  function syncURL() {
    const p = new URLSearchParams();
    if (state.tab && state.tab !== 'pg') p.set('tab', state.tab);
    if (state.tab === 'pg' || state.tab === 'prop') {
      p.set('pg', state.pg); p.set('mol', state.mol);
      if (state.op) p.set('op', state.op);
    }
    if (state.tab === 'sg') p.set('sg', String(state.sg));
    if (state.tab === 'quiz' && state.quiz) {
      p.set('quiz', state.quiz.topics.join(','));
      p.set('n', String(state.quiz.n));
      p.set('seed', String(state.quiz.seed));
      p.set('lvl', String(state.quiz.lvl));
      if (state.timer) p.set('timer', String(state.timer));
    }
    const s = p.toString();
    history.replaceState(null, '', 'symmetry.html' + (s ? '?' + s : ''));
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    render();
    syncURL();
  }
  document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });

  function ensureStage(host, key) {
    if (!window.$3Dmol) { host.innerHTML = '<p class="warnbox">Не загрузился 3Dmol.js — проверьте сеть.</p>'; return null; }
    if (key === 'pg' && pgStage) return pgStage;
    if (key === 'sg' && sgStage) return sgStage;
    if (key === 'prop' && propStage) return propStage;
    if (key === 'quiz' && quizStage) return quizStage;
    const box = el('div', 'viewer');
    host.prepend(box);
    const st = new SYM.Stage(box);
    window.__symStage = st;
    if (key === 'pg') pgStage = st;
    if (key === 'sg') sgStage = st;
    if (key === 'prop') propStage = st;
    if (key === 'quiz') quizStage = st;
    return st;
  }

  function showMol(stage, mol, labels) {
    if (!stage || !mol) return;
    stage.setAtoms(mol.atoms, { labels: labels });
  }

  function renderPG() {
    const g = SYM.pg(state.pg);
    const mols = SYM.molecules.filter(m => m.pg === state.pg);
    if (!mols.some(m => m.id === state.mol)) state.mol = (mols[0] && mols[0].id) || state.mol;
    const mol = SYM.mol(state.mol) || SYM.motif(state.pg);
    const wrap = el('div', 'layout two ui-pane');
    const left = el('div', 'infocol');
    const right = el('div', 'sticky viewcol');
    const stageCard = el('div', 'card ui-stage symstage');
    stageCard.appendChild(el('h2', '', mol.name + ' · ' + mol.formula));
    const stageHost = el('div');
    stageCard.appendChild(stageHost);
    const viewCard = el('div', 'card symctl');
    const controls = el('div', 'controls');
    controls.appendChild(btn('▶ Операция', '', () => playCurrent(stage)));
    controls.appendChild(btn('Шаг', '', () => stepOp(stage, 1)));
    const bAll = btn(state.showEl ? 'Скрыть элементы' : 'Все элементы', state.showEl ? 'on' : '', () => {
      state.showEl = !state.showEl; render();
    });
    controls.appendChild(bAll);
    const bLab = btn(state.labels ? 'Номера вкл' : 'Номера', state.labels ? 'on' : '', () => { state.labels = !state.labels; render(); });
    controls.appendChild(bLab);
    viewCard.appendChild(controls);
    const opBox = el('div', 'chips');
    let ops = [];
    try { ops = SYM.operations(state.pg); } catch (e) { viewCard.appendChild(el('p', 'warnbox', e.message)); }
    ops.forEach((o, i) => {
      const b = btn(o.label, state.op === String(i) ? 'chip on' : 'chip', () => { state.op = String(i); playCurrent(stage); syncURL(); markOps(); });
      b.dataset.i = String(i);
      opBox.appendChild(b);
    });
    viewCard.appendChild(el('h3', '', 'Операции'));
    const opSel = chipSelect(opBox, 'Операция');
    viewCard.appendChild(opSel);
    viewCard.appendChild(opBox);
    right.append(stageCard, viewCard);

    const info = el('div', 'card');
    info.appendChild(el('h2', '', g.name + '  '));
    const sub = el('div');
    sub.appendChild(el('span', 'tag', 'порядок ' + (g.order === Infinity ? '∞' : g.order)));
    sub.appendChild(el('span', 'tag', g.hm));
    if (g.polar) sub.appendChild(el('span', 'tag', 'полярная'));
    if (g.chiral) sub.appendChild(el('span', 'tag', 'хиральная'));
    if (g.centrosym) sub.appendChild(el('span', 'tag', 'центр инверсии'));
    info.appendChild(sub);
    info.appendChild(el('p', 'muted', g.blurb || ''));
    const sel = el('select', 'big');
    SYM.groups.forEach(gr => {
      const o = el('option'); o.value = gr.id; o.textContent = gr.name + ' · ' + gr.id + (gr.order === Infinity ? '' : ' · ' + gr.order);
      if (gr.id === state.pg) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => { state.pg = sel.value; state.op = ''; const mm = SYM.molecules.find(m => m.pg === state.pg); state.mol = mm ? mm.id : state.mol; render(); syncURL(); };
    viewCard.insertBefore(sel, viewCard.firstChild);
    const mch = el('div', 'chips');
    (mols.length ? mols : [mol]).forEach(m => {
      mch.appendChild(btn(m.name, m.id === state.mol ? 'chip on' : 'chip', () => { state.mol = m.id; state.op = ''; render(); syncURL(); }));
    });
    if (!mols.length) info.appendChild(el('p', 'muted', 'Для этой группы показана учебная фигура общего положения.'));
    viewCard.insertBefore(mch, sel.nextSibling);
    info.appendChild(el('p', 'muted', mol.note || ''));
    info.appendChild(el('h3', '', 'Таблица характеров'));
    info.appendChild(charTable(g));
    const formula = el('p');
    tex(formula, 'n_i=\\frac{1}{|G|}\\sum_g \\chi(g)\\,\\chi_i(g)');
    info.appendChild(formula);
    left.appendChild(asFold(info, 'pg-info', g.name + ' — таблица характеров', true));
    const flow = flowCard();
    left.appendChild(asFold(flow, 'pg-flow', 'Как узнать группу'));
    wrap.append(left, right);
    app.appendChild(wrap);
    const stage = ensureStage(stageHost, 'pg');
    if (stage) {
      showMol(stage, mol, state.labels);
      if (state.showEl) { try { stage.showLoci(SYM.loci(state.pg)); } catch (e) { /* модель важнее */ } }
      stage.viewer.resize();
      stage.viewer.render();
    }
    function markOps() {
      opBox.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.i === state.op));
      if (state.op !== '') opSel.value = state.op;
    }
    function currentOp() {
      const i = state.op === '' ? 1 : Number(state.op);
      return ops[i] || ops.find(o => o.kind !== 'E') || ops[0];
    }
    function playCurrent(st) {
      const o = currentOp();
      if (!st || !o) return;
      state.op = String(ops.indexOf(o));
      markOps();
      syncURL();
      if (state.showEl) st.showLoci(SYM.loci(state.pg));
      st.animateOp(o, 1200);
    }
    function stepOp(st, dir) {
      let i = state.op === '' ? 0 : Number(state.op);
      i = (i + dir + ops.length) % ops.length;
      state.op = String(i);
      playCurrent(st);
    }
    window.__pgPlay = () => playCurrent(stage);
  }

  function charTable(g) {
    const wrap = el('div', 'tablewrap');
    const t = el('table', 'ct');
    const hr = el('tr');
    hr.appendChild(el('th', 'name', g.name));
    g.classes.forEach(c => hr.appendChild(el('th', '', c.label)));
    hr.appendChild(el('th', '', 'базис'));
    t.appendChild(hr);
    g.irreps.forEach(ir => {
      const tr = el('tr');
      tr.appendChild(el('td', 'name', ir.name));
      ir.chi.forEach(v => {
        const s = typeof v === 'number' ? (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(3)) : String(v);
        tr.appendChild(el('td', '', s));
      });
      const basis = [ir.lin, ir.rot, ir.quad].filter(Boolean).join('; ');
      tr.appendChild(el('td', '', basis));
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  function flowCard() {
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Как узнать группу'));
    card.appendChild(el('p', 'muted', 'Короткое дерево решений. Отвечайте про свою молекулу — в конце откроется группа.'));
    const box = el('div');
    card.appendChild(box);
    let node = 'lin', n = 2, crumbs = [];
    function draw() {
      box.innerHTML = '';
      if (crumbs.length) box.appendChild(el('div', 'crumbs', crumbs.join(' → ')));
      if (SYM.pg(node)) {
        const id = node;
        const g = SYM.pg(id);
        box.appendChild(el('div', 'flowq', 'Группа ' + (g ? g.name : id)));
        if (g) box.appendChild(el('p', '', g.blurb || ''));
        box.appendChild(btn('Открыть группу', 'btn primary', () => { state.pg = id; state.op = ''; setTab('pg'); }));
        box.appendChild(btn('Сначала', 'btn sec', () => { node = 'lin'; n = 2; crumbs = []; draw(); }));
        return;
      }
      const fams = { Dnh: 1, Dnd: 1, Dn: 1, Cnh: 1, Cnv: 1, Cn: 1, Sn: 1 };
      if (fams[node]) {
        const id = SYM.familyId(node, n);
        const g = id && SYM.pg(id);
        box.appendChild(el('div', 'flowq', g ? ('Группа ' + g.name) : ('Семейство ' + node + ', n = ' + n)));
        if (g) box.appendChild(el('p', '', g.blurb || ''));
        else box.appendChild(el('p', 'muted', 'Для этого n отдельной карточки нет — откройте ближайшую Cₙ или Dₙ.'));
        if (g) box.appendChild(btn('Открыть', 'btn primary', () => { state.pg = g.id; setTab('pg'); }));
        box.appendChild(btn('Сначала', 'btn sec', () => { node = 'lin'; crumbs = []; draw(); }));
        return;
      }
      const spec = SYM.flow.nodes[node];
      if (!spec) return;
      if (spec.goto) { n = spec.n; node = spec.goto; draw(); return; }
      box.appendChild(el('div', 'flowq', spec.q));
      if (spec.choices) {
        spec.choices.forEach(ch => {
          box.appendChild(btn(ch.t, 'choice', () => { crumbs.push(ch.t); node = ch.next; draw(); }));
        });
      } else {
        box.appendChild(btn('Да', 'choice', () => { crumbs.push('да'); node = spec.yes; draw(); }));
        box.appendChild(btn('Нет', 'choice', () => { crumbs.push('нет'); node = spec.no; draw(); }));
      }
    }
    draw();
    return card;
  }

  function loadSG(n) {
    if (sgCache && sgCache.n === n) return sgCache;
    const g = SYM.hall.get(n);
    const ops = SYM.hall.opsOf(n);
    const desc = SYM.hall.describe(n);
    sgCache = { n, g, ops, desc };
    sgDesc = desc;
    return sgCache;
  }

  function renderSG() {
    const pack = loadSG(state.sg);
    const g = pack.g;
    const wrap = el('div', 'layout two ui-pane');
    const left = el('div', 'infocol');
    const right = el('div', 'sticky viewcol');
    const searchCard = el('div', 'card');
    searchCard.appendChild(el('h2', '', '230 пространственных групп'));
    const inp = el('input', 'search'); inp.placeholder = 'Номер, Fm-3m, P21/c, кварц…';
    searchCard.appendChild(inp);
    const list = el('div');
    searchCard.appendChild(list);
    left.appendChild(searchCard);

    const info = el('div', 'card');
    const sym = SYM.hall.prettyHM(g.hm);
    const full = SYM.hall.prettyFull(g.hm);
    info.appendChild(el('h2', '', g.n + '  ' + sym));
    info.appendChild(el('p', '', 'Полный символ: ' + full));
    info.appendChild(el('p', 'mono', 'Холл: ' + g.hall));
    const meta = el('div');
    [['Сингония', SYM.hall.SYS_RU[g.sys]], ['Решётка', SYM.hall.LAT_RU[g.lat] || g.lat], ['Точечная группа', g.pg], ['Класс Лауэ', g.laue], ['Порядок / кратность', String(pack.ops.length)], ['Центросимметричная', g.centro ? 'да' : 'нет'], ['Энантиоморфная', g.enantio ? 'да' : 'нет']].forEach(([k, v]) => {
      const p = el('div', 'step'); p.innerHTML = '<b>' + k + '.</b> ' + v; meta.appendChild(p);
    });
    if (g.ext === 'H') meta.appendChild(el('p', 'muted', 'Ромбоэдрическая группа в гексагональных осях: три центрирующих переноса.'));
    if (g.ext === '1' || g.ext === '2') meta.appendChild(el('p', 'muted', 'Выбор начала координат ' + g.ext + '.'));
    info.appendChild(meta);
    info.appendChild(el('h3', '', 'Общая позиция Вайкова'));
    const wyk = el('div', 'wyck mono');
    const lines = pack.ops.map(SYM.hall.triplet);
    wyk.textContent = lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n… ещё ' + (lines.length - 40) : '');
    info.appendChild(wyk);
    const ex = EXAMPLES[g.n] || [];
    if (ex.length) {
      info.appendChild(el('h3', '', 'Примеры'));
      ex.forEach(e => {
        const p = el('p', '');
        p.appendChild(document.createTextNode(e.name + (e.note ? ' — ' + e.note + '. ' : '. ')));
        if (e.cod) {
          const a = el('a'); a.href = './?cod=' + e.cod; a.textContent = 'COD ' + e.cod + ' в просмотрщике';
          p.appendChild(a);
        }
        if (e.entry) {
          p.appendChild(document.createTextNode(' · '));
          const a2 = el('a'); a2.href = './?e=' + encodeURIComponent(e.entry); a2.textContent = 'каталог';
          p.appendChild(a2);
        }
        info.appendChild(p);
      });
    }
    left.appendChild(asFold(info, 'sg-info', g.n + '  ' + sym + ' — символы и позиции'));

    const stageCard = el('div', 'card ui-stage symstage');
    stageCard.appendChild(el('h2', '', g.n + '  ' + sym + ' · ячейка и операция'));
    const host = el('div');
    stageCard.appendChild(host);
    const viewCard = el('div', 'card symctl');
    const controls = el('div', 'controls');
    const types = [];
    const seenT = {};
    pack.desc.forEach(d => {
      const k = d.kind + ' ' + d.label;
      if (!seenT[k]) { seenT[k] = d; types.push(d); }
    });
    let cur = types.find(d => d.kind !== 'id') || types[0];
    const sel = el('select', 'big');
    types.forEach((d, i) => {
      const o = el('option');
      const count = pack.desc.filter(x => x.kind === d.kind && x.label === d.label).length;
      o.value = String(i); o.textContent = d.label + ' · ' + kindRu(d.kind) + ' ×' + count;
      sel.appendChild(o);
    });
    sel.onchange = () => { cur = types[Number(sel.value)]; };
    viewCard.appendChild(sel);
    controls.appendChild(btn('▶ Анимация', '', () => {
      const st = ensureStage(host, 'sg');
      if (st) st.animateSpaceOp(cur, 1500);
    }));
    controls.appendChild(btn('Элементы', '', () => {
      const st = ensureStage(host, 'sg');
      if (st) st.showSpaceElements(pack.desc, { limit: 18 });
    }));
    viewCard.appendChild(controls);
    viewCard.appendChild(el('p', 'muted', 'Мотив общего положения размножен всеми операциями, включая центрировку. Винтовые оси и плоскости скольжения анимируются в два приёма: поворот или отражение, затем сдвиг.'));
    right.append(stageCard, viewCard);
    wrap.append(left, right);
    app.appendChild(wrap);

    function paintList() {
      const query = inp.value.trim().toLowerCase().replace(/₃/g, '3').replace(/₁/g, '1').replace(/₂/g, '2').replace(/₄/g, '4').replace(/₆/g, '6').replace(/₅/g, '5');
      list.innerHTML = '';
      const systems = ['triclinic', 'monoclinic', 'orthorhombic', 'tetragonal', 'trigonal', 'hexagonal', 'cubic'];
      systems.forEach(sys => {
        const groups = SYM.hall.table().filter(gr => gr.sys === sys).filter(gr => {
          if (!query) return true;
          const blob = (gr.n + ' ' + gr.hm + ' ' + SYM.hall.prettyHM(gr.hm) + ' ' + gr.pg + ' ' + gr.hall + ' ' + SYM.hall.SYS_RU[gr.sys]).toLowerCase();
          return blob.replace(/\s/g, '').indexOf(query.replace(/\s/g, '')) >= 0 || blob.indexOf(query) >= 0;
        });
        if (!groups.length) return;
        const det = el('details', 'sys');
        if (query || sys === g.sys) det.open = true;
        det.appendChild(el('summary', '', SYM.hall.SYS_RU[sys] + ' · ' + groups.length));
        const box = el('div', 'sglist');
        groups.forEach(gr => {
          box.appendChild(btn(gr.n + '  ' + SYM.hall.prettyHM(gr.hm), gr.n === state.sg ? 'on' : '', () => {
            state.sg = gr.n; sgCache = null; render(); syncURL();
          }));
        });
        det.appendChild(box);
        list.appendChild(det);
      });
    }
    inp.oninput = paintList;
    paintList();
    const stage = ensureStage(host, 'sg');
    if (stage) {
      stage.showSpaceGroup(g);
      stage.viewer.resize();
    }
  }
  function kindRu(k) {
    return { id: 'тождество', cen: 'центрировка', rot: 'поворот', screw: 'винтовая ось', mirror: 'зеркало', glide: 'скольжение', inv: 'инверсия', sn: 'инверсионная ось' }[k] || k;
  }

  function renderProp() {
    const wrap = el('div');
    wrap.appendChild(cardPolar());
    wrap.appendChild(cardChiral());
    wrap.appendChild(cardVib());
    wrap.appendChild(cardNmr());
    wrap.appendChild(cardField());
    wrap.appendChild(cardSALC());
    wrap.appendChild(cardPiezo());
    wrap.appendChild(cardAbs());
    app.appendChild(wrap);
  }
  function cardPolar() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Дипольный момент'));
    const f = el('p'); tex(f, '\\text{полярны только } C_1,\\ C_s,\\ C_n,\\ C_{nv},\\ C_{\\infty v}');
    c.appendChild(f);
    c.appendChild(el('p', '', 'Диполь разрешён, только если все операции оставляют одно направление неизменным. Сравните линейные CO₂ и SO₂ и тетраэдры CCl₄ и CHCl₃.'));
    const box = el('div', 'chips');
    [['CO2', 'CO₂ неполярный'], ['SO2', 'SO₂ полярный'], ['CCl4', 'CCl₄ неполярный'], ['CHCl3', 'CHCl₃ полярный']].forEach(([id, t]) => {
      box.appendChild(btn(t, '', () => { state.pg = SYM.mol(id).pg; state.mol = id; setTab('pg'); }));
    });
    c.appendChild(box);
    return c;
  }
  function cardChiral() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Хиральность и оптическая активность'));
    c.appendChild(el('p', '', 'Молекула хиральна, если в группе нет несобственных осей Sₙ. Зеркало — это S₁, инверсия — S₂. Хиральные группы: Cₙ, Dₙ, T, O, I.'));
    const box = el('div', 'chips');
    [['CHFClBr', 'CHFClBr, C₁'], ['H2O2', 'H₂O₂, C₂'], ['pentadiene', 'пентадиен, C₂'], ['Coen3', '[Co(en)₃]³⁺, D₃']].forEach(([id, t]) => {
      box.appendChild(btn(t, '', () => { state.mol = id; state.pg = SYM.mol(id).pg; setTab('pg'); }));
    });
    c.appendChild(box);
    return c;
  }
  function cardVib() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'ИК и КР по таблице характеров'));
    const f = el('p'); tex(f, '\\Gamma_{vib}=\\Gamma_{3N}-\\Gamma_{trans}-\\Gamma_{rot},\\quad 3N-6');
    c.appendChild(f);
    c.appendChild(el('p', '', 'Колебание активно в ИК, если его представление содержит x, y или z, и в КР — если содержит квадратичную форму. У центросимметричной молекулы одно и то же колебание не бывает активным сразу в обоих спектрах.'));
    const host = el('div');
    c.appendChild(host);
    const mol = SYM.mol('H2O');
    const vib = SYM.vib('H2O');
    const stage = ensureStage(host, 'prop');
    if (stage) { showMol(stage, mol, true); stage.viewer.zoomTo(); stage.viewer.render(); }
    c.appendChild(el('h3', '', 'Вода, шаг за шагом'));
    c.appendChild(el('p', 'mono', 'Γ₃N = (' + vib.gamma3N.join(', ') + ') по классам E, C₂, σᵥ(xz), σᵥ′(yz)'));
    c.appendChild(el('p', 'mono', 'Γtrans = (' + vib.gammaT.join(', ') + '),  Γrot = (' + vib.gammaR.join(', ') + ')'));
    c.appendChild(el('p', 'mono', 'Γvib = (' + vib.gammaV.map(v => Math.round(v)).join(', ') + ') → ' + vib.parts.filter(p => p.n).map(p => p.n + p.name).join(' + ')));
    c.appendChild(el('p', '', 'Оба A₁ и B₂ содержат дипольные координаты, поэтому все три колебания активны и в ИК, и в КР. У CO₂ центр инверсии разводит их по разным спектрам.'));
    const modes = SYM.modesOf(mol);
    const box = el('div', 'chips');
    modes.forEach(mode => {
      box.appendChild(btn(mode.name, '', () => {
        if (!stage) return;
        const base = mol.atoms.map(a => a.pos.slice());
        stage.base = base;
        stage.play(t => {
          const w = Math.sin(t * Math.PI * 2);
          return base.map((p, i) => {
            const d = mode.vec[i] || [0, 0, 0];
            return [p[0] + d[0] * 0.18 * w, p[1] + d[1] * 0.18 * w, p[2] + d[2] * 0.18 * w];
          });
        }, 1600, () => stage.restore());
      }));
    });
    c.appendChild(box);
    c.appendChild(btn('Открыть CO₂', 'btn sec', () => { state.mol = 'CO2'; state.pg = 'Dinfh'; setTab('pg'); }));
    c.appendChild(btn('Метан Td', 'btn sec', () => { state.mol = 'CH4'; state.pg = 'Td'; setTab('pg'); }));
    return c;
  }
  function cardNmr() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Сигналы ЯМР'));
    c.appendChild(el('p', '', 'Число сигналов равно числу орбит эквивалентных атомов. Группа переставляет атомы, и ядра одной орбиты неразличимы.'));
    const sel = el('select', 'big');
    SYM.molecules.forEach(m => { const o = el('option'); o.value = m.id; o.textContent = m.name; sel.appendChild(o); });
    const out = el('div');
    function paint() {
      out.innerHTML = '';
      SYM.nmr(sel.value).forEach(r => out.appendChild(el('p', '', r.el + ': ' + r.signals + ' сигнал(ов), размеры орбит ' + r.orbits.map(o => o.length).join(', '))));
    }
    sel.onchange = paint; paint();
    c.appendChild(sel); c.appendChild(out);
    return c;
  }
  function cardField() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Расщепление d-орбиталей'));
    const f = el('p'); tex(f, '\\Delta_t \\approx \\tfrac{4}{9}\\Delta_o');
    c.appendChild(f);
    c.appendChild(el('p', '', 'В октаэдре t₂g ниже e_g. В тетраэдре картина перевёрнута и уже: e ниже t₂. В вытянутом D₄ₕ октаэдр дополнительно расщепляется.'));
    const modes = el('div', 'chips');
    let mode = 'Oh';
    const fig = el('div', 'levels');
    function paint() {
      fig.innerHTML = '';
      const sets = mode === 'Oh'
        ? [['dxy, dxz, dyz', 't₂g', 46, '#60a5fa'], ['dx²−y², dz²', 'e_g', 110, '#f87171']]
        : mode === 'Td'
          ? [['dz², dx²−y²', 'e', 40, '#60a5fa'], ['dxy, dxz, dyz', 't₂', 78, '#f87171']]
          : [['dxz, dyz', 'e_g', 36, '#93c5fd'], ['dxy', 'b₂g', 62, '#60a5fa'], ['dz²', 'a₁g', 96, '#fb923c'], ['dx²−y²', 'b₁g', 130, '#f87171']];
      sets.forEach(s => {
        const col = el('div', 'col');
        const bar = el('div', 'bar'); bar.style.height = s[2] + 'px'; bar.style.background = s[3];
        col.appendChild(bar);
        col.appendChild(el('div', '', s[1]));
        col.appendChild(el('div', '', s[0]));
        fig.appendChild(col);
      });
    }
    [['Oh', 'Октаэдр Oh'], ['Td', 'Тетраэдр Td'], ['D4h', 'D₄ₕ']].forEach(([id, t]) => {
      modes.appendChild(btn(t, mode === id ? 'chip on' : 'chip', () => { mode = id; modes.querySelectorAll('button').forEach(b => b.classList.remove('on')); paint(); }));
    });
    c.appendChild(modes); c.appendChild(fig); paint();
    return c;
  }
  function cardSALC() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Орбитали и SALC'));
    c.appendChild(el('p', '', 'Связь разрешена, только если орбиталь центра и комбинация лигандов преобразуются одинаково. У воды 2s и 2p_z кислорода — A₁, 2p_y — B₂, 2p_x — B₁. Два атома H дают SALC A₁ (в фазе) и B₂ (в противофазе). B₁ на водородах не появляется, поэтому 2p_x остаётся неподелённой парой.'));
    const box = el('div', 'chips');
    [['A₁', '2s, 2p_z и симметричная SALC H'], ['B₂', '2p_y и антисимметричная SALC H'], ['B₁', '2p_x, пары на H нет']].forEach(([k, t]) => {
      box.appendChild(btn(k, '', () => { note.textContent = t; }));
    });
    const note = el('p', ''); note.textContent = 'Нажмите представление.';
    c.appendChild(box); c.appendChild(note);
    return c;
  }
  function cardPiezo() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Пьезо, пиро и ГВГ'));
    c.appendChild(el('p', '', 'Кристалл без центра инверсии может давать вторую гармонику. Пьезоэффект есть у всех нецентросимметричных групп, кроме 432. Пироэлектрики — только полярные: 1, 2, 3, 4, 6, m, mm2, 3m, 4mm, 6mm. Кварц P3₁21 (№ 152) нецентросимметричен и пьезоэлектричен, но не полярен.'));
    c.appendChild(btn('Открыть кварц, группа 152', 'btn primary', () => { state.sg = 152; setTab('sg'); }));
    return c;
  }
  function cardAbs() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Систематические погасания'));
    c.appendChild(el('p', '', 'Рефлекс hkl гаснет, если для операции, оставляющей индексы на месте, фаза 2πh·t не кратна 2π. У P2₁/c гаснут 0k0 при нечётном k и h0l при нечётном l.'));
    const line = el('div', 'grid2');
    const sel = el('select', 'big');
    [14, 19, 2, 225, 227, 152, 194].forEach(n => {
      const g = SYM.hall.get(n);
      const o = el('option'); o.value = String(n); o.textContent = n + ' ' + SYM.hall.prettyHM(g.hm); sel.appendChild(o);
    });
    const inputs = ['h', 'k', 'l'].map(name => {
      const i = document.createElement('input'); i.className = 'search'; i.inputMode = 'numeric'; i.value = name === 'k' ? '1' : '0'; i.placeholder = name; return i;
    });
    const out = el('p', '');
    function paint() {
      const g = SYM.hall.get(Number(sel.value));
      const hkl = inputs.map(i => parseInt(i.value, 10) || 0);
      const abs = SYM.hall.systematicallyAbsent(g, hkl);
      out.className = abs ? 'bad' : 'ok';
      out.textContent = hkl.join(' ') + (abs ? ' — погасает' : ' — может наблюдаться') + ' в ' + SYM.hall.prettyHM(g.hm);
    }
    sel.onchange = paint; inputs.forEach(i => { i.oninput = paint; line.appendChild(i); });
    c.appendChild(sel); c.appendChild(line); c.appendChild(out);
    const samples = el('div', 'chips');
    [[0, 1, 0], [0, 2, 0], [1, 0, 1], [1, 1, 1]].forEach(h => {
      samples.appendChild(btn(h.join(''), '', () => { inputs[0].value = h[0]; inputs[1].value = h[1]; inputs[2].value = h[2]; paint(); }));
    });
    c.appendChild(samples); paint();
    return c;
  }

  function renderQuiz() {
    if (!state.quiz) { app.appendChild(quizSetup()); return; }
    if (state.qi >= state.quiz.questions.length) { app.appendChild(quizResult()); return; }
    app.appendChild(quizQuestion());
  }
  function quizSetup() {
    const c = el('div', 'card');
    c.appendChild(el('h2', '', 'Квиз'));
    c.appendChild(el('p', 'muted', 'Одинаковая ссылка с зерном даёт всем ученикам один набор. Прогресс этого телефона хранится локально.'));
    const topics = [
      ['pg', 'Узнать группу'], ['count', 'Считать элементы'], ['op', 'Узнать операцию'],
      ['find', 'Найти элемент'], ['prop', 'Свойства'], ['sg', 'Пространственные']
    ];
    const box = el('div', 'chips');
    const on = new Set(['pg', 'count', 'prop']);
    topics.forEach(([id, t]) => {
      const b = btn(t, on.has(id) ? 'chip on' : 'chip', () => { b.classList.toggle('on'); if (on.has(id)) on.delete(id); else on.add(id); });
      b.dataset.t = id; box.appendChild(b);
    });
    c.appendChild(box);
    const nIn = document.createElement('input'); nIn.className = 'search'; nIn.value = '8'; nIn.inputMode = 'numeric';
    const seedIn = document.createElement('input'); seedIn.className = 'search'; seedIn.value = String(Math.floor(Math.random() * 9000 + 1000));
    const lvl = el('select', 'big');
    [['1', 'Уровень 1 — знакомые молекулы'], ['2', 'Уровень 2'], ['3', 'Уровень 3 — шире, включая все группы']].forEach(([v, t]) => { const o = el('option'); o.value = v; o.textContent = t; lvl.appendChild(o); });
    const tim = el('select', 'big');
    [['0', 'Без таймера'], ['20', '20 с на вопрос'], ['40', '40 с']].forEach(([v, t]) => { const o = el('option'); o.value = v; o.textContent = t; tim.appendChild(o); });
    c.appendChild(el('label', 'muted', 'Число вопросов')); c.appendChild(nIn);
    c.appendChild(el('label', 'muted', 'Зерно')); c.appendChild(seedIn);
    c.appendChild(lvl); c.appendChild(tim);
    const prog = SYM.quiz.loadProgress();
    c.appendChild(el('p', 'muted', 'На этом устройстве: верно ' + (prog.correct || 0) + ' из ' + (prog.answered || 0) + ', лучшая серия ' + (prog.streakBest || 0) + '.'));
    c.appendChild(btn('Начать', 'btn primary', () => {
      const topicsOn = [...box.querySelectorAll('button.on')].map(b => b.dataset.t);
      state.timer = Number(tim.value) || 0;
      state.quiz = SYM.quiz.buildQuiz({ quiz: topicsOn.join(',') || 'pg', n: Number(nIn.value) || 8, seed: Number(seedIn.value) || 1, lvl: Number(lvl.value) || 1 });
      state.qi = 0; state.answers = []; state.streak = 0; state.locked = false;
      setTab('quiz');
    }));
    return c;
  }
  let tick = null;
  function quizQuestion() {
    clearInterval(tick);
    const quiz = state.quiz;
    const question = quiz.questions[state.qi];
    const c = el('div', 'card qcard');
    c.appendChild(el('p', 'muted score', 'Вопрос ' + (state.qi + 1) + ' / ' + quiz.n + ' · счёт ' + state.answers.filter(a => a.ok).length + ' · серия ' + state.streak + ' · зерно ' + quiz.seed));
    const bar = el('div', 'progress'); const ii = el('i'); ii.style.width = (100 * state.qi / quiz.n) + '%'; bar.appendChild(ii); c.appendChild(bar);
    if (state.timer) {
      const tb = el('div', 'timer'); const ti = el('i'); tb.appendChild(ti); c.appendChild(tb);
      const t0 = Date.now();
      tick = setInterval(() => {
        const left = 1 - (Date.now() - t0) / (state.timer * 1000);
        ti.style.width = Math.max(0, left * 100) + '%';
        if (left <= 0) { clearInterval(tick); if (!state.locked) grade(null); }
      }, 200);
    }
    c.appendChild(el('div', 'prompt', question.prompt));
    const host = el('div');
    c.appendChild(host);
    const need3d = question.mol || (question.type === 'sg' && question.opTriplet);
    if (need3d && question.mol) {
      const stage = ensureStage(host, 'quiz');
      const mol = SYM.mol(question.mol);
      if (stage && mol) {
        showMol(stage, mol, true);
        stage.viewer.resize(); stage.viewer.render();
        if (question.type === 'op') {
          const ops = SYM.operations(question.pg).filter(o => o.kind !== 'E');
          const op = ops[question.opIndex] || ops[0];
          setTimeout(() => stage.animateOp(op, 1300), 400);
          host.appendChild(btn('Ещё раз', 'btn sec', () => stage.animateOp(op, 1300)));
        }
        if (question.type === 'find' && question.findItems) {
          question.findItems.forEach(it => stage.drawAxis(it.axis, [0, 0, 0], { color: it.color, n: it.n || 2, len: 2.6 }));
          stage.viewer.render();
        }
      }
    }
    if (question.type === 'sg' && question.opTriplet) {
      const stage = ensureStage(host, 'quiz');
      const g = SYM.hall.get(question.sg);
      if (stage && g) {
        stage.showSpaceGroup(g);
        const d = SYM.hall.describe(question.sg).find(x => x.triplet === question.opTriplet);
        if (d) setTimeout(() => stage.animateSpaceOp(d, 1400), 500);
        host.appendChild(btn('Ещё раз', 'btn sec', () => d && stage.animateSpaceOp(d, 1400)));
      }
    }
    const choices = el('div');
    question.choices.forEach(ch => {
      const b = btn(ch.id + '.  ' + ch.text, 'choice', () => grade(ch.id));
      b.dataset.id = ch.id;
      choices.appendChild(b);
    });
    c.appendChild(choices);
    if (question.typed || question.numeric) {
      const inp = document.createElement('input'); inp.className = 'search'; inp.placeholder = question.typed ? 'или символ, например C2v' : 'или число';
      inp.id = 'quizType';
      c.appendChild(inp);
      c.appendChild(btn('Проверить ввод', 'btn sec', () => grade('typed:' + inp.value)));
    }
    const fb = el('div'); fb.id = 'fb'; c.appendChild(fb);
    return c;
    function grade(pickId) {
      if (state.locked) return;
      state.locked = true;
      clearInterval(tick);
      let ok = false;
      if (pickId && String(pickId).indexOf('typed:') === 0) {
        const raw = String(pickId).slice(6).trim().toLowerCase().replace(/\s/g, '');
        ok = question.typed ? raw === String(question.typed).toLowerCase() : raw === String(question.numeric);
      } else ok = pickId === question.answer;
      if (ok) state.streak++; else state.streak = 0;
      state.answers.push({ ok, explain: question.explain, prompt: question.prompt });
      const fb = $('fb');
      if (fb) {
        fb.className = ok ? 'ok' : 'bad';
        fb.innerHTML = (ok ? 'Верно. ' : 'Неверно. ') + question.explain + ' ';
        if (question.pg) {
          const a = el('a'); a.href = '#'; a.textContent = 'Открыть теорию ' + question.pg;
          a.onclick = ev => { ev.preventDefault(); state.pg = question.pg; if (question.mol) state.mol = question.mol; state.quiz = state.quiz; setTab('pg'); };
          fb.appendChild(a);
        }
        if (question.sg) {
          fb.appendChild(document.createTextNode(' '));
          const a = el('a'); a.href = '#'; a.textContent = 'Группа ' + question.sg;
          a.onclick = ev => { ev.preventDefault(); state.sg = question.sg; setTab('sg'); };
          fb.appendChild(a);
        }
      }
      const next = btn(state.qi + 1 >= state.quiz.n ? 'К итогам' : 'Дальше', 'btn primary', () => {
        state.locked = false; state.qi++; render();
      });
      next.style.marginTop = '8px';
      if (fb) fb.appendChild(next);
      document.querySelectorAll('.qcard .choice').forEach(b => {
        if (b.dataset.id === question.answer) b.style.outline = '2px solid #0f7b4c';
        else if (b.dataset.id === pickId) b.style.outline = '2px solid #b42318';
      });
    }
  }
  function quizResult() {
    clearInterval(tick);
    const quiz = state.quiz;
    const score = state.answers.filter(a => a.ok).length;
    const prog = SYM.quiz.saveResult({ score, n: quiz.n, seed: quiz.seed, lvl: quiz.lvl, topics: quiz.topics, streak: state.streak });
    const c = el('div', 'card');
    c.appendChild(el('p', 'muted', 'Итог квиза · можно снять экран'));
    c.appendChild(el('div', 'resultbig', score + ' / ' + quiz.n));
    c.appendChild(el('p', '', 'Уровень ' + quiz.lvl + ', зерно ' + quiz.seed + ', темы ' + quiz.topics.join(', ') + '.'));
    c.appendChild(el('p', 'muted', 'Лучший результат на устройстве: ' + prog.best + '. Серия в этом заходе до последнего ответа учитывается в истории.'));
    state.answers.forEach((a, i) => {
      const p = el('div', 'step'); p.innerHTML = (a.ok ? '✓ ' : '✗ ') + (i + 1) + '. ' + a.prompt;
      c.appendChild(p);
    });
    c.appendChild(btn('Ещё раз этот набор', 'btn primary', () => { state.qi = 0; state.answers = []; state.streak = 0; state.locked = false; render(); }));
    c.appendChild(btn('Новый квиз', 'btn sec', () => { state.quiz = null; render(); }));
    return c;
  }

  function render() {
    clearInterval(tick);
    pgStage = sgStage = propStage = quizStage = null;
    app.innerHTML = '';
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
    if (state.tab === 'pg') renderPG();
    else if (state.tab === 'sg') renderSG();
    else if (state.tab === 'prop') renderProp();
    else renderQuiz();
  }

  function drawQR(canvas, text) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, W);
    if (!window.qrcode || !text) return;
    const nBytes = new TextEncoder().encode(text).length;
    const qr = window.qrcode(0, nBytes < 500 ? 'M' : 'L');
    qr.addData(text, 'Byte'); qr.make();
    const n = qr.getModuleCount(), quiet = 4;
    const cell = Math.floor(W / (n + quiet * 2)) || 1;
    const off = Math.floor((W - cell * n) / 2);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
  }
  $('bShare').onclick = () => {
    syncURL();
    const url = location.href;
    $('shareUrl').textContent = url;
    drawQR($('qr'), url);
    $('shareBack').classList.remove('hidden');
    $('shareSheet').classList.remove('hidden');
  };
  function closeShare() { $('shareBack').classList.add('hidden'); $('shareSheet').classList.add('hidden'); }
  $('shareClose').onclick = closeShare;
  $('shareBack').onclick = closeShare;
  $('bCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('shareUrl').textContent); $('bCopy').textContent = 'Скопировано'; }
    catch (e) { $('bCopy').textContent = 'Выделите ссылку'; }
  };

  if (q.get('quiz')) {
    state.tab = 'quiz';
    state.quiz = SYM.quiz.buildQuiz({ quiz: q.get('quiz'), n: q.get('n'), seed: q.get('seed') || 1, lvl: q.get('lvl') || 1 });
  }
  render();
  window.SYMApp = { state, render, setTab };
})();
