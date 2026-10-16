// The daily vigil boots on every date: each date is its own world (core/Seed.js), and a few
// once left the drowned grove nowhere to go. Loads each date and checks the run starts.
//   node e2e/daily.mjs [YYYYMMDD ...]      (default: dates that once failed, and today's week)
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:5188/';
const day = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const week = Array.from({ length: 7 }, (_, i) => day(new Date(Date.now() + i * 864e5)));
const dates = process.argv.slice(2).length ? process.argv.slice(2) : ['20261016', '20261022', '20261023', '20261028', '20261102', '20261103', '20261104', '20261110', ...week];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let fails = 0;
for (const d of [...new Set(dates)]) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}?debug&daily=${d}`);
  const ok = await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 }).then(() => true).catch(() => false);
  const info = ok ? await page.evaluate(() => ({ rifts: window.game.rifts.length, seals: Object.keys(window.game.expedition.sites) })) : null;
  const pass = ok && !errs.length && info.rifts > 0;
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'} daily ${d} ${JSON.stringify(info)} ${errs.join(' | ')}`);
  await page.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
