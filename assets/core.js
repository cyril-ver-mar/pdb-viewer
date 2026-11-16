/* Общий код просмотрщика: загрузка структур, параметры URL, стили 3Dmol, кристаллы, каталог. */
(function () {
  'use strict';
  const WATERS = ['HOH', 'WAT', 'H2O', 'DOD', 'SOL', 'TIP', 'TIP3'];
  const FORMATS = { pdb: 'pdb', ent: 'pdb', pqr: 'pqr', cif: 'cif', mmcif: 'cif', mcif: 'cif', sdf: 'sdf', mol: 'sdf', sd: 'sdf', mol2: 'mol2', xyz: 'xyz', gro: 'gro' };
  const STYLES = {
    auto: 'Авто', cartoon: 'Лента (cartoon)', stick: 'Палочки', ballstick: 'Шарики и палочки', sphere: 'Сферы (Ван-дер-Ваальс)', line: 'Линии'
  };
  const COLORS = { auto: 'Авто', element: 'По элементам', chain: 'По цепям', spectrum: 'Радуга (N→C)', ss: 'Вторичная структура', charge: 'По заряду', hp: 'Гидрофобность' };
  const LABELS = { off: 'Нет', atoms: 'Атомы', res: 'Остатки' };
  const REPS = { '': '1×1×1', '2x2x2': '2×2×2', '3x3x3': '3×3×3' };
  const DEFAULTS = { style: 'auto', color: 'auto', bg: 'ffffff', spin: '0', labels: 'off', surface: '0', sop: '0.6', water: '0', h: '1', lock: '0', title: '', view: '', fmt: '', cell: '0', rep: '', addh: '0', ix: '', ixsel: 'all', ixch: '', ixres: '', ixrad: '8', scol: '', ssel: 'all', sch: '', sres: '', meas: '' };
  const MEAS_NEED = { d: 2, a: 3, t: 4 };
  const MEAS_NAME = { d: 'Расстояние', a: 'Угол', t: 'Двугранный угол' };

  // ---------- параметры ----------
  function parseParams(loc) {
    loc = loc || location;
    const q = new URLSearchParams(loc.search);
    const h = new URLSearchParams((loc.hash || '').replace(/^#/, ''));
    const o = Object.assign({}, DEFAULTS);
    o.explicit = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (q.has(k)) { o[k] = q.get(k); o.explicit[k] = true; }
      else if (h.has(k)) { o[k] = h.get(k); o.explicit[k] = true; }
    }
    if (o.style === 'ball-and-stick' || o.style === 'ball' || o.style === 'bs') o.style = 'ballstick';
    if (o.style === 'lines') o.style = 'line';
    if (o.style === 'spheres') o.style = 'sphere';
    if (o.style === 'sticks') o.style = 'stick';
    if (!STYLES[o.style]) o.style = 'auto';
    if (o.color === 'secondary' || o.color === 'sstruc') o.color = 'ss';
    if (!COLORS[o.color]) o.color = 'auto';
    if (!LABELS[o.labels]) o.labels = (o.labels === '1' || o.labels === 'true') ? 'atoms' : 'off';
    o.entry = q.get('e') || h.get('e') || '';
    o.src = null;
    if (o.entry) {
      /* источник подставит applyCatalogEntry */
    } else if (h.has('d')) o.src = { kind: 'data', data: h.get('d'), name: h.get('n') || 'structure.' + (o.fmt || 'pdb') };
    else if (q.has('pdb')) o.src = { kind: 'repo', path: q.get('pdb') };
    else if (q.has('file')) o.src = { kind: 'repo', path: q.get('file') };
    else if (q.has('cod')) o.src = { kind: 'cod', id: q.get('cod').trim() };
    else if (q.has('ccdc')) o.src = { kind: 'ccdc', id: q.get('ccdc').trim() };
    else if (q.has('url')) o.src = { kind: 'url', url: q.get('url') };
    else if (q.has('id')) o.src = { kind: 'rcsb', id: q.get('id').trim().toUpperCase() };
    else if (q.has('cid')) o.src = { kind: 'pubchem', cid: q.get('cid').trim() };
    if (o.src && o.src.kind === 'cod') {
      if (!o.explicit.style) o.style = 'ballstick';
      if (!o.explicit.cell) o.cell = '1';
    }
    return o;
  }
  function isOn(v) { return v === '1' || v === 'true' || v === 'yes' || v === 'on'; }

  function buildQuery(src, o) {
    const p = new URLSearchParams();
    if (src) {
      if (src.kind === 'repo') p.set('pdb', src.path);
      else if (src.kind === 'url') p.set('url', src.url);
      else if (src.kind === 'rcsb') p.set('id', src.id);
      else if (src.kind === 'pubchem') p.set('cid', src.cid);
      else if (src.kind === 'cod') p.set('cod', src.id);
      else if (src.kind === 'ccdc') p.set('ccdc', src.id);
      else if (src.kind === 'entry') p.set('e', src.path);
    }
    const skipRest = src && src.kind === 'entry';
    if (!skipRest) {
      for (const k of Object.keys(DEFAULTS)) {
        if (k === 'fmt' && src && src.kind !== 'data' && !o.fmt) continue;
        if (o[k] != null && String(o[k]) !== DEFAULTS[k] && String(o[k]) !== '') p.set(k, o[k]);
      }
    }
    let s = p.toString().replace(/%2F/gi, '/');
    if (src && src.kind === 'data') s += (s ? '' : '') + '#d=' + src.data + (src.name ? '&n=' + encodeURIComponent(src.name) : '');
    return s;
  }
  function entryHref(entryPath) { return '?' + buildQuery({ kind: 'entry', path: entryPath }, DEFAULTS); }

  // ---------- загрузка ----------
  function extFormat(name) {
    const m = /\.([a-z0-9]+)(?:\.gz)?(?:[?#].*)?$/i.exec(name || '');
    return m ? (FORMATS[m[1].toLowerCase()] || '') : '';
  }
  function sniffFormat(text) {
    const head = text.slice(0, 4000);
    if (/^\s*data_/m.test(head) && /_atom_site\.|_atom_site_|_struct\./.test(text.slice(0, 200000))) return 'cif';
    if (/@<TRIPOS>/.test(head)) return 'mol2';
    if (/V2000|V3000/.test(head) || /M {2}END/.test(text)) return 'sdf';
    if (/^(ATOM  |HETATM|HEADER|CRYST1|MODEL )/m.test(head)) return 'pdb';
    if (/^\s*\d+\s*$/m.test(text.split('\n')[0] || '')) return 'xyz';
    return 'pdb';
  }
  function isCifText(text) {
    if (!text || text.length < 40) return false;
    const head = text.slice(0, 600).toLowerCase();
    if (head.includes('<!doctype') || head.includes('<html')) return false;
    return /data_/i.test(text) && /_atom_site/i.test(text);
  }
  async function fetchText(url) {
    let r;
    try { r = await fetch(url, { cache: 'default' }); }
    catch (e) { throw new Error('Не удалось скачать файл (нет сети или сервер не разрешает загрузку с другого сайта — CORS).'); }
    if (!r.ok) throw new Error('Файл не найден (HTTP ' + r.status + '): ' + url);
    const buf = await r.arrayBuffer();
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0x1f && u8[1] === 0x8b && window.pako) return new TextDecoder().decode(window.pako.ungzip(u8));
    return new TextDecoder().decode(u8);
  }
  function localDevHost() {
    const h = (typeof location !== 'undefined' && location.hostname) || '';
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
  }
  function codCifUrl(id) { return 'https://www.crystallography.net/cod/' + id + '.cif'; }
  function codPage(id) { return 'https://www.crystallography.net/cod/' + id + '.html'; }
  function codSearchPage(q) { return 'https://www.crystallography.net/cod/result?text=' + encodeURIComponent(q || ''); }
  function ccdcLink(id) {
    return 'https://www.ccdc.cam.ac.uk/structures/Search?Ccdcid=' + encodeURIComponent(String(id || '').trim()) + '&DatabaseToSearch=Published';
  }
  function maybeExpand(text, fmt) {
    if (fmt !== 'cif' || !text) return text;
    try { return expandCrystalCif(text) || text; } catch (e) { return text; }
  }

  let _indexP = null;
  function loadIndex() {
    if (_indexP) return _indexP;
    _indexP = (async () => {
      try {
        const r = await fetch(new URL('structures/index.json', location.href).href, { cache: 'no-cache' });
        if (!r.ok) throw new Error('index ' + r.status);
        return await r.json();
      } catch (e) {
        _indexP = null;
        return { version: 2, legacy: {}, codFiles: {}, tree: { path: '', title: 'Каталог', description: '', folders: [], entries: [] }, flat: [] };
      }
    })();
    return _indexP;
  }
  function flatEntries(index) {
    if (index && index.flat && index.flat.length) return index.flat;
    const acc = [];
    (function walk(n) {
      if (!n) return;
      for (const e of n.entries || []) acc.push(e);
      for (const f of n.folders || []) walk(f);
    })(index && index.tree);
    return acc;
  }
  function normEntryPath(p) {
    let s = String(p || '').trim().replace(/^\/+|\/+$/g, '').replace(/^structures\//, '');
    try { s = decodeURIComponent(s); } catch (e) { /* уже разобрано */ }
    return s;
  }
  function findEntry(index, path) {
    const want = normEntryPath(path);
    const list = flatEntries(index);
    const exact = list.find(e => e.path === want);
    if (exact) return exact;
    const bySlug = list.filter(e => e.slug === want);
    return bySlug.length === 1 ? bySlug[0] : null;
  }
  function findFolder(index, path) {
    const want = normEntryPath(path);
    let node = index.tree || { folders: [], entries: [] };
    if (!want) return node;
    const parts = want.split('/');
    for (const part of parts) {
      node = (node.folders || []).find(f => f.path === (node.path ? node.path + '/' + part : part) || f.title === part || (f.path || '').split('/').pop() === part);
      if (!node) return null;
    }
    return node;
  }
  function sourceFromEntry(entry) {
    const s = entry.source || { type: 'file' };
    const folder = entry.path && entry.path.includes('/') ? entry.path.split('/').slice(0, -1).join('/') : '';
    const filePath = s.file ? ('structures/' + (folder ? folder + '/' : '') + s.file) : '';
    const type = s.type || 'file';
    if (type === 'rcsb') return { kind: 'rcsb', id: String(s.id || '').toUpperCase() };
    if (type === 'pubchem') return { kind: 'pubchem', cid: String(s.cid || s.id || '') };
    if (type === 'url' && s.url) return { kind: 'url', url: s.url };
    if (type === 'cod') {
      if (filePath) return { kind: 'repo', path: filePath, cod: String(s.id || ''), link: codPage(s.id) };
      return { kind: 'cod', id: String(s.id || '') };
    }
    if (type === 'ccdc') {
      if (filePath) return { kind: 'repo', path: filePath, ccdc: String(s.id || ''), link: ccdcLink(s.id) };
      return { kind: 'ccdc', id: String(s.id || '') };
    }
    return { kind: 'repo', path: filePath };
  }
  async function applyCatalogEntry(o) {
    if (!o.entry) return o;
    const index = await loadIndex();
    const entry = findEntry(index, o.entry);
    if (!entry) throw new Error('В каталоге нет записи «' + o.entry + '».');
    const params = entry.params || {};
    for (const k of Object.keys(DEFAULTS)) {
      if (!o.explicit[k] && params[k] != null && String(params[k]) !== '') o[k] = String(params[k]);
    }
    if (!o.explicit.title && entry.title) o.title = entry.title;
    o.src = sourceFromEntry(entry);
    o.entryMeta = entry;
    return o;
  }
  async function fetchRepo(srcPath) {
    const rel = String(srcPath).replace(/^\.\//, '').replace(/^structures\//, '');
    // Старые ссылки ?pdb=structures/1crn.pdb ведут на файл, которого уже нет в корне.
    // Карту читаем заранее, чтобы не запрашивать заведомо отсутствующий адрес (404 в консоли).
    if (rel && !rel.includes('/')) {
      const index = await loadIndex();
      const mapped = index.legacy && index.legacy[rel];
      if (mapped) {
        const url2 = new URL('structures/' + mapped, location.href).href;
        return { text: await fetchText(url2), url: url2, legacy: mapped };
      }
    }
    const url = new URL(srcPath, location.href).href;
    return { text: await fetchText(url), url };
  }
  async function fetchCodRecord(id) {
    id = String(id || '').trim();
    if (!/^\d{4,10}$/.test(id)) throw new Error('Неверный номер COD: «' + id + '». Пример: 1000041');
    const official = codCifUrl(id);
    const index = await loadIndex();
    const rel = index.codFiles && index.codFiles[id];
    async function fromRel() {
      const url = new URL('structures/' + rel, location.href).href;
      const text = await fetchText(url);
      if (!isCifText(text)) throw new Error('файл');
      return { text: maybeExpand(text, 'cif'), fmt: 'cif', name: id + '.cif', origin: 'COD ' + id, link: codPage(id), url: official, cod: id };
    }
    // На опубликованном сайте сначала файл из репозитория: прокси без
    // зарегистрированного домена отвечает 403 и засоряет консоль.
    if (!localDevHost() && rel) {
      try { return await fromRel(); } catch (e) { /* дальше прокси */ }
    }
    try {
      const text = await fetchText('https://proxy.corsfix.com/?' + official);
      if (isCifText(text)) return { text: maybeExpand(text, 'cif'), fmt: 'cif', name: id + '.cif', origin: 'COD ' + id, link: codPage(id), url: official, cod: id };
    } catch (e) { /* прокси недоступен или домен не разрешён */ }
    if (rel) {
      try { return await fromRel(); } catch (e) { /* нет и локальной копии */ }
    }
    const err = new Error('COD ' + id + ' не открылся. У crystallography.net нет заголовка CORS, браузер не может скачать CIF напрямую. Локально страницу выручает прокси Corsfix; на GitHub Pages он отвечает, только если домен сайта один раз добавлен на corsfix.com. Надёжный путь для урока — скачать CIF и положить его в каталог. Файл: ' + official);
    err.link = codPage(id);
    throw err;
  }
  async function fetchCcdcRecord(raw) {
    const id = String(raw || '').trim().replace(/^CCDC\s*/i, '').replace(/\s+/g, '');
    if (!/^(\d{4,10}|[A-Za-z]{6}\d{0,2})$/.test(id)) throw new Error('Неверный номер CCDC или рефкод: «' + raw + '». Пример номера: 710857, рефкод: CAFINE.');
    const page = ccdcLink(id);
    // Публичная страница поиска отдаёт HTML. Скачивание CIF включается только после
    // согласия с условиями (имя, почта, организация) и не имеет стабильного CORS-адреса.
    if (localDevHost()) {
      try {
        const text = await fetchText('https://proxy.corsfix.com/?' + page);
        if (isCifText(text)) return { text: maybeExpand(text, 'cif'), fmt: 'cif', name: id + '.cif', origin: 'CCDC ' + id, link: page, ccdc: id };
      } catch (e) { /* сеть */ }
    }
    const err = new Error('CCDC не отдаёт CIF в браузер. Access Structures показывает карточку структуры, а файл скачивается только после согласия с условиями (имя, почта, организация). Открытого адреса без входа и без CORS нет. Скачайте CIF на сайте CCDC и перетащите его на странице учителя: номер сохранится в каталоге вместе со ссылкой.');
    err.link = page;
    throw err;
  }
  async function loadSource(src, o) {
    const fmtOverride = o && o.fmt ? (FORMATS[o.fmt] || o.fmt) : '';
    if (!src) throw new Error('Не указана структура.');
    if (src.kind === 'data') {
      const text = decodeData(src.data);
      const fmt = fmtOverride || extFormat(src.name) || sniffFormat(text);
      return { text: maybeExpand(text, fmt), fmt, name: src.name, origin: 'встроена в ссылку' };
    }
    if (src.kind === 'repo') {
      const got = await fetchRepo(src.path);
      const fmt = fmtOverride || extFormat(got.url || src.path) || sniffFormat(got.text);
      const out = { text: maybeExpand(got.text, fmt), fmt, name: (got.url || src.path).split('/').pop().split('?')[0], origin: src.path, url: got.url };
      if (src.cod) { out.origin = 'COD ' + src.cod; out.link = src.link || codPage(src.cod); out.cod = src.cod; }
      if (src.ccdc) { out.origin = 'CCDC ' + src.ccdc; out.link = src.link || ccdcLink(src.ccdc); out.ccdc = src.ccdc; }
      if (got.legacy) out.origin = src.path + ' → ' + got.legacy;
      return out;
    }
    if (src.kind === 'url') {
      const text = await fetchText(src.url);
      const fmt = fmtOverride || extFormat(src.url) || sniffFormat(text);
      return { text: maybeExpand(text, fmt), fmt, name: decodeURIComponent(src.url.split('?')[0].split('/').pop() || 'structure'), origin: src.url, url: src.url };
    }
    if (src.kind === 'cod') return fetchCodRecord(src.id);
    if (src.kind === 'ccdc') return fetchCcdcRecord(src.id);
    if (src.kind === 'rcsb') {
      if (!/^[0-9][A-Z0-9]{3}$/.test(src.id) && !/^PDB_[0-9A-Z]{8}$/.test(src.id)) throw new Error('Неверный PDB ID: «' + src.id + '». Пример: 1CRN');
      let text, fmt = 'pdb';
      try { text = await fetchText('https://files.rcsb.org/download/' + src.id + '.pdb'); }
      catch (e) { text = await fetchText('https://files.rcsb.org/download/' + src.id + '.cif'); fmt = 'cif'; }
      return { text: maybeExpand(text, fmt), fmt, name: src.id, origin: 'RCSB PDB ' + src.id, link: 'https://www.rcsb.org/structure/' + src.id };
    }
    if (src.kind === 'pubchem') {
      if (!/^\d+$/.test(src.cid)) throw new Error('Неверный PubChem CID: ' + src.cid);
      let text;
      try { text = await fetchText('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + src.cid + '/SDF?record_type=3d'); }
      catch (e) { throw new Error('В PubChem нет 3D-структуры для CID ' + src.cid + ' (или нет сети).'); }
      return { text, fmt: 'sdf', name: 'CID ' + src.cid, origin: 'PubChem CID ' + src.cid, link: 'https://pubchem.ncbi.nlm.nih.gov/compound/' + src.cid };
    }
    throw new Error('Неизвестный источник');
  }

  // ---------- CIF: разворот симметрии в полную элементарную ячейку ----------
  function tokenizeCif(text) {
    const s = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const tokens = [];
    let i = 0;
    const n = s.length;
    while (i < n) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (c === '#') { while (i < n && s[i] !== '\n') i++; continue; }
      if (c === ';' && (i === 0 || s[i - 1] === '\n')) {
        i++;
        let t = '';
        while (i < n) {
          if (s[i] === '\n' && s[i + 1] === ';') { i += 2; break; }
          t += s[i++];
        }
        tokens.push(t.trim());
        continue;
      }
      if (c === "'" || c === '"') {
        const q = c; i++;
        let t = '';
        while (i < n && s[i] !== q) t += s[i++];
        if (s[i] === q) i++;
        tokens.push(t);
        continue;
      }
      let t = '';
      while (i < n && s[i] !== ' ' && s[i] !== '\t' && s[i] !== '\n') t += s[i++];
      if (t) tokens.push(t);
    }
    return tokens;
  }
  function parseCif(text) {
    const tokens = tokenizeCif(text);
    const data = {};
    const loops = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === 'loop_') {
        i++;
        const cols = [];
        while (i < tokens.length && tokens[i].startsWith('_')) cols.push(tokens[i++].toLowerCase());
        const rows = [];
        while (i < tokens.length && tokens[i] !== 'loop_' && !tokens[i].startsWith('_') && !tokens[i].startsWith('data_')) {
          const row = [];
          for (let c = 0; c < cols.length && i < tokens.length; c++) {
            const v = tokens[i];
            if (v === 'loop_' || v.startsWith('_') || v.startsWith('data_')) break;
            row.push(v); i++;
          }
          if (row.length === cols.length) rows.push(row);
          else break;
        }
        loops.push({ cols, rows });
      } else if (t.startsWith('_')) {
        const key = t.toLowerCase();
        i++;
        let val = '';
        if (i < tokens.length && !tokens[i].startsWith('_') && tokens[i] !== 'loop_' && !tokens[i].startsWith('data_')) val = tokens[i++];
        data[key] = val;
      } else i++;
    }
    return { data, loops };
  }
  function cifNum(data, names) {
    for (const name of names) {
      const v = data[name.toLowerCase()];
      if (v == null || v === '' || v === '?' || v === '.') continue;
      const n = parseFloat(String(v).replace(/\([^)]*\)/g, ''));
      if (isFinite(n)) return n;
    }
    return null;
  }
  function cifFloat(v) {
    if (v == null) return NaN;
    const n = parseFloat(String(v).replace(/\([^)]*\)/g, ''));
    return n;
  }
  function elemOf(typeSym, label) {
    const src = String(typeSym || label || 'X');
    const m = /([A-Z][a-z]?)/.exec(src);
    return m ? m[1] : 'X';
  }
  function evalSym(expr, x, y, z) {
    let s = String(expr || '').replace(/\s+/g, '').toLowerCase();
    if (!s) return NaN;
    if (s[0] !== '+' && s[0] !== '-') s = '+' + s;
    const parts = s.match(/[+-][^+-]+/g);
    if (!parts) return NaN;
    const vars = { x, y, z };
    let acc = 0;
    for (const p of parts) {
      const sign = p[0] === '-' ? -1 : 1;
      const body = p.slice(1);
      if (body === 'x' || body === 'y' || body === 'z') acc += sign * vars[body];
      else if (/^[xyz]\/\d+$/.test(body)) acc += sign * vars[body[0]] / parseFloat(body.slice(2));
      else if (/^\d*\.?\d+\/\d*\.?\d+$/.test(body)) {
        const [a, b] = body.split('/');
        acc += sign * (parseFloat(a) / parseFloat(b));
      } else if (/^\d*\.?\d+$/.test(body)) acc += sign * parseFloat(body);
      else if (/^\d*\.?\d*[xyz]$/.test(body)) {
        const coef = body.slice(0, -1);
        acc += sign * (coef === '' ? 1 : parseFloat(coef)) * vars[body.slice(-1)];
      } else return NaN;
    }
    return acc;
  }
  function wrap01(v) {
    if (!isFinite(v)) return NaN;
    v = v % 1;
    if (v < 0) v += 1;
    if (v > 1 - 1e-4 || v < 1e-4) v = (v > 0.5 ? 0 : (v < 1e-4 ? 0 : v));
    if (v >= 1) v = 0;
    return v;
  }
  function expandCrystalCif(text) {
    if (!text || !/_atom_site/i.test(text) || !/_cell_length_a/i.test(text)) return null;
    const { data, loops } = parseCif(text);
    const a = cifNum(data, ['_cell_length_a', '_cell.length_a']);
    const b = cifNum(data, ['_cell_length_b', '_cell.length_b']);
    const c = cifNum(data, ['_cell_length_c', '_cell.length_c']);
    if (!(a > 0 && b > 0 && c > 0)) return null;
    const alpha = cifNum(data, ['_cell_angle_alpha', '_cell.angle_alpha']) ?? 90;
    const beta = cifNum(data, ['_cell_angle_beta', '_cell.angle_beta']) ?? 90;
    const gamma = cifNum(data, ['_cell_angle_gamma', '_cell.angle_gamma']) ?? 90;
    let ops = [];
    let atomLoop = null;
    for (const loop of loops) {
      const xyz = loop.cols.findIndex(col => /equiv_pos_as_xyz$|symop_operation_xyz$/.test(col));
      if (xyz >= 0 && !ops.length) ops = loop.rows.map(r => r[xyz]).filter(Boolean);
      if (!atomLoop && loop.cols.some(col => /fract_x$/.test(col))) atomLoop = loop;
    }
    if (!atomLoop) return null;
    if (atomLoop.rows.length > 400) return null;
    if (ops.length && atomLoop.rows.length * ops.length > 30000) return null;
    if (!ops.length) ops = ['x,y,z'];
    const col = name => atomLoop.cols.findIndex(c => c.endsWith(name));
    const ix = col('fract_x'), iy = col('fract_y'), iz = col('fract_z');
    const il = col('site_label'), it = col('type_symbol'), io = col('occupancy');
    if (ix < 0 || iy < 0 || iz < 0) return null;
    const seen = new Set();
    const atoms = [];
    for (const row of atomLoop.rows) {
      const occ = io >= 0 ? cifFloat(row[io]) : 1;
      if (isFinite(occ) && occ <= 0) continue;
      const x0 = cifFloat(row[ix]), y0 = cifFloat(row[iy]), z0 = cifFloat(row[iz]);
      if (![x0, y0, z0].every(isFinite)) continue;
      const el = elemOf(it >= 0 ? row[it] : '', il >= 0 ? row[il] : '');
      for (const op of ops) {
        const parts = String(op).split(',');
        if (parts.length < 3) continue;
        let x = wrap01(evalSym(parts[0], x0, y0, z0));
        let y = wrap01(evalSym(parts[1], x0, y0, z0));
        let z = wrap01(evalSym(parts[2], x0, y0, z0));
        if (![x, y, z].every(isFinite)) continue;
        const key = el + ':' + [x, y, z].map(v => v.toFixed(3)).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        atoms.push({ el, x, y, z });
      }
    }
    if (atoms.length < 1) return null;
    if (atoms.length > 8000) return null;
    const name = data['_chemical_name_common'] || data['_chemical_name_mineral'] || data['_chemical_name_systematic'] || '';
    const formula = data['_chemical_formula_sum'] || '';
    const lines = ['data_cell'];
    if (name) lines.push("_chemical_name_common '" + name.replace(/'/g, '') + "'");
    if (formula) lines.push("_chemical_formula_sum '" + formula.replace(/'/g, '') + "'");
    lines.push(
      '_cell_length_a ' + a,
      '_cell_length_b ' + b,
      '_cell_length_c ' + c,
      '_cell_angle_alpha ' + alpha,
      '_cell_angle_beta ' + beta,
      '_cell_angle_gamma ' + gamma,
      'loop_',
      '_atom_site_label',
      '_atom_site_type_symbol',
      '_atom_site_fract_x',
      '_atom_site_fract_y',
      '_atom_site_fract_z'
    );
    const counts = {};
    for (const at of atoms) {
      counts[at.el] = (counts[at.el] || 0) + 1;
      const label = at.el + counts[at.el];
      lines.push([label, at.el, at.x.toFixed(5), at.y.toFixed(5), at.z.toFixed(5)].join(' '));
    }
    return lines.join('\n') + '\n';
  }

  // ---------- сжатие для ссылки ----------
  function b64url(u8) {
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  function encodeData(text) { return b64url(window.pako.deflateRaw(new TextEncoder().encode(text), { level: 9 })); }
  function decodeData(s) {
    try { return new TextDecoder().decode(window.pako.inflateRaw(unb64url(s))); }
    catch (e) { throw new Error('Ссылка повреждена: встроенные данные не читаются (возможно, QR/ссылка обрезана).'); }
  }
  function compactText(text, fmt) {
    if (fmt === 'pdb' || fmt === 'pqr') {
      const out = []; let inModel = false, modelsSeen = 0;
      for (const raw of text.split(/\r?\n/)) {
        const rec = raw.slice(0, 6);
        if (rec === 'MODEL ') { modelsSeen++; if (modelsSeen > 1) break; inModel = true; continue; }
        if (rec === 'ENDMDL') { if (inModel) break; continue; }
        if (rec === 'ATOM  ' || rec === 'HETATM') {
          const l = raw.padEnd(80);
          out.push((l.slice(0, 54) + '            ' + l.slice(66, 80)).replace(/\s+$/, ''));
        } else if (rec === 'HELIX ' || rec === 'SHEET ' || rec === 'CONECT' || rec === 'CRYST1') out.push(raw.replace(/\s+$/, ''));
      }
      return out.join('\n') + '\nEND\n';
    }
    if (fmt === 'sdf') { const i = text.indexOf('M  END'); return i > 0 ? text.slice(0, i + 6) + '\n$$$$\n' : text; }
    return text.replace(/[ \t]+$/gm, '');
  }

  // ---------- информация о структуре ----------
  function cifScalar(text, key) {
    const re = new RegExp('^' + key.replace(/\./g, '[._]') + '\\s+(?:\'([^\']*)\'|"([^"]*)"|([^\\s#]+))', 'mi');
    const m = re.exec(text);
    return m ? (m[1] || m[2] || m[3] || '').trim() : '';
  }
  function parseHeader(text, fmt, name) {
    const info = { title: '', compound: [], method: '', resolution: '', idcode: '', organism: '' };
    if (fmt === 'pdb' || fmt === 'pqr') {
      const titles = [], comp = [];
      for (const l of text.split(/\r?\n/, 3000)) {
        const rec = l.slice(0, 6);
        if (rec === 'HEADER') info.idcode = l.slice(62, 66).trim();
        else if (rec === 'TITLE ') titles.push(l.slice(10, 80).trim());
        else if (rec === 'COMPND') comp.push(l.slice(10, 80).trim());
        else if (rec === 'EXPDTA') info.method = l.slice(10, 80).trim();
        else if (rec === 'SOURCE' && /ORGANISM_SCIENTIFIC:/.test(l) && !info.organism) info.organism = l.split('ORGANISM_SCIENTIFIC:')[1].replace(/;.*/, '').trim();
        else if (/^REMARK   2 RESOLUTION\./.test(l)) { const m = /([\d.]+)\s*ANGSTROM/.exec(l); if (m) info.resolution = m[1] + ' Å'; }
        else if (rec === 'ATOM  ') break;
      }
      info.title = titles.join(' ').replace(/\s+/g, ' ');
      const c = comp.join(' ');
      c.replace(/MOLECULE:\s*([^;]+)/g, (_, m) => { info.compound.push(m.trim()); });
    } else if (fmt === 'cif') {
      const chem = cifScalar(text, '_chemical_name_common') || cifScalar(text, '_chemical_name_mineral') || cifScalar(text, '_chemical_name_systematic');
      const m = /_struct\.title\s+(?:'([^']*)'|"([^"]*)"|\n;([\s\S]*?)\n;|(\S.*))/.exec(text);
      const paper = m ? (m[1] || m[2] || m[3] || m[4] || '').replace(/\s+/g, ' ').trim() : '';
      info.title = chem || paper;
      if (paper && chem && paper !== chem) info.compound.push(paper);
      const formula = cifScalar(text, '_chemical_formula_sum').replace(/^[-–\s]+|[-–\s]+$/g, '').replace(/\s+/g, '');
      if (formula) info.compound.push(formula);
      const e = /_entry\.id\s+(\S+)/.exec(text) || /_cod_database_code\s+(\S+)/.exec(text);
      if (e) info.idcode = e[1].replace(/['"]/g, '');
      const x = /_exptl\.method\s+'?([^'\n]+)'?/.exec(text); if (x) info.method = x[1].trim();
      const r = /_refine\.ls_d_res_high\s+([\d.]+)/.exec(text); if (r) info.resolution = r[1] + ' Å';
    } else if (fmt === 'sdf' || fmt === 'mol2') {
      const lines = text.split(/\r?\n/);
      info.title = fmt === 'sdf' ? lines[0].trim() : (lines[(lines.findIndex(l => /@<TRIPOS>MOLECULE/.test(l))) + 1] || '').trim();
    } else if (fmt === 'xyz') {
      info.title = (text.split(/\r?\n/)[1] || '').trim();
    }
    if (!info.title) info.title = name || '';
    return info;
  }
  function titleCase(s) {
    if (!s || s !== s.toUpperCase()) return s;
    s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function parseRep(s) {
    if (s == null || s === '' || s === '0' || s === '1' || s === '1x1x1' || s === '1×1×1') return null;
    const clamp = n => Math.max(1, Math.min(4, parseInt(n, 10) || 1));
    const m = String(s).toLowerCase().match(/(\d+)\s*[x×,*]\s*(\d+)\s*[x×,*]\s*(\d+)/);
    if (m) {
      const r = [clamp(m[1]), clamp(m[2]), clamp(m[3])];
      return (r[0] === 1 && r[1] === 1 && r[2] === 1) ? null : r;
    }
    const one = String(s).match(/^(\d+)$/);
    if (one) { const n = clamp(one[1]); return n <= 1 ? null : [n, n, n]; }
    return null;
  }
  function repLabel(s) {
    const r = parseRep(s);
    return r ? r.join('×') : '1×1×1';
  }
  function vsub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function vadd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function vscale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function vcross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function vlen(a) { return Math.hypot(a.x, a.y, a.z); }
  function vnorm(a) { const l = vlen(a) || 1; return vscale(a, 1 / l); }
  function measDist(a, b) { return vlen(vsub(a, b)); }
  function measAngle(a, b, c) {
    const u = vsub(a, b), v = vsub(c, b);
    const d = vlen(u) * vlen(v) || 1;
    return Math.acos(Math.max(-1, Math.min(1, vdot(u, v) / d))) * 180 / Math.PI;
  }
  function measTorsion(p0, p1, p2, p3) {
    const b1 = vsub(p1, p0), b2 = vsub(p2, p1), b3 = vsub(p3, p2);
    const n1 = vnorm(vcross(b1, b2)), n2 = vnorm(vcross(b2, b3));
    const m1 = vnorm(vcross(n1, vnorm(b2)));
    return Math.atan2(vdot(m1, n2), vdot(n1, n2)) * 180 / Math.PI;
  }
  function parseMeas(s) {
    if (!s) return [];
    const out = [];
    for (const part of String(s).split(';')) {
      const bits = part.split(':');
      if (bits.length !== 2) continue;
      const type = bits[0];
      const need = MEAS_NEED[type];
      if (!need) continue;
      const ids = bits[1].split(',').map(x => parseInt(x, 10));
      if (ids.length !== need || ids.some(n => !Number.isInteger(n) || n < 1)) continue;
      out.push({ type, ids });
    }
    return out;
  }
  function formatMeas(list) {
    return (list || []).map(m => m.type + ':' + m.ids.join(',')).join(';');
  }

  // ---------- 3D-вид ----------
  class MolView {
    constructor(el, opts) {
      this.el = el;
      this.o = Object.assign({}, DEFAULTS, opts || {});
      this.viewer = $3Dmol.createViewer(el, { backgroundColor: '#' + this.o.bg, antialias: true, cartoonQuality: 8 });
      this.model = null; this.stats = null; this.hasCell = false;
      this.onAtomClick = null;
      this.interactions = [];
      this.chargeMethod = '';
      this.hWarn = '';
      this._ixShapes = [];
      this.meas = [];
      this.pick = [];
      this.measMode = null;
      this._measShapes = [];
      this._measLabels = [];
      this._blockPick = 0;
      this.onMeas = null;
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this.viewer.resize(); this.viewer.render(); }) : null;
      if (this._ro) this._ro.observe(el);
      this._bindNav();
    }
    _bindNav() {
      const el = this.el, v = this.viewer;
      const snap = (e) => {
        const a = e.touches[0], b = e.touches[1];
        return { mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
      };
      let g = null, right = null;
      el.addEventListener('touchstart', (e) => {
        if (e.touches.length >= 2) {
          g = snap(e);
          v.isDragging = false;
          v.touchDistanceStart = 0;
          this._blockPick = Date.now() + 600;
          e.preventDefault();
          e.stopPropagation();
        } else g = null;
      }, { capture: true, passive: false });
      el.addEventListener('touchmove', (e) => {
        if (e.touches.length < 2 || !g) return;
        const n = snap(e);
        const dx = n.mx - g.mx, dy = n.my - g.my;
        const scale = n.d / g.d;
        v.isDragging = false;
        if (!v.modelGroup) return;
        this._blockPick = Date.now() + 600;
        if (dx || dy) v.translateScene(dx, dy);
        if (Math.abs(scale - 1) > 0.004) v.zoom(scale);
        g = n;
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true, passive: false });
      el.addEventListener('touchend', (e) => { if (e.touches.length < 2) g = null; }, { capture: true });
      el.addEventListener('touchcancel', () => { g = null; }, { capture: true });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return;
        right = { x: e.clientX, y: e.clientY };
        v.isDragging = false;
        e.preventDefault();
        e.stopPropagation();
      }, true);
      window.addEventListener('mousemove', (e) => {
        if (!right) return;
        if ((e.buttons & 2) === 0) { right = null; return; }
        if (!v.modelGroup) return;
        this._blockPick = Date.now() + 600;
        v.translateScene(e.clientX - right.x, e.clientY - right.y);
        right = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      });
      window.addEventListener('mouseup', () => { right = null; });
    }
    load(text, fmt) {
      this._text = text; this._fmt = fmt;
      this._rebuild('init');
      return this.stats;
    }
    _rebuild(mode) {
      const v = this.viewer;
      v.clear();
      this.model = v.addModel(this._text, this._fmt, { keepH: true, assignBonds: true });
      if (!this.model || !this.model.selectedAtoms({}).length) throw new Error('В файле не найдено атомов (формат: ' + this._fmt + ').');
      this.hasCell = !!(this.model.getCrystData && this.model.getCrystData());
      this.stats = this._stats();
      if (mode === 'init' && this.hasCell && !this.stats.isMacro && !(this.o.explicit && this.o.explicit.cell) && String(this.o.cell) === '0') this.o.cell = '1';
      this.hWarn = '';
      if (isOn(this.o.addh) && window.PVChem) {
        const made = PVChem.addHydrogens(this.model.selectedAtoms({}));
        this.hWarn = made.warn || '';
        PVChem.attachHydrogens(this.model, made);
      }
      const rep = this.hasCell ? parseRep(this.o.rep) : null;
      if (rep) v.replicateUnitCell(rep[0], rep[1], rep[2], this.model, true);
      this._ixShapes = [];
      this._ixSig = '';
      this._measShapes = [];
      this._measLabels = [];
      this.stats = this._stats();
      this._assignIds();
      this.pick = [];
      this.meas = this._realize(parseMeas(this.o.meas));
      const self = this;
      v.setClickable({}, true, function (atom) { self._onPick(atom); });
      this.apply();
      this.fit();
      if (mode !== 'rep' && this.o.view) this.setViewString(this.o.view);
      v.render();
      this.setSpin(mode === 'rep' ? !!this.spinning : isOn(this.o.spin));
    }
    _stats() {
      const atoms = this.model.selectedAtoms({});
      const chains = new Set(), res = new Set(); let poly = 0, nuc = 0, minR = Infinity, maxR = -Infinity, het = 0, water = 0, hyd = 0;
      const AA = 'ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL SEC PYL MSE'.split(' ');
      const NA = 'DA DC DG DT DU A C G U T'.split(' ');
      const aa = new Set(AA), na = new Set(NA), wat = new Set(WATERS);
      for (const a of atoms) {
        if (a.elem === 'H' || a.elem === 'D') hyd++;
        if (wat.has(a.resn)) { water++; continue; }
        if (a.chain) chains.add(a.chain);
        if (a.resn) res.add(a.chain + ':' + a.resi);
        if (!a.hetflag && (a.atom === 'CA') && aa.has(a.resn)) { poly++; if (a.resi < minR) minR = a.resi; if (a.resi > maxR) maxR = a.resi; }
        if (!a.hetflag && a.atom === "P" && na.has((a.resn || '').trim())) { nuc++; }
        if (a.hetflag) het++;
      }
      if (!isFinite(minR)) { minR = 0; maxR = 0; }
      return { atoms: atoms.length, chains: [...chains].sort(), residues: poly ? res.size : 0, aminoacids: poly, nucleotides: nuc, hasPolymer: poly + nuc > 0, isMacro: poly + nuc > 2, minR, maxR, het, water, hyd };
    }
    effectiveStyle() {
      let s = this.o.style;
      if (s === 'auto') s = (this.hasCell && !this.stats.isMacro) ? 'ballstick' : (this.stats.isMacro ? 'cartoon' : 'ballstick');
      if (s === 'cartoon' && !this.stats.hasPolymer) s = 'ballstick';
      return s;
    }
    effectiveColor(style) {
      let c = this.o.color;
      if (c === 'auto') c = style === 'cartoon' ? (this.stats.chains.length > 1 ? 'chain' : 'spectrum') : 'element';
      return c;
    }
    _paint(c, forCartoon) {
      if (c === 'charge' && window.PVChem) return { colorfunc: a => PVChem.chargeHex(a.partialCharge) };
      if (c === 'hp' && window.PVChem) return { colorfunc: a => PVChem.hpHex(a) };
      return this._color(c, forCartoon);
    }
    _ensureCharges() {
      if (!window.PVChem) return;
      if (this.o.color !== 'charge' && this.o.scol !== 'charge') { this.chargeMethod = ''; return; }
      this.chargeMethod = PVChem.assignCharges(this.model.selectedAtoms({}), this.stats) || '';
    }
    _surfType() {
      const s = this.o.surface;
      if (!isOn(s) && s !== 'vdw' && s !== 'sas' && s !== 'ms' && s !== 'ses') return null;
      if (s === 'vdw') return $3Dmol.SurfaceType.VDW;
      if (s === 'sas') return $3Dmol.SurfaceType.SAS;
      if (s === 'ses' || s === 'ms') return $3Dmol.SurfaceType.MS;
      return this.stats.isMacro ? $3Dmol.SurfaceType.MS : $3Dmol.SurfaceType.VDW;
    }
    _surfSel() {
      const s = this.o.ssel || 'all';
      if (s === 'ligand') return { hetflag: true };
      if (s === 'chain' && this.o.sch) return { chain: this.o.sch };
      if (s === 'res' && this.o.sres) {
        const sel = { resi: parseInt(this.o.sres, 10) };
        if (this.o.sch) sel.chain = this.o.sch;
        return sel;
      }
      return { not: { resn: WATERS } };
    }
    _surfPaint(color) {
      const scol = this.o.scol || '';
      if (scol === 'charge' && window.PVChem) return { colorfunc: a => PVChem.chargeHex(a.partialCharge) };
      if (scol === 'hp' && window.PVChem) return { colorfunc: a => PVChem.hpHex(a) };
      if (scol === 'chain') return this._color('chain', false);
      if (scol === 'element') return { colorscheme: 'Jmol' };
      if (color === 'charge' || color === 'hp') return this._paint(color, false);
      return (color === 'element' || color === 'auto') ? { color: '#d9e2f0' } : this._color(color, false);
    }
    _drawIx() {
      const v = this.viewer;
      for (const sh of this._ixShapes) { try { v.removeShape(sh); } catch (e) { /* уже снято */ } }
      this._ixShapes = [];
      this.interactions = [];
      this.ixWarn = '';
      if (!this.o.ix || !window.PVChem) return;
      const found = PVChem.findInteractions(this.model.selectedAtoms({}), this.o);
      this.interactions = found.list;
      this.ixWarn = found.warn || (found.truncated ? 'Показаны первые 250 контактов.' : '');
      for (const rec of found.list) {
        const spec = PVChem.IX[rec.type] || { color: '#64748b' };
        this._ixShapes.push(v.addCylinder({
          start: { x: rec.p.x, y: rec.p.y, z: rec.p.z },
          end: { x: rec.q.x, y: rec.q.y, z: rec.q.z },
          radius: 0.055, color: spec.color, dashed: true, fromCap: 0, toCap: 0
        }));
      }
    }
    _assignIds() {
      const atoms = this.model.selectedAtoms({});
      atoms.forEach((a, i) => { a.measId = i + 1; });
      this._atoms = atoms;
    }
    atomById(id) {
      const n = parseInt(id, 10);
      return (this._atoms || []).find(a => a.measId === n) || null;
    }
    atomCaption(a) {
      if (!a) return '?';
      const e = a.elem || '?';
      const nm = String(a.atom || '').trim();
      const resn = String(a.resn || '').trim();
      const hasRes = resn && resn !== 'UNL' && resn !== 'UNK' && a.resi != null && a.resi !== '';
      if (hasRes) return (nm || e) + ' (' + resn + ' ' + a.resi + (a.chain ? ' ' + a.chain : '') + ')';
      if (nm && nm !== e) return nm;
      return e + ' ' + a.measId;
    }
    _measValue(type, atoms) {
      if (type === 'd') return measDist(atoms[0], atoms[1]);
      if (type === 'a') return measAngle(atoms[0], atoms[1], atoms[2]);
      return measTorsion(atoms[0], atoms[1], atoms[2], atoms[3]);
    }
    _fmtValue(type, value) {
      if (!isFinite(value)) return '—';
      return type === 'd' ? value.toFixed(2) + ' Å' : value.toFixed(1) + '°';
    }
    _realize(raw) {
      const out = [];
      for (const m of raw) {
        const atoms = m.ids.map(id => this.atomById(id));
        if (atoms.some(a => !a)) continue;
        const value = this._measValue(m.type, atoms);
        out.push({ type: m.type, ids: m.ids.slice(), value, text: atoms.map(a => this.atomCaption(a)).join(' – ') + ' · ' + this._fmtValue(m.type, value) });
      }
      return out;
    }
    _syncMeas() {
      this.o.meas = formatMeas(this.meas);
      if (this.onMeas) this.onMeas(this.o.meas);
    }
    setMeasMode(mode) {
      this.measMode = MEAS_NEED[mode] ? mode : null;
      this.pick = [];
      this._drawMeas();
      this.viewer.render();
      if (this.onMeas) this.onMeas(this.o.meas);
    }
    _onPick(atom) {
      if (this._blockPick && Date.now() < this._blockPick) return;
      if (this.measMode) { this.pickAtom(atom); return; }
      if (this.onAtomClick) this.onAtomClick(atom);
    }
    pickAtom(atom) {
      if (!this.measMode || !atom) return;
      const id = atom.measId;
      if (!id) return;
      if (this.pick.includes(id)) return;
      this.pick.push(id);
      const need = MEAS_NEED[this.measMode];
      if (this.pick.length >= need) {
        const made = this._realize([{ type: this.measMode, ids: this.pick.slice(0, need) }]);
        this.pick = [];
        if (made[0]) { this.meas.push(made[0]); this._syncMeas(); }
      }
      this._drawMeas();
      this.viewer.render();
      if (this.onMeas) this.onMeas(this.o.meas);
    }
    undoPick() {
      this.pick.pop();
      this._drawMeas();
      this.viewer.render();
      if (this.onMeas) this.onMeas(this.o.meas);
    }
    cancelPick() { this.setMeasMode(null); }
    deleteMeas(i) {
      this.meas.splice(i, 1);
      this._syncMeas();
      this._drawMeas();
      this.viewer.render();
    }
    clearMeas() {
      this.meas = [];
      this.pick = [];
      this._syncMeas();
      this._drawMeas();
      this.viewer.render();
    }
    _clearMeasArt() {
      const v = this.viewer;
      for (const sh of this._measShapes) { try { v.removeShape(sh); } catch (e) { /* уже снято */ } }
      for (const lab of this._measLabels) { try { v.removeLabel(lab); } catch (e) { /* уже снято */ } }
      this._measShapes = [];
      this._measLabels = [];
    }
    _measLabel(pos, text) {
      const dark = isDark(this.o.bg);
      return this.viewer.addLabel(text, {
        position: pos, fontSize: 16, font: 'sans-serif',
        fontColor: dark ? '#fff' : '#111827',
        backgroundColor: dark ? '#111827' : '#ffffff',
        backgroundOpacity: 0.88, borderThickness: 0, inFront: true, alignment: 'center'
      });
    }
    _seg(a, b, color) {
      this._measShapes.push(this.viewer.addCylinder({
        start: { x: a.x, y: a.y, z: a.z }, end: { x: b.x, y: b.y, z: b.z },
        radius: 0.07, color, dashed: true, fromCap: 0, toCap: 0
      }));
    }
    _halo(atom, n, color) {
      this._measShapes.push(this.viewer.addSphere({ center: { x: atom.x, y: atom.y, z: atom.z }, radius: this.stats && this.stats.isMacro ? 0.55 : 0.32, color }));
      this._measLabels.push(this._measLabel({ x: atom.x, y: atom.y, z: atom.z }, String(n)));
    }
    _drawMeas() {
      if (!this.viewer || !this.model) return;
      this._clearMeasArt();
      const colors = { d: '#ea580c', a: '#0284c7', t: '#7c3aed' };
      const pickColor = ['#f59e0b', '#22c55e', '#38bdf8', '#e879f9'];
      this.pick.forEach((id, i) => {
        const a = this.atomById(id);
        if (a) this._halo(a, i + 1, pickColor[i] || '#f59e0b');
      });
      for (const m of this.meas) {
        const atoms = m.ids.map(id => this.atomById(id));
        if (atoms.some(a => !a)) continue;
        m.value = this._measValue(m.type, atoms);
        m.text = atoms.map(a => this.atomCaption(a)).join(' – ') + ' · ' + this._fmtValue(m.type, m.value);
        const col = colors[m.type] || '#ea580c';
        const sideOf = (a, b) => {
          const d = vnorm(vsub(b, a));
          let n = vcross(d, { x: 0, y: 1, z: 0 });
          if (vlen(n) < 0.2) n = vcross(d, { x: 1, y: 0, z: 0 });
          return vnorm(n);
        };
        if (m.type === 'd') {
          this._seg(atoms[0], atoms[1], col);
          const mid = vscale(vadd(atoms[0], atoms[1]), 0.5);
          this._measLabels.push(this._measLabel(vadd(mid, vscale(sideOf(atoms[0], atoms[1]), 0.7)), this._fmtValue('d', m.value)));
        } else if (m.type === 'a') {
          this._seg(atoms[1], atoms[0], col);
          this._seg(atoms[1], atoms[2], col);
          const bis = vnorm(vadd(vnorm(vsub(atoms[0], atoms[1])), vnorm(vsub(atoms[2], atoms[1]))));
          this._measLabels.push(this._measLabel(vadd(atoms[1], vscale(bis, 1.15)), this._fmtValue('a', m.value)));
        } else {
          this._seg(atoms[0], atoms[1], col);
          this._seg(atoms[1], atoms[2], col);
          this._seg(atoms[2], atoms[3], col);
          const mid = vscale(vadd(atoms[1], atoms[2]), 0.5);
          this._measLabels.push(this._measLabel(vadd(mid, vscale(sideOf(atoms[1], atoms[2]), 1.3)), this._fmtValue('t', m.value)));
        }
      }
    }
    focusInteraction(i) {
      const rec = this.interactions[i];
      if (!rec) return;
      this._drawIx();
      const spec = (window.PVChem && PVChem.IX[rec.type]) || { color: '#facc15' };
      this._ixShapes.push(this.viewer.addCylinder({
        start: { x: rec.p.x, y: rec.p.y, z: rec.p.z },
        end: { x: rec.q.x, y: rec.q.y, z: rec.q.z },
        radius: 0.14, color: spec.color, fromCap: 1, toCap: 1
      }));
      this.viewer.render();
      return rec;
    }
    _color(c, forCartoon) {
      const st = this.stats;
      if (c === 'element') return forCartoon ? { color: 'spectrum' } : { colorscheme: 'Jmol' };
      if (c === 'chain') return { colorscheme: 'chain' };
      if (c === 'ss') return { colorscheme: 'ssJmol' };
      if (c === 'spectrum') {
        if (forCartoon) return { color: 'spectrum' };
        if (st.isMacro) return { colorscheme: { prop: 'resi', gradient: 'roygb', min: st.minR, max: st.maxR } };
        return { colorscheme: { prop: 'serial', gradient: 'roygb', min: 0, max: st.atoms } };
      }
      return {};
    }
    _drawCell() {
      if (!this.model || !this.model.unitCellObjects) { /* нет ячейки на экране */ }
      else this.viewer.removeUnitCell(this.model);
      if (!isOn(this.o.cell) || !this.hasCell) return;
      this.viewer.addUnitCell(this.model, {
        alabel: 'a', blabel: 'b', clabel: 'c',
        astyle: { color: '#dc2626', radius: 0.05, midpos: -1 },
        bstyle: { color: '#16a34a', radius: 0.05, midpos: -1 },
        cstyle: { color: '#2563eb', radius: 0.05, midpos: -1 },
        alabelstyle: { fontColor: '#dc2626', fontSize: 14, showBackground: false, inFront: true },
        blabelstyle: { fontColor: '#16a34a', fontSize: 14, showBackground: false, inFront: true },
        clabelstyle: { fontColor: '#2563eb', fontSize: 14, showBackground: false, inFront: true }
      });
    }
    apply(newOpts) {
      const repBefore = this.o.rep, addhBefore = this.o.addh;
      const ixBefore = [this.o.ix, this.o.ixsel, this.o.ixch, this.o.ixres, this.o.ixrad].join('|');
      if (newOpts) Object.assign(this.o, newOpts);
      if (this._text && newOpts && (String(this.o.rep) !== String(repBefore) || String(this.o.addh) !== String(addhBefore))) {
        this._rebuild(String(this.o.rep) !== String(repBefore) ? 'rep' : 'addh');
        return;
      }
      const v = this.viewer, o = this.o;
      if (!this.model) return;
      this._ensureCharges();
      if (this.model.unitCellObjects) v.removeUnitCell(this.model);
      v.setBackgroundColor('#' + (o.bg || 'ffffff').replace('#', ''));
      v.removeAllSurfaces(); v.removeAllLabels();
      const style = this.effectiveStyle(), color = this.effectiveColor(style);
      const col = this._paint(color, false), colC = this._paint(color, true);
      let spec;
      if (style === 'cartoon') spec = { cartoon: Object.assign({ arrows: true, tubes: false }, colC) };
      else if (style === 'stick') spec = { stick: Object.assign({ radius: 0.18 }, col) };
      else if (style === 'ballstick') spec = { stick: Object.assign({ radius: 0.13 }, col), sphere: Object.assign({ scale: 0.27 }, col) };
      else if (style === 'sphere') spec = { sphere: Object.assign({ scale: 1.0 }, col) };
      else spec = { line: Object.assign({ linewidth: 2 }, col) };
      v.setStyle({}, spec);
      if (style === 'cartoon') {
        v.setStyle({ hetflag: true }, { stick: Object.assign({ radius: 0.2 }, this._color('element')), sphere: { scale: 0.25, colorscheme: 'Jmol' } });
      }
      if (!isOn(o.water)) v.setStyle({ resn: WATERS }, {});
      else v.setStyle({ resn: WATERS }, { sphere: { scale: 0.22, color: '#ff4444' } });
      if (!isOn(o.h)) v.setStyle({ elem: ['H', 'D'] }, {});
      const surf = this._surfType();
      if (surf) {
        const sc = this._surfPaint(color);
        v.addSurface(surf, Object.assign({ opacity: Math.max(0.1, Math.min(1, parseFloat(o.sop) || 0.6)) }, sc), this._surfSel());
      }
      if (o.labels === 'atoms') {
        const atoms = this.model.selectedAtoms({ not: { resn: WATERS } }).filter(a => isOn(o.h) || (a.elem !== 'H' && a.elem !== 'D'));
        const lim = atoms.slice(0, 400);
        const dark = isDark(o.bg);
        for (const a of lim) v.addLabel(a.elem + (this.stats.isMacro ? '' : ''), { position: { x: a.x, y: a.y, z: a.z }, fontSize: 13, fontColor: dark ? 'white' : 'black', backgroundColor: dark ? '#000000' : '#ffffff', backgroundOpacity: 0.55, borderThickness: 0, inFront: true, alignment: 'center' });
      } else if (o.labels === 'res') {
        const dark = isDark(o.bg);
        v.addResLabels({ not: { resn: WATERS }, atom: ['CA', "C1'"] }, { fontSize: 10, fontColor: dark ? 'white' : 'black', backgroundColor: dark ? 'black' : 'white', backgroundOpacity: 0.6, inFront: true });
      }
      this._drawCell();
      const ixNow = [o.ix, o.ixsel, o.ixch, o.ixres, o.ixrad].join('|');
      if (ixNow !== this._ixSig) { this._ixSig = ixNow; this._drawIx(); }
      this._drawMeas();
      v.render();
      if (this.onDecorate) this.onDecorate();
    }
    setSpin(on) { this.spinning = !!on; this.viewer.spin(on ? 'y' : false, 0.6); }
    fit() {
      const v = this.viewer; v.zoomTo();
      const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1, a = w / h;
      v.zoom(a < 1 ? Math.min(0.92, Math.max(0.4, a * 1.05)) : 0.92);
    }
    reset() { const v = this.viewer; this.fit(); if (this.o.view) this.setViewString(this.o.view); v.render(); }
    getViewString() { return this.viewer.getView().map(x => (Math.round(x * 1000) / 1000).toString()).join('_'); }
    setViewString(s) {
      const a = String(s).split(/[_,;]/).map(Number);
      if (a.length >= 8 && a.every(isFinite)) this.viewer.setView(a);
    }
    pngDataURL() { this.viewer.render(); return this.viewer.pngURI(); }
  }
  function isDark(hex) {
    hex = String(hex || 'ffffff').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16); if (!isFinite(n)) return false;
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  }

  function dataURLtoBlob(u) { const [h, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: /:(.*?);/.exec(h)[1] }); }
  async function saveImage(dataURL, filename) {
    const blob = dataURLtoBlob(dataURL);
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function safeName(s) { return (s || 'structure').replace(/[^\wа-яА-ЯёЁ.-]+/g, '_').slice(0, 60); }
  function slugify(s) {
    const tr = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    let o = '';
    for (const ch of String(s || '').trim().toLowerCase()) o += tr[ch] != null ? tr[ch] : ch;
    o = o.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    return o || 'entry';
  }
  function paramsFromOpt(opt) {
    const p = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'title' || k === 'fmt') continue;
      if (opt[k] != null && String(opt[k]) !== DEFAULTS[k] && String(opt[k]) !== '') p[k] = String(opt[k]);
    }
    return p;
  }

  window.PV = {
    DEFAULTS, STYLES, COLORS, LABELS, REPS, WATERS, FORMATS,
    parseParams, buildQuery, entryHref, loadSource, fetchText, extFormat, sniffFormat, isCifText,
    parseMeas, formatMeas, MEAS_NEED, MEAS_NAME, measDist, measAngle, measTorsion,
    encodeData, decodeData, compactText, parseHeader, titleCase, MolView, isOn, isDark, saveImage, safeName,
    expandCrystalCif, parseRep, repLabel, loadIndex, flatEntries, findEntry, findFolder, sourceFromEntry, applyCatalogEntry,
    codCifUrl, codPage, codSearchPage, ccdcLink, localDevHost, slugify, paramsFromOpt, normEntryPath
  };
})();
