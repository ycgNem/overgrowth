// Enemy path-finding: one flow field around the base, shared by every enemy.
//
// The ground around the Heartwood is a grid of 2 m cells. Each cell has a cost to cross
// (slope, shallow water, the player's buildings) and Dijkstra fills in the cheapest distance
// from every cell to the Heart. An enemy just walks downhill on that distance. Barricades and
// towers are solid but not impassable: crossing one costs as much as a long walk (its pathCost),
// so the Blight go round a wall when the way round is short and chew through it when it isn't.
// Wall the base in completely and they chew through the cheapest wall: that's the mazing game.
//
// The bosses are four metres across and don't fit through gaps the others do, so they walk a
// second field of their own in which every building is fattened by BIG_PAD: a gap a Thornback
// can't squeeze through costs it the same as the wall beside it, and it chews the wall.
import { terrainHeight, terrainNormal, WATER_LEVEL } from '../world/WorldGen.js';

export const CELL = 2;
const N = 100; // cells across (200 m)
const BLOCK = Infinity;
// how much fatter buildings are for a big body (the bosses' radius is 2 to 2.2 m)
export const BIG_PAD = 1.6;
export const BIG_RADIUS = 1.2; // enemies this wide or wider walk the big field

class Heap {
  a: [number, number][] = [];
  push(i: number, d: number) {
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
    const last = a.pop()!;
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

// what the field needs from a building
export interface FieldBuilding { footprint: { x: number; z: number; r: number }[]; pathCost: number; blocks: boolean; dead?: boolean }
interface FieldWorld {
  staticCircles(x0: number, z0: number, x1: number, z1: number): { x: number; z: number; r: number }[];
  extraStatic?: { x: number; z: number; r: number }[];
}
// one layer: what crossing each cell costs, the distance to the Heart, and the building in it
interface Layer { cost: Float32Array; dist: Float64Array; owner: (FieldBuilding | null)[]; solid: Uint8Array }
export interface FlowDir { x: number; z: number; next: number }

const NB: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export class FlowField {
  world: FieldWorld;
  cx: number;
  cz: number;
  goalRadius: number;
  x0: number;
  z0: number;
  base: Float32Array; // terrain + static obstacles
  cost: Float32Array;
  // float64 to match the queue's keys: with float32, rounding made `nd < dist[k]` pass again
  // and again and Dijkstra relaxed cells ~80x over (400 ms per rebuild instead of 7)
  dist: Float64Array;
  owner: (FieldBuilding | null)[]; // the blocking building in a cell (traps and snares don't count)
  solid: Uint8Array; // 1 where a blocking building stands: no cutting the corner past it
  big: Layer; // the bosses' field (built on first use after each change)
  bigDirty = true;
  dirty: boolean;
  private buildings: FieldBuilding[] = [];
  private mark: Int32Array;

  constructor(world: FieldWorld, cx: number, cz: number, goalRadius: number) {
    this.world = world;
    this.cx = cx;
    this.cz = cz;
    this.goalRadius = goalRadius;
    this.x0 = cx - (N * CELL) / 2;
    this.z0 = cz - (N * CELL) / 2;
    this.base = new Float32Array(N * N);
    this.cost = new Float32Array(N * N);
    this.dist = new Float64Array(N * N);
    this.owner = new Array(N * N).fill(null);
    this.solid = new Uint8Array(N * N);
    this.mark = new Int32Array(N * N);
    this.big = { cost: new Float32Array(N * N), dist: new Float64Array(N * N), owner: new Array(N * N).fill(null), solid: new Uint8Array(N * N) };
    this.buildBase();
    this.dirty = true;
  }

  idx(x: number, z: number) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  }

  center(k: number) {
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
      this.stampCircle(o.x, o.z, o.r + 0.35, (k) => { this.base[k] = BLOCK; });
    }
    // the camp's benches and Coffer (Camp.ts)
    for (const o of this.world.extraStatic || []) this.stampCircle(o.x, o.z, o.r + 0.2, (k) => { this.base[k] = BLOCK; });
  }

  // every cell the circle overlaps
  stampCircle(x: number, z: number, r: number, fn: (k: number) => void) {
    const i0 = Math.floor((x - r - this.x0) / CELL), i1 = Math.floor((x + r - this.x0) / CELL);
    const j0 = Math.floor((z - r - this.z0) / CELL), j1 = Math.floor((z + r - this.z0) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const cx = this.x0 + (i + 0.5) * CELL, cz = this.z0 + (j + 0.5) * CELL;
        // cell overlaps the circle?
        const dx = Math.max(Math.abs(cx - x) - CELL / 2, 0), dz = Math.max(Math.abs(cz - z) - CELL / 2, 0);
        if (dx * dx + dz * dz > r * r) continue;
        fn(j * N + i);
      }
    }
  }

  // Lay the buildings over the ground: each adds its pathCost once to every cell it covers
  // (pad: fattened by this much, for the bosses' field)
  private lay(L: Layer, buildings: FieldBuilding[], pad: number) {
    L.cost.set(this.base);
    L.owner.fill(null);
    L.solid.fill(0);
    this.mark.fill(0);
    buildings.forEach((b, n) => {
      if (b.dead || !b.blocks) return;
      for (const c of b.footprint) {
        this.stampCircle(c.x, c.z, c.r + pad, (k) => {
          if (L.cost[k] === BLOCK || this.mark[k] === n + 1) return;
          this.mark[k] = n + 1;
          L.cost[k] += b.pathCost;
          L.solid[k] = 1;
          // two buildings in one cell: it belongs to the one an enemy would have to chew first
          // (the cheaper), so the one it attacks is the one in its way
          if (!L.owner[k] || L.owner[k].pathCost > b.pathCost) L.owner[k] = b;
        });
      }
    });
    this.dijkstra(L);
  }

  // Dijkstra from the goal disc (8-neighbour); no cutting a corner past a blocked cell or a
  // building (two buildings meeting across a cell corner leave no gap to slip through)
  private dijkstra(L: Layer) {
    const { cost, dist, solid } = L;
    dist.fill(Infinity);
    const heap = new Heap();
    this.stampCircle(this.cx, this.cz, this.goalRadius, (k) => {
      dist[k] = 0;
      heap.push(k, 0);
    });
    while (heap.size) {
      const [d, k] = heap.pop();
      if (d > dist[k]) continue;
      const i = k % N, j = (k - i) / N;
      for (const [di, dj, len] of NB) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        const c = cost[nk];
        if (c === BLOCK) continue;
        if (di && dj) {
          const a = j * N + ni, b = nj * N + i;
          if (cost[a] === BLOCK || cost[b] === BLOCK || solid[a] || solid[b]) continue;
        }
        const nd = d + len * (c + cost[k]) * 0.5;
        if (nd < dist[nk]) {
          dist[nk] = nd;
          heap.push(nk, nd);
        }
      }
    }
  }

  // buildings: anything with a footprint, a pathCost and whether it blocks (walls pass a series
  // of circles); traps and snares are underfoot and change nothing
  rebuild(buildings: FieldBuilding[]) {
    this.buildings = buildings.slice();
    const L = { cost: this.cost, dist: this.dist, owner: this.owner, solid: this.solid };
    this.lay(L, this.buildings, 0);
    this.bigDirty = true;
    this.dirty = false;
  }

  private layer(big: boolean): Layer {
    if (!big) return { cost: this.cost, dist: this.dist, owner: this.owner, solid: this.solid };
    if (this.bigDirty) {
      this.bigDirty = false;
      this.lay(this.big, this.buildings, BIG_PAD);
    }
    return this.big;
  }

  distAt(x: number, z: number, big = false) {
    const k = this.idx(x, z);
    return k < 0 ? Infinity : this.layer(big).dist[k];
  }

  // How far along the path to the Heart from (x, z), in metres; where the field has no answer
  // (off the grid, or a cell inside a bench) the straight line
  metresAt(x: number, z: number) {
    const d = this.distAt(x, z);
    return Number.isFinite(d) ? d * CELL + this.goalRadius : Math.hypot(x - this.cx, z - this.cz);
  }

  // Unit direction to walk from (x, z), or null when off the grid.
  // Picks the lowest-distance neighbour and aims at its centre.
  dirAt(x: number, z: number, big = false): FlowDir | null {
    const k = this.idx(x, z);
    if (k < 0) return null;
    const { dist, cost, solid } = this.layer(big);
    const i = k % N, j = (k - i) / N;
    let best = dist[k], bk = -1;
    for (const [di, dj] of NB) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (di && dj) {
        const a = j * N + ni, b = nj * N + i;
        if (cost[a] === BLOCK || cost[b] === BLOCK || solid[a] || solid[b]) continue;
      }
      if (dist[nk] < best) { best = dist[nk]; bk = nk; }
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

  // The blocking building in the cell an enemy is about to step into, if any.
  blockerAt(k: number, big = false) {
    return k >= 0 ? this.layer(big).owner[k] : null;
  }

  reachable(x: number, z: number) {
    return Number.isFinite(this.distAt(x, z));
  }

  get size() {
    return N * CELL;
  }
}
