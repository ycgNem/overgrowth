// The day/night director: gather by day, defend by night.
//
// The sky clock drives everything. Day runs from dawn (0.27) to dusk (0.745) in about four
// and a half real minutes. At dusk the rifts open and the night's wave crawls out in three
// packs. When the last Blight dies the clock races to dawn, the forest regrows, and the next
// night is harder. If the clock reaches pre-dawn with Blight still alive it holds there: the
// night isn't over until they're dead. Every fifth night the Thornback comes (two of them from
// night 10). From night 7 a fourth pack, the surge, pours out of every rift at once, and new
// rifts tear open on nights 7 and 9. Hold ten
// nights and the Heartwood blooms (you can keep going after that).
export const DAWN = 0.27;
export const DUSK = 0.745;
const PREDAWN = 0.2;
export const DAY_SECONDS = 270;
export const WIN_NIGHT = 10;

const hash = (n) => Math.abs(Math.sin(n * 91.345 + 7.13) * 43758.5453) % 1;

// Does it rain on night n? Never on the first two.
export const rainsOn = (n) => n >= 3 && hash(n) < 0.4;

// What crawls out on night n. `count` scales the packs (the difficulty); the boss stays.
export function waveFor(n, count = 1) {
  const late = Math.max(0, n - 6);
  const sc = (x) => Math.round(x * count);
  // the surge (nights 7+): everything at once, from every side
  const surge = {
    blightling: sc(late * 4), rotboar: sc(Math.round(late * 1.5)), wisp: sc(Math.ceil(late / 2)),
    spitter: sc(Math.ceil(late / 3)), burrower: sc(Math.floor(late / 2)),
  };
  // Spitters from night 3 and Burrowers from night 6 take the place of Blightlings (two and
  // three of them each), so a night changes shape more than it grows
  const spit = sc(n >= 3 ? Math.floor(n / 3) : 0), dig = sc(n >= 6 ? n - 5 : 0);
  const counts = {
    blightling: Math.max(3, sc(6 + 3 * n) - spit * 2 - dig * 3) + surge.blightling,
    rotboar: sc(Math.min(8, Math.max(0, n - 1))) + surge.rotboar,
    wisp: sc(n >= 4 ? Math.floor((n - 2) * 1.3) : 0) + surge.wisp,
    spitter: spit + surge.spitter,
    burrower: dig + surge.burrower,
    thornback: n % 5 === 0 ? (n >= 10 ? 2 : 1) : 0,
  };
  const main = {
    blightling: counts.blightling - surge.blightling, rotboar: counts.rotboar - surge.rotboar, wisp: counts.wisp - surge.wisp,
    spitter: spit, burrower: dig,
  };
  const out = [];
  const gap = Math.max(1.0, 2.6 - n * 0.15);
  let t = 2;
  let pack = 0;
  const push = (type) => out.push({ type, at: t, pack });
  // pack 1: the first rush of Blightlings
  const b1 = Math.ceil(main.blightling * 0.4);
  for (let i = 0; i < b1; i++) {
    push('blightling');
    t += i % 4 === 3 ? gap * 3 : gap;
  }
  // a breather, then pack 2: the heavies with an escort, Spitters lobbing from behind them
  // (and the boss on boss nights)
  t += 16;
  pack = 1;
  const b2 = Math.ceil(main.blightling * 0.3);
  for (let i = 0; i < Math.max(b2, main.rotboar, main.spitter); i++) {
    if (i < main.rotboar) push('rotboar');
    if (i < b2) push('blightling');
    if (i < main.spitter) push('spitter');
    t += gap * 1.6;
  }
  if (counts.thornback) {
    push('thornback');
    t += gap * 4;
  }
  // pack 3: whatever is left, with the wisps drifting in over the top
  t += 14;
  pack = 2;
  const b3 = main.blightling - b1 - b2;
  for (let i = 0; i < Math.max(b3, main.wisp, main.burrower); i++) {
    if (i < b3) push('blightling');
    if (i < main.wisp) push('wisp');
    if (i < main.burrower) push('burrower');
    t += gap;
  }
  // the second Thornback rides in with the last pack
  if (counts.thornback > 1) push('thornback');
  // pack 4, the surge: tight and from every rift
  if (late) {
    t += 12;
    pack = 3;
    const m = Math.max(surge.blightling, surge.rotboar, surge.wisp, surge.spitter, surge.burrower);
    for (let i = 0; i < m; i++) {
      if (i < surge.rotboar) push('rotboar');
      if (i < surge.blightling) push('blightling');
      if (i < surge.wisp) push('wisp');
      if (i < surge.spitter) push('spitter');
      if (i < surge.burrower) push('burrower');
      t += gap * 0.5;
    }
  }
  return { list: out, counts, surge: late > 0 };
}

const NAMES = {
  blightling: ['Blightling', 'Blightlings'], rotboar: ['Rotboar', 'Rotboars'], wisp: ['Wisp', 'Wisps'],
  spitter: ['Spitter', 'Spitters'], burrower: ['Burrower', 'Burrowers'], thornback: ['Thornback', 'Thornbacks'],
};
export function describeWave(counts) {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(' · ');
}

// told the first night each one comes
const FIRST = {
  wisp: 'New Blight: Wisps fly over walls and traps. Only bows, Tesla totems and fire reach them.',
  spitter: 'New Blight: Spitters stop at range and lob bile at your towers. Get in close.',
  burrower: 'New Blight: Burrowers dig under walls. A Glowcap Lantern drags them up into the light.',
};

export class Waves {
  constructor({ sky, enemies, rifts, hud, audio, world, base }) {
    Object.assign(this, { sky, enemies, rifts, hud, audio, world, base });
    this.night = 1;
    this.phase = 'day';
    this.queue = [];
    this.clock = 0;
    this.spawnIdx = 0;
    this.skipping = false; // fast-forwarding to dusk on request
    this.won = false;
    this.diff = { hp: 1, count: 1 }; // the difficulty (core/Difficulty.js)
    this.onDay = null; // (night) when a new day starts (autosave)
    this.onNight = null;
    this.onDawn = null;
    this.onOver = null;
    sky.dayLength = DAY_SECONDS / (DUSK - DAWN);
    this.preview = waveFor(this.night);
  }

  // +12% a night to night 6, then +14%: a late defence held nights 9 and 10 without a scratch
  get hpScale() {
    const n = this.night - 1;
    return (1 + 0.12 * Math.min(n, 5) + 0.14 * Math.max(0, n - 5)) * this.diff.hp;
  }

  get remaining() {
    return this.enemies.alive + (this.queue.length - this.spawnIdx);
  }

  get rainTonight() {
    return rainsOn(this.night);
  }

  // seconds of daylight left (real time)
  get dayLeft() {
    const t = this.sky.time;
    const left = t >= DAWN && t < DUSK ? DUSK - t : 0;
    return left * this.sky.dayLength;
  }

  callNight() {
    if (this.phase === 'day') this.skipping = true;
  }

  setNight(n) {
    this.night = n;
    this.preview = waveFor(n, this.diff.count);
  }

  setDifficulty(d) {
    this.diff = { hp: d.hp, count: d.count };
    this.preview = waveFor(this.night, d.count);
  }

  startNight() {
    this.phase = 'night';
    this.skipping = false;
    const w = waveFor(this.night, this.diff.count);
    this.queue = w.list;
    this.spawnIdx = 0;
    this.surgeCalled = false;
    this.clock = 0;
    this.open = this.rifts.filter((r) => r.night <= this.night);
    for (const r of this.rifts) r.target = r.night <= this.night ? 1 : 0;
    const boss = w.counts.thornback > 0, torn = this.rifts.some((r) => r.night === this.night && r.night > 1);
    this.hud.banner(`Night ${this.night}`, boss ? 'The ground shakes. The Thornback is coming.'
      : torn ? 'A new rift has torn open. Watch your flank.' : 'The Blight crawls out of the rifts. Hold the Heartwood.', boss || torn ? 'boss' : 'night');
    this.audio.horn?.();
    // the first night a kind of Blight comes, say what it does
    const before = this.night > 1 ? waveFor(this.night - 1, this.diff.count).counts : {};
    for (const [type, text] of Object.entries(FIRST)) {
      if (w.counts[type] > 0 && !(before[type] > 0)) setTimeout(() => this.hud.message(text, '#e0b8ff'), 3500);
    }
    this.onNight?.(this.night);
  }

  endNight() {
    this.phase = 'dawn';
    for (const r of this.rifts) r.target = 0;
    const held = this.night;
    this.base.heal(this.base.maxHp * 0.15);
    this.night++;
    this.preview = waveFor(this.night, this.diff.count);
    this.world.regrow();
    if (held === WIN_NIGHT && !this.won) {
      this.won = true;
      this.onDawn?.(held, true);
    } else {
      this.hud.banner('Dawn', `You held through night ${held}. The forest regrows.`);
      this.audio.dawn?.();
      this.onDawn?.(held, false);
    }
  }

  update(dt, { fastForward }) {
    const sky = this.sky;
    const t = sky.time;
    if (this.phase === 'over') {
      sky.timeScale = 0.3;
      return;
    }
    if (this.phase === 'day') {
      sky.timeScale = this.skipping ? 60 : fastForward ? 30 : 1;
      if (t >= DUSK || t < DAWN) this.startNight();
    } else if (this.phase === 'night') {
      this.clock += dt;
      while (this.spawnIdx < this.queue.length && this.queue[this.spawnIdx].at <= this.clock) {
        const s = this.queue[this.spawnIdx++];
        // each pack favours a different rift, so the pressure moves around the clearing
        // the surge comes from every rift in turn
        const open = this.open?.length ? this.open : this.rifts;
        const r = open[(s.pack === 3 ? this.spawnIdx : this.spawnIdx + s.pack * 2) % open.length];
        if (s.pack === 3 && !this.surgeCalled) {
          this.surgeCalled = true;
          this.hud.banner('The Surge', 'Every rift is pouring. Hold!', 'boss');
          this.audio.horn?.();
        }
        const a = Math.random() * Math.PI * 2;
        // the boss is already a wall of HP: its first night it comes in light (a mid defence lost
        // night 5 to it), then it scales at half rate (two come on night 10, with the surge)
        const k = s.type === 'thornback' ? (this.night <= 5 ? 0.8 : 1 + (this.hpScale / this.diff.hp - 1) * 0.5) * this.diff.hp : this.hpScale;
        this.enemies.spawn(s.type, r.x + Math.cos(a) * 1.2, r.z + Math.sin(a) * 1.2, k);
        if (s.type === 'thornback') {
          this.hud.banner('The Thornback', 'It is out of the rift. Bring it down.', 'boss');
          this.audio.roar?.();
        }
      }
      // the night holds at pre-dawn until the wave is dead
      const nightPos = (t - DUSK + 1) % 1; // 0 at dusk
      const holdAt = (PREDAWN - DUSK + 1) % 1;
      sky.timeScale = nightPos >= holdAt ? 0 : 1;
      if (this.spawnIdx >= this.queue.length && this.enemies.alive === 0) this.endNight();
    } else if (this.phase === 'dawn') {
      sky.timeScale = 50;
      if (t >= DAWN && t < 0.5) {
        this.phase = 'day';
        sky.timeScale = 1;
        const w = this.preview;
        this.hud.banner(`Day ${this.night}`, `Tonight: ${describeWave(w.counts)}${this.rainTonight ? ' · rain' : ''}`);
        this.onDay?.(this.night);
      }
    }
    if (this.base.dead && this.phase !== 'over') {
      this.phase = 'over';
      this.onOver?.();
    }
  }
}
