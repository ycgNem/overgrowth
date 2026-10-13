// Functional test of the gather -> craft -> defend loop: forage with E, craft by clicking in the
// satchel, place a tower with LMB, survive night 1 to day 2, and lose when the Heartwood falls.
// Prints PASS/FAIL per step. Needs `npm run dev` on :5188.
//
//   node e2e/loop.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:5188/?debug&t=0.4');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const ev = (f, a) => page.evaluate(f, a);
const ok = (name, v) => console.log((v ? 'PASS ' : 'FAIL ') + name);

// 1. forage: stand next to the nearest forage item, look at it, tap E
const f = await ev(() => {
  const g = window.game; const p = g.player.pos; let best = null, bd = 1e9;
  for (const it of g.world.near(p.x, p.z, 'interactables')) if (it.kind === 'forage' && !it.done) { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = it; } }
  if (!best) return null;
  const x = best.x + 1.0, z = best.z; g.player.spawn(x, z); g.player.yaw = Math.atan2(-(best.x - x), -(best.z - z)); g.player.pitch = -0.6;
  window.__f = best; return { id: best.id, before: g.inventory.count(best.id) };
});
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
const f2 = await ev(() => ({ after: window.game.inventory.count(window.__f.id), done: window.__f.done, prompt: document.querySelector('#prompt .label').textContent }));
ok(`forage ${f?.id} picked with E (${f?.before}->${f2.after})`, f && f2.after === f.before + 1 && f2.done);

// 2. craft a barricade by clicking in the satchel
await ev(() => { const g = window.game; for (const [id, n] of [['stick', 4], ['thorns', 3], ['vine', 1]]) g.give(id, n); });
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
const before = await ev(() => window.game.inventory.count('barricade'));
await page.click('.recipe:nth-child(1) button');
await page.waitForTimeout(200);
const after = await ev(() => ({ b: window.game.inventory.count('barricade'), s: window.game.inventory.count('stick') }));
ok(`craft barricade by click (${before}->${after.b}, sticks left ${after.s})`, after.b === before + 1);
// drag-free move: click slot to pick, click another to drop
const mv = await ev(() => { const g = window.game; return g.inventory.slots.findIndex((s) => s && s.id === 'barricade'); });
await page.click(`#inv-belt .slot:nth-child(8)`).catch(()=>{});
await page.keyboard.press('Tab');
await page.waitForTimeout(200);

// 3. place the bow tower with LMB at a valid spot
await ev(() => {
  const g = window.game, b = g.base; const x = b.x + 14, z = b.z + 3; g.player.spawn(x + 5, z); g.player.yaw = Math.atan2(-(x - (x + 5)), 0); g.player.pitch = -0.45;
  const i = g.inventory.slots.findIndex((s) => s && s.id === 'bow_tower'); g.inventory.select(i);
});
await page.waitForTimeout(400);
const ghost = await ev(() => ({ valid: window.game.ghost.valid, reason: window.game.ghost.reason }));
await page.mouse.click(800, 450);
await page.waitForTimeout(300);
const pl = await ev(() => ({ n: window.game.buildings.list.length, inv: window.game.inventory.count('bow_tower') }));
ok(`place bow tower with LMB (ghost valid=${ghost.valid} ${ghost.reason || ''})`, pl.n === 1 && pl.inv === 0);

// 4. a full night: skip to dusk, fast forward, kill everything, reach day 2
await ev(() => { const g = window.game; g.skipToNight(); g.hitPlayer = () => {}; });
await page.waitForFunction(() => window.game.waves.phase === 'night', null, { timeout: 15000 }).catch(() => {});
const n1 = await ev(() => ({ phase: window.game.waves.phase, rifts: window.game.rifts.map(r => r.target) }));
ok(`dusk starts night (${n1.phase})`, n1.phase === 'night');
// kill the wave as it spawns
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(500);
  const s = await ev(() => { const g = window.game; for (const e of g.enemies.list) if (!e.dying && e.rise <= 0.2) g.enemies.damage(e, 9999, g.combatCtx); return { phase: g.waves.phase, rem: g.waves.remaining, night: g.waves.night }; });
  if (s.phase !== 'night') break;
}
await page.waitForFunction(() => window.game.waves.phase === 'day', null, { timeout: 30000 }).catch(() => {});
const d2 = await ev(() => ({ phase: window.game.waves.phase, night: window.game.waves.night, t: window.game.sky.time, kills: window.game.enemies.kills }));
ok(`wave cleared -> day 2 (${JSON.stringify(d2)})`, d2.phase === 'day' && d2.night === 2);

// 5. Heartwood falls -> game over
await ev(() => { const g = window.game; g.base.damage(1e6); });
await page.waitForTimeout(300);
const over = await ev(() => ({ phase: window.game.waves.phase, shown: !document.querySelector('#gameover').classList.contains('hidden') }));
ok(`heartwood destroyed -> game over`, over.phase === 'over' && over.shown);
console.log(errs.slice(0, 10).join('\n'));
await browser.close();
