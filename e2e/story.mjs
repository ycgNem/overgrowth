// The Lost Expedition (0.12): torn pages and the Notes tab, a map page's mark, the seals, the
// Thornback's heart and grafts, the Rot (spread, burned, warded), Hollis's radio and a supply
// drop, the Signs, the Rot Mother's eggs, the endings and the save. Prints PASS/FAIL per step.
// Needs `npm run dev` on :5188 (or BASE=<url>).
//
//   node e2e/story.mjs
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

// 1. the first camp searched has a page in it; taking it reads it (into the Notes tab)
const p1 = await ev(() => {
  const g = window.game;
  const it = { id: 'test:camp', loot: 'camp', label: 'Search backpack', x: 0, y: 0, z: 0 };
  const rec = g.containers.roll(it, g.rand);
  const page = rec.inv.slots.findIndex((s) => s?.id === 'torn_page');
  if (page < 0) return { page: false };
  rec.hidden.clear();
  g.inventory.add('torn_page', 1);
  rec.inv.slots[page] = null;
  g.expedition.update();
  g.hud.toggleInventory(true);
  g.hud.tab = 'notes';
  g.hud.renderInventory();
  const tab = !document.getElementById('inv-notes').classList.contains('hidden') && document.querySelector('#inv-notes .note-page h4')?.textContent;
  g.hud.toggleInventory(false);
  return { page: true, read: g.expedition.read, notes: g.hud.notes.length, tab, left: g.inventory.count('torn_page') };
});
ok(`a page in the first camp searched, read on pickup, in the Notes tab (${JSON.stringify(p1)})`, p1.page && p1.read.length === 1 && p1.notes === 1 && p1.tab && p1.left === 0);

// 2. a map page marks a root cache on the compass
const p2 = await ev(() => {
  const g = window.game, X = g.expedition;
  g.waves.setNight(2);
  // the guide's page (which tells of three doors) and then the map
  X.read = ['vane1', 'hollis1'];
  g.inventory.add('torn_page', 2);
  X.update();
  const m = g.hud.markers.find((q) => q.key === 'map:map1');
  return { read: X.read.at(-1), marker: !!m, seals: g.hud.markers.filter((q) => q.cls?.startsWith('seal')).length };
});
ok(`the map page marks a cache, and the seals are on the compass (${JSON.stringify(p2)})`, p2.read === 'map1' && p2.marker && p2.seals === 3);

// 3. the seals: a relic in the Water Seal puts the grove's rift to sleep for two nights
const p3 = await ev(() => {
  const g = window.game, X = g.expedition, s = X.sites.shrine;
  g.waves.setNight(4);
  g.inventory.add('jade_figurine', 1);
  const relic = X.sealRelic('shrine');
  X.setSeal('shrine', relic, false);
  const asleep = X.dormant(s.rift);
  const open = g.waves.openRifts().includes(s.rift);
  g.waves.setNight(6);
  const awake = !X.dormant(s.rift);
  g.waves.setNight(4);
  return { relic, asleep, open, awake, until: X.seals.shrine.until, beam: !!s.beam, grove: !!s.rift?.grove };
});
ok(`the Water Seal holds the grove rift until night 6 (${JSON.stringify(p3)})`, p3.relic === 'jade_figurine' && p3.asleep && !p3.open && p3.awake && p3.until === 6 && p3.beam && p3.grove);

// 4. the Thornback's heart into the Workbench, then a lens grafted onto a tier 2 bow tower
const p4 = await ev(() => {
  const g = window.game, b = g.base;
  g.give('thornback_heart', 1);
  g.learnGrafting();
  const t = g.buildings.place('bow_tower', b.x + 12, b.z - 4, 0, { instant: true });
  const r0 = t.stat('range', g.mods), slots1 = t.graftRoom;
  t.upgrade();
  const r1 = t.stat('range', g.mods);
  g.give('glowcap_lens', 1);
  g.graftOn(t, 'glowcap_lens');
  const r2 = t.stat('range', g.mods);
  const anchorOnWall = g.buildings.place('barricade', b.x - 12, b.z + 6, 0, { instant: true }).canGraft('root_anchor');
  return { grafting: g.expedition.grafting, slots1, slots2: t.graftRoom, ratio: +(r2 / r1).toFixed(3), r0, sprite: t.obj.children.some((c) => c.name === 'Graft'), anchorOnWall };
});
ok(`grafting learned; a lens on a tier 2 tower: +20% range, a bead on it (${JSON.stringify(p4)})`, p4.grafting && p4.slots1 === 0 && p4.slots2 === 0 && p4.ratio === 1.2 && p4.sprite && !p4.anchorOnWall);

// 5. the Rot: it spreads from the rifts at night 6's dawn, burns back, and a Heartseed wards it
const p5 = await ev(() => {
  const g = window.game, R = g.rot, r = g.rifts[0];
  R.spread(6, g.rifts, () => true, []);
  R.spread(7, g.rifts, () => true, []);
  const at = R.at(r.x, r.z), near = R.at(g.base.x, g.base.z);
  g.burnRot(r.x, r.z, 4, 1);
  const burnt = R.at(r.x, r.z);
  const dx = g.base.x - r.x, dz = g.base.z - r.z, dl = Math.hypot(dx, dz);
  const wx = r.x + (dx / dl) * 6, wz = r.z + (dz / dl) * 6;
  const before = R.at(wx, wz);
  R.clearAround(wx, wz, 9, 3);
  g.world.wearAll();
  return { any: R.any, at: +at.toFixed(2), heart: +near.toFixed(2), burnt: +burnt.toFixed(2), before: +before.toFixed(2), after: +R.at(wx, wz).toFixed(2), share: +R.share.toFixed(3) };
});
ok(`the Rot spreads from the rifts (not the Heart), burns away, and a ward clears it (${JSON.stringify(p5)})`, p5.any && p5.at > 0.8 && p5.heart === 0 && p5.burnt < 0.05 && p5.before > 0.5 && p5.after < 0.05);

// 6. Hollis's radio: a part fitted at the Tinker's Bench calls a drop at noon, Husks on it
const p6 = await ev(() => {
  const g = window.game, X = g.expedition;
  g.camp.setLevel('tinker', 1);
  const src = g.craftContext().src;
  g.give('vacuum_tube', 1);
  X.fitPart(src);
  const pending = X.pendingDrops;
  g.waves.phase = 'day';
  g.sky.time = 0.5;
  const husks0 = g.enemies.list.filter((e) => e.type === 'husk').length;
  X.update();
  const d = X.drops[0];
  const husks = g.enemies.list.filter((e) => e.type === 'husk').length - husks0;
  let loot = 0;
  if (d) loot = g.containers.roll(d, g.rand).inv.slots.filter(Boolean).length;
  return { radio: X.radio, pending, drops: X.drops.length, marker: !!g.hud.markers.find((m) => m.key === d?.id), husks, loot };
});
ok(`a radio part calls a supply drop at noon, with Husks closing in (${JSON.stringify(p6)})`, p6.radio === 1 && p6.pending === 1 && p6.drops === 1 && p6.marker && p6.husks >= 3 && p6.loot >= 3);
await ev(() => { const g = window.game; for (const d of [...g.expedition.drops]) g.expedition.removeDrop(d); for (const e of g.enemies.list) if (e.type === 'husk') g.enemies.crumble(e); });

// 7. the Signs: night 4 is fog (towers see 30% less), night 6 the Swarm (or the Blood Moon with the idol)
const p7 = await ev(() => {
  const g = window.game, t = g.buildings.list.find((b) => b.id === 'bow_tower');
  const r0 = t.stat('range', g.mods);
  g.applySign('fog');
  const r1 = t.stat('range', g.mods);
  g.applySign(null);
  const s6 = g.waves.signOf(6);
  g.give('golden_idol', 1);
  const s6idol = g.waves.signOf(6);
  g.inventory.remove('golden_idol', 1);
  return { ratio: +(r1 / r0).toFixed(2), s4: g.waves.signOf(4), s6, s6idol, s8: g.waves.signOf(8), s10: g.waves.signOf(10) };
});
ok(`Signs: ${JSON.stringify(p7)}`, p7.ratio === 0.7 && p7.s4 === 'fog' && p7.s6 === 'swarm' && p7.s6idol === 'blood' && p7.s8 === 'still' && !p7.s10);

// 7b. the true ending waits for the moon: carrying the idol brings a Blood Moon on the next
// sign night, the Sun Seal stays cold until it has answered one, then takes it home
const p7b = await ev(() => {
  const g = window.game, X = g.expedition;
  X.moonHeld = false;
  g.inventory.add('golden_idol', 1);
  const s4 = g.waves.signOf(4), s8 = g.waves.signOf(8);
  const cold = X.sealRelic('temple');
  g.waves.sign = 'blood';
  X.onDawn();
  const out = { s4, s8, cold, moon: X.moonHeld, home: X.sealRelic('temple') };
  g.inventory.remove('golden_idol', 1);
  X.moonHeld = false;
  g.waves.sign = null;
  return out;
});
ok(`the idol calls a Blood Moon, and the Sun Seal takes it only after one (${JSON.stringify(p7b)})`, p7b.s4 === 'blood' && p7b.s8 === 'blood' && p7b.cold !== 'golden_idol' && p7b.moon && p7b.home === 'golden_idol');

// 8. the Rot Mother lays eggs (two at a time before night 15), and an egg left alone hatches three
const p8 = await ev(async () => {
  const g = window.game, b = g.base;
  const m = g.enemies.spawn('rot_mother', b.x + 20, b.z + 20, 1);
  g.layEggs(m);
  const eggs = g.enemies.list.filter((e) => e.type === 'rot_egg' && !e.dying);
  const before = g.enemies.list.filter((e) => e.type === 'blightling' && !e.dying).length;
  eggs[0].hatchT = 0.05;
  await new Promise((r) => setTimeout(r, 600));
  const after = g.enemies.list.filter((e) => e.type === 'blightling' && !e.dying).length;
  const out = { eggs: eggs.length, want: g.waves.night >= 15 ? 3 : 2, hatched: after - before, boss: g.enemies.boss?.type };
  for (const e of g.enemies.list) g.enemies.crumble(e);
  return out;
});
ok(`the Rot Mother lays her eggs (two on night 10, three from 15); one hatches three Blightlings (${JSON.stringify(p8)})`, p8.eggs === p8.want && p8.hatched === 3 && p8.boss === 'rot_mother');

// 9. the save keeps the story: pages, the seal, the radio, grafts and the Rot
const p9 = await ev(async () => {
  const { writeSave, loadSave } = await import('/src/core/Save.js');
  const g = window.game;
  g.debug = false; writeSave(g); g.debug = true;
  const d = loadSave();
  const bow = d.buildings.find((b) => b[0] === 'bow_tower');
  return { read: d.expedition.read.length, seal: !!d.expedition.seals.shrine, radio: d.expedition.radio, grafting: d.expedition.grafting, grafts: bow?.[7], rot: d.rot?.v?.some((v) => v > 0) };
});
ok(`save keeps the expedition (${JSON.stringify(p9)})`, p9.read === 4 && p9.seal && p9.radio === 1 && p9.grafting && p9.grafts?.includes('glowcap_lens') && p9.rot);

// 10. the endings: with the radio mended, ten nights end on the rescue plane; fly out
const p10 = await ev(async () => {
  const g = window.game, X = g.expedition;
  X.radio = 4;
  g.onVictory();
  await new Promise((r) => setTimeout(r, 3000));
  const el = document.getElementById('ending');
  const first = { shown: !el.classList.contains('hidden'), title: el.querySelector('h1').textContent, buttons: [...el.querySelectorAll('button')].map((b) => b.textContent) };
  return first;
});
ok(`the rescue plane asks: ${JSON.stringify(p10)}`, p10.shown && p10.title === 'The Rescue Plane' && p10.buttons.includes('Fly out') && p10.buttons.includes('Stay with the Heartwood'));
await page.screenshot({ path: 'e2e/out/ending.png' }).catch(() => {});
const p11 = await ev(() => {
  const el = document.getElementById('ending');
  [...el.querySelectorAll('button')].find((b) => b.textContent === 'Fly out').click();
  return { title: el.querySelector('h1').textContent, shown: !el.classList.contains('hidden') };
});
ok(`flying out ends the vigil: ${JSON.stringify(p11)}`, p11.shown && p11.title === 'The Last Flight');
try { localStorage.removeItem('og.save.v1'); } catch { /* */ }
await ev(() => { try { localStorage.removeItem('og.save.v1'); } catch { /* */ } });
console.log(errs.join('\n') || 'no errors');
await browser.close();
