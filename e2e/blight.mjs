// The 0.8 Blight and the Glowcap Lantern, staged in the clearing at dusk: a Spitter shelling a
// bow tower, a Burrower meeting a wall (it should dig under and come up past it), and a
// Burrower tunnelling into a lantern's light (it should be dragged up and dazed early).
// Prints PASS/FAIL per check and writes screenshots.
//
//   node e2e/blight.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const out = process.argv[2] ?? 'e2e/out/blight';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(`PAGEERR ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${BASE}?debug&t=0.7`);
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const ev = (f, a) => page.evaluate(f, a);
const ok = (name, v) => console.log(`${v ? 'PASS' : 'FAIL'} ${name}`);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

// stand the player off to one side, looking at a spot
const look = (x, z, from) => ev(([x, z, from]) => {
  const g = window.game;
  g.hitPlayer = () => {};
  g.player.spawn(from.x, from.z);
  g.player.vel.set(0, 0, 0);
  g.player.yaw = Math.atan2(-(x - from.x), -(z - from.z));
  g.player.pitch = -0.22;
}, [x, z, from]);

// ---- 1. a Spitter shelling a bow tower
const s1 = await ev(() => {
  const g = window.game, b = g.base;
  g.waves.phase = 'night';
  g.waves.queue = [];
  g.waves.spawnIdx = 0;
  const a = 0.8;
  const tx = b.x + Math.sin(a) * 14, tz = b.z + Math.cos(a) * 14;
  const tower = g.buildings.place('bow_tower', tx, tz, 0, { instant: true });
  tower.def = { ...tower.def }; // a tower that doesn't shoot back, so the Spitter lives
  tower.cooldown = 1e9;
  const sx = b.x + Math.sin(a) * 25, sz = b.z + Math.cos(a) * 25;
  const e = g.enemies.spawn('spitter', sx, sz, 1);
  e.rise = 0;
  window.__s = { e, tower, hp0: tower.hp };
  return { tx, tz, sx, sz };
});
await look((s1.tx + s1.sx) / 2, (s1.tz + s1.sz) / 2, { x: s1.tx + 6, z: s1.tz - 5 });
let sawGlob = false;
for (let i = 0; i < 40 && !sawGlob; i++) {
  await page.waitForTimeout(250);
  sawGlob = await ev(() => window.game.enemies.globs.length > 0);
  if (sawGlob) await shot('01-spitter-glob');
}
await page.waitForTimeout(2500);
await shot('02-spitter-puddle');
const r1 = await ev(() => {
  const { e, tower, hp0 } = window.__s;
  const g = window.game;
  const d = tower.distTo(e.pos.x, e.pos.z);
  return { glob: g.enemies.globs.length, puddles: g.enemies.puddles.length, hp0, hp: tower.hp, dist: +d.toFixed(1) };
});
ok(`spitter lobs bile at a tower from range (${JSON.stringify(r1)})`, sawGlob && r1.hp < r1.hp0 && r1.dist > 6);

// ---- 2. a Burrower meets a wall and goes under it
const s2 = await ev(() => {
  const g = window.game, b = g.base;
  g.enemies.clear();
  for (const t of [...g.buildings.list]) g.buildings.remove(t);
  const a = -1.2;
  // a ring of walls across its path
  const walls = [];
  for (let k = -2; k <= 2; k++) {
    const aa = a + k * 0.12;
    walls.push(g.buildings.place('barricade', b.x + Math.sin(aa) * 16, b.z + Math.cos(aa) * 16, aa + Math.PI / 2, { instant: true }));
  }
  g.buildings.changed = true;
  const e = g.enemies.spawn('burrower', b.x + Math.sin(a) * 24, b.z + Math.cos(a) * 24, 1);
  e.rise = 0;
  window.__b = { e, walls };
  return { x: b.x + Math.sin(a) * 18, z: b.z + Math.cos(a) * 18, bx: b.x, bz: b.z };
});
await look(s2.x, s2.z, { x: s2.x + 8, z: s2.z + 6 });
let dug = false, phases = new Set();
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(150);
  const st = await ev(() => window.__b.e.dig?.phase || (window.__b.e.dying ? 'dead' : 'walk'));
  phases.add(st);
  if (st === 'tunnel' && !dug) {
    dug = true;
    await shot('03-burrower-tunnel');
  }
  if (dug && st === 'walk') break;
}
await shot('04-burrower-up');
const r2 = await ev(() => {
  const { e } = window.__b, b = window.game.base;
  return { toBase: +Math.hypot(e.pos.x - b.x, e.pos.z - b.z).toFixed(1), hp: e.hp };
});
ok(`burrower digs under the wall and surfaces inside it (${[...phases].join('>')} ${JSON.stringify(r2)})`, dug && r2.toBase < 16);

// ---- 3. a lantern drags a tunnelling Burrower up early
const s3 = await ev(() => {
  const g = window.game, b = g.base;
  g.enemies.clear();
  for (const t of [...g.buildings.list]) g.buildings.remove(t);
  const a = 2.4;
  const lx = b.x + Math.sin(a) * 15, lz = b.z + Math.cos(a) * 15;
  const lantern = g.buildings.place('glow_lantern', lx, lz, 0, { instant: true });
  const e = g.enemies.spawn('burrower', b.x + Math.sin(a) * 30, b.z + Math.cos(a) * 30, 1);
  e.rise = 0;
  e.digCD = 0;
  // fake meeting a wall: start digging straight away
  g.enemies.startDig(e, { base: b, particles: g.particles });
  window.__l = { e, lantern };
  return { lx, lz };
});
await look(s3.lx, s3.lz, { x: s3.lx + 7, z: s3.lz - 7 });
let forced = false;
for (let i = 0; i < 60 && !forced; i++) {
  await page.waitForTimeout(150);
  forced = await ev(() => !!window.__l.e.dig?.forced || window.__l.e.stagger > 1);
}
await page.waitForTimeout(500);
await shot('05-lantern-forced');
const r3 = await ev(() => {
  const { e, lantern } = window.__l;
  const hp = e.hp;
  window.game.enemies.damage(e, 10, window.game.combatCtx);
  return { stagger: +e.stagger.toFixed(2), lit: e.litT > 0, took: +(hp - e.hp).toFixed(1), d: +Math.hypot(e.pos.x - lantern.x, e.pos.z - lantern.z).toFixed(1) };
});
ok(`lantern forces the burrower up, dazed, and exposes it (${JSON.stringify(r3)})`, forced && r3.lit && r3.took > 10);

// a portrait of the lantern lit at night
await ev(() => { const g = window.game; g.enemies.clear(); g.sky.time = 0.92; });
await look(s3.lx, s3.lz, { x: s3.lx + 5, z: s3.lz - 4 });
await page.waitForTimeout(1500);
await shot('06-lantern-night');
console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();
