#!/usr/bin/env node
// Перед публикацией дописывает к ссылкам на assets/*.js и *.css версию: assets/core.js?v=<коммит>.
// GitHub Pages отдаёт файлы с max-age=600, и без версии телефон мог взять новый index.html
// со старым core.js из кэша (тогда ?fig= не распознавался и открывался каталог).
// Меняет только копию для публикации (запускается в Actions); в репозитории ссылки остаются без версии.
// Запуск: node tools/stamp-assets.mjs <версия>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ver = String(process.argv[2] || process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 8);
let n = 0;
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const p = path.join(root, f);
  const s = fs.readFileSync(p, 'utf8');
  const out = s.replace(/(\s(?:src|href)=")(assets\/[^"?#]+\.(?:js|css))(")/g, (m, a, u, b) => { n++; return a + u + '?v=' + ver + b; });
  if (out !== s) fs.writeFileSync(p, out);
}
console.log(`assets: версия ${ver}, ссылок ${n}`);
