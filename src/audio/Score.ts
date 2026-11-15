// The score in play, synthesised like everything else. By day, now and then, a few notes of
// the title's kalimba drift over the forest and fade; nothing more, the jungle is the music.
// At dusk a low drone comes up under the horn, and through the night a slow pulse of skin
// drums under it quickens and thickens with the fight: how many Blight are near the
// Heartwood, and whether a boss is out. A boss brings a high, sour string cluster. Dawn lets
// it all go.
const A1 = 55;
const semi = (base: number, n: number) => base * 2 ** (n / 12);
// A minor pentatonic, as the title's kalimba picks it (semitones over A4)
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];

export interface ScoreState {
  /** 0 by day, 1 at full night */
  night: number;
  /** 0 calm, 1 the Heartwood swarmed */
  threat: number;
  boss: boolean;
  /** a night is under way (the wave, not just the dark) */
  fighting: boolean;
}

export class Score {
  ctx: AudioContext;
  bus: GainNode;
  droneGain: GainNode;
  droneTone: BiquadFilterNode;
  bossGain: GainNode;
  drums: GainNode;
  echo: DelayNode;
  nextBeat = 0;
  beat = 0;
  pluckIn = 40;
  level = { night: 0, threat: 0 };
  timer: ReturnType<typeof setInterval> | null = null;
  state: ScoreState = { night: 0, threat: 0, boss: false, fighting: false };
  noise: AudioBuffer;

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;
    this.noise = noise;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(out);
    // a dark echo the plucks and drums sit in
    this.echo = ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.62;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1400;
    this.echo.connect(dark).connect(fb).connect(this.echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    dark.connect(wet).connect(this.bus);

    // the drone: A and E, two saws a hair apart, through a low filter that opens with the fight
    this.droneTone = ctx.createBiquadFilter();
    this.droneTone.type = 'lowpass';
    this.droneTone.frequency.value = 180;
    this.droneTone.Q.value = 2;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneTone.connect(this.droneGain).connect(this.bus);
    for (const [f, d, v] of [[A1, -6, 0.5], [A1, 7, 0.5], [semi(A1, 7), 4, 0.35], [A1 / 2, 0, 0.6]]) {
      const o = ctx.createOscillator();
      o.type = f < 40 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(this.droneTone);
      o.start();
    }
    // the boss: a high cluster a semitone apart, trembling
    this.bossGain = ctx.createGain();
    this.bossGain.gain.value = 0;
    const bossTone = ctx.createBiquadFilter();
    bossTone.type = 'bandpass';
    bossTone.frequency.value = 1300;
    bossTone.Q.value = 0.8;
    bossTone.connect(this.bossGain).connect(this.bus);
    this.bossGain.connect(this.echo);
    const trem = ctx.createOscillator();
    trem.frequency.value = 5.5;
    const tremAmt = ctx.createGain();
    tremAmt.gain.value = 0.3;
    trem.connect(tremAmt).connect(this.bossGain.gain);
    trem.start();
    for (const n of [12, 13, 19]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = semi(semi(A1, 24), n);
      o.connect(bossTone);
      o.start();
    }
    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.bus);
  }

  start() {
    if (this.timer) return;
    this.nextBeat = this.ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.tick(), 100);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    for (const g of [this.droneGain.gain, this.bossGain.gain]) g.setTargetAtTime(0, t, 0.5);
  }

  // the game's side, every frame
  update(dt: number, s: ScoreState) {
    this.state = s;
    const t = this.ctx.currentTime;
    // the levels glide (a swarm arriving swells it over a few seconds, not at once)
    this.level.night += (s.night - this.level.night) * Math.min(1, dt * 0.5);
    this.level.threat += (s.threat - this.level.threat) * Math.min(1, dt * (s.threat > this.level.threat ? 0.8 : 0.25));
    const n = this.level.night, k = this.level.threat;
    this.droneGain.gain.setTargetAtTime(n * (0.035 + 0.05 * k) * (s.fighting ? 1 : 0.5), t, 0.4);
    this.droneTone.frequency.setTargetAtTime(160 + 900 * k * k, t, 0.6);
    this.bossGain.gain.setTargetAtTime(s.boss ? 0.012 + 0.012 * k : 0, t, 1.5);
    // by day, a little kalimba now and then
    if (n < 0.3 && !s.fighting) {
      this.pluckIn -= dt;
      if (this.pluckIn <= 0) {
        this.pluckIn = 50 + Math.random() * 60;
        this.phrase();
      }
    }
  }

  // drums, scheduled a little ahead on the audio clock
  tick() {
    const s = this.state, ctx = this.ctx;
    const k = this.level.threat;
    if (!s.fighting || this.level.night < 0.4) {
      this.nextBeat = Math.max(this.nextBeat, ctx.currentTime + 0.1);
      return;
    }
    // 58 beats a minute when it's quiet, up to 104 with the Heartwood swarmed
    const bpm = 58 + 46 * k;
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const t = this.nextBeat, b = this.beat++ % 8;
      // the low skin on the one and the five; the rest come in as the fight thickens
      if (b === 0 || b === 4) this.drum(t, 62, 0.35 + 0.35 * k);
      else if ((b === 3 || b === 7) && k > 0.2) this.drum(t, 92, 0.14 + 0.2 * k);
      else if (k > 0.55 && b % 2) this.drum(t, 140, 0.06 + 0.1 * k, true);
      this.nextBeat += 60 / bpm / 2;
    }
  }

  drum(t: number, f: number, vol: number, rim = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (rim ? 0.12 : 0.55));
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.7);
    // the slap of the skin
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rim ? 2400 : 900;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * (rim ? 0.25 : 0.12), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(bp).connect(ng).connect(this.drums);
    ng.connect(this.echo);
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

  pluck(f: number, t: number, vol: number) {
    const ctx = this.ctx;
    for (const [m, v] of [[1, 1], [2.01, 0.25], [5.4, 0.06]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4 / m);
      o.connect(g).connect(this.bus);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 1.6);
    }
  }
}
