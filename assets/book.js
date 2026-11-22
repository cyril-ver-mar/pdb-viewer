/* Учебник «Супрамолекулярная химия»: главы → «Материалы главы» и «Задачи и тесты» → рисунки.
   Данные: structures/_book/book.json (правится на странице-редакторе, см. README).
   Рисунок (слот):  { id, title, caption, hidden, items:[{t, s, p, sel}], controls, keep, set, params }
   Задача:          { id, title, caption, text, hidden, cond:{items,controls,keep,set}, ans:{…} }
   s — источник как в наборах (assets/set.js): pdb:путь, e:запись, id:1CRN, cid:…, cod:…, url:…
   Пустые рисунки (без структур) и скрытые ученикам не показываются. */
(function () {
  'use strict';
  const BOOK_PATH = 'structures/_book/book.json';
  const SECTIONS = { m: { key: 'materials', name: 'Материалы главы' }, t: { key: 'tasks', name: 'Задачи и тесты' } };

  async function loadBook(opts) {
    const r = await fetch(new URL(BOOK_PATH, location.href).href, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Учебник не найден (HTTP ' + r.status + ')');
    const text = await r.text();
    const book = JSON.parse(text);
    if (opts && opts.withText) return { book, text };
    return book;
  }
  function partFilled(p) { return !!(p && ((p.set && String(p.set).trim()) || (p.items || []).some(it => it && it.s))); }
  function isTask(slot) { return !!(slot && (slot.cond || slot.ans)); }
  function filled(slot) {
    if (!slot) return false;
    return isTask(slot) ? (partFilled(slot.cond) || partFilled(slot.ans)) : partFilled(slot);
  }
  function visibleToStudents(slot) { return filled(slot) && !slot.hidden; }
  function findSlot(book, id) {
    for (const ch of book.chapters || []) {
      for (const sec of ['m', 't']) {
        const list = ch[SECTIONS[sec].key] || [];
        const i = list.findIndex(s => s.id === id);
        if (i >= 0) return { chapter: ch, sec, slot: list[i], index: i };
      }
    }
    return null;
  }
  function figHref(id, back) {
    return 'index.html?fig=' + encodeURIComponent(id) + (back ? '&bk=' + encodeURIComponent(back) : '');
  }
  function bookHref(ch, tab, all) {
    const q = [];
    if (ch) q.push('ch=' + ch);
    if (tab && tab !== 'm') q.push('tab=' + tab);
    if (all) q.push('all=1');
    return 'book.html' + (q.length ? '?' + q.join('&') : '');
  }
  // «bk» из ссылки рисунка: только адрес страницы учебника, ничего другого
  function safeBack(bk) {
    const s = String(bk || '');
    if (!s || !/^(ch=\d{1,2})?(&?tab=[mt])?(&?all=1)?$/.test(s)) return '';
    return 'book.html' + (s ? '?' + s.replace(/^&/, '') : '');
  }
  function countItems(p) { return p && p.set ? 0 : (p && p.items || []).filter(it => it && it.s).length; }

  // ---------- рисунок → набор для просмотрщика (формат assets/set.js) ----------
  async function partDef(part, prefix, defTitle) {
    if (part.set && String(part.set).trim()) {
      const d = await PVSet.loadDef({ path: String(part.set).trim() });
      return Object.assign({}, d, { items: d.items.slice(), controls: d.controls.slice() });
    }
    const items = (part.items || []).filter(it => it && it.s);
    const ctr = (part.controls || []).filter(c => c && c.key && (c.options || []).length);
    if (ctr.length) {
      return {
        keep: !!part.keep, controls: ctr.map(c => ({ key: c.key, label: c.label || c.key, options: c.options.map(o => ({ v: String(o.v), t: o.t || String(o.v) })) })),
        items: items.map((it, i) => ({ title: it.t || ('Структура ' + (i + 1)), desc: it.desc || '', ref: it.s, params: it.p || null, sel: Object.assign({}, it.sel || {}) })),
        default: part.default || {}
      };
    }
    return {
      keep: !!part.keep, list: true,
      controls: [{ key: 'i', label: 'Структура', options: items.map((it, i) => ({ v: String(i), t: it.t || (items.length === 1 && defTitle ? defTitle : 'Структура ' + (i + 1)) })) }],
      items: items.map((it, i) => ({ title: it.t || (items.length === 1 && defTitle ? defTitle : 'Структура ' + (i + 1)), desc: it.desc || '', ref: it.s, params: it.p || null, sel: { i: String(i) } })),
      default: { i: '0' }
    };
  }
  function prefixed(def, prefix, part) {
    const ren = k => prefix + k;
    const controls = def.controls.map(c => {
      const w = { part };
      for (const [k, v] of Object.entries(c.when || {})) w[ren(k)] = v;
      return Object.assign({}, c, { key: ren(c.key), when: w });
    });
    const items = def.items.map(it => {
      const sel = { part };
      for (const [k, v] of Object.entries(it.sel || {})) sel[ren(k)] = v;
      return Object.assign({}, it, { sel });
    });
    const dflt = {};
    for (const [k, v] of Object.entries(def.default || {})) dflt[ren(k)] = v;
    return { controls, items, dflt };
  }
  async function figureDef(id) {
    const book = await loadBook();
    const hit = findSlot(book, id);
    if (!hit) throw new Error('Рисунок «' + id + '» не найден в учебнике.');
    const slot = hit.slot;
    if (!filled(slot)) throw new Error('Этот рисунок пока не готов.');
    const meta = { id: slot.id, chapter: hit.chapter.n, sec: hit.sec };
    let def;
    if (!isTask(slot)) {
      def = await partDef(slot, '', slot.title);
      def.title = slot.title || def.title || '';
      def.description = slot.caption || '';
      def.params = Object.assign({}, def.params || {}, slot.params || {});
    } else {
      const parts = [];
      const controls = [{ key: 'part', label: 'Задача', hidden: true, options: [] }];
      const items = [], dflt = { part: 'c' };
      let keepAny = false;
      for (const [k, name] of [['c', 'Условие'], ['a', 'Ответ']]) {
        const p = k === 'c' ? slot.cond : slot.ans;
        if (!partFilled(p)) continue;
        const d = await partDef(p, k + '_', name);
        const x = prefixed(d, k + '_', k);
        controls[0].options.push({ v: k, t: name });
        controls.push(...x.controls); items.push(...x.items); Object.assign(dflt, x.dflt);
        keepAny = keepAny || !!d.keep;
        parts.push(k);
      }
      if (!parts.includes('c')) dflt.part = 'a';
      def = {
        title: slot.title || '', description: slot.caption || '', controls, items, default: dflt,
        keep: false, params: Object.assign({}, slot.params || {}),
        task: { text: slot.text || '', hasCond: parts.includes('c'), hasAns: parts.includes('a') }
      };
    }
    def.figure = meta;
    def.items = def.items.filter(it => it.ref);
    if (!def.items.length) throw new Error('В рисунке нет структур.');
    return def;
  }

  // ---------- пустой учебник ----------
  const CHAPTERS = [
    [1, 'Основные концепции и терминология супрамолекулярной химии', 16, 6],
    [2, 'Супрамолекулярные системы типа «рецептор – субстрат». Процессы молекулярного распознавания', 9, 14],
    [3, 'Межмолекулярные взаимодействия в синтезе молекулярных рецепторов', 20, 8],
    [4, 'Молекулярные рецепторы', 55, 16],
    [5, 'Молекулярные машины', 39, 8]
  ];
  function newSlot(ch, sec, seq) {
    if (sec === 'm') return { id: ch + 'm' + seq, title: 'Рис. ' + ch + '.' + seq, caption: '', items: [] };
    return { id: ch + 't' + seq, title: 'Задача ' + ch + '.' + seq, caption: '', text: '', cond: { items: [] }, ans: { items: [] } };
  }
  function nextSeq(chapter, sec) {
    const list = chapter[SECTIONS[sec].key] || [];
    let mx = 0;
    for (const s of list) { const m = new RegExp('^' + chapter.n + sec + '(\\d+)$').exec(s.id); if (m) mx = Math.max(mx, +m[1]); }
    return Math.max(mx, list.length) + 1;
  }
  function emptyBook() {
    return {
      version: 1, title: 'Супрамолекулярная химия',
      chapters: CHAPTERS.map(([n, title, m, t]) => ({
        n, title,
        materials: Array.from({ length: m }, (_, i) => newSlot(n, 'm', i + 1)),
        tasks: Array.from({ length: t }, (_, i) => newSlot(n, 't', i + 1))
      }))
    };
  }

  window.PVBook = { BOOK_PATH, SECTIONS, CHAPTERS, loadBook, filled, partFilled, isTask, visibleToStudents, findSlot, figHref, bookHref, safeBack, countItems, figureDef, newSlot, nextSeq, emptyBook };
})();
