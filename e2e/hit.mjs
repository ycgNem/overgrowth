// Machete interactions: stands in front of a plant type, swings a few times and captures
// what the blade left (gashes, scrapes, cut stubs, fallen tops, chips in the air).
//   node e2e/hit.mjs <outDir> '<json [{name, type, dist?, around?, swings?, pitch?, wait?, mid?}]>'
// mid: also capture a frame this many ms after the first swing's hit (particles in flight)
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
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text().slice(0, 300)}`); });
await page.goto(BASE + '?debug');
await page.waitForFunction(() => window.game?.running && window.game.machete.hand, null, { timeout: 90000 });
await page.evaluate(() => { document.querySelector('#hud')?.style.setProperty('opacity', '0'); });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); f(); }), n);
for (const v of shots) {
  const info = await page.evaluate(async (v) => {
    const g = window.game;
    const W = await import('/src/world/WorldGen.js');
    const s = W.findSpawn(), CS = W.CHUNK_SIZE, found = [];
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
    const d = v.dist ?? 2, a = v.around ?? 0.7;
    const x = it.x + Math.sin(a) * d, z = it.z + Math.cos(a) * d;
    g.world.update(x, z, 0, true);
    g.player.spawn(x, z);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = Math.atan2(x - it.x, z - it.z) + (v.turn ?? 0);
    g.player.pitch = v.pitch ?? -0.1;
    g.sky.time = 0.42;
    return { x: x.toFixed(1), z: z.toFixed(1) };
  }, v);
  if (info.missing) { console.log(`${v.name}: no ${v.type}`); continue; }
  await frames(30);
  const n = v.swings ?? 3;
  for (let k = 0; k < n; k++) {
    await page.evaluate((p) => { const g = window.game; g.player.pitch = p; g.machete.cooldown = 0; if (g.machete.swing()) g.audio.swing(); }, v.pitch ?? -0.1);
    if (k === 0 && v.mid) {
      await page.waitForTimeout(v.mid);
      await page.screenshot({ path: path.join(out, `${v.name}_mid.png`) });
    }
    await page.waitForTimeout(650);
  }
  await page.waitForTimeout(v.wait ?? 200);
  const file = path.join(out, `${v.name}.png`);
  await page.screenshot({ path: file });
  const st = await page.evaluate(() => {
    const g = window.game, M = g.marks.kinds;
    const f = (m) => m && [m.pos.x, m.pos.y, m.pos.z].map((v) => v.toFixed(2)).join(',');
    return { wood: M.wood.list.length, stone: M.stone.list.length, stubs: g.world.stubs.n, last: f(M.wood.list.at(-1)) + ' / ' + f(M.stone.list.at(-1)), eye: f({ pos: g.camera.position }) };
  });
  if (v.hide) {
    await page.evaluate(() => { window.game.machete.root.visible = false; window.game.machete.scene.visible = false; });
    await frames(2);
    await page.screenshot({ path: path.join(out, `${v.name}_clean.png`) });
    await page.evaluate(() => { window.game.machete.scene.visible = true; });
  }
  console.log(`${v.name}: ${file} @ ${info.x},${info.z} marks wood ${st.wood} stone ${st.stone} stubs ${st.stubs} last ${st.last} eye ${st.eye}`);
}
await browser.close();
