// A long mixed session: forty seconds sprinting and swinging through fresh forest by day,
// then home for dusk and ninety seconds of the first night. Prints every long frame with the
// game functions that took the time and any shader program compiled in it (a program first
// compiled mid-run is how most hitches looked). Needs `npm run dev` on :5188.
//
//   node --experimental-strip-types e2e/session.ts [hitchMs=40]
import { chromium } from 'playwright';
const HITCH = Number(process.argv[2] || 40);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5188/?debug&t=0.45');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });
await page.waitForTimeout(3000);
await page.evaluate((HITCH: number) => {
  const g = (window as any).game, w = window as any;
  const L: any = (w.__L = { long: [], n: 0, cur: {}, depth: 0 });
  const wrapAll = (obj: any, label: string) => {
    if (!obj) return;
    let proto = Object.getPrototypeOf(obj);
    const names = new Set<string>();
    while (proto && proto !== Object.prototype) { for (const k of Object.getOwnPropertyNames(proto)) names.add(k); proto = Object.getPrototypeOf(proto); }
    for (const k of names) {
      if (k === 'constructor' || k === 'frame') continue;
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), k) || {};
      if (d.get || d.set) continue;
      let f: any; try { f = obj[k]; } catch { continue; }
      if (typeof f !== 'function') continue;
      const b = f.bind(obj), key = `${label}.${k}`;
      obj[k] = (...a: unknown[]) => { const t0 = performance.now(); try { return b(...a); } finally { const dt = performance.now() - t0; if (dt > 4) L.cur[key] = Math.max(L.cur[key] || 0, dt); } };
    }
  };
  wrapAll(g, 'g');
  for (const k of Object.keys(g)) { const o = g[k]; if (o && typeof o === 'object' && !Array.isArray(o) && o.constructor && o.constructor !== Object && !(o instanceof Node) && !o.isObject3D && !o.isMaterial && k !== 'renderer' && k !== 'camera' && k !== 'scene') wrapAll(o, k); }
  const r = g.renderer;
  const rr = r.render.bind(r);
  r.render = (s: unknown, c: unknown) => { const t0 = performance.now(); rr(s, c); const dt = performance.now() - t0; L.cur['gl.render'] = (L.cur['gl.render'] || 0) + dt; };
  const frame = g.frame.bind(g);
  let last = performance.now();
  g.frame = (ts: number) => {
    L.cur = {};
    const pk0 = new Set(r.info.programs.map((q: any) => q.id)); const p0 = r.info.programs.length, m0 = r.info.memory.textures, ge0 = r.info.memory.geometries;
    const t0 = performance.now();
    frame(ts);
    const now = performance.now(), dt = now - t0, gap = now - last;
    last = now;
    L.n++;
    if (dt > HITCH || gap > HITCH * 1.5) L.long.push({ at: +(now / 1000).toFixed(1), dt: +dt.toFixed(0), gap: +gap.toFixed(0), phase: g.waves.phase, progs: r.info.programs.filter((q: any) => !pk0.has(q.id)).map((q: any) => { const mats: string[] = []; g.scene.traverse((o: any) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (r.properties.get(m).currentProgram === q || r.properties.get(m).programs?.get?.(q.cacheKey) === q) mats.push(`${o.name || o.type}/${m.name || m.type}/${o.parent?.name || ''}`); }); return { name: q.name, mats: [...new Set(mats)].slice(0, 5), key: q.cacheKey.slice(0, 300) }; }), tex: r.info.memory.textures - m0, geo: r.info.memory.geometries - ge0, top: Object.entries(L.cur).sort((a: any, b: any) => b[1] - a[1]).slice(0, 7).map(([k, v]: any) => `${k} ${v.toFixed(0)}`) });
  };
}, HITCH);
const swing = async () => { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
// day: sprint and swing
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
for (let i = 0; i < 40; i++) { await page.waitForTimeout(800); await swing(); if (i % 7 === 6) await page.evaluate(() => { (window as any).game.player.yaw += 1.2; }); if (i === 20) await page.evaluate(() => (window as any).game.autosave()); }
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
// home, and on to dusk
await page.evaluate(() => { const g = (window as any).game; g.hitPlayer = () => {}; g.player.pos.set(g.base.x + 6, g.player.pos.y, g.base.z + 6); g.sky.time = 0.735; });
for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if (i % 2) await swing(); if (i % 10 === 9) await page.evaluate(() => { (window as any).game.player.yaw += 0.8; }); }
const res = await page.evaluate(() => { const w = window as any, g = w.game; return { frames: w.__L.n, phase: g.waves.phase, night: g.waves.night, kills: g.enemies.kills, programs: g.renderer.info.programs.length, long: w.__L.long }; });
console.log(JSON.stringify(res, null, 1));
await browser.close();
