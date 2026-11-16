/* Крио-ЭМ следы Cα: ротор крутится жёстко, статор стоит. Связи Cα–Cα задаются один раз. */
(function (root) {
  'use strict';
  const cache = {};

  function axisAngle(axis, ang) {
    const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const s = Math.sin(ang / 2);
    return { x: axis[0] / n * s, y: axis[1] / n * s, z: axis[2] / n * s, w: Math.cos(ang / 2) };
  }
  function rotVec(q, v) {
    const x = v[0], y = v[1], z = v[2];
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    return [
      ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
    ];
  }
  function spinObject(obj, origin, angle) {
    if (!obj || !obj.quaternion) return;
    const q = axisAngle([0, 0, 1], angle);
    const rc = rotVec(q, origin);
    obj.useQuaternion = true;
    obj.quaternion.set(q.x, q.y, q.z, q.w);
    obj.position.set(origin[0] - rc[0], origin[1] - rc[1], origin[2] - rc[2]);
    if (obj.updateMatrix) obj.updateMatrix();
  }

  const COLOR = {
    'α': '#94a3b8', 'β': '#22c55e', 'γ': '#f59e0b', 'ε': '#fb7185', 'c': '#fbbf24',
    'a': '#a78bfa', 'b': '#38bdf8', 'δ': '#e2e8f0',
    'ротор': '#f59e0b', 'LP': '#64748b', 'MotA': '#3b82f6', 'MotB': '#14b8a6'
  };

  async function fetchPack(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const gz = await res.arrayBuffer();
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    cache[url] = JSON.parse(text);
    return cache[url];
  }

  function note(el, text) {
    let n = el.querySelector('.loadnote');
    if (!text) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement('div');
      n.className = 'loadnote';
      el.appendChild(n);
    }
    n.textContent = text;
  }

  function buildModel(viewer, chains, colorOf) {
    const model = viewer.addModel();
    const atoms = [];
    chains.forEach(function (ch) {
      const start = atoms.length;
      const col = colorOf(ch);
      for (let i = 0; i < ch.xyz.length; i++) {
        const p = ch.xyz[i];
        atoms.push({
          x: p[0], y: p[1], z: p[2], elem: 'C', chain: ch.id, resi: ch.seq[i], resn: 'GLY',
          serial: start + i + 1, color: col, bonds: [], bondOrder: [], hetflag: false
        });
      }
      for (let i = 1; i < ch.xyz.length; i++) {
        if (ch.seq[i] !== ch.seq[i - 1] + 1) continue;
        const a = ch.xyz[i - 1], b = ch.xyz[i];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (d < 2.8 || d > 4.5) continue;
        atoms[start + i - 1].bonds.push(start + i);
        atoms[start + i - 1].bondOrder.push(1);
        atoms[start + i].bonds.push(start + i - 1);
        atoms[start + i].bondOrder.push(1);
      }
    });
    model.addAtoms(atoms);
    model.setStyle({}, { line: { colorscheme: 'greenCarbon', color: 'white', linewidth: 1.6 } });
    chains.forEach(function (ch) {
      model.setStyle({ chain: ch.id }, { line: { color: colorOf(ch), linewidth: 1.6 } });
    });
    return model;
  }

  function centroid(chains) {
    let n = 0, x = 0, y = 0, z = 0;
    chains.forEach(function (ch) {
      ch.xyz.forEach(function (p) { x += p[0]; y += p[1]; z += p[2]; n++; });
    });
    return n ? [x / n, y / n, z / n] : [0, 0, 0];
  }

  function prepare(pack) {
    const stator = pack.chains.filter(function (c) { return c.role === 'stator' || c.role === 'motB'; });
    const rotor = pack.chains.filter(function (c) { return c.role === 'rotor'; });
    const motA = {};
    pack.chains.forEach(function (c) {
      if (c.role !== 'motA') return;
      (motA[c.unit] || (motA[c.unit] = [])).push(c);
    });
    const units = Object.keys(motA).map(function (k) {
      const chains = motA[k];
      const c = centroid(chains);
      return { chains: chains, origin: [c[0], c[1], 0] };
    });
    return { stator: stator, rotor: rotor, units: units, statorC: centroid(stator), pdb: pack.pdb };
  }

  function show(card, st) {
    const v = card.viewer;
    const el = v.el;
    const which = st.part === 'flag' ? 'flag-7cgo' : 'atp-6oqr';
    if (v._realName === which && v._real) {
      apply(card, st);
      return;
    }
    if (v._realLoading === which) return;
    v._realLoading = which;
    note(el, which === 'atp-6oqr' ? 'Загружаю крио-ЭМ 6OQR…' : 'Загружаю крио-ЭМ 7CGO и MotAB…');
    fetchPack('assets/machines/data/' + which + '.json.gz').then(function (pack) {
      if (v._realLoading !== which) return;
      v.dropModels();
      const prep = prepare(pack);
      const colorOf = function (ch) { return COLOR[ch.sub] || '#e2e8f0'; };
      prep.statorModel = buildModel(v.viewer, prep.stator, colorOf);
      prep.rotorModel = buildModel(v.viewer, prep.rotor, colorOf);
      prep.unitModels = prep.units.map(function (u) { return buildModel(v.viewer, u.chains, colorOf); });
      v.viewer.zoomTo();
      if (pack.pdb === '7CGO') v.viewer.rotate(1.15, 'x');
      v.viewer.render();
      v._real = prep;
      v._realName = which;
      v._realPack = pack;
      note(el, '');
      card.stage.dataset.pdb = pack.pdb;
      apply(card, st);
    }).catch(function (err) {
      note(el, 'Не удалось открыть структуру');
      if (!card._realErr) { card._realErr = true; console.error(err); }
    });
  }

  function apply(card, st) {
    const v = card.viewer;
    const prep = v._real;
    if (!prep) return;
    const angle = st.part === 'flag' ? (st.phase || 0) * (st.dir || 1) : ((st.step || 0) + (st.u || 0)) * (2 * Math.PI / 3);
    const mot = st.part === 'flag' ? -angle * 0.12 : 0;
    spinObject(prep.rotorModel.renderedMolObj, [0, 0, 0], angle);
    prep.unitModels.forEach(function (model, i) {
      spinObject(model.renderedMolObj, prep.units[i].origin, mot);
    });
    if (st.part === 'atp') {
      v.viewer.removeAllShapes();
      const z = -30 + ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * 55;
      v.viewer.addSphere({ center: { x: 2.2, y: 0, z: z }, radius: 0.7, color: '#67e8f9' });
      v.viewer.addSphere({ center: { x: -2.2, y: 0, z: z - 12 }, radius: 0.7, color: '#67e8f9' });
    }
    v.viewer.render();
    const c = prep.statorC;
    card.stage.dataset.stator = c.map(function (v) { return v.toFixed(3); }).join(',');
    card.stage.dataset.rotor = angle.toFixed(4);
    card.stage.dataset.pose = angle.toFixed(4);
  }

  root.MMReal = { show: show, fetchPack: fetchPack };
})(typeof window !== 'undefined' ? window : globalThis);
