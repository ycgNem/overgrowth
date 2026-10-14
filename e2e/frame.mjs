// Frame cost at a few fixed views: draw calls and triangles of the shadow pass and the main pass
// separately, and the CPU time of the whole frame, averaged over 90 frames each.
// Needs `npm run dev` (BASE overrides the URL).
//
//   node e2e/frame.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.game, r = g.renderer, info = r.info;
  info.autoReset = false;
  const stats = (window.__fs = { shadow: { calls: 0, tris: 0, n: 0 }, main: { calls: 0, tris: 0, n: 0 }, cpu: [] });
  const sm = r.shadowMap, shadowRender = sm.render.bind(sm);
  sm.render = (...a) => {
    const c0 = info.render.calls, t0 = info.render.triangles;
    shadowRender(...a);
    // the shadow map only renders on frames that ask for it; count those
    if (info.render.calls > c0) {
      stats.shadow.calls += info.render.calls - c0;
      stats.shadow.tris += info.render.triangles - t0;
      stats.shadow.n++;
    }
  };
  const render = r.render.bind(r);
  r.render = (scene, cam) => {
    const c0 = info.render.calls, t0 = info.render.triangles;
    const s0 = stats.shadow.calls, st0 = stats.shadow.tris;
    render(scene, cam);
    if (scene === g.scene) {
      stats.main.calls += info.render.calls - c0 - (stats.shadow.calls - s0);
      stats.main.tris += info.render.triangles - t0 - (stats.shadow.tris - st0);
      stats.main.n++;
    }
  };
  const frame = g.frame.bind(g);
  g.frame = (...a) => {
    const t = performance.now();
    frame(...a);
    stats.cpu.push(performance.now() - t);
  };
});

const views = [
  { name: 'start', js: 'window.game.respawn()' },
  { name: 'jungle', x: -21.6, z: -30.3, yaw: 0 },
  { name: 'river', x: 85.5, z: 25.9, yaw: 1.2 },
];
for (const v of views) {
  await page.evaluate((v) => {
    const g = window.game;
    if (v.js) (0, eval)(v.js);
    else {
      g.world.update(v.x, v.z, 0, true);
      g.player.spawn(v.x, v.z);
      g.player.yaw = v.yaw;
    }
    g.player.pitch = 0;
  }, v);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const s = window.__fs;
    s.shadow = { calls: 0, tris: 0, n: 0 }; s.main = { calls: 0, tris: 0, n: 0 }; s.cpu = [];
  });
  await page.evaluate(() => new Promise((res) => { let k = 0; const f = () => (++k > 90 ? res() : requestAnimationFrame(f)); f(); }));
  const r = await page.evaluate(() => {
    const s = window.__fs, cpu = s.cpu.slice().sort((a, b) => a - b);
    const avg = (o) => ({ calls: Math.round(o.calls / Math.max(1, o.n)), tris: +(o.tris / Math.max(1, o.n) / 1e6).toFixed(2), passes: o.n });
    return { shadow: { ...avg(s.shadow), perFrame: Math.round(s.shadow.calls / Math.max(1, s.main.n)) }, main: avg(s.main), cpuMs: { p50: +cpu[Math.floor(cpu.length / 2)].toFixed(1), p90: +cpu[Math.floor(cpu.length * 0.9)].toFixed(1) } };
  });
  console.log(`${v.name}: ${JSON.stringify(r)}`);
}
await browser.close();
