// Headless-проверка страницы уравнений состояния.
// node tools/test-eos-ui.mjs   (нужен playwright-core и сервер, BASE по умолчанию :8765)
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const OUT = process.env.OUT || '/tmp/eos-shots/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const fails = [];
function check(name, cond, extra) {
  const ok = !!cond;
  console.log((ok ? '✓ ' : '✗ ') + name + (extra != null ? ' ' + extra : ''));
  if (!ok) fails.push(name + (extra != null ? ' ' + extra : ''));
}

async function open(name, viewport, url) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', function (m) { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', function (e) { errs.push('pageerror: ' + e.message); });
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return document.getElementById('vessel') && document.getElementById('vessel').dataset.ready === '1'; }, null, { timeout: 20000 });
  await page.waitForFunction(function () { return document.getElementById('selftest').dataset.ok; }, null, { timeout: 20000 });
  return { page, ctx, errs, name };
}

const mobile = { width: 390, height: 844 };
const desk = { width: 1280, height: 900 };

const m = await open('mobile', mobile, 'eos.html?gas=CO2&T=280&eos=vdw,pr,virial&n=3');
check('нет ошибок в консоли (телефон)', m.errs.length === 0, m.errs.join(' | '));
const facts = await m.page.$eval('#modelFacts', function (el) { return { tc: +el.dataset.tc, pc: +el.dataset.pc, tb: +el.dataset.tb, ratio: +el.dataset.ratio }; });
check('CO2 Tc из a,b ≈ 304 К', Math.abs(facts.tc - 304.1282) < 0.05, facts.tc);
check('CO2 Pc ≈ 73.8 бар', Math.abs(facts.pc - 73.773) < 0.05, facts.pc);
const st = await m.page.$eval('#selftest', function (el) { return el.dataset.ok + ' ' + el.textContent.slice(0, 80); });
check('selfTest на странице', st.startsWith('1'), st);
const ui = await m.page.$eval('#stateReadout', function (el) { return { eos: el.dataset.eos, n: el.dataset.n, t: el.dataset.t, gas: el.dataset.gas }; });
check('URL задал CO2, T, модели, n', ui.gas === 'CO2' && ui.t === '280' && ui.n === '3' && ui.eos.indexOf('vdw') >= 0 && ui.eos.indexOf('pr') >= 0 && ui.eos.indexOf('virial') >= 0, JSON.stringify(ui));
const vessel = await m.page.$eval('#vessel', function (el) { return { n: +el.dataset.n, kind: el.dataset.kind }; });
check('сосуд в двухфазной области', vessel.kind === 'two' && vessel.n >= 8, JSON.stringify(vessel));
const pixels = await m.page.evaluate(function () {
  const c = document.getElementById('vessel');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
  return n;
});
check('на холсте сосуда есть рисунок', pixels > 500, pixels);
const area = await m.page.$eval('#pvNote', function (el) { return { rel: el.dataset.areaRel, text: el.textContent.slice(0, 180) }; });
check('площади Максвелла близки', area.rel !== '' && +area.rel < 0.02, area.rel);
const vir = await m.page.$eval('#virText', function (el) { return { rel6: +el.dataset.rel6, rel: +el.dataset.rel }; });
check('вириал из 6 членов близок к ВдВ', vir.rel6 < 0.01, vir.rel6);
const katex = await m.page.$$eval('.katex', function (els) { return els.length; });
check('формулы KaTeX на месте', katex > 8, katex);
const stats = await m.page.$eval('#vesselStats', function (el) { return el.innerText; });
check('показаны d, σ и v', /d =/.test(stats) && /σ/.test(stats) && /v/.test(stats), stats.slice(0, 120));

await m.page.screenshot({ path: OUT + 'eos_mobile_vessel.png', fullPage: false });
await m.page.locator('#sec-pv').scrollIntoViewIfNeeded();
await m.page.waitForTimeout(300);
await m.page.screenshot({ path: OUT + 'eos_mobile_pv.png' });
await m.page.locator('#sec-virial').scrollIntoViewIfNeeded();
await m.page.waitForTimeout(200);
await m.page.screenshot({ path: OUT + 'eos_mobile_virial.png' });
await m.page.locator('#sec-eq').scrollIntoViewIfNeeded();
await m.page.waitForTimeout(200);
await m.page.screenshot({ path: OUT + 'eos_mobile_equations.png' });

await m.page.selectOption('#gas', 'Ar');
await m.page.waitForTimeout(400);
const ar = await m.page.$eval('#modelFacts', function (el) { return { ratio: +el.dataset.ratio, tb: +el.dataset.tb, tc: +el.dataset.tc }; });
check('Ar TB/Tc = 3.375', Math.abs(ar.ratio - 3.375) < 0.01, ar.ratio + ' TB=' + ar.tb);
{ const sb = m.page.locator('.ui-sheet-btn[aria-controls="eosSheet"]'); if (await sb.isVisible()) await sb.click(); }
await m.page.selectOption('#pu', 'atm');
await m.page.evaluate(() => window.UI && UI.closeSheets());
const unitTxt = await m.page.$eval('#stateReadout', function (el) { return el.textContent; });
check('переключатель атм', unitTxt.indexOf('атм') >= 0, unitTxt.slice(0, 100));

await m.page.locator('#sec-pv').scrollIntoViewIfNeeded();
await m.page.waitForTimeout(200);
const before = await m.page.$eval('#vOut', function (el) { return el.textContent; });
const box = await m.page.locator('#pv').boundingBox();
if (box) {
  await m.page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await m.page.mouse.down();
  await m.page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.45);
  await m.page.mouse.up();
  await m.page.waitForTimeout(200);
}
const after = await m.page.$eval('#vOut', function (el) { return el.textContent; });
check('перетаскивание изотермы меняет Vm', before !== after, before + ' -> ' + after);

await m.page.screenshot({ path: OUT + 'eos_mobile_argon.png' });
await m.ctx.close();

const d = await open('desktop', desk, 'eos.html?gas=CO2&T=280&eos=vdw,pr,ideal&n=4');
check('нет ошибок в консоли (компьютер)', d.errs.length === 0, d.errs.join(' | '));
await d.page.screenshot({ path: OUT + 'eos_desktop.png' });
await d.page.locator('#sec-add').scrollIntoViewIfNeeded();
await d.page.waitForTimeout(200);
await d.page.screenshot({ path: OUT + 'eos_desktop_breakdown.png' });
await d.ctx.close();

const catCtx = await browser.newContext({ viewport: mobile });
const catPage = await catCtx.newPage();
await catPage.goto(BASE, { waitUntil: 'domcontentloaded' });
const link = await catPage.locator('a[href="eos.html"]').count();
check('ссылка с каталога', link > 0, link);
const teacher = await catCtx.newPage();
await teacher.goto(BASE + 'teacher.html', { waitUntil: 'domcontentloaded' });
const tlink = await teacher.locator('a[href="eos.html"]').count();
check('ссылка у учителя', tlink > 0, tlink);
await catCtx.close();

await browser.close();
if (fails.length) {
  console.log('FAILED', fails.length);
  process.exit(1);
}
console.log('ALL OK');
