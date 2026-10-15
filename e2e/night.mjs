// Night readability: the clearing at full night with a fire, a lantern and a pack of Blight
// coming in, from the player's eye. Writes one screenshot per time of day given.
//
//   node e2e/night.mjs [outDir] [t1,t2,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const out = process.argv[2] ?? 'e2e/out/night';
const times = (process.argv[3] ?? '0.86,0.95,0.12').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(`${BASE}?debug&t=0.95`);
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.game, b = g.base;
  g.hitPlayer = () => {};
  g.hitBase = () => {};
  const a = 1.0;
  g.buildings.place('ember_brazier', b.x + Math.sin(a + 0.5) * 13, b.z + Math.cos(a + 0.5) * 13, 0, { instant: true });
  g.buildings.place('glow_lantern', b.x + Math.sin(a - 0.4) * 15, b.z + Math.cos(a - 0.4) * 15, 0, { instant: true });
  window.__spawn = () => {
    g.enemies.clear();
    const types = ['blightling', 'blightling', 'blightling', 'rotboar', 'spitter', 'burrower', 'wisp', 'blightling'];
    types.forEach((t, i) => {
      const e = g.enemies.spawn(t, b.x + Math.sin(a + (i - 4) * 0.09) * (24 + (i % 3) * 2), b.z + Math.cos(a + (i - 4) * 0.09) * (24 + (i % 3) * 2), 1);
      e.rise = 0;
      e.digCD = 99;
    });
  };
  const px = b.x + Math.sin(a) * 9, pz = b.z + Math.cos(a) * 9;
  g.player.spawn(px, pz);
  g.player.yaw = Math.atan2(-Math.sin(a), -Math.cos(a));
  g.player.pitch = -0.08;
});
for (const t of times) {
  await page.evaluate((t) => { window.game.sky.time = t; window.__spawn(); }, t);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/night-${t}.png` });
}
await browser.close();
