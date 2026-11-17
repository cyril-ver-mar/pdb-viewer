/* Наборы структур (краун-эфиры и наборы учителя) на iPhone 13 (WebKit), Pixel 7 и 1280×800:
   нет ошибок в консоли; меню «Выбор структуры» открыто и не закрывает молекулу;
   при переключении структуры камера и масштаб не меняются (наборы с keep), структура меняется;
   набор учителя открывается одной ссылкой; каталог показывает «Супрамолекулярная химия / Краун-эфиры».
   Запуск: BASE=http://127.0.0.1:18431/ SHOTS=/workspace/shots node tools/test-sets.mjs */
import { chromium, webkit, devices } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const SHOTS = process.env.SHOTS || '';
const DEV = (process.env.DEV || 'iphone,pixel,desk').split(',');
const fails = [];
const ok = (name, cond, info) => { console.log((cond ? '✓ ' : '✗ ') + name + (info ? '  ' + info : '')); if (!cond) fails.push(name + ' ' + (info || '')); };
const FOLDER = 'Супрамолекулярная химия/Краун-эфиры';
const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

async function newPage(ctx, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  return p;
}
const state = (p) => p.evaluate(() => ({
  view: pdbViewer.mv.viewer.getView(), atoms: pdbViewer.mv.stats.atoms, item: pdbViewer.setItem.title,
  open: document.getElementById('sheetSet').classList.contains('open'),
  sheet: document.getElementById('sheetSet').getBoundingClientRect().toJSON(),
  viewer: document.getElementById('viewer').getBoundingClientRect().toJSON(), w: innerWidth, h: innerHeight
}));
async function pick(p, k, v) { await p.evaluate(([k, v]) => pdbViewer.pick(k, v), [k, v]); await p.waitForTimeout(700); }
async function ready(p) { await p.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model && pdbViewer.setItem && document.getElementById('overlay').classList.contains('hide'), null, { timeout: 20000 }); await p.waitForTimeout(500); }

async function run(kind, device, label) {
  const browser = kind === 'webkit' ? await webkit.launch() : await chromium.launch({
    executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext(device);
  const errs = [];
  const shot = async (p, name) => { if (SHOTS && name) await p.screenshot({ path: `${SHOTS}/${name}` }); };

  // 1. каталог
  let p = await newPage(ctx, errs);
  await p.goto(BASE + '?folder=' + encodeURIComponent('Супрамолекулярная химия'), { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const cat = await p.evaluate(() => [...document.querySelectorAll('#cards .card b')].map((b) => b.textContent));
  ok(`${label} каталог: папка «Краун-эфиры»`, cat.some((t) => t.includes('Краун-эфиры')), cat.join(' | '));
  await p.goto(BASE + '?folder=' + encodeURIComponent(FOLDER), { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const links = await p.evaluate(() => [...document.querySelectorAll('#cards a.card')].map((a) => a.getAttribute('href')));
  ok(`${label} каталог: две ссылки на наборы`, links.length === 2 && links.every((h) => h.startsWith('?e=')), links.join(' '));
  if (label === 'iphone') {
    await p.goto(BASE + '?folder=' + encodeURIComponent('Супрамолекулярная химия'), { waitUntil: 'load' });
    await p.waitForTimeout(1000);
    await p.evaluate(() => document.getElementById('secStructs').scrollIntoView());
    await p.waitForTimeout(300);
    await shot(p, 'catalog-supra-iphone.png');
  }
  await p.close();

  // 2. комплексы
  p = await newPage(ctx, errs);
  await p.goto(BASE + '?e=' + encodeURIComponent(FOLDER + '/complexes'), { waitUntil: 'load' });
  await ready(p);
  let s0 = await state(p);
  ok(`${label} комплексы: открыт 18-краун-6 · K⁺, меню открыто`, s0.item === '18-краун-6 · K⁺' && s0.open, s0.item);
  const phone = s0.w <= 820;
  ok(`${label} комплексы: меню не закрывает окно молекулы`, phone ? s0.viewer.bottom <= s0.sheet.top + 2 : s0.viewer.right <= s0.sheet.left + 2,
    JSON.stringify({ vb: Math.round(s0.viewer.bottom), st: Math.round(s0.sheet.top), vr: Math.round(s0.viewer.right), sl: Math.round(s0.sheet.left) }));
  ok(`${label} комплексы: центр вращения — центр цикла`, s0.view[0] === 0 && s0.view[1] === 0 && s0.view[2] === 0);
  if (label === 'iphone') await shot(p, 'crown-complex-iphone.png');
  const steps = [['metal', 'Cs'], ['ratio', '2'], ['size', '4'], ['metal', 'Li'], ['size', '7'], ['cx', '0'], ['size', '5'], ['cx', '1'], ['ratio', '1'], ['size', '6']];
  let prev = s0, allSame = true, changed = 0;
  for (const [k, v] of steps) {
    await pick(p, k, v);
    const s = await state(p);
    if (!same(s.view, s0.view)) allSame = false;
    if (s.atoms !== prev.atoms || s.item !== prev.item) changed++;
    if (label === 'iphone' && k === 'ratio' && v === '2') await shot(p, 'crown-sandwich-iphone.png');
    prev = s;
  }
  ok(`${label} комплексы: ${steps.length} переключений, камера не сдвинулась`, allSame);
  ok(`${label} комплексы: структура каждый раз менялась`, changed === steps.length, changed + '/' + steps.length);
  const fin = await state(p);
  ok(`${label} комплексы: после цепочки снова 18-краун-6`, /18-краун-6/.test(fin.item), fin.item);
  // свёрнутое меню
  await p.click('#setClose'); await p.waitForTimeout(400);
  const closed = await state(p);
  ok(`${label} комплексы: меню закрывается, окно снова во весь экран`, !closed.open && closed.viewer.height >= closed.h - 2 && closed.viewer.width >= closed.w - 2);
  await p.click('#bSet'); await p.waitForTimeout(400);
  if (label === 'iphone') {
    await p.evaluate(() => { document.getElementById('sheetSet').scrollTop = 9999; });
    await p.waitForTimeout(200);
    await shot(p, 'crown-menu-iphone.png');
  }
  if (label === 'desk') { await pick(p, 'metal', 'Cs'); await shot(p, 'crown-desk.png'); }
  // прямая короткая ссылка с выбором
  await p.goto(BASE + '?set=_supra/crown/complexes&pick=size:5,cx:1,metal:Na,ratio:2', { waitUntil: 'load' });
  await ready(p);
  const direct = await state(p);
  ok(`${label} ?set=…&pick=…: открыта нужная структура`, direct.item.startsWith('(15-краун-5)₂ · Na⁺'), direct.item);
  await p.close();

  // 3. аннелирование
  p = await newPage(ctx, errs);
  await p.goto(BASE + '?e=' + encodeURIComponent(FOLDER + '/annel'), { waitUntil: 'load' });
  await ready(p);
  s0 = await state(p);
  ok(`${label} аннелирование: по умолчанию дибензо`, s0.item.startsWith('Дибензо'), s0.item);
  const opts = await p.evaluate(() => [...document.querySelectorAll('#setMenu [data-key="deg"] .chip')].map((b) => b.textContent + (b.classList.contains('na') ? '(нет)' : '')));
  ok(`${label} аннелирование: бензо 1,2,3,4,6 доступны`, opts.length === 5 && !opts.some((t) => t.includes('(нет)')), opts.join(', '));
  allSame = true;
  for (const [k, v] of [['deg', '3'], ['type', 'cH'], ['deg', '6'], ['type', '0'], ['type', 'B']]) {
    await pick(p, k, v);
    const s = await state(p);
    if (!same(s.view, s0.view)) allSame = false;
    if (label === 'iphone' && k === 'deg' && v === '3') await shot(p, 'crown-annel-iphone.png');
  }
  const an = await state(p);
  ok(`${label} аннелирование: переключения без сдвига камеры`, allSame);
  ok(`${label} аннелирование: после «Нет» и «Бензо» — гексабензо (последняя степень)`, an.item.startsWith('Гексабензо'), an.item);
  await p.close();

  // 4. набор учителя
  if (label === 'desk') {
    p = await newPage(ctx, errs);
    await p.goto(BASE + 'teacher.html', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const open = (path) => p.evaluate(async (path) => { const idx = await PV.loadIndex(); const e = PV.findEntry(idx, path); await teacher.preview(PV.sourceFromEntry(e), Object.assign({ title: e.title }, e.params || {}), e); }, path);
    await open('Малые молекулы/caffeine'); await p.click('#setAdd');
    await open('Малые молекулы/ethanol'); await p.click('#setAdd');
    await open(FOLDER + '/annel'); await p.click('#setAdd');
    await p.fill('#setTitle', 'Кофеин, этанол и краун');
    await p.waitForTimeout(300);
    const link = await p.inputValue('#link');
    const qr = await p.evaluate(() => document.getElementById('qr').dataset.ok);
    ok(`${label} учитель: ссылка на набор из 3 структур и QR`, /#ms=/.test(link) && qr === '1', link.length + ' символов');
    await p.evaluate(() => document.getElementById('secSet').scrollIntoView());
    await p.waitForTimeout(300);
    await shot(p, 'teacher-multi-desk.png');
    await p.click('#bSave');
    const json = await p.inputValue('#saveOut textarea');
    ok(`${label} учитель: «Сохранить в каталог» пишет запись type: set`, /"type": "set"/.test(json) && /"s": "e:Малые молекулы\/caffeine"/.test(json));
    const st = await newPage(ctx, errs);
    await st.goto(link.replace(/^https?:\/\/[^?#]*\/(?=[?#])|^https?:\/\/[^?#]*\/$/, BASE), { waitUntil: 'load' });
    await ready(st);
    const a = await state(st);
    await pick(st, 'i', '2'); await st.waitForTimeout(800);
    const b = await state(st);
    ok(`${label} ученик: набор учителя открылся и переключается`, a.item === 'Кофеин' && b.item.startsWith('Дибензо'), a.item + ' → ' + b.item);
    await st.close(); await p.close();
  }
  ok(`${label}: нет ошибок в консоли`, !errs.length, errs.slice(0, 3).join(' | '));
  await browser.close();
}

const all = { iphone: ['webkit', devices['iPhone 13']], pixel: ['chromium', devices['Pixel 7']], desk: ['chromium', { viewport: { width: 1280, height: 800 } }] };
for (const d of DEV) await run(all[d][0], all[d][1], d);
console.log(fails.length ? `\nПровалено: ${fails.length}` : '\nВсё прошло');
process.exit(fails.length ? 1 : 0);
