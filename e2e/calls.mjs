// Draw calls: stands at spawn (and at the temple and wreck) and counts the main scene's draw
// calls and triangles with and without the sun's shadow pass, the plant meshes in the world,
// and the GPU-bound frame time over two seconds. Needs `npm run dev` on :5188.
//
//   node e2e/calls.mjs
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
  const g = window.game, r = g.renderer, render = r.render.bind(r);
  r.render = (scene, cam) => {
    render(scene, cam);
    if (scene === g.scene) g.__info = { calls: r.info.render.calls, tris: r.info.render.triangles };
  };
});

const measure = () => page.evaluate(async () => {
  const g = window.game, w = g.world;
  w.update(g.player.pos.x, g.player.pos.z, 0, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1200);
  const all = { ...g.__info };
  const sun = g.sky.sun;
  sun.castShadow = false;
  await wait(400);
  const main = { ...g.__info };
  sun.castShadow = true;
  await wait(400);
  let plants = 0, instances = 0;
  g.scene.traverse((o) => {
    if (o.isInstancedMesh && o.visible) { plants++; instances += o.count; }
  });
  const dts = [];
  let last = performance.now();
  await new Promise((done) => {
    const tick = () => {
      const now = performance.now();
      dts.push(now - last);
      last = now;
      if (dts.length < 120) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  dts.sort((a, b) => a - b);
  return {
    calls: all.calls, mainCalls: main.calls, tris: +(all.tris / 1e6).toFixed(2), mainTris: +(main.tris / 1e6).toFixed(2),
    instancedMeshes: plants, instances, pools: g.world.pools?.stats(), p50: +dts[60].toFixed(1), p95: +dts[114].toFixed(1),
  };
});

await page.waitForTimeout(1500);
console.log('spawn ', JSON.stringify(await measure()));
for (const poi of ['temple', 'wreck']) {
  await page.evaluate((p) => window.game.teleport(p, 30, 0.5), poi);
  console.log(poi.padEnd(7), JSON.stringify(await measure()));
}
await browser.close();
