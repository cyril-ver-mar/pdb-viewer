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
      // номер: из имени файла или готовый (из заголовка .mae — см. planFile)
      const p = e.num ? Object.assign({ rest: '', file: e.fileName || e.name }, e.num, { file: e.fileName || e.name }) : parseName(e.name);
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
        if (ct.title && /[^\d\s.,]/.test(ct.title)) it.desc = ct.title; // «70» и подобные номера Maestro ученикам не показываем
        it._ord = (p.sub != null ? p.sub : 0) + (cts.length > 1 ? (k + 1) / 1000 : 0);
        return it;
      });
      // порядок: по номеру части; чужие (без номера) — в начале, как были
      const ordOf = it => { const m = /(?:^|\/)(?:task_)?\d+[.\-_ ]\d+[.\-_ ](\d+)[^/]*$/.exec(String(it.s || '').replace(/#.*$/, '')); const c = /#ct=(\d+)/.exec(it.s || ''); return m ? +m[1] + (c ? +c[1] / 1000 : 0) : -1; };
      const occupied = part.items.filter(it => it && it.s).length;
      // тот же файл (тот же путь) или та же часть рисунка (5-11-2 → часть 2) — заменить, остальное не трогать
      const dir = 'pdb:' + path.replace(/[^/]*$/, '');
      const same = it => { const u = String(it.s || '').replace(/#.*$/, ''); return u === 'pdb:' + path || (p.sub != null && u.startsWith(dir) && Math.floor(ordOf(it)) === p.sub); };
      // переименованные в редакторе подписи сохраняются
      for (const m of made) { const old = part.items.find(it => it.s === m.s) || (made.length === 1 ? part.items.filter(same).length === 1 && part.items.find(same) : null); if (old && old.t && !/^Часть [\d.]+$/.test(old.t)) m.t = old.t; if (old && old.p) m.p = old.p; }
      const keepOld = part.items.filter(it => !same(it));
      const replaced = part.items.length - keepOld.length;
      const all = keepOld.map(it => Object.assign(it, { _ord: it._ord != null ? it._ord : ordOf(it) })).concat(made);
      all.sort((a, b) => a._ord - b._ord);
      for (const it of all) delete it._ord;
      if (!opts.dryRun) { part.items = all; changed = true; }
      report.push({
        name: e.name, ok: true, id, title: slot.title, created, task: p.task, part: p.task ? p.part : 'm', sub: p.sub, path,
        variants: made.map(m => m.t), replaced, occupied, cts: cts.length,
        note: p.task && p.part === 'cond' && !/усл|cond|q/i.test(p.rest) ? 'задача: положено в «Условие» (в имени нет пометки «ответ»)' : ''
      });
    }
    return { report, changed };
  }

  // ---------- номер из заголовка структуры (s_m_title / s_m_entry_name) ----------
  // «5-11-2», «5.11.2», «5-11», «!5-3-1», «Рис 5-11-2 Cu», «Задача 5.3.1 ответ». Чисел без разделителя («70») — нет.
  function parseTitle(title) {
    const s = String(title || '');
    const re = /(\d{1,2})\s*[.\-_]\s*(\d{1,3})(?:\s*[.\-_]\s*(\d{1,3}))?/g;
    let m;
    while ((m = re.exec(s))) {
      const before = s[m.index - 1] || '', after = s[m.index + m[0].length] || '';
      if (/[\d.,]/.test(before) || /\d/.test(after) || (after === '.' && /\d/.test(s[m.index + m[0].length + 1] || ''))) continue;
      const pre = s.slice(0, m.index), rest = (pre + ' ' + s.slice(m.index + m[0].length)).trim();
      const task = /[!！]/.test(pre) || /(^|[^a-zа-яё])(задача|задание|зад\.?|task)([^a-zа-яё]|$)/i.test(pre);
      const ans = task && /(^|[^a-zа-яё])(ответ|отв|answer|ans)([^a-zа-яё]|$)/i.test(rest);
      return { task, ch: +m[1], fig: +m[2], sub: m[3] != null ? +m[3] : null, part: ans ? 'ans' : 'cond', rest, found: m[0] };
    }
    return null;
  }
  function numKey(n) { return n ? (n.task ? '!' : '') + n.ch + '-' + n.fig + (n.sub != null ? '-' + n.sub : '') + (n.task ? ':' + n.part : '') : ''; }
  function canonName(n, ext) { return (n.task ? '!' : '') + n.ch + '-' + n.fig + (n.sub != null ? '-' + n.sub : '') + (n.task && n.part === 'ans' ? '_ответ' : '') + '.' + (ext || 'mae'); }
  function placeText(n) { return n ? (n.task ? 'Задача ' : 'Рис. ') + n.ch + '.' + n.fig + (n.sub != null ? ', часть ' + n.sub : '') + (n.task ? ' — ' + (n.part === 'ans' ? 'ответ' : 'условие') : ' — материалы') : ''; }
  /* Как разложить один файл.
     f = { name, cts: [{ title, entryName }] | null }   (cts — только для .mae)
     mode = 'name' | 'title'
     → [{ name, fileName, num, src: 'name'|'title'|'entry', ctIdx: [0,2]|null, split, titleFound, ok, why, warn }]
     ctIdx = null — файл целиком; split — эти структуры выносятся в отдельный .mae (заголовок файла сохраняется). */
  function planFile(f, mode) {
    const nameNum = parseName(f.name);
    const ext = nameNum ? nameNum.ext : ((/\.([a-z0-9]+)$/i.exec(f.name) || [])[1] || 'mae').toLowerCase();
    const titles = (f.cts || []).map(c => c.title || c.entryName || '').filter(Boolean);
    const titleFound = titles.join(' | ');
    const byName = (warn) => [nameNum
      ? { name: f.name, fileName: f.name, num: nameNum, src: 'name', ctIdx: null, split: false, titleFound, ok: true, warn: warn || '', fallback: mode === 'title' }
      : { name: f.name, src: 'name', ctIdx: null, titleFound, ok: false, why: (warn ? warn + ' ' : '') + 'В имени файла тоже нет номера «глава.рисунок.часть» (например 5.11.2.mae или !5.3.1.mae).' }];
    if (mode !== 'title') return byName();
    if (!f.cts || !f.cts.length) return byName('Заголовок есть только у файлов Maestro (.mae) — номер взят из имени файла.');
    const per = f.cts.map(c => {
      const t = parseTitle(c.title); if (t) return { num: t, src: 'title' };
      const e = parseTitle(c.entryName); if (e) return { num: e, src: 'entry' };
      return null;
    });
    if (per.every(x => !x)) return byName('В заголовке .mae нет номера (' + (titleFound ? '«' + titleFound + '»' : 'заголовка нет') + ') — взят номер из имени файла.');
    const groups = new Map(); const rows = [];
    let lost = [];
    per.forEach((x, k) => {
      const num = x ? x.num : nameNum;
      if (!num) { lost.push(k); return; }
      const key = numKey(num);
      if (!groups.has(key)) groups.set(key, { num, src: x ? x.src : 'name', idx: [] });
      groups.get(key).idx.push(k);
    });
    const whole = groups.size === 1 && !lost.length;
    for (const g of groups.values()) {
      const t = g.idx.map(k => f.cts[k].title || f.cts[k].entryName || '').filter(Boolean).join(' | ');
      const miss = g.src === 'name' ? 'У структур ' + g.idx.map(k => k + 1).join(', ') + ' в заголовке нет номера — взят номер из имени файла.' : '';
      rows.push({
        name: f.name, fileName: canonName(g.num, whole ? ext : 'mae'), num: g.num, src: g.src, ctIdx: whole ? null : g.idx, split: !whole,
        titleFound: t, ok: true, warn: miss || (g.src === 'entry' ? 'Номер взят из имени записи Maestro (s_m_entry_name).' : '')
      });
    }
    if (lost.length) rows.push({ name: f.name, src: 'title', ctIdx: lost, split: true, titleFound: lost.map(k => f.cts[k].title || '').join(' | '), ok: false, why: 'У структур ' + lost.map(k => k + 1).join(', ') + ' нет номера ни в заголовке, ни в имени файла — не добавлены.' });
    return rows;
  }

  const api = { parseName, parseTitle, planFile, numKey, canonName, placeText, slotId, repoPath, cleanFileName, place, FILES_DIR, EXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PVPlace = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
