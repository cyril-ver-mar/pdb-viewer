/* Редактор учебника (страница без ссылок на неё). Сохраняет structures/_book/book.json и файлы
   структур одним коммитом через GitHub Git Data API с fine-grained токеном учителя.
   Токен: sessionStorage (по умолчанию) или localStorage («Запомнить»); в URL и в файлы не попадает. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const B = window.PVBook;
  const TOK_KEY = 'book-admin-gh-token';
  const DRAFT_KEY = 'book-admin-draft';
  const FILES_DIR = 'structures/_book/files';
  const BRANCH = 'main';
  const STYLES = { '': 'Авто', stick: 'Палочки', ballstick: 'Шарики и палочки', sphere: 'Сферы', line: 'Линии', cartoon: 'Лента (белки)' };
  const ACCEPT = '.pdb,.ent,.sdf,.mol,.mol2,.xyz,.cif,.mmcif,.pqr,.gro,.mae,.maegz';
  // репозиторий: <владелец>.github.io/<репозиторий>/… ; иначе — исходный репозиторий сайта
  const REPO = (function () {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (m && seg && !/\.html$/.test(seg)) return m[1] + '/' + seg;
    return 'cyril-ver-mar/pdb-viewer';
  })();

  let book = null, baseText = '', baseBook = null;
  let CH = 1, SEC = 'm';
  const open = new Set();
  const pending = new Map(); // путь → { b64, size, name }
  let dirty = false;

  // ---------- мелочи ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e[k] = v;
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  }
  function toast(t, ms) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), ms || 2500); }
  function msg(text, kind) { $('msg').innerHTML = ''; if (text) $('msg').appendChild(h('div', { class: 'note ' + (kind || '') }, text)); }
  const bookText = () => JSON.stringify(book, null, 1) + '\n';
  function siteBase() { return location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); }
  function abs(rel) { return siteBase() + rel; }
  function chapter() { return book.chapters.find(c => c.n === CH) || book.chapters[0]; }
  function list(ch, sec) { const k = B.SECTIONS[sec || SEC].key; ch = ch || chapter(); return (ch[k] = ch[k] || []); }
  function markDirty() {
    dirty = true;
    $('dirty').textContent = '· есть несохранённые изменения' + (pending.size ? ' (новых файлов: ' + pending.size + ')' : '');
    $('bSave').disabled = false;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: baseText, book })); } catch (e) { /* переполнено */ }
  }
  function markClean() {
    dirty = false; $('dirty').textContent = ''; $('bSave').disabled = true;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* нет доступа */ }
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- токен ----------
  function getTok() { try { return sessionStorage.getItem(TOK_KEY) || localStorage.getItem(TOK_KEY) || ''; } catch (e) { return ''; } }
  function putTok(t, remember) {
    try {
      sessionStorage.removeItem(TOK_KEY); localStorage.removeItem(TOK_KEY);
      if (t) (remember ? localStorage : sessionStorage).setItem(TOK_KEY, t);
    } catch (e) { /* приватный режим */ }
    tokState();
  }
  function tokState() {
    let where = '';
    try { where = localStorage.getItem(TOK_KEY) ? 'запомнен на этом устройстве' : sessionStorage.getItem(TOK_KEY) ? 'до закрытия вкладки' : ''; } catch (e) { /* */ }
    $('tokState').textContent = where ? '· токен есть, ' + where : '· токена нет';
  }
  $('repoName').textContent = REPO;
  try { $('tokRemember').checked = !!localStorage.getItem(TOK_KEY); } catch (e) { /* */ }
  if (getTok()) $('tok').value = getTok(); else $('tokBox').open = true;
  tokState();
  $('tok').addEventListener('change', () => putTok($('tok').value.trim(), $('tokRemember').checked));
  $('tokRemember').addEventListener('change', () => putTok($('tok').value.trim(), $('tokRemember').checked));
  $('bTokForget').onclick = () => { $('tok').value = ''; putTok(''); $('tokMsg').textContent = 'Токен удалён из браузера.'; };
  $('bTokCheck').onclick = async () => {
    putTok($('tok').value.trim(), $('tokRemember').checked);
    $('tokMsg').textContent = 'Проверяю…';
    try {
      const r = await gh('GET', '');
      const can = r.permissions ? r.permissions.push : null;
      $('tokMsg').textContent = can === false ? 'Токен видит репозиторий, но без права записи. Нужно Contents: Read and write.' : '✔ Доступ к ' + r.full_name + ' есть, можно сохранять.';
    } catch (e) { $('tokMsg').textContent = '✗ ' + e.message; }
  };

  // ---------- GitHub API ----------
  async function gh(method, path, body, accept) {
    const tok = getTok();
    if (!tok) throw new Error('Нет токена GitHub — вставьте его в блок «Доступ к GitHub».');
    const r = await fetch('https://api.github.com/repos/' + REPO + path, {
      method, cache: 'no-store',
      headers: Object.assign({ Authorization: 'Bearer ' + tok, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) {
      let t = ''; try { t = (await r.json()).message || ''; } catch (e) { /* */ }
      const m = r.status === 401 ? 'Токен не принят (неверный или истёк срок). Создайте новый.'
        : r.status === 403 ? 'Нет прав на запись. Токен должен быть выдан на ' + REPO + ' с Contents: Read and write.' + (t ? ' (' + t + ')' : '')
        : r.status === 404 ? 'Репозиторий или файл не найден для этого токена. Проверьте, что в токене выбран ' + REPO + '.'
        : r.status === 409 || r.status === 422 ? 'GitHub отклонил запись (' + (t || r.status) + '). Возможно, репозиторий только что изменился — попробуйте ещё раз.'
        : 'GitHub ответил ' + r.status + (t ? ': ' + t : '');
      const e = new Error(m); e.status = r.status; throw e;
    }
    if (r.status === 204) return null;
    return accept && accept.includes('raw') ? r.text() : r.json();
  }
  async function remoteBookText(ref) {
    try { return await gh('GET', '/contents/' + encodeURI(B.BOOK_PATH) + '?ref=' + encodeURIComponent(ref || BRANCH), null, 'application/vnd.github.raw+json'); }
    catch (e) { if (e.status === 404) return ''; throw e; }
  }
  function refs(bk) {
    const out = new Set();
    const add = p => { for (const it of (p && p.items) || []) if (it && typeof it.s === 'string' && it.s.startsWith('pdb:' + FILES_DIR + '/')) out.add(it.s.slice(4).replace(/#.*$/, '')); };
    for (const ch of (bk && bk.chapters) || []) {
      for (const s of ch.materials || []) add(s);
      for (const s of ch.tasks || []) { add(s.cond); add(s.ans); }
    }
    return out;
  }
  async function save() {
    if (!getTok()) { $('tokBox').open = true; msg('Чтобы сохранить на GitHub, нужен токен (блок «Доступ к GitHub»). Или «Скачать JSON» и загрузить файл вручную.', 'warn'); return false; }
    $('bSave').disabled = true; msg('Сохраняю на GitHub…');
    try {
      const ref = await gh('GET', '/git/ref/heads/' + BRANCH);
      const head = ref.object.sha;
      const remote = await remoteBookText(head);
      if (remote && baseText && remote !== baseText && remote !== bookText()) {
        if (!confirm('Учебник на GitHub изменился после того, как вы открыли редактор (например, на другом устройстве). Перезаписать его вашей версией?')) { msg('Сохранение отменено. Обновите страницу, чтобы взять свежую версию (ваши правки останутся в черновике).', 'warn'); $('bSave').disabled = false; return false; }
      }
      const commit = await gh('GET', '/git/commits/' + head);
      const now = refs(book);
      const tree = [];
      for (const [path, f] of pending) {
        if (!now.has(path)) continue; // файл добавили и тут же убрали
        const blob = await gh('POST', '/git/blobs', { content: f.b64, encoding: 'base64' });
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const before = refs(baseBook);
      const gone = [...before].filter(p => !now.has(p) && !pending.has(p));
      for (const p of gone) tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
      const text = bookText();
      tree.push({ path: B.BOOK_PATH, mode: '100644', type: 'blob', content: text });
      const t = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree });
      const added = tree.length - 1 - gone.length;
      const message = 'Учебник: правки из редактора' + (added ? ', файлов: +' + added : '') + (gone.length ? ', −' + gone.length : '');
      const c = await gh('POST', '/git/commits', { message, tree: t.sha, parents: [head] });
      await gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: c.sha, force: false });
      baseText = text; baseBook = JSON.parse(text); pending.clear(); markClean();
      msg(h('span', {}, '✔ Сохранено (коммит ', h('code', {}, c.sha.slice(0, 7)), '). Через 1–2 минуты GitHub Actions опубликует сайт, после этого ссылки начнут показывать новые рисунки.'), 'ok');
      render();
      return true;
    } catch (e) {
      console.warn(e); msg('Не удалось сохранить: ' + e.message, 'err'); $('bSave').disabled = false; return false;
    }
  }
  $('bSave').onclick = save;

  // ---------- экспорт / импорт ----------
  $('bExport').onclick = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([bookText()], { type: 'application/json' })), download: 'book.json' });
    document.body.appendChild(a); a.click(); a.remove();
    if (pending.size) msg('В JSON нет новых файлов структур (' + pending.size + '). При ручной загрузке положите их на GitHub по путям: ' + [...pending.keys()].join(', '), 'warn');
  };
  $('fImport').onchange = async () => {
    const f = $('fImport').files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || !Array.isArray(j.chapters)) throw new Error('это не файл учебника (нет chapters)');
      book = j; markDirty(); render(); toast('JSON загружен. Нажмите «Сохранить на GitHub».');
    } catch (e) { msg('Не удалось прочитать JSON: ' + e.message, 'err'); }
    $('fImport').value = '';
  };

  // ---------- QR (как на странице учителя) ----------
  function makeQR(text) { const n = new TextEncoder().encode(text).length; const q = qrcode(0, n < 600 ? 'M' : 'L'); q.addData(text, 'Byte'); q.make(); return q; }
  function drawQR(canvas, text) {
    const ctx = canvas.getContext('2d'); const W = canvas.width;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, W);
    const q = makeQR(text), n = q.getModuleCount(), quiet = 4;
    const cell = Math.floor(W / (n + quiet * 2)) || 1, off = Math.floor((W - cell * n) / 2);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    canvas.dataset.ok = '1';
  }
  function qrPNG(text, title) {
    const q = makeQR(text), n = q.getModuleCount(), quiet = 4;
    const cell = Math.max(8, Math.ceil(1600 / (n + quiet * 2)));
    const S = cell * (n + quiet * 2), cap = title ? Math.round(S * 0.11) : 0;
    const c = document.createElement('canvas'); c.width = S; c.height = S + cap;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
    if (title) {
      let fs = Math.round(cap * 0.5); x.font = 'bold ' + fs + 'px sans-serif';
      while (x.measureText(title).width > S * 0.92 && fs > 10) { fs -= 2; x.font = 'bold ' + fs + 'px sans-serif'; }
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(title, S / 2, S + cap * 0.35);
    }
    return c.toDataURL('image/png');
  }
  function safeName(s) { return String(s || 'qr').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80); }
  function linkBlock(url, title, withQR) {
    const inp = h('input', { value: url, readonly: true, 'data-link': '1' });
    const copy = h('button', { type: 'button', class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(url); } catch (e) { inp.select(); document.execCommand('copy'); } toast('Ссылка скопирована'); } }, 'Копировать');
    const openA = h('a', { class: 'btn sm', href: url, target: '_blank', rel: 'noopener' }, 'Открыть');
    const box = h('div', {}, h('div', { class: 'linkrow' }, h('b', { style: 'min-width:120px' }, title), inp, copy, openA));
    const cv = h('canvas', { width: 320, height: 320 });
    const png = h('button', { type: 'button', class: 'btn sm', onclick: () => { const a = h('a', { href: qrPNG(url, title), download: 'QR_' + safeName(title) + '.png' }); document.body.appendChild(a); a.click(); a.remove(); } }, 'Скачать QR (PNG)');
    const qrBox = h('div', { class: 'qr' + (withQR ? '' : ' hidden') }, cv, png);
    const qrBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => { qrBox.classList.toggle('hidden'); if (!cv.dataset.ok) drawQR(cv, url); } }, 'QR');
    box.querySelector('.linkrow').appendChild(qrBtn);
    if (withQR) drawQR(cv, url);
    box.appendChild(qrBox);
    return box;
  }

  // ---------- рисунки ----------
  function partCount(p) { return p && p.set ? 'набор' : B.countItems(p); }
  function badge(slot) {
    if (!B.filled(slot)) return 'пусто — ученики не видят';
    const hid = slot.hidden ? ' · скрыт' : '';
    if (B.isTask(slot)) return 'условие: ' + (partCount(slot.cond) || '—') + ' · ответ: ' + (partCount(slot.ans) || '—') + hid;
    const n = partCount(slot);
    return (n === 'набор' ? 'готовый набор' : n + ' стр.') + hid;
  }
  function styleSelect(obj, key, onchange) {
    const s = h('select', { onchange: () => { if (s.value) obj[key] = s.value; else delete obj[key]; onchange && onchange(); markDirty(); } });
    for (const [k, v] of Object.entries(STYLES)) s.appendChild(h('option', { value: k }, v));
    s.value = obj[key] || '';
    return s;
  }
  function parseControls(text) {
    const out = [];
    String(text || '').split('\n').forEach((line, i) => {
      const m = /^\s*([^:]+?)\s*:\s*(.+)$/.exec(line);
      if (!m) return;
      const opts = m[2].split(/[;|]/).map(x => x.trim()).filter(Boolean);
      if (opts.length) out.push({ key: 'k' + (out.length + 1), label: m[1], options: opts.map((t, j) => ({ v: String(j + 1), t })) });
    });
    return out;
  }
  function controlsText(ctr) { return (ctr || []).map(c => c.label + ': ' + c.options.map(o => o.t).join('; ')).join('\n'); }
  function fileToB64(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  }
  // структуры в файле Maestro: [{title}] (для других форматов — [])
  async function fileText(f) {
    const buf = new Uint8Array(await f.arrayBuffer());
    return new TextDecoder().decode(buf[0] === 0x1f && buf[1] === 0x8b && window.pako ? pako.ungzip(buf) : buf);
  }
  async function maeCts(f) {
    if (!/\.(mae|maegz|mae\.gz)$/i.test(f.name) || !window.PVMae) return [];
    try { return PVMae.summary(await fileText(f)).map(c => ({ title: c.title || c.entryName, info: c })); }
    catch (e) { toast('Файл ' + f.name + ': ' + e.message, 5000); return []; }
  }

  // ---------- загрузка многих файлов по именам (assets/book-place.js) ----------
  async function bulk(files) {
    files = [...files]; if (!files.length) return;
    const merge = $('bulkMerge').checked;
    const entries = [], infos = [];
    for (const f of files) {
      const cts = await maeCts(f);
      infos.push(cts);
      entries.push({ name: f.name, cts: merge && cts.length > 1 ? [{ title: cts.map(c => c.title).filter(Boolean).join(' + ') }] : cts.map(c => ({ title: c.title })) });
    }
    const res = PVPlace.place(book, entries);
    const rows = [];
    for (let i = 0; i < files.length; i++) {
      const r = res.report[i], f = files[i];
      if (r.ok) {
        pending.set(r.path, { b64: await fileToB64(f), size: f.size, name: f.name });
        open.add(r.id);
        const where = r.title + (r.task ? ' → ' + (r.part === 'ans' ? 'Ответ' : 'Условие') : '');
        const info = infos[i].map(c => c.info).filter(Boolean).map(c => c.formula + ', атомов ' + c.atoms + (c.zeroOrder ? ', связей нулевого порядка ' + c.zeroOrder : '')).join('; ');
        rows.push(h('li', { 'data-ok': '1' }, h('b', {}, f.name), ' → ', where, ': ', r.variants.join(', '), r.created ? ' (новый рисунок)' : '', r.replaced ? ' (файл заменён)' : '', info ? h('span', { class: 'muted' }, ' · ' + info) : null, r.note ? h('div', { class: 'muted' }, r.note) : null));
      } else rows.push(h('li', { 'data-ok': '0', style: 'color:#b91c1c' }, h('b', {}, f.name), ': ', r.why));
    }
    $('bulkReport').innerHTML = '';
    $('bulkReport').appendChild(h('ul', { style: 'margin:8px 0 0 18px;padding:0;font-size:14px' }, rows));
    const okN = res.report.filter(r => r.ok).length;
    if (okN) {
      const first = res.report.find(r => r.ok);
      const p = PVPlace.parseName(first.name);
      CH = p.ch; SEC = p.task ? 't' : 'm';
      markDirty(); render();
      toast('Разложено файлов: ' + okN + ' из ' + files.length + '. Проверьте и нажмите «Сохранить на GitHub».', 4000);
    } else toast('Ни один файл не подошёл по имени', 4000);
  }
  if ($('fBulk')) {
    $('fBulk').onchange = async () => { await bulk($('fBulk').files); $('fBulk').value = ''; };
    const d = $('bulkDrop');
    ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.style.borderColor = 'var(--ui-accent, #3b82f6)'; }));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.style.borderColor = ''; }));
    d.addEventListener('drop', e => bulk(e.dataTransfer.files));
    d.onclick = () => $('fBulk').click();
  }
  function cleanFileName(n) { return String(n).replace(/[^\w.\-а-яё]+/gi, '_').replace(/^_+|_+$/g, '') || 'structure.pdb'; }

  function partEditor(slot, part, label, rerender) {
    const box = h('div', { class: 'part' }, h('h4', {}, label));
    part.items = part.items || [];
    const ctr = part.controls || [];
    // список структур
    part.items.forEach((it, i) => {
      const row = h('div', { class: 'item' });
      row.appendChild(h('input', { class: 'lab', value: it.t || '', placeholder: 'Подпись (видна в меню)', oninput: e => { it.t = e.target.value; markDirty(); } }));
      const src = String(it.s || '');
      row.appendChild(h('code', { title: src }, src.replace(/^pdb:structures\/_book\/files\//, 'файл: ')));
      if (src.startsWith('pdb:') && pending.has(src.slice(4))) row.appendChild(h('span', { class: 'pend' }, 'не сохранён'));
      const p = Object.assign({}, it.p || {});
      row.appendChild(styleSelect(p, 'style', () => { if (Object.keys(p).length) it.p = p; else delete it.p; }));
      for (const c of ctr) {
        const s = h('select', { title: c.label, onchange: () => { it.sel = it.sel || {}; it.sel[c.key] = s.value; markDirty(); } }, h('option', { value: '' }, c.label + ': —'), c.options.map(o => h('option', { value: o.v }, c.label + ': ' + o.t)));
        s.value = (it.sel && it.sel[c.key]) || '';
        row.appendChild(s);
      }
      row.append(
        h('button', { type: 'button', class: 'btn sm', title: 'Выше', disabled: i === 0, onclick: () => { part.items.splice(i - 1, 0, part.items.splice(i, 1)[0]); markDirty(); rerender(); } }, '↑'),
        h('button', { type: 'button', class: 'btn sm', title: 'Ниже', disabled: i === part.items.length - 1, onclick: () => { part.items.splice(i + 1, 0, part.items.splice(i, 1)[0]); markDirty(); rerender(); } }, '↓'),
        h('button', { type: 'button', class: 'btn sm dang', title: 'Убрать', onclick: () => { part.items.splice(i, 1); markDirty(); rerender(); } }, '✕'));
      box.appendChild(row);
    });
    if (!part.items.length) box.appendChild(h('p', { class: 'muted', style: 'margin:4px 0' }, 'Структур нет.'));
    // добавить
    const fin = h('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true, onchange: async () => {
      for (const f of fin.files) {
        const path = FILES_DIR + '/ch' + CH + '/' + slot.id + '/' + cleanFileName(f.name.replace(/\.mae\.gz$/i, '.maegz'));
        pending.set(path, { b64: await fileToB64(f), size: f.size, name: f.name });
        const base = f.name.replace(/\.(mae\.gz|[^.]+)$/i, '');
        const cts = await maeCts(f);
        if (cts.length > 1) cts.forEach((c, k) => part.items.push(Object.assign({ t: (c.title || base) + ' (' + (k + 1) + ')', s: 'pdb:' + path + '#ct=' + (k + 1) }, c.title ? { desc: c.title } : {})));
        else part.items.push({ t: (cts[0] && cts[0].title) || base, s: 'pdb:' + path });
      }
      markDirty(); rerender();
    } });
    const refIn = h('input', { class: 'grow', placeholder: 'или источник: id:1CRN, cid:2519, cod:1000041, e:папка/запись, pdb:structures/…' });
    const addRef = () => {
      const v = refIn.value.trim(); if (!v) return;
      try { PVSetLike(v); } catch (e) { toast(e.message, 4000); return; }
      part.items.push({ t: '', s: v }); markDirty(); rerender();
    };
    box.appendChild(h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn pri sm', onclick: () => fin.click() }, '+ Файлы (MAE, PDB, SDF, MOL, XYZ, CIF)'), fin,
      refIn, h('button', { type: 'button', class: 'btn sm', onclick: addRef }, '+ Источник')));
    // переключение
    const mode = h('select', { onchange: () => {
      if (mode.value === 'p') part.controls = parseControls('Параметр: вариант 1; вариант 2');
      else delete part.controls;
      markDirty(); rerender();
    } }, h('option', { value: 'l' }, 'Список: кнопка на каждую структуру'), h('option', { value: 'p' }, 'Параметры: несколько рядов кнопок (как краун-эфиры)'));
    mode.value = ctr.length ? 'p' : 'l';
    box.appendChild(h('label', { class: 'f' }, 'Переключение структур (если их больше одной)'));
    box.appendChild(h('div', { class: 'row' }, mode,
      h('label', { class: 'row', style: 'margin:0' }, h('input', { type: 'checkbox', checked: !!part.keep, onchange: e => { if (e.target.checked) part.keep = true; else delete part.keep; markDirty(); } }), 'Наложение: камера не сбрасывается при переключении')));
    if (ctr.length) {
      const ta = h('textarea', { rows: 3, placeholder: 'Размер: 12-краун-4; 15-краун-5; 18-краун-6\nИон: нет; Na⁺; K⁺' });
      ta.value = controlsText(ctr);
      ta.onchange = () => { part.controls = parseControls(ta.value); markDirty(); rerender(); };
      box.append(h('label', { class: 'f' }, 'Параметры: по строке «Название: вариант; вариант; …». Затем у каждой структуры выберите значения. Каждое сочетание — одна структура.'), ta);
    }
    // готовый набор
    const setIn = h('input', { class: 'grow', value: part.set || '', placeholder: 'например, _supra/crown/complexes', onchange: () => { const v = setIn.value.trim(); if (v) part.set = v; else delete part.set; markDirty(); rerender(); } });
    box.append(h('label', { class: 'f' }, 'Готовый набор *.set.json (если указан, список выше не используется)'), h('div', { class: 'row' }, setIn));
    return box;
  }
  // проверка источника без загрузки
  function PVSetLike(v) {
    if (!/^(e|pdb|id|cod|cid|ccdc|url):.+/.test(v)) throw new Error('Источник должен начинаться с id:, cid:, cod:, ccdc:, e:, pdb: или url:');
  }

  function slotRow(slot, i, arr) {
    const task = SEC === 't';
    const el = h('div', { class: 'slot' + (B.filled(slot) ? ' filled' : '') + (slot.hidden ? ' hid' : '') + (open.has(slot.id) ? ' open' : ''), 'data-id': slot.id });
    const rerender = () => { const n = slotRow(slot, i, arr); el.replaceWith(n); };
    const title = h('input', { class: 'title', value: slot.title || '', 'aria-label': 'Название рисунка', oninput: e => { slot.title = e.target.value; markDirty(); } });
    el.appendChild(h('div', { class: 'head' },
      h('span', { class: 'num' }, String(i + 1)), title,
      h('span', { class: 'badge' }, badge(slot)),
      h('button', { type: 'button', class: 'btn sm', title: 'Выше', disabled: i === 0, onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); markDirty(); renderSlots(); } }, '↑'),
      h('button', { type: 'button', class: 'btn sm', title: 'Ниже', disabled: i === arr.length - 1, onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); markDirty(); renderSlots(); } }, '↓'),
      h('button', { type: 'button', class: 'btn sm', 'data-act': 'edit', onclick: () => { if (open.has(slot.id)) open.delete(slot.id); else open.add(slot.id); rerender(); } }, open.has(slot.id) ? 'Свернуть' : 'Изменить')));
    if (!open.has(slot.id)) return el;
    const ed = h('div', { class: 'ed' });
    ed.append(h('label', { class: 'f' }, 'Подпись (видна ученикам под названием)'),
      h('textarea', { rows: 2, oninput: e => { slot.caption = e.target.value; markDirty(); } }, slot.caption || ''));
    if (task) ed.append(h('label', { class: 'f' }, 'Текст условия задачи'), h('textarea', { rows: 3, 'data-f': 'text', oninput: e => { slot.text = e.target.value; markDirty(); } }, slot.text || ''));
    const sp = Object.assign({}, slot.params || {});
    ed.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Стиль по умолчанию:'), styleSelect(sp, 'style', () => { if (Object.keys(sp).length) slot.params = sp; else delete slot.params; }),
      h('label', { class: 'row', style: 'margin:0 0 0 12px' }, h('input', { type: 'checkbox', checked: !!slot.hidden, onchange: e => { if (e.target.checked) slot.hidden = true; else delete slot.hidden; markDirty(); rerender(); } }), 'Скрыть от учеников')));
    if (task) {
      slot.cond = slot.cond || { items: [] }; slot.ans = slot.ans || { items: [] };
      ed.append(partEditor(slot, slot.cond, 'Условие (структуры на кнопке «Условие»)', rerender), partEditor(slot, slot.ans, 'Ответ (структуры на кнопке «Ответ», скрыты до нажатия)', rerender));
    } else ed.append(partEditor(slot, slot, 'Структуры рисунка', rerender));
    ed.append(h('label', { class: 'f' }, 'Прямая ссылка на рисунок (для QR). Открывается после сохранения и публикации.'), linkBlock(abs(B.figHref(slot.id)), slot.title || slot.id, false));
    ed.append(h('div', { class: 'row' }, h('span', { class: 'muted grow' }, 'id: ' + slot.id), h('button', { type: 'button', class: 'btn sm dang', onclick: () => {
      if (!confirm('Удалить «' + (slot.title || slot.id) + '» из списка?')) return;
      arr.splice(i, 1); open.delete(slot.id); markDirty(); renderSlots();
    } }, 'Удалить рисунок')));
    el.appendChild(ed);
    return el;
  }
  function renderSlots() {
    const arr = list();
    const box = $('slots'); box.innerHTML = '';
    arr.forEach((s, i) => box.appendChild(slotRow(s, i, arr)));
    const filledN = arr.filter(B.filled).length;
    $('secInfo').textContent = 'Всего: ' + arr.length + ' · заполнено: ' + filledN + ' · ученики видят: ' + arr.filter(B.visibleToStudents).length;
  }
  function addSlot() {
    const ch = chapter();
    const seq = B.nextSeq(ch, SEC);
    const s = B.newSlot(ch.n, SEC, seq);
    s.title = (SEC === 'm' ? 'Рис. ' : 'Задача ') + ch.n + '.' + (list().length + 1);
    while (list().some(x => x.id === s.id)) s.id += 'x';
    list().push(s); open.add(s.id); markDirty(); renderSlots();
    const el = document.querySelector('.slot[data-id="' + s.id + '"]');
    if (el) { el.scrollIntoView({ block: 'center' }); el.querySelector('input.title').focus(); }
  }
  $('bAdd').onclick = addSlot; $('bAdd2').onclick = addSlot;
  $('bExpandAll').onclick = () => { for (const s of list()) if (B.filled(s)) open.add(s.id); renderSlots(); };

  function render() {
    $('bookTitle').value = book.title || '';
    const ct = $('chTabs'); ct.innerHTML = '';
    for (const ch of book.chapters) ct.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(ch.n === CH), 'data-ch': ch.n, onclick: () => { CH = ch.n; render(); } }, 'Глава ' + ch.n));
    $('chTitle').value = chapter().title || '';
    const st = $('secTabs'); st.innerHTML = '';
    for (const k of ['m', 't']) st.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === SEC), 'data-sec': k, onclick: () => { SEC = k; render(); } }, B.SECTIONS[k].name + ' (' + list(chapter(), k).length + ')'));
    const L = $('links'); L.innerHTML = '';
    L.appendChild(linkBlock(abs(B.bookHref()), 'Весь учебник', false));
    L.appendChild(linkBlock(abs(B.bookHref(CH)), 'Глава ' + CH, true));
    renderSlots();
  }
  $('bookTitle').oninput = e => { book.title = e.target.value; markDirty(); };
  $('chTitle').oninput = e => { chapter().title = e.target.value; markDirty(); };

  // ---------- загрузка ----------
  async function load() {
    let text = '';
    try {
      if (getTok()) text = await remoteBookText(BRANCH);
    } catch (e) { msg('Не удалось прочитать учебник через GitHub (' + e.message + '). Беру опубликованную версию.', 'warn'); }
    if (!text) {
      try { text = (await B.loadBook({ withText: true })).text; }
      catch (e) { text = JSON.stringify(B.emptyBook(), null, 1) + '\n'; msg('Файла учебника ещё нет — создан пустой. Нажмите «Сохранить на GitHub».', 'warn'); }
    }
    baseText = text; baseBook = JSON.parse(text); book = JSON.parse(text);
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { /* */ }
    if (draft && draft.book && draft.base === baseText && JSON.stringify(draft.book, null, 1) + '\n' !== baseText) {
      book = draft.book; dirty = true;
      msg(h('span', {}, 'Восстановлены несохранённые правки из прошлого раза (без новых файлов). ',
        h('button', { type: 'button', class: 'btn sm', onclick: () => { book = JSON.parse(baseText); markClean(); msg(''); render(); } }, 'Отбросить их')), 'warn');
      markDirty();
    } else if (draft) { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* */ } }
    render();
  }
  window.bookAdmin = { bulk, get book() { return book; }, get pending() { return pending; }, get dirty() { return dirty; }, save, render, REPO, select: (ch, sec) => { CH = ch; SEC = sec; render(); } };
  load();
})();
