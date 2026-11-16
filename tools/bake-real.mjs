/* Pack CA traces of 6OQR/6OQS/6OQT and 7CGO+6YKM into small gzipped JSON. */
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };
const cent = (pts) => {
  const s = [0, 0, 0];
  pts.forEach((p) => { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
  return mul(s, 1 / pts.length);
};

function pca(pts) {
  const c = cent(pts);
  let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
  pts.forEach((p) => {
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    xx += x * x; yy += y * y; zz += z * z; xy += x * y; xz += x * z; yz += y * z;
  });
  const A = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
  function power(M) {
    let v = norm([1, 0.3, 0.2]);
    for (let i = 0; i < 32; i++) {
      const w = [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
      ];
      v = norm(w);
    }
    const Mv = [
      M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
      M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
      M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
    ];
    return { v, lam: dot(v, Mv) };
  }
  const e1 = power(A);
  const B = A.map((row, i) => row.map((val, j) => val - e1.lam * e1.v[i] * e1.v[j]));
  const e2 = power(B);
  const e3 = norm(cross(e1.v, e2.v));
  const evals = [
    { v: e1.v, l: e1.lam },
    { v: e2.v, l: Math.abs(e2.lam) },
    { v: e3, l: Math.abs(dot(e3, [A[0][0] * e3[0] + A[0][1] * e3[1] + A[0][2] * e3[2], A[1][0] * e3[0] + A[1][1] * e3[1] + A[1][2] * e3[2], A[2][0] * e3[0] + A[2][1] * e3[1] + A[2][2] * e3[2]])) }
  ];
  evals.sort((p, q) => p.l - q.l);
  return { c, small: evals[0].v, large: evals[2].v };
}

function toAxis(pts, origin, axis) {
  const z = norm(axis);
  const tmp = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = norm(cross(tmp, z));
  const y = cross(z, x);
  return pts.map((p) => {
    const d = sub(p, origin);
    return [dot(d, x), dot(d, y), dot(d, z)];
  });
}

function load(name) {
  return JSON.parse(fs.readFileSync('/tmp/ca/' + name + '.json', 'utf8'));
}
function chainPts(data, id) {
  return (data.chains[id] || []).map((p) => [p[0], p[1], p[2], p[3]]);
}

const atpRotor = new Set(['G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S']);
const atpSub = { A: 'α', B: 'α', C: 'α', D: 'β', E: 'β', F: 'β', W: 'δ', X: 'b', Y: 'b', a: 'a', G: 'γ', H: 'ε' };
'I J L M N O P Q R S'.split(' ').forEach((id) => { atpSub[id] = 'c'; });

function packATP() {
  const base = load('6OQR');
  const cIds = 'I J L M N O P Q R S'.split(' ');
  const cCents = cIds.map((id) => {
    const pts = chainPts(base, id).map((p) => p.slice(0, 3));
    return pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
  });
  const ax = pca(cCents);
  const origin = cent(cCents);
  const axis = ax.small;
  const chains = [];
  for (const id of Object.keys(base.chains)) {
    const raw = chainPts(base, id);
    const xyz = toAxis(raw.map((p) => p.slice(0, 3)), origin, axis);
    const seq = raw.map((p) => p[3]);
    chains.push({
      id, sub: atpSub[id] || id,
      role: atpRotor.has(id) ? 'rotor' : 'stator',
      xyz: xyz.map((p) => p.map((v) => Math.round(v * 100) / 100)),
      seq
    });
  }
  return {
    pdb: '6OQR', method: 'крио-ЭМ', resolution: 3.1,
    states: '6OQR, 6OQS, 6OQT',
    citation: 'Sobti M., Walshe J. L., Wu D., Ishmukhametov R., Zeng Y. C., Robinson C. V., Berry R. M., Stewart A. G. Cryo-EM structures provide insight into how E. coli F1Fo ATP synthase accommodates symmetry mismatch. Nature Communications, 2020, 11, 2615.',
    chains
  };
}

function packFlag() {
  const body = load('7CGO');
  const roles = JSON.parse(fs.readFileSync('/tmp/ca/7cgo-roles.json', 'utf8'));
  const stator = new Set(roles.stator);
  const ringIds = Object.keys(body.chains).filter((id) => /^C/.test(id) || /^E[a-h]/.test(id));
  const ringCents = ringIds.map((id) => {
    const pts = chainPts(body, id).map((p) => p.slice(0, 3));
    return pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / Math.max(1, pts.length));
  }).filter((p) => isFinite(p[0]));
  const ax = pca(ringCents);
  const origin = cent(ringCents);
  const axis = ax.small;
  const mot = load('6YKM');
  const motPts = Object.values(mot.chains).flat().map((p) => p.slice(0, 3));
  const motAx = pca(motPts);
  const motFrame = toAxis(motPts, motAx.c, motAx.small);
  const motByChain = {};
  let cursor = 0;
  for (const id of Object.keys(mot.chains)) {
    const n = mot.chains[id].length;
    motByChain[id] = motFrame.slice(cursor, cursor + n);
    cursor += n;
  }
  let rotorR = 0;
  roles.rotor.forEach((id) => {
    chainPts(body, id).forEach((p) => {
      const q = toAxis([p.slice(0, 3)], origin, axis)[0];
      rotorR = Math.max(rotorR, Math.hypot(q[0], q[1]));
    });
  });
  const motR = Math.max(...motFrame.map((p) => Math.hypot(p[0], p[1])));
  const placeR = rotorR + motR + 18;
  const chains = [];
  for (const id of Object.keys(body.chains)) {
    const raw = chainPts(body, id);
    const xyz = toAxis(raw.map((p) => p.slice(0, 3)), origin, axis).map((p) => p.map((v) => Math.round(v * 100) / 100));
    chains.push({ id, sub: stator.has(id) ? 'LP' : 'ротор', role: stator.has(id) ? 'stator' : 'rotor', xyz, seq: raw.map((p) => p[3]) });
  }
  const nCopy = 6;
  for (let k = 0; k < nCopy; k++) {
    const ang = k / nCopy * Math.PI * 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const ox = placeR * c, oy = placeR * s;
    for (const id of Object.keys(motByChain)) {
      const role = 'ABCDE'.includes(id) ? 'motA' : 'motB';
      const xyz = motByChain[id].map((p) => [
        Math.round((p[0] * c - p[1] * s + ox) * 100) / 100,
        Math.round((p[0] * s + p[1] * c + oy) * 100) / 100,
        Math.round(p[2] * 100) / 100
      ]);
      chains.push({ id: 'M' + k + id, sub: role === 'motA' ? 'MotA' : 'MotB', role, unit: k, xyz, seq: chainPts(mot, id).map((p) => p[3]) });
    }
  }
  return {
    pdb: '7CGO', method: 'крио-ЭМ', resolution: 3.9,
    statorPdb: '6YKM',
    citation: 'Tan J. et al. Structural basis of assembly and torque transmission of the bacterial flagellar motor. Cell, 2021, 184, 2665–2679. Статор MotAB: Santiveri M. et al. Structure and function of stator units of the bacterial flagellar motor. Cell, 2020, 183, 244–257. PDB 6YKM.',
    chains
  };
}

function bondsOf(pack) {
  let n = 0, bad = 0;
  pack.chains.forEach((ch) => {
    for (let i = 1; i < ch.xyz.length; i++) {
      const d = len(sub(ch.xyz[i], ch.xyz[i - 1]));
      if (ch.seq[i] === ch.seq[i - 1] + 1 && d < 4.5 && d > 2.5) { n++; if (Math.abs(d - 3.8) > 0.8) bad++; }
    }
  });
  return { n, bad };
}

const outDir = path.resolve('assets/machines/data');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, pack] of [['atp-6oqr', packATP()], ['flag-7cgo', packFlag()]]) {
  const stat = bondsOf(pack);
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(pack)));
  fs.writeFileSync(path.join(outDir, name + '.json.gz'), gz);
  const atoms = pack.chains.reduce((s, c) => s + c.xyz.length, 0);
  console.log(name, 'chains', pack.chains.length, 'CA', atoms, 'bonds', stat.n, 'odd', stat.bad, 'bytes', gz.length);
}
