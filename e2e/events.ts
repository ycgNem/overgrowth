// Transition hitches: plays through the moments the day turns and things happen (dusk and the
// horn, each pack crawling out, rain rolling in, lightning, the boss, a Sign night, the dawn
// with its regrowth, restock, blooms, Husks and autosave, a noon supply drop, the Rot worn into
// the ground again) and prints, for
// each, the worst frame, how many frames ran over 33 / 50 ms, any shader program compiled and
// the game functions that took the time. Needs `npm run dev` on :5188.
//
//   node --experimental-strip-types e2e/events.ts [firstNight=4] [nights=2]
//   (BASE=http://localhost:5189/ for another server, THROTTLE=4 for a slower CPU)
import { chromium } from 'playwright';

const N0 = Number(process.argv[2] || 4);
const NIGHTS = Number(process.argv[3] || 2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.62');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });
await page.waitForTimeout(4000);
// THROTTLE=4 runs the page's CPU four times slower (a slower machine than this one)
if (process.env.THROTTLE) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });

await page.evaluate(() => {
  const g = (window as any).game, w = window as any;
  const L: any = (w.__E = { frames: [], cur: {}, ev: [], keys: new Set() });
  const mark = (s: string) => { if (!L.ev.includes(s)) L.ev.push(s); };
  L.mark = mark;
  // per-function timing over the game and its systems (as e2e/session.ts)
  const wrapAll = (obj: any, label: string) => {
    if (!obj) return;
    let proto = Object.getPrototypeOf(obj);
    const names = new Set<string>();
    while (proto && proto !== Object.prototype) { for (const k of Object.getOwnPropertyNames(proto)) names.add(k); proto = Object.getPrototypeOf(proto); }
    for (const k of names) {
      if (k === 'constructor' || k === 'frame' || k === 'tick') continue;
      let d: any = null;
      for (let p = Object.getPrototypeOf(obj); p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, k);
      if (d && (d.get || d.set)) continue;
      let f: any; try { f = obj[k]; } catch { continue; }
      if (typeof f !== 'function') continue;
      const b = f.bind(obj), key = `${label}.${k}`;
      obj[k] = (...a: unknown[]) => { const t0 = performance.now(); try { return b(...a); } finally { const dt = performance.now() - t0; if (dt > 2) L.cur[key] = Math.max(L.cur[key] || 0, dt); } };
    }
  };
  // events: what happened this frame
  const on = (obj: any, k: string, label: (a: any[]) => string | null) => {
    const f = obj[k];
    obj[k] = function (...a: any[]) { const s = label(a); if (s) mark(s); return f.apply(this, a); };
  };
  on(g.waves, 'startNight', () => 'dusk/horn');
  on(g.waves, 'endNight', () => 'night end');
  on(g.enemies, 'spawn', (a) => `spawn:${a[0]}`);
  on(g.hud, 'banner', (a) => `banner:${a[0]}`);
  on(g.lights, 'flash', () => 'light flash');
  on(g.expedition, 'placeDrop', () => 'supply drop');
  on(g.world, 'wearAll', () => 'wear (all now)');
  on(g.world, 'wearSoon', () => 'wear (soon)');
  wrapAll(g, 'g');
  for (const k of Object.keys(g)) { const o = g[k]; if (o && typeof o === 'object' && !Array.isArray(o) && o.constructor && o.constructor !== Object && !(o instanceof Node) && !o.isObject3D && !o.isMaterial && !o.isTexture && k !== 'renderer' && k !== 'camera' && k !== 'scene' && k !== 'uniforms') wrapAll(o, k); }
  // the autosave and the records really run (a ?debug run skips them)
  for (const k of ['autosave', 'bankRecords']) {
    const f = g[k];
    g[k] = (...a: unknown[]) => { mark(k); const d = g.debug; g.debug = false; try { return f(...a); } finally { g.debug = d; } };
  }
  const r = g.renderer;
  const rr = r.render.bind(r);
  r.render = (s: unknown, c: unknown) => { const t0 = performance.now(); rr(s, c); L.cur['gl.render'] = (L.cur['gl.render'] || 0) + performance.now() - t0; };
  const frame = g.frame.bind(g);
  let last = performance.now(), rain = g.weather.rain.visible, flash = 0, lights = -1;
  g.frame = (ts: number) => {
    L.cur = {};
    const pk0 = new Set(r.info.programs.map((q: any) => q.id));
    for (const q of r.info.programs) L.keys.add(q.cacheKey);
    const t0 = performance.now();
    frame(ts);
    const now = performance.now();
    if (g.weather.rain.visible !== rain) { rain = g.weather.rain.visible; mark(rain ? 'rain on' : 'rain off'); }
    if (g.weather.flash === 1 && flash !== 1) mark('lightning');
    flash = g.weather.flash;
    // lit lights (three counts a light whatever its intensity, but log it anyway)
    let n = 0; g.scene.traverse((o: any) => { if (o.isLight && o.visible) n++; });
    if (lights >= 0 && n !== lights) mark(`lights ${lights}->${n}`);
    lights = n;
    // programs compiled this frame: 're' for one compiled before, released (its last material
    // disposed) and now compiled again
    const progs = r.info.programs.filter((q: any) => !pk0.has(q.id)).map((q: any) => `${L.keys.has(q.cacheKey) ? 're' : 'new'}:${q.name || q.cacheKey.split(',').slice(0, 2).join('/')}`);
    for (const q of r.info.programs) pk0.delete(q.id);
    if (pk0.size) progs.push(`released ${pk0.size}`);
    L.frames.push({ at: now, dt: now - t0, gap: now - last, ev: L.ev, progs, phase: g.waves.phase, top: Object.entries(L.cur).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6).map(([k, v]: any) => `${k} ${v.toFixed(0)}`) });
    L.ev = [];
    last = now;
  };
  g.hitPlayer = () => {};
  g.hitBase = () => {};
  g.player.pos.set(g.base.x + 7, g.player.pos.y, g.base.z + 7);
});

const ev = (fn: string) => page.evaluate(fn);
const status = () => page.evaluate(() => { const g = (window as any).game; return { phase: g.waves.phase, night: g.waves.night, t: +g.sky.time.toFixed(3), alive: g.enemies.alive, left: g.waves.queue.length - g.waves.spawnIdx, rain: +g.weather.amount.toFixed(2) }; });
const swing = async () => { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };

await ev(`game.waves.setNight(${N0}); game.expedition.pendingDrops = 1; game.sky.time = 0.497`);
console.log('noon drop', await status());
await page.waitForTimeout(6000);
for (let k = 0; k < NIGHTS; k++) {
  await ev('game.sky.time = 0.743');
  // through the night, skipping the quiet stretches between spawns (up to 4 s ahead)
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(1000);
    if (i % 3 === 0) await swing();
    const s = await page.evaluate(() => {
      const w = (window as any).game.waves;
      if (w.phase !== 'night') return w.phase;
      const next = w.queue[w.spawnIdx];
      if (next && next.at - w.clock > 2) w.clock = Math.max(w.clock, next.at - 2);
      return w.spawnIdx >= w.queue.length ? 'spawned' : 'night';
    });
    if (s === 'spawned') { await page.waitForTimeout(6000); break; }
  }
  console.log('night', await status());
  // the night won: every Blight gone at once (no loot, no deaths: the dawn on its own)
  await ev('game.enemies.clear()');
  await page.waitForFunction(() => (window as any).game.waves.phase === 'day', null, { timeout: 60000 });
  await page.waitForTimeout(8000);
  console.log('day', await status());
}

// the Rot spreads round the rifts and a brazier burns it back: the ground is worn again
await ev('game.rot.spread(8, game.rifts, () => true, []); game.rot.dirty = true; game.rewearT = 0; game.rotT = 0');
await page.waitForTimeout(3000);

const res = await page.evaluate(() => {
  const L = (window as any).__E;
  const F = L.frames.slice(5);
  const out: any = { frames: F.length, programs: (window as any).game.renderer.info.programs.length, events: [], long: [] };
  const p = (a: number[], q: number) => +a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(1);
  out.p50 = p(F.map((f: any) => f.dt), 0.5);
  out.p99 = p(F.map((f: any) => f.dt), 0.99);
  F.forEach((f: any, i: number) => {
    if (f.ev.length) {
      // the event frame and the 30 after it
      const win = F.slice(i, i + 31);
      const worst = win.reduce((a: any, b: any) => (b.dt > a.dt ? b : a));
      out.events.push({ i, ev: f.ev.join(', '), dt: +f.dt.toFixed(1), worst: +worst.dt.toFixed(1), worstAt: F.indexOf(worst) - i, over33: win.filter((x: any) => x.dt > 33).length, over50: win.filter((x: any) => x.dt > 50).length, progs: win.flatMap((x: any) => x.progs), heavy: win.filter((x: any) => x.dt > 12).slice(0, 4).map((x: any) => `+${F.indexOf(x) - i} ${x.dt.toFixed(0)}ms: ${x.top.join('; ')}`) });
    }
    if (f.dt > 33 || f.gap > 60) {
      const recent = F.slice(Math.max(0, i - 3), i + 1).flatMap((x: any) => x.ev);
      out.long.push({ i, dt: +f.dt.toFixed(0), gap: +f.gap.toFixed(0), phase: f.phase, recent: [...new Set(recent)].join(', '), progs: f.progs, top: f.top });
    }
  });
  // per phase: how the frames ran
  out.phases = {};
  for (const ph of ['day', 'night', 'dawn']) {
    const a = F.filter((f: any) => f.phase === ph).map((f: any) => f.dt);
    if (a.length) out.phases[ph] = { n: a.length, p50: p(a, 0.5), p95: p(a, 0.95), max: p(a, 1) };
  }
  return out;
});
// spawns are many: keep the first of each kind and any that hitched
const seen = new Set<string>();
res.events = res.events.filter((e: any) => {
  const kinds = e.ev.split(', ').filter((s: string) => !s.startsWith('spawn:') || !seen.has(s));
  e.ev.split(', ').forEach((s: string) => seen.add(s));
  return kinds.length || e.worst > 33 || e.progs.length;
});
console.log(`frames ${res.frames}, p50 ${res.p50} ms, p99 ${res.p99} ms, programs ${res.programs}`, JSON.stringify(res.phases));
console.log('event (frame): event-frame ms, worst of the next 30, frames > 33 / > 50 ms, programs compiled');
for (const e of res.events) {
  console.log(`${e.ev.slice(0, 100)} (${e.i}): ${e.dt} ms, worst ${e.worst} (+${e.worstAt}), >33: ${e.over33}, >50: ${e.over50}${e.progs.length ? `, programs: ${e.progs.join(' ')}` : ''}`);
  for (const h of e.heavy) console.log(`    ${h}`);
}
console.log('long frames (> 33 ms or a gap > 60 ms):');
for (const l of res.long) console.log(`  ${l.i} ${l.phase} ${l.dt} ms (gap ${l.gap}) after [${l.recent}]${l.progs.length ? ` programs: ${l.progs.join(' ')}` : ''}: ${l.top.join('; ')}`);
await browser.close();
