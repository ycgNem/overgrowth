// Boots the game (?debug) and reports page errors and console errors: a smoke test.
//   node e2e/boot.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto((process.env.BASE ?? 'http://localhost:5188/') + '?debug&t=0.4');
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 }).catch((e) => errs.push('BOOT ' + e.message));
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(() => {
  if (!window.game?.expedition) return { booted: false };
  const g = window.game;
  return g && { seals: Object.keys(g.expedition.sites), rifts: g.rifts.length, sign: g.waves.signOf(6), models: ['rot_mother', 'rot_egg', 'heartseed'].map((m) => !!g.enemies) };
})));
console.log(errs.join('\n') || 'no errors');
await browser.close();
