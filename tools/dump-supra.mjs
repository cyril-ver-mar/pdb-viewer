/* Снимает учебные модели в JSON для tools/minimize_supra.py. */
import fs from 'fs';
import vm from 'vm';

const root = new URL('../', import.meta.url);
function load(rel, box) {
  vm.runInContext(fs.readFileSync(new URL(rel, root), 'utf8'), box);
}
const box = { console, Math, URL, TextEncoder };
box.window = box;
box.self = box;
box.globalThis = box;
vm.createContext(box);
load('assets/supra/geom.js', box);
const G = box.SupraGeom;

const jobs = [];
function add(st) {
  const built = G.build(st);
  if (built.nan || built.atomCount > 280) return;
  jobs.push({
    key: G.keyOf(Object.assign({
      c: 'crown', n: 6, het: 'O', ann: '0', sub: 'H', guest: 'none', sandwich: '0',
      arm: 2, donor: 'OMe', pivot: 'N', pod: 'glyme', podN: 4, crypt: '222', iso: 'in',
      conf: 'cone', upper: 'tBu', lower: 'OH', rim: 'OMe', chir: 'p', mod: 'OH',
      other: 'porphin', topo: 'cat2', aza: 'cyclen', azaMetal: 'none', metal: 'none', sph: 'full'
    }, st)),
    name: built.name,
    sdf: G.sdfOf(built.mol),
    el: built.mol.atoms.map(a => a.el),
    role: built.mol.atoms.map(a => a.role || 'host')
  });
}
for (const n of [4, 5, 6, 7, 8]) add({ c: 'crown', n, guest: 'none' });
add({ c: 'crown', n: 6, guest: 'K' });
add({ c: 'crown', n: 5, guest: 'Na' });
add({ c: 'crown', n: 4, guest: 'Li' });
add({ c: 'crown', n: 4, guest: 'Na', sandwich: '1' });
add({ c: 'crown', n: 6, het: 'S' });
add({ c: 'crown', n: 6, het: 'NH' });
add({ c: 'crown', n: 6, ann: '2', guest: 'K' });
add({ c: 'lariat', n: 6, pivot: 'N', arm: 2, donor: 'OMe', guest: 'Na' });
add({ c: 'podand', pod: 'glyme', podN: 4 });
add({ c: 'podand', pod: 'glyme', podN: 5 });
add({ c: 'podand', pod: 'tripod', podN: 2 });
for (const crypt of ['111', '211', '221', '222', '322']) add({ c: 'crypt', crypt, iso: 'in', guest: 'none' });
add({ c: 'crypt', crypt: '222', iso: 'in', guest: 'K' });
add({ c: 'crypt', crypt: '222', iso: 'out', guest: 'none' });
add({ c: 'spherand', sph: 'full', guest: 'Li' });
add({ c: 'spherand', sph: 'hemi' });
for (const n of [5, 6, 7, 8]) add({ c: 'cb', n, guest: 'none' });
add({ c: 'cb', n: 7, guest: 'Fc' });
add({ c: 'cb', n: 7, guest: 'AdNH3' });
add({ c: 'cb', n: 7, guest: 'MV' });
add({ c: 'cd', n: 6, mod: 'OH' });
add({ c: 'cd', n: 7, mod: 'OH' });
add({ c: 'cd', n: 8, mod: 'OH' });
add({ c: 'cd', n: 7, mod: 'OH', guest: 'AdCOO' });
add({ c: 'cd', n: 7, mod: 'Me' });
add({ c: 'calix', n: 4, upper: 'tBu', lower: 'OH', conf: 'cone' });
add({ c: 'calix', n: 4, upper: 'H', conf: 'cone' });
add({ c: 'calix', n: 4, upper: 'tBu', conf: 'pcone' });
add({ c: 'calix', n: 4, upper: 'tBu', lower: 'crown' });
add({ c: 'calix', n: 6, upper: 'H' });
add({ c: 'calix', n: 8, upper: 'H' });
add({ c: 'pillar', n: 5, rim: 'OMe', guest: 'BrBu' });
add({ c: 'pillar', n: 6, rim: 'OMe' });
add({ c: 'aza', aza: 'cyclen', azaMetal: 'none' });
add({ c: 'aza', aza: 'cyclen', azaMetal: 'Cu' });
add({ c: 'aza', aza: 'cyclam', azaMetal: 'Ni' });
add({ c: 'other', other: 'porphin', metal: 'none' });
add({ c: 'other', other: 'porphin', metal: 'Zn' });
add({ c: 'other', other: 'bluebox' });
add({ c: 'other', other: 'ctv' });
add({ c: 'other', other: 'resorcin' });
add({ c: 'other', other: 'cavitand' });
add({ c: 'topo', topo: 'cat2' });
add({ c: 'topo', topo: 'rot' });
add({ c: 'topo', topo: 'trefoil' });
add({ c: 'topo', topo: 'borro' });
add({ c: 'topo', topo: 'penta' });

load('assets/machines/engine.js', box);
load('assets/machines/builds.js', box);
const MM = box.MM;
function machine(key, st) {
  const rig = MM.builds[key](st);
  jobs.push({
    key: 'machine|' + key,
    name: key,
    constrained: true,
    el: rig.atoms.map(a => a.elem || 'C'),
    role: rig.atoms.map(() => 'host'),
    sdf: null,
    xyz: rig.atoms.map(a => [a.p[0], a.p[1], a.p[2]]),
    bonds: rig.bonds.map(b => [b.a, b.b, b.order || 1])
  });
}
machine('shuttle', { x: 0, ox: false, playing: false, speed: 1, tempC: 25, dwell: 0, v: 0 });
machine('catenane', { angle: 0, cu2: false, playing: false, speed: 1, dwell: 0 });
machine('muscle', { part: 'muscle', ext: 0.5, target: 0.5, level: 0, stage: 0, u: 0, collected: 0, playing: false, speed: 1 });

const out = process.argv[2] || '/tmp/supra-dump.json';
fs.writeFileSync(out, JSON.stringify(jobs));
console.log('dumped', jobs.length, 'to', out);
