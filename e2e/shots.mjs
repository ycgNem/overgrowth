// Screenshot harness: boots the game in debug mode in headless Chrome, visits a
// fixed set of views (ground close-ups, riverbank, cliffs, clearing, temple,
// dusk) and writes PNGs. Same frames every run, so changes can be compared.
//
//   node e2e/shots.mjs [outDir] [viewName ...]
//
// BASE defaults to http://localhost:5188/ (start `npm run dev` first).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const out = process.argv[2] ?? 'e2e/out/shots';
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });

// Each view: how to find a spot (in the page), then where to look.
// find(): returns {x, z} using WorldGen. time: 0.5 = noon.
const VIEWS = [
  { name: '01-spawn', time: 0.42, find: 'spawn', pitch: -0.05 },
  { name: '02-spawn-floor', time: 0.42, find: 'spawn', pitch: -0.55, yawOff: 1.2 },
  { name: '03-floor-closeup', time: 0.42, find: 'spawn', pitch: -1.05, yawOff: 2.4 },
  { name: '04-riverbank', time: 0.45, find: 'river', pitch: -0.18 },
  { name: '05-cliffs', time: 0.47, find: 'cliff', pitch: 0.05 },
  { name: '06-clearing', time: 0.4, find: 'clearing', pitch: -0.2 },
  { name: '07-temple', time: 0.44, find: 'temple', pitch: 0.02 },
  { name: '08-dusk', time: 0.74, find: 'spawn', pitch: -0.25, yawOff: -0.9 },
  { name: '09-hillside', time: 0.5, find: 'slope', pitch: -0.3 },
];

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug');
await page.waitForFunction(() => window.game?.running, null, { timeout: 60000 });
// renderer.info resets on every render() call and the machete pass comes
// last, so record the main scene's numbers (shadow pass included) as it ends
await page.evaluate(() => {
  const g = window.game, r = g.renderer, render = r.render.bind(r);
  r.render = (scene, cam) => {
    render(scene, cam);
    if (scene === g.scene) g.__info = { calls: r.info.render.calls, tris: r.info.render.triangles };
  };
});

for (const v of VIEWS) {
  if (only.length && !only.some((o) => v.name.includes(o))) continue;
  const info = await page.evaluate(async (v) => {
    const g = window.game;
    const W = await import('/src/world/WorldGen.js');
    let spot = null;
    if (v.find === 'temple') {
      g.teleport('temple', 34, 0.5);
      spot = { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw };
    } else if (v.find === 'spawn') {
      const s = W.findSpawn();
      spot = { x: s.x, z: s.z };
    } else {
      // spiral search from spawn for the first spot matching the rule
      const s = W.findSpawn();
      const test = {
        river: (x, z) => { const h = W.terrainHeight(x, z); return h > 0.4 && h < 1.0 && W.terrainNormal(x, z).y > 0.93; },
        cliff: (x, z) => W.terrainHeight(x, z) > 2 && W.terrainNormal(x, z).y > 0.9 && W.terrainHeight(x + 30, z) > W.terrainHeight(x, z) + 12,
        clearing: (x, z) => W.jungleDensity(x, z) < 0.25 && W.terrainHeight(x, z) > 2 && W.terrainNormal(x, z).y > 0.95,
        slope: (x, z) => { const n = W.terrainNormal(x, z).y; return n > 0.8 && n < 0.88 && W.terrainHeight(x, z) > 3; },
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
      if (v.find === 'cliff') spot.yaw = Math.atan2(-30, 0); // face +x
      if (v.find === 'river') {
        // face the lowest neighbour (the water)
        let best = 0, bh = Infinity;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const h = W.terrainHeight(spot.x + Math.cos(a) * 20, spot.z + Math.sin(a) * 20);
          if (h < bh) { bh = h; best = a; }
        }
        spot.yaw = Math.atan2(-Math.cos(best), -Math.sin(best));
      }
      if (v.find === 'slope') {
        const n = W.terrainNormal(spot.x, spot.z);
        spot.yaw = Math.atan2(n.x, n.z) + Math.PI; // face uphill
      }
    }
    g.world.update(spot.x, spot.z, 0, true);
    g.player.spawn(spot.x, spot.z);
    g.player.vel.set(0, 0, 0);
    if (spot.yaw !== undefined) g.player.yaw = spot.yaw;
    else if (v.find === 'spawn') g.player.yaw = Math.atan2(-(g.base.x - spot.x), -(g.base.z - spot.z));
    g.player.yaw += v.yawOff ?? 0;
    g.player.pitch = v.pitch;
    g.sky.time = v.time;
    return { x: spot.x.toFixed(1), z: spot.z.toFixed(1) };
  }, v);
  if (info.missing) { console.log(`${v.name}: no spot found`); continue; }
  // let shadows, sky and streaming settle
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 40 ? r() : requestAnimationFrame(f)); f(); }));
  await page.evaluate((v) => { window.game.player.pitch = v.pitch; window.game.sky.time = v.time; }, v);
  await page.waitForTimeout(150);
  const file = path.join(out, `${v.name}.png`);
  await page.screenshot({ path: file });
  const ri = await page.evaluate(() => window.game.__info);
  console.log(`${v.name}: ${file} @ ${info.x},${info.z}  calls ${ri.calls}  tris ${(ri.tris / 1e6).toFixed(2)}M`);
}

const stats = await page.evaluate(() => {
  const i = window.game.renderer.info;
  return { geometries: i.memory.geometries, textures: i.memory.textures };
});
console.log('memory', JSON.stringify(stats));
if (errors.length) console.log('errors:\n' + errors.join('\n'));
await browser.close();
