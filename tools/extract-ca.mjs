/* CA-only traces from mmCIF for the molecular-machines lesson. */
import fs from 'fs';
import zlib from 'zlib';

function parseCifAtoms(text) {
  const lines = text.split(/\r?\n/);
  let cols = null;
  let inLoop = false;
  const atoms = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('loop_')) { cols = []; inLoop = true; continue; }
    if (inLoop && line.startsWith('_')) {
      if (cols && !line.startsWith('_atom_site.')) { inLoop = false; cols = null; }
      else if (cols) cols.push(line.trim());
      continue;
    }
    if (!cols || !cols.length || !cols[0].startsWith('_atom_site.')) continue;
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) {
      if (line.startsWith('#') || line.startsWith('_') || line.startsWith('loop_')) { inLoop = false; cols = null; }
      continue;
    }
    const f = line.trim().split(/\s+/);
    if (f.length < cols.length) continue;
    const get = (name) => f[cols.indexOf(name)];
    const atom = get('_atom_site.auth_atom_id') || get('_atom_site.label_atom_id');
    if (atom !== 'CA') continue;
    const alt = get('_atom_site.label_alt_id');
    if (alt && alt !== '.' && alt !== '?' && alt !== 'A') continue;
    const model = get('_atom_site.pdbx_PDB_model_num');
    if (model && model !== '.' && model !== '?' && model !== '1') continue;
    const chain = get('_atom_site.auth_asym_id');
    const seq = parseInt(get('_atom_site.auth_seq_id'), 10);
    const resn = get('_atom_site.auth_comp_id');
    const x = parseFloat(get('_atom_site.Cartn_x'));
    const y = parseFloat(get('_atom_site.Cartn_y'));
    const z = parseFloat(get('_atom_site.Cartn_z'));
    if (!chain || !isFinite(x)) continue;
    atoms.push({ chain, seq, resn, x, y, z });
  }
  return atoms;
}

function group(atoms) {
  const chains = {};
  const order = [];
  for (const a of atoms) {
    if (!chains[a.chain]) { chains[a.chain] = []; order.push(a.chain); }
    chains[a.chain].push([round(a.x), round(a.y), round(a.z), a.seq]);
  }
  return { chains, order };
}
function round(v) { return Math.round(v * 1000) / 1000; }

const file = process.argv[2];
const out = process.argv[3];
const buf = fs.readFileSync(file);
const text = zlib.gunzipSync(buf).toString('utf8');
const atoms = parseCifAtoms(text);
const g = group(atoms);
const stats = {};
for (const id of g.order) {
  const pts = g.chains[id];
  let bonds = 0, breaks = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    if (pts[i][3] === pts[i - 1][3] + 1 && d < 4.5) bonds++;
    else breaks++;
  }
  stats[id] = { n: pts.length, bonds, breaks };
}
console.log(file, 'CA', atoms.length, 'chains', g.order.length);
console.log(g.order.map(id => id + ':' + stats[id].n).join(' '));
const payload = { chains: {} };
for (const id of g.order) payload.chains[id] = g.chains[id].map(p => [p[0], p[1], p[2], p[3]]);
fs.mkdirSync(out.substring(0, out.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload));
console.log('wrote', out, fs.statSync(out).size);
