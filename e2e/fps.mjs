// Frame limit check: boots the real title (not ?debug) with vsync off, so the browser asks for
// frames as fast as it can, and counts the frames the game draws a second at each limit,
// paused and unpaused.
//
//   node e2e/fps.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5188/';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(BASE);
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
await page.waitForTimeout(2000);
const rate = (cap, paused) => page.evaluate(async ([cap, paused]) => {
  const g = window.game;
  g.fpsCap = cap;
  const wasPaused = g.paused, wasTitle = g.title;
  g.paused = paused;
  if (paused) g.title = null;
  let n = 0, ticks = 0;
  const f = g.frame.bind(g), tk = g.tick.bind(g);
  // the title's frames are drawn in its own branch; count calls, not frameNo
  g.frame = (ts) => { n++; return f(ts); };
  g.tick = (ts) => { ticks++; return tk(ts); };
  await new Promise((r) => setTimeout(r, 2500));
  g.frame = f; g.tick = tk;
  g.paused = wasPaused; g.title = wasTitle;
  return { drawn: Math.round(n / 2.5), asked: Math.round(ticks / 2.5), focus: document.hasFocus() };
}, [cap, paused]);
for (const [cap, paused] of [[0, false], [120, false], [60, false], [30, false], [60, true]]) {
  console.log(`cap ${cap || 'off'}${paused ? ' (paused)' : ''}:`, JSON.stringify(await rate(cap, paused)));
}
await browser.close();
