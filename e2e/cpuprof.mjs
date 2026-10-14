// CPU profile of the running game: boots it (?debug), samples ~4 s of frames with the DevTools
// profiler and prints the functions with the most self time.
//
//   node e2e/cpuprof.mjs [topN]
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const top = +(process.argv[2] ?? 30);
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(2000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.waitForTimeout(4000);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const count = new Map();
for (const id of profile.samples) count.set(id, (count.get(id) ?? 0) + 1);
const total = profile.samples.length;
for (const [id, n] of count) {
  const node = byId.get(id), cf = node.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + n);
}
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
const ms = (profile.endTime - profile.startTime) / 1000;
console.log(`${total} samples over ${ms.toFixed(0)} ms`);
for (const [k, n] of rows) console.log(`${((n / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
void dt;
await browser.close();
