// Числовая проверка учебной модели. Запуск: node tools/test-ix-lab.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const IX = require('../assets/ix-lab/physics.js');

function check(name, cond, detail) {
  if (!cond) {
    console.error('✗', name, detail || '');
    process.exitCode = 1;
  } else console.log('✓', name, detail || '');
}
function between(v, a, b) { return v >= a && v <= b; }

const finite = (id) => {
  const p = IX.getPreset(id);
  const e = IX.evaluate(p, p.defaults);
  const m = IX.minimum(p, p.defaults);
  if (!isFinite(e.total) || !isFinite(m.total)) throw new Error(id + ' не число');
  return { e, m, p };
};

for (const p of IX.PRESETS) finite(p.id);
console.log('пресетов', IX.PRESETS.length);

const water = finite('water');
check('вода r', between(water.m.at, 2.75, 3.10), water.m.at.toFixed(2) + ' Å');
check('вода E', between(water.m.total, -25, -16), water.m.total.toFixed(1) + ' кДж/моль');
const bent = IX.evaluate(water.p, Object.assign({}, water.p.defaults, { ang: 110 })).total;
check('вода любит 180°', water.e.total < bent, water.e.total.toFixed(1) + ' < ' + bent.toFixed(1));

const ar = finite('ar');
check('Ar r', between(ar.m.at, 3.6, 4.0), ar.m.at.toFixed(2));
check('Ar E', between(ar.m.total, -1.4, -0.7), ar.m.total.toFixed(2));

const na = finite('na');
check('Na+·бензол E', between(na.m.total, -110, -90), na.m.total.toFixed(1));
check('Na+·бензол r', between(na.m.at, 2.0, 2.7), na.m.at.toFixed(2));

const pd = finite('pd');
const sw = finite('sw');
check('PD около −11', between(pd.m.total, -14, -8), pd.m.total.toFixed(1));
check('сэндвич слабее PD', sw.m.total > pd.m.total, sw.m.total.toFixed(1) + ' > ' + pd.m.total.toFixed(1));

const li = finite('li'), k = finite('k');
check('Li сильнее Na сильнее K', li.m.total < na.m.total && na.m.total < k.m.total,
  [li.m.total, na.m.total, k.m.total].map(v => v.toFixed(0)).join(' < '));

const nacl = finite('nacl');
check('NaCl r', between(nacl.m.at, 2.2, 2.6), nacl.m.at.toFixed(2));
check('NaCl E', between(nacl.m.total, -460, -360), nacl.m.total.toFixed(0));

const xi = IX.getPreset('cf3i-o');
const side = IX.evaluate(xi, Object.assign({}, xi.defaults, { ang: 100 })).total;
const lin = IX.evaluate(xi, Object.assign({}, xi.defaults, { ang: 180 })).total;
check('σ-дырка линейна', lin < side, lin.toFixed(1) + ' < ' + side.toFixed(1));

const url = IX.stateFromSearch('?type=hb&preset=water&r=2.9&ang=170');
check('URL вода', url.preset.id === 'water' && Math.abs(url.geom.r - 2.9) < 1e-6 && Math.abs(url.geom.ang - 170) < 1e-6);

if (process.exitCode) process.exit(process.exitCode);
