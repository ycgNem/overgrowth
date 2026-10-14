// Points of interest: deterministic placement (poiSpec) and the builders
// that turn a spec into meshes, colliders and interactables.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from '../../art/textures.js';
import { addMoss, addNightFill, addPackedNormal, addRelief } from '../../art/shaders.js';
import { worldBox, BlockBatch, taperedTube } from '../flora/geom.js';
import { chunkRng, mulberry32, range, irange } from '../../utils/rng.js';
import { terrainHeight, terrainNormal, CHUNK_SIZE } from '../WorldGen.js';
import { getItemModel } from '../../items/ItemModels.js';

const TAU = Math.PI * 2;
const TEMPLE_REGION = 7; // one temple per 7x7 chunks (~450m square)

export const POI_INFO = {
  temple: { label: 'Temple', radius: 27, icon: '▲' },
  ruins: { label: 'Ruins', radius: 10, icon: '◆' },
  scrap: { label: 'Scrap Heap', radius: 6, icon: '●' },
  crates: { label: 'Supply Cache', radius: 4.5, icon: '■' },
  camp: { label: 'Abandoned Camp', radius: 6.5, icon: '▴' },
  wreck: { label: 'Plane Wreck', radius: 13, icon: '✈' },
};

// ---------------------------------------------------------------- specs

const specCache = new Map();

function footprint(x, z, r) {
  let lo = Infinity, hi = -Infinity, sum = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i === 8 ? 0 : r;
    const h = terrainHeight(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
    sum += h;
  }
  return { lo, hi, avg: sum / 9 };
}

export function poiSpec(cx, cz) {
  const key = `${cx},${cz}`;
  if (specCache.has(key)) return specCache.get(key);
  let spec = null;
  const R = TEMPLE_REGION;
  const rx = Math.floor(cx / R), rz = Math.floor(cz / R);
  const tr = chunkRng(rx, rz, 909);
  const tcx = rx * R + 1 + Math.floor(tr() * (R - 2));
  const tcz = rz * R + 1 + Math.floor(tr() * (R - 2));
  const hasTemple = tr() < 0.9;
  const rand = chunkRng(cx, cz, 707);
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const tryPlace = (type, margin, minH, maxDiff, fr) => {
    for (let i = 0; i < 10; i++) {
      const x = x0 + margin + rand() * (CHUNK_SIZE - margin * 2);
      const z = z0 + margin + rand() * (CHUNK_SIZE - margin * 2);
      const f = footprint(x, z, fr);
      if (f.lo < minH || f.hi - f.lo > maxDiff) continue;
      return { type, key, x, z, y: f.lo + (f.hi - f.lo) * 0.3, rot: rand() * TAU, seed: (rand() * 1e9) | 0, radius: POI_INFO[type].radius };
    }
    return null;
  };
  if (hasTemple && cx === tcx && cz === tcz) {
    spec = tryPlace('temple', 20, 1.2, 6, 14);
  } else {
    const roll = rand();
    const type = roll < 0.11 ? 'scrap' : roll < 0.17 ? 'crates' : roll < 0.24 ? 'ruins' : roll < 0.285 ? 'camp' : roll < 0.305 ? 'wreck' : null;
    if (type) spec = tryPlace(type, 12, 0.8, type === 'wreck' ? 2.5 : 1.6, POI_INFO[type].radius * 0.6);
  }
  if (spec) spec.y = Math.max(spec.y, 0.2);
  specCache.set(key, spec);
  return spec;
}

export function poisAround(cx, cz, r = 1) {
  const out = [];
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const s = poiSpec(cx + dx, cz + dz);
    if (s) out.push(s);
  }
  return out;
}

// --------------------------------------------------------------- kit

let KIT = null;
function kit(flora) {
  if (KIT) return KIT;
  const moss = flora.textures.moss, flat = flora.textures.mossFlat;
  // generated surfaces (TextureLib): albedo + packed normal maps
  const lib = flora.lib.surface;
  const stone = new THREE.MeshStandardMaterial({ map: lib.stone.map, normalMap: lib.stone.nmap, roughness: 0.9, envMapIntensity: 0.5 });
  addRelief(stone, 0.04);
  addPackedNormal(stone);
  addMoss(stone, moss, { amount: 0.6, scale: 0.25, flat });
  addNightFill(stone, 0.45);
  const rubble = new THREE.MeshStandardMaterial({ map: lib.rock.map, normalMap: lib.rock.nmap, roughness: 0.88, envMapIntensity: 0.5 });
  addRelief(rubble, 0.045);
  addPackedNormal(rubble);
  addMoss(rubble, moss, { amount: 0.55, flat });
  addNightFill(rubble, 0.5);
  // dressed limestone for the temple: every block carries its own tint in vertex colours
  const block = new THREE.MeshStandardMaterial({ map: lib.block.map, normalMap: lib.block.nmap, vertexColors: true, roughness: 0.9, envMapIntensity: 0.5 });
  addRelief(block, 0.02);
  addPackedNormal(block);
  addMoss(block, moss, { amount: 0.2, scale: 0.9, low: 0.8, flat });
  addNightFill(block, 0.45);
  const rust = new THREE.MeshStandardMaterial({ map: T.rustTexture(71), roughness: 0.8, metalness: 0.35 });
  const aircraftTex = T.aircraftTexture(73);
  aircraftTex.repeat.set(2, 3);
  const aircraft = new THREE.MeshStandardMaterial({ map: aircraftTex, roughness: 0.65, metalness: 0.4, side: THREE.DoubleSide });
  addMoss(aircraft, moss, { amount: 0.02, scale: 0.4 });
  KIT = {
    stone, rubble, block, rust, aircraft,
    plank: new THREE.MeshStandardMaterial({ map: T.plankTexture(81), roughness: 0.9 }),
    plankStencil: new THREE.MeshStandardMaterial({ map: T.plankTexture(83, { stencil: true }), roughness: 0.9 }),
    cloth: new THREE.MeshStandardMaterial({ map: T.clothTexture(85), roughness: 1, side: THREE.DoubleSide }),
    clothGreen: new THREE.MeshStandardMaterial({ map: T.clothTexture(87, 85), roughness: 1 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.95 }),
    charred: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 }),
    bark: addPackedNormal(new THREE.MeshStandardMaterial({ map: lib.bark.map, normalMap: lib.bark.nmap, roughness: 0.95, color: 0xd8ccb8 })),
    ember: new THREE.MeshStandardMaterial({ color: 0x3a1000, emissive: 0xff5a10, emissiveIntensity: 1.5 }),
    lanternGlow: new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffb040, emissiveIntensity: 2.2 }),
    darkGlass: new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.1, metalness: 0.6 }),
    vine: new THREE.MeshStandardMaterial({ color: 0x3e5a24, roughness: 0.8 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.5, metalness: 0.8 }),
    flame: new THREE.SpriteMaterial({ map: T.glowTexture(), color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  };
  return KIT;
}

// ------------------------------------------------------------- helpers

// opaque kit parts cast with their own depth material, not three's shared one (see World.js)
const KIT_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });

class Builder {
  constructor(spec, flora) {
    this.spec = spec;
    this.k = kit(flora);
    this.r = mulberry32(spec.seed);
    this.group = new THREE.Group();
    this.group.position.set(spec.x, spec.y, spec.z);
    this.group.rotation.y = spec.rot;
    this.colliders = [];
    this.interactables = [];
    this.animated = [];
    this.c = Math.cos(spec.rot);
    this.s = Math.sin(spec.rot);
    this.mergeBins = new Map();
  }
  // local (x, z) -> world
  w(lx, lz) {
    return { x: this.spec.x + lx * this.c + lz * this.s, z: this.spec.z - lx * this.s + lz * this.c };
  }
  add(geo, mat, p = [0, 0, 0], r = [0, 0, 0], { shadow = true, parent = this.group } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    m.rotation.set(...r);
    m.castShadow = shadow;
    m.receiveShadow = true;
    if (!mat.alphaTest && !mat.alphaToCoverage) m.customDepthMaterial = KIT_DEPTH;
    parent.add(m);
    return m;
  }
  // Static parts with the same material get merged into one draw call.
  bin(geo, mat, p = [0, 0, 0], r = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    if (!this.mergeBins.has(mat)) this.mergeBins.set(mat, []);
    this.mergeBins.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
  }
  flush() {
    for (const [mat, list] of this.mergeBins) {
      const keep = ['position', 'normal', 'uv'];
      if (list.every((g) => g.attributes.color)) keep.push('color');
      for (const g of list) for (const a of Object.keys(g.attributes)) if (!keep.includes(a)) g.deleteAttribute(a);
      const geo = mergeGeometries(list, false);
      this.add(geo, mat);
    }
    this.mergeBins.clear();
  }
  boxCol(lx, lz, hx, hz, top, rot = 0, bottom = -10) {
    const p = this.w(lx, lz);
    this.colliders.push({ type: 'box', x: p.x, z: p.z, hx, hz, rot: this.spec.rot + rot, top: this.spec.y + top, bottom: this.spec.y + bottom });
  }
  circleCol(lx, lz, r, top = Infinity) {
    const p = this.w(lx, lz);
    this.colliders.push({ type: 'circle', x: p.x, z: p.z, r, top: this.spec.y + top });
  }
  interact(o) {
    const p = this.w(o.lx, o.lz);
    const it = { ...o, x: p.x, z: p.z, y: this.spec.y + (o.ly || 0.5), id: `${this.spec.key}:${this.interactables.length}`, done: false };
    this.interactables.push(it);
    return it;
  }
  flame(p, size = 1.2, parent = this.group) {
    const s = new THREE.Sprite(this.k.flame);
    s.position.set(...p);
    s.scale.setScalar(size);
    s.renderOrder = 5;
    parent.add(s);
    this.animated.push({ kind: 'flame', obj: s, base: size, phase: this.r() * 10 });
    return s;
  }
  result() {
    this.flush();
    return { group: this.group, colliders: this.colliders, interactables: this.interactables, animated: this.animated };
  }
}

// ------------------------------------------------------------ builders

function* buildTemple(b) {
  const { k, r } = b;
  const tiers = 4, tierH = 2.6, base = 13;
  const front = 20, topEdge = base - (tiers - 1) * 2;
  // one dressed stone: its own patch of the limestone, its own tint, darker near the ground
  const blocks = new BlockBatch();
  const foot = (y) => 0.6 + 0.4 * Math.min(1, Math.max(0, (y + 0.6) / 2.4));
  const stone = (w, h, d, p, rot = [0, 0, 0], { c = 0.07, tone = range(r, 0.62, 1.08) } = {}) => {
    const warm = range(r, -0.04, 0.05);
    blocks.add(w, h, d, c, p, rot, 1.6, [r(), r()], [tone * (1 + warm), tone, tone * (1 - warm * 1.5)], foot);
  };
  const jit = (a) => range(r, -a, a);
  // Courses of blocks on the four faces of a square terrace wall. The corners interlock: on
  // even courses the z faces run over them, on odd courses the x faces.
  const DEPTH = 0.55;
  const courses = (half, y0, y1, rows) => {
    const rh = (y1 - y0) / rows;
    for (let row = 0; row < rows; row++) {
      for (let side = 0; side < 4; side++) {
        const zFace = side < 2, sgn = side % 2 === 0 ? 1 : -1;
        const owns = (row % 2 === 0) === zFace;
        const L0 = owns ? -half : -half + DEPTH, L1 = owns ? half : half - DEPTH;
        for (let u = L0; u < L1 - 0.05;) {
          let len = range(r, 0.8, 1.7);
          if (L1 - (u + len) < 0.5) len = L1 - u;
          const cu = u + len / 2, cn = half - DEPTH / 2 + range(r, -0.03, 0.05);
          stone(zFace ? len - 0.06 : DEPTH, rh - 0.05, zFace ? DEPTH : len - 0.06,
            [zFace ? cu : sgn * cn, y0 + rh * (row + 0.5) + jit(0.01), zFace ? sgn * cn : cu], [jit(0.012), jit(0.02), jit(0.012)]);
          u += len;
        }
      }
    }
  };
  for (let i = 0; i < tiers; i++) {
    const half = base - i * 2;
    const top = (i + 1) * tierH;
    const bottom = i === 0 ? -6 : i * tierH - 0.2;
    // the core, set well back behind the facing so the joints between blocks are deep and dark
    stone(half * 2 - 0.8, top - 0.14 - bottom, half * 2 - 0.8, [0, (top - 0.14 + bottom) / 2, 0], [0, 0, 0], { c: 0.02, tone: 0.55 });
    courses(half, i === 0 ? -2.4 : i * tierH, top - 0.4, i === 0 ? 5 : 3);
    // the terrace floor paved in slabs (only the ring the next terrace leaves uncovered)
    const inner = i < tiers - 1 ? half - 2 - 0.6 : -1, edge = half - 0.55;
    for (let z = -edge; z < edge - 0.05;) {
      const rd = Math.min(range(r, 0.9, 1.4), edge - z);
      for (let x = -edge; x < edge - 0.05;) {
        const sl = Math.min(range(r, 0.8, 1.6), edge - x);
        const cx = x + sl / 2, cz = z + rd / 2;
        x += sl;
        if (Math.abs(cx) < inner && Math.abs(cz) < inner) continue;
        stone(sl - 0.04, 0.14, rd - 0.04, [cx, top - 0.07 + jit(0.012), cz], [jit(0.008), jit(0.015), jit(0.008)], { c: 0.03 });
      }
      z += rd;
    }
    // cap stones overhanging the course below; a few slipped, a few gone
    for (let side = 0; side < 4; side++) {
      const zFace = side < 2, sgn = side % 2 === 0 ? 1 : -1;
      const ext = half + (zFace ? 0.35 : -0.55);
      for (let u = -ext; u < ext - 0.05;) {
        let len = range(r, 1.1, 2.0);
        if (ext - (u + len) < 0.6) len = ext - u;
        const cu = u + len / 2;
        u += len;
        if (side === 0 && Math.abs(cu) < 3.6) continue; // the stairway
        const roll = r();
        if (roll < 0.05) continue;
        const slip = roll < 0.15 ? range(r, 0.08, 0.25) : 0, tilt = roll < 0.15 ? range(r, 0.04, 0.1) : jit(0.012);
        const cn = half + 0.35 - 0.45 + slip;
        stone(zFace ? len - 0.03 : 0.9, 0.4, zFace ? 0.9 : len - 0.03,
          [zFace ? cu : sgn * cn, top - 0.2 - slip * 0.3, zFace ? sgn * cn : cu],
          zFace ? [tilt * sgn, jit(0.03), 0] : [0, jit(0.03), -tilt * sgn]);
      }
    }
    b.boxCol(0, 0, half + 0.35, half + 0.35, top);
    yield;
  }
  // grand stairway up the +z face: each step two or three blocks wide. Negative steps run
  // down past the base so the stairs always meet the ground, even where it dips in front.
  const rise = 0.4, n = Math.round((tiers * tierH) / rise);
  const run = (front - topEdge) / n;
  for (let s = -6; s < n; s++) {
    const zf = front - s * run;
    const st = (s + 1) * rise;
    stone(5, Math.max(0.2, st - rise - 0.3 + 6), run, [0, (st - rise - 0.3 - 6) / 2, zf - run / 2], [0, 0, 0], { c: 0.02, tone: 0.8 });
    const nb = r() < 0.5 ? 2 : 3;
    let x = -2.5;
    for (let j = 0; j < nb; j++) {
      const wdt = j === nb - 1 ? 2.5 - x : (5 / nb) * range(r, 0.8, 1.2);
      stone(wdt - 0.03, rise + 0.3, run + 0.04, [x + wdt / 2, st - (rise + 0.3) / 2 + jit(0.015), zf - run / 2], [jit(0.01), jit(0.015), jit(0.01)]);
      x += wdt;
    }
    b.boxCol(0, zf / 2, 2.5, zf / 2, st);
  }
  yield;
  // balustrades, in sections, with serpent heads guarding the foot
  const len = Math.hypot(front - topEdge, tiers * tierH);
  const ang = Math.atan2(tiers * tierH, front - topEdge);
  for (const sx of [-3, 3]) {
    const nseg = 7;
    for (let j = 0; j < nseg; j++) {
      const t = (j + 0.5) / nseg;
      stone(1, 1, len / nseg - 0.04, [sx, 0.3 + tiers * tierH * t, front - (front - topEdge) * t], [ang, 0, 0]);
    }
    stone(1.4, 1.2, 1.8, [sx, 0.6, front + 0.6], [0, 0, 0], { c: 0.12 });
    stone(1.5, 0.4, 1.0, [sx, 1.35, front + 1.1], [0, 0, 0], { c: 0.08 });
    // eyes: dark stones set into the head
    stone(0.3, 0.26, 0.1, [sx - 0.4, 1.0, front + 1.47], [0, 0, 0], { c: 0.03, tone: 0.3 });
    stone(0.3, 0.26, 0.1, [sx + 0.4, 1.0, front + 1.47], [0, 0, 0], { c: 0.03, tone: 0.3 });
    b.boxCol(sx, front + 0.8, 0.8, 1.2, 1.6);
  }
  // shrine on the summit: a cella of coursed walls with a lintelled doorway in the front, two
  // drum pillars making a porch, a corbelled roof stepping in course by course, and a pierced
  // roof comb on top
  const Y = tiers * tierH;
  // a run of blocks from u0 to u1 along x (zFace) or z, its face centred on n, course height h;
  // a dark core inside the run fills the joints (the walls are one block thick: the sky showed
  // through them), unless the run is meant to be pierced
  const lay = (zFace, n, u0, u1, y, h, d = DEPTH, gaps = 0) => {
    if (!gaps && u1 - u0 > 0.2) {
      const L = u1 - u0 - 0.12, m = (u0 + u1) / 2;
      stone(zFace ? L : d - 0.22, h, zFace ? d - 0.22 : L, [zFace ? m : n, y, zFace ? n : m], [0, 0, 0], { c: 0.01, tone: 0.4 });
    }
    for (let u = u0; u < u1 - 0.05;) {
      let len = range(r, 0.8, 1.5);
      if (u1 - (u + len) < 0.45) len = u1 - u;
      const cu = u + len / 2;
      u += len;
      if (gaps && r() < gaps) continue;
      stone(zFace ? len - 0.04 : d, h - 0.04, zFace ? d : len - 0.04,
        [zFace ? cu : n + jit(0.02), y + jit(0.01), zFace ? n + jit(0.02) : cu], [jit(0.01), jit(0.015), jit(0.01)]);
    }
  };
  const SH = 3.6, WALL = 3.4, rows = 4, ch = WALL / rows, door = 1.5;
  for (let row = 0; row < rows; row++) {
    const y = Y + ch * (row + 0.5);
    // corners interlock: the faces along x own them on even courses, the faces along z on odd
    const ownX = row % 2 === 0;
    const xa = ownX ? -SH : -SH + DEPTH, xb = ownX ? SH : SH - DEPTH;
    const za = ownX ? -SH + DEPTH : -SH, zb = ownX ? SH - DEPTH : SH;
    lay(true, -SH + DEPTH / 2, xa, xb, y, ch);
    // the front, either side of the doorway; the top course carries a lintel across it
    if (row < rows - 1) {
      lay(true, SH - DEPTH / 2, xa, -door, y, ch);
      lay(true, SH - DEPTH / 2, door, xb, y, ch);
    } else {
      lay(true, SH - DEPTH / 2, xa, -door - 0.5, y, ch);
      lay(true, SH - DEPTH / 2, door + 0.5, xb, y, ch);
      stone(door * 2 + 1.0, ch - 0.02, DEPTH + 0.1, [0, y, SH - DEPTH / 2], [0, 0, 0], { c: 0.05, tone: 0.85 });
    }
    lay(false, -SH + DEPTH / 2, za, zb, y, ch);
    lay(false, SH - DEPTH / 2, za, zb, y, ch);
  }
  // the corbelled roof: each course set in from the one below until a row of capstones closes it
  let half = SH + 0.25;
  for (let k = 0; k < 5; k++) {
    const y = Y + WALL + 0.25 + k * 0.5;
    const ownX = k % 2 === 0;
    const d = DEPTH + 0.15;
    lay(true, -half + d / 2, ownX ? -half : -half + d, ownX ? half : half - d, y, 0.5, d);
    lay(true, half - d / 2, ownX ? -half : -half + d, ownX ? half : half - d, y, 0.5, d);
    lay(false, -half + d / 2, ownX ? -half + d : -half, ownX ? half - d : half, y, 0.5, d);
    lay(false, half - d / 2, ownX ? -half + d : -half, ownX ? half - d : half, y, 0.5, d);
    half -= 0.55;
  }
  for (let x = -half; x < half - 0.05;) {
    const w = Math.min(range(r, 0.9, 1.4), half - x);
    stone(w - 0.04, 0.45, half * 2 + 0.2, [x + w / 2, Y + WALL + 0.25 + 5 * 0.5 - 0.02, 0], [jit(0.01), 0, jit(0.01)], { c: 0.05 });
    x += w;
  }
  // the roof comb: a thin wall along the ridge, pierced where blocks have fallen or were left out
  for (let k = 0; k < 3; k++) lay(true, 0, -2.2 + k * 0.3, 2.2 - k * 0.3, Y + WALL + 3.0 + k * 0.55, 0.55, 0.45, k ? 0.3 : 0.12);
  // the porch: two drum pillars before the doorway, each three drums under a square abacus
  for (const px of [-2.3, 2.3]) {
    const pz = SH + 1.0;
    for (let d = 0; d < 3; d++) {
      const dh = WALL / 3 - 0.03;
      stone(0.8, dh, 0.8, [px + jit(0.03), Y + dh / 2 + (d * WALL) / 3, pz + jit(0.03)], [0, jit(0.1), 0], { c: 0.12 });
    }
    stone(1.1, 0.3, 1.1, [px, Y + WALL + 0.12, pz], [0, jit(0.05), 0], { c: 0.05 });
    b.circleCol(px, pz, 0.55);
  }
  // walls as colliders: the back, the two sides, and the front either side of the doorway
  b.boxCol(0, -SH + DEPTH / 2, SH, DEPTH / 2, Y + WALL);
  b.boxCol(-SH + DEPTH / 2, 0, DEPTH / 2, SH, Y + WALL);
  b.boxCol(SH - DEPTH / 2, 0, DEPTH / 2, SH, Y + WALL);
  b.boxCol(-(SH + door) / 2, SH - DEPTH / 2, (SH - door) / 2, DEPTH / 2, Y + WALL);
  b.boxCol((SH + door) / 2, SH - DEPTH / 2, (SH - door) / 2, DEPTH / 2, Y + WALL);
  stone(1.6, 1.0, 1.1, [0, Y + 0.5, -1.2], [0, 0, 0], { c: 0.06 });
  b.boxCol(0, -1.2, 0.85, 0.6, Y + 1.0);
  yield;
  // fallen blocks: a skirt of rubble round the foot, and a few lying askew on the terraces
  for (let q = 0; q < 34; q++) {
    const side = irange(r, 0, 3), out = range(r, 0.4, 4.5), along = range(r, -base, base);
    const zFace = side < 2, sgn = side % 2 === 0 ? 1 : -1;
    const lx = zFace ? along : sgn * (base + out), lz = zFace ? sgn * (base + out) : along;
    if (side === 0 && Math.abs(lx) < 4.2) continue;
    const wp = b.w(lx, lz);
    const gy = terrainHeight(wp.x, wp.z) - b.spec.y;
    const h = range(r, 0.45, 0.8);
    stone(range(r, 0.7, 1.5), h, range(r, 0.5, 0.8), [lx, gy + h * 0.25, lz], [jit(0.35), r() * TAU, jit(0.35)]);
  }
  for (let q = 0; q < 8; q++) {
    const i = irange(r, 0, tiers - 2), half = base - i * 2;
    const side = irange(r, 1, 3), along = range(r, -half + 1, half - 1);
    const zFace = side < 2, sgn = side % 2 === 0 ? 1 : -1, d = half - range(r, 0.9, 1.5);
    stone(range(r, 0.7, 1.3), 0.45, range(r, 0.5, 0.8), [zFace ? along : sgn * d, (i + 1) * tierH + 0.2, zFace ? sgn * d : along], [jit(0.15), r() * TAU, jit(0.15)]);
  }
  yield;
  b.add(blocks.geometry(), k.block);
  const idol = getItemModel('golden_idol');
  idol.scale.multiplyScalar(2.2);
  idol.position.set(0, Y + 1.5, -1.2);
  idol.traverse((o) => { o.userData.shared = true; });
  b.group.add(idol);
  b.interact({ kind: 'search', label: 'Take the Golden Idol', lx: 0, lz: -1.2, ly: Y + 1.3, r: 2.6, loot: 'temple', time: 2.2, hide: [idol] });
  // braziers
  for (const [px, pz] of [[-2.4, topEdge + 0.3], [2.4, topEdge + 0.3]]) {
    b.bin(new THREE.CylinderGeometry(0.5, 0.3, 0.5, 10), k.bronze, [px, Y + 1.0, pz]);
    b.bin(new THREE.CylinderGeometry(0.12, 0.15, 0.8, 8), k.bronze, [px, Y + 0.4, pz]);
    b.flame([px, Y + 1.55, pz], 1.6);
    b.flame([px, Y + 1.4, pz], 0.9);
  }
  // treasure chests on the lower terraces
  for (const [px, ty, pz] of [[-12, 1, 6], [10, 2, -6]]) {
    const y = ty * tierH;
    const chest = new THREE.Group();
    chest.position.set(px, y, pz);
    b.add(worldBox(1.0, 0.55, 0.65, 1), k.plank, [0, 0.28, 0], [0, 0, 0], { parent: chest });
    b.add(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 10, 1, false, 0, Math.PI), k.plank, [0, 0.55, 0], [0, 0, Math.PI / 2], { parent: chest });
    b.add(worldBox(1.04, 0.08, 0.69, 1), k.bronze, [0, 0.5, 0], [0, 0, 0], { parent: chest });
    b.group.add(chest);
    b.interact({ kind: 'break', label: 'Smash chest', lx: px, lz: pz, ly: y + 0.5, r: 1.6, loot: 'templeChest', hp: 2, hide: [chest], debris: 0x6a4a2a });
  }
  // vines draping down the terraces
  for (let v = 0; v < 22; v++) {
    const i = irange(r, 0, tiers - 1);
    const half = base - i * 2 + 0.35;
    const side = irange(r, 0, 3);
    const along = range(r, -half, half);
    const top = (i + 1) * tierH;
    const len = range(r, 1.5, top + 1);
    const pos = [[along, half], [along, -half], [half, along], [-half, along]][side];
    if (side === 0 && Math.abs(along) < 3.5) continue;
    const nrm = [[0, 1], [0, -1], [1, 0], [-1, 0]][side];
    const tan = [nrm[1], -nrm[0]];
    // a hanging vine: sags away from the wall, wanders sideways, thins toward the tip
    const pts = [];
    const sway = range(r, -0.8, 0.8), ph = r() * TAU;
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      const off = 0.06 + Math.sin(t * Math.PI) * 0.25;
      const lat = sway * t + Math.sin(t * 5 + ph) * 0.15;
      pts.push(new THREE.Vector3(pos[0] + nrm[0] * off + tan[0] * lat, top + 0.2 - len * t, pos[1] + nrm[1] * off + tan[1] * lat));
    }
    const rad = range(r, 0.03, 0.07);
    b.bin(taperedTube(pts, (t) => rad * (1 - 0.6 * t), 14, 5, 1, 1), k.vine);
  }
  // strangler roots: draped over every tread and riser below where they start,
  // then splitting into several roots that spread across the ground
  for (let q = 0; q < 3; q++) {
    const side = irange(r, 1, 3);
    const nrm = [[0, 1], [0, -1], [1, 0], [-1, 0]][side];
    const tan = [nrm[1], -nrm[0]];
    const along = range(r, -9, 9), i0 = irange(r, 1, 2);
    const drift = range(r, -0.25, 0.25);
    let lat = 0;
    const at = (d, y) => new THREE.Vector3(nrm[0] * d + tan[0] * (along + lat), y, nrm[1] * d + tan[1] * (along + lat));
    const pts = [];
    for (let j = i0; j >= 0; j--) {
      const half = base - j * 2, top = (j + 1) * tierH;
      pts.push(at(half - 0.9, top + 0.14));          // lying along the tread
      pts.push(at(half + 0.47, top + 0.06));         // over the lip of the cap stone
      lat += drift;
      pts.push(at(half + 0.47, top - tierH * 0.55)); // hugging the riser
    }
    pts.push(at(base + 0.9, 0.12));
    const rad = range(r, 0.22, 0.32);
    b.bin(taperedTube(pts, (t) => rad * (1 - 0.35 * t), pts.length * 6, 10, 2, 8), k.bark);
    // feeder roots fanning out over the ground
    const foot = pts[pts.length - 1];
    const nb = irange(r, 2, 3);
    for (let m = 0; m < nb; m++) {
      const fan = (m - (nb - 1) / 2) * 1.2 + range(r, -0.3, 0.3);
      const dx = nrm[0] + tan[0] * fan, dz = nrm[1] + tan[1] * fan;
      const L = range(r, 2.5, 4.5), dl = Math.hypot(dx, dz);
      const P = (t, y) => new THREE.Vector3(foot.x + (dx / dl) * L * t, y, foot.z + (dz / dl) * L * t);
      b.bin(taperedTube([foot.clone(), P(0.35, 0.05), P(0.7, -0.02), P(1, -0.2)], (t) => rad * 0.65 * (1 - 0.8 * t), 10, 8, 1, 2), k.bark);
    }
  }
}

function buildRuins(b) {
  const { k, r } = b;
  const walls = irange(r, 2, 4);
  for (let w = 0; w < walls; w++) {
    const L = range(r, 3.5, 7), H = range(r, 1.2, 3.2);
    const a = (w / walls) * TAU + range(r, -0.4, 0.4);
    const d = range(r, 3, 6.5);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, rot = a + Math.PI / 2;
    const wall = new THREE.Group();
    wall.position.set(cx, 0, cz);
    wall.rotation.y = rot;
    const parts = [];
    for (let y = 0; y < H; y += 0.8) {
      let x = -L / 2 + (y % 1.6 ? 0.5 : 0);
      while (x < L / 2) {
        const bw = range(r, 0.9, 1.5);
        const ragged = y + 0.8 >= H && r() < 0.45;
        if (!ragged) {
          const g = worldBox(Math.min(bw, L / 2 - x) - 0.06, 0.74, range(r, 0.8, 0.95), 1.5);
          g.translate(x + bw / 2, y + 0.37 - 0.3, range(r, -0.05, 0.05));
          g.rotateY(range(r, -0.03, 0.03));
          parts.push(g.toNonIndexed());
        }
        x += bw;
      }
    }
    for (const g of parts) for (const at of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(at)) g.deleteAttribute(at);
    b.add(mergeGeometries(parts), k.stone, [0, 0, 0], [0, 0, 0], { parent: wall });
    b.group.add(wall);
    // collider in world space
    const p = b.w(cx, cz);
    b.colliders.push({ type: 'box', x: p.x, z: p.z, hx: L / 2 + 0.1, hz: 0.5, rot: b.spec.rot + rot, top: b.spec.y + H, bottom: b.spec.y - 5 });
  }
  // pillars (some toppled)
  const np = irange(r, 2, 4);
  for (let i = 0; i < np; i++) {
    const a = r() * TAU, d = range(r, 1.5, 7);
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    if (r() < 0.6) {
      const h = range(r, 1.5, 4);
      b.bin(new THREE.CylinderGeometry(0.42, 0.48, h, 12), k.stone, [px, h / 2 - 0.2, pz]);
      b.bin(worldBox(1.2, 0.35, 1.2, 1.5), k.stone, [px, 0.0, pz]);
      if (h > 3) b.bin(worldBox(1.1, 0.3, 1.1, 1.5), k.stone, [px, h - 0.1, pz]);
      b.circleCol(px, pz, 0.6, h);
    } else {
      const h = range(r, 2, 3.5);
      const ry = r() * TAU;
      b.bin(new THREE.CylinderGeometry(0.42, 0.42, h, 12), k.stone, [px, 0.3, pz], [Math.PI / 2, ry, 0]);
      for (let s = -h / 2 + 0.4; s < h / 2; s += 0.8) {
        const q = { x: px + Math.sin(ry) * s, z: pz + Math.cos(ry) * s };
        b.circleCol(q.x, q.z, 0.45, 0.75);
      }
    }
  }
  // the colossal head
  if (r() < 0.7) {
    const hx = range(r, -2, 2), hz = range(r, -2, 2), ry = r() * TAU;
    const head = new THREE.Group();
    head.position.set(hx, 0, hz);
    head.rotation.y = ry;
    const B = (w, h, d, p, mat = k.rubble) => b.add(worldBox(w, h, d, 1.5), mat, p, [0, 0, 0], { parent: head });
    B(2.0, 2.2, 1.8, [0, 1.0, 0]);
    B(2.2, 0.5, 1.9, [0, 2.2, 0]); // helmet band
    B(0.5, 0.25, 0.2, [-0.45, 1.45, 0.92], k.charred);
    B(0.5, 0.25, 0.2, [0.45, 1.45, 0.92], k.charred);
    B(0.4, 0.6, 0.35, [0, 1.05, 1.0]); // nose
    B(0.9, 0.22, 0.25, [0, 0.55, 0.95]); // lips
    B(0.3, 0.8, 0.5, [-1.1, 1.2, 0]); // ears
    B(0.3, 0.8, 0.5, [1.1, 1.2, 0]);
    b.group.add(head);
    b.circleCol(hx, hz, 1.4, 2.4);
  }
  // urns to smash
  const nu = irange(r, 2, 3);
  const pts = [[0.0, 0], [0.22, 0.02], [0.32, 0.25], [0.3, 0.5], [0.18, 0.7], [0.2, 0.8], [0.0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
  for (let i = 0; i < nu; i++) {
    const a = r() * TAU, d = range(r, 0.5, 2.5);
    const ux = Math.cos(a) * d, uz = Math.sin(a) * d;
    const urn = b.add(new THREE.LatheGeometry(pts, 12), k.rubble, [ux, -0.05, uz]);
    b.interact({ kind: 'break', label: 'Smash urn', lx: ux, lz: uz, ly: 0.4, r: 1.0, loot: 'ruin', hp: 1, hide: [urn], debris: 0x8a7a60 });
  }
}

function buildScrap(b) {
  const { k, r } = b;
  const mound = b.add(new THREE.SphereGeometry(1, 14, 8), k.rust, [0, -0.25, 0]);
  mound.scale.set(2.3, 0.75, 2.0);
  for (let i = 0; i < irange(r, 7, 10); i++) {
    const a = r() * TAU, d = range(r, 0.3, 2.0);
    b.bin(worldBox(range(r, 0.8, 1.6), 0.04, range(r, 0.6, 1.1), 1.5), k.rust,
      [Math.cos(a) * d, range(r, 0.2, 0.7), Math.sin(a) * d], [range(r, -0.7, 0.7), r() * TAU, range(r, -0.7, 0.7)]);
  }
  for (let i = 0; i < irange(r, 2, 3); i++) {
    const a = r() * TAU, d = range(r, 1.2, 2.6);
    const tipped = r() < 0.5;
    const p = [Math.cos(a) * d, tipped ? 0.3 : 0.45, Math.sin(a) * d];
    const rot = tipped ? [Math.PI / 2, 0, r() * TAU] : [0, 0, 0];
    b.bin(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), k.rust, p, rot);
  }
  for (let i = 0; i < irange(r, 2, 4); i++) {
    const a = r() * TAU, d = range(r, 1.0, 2.6);
    b.bin(new THREE.TorusGeometry(0.34, 0.13, 8, 16), k.rubber, [Math.cos(a) * d, range(r, 0.15, 0.5), Math.sin(a) * d], [Math.PI / 2 + range(r, -0.5, 0.5), 0, r()]);
  }
  for (let i = 0; i < 2; i++) {
    const a = r() * TAU;
    b.bin(new THREE.CylinderGeometry(0.08, 0.08, range(r, 1.8, 2.6), 8), k.rust, [Math.cos(a), 0.5, Math.sin(a)], [range(r, 0.8, 1.4), r() * TAU, 0]);
  }
  b.circleCol(0, 0, 1.9);
  b.interact({ kind: 'search', label: 'Search scrap heap', lx: 0, lz: 0, ly: 0.8, r: 3.0, loot: 'scrap', time: 1.6 });
}

function buildCrates(b) {
  const { k, r } = b;
  const n = irange(r, 2, 4);
  for (let i = 0; i < n; i++) {
    const s = range(r, 0.85, 1.1);
    const stacked = i === n - 1 && n > 2 && r() < 0.6;
    const px = stacked ? 0 : (i - (n - 1) / 2) * 1.35 + range(r, -0.2, 0.2);
    const pz = stacked ? 0 : range(r, -0.4, 0.4);
    const y = stacked ? 1.0 : 0;
    const mat = r() < 0.4 ? k.plankStencil : k.plank;
    const crate = b.add(new THREE.BoxGeometry(s, s, s), mat, [px, y + s / 2 - 0.05, pz], [0, range(r, -0.4, 0.4), 0]);
    const p = b.w(px, pz);
    const col = { type: 'box', x: p.x, z: p.z, hx: s / 2, hz: s / 2, rot: b.spec.rot + crate.rotation.y, top: b.spec.y + y + s - 0.05, bottom: b.spec.y - 2 };
    if (!stacked) b.colliders.push(col);
    b.interact({ kind: 'break', label: 'Smash crate', lx: px, lz: pz, ly: y + s / 2, r: s * 0.9, loot: 'crate', hp: 3, hide: [crate], collider: stacked ? null : col, debris: 0x8a6a40 });
  }
}

function buildCamp(b) {
  const { k, r } = b;
  // A-frame tent
  const L = 2.8, W = 2.3, H = 1.75;
  const tent = new THREE.BufferGeometry();
  const v = [
    -W / 2, 0, -L / 2, 0, H, -L / 2, 0, H, L / 2, -W / 2, 0, -L / 2, 0, H, L / 2, -W / 2, 0, L / 2,
    W / 2, 0, -L / 2, 0, H, L / 2, 0, H, -L / 2, W / 2, 0, -L / 2, W / 2, 0, L / 2, 0, H, L / 2,
    -W / 2, 0, -L / 2, W / 2, 0, -L / 2, 0, H, -L / 2,
  ];
  tent.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = [];
  for (let i = 0; i < v.length; i += 3) uv.push(v[i + 2] * 0.6 + v[i] * 0.3, v[i + 1] * 0.6);
  tent.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tent.computeVertexNormals();
  b.add(tent, k.cloth, [-2.2, 0, 0], [0, 0.3, 0]);
  b.bin(new THREE.CylinderGeometry(0.03, 0.03, L + 0.5, 6), k.bark, [-2.2, H, 0], [Math.PI / 2, 0, -0.3]);
  for (const e of [-1, 1]) b.bin(new THREE.CylinderGeometry(0.03, 0.03, H + 0.1, 6), k.bark, [-2.2 + Math.sin(0.3) * e * (L / 2 + 0.2), H / 2, Math.cos(0.3) * e * (L / 2 + 0.2)]);
  b.boxCol(-2.2, 0, 1.2, 1.45, 1.75, 0.3);
  // fire pit
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const g = new THREE.DodecahedronGeometry(range(r, 0.13, 0.2), 0);
    b.bin(g, k.rubble, [1.5 + Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55], [r(), r(), r()]);
  }
  for (let i = 0; i < 3; i++) b.bin(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), k.charred, [1.5, 0.12, 0], [Math.PI / 2, (i / 3) * Math.PI, 0.15]);
  b.add(new THREE.SphereGeometry(0.22, 8, 4), k.ember, [1.5, 0.0, 0], [0, 0, 0], { shadow: false }).scale.set(1, 0.35, 1);
  b.flame([1.5, 0.35, 0], 0.9).userData.fire = true; // World lends it the campfire light
  // log seat
  b.bin(new THREE.CylinderGeometry(0.22, 0.24, 1.8, 10), k.bark, [1.6, 0.2, 1.6], [0, 0, Math.PI / 2]);
  b.circleCol(1.6, 1.6, 0.4, 0.45);
  // backpack + lantern
  const pack = new THREE.Group();
  pack.position.set(-0.6, 0, 1.1);
  pack.rotation.y = 0.6;
  b.add(new THREE.BoxGeometry(0.45, 0.55, 0.28), k.clothGreen, [0, 0.27, 0], [0.15, 0, 0], { parent: pack });
  b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 10, 1, false, 0, Math.PI), k.clothGreen, [0, 0.55, 0.0], [0, 0, Math.PI / 2], { parent: pack });
  b.add(new THREE.BoxGeometry(0.3, 0.2, 0.08), k.clothGreen, [0, 0.2, 0.17], [0.1, 0, 0], { parent: pack });
  b.group.add(pack);
  b.interact({ kind: 'search', label: 'Search backpack', lx: -0.6, lz: 1.1, ly: 0.4, r: 1.6, loot: 'camp', time: 1.3 });
  const lan = new THREE.Group();
  lan.position.set(-0.9, 0, -0.9);
  b.add(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), k.bronze, [0, 0.03, 0], [0, 0, 0], { parent: lan });
  b.add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), k.lanternGlow, [0, 0.16, 0], [0, 0, 0], { parent: lan, shadow: false });
  b.add(new THREE.ConeGeometry(0.11, 0.1, 10), k.bronze, [0, 0.31, 0], [0, 0, 0], { parent: lan });
  b.add(new THREE.TorusGeometry(0.06, 0.01, 4, 12, Math.PI), k.bronze, [0, 0.36, 0], [0, 0, 0], { parent: lan });
  b.group.add(lan);
  b.flame([-0.9, 0.18, -0.9], 0.7).material = new THREE.SpriteMaterial({ map: k.flame.map, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.6, transparent: true });
}

function buildWreck(b) {
  const { k, r } = b;
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const y = (i / 16) * 12;
    let rad = 1.3;
    if (y < 2.5) rad = 1.3 * Math.sqrt(y / 2.5) + 0.05;
    if (y > 8) rad = 1.3 - ((y - 8) / 4) * 0.9;
    prof.push(new THREE.Vector2(rad, y));
  }
  const front = new THREE.LatheGeometry(prof.filter((p) => p.y <= 7.6), 18);
  const tail = new THREE.LatheGeometry(prof.filter((p) => p.y >= 7.5), 18);
  // Fuselage runs along local z, nose at +z. Lathe axis y maps to -z.
  b.add(front, k.aircraft, [0, 0.9, 6], [-Math.PI / 2 - 0.06, 0, 0.12]);
  b.add(tail, k.aircraft, [0.6, 0.7, 5.4], [-Math.PI / 2 + 0.04, 0, -0.22]);
  b.bin(worldBox(1.0, 0.35, 0.9, 1), k.darkGlass, [0, 2.0, 4.0], [-0.4, 0, 0]);
  // wings & tail fin
  b.bin(worldBox(7, 0.22, 1.9, 3), k.aircraft, [-4.2, 0.35, 2.8], [0.05, 0.1, 0.12]);
  b.bin(worldBox(3.2, 0.22, 1.7, 3), k.aircraft, [4.5, 0.15, 4.5], [0.1, 0.9, -0.15]);
  b.bin(worldBox(0.2, 2.2, 1.7, 2), k.aircraft, [1.7, 2.0, -5.8], [0.1, 0.22, -0.2]);
  b.bin(worldBox(3.2, 0.18, 1.2, 2), k.aircraft, [1.6, 1.1, -5.9], [0, 0.22, -0.18]);
  // engine + bent propeller
  b.bin(new THREE.CylinderGeometry(0.55, 0.45, 1.8, 14), k.rust, [-3.2, 0.7, 1.6], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.bin(worldBox(0.18, 1.4, 0.05, 1), k.rust, [-3.2 + Math.cos(a) * 0.65, 0.7 + Math.sin(a) * 0.65, 2.6], [0.2, 0.3, a + Math.PI / 2]);
  }
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU, d = range(r, 4, 9);
    b.bin(worldBox(range(r, 0.6, 1.4), 0.05, range(r, 0.4, 1.0), 1.5), k.aircraft, [Math.cos(a) * d, 0.1, Math.sin(a) * d], [range(r, -0.3, 0.3), r() * TAU, range(r, -0.3, 0.3)]);
  }
  b.boxCol(0, 2.2, 1.3, 3.8, 2.4);
  b.boxCol(1.3, -4.5, 1.0, 2.3, 2.0, 0.2);
  b.boxCol(-4.2, 2.8, 3.5, 0.95, 0.75, 0.1);
  b.circleCol(-3.2, 1.6, 0.7, 1.3);
  b.interact({ kind: 'search', label: 'Search cockpit', lx: 0, lz: 4.6, ly: 1.4, r: 2.8, loot: 'wreck', time: 2.0 });
}

const BUILDERS = { temple: buildTemple, ruins: buildRuins, scrap: buildScrap, crates: buildCrates, camp: buildCamp, wreck: buildWreck };

export function buildPOI(spec, flora) {
  const it = buildPOISteps(spec, flora);
  let r;
  while (!(r = it.next()).done);
  return r.value;
}

// The same, a slice at a time for streaming: builders that are generators (the temple) yield
// while they work, and the merge at the end gets a frame of its own.
export function* buildPOISteps(spec, flora) {
  const b = new Builder(spec, flora);
  const steps = BUILDERS[spec.type](b);
  if (steps && typeof steps.next === 'function') yield* steps;
  yield;
  return b.result();
}

// Re-export for vegetation clearance checks.
export { terrainNormal };
