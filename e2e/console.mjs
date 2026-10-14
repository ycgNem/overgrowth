// Boot the game in headless Chrome and print console output and page errors (debugging aid).
//   node e2e/console.mjs [seconds]
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const secs = Number(process.argv[2] ?? 40);
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text().slice(0, 2000)}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(BASE + '?debug');
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  const s = await page.evaluate(() => ({ running: !!window.game?.running, text: document.querySelector('#loading-text')?.textContent }));
  if (s.running) { console.log(`running after ${((Date.now() - t0) / 1000).toFixed(1)} s`); break; }
  await page.waitForTimeout(1000);
}
const final = await page.evaluate(() => ({ running: !!window.game?.running, text: document.querySelector('#loading-text')?.textContent }));
console.log('state', JSON.stringify(final));
await browser.close();
