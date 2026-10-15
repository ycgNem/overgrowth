// GPU cost per feature: parks the camera at a few views, pauses the game loop and renders frames
// back to back (synced with a 1-pixel readback), first as is, then with one costly part turned
// off at a time, so the difference is what that part costs. Needs `npm run dev` on :5188
// (or BASE=<url>); run it with the GPU otherwise idle.
//
//   node e2e/gpu.mjs [quality=high]
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const quality = process.argv[2] || 'high';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: Number(process.env.DPR || 1) });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.evaluate((q) => window.game.setQuality(q), quality);
await page.waitForTimeout(1500);

const views = [
  { name: 'spawn', go: (g) => { const s = g.base; g.player.spawn(s.x + 14, s.z + 10); g.player.yaw = 2.4; g.player.pitch = -0.05; } },
  { name: 'forest', go: (g) => { const s = g.base; g.player.spawn(s.x - 60, s.z + 45); g.player.yaw = 0.8; g.player.pitch = 0; } },
  { name: 'grove', go: (g) => { const G = g.__grove; g.player.spawn(G.x + G.r * 0.45, G.z); g.player.yaw = Math.PI / 2; g.player.pitch = -0.05; } },
];

await page.evaluate(async () => {
  const { grove } = await import('/src/world/WorldGen.js').catch(() => ({ grove: null }));
  const g = window.game;
  g.__grove = grove ? grove() : { x: g.base.x + 200, z: g.base.z, r: 120 };
});

for (const v of views) {
  await page.evaluate(`(${v.go.toString()})(window.game)`);
  // let the chunks around it stream in and the dressing settle
  await page.waitForTimeout(6000);
  const res = await page.evaluate(() => {
    const g = window.game, r = g.renderer, gl = r.getContext(), px = new Uint8Array(4);
    // stop the game loop
    const raf = window.requestAnimationFrame;
    let held = null;
    window.requestAnimationFrame = (f) => { held = f; return 0; };
    const sync = () => { r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    // ms per frame, and how much of it the CPU spent issuing it (the rest is waiting on the GPU)
    let cpu = 0;
    const bench = (n = 16) => {
      for (let i = 0; i < 2; i++) { r.shadowMap.needsUpdate = true; g.cullWorld(); g.post.render(0.016, g.machete); }
      sync();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        r.shadowMap.needsUpdate = i % 2 === 0;
        g.cullWorld();
        g.post.render(0.016, g.machete);
      }
      const t1 = performance.now();
      sync();
      const t = (performance.now() - t0) / n;
      cpu = (t1 - t0) / n;
      return t;
    };
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    const sun = g.sky.sun;
    const hide = (list) => { const was = list.map((m) => m.visible); list.forEach((m) => (m.visible = false)); return () => list.forEach((m, i) => (m.visible = was[i])); };
    const pools = () => [...g.world.pools.map.values()].map((p) => p.mesh).filter(Boolean);
    const terr = () => { const out = []; for (const ch of g.world.chunks.values()) if (ch.terrainMesh) out.push(ch.terrainMesh); return out; };
    const tests = {
      'shadows': () => { const c = sun.castShadow; sun.castShadow = false; return () => { sun.castShadow = c; }; },
      'ao': () => { const c = g.post.enabled.ao; g.post.enabled.ao = false; return () => { g.post.enabled.ao = c; }; },
      'vol light': () => { const c = g.post.enabled.vol; g.post.enabled.vol = false; return () => { g.post.enabled.vol = c; }; },
      'bloom': () => { const c = g.post.enabled.bloom; g.post.enabled.bloom = false; return () => { g.post.enabled.bloom = c; }; },
      'ssr water': () => { const c = g.post.enabled.ssr; g.post.enabled.ssr = false; return () => { g.post.enabled.ssr = c; }; },
      'grass': () => hide(g.grass.meshes),
      'litter': () => hide(g.litter.meshes),
      'ground cover': () => hide(g.groundCover.meshes),
      'plants (pools)': () => hide(pools()),
      'terrain': () => hide(terr()),
      'water': () => hide(g.water ? [g.water.mesh ?? g.water].filter((m) => m && 'visible' in m) : []),
      'pixel 0.75': () => { const pr = r.getPixelRatio(); r.setPixelRatio(pr * 0.75); g.resize(); return () => { r.setPixelRatio(pr); g.resize(); }; },
    };
    const bases = [], cpus = [];
    for (let i = 0; i < 5; i++) { bases.push(bench()); cpus.push(cpu); }
    const out = { base: +med(bases).toFixed(2), cpu: +med(cpus).toFixed(2) };
    // each part: off and on in turn, five times; the median of the differences
    for (const [k, f] of Object.entries(tests)) {
      const d = [];
      for (let i = 0; i < 5; i++) {
        const a = bench();
        const undo = f();
        const b = bench();
        undo();
        d.push(a - b);
      }
      out[k] = +med(d).toFixed(2);
    }
    window.requestAnimationFrame = raf;
    if (held) raf(held);
    return out;
  });
  console.log(v.name, JSON.stringify(res));
}
await browser.close();
