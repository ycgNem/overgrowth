// Scene census: how many objects three walks every frame, how many it draws in each pass
// (shadow, main, post) and what the GPU holds. Needs `npm run dev` on :5188.
//
//   node e2e/scene.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(5000);
const res = await page.evaluate(() => {
  const g = window.game, r = g.renderer, gl = r.getContext();
  let objects = 0, meshes = 0, visible = 0, autoUpdate = 0, casters = 0, lights = 0, sprites = 0, points = 0;
  const byType = {};
  g.scene.traverse((o) => {
    objects++;
    if (o.matrixAutoUpdate) autoUpdate++;
    if (o.isMesh) { meshes++; if (o.castShadow) casters++; }
    if (o.isSprite) sprites++;
    if (o.isPoints) points++;
    if (o.isLight) lights++;
  });
  g.scene.traverseVisible((o) => { visible++; const t = o.isInstancedMesh ? 'InstancedMesh' : o.type; byType[t] = (byType[t] || 0) + 1; });
  // draw calls per pass: count gl draws while one frame renders
  const counts = { shadow: 0, main: 0, other: 0 };
  let phase = 'other';
  const wrapGL = (name) => { const f = gl[name].bind(gl); gl[name] = (...a) => { counts[phase]++; return f(...a); }; return () => { gl[name] = f; }; };
  const un = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'].map(wrapGL);
  const sm = r.shadowMap.render.bind(r.shadowMap);
  r.shadowMap.render = (...a) => { const p = phase; phase = 'shadow'; sm(...a); phase = p; };
  const render = r.render.bind(r);
  r.render = (s, c) => { const p = phase; if (s === g.scene) phase = 'main'; render(s, c); phase = p; };
  r.shadowMap.needsUpdate = true;
  g.cullWorld();
  g.post.render(0.016, g.machete);
  un.forEach((f) => f());
  r.shadowMap.render = sm;
  r.render = render;
  return {
    objects, visible, meshes, autoUpdate, casters, lights, sprites, points, byType,
    draws: counts, programs: r.info.programs.length, memory: r.info.memory,
    jsHeapMB: +(performance.memory.usedJSHeapSize / 1e6).toFixed(0),
    pixelRatio: r.getPixelRatio(), size: [r.domElement.width, r.domElement.height],
  };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
