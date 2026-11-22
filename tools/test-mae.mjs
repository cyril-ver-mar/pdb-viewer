/* Импорт Maestro (.mae/.maegz) и раскладка файлов по именам.
   1) разбор файла (без браузера): атомы, связи, цвета, представления, связи нулевого порядка;
   2) правило имён «глава.рисунок.часть» и «!» для задач (assets/book-place.js);
   3) отрисовка в просмотрщике: пунктир виден, переключатели «Стиль/Цвета из Maestro»; рисунок учебника
      с вариантами #ct=…; страница учителя; массовая загрузка в редакторе (GitHub API поддельный).
   Запуск: BASE=http://127.0.0.1:18431/ SHOTS=/workspace/shots node tools/test-mae.mjs
   MAE=путь1,путь2 — дополнительно разобрать эти файлы (только пункт 1). */
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { createRequire } from 'module';
import { chromium, webkit, devices } from 'playwright';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Mae = require(path.join(ROOT, 'assets/mae.js'));
const Place = require(path.join(ROOT, 'assets/book-place.js'));
const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const SHOTS = process.env.SHOTS || '';
const DEV = (process.env.DEV || 'iphone,pixel,desk').split(',');
const LIVE = /github\.io/.test(BASE);
const fails = [];
const ok = (name, cond, info) => { console.log((cond ? '✓ ' : '✗ ') + name + (info ? '  ' + info : '')); if (!cond) fails.push(name + ' ' + (info || '')); };

// ---------- 1. разбор ----------
const FIX = path.join(ROOT, 'structures/_test/mae/test-scene.mae');
const text = fs.readFileSync(FIX, 'utf8');
const f = Mae.parse(text);
ok('mae: 2 структуры', f.cts.length === 2, String(f.cts.length));
const [c1, c2] = f.cts;
ok('mae: заголовки s_m_title', c1.title === '18-краун-6 · K⁺ (сцена)' && c2.title === '18-краун-6 (трубки)');
ok('mae: CT1 43 атома, 48 связей', c1.atoms.length === 43 && c1.bonds.length === 48, c1.atoms.length + '/' + c1.bonds.length);
ok('mae: CT1 6 связей нулевого порядка K–O', c1.bonds.filter(b => b.order === 0).length === 6 && c1.bonds.filter(b => b.order === 0).every(b => c1.atoms[b.a].elem === 'K' && c1.atoms[b.b].elem === 'O'));
ok('mae: элементы по i_m_atomic_number', c1.atoms.filter(a => a.elem === 'C').length === 12 && c1.atoms.filter(a => a.elem === 'O').length === 6 && c1.atoms.filter(a => a.elem === 'K').length === 1);
ok('mae: формальный заряд K +1', c1.atoms.find(a => a.elem === 'K').charge === 1);
ok('mae: цвета из s_m_color_rgb', c1.atoms.find(a => a.elem === 'C').color === '33CC33' && c1.atoms.find(a => a.elem === 'K').color === '8F40D4');
ok('mae: представление атомов (шарики / CPK / нет)', c1.atoms.every(a => a.rep === 3) && c2.atoms[0].rep === 2 && c2.atoms.slice(1).every(a => a.rep === 0));
ok('mae: представление связей (палочки / каркас / трубки)', c1.bonds.filter(b => b.order).every(b => b.repA === 3) && c1.bonds.filter(b => !b.order).every(b => b.repA === 1) && c2.bonds.every(b => b.repA === 2));
ok('mae: скрытые атомы i_m_visibility', c1.atoms.filter(a => !a.visible).length === 12 && c1.atoms.filter(a => !a.visible).every(a => a.elem === 'H'));
ok('mae: подпись %UT', c1.atoms.find(a => a.elem === 'K').label === 'K⁺');
const s3 = Mae.to3Dmol(text);
ok('mae→3Dmol: связи нулевого порядка не в bonds, а в zob', s3.zob.length === 6 && s3.atoms[42].bonds.length === 0, JSON.stringify(s3.zob[0]));
ok('mae→3Dmol: обе структуры в одной сцене', s3.atoms.length === 85);
ok('mae: extract #ct=2', Mae.parse(Mae.extract(text, '2')).cts.length === 1 && Mae.parse(Mae.extract(text, '2')).cts[0].title === c2.title);
ok('mae: номер цвета без RGB → палитра Maestro', Mae.parse(text.replace(/ 33CC33 /g, ' <> ')).cts[0].atoms.find(a => a.elem === 'C').color === 'A0A0A0');
ok('maegz = тот же файл', Mae.parse(zlib.gunzipSync(fs.readFileSync(FIX + 'gz')).toString()).cts.length === 2);
const sum = Mae.summary(text);
ok('mae: сводка (формула)', sum[0].formula === 'C12H24KO6' && sum[1].formula === 'C12H24O6', sum.map(s => s.formula).join(','));
// строки в кавычках с пробелами и экранированием, комментарии, пустые значения
const tricky = '{\n s_m_m2io_version\n :::\n 2.0.0\n}\nf_m_ct {\n s_m_title\n r_x\n :::\n "a \\"b\\" c" <>\n m_atom[2] {\n # First column is atom index #\n i_m_mmod_type r_m_x_coord r_m_y_coord r_m_z_coord i_m_atomic_number s_m_atom_name\n :::\n 1 7 0 0 0 6 "C 1"\n 2 48 1.5 0 0 17 <>\n :::\n }\n m_bond[1] {\n i_m_from i_m_to i_m_order\n :::\n 1 1 2 0\n :::\n }\n}\n';
const t = Mae.parse(tricky).cts[0];
ok('mae: кавычки, экранирование, <>', t.title === 'a "b" c' && t.atoms[0].name === 'C 1' && t.atoms[1].elem === 'Cl' && t.bonds[0].order === 0);
for (const extra of (process.env.MAE || '').split(',').filter(Boolean)) {
  const s = Mae.summary(fs.readFileSync(extra).toString());
  ok('mae: ' + path.basename(extra), s.length > 0 && s.every(c => c.atoms > 0), s.map(c => `«${c.title}» ${c.formula} атомов ${c.atoms} связей ${c.bonds} нулевых ${c.zeroOrder}`).join(' | '));
}

// ---------- 2. имена ----------
const P = Place.parseName;
ok('имя 5.11.2.mae', JSON.stringify([P('5.11.2.mae').ch, P('5.11.2.mae').fig, P('5.11.2.mae').sub, P('5.11.2.mae').task]) === '[5,11,2,false]');
ok('имя 5-15-1.mae / 5_15_1.maegz / «5 15 1.mae.gz»', ['5-15-1.mae', '5_15_1.maegz', '5 15 1.mae.gz'].every(n => P(n) && P(n).ch === 5 && P(n).fig === 15 && P(n).sub === 1));
ok('имя !4.3.1.mae → задача, условие', P('!4.3.1.mae').task && P('!4.3.1.mae').part === 'cond' && Place.slotId(P('!4.3.1.mae')) === '4t3');
ok('имя «!4-3-2 ответ.mae» → ответ', P('!4-3-2 ответ.mae').part === 'ans' && P('!2_14_1_ans.sdf').part === 'ans');
ok('имя без номера → не подходит', P('crown.mae') === null && P('5.mae') === null && P('5.11.2.txt') === null);
const bk = JSON.parse(fs.readFileSync(path.join(ROOT, 'structures/_book/book.json'), 'utf8'));
const before4m2 = JSON.stringify(bk.chapters[3].materials[1]);
const r = Place.place(bk, [
  { name: '5-11-2.mae', cts: [{ title: 'A' }] },
  { name: '5.11.1.mae', cts: [{ title: 'B1' }, { title: 'B2' }] },
  { name: '!5.3.1.mae', cts: [{ title: 'C' }] },
  { name: '!5.3.1 ответ.sdf' },
  { name: '5.40.1.sdf' },
  { name: '4.1.1.sdf' },
  { name: 'чепуха.mae' }
]);
const ch5 = bk.chapters[4];
const f511 = ch5.materials.find(s => s.id === '5m11');
ok('раскладка: Рис. 5.11 — части по порядку, несколько CT → варианты', JSON.stringify(f511.items.map(i => i.t)) === JSON.stringify(['Часть 1.1', 'Часть 1.2', 'Часть 2']) && f511.items[0].s.endsWith('5.11.1.mae#ct=1') && f511.items[2].s === 'pdb:structures/_book/files/ch5/5m11/5-11-2.mae', JSON.stringify(f511.items));
ok('раскладка: задача 5.3 — условие и ответ', ch5.tasks.find(s => s.id === '5t3').cond.items.length === 1 && ch5.tasks.find(s => s.id === '5t3').ans.items.length === 1);
ok('раскладка: нового рисунка 5.40 нет в списке → создан в конце', ch5.materials[ch5.materials.length - 1].id === '5m40' && r.report[4].created && ch5.materials.length === 40);
ok('раскладка: готовый набор (демо 4.1) не тронут', !r.report[5].ok && !bk.chapters[3].materials[0].items.length);
ok('раскладка: неправильное имя → отчёт', !r.report[6].ok);
ok('раскладка: чужие рисунки не изменились', JSON.stringify(bk.chapters[3].materials[1]) === before4m2);
const r2 = Place.place(bk, [{ name: '5-11-2.mae', cts: [{ title: 'A2' }] }]);
ok('раскладка: тот же файл заменяет себя', f511.items.length === 3 && r2.report[0].replaced === 1 && f511.items[2].desc === 'A2');

// ---------- 3. браузер ----------
const BOOKJSON = (() => {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'structures/_book/book.json'), 'utf8'));
  const s = b.chapters[4].materials.find(x => x.id === '5m11');
  if (!s.items.length) s.items = [
    { t: 'Часть 1.1', s: 'pdb:structures/_test/mae/test-scene.mae#ct=1', desc: 'K⁺' },
    { t: 'Часть 1.2', s: 'pdb:structures/_test/mae/test-scene.maegz#ct=2' }
  ];
  return JSON.stringify(b);
})();
async function newPage(ctx, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  return p;
}
const ready = p => p.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model && document.getElementById('overlay').classList.contains('hide'), null, { timeout: 20000 }).then(() => p.waitForTimeout(600));
// пунктир: точки вдоль связи K–O на экране — часть закрашена, часть фон
const dashProbe = p => p.evaluate(() => {
  const mv = pdbViewer.mv, v = mv.viewer;
  const cv = mv.el.querySelector('canvas'); const ctx2 = document.createElement('canvas');
  ctx2.width = cv.width; ctx2.height = cv.height; const g = ctx2.getContext('2d'); v.render(); g.drawImage(cv, 0, 0);
  const dpr = cv.width / cv.clientWidth;
  const bg = (mv.o.bg || 'ffffff').replace('#', '');
  const B = [0, 2, 4].map(i => parseInt(bg.slice(i, i + 2), 16));
  const res = [];
  for (const [i, j] of mv.scene.zob) {
    const a = mv.model.atoms[i], b = mv.model.atoms[j];
    let on = 0, off = 0;
    for (let k = 0; k <= 60; k++) {
      const t = 0.3 + 0.4 * k / 60; // середина связи, вдали от шаров
      const s = v.modelToScreen({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      const px = g.getImageData(Math.round(s.x * dpr), Math.round(s.y * dpr), 1, 1).data;
      const d = Math.abs(px[0] - B[0]) + Math.abs(px[1] - B[1]) + Math.abs(px[2] - B[2]);
      if (d > 60) on++; else off++;
    }
    res.push([on, off]);
  }
  return res;
});
const styleOf = (p, i) => p.evaluate(i => { const a = pdbViewer.mv.model.atoms[i]; const st = a.style; const out = {}; for (const k of Object.keys(st)) { const s = st[k]; out[k] = { scale: s.scale, radius: s.radius, color: s.colorfunc ? String(s.colorfunc(a)) : (s.colorscheme || s.color) }; } return out; }, i);

const DEVS = { iphone: ['webkit', devices['iPhone 13']], pixel: ['chromium', devices['Pixel 7']], desk: ['chromium', { viewport: { width: 1280, height: 800 } }] };
for (const dn of DEV) {
  const [bt, dev] = DEVS[dn];
  const browser = await (bt === 'webkit' ? webkit : chromium).launch();
  const ctx = await browser.newContext(Object.assign({}, dev, { serviceWorkers: 'block' }));
  if (!LIVE) await ctx.route('**/structures/_book/book.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body: BOOKJSON }));
  const errs = [];
  const p = await newPage(ctx, errs);
  const SAMPLE = LIVE ? 'structures/_test/mae/test-scene.mae' : 'structures/_test/mae/test-scene.mae';
  // просмотрщик: один файл, 1-я структура
  await p.goto(BASE + 'index.html?pdb=' + SAMPLE + '%23ct=1');
  await ready(p);
  const st = await p.evaluate(() => ({ atoms: pdbViewer.mv.stats.atoms, zob: pdbViewer.mv.stats.zob, shapes: pdbViewer.mv._zobShapes.length, fmt: pdbViewer.loaded.fmt, title: document.getElementById('title').textContent }));
  ok(`[${dn}] просмотрщик: .mae#ct=1 — 43 атома, 6 связей нулевого порядка (12 полупунктиров)`, st.atoms === 43 && st.zob === 6 && st.shapes === 12 && st.fmt === 'mae', JSON.stringify(st));
  const probe = await dashProbe(p);
  ok(`[${dn}] пунктир виден и прерывистый`, probe.filter(([on, off]) => on >= 8 && off >= 5).length >= 4, JSON.stringify(probe));
  const HID = await p.evaluate(() => pdbViewer.mv.model.atoms.findIndex(a => a.maeVis === false));
  const sK = await styleOf(p, 42), sC = await styleOf(p, 8), sH = await styleOf(p, HID);
  ok(`[${dn}] сцена: шарики-палочки, цвета Maestro, скрытые H`, sC.sphere && sC.sphere.scale === 0.27 && sC.stick && /33CC33/i.test(sC.stick.color) && /8F40D4/i.test(sK.sphere.color) && !Object.keys(sH).length, JSON.stringify([sC, sK, sH]));
  const lbl = await p.evaluate(() => pdbViewer.mv.viewer.labels ? pdbViewer.mv.viewer.labels.length : -1);
  ok(`[${dn}] подпись Maestro (K⁺)`, lbl === 1 || lbl === -1, String(lbl));
  if (SHOTS && dn !== 'pixel') await p.screenshot({ path: path.join(SHOTS, 'mae-scene-' + (dn === 'iphone' ? 'iphone' : 'desk') + '.png') });
  // переключатели
  await p.click('#bStyle').catch(() => p.evaluate(() => document.getElementById('sheetStyle').classList.add('open')));
  await p.waitForTimeout(400);
  const vis = await p.evaluate(() => !document.getElementById('maeBox').classList.contains('hidden') && [...document.querySelectorAll('#chMaeStyle .chip, #chMaeCol .chip')].map(b => b.textContent + (b.classList.contains('sel') ? '*' : '')).join('|'));
  ok(`[${dn}] меню «Вид»: «Стиль/Цвета из Maestro» выбраны`, vis === 'Стиль из Maestro*|Стандартный стиль|Цвета из Maestro*|Стандартные цвета', String(vis));
  if (SHOTS && dn === 'desk') await p.screenshot({ path: path.join(SHOTS, 'mae-style-menu-desk.png') });
  await p.evaluate(() => [...document.querySelectorAll('#chMaeCol .chip')][1].click());
  await p.waitForTimeout(300);
  const c2 = await styleOf(p, 8);
  ok(`[${dn}] «Стандартные цвета» → Jmol, стиль Maestro остаётся`, c2.stick && /jmol/i.test(String(c2.stick.color)) && c2.sphere.scale === 0.27, JSON.stringify(c2));
  await p.evaluate(() => [...document.querySelectorAll('#chMaeStyle .chip')][1].click());
  await p.waitForTimeout(300);
  const h2 = await styleOf(p, HID);
  ok(`[${dn}] «Стандартный стиль» → скрытые в Maestro H видны, пунктир остаётся`, !!h2.stick && (await p.evaluate(() => pdbViewer.mv._zobShapes.length)) === 12, JSON.stringify(h2));
  await p.evaluate(() => { [...document.querySelectorAll('#chMaeStyle .chip')][0].click(); [...document.querySelectorAll('#chMaeCol .chip')][0].click(); });
  await p.waitForTimeout(300);
  ok(`[${dn}] обратно «из Maestro»`, /33CC33/i.test((await styleOf(p, 8)).stick.color) && !Object.keys(await styleOf(p, HID)).length);
  // .maegz, 2-я структура: трубки + CPK
  await p.goto(BASE + 'index.html?pdb=structures/_test/mae/test-scene.maegz%23ct=2');
  await ready(p);
  const o0 = await styleOf(p, 0), o1 = await styleOf(p, 1);
  ok(`[${dn}] .maegz#ct=2: CPK у первого O, трубки у остальных`, o0.sphere && o0.sphere.scale === 1 && o1.stick && o1.stick.radius === 0.18 && !o1.sphere, JSON.stringify([o0, o1]));
  // без #ct — все структуры вместе
  await p.goto(BASE + 'index.html?pdb=structures/_test/mae/test-scene.mae');
  await ready(p);
  ok(`[${dn}] .mae без #ct — обе структуры в сцене`, (await p.evaluate(() => pdbViewer.mv.stats.atoms)) === 85);
  // рисунок учебника (локально — с подменённым book.json)
  if (!LIVE) {
    await p.goto(BASE + 'index.html?fig=5m11');
    await ready(p);
    const a = await p.evaluate(() => ({ n: pdbViewer.set.items.length, item: pdbViewer.setItem.title, atoms: pdbViewer.mv.stats.atoms, zob: pdbViewer.mv.stats.zob }));
    await p.evaluate(() => pdbViewer.pick('i', '1')); await p.waitForTimeout(900);
    const b = await p.evaluate(() => ({ item: pdbViewer.setItem.title, atoms: pdbViewer.mv.stats.atoms, zob: pdbViewer.mv.stats.zob }));
    ok(`[${dn}] рисунок 5m11: варианты #ct=1 / #ct=2 переключаются`, a.n === 2 && a.atoms === 43 && a.zob === 6 && b.atoms === 42 && b.zob === 0 && b.item === 'Часть 1.2', JSON.stringify([a, b]));
  }
  // страница учителя: свой файл .maegz
  if (dn === 'desk') {
    await p.goto(BASE + 'teacher.html');
    await p.waitForFunction(() => window.teacher, null, { timeout: 15000 });
    await p.setInputFiles('#fileIn', path.join(ROOT, 'structures/_test/mae/test-scene.maegz'));
    await p.waitForFunction(() => teacher.mv && teacher.mv.model && teacher.mv.scene, null, { timeout: 15000 }).catch(() => {});
    const tv = await p.evaluate(() => teacher.mv && teacher.mv.scene ? { atoms: teacher.mv.stats.atoms, zob: teacher.mv.stats.zob } : null);
    ok(`[${dn}] учитель: свой файл .maegz со сценой`, tv && tv.atoms === 85 && tv.zob === 6, JSON.stringify(tv));
  }
  // редактор: массовая загрузка (GitHub API поддельный, ничего не пишется)
  if (dn !== 'pixel') {
    const rec = { calls: [], blobs: [] };
    await ctx.route('https://api.github.com/**', async route => {
      const req = route.request(); const u = new URL(req.url()); const m = req.method(); const pth = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
      rec.calls.push(m + ' ' + pth);
      const json = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (m === 'GET' && pth.startsWith('/contents/')) return route.fulfill({ status: 200, contentType: 'text/plain', body: BOOKJSON });
      if (m === 'GET' && pth === '/git/ref/heads/main') return json({ object: { sha: 'head0' } });
      if (m === 'GET' && pth === '/git/commits/head0') return json({ tree: { sha: 'tree0' } });
      if (m === 'POST' && pth === '/git/blobs') { rec.blobs.push(1); return json({ sha: 'blob' + rec.blobs.length }, 201); }
      if (m === 'POST' && pth === '/git/trees') { rec.tree = JSON.parse(req.postData()); return json({ sha: 'tree1' }, 201); }
      if (m === 'POST' && pth === '/git/commits') return json({ sha: 'c0ffee1234567' }, 201);
      if (m === 'PATCH') return json({});
      return json({ full_name: 'x/y', permissions: { push: true } });
    });
    await p.goto(BASE + 'redaktor-uchebnika-q7m4.html');
    await p.waitForFunction(() => window.bookAdmin && bookAdmin.book, null, { timeout: 15000 });
    await p.evaluate(() => { sessionStorage.setItem('book-admin-gh-token', 'test-token'); localStorage.removeItem('book-admin-draft'); });
    const tmp = fs.mkdtempSync('/tmp/mae-');
    const files = { '5-15-1.mae': 'structures/_test/mae/test-scene.mae', '!5.2.1.maegz': 'structures/_test/mae/test-scene.maegz', '!5_2_2 ответ.mae': 'structures/_test/mae/test-scene.mae', 'кофеин.sdf': 'structures/_supra/crown/complexes/6.sdf' };
    for (const [n, src] of Object.entries(files)) fs.copyFileSync(path.join(ROOT, src), path.join(tmp, n));
    await p.setInputFiles('#fBulk', Object.keys(files).map(n => path.join(tmp, n)));
    await p.waitForFunction(() => document.querySelectorAll('#bulkReport li').length === 4, null, { timeout: 10000 }).catch(() => {});
    const rep = await p.evaluate(() => ({
      li: [...document.querySelectorAll('#bulkReport li')].map(l => l.dataset.ok + ':' + l.textContent.slice(0, 80)),
      f515: bookAdmin.book.chapters[4].materials.find(s => s.id === '5m15').items.map(i => i.t + '=' + i.s),
      t52: (s => [s.cond.items.length, s.ans.items.length])(bookAdmin.book.chapters[4].tasks.find(s => s.id === '5t2')),
      pend: [...bookAdmin.pending.keys()]
    }));
    ok(`[${dn}] редактор: 3 из 4 файлов разложены по именам`, rep.li.filter(x => x[0] === '1').length === 3 && rep.li.filter(x => x[0] === '0').length === 1, JSON.stringify(rep.li));
    ok(`[${dn}] редактор: 5-15-1.mae → Рис. 5.15, 2 варианта (#ct)`, rep.f515.length === 2 && rep.f515[0].startsWith('Часть 1.1=pdb:structures/_book/files/ch5/5m15/5-15-1.mae#ct=1'), JSON.stringify(rep.f515));
    ok(`[${dn}] редактор: задача 5.2 — условие 2 варианта, ответ 2`, JSON.stringify(rep.t52) === '[2,2]', JSON.stringify(rep.t52));
    if (SHOTS && dn === 'desk') { await p.evaluate(() => document.getElementById('bulkBox').scrollIntoView()); await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, 'admin-bulk-upload-desk.png') }); }
    await p.evaluate(() => bookAdmin.save());
    await p.waitForTimeout(800);
    const paths = (rec.tree && rec.tree.tree || []).map(x => x.path);
    ok(`[${dn}] редактор: коммит — 3 файла + book.json, без «#ct» в путях`, paths.length === 4 && paths.every(x => !x.includes('#')) && paths.includes('structures/_book/files/ch5/5m15/5-15-1.mae'), JSON.stringify(paths));
  }
  ok(`[${dn}] без ошибок в консоли`, !errs.length, errs.slice(0, 4).join(' | '));
  await browser.close();
}
console.log(fails.length ? `\nОШИБОК: ${fails.length}` : '\nВсе проверки пройдены');
process.exit(fails.length ? 1 : 0);
