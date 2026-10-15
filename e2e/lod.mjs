// The distant-plant LOD side by side: three views shot with the thinned far meshes on and off
// (e2e/out/lod-<view>-on|off.png). Needs `npm run dev` on :5188.
//
//   node e2e/lod.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto('http://localhost:5188/?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const views = [[14, 10, 2.4, 0.02], [-60, 45, 0.8, 0.05], [30, -40, -2.2, 0.08]];
for (const [i, [dx, dz, yaw, pitch]] of views.entries()) {
  await page.evaluate(([dx, dz, yaw, pitch]) => { const g = window.game, s = g.base; g.player.spawn(s.x + dx, s.z + dz); g.player.yaw = yaw; g.player.pitch = pitch; }, [dx, dz, yaw, pitch]);
  await page.waitForTimeout(5000);
  for (const on of [true, false]) {
    await page.evaluate((on) => { for (const p of window.game.world.pools.map.values()) if (p.lod) { p.__d ??= p.lodDist; p.lodDist = on ? p.__d : 1e9; p.dirty = true; } }, on);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `e2e/out/lod-${i}-${on ? 'on' : 'off'}.png` });
  }
}
await browser.close();
