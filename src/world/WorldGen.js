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
const nBank = createNoise2D(SEED + 10);

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
