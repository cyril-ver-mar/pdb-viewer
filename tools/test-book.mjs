/* Учебник: страницы учеников (book.html), рисунки (?fig=…), задачи «Условие/Ответ» и редактор
   на iPhone 13 (WebKit), Pixel 7 и 1280×800. GitHub API в тесте поддельный: в репозиторий ничего не пишется.
   Запуск: BASE=http://127.0.0.1:18431/ SHOTS=/workspace/shots node tools/test-book.mjs */
import fs from 'fs';
import { chromium, webkit, devices } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const SHOTS = process.env.SHOTS || '';
const DEV = (process.env.DEV || 'iphone,pixel,desk').split(',');
const ADMIN = 'redaktor-uchebnika-q7m4.html';
const COUNTS = { 1: [16, 6], 2: [9, 14], 3: [20, 8], 4: [55, 16], 5: [39, 8] };
const fails = [];
const ok = (name, cond, info) => { console.log((cond ? '✓ ' : '✗ ') + name + (info ? '  ' + info : '')); if (!cond) fails.push(name + ' ' + (info || '')); };
import { execSync } from 'child_process';
// версии до учебника (коммит e1c1df4): так выглядели core.js и set.js в кэше телефона
const ROOT = new URL('..', import.meta.url).pathname;
const OLD = { core: execSync('git show e1c1df4:assets/core.js', { cwd: ROOT }).toString(), set: execSync('git show e1c1df4:assets/set.js', { cwd: ROOT }).toString() };
const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

// 0. данные
const book = JSON.parse(fs.readFileSync(new URL('../structures/_book/book.json', import.meta.url)));
for (const [n, [m, t]] of Object.entries(COUNTS)) {
  const ch = book.chapters.find(c => c.n === +n);
  ok(`book.json: глава ${n} — ${m} рисунков / ${t} задач`, ch && ch.materials.length === m && ch.tasks.length === t, ch ? ch.materials.length + '/' + ch.tasks.length : 'нет главы');
}
const ids = book.chapters.flatMap(c => [...c.materials, ...c.tasks].map(s => s.id));
ok('book.json: id рисунков уникальны', new Set(ids).size === ids.length);

async function newPage(ctx, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  return p;
}
async function ready(p) { await p.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model && pdbViewer.setItem && document.getElementById('overlay').classList.contains('hide'), null, { timeout: 20000 }); await p.waitForTimeout(500); }
const vstate = (p) => p.evaluate(() => ({
  view: pdbViewer.mv.viewer.getView(), atoms: pdbViewer.mv.stats.atoms, item: pdbViewer.setItem.title, title: document.getElementById('title').textContent,
  part: document.body.dataset.part || '', home: !!document.getElementById('bHome'), homeHref: document.getElementById('bHome') && document.getElementById('bHome').getAttribute('href'),
  secs: !!document.getElementById('bSecs'), lcat: !!document.getElementById('lCatalog'), menu: document.getElementById('sheetSet').classList.contains('open'),
  bset: !document.getElementById('bSet').classList.contains('hidden'),
  catLinks: [...document.querySelectorAll('a')].filter(a => a.getClientRects().length && !a.closest('.hidden') && /^(\.\/|index\.html)?$|^\.\/?\?folder|teacher\.html|qr\.html/.test(a.getAttribute('href') || '')).length
}));
async function pick(p, k, v) { await p.evaluate(([k, v]) => pdbViewer.pick(k, v), [k, v]); await p.waitForTimeout(700); }

// поддельный GitHub API
function mockGitHub(ctx, rec) {
  const BOOK = fs.readFileSync(new URL('../structures/_book/book.json', import.meta.url), 'utf8');
  return ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const path = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    rec.calls.push(m + ' ' + path);
    rec.auth = req.headers()['authorization'] || '';
    const json = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (m === 'GET' && path === '') return json({ full_name: 'cyril-ver-mar/pdb-viewer', permissions: { push: true } });
    if (m === 'GET' && path.startsWith('/contents/')) return route.fulfill({ status: 200, contentType: 'text/plain', body: rec.remote || BOOK });
    if (m === 'GET' && path === '/git/ref/heads/main') return json({ object: { sha: 'head0' } });
    if (m === 'GET' && path === '/git/commits/head0') return json({ tree: { sha: 'tree0' } });
    if (m === 'POST' && path === '/git/blobs') { rec.blobs.push(JSON.parse(req.postData())); return json({ sha: 'blob' + rec.blobs.length }, 201); }
    if (m === 'POST' && path === '/git/trees') { rec.tree = JSON.parse(req.postData()); return json({ sha: 'tree1' }, 201); }
    if (m === 'POST' && path === '/git/commits') { rec.commit = JSON.parse(req.postData()); return json({ sha: 'c0ffee1234567' }, 201); }
    if (m === 'PATCH' && path === '/git/refs/heads/main') { rec.ref = JSON.parse(req.postData()); return json({ object: { sha: 'c0ffee1234567' } }); }
    return json({ message: 'unexpected ' + m + ' ' + path }, 500);
  });
}

async function run(kind, device, label) {
  const browser = kind === 'webkit' ? await webkit.launch() : await chromium.launch({
    executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext(device);
  const errs = [];
  const shot = async (p, name) => { if (SHOTS && name) await p.screenshot({ path: `${SHOTS}/${name}`, fullPage: false }); };

  // 1. весь учебник
  let p = await newPage(ctx, errs);
  await p.goto(BASE + 'book.html', { waitUntil: 'load' });
  await p.waitForSelector('#chapters .card');
  const chs = await p.$$eval('#chapters .card', els => els.map(a => a.getAttribute('href')));
  ok(`${label} book.html: 5 глав`, chs.length === 5 && chs.every(h => /^book\.html\?ch=\d&all=1$/.test(h)), chs.join(' '));
  const allHrefs = await p.$$eval('a', els => els.map(a => a.getAttribute('href')));
  ok(`${label} book.html: нет ссылок в каталог`, allHrefs.every(h => /^book\.html/.test(h)), allHrefs.join(' '));
  if (label === 'iphone') await shot(p, 'book-whole-iphone.png');
  await p.click('#chapters .card[data-ch="4"]');
  await p.waitForSelector('#figs .card');
  ok(`${label} глава из учебника: кнопка «← Все главы»`, await p.locator('#bBack').count() === 1);

  // 2. глава 4 по прямой ссылке
  await p.goto(BASE + 'book.html?ch=4', { waitUntil: 'load' });
  await p.waitForSelector('#figs .card');
  const ch4 = book.chapters.find(c => c.n === 4);
  const visM = ch4.materials.filter(s => (s.items || []).length || s.set).map(s => s.id);
  const figsM = await p.$$eval('#figs .card', els => els.map(a => a.dataset.id));
  ok(`${label} глава 4: показаны только заполненные рисунки (${visM.length} из ${ch4.materials.length})`, figsM.join() === visM.join(), figsM.join());
  ok(`${label} глава 4 по прямой ссылке: нет «← Все главы» и ссылок в каталог`, await p.locator('#bBack').count() === 0 && (await p.$$eval('a', els => els.map(a => a.getAttribute('href')))).every(h => /^(book|index)\.html\?/.test(h) && !/folder=/.test(h)));
  const tabN = await p.$$eval('[role=tab] .n', els => els.map(e => e.textContent));
  ok(`${label} глава 4: вкладки «Материалы главы» и «Задачи и тесты»`, (await p.$$eval('[role=tab]', els => els.map(e => e.textContent))).join('|').includes('Задачи и тесты'), tabN.join('/'));
  if (label === 'iphone') await shot(p, 'book-student-iphone.png');
  await p.click('[role=tab][data-tab="t"]');
  await p.waitForTimeout(200);
  const figsT = await p.$$eval('#figs .card', els => els.map(a => a.dataset.id));
  ok(`${label} глава 4, задачи: только заполненные`, figsT.join() === '4t1', figsT.join());
  const tHref = await p.$eval('#figs .card', a => a.getAttribute('href'));
  ok(`${label} ссылка задачи ведёт назад только в главу`, /bk=ch%3D4%26tab%3Dt$/.test(tHref), tHref);
  if (label === 'iphone') await shot(p, 'book-student-tasks-iphone.png');
  // пустая глава
  await p.goto(BASE + 'book.html?ch=1', { waitUntil: 'load' });
  await p.waitForSelector('#figs');
  ok(`${label} глава 1: пустые рисунки скрыты`, await p.locator('#figs .card').count() === 0 && await p.locator('#figs .empty').count() === 1);
  await p.close();

  // 3. рисунок со списком структур по прямой ссылке
  p = await newPage(ctx, errs);
  await p.goto(BASE + 'index.html?fig=4m2', { waitUntil: 'load' });
  await ready(p);
  let s0 = await vstate(p);
  ok(`${label} рисунок 4.2: открыт, меню выбора открыто`, s0.title === 'Рис. 4.2' && s0.menu && s0.item === '18-краун-6', s0.title + ' / ' + s0.item);
  ok(`${label} прямая ссылка на рисунок: нет «← Каталог», «Разделы» и «Все структуры»`, !s0.home && !s0.secs && !s0.lcat && s0.catLinks === 0, JSON.stringify({ h: s0.home, s: s0.secs, l: s0.lcat, c: s0.catLinks }));
  if (label === 'iphone') await shot(p, 'book-fig-multi-iphone.png');
  let allSame = true, changed = 0, prev = s0;
  for (const v of ['2', '3', '1', '0']) {
    await pick(p, 'i', v);
    const s = await vstate(p);
    if (!same(s.view, s0.view)) allSame = false;
    if (s.item !== prev.item) changed++;
    prev = s;
  }
  ok(`${label} рисунок 4.2: 4 переключения, структура меняется, камера на месте (наложение)`, changed === 4 && allSame, changed + '/4');
  await p.close();

  // 4. рисунок с готовым набором (краун-эфиры)
  p = await newPage(ctx, errs);
  await p.goto(BASE + 'index.html?fig=4m1', { waitUntil: 'load' });
  await ready(p);
  s0 = await vstate(p);
  const keys = await p.$$eval('#setMenu [data-key], #setMenu input[data-key]', els => els.map(e => e.dataset.key));
  ok(`${label} рисунок 4.1: набор краун-эфиров с параметрами`, keys.includes('size') && keys.includes('metal') && /K⁺/.test(s0.item), keys.join(',') + ' · ' + s0.item);
  await pick(p, 'metal', 'Cs');
  const s1 = await vstate(p);
  ok(`${label} рисунок 4.1: переключение иона`, /Cs⁺/.test(s1.item) && same(s1.view, s0.view), s1.item);
  await p.close();

  // 5. задача: условие / ответ
  p = await newPage(ctx, errs);
  await p.goto(BASE + 'index.html?fig=4t1&bk=' + encodeURIComponent('ch=4&tab=t'), { waitUntil: 'load' });
  await ready(p);
  s0 = await vstate(p);
  ok(`${label} задача 4.1: сначала условие`, s0.part === 'condition' && s0.item === '18-краун-6', s0.part + ' / ' + s0.item);
  ok(`${label} задача 4.1: кнопки «Условие» и «Ответ» видны`, await p.locator('#taskBar:not(.hidden) #bAns:not(.hidden)').count() === 1);
  ok(`${label} задача 4.1: текст условия в меню`, /18-краун-6/.test(await p.textContent('#taskText')));
  ok(`${label} задача из главы: «←» ведёт только в главу`, s0.home && s0.homeHref === 'book.html?ch=4&tab=t' && !s0.secs, s0.homeHref);
  if (label === 'iphone') await shot(p, 'book-task-cond-iphone.png');
  await p.click('#bAns'); await p.waitForTimeout(900);
  const s2 = await vstate(p);
  ok(`${label} задача 4.1: «Ответ» показывает комплекс с K⁺`, s2.part === 'answer' && /K⁺/.test(s2.item) && s2.atoms === s0.atoms + 1, s2.item + ' ' + s0.atoms + '→' + s2.atoms);
  if (label === 'iphone') await shot(p, 'book-task-answer-iphone.png');
  await p.click('#bCond'); await p.waitForTimeout(900);
  ok(`${label} задача 4.1: обратно к условию`, (await vstate(p)).part === 'condition');
  await p.goto(BASE + 'index.html?fig=4t1&pick=part:a', { waitUntil: 'load' });
  await ready(p);
  const s3 = await vstate(p);
  ok(`${label} задача: ответ не открывается из ссылки (pick=part:a)`, s3.part === 'condition' && !s3.home, s3.part);
  // подделанный bk
  await p.goto(BASE + 'index.html?fig=4m2&bk=' + encodeURIComponent('https://evil.example/'), { waitUntil: 'load' });
  await ready(p);
  ok(`${label} чужой bk не превращается в ссылку`, !(await vstate(p)).home);
  // обычная прямая ссылка на запись каталога тоже без выхода
  await p.goto(BASE + '?e=' + encodeURIComponent('Супрамолекулярная химия/Краун-эфиры/complexes'), { waitUntil: 'load' });
  await ready(p);
  const s4 = await vstate(p);
  ok(`${label} прямая ссылка на набор (?e=): нет «← Каталог» и «Разделы»`, !s4.home && !s4.secs && !s4.lcat);
  // пустой рисунок
  await p.goto(BASE + 'index.html?fig=1m1', { waitUntil: 'load' });
  await p.waitForSelector('#errText', { timeout: 15000 });
  ok(`${label} пустой рисунок по ссылке: сообщение, без кнопки в каталог`, /не готов/.test(await p.textContent('#errText')) && await p.locator('#overlay a.btn').count() === 0);
  await p.close();

  // 6. каталог: «Супрамолекулярная химия» → «Учебник „…“» → главы → разделы → рисунки (nav=1)
  p = await newPage(ctx, errs);
  const cards = () => p.$$eval('#cards .card', els => els.map(a => a.querySelector('b').textContent.replace(/^📁 /, '')));
  const openFolder = async (title) => { await p.locator('#cards button.card', { hasText: title }).first().click(); await p.waitForTimeout(300); };
  await p.goto(BASE + '?folder=' + encodeURIComponent('Супрамолекулярная химия'), { waitUntil: 'load' });
  await p.waitForSelector('#cards .card');
  const top = await cards();
  ok(`${label} каталог: в «Супрамолекулярной химии» две папки — учебник и краун-эфиры`, top.length === 2 && top[0] === 'Учебник „Супрамолекулярная химия“' && top[1] === 'Краун-эфиры', top.join(' | '));
  await openFolder('Учебник');
  const chapN = await cards();
  ok(`${label} каталог: в учебнике 5 глав-папок, без «Все главы»`, chapN.length === 5 && chapN.every((t, i) => t.startsWith('Глава ' + (i + 1) + '.')), chapN.join(' | '));
  await openFolder('Глава 4.');
  const secs = await cards();
  ok(`${label} каталог: в главе 4 «Материалы главы» и «Задачи и тесты»`, secs.join('|') === 'Материалы главы|Задачи и тесты', secs.join('|'));
  await openFolder('Материалы главы');
  const figCards = await p.$$eval('#cards a.card', els => els.map(a => a.getAttribute('href')));
  ok(`${label} каталог: в материалах главы 4 только готовые рисунки 4m1, 4m2`, figCards.length === 2 && /4m1&nav=1$/.test(figCards[0]) && /4m2&nav=1$/.test(figCards[1]), figCards.join(' '));
  const crumbs = await p.$$eval('#crumbs button', els => els.map(b => b.textContent));
  ok(`${label} каталог: путь назад по папкам`, crumbs.length === 5, crumbs.join(' / '));
  if (label === 'iphone') await shot(p, 'catalog-book-iphone.png');
  await p.click('#cards a.card >> nth=0');
  await ready(p);
  const fromCat = await vstate(p);
  ok(`${label} Рис. 4.1 из каталога открывается (не каталог), «← Каталог» есть`, fromCat.title === 'Рис. 4.1' && /K⁺/.test(fromCat.item) && fromCat.home && !(await p.evaluate(() => document.documentElement.classList.contains('catmode'))), fromCat.title + ' · ' + fromCat.item);
  await p.goto(BASE + '?folder=' + encodeURIComponent('Супрамолекулярная химия/Краун-эфиры'), { waitUntil: 'load' });
  await p.waitForSelector('#cards a.card');
  await p.click('#cards a.card');
  await ready(p);
  ok(`${label} запись, открытая из каталога: «← Каталог» остаётся`, (await vstate(p)).home);
  await p.close();

  // 6b. каждый готовый рисунок: ?fig= и ?e= (каталог), без выхода в каталог
  p = await newPage(ctx, errs);
  for (const ch of book.chapters) for (const [key, sec] of [['materials', 'Материалы главы'], ['tasks', 'Задачи и тесты']]) for (const s of ch[key]) {
    const filled = s.cond || s.ans ? [s.cond, s.ans].some(x => x && (x.set || (x.items || []).length)) : !!(s.set || (s.items || []).length);
    if (!filled || s.hidden) continue;
    for (const url of ['index.html?fig=' + s.id, '?e=' + encodeURIComponent(`Супрамолекулярная химия/Учебник/Глава ${ch.n}/${sec}/${s.id}`)]) {
      await p.goto(BASE + url, { waitUntil: 'load' });
      await ready(p);
      const st = await vstate(p);
      ok(`${label} ${s.id} по ${url.startsWith('?e=') ? '?e=' : '?fig='}: открыт «${s.title}», нет выхода в каталог`, st.title === s.title && !st.home && !st.secs && !(await p.evaluate(() => document.documentElement.classList.contains('catmode'))), st.title);
    }
  }
  await p.close();

  // 6c. регрессия «Рис. 4.1 выкидывает на главную»: новый index.html со СТАРЫМИ core.js и set.js из кэша
  {
    const sctx = await browser.newContext(device);
    await sctx.route(/\/assets\/(core|set)\.js(\?.*)?$/, (route) => {
      const name = /core\.js/.test(route.request().url()) ? 'core' : 'set';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: OLD[name] });
    });
    const sp = await newPage(sctx, errs);
    for (const [id, title] of [['4m1', 'Рис. 4.1'], ['4m2', 'Рис. 4.2'], ['4t1', 'Задача 4.1']]) {
      await sp.goto(BASE + 'index.html?fig=' + id, { waitUntil: 'load' });
      let st = { title: 'не открылся' };
      try { await ready(sp); st = await vstate(sp); } catch (e) { /* ниже ✗ */ }
      ok(`${label} старые core.js/set.js из кэша: ?fig=${id} открывает рисунок, а не каталог`, !(await sp.evaluate(() => document.documentElement.classList.contains('catmode'))) && st.title === title, st.title);
    }
    await sp.close(); await sctx.close();
  }
  // ссылка, которую версия не поняла, — сообщение, а не каталог
  p = await newPage(ctx, errs);
  await p.goto(BASE + 'index.html?e=' + encodeURIComponent('Нет/такой'), { waitUntil: 'load' });
  await p.waitForSelector('#errText', { timeout: 15000 });
  ok(`${label} неизвестная запись: сообщение, не каталог`, !(await p.evaluate(() => document.documentElement.classList.contains('catmode'))));
  await p.close();

  // 6d. страница учителя: учебник в каталоге, ссылка ?fig= и QR
  if (label === 'desk') {
    p = await newPage(ctx, errs);
    await p.goto(BASE + 'teacher.html', { waitUntil: 'load' });
    await p.waitForSelector('#catList .item');
    const tf = async (t) => { await p.locator('#catList button.folder', { hasText: t }).first().click(); await p.waitForTimeout(250); };
    await tf('Супрамолекулярная химия'); await tf('Учебник'); await tf('Глава 4.'); await tf('Материалы главы');
    const tItems = await p.$$eval('#catList .entry b', els => els.map(e => e.textContent));
    ok(`${label} учитель: в каталоге учебник → глава 4 → готовые рисунки`, tItems.join('|') === 'Рис. 4.1|Рис. 4.2', tItems.join('|'));
    await p.click('#catList .entry >> nth=0');
    await p.waitForFunction(() => /fig=4m1$/.test(document.getElementById('link').value), null, { timeout: 20000 });
    const tl = await p.inputValue('#link');
    const tq = await p.evaluate(() => document.getElementById('qr').dataset.ok);
    ok(`${label} учитель: ссылка и QR рисунка учебника — index.html?fig=4m1`, /\/index\.html\?fig=4m1$/.test(tl) && tq === '1', tl);
    await shot(p, 'teacher-book-desk.png');
    await p.close();
  }

  // 7. редактор
  if (label !== 'pixel') {
    const actx = await browser.newContext(device);
    const rec = { calls: [], blobs: [] };
    await mockGitHub(actx, rec);
    await actx.addInitScript(() => { try { sessionStorage.setItem('book-admin-gh-token', 'github_pat_TEST_ONLY'); } catch (e) { /* */ } });
    const a = await newPage(actx, errs);
    a.on('dialog', d => d.accept());
    await a.goto(BASE + ADMIN, { waitUntil: 'load' });
    await a.waitForSelector('#slots .slot');
    for (const [n, [m, t]] of Object.entries(COUNTS)) {
      await a.click(`#chTabs [data-ch="${n}"]`);
      await a.click('#secTabs [data-sec="m"]');
      const cm = await a.locator('#slots .slot').count();
      await a.click('#secTabs [data-sec="t"]');
      const ct = await a.locator('#slots .slot').count();
      ok(`${label} редактор: глава ${n} — ${cm}/${ct}, пустые видны`, cm === m && ct === t, cm + '/' + ct);
    }
    ok(`${label} редактор: книга взята через API, токен в заголовке, не в адресе`, rec.calls.some(c => c.startsWith('GET /contents/')) && rec.auth === 'Bearer github_pat_TEST_ONLY' && !a.url().includes('github_pat'));
    await a.click('#chTabs [data-ch="4"]'); await a.click('#secTabs [data-sec="m"]');
    const qrOk = await a.$$eval('#links canvas', cs => cs.map(c => c.dataset.ok || '').join(''));
    const stLink = await a.$$eval('#links input[data-link]', els => els.map(e => e.value));
    ok(`${label} редактор: ссылки для учеников и QR`, qrOk === '1' && stLink.some(v => v.endsWith('book.html?ch=4')) && stLink.some(v => v.endsWith('book.html')), stLink.join(' '));
    if (label === 'desk') {
      await a.click('.slot[data-id="4m2"] [data-act=edit]');
      await a.waitForTimeout(200);
      await a.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('.slot[data-id="4m2"]').scrollIntoView({ block: 'start' }); scrollBy(0, -70); });
      await a.waitForTimeout(200);
      await shot(a, 'book-admin-desk.png');
    }
    // переименовать 1.1, добавить рисунок с файлом
    await a.click('#chTabs [data-ch="1"]'); await a.click('#secTabs [data-sec="m"]');
    await a.fill('.slot[data-id="1m1"] input.title', 'Рис. 1.1. Хозяин и гость');
    await a.click('#bAdd');
    await a.waitForSelector('.slot[data-id="1m17"].open');
    ok(`${label} редактор: добавлен 17-й рисунок`, await a.locator('#slots .slot').count() === 17);
    await a.fill('.slot[data-id="1m17"] input.title', 'Рис. 1.17 (новый)');
    await a.setInputFiles('.slot[data-id="1m17"] input[type=file]', { name: 'гость 1.sdf', mimeType: 'chemical/x-mdl-sdfile', buffer: fs.readFileSync(new URL('../structures/_supra/crown/complexes/6-K.sdf', import.meta.url)) });
    await a.waitForSelector('.slot[data-id="1m17"] .item');
    // задача: условие + ответ
    await a.click('#secTabs [data-sec="t"]');
    await a.click('.slot[data-id="1t2"] [data-act=edit]');
    await a.fill('.slot[data-id="1t2"] textarea[data-f=text]', 'Найдите гостя');
    const refIns = a.locator('.slot[data-id="1t2"] .part input.grow:not([value])');
    await a.locator('.slot[data-id="1t2"] .part').nth(0).locator('input[placeholder^="или источник"]').fill('cid:2519');
    await a.locator('.slot[data-id="1t2"] .part').nth(0).locator('button', { hasText: '+ Источник' }).click();
    await a.locator('.slot[data-id="1t2"] .part').nth(1).locator('input[placeholder^="или источник"]').fill('id:1CRN');
    await a.locator('.slot[data-id="1t2"] .part').nth(1).locator('button', { hasText: '+ Источник' }).click();
    if (label === 'iphone') await shot(a, 'book-admin-iphone.png');
    const savedOk = await a.evaluate(() => bookAdmin.save());
    ok(`${label} редактор: сохранение одним коммитом (поддельный API)`, savedOk && rec.ref && rec.ref.sha === 'c0ffee1234567' && rec.ref.force === false, rec.calls.slice(-6).join(', '));
    const bookEntry = rec.tree && rec.tree.tree.find(t => t.path === 'structures/_book/book.json');
    const saved = bookEntry ? JSON.parse(bookEntry.content) : null;
    const c1 = saved && saved.chapters.find(c => c.n === 1);
    ok(`${label} редактор: в коммите новое название и новый рисунок`, c1 && c1.materials[0].title === 'Рис. 1.1. Хозяин и гость' && c1.materials.length === 17 && c1.materials[16].title === 'Рис. 1.17 (новый)' && c1.materials[16].items[0].s.startsWith('pdb:structures/_book/files/ch1/1m17/'));
    ok(`${label} редактор: файл структуры загружен блобом`, rec.blobs.length === 1 && rec.tree.tree.some(t => t.path.startsWith('structures/_book/files/ch1/1m17/') && t.sha === 'blob1'), rec.tree && rec.tree.tree.map(t => t.path).join(', '));
    ok(`${label} редактор: задача 1.2 — условие и ответ`, c1 && c1.tasks[1].text === 'Найдите гостя' && c1.tasks[1].cond.items[0].s === 'cid:2519' && c1.tasks[1].ans.items[0].s === 'id:1CRN');
    ok(`${label} редактор: после сохранения нет «несохранённых изменений»`, !(await a.evaluate(() => bookAdmin.dirty)) && /c0ffee1/.test(await a.textContent('#msg')));
    // токен только в sessionStorage
    const where = await a.evaluate(() => ({ s: !!sessionStorage.getItem('book-admin-gh-token'), l: !!localStorage.getItem('book-admin-gh-token') }));
    ok(`${label} редактор: токен в sessionStorage, не в localStorage`, where.s && !where.l);
    await a.close(); await actx.close();
  }
  ok(`${label}: нет ошибок в консоли`, !errs.length, errs.slice(0, 3).join(' | '));
  await browser.close();
}

const all = { iphone: ['webkit', devices['iPhone 13']], pixel: ['chromium', devices['Pixel 7']], desk: ['chromium', { viewport: { width: 1280, height: 800 } }] };
for (const d of DEV) await run(all[d][0], all[d][1], d);
console.log(fails.length ? `\nПровалено: ${fails.length}` : '\nВсё прошло');
process.exit(fails.length ? 1 : 0);
