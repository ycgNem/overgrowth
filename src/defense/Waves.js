// The day/night director: gather by day, defend by night.
//
// The sky clock drives everything. Day runs from dawn (0.27) to dusk (0.745) in about four
// and a half real minutes. At dusk the rifts open and the night's wave crawls out in three
// packs. When the last Blight dies the clock races to dawn, the forest regrows, and the next
// night is harder. If the clock reaches pre-dawn with Blight still alive it holds there: the
// night isn't over until they're dead. Every fifth night the Thornback comes. Hold ten nights
// and the Heartwood blooms (you can keep going after that).
export const DAWN = 0.27;
export const DUSK = 0.745;
const PREDAWN = 0.2;
export const DAY_SECONDS = 270;
export const WIN_NIGHT = 10;

const hash = (n) => Math.abs(Math.sin(n * 91.345 + 7.13) * 43758.5453) % 1;

// Does it rain on night n? Never on the first two.
export const rainsOn = (n) => n >= 3 && hash(n) < 0.4;

// What crawls out on night n.
export function waveFor(n) {
  const counts = {
    blightling: 6 + 3 * n,
    rotboar: Math.min(8, Math.max(0, n - 1)),
    wisp: n >= 4 ? Math.floor((n - 2) * 1.3) : 0,
    thornback: n % 5 === 0 ? 1 : 0,
  };
  const out = [];
  const gap = Math.max(1.0, 2.6 - n * 0.15);
  let t = 2;
  let pack = 0;
  const push = (type) => out.push({ type, at: t, pack });
  // pack 1: the first rush of Blightlings
  const b1 = Math.ceil(counts.blightling * 0.4);
  for (let i = 0; i < b1; i++) {
    push('blightling');
    t += i % 4 === 3 ? gap * 3 : gap;
  }
  // a breather, then pack 2: the heavies with an escort (and the boss on boss nights)
  t += 16;
  pack = 1;
  const b2 = Math.ceil(counts.blightling * 0.3);
  for (let i = 0; i < Math.max(b2, counts.rotboar); i++) {
    if (i < counts.rotboar) push('rotboar');
    if (i < b2) push('blightling');
    t += gap * 1.6;
  }
  if (counts.thornback) {
    push('thornback');
    t += gap * 4;
  }
  // pack 3: whatever is left, with the wisps drifting in over the top
  t += 14;
  pack = 2;
  const b3 = counts.blightling - b1 - b2;
  for (let i = 0; i < Math.max(b3, counts.wisp); i++) {
    if (i < b3) push('blightling');
    if (i < counts.wisp) push('wisp');
    t += gap;
  }
  return { list: out, counts };
}

const NAMES = { blightling: ['Blightling', 'Blightlings'], rotboar: ['Rotboar', 'Rotboars'], wisp: ['Wisp', 'Wisps'], thornback: ['Thornback', 'Thornback'] };
export function describeWave(counts) {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(' · ');
}

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
    this.onDay = null; // (night) when a new day starts (autosave)
    this.onNight = null;
    this.onDawn = null;
    this.onOver = null;
    sky.dayLength = DAY_SECONDS / (DUSK - DAWN);
    this.preview = waveFor(this.night);
  }

  // +12% a night to night 6, then +7%: past that the counts carry the climb
  get hpScale() {
    const n = this.night - 1;
    return 1 + 0.12 * Math.min(n, 5) + 0.07 * Math.max(0, n - 5);
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
    this.preview = waveFor(n);
  }

  startNight() {
    this.phase = 'night';
    this.skipping = false;
    const w = waveFor(this.night);
    this.queue = w.list;
    this.spawnIdx = 0;
    this.clock = 0;
    for (const r of this.rifts) r.target = 1;
    const boss = w.counts.thornback > 0;
    this.hud.banner(`Night ${this.night}`, boss ? 'The ground shakes. The Thornback is coming.' : 'The Blight crawls out of the rifts. Hold the Heartwood.', boss ? 'boss' : 'night');
    this.audio.horn?.();
    this.onNight?.(this.night);
  }

  endNight() {
    this.phase = 'dawn';
    for (const r of this.rifts) r.target = 0;
    const held = this.night;
    this.base.heal(this.base.maxHp * 0.15);
    this.night++;
    this.preview = waveFor(this.night);
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
        const r = this.rifts[(this.spawnIdx + s.pack * 2) % this.rifts.length];
        const a = Math.random() * Math.PI * 2;
        // the boss is already a wall of HP; it scales at half rate
        const k = s.type === 'thornback' ? 1 + (this.hpScale - 1) * 0.5 : this.hpScale;
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
