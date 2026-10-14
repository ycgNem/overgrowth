// Frame-time profile while the player sprints through fresh chunks and teleports: logs every
// long frame with what happened in it (chunk builds, dressing, new shader programs) and a
// summary. Needs `npm run dev` on :5188.
//
//   node e2e/perf.mjs [seconds=20]
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const secs = Number(process.argv[2] || 20);
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(1500);

// instrument: wrap World.build / updateDressing and watch the program count each frame
await page.evaluate(() => {
  const g = window.game, w = g.world, r = g.renderer;
  const log = (window.__perf = { frames: [], cur: { build: 0, dress: 0, world: 0 } });
  const wrap = (obj, name, key) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a) => {
      const t0 = performance.now();
      const out = f(...a);
      const dt = performance.now() - t0;
      if (key === 'dress' && !out) return out;
      log.cur[key] += dt;
      return out;
    };
  };
  wrap(w, 'build', 'build');
  wrap(w, 'updateDressing', 'dress');
  // the whole streaming step (chunk builds now run a slice per frame inside it)
  wrap(w, 'update', 'world');
  let last = performance.now(), progs = r.info.programs.length;
  const tick = () => {
    const now = performance.now();
    const p = r.info.programs.length;
    log.frames.push({ dt: now - last, build: log.cur.build, dress: log.cur.dress, world: log.cur.world, newProgs: p - progs, calls: r.info.render.calls });
    log.cur = { build: 0, dress: 0, world: 0 };
    progs = p;
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// sprint forward for half the time, then teleport twice
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await page.waitForTimeout((secs / 2) * 1000);
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
for (const poi of ['temple', 'wreck']) {
  await page.evaluate((p) => window.game.teleport(p, 30, 0.5), poi);
  await page.waitForTimeout((secs / 4) * 1000);
}

const res = await page.evaluate(() => {
  const f = window.__perf.frames.slice(5);
  const dts = f.map((x) => x.dt).sort((a, b) => a - b);
  const pct = (q) => dts[Math.min(dts.length - 1, Math.floor(dts.length * q))];
  const long = f.filter((x) => x.dt > 50).map((x) => ({ dt: +x.dt.toFixed(0), world: +x.world.toFixed(0), build: +x.build.toFixed(0), dress: +x.dress.toFixed(0), newProgs: x.newProgs }));
  const ws = f.map((x) => x.world).sort((a, b) => a - b);
  return {
    frames: f.length, p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), p99: +pct(0.99).toFixed(1), max: +dts[dts.length - 1].toFixed(0),
    worldP99: +ws[Math.floor(ws.length * 0.99)].toFixed(1), worldMax: +ws[ws.length - 1].toFixed(1),
    over50: long.length, long: long.slice(0, 40), programs: window.game.renderer.info.programs.length,
  };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
