// Ground cover around the player: seedlings, small ferns and dead fronds at about one per
// square metre wherever leaf litter covers the floor, out to 25 m. The chunk scatter's herb
// layer is one plant per ~9 m² (more everywhere would cost too much), so the floor around you
// read as bare litter with tufts dotted on it. Plants are generated per 4 m cell, kept while
// near, and shrink away over the last metres of the ring when the cells are rebuilt.
import * as THREE from 'three';
import { mulberry32 } from '../utils/rng.js';
import { smoothstep } from '../utils/math.js';
import { CHUNK_SIZE as CS } from './WorldGen.js';
import { staleCells, refreshCells } from './CellRefresh.ts';

const CELL = 4;
const RADIUS = 25;
const FADE = 6; // metres over which plants shrink away at the edge
const PER_CELL = 18; // tries per cell at full litter cover
const KINDS = [
  { type: 'seedling', share: 0.5, scale: [0.7, 1.15] },
  { type: 'deadFrond', share: 0.28, scale: [0.55, 0.95] },
  { type: 'fern', share: 0.22, scale: [0.35, 0.6] },
];
const CAP = 1500; // instances per variant
const STRIDE = 11; // floats per plant in a cell's arrays
const TAU = Math.PI * 2;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const _g = {};

export class Cover {
  constructor(scene, world) {
    this.world = world;
    this.cells = new Map();
    this.stale = null; // cells to build again, and those built so far (CellRefresh.ts)
    this.fresh = null;
    this.cx = null; this.cz = null;
    this.slots = []; // one instanced mesh per plant variant
    this.kindSlots = KINDS.map(() => []);
    KINDS.forEach((k, ki) => {
      const def = world.flora.types[k.type];
      def.variants.forEach((v) => {
        const mesh = new THREE.InstancedMesh(v.geometry, def.material, CAP);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
        mesh.count = 0;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        this.kindSlots[ki].push(this.slots.length);
        this.slots.push({ mesh, tint: def.tint });
      });
    });
  }

  get meshes() {
    return this.slots.map((s) => s.mesh);
  }

  // The plants of one cell, per variant: x, y, z, nx, ny, nz, yaw, scale, hue and value jitter,
  // and the ground's baked shade. Null if the ground under it isn't built yet.
  build(i, j) {
    const world = this.world, r = mulberry32(((i * 92837111) ^ (j * 689287499)) >>> 0);
    const out = this.slots.map(() => []);
    const pois = world.poisNear(i * CELL + CELL / 2, j * CELL + CELL / 2, CELL + 30);
    // loose things on the floor stay in sight: nothing grows right on top of one
    const x0 = i * CELL, z0 = j * CELL;
    const plan = world.plans.get(`${Math.floor((x0 + 1) / CS)},${Math.floor((z0 + 1) / CS)}`);
    const loose = plan ? plan.forage.filter((f) => f.x > x0 - 0.6 && f.x < x0 + CELL + 0.6 && f.z > z0 - 0.6 && f.z < z0 + CELL + 0.6) : [];
    for (let k = 0; k < PER_CELL; k++) {
      // every random draw up front, so a skipped plant doesn't shift the ones after it
      const x = (i + r()) * CELL, z = (j + r()) * CELL;
      const roll = r(), kindRoll = r(), varRoll = r(), yaw = r() * TAU, sRoll = r(), hue = r(), val = r();
      const g = world.groundAt(x, z, _g);
      if (!g) return null;
      if (g.h < 0.5 || g.ny < 0.8 || g.rock > 0.3 || g.mud > 0.5) continue;
      // (turf grows its own blades: see Grass.js)
      if (roll > smoothstep(0.35, 0.7, g.litter) * (1 - g.moss * 0.5) * (1 - 0.85 * smoothstep(0.3, 0.7, g.grass))) continue;
      if (world.cleared(x, z, 2)) continue;
      if (loose.some((f) => (x - f.x) ** 2 + (z - f.z) ** 2 < 0.3)) continue;
      if (pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius * 0.9) ** 2)) continue;
      let ki = 0, acc = KINDS[0].share;
      while (ki < KINDS.length - 1 && kindRoll >= acc) acc += KINDS[++ki].share;
      // on the Rot only the dead fronds are left, greyed and dark
      const rot = world.rot?.any ? world.rot.at(x, z) : 0;
      if (rot > 0.45 && KINDS[ki].type !== 'deadFrond') continue;
      const slots = this.kindSlots[ki], K = KINDS[ki];
      const slot = slots[Math.floor(varRoll * slots.length)];
      out[slot].push(x, g.h, z, g.nx, g.ny, g.nz, yaw, K.scale[0] + (K.scale[1] - K.scale[0]) * sRoll, hue * (1 - rot), val, g.shade * (1 - 0.45 * rot));
    }
    return out.map((a) => new Float32Array(a));
  }

  // the ground changed under the cells (trampled lanes, the Rot): build them again, a few a
  // frame while the old ones stay drawn (CellRefresh.ts)
  reset() {
    staleCells(this);
  }

  update(px, pz) {
    if (this.stale && refreshCells(this)) this.cx = null;
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    if (ci === this.cx && cj === this.cz && !this.missing) return;
    this.cx = ci; this.cz = cj;
    this.missing = false;
    const R = Math.ceil(RADIUS / CELL) + 1;
    const counts = this.slots.map(() => 0);
    const keep = new Set();
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (Math.hypot((i + 0.5) * CELL - px, (j + 0.5) * CELL - pz) > RADIUS + CELL * 0.75) continue;
        const key = `${i},${j}`;
        keep.add(key);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = this.build(i, j);
          if (!cell) { this.missing = true; continue; }
          this.cells.set(key, cell);
        }
        cell.forEach((a, s) => {
          const { mesh, tint } = this.slots[s];
          for (let o = 0; o < a.length && counts[s] < CAP; o += STRIDE) {
            const f = 1 - smoothstep(RADIUS - FADE, RADIUS, Math.hypot(a[o] - px, a[o + 2] - pz));
            if (f < 0.03) continue;
            // half-way between upright and the ground's lean
            _q.setFromAxisAngle(_up, a[o + 6]);
            _n.set(a[o + 3], a[o + 4] + 1, a[o + 5]).normalize();
            _q.premultiply(_q2.setFromUnitVectors(_up, _n));
            _m.compose(_p.set(a[o], a[o + 1] - 0.02, a[o + 2]), _q, _s.setScalar(a[o + 7] * f));
            mesh.setMatrixAt(counts[s], _m);
            // the chunk scatter's warm/cool and light/dark shift, darkened by the ground's shade
            const hue = (a[o + 8] - 0.5) * 2 * (tint?.[0] ?? 0), v = a[o + 10] * (1 + (a[o + 9] - 0.5) * 2 * (tint?.[1] ?? 0));
            mesh.setColorAt(counts[s], _c.setRGB(v * (1 + hue * 1.6), v * (1 + hue * 0.4), v * (1 - hue * 1.8)));
            counts[s]++;
          }
        });
      }
    }
    for (const key of this.cells.keys()) if (!keep.has(key)) this.cells.delete(key);
    this.slots.forEach(({ mesh }, s) => {
      mesh.count = counts[s];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    });
  }
}
