// The day/night director: gather by day, defend by night.
//
// The sky clock drives everything. Day runs from dawn (0.27) to dusk (0.745) in about
// six real minutes. At dusk the rifts open and the night's wave crawls out over the next
// minute or two. When the last Blight dies the clock races to dawn, the forest regrows,
// and the next night is harder. If the clock reaches pre-dawn with Blight still alive it
// holds there: the night isn't over until they're dead.
export const DAWN = 0.27;
export const DUSK = 0.745;
const PREDAWN = 0.2;
export const DAY_SECONDS = 360;

// What crawls out on night n.
export function waveFor(n) {
  const out = [];
  const blight = 6 + 3 * n;
  const boars = Math.max(0, n - 1);
  const gap = Math.max(0.7, 2.0 - n * 0.15);
  let t = 2;
  // in packs: a few blightlings, a breath, then the next pack; boars come mid-wave
  for (let i = 0; i < blight; i++) {
    out.push({ type: 'blightling', at: t });
    t += i % 4 === 3 ? gap * 4 : gap;
    if (boars && i === Math.floor(blight / 2)) {
      for (let k = 0; k < boars; k++) {
        out.push({ type: 'rotboar', at: t });
        t += gap * 2;
      }
    }
  }
  return out;
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
    sky.dayLength = DAY_SECONDS / (DUSK - DAWN);
  }

  get hpScale() {
    return 1 + 0.12 * (this.night - 1);
  }

  get remaining() {
    return this.enemies.alive + (this.queue.length - this.spawnIdx);
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

  startNight() {
    this.phase = 'night';
    this.skipping = false;
    this.queue = waveFor(this.night);
    this.spawnIdx = 0;
    this.clock = 0;
    for (const r of this.rifts) r.target = 1;
    this.hud.banner(`Night ${this.night}`, 'The Blight crawls out of the rifts. Hold the Heartwood.');
    this.audio.horn?.();
  }

  endNight() {
    this.phase = 'dawn';
    for (const r of this.rifts) r.target = 0;
    this.hud.banner('Dawn', `You held through night ${this.night}. The forest regrows.`);
    this.audio.pickup?.(3);
    this.base.heal(this.base.maxHp * 0.15);
    this.night++;
    this.world.regrow();
  }

  update(dt, { fastForward }) {
    const sky = this.sky;
    const t = sky.time;
    if (this.phase === 'over') {
      sky.timeScale = 1;
      return;
    }
    if (this.phase === 'day') {
      sky.timeScale = this.skipping ? 60 : fastForward ? 30 : 1;
      if (t >= DUSK || t < DAWN) this.startNight();
    } else if (this.phase === 'night') {
      this.clock += dt;
      while (this.spawnIdx < this.queue.length && this.queue[this.spawnIdx].at <= this.clock) {
        const s = this.queue[this.spawnIdx++];
        const r = this.rifts[this.spawnIdx % this.rifts.length];
        const a = Math.random() * Math.PI * 2;
        this.enemies.spawn(s.type, r.x + Math.cos(a) * 1.2, r.z + Math.sin(a) * 1.2, this.hpScale);
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
        this.hud.banner(`Day ${this.night}`, 'Gather, craft and build. The Blight returns at dusk.');
      }
    }
    if (this.base.dead && this.phase !== 'over') {
      this.phase = 'over';
      this.hud.gameOver({ nights: this.night - 1, kills: this.enemies.kills });
    }
  }
}
