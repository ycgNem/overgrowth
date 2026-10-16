// The Rot: from night 5 the ground round each rift starts to die. Every dawn a ring of purple
// creep spreads a few metres further out from every rift still pouring (a sealed one stops),
// with a ragged edge. On it the grass dies, the Blight walk faster and a tower's roots choke (it
// fires slower). Fire burns it back (a firepot's burst, a brazier's heat) and the burnt ground
// won't take again for a couple of days; a Heartseed sapling pushes it out for good round
// itself. It's painted into the terrain the way the trampled lanes are (World.wearChunk).
import { smoothstep } from '../utils/math.js';
import { createNoise2D } from '../utils/noise.js';

const noise = createNoise2D(4217);
const noise2 = (x, z) => noise(x, z) * 0.5 + 0.5;

const CELL = 2;
const N = 110; // cells across, the same grid as the trampled lanes
export const ROT_FROM = 5; // the first dawn it spreads
const GROW = 7; // metres a dawn (by night 10 it is at the tower ring)
const MAX_R = 34; // how far it gets from a rift
const KEEP_OUT = 13; // never this close to the Heartwood

export class Rot {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.x0 = cx - (N * CELL) / 2;
    this.z0 = cz - (N * CELL) / 2;
    this.v = new Float32Array(N * N); // 0..1
    this.burnt = new Uint8Array(N * N); // dawns before it can take again
    this.radius = []; // per rift, how far it has spread
    this.dirty = false;
  }

  // Dawn after night n: spread from each live rift, keep off the Heart and the wards.
  spread(n, rifts, live, wards) {
    for (let a = 0; a < N * N; a++) if (this.burnt[a]) this.burnt[a]--;
    if (n < ROT_FROM) return;
    rifts.forEach((r, k) => {
      if (!live(r)) return;
      this.radius[k] = Math.min(MAX_R, (this.radius[k] || 0) + GROW);
      const R = this.radius[k], ri = Math.ceil((R + 4) / CELL);
      const ci = Math.floor((r.x - this.x0) / CELL), cj = Math.floor((r.z - this.z0) / CELL);
      for (let j = cj - ri; j <= cj + ri; j++) {
        for (let i = ci - ri; i <= ci + ri; i++) {
          if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
          const a = j * N + i;
          if (this.burnt[a]) continue;
          const x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
          const d = Math.hypot(x - r.x, z - r.z);
          // a ragged edge: noise pushes the line in and out by a few metres
          const edge = R + (noise2(x * 0.09, z * 0.09) - 0.5) * 7;
          const t = 1 - smoothstep(edge - 3, edge, d);
          if (t > this.v[a]) this.v[a] = t;
        }
      }
    });
    this.clearAround(this.cx, this.cz, KEEP_OUT, 5);
    for (const w of wards) this.clearAround(w.x, w.z, w.r, 3);
    this.dirty = true;
  }

  // nothing within r of (x, z), fading in over the last `soft` metres
  clearAround(x, z, r, soft) {
    const ri = Math.ceil(r / CELL) + 1;
    const ci = Math.floor((x - this.x0) / CELL), cj = Math.floor((z - this.z0) / CELL);
    let hit = false;
    for (let j = cj - ri; j <= cj + ri; j++) {
      for (let i = ci - ri; i <= ci + ri; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const a = j * N + i;
        if (!this.v[a]) continue;
        const d = Math.hypot(this.x0 + (i + 0.5) * CELL - x, this.z0 + (j + 0.5) * CELL - z);
        const k = smoothstep(r - soft, r, d);
        if (k < 1) {
          this.v[a] *= k;
          hit = true;
        }
      }
    }
    return hit;
  }

  // Fire at (x, z): the Rot within r burns away by `amount` (1 = all of it), and burnt out it
  // can't take again for two dawns. Returns true if there was any to burn.
  burn(x, z, r, amount = 1) {
    const ri = Math.ceil(r / CELL);
    const ci = Math.floor((x - this.x0) / CELL), cj = Math.floor((z - this.z0) / CELL);
    let hit = false;
    for (let j = cj - ri; j <= cj + ri; j++) {
      for (let i = ci - ri; i <= ci + ri; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const a = j * N + i;
        if (this.v[a] <= 0.01) continue;
        if (Math.hypot(this.x0 + (i + 0.5) * CELL - x, this.z0 + (j + 0.5) * CELL - z) > r) continue;
        this.v[a] = Math.max(0, this.v[a] - amount);
        if (this.v[a] < 0.05) {
          this.v[a] = 0;
          this.burnt[a] = 2;
        }
        hit = true;
      }
    }
    if (hit) this.dirty = true;
    return hit;
  }

  // how rotten the ground is at (x, z), bilinear
  at(x, z) {
    const fx = (x - this.x0) / CELL - 0.5, fz = (z - this.z0) / CELL - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return 0;
    const u = fx - i, w = fz - j, V = this.v, a = j * N + i;
    return V[a] * (1 - u) * (1 - w) + V[a + 1] * u * (1 - w) + V[a + N] * (1 - u) * w + V[a + N + 1] * u * w;
  }

  // how much of the clearing it holds (0..1 of the cells within 40 m of the Heart)
  get share() {
    let n = 0, on = 0;
    const ci = Math.floor((this.cx - this.x0) / CELL), cj = Math.floor((this.cz - this.z0) / CELL), R = Math.ceil(40 / CELL);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if ((i - ci) ** 2 + (j - cj) ** 2 > R * R) continue;
      n++;
      on += this.v[j * N + i];
    }
    return n ? on / n : 0;
  }

  get any() {
    return this.radius.some((r) => r > 0);
  }

  overlaps(x0, z0, x1, z1) {
    return x1 > this.x0 && z1 > this.z0 && x0 < this.x0 + N * CELL && z0 < this.z0 + N * CELL;
  }

  state() {
    return { v: Array.from(this.v, (q) => Math.round(q * 255)), b: Array.from(this.burnt), r: this.radius.map((q) => q || 0) };
  }

  restore(d) {
    if (!d?.v || d.v.length !== N * N) return;
    for (let a = 0; a < N * N; a++) {
      this.v[a] = d.v[a] / 255;
      this.burnt[a] = d.b?.[a] || 0;
    }
    this.radius = d.r || [];
    this.dirty = true;
  }
}
