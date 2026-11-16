/* Проверка вёрстки разделов на iPhone 13 (WebKit), Pixel 7 и 1280×800:
   нет ошибок в консоли, нет горизонтальной прокрутки, и пока ползунок в фокусе и меняется,
   его окно с результатом видно хотя бы на 60 %. Скриншоты — в SHOTS. */
import { chromium, webkit, devices } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const SHOTS = process.env.SHOTS || '';
const PAGES = (process.env.PAGES || 'eos,interactions,lattice,machines,supra,symmetry,index,teacher').split(',');
const DEV = (process.env.DEV || 'iphone,pixel,desk').split(',');
const MAXS = +(process.env.MAXS || 40);
const fails = [];
const ok = (name, cond, info) => { console.log((cond ? '✓ ' : '✗ ') + name + (info ? '  ' + info : '')); if (!cond) fails.push(name + ' ' + (info || '')); };

const PREP = {
  // страницы с вкладками: пройти каждую вкладку
  lattice: ['[data-sec="lattice"]', '[data-sec="phonon"]', '[data-sec="electron"]', '[data-sec="more"]'],
  symmetry: ['button[data-tab="pg"]', 'button[data-tab="sg"]']
};

async function run(kind, device, label) {
  const browser = kind === 'webkit' ? await webkit.launch() : await chromium.launch({
    executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  for (const name of PAGES) {
    const ctx = await browser.newContext(device);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    const file = name === 'index' ? '' : name + '.html';
    await p.goto(BASE + file, { waitUntil: 'load' });
    await p.waitForTimeout(2200);
    const over = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${label} ${name}: нет горизонтальной прокрутки`, over.sw <= over.cw + 1, over.sw + ' > ' + over.cw);
    const bar = await p.evaluate(() => {
      const b = document.querySelector('.ui-bar');
      const sec = !!document.querySelector('.ui-sec-btn');
      const back = !!document.querySelector('.ui-bar a.ui-back, a[href="./"]');
      return { bar: !!b, sec, back };
    });
    if (!['index', 'teacher'].includes(name)) ok(`${label} ${name}: шапка с «Разделы» и «← Каталог»`, bar.bar && bar.sec && bar.back, JSON.stringify(bar));
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}-${label}.png` });
    const tabs = PREP[name] || [null];
    let tested = 0, bad = [];
    for (const tab of tabs) {
      if (tab) { const t = p.locator(tab).first(); if (await t.count()) { await t.click(); await p.waitForTimeout(500); } }
      const n = await p.evaluate(() => {
        document.querySelectorAll('[data-uitest]').forEach((e) => e.removeAttribute('data-uitest'));
        const list = Array.from(document.querySelectorAll('input[type=range]')).filter((r) => {
          if (!r.offsetParent && getComputedStyle(r).position !== 'fixed') return false;
          if (r.closest('details:not([open])')) return false;
          if (r.closest('[data-ui-noview]')) return false; // настройка ссылки без живого окна
          if (r.closest('.ui-sheet') && !r.closest('.ui-sheet.ui-open') && innerWidth <= 820) return false;
          const cs = getComputedStyle(r);
          return cs.visibility !== 'hidden' && r.getBoundingClientRect().width > 20;
        });
        list.forEach((r, i) => r.setAttribute('data-uitest', String(i)));
        return list.length;
      });
      for (let i = 0; i < Math.min(n, MAXS); i++) {
        const res = await p.evaluate(async (i) => {
          const r = document.querySelector('[data-uitest="' + i + '"]');
          if (!r) return { skip: true };
          const sel = r.closest('[data-ui-view]') && r.closest('[data-ui-view]').getAttribute('data-ui-view');
          let view = sel ? document.querySelector(sel) : null;
          const pane = r.closest('.ui-pane');
          if (!view && pane) view = pane.querySelector(':scope > .ui-stage');
          if (!view) return { none: true, id: r.id || r.getAttribute('data-key') || r.name || i };
          // как пользователь: дошёл до начала блока и долистал до ползунка
          const top = (pane || view).getBoundingClientRect().top + scrollY - 60;
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          r.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          r.focus({ preventScroll: true });
          return { ok: true };
        }, i);
        if (res.skip) continue;
        if (res.none) { bad.push('нет окна у ползунка ' + res.id); continue; }
        await p.keyboard.press('ArrowRight');
        await p.waitForTimeout(120);
        const m = await p.evaluate((i) => {
          const r = document.querySelector('[data-uitest="' + i + '"]');
          const sel = r.closest('[data-ui-view]') && r.closest('[data-ui-view]').getAttribute('data-ui-view');
          let view = sel ? document.querySelector(sel) : null;
          const pane = r.closest('.ui-pane');
          if (!view && pane) view = pane.querySelector(':scope > .ui-stage');
          const vr = view.getBoundingClientRect();
          const H = innerHeight, W = innerWidth;
          const vis = Math.max(0, Math.min(vr.bottom, H) - Math.max(vr.top, 0)) * Math.max(0, Math.min(vr.right, W) - Math.max(vr.left, 0));
          const area = Math.min(vr.height, H) * Math.min(vr.width, W);
          const rr = r.getBoundingClientRect();
          const cx = rr.left + rr.width / 2, cy = rr.top + rr.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const reach = cy > 0 && cy < H && (hit === r || (hit && (hit.contains(r) || r.contains(hit) || (r.labels && Array.from(r.labels).some((l) => l.contains(hit))))));
          return { frac: area ? vis / area : 0, reach, focused: document.activeElement === r, id: r.id || r.getAttribute('data-key') || r.getAttribute('data-ui-twin') || ('#' + i) };
        }, i);
        tested++;
        if (!(m.frac >= 0.6 && m.reach)) bad.push(`${m.id}: окно ${(m.frac * 100).toFixed(0)}%${m.reach ? '' : ', ползунок закрыт'}`);
      }
    }
    ok(`${label} ${name}: ползунок и его окно видны вместе (${tested} шт.)`, bad.length === 0, bad.slice(0, 6).join('; '));
    ok(`${label} ${name}: без ошибок в консоли`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await browser.close();
}

const D = {
  iphone: ['webkit', devices['iPhone 13'], 'iphone13'],
  pixel: ['chromium', devices['Pixel 7'], 'pixel7'],
  desk: ['chromium', { viewport: { width: 1280, height: 800 } }, 'desk']
};
for (const d of DEV) await run(...D[d]);
console.log(fails.length ? '\nFAIL ' + fails.length : '\nALL OK');
process.exit(fails.length ? 1 : 0);
