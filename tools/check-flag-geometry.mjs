/* Проверка сборки жгутикового мотора: статоры в мембране, касаются C-кольца, ничего не висит и не пересекается. */
import fs from 'fs';
import zlib from 'zlib';

const pack = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../assets/machines/data/flag-7cgo.json.gz', import.meta.url))));
const g = pack.geometry;
function groupOf(ch) {
  if (ch.unit !== undefined) return 'stator' + ch.unit;
  if (ch.sub === 'C') return 'Cring';
  if (/^CT/.test(ch.id)) return 'tail';
  if (ch.sub === 'LP') return 'LP';
  return 'body';
}
const groups = {};
pack.chains.forEach((ch) => { (groups[groupOf(ch)] = groups[groupOf(ch)] || []).push(...ch.xyz); });
function minDist(A, B) {
  const cell = 12, grid = new Map();
  B.forEach((p) => {
    const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell) + ',' + Math.floor(p[2] / cell);
    (grid.get(k) || grid.set(k, []).get(k)).push(p);
  });
  let best = Infinity;
  A.forEach((p) => {
    const i = Math.floor(p[0] / cell), j = Math.floor(p[1] / cell), k = Math.floor(p[2] / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const list = grid.get((i + a) + ',' + (j + b) + ',' + (k + c));
      if (!list) continue;
      list.forEach((q) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < best) best = d; });
    }
  });
  return best;
}
let fail = 0;
const ok = (name, cond, info) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fail++; };
const stators = Object.keys(groups).filter((k) => k.startsWith('stator'));
ok('11 статоров', stators.length === 11, String(stators.length));
const names = Object.keys(groups);
let clash = Infinity, pair = '';
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  if ((names[i] === 'tail' && names[j] === 'Cring') || (names[i] === 'Cring' && names[j] === 'tail')) continue;
  if ((names[i] === 'tail' && names[j] === 'body') || (names[i] === 'body' && names[j] === 'tail')) continue;
  const d = minDist(groups[names[i]], groups[names[j]]);
  if (d < clash) { clash = d; pair = names[i] + '–' + names[j]; }
}
ok('нет пересечений между телами (Cα–Cα ≥ 3,5 Å)', clash >= 3.5, clash.toFixed(1) + ' Å, ' + pair);
const motA = pack.chains.filter((c) => c.sub === 'MotA');
const cr = groups.Cring;
const touch = stators.map((s) => minDist(pack.chains.filter((c) => c.unit === +s.slice(6) && c.sub === 'MotA').flatMap((c) => c.xyz), cr));
ok('MotA касается C-кольца (≤ 12 Å)', Math.max(...touch) <= 12, touch.map((d) => d.toFixed(1)).join(' '));
const contactPts = [];
motA.forEach((c) => c.xyz.forEach((p) => { if (minDist([p], cr) < 12) contactPts.push(Math.hypot(p[0], p[1])); }));
const cMean = contactPts.reduce((a, b) => a + b, 0) / contactPts.length;
ok('контакт на радиусе 19–23 нм', cMean > 190 && cMean < 230, (cMean / 10).toFixed(1) + ' нм');
const aZ = motA.flatMap((c) => c.xyz.map((p) => p[2]));
const tm = motA.flatMap((c) => c.xyz).filter((p) => Math.abs(p[2] - g.imZ) < 20).length;
ok('MotA пересекает внутреннюю мембрану', Math.min(...aZ) < g.imZ - 15 && Math.max(...aZ) > g.imZ + 15 && tm > 100, 'z ' + Math.min(...aZ).toFixed(0) + '…' + Math.max(...aZ).toFixed(0) + ', IM ' + g.imZ);
const pgb = pack.chains.filter((c) => c.sub === 'MotB' && c.schematic);
const pgbEnd = pgb.map((c) => Math.min(...c.xyz.map((p) => p[2])));
ok('MotB доходит до пептидогликана', pgbEnd.every((z) => Math.abs(z - g.pgZ) < 15), 'PG ' + g.pgZ + ', min z ' + Math.min(...pgbEnd).toFixed(0) + '…' + Math.max(...pgbEnd).toFixed(0));
// connectivity: each schematic piece is attached to something
const tails = pack.chains.filter((c) => /^CT/.test(c.id));
const tailTop = tails.map((c) => minDist([c.xyz[0]], groups.body));
const tailBot = tails.map((c) => minDist([c.xyz[c.xyz.length - 1]], cr));
ok('хвосты FliF держат C-кольцо (оба конца ≤ 10 Å)', Math.max(...tailTop, ...tailBot) <= 10, Math.max(...tailTop).toFixed(1) + ' / ' + Math.max(...tailBot).toFixed(1));
let gaps = 0;
pack.chains.filter((c) => c.schematic).forEach((c) => { for (let i = 1; i < c.xyz.length; i++) { const a = c.xyz[i - 1], b = c.xyz[i]; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d > 4.5 || d < 2.8) gaps++; } });
ok('схемные цепи без разрывов', gaps === 0, String(gaps));
const pb = pack.chains.filter((c) => c.sub === 'MotB' && c.schematic).map((c) => {
  const sib = pack.chains.find((d) => d.id === c.id.slice(0, -1));
  const a = sib.xyz[sib.xyz.length - 1], b = c.xyz[0];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
});
ok('линкер MotB продолжает цепь 6YKM', Math.max(...pb) < 4.6, Math.max(...pb).toFixed(2) + ' Å');
console.log('geometry', JSON.stringify(g));
process.exit(fail ? 1 : 0);
