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
  await p.waitForSelector('#catList button.folder');
  await p.click('#catList button.folder');
  await p.waitForSelector('#catList button.entry');
  await p.click('#catList button.entry');
  await p.waitForFunction(() => document.getElementById('qr').dataset.ok === '1', null, { timeout: 30000 });
  await p.check('#oSpin'); await p.click('#bView');
  await shot(p, '11_teacher_repo_qr.png');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#bQrPng')]); await d.saveAs(OUT + '12_' + d.suggestedFilename());
  await p.click('#bProj'); await shot(p, '13_teacher_projector.png');
  return await p.inputValue('#link');
});
await run('учитель: свой файл в ссылке', 'teacher.html', { viewport: { width: 1400, height: 1000 } }, async p => {
  await p.click('.tab[data-p=file]');
  await p.setInputFiles('#fileIn', decodeURIComponent(new URL('../structures/Малые молекулы/caffeine.sdf', import.meta.url).pathname));
  await p.waitForFunction(() => document.getElementById('qr').dataset.ok === '1', null, { timeout: 30000 });
  await shot(p, '14_teacher_embedded_file.png');
  const link = await p.inputValue('#link'); fs.writeFileSync(OUT + 'embedded_link.txt', link);
  return 'длина ссылки ' + link.length;
});
await run('учитель: большой файл → совет загрузить', 'teacher.html', { viewport: { width: 1400, height: 1000 } }, async p => {
  await p.click('.tab[data-p=file]');
  await p.setInputFiles('#fileIn', decodeURIComponent(new URL('../structures/Нуклеиновые кислоты/1bna.pdb', import.meta.url).pathname));
  await p.waitForSelector('#linkMsg .bad, #linkMsg .ok, #linkMsg .warn'); await shot(p, '15_teacher_big_file.png');
  return await p.evaluate(() => document.getElementById('linkMsg').innerText.slice(0, 120));
});
// встроенная ссылка открывается у ученика
const emb = fs.readFileSync(OUT + 'embedded_link.txt', 'utf8').replace(/^https?:\/\/[^/]+\//, '');
await run('ученик: ссылка со встроенным файлом', emb, phone, async p => { await waitViewer(p); await shot(p, '16_student_embedded.png'); return await p.evaluate(() => pdbViewer.mv.stats.atoms + ' атомов'); });

await run('каталог: папки', '', phone, async p => {
  await p.waitForSelector('.card');
  const names = await p.$$eval('.card b', els => els.map(e => e.textContent));
  if (!names.some(n => n.includes('Кристаллы'))) throw new Error('нет папки Кристаллы: ' + names.join(','));
  await p.click('.card:has-text("Кристаллы")');
  await p.waitForSelector('a.card:has-text("Хлорид")');
  return names.join(' | ');
});
await run('запись ?e= крамбин', '?e=' + encodeURIComponent('Белки/1crn'), phone, async p => {
  await waitViewer(p); await shot(p, '17_entry_1crn.png');
  return await p.evaluate(() => document.getElementById('title').textContent + ' / ' + pdbViewer.mv.effectiveStyle());
});
await run('COD NaCl ячейка', '?cod=1000041&rep=2x2x2', phone, async p => {
  await waitViewer(p); await shot(p, '18_cod_nacl.png');
  return await p.evaluate(() => {
    const mv = pdbViewer.mv;
    const c = mv.model.getCrystData();
    return (document.getElementById('errText')?.textContent || 'ok') + ' atoms=' + mv.stats.atoms + ' cell=' + (c && c.a) + ' box=' + !!mv.model.unitCellObjects;
  });
});
await run('QR-лист кристаллов', 'qr.html?folder=' + encodeURIComponent('Кристаллы'), phone, async p => {
  await p.waitForSelector('.tile canvas');
  await shot(p, '19_qr_sheet.png');
  return (await p.$$('.tile')).length + ' QR';
});
await run('addh + заряд + контакты', '?pdb=structures/' + encodeURIComponent('Малые молекулы/caffeine.sdf') + '&addh=1&color=charge&ix=hb', phone, async p => {
  await waitViewer(p);
  return await p.evaluate(() => {
    const mv = pdbViewer.mv;
    const charged = mv.model.selectedAtoms({}).filter(a => a.partialCharge != null).length;
    return 'atoms=' + mv.stats.atoms + ' charged=' + charged + ' method=' + (mv.chargeMethod || '') + ' ix=' + mv.interactions.length;
  });
});
await run('ионные контакты NaCl', '?e=' + encodeURIComponent('Кристаллы/nacl') + '&ix=salt', phone, async p => {
  await waitViewer(p); await shot(p, '20_nacl_salt.png');
  return await p.evaluate(() => 'contacts=' + pdbViewer.mv.interactions.length + ' atoms=' + pdbViewer.mv.stats.atoms);
});
await run('панорама двумя пальцами', '?pdb=structures/' + encodeURIComponent('Малые молекулы/caffeine.sdf'), phone, async p => {
  await waitViewer(p);
  const before = await p.evaluate(() => {
    const v = pdbViewer.mv.viewer;
    return { x: v.modelGroup.position.x, y: v.modelGroup.position.y, z: v.rotationGroup.position.z, w: v.rotationGroup.quaternion.w };
  });
  const cdp = await p.context().newCDPSession(p);
  const start = [{ x: 120, y: 420, id: 1 }, { x: 240, y: 420, id: 2 }];
  const moved = [{ x: 170, y: 500, id: 1 }, { x: 290, y: 500, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: moved });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await p.evaluate(() => {
    const v = pdbViewer.mv.viewer;
    return { x: v.modelGroup.position.x, y: v.modelGroup.position.y, z: v.rotationGroup.position.z, w: v.rotationGroup.quaternion.w };
  });
  const pan = Math.hypot(after.x - before.x, after.y - before.y);
  if (pan < 0.2) throw new Error('панорама не сдвинула сцену ' + JSON.stringify({ before, after }));
  return 'pan=' + pan.toFixed(2);
});
await run('щипок меняет масштаб', '?pdb=structures/' + encodeURIComponent('Малые молекулы/caffeine.sdf'), phone, async p => {
  await waitViewer(p);
  const z0 = await p.evaluate(() => pdbViewer.mv.viewer.rotationGroup.position.z);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 430, id: 1 }, { x: 210, y: 430, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 430, id: 1 }, { x: 320, y: 430, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const z1 = await p.evaluate(() => pdbViewer.mv.viewer.rotationGroup.position.z);
  if (Math.abs(z1 - z0) < 0.5) throw new Error('масштаб не изменился ' + z0 + ' → ' + z1);
  return 'z ' + z0.toFixed(1) + ' → ' + z1.toFixed(1);
});
await run('правая кнопка — панорама', '?pdb=structures/' + encodeURIComponent('Малые молекулы/caffeine.sdf'), { viewport: { width: 800, height: 900 } }, async p => {
  await waitViewer(p);
  const before = await p.evaluate(() => ({ x: pdbViewer.mv.viewer.modelGroup.position.x, y: pdbViewer.mv.viewer.modelGroup.position.y }));
  await p.mouse.move(300, 400);
  await p.mouse.down({ button: 'right' });
  await p.mouse.move(420, 520, { steps: 8 });
  await p.mouse.up({ button: 'right' });
  const after = await p.evaluate(() => ({ x: pdbViewer.mv.viewer.modelGroup.position.x, y: pdbViewer.mv.viewer.modelGroup.position.y }));
  const pan = Math.hypot(after.x - before.x, after.y - before.y);
  if (pan < 0.2) throw new Error('правый перетаск не сдвинул ' + JSON.stringify({ before, after }));
  return 'pan=' + pan.toFixed(2);
});
await run('измерения крамбина и NaCl', '?pdb=structures/Белки/1crn.pdb&style=stick', phone, async p => {
  await waitViewer(p);
  const built = await p.evaluate(() => {
    const mv = pdbViewer.mv;
    const atoms = mv.model.selectedAtoms({});
    const by = (resi, name) => atoms.find(a => a.resi === resi && String(a.atom || '').trim() === name);
    let resi = null;
    for (const a of atoms) {
      if (String(a.atom || '').trim() !== 'CA') continue;
      const n = by(a.resi, 'N'), c = by(a.resi, 'C'), n2 = by(a.resi + 1, 'N');
      if (n && c && n2) { resi = a.resi; break; }
    }
    const N = by(resi, 'N'), CA = by(resi, 'CA'), C = by(resi, 'C'), CA2 = by(resi + 1, 'CA'), N2 = by(resi + 1, 'N');
    mv.setMeasMode('d'); mv.pickAtom(CA); mv.pickAtom(CA2);
    mv.setMeasMode('a'); mv.pickAtom(N); mv.pickAtom(CA); mv.pickAtom(C);
    mv.setMeasMode('t'); mv.pickAtom(N); mv.pickAtom(CA); mv.pickAtom(C); mv.pickAtom(N2);
    mv.setMeasMode(null);
    const vals = mv.meas.map(m => ({ t: m.type, v: m.value, text: m.text }));
    const spec = mv.o.meas;
    return { resi, vals, spec, n: mv.meas.length };
  });
  if (built.n !== 3) throw new Error('не 3 измерения ' + JSON.stringify(built));
  const dist = built.vals.find(x => x.t === 'd').v;
  const ang = built.vals.find(x => x.t === 'a').v;
  const tor = built.vals.find(x => x.t === 't').v;
  if (dist < 3.2 || dist > 4.3) throw new Error('CA–CA ' + dist);
  if (ang < 100 || ang > 125) throw new Error('N-CA-C ' + ang);
  if (!(tor > -180 && tor <= 180)) throw new Error('torsion ' + tor);
  await shot(p, '21_meas_crambin_3d.png');
  await p.tap('#bMeas');
  await p.waitForTimeout(400);
  await shot(p, '22_meas_crambin_list.png');
  const again = await p.evaluate(() => pdbViewer.mv.meas.map(m => m.value));
  await p.evaluate(() => pdbViewer.mv.apply({ style: 'sphere', surface: '0' }));
  const after = await p.evaluate(() => pdbViewer.mv.meas.map(m => m.value));
  if (again.some((v, i) => Math.abs(v - after[i]) > 0.02)) throw new Error('после стиля ' + again + ' vs ' + after);
  return 'resi ' + built.resi + ' d=' + dist.toFixed(2) + ' a=' + ang.toFixed(1) + ' t=' + tor.toFixed(1) + ' ' + built.spec;
});
await run('измерение NaCl ~2.82 Å', '?cod=1000041&rep=2x2x2&style=ballstick', phone, async p => {
  await waitViewer(p);
  const r = await p.evaluate(() => {
    const mv = pdbViewer.mv;
    const atoms = mv.model.selectedAtoms({});
    let best = null;
    for (const a of atoms) for (const b of atoms) {
      if (a.measId >= b.measId) continue;
      const ea = a.elem, eb = b.elem;
      if (!((ea === 'Na' && eb === 'Cl') || (ea === 'Cl' && eb === 'Na'))) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (Math.abs(d - 2.82) > 0.08) continue;
      const big = a.measId > 8 || b.measId > 8;
      if (!best || (big && !best.big)) best = { d, i: a.measId, j: b.measId, big };
    }
    const A = atoms.find(x => x.measId === best.i), B = atoms.find(x => x.measId === best.j);
    mv.setMeasMode('d'); mv.pickAtom(A); mv.pickAtom(B); mv.setMeasMode(null);
    return { d: mv.meas[0].value, spec: mv.o.meas, big: best.big, atoms: atoms.length };
  });
  if (Math.abs(r.d - 2.82) > 0.08) throw new Error('Na-Cl ' + r.d);
  if (!r.big) throw new Error('пара не из повторённой ячейки');
  await shot(p, '23_meas_nacl.png');
  return 'd=' + r.d.toFixed(3) + ' ' + r.spec + ' atoms=' + r.atoms;
});
await run('измерения из URL и тап не при сдвиге', '?pdb=structures/Белки/1crn.pdb&style=stick&meas=' + encodeURIComponent('a:1,2,3'), phone, async p => {
  await waitViewer(p);
  const info = await p.evaluate(() => {
    const mv = pdbViewer.mv;
    const before = mv.meas.length;
    mv.setMeasMode('d');
    return { before, mode: mv.measMode, hintReady: true };
  });
  if (!info.before) throw new Error('meas= не восстановился');
  const box = await p.evaluate(() => { const r = document.getElementById('viewer').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(box.x, box.y);
  await p.mouse.down();
  await p.mouse.move(box.x + 90, box.y + 70, { steps: 6 });
  await p.mouse.up();
  const picks = await p.evaluate(() => pdbViewer.mv.pick.length);
  if (picks !== 0) throw new Error('сдвиг выбрал атом, pick=' + picks);
  return 'восстановлено ' + info.before + ', после сдвига pick=' + picks;
});
await run('учитель: сохранить JSON', 'teacher.html', { viewport: { width: 1400, height: 1000 } }, async p => {
  await p.click('.tab[data-p=cod]');
  await p.fill('#codId', '1000041');
  await p.click('#codGo');
  await p.waitForFunction(() => document.getElementById('qr').dataset.ok === '1', null, { timeout: 40000 });
  await p.click('#bSave');
  await p.waitForSelector('#saveOut textarea');
  const json = await p.locator('#saveOut textarea').inputValue();
  if (!json.includes('1000041')) throw new Error(json.slice(0, 200));
  return json.slice(0, 80);
});
await browser.close();
const bad = results.filter(r => r.errs.length);
console.log(bad.length ? `\nОШИБКИ в ${bad.length} тестах` : '\nВсе тесты без ошибок консоли');
