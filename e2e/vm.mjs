// Viewmodel poses: boots the game once and renders the held machete in each candidate pose.
//   node e2e/vm.mjs <outDir> '<json [{name, p:[x,y,z], dir:[..], arm:[..], face?, time?, pitch?, swing?:seconds}]>'
// A shot with `pose` (a name) shows a built-in pose; `swing` fires a swing and waits that long.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug');
await page.waitForFunction(() => window.game?.running && window.game.machete.hand, null, { timeout: 90000 });
await page.evaluate(() => { document.querySelector('#hud')?.style.setProperty('opacity', '0'); });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); f(); }), n);
for (const v of shots) {
  await page.evaluate((v) => {
    const g = window.game, m = g.machete;
    g.sky.time = v.time ?? 0.42;
    g.player.pitch = v.pitch ?? 0;
    if (v.lerp) {
      const [a, b, w] = v.lerp, A = m.poses[a], B = m.poses[b];
      m.poses.test = { p: A.p.clone().lerp(B.p, w), q: A.q.clone().slerp(B.q, w) };
      m.debugPose = 'test';
    } else if (v.p) { m.poses.test = m.makePose(v.p, v.dir, v.arm, v.face); m.debugPose = 'test'; } else m.debugPose = v.pose ?? null;
    if (v.swing !== undefined) { m.debugPose = null; m.cooldown = 0; m.swing(); }
    // hold an item (e.g. 'slingshot'): the game equips the viewmodel from what's held
    if (v.hold !== undefined) Object.defineProperty(g.inventory, 'held', { get: () => (v.hold ? { id: v.hold } : null), configurable: true });
  }, v);
  if (v.swing !== undefined) await page.waitForTimeout(v.swing * 1000); else await frames(v.hold !== undefined ? 40 : 6);
  const file = path.join(out, `${v.name}.png`);
  await page.screenshot({ path: file });
  console.log(`${v.name}: ${file}`);
}
await browser.close();
