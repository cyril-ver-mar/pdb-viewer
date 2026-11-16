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
  let memR = 40;
  chains.forEach((ch) => {
    if (ch.sub !== 'c' && ch.sub !== 'a') return;
    ch.xyz.forEach((p) => {
      if (Math.abs(p[2]) < 40) memR = Math.max(memR, Math.hypot(p[0], p[1]));
    });
  });
  const aZ = chains.filter((ch) => ch.sub === 'a').flatMap((ch) => ch.xyz.map((p) => p[2]));
  console.log('ATP subunit a z', Math.min(...aZ).toFixed(1), Math.max(...aZ).toFixed(1), 'memR', memR.toFixed(1));
  return {
    pdb: '6OQR', method: 'крио-ЭМ', resolution: 3.1,
    states: '6OQR, 6OQS, 6OQT',
    citation: 'Sobti M., Walshe J. L., Wu D., Ishmukhametov R., Zeng Y. C., Robinson C. V., Berry R. M., Stewart A. G. Cryo-EM structures provide insight into how E. coli F1Fo ATP synthase accommodates symmetry mismatch. Nature Communications, 2020, 11, 2615.',
    membrane: { layers: [{ z: 0, label: 'мембрана', rIn: 0, rOut: Math.round(memR + 16), bilayer: true }] },
    chains
  };
}

// Enteric motor, assembled to in situ cryo-ET of Salmonella / E. coli:
//  * 11 MotA5B2 stator units (Reid et al. PNAS 2006; Beeby et al. PNAS 2016),
//  * C ring radius ~22 nm, FliG outer lobe (torque contact) at ~20 nm (Beeby et al. 2016;
//    Thomas, Morgan & DeRosier, J. Bacteriol. 2006),
//  * MotA in the inner membrane touching FliG from outside, MotB reaching the peptidoglycan
//    (Santiveri et al. Cell 2020; Deme et al. Nat. Microbiol. 2020; Tan et al. Cell Res. 2024).
// Frame: z is the motor axis, +z points into the cytoplasm, −z toward the hook. Units Å.
function flagProtein(id) {
  if (/^[0-9]$/.test(id)) return 'MS';
  if (/^(C[a-z]|D[a-w]|E[a-h])$/.test(id)) return 'MS';
  if (/^(D[A-Z]|E[A-G])$/.test(id)) return 'hook';
  if (/^[AB][A-Z]$/.test(id)) return 'LP';
  if (/^(CF|C[A-E]|w|x|y|z)$/.test(id)) return 'gate';
  return 'rod'; // FlgB, FlgC, FlgF, FlgG, FliE and their resolved helices / loops
}
const FLAG_SUB = { MS: 'MS', hook: 'крюк', LP: 'LP', gate: 'FliPQR', rod: 'стержень' };

function coilAlong(path, coilR, out, seqStart) {
  // Pseudo-Cα beads coiled around a smoothed polyline, exactly 3.8 Å apart,
  // so trace / ribbon / surface all render it like a real chain.
  let P = path.map((p) => p.slice());
  for (let it = 0; it < 3; it++) {
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      Q.push(add(mul(P[i], 0.75), mul(P[i + 1], 0.25)), add(mul(P[i], 0.25), mul(P[i + 1], 0.75)));
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  const centre = [];
  for (let i = 1; i < P.length; i++) {
    const L = len(sub(P[i], P[i - 1]));
    const n = Math.max(1, Math.ceil(L / 0.05));
    for (let k = 0; k < n; k++) centre.push(add(P[i - 1], mul(sub(P[i], P[i - 1]), k / n)));
  }
  centre.push(P[P.length - 1]);
  const curve = [];
  let t0 = norm(sub(centre[Math.min(20, centre.length - 1)], centre[0]));
  let u = norm(cross(t0, Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  let arc = 0;
  const pitch = Math.max(5.4, coilR * 1.1); // Å per turn of the coil
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 10)], b = centre[Math.min(centre.length - 1, i + 10)];
    const t = norm(sub(b, a));
    u = norm(sub(u, mul(t, dot(u, t))));
    const w = cross(t, u);
    if (i) arc += len(sub(centre[i], centre[i - 1]));
    const ph = arc / pitch * Math.PI * 2;
    curve.push(add(centre[i], add(mul(u, coilR * Math.cos(ph)), mul(w, coilR * Math.sin(ph)))));
  }
  let seq = seqStart;
  let last = curve[0];
  out.push([...last.map((v) => Math.round(v * 100) / 100), seq++]);
  for (let i = 1; i < curve.length; i++) {
    if (len(sub(curve[i], last)) >= 3.8) {
      last = curve[i];
      out.push([...last.map((v) => Math.round(v * 100) / 100), seq++]);
    }
  }
  return out;
}
function chainOf(beads) {
  // bridge any joint between coil pieces with evenly spaced beads (≤ 3.8 Å apart)
  const out = [beads[0]];
  for (let i = 1; i < beads.length; i++) {
    const a = out[out.length - 1], b = beads[i];
    const d = len(sub(b.slice(0, 3), a.slice(0, 3)));
    const n = Math.ceil(d / 4.4);
    const dir = sub(b.slice(0, 3), a.slice(0, 3));
    const perp = norm(cross(dir, Math.abs(dir[2]) < 0.9 * len(dir) ? [0, 0, 1] : [1, 0, 0]));
    const lift = n === 2 && d / 2 < 2.9 ? Math.sqrt(3.8 * 3.8 - d * d / 4) : 0;
    for (let k = 1; k < n; k++) out.push([...add(add(a.slice(0, 3), mul(dir, k / n)), mul(perp, lift)), 0]);
    out.push(b);
  }
  const s0 = beads[0][3];
  out.forEach((p, i) => { p[3] = s0 + i; });
  beads = out.map((p) => [...p.slice(0, 3).map((v) => Math.round(v * 100) / 100), p[3]]);
  return { xyz: beads.map((p) => p.slice(0, 3)), seq: beads.map((p) => p[3]) };
}

function packFlag() {
  const body = load('7CGO');
  const ids = Object.keys(body.chains);
  const Lids = ids.filter((id) => /^A[A-Z]$/.test(id));
  const Pids = ids.filter((id) => /^B[A-Z]$/.test(id));
  const FliF = ids.filter((id) => /^(C[a-z]|D[a-w]|E[a-h])$/.test(id));
  const meanOf = (list) => cent(list.flatMap((id) => chainPts(body, id).map((p) => p.slice(0, 3))));
  const cL = meanOf(Lids);
  const cMS = meanOf(FliF);
  // L and P rings are flat in the deposited frame: the axis runs through the L-ring centre and the MS ring.
  const axis = norm(sub(cMS, cL));
  const bodyFrame = {};
  ids.forEach((id) => { bodyFrame[id] = toAxis(chainPts(body, id).map((p) => p.slice(0, 3)), cL, axis); });
  const zOf = (list) => cent(list.flatMap((id) => bodyFrame[id]))[2];
  const lz = zOf(Lids);
  ids.forEach((id) => { bodyFrame[id] = bodyFrame[id].map((p) => [p[0], p[1], p[2] - lz]); });
  const pz = zOf(Pids);
  const ext = (list, f) => list.flatMap((id) => bodyFrame[id]).reduce(f, null);
  const zmax = (list) => Math.max(...list.flatMap((id) => bodyFrame[id].map((p) => p[2])));
  const rmax = (list) => Math.max(...list.flatMap((id) => bodyFrame[id].map((p) => Math.hypot(p[0], p[1]))));
  const fliFBottom = zmax(FliF);             // cytoplasm-facing edge of the M ring
  const gate = ids.filter((id) => flagProtein(id) === 'gate');
  const gateR = rmax(gate);
  const pR = rmax(Pids), lR = rmax(Lids), msR = rmax(FliF);
  // Inner membrane: periplasmic leaflet right under the M ring (FliF TM helices are not modelled in 7CGO);
  // the export gate FliPQR sits just above / in the outer leaflet (Kuhlen et al. NSMB 2018).
  const IM = Math.round(fliFBottom + 22);
  const half = 20;
  void ext;

  const round = (p) => p.map((v) => Math.round(v * 100) / 100);
  const chains = [];
  for (const id of ids) {
    const prot = flagProtein(id);
    chains.push({
      id, sub: FLAG_SUB[prot], role: prot === 'LP' ? 'stator' : 'rotor',
      xyz: bodyFrame[id].map(round), seq: chainPts(body, id).map((p) => p[3])
    });
  }

  // ---- Schematic C ring (FliG / FliM / FliN), 34 copies, rotates with the rotor. ----
  const NC = 34;
  const fliFPts = FliF.flatMap((id) => bodyFrame[id]);
  const cTop = IM + half + 12;                // FliG just under the cytoplasmic leaflet
  const cring = { gIn: 160, gOut: 192, gZ: cTop + 8, mR: 200, nR: 212, mZ0: cTop + 26, nZ1: cTop + 150 };
  // profile (r, z) of one subunit: FliG (radial, top) → FliM (wall) → FliN (bottom, widest)
  const prof = [
    [cring.gIn, cring.gZ], [cring.gOut, cring.gZ], [cring.mR, cring.mZ0],
    [cring.mR + 4, cTop + 85], [cring.nR, cTop + 110], [cring.nR + 2, cring.nZ1]
  ];
  const coilR = 8.5;
  for (let k = 0; k < NC; k++) {
    const a = (k + 0.5) / NC * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const path = prof.map(([r, z]) => [r * c, r * s, z]);
    const beads = coilAlong(path, coilR, [], 1);
    const ch = chainOf(beads);
    chains.push({ id: 'CR' + k, sub: 'C', role: 'rotor', schematic: true, xyz: ch.xyz, seq: ch.seq });
    // FliF TM2 + C-terminal tail (not in 7CGO): M ring → through the membrane → FliG-N.
    let anchor = null;
    fliFPts.forEach((p) => {
      const r = Math.hypot(p[0], p[1]);
      if (r < 70) return;
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(p[1], p[0]) - a), Math.cos(Math.atan2(p[1], p[0]) - a)));
      if (da > 0.12) return;
      if (!anchor || p[2] > anchor[2]) anchor = p;
    });
    const tail = [
      [anchor[0], anchor[1], anchor[2] + 3.6],
      [128 * c, 128 * s, IM - half],
      [140 * c, 140 * s, IM + half],
      [(cring.gIn + 2) * c, (cring.gIn + 2) * s, cring.gZ]
    ];
    const tb = coilAlong(tail, 2.3, [], 1);
    const tc = chainOf(tb);
    chains.push({ id: 'CT' + k, sub: 'MS', role: 'rotor', schematic: true, xyz: tc.xyz, seq: tc.seq });
  }

  // ---- Stators: MotA5B2 from 6YKM in a frame with +h = periplasm. ----
  const mot = load('6YKM');
  const motAIds = ['A', 'B', 'C', 'D', 'E'].filter((id) => mot.chains[id]);
  const cs = motAIds.map((id) => cent(chainPts(mot, id).map((p) => p.slice(0, 3))));
  const C0 = cent(cs);
  let n = [0, 0, 0];
  for (let i = 0; i < cs.length; i++) n = add(n, cross(sub(cs[i], C0), sub(cs[(i + 1) % cs.length], C0)));
  n = norm(n);
  // orient so MotB's N terminus (cytoplasm) is at lower h than its C terminus (periplasm)
  const fB = chainPts(mot, 'F');
  if (dot(sub(fB[fB.length - 1].slice(0, 3), fB[0].slice(0, 3)), n) < 0) n = mul(n, -1);
  const motLocal = {};
  for (const id of Object.keys(mot.chains)) motLocal[id] = toAxis(chainPts(mot, id).map((p) => p.slice(0, 3)), C0, n);
  const motSeq = (id) => chainPts(mot, id).map((p) => p[3]);
  const allA = motAIds.flatMap((id) => motLocal[id]);
  const hMinA = Math.min(...allA.map((p) => p[2]));
  const cytoA = allA.filter((p) => p[2] < hMinA + 34);
  const cytoR = Math.max(...cytoA.map((p) => Math.hypot(p[0], p[1])));
  const motR = Math.max(...allA.map((p) => Math.hypot(p[0], p[1])));
  // MotA TM band ~ h −6…+34 in 6YKM (MotB D22 near the cytoplasmic edge) → membrane centre h0.
  const h0 = 14;
  const toZ = (h) => IM - (h - h0);        // +h (periplasm) → −z
  const contactR = cring.gOut + coilR + 6;  // MotA cytoplasmic domain touches the FliG outer lobe
  const RS = Math.round(contactR + cytoR);
  const NS = 11;
  const pgZ = Math.round(pz);
  const bTop = Math.min(...['F', 'G'].map((id) => toZ(Math.max(...motLocal[id].map((p) => p[2])))));
  for (let k = 0; k < NS; k++) {
    const ang = (k + 0.25) / NS * Math.PI * 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const ox = RS * c, oy = RS * s;
    const place = (p) => [p[0] * c - p[1] * s + ox, p[0] * s + p[1] * c + oy, toZ(p[2])];
    for (const id of Object.keys(mot.chains)) {
      const role = motAIds.includes(id) ? 'motA' : 'motB';
      chains.push({
        id: 'M' + k + id, sub: role === 'motA' ? 'MotA' : 'MotB', role, unit: k,
        xyz: motLocal[id].map((p) => round(place(p))), seq: motSeq(id)
      });
    }
    // MotB periplasmic linker + PG-binding (OmpA-like) domain dimer, schematic, anchored in the PG layer.
    ['F', 'G'].forEach((id, j) => {
      const last = motLocal[id][motLocal[id].length - 1];
      const p0 = place(last);
      const side = j ? 1 : -1;
      const pgC = [ox + side * 9 * -s, oy + side * 9 * c, pgZ + 6];
      const path = [p0, [p0[0] * 0.5 + pgC[0] * 0.5, p0[1] * 0.5 + pgC[1] * 0.5, (p0[2] + pgC[2]) / 2], [pgC[0], pgC[1], pgC[2] + 14], [pgC[0], pgC[1], pgC[2] - 10]];
      const lb = coilAlong(path.slice(0, 3), 2.0, [], motSeq(id).slice(-1)[0] + 1);
      const gb = coilAlong(path.slice(2), 7.5, [], lb.length ? lb[lb.length - 1][3] + 1 : 1);
      const ch = chainOf(lb.concat(gb));
      chains.push({ id: 'M' + k + id + 'p', sub: 'MotB', role: 'motB', unit: k, schematic: true, xyz: ch.xyz, seq: ch.seq });
    });
  }
  const outer = Math.round(RS + motR + 40);
  const at = (r, a) => [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))];
  console.log('flag IM z', IM, 'PG z', pgZ, 'OM z 0', 'C ring z', cTop, '…', cring.nZ1,
    'stator R', RS, 'contact r', contactR.toFixed(1), 'cytoR', cytoR.toFixed(1), 'motR', motR.toFixed(1),
    'MotB top z', bTop.toFixed(0), 'gate r', gateR.toFixed(0), 'P r', pR.toFixed(0), 'L r', lR.toFixed(0), 'MS r', msR.toFixed(0));
  return {
    pdb: '7CGO', method: 'крио-ЭМ', resolution: 3.9,
    statorPdb: '6YKM',
    geometry: { statorR: RS, statorN: NS, contactR: Math.round(contactR), imZ: IM, pgZ, omZ: 0, cTop, cBottom: cring.nZ1, cR: cring.nR + coilR },
    citation: 'Tan J. et al. Structural basis of assembly and torque transmission of the bacterial flagellar motor. Cell, 2021, 184, 2665–2679. Статор MotAB: Santiveri M. et al. Structure and function of stator units of the bacterial flagellar motor. Cell, 2020, 183, 244–257. PDB 6YKM. Расстановка по крио-ЭТ in situ: Beeby M. et al. PNAS, 2016, 113, E1917–E1926.',
    membrane: {
      layers: [
        { z: IM, label: 'внутренняя мембрана', rIn: Math.round(gateR + 8), rOut: outer, bilayer: true, labelAt: at(outer - 30, 0.15) },
        { z: pgZ, label: 'пептидогликан', rIn: Math.round(pR + 4), rOut: outer - 10, bilayer: false, labelAt: at(outer - 40, 2.25) },
        { z: 0, label: 'внешняя мембрана', rIn: Math.round(lR + 4), rOut: outer - 6, bilayer: true, labelAt: at(outer - 40, 4.3) }
      ]
    },
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
