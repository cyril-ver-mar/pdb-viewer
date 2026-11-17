/* Диагностика памяти 3D: размер canvas, число WebGL-контекстов, пересоздания OffscreenCanvas и ImageBitmap за кадр, RSS GPU-процесса и куча JS — при загрузке, в покое, при вращении и переключениях. Запуск: Q="?set=_supra/crown/complexes" N=30 node tools/measure-gl-memory.mjs */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const rss = (t) => +execSync(`ps -eo rss,args | grep -E 'chrome' | grep -E 'type=${t}' | grep -v grep | awk '{s+=$1} END {print s+0}'`).toString().trim() / 1024 | 0;
const ctx = await b.newContext({ viewport: { width: +(process.env.W || 1440), height: +(process.env.H || 900) }, deviceScaleFactor: +(process.env.DPR || 1) });
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__g = { offW: 0, bitmaps: 0, ctx: 0, renders: 0 };
  if (window.OffscreenCanvas) {
    const d = Object.getOwnPropertyDescriptor(OffscreenCanvas.prototype, 'width');
    Object.defineProperty(OffscreenCanvas.prototype, 'width', { get() { return d.get.call(this); }, set(v) { window.__g.offW++; d.set.call(this, v); } });
    const t = OffscreenCanvas.prototype.transferToImageBitmap; OffscreenCanvas.prototype.transferToImageBitmap = function () { window.__g.bitmaps++; return t.call(this); };
    const g1 = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (...a) { if (/webgl/.test(a[0])) window.__g.ctx++; return g1.apply(this, a); };
  }
  const g2 = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (...a) { if (/webgl/.test(a[0])) window.__g.ctx++; return g2.apply(this, a); };
});
const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
const heap = async () => ((await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value / 1e6).toFixed(1);
const info = async () => p.evaluate(() => { const c = document.querySelector('#viewer canvas, canvas'); return { canvas: c.width + 'x' + c.height, n: document.querySelectorAll('canvas').length, g: Object.assign({}, window.__g) }; });
await p.goto('http://127.0.0.1:18431/' + (process.env.Q || '?set=_supra/crown/complexes')); await p.waitForTimeout(4000);
console.log('load   ', 'gpu', rss('gpu-process'), 'MB renderer', rss('renderer'), 'MB heap', await heap(), JSON.stringify(await info()));
await p.waitForTimeout(20000);
console.log('idle20s', 'gpu', rss('gpu-process'), 'MB renderer', rss('renderer'), 'MB heap', await heap(), JSON.stringify(await info()));
await p.mouse.move(400, 400); await p.mouse.down();
for (let i = 0; i < 600; i++) await p.mouse.move(400 + 250 * Math.sin(i / 10), 400 + 150 * Math.cos(i / 13));
await p.mouse.up(); await p.waitForTimeout(500);
console.log('drag600', 'gpu', rss('gpu-process'), 'MB renderer', rss('renderer'), 'MB heap', await heap(), JSON.stringify(await info()));
if (!/\?e=/.test(process.env.Q || '')) { for (let i = 0; i < +(process.env.N || 30); i++) { await p.evaluate((i) => pdbViewer.pick(['metal','size','ratio'][i % 3], [['Li','Na','K','Rb','Cs'],['4','5','6','7'],['1','2']][i % 3][(i >> 1) % [5,4,2][i % 3]], ['Li','Na','K','Rb','Cs'][i % 5]), i); await p.waitForTimeout(250); }
console.log('30 sw  ', 'gpu', rss('gpu-process'), 'MB renderer', rss('renderer'), 'MB heap', await heap(), JSON.stringify(await info())); }
await b.close();
