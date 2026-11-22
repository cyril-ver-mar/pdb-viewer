/* Наборы структур: одна ссылка — несколько структур и меню «Выбор структуры».
   Два вида наборов:
   1) файл structures/…/*.set.json с параметрами выбора (controls) и структурами (items),
      например краун-эфиры: ?set=_supra/crown/complexes;
   2) список учителя: [{t: подпись, s: источник}] — в ссылке (#ms=…) или в записи каталога.
   Источник элемента списка — строка: e:папка/запись, pdb:путь, file:имя (в папке записи),
   id:1CRN, cod:1000041, cid:2519, ccdc:…, url:…, d:данные|имя (файл, встроенный в ссылку).
   3) рисунок учебника (assets/book.js): ?fig=4m2 — набор собирается из structures/_book/book.json. */
(function () {
  'use strict';
  const ION_R = { Li: 0.76, Na: 1.02, K: 1.38, Rb: 1.52, Cs: 1.67, Mg: 0.72, Ca: 1.0, Sr: 1.18, Ba: 1.35 };

  function dirOf(p) { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(0, i + 1) : ''; }
  function setPath(p) {
    let s = String(p || '').trim().replace(/^\.\//, '').replace(/^\/+/, '');
    if (!/^structures\//.test(s)) s = 'structures/' + s;
    if (!/\.json$/i.test(s)) s += '.set.json';
    return s;
  }
  function shortSetPath(p) { return String(p || '').replace(/^structures\//, '').replace(/\.set\.json$/i, ''); }

  // ---------- источники элементов ----------
  function parseRef(s, folder) {
    s = String(s || '');
    const i = s.indexOf(':');
    const k = i > 0 ? s.slice(0, i) : 'pdb', v = i > 0 ? s.slice(i + 1) : s;
    if (k === 'e') return { kind: 'entry', path: v };
    if (k === 'pdb') return { kind: 'repo', path: v };
    if (k === 'file') return { kind: 'repo', path: 'structures/' + (folder ? folder + '/' : '') + v };
    if (k === 'id') return { kind: 'rcsb', id: v.toUpperCase() };
    if (k === 'cod') return { kind: 'cod', id: v };
    if (k === 'cid') return { kind: 'pubchem', cid: v };
    if (k === 'ccdc') return { kind: 'ccdc', id: v };
    if (k === 'url') return { kind: 'url', url: v };
    if (k === 'd') { const j = v.lastIndexOf('|'); return { kind: 'data', data: j > 0 ? v.slice(0, j) : v, name: j > 0 ? v.slice(j + 1) : 'structure.pdb' }; }
    throw new Error('Непонятный источник в наборе: ' + s);
  }
  function refOf(src) {
    if (!src) return '';
    if (src.entryPath) return 'e:' + src.entryPath;
    if (src.kind === 'entry') return 'e:' + src.path;
    if (src.kind === 'repo') return 'pdb:' + src.path;
    if (src.kind === 'rcsb') return 'id:' + src.id;
    if (src.kind === 'cod') return 'cod:' + src.id;
    if (src.kind === 'pubchem') return 'cid:' + src.cid;
    if (src.kind === 'ccdc') return 'ccdc:' + src.id;
    if (src.kind === 'url') return 'url:' + src.url;
    if (src.kind === 'data') return 'd:' + src.data + '|' + (src.name || 'structure.pdb');
    return '';
  }
  function refTag(s) {
    const r = String(s || ''); const k = r.split(':')[0];
    const v = r.slice(k.length + 1);
    return ({ e: 'каталог', pdb: 'файл', file: 'файл', id: 'PDB', cod: 'COD', cid: 'PubChem', ccdc: 'CCDC', url: 'адрес', d: 'свой файл' }[k] || '') + (k === 'd' ? ' ' + v.split('|').pop() : k === 'e' || k === 'pdb' ? ' ' + v.split('/').pop() : ' ' + v);
  }

  // ---------- набор: загрузка и нормализация ----------
  function fromList(list, meta) {
    meta = meta || {};
    const items = list.map((it, i) => ({ title: it.t || it.title || ('Структура ' + (i + 1)), desc: it.desc || '', ref: it.s || it.src, folder: meta.folder || '', sel: { i: String(i) } }));
    return {
      title: meta.title || '', description: meta.description || '', keep: !!meta.keep, list: true,
      controls: [{ key: 'i', label: 'Структура', options: items.map((it, i) => ({ v: String(i), t: it.title })) }],
      default: { i: '0' }, items, params: {}
    };
  }
  function encodeInline(def) { return PV.encodeData(JSON.stringify(def)); }
  function decodeInline(s) { return JSON.parse(PV.decodeData(s)); }
  async function loadDef(src) {
    if (src.def) return src.def;
    let def;
    if (src.fig) {
      // рисунок учебника (assets/book.js): ?fig=4m2
      if (!window.PVBook) throw new Error('Рисунки учебника открываются в просмотрщике (assets/book.js не подключён).');
      def = await PVBook.figureDef(src.fig);
    } else if (src.inline) {
      const j = decodeInline(src.inline);
      def = fromList(j.i || [], { title: j.t, keep: j.k, description: j.desc });
    } else if (src.items) {
      def = fromList(src.items, { title: src.title, keep: src.keep, folder: src.folder, description: src.description });
    } else {
      const path = setPath(src.path);
      const r = await fetch(new URL(path, location.href).href, { cache: 'no-cache' });
      if (!r.ok) throw new Error('Набор не найден (HTTP ' + r.status + '): ' + path);
      def = await r.json();
      const base = dirOf(path);
      for (const it of def.items || []) if (it.file && !it.ref) it.ref = 'pdb:' + base + it.file;
      def.path = path;
    }
    def.items = (def.items || []).filter(it => it.ref);
    if (!def.items.length) throw new Error('В наборе нет структур.');
    def.controls = def.controls || [];
    src.def = def;
    return def;
  }
  async function loadItem(def, item) {
    let s = parseRef(item.ref, item.folder);
    let entry = null;
    if (s.kind === 'entry') {
      const index = await PV.loadIndex();
      entry = PV.findEntry(index, s.path);
      if (!entry) throw new Error('В каталоге нет записи «' + s.path + '».');
      s = PV.sourceFromEntry(entry);
      if (s.kind === 'set') throw new Error('Набор нельзя вложить в набор.');
    }
    const L = await PV.loadSource(s, {});
    L.entry = entry || (item.params ? { params: item.params } : null); L.item = item;
    return L;
  }

  // ---------- выбор по параметрам ----------
  function visible(def, state) {
    return def.controls.filter(c => {
      if (!c.when) return true;
      return Object.entries(c.when).every(([k, v]) => Array.isArray(v) ? v.includes(state[k]) : state[k] === v);
    });
  }
  function matches(def, item, state) {
    const vis = visible(def, state);
    const keys = Object.keys(item.sel || {});
    if (keys.length !== vis.length) return false;
    return vis.every(c => item.sel[c.key] === state[c.key]);
  }
  function find(def, state) { return def.items.find(it => matches(def, it, state)) || null; }
  function optIndex(def, key, v) {
    const c = def.controls.find(x => x.key === key);
    if (!c || !c.options) return 0;
    return Math.max(0, c.options.findIndex(o => o.v === v));
  }
  // ближайшая существующая структура, если точного сочетания нет (например, нет трибензо)
  function nearest(def, state, key) {
    const want = Object.assign({}, state);
    const exact = find(def, want);
    if (exact) return exact;
    let best = null, bestScore = -Infinity;
    for (const it of def.items) {
      if (key && it.sel[key] !== want[key]) continue;
      let sc = 0;
      for (const [k, v] of Object.entries(it.sel)) {
        if (k === key) continue;
        if (want[k] === v) sc += 100; else sc -= Math.abs(optIndex(def, k, v) - optIndex(def, k, want[k]));
      }
      if (sc > bestScore) { bestScore = sc; best = it; }
    }
    return best || def.items[0];
  }
  function available(def, state, key, v) {
    const s = Object.assign({}, state, { [key]: v });
    return !!find(def, s);
  }
  function initialState(def, pick) {
    const st = {};
    for (const c of def.controls) st[c.key] = c.type === 'toggle' ? (c.off || '0') : (c.options && c.options[0] ? c.options[0].v : '');
    Object.assign(st, def.default || {});
    if (pick) for (const part of String(pick).split(/[,;]/)) { const [k, v] = part.split(/[:=]/); if (k && v != null && k in st) st[k] = v; }
    const it = nearest(def, st, null);
    return { state: Object.assign(st, it.sel), item: it };
  }
  function pickString(def, state) {
    return visible(def, state).map(c => c.key + ':' + state[c.key]).join(',');
  }

  // ---------- меню «Выбор структуры» ----------
  function renderMenu(box, def, state, onPick) {
    box.innerHTML = '';
    for (const c of visible(def, state)) {
      if (c.hidden) continue;
      if (def.figure && c.type !== 'toggle' && (c.options || []).length < 2) continue; // рисунок учебника: одна структура — без лишней кнопки
      if (c.type === 'toggle') {
        const lab = document.createElement('label'); lab.className = 'row setrow';
        lab.textContent = c.label + ' ';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = state[c.key] === (c.on || '1'); cb.dataset.key = c.key;
        cb.onchange = () => onPick(c.key, cb.checked ? (c.on || '1') : (c.off || '0'));
        lab.appendChild(cb); box.appendChild(lab);
        continue;
      }
      const h = document.createElement('h4'); h.textContent = c.label; box.appendChild(h);
      const row = document.createElement('div'); row.className = 'chips' + (def.list ? ' setlist' : ''); row.dataset.key = c.key;
      for (const o of c.options || []) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.t; b.dataset.v = o.v;
        const ok = available(def, state, c.key, o.v);
        b.classList.toggle('sel', state[c.key] === o.v);
        if (!ok) { b.classList.add('na'); b.title = 'Такой структуры в наборе нет — откроется ближайшая'; }
        b.onclick = () => onPick(c.key, o.v);
        row.appendChild(b);
      }
      box.appendChild(row);
    }
  }

  // ---------- ионы: шар ионного радиуса ----------
  function ionStyle(mv, on) {
    if (!mv || !mv.model) return;
    const els = Object.keys(ION_R);
    const atoms = mv.model.selectedAtoms({ elem: els });
    if (!atoms.length) return;
    const st = mv.effectiveStyle ? mv.effectiveStyle() : '';
    if (st === 'sphere' || !on) return;
    for (const a of atoms) {
      const r = ION_R[a.elem] || 1;
      mv.viewer.setStyle({ serial: a.serial, model: mv.model }, { sphere: { radius: r, colorscheme: 'Jmol' } });
    }
    mv.viewer.render();
  }

  window.PVSet = {
    setPath, shortSetPath, parseRef, refOf, refTag, fromList, encodeInline, decodeInline, loadDef, loadItem,
    visible, find, nearest, available, initialState, pickString, renderMenu, ionStyle, ION_R
  };
})();
