/* Раскладка файлов по рисункам учебника по имени файла.
   «5.11.2.mae» (разделитель . - _ или пробел): глава 5, рисунок 11, часть 2 → Рис. 5.11 (id 5m11), вариант «Часть 2».
   «!5.3.1.mae» — задача 3 главы 5 (id 5t3). В условие, если в имени нет «ответ/answer/отв/ans» (тогда — в ответ).
   Несколько структур в одном .mae → отдельные варианты «Часть 2.1», «Часть 2.2», … (#ct=1, #ct=2 …).
   Ничего не удаляет: пустые рисунки заполняет, в заполненные добавляет; тот же файл заменяет сам себя.
   Работает в браузере (window.PVPlace — редактор учебника) и в Node (tools/import-book-files.mjs). */
(function (root) {
  'use strict';
  const FILES_DIR = 'structures/_book/files';
  const EXT = /\.(mae\.gz|maegz|mae|pdb|ent|sdf|mol|sd|mol2|xyz|cif|mmcif|pqr|gro)$/i;

  function parseName(fileName) {
    const raw = String(fileName || '').split(/[\\/]/).pop().trim();
    const em = EXT.exec(raw);
    if (!em) return null;
    let base = raw.slice(0, em.index).trim();
    const task = /^[!！]/.test(base);
    if (task) base = base.replace(/^[!！]\s*/, '');
    const m = /^(\d{1,2})\s*([.\-_ ,])\s*(\d{1,3})(?:\s*([.\-_ ,])\s*(\d{1,3}))?(.*)$/.exec(base);
    if (!m) return null;
    const rest = (m[6] || '').replace(/^[\s.\-_,()]+|[\s.\-_,()]+$/g, '');
    let part = 'cond';
    if (task && /(^|[^a-zа-яё])(ответ|отв|answer|ans|ans\d*)([^a-zа-яё]|$)/i.test(rest + ' ')) part = 'ans';
    if (task && /(^|[^a-zа-яё])(условие|усл|cond|condition|q)([^a-zа-яё]|$)/i.test(rest + ' ')) part = 'cond';
    return {
      task, ch: +m[1], fig: +m[3], sub: m[5] != null ? +m[5] : null, sep: m[2], rest,
      ext: em[1].toLowerCase().replace('mae.gz', 'maegz'), part, file: raw
    };
  }
  function slotId(p) { return p.ch + (p.task ? 't' : 'm') + p.fig; }
  function cleanFileName(n) { return String(n).replace(/^[!！]\s*/, 'task_').replace(/[^\w.\-а-яё]+/gi, '_').replace(/^_+|_+$/g, '') || 'structure.pdb'; }
  function repoPath(p) { return FILES_DIR + '/ch' + p.ch + '/' + slotId(p) + '/' + cleanFileName(p.file.replace(/\.mae\.gz$/i, '.maegz')); }
  function newSlot(ch, task, fig) {
    if (!task) return { id: ch + 'm' + fig, title: 'Рис. ' + ch + '.' + fig, caption: '', items: [] };
    return { id: ch + 't' + fig, title: 'Задача ' + ch + '.' + fig, caption: '', text: '', cond: { items: [] }, ans: { items: [] } };
  }
  function numOf(id) { const m = /(\d+)\D*$/.exec(id); return m ? +m[1] : 1e9; }
  function subOf(it) { const m = /#.*\bsub=([\d.]+)/.exec(it.s || ''); return m ? parseFloat(m[1]) : null; }

  /* entries: [{ name, path?, cts: [{ title }] }]  (cts — структуры в файле; для не-.mae — одна)
     opts: { dryRun } → { report: [...], changed: bool } */
  function place(book, entries, opts) {
    opts = opts || {};
    const report = []; let changed = false;
    for (const e of entries) {
      const p = parseName(e.name);
      if (!p) { report.push({ name: e.name, ok: false, why: 'имя не по схеме «глава.рисунок.часть» (например 5.11.2.mae или !5.3.1.mae)' }); continue; }
      const ch = (book.chapters || []).find(c => c.n === p.ch);
      if (!ch) { report.push({ name: e.name, ok: false, why: 'в учебнике нет главы ' + p.ch }); continue; }
      const key = p.task ? 'tasks' : 'materials';
      const list = (ch[key] = ch[key] || []);
      const id = slotId(p);
      let slot = list.find(s => s.id === id), created = false;
      if (!slot) {
        slot = newSlot(p.ch, p.task, p.fig);
        let at = list.findIndex(s => numOf(s.id) > p.fig);
        if (at < 0) at = list.length;
        if (!opts.dryRun) list.splice(at, 0, slot);
        created = true;
      }
      const part = p.task ? (slot[p.part] = slot[p.part] || { items: [] }) : slot;
      if (part.set) { report.push({ name: e.name, ok: false, id, why: 'у ' + (slot.title || id) + ' задан готовый набор (' + part.set + ') — файл не добавлен' }); continue; }
      part.items = part.items || [];
      const path = e.path || repoPath(p);
      const cts = e.cts && e.cts.length ? e.cts : [{ title: '' }];
      const subLabel = p.sub != null ? String(p.sub) : '';
      const made = cts.map((ct, k) => {
        const n = cts.length > 1 ? (subLabel ? subLabel + '.' : '') + (k + 1) : subLabel;
        const it = { t: n ? 'Часть ' + n : (ct.title || 'Структура'), s: 'pdb:' + path + (cts.length > 1 ? '#ct=' + (k + 1) : '') };
        if (ct.title) it.desc = ct.title;
        it._ord = (p.sub != null ? p.sub : 0) + (cts.length > 1 ? (k + 1) / 1000 : 0);
        return it;
      });
      // тот же файл (тот же путь) — заменить, остальное не трогать
      const same = it => String(it.s || '').replace(/#.*$/, '') === 'pdb:' + path;
      // переименованные в редакторе подписи сохраняются
      for (const m of made) { const old = part.items.find(it => it.s === m.s); if (old && old.t) m.t = old.t; if (old && old.p) m.p = old.p; }
      const keepOld = part.items.filter(it => !same(it));
      const replaced = part.items.length - keepOld.length;
      // порядок: по номеру части; чужие (без номера) — в начале, как были
      const ordOf = it => { const m = /(?:^|\/)(?:task_)?\d+[.\-_ ]\d+[.\-_ ](\d+)[^/]*$/.exec(String(it.s || '').replace(/#.*$/, '')); const c = /#ct=(\d+)/.exec(it.s || ''); return m ? +m[1] + (c ? +c[1] / 1000 : 0) : -1; };
      const all = keepOld.map(it => Object.assign(it, { _ord: it._ord != null ? it._ord : ordOf(it) })).concat(made);
      all.sort((a, b) => a._ord - b._ord);
      for (const it of all) delete it._ord;
      if (!opts.dryRun) { part.items = all; changed = true; }
      report.push({
        name: e.name, ok: true, id, title: slot.title, created, task: p.task, part: p.task ? p.part : 'm', sub: p.sub, path,
        variants: made.map(m => m.t), replaced, cts: cts.length,
        note: p.task && p.part === 'cond' && !/усл|cond|q/i.test(p.rest) ? 'задача: положено в «Условие» (в имени нет пометки «ответ»)' : ''
      });
    }
    return { report, changed };
  }

  const api = { parseName, slotId, repoPath, cleanFileName, place, FILES_DIR, EXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PVPlace = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
