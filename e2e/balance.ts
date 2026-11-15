// Simulates one night against a fixed defence and logs the Blight, the Heartwood's HP and who hurt
// what. Every preset is legal: it builds in its order and stops where the night's root cap
// (Game.rootCap; Towers.rootCapFor) runs out, upgrades drawing the roots Towers.rootCost says.
// Needs `npm run dev` on :5188 (or BASE=<url>).
//
//   node e2e/balance.ts <night> <preset> [verdant|warden|blightborn]
//
// presets
//   none      nothing built (the machete alone, with ACTIVE=1)
//   starter   the difficulty's starting kit: Warden is one Bow Tower and two spike traps
//   mid       two bows, a mortar, a brazier, a wall and a trap on each lane, a lantern
//   late      mid plus a totem, snares and a second brazier, then upgrades
//   cap       bows and mortars first, walls and traps on the lanes, then upgrades and towers in turn
//   full      cap plus what a good run has by then: a root a night from night 5 for buried relics,
//             and grafts in every free slot
//   mixed     every role, wide: a bow, a mortar, a brazier, a totem and a lantern, then more of
//             them in turn and upgrades with what's left
//   mixed3    every role, tall: a bow, a mortar, a brazier and a totem, each to the top tier
//             before the next, and a lantern
//   balanced  every role as a player grows it: bows and mortars taken high, a brazier and a
//             totem at the middle tier, a lantern
//   bows, mortars, braziers, teslas       one kind of tower only, wide (many, then upgraded)
//   bows3, mortars3, braziers3, teslas3   one kind only, tall (each to the top before the next)
//   (every preset but none and starter puts what roots are left into spike traps)
// Towers reach tier 2 from night 2 and tier 3 from night 7 (the benches' levels by then).
//
// SPEED=n runs n game frames for every one drawn (default 6; 1 is real time). NO=spitter,burrower
// leaves those out of the wave; NOLANTERN=1 builds no lantern. SIGN=fog|blood|still|swarm forces a
// Sign (none otherwise). ACTIVE=1 puts a fighting player in the clearing: it walks to the Blight
// nearest the Heart and swings at it, slings Spitters and Wisps, and can be hurt and fall.
// ABL=resist,elite,weak turns those off. SEED=n fixes Math.random for the run. FULL=1 gives any
// preset the full preset's buried relics and grafts.
import { chromium } from 'playwright';

const night = Number(process.argv[2] || 1);
const setup = process.argv[3] || 'starter';
const diff = process.argv[4] || 'warden';
const env = process.env;
const opts = {
  night, setup, diff,
  no: (env.NO || '').split(',').filter(Boolean),
  lantern: !env.NOLANTERN,
  active: !!env.ACTIVE,
  sign: env.SIGN || null,
  abl: (env.ABL || '').split(',').filter(Boolean),
  speed: Math.max(1, Number(env.SPEED || 6)),
  seed: env.SEED ? Number(env.SEED) : null,
  fullRun: !!env.FULL,
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await page.goto((env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.7');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });
await page.evaluate(async () => {
  const w = window as any;
  w.__towers = await import('/src/defense/Towers.ts');
  w.__diffs = await import('/src/core/Difficulty.ts').catch(() => import('/src/core/Difficulty.js'));
});
await page.evaluate((o) => {
  const w = window as any, g = w.game, b = g.base;
  const { night, setup, diff, no, lantern, active, sign, abl, speed, seed, fullRun } = o;
  if (seed !== null) {
    // a seeded Math.random (mulberry32), so a row can be run again the same way
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  g.setDifficulty(diff);
  // no Signs unless asked for, so the table stays comparable
  g.waves.signOf = () => sign;
  if (abl.includes('resist')) for (const t of Object.values(g.enemies.types) as any[]) delete t.resist;
  if (abl.includes('elite')) g.waves.diff.elites = 0;
  if (abl.includes('weak')) g.waves.coverage = null;
  g.waves.setNight(night);
  g.inventory.slots.fill(null);
  w.__deaths = 0;

  // ---- the clock: `speed` game frames of 1/30 s for every frame drawn
  {
    let fake = performance.now();
    const post = g.post, render = post.render.bind(post);
    g.renderer.setAnimationLoop(() => {
      for (let k = 0; k < speed; k++) {
        fake += 1000 / 30;
        post.render = k === speed - 1 ? render : () => {};
        g.frame(fake);
        w.__step?.(1 / 30);
      }
      post.render = render;
    });
  }

  // ---- the player: parked far away, or a bot that fights in the clearing
  if (!active) {
    g.hitPlayer = () => {};
    g.player.spawn(b.x - 140, b.z - 140);
  } else {
    g.player.spawn(b.x + 6, b.z + 6);
    const hp = g.hitPlayer.bind(g);
    g.hitPlayer = (n: number) => { const was = g.playerAlive; hp(n); if (was && !g.playerAlive) w.__deaths++; };
    let swingT = 0, slingT = 0, moveT = 0;
    w.__step = (dt: number) => {
      swingT -= dt; slingT -= dt; moveT -= dt;
      if (g.waves.phase !== 'night' || !g.playerAlive || moveT > 0) return;
      moveT = 0.1;
      const p = g.player.pos;
      const dB = (e: any) => Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
      const list = g.enemies.list.filter((e: any) => !e.dying && !e.dig && e.rise < 0.6 && dB(e) < 26).sort((q: any, r: any) => dB(q) - dB(r));
      const t = list[0];
      const goal = t ? t.pos : { x: b.x + 6, z: b.z + 6 };
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz) || 1;
      // sling what's out of reach: Wisps overhead, Spitters hanging back
      if (t && (t.def.flying || (t.def.spit && d > 3)) && d < 22 && slingT <= 0) {
        slingT = 1.3;
        g.enemies.damage(t, 28 * g.mods.slingDmg, g.combatCtx, null, { source: 'sling', type: 'blunt' });
      }
      if (d > (t ? 2.0 : 1)) {
        const step = Math.min(d - (t ? 1.9 : 0.5), 0.43);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        p.y = g.world.groundHeight(p.x, p.z, p.y);
      } else if (t && swingT <= 0) {
        swingT = 0.62;
        // the machete takes up to three in its arc
        for (const e of list.filter((e: any) => Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 2.9).slice(0, 3)) {
          g.enemies.damage(e, 28 * g.mods.macheteDmg, g.combatCtx, null, { source: 'melee', stagger: 0.28 });
          if (e.affix === 'thorned') g.hitPlayer(4);
        }
      }
    };
  }

  // ---- the build
  if (fullRun) g.rootBonus = Math.max(0, night - 4);
  const T = w.__towers;
  const cost = (id: string, tier = 1) => (T.rootCost ? T.rootCost(id, tier) : (T.ROOTS[id] || 1) + tier - 1);
  const free = () => g.rootCap - g.rootsUsed;
  const maxTier = night >= 7 ? 3 : night >= 2 ? 2 : 1;
  const angs = g.rifts.filter((r: any) => r.night <= night).map((r: any) => Math.atan2(r.x - b.x, r.z - b.z));
  const mid = Math.atan2(angs.reduce((s: number, a: number) => s + Math.sin(a), 0), angs.reduce((s: number, a: number) => s + Math.cos(a), 0));
  const counts: Record<string, number> = {};
  // the camp's benches sit in the ring too: nudge round them (and anything else) until it fits
  const put = (id: string, ang: number, d: number, rot = 0) => {
    if (id === 'glow_lantern' && !lantern) return null;
    if (cost(id) > free()) return null;
    for (const dd of [d, d + 3, d - 2, d + 6]) {
      for (const off of [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6]) {
        const a = ang + off, x = b.x + Math.sin(a) * dd, z = b.z + Math.cos(a) * dd;
        const r = rot + off;
        if (!g.buildings.check(id, x, z, r, { base: b, player: { x: 1e9, z: 1e9 } })) return g.buildings.place(id, x, z, r, { instant: true });
      }
    }
    console.log('NOFIT', id);
    return null;
  };
  // where each kind stands: towers on the lanes, mortars back behind the Heart, walls and
  // traps out on the lanes
  const lane = (i: number) => angs[i % angs.length] + Math.floor(i / angs.length) * 0.5 * (Math.floor(i / angs.length) % 2 ? 1 : -1);
  const SPOT: Record<string, (i: number) => [number, number, number?]> = {
    bow_tower: (i) => [lane(i), 10],
    tesla_totem: (i) => [lane(i + 1) + 0.25, 12],
    ember_brazier: (i) => [lane(i) - 0.2, 13],
    spore_mortar: (i) => [mid + Math.PI + (i - 1) * 0.6, 8],
    glow_lantern: (i) => [lane(i) + 0.3, 14],
    barricade: (i) => [lane(i), 16, lane(i) + Math.PI / 2],
    spike_trap: (i) => [lane(i), 13],
    vine_snare: (i) => [lane(i) + 0.25, 14],
  };
  const build = (id: string) => {
    const i = counts[id] || 0;
    const [a, d, rot] = SPOT[id](i);
    const bl = put(id, a, d, rot ?? 0);
    if (bl) counts[id] = i + 1;
    return bl;
  };
  const upCost = (bl: any) => cost(bl.id, bl.tier + 1) - cost(bl.id, bl.tier);
  // upgrade the lowest-tier tower (of a kind, or any) that the roots can still feed
  const up = (kind?: string) => {
    const t = g.buildings.list.filter((bl: any) => !bl.dead && bl.def.range && bl.upgradable && bl.tier < maxTier && (!kind || bl.id === kind))
      .sort((p: any, q: any) => p.tier - q.tier)[0];
    if (t && upCost(t) <= free()) { t.upgrade(); return true; }
    return false;
  };
  const lanes = () => { for (let i = 0; i < angs.length; i++) { build('barricade'); build('spike_trap'); } };
  const run = (steps: string[]) => {
    for (const s of steps) {
      if (s === 'up') up();
      else if (s === 'lanes') lanes();
      else if (s.startsWith('up:')) up(s.slice(3));
      else build(s);
    }
  };
  const MONO: Record<string, string> = { bows: 'bow_tower', mortars: 'spore_mortar', braziers: 'ember_brazier', teslas: 'tesla_totem' };
  // wide: build these kinds in turn while any fits, then upgrade them in turn with what's left
  const wide = (ids: string[]) => {
    for (let k = 0, miss = 0; miss < ids.length && k < 60; k++) miss = build(ids[k % ids.length]) ? 0 : miss + 1;
    for (let k = 0, miss = 0; miss < ids.length && k < 60; k++) miss = up(ids[k % ids.length]) ? 0 : miss + 1;
  };
  // tall: one of each kind in turn, each taken to the top tier before the next is built
  const tall = (ids: string[], extra: string[] = []) => {
    for (let round = 0; round < 8; round++) {
      let any = false;
      for (const id of ids) {
        if (!build(id)) continue;
        any = true;
        while (up(id));
        if (round === 0 && id === ids[Math.min(1, ids.length - 1)]) for (const x of extra) build(x);
      }
      if (!any) break;
    }
    for (let k = 0; k < 20 && up(); k++);
  };
  if (setup === 'starter') {
    const kit = w.__diffs.difficulty(diff).starter;
    for (const [id, n] of kit) for (let k = 0; k < n; k++) if (SPOT[id]) build(id);
  } else if (setup === 'mid') {
    run(['bow_tower', 'bow_tower', 'spore_mortar', 'ember_brazier', 'lanes', 'glow_lantern']);
  } else if (setup === 'late') {
    run(['bow_tower', 'bow_tower', 'bow_tower', 'spore_mortar', 'tesla_totem', 'ember_brazier', 'ember_brazier', 'lanes',
      'vine_snare', 'vine_snare', 'vine_snare', 'glow_lantern', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up']);
  } else if (setup === 'cap' || setup === 'full') {
    if (setup === 'full') g.rootBonus = Math.max(0, night - 4);
    run(['bow_tower', 'spore_mortar', 'bow_tower', 'barricade', 'spike_trap', 'up', 'spore_mortar', 'barricade', 'spike_trap', 'up', 'ember_brazier',
      'up', 'bow_tower', 'up', 'barricade', 'spike_trap', 'spore_mortar', 'up', 'up', 'bow_tower', 'up', 'up', 'spore_mortar', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up']);
    if (setup === 'full') {
      for (const bl of g.buildings.list) {
        for (const id of ['glowcap_lens', 'coiled_spring', 'resin_drip', 'bog_heads']) if (bl.canGraft?.(id)) bl.addGraft(id);
        bl.dressGrafts?.();
      }
    }
  } else if (MONO[setup]) wide([MONO[setup]]);
  else if (MONO[setup.replace(/3$/, '')]) tall([MONO[setup.replace(/3$/, '')]]);
  else if (setup === 'mixed') {
    // every role, wide: one of each tower and a lantern, then upgrades and more, the rest in traps
    run(['bow_tower', 'spore_mortar', 'ember_brazier', 'glow_lantern', 'tesla_totem', 'spike_trap', 'spike_trap']);
    wide(['bow_tower', 'spore_mortar', 'ember_brazier', 'tesla_totem']);
  } else if (setup === 'balanced') {
    // every role, as a player would grow it: bows and a mortar raised high, a brazier and a totem
    // at the middle tier, a lantern where they all reach
    run(['bow_tower', 'spore_mortar', 'glow_lantern', 'ember_brazier', 'up:bow_tower', 'up:spore_mortar', 'tesla_totem', 'bow_tower',
      'up:bow_tower', 'up:spore_mortar', 'up:ember_brazier', 'up:bow_tower', 'up:tesla_totem', 'up:bow_tower', 'spore_mortar', 'up:spore_mortar', 'bow_tower', 'up:bow_tower', 'up:spore_mortar', 'up:bow_tower', 'up', 'up', 'up']);
  } else if (setup === 'mixed3') {
    // every role, tall: each tower to the top before the next, then a lantern and traps
    tall(['bow_tower', 'spore_mortar', 'ember_brazier', 'tesla_totem'], ['glow_lantern']);
  } else if (setup !== 'none') throw new Error(`unknown preset ${setup}`);
  // FULL=1: what a good run has besides (as the full preset), on any preset: a root a night from
  // night 5 for relics buried in the Heartwood (added before building), grafts in every free slot
  if (fullRun) {
    for (const bl of g.buildings.list) {
      for (const id of ['glowcap_lens', 'coiled_spring', 'resin_drip', 'bog_heads']) if (bl.canGraft?.(id)) bl.addGraft(id);
      bl.dressGrafts?.();
    }
  }
  // whatever roots are left: traps on the lanes
  if (setup !== 'none' && setup !== 'starter') for (let k = 0; k < 6 && free() > 0; k++) build('spike_trap');
  w.__cap = `${g.rootsUsed}/${g.rootCap}`;
  w.__built = g.buildings.list.map((x: any) => `${x.id.split('_')[0]}${x.tier > 1 ? x.tier : ''}`).join(' ');
  g.buildings.changed = true;
  g.skipToNight();

  if (no.length) {
    const cut = setInterval(() => {
      if (g.waves.phase !== 'night') return;
      g.waves.queue = g.waves.queue.filter((q: any) => !no.includes(q.type));
      clearInterval(cut);
    }, 20);
  }
  // who hurt the buildings and the Heart, who finished each building off, and the wave's health
  const dmg: any = (w.__dmg = { by: {}, heart: {}, killed: [], waveHp: 0, spawned: {}, dealt: {} });
  // what dealt the damage the Blight took: tower (by damage type: pierce is the bow, blunt the
  // mortar, fire the brazier, arc the totem), trap, burn, melee, sling
  {
    const cx = g.combatCtx, od = cx.onDamage;
    cx.onDamage = (e: any, n: number, op: any) => {
      const k = op.source === 'tower' ? op.type || 'tower' : op.source || '?';
      dmg.dealt[k] = Math.round((dmg.dealt[k] || 0) + Math.max(0, n));
      od(e, n, op);
    };
  }
  const spawn = g.enemies.spawn.bind(g.enemies);
  g.enemies.spawn = (...a: any[]) => {
    const e = spawn(...a);
    if (g.waves.phase === 'night') { dmg.waveHp += e.maxHp; dmg.spawned[e.type] = (dmg.spawned[e.type] || 0) + 1; }
    return e;
  };
  const upd = g.enemies.update.bind(g.enemies);
  g.enemies.update = (dt: number, t: number, ctx: any) => {
    const hb = ctx.hitBuilding, hh = ctx.hitBase;
    ctx.hitBuilding = (bl: any, n: number, e: any, ranged?: boolean) => {
      const k = e?.type || '?';
      dmg.by[k] = Math.round((dmg.by[k] || 0) + n);
      const was = bl.dead;
      hb(bl, n, e, ranged);
      if (!was && bl.dead) dmg.killed.push(`${bl.id}<${k}`);
    };
    ctx.hitBase = (n: number, e: any) => {
      const k = e?.type || '?';
      dmg.heart[k] = Math.round((dmg.heart[k] || 0) + n);
      hh(n, e);
    };
    return upd(dt, t, ctx);
  };
  const dmgB = g.buildings.damage.bind(g.buildings);
  g.buildings.damage = (bl: any, n: number) => {
    const was = bl.dead, out = dmgB(bl, n);
    if (g.__slamming) {
      dmg.by.slam = Math.round((dmg.by.slam || 0) + n);
      if (!was && bl.dead) dmg.killed.push(`${bl.id}<slam`);
    }
    return out;
  };
  const slam = g.onSlam.bind(g);
  g.onSlam = (e: any) => { g.__slamming = true; try { return slam(e); } finally { g.__slamming = false; } };
  w.__log = [];
  w.__min = b.hp;
  let lastT = -5;
  const prev = w.__step;
  w.__step = (dt: number) => {
    prev?.(dt);
    w.__min = Math.min(w.__min, b.hp);
    if (g.waves.phase !== 'night' || g.waves.clock - lastT < 5) return;
    lastT = g.waves.clock;
    const es = g.enemies.list.filter((e: any) => !e.dying);
    const dist = (e: any) => Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
    w.__log.push({ t: g.waves.clock | 0, alive: es.length, base: b.hp | 0, near: es.length ? Math.min(...es.map(dist)) | 0 : -1 });
  };
}, opts);
// the night ends when the wave is dead (or the Heart falls); 300 s of night clock is a stall
await page.waitForFunction(() => { const wv = (window as any).game.waves; return (wv.phase !== 'night' && wv.clock > 5) || wv.clock > 300; }, null, { timeout: 900000, polling: 500 }).catch(() => {});
const res = await page.evaluate(() => {
  const w = window as any, g = w.game, b = g.base;
  return {
    cap: w.__cap, built: w.__built, deaths: w.__deaths, clock: Math.round(g.waves.clock), phase: g.waves.phase,
    left: g.enemies.list.filter((e: any) => !e.dying).map((e: any) => [e.type, Math.hypot(e.pos.x - b.x, e.pos.z - b.z) | 0, e.hp | 0]),
    log: w.__log, base: Math.round(b.hp), min: Math.round(w.__min), max: b.maxHp, kills: g.enemies.kills,
    blds: g.buildings.list.map((x: any) => `${x.id.split('_')[0]}${x.tier}:${x.hp | 0}`).join(' '), dmg: w.__dmg,
  };
});
if (env.VERBOSE) for (const l of res.log) console.log(JSON.stringify(l));
console.log('LEFT', JSON.stringify(res.left));
console.log('BUILT', res.cap, res.built);
console.log('END', JSON.stringify({
  night, setup: opts.fullRun ? `${setup}+full` : setup, diff, active: opts.active || undefined, deaths: opts.active ? res.deaths : undefined, no: opts.no.join('+') || undefined,
  held: res.phase !== 'over' && res.phase !== 'night', clock: res.clock, base: res.base, min: res.min, max: res.max, kills: res.kills,
  waveHp: Math.round(res.dmg.waveHp), spawned: res.dmg.spawned,
}));
console.log('DMG', JSON.stringify({ buildings: res.dmg.by, heart: res.dmg.heart, killed: res.dmg.killed }));
console.log('DEALT', JSON.stringify(res.dmg.dealt));
console.log('STANDING', res.blds);
if (errs.length) console.log(errs.join('\n'));
await browser.close();
