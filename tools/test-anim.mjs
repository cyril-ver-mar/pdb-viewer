import { createHash } from 'crypto';
import { chromium, webkit, devices } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const OUT = '/opt/cursor/artifacts/';
const phone = devices['Pixel 7'];
const iphone = devices['iPhone 13'];

function hash(buf) { return createHash('sha1').update(buf).digest('hex'); }

async function launch(kind) {
  if (kind === 'webkit') {
    return webkit.launch();
  }
  return chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
}

async function shot(page, sel) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  return loc.screenshot({ timeout: 10000 });
}

async function changed(page, sel, before, between) {
  if (before) await before(page);
  await page.waitForTimeout(250);
  const a = await shot(page, sel);
  if (between) await between(page);
  await page.waitForTimeout(between ? 400 : 1100);
  const b = await shot(page, sel);
  return { changed: hash(a) !== hash(b), a: hash(a).slice(0, 8), b: hash(b).slice(0, 8) };
}

const CASES = [
  {
    name: 'eos сосуд',
    path: 'eos.html',
    sel: '#vessel',
    before: async (page) => {
      const label = await page.locator('#btnPause').innerText();
      if (label.includes('Пуск')) await page.locator('#btnPause').click();
    }
  },
  {
    name: 'lattice фононы',
    path: 'lattice.html?sec=phonon',
    sel: '#cvChain',
    before: async (page) => {
      const label = await page.locator('#btnPlay').innerText();
      if (label.includes('Пуск')) await page.locator('#btnPlay').click();
    }
  },
  {
    name: 'machines график',
    path: 'machines.html?m=feringa',
    sel: '#m-feringa canvas.chart',
    before: async (page) => {
      const btn = page.locator('#m-feringa .btn-play');
      const label = await btn.innerText();
      if (label.includes('Пуск')) await btn.click();
    }
  },
  {
    name: 'symmetry операция',
    path: 'symmetry.html?mol=H2O&pg=C2v',
    sel: '#app .viewer canvas',
    before: async (page) => {
      await page.getByRole('button', { name: 'Операция' }).click();
    }
  },
  {
    name: 'supra прилёт гостя',
    path: 'supra.html?c=crown&n=6&guest=K',
    sel: '#viewer canvas',
    between: async (page) => {
      await page.getByRole('button', { name: 'Вставить гостя' }).click();
      await page.waitForTimeout(280);
    }
  },
  {
    name: 'interactions график',
    path: 'interactions.html?type=hb&preset=water',
    sel: '#cDist',
    between: async (page) => {
      await page.locator('#sl-r').evaluate(el => {
        el.value = String(Math.min(Number(el.max), Number(el.value) + 1.2));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }
];

const results = [];
async function runBrowser(kind, device, reduce) {
  let browser;
  try { browser = await launch(kind); }
  catch (e) {
    results.push({ kind, reduce, name: '(запуск)', ok: false, detail: String(e.message || e).slice(0, 180) });
    return;
  }
  const ctx = await browser.newContext({ ...device, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  for (const c of CASES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    try {
      const res = await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(700);
      const diff = await changed(page, c.sel, c.before, c.between);
      const ok = diff.changed && errs.length === 0 && res.status() === 200;
      results.push({ kind, reduce, name: c.name, ok, detail: (diff.changed ? 'пиксели изменились' : 'кадр не сдвинулся') + (errs.length ? ' | ' + errs[0] : '') });
      if (kind === 'webkit' && reduce) {
        const file = c.name.startsWith('eos') ? 'anim-ios-eos.png'
          : c.name.startsWith('lattice') ? 'anim-ios-phonon.png'
          : c.name.startsWith('machines') ? 'anim-ios-machines.png'
          : c.name.startsWith('supra') ? 'anim-ios-supra.png'
          : '';
        if (file) await page.locator(c.sel).first().screenshot({ path: OUT + file });
      }
    } catch (e) {
      results.push({ kind, reduce, name: c.name, ok: false, detail: String(e.message || e).slice(0, 180) });
    }
    await page.close();
  }
  await ctx.close();
  await browser.close();
}

const jobs = [
  ['chromium', phone, false],
  ['chromium', phone, true]
];
try {
  const probe = await webkit.launch();
  await probe.close();
  jobs.push(['webkit', iphone, false], ['webkit', iphone, true]);
} catch (e) {
  console.log('WebKit недоступен: ' + String(e.message || e).slice(0, 240));
}

for (const [kind, device, reduce] of jobs) {
  console.log('\n== ' + kind + (reduce ? ' reduce' : ' motion') + ' ==');
  await runBrowser(kind, device, reduce);
}

let fail = 0;
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.kind + (r.reduce ? '/reduce' : '/motion') + ' ' + r.name + ' — ' + r.detail);
  if (!r.ok) fail++;
}
console.log(fail ? '\nFAILED ' + fail : '\nALL OK');
if (fail) process.exit(1);
