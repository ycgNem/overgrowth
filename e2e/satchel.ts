// The satchel and the Coffer (1.0.3): dropping from the slot you clicked, a dropped pile that
// stays put until you walk off and come back, drag and drop, click to send across, Ctrl for
// half, 1-8 over a stack, sorting, the Coffer's iron and brass upgrades (and their save), the
// camp facing out, and the Blight a fifth tougher. Prints PASS/FAIL per step and writes
// screenshots to e2e/out/. Needs `npm run dev` on :5188 (or BASE=<url>).
//
//   node --experimental-strip-types e2e/satchel.ts
import { chromium, type Page } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page: Page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.35');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });
const ev = <T, A = unknown>(f: (a: A) => T, a?: A) => page.evaluate(f as any, a) as Promise<T>;
let fails = 0;
const ok = (name: string, v: boolean) => { if (!v) fails++; console.log((v ? 'PASS ' : 'FAIL ') + name); };
const wait = (ms: number) => page.waitForTimeout(ms);
// where a satchel slot (or the open pane's slot) is on screen
const slotAt = (pane: 'mine' | 'other', i: number) => ev(([pane, i]) => {
  const h = (window as any).game.hud;
  const el = (pane === 'mine' ? h.slotEls : h.otherEls)[i];
  const r = el.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}, [pane, i] as const);
const drag = async (from: number[], to: number[], ctrl = false) => {
  await page.mouse.move(from[0], from[1]);
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 5 });
  await page.mouse.move(to[0], to[1], { steps: 5 });
  await page.mouse.up();
  if (ctrl) await page.keyboard.up('Control');
  await wait(100);
};
const click = async (at: number[], button: 'left' | 'right' = 'left', mods: string[] = []) => {
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.click(at[0], at[1], { button });
  for (const m of mods) await page.keyboard.up(m);
  await wait(100);
};

// a clean satchel out in the clearing, away from the Coffer
await ev(() => {
  const g = (window as any).game, inv = g.inventory;
  inv.slots.fill(null);
  const b = g.base;
  g.player.spawn(b.x + 20, b.z + 3);
  g.player.vel.set(0, 0, 0);
  // two stacks of stone: a big one first in the pack, a small one after it
  inv.slots[inv.packStart] = { id: 'stone', n: 15 };
  inv.slots[inv.packStart + 1] = { id: 'stone', n: 3 };
  inv.slots[inv.packStart + 2] = { id: 'stick', n: 10 };
  inv.slots[inv.packStart + 3] = { id: 'flint', n: 7 };
  inv.changed();
  g.hud.toggleInventory(true);
  g.input.unlock();
});
await wait(300);
const P = await ev(() => (window as any).game.inventory.packStart);

// 1. right-click the small stack: one comes off that stack, not the big one
await click(await slotAt('mine', P + 1), 'right');
const r1 = await ev(([P]) => { const inv = (window as any).game.inventory; return [inv.slots[P]?.n, inv.slots[P + 1]?.n]; }, [P]);
ok(`right-click drops one from the stack clicked (big ${r1[0]}, small ${r1[1]})`, r1[0] === 15 && r1[1] === 2);

// 2. Shift+right-click throws out the whole small stack as one pile
await click(await slotAt('mine', P + 1), 'right', ['Shift']);
const r2 = await ev(([P]) => {
  const g = (window as any).game;
  return { slot: g.inventory.slots[P + 1], piles: g.pickups.items.filter((p: any) => p.id === 'stone').map((p: any) => p.n) };
}, [P]);
ok(`Shift+right-click drops the whole stack (${JSON.stringify(r2)})`, !r2.slot && r2.piles.includes(2) && r2.piles.includes(1));

// 3. a pile you put down never comes back by itself, even after walking off and back; look at
// it and tap E to pick it up
await ev(() => { const g = (window as any).game; g.hud.toggleInventory(false); if (!g.debug) g.input.lock(); });
await wait(3500);
const back1 = await ev(() => (window as any).game.inventory.count('stone'));
ok(`dropped stones stay on the ground while you stand there (carrying ${back1})`, back1 === 15);
await ev(() => {
  const g = (window as any).game, p = g.player.pos;
  g.player.spawn(p.x + 12, p.z);
  g.player.vel.set(0, 0, 0);
});
await wait(600);
const pileAt = await ev(() => {
  const g = (window as any).game, pk = g.pickups.items.find((p: any) => p.id === 'stone' && p.n === 2);
  const x = pk.root.position.x, z = pk.root.position.z;
  g.player.spawn(x, z + 1.3); g.player.vel.set(0, 0, 0);
  g.player.yaw = Math.atan2(-(x - x), -(z - (z + 1.3))); g.player.pitch = -0.5;
  return [x, z];
});
await wait(2500);
const back2 = await ev(() => (window as any).game.inventory.count('stone'));
const prompt = await ev(() => document.querySelector('#prompt')?.textContent || '');
ok(`walking off and back doesn't pull it in (carrying ${back2}); the prompt offers it ("${prompt.replace(/\s+/g, ' ').trim().slice(0, 60)}")`, back2 === 15 && /Stone/.test(prompt) && /pick it up/.test(prompt));
await page.keyboard.press('KeyE');
await wait(1500);
const back3 = await ev(() => (window as any).game.inventory.count('stone'));
ok(`E picks a pile up (carrying ${back3})`, back3 === 16 || back3 === 17);

// 4. drag a stack onto another slot; Ctrl-drag moves half; drag off the panel drops it
await ev(() => { const g = (window as any).game; g.hud.toggleInventory(true); g.input.unlock(); });
await wait(200);
const before4 = await ev(() => (window as any).game.inventory.slots.map((s: any) => s && `${s.id}:${s.n}`));
const sticksAt = before4.findIndex((s: string | null) => s?.startsWith('stick'));
const free = before4.findIndex((s: string | null, i: number) => !s && i >= P && i < P + 10);
await drag(await slotAt('mine', sticksAt), await slotAt('mine', free));
const d1 = await ev(([a, b]) => { const inv = (window as any).game.inventory; return [inv.slots[a], inv.slots[b]]; }, [sticksAt, free]);
ok(`drag moves a stack to the slot you drop it on (${JSON.stringify(d1)})`, !d1[0] && d1[1]?.id === 'stick' && d1[1].n === 10);
const free2 = await ev(([P]) => { const inv = (window as any).game.inventory; for (let i = P; i < P + 12; i++) if (!inv.slots[i]) return i; return -1; }, [P]);
await drag(await slotAt('mine', free), await slotAt('mine', free2), true);
const d2 = await ev(([a, b]) => { const inv = (window as any).game.inventory; return [inv.slots[a]?.n, inv.slots[b]?.n]; }, [free, free2]);
ok(`Ctrl-drag splits half off (${d2[0]} + ${d2[1]})`, d2[0] === 5 && d2[1] === 5);
const flintAt = await ev(() => (window as any).game.inventory.slots.findIndex((s: any) => s?.id === 'flint'));
await drag(await slotAt('mine', flintAt), [40, 450]);
const d3 = await ev(() => { const g = (window as any).game; return { carried: g.inventory.count('flint'), pile: g.pickups.items.find((p: any) => p.id === 'flint')?.n }; });
ok(`dragging off the satchel drops the stack (${JSON.stringify(d3)})`, d3.carried === 0 && d3.pile === 7);

// 5. click: pack -> belt and back; 1-8 over a stack puts it on that belt slot
await ev(([P]) => {
  const inv = (window as any).game.inventory;
  inv.slots.fill(null);
  inv.slots[P + 4] = { id: 'stone', n: 9 };
  inv.changed();
}, [P]);
const stoneAt = P + 4;
await click(await slotAt('mine', stoneAt));
const c1 = await ev(() => { const inv = (window as any).game.inventory; return inv.slots.findIndex((s: any) => s?.id === 'stone'); });
ok(`click sends a pack stack to the belt (now in slot ${c1})`, c1 >= 0 && c1 < 8);
await click(await slotAt('mine', c1));
const c2 = await ev(() => { const inv = (window as any).game.inventory; return inv.slots.findIndex((s: any) => s?.id === 'stone'); });
ok(`click sends it back to the pack (slot ${c2})`, c2 >= P);
await page.mouse.move(...((await slotAt('mine', c2)) as [number, number]));
await wait(80);
await page.keyboard.press('Digit6');
await wait(100);
const c3 = await ev(() => (window as any).game.inventory.slots[5]);
ok(`hover + 6 puts the stack on belt slot 6 (${JSON.stringify(c3)})`, c3?.id === 'stone');

// 6. sort: stacks merge and group
await ev(([P]) => {
  const inv = (window as any).game.inventory;
  inv.slots.fill(null);
  inv.slots[P + 2] = { id: 'stick', n: 5 }; inv.slots[P + 5] = { id: 'stick', n: 4 }; inv.slots[P + 9] = { id: 'flint', n: 2 }; inv.slots[P + 7] = { id: 'stick', n: 3 };
  inv.changed();
}, [P]);
await page.click('#inv-sort');
await wait(100);
const so = await ev(([P]) => { const inv = (window as any).game.inventory; return inv.slots.slice(P, P + 6).map((s: any) => s && `${s.id}:${s.n}`); }, [P]);
ok(`Sort merges and groups the pack (${so.join(' ')})`, so.filter(Boolean).length === 2 && so[0] === 'flint:2' && so[1] === 'stick:12');
await page.screenshot({ path: 'e2e/out/satchel.png' });

// 6b. salvaging a defence is a held right-click: a tap does nothing
const keep = await ev(([P]) => { const g = (window as any).game; g.inventory.slots[P + 11] = { id: 'barricade', n: 2 }; g.inventory.changed(); g.hud.renderInventory(); return g.inventory.state(); }, [P]);
const bar = await slotAt('mine', P + 11);
await click(bar, 'right');
const sv1 = await ev(([P]) => (window as any).game.inventory.slots[P + 11]?.n, [P]);
await page.mouse.move(bar[0], bar[1]);
await page.mouse.down({ button: 'right' });
await wait(1100);
await page.mouse.up({ button: 'right' });
await wait(100);
const sv2 = await ev(([P]) => (window as any).game.inventory.slots[P + 11]?.n, [P]);
ok(`a right-click tap leaves the barricade (${sv1}); holding salvages one (${sv2})`, sv1 === 2 && sv2 === 1);
// (put the satchel back as it was, without the barricade or its parts)
await ev(([keep, P]) => { const g = (window as any).game; g.inventory.restore(keep); g.inventory.slots[P + 11] = null; g.inventory.changed(); }, [keep, P]);

// 7. the Coffer: click sends across both ways, the iron and brass upgrades, the save
await ev(() => { const g = (window as any).game; g.hud.toggleInventory(false); });
await ev(() => {
  const g = (window as any).game, s = g.camp.sites.coffer;
  g.player.spawn(s.x + 1.8, s.z + 1.8); g.player.vel.set(0, 0, 0);
  g.coffer.slots.fill(null);
  g.openCoffer();
});
await wait(300);
const stickAt = await ev(() => (window as any).game.inventory.slots.findIndex((s: any) => s?.id === 'stick'));
await click(await slotAt('mine', stickAt));
const k1 = await ev(() => { const g = (window as any).game; return [g.inventory.count('stick'), g.coffer.count('stick')]; });
ok(`click sends a stack into the Coffer (${k1})`, k1[0] === 0 && k1[1] === 12);
await click(await slotAt('other', 0), 'right');
const k2 = await ev(() => { const g = (window as any).game; return [g.inventory.count('stick'), g.coffer.count('stick')]; });
ok(`right-click in the Coffer takes one (${k2})`, k2[0] === 1 && k2[1] === 11);
// right-click your own stack with the Coffer open: one goes in (not on the ground)
const stickMine = await ev(() => (window as any).game.inventory.slots.findIndex((s: any) => s?.id === 'stick'));
await click(await slotAt('mine', stickMine), 'right');
const k3 = await ev(() => { const g = (window as any).game; return [g.inventory.count('stick'), g.coffer.count('stick'), g.pickups.items.filter((p: any) => p.id === 'stick').length]; });
ok(`right-click your own stack with the Coffer open puts one in (${k3})`, k3[0] === 0 && k3[1] === 12 && k3[2] === 0);
// Shift+right-click in the Coffer takes the whole stack
await click(await slotAt('other', 0), 'right', ['Shift']);
const k4 = await ev(() => { const g = (window as any).game; return [g.inventory.count('stick'), g.coffer.count('stick')]; });
ok(`Shift+right-click in the Coffer takes the stack (${k4})`, k4[0] === 12 && k4[1] === 0);
// drag a satchel stack onto a Coffer slot holding something else: they trade places
const sw = await ev(() => {
  const g = (window as any).game;
  g.coffer.slots[3] = { id: 'bone', n: 4 };
  g.coffer.changed();
  g.hud.renderInventory();
  return g.inventory.slots.findIndex((s: any) => s?.id === 'stick');
});
await drag(await slotAt('mine', sw), await slotAt('other', 3));
const k5 = await ev(([sw]) => { const g = (window as any).game; return [g.inventory.slots[sw], g.coffer.slots[3]]; }, [sw]);
ok(`dragging onto a different item trades places (${JSON.stringify(k5)})`, k5[0]?.id === 'bone' && k5[1]?.id === 'stick');
const up0 = await ev(() => { const g = (window as any).game; return { lv: g.camp.cofferLevel, slots: g.coffer.size, shown: g.hud.otherEls.filter((e: HTMLElement) => !e.classList.contains('gone')).length, acts: g.hud.otherPane.actions.map((a: any) => a.label) }; });
ok(`a wooden Coffer: 60 slots shown, an upgrade on offer (${JSON.stringify(up0)})`, up0.lv === 1 && up0.slots === 60 && up0.shown === 60 && up0.acts.some((l: string) => /iron/.test(l)));
await page.screenshot({ path: 'e2e/out/coffer-wood-pane.png' });
const up1 = await ev(() => {
  const g = (window as any).game;
  g.upgradeCoffer(); // can't afford it yet
  const lv0 = g.camp.cofferLevel;
  g.give('scrap_metal', 8); g.give('rusty_bolts', 4); g.give('bog_iron', 5);
  g.upgradeCoffer();
  g.hud.renderInventory();
  return { lv0, lv: g.camp.cofferLevel, slots: g.coffer.size, title: g.hud.otherPane.title, shown: g.hud.otherEls.filter((e: HTMLElement) => !e.classList.contains('gone')).length, scrap: g.inventory.count('scrap_metal') + g.coffer.count('scrap_metal') };
});
ok(`iron: refused without the parts, then 90 slots (${JSON.stringify(up1)})`, up1.lv0 === 1 && up1.lv === 2 && up1.slots === 90 && up1.shown === 90 && up1.scrap === 4 && /Iron/.test(up1.title));
await wait(300);
await page.screenshot({ path: 'e2e/out/coffer-iron-pane.png' });
const up2 = await ev(() => {
  const g = (window as any).game;
  g.give('copper_wire', 3); g.give('scrap_metal', 6); g.give('rusty_bolts', 4); g.give('bog_iron', 3);
  g.upgradeCoffer();
  // fill a slot only a brass-bound Coffer has, then save and load
  g.coffer.slots[110] = { id: 'bone', n: 5 };
  const save = JSON.parse(JSON.stringify(g.writeSave ? g.writeSave() : null));
  return { lv: g.camp.cofferLevel, slots: g.coffer.size, hasSave: !!save };
});
ok(`brass: 120 slots (${JSON.stringify(up2)})`, up2.lv === 3 && up2.slots === 120);
// the save keeps the level and what's in the slots only the brass gives
const sv = await ev(async () => {
  const g = (window as any).game;
  const { writeSave, loadSave } = await import('/src/core/Save.js' as any);
  writeSave(g);
  const d = loadSave();
  g.camp.setCoffer(1); g.syncCoffer(); g.coffer.slots.fill(null);
  g.loadFrom(d);
  return { lv: g.camp.cofferLevel, slots: g.coffer.size, bone: g.coffer.slots[110], saved: d.camp.coffer };
});
ok(`save and load keep the brass Coffer and its far slots (${JSON.stringify(sv)})`, sv.lv === 3 && sv.slots === 120 && sv.bone?.id === 'bone' && sv.bone.n === 5);
// the parts show on the model
const parts = await ev(() => {
  const g = (window as any).game, o = g.camp.sites.coffer.obj, vis: Record<string, boolean> = {};
  o.traverse((q: any) => { if (/^L[23]/.test(q.name) && !q.isMesh) vis[q.name] = q.visible; });
  return vis;
});
ok(`the iron and brass parts show on the Coffer (${JSON.stringify(parts)})`, Object.keys(parts).length >= 4 && Object.values(parts).every(Boolean));

// 8. the camp faces out, towards you as you come in
const facing = await ev(() => {
  const g = (window as any).game, b = g.base, out: Record<string, number> = {};
  for (const [id, s] of Object.entries(g.camp.sites) as any) {
    const o = s.obj ?? s.plot;
    // the model's front is +z: does it point away from the Heartwood?
    const fx = Math.sin(o.rotation.y), fz = Math.cos(o.rotation.y);
    const ax = s.x - b.x, az = s.z - b.z, l = Math.hypot(ax, az);
    out[id] = +((fx * ax + fz * az) / l).toFixed(2);
  }
  return out;
});
ok(`the Coffer and the benches face out from the Heartwood (${JSON.stringify(facing)})`, Object.values(facing).every((d) => d > 0.9));
await ev(() => { const g = (window as any).game; g.hud.toggleInventory(false); g.camp.openWant = 1; });
// a look at the camp from where you respawn
await ev(() => { (window as any).game.respawn(); });
await wait(1200);
await page.screenshot({ path: 'e2e/out/camp-facing.png' });
await ev(() => {
  const g = (window as any).game, s = g.camp.sites.coffer, b = g.base;
  const ax = s.x - b.x, az = s.z - b.z, l = Math.hypot(ax, az);
  const px = s.x + (ax / l) * 2.4, pz = s.z + (az / l) * 2.4;
  g.player.spawn(px, pz); g.player.vel.set(0, 0, 0);
  g.player.yaw = Math.atan2(-(s.x - px), -(s.z - pz)); g.player.pitch = -0.35;
});
await wait(1200);
await page.screenshot({ path: 'e2e/out/coffer-brass.png' });

// 9. the Blight: a fifth more health and bite than before
const bl = await ev(async () => {
  const { ENEMY_TYPES } = await import('/src/defense/Enemies.js' as any);
  return { blightling: [ENEMY_TYPES.blightling.hp, ENEMY_TYPES.blightling.dmg], thornback: [ENEMY_TYPES.thornback.hp, ENEMY_TYPES.thornback.dmg] };
});
ok(`Blight 20% tougher (${JSON.stringify(bl)})`, Math.abs(bl.blightling[0] - 48) < 1e-6 && Math.abs(bl.blightling[1] - 9.6) < 1e-6 && Math.abs(bl.thornback[0] - 2160) < 1e-6);

console.log(errs.length ? `ERRORS:\n${errs.join('\n')}` : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all clear');
await browser.close();
