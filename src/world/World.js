// Streams the infinite world in 64m chunks around the player. Each chunk
// owns a terrain mesh, blocks of instanced plants (in the shared pools, Pools.js), an
// optional point of interest, and the colliders / cuttables / interactables that live
// inside it.
import * as THREE from 'three';
import {
  CHUNK_SIZE as CS, sampleTerrain, terrainHeight, terrainNormal, jungleDensity, groundPatch, grove, WATER_LEVEL,
} from './WorldGen.js';
import { chunkRng, range, hash2 } from '../utils/rng.js';
import { createNoise2D } from '../utils/noise.js';
import { smoothstep, clamp } from '../utils/math.js';
import { poiSpec, poisAround, buildPOISteps } from './poi/POI.js';
import { makeTerrainMaterial } from '../art/shaders.js';
import { mergeToGeometry, bakedMaterial } from '../art/merge.js';
import { getItemModel } from '../items/ItemModels.ts';
import { ITEMS } from '../items/ItemDB.ts';
import { Stubs } from './Stubs.js';
import { lodGeometry } from './flora/lod.js';
import { Pool, Pools, shareGeometry as withSlope } from './Pools.js';

const TAU = Math.PI * 2;
const SEG = 48;
export const VIEW_RADIUS = 2;
export const STEP_HEIGHT = 0.55;

// Small floor props and the low herb layer only live in the 3x3 chunks around the player;
// the outer ring is deep in haze, where only trees, palms, tall herbs and rocks read.
// Distance: trees and big leafy plants swap to a thinned copy past LOD_DIST; small plants and
// forage stop drawing past their FAR (both per plant, see Pools.js)
const LOD_DIST = 38;
// the plants whose shadows still read past LOD_DIST: big crowns
const TREE_TYPES = new Set(['bigTree', 'smallTree', 'midTree', 'palm', 'mangrove']);
const LOD_TYPES = new Set(['bigTree', 'smallTree', 'midTree', 'palm', 'mangrove', 'treeFern', 'banana', 'monstera', 'taro']);
const FAR = {
  fern: 80, bush: 85, grass: 60, flower: 65, orchid: 50, mushrooms: 45, pebbles: 40, deadFrond: 45, seedling: 50,
  bromeliad: 60, reeds: 90, lily: 75, branch: 60, stump: 75,
};
const FORAGE_FAR = 60;
const DRESSING = new Set([
  'seedling', 'pebbles', 'branch', 'deadFrond', 'mushrooms', 'orchid', 'bromeliad',
  'grass', 'fern', 'bush', 'taro', 'flower', 'lily',
]);

// Soft contact shade each prop leaves on the ground: [radius, strength].
// floor dressing small enough that one variant per chunk is plenty
const SMALL_FRY = new Set(['pebbles', 'branch', 'deadFrond', 'mushrooms', 'seedling', 'stump', 'orchid', 'bromeliad']);

const SHADE = {
  bush: [1.4, 0.45], fern: [1.1, 0.35], banana: [1.3, 0.4], taro: [1.2, 0.4], smallTree: [1.8, 0.4], midTree: [1.9, 0.4],
  palm: [1.0, 0.3], grass: [0.6, 0.3], rock: [1.6, 0.55], stump: [1.0, 0.4], log: [1.8, 0.3], treeFern: [1.6, 0.4], monstera: [1.3, 0.45],
};

// Species grow in patches, not evenly sprinkled: each reads its own slow noise field.
const CLUMP = [11, 12, 13, 14, 15, 16].map((s) => createNoise2D(4217 + 500 + s));
const clump = (k, x, z, f = 0.045) => CLUMP[k](x * f, z * f) * 0.5 + 0.5;

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
// run a build generator to the end in one go
const finish = (it) => { let r; while (!(r = it.next()).done); return r.value; };
// plain (non-instanced) shadow casters render with this, never with three's shared depth
// material, which then only sees instanced draws (see the note in instance())
const TERRAIN_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
// cut plants: how many of each kind can be falling or lying at once, and for how long
const FALL_MAX = 10, FALL_LIFE = 4.5;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Forage: loose materials lying on the forest floor, picked up with E. They come back
// every dawn. Geometry is the item model, merged into one instanced draw per item.
const forageGeo = new Map();
// a little dirt on everything lying in the leaves (the item models are clean, made for the
// satchel); Game.highlightForage lights the one you're looking at and puts this back
export const FORAGE_TINT = new THREE.Color(0.8, 0.76, 0.7);
export const CACHE_EMPTY = new THREE.Color(0.35, 0.33, 0.3);
let forageMat = null;
function forageGeometry(id) {
  if (!forageGeo.has(id)) {
    const holder = new THREE.Group();
    holder.add(getItemModel(id));
    const { geometry } = mergeToGeometry(holder);
    geometry.computeBoundingBox();
    geometry.translate(0, -geometry.boundingBox.min.y - 0.01, 0);
    forageGeo.set(id, geometry);
  }
  return forageGeo.get(id);
}

// Plant geometries are shared library assets; only free per-chunk data
// (terrain, POI meshes, and each instanced mesh's own slope buffer).
function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isInstancedMesh) {
      const g = o.geometry;
      for (const name of Object.keys(g.attributes)) if (name !== 'aSlope') g.deleteAttribute(name);
      g.setIndex(null);
      g.dispose();
      o.dispose();
    } else if (o.isMesh && !o.userData.shared) o.geometry.dispose();
  });
}

export class World {
  constructor(scene, flora) {
    this.scene = scene;
    this.flora = flora;
    this.chunks = new Map();
    this.plans = new Map();
    this.bigPlans = new Map();
    this.fallers = new Map(); // cut plants toppling over
    this.stubs = new Stubs(scene); // and the stalks they leave standing
    this.cut = new Set();
    this.looted = new Set();
    this.terrainMat = makeTerrainMaterial(flora.lib);
    this.queue = [];
    this.cx = NaN;
    this.cz = NaN;
    this.time = 0;
    // One warm light that moves to the nearest campfire. It always exists, so
    // a camp streaming in never changes the light count and recompiles shaders.
    this.fireLight = new THREE.PointLight(0xff8a40, 0, 9, 2);
    scene.add(this.fireLight);
    this.px = 0;
    this.pz = 0;
    // Areas kept free of vegetation (the base), and things placed by the player that
    // live outside the chunk system (buildings, the Heartwood).
    this.clearings = [];
    this.extra = { colliders: [], interactables: [], cuttables: [] };
    this._nearG = []; // scratch for near() in groundHeight and collide
    this._nearC = [];
    this.foraged = new Set();
    // one instanced mesh per plant variant and forage item for the whole window
    this.pools = new Pools(scene);
    this.trample = null; // the Blight's worn lanes (Trample.js), set by the game
    this.rot = null; // the Rot round the rifts (Rot.js), set by the game
  }

  // Wear the trampled lanes into a chunk's terrain: churned earth where the Blight walk, the
  // litter, moss and turf worn off (from the splat the chunk was built with). The Rot goes on
  // top: the grass dies back and the ground darkens to a bruised violet.
  wearChunk(ch) {
    const T = this.trample, R = this.rot;
    if (!T || !ch.baseSplat || !ch.terrainMesh) return;
    const N = SEG + 1, step = CS / SEG, x0 = ch.cx * CS, z0 = ch.cz * CS;
    if (!T.overlaps(x0, z0, x0 + CS, z0 + CS)) return;
    const rotted = R?.any;
    const S = ch.splat, G = ch.grass, C = ch.shade, bS = ch.baseSplat, bG = ch.baseGrass, bC = ch.baseCol;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const v = j * N + i, t = T.at(x, z), r = rotted ? R.at(x, z) : 0;
        const w = Math.max(t, r * 0.8);
        S[v * 4] = bS[v * 4] * (1 - 0.75 * w);
        S[v * 4 + 1] = bS[v * 4 + 1] * (1 - 0.85 * w);
        S[v * 4 + 3] = Math.max(bS[v * 4 + 3], w * 0.9);
        G[v] = bG[v] * (1 - Math.max(t, r));
        const d = 1 - 0.14 * t;
        C[v * 3] = bC[v * 3] * d * (1 - 0.3 * r); C[v * 3 + 1] = bC[v * 3 + 1] * d * (1 - 0.62 * r); C[v * 3 + 2] = bC[v * 3 + 2] * d * (1 - 0.12 * r);
      }
    }
    const a = ch.terrainMesh.geometry.attributes;
    a.splat.needsUpdate = a.grass.needsUpdate = a.color.needsUpdate = true;
  }

  wearAll() {
    for (const ch of this.chunks.values()) this.wearChunk(ch);
  }

  // which pooled plants are in view this frame (call before rendering)
  cull(camera, shadowCamera) {
    this.pools.update(camera, shadowCamera);
  }

  // the chunk's pooled instances go back to the pools
  static freeBlocks(list) {
    for (const b of list) b.free();
    list.length = 0;
  }

  // Plans are cached, so clearings must be registered before the first update.
  // Inside r nothing grows; over the next `soft` metres the jungle thins out gradually so
  // the clearing has a ragged, natural edge instead of a cut circle.
  addClearing(x, z, r, soft = 0) {
    this.clearings.push({ x, z, r, soft });
    this.plans.clear();
    this.bigPlans.clear();
  }

  cleared(x, z, pad = 0, inner = 1) {
    for (const c of this.clearings) {
      const d = Math.hypot(x - c.x, z - c.z) - (c.r * inner + pad);
      if (d < 0) return true;
      if (d < c.soft) {
        const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
        if (h < 1 - d / c.soft) return true;
      }
    }
    return false;
  }

  // A new day: forage grows back and cut plants regrow in chunks you haven't kept loaded.
  regrow() {
    this.foraged.clear();
    this.cut.clear();
    for (const ch of this.chunks.values()) {
      if (ch.dressing) this.dropDressing(ch);
    }
  }

  dropDressing(ch) {
    World.freeBlocks(ch.dressing);
    ch.dressing = null;
    ch.cuttables = ch.cuttables.filter((c) => !c.dress);
    ch.interactables = ch.interactables.filter((i) => i.kind !== 'forage' && !i.dress);
  }

  // The ground as rendered at (x, z): the height and normal of the terrain mesh's own
  // triangle there (not the smooth terrain function), the splat weights and the baked
  // shade. null where no chunk is built.
  groundAt(x, z, out = {}) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const ch = this.chunks.get(World.key(cx, cz));
    if (!ch || !ch.heights || !ch.splat) return null;
    const N = SEG + 1, W = N + 2, step = CS / SEG;
    const fx = (x - cx * CS) / step, fz = (z - cz * CS) / step;
    const i = Math.min(SEG - 1, Math.floor(fx)), j = Math.min(SEG - 1, Math.floor(fz));
    const u = fx - i, v = fz - j;
    const H = ch.heights, row = W, g0 = (j + 1) * row + (i + 1);
    const ha = H[g0], hb = H[g0 + 1], hc = H[g0 + row], hd = H[g0 + row + 1];
    let nx, nz;
    // each grid quad is split along its b-c diagonal (see the index order in buildTerrain)
    if (u + v <= 1) {
      out.h = ha + (hb - ha) * u + (hc - ha) * v;
      nx = ha - hb; nz = ha - hc;
    } else {
      out.h = hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
      nx = hc - hd; nz = hb - hd;
    }
    const nl = Math.hypot(nx, step, nz);
    out.nx = nx / nl; out.ny = step / nl; out.nz = nz / nl;
    const S = ch.splat, C = ch.shade, a = j * N + i;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const sp = (k) => S[a * 4 + k] * w00 + S[(a + 1) * 4 + k] * w10 + S[(a + N) * 4 + k] * w01 + S[(a + N + 1) * 4 + k] * w11;
    out.litter = sp(0); out.moss = sp(1); out.rock = sp(2); out.mud = sp(3);
    out.shade = C[a * 3 + 1] * w00 + C[(a + 1) * 3 + 1] * w10 + C[(a + N) * 3 + 1] * w01 + C[(a + N + 1) * 3 + 1] * w11;
    const G = ch.grass;
    out.grass = G ? G[a] * w00 + G[a + 1] * w10 + G[a + N] * w01 + G[a + N + 1] * w11 : 0;
    return out;
  }

  // Points of interest in built chunks within r of (x, z), as their placement specs.
  poisNear(x, z, r) {
    const out = [];
    for (const ch of this.chunks.values()) if (ch.poi && Math.hypot(ch.poi.x - x, ch.poi.z - z) < r + ch.poi.radius) out.push(ch.poi);
    return out;
  }

  // a number, not a string: chunk lookups run thousands of times a frame and every string
  // key was garbage (chunk coordinates stay well inside +-4096)
  static key(cx, cz) {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  // ------------------------------------------------------------ streaming

  update(px, pz, dt, force = false) {
    this.time += dt;
    this.px = px;
    this.pz = pz;
    const cx = Math.floor(px / CS), cz = Math.floor(pz / CS);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      const want = [];
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++)
        for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) want.push([cx + dx, cz + dz, dx * dx + dz * dz]);
      want.sort((a, b) => a[2] - b[2]);
      this.queue = want.filter(([x, z]) => !this.chunks.has(World.key(x, z)) && this.building?.key !== World.key(x, z));
      for (const [k, ch] of this.chunks) {
        if (Math.max(Math.abs(ch.cx - cx), Math.abs(ch.cz - cz)) > VIEW_RADIUS + 1) this.unload(k);
      }
      // forget plans far away to bound memory
      for (const map of [this.plans, this.bigPlans]) {
        for (const k of map.keys()) {
          const x = Math.floor(k / 8192) - 4096, z = (k % 8192) - 4096;
          if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > VIEW_RADIUS + 4) map.delete(k);
        }
      }
    }
    if (force) {
      if (this.building) finish(this.building.steps);
      this.building = null;
      while (this.queue.length) this.build(...this.queue.shift());
      for (const ch of this.chunks.values()) this.updateDressing(ch);
    } else if (this.building || this.queue.length) {
      // one slice of the chunk under construction per frame
      if (!this.building) {
        const [x, z] = this.queue.shift();
        this.building = { key: World.key(x, z), steps: this.buildSteps(x, z) };
      }
      if (this.building.steps.next().done) this.building = null;
    } else {
      // one dressing change per frame, so streaming stays smooth
      for (const ch of this.chunks.values()) if (this.updateDressing(ch)) break;
    }
    this.updateFallers(dt);
    this.animate(dt);
  }

  get loading() {
    return this.queue.length + (this.building ? 1 : 0);
  }

  animate() {
    const t = this.time;
    let fire = null, fd = 60 * 60;
    for (const ch of this.chunks.values()) {
      for (const a of ch.animated) {
        if (a.kind === 'flame') {
          const f = 0.85 + Math.sin(t * 13 + a.phase) * 0.08 + Math.sin(t * 23.7 + a.phase * 2) * 0.07;
          a.obj.scale.setScalar(a.base * f);
          if (a.obj.userData.fire) {
            a.obj.getWorldPosition(_p);
            const d = (_p.x - this.px) ** 2 + (_p.z - this.pz) ** 2;
            if (d < fd) { fd = d; fire = { x: _p.x, y: _p.y, z: _p.z, f }; }
          }
        }
      }
    }
    if (fire) {
      this.fireLight.position.set(fire.x, fire.y + 0.3, fire.z);
      this.fireLight.intensity = 6 * fire.f;
    } else this.fireLight.intensity = 0;
  }

  // ------------------------------------------------------------- planning

  // Big trees get their own RNG stream: neighbouring chunks need them for
  // canopy shading without computing a whole plan.
  bigTrees(cx, cz) {
    const k = World.key(cx, cz);
    if (this.bigPlans.has(k)) return this.bigPlans.get(k);
    const rand = chunkRng(cx, cz, 102);
    const x0 = cx * CS, z0 = cz * CS;
    const pois = poisAround(cx, cz, 1);
    const out = [];
    const t = {};
    for (let i = 0; i < 34; i++) {
      const x = x0 + rand() * CS, z = z0 + rand() * CS;
      const r1 = rand(), r2 = rand(), r3 = rand(), r4 = rand();
      sampleTerrain(x, z, t);
      if (t.h < 0.8) continue;
      if (r1 > jungleDensity(x, z) * 0.85) continue;
      if (t.mountain > 0.45 && r2 < 0.6) continue;
      if (pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius + 4) ** 2)) continue;
      if (this.cleared(x, z, 6)) continue;
      if (out.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < 100)) continue;
      if (terrainNormal(x, z).y < 0.82) continue;
      out.push({ x, z, y: t.h - 0.25, s: 0.8 + r3 * 0.45, v: Math.floor(r4 * this.flora.types.bigTree.variants.length), ry: rand() * TAU });
    }
    this.bigPlans.set(k, out);
    return out;
  }

  plan(cx, cz) {
    const k = World.key(cx, cz);
    if (this.plans.has(k)) return this.plans.get(k);
    const rand = chunkRng(cx, cz, 101);
    const x0 = cx * CS, z0 = cz * CS;
    const pois = poisAround(cx, cz, 1);
    const T = this.flora.types;
    const items = [];
    const big = this.bigTrees(cx, cz);
    for (const b of big) items.push({ type: 'bigTree', v: b.v, x: b.x, y: b.y, z: b.z, ry: b.ry, s: b.s });
    const t = {};
    const blocked = (x, z, pad, inner = 1) => this.cleared(x, z, pad, inner) || pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius + pad) ** 2);
    const nearBig = (x, z, d) => big.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < d * d);
    // Each chunk grows only one or two of a plant's variants (the neighbours pick others):
    // every variant in a chunk is its own instanced mesh, i.e. its own draw calls.
    const vr = chunkRng(cx, cz, 202);
    const subsets = new Map();
    const variantFor = (type) => {
      const n = T[type].variants.length;
      let sub = subsets.get(type);
      if (!sub) {
        const a = Math.floor(vr() * n);
        sub = SMALL_FRY.has(type) || n < 3 ? [a] : [a, (a + 1 + Math.floor(vr() * (n - 1))) % n];
        if (n === 2 && !SMALL_FRY.has(type)) sub = [0, 1];
        subsets.set(type, sub);
      }
      return sub[Math.floor(rand() * sub.length)];
    };
    const place = (type, x, y, z, s, v, tilt = false) => {
      const it = { type, v: v ?? variantFor(type), x, y, z, ry: rand() * TAU, s };
      if (tilt) {
        const n = terrainNormal(x, z);
        it.nx = n.x; it.ny = n.y; it.nz = n.z;
      }
      items.push(it);
    };
    const scatter = (type, attempts, fn) => {
      for (let i = 0; i < attempts; i++) {
        const x = x0 + rand() * CS, z = z0 + rand() * CS;
        const roll = rand();
        sampleTerrain(x, z, t);
        fn(x, z, t, roll);
      }
    };

    // ---- the understory: palms by the water, tree ferns and young trees under the giants
    scatter('palm', 22, (x, z, t, roll) => {
      if (t.h < 0.3 || t.h > 14) return;
      const wet = 1 - smoothstep(1.5, 7, t.h);
      if (roll > 0.08 + wet * 0.6 || blocked(x, z, 2) || nearBig(x, z, 5)) return;
      if (terrainNormal(x, z).y < 0.85) return;
      place('palm', x, t.h - 0.1, z, range(rand, 0.85, 1.2));
      // dead fronds lie around the foot of most palms
      const nd = Math.floor(rand() * 3);
      for (let k = 0; k < nd; k++) {
        const a = rand() * TAU, d = 1.2 + rand() * 1.8;
        const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d;
        place('deadFrond', fx, terrainHeight(fx, fz), fz, 0.8 + rand() * 0.3, undefined, true);
      }
    });
    scatter('midTree', 34, (x, z, t, roll) => {
      if (t.h < 0.6 || roll > 0.08 + jungleDensity(x, z) * 0.55 || blocked(x, z, 2.5) || nearBig(x, z, 4)) return;
      if (terrainNormal(x, z).y < 0.82) return;
      place('midTree', x, t.h - 0.1, z, range(rand, 0.85, 1.15));
    });
    scatter('smallTree', 140, (x, z, t, roll) => {
      if (t.h < 0.6) return;
      if (roll > 0.15 + jungleDensity(x, z) * 0.5 || blocked(x, z, 2) || nearBig(x, z, 3)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('smallTree', x, t.h - 0.1, z, range(rand, 0.8, 1.25));
    });
    scatter('treeFern', 70, (x, z, t, roll) => {
      const d = jungleDensity(x, z);
      if (t.h < 0.8 || roll > (0.05 + d * 0.35) * smoothstep(0.35, 0.7, clump(0, x, z)) || blocked(x, z, 1.5) || nearBig(x, z, 3)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('treeFern', x, t.h - 0.1, z, range(rand, 0.8, 1.25));
    });

    // ---- the herb layer: aroids, ferns, bananas and shrubs in patches
    scatter('monstera', 110, (x, z, t, roll) => {
      const d = jungleDensity(x, z);
      const shade = nearBig(x, z, 9) ? 1 : 0.4;
      if (t.h < 0.4 || roll > d * 0.5 * shade * smoothstep(0.3, 0.65, clump(1, x, z)) || blocked(x, z, 0.8, 0.72)) return;
      if (terrainNormal(x, z).y < 0.78) return;
      place('monstera', x, t.h - 0.05, z, range(rand, 0.8, 1.35));
    });
    scatter('fern', 280, (x, z, t, roll) => {
      const d = jungleDensity(x, z);
      if (t.h < 0.4 || roll > (0.12 + d * 0.45) * (0.35 + 0.9 * smoothstep(0.35, 0.75, clump(2, x, z))) || blocked(x, z, 0.5, 0.5) || nearBig(x, z, 2.2)) return;
      if (terrainNormal(x, z).y < 0.7) return;
      place('fern', x, t.h - 0.05, z, range(rand, 0.75, 1.45));
    });
    scatter('bush', 120, (x, z, t, roll) => {
      if (t.h < 0.4 || roll > (0.12 + jungleDensity(x, z) * 0.4) * smoothstep(0.25, 0.6, clump(3, x, z)) || blocked(x, z, 0.5) || nearBig(x, z, 2.5)) return;
      if (terrainNormal(x, z).y < 0.72) return;
      place('bush', x, t.h - 0.1, z, range(rand, 0.7, 1.3));
    });
    scatter('banana', 65, (x, z, t, roll) => {
      const wet = 1 - smoothstep(1.0, 6, t.h);
      const gap = 1 - jungleDensity(x, z);
      if (t.h < 0.25 || roll > 0.04 + wet * 0.45 + gap * 0.2 || blocked(x, z, 1) || nearBig(x, z, 3)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      // bananas grow in stands
      for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) {
        const bx = x + (rand() - 0.5) * 3.5, bz = z + (rand() - 0.5) * 3.5;
        if (blocked(bx, bz, 1)) continue;
        place('banana', bx, terrainHeight(bx, bz) - 0.1, bz, range(rand, 0.8, 1.3));
      }
    });
    scatter('taro', 90, (x, z, t, roll) => {
      const wet = 1 - smoothstep(1.0, 8, t.h);
      if (t.h < 0.3 || roll > (0.05 + wet * 0.4 + jungleDensity(x, z) * 0.1) * smoothstep(0.3, 0.6, clump(4, x, z)) || blocked(x, z, 1, 0.72)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('taro', x, t.h - 0.05, z, range(rand, 0.8, 1.35));
    });
    scatter('flower', 40, (x, z, t, roll) => {
      const gap = 1 - jungleDensity(x, z);
      if (t.h < 0.5 || roll > 0.04 + gap * 0.3 || blocked(x, z, 0.5, 0.5)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('flower', x, t.h - 0.03, z, range(rand, 0.85, 1.3));
    });

    // ---- rock: boulders bedded into slopes, big ones on cliffs and terrace risers
    scatter('rock', 30, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (t.h < -2.2 || roll > 0.06 + slope * 2.5 + t.mountain * 0.5 || blocked(x, z, 1)) return;
      const s = range(rand, 0.5, 2.1);
      place('rock', x, t.h - (0.12 + slope * 0.3) * s, z, s, undefined, true);
    });
    scatter('rock', 110, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (slope < 0.3 || slope > 0.6 || t.h < 1 || roll > 0.8 || blocked(x, z, 2)) return;
      const s = range(rand, 1.6, 3.6);
      let y = Infinity;
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6;
        y = Math.min(y, terrainHeight(x + Math.cos(a) * 0.8 * s, z + Math.sin(a) * 0.8 * s));
      }
      place('rock', x, y - 0.2 * s, z, s, undefined, true);
    });
    // cliff outcrops: stepped ledges of bedded rock on faces too steep for boulders, turned to
    // face down the slope and bedded into it. A wall covers little of the map seen from above,
    // so many tries, kept more often the steeper the ground
    scatter('cliffRock', 320, (x, z, t, roll) => {
      const n = terrainNormal(x, z);
      if (t.h < 0.8 || roll > 0.75 * smoothstep(0.82, 0.45, n.y) || blocked(x, z, 3)) return;
      const s = range(rand, 0.9, 1.5);
      // out from the face a little (more the steeper it is), its front edge (0.6 m out and down
      // at unit scale) just below the ground in front
      const l = Math.hypot(n.x, n.z), dx = n.x / l, dz = n.z / l;
      const out = 0.5 * s * (1 - n.y), px = x + dx * out, pz = z + dz * out;
      const yFront = terrainHeight(px + dx * 0.6 * s, pz + dz * 0.6 * s);
      place('cliffRock', px, yFront + 0.4 * s, pz, s);
      items[items.length - 1].ry = Math.atan2(n.x, n.z);
    });
    // ferns and shrubs clinging to ledges on steep ground
    scatter('fern', 70, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (slope < 0.35 || t.h < 1 || groundPatch(x, z) < 0.3 - roll * 0.3 || blocked(x, z, 1)) return;
      place(roll < 0.6 ? 'fern' : 'bush', x, t.h - 0.15, z, range(rand, 0.7, 1.2));
    });
    scatter('log', 5, (x, z, t, roll) => {
      if (t.h < 0.8 || roll > 0.4 || blocked(x, z, 4) || nearBig(x, z, 5)) return;
      if (terrainNormal(x, z).y < 0.93) return;
      place('log', x, t.h - 0.08, z, range(rand, 0.9, 1.1));
      // fungi on the rotting wood
      for (let k = 0; k < 2; k++) {
        const mx = x + (rand() - 0.5) * 4, mz = z + (rand() - 0.5) * 2;
        place('mushrooms', mx, terrainHeight(mx, mz) - 0.02, mz, range(rand, 0.8, 1.3));
      }
    });
    // grass only where light reaches the floor: gaps, clearings and the river banks
    scatter('grass', 600, (x, z, t, roll) => {
      if (t.h < -0.35) return;
      if (t.h < 1.1 && rand() < 0.5) {
        const ox = x + (rand() - 0.5) * 3, oz = z + (rand() - 0.5) * 3, oh = terrainHeight(ox, oz);
        if (oh > -0.35 && oh < 1.1) place('grass', ox, oh - 0.05, oz, range(rand, 0.7, 1.3), 1);
      }
      const reed = t.h < 1.1;
      const open = 1 - jungleDensity(x, z);
      if (!reed && roll > (0.05 + open * 0.75) * (nearBig(x, z, 8) ? 0.3 : 1) * smoothstep(0.35, 0.7, clump(5, x, z, 0.08))) return;
      // the meadows grow their own blades (Grass.js): these tall tufts gather at their edges
      if (!reed && this.grassAt(x, z, 1 - open, 0, 0, 0, 1 - terrainNormal(x, z).y) > 0.5) return;
      if (blocked(x, z, -2, 0.5) || terrainNormal(x, z).y < 0.75) return;
      place('grass', x, t.h - 0.05, z, range(rand, 0.7, 1.3), reed ? 1 : (rand() < 0.5 ? 0 : 2));
    });
    // the jungle closing in on old stone: plants hugging temple and ruin footprints
    for (const p of pois) {
      if (p.type !== 'temple' && p.type !== 'ruins') continue;
      if (Math.floor(p.x / CS) !== cx || Math.floor(p.z / CS) !== cz) continue;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const n = p.type === 'temple' ? 180 : 50;
      for (let i = 0; i < n; i++) {
        let lx, lz;
        if (p.type === 'temple') {
          // along the base of the bottom tier (half-size 13), outside it
          const edge = Math.floor(rand() * 4), u = (rand() * 2 - 1) * 14, out = 13.4 + Math.pow(rand(), 1.5) * 3.5;
          [lx, lz] = [[u, out], [u, -out], [out, u], [-out, u]][edge];
          if (edge === 0 && Math.abs(lx) < 3.5) continue; // keep the stairway clear
        } else {
          const a = rand() * TAU, d = 1.5 + rand() * 8.5;
          lx = Math.cos(a) * d; lz = Math.sin(a) * d;
        }
        const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
        const h = terrainHeight(x, z);
        if (h < 0.3) continue;
        const roll = rand();
        if (roll < 0.28) place('fern', x, h - 0.05, z, range(rand, 0.9, 1.5));
        else if (roll < 0.42) place('taro', x, h - 0.05, z, range(rand, 0.8, 1.2));
        else if (roll < 0.55) place('monstera', x, h - 0.05, z, range(rand, 0.8, 1.2));
        else if (roll < 0.65) place('bush', x, h - 0.1, z, range(rand, 0.6, 1.1));
        else place('seedling', x, h - 0.03, z, range(rand, 0.9, 1.4));
      }
    }

    // ---- forest floor dressing: fallen limbs, seedlings, stones, fungi, epiphytes
    scatter('branch', 60, (x, z, t, roll) => {
      if (t.h < 0.6 || roll > 0.25 + jungleDensity(x, z) * 0.5 || blocked(x, z, 0.5)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('branch', x, t.h - 0.03, z, range(rand, 0.8, 1.3), undefined, true);
    });
    scatter('seedling', 360, (x, z, t, roll) => {
      if (t.h < 0.5 || roll > (0.15 + jungleDensity(x, z) * 0.6) * (0.5 + 0.7 * clump(5, x, z)) || blocked(x, z, 0, 0.5)) return;
      if (terrainNormal(x, z).y < 0.75) return;
      place('seedling', x, t.h - 0.03, z, range(rand, 0.8, 1.4));
    });
    scatter('pebbles', 60, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      const bank = t.h < 1.6 ? 0.55 : 0;
      if (t.h < -1.8 || slope > 0.15 || blocked(x, z, 0.5)) return;
      if (roll > (0.04 + bank + t.mountain * 0.2) * (1 - smoothstep(0.05, 0.15, slope))) return;
      place('pebbles', x, t.h - 0.02, z, range(rand, 0.7, 1.1), undefined, true);
    });
    scatter('stump', 4, (x, z, t, roll) => {
      if (t.h < 0.8 || roll > 0.45 || blocked(x, z, 2) || nearBig(x, z, 4)) return;
      if (terrainNormal(x, z).y < 0.9) return;
      place('stump', x, t.h - 0.05, z, range(rand, 0.85, 1.2));
      const mx = x + (rand() - 0.5) * 1.5, mz = z + (rand() - 0.5) * 1.5;
      place('mushrooms', mx, terrainHeight(mx, mz) - 0.02, mz, range(rand, 0.8, 1.2));
    });
    // bromeliads, orchids and fungi gather around the feet of the giants
    for (const b of big) {
      if (Math.floor(b.x / CS) !== cx || Math.floor(b.z / CS) !== cz) continue;
      const n = Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU, d = 2.5 + rand() * 3.5;
        const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
        if (blocked(x, z, 0.5)) continue;
        const roll = rand();
        const type = roll < 0.4 ? 'bromeliad' : roll < 0.65 ? 'orchid' : 'mushrooms';
        place(type, x, terrainHeight(x, z) - 0.03, z, range(rand, 0.8, 1.3));
      }
    }

    // forage: loose materials on the floor
    const forage = [];
    const addForage = (id, x, z) => {
      if (blocked(x, z, 0.5)) return;
      const n = terrainNormal(x, z);
      if (n.y < 0.8) return;
      forage.push({ id, x, y: terrainHeight(x, z), z, ry: rand() * TAU, s: range(rand, 1.5, 1.9), nx: n.x, ny: n.y, nz: n.z });
    };
    scatter('forage', 170, (x, z, t, roll) => {
      if (t.h < 0.2) return;
      const d = jungleDensity(x, z);
      const r2 = rand();
      if (t.h < 1.3 && t.h > 0.2 && r2 < 0.35) addForage('clay', x, z);
      else if (roll < 0.22 + d * 0.1) addForage('stick', x, z);
      else if (roll < 0.48 + t.mountain * 0.3) addForage(r2 < 0.75 ? 'stone' : 'flint', x, z);
      else if (roll < 0.62 && d > 0.45) addForage(d > 0.8 && r2 < 0.12 ? 'glowcap' : 'mushroom', x, z);
      else if (roll < 0.7) addForage(r2 < 0.6 ? 'feather' : 'bone', x, z);
      else if (roll < 0.8) addForage(r2 < 0.5 ? 'bark' : 'fiber', x, z);
      else if (roll < 0.88) addForage(d > 0.5 ? 'moss' : 'berries', x, z);
      else if (roll < 0.94) addForage('vine', x, z);
    });
    // the floor is never tidy: things lie together where they fell. Each find is a little
    // cluster around a spot
    const around = (x, z, n, spread, pick) => {
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU, r = spread * Math.sqrt(rand());
        const id = pick(k);
        addForage(id, x + Math.cos(a) * r, z + Math.sin(a) * r);
      }
    };
    scatter('forage', 48, (x, z, t, roll) => {
      if (t.h < 0.3 || blocked(x, z, 1)) return;
      const d = jungleDensity(x, z);
      const n = 3 + Math.floor(rand() * 4);
      if (roll < 0.18) around(x, z, n, 1.6, () => 'stick'); // a fallen bundle of dead wood
      else if (roll < 0.42) around(x, z, n, 1.3, () => (rand() < 0.22 + t.mountain * 0.3 ? 'flint' : 'stone'));
      else if (roll < 0.58 && d > 0.35) around(x, z, n + 1, 0.9, () => (d > 0.75 && rand() < 0.1 ? 'glowcap' : 'mushroom')); // a fairy ring
      else if (roll < 0.68) around(x, z, 3, 1.0, (k) => (k === 0 ? 'feather' : rand() < 0.6 ? 'bone' : 'feather')); // something's last meal
      else if (roll < 0.8) around(x, z, n, 1.2, () => (rand() < 0.5 ? 'berries' : 'fiber'));
      else if (roll < 0.9) around(x, z, n, 1.4, () => (rand() < 0.5 ? 'moss' : 'stick'));
      else if (t.h < 1.6) around(x, z, n, 1.2, () => (rand() < 0.6 ? 'clay' : 'stone'));
    });
    // bark curls, resin drips and vines fallen at the feet of the giants
    for (const b of big) {
      if (Math.floor(b.x / CS) !== cx || Math.floor(b.z / CS) !== cz) continue;
      const n = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU, r = 2.6 + rand() * 3;
        const roll = rand();
        addForage(roll < 0.4 ? 'bark' : roll < 0.62 ? 'stick' : roll < 0.84 ? 'vine' : roll < 0.94 ? 'moss' : 'resin', b.x + Math.cos(a) * r, b.z + Math.sin(a) * r);
      }
    }
    // a few sticks and stones on the bare ground round the Heartwood, 8-20 m out, so the first
    // thing the journal asks for (look down, tap E) lies near where a run starts. One fixed
    // set, drawn whole for every chunk, of which each chunk keeps the ones inside it.
    const home = this.clearings[0];
    if (home) {
      const hr = chunkRng(Math.floor(home.x), Math.floor(home.z), 977);
      for (let i = 0; i < 8; i++) {
        const a = hr() * TAU, d = 8 + hr() * 12, ry = hr() * TAU, sc = range(hr, 1.25, 1.6);
        const x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
        if (x < x0 || x >= x0 + CS || z < z0 || z >= z0 + CS) continue;
        const n = terrainNormal(x, z);
        if (n.y < 0.8) continue;
        forage.push({ id: i % 3 === 2 ? 'stone' : 'stick', x, y: terrainHeight(x, z), z, ry, s: sc, nx: n.x, ny: n.y, nz: n.z });
      }
    }

    // ---- thickets: the understory in clumps of 4-8 (tree ferns, bananas, aroids, saplings,
    // big shrubs), 2-6 m tall, so sightlines close at 20-40 m into walls and corridors instead
    // of running 100 m through clean trunks. Placed last, so nothing else in the plan moves.
    const THICKET = [['treeFern', 0.8, 1.2], ['banana', 0.9, 1.3], ['monstera', 1.2, 1.7], ['smallTree', 0.75, 1.05], ['bush', 1.3, 2.0], ['taro', 1.2, 1.6]];
    scatter('thicket', 22, (x, z, t, roll) => {
      const d = jungleDensity(x, z);
      if (t.h < 0.6 || roll > d * 0.9 * smoothstep(0.3, 0.6, clump(3, x, z, 0.03)) || blocked(x, z, 4) || nearBig(x, z, 3.5)) return;
      const n = 4 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU, r = 1 + Math.sqrt(rand()) * 4;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const [type, s0, s1] = THICKET[Math.floor(rand() * THICKET.length)];
        if (blocked(px, pz, 1.5) || nearBig(px, pz, 3) || terrainNormal(px, pz).y < 0.8) continue;
        place(type, px, terrainHeight(px, pz) - 0.08, pz, range(rand, s0, s1));
      }
    });

    // ---- the drowned grove: mangroves on the hummocks, reed beds in the shallows, lilies on
    // the pools, dead snags standing in the water, and what the mud gives up. Placed last, and
    // only in chunks that reach the grove, so nothing else anywhere moves.
    const G = grove();
    if (Math.hypot(x0 + CS / 2 - G.x, z0 + CS / 2 - G.z) < G.r * 1.35 + CS * 0.75) {
      scatter('mangrove', 70, (x, z, t, roll) => {
        if (t.swamp < 0.2 || t.h < -0.7 || t.h > 1.3 || roll > 0.6 * t.swamp || blocked(x, z, 2.5) || nearBig(x, z, 4)) return;
        place('mangrove', x, Math.max(t.h, WATER_LEVEL - 0.3) - 0.05, z, range(rand, 0.8, 1.3));
      });
      scatter('reeds', 260, (x, z, t, roll) => {
        if (t.swamp < 0.12 || t.h < -0.55 || t.h > 0.6 || roll > 0.85 * smoothstep(0.35, 0.65, clump(4, x, z, 0.06)) || blocked(x, z, 0.5)) return;
        // reed beds: a few clumps together
        for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) {
          const rx = x + (rand() - 0.5) * 2.2, rz = z + (rand() - 0.5) * 2.2, rh = terrainHeight(rx, rz);
          if (rh < -0.6 || rh > 0.7) continue;
          place('reeds', rx, rh - 0.05, rz, range(rand, 0.8, 1.25));
        }
      });
      scatter('lily', 160, (x, z, t, roll) => {
        if (t.swamp < 0.25 || t.h > -0.12 || t.h < -1.4 || roll > 0.7 || blocked(x, z, 0.5)) return;
        place('lily', x, WATER_LEVEL + 0.015, z, range(rand, 0.8, 1.3));
        // they float flat whatever the bed does
        const it = items[items.length - 1];
        it.nx = 0; it.ny = 1; it.nz = 0;
      });
      scatter('snag', 30, (x, z, t, roll) => {
        if (t.swamp < 0.3 || t.h > 0.4 || t.h < -1.2 || roll > 0.5 || blocked(x, z, 3)) return;
        place('snag', x, t.h - 0.1, z, range(rand, 0.85, 1.25));
      });
      const addWet = (id, x, z) => {
        if (blocked(x, z, 0.5)) return;
        forage.push({ id, x, y: terrainHeight(x, z), z, ry: rand() * TAU, s: range(rand, 1.5, 1.9), nx: 0, ny: 1, nz: 0 });
      };
      scatter('forage', 70, (x, z, t, roll) => {
        if (t.swamp < 0.2 || t.h < -0.45 || t.h > 0.9) return;
        const r2 = rand();
        if (t.h < 0.05 && roll < 0.3) addWet('eel', x, z); // in the shallows
        else if (t.h < 0.4 && roll < 0.62) {
          // bog iron in rusty seams: two or three together
          for (let k = 0; k < 1 + Math.floor(r2 * 3); k++) addWet('bog_iron', x + (rand() - 0.5) * 1.6, z + (rand() - 0.5) * 1.6);
        } else if (roll < 0.85) addWet('reed', x, z);
        else addWet(r2 < 0.5 ? 'moss' : 'clay', x, z);
      });
    }

    // root caches: now and then a bundle someone hid at the foot of a giant and never came back
    // for (placed last, from their own random stream, so nothing else in the plan moves)
    const caches = [];
    const cr = chunkRng(cx, cz, 313);
    for (const b of big) {
      if (Math.floor(b.x / CS) !== cx || Math.floor(b.z / CS) !== cz) continue;
      if (cr() > 0.2) continue;
      const a = cr() * TAU, d = (1.9 + cr() * 0.8) * Math.min(1.6, b.s);
      const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
      if (blocked(x, z, 0.6) || terrainNormal(x, z).y < 0.8) continue;
      caches.push({ x, y: terrainHeight(x, z), z, ry: -a + (cr() - 0.5) * 0.8 });
    }
    const plan = { items, forage, caches };
    this.plans.set(k, plan);
    return plan;
  }

  // ------------------------------------------------------------- building

  build(cx, cz) {
    finish(this.buildSteps(cx, cz));
  }

  // A chunk, a slice at a time (World.update runs one slice per frame): the plans it needs
  // (its own and its neighbours', for shade and big trees), the terrain in bands of rows, the
  // plants a dozen meshes at a time, then its point of interest.
  *buildSteps(cx, cz) {
    const k = World.key(cx, cz);
    if (this.chunks.has(k)) return;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (this.plans.has(World.key(cx + dx, cz + dz))) continue;
        this.plan(cx + dx, cz + dz);
        yield;
      }
    }
    const plan = this.plan(cx, cz);
    const group = new THREE.Group();
    group.name = `chunk ${k}`;
    const chunk = { key: k, cx, cz, group, cuttables: [], colliders: [], interactables: [], animated: [], poi: null, blocks: [] };

    group.add(yield* this.terrainSteps(cx, cz, chunk));
    yield;

    yield* this.instanceSteps(chunk, plan, chunk.blocks, (type) => !DRESSING.has(type));

    const spec = poiSpec(cx, cz);
    if (spec) {
      yield;
      const res = yield* buildPOISteps(spec, this.flora);
      group.add(res.group);
      chunk.poi = spec;
      chunk.colliders.push(...res.colliders);
      chunk.animated.push(...res.animated);
      for (const it of res.interactables) {
        it.chunk = chunk;
        if (this.looted.has(it.id)) this.finishInteractable(it, chunk, true);
        chunk.interactables.push(it);
      }
    }

    this.scene.add(group);
    this.chunks.set(k, chunk);
  }

  // Small floor props live only in the chunks next to the player (the outer
  // ring is deep in fog). Returns true if it built or dropped anything.
  updateDressing(ch) {
    const near = Math.max(Math.abs(ch.cx - this.cx), Math.abs(ch.cz - this.cz)) < VIEW_RADIUS;
    if (near && !ch.dressing) {
      ch.dressing = []; // its blocks
      const plan = this.plan(ch.cx, ch.cz);
      this.instance(ch, plan, ch.dressing, (type) => DRESSING.has(type), true);
      this.instanceForage(ch, plan, ch.dressing);
      return true;
    }
    if (!near && ch.dressing) {
      this.dropDressing(ch);
      return true;
    }
    return false;
  }

  instanceForage(chunk, plan, blocks) {
    if (!forageMat) forageMat = bakedMaterial({ side: THREE.DoubleSide });
    const bins = new Map();
    plan.forage.forEach((f, i) => {
      const key = `${chunk.key}:f${i}`;
      if (this.foraged.has(key)) return;
      if (!bins.has(f.id)) bins.set(f.id, []);
      bins.get(f.id).push([f, key]);
    });
    for (const [id, list] of bins) {
      const pool = this.pools.get(`forage:${id}`, () => new Pool(this.scene, forageGeometry(id), forageMat, { shadow: false, far: FORAGE_FAR }));
      const mesh = pool.alloc(list.length);
      blocks.push(mesh);
      list.forEach(([f, key], i) => {
        _q.setFromAxisAngle(_up, f.ry).premultiply(_q2.setFromUnitVectors(_up, _p.set(f.nx, f.ny, f.nz)));
        _m.compose(_p.set(f.x, f.y, f.z), _q, _s.setScalar(f.s));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, FORAGE_TINT);
        chunk.interactables.push({
          kind: 'forage', id, key, mesh, instance: i, x: f.x, y: f.y + 0.2, z: f.z, r: 0.5,
          label: `Pick up ${ITEMS[id].name}`, chunk,
        });
      });
      mesh.seal();
    }
    // the root caches (searched ones sit darker)
    if (plan.caches?.length) {
      const pool = this.pools.get('cache', () => new Pool(this.scene, forageGeometry('root_cache'), forageMat, { shadow: true, far: 90 }));
      const mesh = pool.alloc(plan.caches.length);
      blocks.push(mesh);
      plan.caches.forEach((c, i) => {
        const id = `${chunk.key}:c${i}`;
        _q.setFromAxisAngle(_up, c.ry);
        _m.compose(_p.set(c.x, c.y - 0.04, c.z), _q, _s.setScalar(3.1));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, this.looted.has(id) ? CACHE_EMPTY : FORAGE_TINT);
        chunk.interactables.push({
          kind: 'search', container: 'cache', id, mesh, instance: i, x: c.x, y: c.y + 0.3, z: c.z, r: 0.9, dress: true,
          label: 'Root cache', loot: 'cache', time: 0.8, chunk, done: this.looted.has(id),
        });
      });
      mesh.seal();
    }
  }

  // Every solid obstacle (trunks, rocks, logs) planned in the chunks overlapping a box,
  // whether or not those chunks are loaded. Used for enemy path-finding around the base.
  staticCircles(x0, z0, x1, z1) {
    const out = [];
    const T = this.flora.types;
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++) {
      for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++) {
        const k = World.key(cx, cz);
        this.plan(cx, cz).items.forEach((it, idx) => {
          const variant = T[it.type]?.variants[it.v];
          if (!variant || !variant.colliders.length || this.cut.has(`${k}:${idx}`)) return;
          const c = Math.cos(it.ry), sn = Math.sin(it.ry);
          for (const col of variant.colliders) {
            out.push({
              x: it.x + (col.x * c + col.z * sn) * it.s,
              z: it.z + (-col.x * sn + col.z * c) * it.s,
              r: col.r * it.s,
            });
          }
        });
        const spec = poiSpec(cx, cz);
        if (spec) out.push({ x: spec.x, z: spec.z, r: spec.radius * 0.7 });
      }
    }
    return out;
  }

  takeForage(it) {
    it.done = true;
    this.foraged.add(it.key);
    it.mesh.setMatrixAt(it.instance, ZERO);
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  // Instanced plants: a block in the pool of each species variant, recorded in `blocks`.
  instance(chunk, plan, blocks, want, dress = false) {
    finish(this.instanceSteps(chunk, plan, blocks, want, dress));
  }

  // the same, yielding every dozen variants
  *instanceSteps(chunk, plan, blocks, want, dress = false) {
    let made = 0;
    const k = chunk.key;
    const bins = new Map();
    plan.items.forEach((it, idx) => {
      if (this.cut.has(`${k}:${idx}`) || !want(it.type)) return;
      const bk = `${it.type}:${it.v}`;
      if (!bins.has(bk)) bins.set(bk, []);
      bins.get(bk).push(idx);
    });
    for (const [bk, list] of bins) {
      if (++made % 12 === 0) yield;
      const [type, v] = bk.split(':');
      const def = this.flora.types[type];
      const variant = def.variants[+v];
      const pool = this.pools.get(`plant:${bk}`, () => new Pool(this.scene, variant.geometry, def.material, {
        slope: true, shadow: def.shadow, far: FAR[type] ?? Infinity,
        lod: LOD_TYPES.has(type) ? lodGeometry(variant.geometry, def.material) : null, lodDist: LOD_DIST,
        lodShadow: TREE_TYPES.has(type),
      }));
      const mesh = pool.alloc(list.length);
      blocks.push(mesh);
      list.forEach((idx, i) => {
        const it = plan.items[idx];
        _q.setFromAxisAngle(_up, it.ry);
        if (it.nx !== undefined) _q.premultiply(_q2.setFromUnitVectors(_up, _p.set(it.nx, it.ny, it.nz)));
        _m.compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.s));
        mesh.setMatrixAt(i, _m);
        if (def.tint) {
          // every plant a little different: a warm/cool shift and a lighter/darker one
          const h = hash2(Math.round(it.x * 10), Math.round(it.z * 10), 7);
          const hue = ((h & 1023) / 1023 - 0.5) * 2 * def.tint[0];
          const val = 1 + (((h >>> 10) & 1023) / 1023 - 0.5) * 2 * def.tint[1];
          mesh.setColorAt(i, _c.setRGB(val * (1 + hue * 1.6), val * (1 + hue * 0.4), val * (1 - hue * 1.8)));
        } else {
          // every instanced caster carries instance colours: when three's shared depth material
          // meets meshes with and without them it rebuilds its program key on every switch
          mesh.setColorAt(i, _c.setRGB(1, 1, 1));
        }
        if (it.nx === undefined) {
          const n = terrainNormal(it.x, it.z);
          mesh.setSlopeAt(i, -n.x / n.y, -n.z / n.y);
        } else mesh.setSlopeAt(i, 0, 0);
        const c = Math.cos(it.ry), s = Math.sin(it.ry);
        for (const col of variant.colliders) {
          chunk.colliders.push({
            type: 'circle', kind: type,
            x: it.x + (col.x * c + col.z * s) * it.s,
            z: it.z + (-col.x * s + col.z * c) * it.s,
            r: col.r * it.s,
            top: col.top !== undefined ? it.y + col.top * it.s : Infinity,
            mesh, instance: i, // the model, so the machete can find the surface it strikes
          });
        }
        if (def.cut) {
          chunk.cuttables.push({ key: `${k}:${idx}`, mesh, instance: i, x: it.x, y: it.y, z: it.z, r: def.cut.r * it.s, type, v: +v, def, alive: true, dress });
        }
      });
      mesh.seal();
    }
  }

  buildTerrain(cx, cz, chunk = null) {
    return finish(this.terrainSteps(cx, cz, chunk));
  }

  // the terrain mesh, yielding every band of rows
  // Grass: where light reaches the floor. Meadows in the open gaps of the jungle (in patches,
  // never under a giant's crown), a ring of turf round the camp, and none on rock, mud or
  // slopes too steep to hold soil. 0-1; the terrain shader breaks its edge up per pixel.
  grassAt(x, z, dens, canopy, rock, mud, slope) {
    const gn = groundPatch(x * 0.55 + 311, z * 0.55 - 173);
    const light = 1 - smoothstep(0.04, 0.3, canopy);
    let g = smoothstep(0.5, 0.82, gn * 0.8 + (1 - dens) * 0.75 + 0.12) * light;
    const home = this.clearings[0];
    if (home) {
      const d = Math.hypot(x - home.x, z - home.z) / home.r;
      g = Math.max(g, smoothstep(0.32, 0.62, d + gn * 0.25) * (1 - smoothstep(1.15, 1.6, d - gn * 0.3)));
    }
    return clamp(g * (1 - rock) * (1 - mud * 0.9) * (1 - smoothstep(0.2, 0.4, slope)), 0, 1);
  }

  *terrainSteps(cx, cz, chunk = null) {
    const N = SEG + 1, W = N + 2, step = CS / SEG;
    const x0 = cx * CS, z0 = cz * CS;
    const H = new Float32Array(W * W), RV = new Float32Array(W * W), MT = new Float32Array(W * W), SW = new Float32Array(W * W);
    const t = {};
    // the camp: trampled bare earth round the Heartwood, ragged at the edge, giving way to litter
    const home = this.clearings[0];
    const campEarth = (x, z, n) => {
      if (!home) return 0;
      const d = Math.hypot(x - home.x, z - home.z) / home.r;
      return (1 - smoothstep(0.2 + n * 0.4, 0.75 + n * 0.45, d)) * 0.75;
    };
    for (let j = 0; j < W; j++) {
      if (j % 17 === 16) yield;
      for (let i = 0; i < W; i++) {
        sampleTerrain(x0 + (i - 1) * step, z0 + (j - 1) * step, t);
        H[j * W + i] = t.h;
        RV[j * W + i] = t.river;
        MT[j * W + i] = t.mountain;
        SW[j * W + i] = t.swamp;
      }
    }
    if (chunk) chunk.heights = H; // the water reads these for its depth
    // canopy shade from big trees in this and neighbouring chunks
    const bigs = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bigs.push(...this.bigTrees(cx + dx, cz + dz));
    // contact shade under plants and rocks, from this and neighbouring plans
    // (so vertices on a chunk edge agree), binned into 4 m cells
    const shade = new Map();
    const cell = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const it of this.plan(cx + dx, cz + dz).items) {
          const sd = SHADE[it.type];
          if (!sd) continue;
          if (it.x < x0 - 4 || it.x > x0 + CS + 4 || it.z < z0 - 4 || it.z > z0 + CS + 4) continue;
          const k = cell(it.x, it.z);
          if (!shade.has(k)) shade.set(k, []);
          shade.get(k).push({ x: it.x, z: it.z, r: sd[0] * it.s, a: sd[1] });
        }
      }
    }

    const pos = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3), spl = new Float32Array(N * N * 4), grs = new Float32Array(N * N);
    const n = new THREE.Vector3();
    for (let j = 0; j < N; j++) {
      if (j % 17 === 16) yield;
      for (let i = 0; i < N; i++) {
        const gi = (j + 1) * W + (i + 1);
        const h = H[gi];
        const x = i * step, z = j * step, wx = x0 + x, wz = z0 + z;
        const v = j * N + i;
        pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
        n.set(H[gi - 1] - H[gi + 1], 2 * step, H[gi - W] - H[gi + W]).normalize();
        nrm[v * 3] = n.x; nrm[v * 3 + 1] = n.y; nrm[v * 3 + 2] = n.z;

        let ao = 1;
        for (const b of bigs) {
          const dd = (b.x - wx) ** 2 + (b.z - wz) ** 2;
          const R = 10.5 * b.s;
          if (dd < R * R) ao = Math.min(ao, 0.5 + 0.5 * smoothstep(0, 1, Math.sqrt(dd) / R));
        }
        const canopy = 1 - ao; // 0 in the open, 0.5 at a giant's foot
        let contact = 1;
        const gx = Math.floor(wx / 4), gz = Math.floor(wz / 4);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oz = -1; oz <= 1; oz++) {
            const list = shade.get(`${gx + ox},${gz + oz}`);
            if (!list) continue;
            for (const c of list) {
              const dd = (c.x - wx) ** 2 + (c.z - wz) ** 2;
              if (dd < c.r * c.r) contact *= 1 - c.a * (1 - smoothstep(0, 1, Math.sqrt(dd) / c.r));
            }
          }
        }
        ao *= Math.max(0.45, contact);
        // canopy and contact together could reach 0.22: a black floor by the water
        ao = Math.max(ao, 0.42);

        const slope = 1 - n.y;
        const patch = groundPatch(wx, wz);
        const dens = jungleDensity(wx, wz);
        // river banks are earth and mud, not bare rock; rock is for mountains and true cliffs
        const inland = smoothstep(0.5, 0.95, RV[gi]);
        const rock = clamp(smoothstep(0.3, 0.52, slope) * (0.15 + 0.85 * inland) + MT[gi] * 0.7 * smoothstep(0.16, 0.34, slope) + smoothstep(22, 36, h) * 0.5, 0, 1);
        // mud near the waterline, and bare dark earth where slopes shed their litter
        const mn = groundPatch(wx * 2.7, wz * 2.7);
        const mud = clamp((1 - smoothstep(0.3 + mn * 1.8, 1.5 + mn * 3.2, h)) + (1 - RV[gi]) * 0.5 * (1 - smoothstep(1.0, 2.5, h))
          + smoothstep(0.2, 0.4, slope) * (0.1 + 0.3 * mn) * inland + campEarth(wx, wz, mn), 0, 1) * (1 - rock * 0.7);
        // moss: in patches, on damp banks and in clearings; litter piles up under trees
        // (moss stays off the turf: its dark speckled cushions cut hard holes in a lawn)
        const gAt = this.grassAt(wx, wz, dens, canopy, rock, mud, slope);
        const moss = clamp(
          smoothstep(0.2, 0.65, patch) * 0.55 + (1 - dens) * 0.15 + (1 - RV[gi]) * 0.4 - canopy * 0.8,
          0, 1) * (1 - rock) * (1 - mud) * (1 - 0.8 * gAt);
        let litter = clamp(0.5 + dens * 0.25 + canopy * 1.2 - moss * 0.5, 0.05, 1) * (1 - rock) * (1 - mud * 0.8);
        // the drowned grove: peat and moss on the hummocks, not the river's gravel
        const sw = SW[gi];
        let wetMoss = moss, wetMud = mud;
        if (sw > 0) {
          wetMud = mud * (1 - 0.75 * sw);
          wetMoss = Math.max(moss, sw * (0.45 + 0.4 * smoothstep(0.2, 0.6, patch)));
          litter = Math.max(litter * (1 - sw * 0.3), sw * 0.35);
          ao *= 1 - 0.3 * sw;
        }
        spl[v * 4] = litter; spl[v * 4 + 1] = wetMoss; spl[v * 4 + 2] = rock; spl[v * 4 + 3] = wetMud;
        grs[v] = gAt;

        const tint = 0.92 + patch * 0.08;
        col[v * 3] = ao * tint * 0.98;
        col[v * 3 + 1] = ao * tint;
        col[v * 3 + 2] = ao * tint * 0.92;
      }
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let o = 0;
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    geo.setAttribute('grass', new THREE.BufferAttribute(grs, 1));
    // kept for groundAt (fallen leaves lie only where litter covers the ground)
    if (chunk) {
      chunk.splat = spl; chunk.shade = col; chunk.grass = grs;
      // as built, before any lanes were worn into it
      chunk.baseSplat = spl.slice(); chunk.baseGrass = grs.slice(); chunk.baseCol = col.slice();
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(x0, 0, z0);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.customDepthMaterial = TERRAIN_DEPTH;
    mesh.userData.terrain = true;
    // the ground's shader is the costliest on screen: drawn after the plants, rocks and
    // buildings standing on it, the depth test skips every pixel they already cover
    mesh.renderOrder = 1;
    if (chunk) {
      chunk.terrainMesh = mesh;
      this.wearChunk(chunk);
    }
    return mesh;
  }

  unload(k) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    this.scene.remove(ch.group);
    disposeGroup(ch.group);
    World.freeBlocks(ch.blocks);
    if (ch.dressing) World.freeBlocks(ch.dressing);
    this.chunks.delete(k);
  }

  // -------------------------------------------------------------- queries

  // Everything in `field` in the 3x3 chunks around (x, z), into `out` (cleared first). Hot
  // callers pass their own array: this runs many times a frame (the player's ground and
  // collisions, the interact prompt), and as a generator it made ~100 KB of garbage a frame.
  near(x, z, field, out = []) {
    out.length = 0;
    const ex = this.extra[field];
    if (ex) for (let i = 0; i < ex.length; i++) { const e = ex[i]; if (Math.abs(e.x - x) < 40 && Math.abs(e.z - z) < 40) out.push(e); }
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(World.key(cx + dx, cz + dz));
        if (!ch) continue;
        const list = ch[field];
        for (let i = 0; i < list.length; i++) out.push(list[i]);
      }
    }
    return out;
  }

  // Terrain height, raised by any walkable structure top under (x, z).
  groundHeight(x, z, feetY = Infinity) {
    let h = terrainHeight(x, z);
    for (const c of this.near(x, z, 'colliders', this._nearG)) {
      if (c.dead || c.top === Infinity || c.top > feetY + STEP_HEIGHT) continue;
      if (c.type === 'circle') {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) h = Math.max(h, c.top);
      } else {
        const dx = x - c.x, dz = z - c.z;
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) h = Math.max(h, c.top);
      }
    }
    return h;
  }

  // Push a cylinder (pos.x, pos.z, radius) out of anything too tall to step onto.
  collide(pos, radius, feetY, headY) {
    for (const c of this.near(pos.x, pos.z, 'colliders', this._nearC)) {
      if (c.dead || c.top <= feetY + STEP_HEIGHT) continue;
      if (c.bottom !== undefined && c.bottom > headY) continue;
      if (c.type === 'circle') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d2 = dx * dx + dz * dz, R = c.r + radius;
        if (d2 < R * R && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = c.x + (dx / d) * R;
          pos.z = c.z + (dz / d) * R;
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        const ex = c.hx + radius, ez = c.hz + radius;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex;
          else lz = Math.sign(lz || 1) * ez;
          pos.x = c.x + lx * cs + lz * sn;
          pos.z = c.z - lx * sn + lz * cs;
        }
      }
    }
  }

  // One of every plant variant in a hidden group, for the loading-time shader warm-up.
  warmFlora(x, y, z) {
    const g = new THREE.Group();
    for (const def of Object.values(this.flora.types)) {
      def.variants.forEach((variant, i) => {
        const mesh = new THREE.InstancedMesh(withSlope(variant.geometry), def.material, 1);
        mesh.geometry.setAttribute('aSlope', new THREE.InstancedBufferAttribute(new Float32Array(2), 2));
        mesh.setMatrixAt(0, _m.makeTranslation(x + i * 3, y, z));
        mesh.setColorAt(0, _c.setRGB(1, 1, 1));
        mesh.castShadow = def.shadow;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        g.add(mesh);
      });
    }
    this.scene.add(g);
    return g;
  }

  // A cut plant doesn't blink out: a copy of it keels over away from the blade, then sinks and
  // shrinks away. fall: horizontal direction to topple toward (optional).
  // Wither the undergrowth in a circle (a Blight Bloom kills what grows round it). Plants with
  // a trunk stay: the bloom is placed clear of those.
  clearAround(x, z, r) {
    const T = this.flora.types;
    for (let cx = Math.floor((x - r) / CS); cx <= Math.floor((x + r) / CS); cx++) {
      for (let cz = Math.floor((z - r) / CS); cz <= Math.floor((z + r) / CS); cz++) {
        const k = World.key(cx, cz), ch = this.chunks.get(k);
        this.plan(cx, cz).items.forEach((it, idx) => {
          if ((it.x - x) ** 2 + (it.z - z) ** 2 > r * r || T[it.type]?.variants[it.v]?.colliders.length) return;
          const key = `${k}:${idx}`;
          if (this.cut.has(key)) return;
          this.cut.add(key);
          const c = ch?.cuttables.find((q) => q.key === key && q.alive);
          if (!c) return;
          c.alive = false;
          c.mesh.setMatrixAt(c.instance, ZERO);
          c.mesh.instanceMatrix.needsUpdate = true;
        });
      }
    }
  }

  cutPlant(c, fall = null) {
    c.alive = false;
    const m0 = new THREE.Matrix4();
    c.mesh.getMatrixAt(c.instance, m0);
    c.mesh.setMatrixAt(c.instance, ZERO);
    c.mesh.instanceMatrix.needsUpdate = true;
    this.cut.add(c.key);
    const key = `${c.type}:${c.v}`;
    let f = this.fallers.get(key);
    if (!f) {
      // one small instanced mesh per plant variant: the same shader program as the plants
      // themselves, so the first cut never compiles anything
      const def = this.flora.types[c.type];
      const mesh = new THREE.InstancedMesh(withSlope(def.variants[c.v].geometry), def.material, FALL_MAX);
      mesh.geometry.setAttribute('aSlope', new THREE.InstancedBufferAttribute(new Float32Array(FALL_MAX * 2), 2));
      mesh.setColorAt(0, _c.setRGB(1, 1, 1));
      mesh.castShadow = def.shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      f = { mesh, list: [] };
      this.fallers.set(key, f);
    }
    if (f.list.length >= FALL_MAX) f.list.shift();
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m0.decompose(pos, q, s);
    const dir = fall ? new THREE.Vector3(fall.x, 0, fall.z) : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    const color = new THREE.Color(1, 1, 1);
    if (c.mesh.instanceColor) c.mesh.getColorAt(c.instance, color);
    // knocked along the swing, it topples over and lies there a while before it withers away
    f.list.push({ pos, q, s, axis: new THREE.Vector3(dir.z, 0, -dir.x), dir, t: 0, color, big: c.r >= 1, ground: pos.y });
    // the cut stalks stay standing (not under mushrooms: they have no stalks)
    if (c.type !== 'mushrooms' && !(c.type === 'flower' && c.v === 2)) this.stubs.add(c.x, c.y, c.z, c.r * (c.type === 'grass' ? 0.6 : 1), c.def.cut.color);
  }

  updateFallers(dt) {
    for (const f of this.fallers.values()) {
      if (!f.list.length && f.mesh.count === 0) continue;
      f.list = f.list.filter((o) => (o.t += dt) < FALL_LIFE);
      f.list.forEach((o, i) => {
        // pushed along the swing, it tips over (easing in, like real weight) with a small
        // bounce as it lands, lies there, then sinks and shrinks away
        const k = Math.min(1, o.t / 0.5);
        const land = o.t > 0.5 ? Math.exp(-(o.t - 0.5) * 9) * Math.sin((o.t - 0.5) * 30) * 0.08 : 0;
        const ang = k * k * (o.big ? 1.42 : 1.3) - land;
        _q.setFromAxisAngle(o.axis, ang).multiply(o.q);
        const out = Math.max(0, (o.t - (FALL_LIFE - 0.7)) / 0.7);
        const sc = 1 - out * out;
        _p.copy(o.pos).addScaledVector(o.dir, Math.min(1, o.t / 0.35) * 0.25);
        _p.y -= out * 0.3 + 0.12 * k;
        _m.compose(_p, _q, _s.copy(o.s).multiplyScalar(Math.max(0.001, sc)));
        f.mesh.setMatrixAt(i, _m);
        if (f.mesh.instanceColor) f.mesh.setColorAt(i, o.color);
      });
      f.mesh.count = f.list.length;
      f.mesh.instanceMatrix.needsUpdate = true;
      if (f.mesh.instanceColor) f.mesh.instanceColor.needsUpdate = true;
    }
  }

  finishInteractable(it, chunk, silent = false) {
    it.done = true;
    this.looted.add(it.id);
    if (it.hide) for (const o of it.hide) o.visible = false;
    if (it.collider) it.collider.dead = true;
    if (!silent && chunk) chunk.dirty = true;
  }
}
