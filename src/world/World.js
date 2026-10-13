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

const TAU = Math.PI * 2;
const SEG = 32;
export const VIEW_RADIUS = 2;
export const STEP_HEIGHT = 0.55;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

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
  }

  static key(cx, cz) {
    return `${cx},${cz}`;
  }

  // ------------------------------------------------------------ streaming

  update(px, pz, dt, force = false) {
    this.time += dt;
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
    } else if (this.queue.length) {
      this.build(...this.queue.shift());
    }
    this.animate(dt);
  }

  get loading() {
    return this.queue.length;
  }

  animate() {
    const t = this.time;
    for (const ch of this.chunks.values()) {
      for (const a of ch.animated) {
        if (a.kind === 'flame') {
          const f = 0.85 + Math.sin(t * 13 + a.phase) * 0.08 + Math.sin(t * 23.7 + a.phase * 2) * 0.07;
          a.obj.scale.setScalar(a.base * f);
        }
      }
    }
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
    const blocked = (x, z, pad) => pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius + pad) ** 2);
    const nearBig = (x, z, d) => big.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < d * d);
    const place = (type, x, y, z, s, v) =>
      items.push({ type, v: v ?? Math.floor(rand() * T[type].variants.length), x, y, z, ry: rand() * TAU, s });
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
      place('banana', x, t.h - 0.1, z, range(rand, 0.85, 1.3));
    });
    scatter('rock', 26, (x, z, t, roll) => {
      const slope = 1 - terrainNormal(x, z).y;
      if (t.h < -2.2 || roll > 0.07 + slope * 2.5 + t.mountain * 0.5 || blocked(x, z, 1)) return;
      const s = range(rand, 0.5, 2.1);
      place('rock', x, t.h - 0.08 * s, z, s);
    });
    scatter('log', 4, (x, z, t, roll) => {
      if (t.h < 0.8 || roll > 0.35 || blocked(x, z, 4) || nearBig(x, z, 5)) return;
      if (terrainNormal(x, z).y < 0.93) return;
      place('log', x, t.h - 0.05, z, range(rand, 0.9, 1.1));
    });
    scatter('grass', 650, (x, z, t, roll) => {
      if (t.h < -0.35) return;
      const reed = t.h < 1.1;
      if (!reed && roll > 0.3 + (1 - jungleDensity(x, z)) * 0.6) return;
      if (blocked(x, z, -2)) return;
      place('grass', x, t.h - 0.05, z, range(rand, 0.7, 1.3), reed ? 1 : 0);
    });
    scatter('flower', 45, (x, z, t, roll) => {
      const d = jungleDensity(x, z);
      if (t.h < 0.5 || roll > 0.22 + d * 0.2 || blocked(x, z, 0)) return;
      place('flower', x, t.h - 0.03, z, range(rand, 0.8, 1.3), d > 0.75 && rand() < 0.5 ? 2 : Math.floor(rand() * 2));
    });

    const plan = { items };
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

    // Instanced plants, one InstancedMesh per species variant.
    const bins = new Map();
    plan.items.forEach((it, idx) => {
      if (this.cut.has(`${k}:${idx}`)) return;
      const bk = `${it.type}:${it.v}`;
      if (!bins.has(bk)) bins.set(bk, []);
      bins.get(bk).push(idx);
    });
    for (const [bk, list] of bins) {
      const [type, v] = bk.split(':');
      const def = this.flora.types[type];
      const variant = def.variants[+v];
      const mesh = new THREE.InstancedMesh(variant.geometry, def.material, list.length);
      mesh.castShadow = def.shadow;
      mesh.receiveShadow = true;
      list.forEach((idx, i) => {
        const it = plan.items[idx];
        _q.setFromAxisAngle(_up, it.ry);
        _m.compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.s));
        mesh.setMatrixAt(i, _m);
        const c = Math.cos(it.ry), s = Math.sin(it.ry);
        for (const col of variant.colliders) {
          chunk.colliders.push({
            type: 'circle',
            x: it.x + (col.x * c + col.z * s) * it.s,
            z: it.z + (-col.x * s + col.z * c) * it.s,
            r: col.r * it.s,
            top: col.top !== undefined ? it.y + col.top * it.s : Infinity,
          });
        }
        if (def.cut) {
          chunk.cuttables.push({ key: `${k}:${idx}`, mesh, instance: i, x: it.x, y: it.y, z: it.z, r: def.cut.r * it.s, type, def, alive: true });
        }
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
    }

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

        const slope = 1 - n.y;
        const patch = groundPatch(wx, wz);
        const rock = clamp(smoothstep(0.2, 0.45, slope) + MT[gi] * 0.7 * smoothstep(0.08, 0.25, slope) + smoothstep(20, 34, h) * 0.6, 0, 1);
        const mud = clamp((1 - smoothstep(0.3, 1.5, h)) + (1 - RV[gi]) * 0.5, 0, 1) * (1 - rock * 0.7);
        const moss = clamp(smoothstep(-0.15, 0.45, patch) * (1 - rock) * (1 - mud) + smoothstep(0.08, 0.2, slope) * 0.3 * (1 - rock), 0, 1);
        const litter = clamp(0.55 - moss * 0.3, 0.1, 1) * (1 - rock) * (1 - mud * 0.8);
        spl[v * 4] = litter; spl[v * 4 + 1] = moss; spl[v * 4 + 2] = rock; spl[v * 4 + 3] = mud;

        let ao = 1;
        for (const b of bigs) {
          const dd = (b.x - wx) ** 2 + (b.z - wz) ** 2;
          const R = 8.5 * b.s;
          if (dd < R * R) ao = Math.min(ao, 0.5 + 0.5 * smoothstep(0, 1, Math.sqrt(dd) / R));
        }
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
    // Plant geometries are shared library assets; only free per-chunk data.
    ch.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && !o.userData.shared) o.geometry.dispose();
    });
    this.chunks.delete(k);
  }

  // -------------------------------------------------------------- queries

  *near(x, z, field) {
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
