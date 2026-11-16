/* Сцена 3Dmol: шарики, свои связи, пунктир контакта, σ-дырка и оболочки. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IXScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CPK = {
    H: 0xd4d4d8, C: 0x374151, N: 0x3344cc, O: 0xe11d48, F: 0x22c55e,
    S: 0xeab308, Cl: 0x16a34a, Br: 0xb45309, I: 0x9333ea, Se: 0xd97706,
    Te: 0xc4843a, Na: 0xa855f7, K: 0x7c3aed, Li: 0xc084fc, Ar: 0x22d3ee
  };
  const SCALE = { H: 0.28, C: 0.36, N: 0.36, O: 0.36, F: 0.34, Na: 0.55, K: 0.62, Li: 0.48, Cl: 0.5, Br: 0.52, I: 0.55, Ar: 0.5, S: 0.42, Se: 0.44, Te: 0.48 };

  let viewer = null;
  let host = null;
  let held = null;

  function pdbLine(serial, el, x, y, z) {
    const name = (el.length > 1 ? el : ' ' + el).padEnd(4, ' ').slice(0, 4);
    const num = (v) => v.toFixed(3).padStart(8, ' ');
    const elem = el.slice(0, 2).padStart(2, ' ');
    return 'HETATM' + String(serial).padStart(5, ' ') + ' ' + name +
      ' UNL A' + '   1' + '    ' + num(x) + num(y) + num(z) +
      '  1.00  0.00          ' + elem;
  }

  function toPDB(atoms) {
    let serial = 0;
    const lines = ['TITLE ix-lab'];
    atoms.forEach(a => {
      if (a.site) return;
      serial++;
      lines.push(pdbLine(serial, a.el, a.x, a.y, a.z));
    });
    lines.push('END');
    return lines.join('\n');
  }

  function mount(el) {
    host = el;
    if (!window.$3Dmol) {
      el.innerHTML = '<p class="muted">3D-вид не загрузился. Графики ниже всё равно считаются.</p>';
      return null;
    }
    viewer = $3Dmol.createViewer(el, { backgroundColor: '#f4f7fb', antialias: true });
    return viewer;
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  }

  function dashed(a, b, color) {
    const n = 13;
    for (let i = 0; i < n; i += 2) {
      viewer.addCylinder({
        start: lerp(a, b, i / n),
        end: lerp(a, b, Math.min(1, (i + 1) / n)),
        radius: 0.04,
        color: color,
        fromCap: 0,
        toCap: 0
      });
    }
  }

  function bondCyl(a, b, order) {
    const ca = CPK[a.el] == null ? 0x64748b : CPK[a.el];
    const cb = CPK[b.el] == null ? 0x64748b : CPK[b.el];
    const mid = lerp(a, b, 0.5);
    const pairs = order >= 2 ? [-0.08, 0.08] : [0];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    let nx, ny, nz;
    if (ax <= ay && ax <= az) { nx = 0; ny = -dz; nz = dy; }
    else if (ay <= az) { nx = dz; ny = 0; nz = -dx; }
    else { nx = -dy; ny = dx; nz = 0; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    pairs.forEach(off => {
      const s = { x: a.x + nx * off, y: a.y + ny * off, z: a.z + nz * off };
      const m = { x: mid.x + nx * off, y: mid.y + ny * off, z: mid.z + nz * off };
      const e = { x: b.x + nx * off, y: b.y + ny * off, z: b.z + nz * off };
      viewer.addCylinder({ start: s, end: m, radius: 0.07, color: ca, fromCap: 1, toCap: 1 });
      viewer.addCylinder({ start: m, end: e, radius: 0.07, color: cb, fromCap: 1, toCap: 1 });
    });
  }

  function show(res, opt) {
    if (!viewer) return;
    opt = opt || {};
    try { viewer.resize(); } catch (e) { /* контейнер ещё без размера */ }
    let view = null;
    try { if (!opt.reset) view = viewer.getView(); } catch (e) { view = null; }
    viewer.removeAllModels();
    viewer.removeAllShapes();
    viewer.removeAllLabels();
    const bg = opt.theme === 'dark' ? '#121826' : '#f4f7fb';
    viewer.setBackgroundColor(bg);
    try {
      viewer.addModel(toPDB(res.atoms), 'pdb', { keepH: true, assignBonds: false });
      viewer.setStyle({}, { sphere: { scale: 0.34, colorscheme: 'Jmol' } });
      Object.keys(SCALE).forEach(el => {
        const st = { sphere: { scale: SCALE[el], color: CPK[el] } };
        viewer.setStyle({ elem: el }, st);
      });
    } catch (e) { window.ixErr = String(e && e.message || e); }
    (res.bonds || []).forEach(b => {
      const a = res.atoms[b[0]], c = res.atoms[b[1]];
      if (!a || !c || a.site || c.site) return;
      bondCyl(a, c, b[2] || 1);
    });
    if (res.line && res.line.length === 2) {
      dashed(res.line[0], res.line[1], opt.theme === 'dark' ? 0x93c5fd : 0x1d4ed8);
      if (opt.labels !== false) {
        const m = lerp(res.line[0], res.line[1], 0.5);
        const d = Math.hypot(res.line[0].x - res.line[1].x, res.line[0].y - res.line[1].y, res.line[0].z - res.line[1].z);
        addTag(m, d.toFixed(2) + ' Å', opt.theme, 0.35);
      }
    }
    if (opt.labels !== false) {
      (res.angles || []).forEach(tri => {
        if (!tri || tri.length < 3) return;
        const deg = angleOf(tri[0], tri[1], tri[2]);
        addTag(tri[1], Math.round(deg) + '°', opt.theme, 0.55);
      });
    }
    if (opt.holes !== false) {
      (res.holes || []).forEach(h => {
        viewer.addSphere({ center: h, radius: 0.38, color: 0xef4444, opacity: 0.55 });
      });
    }
    if (opt.shells !== false) {
      (res.shells || []).forEach(s => {
        viewer.addSphere({ center: { x: s.x, y: s.y, z: s.z }, radius: s.r, color: 0x38bdf8, opacity: 0.14 });
      });
    }
    if (opt.reset || !view) {
      try { viewer.zoomTo(); viewer.zoom(1.55); } catch (e) { window.ixErr = 'zoom ' + (e && e.message || e); }
    } else {
      try { viewer.setView(view); } catch (e) { try { viewer.zoomTo(); } catch (e2) {} }
    }
    viewer.render();
    held = { res: res, opt: opt };
  }

  function angleOf(a, b, c) {
    const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
    const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
    const du = Math.hypot(ux, uy, uz) || 1, dv = Math.hypot(vx, vy, vz) || 1;
    const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (du * dv)));
    return Math.acos(cos) * 180 / Math.PI;
  }

  function addTag(p, text, theme, lift) {
    try {
      viewer.addLabel(text, {
        position: { x: p.x, y: p.y + (lift || 0.3), z: p.z },
        backgroundColor: theme === 'dark' ? 0x0f172a : 0xffffff,
        backgroundOpacity: 0.88,
        fontColor: theme === 'dark' ? 0xf8fafc : 0x0f172a,
        fontSize: 13,
        showBackground: true,
        inFront: true
      });
    } catch (e) { /* подпись необязательна */ }
  }

  function resize() {
    if (!viewer) return;
    try { viewer.resize(); viewer.render(); } catch (e) {}
  }

  function setSpin(on) {
    if (!viewer) return;
    try { viewer.spin(on ? 'y' : false); } catch (e) {}
  }

  return { mount: mount, show: show, resize: resize, setSpin: setSpin };
});
