// Enemy path-finding: one flow field around the base, shared by every enemy.
//
// The ground around the Heartwood is a grid of 2 m cells. Each cell has a cost to cross
// (slope, shallow water, trunks and boulders, the player's buildings) and Dijkstra fills
// in the cheapest distance from every cell to the Heart. An enemy just walks downhill on
// that distance. Barricades and towers are expensive rather than impassable, so if you
// wall the base in completely the Blight chews through the cheapest wall instead of
// standing around: that's the mazing game.
import { terrainHeight, terrainNormal, WATER_LEVEL } from '../world/WorldGen.js';

export const CELL = 2;
const N = 100; // cells across (200 m)
const BLOCK = Infinity;

class Heap {
  constructor() { this.a = []; }
  push(i, d) {
    const a = this.a;
    a.push([d, i]);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (a[p][0] <= a[k][0]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

export class FlowField {
  constructor(world, cx, cz, goalRadius) {
    this.world = world;
    this.cx = cx;
    this.cz = cz;
    this.goalRadius = goalRadius;
    this.x0 = cx - (N * CELL) / 2;
    this.z0 = cz - (N * CELL) / 2;
    this.base = new Float32Array(N * N); // terrain + static obstacles
    this.cost = new Float32Array(N * N);
    this.dist = new Float32Array(N * N);
    this.owner = new Array(N * N).fill(null); // building occupying a cell
    this.buildBase();
    this.dirty = true;
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  }

  center(k) {
    return { x: this.x0 + ((k % N) + 0.5) * CELL, z: this.z0 + (Math.floor(k / N) + 0.5) * CELL };
  }

  buildBase() {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
        const h = terrainHeight(x, z);
        const ny = terrainNormal(x, z).y;
        let c = 1;
        if (h < WATER_LEVEL - 1.1) c = BLOCK; // too deep to wade
        else if (h < WATER_LEVEL) c += 6; // wading is slow; prefer bridges of land
        if (ny < 0.6) c = BLOCK;
        else if (ny < 0.85) c += (0.85 - ny) * 40;
        this.base[j * N + i] = c;
      }
    }
    const half = (N * CELL) / 2;
    for (const o of this.world.staticCircles(this.cx - half, this.cz - half, this.cx + half, this.cz + half)) {
      if ((o.x - this.cx) ** 2 + (o.z - this.cz) ** 2 < (this.goalRadius + 2) ** 2) continue;
      this.stampCircle(this.base, o.x, o.z, o.r + 0.35, BLOCK);
    }
  }

  stampCircle(arr, x, z, r, value, fn) {
    const i0 = Math.floor((x - r - this.x0) / CELL), i1 = Math.floor((x + r - this.x0) / CELL);
    const j0 = Math.floor((z - r - this.z0) / CELL), j1 = Math.floor((z + r - this.z0) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const cx = this.x0 + (i + 0.5) * CELL, cz = this.z0 + (j + 0.5) * CELL;
        // cell overlaps the circle?
        const dx = Math.max(Math.abs(cx - x) - CELL / 2, 0), dz = Math.max(Math.abs(cz - z) - CELL / 2, 0);
        if (dx * dx + dz * dz > r * r) continue;
        if (fn) fn(j * N + i);
        else arr[j * N + i] = value;
      }
    }
  }

  // buildings: [{ x, z, r, pathCost, ... }] (barricades pass a series of circles)
  rebuild(buildings) {
    this.cost.set(this.base);
    this.owner.fill(null);
    for (const b of buildings) {
      for (const c of b.footprint) {
        this.stampCircle(null, c.x, c.z, c.r, 0, (k) => {
          if (this.cost[k] === BLOCK) return;
          this.cost[k] += b.pathCost;
          this.owner[k] = b;
        });
      }
    }
    // Dijkstra from the goal disc (8-neighbour)
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new Heap();
    this.stampCircle(null, this.cx, this.cz, this.goalRadius, 0, (k) => {
      dist[k] = 0;
      heap.push(k, 0);
    });
    const D = Math.SQRT2;
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, D], [1, -1, D], [-1, 1, D], [-1, -1, D]];
    while (heap.size) {
      const [d, k] = heap.pop();
      if (d > dist[k]) continue;
      const i = k % N, j = (k - i) / N;
      for (const [di, dj, len] of nb) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        const c = this.cost[nk];
        if (c === BLOCK) continue;
        // no cutting corners past a blocked cell
        if (di && dj && (this.cost[j * N + ni] === BLOCK || this.cost[nj * N + i] === BLOCK)) continue;
        const nd = d + len * (c + this.cost[k]) * 0.5;
        if (nd < dist[nk]) {
          dist[nk] = nd;
          heap.push(nk, nd);
        }
      }
    }
    this.dirty = false;
  }

  distAt(x, z) {
    const k = this.idx(x, z);
    return k < 0 ? Infinity : this.dist[k];
  }

  // Unit direction to walk from (x, z), or null when off the grid / unreachable.
  // Picks the lowest-distance neighbour and aims at its centre.
  dirAt(x, z) {
    const k = this.idx(x, z);
    if (k < 0) return null;
    const i = k % N, j = (k - i) / N;
    let best = this.dist[k], bk = -1;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (di && dj && (this.cost[j * N + ni] === BLOCK || this.cost[nj * N + i] === BLOCK)) continue;
        if (this.dist[nk] < best) { best = this.dist[nk]; bk = nk; }
      }
    }
    if (bk < 0) {
      // at a local minimum (or on the goal): head straight for the Heart
      const dx = this.cx - x, dz = this.cz - z, l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l, next: k };
    }
    const c = this.center(bk);
    const dx = c.x - x, dz = c.z - z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, next: bk };
  }

  // The building occupying the cell an enemy is about to step into, if any.
  blockerAt(k) {
    return k >= 0 ? this.owner[k] : null;
  }

  reachable(x, z) {
    return Number.isFinite(this.distAt(x, z));
  }

  get size() {
    return N * CELL;
  }
}
