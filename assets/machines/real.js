/* Крио-ЭМ следы Cα. Ротор и его поверхность крутятся жёстко, статор стоит.
   Поверхность считается один раз: гауссова плотность по Cα, грубая сетка ~5–6 Å. */
(function (root) {
  'use strict';
  const cache = {};

  function axisAngle(axis, ang) {
    const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const s = Math.sin(ang / 2);
    return { x: axis[0] / n * s, y: axis[1] / n * s, z: axis[2] / n * s, w: Math.cos(ang / 2) };
  }
  function mulQ(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
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
  function look(viewer, tilt, yaw) {
    viewer.zoomTo();
    const view = viewer.getView();
    const q = mulQ(axisAngle([0, 1, 0], yaw), axisAngle([1, 0, 0], tilt));
    view[3] *= 1.22;
    view[4] = q.x;
    view[5] = q.y;
    view[6] = q.z;
    view[7] = q.w;
    viewer.setView(view);
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

  function centroid(chains) {
    let n = 0, x = 0, y = 0, z = 0;
    chains.forEach(function (ch) {
      ch.xyz.forEach(function (p) { x += p[0]; y += p[1]; z += p[2]; n++; });
    });
    return n ? [x / n, y / n, z / n] : [0, 0, 0];
  }

  function splitPack(pack) {
    const stator = [], rotor = [], byUnit = {};
    pack.chains.forEach(function (ch) {
      if (ch.role === 'motA') (byUnit[ch.unit] || (byUnit[ch.unit] = [])).push(ch);
      else if (ch.role === 'rotor') rotor.push(ch);
      else stator.push(ch);
    });
    const unitList = Object.keys(byUnit).map(function (k) {
      const chains = byUnit[k];
      return { chains: chains, origin: centroid(chains) };
    });
    return { stator: stator, rotor: rotor, unitList: unitList };
  }

  function buildModel(viewer, chains, colorOf, lines) {
    const model = viewer.addModel();
    const atoms = [];
    chains.forEach(function (ch) {
      const start = atoms.length;
      const col = colorOf(ch);
      for (let i = 0; i < ch.xyz.length; i++) {
        const p = ch.xyz[i];
        atoms.push({
          x: p[0], y: p[1], z: p[2], elem: 'C', atom: 'CA', chain: ch.id, resi: ch.seq[i], resn: 'GLY',
          serial: start + i + 1, color: col, bonds: [], bondOrder: [], hetflag: false, ss: 'c'
        });
      }
      if (lines) {
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
      }
    });
    model.addAtoms(atoms);
    if (!lines) {
      model.setStyle({}, {});
      return model;
    }
    model.setStyle({}, { line: { color: 'white', linewidth: 1.6 } });
    chains.forEach(function (ch) {
      model.setStyle({ chain: ch.id }, { line: { color: colorOf(ch), linewidth: 1.6 } });
    });
    return model;
  }

  function MeshBuf(viewer, color) {
    this.viewer = viewer;
    this.color = color;
    this.shapes = [];
    this.vertexArr = [];
    this.faceArr = [];
  }
  MeshBuf.prototype.flush = function () {
    if (this.vertexArr.length < 3 || !this.faceArr.length) {
      this.vertexArr = [];
      this.faceArr = [];
      return;
    }
    const shape = this.viewer.addCustom({
      vertexArr: this.vertexArr,
      faceArr: this.faceArr,
      color: this.color
    });
    shape._kind = 'repr';
    this.shapes.push(shape);
    this.vertexArr = [];
    this.faceArr = [];
  };
  MeshBuf.prototype.room = function (n) {
    if (this.vertexArr.length && this.vertexArr.length + n > 48000) this.flush();
    return this.vertexArr.length;
  };

  function addRibbon(buf, chains) {
    const half = 1.7;
    chains.forEach(function (ch) {
      let run = [];
      function emit() {
        if (run.length < 2) { run = []; return; }
        const tang = [];
        for (let i = 0; i < run.length; i++) {
          const a = run[Math.max(0, i - 1)];
          const b = run[Math.min(run.length - 1, i + 1)];
          const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
          const L = Math.hypot(x, y, z) || 1;
          tang.push([x / L, y / L, z / L]);
        }
        let nx, ny, nz;
        const t0 = tang[0];
        if (Math.abs(t0[2]) < 0.9) { nx = t0[1]; ny = -t0[0]; nz = 0; }
        else { nx = 0; ny = t0[2]; nz = -t0[1]; }
        let nL = Math.hypot(nx, ny, nz) || 1;
        nx /= nL; ny /= nL; nz /= nL;
        const base = buf.room(run.length * 2);
        for (let i = 0; i < run.length; i++) {
          const t = tang[i];
          const d = nx * t[0] + ny * t[1] + nz * t[2];
          nx -= t[0] * d; ny -= t[1] * d; nz -= t[2] * d;
          nL = Math.hypot(nx, ny, nz) || 1;
          nx /= nL; ny /= nL; nz /= nL;
          const p = run[i];
          buf.vertexArr.push(
            { x: p[0] - nx * half, y: p[1] - ny * half, z: p[2] - nz * half },
            { x: p[0] + nx * half, y: p[1] + ny * half, z: p[2] + nz * half }
          );
          if (i > 0) {
            const a = base + (i - 1) * 2;
            buf.faceArr.push(a, a + 1, a + 3, a, a + 3, a + 2);
          }
        }
        run = [];
      }
      for (let i = 0; i < ch.xyz.length; i++) {
        if (i > 0) {
          const a = ch.xyz[i - 1], b = ch.xyz[i];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          if (ch.seq[i] !== ch.seq[i - 1] + 1 || d > 4.6 || d < 2.5) emit();
        }
        run.push(ch.xyz[i]);
      }
      emit();
    });
  }

  function addSurface(buf, chains, spacing) {
    const sp = spacing;
    const sig2 = 3.55 * 3.55;
    const cut2 = 7.4 * 7.4;
    const cells = new Map();
    chains.forEach(function (ch) {
      const xyz = ch.xyz;
      for (let a = 0; a < xyz.length; a++) {
        const p = xyz[a];
        const i0 = Math.round(p[0] / sp);
        const j0 = Math.round(p[1] / sp);
        const k0 = Math.round(p[2] / sp);
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const ii = i0 + di, jj = j0 + dj;
            for (let dk = -1; dk <= 1; dk++) {
              const kk = k0 + dk;
              const dx = p[0] - ii * sp, dy = p[1] - jj * sp, dz = p[2] - kk * sp;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 > cut2) continue;
              const w = Math.exp(-d2 / (2 * sig2));
              const key = (ii + 500) * 1000000 + (jj + 500) * 1000 + (kk + 500);
              let cell = cells.get(key);
              if (!cell) {
                cell = { d: 0, i: ii, j: jj, k: kk };
                cells.set(key, cell);
              }
              cell.d += w;
            }
          }
        }
      }
    });
    const thresh = 0.36;
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    cells.forEach(function (cell) {
      if (cell.d < thresh) return;
      for (let f = 0; f < 6; f++) {
        const dir = dirs[f];
        const nk = (cell.i + dir[0] + 500) * 1000000 + (cell.j + dir[1] + 500) * 1000 + (cell.k + dir[2] + 500);
        const nb = cells.get(nk);
        const nd = nb ? nb.d : 0;
        if (nd >= thresh) continue;
        const frac = Math.max(0.08, Math.min(0.92, (cell.d - thresh) / (cell.d - nd + 1e-4)));
        const px = (cell.i + dir[0] * frac) * sp;
        const py = (cell.j + dir[1] * frac) * sp;
        const pz = (cell.k + dir[2] * frac) * sp;
        const size = sp * 0.52;
        let ux = 0, uy = 0, uz = 0, vx = 0, vy = 0, vz = 0;
        if (dir[0] !== 0) { uy = size; vz = size; }
        else if (dir[1] !== 0) { ux = size; vz = size; }
        else { ux = size; vy = size; }
        const base = buf.room(4);
        const corners = [
          [px - ux - vx, py - uy - vy, pz - uz - vz],
          [px + ux - vx, py + uy - vy, pz + uz - vz],
          [px + ux + vx, py + uy + vy, pz + uz + vz],
          [px - ux + vx, py - uy + vy, pz - uz + vz]
        ];
        if (dir[0] + dir[1] + dir[2] < 0) corners.reverse();
        for (let c = 0; c < 4; c++) {
          buf.vertexArr.push({ x: corners[c][0], y: corners[c][1], z: corners[c][2] });
        }
        buf.faceArr.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    });
  }

  function meshesFor(viewer, chains, colorOf, repr, spacing) {
    if (repr === 'trace' || !chains.length) return [];
    const by = new Map();
    chains.forEach(function (ch) {
      const col = colorOf(ch);
      if (!by.has(col)) by.set(col, []);
      by.get(col).push(ch);
    });
    const shapes = [];
    by.forEach(function (group, col) {
      const buf = new MeshBuf(viewer, col);
      if (repr === 'cartoon') addRibbon(buf, group);
      else addSurface(buf, group, spacing);
      buf.flush();
      shapes.push.apply(shapes, buf.shapes);
    });
    return shapes;
  }

  function objsOf(shapes) {
    const out = [];
    shapes.forEach(function (sh) { if (sh.renderedShapeObj) out.push(sh.renderedShapeObj); });
    return out;
  }

  function build(card, pack, repr) {
    const v = card.viewer;
    const viewer = v.viewer;
    viewer.removeAllModels();
    viewer.removeAllShapes();
    viewer.removeAllLabels();
    v._mem = '';
    const colorOf = function (ch) { return COLOR[ch.sub] || '#e2e8f0'; };
    const split = splitPack(pack);
    const spacing = pack.pdb === '7CGO' ? 6.5 : 5.0;
    const lines = repr === 'trace';
    const prep = { statorC: centroid(split.stator), pdb: pack.pdb, units: split.unitList };
    prep.statorModel = buildModel(viewer, split.stator, colorOf, lines);
    prep.rotorModel = buildModel(viewer, split.rotor, colorOf, lines);
    prep.unitModels = split.unitList.map(function (u) { return buildModel(viewer, u.chains, colorOf, lines); });
    const statorShapes = meshesFor(viewer, split.stator, colorOf, repr, spacing);
    const rotorShapes = meshesFor(viewer, split.rotor, colorOf, repr, spacing);
    const unitShapes = split.unitList.map(function (u) { return meshesFor(viewer, u.chains, colorOf, repr, spacing); });
    if (pack.pdb === '6OQR') {
      prep.protons = [0, 1].map(function () {
        const sh = viewer.addSphere({ center: { x: 0, y: 0, z: 0 }, radius: 1.1, color: '#67e8f9' });
        sh._kind = 'proton';
        return sh;
      });
    }
    const which = pack.pdb === '7CGO' ? 'flag-7cgo' : 'atp-6oqr';
    if (v._camFor !== which) {
      look(viewer, pack.pdb === '7CGO' ? Math.PI / 2 : -1.35, pack.pdb === '7CGO' ? 0.55 : 0.28);
      v._camFor = which;
    }
    viewer.render();
    prep.rotorObjs = [prep.rotorModel.renderedMolObj].concat(objsOf(rotorShapes));
    prep.statorObj = prep.statorModel.renderedMolObj;
    prep.unitObjs = prep.unitModels.map(function (model, i) {
      return [model.renderedMolObj].concat(objsOf(unitShapes[i]));
    });
    v._real = prep;
    v._repr = repr;
    v._realName = which;
    v._realPack = pack;
  }

  function annulus(viewer, z, rIn, rOut, color, opacity) {
    const n = 72;
    const vertexArr = [];
    const faceArr = [];
    const inner = Math.max(0, rIn);
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      vertexArr.push({ x: inner * c, y: inner * s, z: z });
      vertexArr.push({ x: rOut * c, y: rOut * s, z: z });
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      faceArr.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const shape = viewer.addCustom({ vertexArr: vertexArr, faceArr: faceArr, color: color, opacity: opacity });
    shape._kind = 'membrane';
    shape._opacity = opacity;
    return shape;
  }

  function syncMembrane(card, st) {
    const v = card.viewer;
    const on = st.membrane === 'on' ? '1' : '0';
    if (v._mem === on) return;
    const viewer = v.viewer;
    (viewer.shapes || []).slice().forEach(function (sh) {
      if (sh && sh._kind === 'membrane') viewer.removeShape(sh);
    });
    viewer.removeAllLabels();
    v._mem = on;
    if (on !== '1' || !v._realPack || !v._realPack.membrane) return;
    v._realPack.membrane.layers.forEach(function (layer) {
      const slabs = layer.bilayer ? [layer.z + 20, layer.z - 20] : [layer.z];
      slabs.forEach(function (z) {
        const color = !layer.bilayer ? '#86efac' : (z >= layer.z ? '#fde68a' : '#93c5fd');
        annulus(viewer, z, layer.rIn || 0, layer.rOut, color, layer.bilayer ? 0.5 : 0.55);
      });
      const name = layer.label === 'внешняя мембрана' ? 'внешняя'
        : layer.label === 'внутренняя мембрана' ? 'внутренняя' : layer.label;
      viewer.addLabel(name, {
        position: { x: layer.bilayer ? 96 : -130, y: 4, z: layer.z + (layer.bilayer ? 24 : 0) },
        backgroundColor: '#0f172a',
        backgroundOpacity: 0.8,
        fontColor: '#f8fafc',
        fontSize: 12,
        inFront: true
      });
    });
  }

  function tuneMembrane(viewer) {
    let changed = false;
    (viewer.shapes || []).forEach(function (sh) {
      if (!sh || sh._kind !== 'membrane' || sh._tuned) return;
      const obj = sh.renderedShapeObj;
      if (!obj || !obj.traverse) return;
      obj.traverse(function (ch) {
        const mats = ch.material ? [].concat(ch.material) : [];
        mats.forEach(function (m) {
          m.transparent = true;
          m.opacity = sh._opacity || 0.33;
          m.depthWrite = false;
          m.side = 2;
          m.needsUpdate = true;
        });
      });
      sh._tuned = true;
      changed = true;
    });
    if (changed) viewer.render();
  }

  function place(sh, x, y, z) {
    const obj = sh && sh.renderedShapeObj;
    if (obj && obj.position) obj.position.set(x, y, z);
  }

  function fmt(n) { return n.toFixed(3); }

  function apply(card, st) {
    const v = card.viewer;
    const prep = v._real;
    if (!prep) return;
    // phase already integrates the CW/CCW sign, so the angle must not multiply dir again.
    const angle = st.part === 'flag' ? (st.phase || 0) : ((st.step || 0) + (st.u || 0)) * (2 * Math.PI / 3);
    const mot = st.part === 'flag' ? -angle * 0.85 : 0;
    prep.rotorObjs.forEach(function (obj) { spinObject(obj, [0, 0, 0], angle); });
    prep.unitObjs.forEach(function (list, i) {
      const origin = prep.units[i].origin;
      list.forEach(function (obj) { spinObject(obj, origin, mot); });
    });
    if (prep.protons) {
      const turns = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      const z = -20 + turns * 40;
      place(prep.protons[0], 22, 0, z);
      place(prep.protons[1], -18, 6, z - 8);
    }
    v.viewer.render();
    tuneMembrane(v.viewer);
    const c = prep.statorC;
    card.stage.dataset.stator = c.map(fmt).join(',');
    card.stage.dataset.rotor = angle.toFixed(4);
    card.stage.dataset.pose = angle.toFixed(4);
    card.stage.dataset.repr = v._repr || 'trace';
    card.stage.dataset.membrane = v._mem === '1' ? '1' : '0';
    const rq = prep.rotorObjs[0] && prep.rotorObjs[0].quaternion;
    const sq = prep.statorObj && prep.statorObj.quaternion;
    if (rq) card.stage.dataset.rotorQ = [rq.x, rq.y, rq.z, rq.w].map(fmt).join(',');
    if (sq) card.stage.dataset.statorQ = [sq.x, sq.y, sq.z, sq.w].map(fmt).join(',');
    const view = v.viewer.getView();
    card.stage.dataset.cam = view.slice(4).map(fmt).join(',');
  }

  function show(card, st) {
    const v = card.viewer;
    const el = v.el;
    const which = st.part === 'flag' ? 'flag-7cgo' : 'atp-6oqr';
    const repr = st.repr === 'cartoon' || st.repr === 'surface' ? st.repr : 'trace';
    if (v._real && v._realName === which) {
      if (v._repr !== repr) build(card, v._realPack, repr);
      syncMembrane(card, st);
      apply(card, st);
      return;
    }
    if (v._realLoading === which) return;
    v._realLoading = which;
    note(el, which === 'atp-6oqr' ? 'Загружаю крио-ЭМ 6OQR…' : 'Загружаю крио-ЭМ 7CGO и MotAB…');
    fetchPack('assets/machines/data/' + which + '.json.gz').then(function (pack) {
      if (v._realLoading !== which) return;
      const use = st.repr === 'cartoon' || st.repr === 'surface' ? st.repr : 'trace';
      build(card, pack, use);
      note(el, '');
      card.stage.dataset.pdb = pack.pdb;
      syncMembrane(card, st);
      apply(card, st);
    }).catch(function (err) {
      note(el, 'Не удалось открыть структуру');
      if (!card._realErr) { card._realErr = true; console.error(err); }
    });
  }

  root.MMReal = { show: show, fetchPack: fetchPack };
})(typeof window !== 'undefined' ? window : globalThis);
