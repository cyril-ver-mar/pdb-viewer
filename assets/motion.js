/* Общая политика движения для 2D-схем.
   iOS Safari включает prefers-reduced-motion, если в системе «Уменьшение движения».
   Автозапуск тогда выключен, но кнопка ▶ обязана запустить цикл. */
(function (root) {
  'use strict';
  function reduced() {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }
  function autoplay() { return !reduced(); }

  /* Ширина холста с экрана, а не с растрового буфера.
     На iOS после canvas.width = css * dpr clientWidth иногда становится шириной буфера и растёт каждый кадр. */
  function cssBox(canvas, fallbackW, fallbackH) {
    var parent = canvas.parentElement;
    var pw = 0;
    if (parent) {
      var ps = root.getComputedStyle(parent);
      pw = parent.clientWidth - (parseFloat(ps.paddingLeft) || 0) - (parseFloat(ps.paddingRight) || 0);
    }
    var w = canvas.clientWidth;
    if (!(w > 8) || (pw > 8 && w > pw + 4)) w = pw > 8 ? pw : (fallbackW || 320);
    var h = canvas.clientHeight;
    if (!(h > 8)) {
      var cssH = parseFloat(root.getComputedStyle(canvas).height);
      h = cssH > 8 ? cssH : (fallbackH || Math.round(Math.min(w, 480) * 0.66));
    }
    return { w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)) };
  }

  root.PVMotion = { reduced: reduced, autoplay: autoplay, cssBox: cssBox };
})(typeof window !== 'undefined' ? window : globalThis);
