/* Воркер минимизации: сначала RDKit в Pyodide, иначе учебное поле JS-UFF. */
importScripts('ff.js');

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.mjs';
let pyodide = null;

function sdfOf(mol) {
  const a = mol.atoms, b = mol.bonds || [];
  let s = 'min\n  min\n\n';
  s += String(a.length).padStart(3) + String(b.length).padStart(3) + '  0  0  0  0  0  0  0  0999 V2000\n';
  a.forEach(at => {
    const el = at.el.length === 1 ? at.el + ' ' : at.el;
    s += Number(at.x).toFixed(4).padStart(10) + Number(at.y).toFixed(4).padStart(10) + Number(at.z).toFixed(4).padStart(10) + ' ' + el.padEnd(3, ' ') + ' 0  0  0  0  0  0  0  0  0  0  0  0\n';
  });
  b.forEach(bond => {
    s += String(bond.i + 1).padStart(3) + String(bond.j + 1).padStart(3) + String(bond.order || 1).padStart(3) + '  0  0  0  0\n';
  });
  return s + 'M  END\n';
}

const PY = `
from rdkit import Chem
from rdkit.Chem import AllChem
METALS = {"Li","Na","K","Rb","Cs","Cu","Zn","Ni","Fe"}
def _ff(m):
    props = AllChem.MMFFGetMoleculeProperties(m, mmffVariant="MMFF94")
    if props is not None:
        ff = AllChem.MMFFGetMoleculeForceField(m, props)
        if ff is not None:
            return ff, "MMFF94"
    ff = AllChem.UFFGetMoleculeForceField(m)
    if ff is None:
        return None, ""
    return ff, "UFF"
def load(sdf):
    m = Chem.MolFromMolBlock(sdf, removeHs=False, sanitize=False)
    if m is None:
        raise ValueError("sdf")
    try:
        Chem.SanitizeMol(m)
    except Exception:
        Chem.SanitizeMol(m, sanitizeOps=Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_PROPERTIES)
    return m
def coords(m):
    conf = m.GetConformer()
    out = []
    for i in range(m.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        out.append([p.x, p.y, p.z])
    return out
def step(sdf, n):
    m = load(sdf)
    ff, name = _ff(m)
    if ff is None:
        raise ValueError("no ff")
    e0 = ff.CalcEnergy()
    ff.Minimize(maxIts=int(n))
    e1 = ff.CalcEnergy()
    return coords(m), e0, e1, name
import json
def step_json(sdf, n):
    c, e0, e1, name = step(sdf, n)
    return json.dumps({"coords": c, "e0": e0, "e1": e1, "ff": name})
`;

function jsRun(mol, opt) {
  const trace = [];
  const res = self.SupraFF.minimize(mol, opt || {}, (s) => {
    trace.push(s.energy);
    if (s.step % 4 === 0) self.postMessage({ type: 'step', step: s.step, energy: s.energy, coords: s.coords, engine: 'js' });
  });
  let bind = null;
  if (opt && opt.bind) {
    try { bind = self.SupraFF.binding(mol, opt); } catch (e) { bind = null; }
  }
  self.postMessage({
    type: 'done', engine: 'js', ff: 'JS-UFF',
    energy0: res.energy0, energy1: res.energy1, rmsd: res.rmsd,
    coords: res.coords, trace: res.trace, bind: bind, note: fallbackReason
  });
}

async function rdkitRun(mol, opt) {
  self.postMessage({ type: 'status', text: 'Загружаю Pyodide и RDKit (это один раз, около 10 МБ)…' });
  if (!pyodide) {
    const mod = await import(PYODIDE);
    pyodide = await mod.loadPyodide({ indexURL: PYODIDE.replace(/pyodide\.mjs$/, '') });
    await pyodide.loadPackage('rdkit');
    pyodide.runPython(PY);
  }
  const sdf = sdfOf(mol);
  pyodide.globals.set('sdf_in', sdf);
  const chunks = 8;
  const per = 12;
  let last = null;
  const trace = [];
  for (let i = 0; i < chunks; i++) {
    const raw = String(pyodide.runPython('step_json(sdf_in, ' + per + ')'));
    const trip = JSON.parse(raw);
    const flat = trip.coords;
    last = { coords: flat, e0: i === 0 ? trip.e0 : last.e0, e1: trip.e1, ff: trip.ff };
    trace.push(trip.e1);
    // следующий шаг с новых координат
    pyodide.globals.set('sdf_in', sdfOf({ atoms: mol.atoms.map((a, k) => Object.assign({}, a, { x: flat[k][0], y: flat[k][1], z: flat[k][2] })), bonds: mol.bonds }));
    self.postMessage({ type: 'step', step: (i + 1) * per, energy: e1, coords: flat, engine: 'rdkit' });
  }
  let bind = null;
  if (opt && opt.bind) {
    try { bind = self.SupraFF.binding({ atoms: mol.atoms.map((a, k) => Object.assign({}, a, { x: last.coords[k][0], y: last.coords[k][1], z: last.coords[k][2] })), bonds: mol.bonds }, { steps: 24 }); } catch (e) { bind = null; }
  }
  const x0 = mol.atoms.map(a => [a.x, a.y, a.z]);
  let acc = 0;
  last.coords.forEach((p, i) => { const dx = p[0] - x0[i][0], dy = p[1] - x0[i][1], dz = p[2] - x0[i][2]; acc += dx * dx + dy * dy + dz * dz; });
  self.postMessage({
    type: 'done', engine: 'rdkit', ff: last.ff,
    energy0: last.e0, energy1: last.e1,
    rmsd: Math.sqrt(acc / Math.max(1, last.coords.length)),
    coords: last.coords, trace: trace, bind: bind
  });
}

let fallbackReason = '';
self.onmessage = async (ev) => {
  const data = ev.data || {};
  const mol = data.mol;
  const opt = data.opt || {};
  if (!mol || !mol.atoms) {
    self.postMessage({ type: 'error', text: 'Нет координат.' });
    return;
  }
  if (data.engine === 'js' || mol.atoms.length > 320) {
    if (mol.atoms.length > 320) self.postMessage({ type: 'status', text: 'Модель большая — считаю встроенным полем, без RDKit.' });
    jsRun(mol, opt);
    return;
  }
  try {
    await rdkitRun(mol, opt);
  } catch (err) {
    fallbackReason = (err && (err.message || err.toString())) || 'ошибка';
    self.postMessage({ type: 'status', text: 'RDKit не открылся (' + fallbackReason + '). Считаю встроенным полем.' });
    jsRun(mol, opt);
  }
};
