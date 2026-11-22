import { chromium, devices } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:18431/';
const OUT = '/opt/cursor/artifacts/';
const phone = devices['Pixel 7'];
const desk = { viewport: { width: 1280, height: 800 } };
const SECTIONS = [
  ['interactions.html', 'Физика взаимодействий'],
  ['symmetry.html', 'Симметрия'],
  ['eos.html', 'Уравнения состояния'],
  ['lattice.html', 'Физика кристаллов'],
  ['machines.html', 'Молекулярные машины'],
  ['supra.html', 'Супрамолекулярная химия']
];

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const fails = [];
function check(name, ok, extra) {
  console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? ' ' + extra : ''));
  if (!ok) fails.push(name + (extra ? ' ' + extra : ''));
}

async function open(label, device, path) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { ctx, page, errs, status: res && res.status() };
}

const home = await open('phone home', phone, '');
await home.page.waitForSelector('#secHome a.seccard');
const cards = await home.page.$$eval('#secHome a.seccard', els => els.map(a => ({
  href: a.getAttribute('href'),
  title: a.querySelector('b') && a.querySelector('b').textContent,
  desc: a.querySelector('.desc') && a.querySelector('.desc').textContent,
  box: a.getBoundingClientRect().width
})));
check('на главной шесть карточек', cards.length === 6, String(cards.length));
for (const [href, title] of SECTIONS) {
  const c = cards.find(x => x.href === href);
  check('карточка ' + title, !!(c && c.title === title && c.desc && c.desc.length > 8 && c.box > 40), c && c.title);
}
const head = await home.page.$eval('.sections h2', el => el.textContent);
check('заголовок Разделы', head.trim() === 'Разделы', head);
await home.page.screenshot({ path: OUT + 'nav-mobile.png', fullPage: true });
check('главная без ошибок консоли', home.errs.length === 0, home.errs.join(' | '));

for (const [href] of SECTIONS) {
  const r = await home.page.request.get(BASE + href);
  check(href + ' 200', r.status() === 200, String(r.status()));
}
await home.ctx.close();

const deskHome = await open('desk home', desk, '');
await deskHome.page.waitForSelector('#secHome a.seccard');
const nDesk = await deskHome.page.locator('#secHome a.seccard').count();
const wide = await deskHome.page.$eval('#secHome', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
check('десктоп: шесть карточек', nDesk === 6, String(nDesk));
check('десктоп: три колонки', wide >= 3, String(wide));
await deskHome.ctx.close();

// прямая ссылка ученика: ни «Разделов», ни «← Каталог»; из каталога (&nav=1) — оба есть
const molDirect = await open('phone mol direct', phone, '?pdb=structures/Белки/1crn.pdb&style=stick');
await molDirect.page.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model, { timeout: 20000 });
check('прямая ссылка: нет «Разделы» и «← Каталог»', await molDirect.page.locator('#bSecs, #bHome').count() === 0);
await molDirect.ctx.close();
const mol = await open('phone mol', phone, '?pdb=structures/Белки/1crn.pdb&style=stick&nav=1');
await mol.page.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model, { timeout: 20000 });
await mol.page.click('#bSecs');
await mol.page.waitForSelector('#sheetSecs.open a.seccard');
const sheetN = await mol.page.locator('#sheetSecs a.seccard').count();
check('меню Разделы: шесть ссылок', sheetN === 6, String(sheetN));
check('молекула без ошибок консоли', mol.errs.length === 0, mol.errs.slice(0, 3).join(' | '));
await mol.ctx.close();

const teacher = await open('teacher', phone, 'teacher.html');
const tLinks = await teacher.page.$$eval('header nav.seclist a', els => els.map(a => a.getAttribute('href')));
check('учитель: те же шесть', SECTIONS.every(([h]) => tLinks.includes(h)) && tLinks.length === 6, tLinks.join(','));
await teacher.ctx.close();

for (const [href] of SECTIONS) {
  const p = await open(href, phone, href);
  await p.page.waitForTimeout(400);
  const back = await p.page.locator('a[href="./"], a[href="index.html"]').first().innerText().catch(() => '');
  check(href + ' ← Каталог', back.includes('Каталог'), JSON.stringify(back));
  check(href + ' без ошибок консоли', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.ctx.close();
}

const cr = await open('crambin', phone, '?pdb=structures/%D0%91%D0%B5%D0%BB%D0%BA%D0%B8/1crn.pdb&style=ballstick');
await cr.page.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model, { timeout: 20000 });
const crInfo = await cr.page.evaluate(() => {
  const atoms = pdbViewer.mv.model.selectedAtoms({});
  const phe = atoms.filter(a => a.resn === 'PHE' && String(a.atom).trim() === 'CG');
  const tyr = atoms.filter(a => a.resn === 'TYR' && String(a.atom).trim() === 'CG');
  const idOf = new Map();
  atoms.forEach((a, i) => idOf.set(a.index, i));
  function ringDoubles(cg) {
    const names = ['CG', 'CD1', 'CE1', 'CZ', 'CE2', 'CD2'];
    const by = {};
    atoms.filter(a => a.resn === cg.resn && a.resi === cg.resi && a.chain === cg.chain).forEach(a => { by[String(a.atom).trim()] = a; });
    let n2 = 0;
    for (let k = 0; k < names.length; k++) {
      const a = by[names[k]], b = by[names[(k + 1) % names.length]];
      if (!a || !b) return -1;
      const slot = a.bonds.indexOf(b.index);
      if (slot >= 0 && a.bondOrder[slot] === 2) n2++;
    }
    return n2;
  }
  const viewer = pdbViewer.mv.viewer;
  const resi = phe[0] && phe[0].resi;
  viewer.zoomTo({ resn: 'PHE', resi: resi });
  viewer.zoom(1.4);
  viewer.render();
  return { phe: phe.map(ringDoubles), tyr: tyr.map(ringDoubles) };
});
check('крамбин PHE по 3 двойных', crInfo.phe.length > 0 && crInfo.phe.every(n => n === 3), JSON.stringify(crInfo.phe));
check('крамбин TYR по 3 двойных', crInfo.tyr.length > 0 && crInfo.tyr.every(n => n === 3), JSON.stringify(crInfo.tyr));
await cr.page.screenshot({ path: OUT + 'bonds-crambin.png' });
await cr.ctx.close();

const caf = await open('caffeine', phone, '?pdb=structures/' + encodeURIComponent('Малые молекулы/caffeine.sdf') + '&style=ballstick');
await caf.page.waitForFunction(() => window.pdbViewer && pdbViewer.mv && pdbViewer.mv.model, { timeout: 20000 });
const cafInfo = await caf.page.evaluate(() => {
  const atoms = pdbViewer.mv.model.selectedAtoms({});
  let doubles = 0;
  atoms.forEach(a => (a.bondOrder || []).forEach(o => { if (o === 2) doubles++; }));
  pdbViewer.mv.viewer.zoom(1.6);
  pdbViewer.mv.viewer.render();
  return { n: atoms.length, doubles: doubles / 2 };
});
check('кофеин хранит порядки SDF', cafInfo.n === 24 && cafInfo.doubles >= 4, JSON.stringify(cafInfo));
await caf.page.screenshot({ path: OUT + 'bonds-caffeine.png' });
await caf.ctx.close();

async function modelRings(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#viewer');
    const viewer = el && el.viewer3d;
    if (!viewer) return { err: 'no viewer' };
    const model = viewer.getModel();
    const atoms = (model.atoms && model.atoms.length) ? model.atoms : model.selectedAtoms({});
    const idOf = new Map();
    atoms.forEach((a, i) => idOf.set(a.index != null ? a.index : i, i));
    const nbrs = atoms.map(a => (a.bonds || []).map(b => idOf.has(b) ? idOf.get(b) : -1).filter(j => j >= 0));
    const orderOf = (i, j) => {
      const jj = atoms[j].index != null ? atoms[j].index : j;
      let k = atoms[i].bonds.indexOf(jj);
      if (k < 0) k = atoms[i].bonds.indexOf(j);
      return k < 0 ? 1 : (atoms[i].bondOrder[k] || 1);
    };
    const rings = [];
    const seen = new Set();
    for (let s = 0; s < atoms.length && rings.length < 40; s++) {
      const stack = [[s, [s]]];
      let guard = 0;
      while (stack.length && guard < 8000) {
        guard++;
        const cur = stack.pop();
        const v = cur[0], path = cur[1];
        if (path.length > 6) continue;
        for (const w of nbrs[v]) {
          if (w === s && path.length === 6) {
            const key = path.slice().sort((a, b) => a - b).join(',');
            if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
          } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
        }
      }
    }
    const carbon = rings.filter(r => r.every(i => String(atoms[i].elem || '').toUpperCase() === 'C'));
    return carbon.map(r => {
      let n2 = 0;
      for (let k = 0; k < 6; k++) if (orderOf(r[k], r[(k + 1) % 6]) === 2) n2++;
      return n2;
    });
  });
}

const bz = await open('benzene', phone, 'interactions.html?type=pp&preset=pd');
await bz.page.waitForFunction(() => document.querySelector('#viewer') && document.querySelector('#viewer').viewer3d, { timeout: 15000 });
await bz.page.waitForTimeout(500);
const bzRings = await modelRings(bz.page);
check('бензол: два кольца по 3 двойных', bzRings.length >= 2 && bzRings.every(n => n === 3), JSON.stringify(bzRings));
await bz.page.screenshot({ path: OUT + 'bonds-benzene.png' });
check('бензол без ошибок консоли', bz.errs.length === 0, bz.errs.slice(0, 2).join(' | '));
await bz.ctx.close();

const cal = await open('calix', phone, 'supra.html?c=calix&n=4&upper=tBu');
await cal.page.waitForFunction(() => window.supraViewer && supraViewer.getModel && supraViewer.getModel(), { timeout: 20000 });
await cal.page.waitForTimeout(400);
const calRings = await cal.page.evaluate(() => {
  const model = supraViewer.getModel();
  const atoms = model.atoms || model.selectedAtoms({});
  const idOf = new Map();
  atoms.forEach((a, i) => idOf.set(a.index != null ? a.index : i, i));
  const nbrs = atoms.map(a => (a.bonds || []).map(b => idOf.has(b) ? idOf.get(b) : -1).filter(j => j >= 0));
  const orderOf = (i, j) => {
    const jj = atoms[j].index != null ? atoms[j].index : j;
    let k = atoms[i].bonds.indexOf(jj);
    if (k < 0) k = atoms[i].bonds.indexOf(j);
    return k < 0 ? 1 : (atoms[i].bondOrder[k] || 1);
  };
  const rings = [];
  const seen = new Set();
  for (let s = 0; s < atoms.length && rings.length < 20; s++) {
    if (String(atoms[s].elem).toUpperCase() !== 'C') continue;
    const stack = [[s, [s]]];
    let guard = 0;
    while (stack.length && guard < 8000) {
      guard++;
      const cur = stack.pop();
      const v = cur[0], path = cur[1];
      if (path.length > 6) continue;
      for (const w of nbrs[v]) {
        if (String(atoms[w].elem).toUpperCase() !== 'C') continue;
        if (w === s && path.length === 6) {
          const key = path.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
        } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
      }
    }
  }
  return rings.map(r => {
    let n2 = 0;
    for (let k = 0; k < 6; k++) if (orderOf(r[k], r[(k + 1) % 6]) === 2) n2++;
    return n2;
  });
});
check('каликс[4]арен: 4 кольца по 3', calRings.filter(n => n === 3).length >= 4, JSON.stringify(calRings));
await cal.page.locator('#viewer').screenshot({ path: OUT + 'bonds-calix.png' });
await cal.ctx.close();

const crown = await open('crown', phone, 'supra.html?c=crown&n=6&ann=2');
await crown.page.waitForFunction(() => window.supraViewer && supraViewer.getModel && supraViewer.getModel(), { timeout: 20000 });
await crown.page.waitForTimeout(400);
const crownRings = await crown.page.evaluate(() => {
  const atoms = supraViewer.getModel().atoms;
  const idOf = new Map();
  atoms.forEach((a, i) => idOf.set(a.index != null ? a.index : i, i));
  const nbrs = atoms.map(a => (a.bonds || []).map(b => idOf.has(b) ? idOf.get(b) : -1).filter(j => j >= 0));
  const orderOf = (i, j) => {
    const jj = atoms[j].index != null ? atoms[j].index : j;
    let k = atoms[i].bonds.indexOf(jj);
    if (k < 0) k = atoms[i].bonds.indexOf(j);
    return k < 0 ? 1 : (atoms[i].bondOrder[k] || 1);
  };
  const rings = [];
  const seen = new Set();
  for (let s = 0; s < atoms.length && rings.length < 10; s++) {
    const stack = [[s, [s]]];
    let g = 0;
    while (stack.length && g < 6000) {
      g++;
      const cur = stack.pop();
      const v = cur[0], path = cur[1];
      if (path.length > 6) continue;
      for (const w of nbrs[v]) {
        if (w === s && path.length === 6 && path.every(i => String(atoms[i].elem).toUpperCase() === 'C')) {
          const key = path.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
        } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
      }
    }
  }
  return rings.map(r => {
    let n2 = 0;
    for (let k = 0; k < 6; k++) if (orderOf(r[k], r[(k + 1) % 6]) === 2) n2++;
    return n2;
  });
});
check('дибензо-18-краун-6: 2 кольца по 3', crownRings.filter(n => n === 3).length >= 2, JSON.stringify(crownRings));
await crown.page.locator('#viewer').screenshot({ path: OUT + 'bonds-crown.png' });
await crown.ctx.close();

const fer = await open('feringa', phone, 'machines.html?m=feringa');
await fer.page.waitForTimeout(600);
const ferRings = await fer.page.evaluate(() => {
  const m = MM.machines.find(x => x.id === 'feringa');
  const scene = m.scene(m.init());
  const atoms = scene.atoms;
  const bonds = scene.bonds;
  const nbrs = atoms.map(() => []);
  bonds.forEach(b => { nbrs[b.a].push(b.b); nbrs[b.b].push(b.a); });
  const order = (i, j) => {
    const b = bonds.find(x => (x.a === i && x.b === j) || (x.a === j && x.b === i));
    return b ? (b.bondOrder || b.order || 1) : 1;
  };
  const rings = [];
  const seen = new Set();
  for (let s = 0; s < atoms.length && rings.length < 10; s++) {
    const stack = [[s, [s]]];
    let g = 0;
    while (stack.length && g < 4000) {
      g++;
      const cur = stack.pop();
      const v = cur[0], path = cur[1];
      if (path.length > 6) continue;
      for (const w of nbrs[v]) {
        if (w === s && path.length === 6) {
          const key = path.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
        } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
      }
    }
  }
  return rings.map(r => {
    let n2 = 0;
    for (let k = 0; k < 6; k++) if (order(r[k], r[(k + 1) % 6]) === 2) n2++;
    return n2;
  });
});
check('Феринга: кольца по 3 двойных', ferRings.length >= 2 && ferRings.every(n => n === 3), JSON.stringify(ferRings));
const ferBox = fer.page.locator('.viewer, .stage, canvas').first();
await fer.page.screenshot({ path: OUT + 'bonds-feringa.png' });
check('Феринга без ошибок консоли', fer.errs.length === 0, fer.errs.slice(0, 2).join(' | '));
await fer.ctx.close();

const sym = await open('sym-benzene', phone, 'symmetry.html?mol=C6H6&pg=D6h');
await sym.page.waitForFunction(() => window.__symStage && __symStage._model, { timeout: 15000 });
const symRings = await sym.page.evaluate(() => {
  const atoms = __symStage._model.atoms || __symStage._model.selectedAtoms({});
  const idOf = new Map();
  atoms.forEach((a, i) => idOf.set(a.index != null ? a.index : i, i));
  const nbrs = atoms.map(a => (a.bonds || []).map(b => idOf.has(b) ? idOf.get(b) : -1).filter(j => j >= 0));
  const orderOf = (i, j) => {
    const jj = atoms[j].index != null ? atoms[j].index : j;
    let k = atoms[i].bonds.indexOf(jj);
    if (k < 0) k = atoms[i].bonds.indexOf(j);
    return k < 0 ? 0 : (atoms[i].bondOrder[k] || 1);
  };
  const rings = [];
  const seen = new Set();
  for (let s = 0; s < atoms.length; s++) {
    const stack = [[s, [s]]];
    let g = 0;
    while (stack.length && g < 2000) {
      g++;
      const cur = stack.pop();
      const v = cur[0], path = cur[1];
      if (path.length > 6) continue;
      for (const w of nbrs[v]) {
        if (w === s && path.length === 6) {
          const key = path.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
        } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
      }
    }
  }
  return { bonds: nbrs.reduce((n, a) => n + a.length, 0) / 2, rings: rings.map(r => {
    let n2 = 0;
    for (let k = 0; k < 6; k++) if (orderOf(r[k], r[(k + 1) % 6]) === 2) n2++;
    return n2;
  }) };
});
check('бензол в симметрии: 3 двойных', symRings.rings.length === 1 && symRings.rings[0] === 3, JSON.stringify(symRings));
await sym.page.screenshot({ path: OUT + 'bonds-sym-benzene.png' });
await sym.ctx.close();

const c60 = await open('c60', phone, 'symmetry.html?mol=C60&pg=Ih');
await c60.page.waitForFunction(() => window.__symStage && __symStage._model && __symStage._model.atoms && __symStage._model.atoms.length === 60, { timeout: 15000 });
const c60info = await c60.page.evaluate(() => {
  const atoms = __symStage._model.atoms;
  const idOf = new Map();
  atoms.forEach((a, i) => idOf.set(a.index != null ? a.index : i, i));
  const nbrs = atoms.map(a => (a.bonds || []).map(b => idOf.has(b) ? idOf.get(b) : -1).filter(j => j >= 0 && String(atoms[j].elem).toUpperCase() === 'C'));
  const orderOf = (i, j) => {
    const jj = atoms[j].index != null ? atoms[j].index : j;
    let k = atoms[i].bonds.indexOf(jj);
    if (k < 0) k = atoms[i].bonds.indexOf(j);
    return k < 0 ? 1 : (atoms[i].bondOrder[k] || 1);
  };
  const perAtom = nbrs.map((n, i) => n.filter(j => orderOf(i, j) === 2).length);
  const rings = [];
  const seen = new Set();
  for (let s = 0; s < atoms.length && rings.length < 40; s++) {
    const stack = [[s, [s]]];
    let g = 0;
    while (stack.length && g < 8000) {
      g++;
      const cur = stack.pop();
      const v = cur[0], path = cur[1];
      if (path.length > 6) continue;
      for (const w of nbrs[v]) {
        if (w === s && path.length === 6) {
          const key = path.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(key)) { seen.add(key); rings.push(path.slice()); }
        } else if (w > s && path.indexOf(w) < 0) stack.push([w, path.concat(w)]);
      }
    }
  }
  const counts = rings.map(r => {
    let n2 = 0;
    for (let k = 0; k < 6; k++) if (orderOf(r[k], r[(k + 1) % 6]) === 2) n2++;
    return n2;
  });
  return { atoms: atoms.length, doublesEach: perAtom.filter(n => n === 1).length, rings: counts.filter(n => n === 3).length, sample: counts.slice(0, 4) };
});
check('C60: у каждого C одна двойная, в шестиугольнике три', c60info.doublesEach === 60 && c60info.rings >= 20, JSON.stringify(c60info));
await c60.ctx.close();

await browser.close();
console.log(fails.length ? '\nFAILED ' + fails.length : '\nALL OK');
if (fails.length) process.exit(1);
