// Menu screenshots: boots the title screen (no ?debug) in headless Chrome and captures it
// after loading, plus any extra states passed by name.
//
//   node e2e/menu.mjs [outDir] [waitSeconds]
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const out = process.argv[2] ?? 'e2e/out/menu';
const wait = Number(process.argv[3] ?? 4);
const W = Number(process.env.W ?? 1600), H = Number(process.env.H ?? 900);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
if (process.env.SAVE) {
  await page.addInitScript((s) => localStorage.setItem('og.save.v1', s), fs.readFileSync(process.env.SAVE, 'utf8'));
}
await page.goto(BASE);
await page.screenshot({ path: `${out}/00-loading.png` });
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-ready.png` });
// any key / click wakes the title
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(wait * 1000);
await page.screenshot({ path: `${out}/02-title.png` });
await page.evaluate(() => window.menu.close(true));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/02-bare.png` });
for (const name of (process.env.PANELS ?? '').split(',').filter(Boolean)) {
  await page.evaluate((n) => window.menuOpen?.(n), name);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/03-${name}.png` });
}
// FLY=1: choose the first item (Continue or New Game) and film the fly-in; headless Chrome
// refuses the pointer lock, so it lands on the pause menu
if (process.env.FLY) {
  await page.evaluate(() => window.menu.close(true));
  await page.keyboard.press('Enter');
  if (!process.env.SAVE) await page.keyboard.press('Enter'); // New Game opens its page; Enter begins
  for (const [ms, name] of [[700, 'fly-a'], [700, 'fly-b'], [600, 'fly-c'], [2500, 'landed']]) {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${out}/04-${name}.png` });
  }
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/05-pause.png` });
  await page.evaluate(() => window.menuOpen('quit'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/06-quit.png` });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
