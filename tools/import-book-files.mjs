/* Разложить присланные файлы по рисункам учебника (то же правило, что в редакторе — assets/book-place.js).
   node tools/import-book-files.mjs [--dry] [--merge] [--from-title] файл… | путь=ИМЯ…
     «5.11.2.mae» → Рис. 5.11, часть 2;  «!5.3.1.mae» → Задача 5.3, условие («…ответ…» в имени → ответ).
     путь=5-11-2.mae — если у файла на диске другое имя (например, хэш вложения).
     --from-title  номер из заголовка структуры в .mae (s_m_title, иначе s_m_entry_name), например «Рис 5-11-2 Cu»;
                   нет номера в заголовке — берётся из имени файла; разные номера у структур одного файла —
                   каждая группа выносится в отдельный .mae (с заголовком файла).
     --merge  несколько структур одного номера показать вместе, а не вариантами.
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
const dry = args.includes('--dry'), merge = args.includes('--merge'), fromTitle = args.includes('--from-title');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exit(1); }
const BOOK = process.env.BOOK || path.join(ROOT, 'structures/_book/book.json');
const book = JSON.parse(fs.readFileSync(BOOK, 'utf8'));

const rows = [];
for (const a of files) {
  const eq = a.lastIndexOf('=');
  const src = eq > 0 ? a.slice(0, eq) : a, name = eq > 0 ? a.slice(eq + 1) : path.basename(a);
  const buf = fs.readFileSync(src);
  const text = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString('utf8');
  let info = null;
  if (/\.(mae|maegz|mae\.gz)$/i.test(name)) {
    info = Mae.summary(text);
    for (const c of info) console.log(`  [${name}] структура ${c.index + 1}: «${c.title}»${c.entryName && c.entryName !== c.title ? ' (запись «' + c.entryName + '»)' : ''} ${c.formula}, атомов ${c.atoms}, связей ${c.bonds} (нулевого порядка ${c.zeroOrder}), скрыто ${c.hidden}, цветов ${c.colors}, атомы: ${JSON.stringify(c.atomReps)}, связи: ${JSON.stringify(c.bondReps)}${c.duplicateBonds ? ', повторов связей (убраны при показе) ' + c.duplicateBonds : ''}`);
    for (const c of info) for (const o of c.overlaps || []) console.log(`  ⚠ [${name}] атомы ${o.a} ${o.ea}${o.na ? ' «' + o.na + '»' : ''} и ${o.b} ${o.eb}${o.nb ? ' «' + o.nb + '»' : ''} на расстоянии ${o.d} Å — лишний атом поверх другого? (не удалён)`);
  }
  const cts = info ? info.map(c => ({ title: c.title, entryName: c.entryName })) : null;
  for (const r of Place.planFile({ name, cts }, fromTitle ? 'title' : 'name')) {
    const sel = cts ? (r.ctIdx || cts.map((_, k) => k)).map(k => cts[k]) : [];
    r.entryCts = merge && sel.length > 1 ? [{ title: sel.map(c => c.title).filter(Boolean).join(' + ') }] : sel.map(c => ({ title: c.title || c.entryName }));
    r.buf = buf; r.text = text;
    rows.push(r);
  }
}
const ok = rows.filter(r => r.ok);
for (const r of rows.filter(r => !r.ok)) console.log('✗ ' + r.name + ': ' + r.why);
const res = Place.place(book, ok.map(r => ({ name: r.name, num: r.src === 'name' ? null : r.num, fileName: r.fileName, cts: r.entryCts })), { dryRun: dry });
res.report.forEach((rp, i) => {
  const r = ok[i];
  const from = r.src === 'title' ? 'заголовок' : r.src === 'entry' ? 'имя записи' : 'имя файла';
  if (!rp.ok) { console.log('✗ ' + r.name + ': ' + rp.why); return; }
  console.log(`✓ ${r.name}${r.split ? ' [структуры ' + r.ctIdx.map(k => k + 1).join(', ') + ']' : ''} → ${rp.title} (${rp.id}${rp.created ? ', новый' : ''})${rp.task ? ' — ' + (rp.part === 'ans' ? 'ответ' : 'условие') : ''}: ${rp.variants.join(', ')} · номер из: ${from}${rp.replaced ? ' · заменено ' + rp.replaced : rp.occupied ? ' · в рисунке уже ' + rp.occupied + ' стр.' : ''}${r.warn ? ' · ' + r.warn : ''}${rp.note ? ' · ' + rp.note : ''}${dry ? '' : ' → ' + rp.path}`);
  if (!dry) {
    const dst = path.join(ROOT, rp.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, r.split ? Mae.extract(r.text, r.ctIdx.map(k => k + 1).join(',')) : r.buf);
  }
});
if (!dry && res.changed) { fs.writeFileSync(BOOK, JSON.stringify(book, null, 1) + '\n'); console.log('book.json обновлён.'); }
