// One-off views for tuning: boots the game once, then renders each shot described in a JSON
// list and writes PNGs. A shot can set the spot (same finders as shots.mjs, or x/z), yaw,
// pitch, time of day, and any PostFX/sky knobs through `eval` (run in the page).
//
//   node e2e/view.mjs <outDir> '<json array of shots>'
//   shot: { name, find?: 'spawn'|'river'|'cliff'|'clearing'|'slope'|'temple'|'base', x?, z?,
//           yaw?, yawOff?, pitch?, time?, eval?: "js run before the capture", settle?: frames,
//           poi?: 'camp'|'wreck'|'crates'|... (stand `dist` m from the nearest one, `around` rad),
//           find: 'grove' stands `dist` m from the drowned grove's heart }
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const out = process.argv[2];
const shots = JSON.parse(process.argv[3]);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${m.text().slice(0, 500)}`); });
await page.goto(BASE + '?debug');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.evaluate(() => {
  document.querySelector('#hud')?.style.setProperty('opacity', '0');
  const g = window.game, r = g.renderer, render = r.render.bind(r);
  r.render = (scene, cam) => {
    render(scene, cam);
    if (scene === g.scene) g.__info = { calls: r.info.render.calls, tris: r.info.render.triangles };
  };
});
for (const v of shots) {
  const info = await page.evaluate(async (v) => {
    const g = window.game;
    const W = await import('/src/world/WorldGen.js');
    let spot = null;
    const s = W.findSpawn();
    if (v.x !== undefined) spot = { x: v.x, z: v.z };
    else if (v.type) {
      // stand `dist` metres from the nth planned plant of a type near spawn, facing it
      const CS = W.CHUNK_SIZE, found = [];
      const c0x = Math.floor(s.x / CS), c0z = Math.floor(s.z / CS);
      for (let r = 0; r < 6 && found.length <= (v.nth ?? 0); r++) {
        for (let cx = c0x - r; cx <= c0x + r; cx++) {
          for (let cz = c0z - r; cz <= c0z + r; cz++) {
            if (Math.max(Math.abs(cx - c0x), Math.abs(cz - c0z)) !== r) continue;
            for (const it of g.world.plan(cx, cz).items) if (it.type === v.type) found.push(it);
          }
        }
      }
      const it = found[Math.min(v.nth ?? 0, found.length - 1)];
      if (!it) return { missing: true };
      const d = v.dist ?? 3, a = v.around ?? 0.7;
      spot = { x: it.x + Math.sin(a) * d, z: it.z + Math.cos(a) * d };
      spot.yaw = Math.atan2(spot.x - it.x, spot.z - it.z);
    } else if (v.find === 'grove') {
      // stand `dist` m from the grove's heart (default: on its fringe facing in), `around` rad
      const G = W.grove(), d = v.dist ?? G.r * 0.8, a = v.around ?? Math.atan2(g.base.x - G.x, g.base.z - G.z);
      spot = { x: G.x + Math.sin(a) * d, z: G.z + Math.cos(a) * d };
      spot.yaw = Math.atan2(spot.x - G.x, spot.z - G.z);
    } else if (v.poi) {
      if (!g.teleport(v.poi, v.dist ?? 10, v.around ?? 0.5)) return { missing: true };
      spot = { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw };
    } else if (v.find === 'temple') { g.teleport('temple', 34, 0.5); spot = { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw }; }
    else if (v.find === 'base') spot = { x: g.base.x + 14, z: g.base.z + 6, yaw: Math.atan2(14, 6) };
    else if (!v.find || v.find === 'spawn') spot = { x: s.x, z: s.z, yaw: Math.atan2(-(g.base.x - s.x), -(g.base.z - s.z)) };
    else {
      const test = {
        river: (x, z) => { const h = W.terrainHeight(x, z); return h > 0.4 && h < 1.0 && W.terrainNormal(x, z).y > 0.93; },
        cliff: (x, z) => W.terrainHeight(x, z) > 2 && W.terrainNormal(x, z).y > 0.9 && W.terrainHeight(x + 30, z) > W.terrainHeight(x, z) + 12,
        clearing: (x, z) => W.jungleDensity(x, z) < 0.25 && W.terrainHeight(x, z) > 2 && W.terrainNormal(x, z).y > 0.95,
        slope: (x, z) => { const n = W.terrainNormal(x, z).y; return n > 0.8 && n < 0.88 && W.terrainHeight(x, z) > 3; },
        jungle: (x, z) => W.jungleDensity(x, z) > 0.85 && W.terrainHeight(x, z) > 3 && W.terrainNormal(x, z).y > 0.93,
      }[v.find];
      outer: for (let r = 20; r < 2500; r += 9) {
        const steps = Math.max(8, Math.floor(r / 3));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          if (test(x, z)) { spot = { x, z }; break outer; }
        }
      }
      if (!spot) return { missing: true };
      if (v.find === 'cliff') spot.yaw = Math.atan2(-30, 0);
      if (v.find === 'river') {
        let best = 0, bh = Infinity;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const h = W.terrainHeight(spot.x + Math.cos(a) * 20, spot.z + Math.sin(a) * 20);
          if (h < bh) { bh = h; best = a; }
        }
        spot.yaw = Math.atan2(-Math.cos(best), -Math.sin(best));
      }
    }
    g.world.update(spot.x, spot.z, 0, true);
    g.player.spawn(spot.x, spot.z);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = (v.yaw ?? spot.yaw ?? 0) + (v.yawOff ?? 0);
    g.player.pitch = v.pitch ?? 0;
    g.sky.time = v.time ?? 0.42;
    if (v.eval) (0, eval)(v.eval);
    return { x: spot.x.toFixed(1), z: spot.z.toFixed(1) };
  }, v);
  if (info.missing) { console.log(`${v.name}: no spot`); continue; }
  const settle = v.settle ?? 40;
  await page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); f(); }), settle);
  await page.evaluate((v) => { const g = window.game; g.player.pitch = v.pitch ?? 0; g.sky.time = v.time ?? 0.42; if (v.eval) (0, eval)(v.eval); }, v);
  await page.waitForTimeout(120);
  const file = path.join(out, `${v.name}.png`);
  await page.screenshot({ path: file });
  const ri = await page.evaluate(() => window.game.__info);
  console.log(`${v.name}: ${file} @ ${info.x},${info.z} calls ${ri?.calls} tris ${((ri?.tris ?? 0) / 1e6).toFixed(2)}M`);
}
await browser.close();
