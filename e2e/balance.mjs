// Simulates one night with a fixed defence and a passive player, logging enemies and Heartwood HP
// every 5 s. setup: 'starter' (one bow tower) or 'mid' (2 bow towers, mortar, brazier, barricades,
// traps) or 'late' (mid plus a totem, snares, more towers, all upgraded once).
// mid and late raise a Glowcap Lantern by the first rift's wall. Needs `npm run dev` on :5188
// (or BASE=<url>).
//
//   node e2e/balance.mjs <night> <starter|mid|late|cap> [verdant|warden|blightborn]
// cap fills the night's real root cap (towers, walls, upgrades at a root each); full adds
// buried relics (a root a night from night 5) and grafts in every free slot.
// NO=spitter,burrower leaves those out of the wave; NOLANTERN=1 builds no lantern (to see what
// each one costs the defence). ACTIVE=1 puts a fighting player in the clearing: it walks to the
// Blight nearest the Heart and swings at it, slings Spitters and Wisps, and can be hurt and fall.
import { chromium } from 'playwright';
const night = Number(process.argv[2] || 1);
const setup = process.argv[3] || 'starter';
const diff = process.argv[4] || 'warden';
const no = (process.env.NO || '').split(',').filter(Boolean);
const lantern = !process.env.NOLANTERN;
const active = !!process.env.ACTIVE;
const sign = process.env.SIGN || null;
const abl = (process.env.ABL || '').split(',').filter(Boolean);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.7');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.evaluate(async () => { window.__roots = await import('/src/defense/Towers.ts'); });
await page.evaluate(({ night, setup, diff, no, lantern, active, sign, abl }) => {
  const g = window.game, b = g.base;
  g.setDifficulty(diff);
  // no Signs unless asked for (SIGN=fog|blood|still|swarm), so the table stays comparable
  g.waves.signOf = () => sign;
  // ABL=resist,elite,weak,camp: turn a milestone 12 change off, to see what it costs
  if (abl.includes('resist')) for (const t of Object.values(g.enemies.types)) delete t.resist;
  if (abl.includes('elite')) g.waves.diff.elites = 0;
  if (abl.includes('weak')) g.waves.coverage = null;
  if (abl.includes('camp')) g.world.extra.colliders = g.world.extra.colliders.filter((c) => c.kind !== 'camp');
  g.waves.setNight(night);
  window.__deaths = 0;
  if (!active) {
    g.hitPlayer = () => {};
    // park the player out of the way
    g.player.spawn(b.x - 140, b.z - 140);
  } else {
    g.player.spawn(b.x + 6, b.z + 6);
    const hp = g.hitPlayer.bind(g);
    g.hitPlayer = (n) => { const was = g.playerAlive; hp(n); if (was && !g.playerAlive) window.__deaths++; };
    let swingT = 0, slingT = 0;
    setInterval(() => {
      if (g.waves.phase !== 'night' || !g.playerAlive) return;
      const p = g.player.pos, now = performance.now();
      const dB = (e) => Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
      const list = g.enemies.list.filter((e) => !e.dying && !e.dig && e.rise < 0.6 && dB(e) < 26).sort((q, r) => dB(q) - dB(r));
      const t = list[0];
      const goal = t ? t.pos : { x: b.x + 6, z: b.z + 6 };
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz) || 1;
      // sling what's out of reach: Wisps overhead, Spitters hanging back
      if (t && (t.def.flying || (t.def.spit && d > 3)) && d < 22 && now - slingT > 1300) {
        slingT = now;
        g.enemies.damage(t, 28 * g.mods.slingDmg, g.combatCtx, null, { source: 'sling', type: 'blunt' });
      }
      if (d > (t ? 2.0 : 1)) {
        const step = Math.min(d - (t ? 1.9 : 0.5), 0.43);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        p.y = g.world.groundHeight(p.x, p.z, p.y);
      } else if (t && now - swingT > 620) {
        swingT = now;
        // the machete takes up to three in its arc
        for (const e of list.filter((e) => Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 2.9).slice(0, 3)) {
          g.enemies.damage(e, 28 * g.mods.macheteDmg, g.combatCtx, null, { source: 'melee', stagger: 0.28 });
          if (e.affix === 'thorned') g.hitPlayer(4);
        }
      }
    }, 100);
  }
  // the camp's benches sit in the ring too: nudge round them (and anything else) until it fits
  const put = (id, ang, d, rot = 0) => {
    if (id === 'glow_lantern' && !lantern) return;
    for (const dd of [d, d + 4, d - 3]) {
      for (const off of [0, 0.2, -0.2, 0.4, -0.4]) {
        const a = ang + off, x = b.x + Math.sin(a) * dd, z = b.z + Math.cos(a) * dd;
        const r = rot + off;
        if (!g.buildings.check(id, x, z, r, { base: b, player: { x: 1e9, z: 1e9 } })) { g.buildings.place(id, x, z, r); return; }
      }
    }
    console.log('NOFIT', id);
  };
  const angs = g.rifts.map((r) => Math.atan2(r.x - b.x, r.z - b.z));
  const mid = Math.atan2(angs.reduce((s, a) => s + Math.sin(a), 0), angs.reduce((s, a) => s + Math.cos(a), 0));
  if (setup === 'starter') put('bow_tower', mid, 9);
  if (setup === 'mid') { put('bow_tower', angs[0], 10); put('bow_tower', angs[1] ?? mid, 10); put('spore_mortar', mid + Math.PI, 10); put('ember_brazier', mid, 12); for (const a of angs) { put('barricade', a, 16, a + Math.PI / 2); put('spike_trap', a, 13); } put('glow_lantern', angs[0] + 0.3, 13); }
  // late: the mid ring plus a totem, a snare and a second brazier, everything upgraded once
  if (setup === 'late') {
    put('bow_tower', angs[0], 10); put('bow_tower', angs[1] ?? mid, 10); put('bow_tower', angs[2] ?? -mid, 10);
    put('spore_mortar', mid + Math.PI, 10); put('tesla_totem', mid + 0.8, 8); put('ember_brazier', mid, 12); put('ember_brazier', angs[0] + 0.4, 12);
    for (const a of angs) { put('barricade', a, 16, a + Math.PI / 2); put('spike_trap', a, 13); put('vine_snare', a + 0.25, 14); }
    put('glow_lantern', angs[0] + 0.3, 13);
    for (const bl of g.buildings.list) if (bl.upgradable) bl.upgrade();
  }
  // cap: what a sharp player raises on the night's root cap (upgrades draw a root each): bows and
  // mortars first, walls and traps on the lanes, then upgrades and more towers in turn
  // full: cap, plus what a good run has by then: a root a night from night 5 for relics
  // buried in the Heartwood, and grafts in every free slot
  if (setup === 'full') g.rootBonus = Math.max(0, night - 4);
  if (setup === 'cap' || setup === 'full') {
    const { ROOTS } = window.__roots;
    const cost = (id) => ROOTS[id] || 1;
    const maxTier = night >= 8 ? 3 : 2;
    const ring = (i) => angs[i % angs.length] + (i >= angs.length ? 0.45 : 0);
    let tw = 0;
    const steps = [
      ['bow_tower'], ['spore_mortar'], ['bow_tower'], ['wall'], ['up'], ['spore_mortar'], ['wall'], ['up'], ['ember_brazier'],
      ['up'], ['bow_tower'], ['up'], ['wall'], ['spore_mortar'], ['up'], ['up'], ['bow_tower'], ['up'], ['up'], ['spore_mortar'], ['up'], ['up'], ['up'], ['up'],
    ];
    let wallI = 0;
    for (const [what] of steps) {
      const free = g.rootCap - g.rootsUsed;
      if (what === 'up') {
        const t = g.buildings.list.filter((bl) => !bl.dead && bl.def.range && bl.upgradable && bl.tier < maxTier).sort((p, q) => p.tier - q.tier)[0];
        if (t && free >= 1) t.upgrade();
      } else if (what === 'wall') {
        if (free >= 2) { const a = angs[wallI++ % angs.length]; put('barricade', a, 16, a + Math.PI / 2); put('spike_trap', a, 13); }
      } else if (free >= cost(what)) {
        put(what, what === 'spore_mortar' ? mid + Math.PI + (tw % 3) * 0.6 : what === 'ember_brazier' ? mid : ring(tw), what === 'spore_mortar' ? 8 : 10);
        tw++;
      }
    }
    if (setup === 'full') {
      for (const bl of g.buildings.list) {
        for (const id of ['glowcap_lens', 'coiled_spring', 'resin_drip', 'bog_heads']) if (bl.canGraft?.(id)) bl.addGraft(id);
        bl.dressGrafts?.();
      }
    }
    window.__cap = `${g.rootsUsed}/${g.rootCap}`;
  }
  g.skipToNight();
  if (no.length) {
    const cut = setInterval(() => {
      if (g.waves.phase !== 'night') return;
      g.waves.queue = g.waves.queue.filter((q) => !no.includes(q.type));
      clearInterval(cut);
    }, 50);
  }
  // who does the damage to buildings, and who finished each one off
  const dmg = (window.__dmg = { by: {}, killed: [] });
  const upd = g.enemies.update.bind(g.enemies);
  g.enemies.update = (dt, t, ctx) => {
    const hb = ctx.hitBuilding;
    ctx.hitBuilding = (b, n, e) => {
      const k = e?.type || '?';
      dmg.by[k] = Math.round((dmg.by[k] || 0) + n);
      const was = b.dead;
      hb(b, n, e);
      if (!was && b.dead) dmg.killed.push(`${b.id}<${k}`);
    };
    return upd(dt, t, ctx);
  };
  const dmgB = g.buildings.damage.bind(g.buildings);
  g.buildings.damage = (b, n) => {
    const was = b.dead, out = dmgB(b, n);
    if (g.__slamming) {
      dmg.by.slam = Math.round((dmg.by.slam || 0) + n);
      if (!was && b.dead) dmg.killed.push(`${b.id}<slam`);
    }
    return out;
  };
  const slam = g.onSlam.bind(g);
  g.onSlam = (e) => { g.__slamming = true; try { return slam(e); } finally { g.__slamming = false; } };
  window.__log = [];
  setInterval(() => { const e = g.enemies.list.filter(e => !e.dying); window.__log.push({ t: g.waves.clock | 0, alive: e.length, base: g.base.hp | 0, near: e.length ? Math.min(...e.map(e => Math.hypot(e.pos.x - b.x, e.pos.z - b.z))) | 0 : -1, far: e.length ? Math.max(...e.map(e => Math.hypot(e.pos.x - b.x, e.pos.z - b.z))) | 0 : -1 }); }, 5000);
}, { night, setup, diff, no, lantern, active, sign, abl });
await page.waitForFunction(() => window.game.waves.phase !== 'night' && window.game.waves.clock > 5 || window.game.waves.clock > 240, null, { timeout: 400000, polling: 1000 }).catch(() => {});
const res = await page.evaluate(() => ({ cap: window.__cap, deaths: window.__deaths, elites: window.game.enemies.list.length, left: window.game.enemies.list.filter((e) => !e.dying).map((e) => [e.type, Math.hypot(e.pos.x - window.game.base.x, e.pos.z - window.game.base.z) | 0, e.hp | 0, e.windT > 0, e.rootT > 0, e.slow]), log: window.__log, phase: window.game.waves.phase, base: window.game.base.hp, max: window.game.base.maxHp, kills: window.game.enemies.kills, blds: window.game.buildings.list.map(b => [b.id, b.hp | 0]), dmg: window.__dmg }));
for (const l of res.log) console.log(JSON.stringify(l));
console.log('LEFT', JSON.stringify(res.left));
console.log('END', JSON.stringify({ night, setup, cap: res.cap, diff, active: active || undefined, deaths: active ? res.deaths : undefined, no: no.join('+') || undefined, lantern, phase: res.phase, base: res.base, max: res.max, kills: res.kills, blds: res.blds }));
console.log('DMG', JSON.stringify(res.dmg));
console.log(errs.join('\n'));
await browser.close();
