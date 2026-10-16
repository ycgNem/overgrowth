// Milestone 14, The Long Tail: key rebinding, the gamepad, capture mode, captions, achievements,
// the daily vigil's seed and the meshopt-compressed models.
//   node e2e/m14.mjs            (needs `npm run dev` on :5188, or BASE=<url>)
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:5188/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
let fails = 0;
const modelWarn = [];
const ok = (msg, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${msg}`);
  if (!pass) fails++;
};
async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (/failed to load/.test(m.text())) modelWarn.push(m.text()); });
  await page.goto(`${BASE}?debug&t=0.4${query}`);
  await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  return page;
}

const page = await open('');

// every Blender model loaded through the meshopt decoder (a failure warns and stands in a
// magenta box): no warnings, and the models in the scene are the real meshes
const models = await page.evaluate(() => {
  const want = ['heartwood', 'bow_tower', 'crate', 'tent', 'wreck', 'coffer', 'workbench', 'firepit'];
  const found = {};
  window.game.scene.traverse((o) => {
    if (!want.includes(o.name) || found[o.name]) return;
    let v = 0;
    o.traverse((m) => { if (m.isMesh) v += m.geometry.attributes.position.count; });
    found[o.name] = v;
  });
  return { found };
});
models.warned = modelWarn;
models.tiny = Object.entries(models.found).filter(([, v]) => v <= 24).map(([k]) => k);
ok(`every model decodes (meshopt) and none is a placeholder (${JSON.stringify(models)})`, !models.warned.length && !models.tiny.length && Object.keys(models.found).length >= 4);

// rebinding: Gather moved to R. R now gathers, E does nothing, and it survives a reload
const rebind = await page.evaluate(async () => {
  const inp = window.game.input;
  inp.rebind('KeyE', 'KeyR');
  const press = (code) => dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
  const lift = (code) => dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
  press('KeyR');
  const rGathers = inp.down('KeyE');
  lift('KeyR');
  press('KeyE');
  const eStill = inp.down('KeyE');
  lift('KeyE');
  return { rGathers, eStill, stored: localStorage.getItem('og.keys') };
});
await page.reload();
await page.waitForFunction(() => window.game?.running, null, { timeout: 90000 });
const kept = await page.evaluate(() => {
  const inp = window.game.input, b = inp.bound('KeyE');
  inp.resetBinds();
  return { kept: b, reset: inp.bound('KeyE') };
});
ok(`rebinding: R gathers, E no longer does, kept over a reload, reset clears it (${JSON.stringify({ ...rebind, ...kept })})`, rebind.rGathers && !rebind.eStill && kept.kept === 'KeyR' && kept.reset === 'KeyE');

// the key it took is never lost: Jump onto W swaps Forward onto Space, and Rotate (whose R
// Gather took above) went to E
const swap = await page.evaluate(() => {
  const inp = window.game.input;
  inp.rebind('KeyE', 'KeyR');
  const rotate = inp.bound('KeyR');
  inp.rebind('Space', 'KeyW');
  const out = { rotate, jump: inp.bound('Space'), forward: inp.bound('KeyW'), wDoes: inp.logical('KeyW'), spaceDoes: inp.logical('Space') };
  inp.resetBinds();
  return out;
});
ok(`a rebind swaps the displaced action onto the old key (${JSON.stringify(swap)})`, swap.rotate === 'KeyE' && swap.jump === 'KeyW' && swap.forward === 'Space' && swap.wDoes === 'Space' && swap.spaceDoes === 'KeyW');

// the gamepad: a pad pressing the left stick forward and A walks and jumps
const pad = await page.evaluate(() => {
  const inp = window.game.input;
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 }));
  const fake = { connected: true, buttons, axes: [0, -0.9, 0, 0] };
  const real = navigator.getGamepads;
  navigator.getGamepads = () => [fake];
  inp.padPrev = [];
  inp.poll(0.016);
  const out = { active: inp.padActive, fwd: inp.down('KeyW'), jump: inp.down('Space') };
  navigator.getGamepads = real;
  fake.buttons = buttons.map(() => ({ pressed: false, value: 0 }));
  fake.axes = [0, 0, 0, 0];
  inp.poll(0.016);
  inp.pad.clear();
  inp.padActive = false;
  return out;
});
ok(`a gamepad's stick walks and A jumps (${JSON.stringify(pad)})`, pad.active && pad.fwd && pad.jump);

// capture mode: F8 frees the camera and hides the HUD; landing puts the player back
const cap = await page.evaluate(async () => {
  const g = window.game;
  const home = g.player.pos.clone();
  g.toggleCapture();
  const on = !!g.capture, hud = getComputedStyle(document.getElementById('hud')).display === 'none' || document.getElementById('hud').style.opacity === '0' || document.getElementById('hud').classList.contains('hidden');
  g.capture.pos.x += 40;
  await new Promise((r) => setTimeout(r, 400));
  const camMoved = Math.abs(g.camera.position.x - home.x) > 20;
  g.toggleCapture();
  await new Promise((r) => setTimeout(r, 200));
  return { on, hud, camMoved, back: Math.hypot(g.player.pos.x - home.x, g.player.pos.z - home.z) < 0.5, off: !g.capture };
});
ok(`capture mode flies free, hides the HUD and lands the player where they were (${JSON.stringify(cap)})`, cap.on && cap.hud && cap.camMoved && cap.back && cap.off);

// captions: with the setting on, the night's horn is written out
const capt = await page.evaluate(() => {
  const g = window.game;
  g.captions = true;
  g.audio.horn();
  const t = document.getElementById('captions')?.textContent || '';
  g.captions = false;
  return t;
});
ok(`captions write out the horn ("${capt}")`, /horn/i.test(capt));

// achievements: a record of five nights earns the first two, once
const ach = await page.evaluate(async () => {
  const A = await import('/src/core/Achievements.js');
  localStorage.removeItem('og.ach');
  const rec = { deepest: 5, bosses: 0, wins: 0, blightWins: 0, kills: 10, elites: 0, built: 3, blooms: 0, pages: 0, grafts: 0, seals: 0, drops: 0, burns: 0, flights: 0, sealed: 0, dailyBest: 0, seen: [] };
  const first = A.checkAchievements(rec, {}).map((a) => a.id);
  const again = A.checkAchievements(rec, {}).map((a) => a.id);
  localStorage.removeItem('og.ach');
  return { first, again, score: A.scoreOf({ nights: 5, kills: 100, bosses: 1 }, 'warden') };
});
ok(`achievements: five nights earns First Light and The Long Week, once; a score (${JSON.stringify(ach)})`, ach.first.includes('first') && ach.first.includes('five') && ach.first.length === 2 && !ach.again.length && ach.score > 0);
await page.close();

// the daily vigil: its own world from the date (the same for everyone that day), its own save
const day = await open('&daily=20261015');
const daily = await day.evaluate(async () => {
  const S = await import('/src/core/Seed.js');
  return { daily: S.DAILY, seed: S.WORLD_SEED, salt: S.WORLD_SALT, label: S.dailyLabel(), rifts: window.game.rifts.length };
});
await day.close();
const day2 = await open('&daily=20261015');
const daily2 = await day2.evaluate(async () => (await import('/src/core/Seed.js')).WORLD_SEED);
await day2.close();
ok(`the daily vigil has its own seed, the same on every load (${JSON.stringify({ ...daily, again: daily2 })})`, daily.daily === '20261015' && daily.seed !== 4217 && daily.seed === daily2 && daily.salt !== 0 && daily.rifts > 0);

console.log(errs.join('\n') || 'no errors');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
