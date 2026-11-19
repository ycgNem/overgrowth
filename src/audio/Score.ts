// The score in play, synthesised like everything else. Nothing in it loops: the forest is the
// music, and the score is a few cues that come and go over it with silence between.
// - By day, now and then, a few notes of the title's kalimba drift over the forest.
// - Through a night, every half-minute to a minute, a chord swells and fades with a few low
//   notes over it, walking a progression so the harmony moves. The closer the Blight get to
//   the Heartwood, the shorter the gaps, and a heavy fight brings a short drum phrase (once,
//   never a loop).
// - A boss gets its own cue as it climbs out: a dark swell and a rising roll.
// - Dawn after a night held: one warm major chord.
// - Paused, dead, the game over or the title: silent.
const A2 = 110;
const semi = (base: number, n: number) => base * 2 ** (n / 12);
// A minor pentatonic, as the title's kalimba picks it (semitones over the root)
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
// the night's chords, semitones over A2: Am, Fmaj7, Dm, Esus4
const NIGHT_CHORDS = [
  [0, 7, 12, 15],
  [-4, 3, 7, 12],
  [-7, 0, 5, 8],
  [-5, 2, 7, 12],
];
// the low notes over each chord (semitones over A2, picked from the chord's own tones)
const NIGHT_LINES = [
  [12, 15, 19, 17, 15, 12],
  [7, 12, 15, 12, 10],
  [5, 8, 12, 10, 8, 5],
  [7, 10, 12, 14, 12],
];
const DAWN = [0, 7, 12, 16, 19, 24];
// drum phrases on a 16-step bar: [step, 0 low / 1 mid / 2 rim, velocity]
const DRUMS: [number, number, number][][] = [
  [[0, 0, 1], [3, 1, 0.5], [6, 0, 0.7], [8, 1, 0.6], [10, 2, 0.4], [11, 1, 0.5], [14, 0, 0.8]],
  [[0, 0, 1], [4, 1, 0.6], [7, 2, 0.4], [8, 0, 0.8], [11, 1, 0.5], [12, 1, 0.6], [13, 1, 0.7], [14, 0, 0.9]],
  [[0, 0, 1], [2, 2, 0.35], [5, 1, 0.55], [8, 0, 0.8], [9, 2, 0.35], [12, 1, 0.6], [15, 2, 0.5]],
];

export interface ScoreState {
  /** 0 by day, 1 at full night */
  night: number;
  /** 0 calm, 1 the Heartwood swarmed */
  threat: number;
  boss: boolean;
  /** a night is under way (the wave, not just the dark) */
  fighting: boolean;
  /** paused, dead, the game over or the title: no music */
  quiet?: boolean;
}

export class Score {
  ctx: AudioContext;
  bus: GainNode;
  echo: DelayNode;
  verb: ConvolverNode;
  padTone: BiquadFilterNode;
  drums: GainNode;
  noise: AudioBuffer;
  pluckIn = 40;
  cueIn = 0;
  chord = 0;
  drumIn = 0;
  threat = 0;
  wasFighting = false;
  wasBoss = false;
  state: ScoreState = { night: 0, threat: 0, boss: false, fighting: false };

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;
    this.noise = noise;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(out);
    // a dark echo the notes sit in
    this.echo = ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.62;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1400;
    this.echo.connect(dark).connect(fb).connect(this.echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    dark.connect(wet).connect(this.bus);
    // a short room of decaying noise, so the swells bloom instead of buzzing
    const len = Math.floor(ctx.sampleRate * 3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    const vw = ctx.createGain();
    vw.gain.value = 0.6;
    this.verb.connect(vw).connect(this.bus);
    // the pad's voices share one soft filter
    this.padTone = ctx.createBiquadFilter();
    this.padTone.type = 'lowpass';
    this.padTone.frequency.value = 900;
    this.padTone.Q.value = 0.5;
    this.padTone.connect(this.bus);
    this.padTone.connect(this.verb);
    this.drums = ctx.createGain();
    this.drums.gain.value = 0.8;
    this.drums.connect(this.bus);
    this.drums.connect(this.verb);
  }

  // kept for AudioSys: the score has no clock of its own, the game drives it
  start() {}

  stop() {
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  // the game's side, every frame
  update(dt: number, s: ScoreState) {
    this.state = s;
    const t = this.ctx.currentTime;
    if (s.quiet) {
      this.bus.gain.setTargetAtTime(0, t, 0.15);
      // the title or a new game: no dawn chord for a night that never ended
      this.wasFighting = s.fighting;
      this.wasBoss = s.boss;
      return;
    }
    this.bus.gain.setTargetAtTime(1, t, 0.3);
    this.threat += (s.threat - this.threat) * Math.min(1, dt * (s.threat > this.threat ? 0.8 : 0.25));
    const k = this.threat;

    if (s.fighting && !this.wasFighting) {
      // the first cue comes in under the dusk horn's tail
      this.cueIn = 7;
      this.chord = 0;
    }
    if (!s.fighting && this.wasFighting) this.dawn();
    this.wasFighting = s.fighting;
    if (s.boss && !this.wasBoss) {
      this.bossCue();
      this.cueIn = Math.max(this.cueIn, 16);
    }
    this.wasBoss = s.boss;

    if (s.fighting) {
      this.cueIn -= dt;
      if (this.cueIn <= 0) {
        this.nightCue(k);
        // 50-70 s apart when the Heartwood is quiet, 22-32 s with it swarmed
        this.cueIn = 50 - 28 * k + Math.random() * (20 - 10 * k);
      }
      // a heavy fight: a drum phrase now and then, between the swells
      this.drumIn -= dt;
      if (k > 0.45 && this.drumIn <= 0) {
        this.drumPhrase(t + 0.1, 84 + 20 * k, 0.6 + 0.4 * k);
        this.drumIn = 30 + Math.random() * 25;
      }
    } else if (s.night < 0.3) {
      // by day, a little kalimba now and then
      this.pluckIn -= dt;
      if (this.pluckIn <= 0) {
        this.pluckIn = 60 + Math.random() * 70;
        this.phrase();
      }
    }
  }

  // one swell of the night's progression, with a slow line over it
  nightCue(k: number) {
    const t0 = this.ctx.currentTime + 0.1;
    const i = this.chord++ % NIGHT_CHORDS.length;
    const len = 9 + Math.random() * 3;
    this.padTone.frequency.setTargetAtTime(700 + 900 * k, t0, 1);
    for (const n of NIGHT_CHORDS[i]) this.pad(semi(A2, n), t0, len, 0.022);
    // three to five notes of the line, starting a few seconds into the swell
    const line = NIGHT_LINES[i];
    const start = Math.floor(Math.random() * 2);
    const count = 3 + Math.floor(Math.random() * 3);
    let at = t0 + 2.2;
    for (let j = 0; j < count && start + j < line.length; j++) {
      this.pluck(semi(A2 * 2, line[start + j]), at, 0.04, 2.2);
      at += 0.7 + Math.random() * 0.5;
    }
  }

  // the boss climbs out: a dark swell a semitone off, and a roll that rises into one blow
  bossCue() {
    const t0 = this.ctx.currentTime + 0.1;
    this.padTone.frequency.setTargetAtTime(600, t0, 0.5);
    this.pad(semi(A2, -12), t0, 8, 0.05);
    this.pad(semi(A2, -11), t0 + 0.8, 7, 0.03);
    this.pad(semi(A2, 3), t0 + 1.5, 6.5, 0.018);
    let at = t0 + 1;
    for (let j = 0; j < 14; j++) {
      this.drum(at, 70, 0.1 + j * 0.03, j % 3 === 2 ? 1 : 0);
      at += 0.32 - j * 0.017;
    }
    this.drum(at + 0.1, 55, 0.9, 0);
  }

  // the night held: one warm A major, up from the dark
  dawn() {
    const t0 = this.ctx.currentTime + 1.5;
    this.padTone.frequency.setTargetAtTime(1600, t0, 1);
    DAWN.forEach((n, j) => this.pad(semi(A2, n), t0 + j * 0.25, 10, 0.02));
    [12, 16, 19, 24].forEach((n, j) => this.pluck(semi(A2 * 2, n), t0 + 2 + j * 0.45, 0.035, 2));
  }

  // a soft pad voice: a triangle and its octave, swelling in and dying away
  pad(f: number, t: number, len: number, vol: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + len * 0.35);
    g.gain.setTargetAtTime(0.0001, t + len * 0.5, len * 0.15);
    g.connect(this.padTone);
    for (const [m, type, v, d] of [[1, 'triangle', 1, -4], [1, 'sine', 0.6, 5], [2, 'sine', 0.15, 0]] as [number, OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * m;
      o.detune.value = d;
      const vg = ctx.createGain();
      vg.gain.value = v;
      o.connect(vg).connect(g);
      o.start(t);
      o.stop(t + len * 1.6);
    }
  }

  // one drum phrase of two bars, then silence
  drumPhrase(t: number, bpm: number, vol: number) {
    const step = 60 / bpm / 4;
    const p1 = DRUMS[Math.floor(Math.random() * DRUMS.length)];
    const p2 = DRUMS[Math.floor(Math.random() * DRUMS.length)];
    for (const [bar, pat] of [[0, p1], [1, p2]] as [number, [number, number, number][]][]) {
      for (const [s, kind, v] of pat) this.drum(t + (bar * 16 + s) * step, [62, 92, 150][kind], vol * v * (bar ? 0.85 : 1), kind);
    }
  }

  drum(t: number, f: number, vol: number, kind: number) {
    const ctx = this.ctx;
    const rim = kind === 2;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.4), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (rim ? 0.12 : 0.5));
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.6);
    // the slap of the skin
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rim ? 2400 : 900;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(Math.max(0.0002, vol * (rim ? 0.2 : 0.1)), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(bp).connect(ng).connect(this.drums);
    n.start(t, Math.random());
    n.stop(t + 0.08);
  }

  // four or five notes of the title's kalimba, high and soft, into the echo
  phrase() {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.1;
    let i = Math.floor(Math.random() * PENTA.length);
    const count = 4 + Math.floor(Math.random() * 2);
    for (let k = 0; k < count; k++) {
      i = Math.max(0, Math.min(PENTA.length - 1, i + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))));
      this.pluck(semi(440, PENTA[i]), t0 + k * (0.42 + Math.random() * 0.2), 0.035);
    }
  }

  pluck(f: number, t: number, vol: number, ring = 1.4) {
    const ctx = this.ctx;
    for (const [m, v] of [[1, 1], [2.01, 0.25], [5.4, 0.06]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring / m);
      o.connect(g).connect(this.bus);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + ring + 0.2);
    }
  }
}
