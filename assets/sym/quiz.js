/* Генератор квизов по симметрии. Один seed → один и тот же набор. */
(function (root) {
  'use strict';
  const SYM = root.SYM;
  function rngOf(seed) {
    let a = (Number(seed) || 1) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function choiceQ(spec) {
    const letters = 'АБВГДЕ'.split('');
    spec.choices = spec.choices.map((text, i) => ({ id: letters[i] || String(i + 1), text: String(text) }));
    const correct = spec.choices.find(c => c.text === String(spec.answerText));
    spec.answer = correct ? correct.id : spec.choices[0].id;
    return spec;
  }
  const EASY_MOLS = ['H2O', 'NH3', 'CH4', 'SF6', 'BF3', 'C6H6', 'CO2', 'HCl', 'CHCl3', 'CCl4', 'SO2', 'XeF4', 'allene', 'CHFClBr', 'C2H6s', 'C2H6e'];
  const MID_MOLS = EASY_MOLS.concat(['H2O2', 'N2F2', 'PCl5', 'C6H12', 'FeCp2s', 'BrF5', 'C2H4', 'CH2ClF', 'pentadiene', 'Coen3']);
  const ALL_MOLS = () => SYM.molecules.map(m => m.id);

  function mols(lvl) { return (lvl <= 1 ? EASY_MOLS : lvl === 2 ? MID_MOLS : ALL_MOLS()).filter(id => SYM.mol(id)); }

  function distractors(pg, rng, n) {
    const pool = SYM.groups.filter(g => g.id !== pg && !g.infinite).map(g => g.name + ' (' + g.id + ')');
    const same = SYM.groups.filter(g => g.id !== pg && g.family === (SYM.pg(pg) || {}).family);
    const prefer = same.length ? same.map(g => g.name + ' (' + g.id + ')') : pool;
    const rest = pool.filter(x => prefer.indexOf(x) < 0);
    return shuffle(rng, prefer.concat(rest)).slice(0, n);
  }
  function pgLabel(id) { const g = SYM.pg(id); return g ? g.name + ' (' + g.id + ')' : id; }

  function qPointGroup(lvl, rng) {
    const id = pick(rng, mols(lvl));
    const mol = SYM.mol(id);
    const right = pgLabel(mol.pg);
    const opts = shuffle(rng, [right].concat(distractors(mol.pg, rng, lvl >= 3 ? 4 : 3))).slice(0, 4);
    if (opts.indexOf(right) < 0) opts[0] = right;
    return choiceQ({
      type: 'pg', prompt: 'Какая точечная группа у молекулы «' + mol.name + '» (' + mol.formula + ')? Покрутите модель.',
      choices: shuffle(rng, opts), answerText: right, mol: id, pg: mol.pg,
      explain: mol.name + ' — ' + right + '. ' + (mol.note || '') + ' ' + (SYM.pg(mol.pg).blurb || ''),
      typed: lvl >= 2 ? mol.pg : ''
    });
  }

  function census(pgId) {
    const g = SYM.pg(pgId);
    const out = { order: g.order, i: !!g.centrosym, axes: {}, planes: 0, planesH: 0, planesV: 0, planesD: 0, sn: 0 };
    g.classes.forEach(c => {
      if (c.kind === 'C' && c.axes) out.axes[c.n] = (out.axes[c.n] || 0) + c.axes;
      if (c.kind === 'm') {
        out.planes += c.size;
        if (c.sub === 'h') out.planesH += c.size;
        else if (c.sub === 'd') out.planesD += c.size;
        else out.planesV += c.size;
      }
      if (c.kind === 'S' && c.axes) out.sn += c.axes;
      if (c.kind === 'i') out.i = true;
    });
    return out;
  }

  function qCount(lvl, rng) {
    const ids = mols(Math.max(1, lvl)).filter(id => SYM.pg(SYM.mol(id).pg).order < 80);
    const id = pick(rng, ids);
    const mol = SYM.mol(id);
    const c = census(mol.pg);
    const kind = pick(rng, lvl === 1 ? ['order', 'i'] : ['order', 'c2', 'sigma', 'i']);
    let prompt, answerText, explain;
    if (kind === 'order') {
      prompt = 'Сколько операций симметрии в группе молекулы «' + mol.name + '» (порядок группы)?';
      answerText = String(c.order);
      const near = shuffle(rng, [c.order, c.order * 2, Math.max(1, c.order - 1), c.order + 2, Math.ceil(c.order / 2)].filter((v, i, a) => a.indexOf(v) === i).map(String));
      explain = 'Порядок ' + SYM.pg(mol.pg).name + ' равен ' + c.order + '.';
      return choiceQ({ type: 'count', prompt, choices: near.slice(0, 4).concat(near.indexOf(answerText) < 0 ? [answerText] : []).slice(0, 4), answerText, mol: id, pg: mol.pg, explain, numeric: answerText });
    }
    if (kind === 'i') {
      prompt = 'Есть ли у «' + mol.name + '» центр инверсии?';
      answerText = c.i ? 'Да' : 'Нет';
      explain = c.i ? 'Группа центросимметрична.' : 'Центра инверсии нет — группа не центросимметрична.';
      return choiceQ({ type: 'count', prompt, choices: ['Да', 'Нет'], answerText, mol: id, pg: mol.pg, explain });
    }
    if (kind === 'c2') {
      const n = c.axes[2] || 0;
      prompt = 'Сколько осей C₂ у «' + mol.name + '»? (считаются оси из таблицы характеров)';
      answerText = String(n);
      explain = 'Осей C₂: ' + n + '. Группа ' + pgLabel(mol.pg) + '.';
      const opts = shuffle(rng, ['0', '1', '2', '3', '4', '6'].concat([answerText])).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
      if (opts.indexOf(answerText) < 0) opts[0] = answerText;
      return choiceQ({ type: 'count', prompt, choices: opts, answerText, mol: id, pg: mol.pg, explain, numeric: answerText });
    }
    const n = c.planes;
    prompt = 'Сколько плоскостей симметрии у «' + mol.name + '»?';
    answerText = String(n);
    explain = 'Плоскостей: ' + n + (c.planesH ? ', из них σₕ: ' + c.planesH : '') + (c.planesV ? ', σᵥ: ' + c.planesV : '') + (c.planesD ? ', σ_d: ' + c.planesD : '') + '.';
    const opts = shuffle(rng, ['0', '1', '2', '3', '6', '9', answerText]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
    if (opts.indexOf(answerText) < 0) opts[0] = answerText;
    return choiceQ({ type: 'count', prompt, choices: opts, answerText, mol: id, pg: mol.pg, explain, numeric: answerText });
  }

  function qOp(lvl, rng) {
    const id = pick(rng, mols(lvl));
    const mol = SYM.mol(id);
    const ops = SYM.operations(mol.pg).filter(o => o.kind !== 'E');
    const op = pick(rng, ops);
    const labels = [];
    SYM.operations(mol.pg).forEach(o => { if (labels.indexOf(o.label) < 0) labels.push(o.label); });
    const right = op.label;
    let opts = shuffle(rng, labels.filter(l => l !== 'E')).slice(0, 4);
    if (opts.indexOf(right) < 0) opts[0] = right;
    opts = shuffle(rng, opts);
    return choiceQ({
      type: 'op', prompt: 'Какая операция только что проигралась на «' + mol.name + '»?',
      choices: opts, answerText: right, mol: id, pg: mol.pg, opIndex: ops.indexOf(op),
      explain: 'Это ' + right + ' группы ' + pgLabel(mol.pg) + '.'
    });
  }

  function qFind(lvl, rng) {
    const id = pick(rng, mols(lvl).filter(m => SYM.pg(SYM.mol(m).pg).order > 1 && SYM.pg(SYM.mol(m).pg).order < 60));
    const mol = SYM.mol(id);
    const loc = SYM.loci(mol.pg);
    const real = loc.axes[0] || (loc.planes[0] && { kind: 'plane', axis: loc.planes[0].normal, label: loc.planes[0].label, n: 0 });
    if (!real) return qPointGroup(lvl, rng);
    const decoyAxes = [[1, 1, 0.2], [0.2, 1, 0.7], [1, 0.3, 1]].map(unitSafe);
    const items = [{ text: 'Элемент 1 — ' + (real.label || 'ось'), real: true, axis: real.axis || real.normal, kind: real.kind || 'axis', n: real.n }];
    decoyAxes.slice(0, lvl >= 3 ? 3 : 2).forEach((ax, i) => items.push({ text: 'Элемент ' + (i + 2) + ' — посторонняя ось', real: false, axis: ax, kind: 'axis', n: 2 }));
    const ordered = shuffle(rng, items);
    ordered.forEach((it, i) => { it.text = 'Линия ' + (i + 1); it.color = ['#f87171', '#34d399', '#60a5fa', '#fbbf24'][i]; });
    const right = ordered.find(it => it.real);
    return choiceQ({
      type: 'find', prompt: 'Какая из линий на модели — настоящий элемент симметрии «' + mol.name + '»?',
      choices: ordered.map(it => it.text), answerText: right.text, mol: id, pg: mol.pg,
      findItems: ordered.map(it => ({ axis: it.axis, color: it.color, real: it.real, n: it.n })),
      explain: 'Верная линия совпадает с ' + (real.label || 'осью') + ' группы ' + pgLabel(mol.pg) + '.'
    });
  }
  function unitSafe(a) { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }

  function qProp(lvl, rng) {
    const id = pick(rng, mols(lvl));
    const mol = SYM.mol(id);
    const g = SYM.pg(mol.pg);
    const kind = pick(rng, lvl === 1 ? ['polar', 'chiral'] : ['polar', 'chiral', 'nmr', 'ir']);
    if (kind === 'polar') {
      const answerText = g.polar ? 'Полярная' : 'Неполярная';
      return choiceQ({
        type: 'prop', prompt: 'Есть ли у «' + mol.name + '» постоянный дипольный момент (группа полярная)?',
        choices: ['Полярная', 'Неполярная'], answerText, mol: id, pg: mol.pg,
        explain: (g.polar ? 'Полярные группы: C₁, Cₛ, Cₙ, Cₙᵥ и C∞ᵥ. ' : 'Есть несобственная ось или перпендикулярные C₂, диполь запрещён. ') + pgLabel(mol.pg) + '.'
      });
    }
    if (kind === 'chiral') {
      const answerText = g.chiral ? 'Хиральная' : 'Не хиральная';
      return choiceQ({
        type: 'prop', prompt: 'Хиральна ли «' + mol.name + '» (может ли вращать плоскость поляризации)?',
        choices: ['Хиральная', 'Не хиральная'], answerText, mol: id, pg: mol.pg,
        explain: (g.chiral ? 'Нет зеркал, инверсии и осей Sₙ. ' : 'Есть несобственная ось Sₙ (зеркало — это S₁, инверсия — S₂). ') + pgLabel(mol.pg) + '.'
      });
    }
    if (kind === 'nmr') {
      const rows = SYM.nmr(id);
      const row = rows.find(r => r.el === 'H') || rows[0];
      const answerText = String(row.signals);
      const opts = shuffle(rng, ['1', '2', '3', '4', answerText]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
      if (opts.indexOf(answerText) < 0) opts[0] = answerText;
      return choiceQ({
        type: 'prop', prompt: 'Сколько сигналов ЯМР ' + row.el + ' даёт «' + mol.name + '» (по орбитам эквивалентных атомов)?',
        choices: opts, answerText, mol: id, pg: mol.pg, numeric: answerText,
        explain: 'Эквивалентные атомы ' + row.el + ' образуют ' + row.signals + ' орбиту(ы) под действием группы.'
      });
    }
    if (g.infinite || g.order > 48) return qProp(1, rng);
    const vib = SYM.vib(id);
    const active = (vib.parts || []).filter(p => p.n && p.ir.lin && /[xyz]/.test(p.ir.lin));
    const n = active.reduce((s, p) => s + p.n * (p.ir.lin.indexOf(',') >= 0 || p.ir.lin.indexOf('(') >= 0 ? 2 : 1), 0);
    const answerText = String(n);
    const opts = shuffle(rng, ['0', '1', '2', '3', '4', answerText]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
    if (opts.indexOf(answerText) < 0) opts[0] = answerText;
    return choiceQ({
      type: 'prop', prompt: 'Сколько ИК-активных колебательных компонент у «' + mol.name + '»? (вырожденные считаются по размерности)',
      choices: opts, answerText, mol: id, pg: mol.pg, numeric: answerText,
      explain: 'ИК-активны представления, содержащие x, y или z: ' + (active.map(p => p.n + p.name).join(', ') || 'нет') + '.'
    });
  }

  function qSpace(lvl, rng) {
    const easy = [1, 2, 14, 19, 136, 152, 194, 221, 225, 227, 230, 15, 62, 167, 186];
    const n = pick(rng, lvl >= 3 ? Array.from({ length: 230 }, (_, i) => i + 1) : easy);
    const g = SYM.hall.get(n);
    const kind = pick(rng, lvl === 1 ? ['sys', 'mult', 'centro'] : ['sys', 'mult', 'centro', 'screw']);
    const sym = SYM.hall.prettyHM(g.hm);
    if (kind === 'sys') {
      const answerText = SYM.hall.SYS_RU[g.sys];
      let opts = shuffle(rng, Object.values(SYM.hall.SYS_RU)).slice(0, 4);
      if (opts.indexOf(answerText) < 0) opts[0] = answerText;
      return choiceQ({
        type: 'sg', prompt: 'К какой сингонии относится группа ' + n + ' ' + sym + '?',
        choices: opts, answerText, sg: n,
        explain: sym + ' — ' + answerText + ' сингония, решётка ' + g.lat + ', точечная группа ' + g.pg + '.'
      });
    }
    if (kind === 'mult') {
      const m = SYM.hall.multiplicity(n);
      const answerText = String(m);
      const opts = shuffle(rng, [m, m / 2, m * 2, m + 2, Math.max(1, m - 1)].filter(x => x === Math.round(x) && x > 0).map(String)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
      if (opts.indexOf(answerText) < 0) opts[0] = answerText;
      return choiceQ({
        type: 'sg', prompt: 'Какова кратность общей позиции (число операций) группы ' + n + ' ' + sym + '?',
        choices: opts, answerText, sg: n, numeric: answerText,
        explain: 'Общая позиция группы ' + sym + ' имеет кратность ' + m + (g.lat !== 'P' ? ' (с учётом центрировки ' + g.lat + ')' : '') + '.'
      });
    }
    if (kind === 'centro') {
      const answerText = g.centro ? 'Центросимметричная' : 'Нецентросимметричная';
      return choiceQ({
        type: 'sg', prompt: 'Группа ' + n + ' ' + sym + ' центросимметрична?',
        choices: ['Центросимметричная', 'Нецентросимметричная'], answerText, sg: n,
        explain: answerText + '. Класс Лауэ ' + g.laue + ', точечная группа ' + g.pg + '.'
      });
    }
    const descs = SYM.hall.describe(n);
    const screws = descs.filter(d => d.kind === 'screw');
    const glides = descs.filter(d => d.kind === 'glide');
    const pool = screws.length ? screws : glides;
    if (!pool.length) return qSpace(1, rng);
    const d = pick(rng, pool);
    const answerText = d.kind === 'screw' ? ('винтовая ось ' + d.label) : ('плоскость скольжения ' + d.label);
    const alts = ['винтовая ось 2₁', 'винтовая ось 3₁', 'винтовая ось 4₂', 'винтовая ось 6₃', 'плоскость скольжения a', 'плоскость скольжения c', 'плоскость скольжения n', 'чистый поворот', 'зеркальная плоскость'];
    const opts = shuffle(rng, [answerText].concat(alts.filter(x => x !== answerText))).slice(0, 4);
    if (opts.indexOf(answerText) < 0) opts[0] = answerText;
    return choiceQ({
      type: 'sg', prompt: 'На анимации группы ' + sym + ' — что это за операция?',
      choices: shuffle(rng, opts), answerText, sg: n, opTriplet: d.triplet,
      explain: 'Операция ' + d.triplet + ' — ' + answerText + '.'
    });
  }

  const MAKERS = { pg: qPointGroup, count: qCount, op: qOp, find: qFind, prop: qProp, sg: qSpace };
  function parseTopics(s) {
    const all = ['pg', 'count', 'op', 'find', 'prop', 'sg'];
    if (!s || s === 'mix' || s === 'all' || s === '1') return all;
    const parts = String(s).split(/[,+\s]+/).filter(Boolean);
    const out = parts.filter(p => MAKERS[p]);
    return out.length ? out : all;
  }

  function buildQuiz(opt) {
    const n = Math.max(1, Math.min(30, Number(opt.n) || 8));
    const seed = Number(opt.seed) || 1;
    const lvl = Math.max(1, Math.min(3, Number(opt.lvl) || 1));
    const topics = parseTopics(opt.quiz || opt.topics);
    const rng = rngOf(seed);
    const questions = [];
    for (let i = 0; i < n; i++) {
      const topic = topics[i % topics.length];
      let q = null;
      try { q = MAKERS[topic](lvl, rng); } catch (e) { q = null; }
      if (!q) q = qPointGroup(1, rng);
      q.i = i;
      q.topic = topic;
      questions.push(q);
    }
    return { n, seed, lvl, topics, questions };
  }

  const KEY = 'sym-quiz-v1';
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { history: [], best: 0, answered: 0, correct: 0, streakBest: 0 }; }
    catch (e) { return { history: [], best: 0, answered: 0, correct: 0, streakBest: 0 }; }
  }
  function saveResult(run) {
    const p = loadProgress();
    p.history = (p.history || []).slice(0, 24);
    p.history.unshift({ t: Date.now(), score: run.score, n: run.n, seed: run.seed, lvl: run.lvl, topics: run.topics, streak: run.streak });
    p.best = Math.max(p.best || 0, run.score);
    p.streakBest = Math.max(p.streakBest || 0, run.streak || 0);
    p.answered = (p.answered || 0) + run.n;
    p.correct = (p.correct || 0) + run.score;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* приватный режим */ }
    return p;
  }

  root.SYM.quiz = { buildQuiz, parseTopics, loadProgress, saveResult, census, rngOf };
})(typeof window !== 'undefined' ? window : globalThis);
