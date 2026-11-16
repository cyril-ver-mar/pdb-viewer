/* Проверка: длины связей и зазоры не разъезжаются по циклу каждой машины. */
import fs from 'fs';
import vm from 'vm';

const context = { console, Math, URL, TextEncoder };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const f of ['engine.js', 'builds.js', 'scenes.js']) {
  vm.runInContext(fs.readFileSync(new URL('../assets/machines/' + f, import.meta.url), 'utf8'), context);
}
const MM = context.MM;

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function components(n, bonds) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (p[i] !== i) i = p[i] = p[p[i]]; return i; };
  bonds.forEach((b) => { const A = find(b.a), B = find(b.b); if (A !== B) p[A] = B; });
  return new Set(Array.from({ length: n }, (_, i) => find(i))).size;
}
function audit(machine, part, samples) {
  let base = null;
  let worst = 0;
  let clashes = 0;
  let compChange = 0;
  for (let i = 0; i < samples.length; i++) {
    const st = machine.init();
    if (part && machine.setPart) machine.setPart(st, part);
    samples[i](st, i, samples.length);
    const sc = machine.scene(st);
    if (!base) {
      base = {
        n: sc.atoms.length,
        b: sc.bonds.map((b) => dist(sc.atoms[b.a].p, sc.atoms[b.b].p)),
        c: components(sc.atoms.length, sc.bonds)
      };
    }
    if (sc.atoms.length !== base.n || sc.bonds.length !== base.b.length) {
      throw new Error(machine.id + ' ' + part + ' atom/bond count changed');
    }
    if (components(sc.atoms.length, sc.bonds) !== base.c) compChange++;
    for (let k = 0; k < sc.bonds.length; k++) {
      const L = dist(sc.atoms[sc.bonds[k].a].p, sc.atoms[sc.bonds[k].b].p);
      worst = Math.max(worst, Math.abs(L - base.b[k]));
    }
    const bonded = new Set(sc.bonds.map((b) => (b.a < b.b ? b.a + ',' + b.b : b.b + ',' + b.a)));
    for (let a = 0; a < sc.atoms.length; a++) {
      for (let b = a + 1; b < sc.atoms.length; b++) {
        if (!bonded.has(a + ',' + b) && dist(sc.atoms[a].p, sc.atoms[b].p) < 1) clashes++;
      }
    }
  }
  const ok = worst <= 0.05 && clashes === 0 && compChange === 0;
  console.log((ok ? 'ok ' : 'FAIL '), machine.id, part || '-', 'Δbond', worst.toFixed(4), 'clashes', clashes, 'compChanges', compChange, 'frames', samples.length);
  if (!ok) process.exitCode = 1;
}
const N = 60;
const sweep = (fn) => Array.from({ length: N }, (_, i) => fn(i / (N - 1), i));
const M = MM.machines;
audit(M.find((m) => m.id === 'feringa'), '', sweep((t) => (st) => { st.seg = Math.min(3, Math.floor(t * 4)); st.u = (t * 4) % 1; }));
audit(M.find((m) => m.id === 'nanocar'), 'feringa', sweep((t) => (st) => { st.x = -6 + t * 12; }));
audit(M.find((m) => m.id === 'nanocar'), 'tour', sweep((t) => (st) => { st.x = -6 + t * 12; }));
audit(M.find((m) => m.id === 'rotaxane'), '', sweep((t) => (st) => { st.x = -5.6 + t * 11.2; st.ox = t > 0.5; }));
audit(M.find((m) => m.id === 'catenane'), '', sweep((t) => (st) => { st.angle = t * Math.PI * 2; st.cu2 = t > 0.5; }));
audit(M.find((m) => m.id === 'muscle'), 'muscle', sweep((t) => (st) => { st.ext = t; }));
audit(M.find((m) => m.id === 'muscle'), 'elevator', sweep((t) => (st) => { st.level = t; }));
audit(M.find((m) => m.id === 'muscle'), 'pump', sweep((t) => (st) => { st.stage = Math.min(3, Math.floor(t * 4)); st.u = (t * 4) % 1; }));
audit(M.find((m) => m.id === 'gears'), 'gears', sweep((t) => (st) => { st.angle = t * Math.PI * 2; }));
audit(M.find((m) => m.id === 'gears'), 'kelly', sweep((t) => (st) => { st.angle = t * Math.PI * 2; }));
audit(M.find((m) => m.id === 'gears'), 'gyro', sweep((t) => (st) => { st.angle = t * Math.PI * 2; }));
audit(M.find((m) => m.id === 'gears'), 'screw', sweep((t) => (st) => { st.angle = t * Math.PI * 4; st.shift = Math.sin(t * Math.PI * 2) * 1.2; st.driven = true; }));
audit(M.find((m) => m.id === 'bio'), 'atp', sweep((t) => (st) => { st.step = Math.min(2, Math.floor(t * 3)); st.u = (t * 3) % 1; }));
audit(M.find((m) => m.id === 'bio'), 'flag', sweep((t) => (st) => { st.phase = t * Math.PI * 2; }));
audit(M.find((m) => m.id === 'bio'), 'kinesin', sweep((t) => (st) => { st.n = Math.floor(t * 6); st.u = (t * 6) % 1; }));
if (!process.exitCode) console.log('all machines hold bond lengths and clearances');
