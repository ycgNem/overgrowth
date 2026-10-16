// The day/night director: gather by day, defend by night.
//
// The sky clock drives everything. Day runs from dawn (0.27) to dusk (0.745) in about four
// and a half real minutes. At dusk the rifts open and the night's wave crawls out in three
// packs. When the last Blight dies the clock races to dawn, the forest regrows, and the next
// night is harder. If the clock reaches pre-dawn with Blight still alive it holds there: the
// night isn't over until they're dead. The Thornback comes on night 5, the Rot Mother on night
// 10. From night 6 a fourth pack, the surge, pours out of every rift at once, and new rifts
// tear open on nights 7 and 9. Hold ten
// nights and the Heartwood blooms (you can keep going after that).
import { AFFIX_IDS } from './Enemies.js';

export const DAWN = 0.27;
export const DUSK = 0.745;
const PREDAWN = 0.2;
export const DAY_SECONDS = 270;
export const WIN_NIGHT = 10;

const hash = (n) => Math.abs(Math.sin(n * 91.345 + 7.13) * 43758.5453) % 1;

// Does it rain on night n? Never on the first two.
export const rainsOn = (n) => n >= 3 && hash(n) < 0.4;

// Signs: the forest answering what you've done. Every other night from night 4, never on a boss
// night, one is told at dawn for the night ahead, in turn: fog, the Blood Moon, Stillness, the
// Swarm. The Blood Moon only rises while you
// carry the golden idol; otherwise the Swarm comes in its place.
export const SIGNS = {
  blood: { name: 'Blood Moon', glyph: '◐', color: '#ff6a5a', desc: 'The idol calls them. The Blight run a fifth faster, and everything they drop drops twice.' },
  fog: { name: 'Pale Fog', glyph: '≋', color: '#d8dce8', desc: 'A white fog rolls in off the grove. Your towers see 30% less far.' },
  swarm: { name: 'The Swarm', glyph: '⁂', color: '#d0a0ff', desc: 'Twice the Blightlings, at half the strength.' },
  still: { name: 'Stillness', glyph: '◌', color: '#a0e0c0', desc: 'Not a breath of wind. The Wisps cannot fly: they crawl, and anything can hit them.' },
};
// call: the idol is carried and hasn't yet answered the moon, so the next sign night is a
// Blood Moon whatever the turn (Expedition.moonHeld)
export function signFor(n, idol = false, call = false) {
  if (n < 4 || n % 2 || n % 5 === 0) return null;
  if (call) return 'blood';
  // the how-manyth sign night this is (4, 6, 8, 12, 14, 16, 18, 22...)
  let i = 0;
  for (let k = 4; k < n; k += 2) if (k % 5) i++;
  const pick = ['fog', 'blood', 'still', 'swarm'][i % 4];
  return pick === 'blood' && !idol ? 'swarm' : pick;
}

// What crawls out on night n. `count` scales the packs (the difficulty); the boss stays.
export function waveFor(n, count = 1, sign = null) {
  const late = Math.max(0, n - 5);
  const sc = (x) => Math.round(x * count);
  // the surge (nights 6+): everything at once, from every side. It starts small: a defence
  // that filled its roots held night 6 without a scratch, and lost 8 and 10 to the Rotboars
  const surge = {
    blightling: sc(late * 3), rotboar: sc(Math.min(late, 3)), wisp: sc(Math.ceil(late / 2)),
    spitter: sc(Math.ceil(late / 3)), burrower: sc(Math.floor(late / 2)),
  };
  // Spitters from night 3 and Burrowers from night 6 take the place of Blightlings (two and
  // three of them each), so a night changes shape more than it grows
  const spit = sc(n >= 3 ? Math.floor(n / 3) : 0), dig = sc(n >= 6 ? n - 5 : 0);
  const counts = {
    blightling: Math.max(3, sc(6 + 3 * n) - spit * 2 - dig * 3) * (sign === 'swarm' ? 2 : 1) + surge.blightling,
    rotboar: sc(n >= 5 ? Math.min(7, n) : Math.max(0, n - 1)) + surge.rotboar,
    wisp: sc(n >= 4 ? Math.floor((n - 2) * 1.3) : 0) + surge.wisp,
    spitter: spit + surge.spitter,
    burrower: dig + surge.burrower,
    // night 10, the last before the rescue, is the Rot Mother's; from 15 she leads every fifth
    // night with one Thornback at her side
    thornback: n % 5 === 0 && n !== 10 ? 1 : 0,
    rot_mother: n % 5 === 0 && n >= 10 ? 1 : 0,
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
  t += Math.max(10, 17 - n);
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
  if (counts.rot_mother) {
    push('rot_mother');
    t += gap * 4;
  }
  // pack 3: whatever is left, with the wisps drifting in over the top
  t += Math.max(9, 15 - n);
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
  rot_mother: ['Rot Mother', 'Rot Mothers'],
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
    this.diff = { hp: 1, count: 1, elites: 1, eliteFrom: 4 }; // the difficulty (core/Difficulty.js)
    this.coverage = null; // (x, z) => tower fire covering the path from there (Game.coverage)
    this.weak = null; // the lane the Blight lean on tonight
    this.dormant = null; // (rift) => true while a seal keeps it quiet (core/Expedition.js)
    this.signOf = (n) => signFor(n); // tonight's sign (the game knows whether you carry the idol)
    this.sign = null;
    this.onDay = null; // (night) when a new day starts (autosave)
    this.onNight = null;
    this.onDawn = null;
    this.onOver = null;
    sky.dayLength = DAY_SECONDS / (DUSK - DAWN);
    this.preview = waveFor(this.night);
  }

  // +19% a night to night 6, then +5%: steep early (a full defence held night 6 untouched),
  // nearly flat late, where the surge and the bosses carry the climb
  get hpScale() {
    const n = this.night - 1;
    return (1 + 0.19 * Math.min(n, 5) + 0.05 * Math.max(0, n - 5)) * this.diff.hp;
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
    this.preview = waveFor(n, this.diff.count, this.signOf(n));
  }

  setDifficulty(d) {
    this.diff = { hp: d.hp, count: d.count, elites: d.elites ?? 1, eliteFrom: d.eliteFrom ?? 4 };
    this.preview = waveFor(this.night, d.count, this.signOf(this.night));
  }

  // the rifts the Blight pour out of tonight (a sealed one is quiet; one is always left)
  openRifts() {
    const torn = this.rifts.filter((r) => r.night <= this.night);
    const live = torn.filter((r) => !this.dormant?.(r));
    return live.length ? live : torn.slice(0, 1);
  }

  startNight() {
    this.phase = 'night';
    this.skipping = false;
    this.sign = this.signOf(this.night);
    const w = waveFor(this.night, this.diff.count, this.sign);
    this.queue = w.list;
    this.spawnIdx = 0;
    this.surgeCalled = false;
    this.clock = 0;
    this.open = this.openRifts();
    for (const r of this.rifts) r.target = this.open.includes(r) ? 1 : 0;
    // the Blight learn: from night 3 the heavy pack and the surge lean on the open rift whose
    // path your towers cover least
    this.weak = null;
    if (this.coverage && this.night >= 3 && this.open.length > 1) {
      let best = Infinity;
      for (const r of this.open) {
        const c = this.coverage(r.x, r.z);
        if (c < best) { best = c; this.weak = r; }
      }
      const w = this.weak, dx = w.x - this.base.x, dz = w.z - this.base.z;
      const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const dir = dirs[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
      // said 9 s into the night, on the wave clock (so a pause holds it: see update)
      this.testMsg = { t: 9, text: `They're testing your ${dir} side, where your towers are thinnest` };
    }
    const boss = w.counts.thornback > 0, torn = this.rifts.find((r) => r.night === this.night && r.night > 1);
    const S = this.sign && SIGNS[this.sign];
    // a torn rift or a boss takes the banner's line: the Sign goes on as a second line
    const line2 = S && (boss || torn || w.counts.rot_mother) ? { text: `${S.glyph} ${S.name}: ${S.desc}`, color: S.color } : null;
    this.hud.banner(`Night ${this.night}`, w.counts.rot_mother ? `Something vast is dragging itself out of the soil. The Rot Mother.`
      : boss ? `The ground shakes. The Thornback is coming.`
        : torn?.grove ? `A rift has torn open in the drowned grove. They wade in from the water.`
          : torn ? `A new rift has torn open. Watch your flank.`
            : S ? `${S.glyph} ${S.name}. ${S.desc}` : 'The Blight crawls out of the rifts. Hold the Heartwood.', boss || torn || w.counts.rot_mother ? 'boss' : 'night', line2);
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
    this.base.heal(this.base.maxHp * 0.1);
    this.night++;
    this.sign = null;
    this.preview = waveFor(this.night, this.diff.count, this.signOf(this.night));
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

  // tonight's Sign (on the day before it too), for the HUD
  get signTonight() {
    const s = this.phase === 'night' ? this.sign : this.phase === 'day' ? this.signOf(this.night) : null;
    return s ? SIGNS[s] : null;
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
      if (this.testMsg && (this.testMsg.t -= dt) <= 0) {
        this.hud.message(this.testMsg.text, '#ffb0b0');
        this.testMsg = null;
      }
      this.clock += dt;
      while (this.spawnIdx < this.queue.length && this.queue[this.spawnIdx].at <= this.clock) {
        const s = this.queue[this.spawnIdx++];
        // each pack favours a different rift, so the pressure moves around the clearing
        // the surge comes from every rift in turn
        const open = this.open?.length ? this.open : this.rifts;
        let r = open[(s.pack === 3 ? this.spawnIdx : this.spawnIdx + s.pack * 2) % open.length];
        if (this.weak && open.includes(this.weak) && (s.pack === 1 || s.pack === 3) && Math.random() < 0.35) r = this.weak;
        if (s.pack === 3 && !this.surgeCalled) {
          this.surgeCalled = true;
          this.hud.banner('The Surge', 'Every rift is pouring. Hold!', 'boss');
          this.audio.horn?.();
        }
        const a = Math.random() * Math.PI * 2;
        // the boss is already a wall of HP: its first night it comes in light (a mid defence lost
        // night 5 to it), then it scales at half rate. The Rot Mother comes lighter on night 10
        // (she has the surge and her eggs with her) and in full from 15, with a Thornback
        const bossy = s.type === 'thornback' || s.type === 'rot_mother';
        let k = bossy ? (this.night <= 5 ? 0.7 : (1 + (this.hpScale / this.diff.hp - 1) * 0.5) * (s.type === 'rot_mother' && this.night < 15 ? 0.4 : 1)) * this.diff.hp : this.hpScale;
        // the Swarm: twice as many Blightlings, each half as tough
        if (this.sign === 'swarm' && s.type === 'blightling') k *= 0.5;
        const e = this.enemies.spawn(s.type, r.x + Math.cos(a) * 1.2, r.z + Math.sin(a) * 1.2, k, { walk: this.sign === 'still' });
        // elites: from night 4 (2 on Blightborn), more each night
        const ef = this.diff.eliteFrom ?? 4;
        if (!bossy && this.night >= ef && Math.random() < Math.min(0.28, (0.05 + 0.02 * (this.night - ef)) * (this.diff.elites ?? 1))) {
          this.enemies.makeElite(e, AFFIX_IDS[Math.floor(Math.random() * AFFIX_IDS.length)]);
        }
        if (s.type === 'thornback') {
          this.hud.banner('The Thornback', 'It is out of the rift. Bring it down.', 'boss');
          this.audio.roar?.();
        }
        if (s.type === 'rot_mother') {
          this.hud.banner('The Rot Mother', 'She lays as she walks. Burn the eggs or cut them before they hatch.', 'boss');
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
        const S = SIGNS[this.signOf(this.night)];
        this.hud.banner(`Day ${this.night}`, `Tonight: ${describeWave(w.counts)}${this.rainTonight ? ' · rain' : ''}${S ? ` · ${S.glyph} ${S.name}` : ''}`);
        if (S) setTimeout(() => this.hud.message(`A sign for tonight: ${S.name}. ${S.desc}`, S.color), 4200);
        this.onDay?.(this.night);
      }
    }
    if (this.base.dead && this.phase !== 'over') {
      this.phase = 'over';
      this.onOver?.();
    }
  }
}
