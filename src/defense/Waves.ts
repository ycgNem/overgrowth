// The day/night director: gather by day, defend by night.
//
// The sky clock drives everything. Day runs from dawn (0.27) to dusk (0.745) in about four
// and a half real minutes. At dusk the rifts open and the night's wave crawls out in three
// packs, each leaning on a rift of its own so the pressure moves round the clearing. When the
// last Blight dies the clock races to dawn, the forest regrows, and the next night is harder.
// If the clock reaches pre-dawn with Blight still alive it holds there: the night isn't over
// until they're dead (and the last few stragglers stop for nothing after 45 s of it). Two
// rifts are open on the first night, the third tears on the second, more on nights 7 and 9. The
// Thornback comes on night 5, the Rot Mother on night 10, each about two fifths of the way
// through the wave with a warning first. From night 6 a fourth pack, the surge, pours out of
// every rift at once. A rift a seal keeps quiet takes its share of the wave with it. Hold ten
// nights and the Heartwood blooms (you can keep going after that).
import { AFFIX_IDS } from './Enemies.ts';

export const DAWN = 0.27;
export const DUSK = 0.745;
const PREDAWN = 0.2;
export const DAY_SECONDS = 270;
export const WIN_NIGHT = 10;

const hash = (n: number) => Math.abs(Math.sin(n * 91.345 + 7.13) * 43758.5453) % 1;

// Does it rain on night n? Never on the first two, nor on a boss night (rain damps the braziers,
// and fire is the boss's answer).
export const rainsOn = (n: number) => n >= 3 && n % 5 !== 0 && hash(n) < 0.4;

export type SignId = 'blood' | 'fog' | 'swarm' | 'still';
export interface Sign { name: string; glyph: string; color: string; desc: string }
// Signs: the forest answering what you've done. Every other night from night 4, never on a boss
// night, one is told at dawn for the night ahead, in turn: fog, the Blood Moon, Stillness, the
// Swarm. The Blood Moon only rises while you carry the golden idol; otherwise the Swarm comes in
// its place.
export const SIGNS: Record<string, Sign> = {
  blood: { name: 'Blood Moon', glyph: '◐', color: '#ff6a5a', desc: 'The idol calls them. The Blight run a fifth faster, and everything they drop drops twice.' },
  fog: { name: 'Pale Fog', glyph: '≋', color: '#d8dce8', desc: 'A white fog rolls in off the grove. Your towers see 30% less far.' },
  swarm: { name: 'The Swarm', glyph: '⁂', color: '#d0a0ff', desc: 'Twice the Blightlings, at half the strength.' },
  still: { name: 'Stillness', glyph: '◌', color: '#a0e0c0', desc: 'Not a breath of wind. The Wisps cannot fly: they crawl, and anything can hit them.' },
};
// call: the idol is carried and hasn't yet answered the moon, so the next sign night is a
// Blood Moon whatever the turn (Expedition.moonHeld)
export function signFor(n: number, idol = false, call = false): SignId | null {
  if (n < 4 || n % 2 || n % 5 === 0) return null;
  if (call) return 'blood';
  // the how-manyth sign night this is (4, 6, 8, 12, 14, 16, 18, 22...)
  let i = 0;
  for (let k = 4; k < n; k += 2) if (k % 5) i++;
  const pick = (['fog', 'blood', 'still', 'swarm'] as const)[i % 4];
  return pick === 'blood' && !idol ? 'swarm' : pick;
}

export type BlightType = 'blightling' | 'rotboar' | 'wisp' | 'spitter' | 'burrower' | 'thornback' | 'rot_mother';
export type WaveCounts = Record<BlightType, number>;
export interface Spawn { type: BlightType; at: number; pack: number }
export interface Wave { list: Spawn[]; counts: WaveCounts; surge: boolean; bossAt: number | null }

// Rotboars a night, to night 10 (8 after): the first on night 2, fewer on the boss nights
const BOARS = [0, 0, 1, 2, 3, 2, 4, 6, 7, 7, 5];
// how hard each Blight is on night n (the difficulty's hp on top): +16% a night to night 6,
// +12% to night 10, a step of +22% into the endless nights, +8% a night after. 1.1 climbed 19%
// a night to night 6 and then 5%, so the late nights were all count, and night 11 was easier
// than night 10.
export const hpScaleFor = (n: number) => 1 + 0.16 * (Math.min(n, 6) - 1) + 0.12 * Math.max(0, Math.min(n, 10) - 6) + (n >= 11 ? 0.22 : 0) + 0.08 * Math.max(0, n - 11);
// and the bosses (a wall of HP already): the Thornback comes in at 0.6 on night 5 and grows a
// tenth a night after; the Rot Mother at 0.45 on night 10, growing 8% a night. (1.1 jumped
// 3.6 times over from night 10 to 15.)
export const bossScaleFor = (type: string, n: number) => (type === 'thornback' ? 0.6 * (1 + 0.1 * Math.max(0, n - 5)) : 0.45 * (1 + 0.08 * Math.max(0, n - 10)));

// What crawls out on night n. `count` scales the packs (the difficulty, and the rifts a seal
// has put to sleep); the boss stays.
export function waveFor(n: number, count = 1, sign: string | null = null): Wave {
  const late = Math.max(0, n - 5);
  const sc = (x: number) => Math.round(x * count);
  // the Swarm: twice the Blightlings (the surge's too), each half as tough (Waves.update)
  const swarm = sign === 'swarm' ? 2 : 1;
  // the surge (nights 6+): everything at once, from every side. It starts small: a defence
  // that filled its roots held night 6 without a scratch, and lost 8 and 10 to the Rotboars
  const surge = {
    blightling: sc(late * 3) * swarm, rotboar: sc(Math.min(Math.ceil(late / 2), 3)), wisp: sc(Math.ceil(late / 2)),
    spitter: sc(Math.ceil(late / 3)), burrower: sc(Math.floor(late / 2)),
  };
  // Spitters from night 3 and Burrowers from night 6 take the place of Blightlings (two and
  // three of them each), so a night changes shape more than it grows
  const spit = sc(n >= 3 ? Math.floor(n / 3) : 0), dig = sc(n >= 6 ? Math.min(n - 5, 6) : 0);
  const main = {
    blightling: Math.max(sc(4), sc(9 + 3 * n) - spit * 2 - dig * 3) * swarm,
    rotboar: sc(n <= 10 ? BOARS[n] : 8),
    wisp: sc(n >= 4 ? Math.floor((n - 2) * 1.2) : 0),
    spitter: spit,
    burrower: dig,
  };
  const counts: WaveCounts = {
    blightling: main.blightling + surge.blightling,
    rotboar: main.rotboar + surge.rotboar,
    wisp: main.wisp + surge.wisp,
    spitter: main.spitter + surge.spitter,
    burrower: main.burrower + surge.burrower,
    // night 10, the last before the rescue, is the Rot Mother's; from 15 she leads every fifth
    // night with one Thornback at her side
    thornback: n % 5 === 0 && n !== 10 ? 1 : 0,
    rot_mother: n % 5 === 0 && n >= 10 ? 1 : 0,
  };
  const out: Spawn[] = [];
  // seconds between spawns in a pack: tight from the first night (a rush, not a trickle one bow
  // could pick off), tighter as the nights go on
  const gap = Math.max(1.0, Math.min(2.6 - n * 0.15, 1.5 + n * 0.05));
  let t = 2;
  let pack = 0;
  const push = (type: BlightType) => out.push({ type, at: t, pack });
  // pack 1: the first rush of Blightlings
  const b1 = Math.ceil(main.blightling * 0.4);
  for (let i = 0; i < b1; i++) {
    push('blightling');
    t += i % 4 === 3 ? gap * 3 : gap;
  }
  // a breather, then pack 2: the heavies with an escort, Spitters lobbing from behind them
  t += Math.max(10, 17 - n);
  pack = 1;
  const b2 = Math.ceil(main.blightling * 0.3);
  for (let i = 0; i < Math.max(b2, main.rotboar, main.spitter); i++) {
    if (i < main.rotboar) push('rotboar');
    if (i < b2) push('blightling');
    if (i < main.spitter) push('spitter');
    t += gap * 1.6;
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
  // the boss comes two fifths of the way through (1.1's Thornback came with the second pack and
  // took over a minute to reach the clearing); on night 15 on, the Thornback a little after her
  let bossAt: number | null = null;
  if (counts.thornback || counts.rot_mother) {
    const end = out.length ? out[out.length - 1].at : 2;
    bossAt = 2 + (end - 2) * 0.4;
    if (counts.rot_mother) out.push({ type: 'rot_mother', at: bossAt, pack: 1 });
    if (counts.thornback) out.push({ type: 'thornback', at: bossAt + (counts.rot_mother ? 12 : 0), pack: 1 });
    out.sort((a, b) => a.at - b.at);
  }
  return { list: out, counts, surge: late > 0, bossAt };
}

const NAMES: Record<BlightType, [string, string]> = {
  blightling: ['Blightling', 'Blightlings'], rotboar: ['Rotboar', 'Rotboars'], wisp: ['Wisp', 'Wisps'],
  spitter: ['Spitter', 'Spitters'], burrower: ['Burrower', 'Burrowers'], thornback: ['Thornback', 'Thornbacks'],
  rot_mother: ['Rot Mother', 'Rot Mothers'],
};
export function describeWave(counts: Partial<WaveCounts>) {
  return (Object.entries(counts) as [BlightType, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(' · ');
}

// told the first night each one comes
const FIRST: Partial<Record<BlightType, string>> = {
  wisp: 'New Blight: Wisps fly over walls and traps, and dive at you. Only bows, Tesla totems and fire reach them.',
  spitter: 'New Blight: Spitters stop at range and lob bile at your towers. Get in close.',
  burrower: 'New Blight: Burrowers dig under walls. A Glowcap Lantern drags them up into the light.',
};

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// the parts of the game Waves talks to (Game wires them up)
interface Rift { x: number; z: number; night: number; target: number; grove?: boolean }
interface SpawnPoint { x: number; z: number; bloom?: unknown }
interface WaveDeps {
  sky: { time: number; timeScale: number; dayLength: number };
  enemies: { alive: number; hurry: boolean; spawn(type: string, x: number, z: number, hpScale?: number, o?: { walk?: boolean }): any; makeElite(e: any, affix: string): void };
  rifts: Rift[];
  hud: { banner(title: string, sub: string, kind?: string, line2?: { text: string; color: string } | null): void; message(text: string, color?: string): void };
  audio: { horn?(): void; roar?(): void; dawn?(): void };
  world: { regrow(): void };
  base: { x: number; z: number; maxHp: number; dead: boolean; heal(n: number): void };
}
export interface Difficulty { hp: number; count: number; elites?: number; eliteFrom?: number }

export class Waves {
  sky: WaveDeps['sky'];
  enemies: WaveDeps['enemies'];
  rifts: Rift[];
  hud: WaveDeps['hud'];
  audio: WaveDeps['audio'];
  world: WaveDeps['world'];
  base: WaveDeps['base'];
  night = 1;
  phase: 'day' | 'night' | 'dawn' | 'over' = 'day';
  queue: Spawn[] = [];
  clock = 0;
  spawnIdx = 0;
  skipping = false; // fast-forwarding to dusk on request
  won = false;
  diff: Required<Difficulty> = { hp: 1, count: 1, elites: 1, eliteFrom: 5 }; // the difficulty (core/Difficulty.js)
  coverage: ((x: number, z: number) => number) | null = null; // tower fire covering the path from there (Game.coverage)
  weak: Rift | null = null; // the lane the Blight lean on tonight
  dormant: ((r: Rift) => boolean) | null = null; // (rift) => true while a seal keeps it quiet (core/Expedition)
  signOf: (n: number) => string | null = (n) => signFor(n); // tonight's sign (the game knows whether you carry the idol)
  sign: string | null = null;
  // the sign and the number of the night just held, kept through the dawn until the next night
  // starts (Expedition reads lastSign at dawn: the Blood Moon the idol answers)
  lastSign: string | null = null;
  endedNight = 0;
  onDay: ((night: number) => void) | null = null; // when a new day starts (autosave)
  onNight: ((night: number) => void) | null = null;
  onDawn: ((held: number, won: boolean) => void) | null = null;
  onOver: (() => void) | null = null;
  // where tonight's Blight crawl out: the open rifts, and Game adds the lanes of Blooms left
  // standing at dusk
  open: SpawnPoint[] = [];
  surgeCalled = false;
  testMsg: { t: number; text: string } | null = null;
  bossRift: SpawnPoint | null = null;
  bossAt: number | null = null;
  bossTold = false;
  packShift = 0; // which open rift each pack leans on (turned each night)
  lullT = 0; // how long the last few stragglers have been holding the night up
  private pv: Wave | null = null;
  private pk = '';

  constructor({ sky, enemies, rifts, hud, audio, world, base }: WaveDeps) {
    this.sky = sky;
    this.enemies = enemies;
    this.rifts = rifts;
    this.hud = hud;
    this.audio = audio;
    this.world = world;
    this.base = base;
    sky.dayLength = DAY_SECONDS / (DUSK - DAWN);
  }

  // the Blight's health tonight
  get hpScale() {
    return hpScaleFor(this.night) * this.diff.hp;
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

  // what comes tonight (told by day on the HUD): the difficulty's count, less the share of the
  // rifts a seal has put to sleep
  get preview(): Wave {
    const count = this.diff.count * this.riftShare(), sign = this.signOf(this.night);
    const key = `${this.night}|${count}|${sign}`;
    if (key !== this.pk || !this.pv) {
      this.pk = key;
      this.pv = waveFor(this.night, count, sign);
    }
    return this.pv;
  }

  callNight() {
    if (this.phase === 'day') this.skipping = true;
  }

  setNight(n: number) {
    this.night = n;
  }

  setDifficulty(d: Difficulty) {
    this.diff = { hp: d.hp, count: d.count, elites: d.elites ?? 1, eliteFrom: d.eliteFrom ?? 5 };
  }

  // the rifts torn open by tonight
  tornRifts() {
    return this.rifts.filter((r) => r.night <= this.night);
  }

  // the rifts the Blight pour out of tonight (a sealed one is quiet; one is always left)
  openRifts() {
    const torn = this.tornRifts();
    const live = torn.filter((r) => !this.dormant?.(r));
    return live.length ? live : torn.slice(0, 1);
  }

  // the share of the wave that still comes: a rift a seal keeps quiet takes its own share with
  // it (in 1.1 it only sent the same wave down fewer lanes, so a long trek to seal one could
  // make the night harder)
  riftShare() {
    const torn = this.tornRifts();
    if (!torn.length) return 1;
    return this.openRifts().length / torn.length;
  }

  // a compass word for the direction from the Heartwood to (x, z)
  dirTo(x: number, z: number) {
    const dx = x - this.base.x, dz = z - this.base.z;
    return DIRS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
  }

  startNight() {
    this.phase = 'night';
    this.skipping = false;
    this.sign = this.signOf(this.night);
    this.lastSign = null;
    const w = waveFor(this.night, this.diff.count * this.riftShare(), this.sign);
    this.queue = w.list;
    this.spawnIdx = 0;
    this.surgeCalled = false;
    this.clock = 0;
    this.lullT = 0;
    this.enemies.hurry = false;
    this.open = this.openRifts();
    for (const r of this.rifts) r.target = this.open.includes(r) ? 1 : 0;
    this.packShift = Math.floor(Math.random() * 3);
    // the Blight learn: from night 3 the heavy pack and the surge lean on the open rift whose
    // path your towers cover least
    this.weak = null;
    this.testMsg = null;
    const open = this.open as Rift[];
    if (this.coverage && this.night >= 3 && open.length > 1) {
      let best = Infinity;
      for (const r of open) {
        const c = this.coverage(r.x, r.z);
        if (c < best) { best = c; this.weak = r; }
      }
      // said 9 s into the night, on the wave clock (so a pause holds it: see update)
      this.testMsg = { t: 9, text: `They're testing your ${this.dirTo(this.weak.x, this.weak.z)} side, where your towers are thinnest` };
    }
    // the boss comes out of the weakest rift (or any), and says so before it does
    const boss = w.counts.thornback > 0, mother = w.counts.rot_mother > 0;
    this.bossAt = w.bossAt;
    this.bossTold = false;
    this.bossRift = this.weak || open[Math.floor(Math.random() * open.length)] || null;
    const bossDir = this.bossRift ? `, from the ${this.dirTo(this.bossRift.x, this.bossRift.z)}` : '';
    const torn = this.rifts.find((r) => r.night === this.night && r.night > 1);
    const S = this.sign && SIGNS[this.sign];
    // a torn rift or a boss takes the banner's line: the Sign goes on as a second line
    const line2 = S && (boss || torn || mother) ? { text: `${S.glyph} ${S.name}: ${S.desc}`, color: S.color } : null;
    this.hud.banner(`Night ${this.night}`, mother ? `Something vast is stirring under the soil. The Rot Mother is coming tonight${bossDir}.`
      : boss ? `The ground trembles. The Thornback is coming tonight${bossDir}.`
        : torn?.grove ? `A rift has torn open in the drowned grove. They wade in from the water.`
          : torn ? `A new rift has torn open to the ${this.dirTo(torn.x, torn.z)}. Watch your flank.`
            : S ? `${S.glyph} ${S.name}. ${S.desc}` : 'The Blight crawls out of the rifts. Hold the Heartwood.', boss || torn || mother ? 'boss' : 'night', line2);
    this.audio.horn?.();
    // the first night a kind of Blight comes, say what it does
    const before: Partial<WaveCounts> = this.night > 1 ? waveFor(this.night - 1, this.diff.count).counts : {};
    for (const [type, text] of Object.entries(FIRST) as [BlightType, string][]) {
      if (w.counts[type] > 0 && !(before[type] > 0)) setTimeout(() => this.hud.message(text, '#e0b8ff'), 3500);
    }
    this.onNight?.(this.night);
  }

  endNight() {
    this.phase = 'dawn';
    for (const r of this.rifts) r.target = 0;
    const held = this.night;
    this.endedNight = held;
    this.lastSign = this.sign;
    this.base.heal(this.base.maxHp * 0.1);
    this.night++;
    this.sign = null;
    this.enemies.hurry = false;
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

  // where the next of the night's Blight crawls out. Each pack leans on a rift of its own (two
  // in three of it come out there, the rest round the others), the heavy pack on the weakest
  // side when the Blight have found it; the surge comes from every rift in turn.
  spawnPoint(s: Spawn): SpawnPoint {
    if ((s.type === 'thornback' || s.type === 'rot_mother') && this.bossRift) return this.bossRift;
    const open = this.open?.length ? this.open : this.rifts;
    if (s.pack === 3) return open[this.spawnIdx % open.length];
    let home = open[(s.pack + this.packShift) % open.length];
    if (s.pack === 1 && this.weak && open.includes(this.weak)) home = this.weak;
    if (open.length === 1 || Math.random() < 0.65) return home;
    const rest = open.filter((o) => o !== home);
    return rest[this.spawnIdx % rest.length];
  }

  update(dt: number, { fastForward }: { fastForward?: boolean }) {
    const sky = this.sky;
    const t = sky.time;
    // (first: a Heartwood that fell on the frame the last Blight died is lost, not mended at dawn)
    if (this.base.dead && this.phase !== 'over') {
      this.phase = 'over';
      this.enemies.hurry = false;
      this.onOver?.();
    }
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
      // the boss is heralded six seconds before it climbs out
      if (this.bossAt !== null && !this.bossTold && this.clock >= this.bossAt - 6) {
        this.bossTold = true;
        const next = this.queue.find((q) => q.type === 'rot_mother' || q.type === 'thornback');
        const who = next?.type === 'rot_mother' ? 'the Rot Mother' : 'the Thornback';
        const where = this.bossRift ? ` from the ${this.dirTo(this.bossRift.x, this.bossRift.z)} rift` : '';
        this.hud.banner('The ground shakes', `${who[0].toUpperCase()}${who.slice(1)} is coming${where}.`, 'boss');
        this.audio.roar?.();
      }
      while (this.spawnIdx < this.queue.length && this.queue[this.spawnIdx].at <= this.clock) {
        const s = this.queue[this.spawnIdx++];
        const r = this.spawnPoint(s);
        if (s.pack === 3 && !this.surgeCalled) {
          this.surgeCalled = true;
          this.hud.banner('The Surge', 'Every rift is pouring. Hold!', 'boss');
          this.audio.horn?.();
        }
        const a = Math.random() * Math.PI * 2;
        const bossy = s.type === 'thornback' || s.type === 'rot_mother';
        let k = bossy ? bossScaleFor(s.type, this.night) * this.diff.hp : this.hpScale;
        // the Swarm: twice as many Blightlings (waveFor), each half as tough
        if (this.sign === 'swarm' && s.type === 'blightling') k *= 0.5;
        const e = this.enemies.spawn(s.type, r.x + Math.cos(a) * 1.2, r.z + Math.sin(a) * 1.2, k, { walk: this.sign === 'still' });
        // elites: from the difficulty's eliteFrom night (5 on Warden, 2 on Blightborn), more each night
        const ef = this.diff.eliteFrom;
        if (!bossy && this.night >= ef && Math.random() < Math.min(0.28, (0.05 + 0.02 * (this.night - ef)) * this.diff.elites)) {
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
      // the last few holding the night up (a Spitter at a wall that mends as fast as it's hit, a
      // Rotboar off goring a tower out on the edge): after 45 s they stop for nothing
      const alive = this.enemies.alive;
      if (this.spawnIdx >= this.queue.length && alive > 0 && alive <= 3) {
        if ((this.lullT += dt) > 45) this.enemies.hurry = true;
      } else this.lullT = 0;
      // the night holds at pre-dawn until the wave is dead
      const nightPos = (t - DUSK + 1) % 1; // 0 at dusk
      const holdAt = (PREDAWN - DUSK + 1) % 1;
      sky.timeScale = nightPos >= holdAt ? 0 : 1;
      if (this.spawnIdx >= this.queue.length && alive === 0) this.endNight();
    } else if (this.phase === 'dawn') {
      sky.timeScale = 50;
      if (t >= DAWN && t < 0.5) {
        this.phase = 'day';
        sky.timeScale = 1;
        const w = this.preview;
        const id = this.signOf(this.night), S = id && SIGNS[id];
        this.hud.banner(`Day ${this.night}`, `Tonight: ${describeWave(w.counts)}${this.rainTonight ? ' · rain' : ''}${S ? ` · ${S.glyph} ${S.name}` : ''}`);
        if (S) setTimeout(() => this.hud.message(`A sign for tonight: ${S.name}. ${S.desc}`, S.color), 4200);
        this.onDay?.(this.night);
      }
    }
  }
}
