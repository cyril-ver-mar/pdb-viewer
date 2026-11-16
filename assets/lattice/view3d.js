/* Лёгкий просмотр многогранника: вращение пальцем, без WebGL. */
(function () {
  'use strict';

  function shade(hex, light) {
    var h = hex.replace('#', '');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    var f = Math.max(0, Math.min(1.15, light));
    function c(v) { return Math.max(0, Math.min(255, Math.round(v * f))); }
    return 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')';
  }

  function View(canvas) {
    this.canvas = canvas;
    this.yaw = 0.7;
    this.pitch = 0.42;
    this.auto = true;
    this.dragging = false;
    this.model = null;
    var self = this;
    var last = null;
    canvas.addEventListener('pointerdown', function (e) {
      self.dragging = true;
      self.auto = false;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!self.dragging || !last || e.pointerId !== last.id) return;
      self.yaw += (e.clientX - last.x) * 0.01;
      self.pitch += (e.clientY - last.y) * 0.01;
      self.pitch = Math.max(-1.25, Math.min(1.25, self.pitch));
      last.x = e.clientX;
      last.y = e.clientY;
    });
    function up() { self.dragging = false; last = null; }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  View.prototype.setModel = function (model) { this.model = model; };
  View.prototype.reset = function () { this.yaw = 0.7; this.pitch = 0.42; this.auto = true; };
  View.prototype.tick = function (dt) {
    if (this.auto && !this.dragging) this.yaw += dt * 0.4;
  };

  View.prototype._rot = function (p) {
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    var cx = Math.cos(this.pitch), sx = Math.sin(this.pitch);
    var x1 = p.x * cy + p.z * sy;
    var z1 = -p.x * sy + p.z * cy;
    var y2 = p.y * cx - z1 * sx;
    var z2 = p.y * sx + z1 * cx;
    return { x: x1, y: y2, z: z2 };
  };

  View.prototype.draw = function (colors) {
    var fit = LDraw.fit(this.canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, h);
    var model = this.model;
    if (!model) return;
    var radius = 1e-6;
    var i;
    for (i = 0; i < model.vertices.length; i++) {
      var L = LatticeMath.len3(model.vertices[i]);
      if (L > radius) radius = L;
    }
    var scale = Math.min(w, h) * 0.34 / radius;
    var dist = 3.4 * radius;
    var cx = w / 2, cy = h / 2 + 6;
    var self = this;
    function project(p) {
      var r = self._rot(p);
      var persp = dist / (dist - r.z);
      return { x: cx + r.x * persp * scale, y: cy - r.y * persp * scale, z: r.z, p: r };
    }
    var light = { x: 0.35, y: 0.72, z: 0.6 };
    var ll = Math.hypot(light.x, light.y, light.z);
    light.x /= ll; light.y /= ll; light.z /= ll;
    var faces = model.faces.map(function (f) {
      var c = { x: 0, y: 0, z: 0 };
      for (var k = 0; k < f.verts.length; k++) {
        c.x += f.verts[k].x; c.y += f.verts[k].y; c.z += f.verts[k].z;
      }
      c.x /= f.verts.length; c.y /= f.verts.length; c.z /= f.verts.length;
      return { f: f, z: self._rot(c).z };
    });
    faces.sort(function (a, b) { return a.z - b.z; });
    var palette = { square: '#3d8bfd', hex: '#f0a04b', rhombus: '#3cbf8f', rect: '#b48adf' };
    for (i = 0; i < faces.length; i++) {
      var f = faces[i].f;
      var n = self._rot(f.n);
      var nd = n.x * light.x + n.y * light.y + n.z * light.z;
      var col = shade(palette[f.type] || '#8ab', 0.42 + 0.7 * Math.max(0, nd));
      ctx.beginPath();
      for (var k = 0; k < f.verts.length; k++) {
        var sp = project(f.verts[k]);
        if (k === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(12,18,32,.45)';
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }
    var used = [];
    ctx.font = '700 13px sans-serif';
    for (i = 0; i < model.points.length; i++) {
      var pt = model.points[i];
      var sp = project(pt.p);
      if (sp.z < -radius * 0.2 && pt.name !== 'Γ') continue;
      var lx = sp.x, ly = sp.y - 12;
      var guard = 0;
      while (guard < 8 && used.some(function (u) { return Math.hypot(u.x - lx, u.y - ly) < 16; })) {
        ly -= 12;
        guard++;
      }
      used.push({ x: lx, y: ly });
      ctx.beginPath();
      ctx.fillStyle = pt.name === 'Γ' ? colors.acc2 : colors.fg;
      ctx.arc(sp.x, sp.y, pt.name === 'Γ' ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      LDraw.text(ctx, pt.name, lx, ly, { halo: colors.card, color: colors.fg, font: '700 14px sans-serif' });
    }
  };

  globalThis.LView3D = View;
})();
