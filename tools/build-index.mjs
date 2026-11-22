#!/usr/bin/env node
// Собирает дерево structures/index.json.
// Папки могут быть вложенными. Название папки — из _folder.json или из имени каталога.
// Записи с настройками и «виртуальные» источники (COD, RCSB, PubChem, CCDC) лежат в _entries.json.
// Файлы структур, которых нет в _entries.json, добавляются автоматически.
// Запуск: node tools/build-index.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'structures');
const indexPath = path.join(dir, 'index.json');
const EXT = /\.(pdb|ent|cif|mmcif|sdf|mol|mol2|xyz|pqr|gro)(\.gz)?$/i;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function titleCase(s) {
  if (!s || s !== s.toUpperCase()) return s;
  s = s.toLowerCase();
  return s[0].toUpperCase() + s.slice(1);
}
function guessTitle(abs, file) {
  if (/\.gz$/i.test(file)) return file;
  let text = '';
  try { text = fs.readFileSync(abs, 'utf8').slice(0, 40000); } catch { return file.replace(EXT, ''); }
  const ext = file.split('.').pop().toLowerCase();
  let t = '';
  if (ext === 'pdb' || ext === 'ent' || ext === 'pqr') {
    const mol = /^COMPND.{4}.*MOLECULE:\s*([^;\n]+)/m.exec(text);
    const titles = text.split('\n').filter(l => l.startsWith('TITLE ')).map(l => l.slice(10).trim()).join(' ');
    t = mol ? mol[1].trim() : titles;
    const id = /^HEADER.{56}(\w{4})/m.exec(text);
    if (id && t) t += ` (${id[1]})`;
  } else if (ext === 'cif' || ext === 'mmcif') {
    const chem = /_(?:chemical_name_common|chemical_name_mineral|chemical_name_systematic)\s+'?([^'\n]+)/.exec(text);
    const paper = /_struct(?:\.|_)title\s+'?([^'\n]+)/.exec(text);
    t = chem ? chem[1].trim() : (paper ? paper[1].trim() : '');
  } else if (ext === 'sdf' || ext === 'mol') t = text.split('\n')[0].trim();
  else if (ext === 'mol2') { const l = text.split('\n'); t = (l[l.findIndex(x => x.includes('@<TRIPOS>MOLECULE')) + 1] || '').trim(); }
  else if (ext === 'xyz') t = (text.split('\n')[1] || '').trim();
  return titleCase(t.replace(/\s+/g, ' ').trim()) || file.replace(EXT, '');
}
function normalizeSource(s, fileFallback) {
  const src = s && typeof s === 'object' ? Object.assign({}, s) : {};
  let type = src.type || src.kind || (src.file || fileFallback ? 'file' : 'file');
  if (type === 'pdb') type = 'rcsb';
  const out = { type };
  if (src.file || fileFallback) out.file = src.file || fileFallback;
  if (type === 'pubchem') out.cid = String(src.cid || src.id || '');
  else if (src.id != null && type !== 'file') out.id = type === 'rcsb' ? String(src.id).toUpperCase() : String(src.id);
  if (type === 'url' && src.url) out.url = src.url;
  if (type === 'set') {
    // набор: файл *.set.json (set — путь от structures/, file — в папке записи) или список учителя items
    if (src.set) out.set = String(src.set);
    if (Array.isArray(src.items)) out.items = src.items.map(it => ({ t: String(it.t || it.title || ''), s: String(it.s || it.src || '') })).filter(it => it.s);
    if (src.keep) out.keep = true;
  }
  return out;
}
function byOrder(a, b) {
  const ao = a.order == null ? 1000 : a.order;
  const bo = b.order == null ? 1000 : b.order;
  if (ao !== bo) return ao - bo;
  return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
}
function cleanEntry(e) {
  const out = { slug: e.slug, path: e.path, title: e.title || e.slug, description: e.description || '', source: e.source };
  if (e.order != null) out.order = e.order;
  if (e.params && Object.keys(e.params).length) out.params = e.params;
  return out;
}

function walk(abs, rel) {
  const meta = readJson(path.join(abs, '_folder.json'), {});
  const rawList = readJson(path.join(abs, '_entries.json'), []);
  const listed = Array.isArray(rawList) ? rawList : (rawList.entries || []);
  const names = fs.existsSync(abs) ? fs.readdirSync(abs) : [];
  const files = names.filter(f => EXT.test(f) && fs.statSync(path.join(abs, f)).isFile());
  const used = new Set();
  const entries = [];
  for (const e of listed) {
    const src = normalizeSource(e.source || {}, e.file);
    if (src.file) used.add(src.file);
    const slug = String(e.slug || (src.file ? src.file.replace(EXT, '') : (src.id || src.cid || 'entry'))).trim();
    entries.push(cleanEntry({
      slug,
      path: rel ? rel + '/' + slug : slug,
      title: e.title || guessTitle(src.file ? path.join(abs, src.file) : '', src.file || slug),
      description: e.description || '',
      order: e.order,
      source: src,
      params: e.params || undefined
    }));
  }
  for (const f of files) {
    if (used.has(f)) continue;
    const slug = f.replace(EXT, '');
    entries.push(cleanEntry({
      slug,
      path: rel ? rel + '/' + slug : slug,
      title: guessTitle(path.join(abs, f), f),
      description: '',
      source: { type: 'file', file: f }
    }));
  }
  entries.sort(byOrder);
  const folders = [];
  for (const name of names) {
    if (name.startsWith('.') || name.startsWith('_')) continue;
    const child = path.join(abs, name);
    if (!fs.statSync(child).isDirectory()) continue;
    folders.push(walk(child, rel ? rel + '/' + name : name));
  }
  folders.sort(byOrder);
  const node = {
    path: rel,
    title: meta.title || (rel ? rel.split('/').pop() : 'Каталог'),
    description: meta.description || '',
    folders,
    entries
  };
  if (meta.order != null) node.order = meta.order;
  if (meta.book) {
    // учебник (structures/_book/book.json) — виртуальная подпапка: Учебник → Глава N → Материалы / Задачи → готовые рисунки
    const bf = bookFolder(path.join(dir, String(meta.book)), rel);
    if (bf) { folders.push(bf); folders.sort(byOrder); }
  }
  return node;
}

function bookFolder(file, rel) {
  const book = readJson(file, null);
  if (!book || !Array.isArray(book.chapters)) return null;
  const partFilled = p => !!(p && ((p.set && String(p.set).trim()) || (p.items || []).some(it => it && it.s)));
  const visible = s => s && !s.hidden && (s.cond || s.ans ? partFilled(s.cond) || partFilled(s.ans) : partFilled(s));
  const base = (rel ? rel + '/' : '') + 'Учебник';
  const chapters = book.chapters.map((ch, ci) => {
    const cpath = base + '/Глава ' + ch.n;
    const sec = (key, slug, title, order) => {
      const fpath = cpath + '/' + slug;
      const entries = (ch[key] || []).filter(visible).map((s, i) => cleanEntry({
        slug: s.id, path: fpath + '/' + s.id, title: s.title || s.id, description: s.caption || '', order: i,
        source: { type: 'fig', id: s.id }
      }));
      return { path: fpath, title, description: '', folders: [], entries, order };
    };
    return {
      path: cpath, title: 'Глава ' + ch.n + '. ' + (ch.title || ''), description: '', order: ci + 1,
      folders: [sec('materials', 'Материалы главы', 'Материалы главы', 1), sec('tasks', 'Задачи и тесты', 'Задачи и тесты', 2)], entries: []
    };
  });
  return {
    path: base, title: 'Учебник „' + String(book.title || 'Супрамолекулярная химия').replace(/[«»„“"]/g, '') + '“',
    description: 'Главы учебника. Ссылка для учеников — book.html', order: 0, folders: chapters, entries: [], bookPage: 'book.html'
  };
}

function collect(node, flat, codFiles) {
  for (const e of node.entries || []) {
    flat.push(e);
    if (e.source && e.source.type === 'cod' && e.source.id && e.source.file) {
      const folder = e.path.includes('/') ? e.path.split('/').slice(0, -1).join('/') : '';
      codFiles[String(e.source.id)] = (folder ? folder + '/' : '') + e.source.file;
    }
  }
  for (const f of node.folders || []) collect(f, flat, codFiles);
}

const tree = walk(dir, '');
const flat = [];
const codFiles = {};
collect(tree, flat, codFiles);
const codDir = path.join(dir, '_cod');
if (fs.existsSync(codDir)) {
  for (const f of fs.readdirSync(codDir)) {
    const m = /^(\d+)\.cif$/i.exec(f);
    if (m && !codFiles[m[1]]) codFiles[m[1]] = '_cod/' + f;
  }
}
const legacy = readJson(path.join(dir, '_legacy.json'), {});
const out = { version: 2, legacy, codFiles, tree, flat };
const json = JSON.stringify(out, null, 2) + '\n';
const prev = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
if (json !== prev) fs.writeFileSync(indexPath, json);
console.log(`structures/index.json: папок ${countFolders(tree)}, записей ${flat.length}` + (Object.keys(codFiles).length ? `, COD-файлов ${Object.keys(codFiles).length}` : ''));
function countFolders(n) { return (n.folders || []).reduce((s, f) => s + 1 + countFolders(f), 0); }
