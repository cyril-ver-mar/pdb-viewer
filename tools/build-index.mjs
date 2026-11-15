#!/usr/bin/env node
// Пересобирает structures/index.json по файлам в папке structures/.
// Названия, описания и параметры уже существующих записей сохраняются; новые файлы добавляются с названием из заголовка файла.
// Запуск: node tools/build-index.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'structures');
const indexPath = path.join(dir, 'index.json');
const EXT = /\.(pdb|ent|cif|mmcif|sdf|mol|mol2|xyz|pqr|gro)(\.gz)?$/i;

let old = { structures: [] };
try { old = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { /* нет файла — создадим */ }
const oldList = Array.isArray(old) ? old : (old.structures || []);
const byFile = new Map(oldList.map(e => [e.file, e]));

function titleCase(s) { if (!s || s !== s.toUpperCase()) return s; s = s.toLowerCase(); return s[0].toUpperCase() + s.slice(1); }
function guessTitle(file) {
  if (/\.gz$/i.test(file)) return file;
  const text = fs.readFileSync(path.join(dir, file), 'utf8').slice(0, 20000);
  const ext = file.split('.').pop().toLowerCase();
  let t = '';
  if (ext === 'pdb' || ext === 'ent' || ext === 'pqr') {
    const mol = /^COMPND.{4}.*MOLECULE:\s*([^;\n]+)/m.exec(text);
    const titles = text.split('\n').filter(l => l.startsWith('TITLE ')).map(l => l.slice(10).trim()).join(' ');
    t = mol ? mol[1].trim() : titles;
    const id = /^HEADER.{56}(\w{4})/m.exec(text); if (id && t) t += ` (${id[1]})`;
  } else if (ext === 'cif' || ext === 'mmcif') {
    const m = /_struct\.title\s+['"]?([^'"\n]+)/.exec(text); t = m ? m[1] : '';
  } else if (ext === 'sdf' || ext === 'mol') t = text.split('\n')[0].trim();
  else if (ext === 'mol2') { const l = text.split('\n'); t = (l[l.findIndex(x => x.includes('@<TRIPOS>MOLECULE')) + 1] || '').trim(); }
  else if (ext === 'xyz') t = (text.split('\n')[1] || '').trim();
  return titleCase(t.replace(/\s+/g, ' ').trim()) || file.replace(EXT, '');
}

const files = fs.readdirSync(dir).filter(f => EXT.test(f) && fs.statSync(path.join(dir, f)).isFile());
const kept = oldList.filter(e => files.includes(e.file));
const added = files.filter(f => !byFile.has(f)).sort().map(f => ({ file: f, title: guessTitle(f), description: '' }));
const removed = oldList.filter(e => !files.includes(e.file)).map(e => e.file);
const out = { structures: [...kept, ...added] };
const json = JSON.stringify(out, null, 2) + '\n';
const prev = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
if (json !== prev) fs.writeFileSync(indexPath, json);
console.log(`structures/index.json: ${out.structures.length} шт.` + (added.length ? `, добавлено: ${added.map(a => a.file).join(', ')}` : '') + (removed.length ? `, удалено: ${removed.join(', ')}` : ''));
