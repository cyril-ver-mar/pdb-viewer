/* Разложить присланные файлы по рисункам учебника (то же правило, что в редакторе — assets/book-place.js).
   node tools/import-book-files.mjs [--dry] [--merge] файл… | путь=ИМЯ…
     «5.11.2.mae» → Рис. 5.11, часть 2;  «!5.3.1.mae» → Задача 5.3, условие («…ответ…» в имени → ответ).
     путь=5-11-2.mae — если у файла на диске другое имя (например, хэш вложения).
     --merge  несколько структур одного .mae показать вместе, а не вариантами.
     --dry    только показать, что будет сделано.
   Копирует файлы в structures/_book/files/ch<N>/<id>/ и правит structures/_book/book.json. Коммит — вручную. */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Mae = require(path.join(ROOT, 'assets/mae.js'));
const Place = require(path.join(ROOT, 'assets/book-place.js'));

const args = process.argv.slice(2);
const dry = args.includes('--dry'), merge = args.includes('--merge');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exit(1); }
const BOOK = path.join(ROOT, 'structures/_book/book.json');
const book = JSON.parse(fs.readFileSync(BOOK, 'utf8'));

const entries = [];
for (const a of files) {
  const eq = a.lastIndexOf('=');
  const src = eq > 0 ? a.slice(0, eq) : a, name = eq > 0 ? a.slice(eq + 1) : path.basename(a);
  const buf = fs.readFileSync(src);
  const text = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString('utf8');
  let cts = [{ title: '' }], info = null;
  if (/\.(mae|maegz|mae\.gz)$/i.test(name)) {
    info = Mae.summary(text);
    cts = merge ? [{ title: info.map(c => c.title).filter(Boolean).join(' + ') }] : info.map(c => ({ title: c.title || c.entryName }));
  }
  entries.push({ name, src, buf, cts, info });
}
const res = Place.place(book, entries.map(e => ({ name: e.name, cts: e.cts })), { dryRun: dry });
res.report.forEach((r, i) => {
  const e = entries[i];
  if (e.info) for (const c of e.info) console.log(`  [${e.name}] структура ${c.index + 1}: «${c.title}» ${c.formula}, атомов ${c.atoms}, связей ${c.bonds} (нулевого порядка ${c.zeroOrder}), скрыто ${c.hidden}, цветов ${c.colors}, атомы: ${JSON.stringify(c.atomReps)}, связи: ${JSON.stringify(c.bondReps)}`);
  if (!r.ok) { console.log('✗ ' + r.name + ': ' + r.why); return; }
  console.log(`✓ ${r.name} → ${r.title} (${r.id}${r.created ? ', новый' : ''})${r.task ? ' — ' + (r.part === 'ans' ? 'ответ' : 'условие') : ''}: ${r.variants.join(', ')}${r.replaced ? ' (заменено ' + r.replaced + ')' : ''}${r.note ? ' · ' + r.note : ''}`);
  if (!dry) {
    const dst = path.join(ROOT, r.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.buf);
  }
});
if (!dry && res.changed) { fs.writeFileSync(BOOK, JSON.stringify(book, null, 1) + '\n'); console.log('book.json обновлён.'); }
