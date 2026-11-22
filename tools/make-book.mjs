#!/usr/bin/env node
// Создаёт пустой structures/_book/book.json (5 глав, рисунки и задачи с номерами по умолчанию).
// Существующий файл не трогает. Флаг --demo добавляет демо-рисунки из краун-эфиров (4.1, 4.2, задача 4.1).
// Запуск: node tools/make-book.mjs [--demo] [--force]
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'structures/_book/book.json');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/book.js'), 'utf8'), ctx);
const B = ctx.window.PVBook;
if (fs.existsSync(out) && !process.argv.includes('--force')) { console.log('book.json уже есть — не трогаю (--force перезапишет)'); process.exit(0); }
const book = JSON.parse(JSON.stringify(B.emptyBook()));
if (process.argv.includes('--demo')) {
  const ch4 = book.chapters.find(c => c.n === 4);
  const C = 'pdb:structures/_supra/crown/complexes/';
  Object.assign(ch4.materials[0], { caption: 'ДЕМО (можно удалить): краун-эфиры и их комплексы — переключение размера цикла, иона и состава', set: '_supra/crown/complexes' });
  Object.assign(ch4.materials[1], {
    caption: 'ДЕМО (можно удалить): 18-краун-6 с ионами разного размера, структуры наложены',
    keep: true, params: { style: 'ballstick' },
    items: [
      { t: '18-краун-6', s: C + '6.sdf' },
      { t: '18-краун-6 · Na⁺', s: C + '6-Na.sdf' },
      { t: '18-краун-6 · K⁺', s: C + '6-K.sdf' },
      { t: '18-краун-6 · Cs⁺', s: C + '6-Cs.sdf' }
    ]
  });
  Object.assign(ch4.tasks[0], {
    caption: 'ДЕМО (можно удалить)',
    text: 'Какой ион щелочного металла лучше всего подходит по размеру к полости 18-краун-6? Предскажите строение комплекса.',
    params: { style: 'ballstick' },
    cond: { items: [{ t: '18-краун-6', s: C + '6.sdf' }] },
    ans: { items: [{ t: '18-краун-6 · K⁺', s: C + '6-K.sdf' }] }
  });
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(book, null, 1) + '\n');
console.log('structures/_book/book.json: ' + book.chapters.map(c => `гл.${c.n} ${c.materials.length}/${c.tasks.length}`).join(', '));
