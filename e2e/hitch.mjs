// Hitch hunt: sprints through fresh forest and times every subsystem the frame calls, then
// prints each long frame (over HITCH ms) with what took the time, plus how often each part
// was the culprit and the GC/heap picture. Needs `npm run dev` on :5188.
//
//   node e2e/hitch.mjs [seconds=24] [hitchMs=33]
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const secs = Number(process.argv[2] || 24);
const HITCH = Number(process.argv[3] || 33);
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(3000);

await page.evaluate((HITCH) => {
  const g = window.game;
  const log = (window.__h = { frames: [], cur: {} });
  const wrap = (obj, name, key) => {
    if (!obj?.[name]) return;
    const f = obj[name].bind(obj);
    obj[name] = (...a) => {
      const t0 = performance.now();
      const out = f(...a);
      log.cur[key] = (log.cur[key] || 0) + performance.now() - t0;
      return out;
    };
  };
  wrap(g.world, 'update', 'world');
  wrap(g.world, 'build', 'world.build');
  wrap(g.world, 'updateDressing', 'world.dress');
  for (const k of ['grass', 'litter', 'groundCover', 'canopy', 'water', 'sky', 'weather', 'lights', 'particles', 'ambient', 'hud', 'enemies', 'buildings', 'pickups', 'audio', 'machete', 'base', 'blooms', 'player', 'post']) {
    const o = g[k];
    if (!o) continue;
    for (const m of ['update', 'frame', 'render']) if (typeof o[m] === 'function') wrap(o, m, `${k}.${m}`);
  }
  wrap(g.hud, 'updateMinimap', 'hud.minimap');
  wrap(g, 'cullWorld', 'cullWorld');
  wrap(g, 'findInteractable', 'findInteractable');
  wrap(g.renderer, 'render', 'gl.render');
  const mem = () => performance.memory?.usedJSHeapSize ?? 0;
  const frame = g.frame.bind(g);
  let lastHeap = mem();
  g.frame = (ts) => {
    log.cur = {};
    const t0 = performance.now();
    frame(ts);
    const dt = performance.now() - t0;
    const h = mem();
    log.frames.push({ dt, parts: log.cur, heapDrop: lastHeap - h, heap: h });
    lastHeap = h;
  };
  // frame gaps the frame itself didn't account for (GC between frames, GPU stalls)
  let last = performance.now();
  log.gaps = [];
  const tick = () => {
    const now = performance.now();
    log.gaps.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, HITCH);

await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
// turn now and then so new chunks come into view from the side too
for (let i = 0; i < secs; i++) {
  await page.waitForTimeout(1000);
  if (i % 6 === 5) await page.evaluate(() => { window.game.player.yaw += 0.9; });
}
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');

const res = await page.evaluate((HITCH) => {
  const L = window.__h;
  const f = L.frames.slice(10);
  const dts = f.map((x) => x.dt).sort((a, b) => a - b);
  const gaps = L.gaps.slice(10).sort((a, b) => a - b);
  const pct = (a, q) => +a[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(1);
  const long = f.filter((x) => x.dt > HITCH);
  const blame = {};
  for (const x of long) {
    const top = Object.entries(x.parts).sort((a, b) => b[1] - a[1])[0];
    if (top) blame[top[0]] = (blame[top[0]] || 0) + 1;
  }
  // mean ms per frame of each part
  const mean = {};
  for (const x of f) for (const [k, v] of Object.entries(x.parts)) mean[k] = (mean[k] || 0) + v / f.length;
  const gcs = f.filter((x) => x.heapDrop > 2e6).length;
  return {
    frames: f.length, frameP50: pct(dts, 0.5), frameP95: pct(dts, 0.95), frameP99: pct(dts, 0.99), frameMax: pct(dts, 1),
    gapP50: pct(gaps, 0.5), gapP95: pct(gaps, 0.95), gapP99: pct(gaps, 0.99), gapsOver50: gaps.filter((x) => x > 50).length,
    heapMB: +(f[f.length - 1].heap / 1e6).toFixed(0), bigGCs: gcs,
    meanMs: Object.fromEntries(Object.entries(mean).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(2)])),
    blame,
    long: long.slice(0, 25).map((x) => ({ dt: +x.dt.toFixed(0), ...Object.fromEntries(Object.entries(x.parts).filter(([, v]) => v > 3).map(([k, v]) => [k, +v.toFixed(0)])) })),
    mem: window.game.renderer.info.memory, programs: window.game.renderer.info.programs.length,
  };
}, HITCH);
console.log(JSON.stringify(res, null, 1));
await browser.close();
