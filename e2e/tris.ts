// Where the triangles go: boots the game, stands at a few spots and lists what is drawn there
// (triangles = geometry triangles x instances), grouped by plant type and by other meshes, with
// the renderer's own totals with and without the shadow pass, and a frame time.
//
//   node --experimental-strip-types e2e/tris.ts [spot ...]     (spots: spawn base jungle clearing river)
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const spots = process.argv.slice(2).length ? process.argv.slice(2) : ['spawn', 'base', 'jungle'];
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug');
await page.waitForFunction(() => (window as any).game?.running, null, { timeout: 90000 });

for (const spot of spots) {
  const res = await page.evaluate(async (spot) => {
    const g = (window as any).game;
    const W = await import('/src/world/WorldGen.js' as string);
    const s = W.findSpawn();
    let at: { x: number; z: number; yaw?: number } = { x: s.x, z: s.z };
    if (spot === 'base') at = { x: g.base.x + 14, z: g.base.z + 6, yaw: Math.atan2(14, 6) };
    else if (spot !== 'spawn') {
      // the same finders the screenshot tool uses, if the game exposes them
      const f = g.findSpot?.(spot);
      if (f) at = f;
      else at = { x: s.x + (spot === 'jungle' ? 90 : 40), z: s.z + (spot === 'jungle' ? 60 : -70) };
    }
    g.player.spawn(at.x, at.z);
    g.player.vel.set(0, 0, 0);
    if (at.yaw !== undefined) g.player.yaw = at.yaw;
    g.player.pitch = 0;
    const frames = (n: number) => new Promise<void>((done) => {
      const step = () => (--n <= 0 ? done() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
    // let the chunks stream in
    for (let i = 0; i < 40; i++) {
      await frames(10);
      if (!g.world.busy?.()) break;
    }
    await frames(120);
    const r = g.renderer;
    const total = async () => {
      r.info.autoReset = false;
      r.info.reset();
      await frames(1);
      const t = { calls: r.info.render.calls, tris: r.info.render.triangles };
      r.info.autoReset = true;
      return t;
    };
    const both = await total();
    const was = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    await frames(2);
    const view = await total();
    r.shadowMap.enabled = was;
    await frames(2);
    // frame time, median of 120
    const dts: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 120; i++) {
      await frames(1);
      const now = performance.now();
      dts.push(now - last);
      last = now;
    }
    dts.sort((a, b) => a - b);
    // what's in the pools
    const rows: Record<string, { near: number; far: number; tris: number; calls: number }> = {};
    const triCount = (geo: any) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    for (const [key, p] of g.world.pools.map) {
      const type = key.split(':').slice(0, 2).join(':');
      const row = (rows[type] ??= { near: 0, far: 0, tris: 0, calls: 0 });
      for (const [m, k] of [[p.mesh, 'near'], [p.lodMesh, 'far']] as const) {
        if (!m?.count) continue;
        (row as any)[k] += m.count;
        row.tris += m.count * triCount(m.geometry);
        row.calls += Array.isArray(m.material) ? m.material.length : 1;
      }
    }
    // everything else in the scene
    const pooled = new Set<any>();
    for (const p of g.world.pools.map.values()) { pooled.add(p.mesh); pooled.add(p.lodMesh); }
    const other: Record<string, { tris: number; calls: number }> = {};
    g.scene.traverseVisible((o: any) => {
      if (!o.isMesh || pooled.has(o) || !o.geometry?.attributes?.position) return;
      let n = triCount(o.geometry);
      const dr = o.geometry.drawRange;
      if (dr && dr.count !== Infinity) n = dr.count / 3;
      if (o.isInstancedMesh) n *= o.count;
      let name = o.name || o.userData?.kind || '';
      for (let q = o.parent; !name && q; q = q.parent) name = q.name || '';
      name ||= o.material?.name || o.geometry.type || 'mesh';
      const row = (other[name] ??= { tris: 0, calls: 0 });
      row.tris += n;
      row.calls += 1;
    });
    return { both, view, ms: dts[60], p95: dts[114], rows, other };
  }, spot);
  console.log(`\n== ${spot}: ${res.both.calls} calls, ${(res.both.tris / 1e6).toFixed(2)}M tris with shadows; ${res.view.calls} calls, ${(res.view.tris / 1e6).toFixed(2)}M without; frame ${res.ms.toFixed(1)} ms (p95 ${res.p95.toFixed(1)})`);
  const rows = Object.entries(res.rows).filter(([, v]) => v.tris > 0).sort((a, b) => b[1].tris - a[1].tris);
  let sum = 0;
  for (const [k, v] of rows) sum += v.tris;
  console.log(`pools (in view or casting): ${(sum / 1e6).toFixed(2)}M`);
  for (const [k, v] of rows.slice(0, 18)) console.log(`  ${k.padEnd(22)} near ${String(v.near).padStart(5)}  far ${String(v.far).padStart(5)}  ${(v.tris / 1000).toFixed(0).padStart(6)}k tris  ${v.calls} calls`);
  const other = Object.entries(res.other).sort((a, b) => b[1].tris - a[1].tris);
  let osum = 0;
  for (const [, v] of other) osum += v.tris;
  console.log(`other meshes (whole scene, not culled): ${(osum / 1e6).toFixed(2)}M`);
  for (const [k, v] of other.slice(0, 14)) console.log(`  ${k.padEnd(22)} ${(v.tris / 1000).toFixed(0).padStart(6)}k tris  ${v.calls} meshes`);
}
await browser.close();
