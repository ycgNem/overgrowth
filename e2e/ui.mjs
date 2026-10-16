// Screenshots of the satchel and the things opened beside it: the camp (Coffer and benches),
// the satchel with crafting, the Coffer pane, a crate being searched. Needs `npm run dev`.
//
//   node e2e/ui.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'e2e/out/ui';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.4');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const ev = (f, a) => page.evaluate(f, a);
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };

// the camp, from where you respawn, looking at the Coffer and the benches
await ev(() => {
  const g = window.game;
  g.camp.setLevel('kiln', 1);
  g.camp.setLevel('tinker', 0);
  g.camp.setLevel('bench', 3);
  const c = g.camp.sites.coffer, b = g.base;
  const x = c.x + (c.x - b.x) * 0.55, z = c.z + (c.z - b.z) * 0.55;
  g.player.spawn(x, z); g.player.yaw = Math.atan2(-(c.x - x), -(c.z - z)); g.player.pitch = -0.12;
});
await page.waitForTimeout(1500);
await shot('camp');
// the satchel with some weight in it
await ev(() => {
  const g = window.game;
  for (const [id, n] of [['log', 2], ['stick', 12], ['stone', 6], ['flint', 3], ['copper_wire', 2], ['vine', 4], ['feather', 3]]) g.give(id, n);
  g.inventory.slots[g.inventory.safeStart] = { id: 'vacuum_tube', n: 1 };
  for (const [id, n] of [['log', 9], ['clay', 4], ['resin', 5], ['mushroom', 8]]) g.coffer.add(id, n);
});
await page.keyboard.press('Tab');
await shot('satchel');
await ev(() => window.game.hud.toggleInventory(false));
await ev(() => window.game.openCoffer());
await shot('coffer');
await ev(() => window.game.closePane());
// a crate mid-search
const ok = await ev(() => {
  const g = window.game;
  const best = g.teleport('crates', 5);
  if (!best) return false;
  g.world.update(g.player.pos.x, g.player.pos.z, 0, true);
  const it = g.world.near(best.x, best.z, 'interactables').find((i) => i.kind === 'break' && !i.done);
  if (!it) return false;
  const rec = g.containers.make(it.id, ['copper_wire', 'battery', 'tin_can', 'compass', 'frayed_rope'], 6);
  g.openContainer(it, rec);
  return true;
});
if (ok) {
  await page.waitForTimeout(1300);
  await shot('crate');
}
await browser.close();
