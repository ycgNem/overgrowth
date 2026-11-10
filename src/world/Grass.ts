// Grass blades around the player wherever the ground is turf (World.groundAt().grass): tufts
// of single blades out to 20 m, built per 4 m cell and kept while near, like the ground cover.
// The turf texture alone read as a green carpet painted on the hill; up close the blades give
// it depth, catch the light and move. They sway in the wind, lean away as you walk through and
// whip along with the machete (addWind's push), and shrink away over the last metres of the ring.
//
// A blade is a centimetre wide: past a dozen metres it is thinner than a pixel, and most of the
// ring is past a dozen metres. Tufts out there are drawn with a second, far lighter shape of
// the same tuft (under half the blades, each twice as wide, fewer rows), which covers the same
// ground for about a fifth of the triangles.
import * as THREE from 'three';
import { mulberry32 } from '../utils/rng.js';
import { smoothstep } from '../utils/math.js';
import { addWind, addFoliageLighting, addNightFill } from '../art/shaders.js';
import { CHUNK_SIZE as CS, groundPatch } from './WorldGen.js';
import { staleCells, refreshCells } from './CellRefresh.ts';

const CELL = 4;
const RADIUS = 28;
const FADE = 10; // over the last metres the tufts thin out (shrinking them drew a visible band)
const PER_CELL = 120; // tries per cell where the ground is all turf: ~7 tufts a square metre
// three ordinary tufts, a tall seed-headed one, a short lawn one
const SHAPES = [{}, {}, {}, { blades: 9, h0: 0.5, h1: 0.85, dry: 0.3 }, { blades: 18, h0: 0.06, h1: 0.16, dry: 0.05, rows: 3 }];
const TALL = 3, LAWN = 4;
const CAP = 5200; // instances per variant
const NEAR = 12; // tufts further off than this are drawn with their lighter shape
const STRIDE = 10; // floats per tuft in a cell's arrays
const TAU = Math.PI * 2;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const _g: any = {};

// One tuft: a dozen or so tapered blades fanning out of a small base, each bending over along
// its length. Colours run from a dark, shaded base to a lit green tip; a few blades are dry
// straw. Normals lean mostly up, as a lawn is lit, so the tuft doesn't flicker as it turns.
interface Shape { blades?: number; h0?: number; h1?: number; dry?: number; rows?: number; wide?: number }

function tuftGeometry(seed: number, { blades = 13, h0 = 0.16, h1 = 0.42, dry = 0.12, rows = 4, wide = 1 }: Shape = {}) {
  const r = mulberry32(seed);
  const pos = [], nrm = [], col = [], idx = [];
  const ROWS = rows;
  for (let b = 0; b < blades; b++) {
    const a = r() * TAU, rr = Math.sqrt(r()) * 0.09;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const h = h0 + (h1 - h0) * r() ** 0.8;
    // lean outward from the tuft's middle, plus a little random
    const la = a + (r() - 0.5) * 1.2, lean = 0.12 + r() * 0.3;
    const lx = Math.cos(la), lz = Math.sin(la);
    // the blade's flat faces sideways to its lean
    const fx = -lz, fz = lx;
    const w = (0.008 + r() * 0.007) * wide;
    const isDry = r() < dry;
    const tone = 0.75 + r() * 0.5;
    // (tips about twice the turf's albedo: at four times, the blades read as pale plugs on it)
    const tip = isDry ? [0.3 * tone, 0.26 * tone, 0.12 * tone] : [0.11 * tone, 0.18 * tone, 0.045 * tone];
    const base = isDry ? [0.12, 0.1, 0.04] : [0.03, 0.055, 0.015];
    const v0 = pos.length / 3;
    for (let k = 0; k < ROWS; k++) {
      const t = k / (ROWS - 1);
      const off = lean * h * t * t;
      const x = bx + lx * off, z = bz + lz * off, y = h * t * (1 - 0.25 * lean * t);
      const hw = w * (1 - t * 0.92);
      pos.push(x - fx * hw, y, z - fz * hw, x + fx * hw, y, z + fz * hw);
      // up, tipped a little toward the lean
      _n.set(lx * 0.35, 1, lz * 0.35).normalize();
      nrm.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z);
      const c = [0, 1, 2].map((i) => base[i] + (tip[i] - base[i]) * Math.min(1, t * 1.25));
      col.push(...c, ...c);
    }
    for (let k = 0; k < ROWS - 1; k++) {
      const a0 = v0 + k * 2;
      idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// the same tuft for the distance: its first blades again (the same seed), wider and with fewer rows
const farShape = ({ blades = 13, rows = 4, ...rest }: Shape): Shape => ({
  ...rest, blades: Math.max(4, Math.round(blades * 0.42)), rows: Math.max(2, rows - 1), wide: 2.2,
});

type Cell = Float32Array[];

export class Grass {
  world: any;
  cells = new Map<string, Cell>();
  stale: Set<string> | null = null; // cells to build again, and those built so far (CellRefresh.ts)
  fresh: Map<string, Cell> | null = null;
  cx: number | null = null;
  cz: number | null = null;
  missing = false;
  blockers: { x: number; z: number; r: number }[] = []; // footprints of buildings
  material: THREE.MeshStandardMaterial;
  /** per shape: the mesh for tufts near the player and the one for those further off */
  slots: { near: THREE.InstancedMesh; far: THREE.InstancedMesh }[] = [];

  constructor(scene: THREE.Scene, world: any) {
    this.world = world;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    addWind(mat, { sway: 0.22, push: true });
    addFoliageLighting(mat, 0.03, 0.5);
    // (more than this and the lawn glowed mint at night, lit from inside)
    addNightFill(mat, 0.05);
    this.material = mat;
    const make = (geo: THREE.BufferGeometry) => {
      const mesh = new THREE.InstancedMesh(geo, mat, CAP);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = 'grass blades';
      scene.add(mesh);
      return mesh;
    };
    for (let v = 0; v < SHAPES.length; v++) {
      this.slots.push({ near: make(tuftGeometry(4100 + v, SHAPES[v])), far: make(tuftGeometry(4100 + v, farShape(SHAPES[v]))) });
    }
  }

  get meshes() {
    return this.slots.flatMap((s) => [s.near, s.far]);
  }

  // Buildings went up or came down: blades must clear their footprints.
  setBlockers(list: { x: number; z: number; r: number }[]) {
    this.blockers = list;
    this.cx = null;
  }

  // The tufts of one cell, per variant: x, y, z, nx, ny, nz, yaw, scale, the ground's shade.
  // Null if the ground under it isn't built yet.
  build(i: number, j: number): Cell | null {
    const world = this.world, r = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0);
    const out: number[][] = this.slots.map(() => []);
    const pois = world.poisNear(i * CELL + CELL / 2, j * CELL + CELL / 2, CELL + 30);
    // loose things on the floor stay in sight: no tuft right on top of one
    const x0 = i * CELL, z0 = j * CELL;
    const plan = world.plans.get(`${Math.floor((x0 + 1) / CS)},${Math.floor((z0 + 1) / CS)}`);
    const loose = plan ? plan.forage.filter((f) => f.x > x0 - 0.5 && f.x < x0 + CELL + 0.5 && f.z > z0 - 0.5 && f.z < z0 + CELL + 0.5) : [];
    for (let k = 0; k < PER_CELL; k++) {
      const x = (i + r()) * CELL, z = (j + r()) * CELL;
      const roll = r(), vRoll = r(), yaw = r() * TAU, sRoll = r();
      const g = world.groundAt(x, z, _g);
      if (!g) return null;
      if (g.h < 0.35 || g.ny < 0.78) continue;
      // full where the turf is thick, thinning to scattered tufts at its edge; under the trees
      // a thin sprinkle of sedge breaks up the leaf litter
      // the turf grows in clumps and drifts, not one even density; a size field makes swathes
      // of short lawn and of long grass
      const clumps = 0.25 + smoothstep(-0.35, 0.35, groundPatch(x * 0.35, z * 0.35));
      const size = smoothstep(-0.4, 0.4, groundPatch(x * 0.9 + 77, z * 0.9 - 41));
      const turf = smoothstep(0.1, 0.7, g.grass) * clumps;
      // and stragglers creep a few metres out into the litter, so a meadow has no edge line
      const sedge = 0.09 * g.litter * (1 - g.moss) * (1 - turf) + 0.35 * smoothstep(0.05, 0.25, g.grass) * (1 - turf);
      if (roll > turf + sedge || g.rock > 0.4 || g.mud > 0.6) continue;
      if (pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius * 0.85) ** 2)) continue;
      if (loose.some((f) => (x - f.x) ** 2 + (z - f.z) ** 2 < 0.2)) continue;
      // the tall seed-head variant is the odd one out
      const v = turf > 0.3 && size < 0.35 && vRoll < 0.65 ? LAWN
        : vRoll < (turf > 0.5 ? 0.08 + size * 0.1 : 0.45) ? TALL : Math.floor(vRoll * 3.33) % 3;
      // shorter where the turf thins, longer in the long-grass drifts
      const s = (0.75 + sRoll * 0.4) * (0.6 + 0.9 * size) * (0.6 + 0.4 * smoothstep(0.3, 0.8, g.grass));
      // dry, golden drifts and damp, deep green ones
      const dry = smoothstep(-0.3, 0.3, groundPatch(x * 0.12 + 5, z * 0.12 - 9));
      out[v].push(x, g.h, z, g.nx, g.ny, g.nz, yaw, s, g.shade, dry);
    }
    return out.map((a) => new Float32Array(a));
  }

  // the ground changed under the cells (trampled lanes, the Rot): build them again, a few a
  // frame while the old ones stay drawn (CellRefresh.ts)
  reset() {
    staleCells(this);
  }

  update(px: number, pz: number) {
    if (this.stale && refreshCells(this)) this.cx = null;
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    if (ci === this.cx && cj === this.cz && !this.missing) return;
    this.cx = ci; this.cz = cj;
    this.missing = false;
    const R = Math.ceil(RADIUS / CELL) + 1;
    // tufts drawn so far, per shape: [near, far]
    const counts = this.slots.map(() => [0, 0]);
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
        // the buildings that reach into this cell
        const x0 = i * CELL, z0 = j * CELL;
        const block = this.blockers.filter((b) => b.x + b.r > x0 - 0.3 && b.x - b.r < x0 + CELL + 0.3 && b.z + b.r > z0 - 0.3 && b.z - b.r < z0 + CELL + 0.3);
        cell.forEach((a, s) => {
          const n = counts[s];
          for (let o = 0; o < a.length; o += STRIDE) {
            const dist = Math.hypot(a[o] - px, a[o + 2] - pz);
            const k = dist < NEAR ? 0 : 1;
            if (n[k] >= CAP) continue;
            const mesh = k ? this.slots[s].far : this.slots[s].near;
            // thin out toward the edge of the ring (each tuft has its own cut-off)
            const f = 1 - smoothstep(RADIUS - FADE, RADIUS, dist);
            if (f < Math.abs(Math.sin(a[o] * 12.9898 + a[o + 2] * 78.233) * 43758.5453) % 1) continue;
            if (block.length && block.some((b) => (a[o] - b.x) ** 2 + (a[o + 2] - b.z) ** 2 < (b.r + 0.25) ** 2)) continue;
            // mostly upright, a little with the ground's lean
            _q.setFromAxisAngle(_up, a[o + 6]);
            _n.set(a[o + 3], a[o + 4] + 2, a[o + 5]).normalize();
            _q.premultiply(_q2.setFromUnitVectors(_up, _n));
            _m.compose(_p.set(a[o], a[o + 1] - 0.015, a[o + 2]), _q, _s.setScalar(a[o + 7]));
            mesh.setMatrixAt(n[k], _m);
            const v = a[o + 8], d = a[o + 9];
            mesh.setColorAt(n[k], _c.setRGB(v * (0.92 + d * 0.35), v * (0.97 + d * 0.08), v * (1.05 - d * 0.35)));
            n[k]++;
          }
        });
      }
    }
    for (const key of this.cells.keys()) if (!keep.has(key)) this.cells.delete(key);
    this.slots.forEach((slot, s) => {
      [slot.near, slot.far].forEach((mesh, k) => {
        mesh.count = counts[s][k];
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      });
    });
  }
}
