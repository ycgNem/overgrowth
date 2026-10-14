// Fully synthesised audio: an ambient jungle bed plus one-shot effects.
// Nothing is loaded from disk — every sound is built from oscillators and
// filtered noise with the Web Audio API.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.birdTimer = 2;
    this.day = 1;
    this.water = 0;
  }

  // Must be called from a user gesture.
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // White noise buffer shared by everything.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Wind / rustle bed
    const wind = this.loopNoise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.11;
    wind.connect(lp).connect(this.windGain).connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start();

    // Cicada-style insect drone (day)
    const ins = this.loopNoise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 9;
    const am = ctx.createGain();
    am.gain.value = 0;
    const amOsc = ctx.createOscillator();
    amOsc.frequency.value = 38;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.5;
    amOsc.connect(amDepth).connect(am.gain);
    amOsc.start();
    this.insectGain = ctx.createGain();
    this.insectGain.gain.value = 0;
    ins.connect(bp).connect(am).connect(this.insectGain).connect(this.master);

    // Crickets (night): pulsed sine
    const cr = ctx.createOscillator();
    cr.frequency.value = 4400;
    const crAm = ctx.createGain();
    crAm.gain.value = 0;
    const crLfo = ctx.createOscillator();
    crLfo.type = 'square';
    crLfo.frequency.value = 14;
    const crDepth = ctx.createGain();
    crDepth.gain.value = 0.5;
    crLfo.connect(crDepth).connect(crAm.gain);
    const crGate = ctx.createOscillator();
    crGate.type = 'square';
    crGate.frequency.value = 0.9;
    const gateGain = ctx.createGain();
    gateGain.gain.value = 0.5;
    crGate.connect(gateGain).connect(crAm.gain);
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    cr.connect(crAm).connect(this.cricketGain).connect(this.master);
    cr.start();
    crLfo.start();
    crGate.start();

    // Flowing water near rivers
    const wat = this.loopNoise();
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 900;
    const whp = ctx.createBiquadFilter();
    whp.type = 'highpass';
    whp.frequency.value = 200;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    wat.connect(whp).connect(wlp).connect(this.waterGain).connect(this.master);

    // Rain: a hiss of bandpassed noise plus a low patter
    const rn = this.loopNoise();
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'bandpass';
    rbp.frequency.value = 2600;
    rbp.Q.value = 0.5;
    const rlo = this.loopNoise();
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 380;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rn.connect(rbp).connect(this.rainGain);
    rlo.connect(rlp).connect(this.rainGain);
    this.rainGain.connect(this.master);
  }

  setRain(a) {
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(a * 0.16, this.now, 0.8);
  }

  loopNoise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  get now() {
    return this.ctx.currentTime;
  }

  // ------------------------------------------------------------- helpers

  env(gainNode, t, a, peak, dec) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  noiseShot({ type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.005, dec = 0.15, vol = 0.3, pan = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + dec);
    const g = this.ctx.createGain();
    this.env(g, t, a, vol, dec);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + a + dec + 0.05);
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, a = 0.005, dec = 0.2, vol = 0.2, pan = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + dec);
    const g = this.ctx.createGain();
    this.env(g, t, a, vol, dec);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + a + dec + 0.05);
  }

  // ------------------------------------------------------------- effects

  swing() {
    this.noiseShot({ f0: 500, f1: 2600, q: 1.4, a: 0.06, dec: 0.16, vol: 0.22 });
  }

  chop() {
    // never the same twice: pitch wanders ±15%, a low thump under the slice, a rustle after
    const k = 0.85 + Math.random() * 0.3;
    this.noiseShot({ type: 'highpass', f0: 1800 * k, f1: 900 * k, a: 0.002, dec: 0.12, vol: 0.33 });
    this.noiseShot({ f0: 3000 * k, f1: 1500 * k, q: 2, a: 0.01, dec: 0.25, vol: 0.16, delay: 0.02 });
    this.tone({ type: 'sine', f0: 120 * k, f1: 60 * k, a: 0.003, dec: 0.08, vol: 0.32 });
    this.noiseShot({ f0: 3500, f1: 2200, q: 0.8, a: 0.04, dec: 0.32, vol: 0.07, delay: 0.06 });
  }

  // the blade driven into the forest floor: a dull low thump and a scatter of leaves
  thud() {
    const k = 0.85 + Math.random() * 0.3;
    this.tone({ type: 'sine', f0: 95 * k, f1: 45 * k, a: 0.004, dec: 0.12, vol: 0.38 });
    this.noiseShot({ type: 'lowpass', f0: 700 * k, f1: 250, a: 0.003, dec: 0.1, vol: 0.3 });
    this.noiseShot({ f0: 2600, f1: 1800, q: 0.8, a: 0.02, dec: 0.25, vol: 0.08, delay: 0.03 });
  }

  wood() {
    this.tone({ type: 'triangle', f0: 180, f1: 90, dec: 0.18, vol: 0.4 });
    this.noiseShot({ f0: 900, f1: 400, q: 3, dec: 0.1, vol: 0.3 });
  }

  breakWood() {
    this.wood();
    for (let i = 0; i < 4; i++) this.noiseShot({ f0: 600 + Math.random() * 900, q: 4, dec: 0.08, vol: 0.2, delay: 0.04 + i * 0.05 });
  }

  clank() {
    for (const f of [1250, 1870, 2630, 3410]) this.tone({ f0: f * (0.95 + Math.random() * 0.1), dec: 0.35 + Math.random() * 0.2, vol: 0.07 });
    this.noiseShot({ type: 'highpass', f0: 3000, dec: 0.05, vol: 0.25 });
  }

  stone() {
    this.noiseShot({ f0: 1400, f1: 700, q: 2, dec: 0.08, vol: 0.4 });
    this.tone({ type: 'square', f0: 210, f1: 120, dec: 0.06, vol: 0.06 });
  }

  pottery() {
    for (let i = 0; i < 5; i++) this.tone({ f0: 1500 + Math.random() * 1800, dec: 0.15, vol: 0.06, delay: i * 0.03 });
    this.noiseShot({ f0: 2500, q: 1.5, dec: 0.2, vol: 0.25 });
  }

  footstep(wet, sprint) {
    if (!this.ctx) return;
    if (wet) {
      this.noiseShot({ f0: 900, f1: 300, q: 0.8, a: 0.02, dec: 0.25, vol: 0.18 });
    } else {
      this.noiseShot({ type: 'lowpass', f0: 700 + Math.random() * 300, f1: 200, a: 0.004, dec: 0.09, vol: sprint ? 0.16 : 0.11 });
      this.noiseShot({ f0: 3500, q: 2, dec: 0.05, vol: 0.03 });
    }
  }

  jump() {
    this.noiseShot({ type: 'lowpass', f0: 500, f1: 200, dec: 0.1, vol: 0.08 });
  }

  land() {
    this.noiseShot({ type: 'lowpass', f0: 400, f1: 120, dec: 0.18, vol: 0.25 });
  }

  rummage() {
    for (let i = 0; i < 3; i++) this.noiseShot({ f0: 1500 + Math.random() * 2500, q: 1.5, a: 0.01, dec: 0.08, vol: 0.12, delay: i * 0.09 + Math.random() * 0.04 });
  }

  pickup(rarityOrder = 0) {
    const base = 660 * Math.pow(1.122, rarityOrder * 2);
    const notes = rarityOrder >= 3 ? [1, 1.26, 1.5, 2, 2.52] : rarityOrder >= 2 ? [1, 1.26, 1.5, 2] : [1, 1.5];
    notes.forEach((m, i) => this.tone({ type: 'triangle', f0: base * m, dec: 0.25 + i * 0.05, vol: 0.12, delay: i * 0.06 }));
  }

  ui() {
    this.tone({ type: 'triangle', f0: 520, f1: 600, dec: 0.08, vol: 0.08 });
  }

  // ------------------------------------------------------------- defence

  craft() {
    this.wood();
    [1, 1.26, 1.5].forEach((m, i) => this.tone({ type: 'triangle', f0: 440 * m, dec: 0.18, vol: 0.08, delay: 0.08 + i * 0.05 }));
  }

  place() {
    this.tone({ type: 'triangle', f0: 140, f1: 70, dec: 0.25, vol: 0.45 });
    this.noiseShot({ type: 'lowpass', f0: 600, f1: 150, dec: 0.3, vol: 0.35 });
  }

  bowShot() {
    this.tone({ type: 'triangle', f0: 220, f1: 110, a: 0.002, dec: 0.12, vol: 0.18 });
    this.noiseShot({ f0: 2400, f1: 900, q: 2, a: 0.002, dec: 0.14, vol: 0.14 });
  }

  mortar() {
    this.tone({ type: 'sine', f0: 120, f1: 50, a: 0.005, dec: 0.3, vol: 0.4 });
    this.noiseShot({ type: 'lowpass', f0: 900, f1: 200, a: 0.01, dec: 0.35, vol: 0.25 });
  }

  sporePop() {
    this.noiseShot({ type: 'lowpass', f0: 1400, f1: 200, a: 0.004, dec: 0.4, vol: 0.32 });
    this.tone({ type: 'sine', f0: 300, f1: 90, dec: 0.25, vol: 0.18 });
  }

  zap() {
    for (let i = 0; i < 5; i++) this.noiseShot({ type: 'highpass', f0: 4000 + Math.random() * 3000, a: 0.001, dec: 0.04, vol: 0.18, delay: i * 0.025 });
    this.tone({ type: 'sawtooth', f0: 900, f1: 120, a: 0.002, dec: 0.18, vol: 0.06 });
  }

  stab() {
    this.noiseShot({ f0: 1800, f1: 600, q: 3, a: 0.002, dec: 0.08, vol: 0.25 });
  }

  enemyHit() {
    this.noiseShot({ f0: 700, f1: 300, q: 2, a: 0.002, dec: 0.1, vol: 0.3 });
    this.tone({ type: 'sawtooth', f0: 260 + Math.random() * 80, f1: 180, dec: 0.08, vol: 0.05 });
  }

  enemyDie(big = false) {
    const f = big ? 140 : 320;
    this.tone({ type: 'sawtooth', f0: f * 1.4, f1: f * 0.4, a: 0.01, dec: big ? 0.6 : 0.35, vol: 0.09 });
    this.noiseShot({ type: 'lowpass', f0: 1200, f1: 200, a: 0.01, dec: big ? 0.6 : 0.35, vol: 0.3 });
  }

  bite() {
    this.noiseShot({ f0: 1200, f1: 500, q: 1.5, a: 0.003, dec: 0.07, vol: 0.2 });
  }

  hurt() {
    this.tone({ type: 'square', f0: 180, f1: 90, a: 0.004, dec: 0.18, vol: 0.12 });
    this.noiseShot({ type: 'lowpass', f0: 800, f1: 200, dec: 0.2, vol: 0.25 });
  }

  heartHurt() {
    this.tone({ type: 'sine', f0: 330, f1: 160, a: 0.01, dec: 0.5, vol: 0.12 });
    this.tone({ type: 'sine', f0: 495, f1: 240, a: 0.01, dec: 0.5, vol: 0.06 });
  }

  flame() {
    this.noiseShot({ type: 'lowpass', f0: 900, f1: 300, a: 0.03, dec: 0.4, vol: 0.18 });
    this.noiseShot({ f0: 2400, f1: 1200, q: 0.8, a: 0.02, dec: 0.25, vol: 0.05 });
  }

  snare() {
    for (let i = 0; i < 3; i++) this.noiseShot({ f0: 1500 - i * 300, f1: 400, q: 2, a: 0.004, dec: 0.12, vol: 0.18, delay: i * 0.05 });
    this.tone({ type: 'triangle', f0: 160, f1: 90, dec: 0.2, vol: 0.18 });
  }

  // a deep, grinding bellow for the Thornback
  roar() {
    if (!this.ctx) return;
    for (const [f, v] of [[55, 0.22], [82, 0.12], [110, 0.06]]) this.tone({ type: 'sawtooth', f0: f * 1.3, f1: f * 0.8, a: 0.15, dec: 1.4, vol: v });
    this.noiseShot({ type: 'lowpass', f0: 700, f1: 160, a: 0.1, dec: 1.3, vol: 0.4 });
  }

  slam() {
    this.tone({ type: 'sine', f0: 70, f1: 28, a: 0.005, dec: 0.7, vol: 0.7 });
    this.noiseShot({ type: 'lowpass', f0: 500, f1: 80, a: 0.005, dec: 0.9, vol: 0.6 });
    for (let i = 0; i < 6; i++) this.noiseShot({ f0: 600 + Math.random() * 1200, q: 3, dec: 0.1, vol: 0.12, delay: 0.05 + i * 0.06 });
  }

  // a creature drawing back to bite: a short rising hiss, louder the closer it is
  windup(vol = 1) {
    this.noiseShot({ f0: 900, f1: 2600, q: 2.5, a: 0.12, dec: 0.12, vol: 0.12 * vol });
  }

  spawn() {
    this.noiseShot({ type: 'lowpass', f0: 600, f1: 140, a: 0.08, dec: 0.5, vol: 0.12 });
  }

  wispCry() {
    this.tone({ type: 'sine', f0: 1400, f1: 900, a: 0.05, dec: 0.5, vol: 0.05 });
    this.tone({ type: 'sine', f0: 1460, f1: 940, a: 0.05, dec: 0.5, vol: 0.04, delay: 0.03 });
  }

  slingDraw() {
    this.noiseShot({ f0: 300, f1: 900, q: 4, a: 0.25, dec: 0.1, vol: 0.06 });
  }

  slingRelease(power = 1) {
    this.noiseShot({ f0: 900, f1: 3200, q: 1.5, a: 0.004, dec: 0.12, vol: 0.12 + power * 0.1 });
    this.tone({ type: 'triangle', f0: 240, f1: 120, dec: 0.08, vol: 0.12 });
  }

  stoneHit(crit) {
    this.noiseShot({ f0: 1100, f1: 400, q: 2, a: 0.002, dec: 0.09, vol: 0.32 });
    if (crit) this.tone({ type: 'triangle', f0: 1320, f1: 1500, dec: 0.12, vol: 0.08 });
  }

  firepot() {
    this.noiseShot({ f0: 3200, q: 1.2, dec: 0.12, vol: 0.25 });
    this.noiseShot({ type: 'lowpass', f0: 1200, f1: 150, a: 0.02, dec: 0.8, vol: 0.4, delay: 0.03 });
  }

  upgrade() {
    this.wood();
    [1, 1.26, 1.5, 2].forEach((m, i) => this.tone({ type: 'triangle', f0: 392 * m, dec: 0.3, vol: 0.1, delay: 0.1 + i * 0.07 }));
  }

  repair() {
    for (let i = 0; i < 3; i++) this.tone({ type: 'triangle', f0: 200 - i * 20, f1: 120, dec: 0.1, vol: 0.2, delay: i * 0.09 });
  }

  boon() {
    [1, 1.5, 2, 2.5, 3].forEach((m, i) => this.tone({ type: 'sine', f0: 330 * m, dec: 0.8, vol: 0.07, delay: i * 0.09 }));
  }

  dawn() {
    [1, 1.26, 1.5, 2].forEach((m, i) => this.tone({ type: 'triangle', f0: 523 * m, dec: 0.6, vol: 0.08, delay: i * 0.12 }));
  }

  victory() {
    if (!this.ctx) return;
    const notes = [1, 1.26, 1.5, 2, 1.5, 2, 2.52, 3];
    notes.forEach((m, i) => this.tone({ type: 'triangle', f0: 392 * m, a: 0.02, dec: 0.7, vol: 0.1, delay: i * 0.16 }));
    this.tone({ type: 'sine', f0: 196, a: 0.3, dec: 2.4, vol: 0.12, delay: 0.2 });
  }

  defeat() {
    if (!this.ctx) return;
    [1, 0.94, 0.84, 0.75].forEach((m, i) => this.tone({ type: 'sawtooth', f0: 196 * m, f1: 190 * m, a: 0.1, dec: 0.9, vol: 0.06, delay: i * 0.35 }));
    this.noiseShot({ type: 'lowpass', f0: 600, f1: 60, a: 0.5, dec: 2.5, vol: 0.3 });
  }

  thunder() {
    if (!this.ctx) return;
    this.noiseShot({ type: 'lowpass', f0: 300, f1: 40, a: 0.02, dec: 2.6, vol: 0.55 });
    for (let i = 0; i < 4; i++) this.noiseShot({ type: 'lowpass', f0: 180, f1: 50, a: 0.05, dec: 0.6, vol: 0.3, delay: 0.15 + i * 0.25 + Math.random() * 0.2 });
  }

  heartAlarm() {
    [0, 0.18].forEach((d) => this.tone({ type: 'square', f0: 330, f1: 300, a: 0.005, dec: 0.12, vol: 0.05, delay: d }));
  }

  // the dusk horn: a long, low, slightly sour call
  horn() {
    if (!this.ctx) return;
    for (const [f, v] of [[98, 0.16], [147, 0.08], [196, 0.05], [104, 0.06]]) {
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.97, a: 0.5, dec: 2.6, vol: v });
    }
  }

  bird(pan) {
    const kind = Math.floor(Math.random() * 4);
    const v = 0.05 + Math.random() * 0.05;
    if (kind === 0) {
      // rising whistle x2
      for (let i = 0; i < 2; i++) this.tone({ f0: 1800, f1: 3200, a: 0.02, dec: 0.18, vol: v, pan, delay: i * 0.28 });
    } else if (kind === 1) {
      // trill
      for (let i = 0; i < 8; i++) this.tone({ f0: 3800 + (i % 2) * 400, f1: 3600, dec: 0.04, vol: v * 0.8, pan, delay: i * 0.055 });
    } else if (kind === 2) {
      // toucan-ish croak
      for (let i = 0; i < 3; i++) this.tone({ type: 'sawtooth', f0: 520, f1: 380, a: 0.01, dec: 0.12, vol: v * 0.35, pan, delay: i * 0.22 });
    } else {
      // descending call
      this.tone({ f0: 2600, f1: 1200, a: 0.02, dec: 0.5, vol: v, pan });
      this.tone({ f0: 2400, f1: 1100, a: 0.02, dec: 0.4, vol: v * 0.6, pan, delay: 0.6 });
    }
  }

  // Ambient mix follows time of day and surroundings.
  update(dt, { day, night, nearWater, underCanopy }) {
    if (!this.ctx) return;
    const t = this.now;
    this.insectGain.gain.setTargetAtTime(0.045 * day * (0.6 + underCanopy * 0.6), t, 0.5);
    this.cricketGain.gain.setTargetAtTime(0.012 * night, t, 0.5);
    this.waterGain.gain.setTargetAtTime(0.12 * nearWater, t, 0.4);
    this.windGain.gain.setTargetAtTime(0.08 + (1 - underCanopy) * 0.06, t, 1);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = (night > 0.5 ? 9 : 2.5) + Math.random() * 6;
      if (day > 0.2 || Math.random() < 0.2) this.bird(Math.random() * 1.6 - 0.8);
    }
  }
}
