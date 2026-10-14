// Streams the infinite world in 64m chunks around the player. Each chunk
// owns a terrain mesh, instanced plants, an optional point of interest, and
// the colliders / cuttables / interactables that live inside it.
import * as THREE from 'three';
import {
  CHUNK_SIZE as CS, sampleTerrain, terrainHeight, terrainNormal, jungleDensity, groundPatch,
} from './WorldGen.js';
import { chunkRng, range } from '../utils/rng.js';
import { smoothstep, clamp } from '../utils/math.js';
import { poiSpec, poisAround, buildPOI } from './poi/POI.js';
import { makeTerrainMaterial } from '../art/shaders.js';
import { mergeToGeometry, bakedMaterial } from '../art/merge.js';
import { getItemModel } from '../items/ItemModels.js';
import { ITEMS } from '../items/ItemDB.js';

const TAU = Math.PI * 2;
const SEG = 48;
export const VIEW_RADIUS = 2;
export const STEP_HEIGHT = 0.55;

// Small floor props that only the nearby chunks carry.
const DRESSING = new Set(['seedling', 'pebbles', 'leafPile', 'branch', 'deadFrond']);

// Soft contact shade each prop leaves on the ground: [radius, strength].
const SHADE = {
  bush: [1.4, 0.45], fern: [1.1, 0.35], banana: [1.2, 0.35], taro: [1.1, 0.4], smallTree: [1.6, 0.35],
  palm: [1.0, 0.3], rock: [1.5, 0.5], stump: [1.0, 0.4], log: [1.8, 0.25],
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Forage: loose materials lying on the forest floor, picked up with E. They come back
// every dawn. Geometry is the item model, merged into one instanced draw per item.
const FORAGE = ['stick', 'stone', 'flint', 'mushroom', 'glowcap', 'clay', 'feather', 'bone'];
const forageGeo = new Map();
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

// A geometry that shares a library geometry's buffers (uploaded once) but can
// carry its own per-instance attributes.
function withSlope(src) {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  if (src.index) g.setIndex(src.index);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (!src.boundingSphere) src.computeBoundingSphere();
  g.boundingSphere = src.boundingSphere.clone();
  g.boundingBox = src.boundingBox;
  return g;
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
    this.cut = new Set();
    this.looted = new Set();
    this.terrainMat = makeTerrainMaterial(flora.textures);
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
    this.foraged = new Set();
  }

  // Plans are cached, so clearings must be registered before the first update.
  // Inside r nothing grows; over the next `soft` metres the jungle thins out gradually so
  // the clearing has a ragged, natural edge instead of a cut circle.
  addClearing(x, z, r, soft = 0) {
    this.clearings.push({ x, z, r, soft });
    this.plans.clear();
    this.bigPlans.clear();
  }

  cleared(x, z, pad = 0) {
    for (const c of this.clearings) {
      const d = Math.hypot(x - c.x, z - c.z) - (c.r + pad);
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
      if (ch.dressing) {
        ch.group.remove(ch.dressing);
        disposeGroup(ch.dressing);
        ch.dressing = null;
        ch.cuttables = ch.cuttables.filter((c) => !c.dress);
        ch.interactables = ch.interactables.filter((i) => i.kind !== 'forage');
      }
    }
  }

  static key(cx, cz) {
    return `${cx},${cz}`;
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
      this.queue = want.filter(([x, z]) => !this.chunks.has(World.key(x, z)));
      for (const [k, ch] of this.chunks) {
        if (Math.max(Math.abs(ch.cx - cx), Math.abs(ch.cz - cz)) > VIEW_RADIUS + 1) this.unload(k);
      }
      // forget plans far away to bound memory
      for (const map of [this.plans, this.bigPlans]) {
        for (const k of map.keys()) {
          const [x, z] = k.split(',').map(Number);
          if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > VIEW_RADIUS + 4) map.delete(k);
        }
      }
    }
    if (force) {
      while (this.queue.length) this.build(...this.queue.shift());
      for (const ch of this.chunks.values()) this.updateDressing(ch);
    } else if (this.queue.length) {
      this.build(...this.queue.shift());
    } else {
      // one dressing change per frame, so streaming stays smooth
      for (const ch of this.chunks.values()) if (this.updateDressing(ch)) break;
    }
    this.animate(dt);
  }

  get loading() {
    return this.queue.length;
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
      out.push({ x, z, y: t.h - 0.25, s: 0.8 + r3 * 0.45, v: Math.floor(r4 * 3), ry: rand() * TAU });
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
    const blocked = (x, z, pad) => this.cleared(x, z, pad) || pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius + pad) ** 2);
    const nearBig = (x, z, d) => big.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < d * d);
    const place = (type, x, y, z, s, v, tilt = false) => {
      const it = { type, v: v ?? Math.floor(rand() * T[type].variants.length), x, y, z, ry: rand() * TAU, s };
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

    scatter('palm', 22, (x, z, t, roll) => {
      if (t.h < 0.3 || t.h > 14) return;
      const wet = 1 - smoothstep(1.5, 7, t.h);
      if (roll > 0.1 + wet * 0.6 || blocked(x, z, 2) || nearBig(x, z, 5)) return;
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
    scatter('smallTree', 70, (x, z, t, roll) => {
      if (t.h < 0.6) return;
      if (roll > 0.2 + jungleDensity(x, z) * 0.55 || blocked(x, z, 2)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('smallTree', x, t.h - 0.1, z, range(rand, 0.8, 1.2));
    });
    scatter('fern', 260, (x, z, t, roll) => {
      if (t.h < 0.4 || roll > 0.25 + jungleDensity(x, z) * 0.5 || blocked(x, z, 0.5)) return;
      if (terrainNormal(x, z).y < 0.7) return;
      place('fern', x, t.h - 0.05, z, range(rand, 0.8, 1.45));
    });
    scatter('bush', 150, (x, z, t, roll) => {
      if (t.h < 0.4 || roll > 0.18 + jungleDensity(x, z) * 0.45 || blocked(x, z, 0.5)) return;
      if (terrainNormal(x, z).y < 0.72) return;
      place('bush', x, t.h - 0.1, z, range(rand, 0.8, 1.35));
    });
    // low ground cover: small leafy clumps so the floor isn't bare litter
    scatter('bush', 140, (x, z, t, roll) => {
      if (t.h < 0.4 || roll > 0.25 + jungleDensity(x, z) * 0.5 || blocked(x, z, 0)) return;
      if (terrainNormal(x, z).y < 0.7) return;
      place('bush', x, t.h - 0.05, z, range(rand, 0.4, 0.65));
    });
    scatter('banana', 40, (x, z, t, roll) => {
      const wet = 1 - smoothstep(1.0, 6, t.h);
      if (t.h < 0.25 || roll > 0.08 + wet * 0.5 + jungleDensity(x, z) * 0.12 || blocked(x, z, 1)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('banana', x, t.h - 0.1, z, range(rand, 0.85, 1.3));
    });
    scatter('rock', 26, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (t.h < -2.2 || roll > 0.07 + slope * 2.5 + t.mountain * 0.5 || blocked(x, z, 1)) return;
      const s = range(rand, 0.5, 2.1);
      // bed rocks into the slope: tilt to the ground and sink the downhill side's gap
      place('rock', x, t.h - (0.05 + slope * 0.25) * s, z, s, undefined, true);
    });
    // big boulders on cliffs and terrace risers
    scatter('rock', 90, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (slope < 0.35 || slope > 0.55 || t.h < 1 || roll > 0.8 || blocked(x, z, 2)) return;
      const s = range(rand, 1.5, 3);
      let y = Infinity;
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6;
        y = Math.min(y, terrainHeight(x + Math.cos(a) * 0.8 * s, z + Math.sin(a) * 0.8 * s));
      }
      place('rock', x, y - 0.15 * s, z, s, undefined, true);
    });
    // ferns and bushes clinging to ledges on steep ground
    scatter('fern', 60, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (slope < 0.35 || t.h < 1 || groundPatch(x, z) < 0.3 - roll * 0.3 || blocked(x, z, 1)) return;
      place(roll < 0.6 ? 'fern' : 'bush', x, t.h - 0.15, z, range(rand, 0.7, 1.2));
    });
    scatter('log', 4, (x, z, t, roll) => {
      if (t.h < 0.8 || roll > 0.35 || blocked(x, z, 4) || nearBig(x, z, 5)) return;
      if (terrainNormal(x, z).y < 0.93) return;
      place('log', x, t.h - 0.05, z, range(rand, 0.9, 1.1));
    });
    scatter('grass', 650, (x, z, t, roll) => {
      if (t.h < -0.35) return;
      // second pass along the water's edge: reeds twice as thick
      if (t.h < 1.1 && rand() < 0.5) {
        const ox = x + (rand() - 0.5) * 3, oz = z + (rand() - 0.5) * 3, oh = terrainHeight(ox, oz);
        if (oh > -0.35 && oh < 1.1) place('grass', ox, oh - 0.05, oz, range(rand, 0.7, 1.3), 1);
      }
      const reed = t.h < 1.1;
      if (!reed && roll > 0.3 + (1 - jungleDensity(x, z)) * 0.6) return;
      if (blocked(x, z, -2) || terrainNormal(x, z).y < 0.75) return;
      place('grass', x, t.h - 0.05, z, range(rand, 0.7, 1.3), reed ? 1 : 0);
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
        if (roll < 0.3) place('fern', x, h - 0.05, z, range(rand, 0.9, 1.5));
        else if (roll < 0.45) place('taro', x, h - 0.05, z, range(rand, 0.8, 1.2));
        else if (roll < 0.6) place('bush', x, h - 0.1, z, range(rand, 0.6, 1.1));
        else if (roll < 0.8) place('seedling', x, h - 0.03, z, range(rand, 0.9, 1.4));
        else place('leafPile', x, h - 0.02, z, range(rand, 0.8, 1.3), undefined, true);
      }
    }

    // forest floor dressing: leaf drifts, fallen limbs, seedlings, stones
    scatter('leafPile', 120, (x, z, t, roll) => {
      if (t.h < 1.0 || roll > 0.3 + jungleDensity(x, z) * 0.55 || blocked(x, z, 0)) return;
      if (terrainNormal(x, z).y < 0.85) return;
      place('leafPile', x, t.h - 0.02, z, range(rand, 0.8, 1.3), undefined, true);
    });
    scatter('branch', 50, (x, z, t, roll) => {
      if (t.h < 0.6 || roll > 0.25 + jungleDensity(x, z) * 0.5 || blocked(x, z, 0.5)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('branch', x, t.h - 0.03, z, range(rand, 0.8, 1.3), undefined, true);
    });
    scatter('seedling', 340, (x, z, t, roll) => {
      if (t.h < 0.5 || roll > 0.2 + jungleDensity(x, z) * 0.6 || blocked(x, z, 0)) return;
      if (terrainNormal(x, z).y < 0.75) return;
      place('seedling', x, t.h - 0.03, z, range(rand, 0.8, 1.4));
    });
    scatter('taro', 50, (x, z, t, roll) => {
      const wet = 1 - smoothstep(1.0, 8, t.h);
      if (t.h < 0.3 || roll > 0.06 + wet * 0.35 + jungleDensity(x, z) * 0.12 || blocked(x, z, 1)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('taro', x, t.h - 0.05, z, range(rand, 0.8, 1.35));
    });
    scatter('pebbles', 60, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      const bank = t.h < 1.6 ? 0.55 : 0;
      if (t.h < -1.8 || slope > 0.15 || blocked(x, z, 0.5)) return;
      if (roll > (0.04 + bank + t.mountain * 0.2) * (1 - smoothstep(0.05, 0.15, slope))) return;
      place('pebbles', x, t.h - 0.02, z, range(rand, 0.7, 1.1), undefined, true);
    });
    scatter('stump', 3, (x, z, t, roll) => {
      if (t.h < 0.8 || roll > 0.45 || blocked(x, z, 2) || nearBig(x, z, 4)) return;
      if (terrainNormal(x, z).y < 0.9) return;
      place('stump', x, t.h - 0.05, z, range(rand, 0.85, 1.2));
    });
    scatter('flower', 45, (x, z, t, roll) => {
      const d = jungleDensity(x, z);
      if (t.h < 0.5 || roll > 0.22 + d * 0.2 || blocked(x, z, 0)) return;
      if (terrainNormal(x, z).y < 0.8) return;
      place('flower', x, t.h - 0.03, z, range(rand, 0.8, 1.3), d > 0.75 && rand() < 0.5 ? 2 : Math.floor(rand() * 2));
    });

    // forage: loose materials on the floor
    const forage = [];
    const addForage = (id, x, z) => {
      if (blocked(x, z, 0.5)) return;
      const n = terrainNormal(x, z);
      if (n.y < 0.8) return;
      forage.push({ id, x, y: terrainHeight(x, z), z, ry: rand() * TAU, s: range(rand, 1.25, 1.6), nx: n.x, ny: n.y, nz: n.z });
    };
    scatter('forage', 26, (x, z, t, roll) => {
      if (t.h < 0.2) return;
      const d = jungleDensity(x, z);
      const r2 = rand();
      if (t.h < 1.3 && t.h > 0.2 && r2 < 0.35) addForage('clay', x, z);
      else if (roll < 0.35 + d * 0.2) addForage('stick', x, z);
      else if (roll < 0.55 + t.mountain * 0.3) addForage(r2 < 0.75 ? 'stone' : 'flint', x, z);
      else if (roll < 0.72 && d > 0.45) addForage(d > 0.8 && r2 < 0.12 ? 'glowcap' : 'mushroom', x, z);
      else if (roll < 0.8) addForage(r2 < 0.6 ? 'feather' : 'bone', x, z);
    });

    const plan = { items, forage };
    this.plans.set(k, plan);
    return plan;
  }

  // ------------------------------------------------------------- building

  build(cx, cz) {
    const k = World.key(cx, cz);
    if (this.chunks.has(k)) return;
    const plan = this.plan(cx, cz);
    const group = new THREE.Group();
    group.name = `chunk ${k}`;
    const chunk = { key: k, cx, cz, group, cuttables: [], colliders: [], interactables: [], animated: [], poi: null };

    group.add(this.buildTerrain(cx, cz));

    this.instance(chunk, plan, group, (type) => !DRESSING.has(type));

    const spec = poiSpec(cx, cz);
    if (spec) {
      const res = buildPOI(spec, this.flora);
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
      ch.dressing = new THREE.Group();
      const plan = this.plan(ch.cx, ch.cz);
      this.instance(ch, plan, ch.dressing, (type) => DRESSING.has(type), true);
      this.instanceForage(ch, plan, ch.dressing);
      ch.group.add(ch.dressing);
      return true;
    }
    if (!near && ch.dressing) {
      ch.group.remove(ch.dressing);
      disposeGroup(ch.dressing);
      ch.dressing = null;
      ch.cuttables = ch.cuttables.filter((c) => !c.dress);
      ch.interactables = ch.interactables.filter((i) => i.kind !== 'forage');
      return true;
    }
    return false;
  }

  instanceForage(chunk, plan, group) {
    if (!forageMat) forageMat = bakedMaterial({ side: THREE.DoubleSide });
    const bins = new Map();
    plan.forage.forEach((f, i) => {
      const key = `${chunk.key}:f${i}`;
      if (this.foraged.has(key)) return;
      if (!bins.has(f.id)) bins.set(f.id, []);
      bins.get(f.id).push([f, key]);
    });
    for (const [id, list] of bins) {
      const mesh = new THREE.InstancedMesh(forageGeometry(id), forageMat, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach(([f, key], i) => {
        _q.setFromAxisAngle(_up, f.ry).premultiply(_q2.setFromUnitVectors(_up, _p.set(f.nx, f.ny, f.nz)));
        _m.compose(_p.set(f.x, f.y, f.z), _q, _s.setScalar(f.s));
        mesh.setMatrixAt(i, _m);
        chunk.interactables.push({
          kind: 'forage', id, key, mesh, instance: i, x: f.x, y: f.y + 0.2, z: f.z, r: 0.5,
          label: `Pick up ${ITEMS[id].name}`, chunk,
        });
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
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

  // Instanced plants, one InstancedMesh per species variant.
  instance(chunk, plan, group, want, dress = false) {
    const k = chunk.key;
    const bins = new Map();
    plan.items.forEach((it, idx) => {
      if (this.cut.has(`${k}:${idx}`) || !want(it.type)) return;
      const bk = `${it.type}:${it.v}`;
      if (!bins.has(bk)) bins.set(bk, []);
      bins.get(bk).push(idx);
    });
    for (const [bk, list] of bins) {
      const [type, v] = bk.split(':');
      const def = this.flora.types[type];
      const variant = def.variants[+v];
      const mesh = new THREE.InstancedMesh(withSlope(variant.geometry), def.material, list.length);
      const slope = new Float32Array(list.length * 2);
      mesh.castShadow = def.shadow;
      mesh.receiveShadow = true;
      list.forEach((idx, i) => {
        const it = plan.items[idx];
        _q.setFromAxisAngle(_up, it.ry);
        if (it.nx !== undefined) _q.premultiply(_q2.setFromUnitVectors(_up, _p.set(it.nx, it.ny, it.nz)));
        _m.compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.s));
        mesh.setMatrixAt(i, _m);
        if (it.nx === undefined) {
          const n = terrainNormal(it.x, it.z);
          slope[i * 2] = -n.x / n.y;
          slope[i * 2 + 1] = -n.z / n.y;
        }
        const c = Math.cos(it.ry), s = Math.sin(it.ry);
        for (const col of variant.colliders) {
          chunk.colliders.push({
            type: 'circle', kind: type,
            x: it.x + (col.x * c + col.z * s) * it.s,
            z: it.z + (-col.x * s + col.z * c) * it.s,
            r: col.r * it.s,
            top: col.top !== undefined ? it.y + col.top * it.s : Infinity,
          });
        }
        if (def.cut) {
          chunk.cuttables.push({ key: `${k}:${idx}`, mesh, instance: i, x: it.x, y: it.y, z: it.z, r: def.cut.r * it.s, type, v: +v, def, alive: true, dress });
        }
      });
      mesh.geometry.setAttribute('aSlope', new THREE.InstancedBufferAttribute(slope, 2));
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  buildTerrain(cx, cz) {
    const N = SEG + 1, W = N + 2, step = CS / SEG;
    const x0 = cx * CS, z0 = cz * CS;
    const H = new Float32Array(W * W), RV = new Float32Array(W * W), MT = new Float32Array(W * W);
    const t = {};
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        sampleTerrain(x0 + (i - 1) * step, z0 + (j - 1) * step, t);
        H[j * W + i] = t.h;
        RV[j * W + i] = t.river;
        MT[j * W + i] = t.mountain;
      }
    }
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
    const col = new Float32Array(N * N * 3), spl = new Float32Array(N * N * 4);
    const n = new THREE.Vector3();
    for (let j = 0; j < N; j++) {
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
          const R = 8.5 * b.s;
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

        const slope = 1 - n.y;
        const patch = groundPatch(wx, wz);
        const dens = jungleDensity(wx, wz);
        // river banks are earth and mud, not bare rock; rock is for mountains and true cliffs
        const inland = smoothstep(0.5, 0.95, RV[gi]);
        const rock = clamp(smoothstep(0.2, 0.45, slope) * (0.15 + 0.85 * inland) + MT[gi] * 0.7 * smoothstep(0.08, 0.25, slope) + smoothstep(20, 34, h) * 0.6, 0, 1);
        // mud only near the waterline; the bank above is earth, litter and damp moss
        const mn = groundPatch(wx * 2.7, wz * 2.7);
        const mud = clamp((1 - smoothstep(0.3 + mn * 1.8, 1.5 + mn * 3.2, h)) + (1 - RV[gi]) * 0.5 * (1 - smoothstep(1.0, 2.5, h)), 0, 1) * (1 - rock * 0.7);
        // moss: in patches, in clearings and on damp shaded slopes; litter piles up under trees
        const moss = clamp(
          smoothstep(0.05, 0.55, patch) * 0.65 + (1 - dens) * 0.3 + smoothstep(0.08, 0.2, slope) * 0.25 + (1 - RV[gi]) * 0.5 - canopy * 0.8,
          0, 1) * (1 - rock) * (1 - mud);
        const litter = clamp(0.5 + dens * 0.25 + canopy * 1.2 - moss * 0.5, 0.05, 1) * (1 - rock) * (1 - mud * 0.8);
        spl[v * 4] = litter; spl[v * 4 + 1] = moss; spl[v * 4 + 2] = rock; spl[v * 4 + 3] = mud;

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
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(x0, 0, z0);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.terrain = true;
    return mesh;
  }

  unload(k) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    this.scene.remove(ch.group);
    disposeGroup(ch.group);
    this.chunks.delete(k);
  }

  // -------------------------------------------------------------- queries

  *near(x, z, field) {
    const ex = this.extra[field];
    if (ex) for (const e of ex) if (Math.abs(e.x - x) < 40 && Math.abs(e.z - z) < 40) yield e;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(World.key(cx + dx, cz + dz));
        if (ch) yield* ch[field];
      }
    }
  }

  // Terrain height, raised by any walkable structure top under (x, z).
  groundHeight(x, z, feetY = Infinity) {
    let h = terrainHeight(x, z);
    for (const c of this.near(x, z, 'colliders')) {
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
    for (const c of this.near(pos.x, pos.z, 'colliders')) {
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

  cutPlant(c) {
    c.alive = false;
    c.mesh.setMatrixAt(c.instance, ZERO);
    c.mesh.instanceMatrix.needsUpdate = true;
    this.cut.add(c.key);
  }

  finishInteractable(it, chunk, silent = false) {
    it.done = true;
    this.looted.add(it.id);
    if (it.hide) for (const o of it.hide) o.visible = false;
    if (it.collider) it.collider.dead = true;
    if (!silent && chunk) chunk.dirty = true;
  }
}
