// Screenshots of the Lost Expedition: a page read, the Rot round a rift, the Stone Seal and a
// set seal's light, a supply drop on its flare, a grafted tower, the Rot Mother laying, a Pale
// Fog night and a Blood Moon. Needs `npm run dev`.
//
//   node e2e/storyui.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'e2e/out/story';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const ev = (f, a) => page.evaluate(f, a);
const shot = async (name, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
// look at (x, z) from (fromX, fromZ)
const look = (x, z, fx, fz, pitch = -0.1) => ev(([x, z, fx, fz, pitch]) => {
  const g = window.game;
  g.world.update(fx, fz, 0, true);
  g.player.spawn(fx, fz); g.player.vel.set(0, 0, 0);
  g.player.yaw = Math.atan2(-(x - fx), -(z - fz)); g.player.pitch = pitch;
}, [x, z, fx, fz, pitch]);

// a page, read
await ev(() => {
  const g = window.game;
  g.debug = false;
  g.modal = null;
  g.onPage({ id: 'vane3', who: 'Dr. Iris Vane', title: 'Field diary, 4:17 a.m.', text: 'It came free with no resistance at all. Lighter than I expected. Ruiz screamed at me from the stair and the ground answered him. Every watch in the camp stopped at the same minute.' });
  g.debug = true;
});
await shot('page');
await page.keyboard.press('Enter');

// the Rot round a rift, three dawns in
const rift = await ev(() => {
  const g = window.game, R = g.rot;
  for (let n = 5; n <= 9; n++) R.spread(n, g.rifts, () => true, []);
  g.world.wearAll();
  for (const l of [g.grass, g.litter, g.groundCover]) l.reset();
  const r = g.rifts[0], b = g.base;
  const dx = b.x - r.x, dz = b.z - r.z, dl = Math.hypot(dx, dz);
  return [r.x, r.z, r.x + (dx / dl) * 14 + (dz / dl) * 6, r.z + (dz / dl) * 14 - (dx / dl) * 6];
});
await look(rift[0], rift[1], rift[2], rift[3], -0.3);
await shot('rot', 1500);

// the Stone Seal in the ruins, then set (its light)
const st = await ev(() => { const s = window.game.expedition.sites.ruins; return s && [s.x, s.z]; });
if (st) {
  await look(st[0], st[1], st[0] + 5, st[1] + 4, -0.12);
  await shot('seal_stone', 1500);
  await ev(() => { const g = window.game; g.waves.setNight(4); g.expedition.setSeal('ruins', 'compass', false); });
  await shot('seal_set', 1200);
  // and from 70 m off, at dusk: the column has to stand over the canopy
  await ev(() => { window.game.sky.time = 0.74; });
  await look(st[0], st[1], st[0] + 50, st[1] + 49, 0.12);
  await shot('seal_far', 1800);
  await ev(() => { window.game.sky.time = 0.42; });
}

// a supply drop on its flare, from 30 m
const drop = await ev(() => {
  const g = window.game, X = g.expedition;
  X.pendingDrops = 1; g.waves.phase = 'day'; g.sky.time = 0.5; X.update();
  const d = X.drops[0];
  return d && [d.x, d.z];
});
if (drop) {
  await look(drop[0], drop[1], drop[0] + 22, drop[1] + 18, 0.05);
  await shot('drop', 1500);
  await look(drop[0], drop[1], drop[0] + 55, drop[1] + 45, 0.15);
  await shot('drop_far', 1800);
}

// a grafted tier 3 bow tower at camp
await ev(() => {
  const g = window.game, b = g.base;
  const t = g.buildings.place('bow_tower', b.x + 8, b.z - 9, 0, { instant: true });
  t.upgrade(); t.upgrade();
  t.addGraft('glowcap_lens'); t.addGraft('resin_drip');
  g.player.spawn(b.x + 12, b.z - 13); g.player.yaw = Math.atan2(-(t.x - (b.x + 12)), -(t.z - (b.z - 13))); g.player.pitch = 0.1;
});
await shot('graft', 1200);

// the camp's story prompts: the Thornback's heart at the Workbench, Hollis's radio (two parts in)
const camp = await ev(() => {
  const g = window.game, S = g.camp.sites;
  g.inventory.add('thornback_heart', 1);
  g.camp.setLevel('tinker', 1);
  g.expedition.radio = 2;
  return { bench: [S.bench.x, S.bench.z], tinker: [S.tinker.x, S.tinker.z], base: [g.base.x, g.base.z] };
});
const toward = (p, k) => [p[0] + (p[0] - camp.base[0]) * k, p[1] + (p[1] - camp.base[1]) * k];
let at = toward(camp.bench, 0.33);
await look(camp.bench[0], camp.bench[1], at[0], at[1], -0.35);
await shot('prompt_bench', 1200);
at = toward(camp.tinker, 0.25);
await look(camp.tinker[0], camp.tinker[1], at[0], at[1], -0.45);
await shot('radio', 1200);
// the craft cards: roots and damage type on each defence
await ev(() => { const g = window.game; g.hud.toggleInventory(true); g.hud.tab = 'craft'; g.hud.renderInventory(); });
await shot('craft', 900);
await ev(() => window.game.hud.toggleInventory(false));
// tonight's Sign on the day line
await ev(() => { const g = window.game; g.waves.__signOf = g.waves.signOf; g.waves.signOf = () => 'blood'; });
await shot('sign_day', 700);
await ev(() => { const g = window.game; g.waves.signOf = g.waves.__signOf; });

// the Rot Mother laying, at dusk
await ev(() => {
  const g = window.game, b = g.base;
  g.sky.time = 0.76;
  const m = g.enemies.spawn('rot_mother', b.x + 18, b.z + 10, 1);
  m.rise = 0; m.yaw = 2.4;
  g.layEggs(m);
  for (const e of g.enemies.list) e.rise = 0;
  g.player.spawn(b.x + 6, b.z + 2); g.player.yaw = Math.atan2(-(m.pos.x - (b.x + 6)), -(m.pos.z - (b.z + 2))); g.player.pitch = 0.05;
  g.hitPlayer = () => {};
});
await shot('rot_mother', 2500);

// an elite: its mark on a plate over the bar
await ev(() => {
  const g = window.game, p = g.player.pos;
  const e = g.enemies.spawn('rotboar', p.x - Math.sin(g.player.yaw) * 7, p.z - Math.cos(g.player.yaw) * 7, 1);
  e.rise = 0;
  g.enemies.makeElite(e, 'swift');
  e.barT = 3;
});
await shot('elite', 1000);

// a Pale Fog night, and a Blood Moon
await ev(() => { const g = window.game; for (const e of g.enemies.list) g.enemies.crumble(e); g.sky.time = 0.9; g.signMoon = 0; g.sky.signMoon = 0; g.signFog = 1; g.sky.signFog = 1; });
await shot('fog', 2000);
await ev(() => { const g = window.game; g.signFog = 0; g.sky.signFog = 0; g.signMoon = 1; g.sky.signMoon = 1; });
await shot('blood', 2000);
await browser.close();
