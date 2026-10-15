// Trampled lanes: the ground remembers where the Blight walked. Every night the feet of the
// ground Blight are counted on a grid over the Heartwood's flow field; at dawn the busiest
// cells wear into the terrain as lanes of bare, churned earth (the litter, moss and turf worn
// off them), which also keeps the 3D grass, litter and herbs off them. Old lanes fade a little
// each day unless they're walked again.
import { smoothstep } from '../utils/math.js';

const CELL = 2;
const N = 110; // cells across (220 m, a little more than the flow field)

export class Trample {
  constructor(cx, cz) {
    this.x0 = cx - (N * CELL) / 2;
    this.z0 = cz - (N * CELL) / 2;
    this.night = new Float32Array(N * N); // footfalls counted tonight
    this.worn = new Float32Array(N * N); // 0..1, what's worn into the ground
    this.t = 0;
  }

  // count the walkers (every few frames is plenty)
  step(dt, enemies) {
    this.t += dt;
    if (this.t < 0.2) return;
    const k = this.t;
    this.t = 0;
    for (const e of enemies) {
      if (e.dying || e.def.flying || e.dig || e.rise > 0.3) continue;
      const i = Math.floor((e.pos.x - this.x0) / CELL), j = Math.floor((e.pos.z - this.z0) / CELL);
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      // heavier feet wear more
      const w = k * e.def.scale * (e.def.heavy ? 2 : 1);
      this.night[j * N + i] += w;
      // and a little to the sides, so a lane is a couple of metres wide
      this.night[j * N + i - 1] += w * 0.35;
      this.night[j * N + i + 1] += w * 0.35;
      this.night[(j - 1) * N + i] += w * 0.35;
      this.night[(j + 1) * N + i] += w * 0.35;
    }
  }

  // dawn: tonight's traffic wears in, older lanes fade
  settle() {
    for (let a = 0; a < N * N; a++) {
      const now = smoothstep(0.6, 6, this.night[a]);
      this.worn[a] = Math.max(this.worn[a] * 0.7, now);
      this.night[a] = 0;
    }
  }

  // how worn the ground is at (x, z), bilinear
  at(x, z) {
    const fx = (x - this.x0) / CELL - 0.5, fz = (z - this.z0) / CELL - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return 0;
    const u = fx - i, v = fz - j, W = this.worn, a = j * N + i;
    return W[a] * (1 - u) * (1 - v) + W[a + 1] * u * (1 - v) + W[a + N] * (1 - u) * v + W[a + N + 1] * u * v;
  }

  // does it reach into the box?
  overlaps(x0, z0, x1, z1) {
    return x1 > this.x0 && z1 > this.z0 && x0 < this.x0 + N * CELL && z0 < this.z0 + N * CELL;
  }

  state() {
    // the worn grid, quantised to bytes (12 KB)
    return Array.from(this.worn, (v) => Math.round(v * 255));
  }

  restore(arr) {
    if (!arr || arr.length !== N * N) return;
    for (let a = 0; a < N * N; a++) this.worn[a] = arr[a] / 255;
  }
}
