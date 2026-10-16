// The world's shape. Everything here is a pure function of (x, z) so any
// part of the infinite map can be generated on demand, in any order.
import * as THREE from 'three';
import { createNoise2D, fbm, ridged } from '../utils/noise.js';
import { smoothstep, lerp, clamp } from '../utils/math.js';
import { WORLD_SEED } from '../core/Seed.js';

// 4217 for every ordinary vigil; the daily vigil's own (core/Seed.js)
export const SEED = WORLD_SEED;
export const WATER_LEVEL = 0;
export const CHUNK_SIZE = 64;

const nWarpA = createNoise2D(SEED + 1);
const nWarpB = createNoise2D(SEED + 2);
const nCont = createNoise2D(SEED + 3);
const nHills = createNoise2D(SEED + 4);
const nRidge = createNoise2D(SEED + 5);
const nRiver = createNoise2D(SEED + 6);
const nDetail = createNoise2D(SEED + 7);
const nDensity = createNoise2D(SEED + 8);
const nPatch = createNoise2D(SEED + 9);
const nBank = createNoise2D(SEED + 10);
const nSwamp = createNoise2D(SEED + 11);
const TAU = Math.PI * 2;

// Reused output object to avoid allocations in hot loops.
const info = { h: 0, river: 1, mountain: 0, swamp: 0 };

// dry: the world as it would be without the drowned grove (used to decide where it goes)
export function sampleTerrain(x, z, out = info, dry = false) {
  const wx = x + nWarpA(x * 0.0021, z * 0.0021) * 55;
  const wz = z + nWarpB(x * 0.0021, z * 0.0021) * 55;
  const cont = fbm(nCont, wx * 0.0016, wz * 0.0016, 3);
  let h = 6.5 + cont * 10;
  h += fbm(nHills, wx * 0.0075, wz * 0.0075, 4) * 5.5;
  const mMask = smoothstep(0.02, 0.55, cont);
  const rg = ridged(nRidge, wx * 0.0042, wz * 0.0042, 4);
  // flatten the tops of the ridges so peaks read as massifs, not cones
  const rr = rg * rg;
  const ex = rr - 0.3, sm = (ex + Math.sqrt(ex * ex + 0.004)) / 2; // soft max(0, ex)
  h += (rr - sm * 0.7) * 44 * mMask;
  // terraces on the mountains: ledges that catch moss and plants between rock risers
  if (mMask > 0) {
    const tq = h / 3.2, tf = tq - Math.floor(tq);
    h = lerp(h, (Math.floor(tq) + smoothstep(0.3, 0.7, tf)) * 3.2, mMask * 0.45);
    // blocky planes and half-metre steps on the rock faces, so a cliff isn't one smooth plane
    const cliffy = smoothstep(0.25, 0.6, mMask) * smoothstep(0.1, 0.4, rr);
    if (cliffy > 0) {
      const nb2 = nBank(x * 0.09 + 31, z * 0.09 - 17) * 0.5 + 0.5;
      h += cliffy * (Math.floor(nb2 * 4) / 4 - 0.5) * 1.8;
    }
  }
  h += nDetail(x * 0.05, z * 0.05) * 0.45;
  // Rivers: carve along the zero-contour of a low-frequency noise field.
  // Distance to the channel centre in metres (field value / its gradient), so
  // every river gets the same gentle profile however fast the noise changes:
  // banks under ~30° that read as rivers, not canals, and can always be climbed.
  const E = 1.5, k = 0.0012;
  const f0 = fbm(nRiver, wx * k, wz * k, 3);
  const gx = (fbm(nRiver, (wx + E) * k, wz * k, 3) - f0) / E;
  const gz = (fbm(nRiver, wx * k, (wz + E) * k, 3) - f0) / E;
  const dist = Math.abs(f0) / Math.max(Math.hypot(gx, gz), 1e-5);
  // water half-width and bank width wander along the river
  const nb = nBank(x * 0.006, z * 0.006);
  // one side a steeper cut bank, the other a gentle bar, swapping as the noise does
  const w0 = 5 + nb * 2.5, bw = (26 + nb * 8 + Math.max(0, h - 9) * 2) * (1 + Math.sign(f0) * nb * 0.5);
  const bank = smoothstep(w0, w0 + bw, dist);
  const bed = -2.6 + dist * 0.28;
  h = lerp(Math.min(bed, h), h, bank);
  // slumps and hummocks break up the slope
  const mid = bank * (1 - bank) * 4;
  h += (nBank(x * 0.11, z * 0.11) * 0.9 + nDetail(x * 0.3, z * 0.3) * 0.25) * mid;
  // The drowned grove: the ground sinks to the waterline in shallow black pools and
  // hummocks of root and mud
  let swamp = 0;
  if (!dry) {
    const G = grove();
    const d = Math.hypot(x - G.x, z - G.z);
    if (d < G.r * 1.35) {
      const dw = d * (1 + 0.22 * nSwamp(x * 0.008, z * 0.008));
      swamp = 1 - smoothstep(G.r * 0.55, G.r, dw);
      if (swamp > 0) {
        const pool = nSwamp(x * 0.03 + 7, z * 0.03 - 3) * 0.55 + nDetail(x * 0.12, z * 0.12) * 0.25;
        // mostly under a hand's depth of black water, hummocks standing out of it
        const target = WATER_LEVEL - 0.38 + pool * 1.05;
        h = lerp(h, target, smoothstep(0, 1, swamp));
      }
    }
  }
  out.h = h;
  out.river = bank; // 0 in the river channel, 1 well away from it
  out.mountain = mMask * rg;
  out.swamp = swamp; // 0 outside the drowned grove, 1 in its heart
  return out;
}

const dryInfo = { h: 0, river: 1, mountain: 0, swamp: 0 };
const dryHeight = (x, z) => sampleTerrain(x, z, dryInfo, true).h;
const _dn = new THREE.Vector3();
const dryNormal = (x, z) => normalOf(dryHeight, x, z, _dn);

// Where the drowned grove lies: low ground across the river from the Heartwood, far enough
// out that its fringe never reaches the spawn or the base clearing, near enough that its
// shallows (and the rift that opens there on night 4) sit inside the Blight's flow field.
// Found once, from the dry world, so the spawn and the base don't move.
let GROVE = null;
export function grove() {
  if (GROVE) return GROVE;
  const R = 135;
  GROVE = { x: 1e9, z: 1e9, r: R }; // (while searching)
  const sp = findSpawn(dryHeight, dryNormal);
  const base = findBaseSite(sp, dryHeight, dryNormal);
  // Some worlds (the daily vigil's) put the base near the spawn, so every spot at the full
  // margin from the spawn can be ruled out: step the margin down, and at worst take the spot
  // farthest from the spawn, so there is always a grove
  const search = (margin) => {
    let best = null;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      for (const D of [194, 204, 214]) {
        const x = base.x + Math.cos(a) * D, z = base.z + Math.sin(a) * D;
        const fromSpawn = Math.hypot(x - sp.x, z - sp.z);
        if (margin !== null && fromSpawn < margin) continue;
        // mostly low, wet-able ground, not mountain
        let low = 0;
        for (let k = 0; k < 16; k++) {
          const b = (k / 16) * TAU, rr = R * (k % 2 ? 0.3 : 0.6);
          const t = sampleTerrain(x + Math.cos(b) * rr, z + Math.sin(b) * rr, dryInfo, true);
          if (t.h > -0.5 && t.h < 8 && t.mountain < 0.25) low++;
        }
        // across the river from the base scores higher
        let wet = 0;
        for (let k = 1; k < 12; k++) if (dryHeight(base.x + (x - base.x) * (k / 12), base.z + (z - base.z) * (k / 12)) < -0.3) wet = 1;
        const score = margin === null ? fromSpawn : low / 16 + wet * 0.35 - (D - 194) * 0.006;
        if (!best || score > best.score) best = { x, z, score };
      }
    }
    return best;
  };
  const best = search(R + 110) || search(R + 60) || search(R + 20) || search(null);
  GROVE = { x: best.x, z: best.z, r: R };
  return GROVE;
}

export function terrainHeight(x, z) {
  return sampleTerrain(x, z, info).h;
}

function normalOf(height, x, z, out) {
  const e = 0.75;
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

const _n = new THREE.Vector3();
export function terrainNormal(x, z, out = _n) {
  return normalOf(terrainHeight, x, z, out);
}

// 0 = open clearing, 1 = impenetrable jungle.
export function jungleDensity(x, z) {
  return clamp(0.6 + fbm(nDensity, x * 0.0055, z * 0.0055, 3) * 1.0, 0, 1);
}

// Patchiness used for moss vs. litter on the ground.
export function groundPatch(x, z) {
  return fbm(nPatch, x * 0.03, z * 0.03, 3);
}

// Look for a pleasant spawn: dry land, gentle slope, river in view.
export function findSpawn(height = terrainHeight, normal = terrainNormal) {
  for (let r = 0; r < 1600; r += 8) {
    const steps = Math.max(1, Math.floor((r * Math.PI * 2) / 12));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = height(x, z);
      if (h < 1.5 || h > 7) continue;
      if (normal(x, z).y < 0.95) continue;
      let water = false;
      for (let k = 0; k < 8 && !water; k++) {
        const b = (k / 8) * Math.PI * 2;
        if (height(x + Math.cos(b) * 28, z + Math.sin(b) * 28) < -0.3) water = true;
      }
      if (water) return { x, z, h };
    }
  }
  return { x: 0, z: 0, h: height(0, 0) };
}

// A good place for the Heartwood: flat under the dais, dry, and with plenty of buildable
// ground around it. Spirals out from `start` and takes the first spot that passes.
export function findBaseSite(start, height = terrainHeight, normal = terrainNormal) {
  for (let r = 0; r < 900; r += 6) {
    const steps = Math.max(1, Math.floor((r * TAU) / 10));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const x = start.x + Math.cos(a) * r, z = start.z + Math.sin(a) * r;
      const h = height(x, z);
      if (h < WATER_LEVEL + 1.2 || h > 14) continue;
      if (normal(x, z).y < 0.96) continue;
      let lo = h, hi = h, ok = true;
      for (let k = 0; k < 16 && ok; k++) {
        const b = (k / 16) * TAU;
        for (const rr of [4, 9]) {
          const hh = height(x + Math.cos(b) * rr, z + Math.sin(b) * rr);
          lo = Math.min(lo, hh);
          hi = Math.max(hi, hh);
        }
        if (hi - lo > 1.3) ok = false;
      }
      if (!ok) continue;
      // most of the build ring should be dry and walkable
      let good = 0, n = 0;
      for (let k = 0; k < 24; k++) {
        const b = (k / 24) * TAU;
        for (const rr of [16, 26, 36]) {
          n++;
          const px = x + Math.cos(b) * rr, pz = z + Math.sin(b) * rr;
          if (height(px, pz) > WATER_LEVEL + 0.3 && normal(px, pz).y > 0.85) good++;
        }
      }
      if (good / n < 0.8) continue;
      return { x, z };
    }
  }
  return { x: start.x, z: start.z };
}
