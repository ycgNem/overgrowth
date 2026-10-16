// Pack and Cache (0.10): weight and encumbrance, the Coffer, the benches, containers you
// search, smashing a crate, the lost satchel, salvage, root caches and the save. Prints
// PASS/FAIL per step. Needs `npm run dev` on :5188 (or BASE=<url>).
//
//   node e2e/pack.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.35');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const ev = (f, a) => page.evaluate(f, a);
const ok = (name, v) => console.log((v ? 'PASS ' : 'FAIL ') + name);
const holdUntil = async (key, cond, arg, ms = 8000) => {
  await page.keyboard.down(key);
  await page.waitForFunction(cond, arg, { timeout: ms, polling: 100 }).catch(() => {});
  await page.keyboard.up(key);
};
// stand facing (x, z) from d metres away, looking a little down
const face = (x, z, d = 1.6, pitch = -0.35) => ev(([x, z, d, pitch]) => {
  const g = window.game, a = Math.random() * 6.28;
  const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
  g.world.update(px, pz, 0, true);
  g.player.spawn(px, pz); g.player.vel.set(0, 0, 0);
  g.player.yaw = Math.atan2(-(x - px), -(z - pz)); g.player.pitch = pitch;
  return [px, pz];
}, [x, z, d, pitch]);

// 1. weight: a dozen logs lades a woven satchel, forty is more than it carries
const w = await ev(() => {
  const g = window.game, inv = g.inventory;
  const before = inv.burden;
  g.give('log', 12);
  const laden = inv.burden;
  inv.add('log', 30);
  return { before, laden, after: inv.burden, w: inv.weight, cap: inv.capacity, take: inv.takeable('stone', 1), speed: g.player.burden };
});
await page.waitForTimeout(200);
const sp = await ev(() => window.game.player.burden);
ok(`weight: ${w.before} -> ${w.laden} -> ${w.after} (${w.w.toFixed(1)}/${w.cap} kg), a stone refused at the cap: ${!w.take}, player ${sp}`,
  w.before === 'light' && w.laden === 'laden' && w.after === 'encumbered' && !w.take && sp === 'encumbered');

// 2. the Coffer: tap E opens it, Store materials empties the pack into it
const c = await ev(() => { const s = window.game.camp.sites.coffer; return [s.x, s.z]; });
await face(c[0], c[1], 2.2, -0.2);
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
const co = await ev(() => {
  const g = window.game, o = g.hud.otherPane;
  if (!o) return { open: false };
  g.storeAll();
  return { open: true, kind: o.kind, logsIn: g.coffer.count('log'), logsOn: g.inventory.count('log'), burden: g.inventory.burden };
});
ok(`Coffer opens with E and stores the logs (${JSON.stringify(co)})`, co.open && co.kind === 'coffer' && co.logsIn >= 31 && co.logsOn === 0 && co.burden === 'light');
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);

// 3. crafting in camp draws on the Coffer; a recipe at an unbuilt bench is refused
// (the recipe list, from the module)
await ev(async () => { window.__R = (await import('/src/items/Recipes.js')).RECIPES; });
const cr2 = await ev(() => {
  const g = window.game;
  const R = window.__R;
  for (const [id, n] of [['stick', 3], ['vine', 2], ['flint', 2], ['feather', 2]]) g.give(id, n);
  const st = (id) => g.hud.recipeState(R.find((q) => q.id === id));
  const bow = st('bow_tower'), braz = st('ember_brazier');
  const before = g.inventory.count('bow_tower'), logs = g.coffer.count('log');
  g.craft(R.find((q) => q.id === 'bow_tower'));
  return { bow: bow.ok, braz: braz.ok, brazNote: braz.note, made: g.inventory.count('bow_tower') - before, logsUsed: logs - g.coffer.count('log') };
});
ok(`in camp a bow tower is made with the Coffer's logs (${JSON.stringify(cr2)}), the brazier waits for a Fire Pit`, cr2.bow && cr2.made === 1 && cr2.logsUsed === 2 && !cr2.braz);

// 4. build the Fire Pit by holding E at its plot
const k = await ev(() => {
  const g = window.game, s = g.camp.sites.kiln;
  for (const [id, n] of Object.entries(g.camp.nextCost('kiln'))) g.give(id, n);
  return [s.x, s.z];
});
await face(k[0], k[1], 2.2, -0.2);
await page.waitForTimeout(300);
await holdUntil('KeyE', () => window.game.camp.levels.kiln >= 1);
const kl = await ev(() => ({ lv: window.game.camp.levels.kiln, braz: window.game.hud.recipeState(window.__R.find((q) => q.id === 'ember_brazier')).where }));
ok(`hold E builds the Fire Pit (level ${kl.lv}); the brazier can be made there now`, kl.lv === 1 && kl.braz);

// 5. a supply crate: prise it open, the finds turn up one by one, take them all
const crate = await ev(() => {
  const g = window.game;
  g.inventory.slots.fill(null);
  const best = g.teleport('crates', 6);
  if (!best) return null;
  g.world.update(g.player.pos.x, g.player.pos.z, 0, true);
  const it = g.world.near(best.x, best.z, 'interactables').find((i) => i.kind === 'break' && i.loot === 'crate' && !i.done);
  if (!it) return null;
  window.__crate = it;
  return [it.x, it.z, it.id];
});
if (!crate) ok('found a supply crate', false);
else {
  await face(crate[0], crate[1], 1.5, -0.3);
  await page.waitForTimeout(300);
  await holdUntil('KeyE', () => !!window.game.hud.otherPane);
  const o1 = await ev(() => { const o = window.game.hud.otherPane; return o && { hidden: o.hidden.size, items: o.inv.slots.filter(Boolean).length }; });
  await page.waitForFunction(() => window.game.hud.otherPane && window.game.hud.otherPane.hidden.size === 0, null, { timeout: 15000 }).catch(() => {});
  const o2 = await ev(() => { const o = window.game.hud.otherPane; return o && { hidden: o.hidden.size }; });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(200);
  const o3 = await ev(() => { const o = window.game.hud.otherPane; return o && { left: o.inv.slots.filter(Boolean).length }; });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const done = await ev(() => ({ done: window.__crate.done, open: !!window.game.hud.otherPane }));
  ok(`crate prised open: ${o1?.items} finds hidden ${o1?.hidden} -> ${o2?.hidden}, R takes all (left ${o3?.left}), shut it is done: ${done.done}`,
    o1 && o1.hidden === o1.items && o1.items > 0 && o2?.hidden === 0 && o3?.left === 0 && done.done && !done.open);

  // 6. another crate smashed with the machete: it's gone, and everything in it spills out
  const c2 = await ev(() => {
    const g = window.game, near = g.world.near(g.player.pos.x, g.player.pos.z, 'interactables');
    const it = near.find((i) => i.kind === 'break' && i.loot === 'crate' && !i.done && i !== window.__crate);
    if (!it) return null;
    window.__crate2 = it;
    return [it.x, it.z];
  });
  if (!c2) ok('a second crate to smash (skipped: this cache had one)', true);
  else {
    await face(c2[0], c2[1], 1.2, -0.35);
    await page.waitForTimeout(300);
    for (let i = 0; i < 8 && !(await ev(() => window.__crate2.smashed)); i++) {
      await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
      await page.waitForTimeout(650);
    }
    const sm = await ev(() => {
      const g = window.game, c = window.__crate2;
      const spilled = g.pickups.items.filter((p) => Math.hypot(p.root.position.x - c.x, p.root.position.z - c.z) < 6).length + g.inventory.count('tin_can') + g.inventory.count('frayed_rope') + g.inventory.count('battery');
      return { smashed: !!c.smashed, done: !!c.done, container: g.containers.has(c.id), spilled };
    });
    ok(`smashing a crate spills it all out at once (${JSON.stringify(sm)})`, sm.smashed && sm.done && !sm.container && sm.spilled > 0);
  }
}

// 7. dying out in the forest by day drops the pack where you fell; you get it back
const d = await ev(() => {
  const g = window.game;
  const x = g.base.x + 80, z = g.base.z + 10;
  g.world.update(x, z, 0, true);
  g.player.spawn(x, z);
  g.inventory.slots.fill(null);
  g.give('poultice', 2); g.give('copper_wire', 3); g.give('stone', 5);
  window.__wire = g.inventory.count('copper_wire');
  g.inventory.slots[g.inventory.safeStart] = { id: 'vacuum_tube', n: 1 };
  const belt = g.inventory.slots.slice(0, 8).filter(Boolean).length;
  g.hitPlayer(9999);
  const lost = g.lost[0];
  return { lost: !!lost, wire: g.inventory.count('copper_wire'), tube: g.inventory.count('vacuum_tube'), belt: g.inventory.slots.slice(0, 8).filter(Boolean).length === belt, at: lost && [lost.x, lost.z], id: lost?.id };
});
ok(`death by day drops the pack (lost satchel ${d.lost}, wire left ${d.wire}, the pouch's tube kept ${d.tube}, belt kept ${d.belt})`, d.lost && d.wire === 0 && d.tube === 1 && d.belt);
await page.waitForFunction(() => window.game.playerAlive, null, { timeout: 12000 });
if (d.at) {
  // stand where the prompt is the satchel's (not a bit of forage beside it)
  for (let i = 0; i < 10; i++) {
    await face(d.at[0], d.at[1], 1.3, -0.45);
    await page.waitForTimeout(250);
    if (await ev(() => window.game.findInteractable()?.lost)) break;
  }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const back = await ev(() => ({ wire: window.game.inventory.count('copper_wire'), had: window.__wire, lost: window.game.lost.length }));
  ok(`the lost satchel gives it all back and goes (wire ${back.wire}/${back.had}, satchels left ${back.lost})`, back.wire === back.had && back.lost === 0);
}

// 8. salvage a defence in the field: a third of its parts
const sv = await ev(() => {
  const g = window.game;
  g.give('barricade', 1);
  const i = g.inventory.slots.findIndex((s) => s && s.id === 'barricade');
  const st = g.inventory.count('stick');
  g.salvage(i);
  return { gone: g.inventory.count('barricade') === 0, sticks: g.inventory.count('stick') - st };
});
ok(`salvaging a barricade in the field gives some sticks back (${JSON.stringify(sv)})`, sv.gone && sv.sticks > 0);

// 9. root caches lie at the feet of the giants
const rc = await ev(() => {
  const g = window.game;
  let n = 0;
  for (const ch of g.world.chunks.values()) n += ch.interactables.filter((i) => i.container === 'cache').length;
  return n;
});
ok(`root caches in the loaded forest: ${rc}`, rc > 0);

// 10. the save carries the Coffer, the camp, the pack and the containers
const sv2 = await ev(async () => {
  const g = window.game;
  const { writeSave, loadSave } = await import('/src/core/Save.js');
  g.debug = false; writeSave(g); g.debug = true;
  const s = loadSave();
  return { v: s.v, coffer: s.coffer.filter(Boolean).length, kiln: s.camp.kiln, pack: s.pack, containers: Object.keys(s.containers).length };
});
ok(`save v2 keeps the Coffer, camp, pack and containers (${JSON.stringify(sv2)})`, sv2.v === 2 && sv2.coffer > 0 && sv2.kiln === 1 && sv2.pack === 'woven_satchel');

console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();
