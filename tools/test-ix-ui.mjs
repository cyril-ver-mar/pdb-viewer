// Headless-проверка страницы «Физика взаимодействий».
// node tools/test-ix-ui.mjs   (нужны playwright-core и Chrome; сервер поднимется сам, если BASE не задан)
import { chromium, devices } from 'playwright-core';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = 8765;
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}/`;
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });

function startServer() {
  return spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'),
    stdio: 'ignore'
  });
}

let server = null;
async function ready() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + 'interactions.html');
      if (r.ok) return;
    } catch (e) { /* ещё стартует */ }
    await new Promise(s => setTimeout(s, 200));
  }
  throw new Error('сервер не поднялся');
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
});

const phone = { ...devices['Pixel 7'] };
delete phone.defaultBrowserType;
const desktop = { viewport: { width: 1280, height: 860 } };

function ignore(text) {
  return /favicon|Download the React DevTools|swiftshader|WebGL|GPU|gpu/i.test(text);
}

async function open(name, url, ctxOpts, fn) {
  const skipReadout = !!ctxOpts.skipReadout;
  const rest = { ...ctxOpts };
  delete rest.skipReadout;
  const ctx = await browser.newContext(rest);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !ignore(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  if (!skipReadout) {
    await page.waitForSelector('#readout[data-preset]');
    await page.waitForTimeout(500);
  }
  let extra = '';
  try { extra = await fn(page) || ''; }
  catch (e) { errs.push('test: ' + e.message); }
  const shot = path.join(OUT, 'lab_' + name.replace(/[^\w.-]+/g, '_') + '.png');
  await page.screenshot({ path: shot, fullPage: false });
  console.log((errs.length ? '✗ ' : '✓ ') + name, extra, errs.join(' | '));
  if (errs.length) process.exitCode = 1;
  await ctx.close();
  return errs;
}

async function energy(page) {
  return page.$eval('#readout', el => ({
    e: +el.dataset.e, emin: +el.dataset.emin, req: +el.dataset.req, preset: el.dataset.preset, type: el.dataset.type
  }));
}

try {
  try { await fetch(BASE + 'interactions.html'); }
  catch (e) { server = startServer(); await ready(); }

  const cases = [
    ['hb', 'water', e => e.req > 2.75 && e.req < 3.1 && e.emin < -16 && e.emin > -25],
    ['xb', 'cf3i-o', e => e.emin < -5],
    ['chb', 'mes-o', e => e.emin < 0],
    ['vdw', 'ar', e => e.req > 3.6 && e.req < 4.0 && e.emin < -0.7 && e.emin > -1.4],
    ['hp', 'hp-ch4', e => e.emin < 0],
    ['pp', 'pd', e => e.emin < -8 && e.emin > -14],
    ['cat', 'na', e => e.emin < -90 && e.emin > -110],
    ['chpi', 'ch4pi', e => e.emin < 0],
    ['el', 'nacl', e => e.emin < -300]
  ];

  for (const [type, preset, ok] of cases) {
    await open('phone_' + type, `interactions.html?type=${type}&preset=${preset}`, phone, async page => {
      const before = await energy(page);
      if (before.preset !== preset) throw new Error('preset ' + before.preset);
      if (!ok(before)) throw new Error('минимум вне окна ' + JSON.stringify(before));
      const beforeR = before.e;
      const slider = page.locator('#sl-r');
      const max = await slider.evaluate(el => el.max);
      await slider.evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, max);
      await page.waitForFunction((prev) => Math.abs(+document.getElementById('readout').dataset.e - prev) > 0.2, beforeR, { timeout: 5000 });
      const after = await energy(page);
      const katex = await page.locator('.formula .katex').count();
      if (!katex) throw new Error('нет формул KaTeX');
      return `E ${before.e.toFixed(1)} → ${after.e.toFixed(1)}, min ${before.emin.toFixed(1)} @ ${before.req.toFixed(2)}, формул ${katex}`;
    });
  }

  await open('desktop_water', 'interactions.html?type=hb&preset=water&r=2.9&ang=170', desktop, async page => {
    const e = await energy(page);
    if (Math.abs(e.e + 19) > 8) throw new Error('энергия воды странная ' + e.e);
    const link = await page.locator('#bPhys, a[href="interactions.html"]').count();
    return 'E ' + e.e.toFixed(1);
  });

  await open('phone_index_link', '', { ...phone, skipReadout: true }, async page => {
    await page.waitForSelector('a[href="interactions.html"]');
    const t = await page.locator('a[href="interactions.html"] b').innerText();
    if (!t.includes('Физика')) throw new Error(t);
    return t;
  });

  await open('phone_pi_heat', 'interactions.html?type=pp&preset=pd', phone, async page => {
    const box = await page.locator('#cHeat').boundingBox();
    if (!box || box.height < 40) throw new Error('нет тепловой карты');
    return 'heatmap ' + Math.round(box.width) + '×' + Math.round(box.height);
  });
} finally {
  await browser.close();
  if (server) server.kill();
}
if (process.exitCode) process.exit(process.exitCode);
