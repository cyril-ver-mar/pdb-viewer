/* Память 3Dmol.js 2.5.5.
   По умолчанию каждый просмотрщик рисует в ОБЩИЙ OffscreenCanvas, а на КАЖДОМ кадре
   (render/вращение) заново присваивает ему width/height — это пересоздаёт буфер кадра со
   сглаживанием (MSAA) — и копирует картинку через новый ImageBitmap. На настоящей видеокарте
   драйвер не успевает освобождать эти буферы: браузер набирал 5 ГБ в покое и до 11 ГБ при вращении.
   row/col/rows/cols = 0/0/1/1 — путь 3Dmol «сетки просмотрщиков»: обычный WebGL-контекст прямо
   на canvas, без OffscreenCanvas и без пересоздания буфера на кадр. Плюс «upscale» (рисовать ×2
   при devicePixelRatio < 2) включаем только для небольших окон, чтобы буфер не был в 4 раза больше экрана. */
(function () {
  'use strict';
  // $3Dmol — ES-модуль (свойства только для чтения), поэтому createViewer не подменить:
  // все вызовы на сайте передают настройки через window.gl3dConfig(...).
  window.gl3dConfig = function (c) {
    var out = {};
    for (var k in (c || {})) out[k] = c[k];
    if (out.rows == null) { out.row = 0; out.col = 0; out.rows = 1; out.cols = 1; }
    if (out.upscale == null) {
      var dpr = window.devicePixelRatio || 1;
      out.upscale = !!out.antialias && dpr < 2 && innerWidth * innerHeight * 4 <= 2600000;
    }
    return out;
  };
})();
