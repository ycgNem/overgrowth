// The world's shape. Everything here is a pure function of (x, z) so any
// part of the infinite map can be generated on demand, in any order.
import * as THREE from 'three';
import { createNoise2D, fbm, ridged } from '../utils/noise.js';
import { smoothstep, lerp, clamp } from '../utils/math.js';

export const SEED = 4217;
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

// Reused output object to avoid allocations in hot loops.
const info = { h: 0, river: 1, mountain: 0 };

export function sampleTerrain(x, z, out = info) {
  const wx = x + nWarpA(x * 0.0021, z * 0.0021) * 55;
  const wz = z + nWarpB(x * 0.0021, z * 0.0021) * 55;
  const cont = fbm(nCont, wx * 0.0016, wz * 0.0016, 3);
  let h = 6.5 + cont * 10;
  h += fbm(nHills, wx * 0.0075, wz * 0.0075, 4) * 5.5;
  const mMask = smoothstep(0.02, 0.55, cont);
  const rg = ridged(nRidge, wx * 0.0042, wz * 0.0042, 4);
  h += rg * rg * 44 * mMask;
  h += nDetail(x * 0.05, z * 0.05) * 0.45;
  // Rivers: carve along the zero-contour of a low-frequency noise field.
  const rv = Math.abs(fbm(nRiver, wx * 0.0012, wz * 0.0012, 3));
  const bank = smoothstep(0.012, 0.075, rv);
  const bed = -2.6 + rv * 20;
  h = lerp(Math.min(bed, h), h, bank);
  out.h = h;
  out.river = bank; // 0 in the river channel, 1 well away from it
  out.mountain = mMask * rg;
  return out;
}

export function terrainHeight(x, z) {
  return sampleTerrain(x, z, info).h;
}

const _n = new THREE.Vector3();
export function terrainNormal(x, z, out = _n) {
  const e = 0.75;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
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
export function findSpawn() {
  for (let r = 0; r < 1600; r += 8) {
    const steps = Math.max(1, Math.floor((r * Math.PI * 2) / 12));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.5 || h > 7) continue;
      if (terrainNormal(x, z).y < 0.95) continue;
      let water = false;
      for (let k = 0; k < 8 && !water; k++) {
        const b = (k / 8) * Math.PI * 2;
        if (terrainHeight(x + Math.cos(b) * 28, z + Math.sin(b) * 28) < -0.3) water = true;
      }
      if (water) return { x, z, h };
    }
  }
  return { x: 0, z: 0, h: terrainHeight(0, 0) };
}
