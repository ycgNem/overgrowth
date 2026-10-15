// Allocation hunt: samples the JS heap allocations (by function) for a few seconds of play,
// standing still and then sprinting, and prints the biggest allocators. Garbage made every
// frame is what wakes the collector mid-fight. Needs `npm run dev` on :5188.
//
//   node e2e/alloc.mjs [topN=30]
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const top = Number(process.argv[2] || 30);
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug&t=0.42');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');

async function sample(label, act) {
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const frames0 = await page.evaluate(() => window.game.frameNo);
  await act();
  const frames = (await page.evaluate(() => window.game.frameNo)) - frames0;
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const self = new Map();
  const walk = (n) => {
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + n.selfSize);
    for (const c of n.children) walk(c);
  };
  walk(profile.head);
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`\n== ${label}: ${(total / 1e6).toFixed(1)} MB over ${frames} frames (${(total / Math.max(1, frames) / 1e3).toFixed(1)} KB a frame)`);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) {
    console.log(`${(v / 1e3).toFixed(0).padStart(8)} KB  ${(v / Math.max(1, frames)).toFixed(0).padStart(7)} B/frame  ${k}`);
  }
}

await sample('standing', () => page.waitForTimeout(5000));
await sample('sprinting', async () => {
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
});
await browser.close();
