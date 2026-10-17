// First use: holding and placing every defence, and holding every consumable and the
// slingshot, for the first time in a run. Each must compile no new shader program and keep
// its worst frame short; a program the load-time warm-up missed was a 0.5 s freeze the first
// time you held a barricade. Needs `npm run dev` on :5188.
//
//   node --experimental-strip-types e2e/firstuse.ts
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const IDS = ['barricade', 'spike_trap', 'bow_tower', 'spore_mortar', 'tesla_totem', 'ember_brazier', 'glow_lantern', 'vine_snare', 'heartseed', 'firepot', 'poultice', 'smoked_eel', 'orchid_salve', 'slingshot', 'pry_bar'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.45');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });
await page.waitForTimeout(3000);
let fails = 0;
for (const id of IDS) {
  const r = await page.evaluate(async (id: string) => {
    const g = (window as any).game, R = g.renderer, p0 = R.info.programs.length;
    const { ITEMS } = await import('/src/items/ItemDB.ts');
    // a defence: one placed (it builds up) and one in hand (the placement hologram)
    if (ITEMS[id].kind === 'build') g.buildings.place(id, g.player.pos.x + 4, g.player.pos.z + 4, 0);
    g.give(id, 1);
    g.inventory.selected = g.inventory.slots.findIndex((s: { id: string } | null) => s?.id === id);
    g.inventory.changed();
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      await new Promise((res) => requestAnimationFrame(res));
      worst = Math.max(worst, performance.now() - t0);
    }
    return { programs: R.info.programs.length - p0, worst: Math.round(worst) };
  }, id);
  const ok = r.programs === 0 && r.worst < 60;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${r.programs} new programs, worst frame ${r.worst} ms`);
}
console.log(fails ? `${fails} FAILED` : 'all clear');
await browser.close();
