// Boot the game (?debug) and print the JSON result of a JS expression evaluated in the page.
//   node e2e/probe.mjs "<js expression or async IIFE>"
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE + '?debug');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const out = await page.evaluate(async (code) => (0, eval)(code), process.argv[2]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
