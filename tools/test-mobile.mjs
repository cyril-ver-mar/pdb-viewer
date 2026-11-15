// Headless-проверка (не нужна для работы сайта). Запуск: node tools/test-mobile.mjs (нужен playwright-core и локальный сервер на :18431)
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const OUT = new URL('../samples/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
async function run(name, url, ctxOpts, fn) {
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + url);
  let extra = '';
  try { extra = await fn(page) || ''; } catch (e) { errs.push('test: ' + e.message); }
  results.push({ name, errs, extra }); console.log((errs.length ? '✗ ' : '✓ ') + name, extra, errs.join(' | '));
  await ctx.close();
}
const phone = { ...devices['Pixel 7'] };
const iphone = { ...devices['iPhone 14'], defaultBrowserType: undefined };
delete iphone.defaultBrowserType;
const waitViewer = p => p.waitForFunction(() => window.pdbViewer && (window.pdbViewer.mv && window.pdbViewer.mv.model || document.getElementById('errText')), null, { timeout: 60000 });
const shot = async (p, f) => { await p.waitForTimeout(1200); await p.screenshot({ path: OUT + f }); };

await run('каталог', '', phone, async p => { await p.waitForSelector('.card'); await shot(p, '01_catalog_phone.png'); return (await p.$$('.card')).length + ' карточек'; });
await run('?pdb= крамбин (cartoon, ss)', '?pdb=structures/1crn.pdb&style=cartoon&color=ss', phone, async p => { await waitViewer(p); await shot(p, '02_1crn_cartoon_ss.png'); return await p.evaluate(() => document.getElementById('title').textContent + ' / ' + pdbViewer.mv.stats.atoms + ' атомов'); });
await run('?pdb= ДНК (chain) iPhone', '?pdb=structures/1bna.pdb&color=chain&bg=111827', iphone, async p => { await waitViewer(p); await shot(p, '03_1bna_dna_iphone.png'); });
await run('кофеин sdf + подписи', '?pdb=structures/caffeine.sdf&labels=atoms', phone, async p => { await waitViewer(p); await shot(p, '04_caffeine_labels.png'); });
await run('?id=1CRN из RCSB, поверхность', '?id=1CRN&style=stick&surface=1', phone, async p => { await waitViewer(p); await p.waitForTimeout(2500); await shot(p, '05_rcsb_1crn_surface.png'); return await p.evaluate(() => document.getElementById('errText')?.textContent || 'ok'); });
await run('?id=4HHB гемоглобин, sphere', '?id=4HHB&style=sphere&color=chain', phone, async p => { await waitViewer(p); await shot(p, '06_4hhb_spheres.png'); });
await run('шторка стиля + инфо', '?pdb=structures/1crn.pdb', phone, async p => {
  await waitViewer(p); await p.tap('#bStyle'); await p.waitForTimeout(400); await p.tap('#chStyle .chip:has-text("Шарики")'); await shot(p, '07_style_sheet.png');
  await p.touchscreen.tap(200, 150); await p.waitForTimeout(400); await p.tap('#bInfo'); await shot(p, '08_info_sheet.png');
  return await p.evaluate(() => document.getElementById('iList').innerText.replace(/\n/g, ' ').slice(0, 160));
});
await run('скриншот PNG', '?pdb=structures/caffeine.sdf', { ...phone, hasTouch: false, isMobile: false, acceptDownloads: true }, async p => {
  await waitViewer(p); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#bShot')]); const f = OUT + '09_download_' + d.suggestedFilename(); await d.saveAs(f); return 'скачан ' + d.suggestedFilename() + ' ' + fs.statSync(f).size + ' байт';
});
await run('pubchem ?cid=5793 (глюкоза)', '?cid=5793&title=Глюкоза', phone, async p => { await waitViewer(p); await shot(p, '10_pubchem_glucose.png'); });
await run('ошибка: плохой ID', '?id=ZZZZ', phone, async p => { await waitViewer(p); return await p.evaluate(() => document.getElementById('errText')?.textContent); });

// Учитель
await run('учитель: репозиторий → QR', 'teacher.html', { viewport: { width: 1400, height: 1000 }, acceptDownloads: true }, async p => {
  await p.waitForFunction(() => document.querySelectorAll('#repoSel option').length > 1);
  await p.selectOption('#repoSel', '0'); await p.waitForFunction(() => document.getElementById('qr').dataset.ok === '1', null, { timeout: 30000 });
  await p.check('#oSpin'); await p.click('#bView');
  await shot(p, '11_teacher_repo_qr.png');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#bQrPng')]); await d.saveAs(OUT + '12_' + d.suggestedFilename());
  await p.click('#bProj'); await shot(p, '13_teacher_projector.png');
  return await p.inputValue('#link');
});
await run('учитель: свой файл в ссылке', 'teacher.html', { viewport: { width: 1400, height: 1000 } }, async p => {
  await p.click('.tab[data-p=file]');
  await p.setInputFiles('#fileIn', new URL('../structures/caffeine.sdf', import.meta.url).pathname);
  await p.waitForFunction(() => document.getElementById('qr').dataset.ok === '1', null, { timeout: 30000 });
  await shot(p, '14_teacher_embedded_file.png');
  const link = await p.inputValue('#link'); fs.writeFileSync(OUT + 'embedded_link.txt', link);
  return 'длина ссылки ' + link.length;
});
await run('учитель: большой файл → совет загрузить', 'teacher.html', { viewport: { width: 1400, height: 1000 } }, async p => {
  await p.click('.tab[data-p=file]');
  await p.setInputFiles('#fileIn', new URL('../structures/1bna.pdb', import.meta.url).pathname);
  await p.waitForSelector('#linkMsg .bad, #linkMsg .ok, #linkMsg .warn'); await shot(p, '15_teacher_big_file.png');
  return await p.evaluate(() => document.getElementById('linkMsg').innerText.slice(0, 120));
});
// встроенная ссылка открывается у ученика
const emb = fs.readFileSync(OUT + 'embedded_link.txt', 'utf8').replace(/^https?:\/\/[^/]+\//, '');
await run('ученик: ссылка со встроенным файлом', emb, phone, async p => { await waitViewer(p); await shot(p, '16_student_embedded.png'); return await p.evaluate(() => pdbViewer.mv.stats.atoms + ' атомов'); });
await browser.close();
const bad = results.filter(r => r.errs.length);
console.log(bad.length ? `\nОШИБКИ в ${bad.length} тестах` : '\nВсе тесты без ошибок консоли');
