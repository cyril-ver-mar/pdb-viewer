/* Общий код просмотрщика: загрузка структур, параметры URL, стили 3Dmol, сжатие данных для ссылок. */
(function () {
  'use strict';
  const WATERS = ['HOH', 'WAT', 'H2O', 'DOD', 'SOL', 'TIP', 'TIP3'];
  const FORMATS = { pdb: 'pdb', ent: 'pdb', pqr: 'pqr', cif: 'cif', mmcif: 'cif', mcif: 'cif', sdf: 'sdf', mol: 'sdf', sd: 'sdf', mol2: 'mol2', xyz: 'xyz', gro: 'gro' };
  const STYLES = {
    auto: 'Авто', cartoon: 'Лента (cartoon)', stick: 'Палочки', ballstick: 'Шарики и палочки', sphere: 'Сферы (Ван-дер-Ваальс)', line: 'Линии'
  };
  const COLORS = { auto: 'Авто', element: 'По элементам', chain: 'По цепям', spectrum: 'Радуга (N→C)', ss: 'Вторичная структура' };
  const LABELS = { off: 'Нет', atoms: 'Атомы', res: 'Остатки' };
  const DEFAULTS = { style: 'auto', color: 'auto', bg: 'ffffff', spin: '0', labels: 'off', surface: '0', sop: '0.6', water: '0', h: '1', lock: '0', title: '', view: '', fmt: '' };

  // ---------- параметры ----------
  function parseParams(loc) {
    loc = loc || location;
    const q = new URLSearchParams(loc.search);
    const h = new URLSearchParams((loc.hash || '').replace(/^#/, ''));
    const o = Object.assign({}, DEFAULTS);
    for (const k of Object.keys(DEFAULTS)) { if (q.has(k)) o[k] = q.get(k); else if (h.has(k)) o[k] = h.get(k); }
    if (o.style === 'ball-and-stick' || o.style === 'ball' || o.style === 'bs') o.style = 'ballstick';
    if (o.style === 'lines') o.style = 'line';
    if (o.style === 'spheres') o.style = 'sphere';
    if (o.style === 'sticks') o.style = 'stick';
    if (!STYLES[o.style]) o.style = 'auto';
    if (o.color === 'secondary' || o.color === 'sstruc') o.color = 'ss';
    if (!COLORS[o.color]) o.color = 'auto';
    if (!LABELS[o.labels]) o.labels = (o.labels === '1' || o.labels === 'true') ? 'atoms' : 'off';
    o.src = null;
    if (h.has('d')) o.src = { kind: 'data', data: h.get('d'), name: h.get('n') || 'structure.' + (o.fmt || 'pdb') };
    else if (q.has('pdb')) o.src = { kind: 'repo', path: q.get('pdb') };
    else if (q.has('file')) o.src = { kind: 'repo', path: q.get('file') };
    else if (q.has('url')) o.src = { kind: 'url', url: q.get('url') };
    else if (q.has('id')) o.src = { kind: 'rcsb', id: q.get('id').trim().toUpperCase() };
    else if (q.has('cid')) o.src = { kind: 'pubchem', cid: q.get('cid').trim() };
    return o;
  }
  function isOn(v) { return v === '1' || v === 'true' || v === 'yes' || v === 'on'; }

  // Строит строку параметров только из отличающихся от умолчания значений
  function buildQuery(src, o) {
    const p = new URLSearchParams();
    if (src) {
      if (src.kind === 'repo') p.set('pdb', src.path);
      else if (src.kind === 'url') p.set('url', src.url);
      else if (src.kind === 'rcsb') p.set('id', src.id);
      else if (src.kind === 'pubchem') p.set('cid', src.cid);
    }
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'fmt' && src && src.kind !== 'data' && !o.fmt) continue;
      if (o[k] != null && String(o[k]) !== DEFAULTS[k] && String(o[k]) !== '') p.set(k, o[k]);
    }
    let s = p.toString().replace(/%2F/gi, '/');
    if (src && src.kind === 'data') s += (s ? '' : '') + '#d=' + src.data + (src.name ? '&n=' + encodeURIComponent(src.name) : '');
    return s;
  }

  // ---------- загрузка ----------
  function extFormat(name) {
    const m = /\.([a-z0-9]+)(?:\.gz)?(?:[?#].*)?$/i.exec(name || '');
    return m ? (FORMATS[m[1].toLowerCase()] || '') : '';
  }
  function sniffFormat(text) {
    const head = text.slice(0, 4000);
    if (/^\s*data_/m.test(head) && /_atom_site\.|_struct\./.test(text.slice(0, 200000))) return 'cif';
    if (/@<TRIPOS>/.test(head)) return 'mol2';
    if (/V2000|V3000/.test(head) || /M {2}END/.test(text)) return 'sdf';
    if (/^(ATOM  |HETATM|HEADER|CRYST1|MODEL )/m.test(head)) return 'pdb';
    if (/^\s*\d+\s*$/m.test(text.split('\n')[0] || '')) return 'xyz';
    return 'pdb';
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
  async function loadSource(src, o) {
    const fmtOverride = o && o.fmt ? (FORMATS[o.fmt] || o.fmt) : '';
    if (!src) throw new Error('Не указана структура.');
    if (src.kind === 'data') {
      const text = decodeData(src.data);
      return { text, fmt: fmtOverride || extFormat(src.name) || sniffFormat(text), name: src.name, origin: 'встроена в ссылку' };
    }
    if (src.kind === 'repo') {
      const url = new URL(src.path, location.href).href;
      const text = await fetchText(url);
      return { text, fmt: fmtOverride || extFormat(src.path) || sniffFormat(text), name: src.path.split('/').pop(), origin: src.path, url };
    }
    if (src.kind === 'url') {
      const text = await fetchText(src.url);
      return { text, fmt: fmtOverride || extFormat(src.url) || sniffFormat(text), name: decodeURIComponent(src.url.split('?')[0].split('/').pop() || 'structure'), origin: src.url, url: src.url };
    }
    if (src.kind === 'rcsb') {
      if (!/^[0-9][A-Z0-9]{3}$/.test(src.id) && !/^PDB_[0-9A-Z]{8}$/.test(src.id)) throw new Error('Неверный PDB ID: «' + src.id + '». Пример: 1CRN');
      let text, fmt = 'pdb';
      try { text = await fetchText('https://files.rcsb.org/download/' + src.id + '.pdb'); }
      catch (e) { text = await fetchText('https://files.rcsb.org/download/' + src.id + '.cif'); fmt = 'cif'; }
      return { text, fmt, name: src.id, origin: 'RCSB PDB ' + src.id, link: 'https://www.rcsb.org/structure/' + src.id };
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
  // Оставляет в PDB только нужное для отображения (первая модель), чтобы ссылка была короче
  function compactText(text, fmt) {
    if (fmt === 'pdb' || fmt === 'pqr') {
      const out = []; let inModel = false, modelsSeen = 0;
      for (const raw of text.split(/\r?\n/)) {
        const rec = raw.slice(0, 6);
        if (rec === 'MODEL ') { modelsSeen++; if (modelsSeen > 1) break; inModel = true; continue; }
        if (rec === 'ENDMDL') { if (inModel) break; continue; }
        if (rec === 'ATOM  ' || rec === 'HETATM') {
          // убираем occupancy/B-factor (колонки 55-66) — для картинки не нужны
          const l = raw.padEnd(80);
          out.push((l.slice(0, 54) + '            ' + l.slice(66, 80)).replace(/\s+$/, ''));
        } else if (rec === 'HELIX ' || rec === 'SHEET ' || rec === 'CONECT') out.push(raw.replace(/\s+$/, ''));
      }
      return out.join('\n') + '\nEND\n';
    }
    if (fmt === 'sdf') { const i = text.indexOf('M  END'); return i > 0 ? text.slice(0, i + 6) + '\n$$$$\n' : text; }
    return text.replace(/[ \t]+$/gm, '');
  }

  // ---------- информация о структуре ----------
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
      const m = /_struct\.title\s+(?:'([^']*)'|"([^"]*)"|\n;([\s\S]*?)\n;|(\S.*))/.exec(text);
      if (m) info.title = (m[1] || m[2] || m[3] || m[4] || '').replace(/\s+/g, ' ').trim();
      const e = /_entry\.id\s+(\S+)/.exec(text); if (e) info.idcode = e[1];
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
  function titleCase(s) { // «WATER STRUCTURE OF…» → «Water structure of…»
    if (!s || s !== s.toUpperCase()) return s;
    s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- 3D-вид ----------
  class MolView {
    constructor(el, opts) {
      this.el = el;
      this.o = Object.assign({}, DEFAULTS, opts || {});
      this.viewer = $3Dmol.createViewer(el, { backgroundColor: '#' + this.o.bg, antialias: true, cartoonQuality: 8 });
      this.model = null; this.stats = null;
      this.onAtomClick = null;
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this.viewer.resize(); this.viewer.render(); }) : null;
      if (this._ro) this._ro.observe(el);
    }
    load(text, fmt) {
      const v = this.viewer;
      v.clear(); v.removeAllSurfaces(); v.removeAllLabels();
      this.model = v.addModel(text, fmt, { keepH: true, assignBonds: true });
      if (!this.model || !this.model.selectedAtoms({}).length) throw new Error('В файле не найдено атомов (формат: ' + fmt + ').');
      this.stats = this._stats();
      const self = this;
      v.setClickable({}, true, function (atom) { if (self.onAtomClick) self.onAtomClick(atom); });
      this.apply();
      this.fit();
      if (this.o.view) this.setViewString(this.o.view);
      v.render();
      this.setSpin(isOn(this.o.spin));
      return this.stats;
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
      if (s === 'auto') s = this.stats.isMacro ? 'cartoon' : 'ballstick';
      if (s === 'cartoon' && !this.stats.hasPolymer) s = 'ballstick';
      return s;
    }
    effectiveColor(style) {
      let c = this.o.color;
      if (c === 'auto') c = style === 'cartoon' ? (this.stats.chains.length > 1 ? 'chain' : 'spectrum') : 'element';
      return c;
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
    apply(newOpts) {
      if (newOpts) Object.assign(this.o, newOpts);
      const v = this.viewer, o = this.o;
      if (!this.model) return;
      v.setBackgroundColor('#' + (o.bg || 'ffffff').replace('#', ''));
      v.removeAllSurfaces(); v.removeAllLabels();
      const style = this.effectiveStyle(), color = this.effectiveColor(style);
      const col = this._color(color, false), colC = this._color(color, true);
      let spec;
      if (style === 'cartoon') spec = { cartoon: Object.assign({ arrows: true, tubes: false }, colC) };
      else if (style === 'stick') spec = { stick: Object.assign({ radius: 0.18 }, col) };
      else if (style === 'ballstick') spec = { stick: Object.assign({ radius: 0.13 }, col), sphere: Object.assign({ scale: 0.27 }, col) };
      else if (style === 'sphere') spec = { sphere: Object.assign({ scale: 1.0 }, col) };
      else spec = { line: Object.assign({ linewidth: 2 }, col) };
      v.setStyle({}, spec);
      if (style === 'cartoon') {
        // лиганды и ионы — палочками (основания ДНК/РНК 3Dmol рисует «ступеньками» сам)
        v.setStyle({ hetflag: true }, { stick: Object.assign({ radius: 0.2 }, this._color('element')), sphere: { scale: 0.25, colorscheme: 'Jmol' } });
      }
      if (!isOn(o.water)) v.setStyle({ resn: WATERS }, {});
      else v.setStyle({ resn: WATERS }, { sphere: { scale: 0.22, color: '#ff4444' } });
      if (!isOn(o.h)) v.setStyle({ elem: ['H', 'D'] }, {});
      if (isOn(o.surface) || ['vdw', 'ms', 'sas', 'ses'].includes(o.surface)) {
        const t = o.surface === 'vdw' ? $3Dmol.SurfaceType.VDW : o.surface === 'sas' ? $3Dmol.SurfaceType.SAS : (this.stats.isMacro ? $3Dmol.SurfaceType.MS : $3Dmol.SurfaceType.VDW);
        const sc = color === 'element' || color === 'auto' ? { color: '#d9e2f0' } : this._color(color, false);
        v.addSurface(t, Object.assign({ opacity: Math.max(0.1, Math.min(1, parseFloat(o.sop) || 0.6)) }, sc), { not: { resn: WATERS } });
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
      v.render();
    }
    setSpin(on) { this.spinning = !!on; this.viewer.spin(on ? 'y' : false, 0.6); }
    fit() { // zoomTo вписывает по высоте — на узком (портретном) экране дополнительно отдаляем
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

  window.PV = { DEFAULTS, STYLES, COLORS, LABELS, WATERS, FORMATS, parseParams, buildQuery, loadSource, fetchText, extFormat, sniffFormat, encodeData, decodeData, compactText, parseHeader, titleCase, MolView, isOn, isDark, saveImage, safeName };
})();
