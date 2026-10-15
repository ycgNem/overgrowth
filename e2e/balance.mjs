// Simulates one night with a fixed defence and a passive player, logging enemies and Heartwood HP
// every 5 s. setup: 'starter' (one bow tower) or 'mid' (2 bow towers, mortar, brazier, barricades,
// traps) or 'late' (mid plus a totem, snares, more towers, all upgraded once).
// mid and late raise a Glowcap Lantern by the first rift's wall. Needs `npm run dev` on :5188
// (or BASE=<url>).
//
//   node e2e/balance.mjs <night> <starter|mid|late> [verdant|warden|blightborn]
// NO=spitter,burrower leaves those out of the wave; NOLANTERN=1 builds no lantern (to see what
// each one costs the defence).
import { chromium } from 'playwright';
const night = Number(process.argv[2] || 1);
const setup = process.argv[3] || 'starter';
const diff = process.argv[4] || 'warden';
const no = (process.env.NO || '').split(',').filter(Boolean);
const lantern = !process.env.NOLANTERN;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.7');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.evaluate(({ night, setup, diff, no, lantern }) => {
  const g = window.game, b = g.base;
  g.setDifficulty(diff);
  g.waves.setNight(night);
  g.hitPlayer = () => {};
  // park the player out of the way
  g.player.spawn(b.x - 140, b.z - 140);
  const put = (id, ang, d, rot = 0) => { if (id === 'glow_lantern' && !lantern) return; const x = b.x + Math.sin(ang) * d, z = b.z + Math.cos(ang) * d; if (!g.buildings.check(id, x, z, rot, { base: b, player: { x: 1e9, z: 1e9 } })) g.buildings.place(id, x, z, rot); };
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
}, { night, setup, diff, no, lantern });
await page.waitForFunction(() => window.game.waves.phase !== 'night' && window.game.waves.clock > 5 || window.game.waves.clock > 240, null, { timeout: 400000, polling: 1000 }).catch(() => {});
const res = await page.evaluate(() => ({ left: window.game.enemies.list.filter((e) => !e.dying).map((e) => [e.type, Math.hypot(e.pos.x - window.game.base.x, e.pos.z - window.game.base.z) | 0, e.hp | 0, e.windT > 0, e.rootT > 0, e.slow]), log: window.__log, phase: window.game.waves.phase, base: window.game.base.hp, max: window.game.base.maxHp, kills: window.game.enemies.kills, blds: window.game.buildings.list.map(b => [b.id, b.hp | 0]), dmg: window.__dmg }));
for (const l of res.log) console.log(JSON.stringify(l));
console.log('LEFT', JSON.stringify(res.left));
console.log('END', JSON.stringify({ night, setup, diff, no: no.join('+') || undefined, lantern, phase: res.phase, base: res.base, max: res.max, kills: res.kills, blds: res.blds }));
console.log('DMG', JSON.stringify(res.dmg));
console.log(errs.join('\n'));
await browser.close();
