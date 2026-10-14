// The title theme: a slow pad walking i–VI–III–VII in A minor, a kalimba line picking over it
// in the pentatonic, and a low drone, all through a long generated reverb and a tape-ish
// echo. Synthesised like everything else; it fades in on the title and out when you enter.
const A = 110;
const semi = (n) => A * 2 ** (n / 12);
// chords as semitones above A2: Am(add9), Fmaj7, C(add9), G(sus2)
const CHORDS = [
  [0, 7, 12, 14, 15],
  [-4, 3, 7, 12, 16],
  [3, 10, 14, 15, 19],
  [-2, 5, 9, 12, 14],
];
const BAR = 9.6; // seconds a chord
// the kalimba picks from A minor pentatonic, two octaves up
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

export class TitleTheme {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    this.bus.connect(tone).connect(out);
    // reverb: a decaying burst of stereo noise
    const len = Math.floor(ctx.sampleRate * 4.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.verb.connect(wet).connect(this.bus);
    // echo, darkening on each repeat
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = 0.48;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1700;
    this.echo.connect(dark).connect(fb).connect(this.echo);
    dark.connect(this.bus);
    dark.connect(this.verb);
    this.running = false;
    this.timer = null;
  }

  start() {
    if (this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.running = true;
    this.next = t + 0.3; // when the next chord starts
    this.bar = 0;
    this.pluckAt = t + 2.4;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(1, t + 4);
    // the drone under everything
    this.drone = [];
    for (const [f, v] of [[A / 2, 0.05], [A / 2 * 1.5, 0.018]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(this.bus);
      g.connect(this.verb);
      o.start(t);
      this.drone.push(o);
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop(fade = 2.5) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + fade);
    for (const o of this.drone) o.stop(t + fade + 0.1);
  }

  // schedule a little ahead of the clock
  tick() {
    const t = this.ctx.currentTime;
    while (this.next < t + 1) {
      this.chord(CHORDS[this.bar % CHORDS.length], this.next);
      this.next += BAR;
      this.bar++;
    }
    while (this.pluckAt < t + 1) {
      // phrases of a few notes, then a breath
      const n = 3 + Math.floor(Math.random() * 4);
      let at = this.pluckAt, idx = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        idx = Math.max(0, Math.min(PENTA.length - 1, idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
        this.pluck(semi(PENTA[idx] + 24), at, 0.05 + Math.random() * 0.03);
        at += [0.4, 0.4, 0.8, 0.6][Math.floor(Math.random() * 4)];
      }
      this.pluckAt = at + 2.5 + Math.random() * 4;
    }
  }

  chord(notes, t) {
    const ctx = this.ctx;
    const end = t + BAR + 3.5;
    for (const n of notes) {
      const f = semi(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.022, t + 3.2);
      g.gain.setValueAtTime(0.022, t + BAR - 0.5);
      g.gain.linearRampToValueAtTime(0.0001, end);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(1100, t + BAR * 0.5);
      lp.frequency.linearRampToValueAtTime(600, end);
      lp.Q.value = 0.7;
      lp.connect(g);
      g.connect(this.bus);
      g.connect(this.verb);
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(end + 0.1);
      }
    }
  }

  // a soft struck tine: the fundamental and its odd, inharmonic overtone
  pluck(f, t, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 0.8 - 0.4;
    g.connect(pan);
    pan.connect(this.bus);
    pan.connect(this.echo);
    pan.connect(this.verb);
    for (const [m, v] of [[1, 1], [2.76, 0.18], [5.4, 0.05]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const og = ctx.createGain();
      og.gain.setValueAtTime(v, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + (m === 1 ? 2.2 : 0.4));
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.3);
    }
  }
}
