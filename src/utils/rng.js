// Deterministic random helpers. Everything in the world is generated from
// seeds so the same chunk always looks the same when you walk back to it.
import { WORLD_SALT } from '../core/Seed.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of two coordinates + a salt.
export function hash2(x, z, salt = 0) {
  let h = (salt * 0x9e3779b1) ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

// (the world's salt makes the daily vigil's chunks their own; 0 for the ordinary world)
export function chunkRng(cx, cz, salt) {
  return mulberry32(hash2(cx, cz, salt ^ WORLD_SALT));
}

export const range = (rand, a, b) => a + (b - a) * rand();
export const irange = (rand, a, b) => Math.floor(a + (b - a + 1) * rand());
export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// Weighted pick from [{ w, ...}] or [[value, weight]].
export function weighted(rand, entries) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rand() * total;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}
