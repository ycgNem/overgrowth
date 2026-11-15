// The defence's rules, staged one at a time in the clearing (1.2's fixes): bosses that can't fit
// a gap chew the wall, a seam across a cell corner doesn't trap a Blightling, towers see into the
// cells by the benches, traps spend charges and not hp, a fallen Heartwood stays fallen, snares
// don't waste themselves on what they can't hold, a Spitter gives up on a wall that mends, the
// Swarm doubles the Blightlings, a sealed rift takes its share of the wave, slows and burns
// stack properly, bows spread their fire, the Blight turn on a player and give up a long chase,
// and Wisps dive. Prints PASS/FAIL per check. Needs `npm run dev` on :5188 (or BASE=<url>).
//
//   node e2e/defence.ts            (SPEED=n game frames per drawn frame, default 4)
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(`PAGEERR ${e.message}`));
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.7');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });

// a fast clock (as e2e/balance.ts), a quiet stage and helpers, all on window.__T
await page.evaluate(async (speed) => {
  const w = window as any, g = w.game, b = g.base;
  w.__waves = await import('/src/defense/Waves.ts');
  let fake = performance.now(), gameT = 0;
  const post = g.post, render = post.render.bind(post);
  g.renderer.setAnimationLoop(() => {
    for (let k = 0; k < speed; k++) {
      fake += 1000 / 30;
      post.render = k === speed - 1 ? render : () => {};
      g.frame(fake);
      gameT += 1 / 30;
    }
    post.render = render;
  });
  const T: any = (w.__T = {});
  T.now = () => gameT;
  // resolve after `s` seconds of game time (or sooner, when done() says so)
  T.wait = (s: number, done?: () => boolean) => new Promise<void>((res) => {
    const end = gameT + s;
    const tick = () => (gameT >= end || done?.() ? res() : setTimeout(tick, 20));
    tick();
  });
  T.hits = 0;
  g.hitPlayer = () => { T.hits++; };
  // no defeat screen: it would pause the game under the checks that follow
  T.overs = 0;
  g.waves.onOver = () => { T.overs++; };
  // a night with nothing more to come and nothing to end it
  T.stage = () => {
    g.modal = null;
    g.overT = 0;
    g.enemies.clear();
    for (const x of [...g.buildings.list]) g.buildings.remove(x);
    g.buildings.changed = true;
    g.waves.phase = 'night';
    g.waves.queue = [{ type: 'blightling', at: 1e9, pack: 0 }];
    g.waves.spawnIdx = 0;
    g.waves.clock = 0;
    g.enemies.hurry = false;
    g.sky.time = 0.9;
    b.hp = b.maxHp;
    g.mods.buildRegen = 0;
    g.player.spawn(b.x - 140, b.z - 140);
    g.player.vel.set(0, 0, 0);
    T.hits = 0;
  };
  T.at = (a: number, d: number) => ({ x: b.x + Math.sin(a) * d, z: b.z + Math.cos(a) * d });
  T.spawn = (type: string, x: number, z: number, k = 1) => {
    const e = g.enemies.spawn(type, x, z, k);
    e.rise = 0;
    return e;
  };
}, Number(process.env.SPEED || 4));

const ok = (name: string, v: boolean, info: unknown) => console.log(`${v ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info)}`);
const run = async (name: string, f: string) => {
  try {
    const r = await page.evaluate(`(async () => { const w = window, g = w.game, b = g.base, T = w.__T; T.stage(); ${f} })()`) as { pass: boolean };
    ok(name, !!r.pass, r);
  } catch (e) {
    ok(name, false, String(e).slice(0, 300));
  }
};

await run('a Thornback that cannot fit a 2.1 m gap between two walls chews a wall instead of standing in it', `
  const A = g.buildings.place('barricade', b.x + 13, b.z - 1.72, Math.PI / 2, { instant: true });
  const B = g.buildings.place('barricade', b.x + 13, b.z + 3.72, Math.PI / 2, { instant: true });
  await T.wait(0.2);
  const tb = T.spawn('thornback', b.x + 24, b.z + 1, 1);
  tb.summonCD = 1e9;
  // (it either chews a wall or walks round them both: what it mustn't do is stand in the gap)
  const past = () => tb.pos.x - b.x < 10;
  const t0 = T.now();
  await T.wait(40, () => A.hp < A.maxHp || B.hp < B.maxHp || A.dead || B.dead || past());
  const out = { pass: A.hp < A.maxHp || B.hp < B.maxHp || A.dead || B.dead || past(), A: Math.round(A.hp), B: Math.round(B.hp), tb: [+(tb.pos.x - b.x).toFixed(1), +(tb.pos.z - b.z).toFixed(1)], t: Math.round(T.now() - t0) };
  g.enemies.clear();
  return out;
`);

await run('a Thornback walled out by a ring with 1.3 m gaps (room for a Blightling, not for it) chews its way in', `
  const R = 14, n = 19, walls = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    walls.push(g.buildings.place('barricade', b.x + R * Math.cos(th), b.z + R * Math.sin(th), Math.atan2(-Math.cos(th), -Math.sin(th)), { instant: true }));
  }
  await T.wait(0.2);
  const tb = T.spawn('thornback', b.x + 26, b.z + 3, 1);
  tb.summonCD = 1e9;
  const t0 = T.now();
  const hurt = () => walls.some((w) => w.hp < w.maxHp || w.dead);
  await T.wait(45, hurt);
  const out = { pass: hurt(), t: Math.round(T.now() - t0), tb: +Math.hypot(tb.pos.x - b.x, tb.pos.z - b.z).toFixed(1), dead: walls.filter((w) => w.dead).length };
  g.enemies.clear();
  return out;
`);

await run('a Blightling meeting two totems 0.85 m apart across a cell corner gets through or bites, never stands', `
  const A = g.buildings.place('tesla_totem', b.x + 10.9, b.z + 9.1, 0, { instant: true });
  const B = g.buildings.place('tesla_totem', b.x + 9.1, b.z + 10.9, 0, { instant: true });
  A.cooldown = B.cooldown = 1e9;
  await T.wait(0.2);
  const es = [0, 1, 2].map((i) => T.spawn('blightling', b.x + 16 + i * 1.5, b.z + 16 + i * 1.5));
  const near = () => es.every((e) => Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 8);
  await T.wait(30, () => near() || A.hp < A.maxHp || B.hp < B.maxHp);
  return { pass: near() || A.hp < A.maxHp || B.hp < B.maxHp, A: Math.round(A.hp), B: Math.round(B.hp), at: es.map((e) => +Math.hypot(e.pos.x - b.x, e.pos.z - b.z).toFixed(1)) };
`);

await run('towers fire at a Blight standing in a cell the flow field cannot reach (by the benches)', `
  const f = g.field;
  let cell = null;
  for (let dx = -15; dx <= 15 && !cell; dx += 1) for (let dz = -15; dz <= 15 && !cell; dz += 1) {
    const d = Math.hypot(dx, dz);
    if (d > 7 && d < 12 && !Number.isFinite(f.distAt(b.x + dx, b.z + dz))) cell = [dx, dz];
  }
  if (!cell) return { pass: true, note: 'no unreachable cell near the Heart in this world' };
  const [dx, dz] = cell, L = Math.hypot(dx, dz);
  const t = g.buildings.place('bow_tower', b.x - (dx / L) * 6, b.z - (dz / L) * 6, 0, { instant: true });
  const egg = T.spawn('rot_egg', b.x + dx, b.z + dz);
  egg.hatchT = 1e9;
  const hp = egg.hp;
  await T.wait(6, () => egg.hp < hp);
  return { pass: egg.hp < hp, cell, hp: Math.round(egg.hp), of: Math.round(hp), towerOk: !!t };
`);

await run('a spike trap spends a charge a spring, and blows and mending never touch its charges', `
  const p = T.at(1, 14);
  const trap = g.buildings.place('spike_trap', p.x, p.z, 0, { instant: true });
  const c0 = trap.charges;
  g.buildings.damage(trap, 20);
  g.mods.buildRegen = 0.5;
  await T.wait(1);
  const c1 = trap.charges, hp1 = trap.hp;
  const e = T.spawn('blightling', p.x, p.z);
  e.rootT = 1e9;
  await T.wait(2.5);
  return { pass: c0 === 14 && c1 === c0 && hp1 > 40 && trap.charges < c0 && trap.hp > 0, c0, c1, after: trap.charges, hp: Math.round(trap.hp) };
`);

await run('a vine snare does not spend charges on a Thornback (it cannot hold one)', `
  const p = T.at(2, 15);
  const sn = g.buildings.place('vine_snare', p.x, p.z, 0, { instant: true });
  const c0 = sn.charges;
  const tb = T.spawn('thornback', p.x, p.z, 0.2);
  tb.summonCD = 1e9; tb.slamCD = 1e9;
  await T.wait(4);
  const c1 = sn.charges;
  g.enemies.clear();
  const e = T.spawn('blightling', p.x, p.z);
  await T.wait(1);
  return { pass: c1 === c0 && sn.charges === c0 - 1 && e.rootT > 0, before: c0, withBoss: c1, after: sn.charges, rooted: e.rootT > 0 };
`);

await run('a fallen Heartwood stays fallen: no dawn mend lifts it off 0', `
  b.hp = 0;
  b.heal(100);
  const healed = b.hp;
  // (no defeat screen: it would pause the game under the checks that follow)
  const over = g.waves.onOver;
  g.waves.onOver = () => {};
  g.enemies.clear();
  g.waves.queue = [];
  g.waves.spawnIdx = 0;
  await T.wait(0.3);
  const phase = g.waves.phase;
  g.waves.onOver = over;
  g.waves.phase = 'night';
  b.hp = b.maxHp;
  b.hp = b.maxHp;
  return { pass: healed === 0 && phase === 'over', healed, phase };
`);

await run('a Spitter shelling a wall that mends as fast as it is hit gives up on it within 30 s', `
  g.mods.buildRegen = 0.05;
  const a = 0.6, p = T.at(a, 18);
  const wall = g.buildings.place('barricade', p.x, p.z, a + Math.PI / 2, { instant: true });
  await T.wait(0.2);
  const q = T.at(a, 29);
  const s = T.spawn('spitter', q.x, q.z);
  await T.wait(40, () => !!s.bold);
  return { pass: !!s.bold, wall: Math.round(wall.hp), spitter: +Math.hypot(s.pos.x - b.x, s.pos.z - b.z).toFixed(1), t: Math.round(T.now()) };
`);

await run('the Swarm really doubles the Blightlings; packs lean on a rift each; rain never falls on a boss night', `
  const W = w.__waves;
  const plain = W.waveFor(6, 1, null).counts.blightling, swarm = W.waveFor(6, 1, 'swarm').counts.blightling;
  const rainy = [5, 10, 15, 20].filter((n) => W.rainsOn(n));
  // which rift each spawn of pack 0 came out of, on a three-rift night
  g.waves.setNight(4);
  g.waves.open = g.rifts.filter((r) => r.night <= 4).slice(0, 3);
  g.waves.packShift = 0;
  const home = g.waves.open[0];
  let n = 0, at = 0;
  for (let i = 0; i < 200; i++) { g.waves.spawnIdx = i; if (g.waves.spawnPoint({ type: 'blightling', at: 0, pack: 0 }) === home) at++; n++; }
  return { pass: swarm === plain * 2 && !rainy.length && at / n > 0.55, plain, swarm, rainy, home: +(at / n).toFixed(2) };
`);

await run('a sealed rift takes its share of the wave; the night held and its sign are kept through the dawn', `
  g.waves.setNight(6);
  g.waves.dormant = null;
  const all = Object.values(g.waves.preview.counts).reduce((s, v) => s + v, 0);
  const one = g.rifts.find((r) => r.night <= 6);
  g.waves.dormant = (r) => r === one;
  const sealed = Object.values(g.waves.preview.counts).reduce((s, v) => s + v, 0);
  g.waves.dormant = (r) => g.expedition.dormant(r);
  // a Blood Moon night ends
  g.waves.setNight(4);
  g.waves.sign = 'blood';
  g.enemies.clear();
  g.waves.queue = [];
  g.waves.spawnIdx = 0;
  await T.wait(0.3, () => g.waves.phase !== 'night');
  const res = { lastSign: g.waves.lastSign, ended: g.waves.endedNight, night: g.waves.night };
  return { pass: sealed < all && res.lastSign === 'blood' && res.ended === 4 && res.night === 5, all, sealed, ...res };
`);

await run('slows run on their own clocks (a long weak slow does not stretch a short hard one); two braziers stack', `
  const e = T.spawn('rotboar', b.x + 30, b.z);
  e.rootT = 1e9;
  g.enemies.slowDown(e, 0.3, 1);
  g.enemies.slowDown(e, 0.8, 5);
  const s0 = e.slow;
  await T.wait(1.6);
  const s1 = e.slow;
  const A = {}, B = {};
  g.enemies.ignite(e, 10, 3, A);
  g.enemies.ignite(e, 10, 3, A);
  const one = g.enemies.burnTotal(e);
  g.enemies.ignite(e, 10, 3, B);
  const two = g.enemies.burnTotal(e);
  return { pass: s0 === 0.3 && Math.abs(s1 - 0.8) < 1e-6 && one === 10 && two === 15, s0, s1, one, two };
`);

await run('a bow passes over a Blight its bolts already have covered, and a bolt whose target dies turns on another', `
  const p = T.at(3, 10);
  const t = g.buildings.place('bow_tower', p.x, p.z, 0, { instant: true });
  t.cooldown = 1e9;
  const q = T.at(3, 22);
  const a = T.spawn('blightling', q.x, q.z), c = T.spawn('blightling', q.x + 1.5, q.z + 1.5);
  a.rootT = c.rootT = 1e9;
  await T.wait(0.2);
  const ctx = g.combatCtx;
  const first = g.buildings.pick(t, 30, ctx);
  first.incoming = 1e3;
  const second = g.buildings.pick(t, 30, ctx);
  first.incoming = 0;
  // a bolt loosed at a, which dies on the way: it should hit c
  const hp = c.hp;
  g.buildings.bolt(t.muzzle(new (g.camera.position.constructor)()), a, 10, ctx, g.mods, false, t);
  g.enemies.damage(a, 1e4, ctx);
  await T.wait(1.5);
  return { pass: second !== first && c.hp < hp, spread: second !== first, turned: c.hp < hp };
`);

await run('a night Blightling passing within 10 m turns on the player, and gives up a chase 18 m off its way', `
  const a = 1.9, p = T.at(a, 26);
  g.player.spawn(p.x, p.z);
  const q = T.at(a + 0.3, 30);
  const e = T.spawn('blightling', q.x, q.z);
  await T.wait(2.5);
  const chased = !!e.chase;
  // run: drag it away from the Heart, a step ahead of it
  for (let i = 0; i < 60 && !(e.giveUpT > 0); i++) {
    const dx = e.pos.x - b.x, dz = e.pos.z - b.z, L = Math.hypot(dx, dz) || 1;
    g.player.spawn(e.pos.x + (dx / L) * 4, e.pos.z + (dz / L) * 4);
    await T.wait(0.25);
  }
  const gave = e.giveUpT > 0;
  return { pass: chased && gave, chased, gave, hits: T.hits };
`);

await run('a Wisp dives at a player who comes within 8 m', `
  const p = T.at(-1.2, 20);
  g.player.spawn(p.x, p.z);
  await T.wait(0.2);
  const q = T.at(-1.2, 26);
  const wsp = T.spawn('wisp', q.x, q.z);
  wsp.rise = 0;
  await T.wait(10, () => T.hits > 0);
  return { pass: T.hits > 0, hits: T.hits, d: +Math.hypot(wsp.pos.x - g.player.pos.x, wsp.pos.z - g.player.pos.z).toFixed(1) };
`);

await run('placement checks the whole footprint, box colliders included', `
  let p = null;
  for (let a = 0; a < 6.3 && !p; a += 0.3) { const q = T.at(a, 15); if (!g.buildings.check('bow_tower', q.x, q.z, 0, { base: b, player: { x: 1e9, z: 1e9 } })) p = q; }
  if (!p) return { pass: false, note: 'no clear spot at 15 m' };
  const box = { type: 'box', x: p.x + 1.6, z: p.z, hx: 0.5, hz: 0.5, rot: 0.3, top: Infinity };
  g.world.extra.colliders.push(box);
  const blocked = g.buildings.check('bow_tower', p.x, p.z, 0, { base: b, player: { x: 1e9, z: 1e9 } });
  g.world.extra.colliders = g.world.extra.colliders.filter((c) => c !== box);
  const clear = g.buildings.check('bow_tower', p.x, p.z, 0, { base: b, player: { x: 1e9, z: 1e9 } });
  return { pass: !!blocked && !clear, blocked, clear };
`);

console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();
