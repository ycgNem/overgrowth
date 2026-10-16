// Functional test of the gather -> craft -> defend loop: forage with E, craft by clicking in the
// satchel, place a tower with LMB, survive night 1 to day 2, upgrade the tower, hit with the
// slingshot, earn a boon, autosave, and lose when the Heartwood falls.
// Prints PASS/FAIL per step. Needs `npm run dev` on :5188 (or BASE=<url>).
//
//   node e2e/loop.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.4');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const ev = (f, a) => page.evaluate(f, a);
const ok = (name, v) => console.log((v ? 'PASS ' : 'FAIL ') + name);
// Hold a key until cond(arg) is true in the page, or ms pass. Hold actions run on game time and
// a frame's dt is clamped to 0.05 s, so on a busy GPU (under ~20 fps) they take longer than their
// nominal time; a fixed wait made the test flaky.
const holdUntil = async (key, cond, arg, ms = 6000) => {
  await page.keyboard.down(key);
  await page.waitForFunction(cond, arg, { timeout: ms, polling: 100 }).catch(() => {});
  await page.keyboard.up(key);
};
const fps = () => ev(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); };
  requestAnimationFrame(f);
}));

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
await page.click('.recipe button');
await page.waitForTimeout(200);
const after = await ev(() => ({ b: window.game.inventory.count('barricade'), s: window.game.inventory.count('stick') }));
ok(`craft barricade by click (${before}->${after.b}, sticks left ${after.s})`, after.b === before + 1);
// drag-free move: click slot to pick, click another to drop
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

// 5. upgrade the tower by holding E on it
const up = await ev(() => {
  const g = window.game, b = g.buildings.list[0];
  g.camp.setLevel('bench', 2); // tier 2 needs the Workbench at level 2
  for (const [id, n] of Object.entries(b.upgradeCost)) g.give(id, n);
  g.player.spawn(b.x + 3, b.z); g.player.yaw = Math.atan2(-(b.x - (b.x + 3)), 0); g.player.pitch = 0;
  g.inventory.select(7);
  return { tier: b.tier };
});
await page.waitForTimeout(300);
await holdUntil('KeyE', (t) => window.game.buildings.list[0].tier > t, up.tier);
const up2 = await ev(() => ({ tier: window.game.buildings.list[0].tier, upgraded: window.game.buildings.stats.upgraded }));
ok(`hold E upgrades the tower (tier ${up.tier}->${up2.tier})`, up2.tier === up.tier + 1);

// 6. slingshot: draw, release, the stone hits a Blightling standing in front
const sl = await ev(() => {
  const g = window.game, p = g.player.pos;
  g.give('slingshot', 1); g.give('stone', 5);
  g.inventory.select(g.inventory.slots.findIndex((s) => s && s.id === 'slingshot'));
  const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
  const e = g.enemies.spawn('blightling', p.x + fx * 7, p.z + fz * 7, 1);
  e.rise = 0; e.slow = 0.0001; e.slowT = 99;
  window.__t = e;
  g.player.pitch = Math.atan2(e.pos.y + 0.8 - (p.y + 1.62), 7) + 0.03;
  return { hp: e.hp, stones: g.inventory.count('stone') };
});
await page.waitForTimeout(700);
await page.mouse.move(800, 450);
await page.mouse.down();
await page.waitForTimeout(800);
await page.mouse.up();
await page.waitForTimeout(800);
const sl2 = await ev(() => ({ hp: window.__t.hp, dying: window.__t.dying, stones: window.game.inventory.count('stone') }));
// (a spent stone sometimes drops where it lands and is picked straight back up)
ok(`slingshot shot lands (hp ${sl.hp | 0}->${sl2.hp | 0}, stones ${sl.stones}->${sl2.stones})`, sl2.stones <= sl.stones && (sl2.hp < sl.hp || sl2.dying));

// 7. relics offered at the Heartwood earn a boon
const bo = await ev(() => {
  const g = window.game, b = g.base;
  g.give('golden_idol', 1);
  const x = b.x + 6, z = b.z; g.player.spawn(x, z); g.player.yaw = Math.atan2(-(b.x - x), 0); g.player.pitch = 0.1;
  g.inventory.select(7);
  return g.perks.length;
});
await page.waitForTimeout(300);
console.log(`  (${await fps()} fps at the Heartwood)`);
await holdUntil('KeyE', () => !document.querySelector('#perks').classList.contains('hidden'));
await page.waitForTimeout(300);
const shown = await ev(() => !document.querySelector('#perks').classList.contains('hidden'));
// a big offering can earn more than one boon: the next picker opens 0.4 s after each pick
for (let i = 0; i < 6; i++) {
  if (!(await ev(() => !document.querySelector('#perks').classList.contains('hidden')))) break;
  await page.click('.perk').catch(() => {});
  await page.waitForTimeout(700);
}
const bo2 = await ev(() => window.game.perks.length);
const picking = await ev(() => window.game.modal);
ok(`offering opens the boon picker and grants boons (${bo}->${bo2})`, shown && bo2 > bo && !picking);

// 8. a save round-trips
const sv = await ev(() => { const g = window.game; g.debug = false; g.autosave(); g.debug = true; const d = JSON.parse(localStorage.getItem('og.save.v1')); return { night: d.night, b: d.buildings.map((x) => x[0]), perks: d.perks.length }; });
ok(`autosave writes the run (${JSON.stringify(sv)})`, sv.night === 2 && sv.b.includes('bow_tower') && sv.perks === bo2);
await ev(() => localStorage.removeItem('og.save.v1'));

// 9. Heartwood falls -> game over (after the collapse)
await ev(() => { const g = window.game; g.base.damage(1e6); });
// the collapse runs on clamped frame time, so a slow frame stretches it: wait for the screen
await page.waitForFunction(() => !document.querySelector('#gameover').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
const over = await ev(() => ({ phase: window.game.waves.phase, shown: !document.querySelector('#gameover').classList.contains('hidden') }));
ok(`heartwood destroyed -> game over`, over.phase === 'over' && over.shown);
console.log(errs.slice(0, 10).join('\n'));
await browser.close();
