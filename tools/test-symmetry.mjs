// Проверка страницы симметрии. node tools/test-symmetry.mjs
// Нужны playwright-core и Chrome. Сервер: python3 -m http.server 18431
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const phone = { ...devices['Pixel 7'] };
const desktop = { viewport: { width: 1280, height: 800 } };
const results = [];
function ignore(msg) {
  return /favicon|Download the React DevTools|WebGL|swiftshader|GL Driver|GroupMarker/i.test(msg);
}
async function run(name, url, ctxOpts, fn) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !ignore(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  let extra = '';
  try { extra = await fn(page) || ''; } catch (e) { errs.push('test: ' + e.message); }
  results.push({ name, errs, extra });
  console.log((errs.length ? '✗ ' : '✓ ') + name, extra, errs.join(' | '));
  await ctx.close();
}
const shot = async (p, f) => { await p.waitForTimeout(700); await p.screenshot({ path: OUT + f }); };

await run('точечная C2v вода, телефон', 'symmetry.html?pg=C2v&mol=H2O', phone, async p => {
  await p.waitForSelector('table.ct');
  await p.waitForSelector('.viewer canvas');
  const info = await p.evaluate(() => {
    const g = SYM.pg('C2v');
    const row = name => g.irreps.find(r => r.name === name).chi.join(',');
    const vib = SYM.vib('H2O').parts.filter(x => x.n).map(x => x.n + x.name).join('+');
    return { A1: row('A₁'), A2: row('A₂'), B1: row('B₁'), B2: row('B₂'), order: g.order, vib, atoms: SYM.mol('H2O').atoms.length };
  });
  if (info.A1 !== '1,1,1,1' || info.A2 !== '1,1,-1,-1' || info.B1 !== '1,-1,1,-1' || info.B2 !== '1,-1,-1,1') throw new Error('C2v ' + JSON.stringify(info));
  if (info.vib !== '2A₁+1B₂') throw new Error('vib ' + info.vib);
  await shot(p, 'symmetry_c2v_phone.png');
  const moved = await p.evaluate(async () => {
    const before = SYMApp.state;
    const atoms = document.querySelector('.viewer');
    const stage = window.SYM && true;
    const op = SYM.operations('C2v')[1];
    const p0 = SYM.mol('H2O').atoms[1].pos.slice();
    const R = op.R;
    const end = [R[0][0] * p0[0] + R[0][1] * p0[1] + R[0][2] * p0[2], R[1][0] * p0[0] + R[1][1] * p0[1] + R[1][2] * p0[2], R[2][0] * p0[0] + R[2][1] * p0[1] + R[2][2] * p0[2]];
    document.querySelector('.controls button').click();
    await new Promise(r => setTimeout(r, 400));
    return { clicked: true, end, stage, tab: before.tab, canvas: !!atoms };
  });
  await p.waitForTimeout(900);
  await shot(p, 'symmetry_c2v_anim_phone.png');
  return 'C2v OK vib ' + info.vib + ' anim ' + moved.clicked;
});

await run('таблицы C3v Td Oh D6h', 'symmetry.html?pg=C3v&mol=NH3', phone, async p => {
  await p.waitForSelector('table.ct');
  const bad = await p.evaluate(() => {
    const errs = [];
    const eq = (id, name, chi) => {
      const g = SYM.pg(id);
      const ir = g.irreps.find(r => r.name === name);
      const got = ir.chi.map(v => Math.round(v * 1000) / 1000).join(',');
      const want = chi.join(',');
      if (got !== want) errs.push(id + ' ' + name + ' ' + got);
    };
    eq('C3v', 'A₁', [1, 1, 1]); eq('C3v', 'A₂', [1, 1, -1]); eq('C3v', 'E', [2, -1, 0]);
    if (SYM.pg('C3v').order !== 6) errs.push('C3v order');
    eq('Td', 'A₁', [1, 1, 1, 1, 1]); eq('Td', 'T₂', [3, 0, -1, -1, 1]);
    if (SYM.operations('Td').length !== 24) errs.push('Td ops');
    eq('Oh', 'A1g', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    eq('Oh', 'T1u', [3, 0, -1, 1, -1, -3, -1, 0, 1, 1]);
    eq('Oh', 'T2g', [3, 0, 1, -1, -1, 3, -1, 0, -1, 1]);
    if (SYM.operations('Oh').length !== 48) errs.push('Oh ops');
    eq('D6h', 'A1g', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    eq('D6h', 'E1u', [2, 1, -1, -2, 0, 0, -2, -1, 1, 2, 0, 0]);
    eq('D6h', 'B1g', [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1]);
    if (SYM.operations('D6h').length !== 24) errs.push('D6h ops');
    if (SYM.operations('Ih').length !== 120) errs.push('Ih');
    const pg = SYM.pgSelftest();
    return errs.concat(pg);
  });
  if (bad.length) throw new Error(bad.join('; '));
  return 'таблицы совпали';
});

await run('230 групп и кратности', 'symmetry.html?sg=225', desktop, async p => {
  await p.waitForSelector('.viewer canvas', { timeout: 30000 });
  const rep = await p.evaluate(() => {
    const bad = SYM.hall.selftest();
    const fm = SYM.hall.opsOf(225).length;
    const ia = SYM.hall.opsOf(230).length;
    const p21 = SYM.hall.opsOf(14).length;
    const trip = SYM.hall.opsOf(14).map(SYM.hall.triplet).sort();
    return { bad, fm, ia, p21, trip };
  });
  if (rep.bad.length) throw new Error(rep.bad.slice(0, 8).join('; '));
  if (rep.fm !== 192 || rep.ia !== 96 || rep.p21 !== 4) throw new Error(JSON.stringify(rep));
  const expect = ['-x, -y, -z', '-x, y+1/2, -z+1/2', 'x, -y+1/2, z+1/2', 'x, y, z'];
  if (rep.trip.join('|') !== expect.join('|')) throw new Error('P21/c ' + rep.trip.join('; '));
  await shot(p, 'symmetry_fm3m_desktop.png');
  return '230 OK Fm-3m ' + rep.fm + ' Ia-3d ' + rep.ia + ' P21/c ' + rep.p21;
});

await run('ячейка P21/c телефон', 'symmetry.html?sg=14', phone, async p => {
  await p.waitForSelector('.viewer canvas');
  await p.waitForTimeout(500);
  const n = await p.evaluate(() => SYM.hall.opsOf(14).length);
  if (n !== 4) throw new Error('ops ' + n);
  await shot(p, 'symmetry_p21c_phone.png');
  await p.click('.controls button');
  await p.waitForTimeout(600);
  await shot(p, 'symmetry_p21c_anim_phone.png');
  return 'анимация ячейки, операций ' + n;
});

await run('свойства телефон', 'symmetry.html?tab=prop', phone, async p => {
  await p.waitForSelector('text=Дипольный момент');
  await shot(p, 'symmetry_props_phone.png');
  return 'свойства';
});

await run('квиз seed=42 телефон', 'symmetry.html?quiz=pg,prop&n=4&seed=42&lvl=1', phone, async p => {
  await p.waitForSelector('.qcard .choice');
  await shot(p, 'symmetry_quiz_phone.png');
  const prompt1 = await p.locator('.prompt').innerText();
  await p.locator('.qcard .choice').first().click();
  await p.waitForSelector('#fb');
  const fb = await p.locator('#fb').innerText();
  await p.locator('#fb .btn, #fb button').first().click();
  await p.waitForSelector('.qcard .choice');
  const prompt2 = await p.locator('.prompt').innerText();
  if (prompt1 === prompt2) throw new Error('вопрос не сменился');
  await shot(p, 'symmetry_quiz_next_phone.png');
  // тот же seed даёт тот же первый вопрос
  const again = await p.evaluate(() => SYM.quiz.buildQuiz({ quiz: 'pg,prop', n: 4, seed: 42, lvl: 1 }).questions[0].prompt);
  if (again !== prompt1) throw new Error('seed не стабилен');
  return 'квиз ' + prompt1.slice(0, 40);
});

await run('квиз итог', 'symmetry.html?quiz=pg&n=2&seed=7&lvl=1', desktop, async p => {
  await p.waitForSelector('.qcard .choice');
  await p.locator('.qcard .choice').first().click();
  await p.locator('#fb button').click();
  await p.waitForSelector('.qcard .choice');
  await p.locator('.qcard .choice').first().click();
  await p.locator('#fb button').click();
  await p.waitForSelector('.resultbig');
  const score = await p.locator('.resultbig').innerText();
  await shot(p, 'symmetry_quiz_result.png');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('sym-quiz-v1')).answered);
  if (!saved) throw new Error('localStorage пуст');
  return 'итог ' + score;
});

await run('ссылка Симметрия в каталоге', '', phone, async p => {
  await p.waitForSelector('#catalog a[href="symmetry.html"]');
  await shot(p, 'symmetry_catalog_link_phone.png');
  return 'ссылка есть';
});

const failed = results.filter(r => r.errs.length);
console.log('\n' + results.length + ' проверок, ошибок ' + failed.length);
await browser.close();
if (failed.length) process.exit(1);
