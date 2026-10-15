// Distant plants: a lighter copy of a plant's geometry for the pools to draw past ~35 m.
// Leaf cards (the alpha-tested slots) are thinned to a fraction and the survivors grown about
// their own centres, so the crown keeps its outline and density from afar; small solid pieces
// (twigs, vines, epiphytes, cattail heads) are left out. Everything kept keeps its vertex
// colours, UVs and wind weights, so the swap is hard to see through the haze.
import * as THREE from 'three';
import { mulberry32 } from '../../utils/rng.js';

// keep: the share of leaf cards kept; minPart: solid pieces smaller than this share of the
// plant's size are dropped
export function lodGeometry(geo, materials, { keep = 0.45, minPart = 0.1, seed = 7 } = {}) {
  const index = geo.index;
  if (!index) return null;
  const I = index.array, P = geo.attributes.position;
  const nv = P.count;
  // pieces: vertices joined by triangles, and by sitting at the same spot (some trunks carry
  // their own copy of a vertex per face)
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const at = new Map();
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(P.getX(i) * 1000)},${Math.round(P.getY(i) * 1000)},${Math.round(P.getZ(i) * 1000)}`;
    const j = at.get(k);
    if (j === undefined) at.set(k, i);
    else parent[find(i)] = find(j);
  }
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    if (a !== b) parent[b] = a;
    if (a !== c) parent[find(c)] = a;
  }
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const size = geo.boundingSphere.radius * 2;
  const pos = new Float32Array(P.array);
  const out = [];
  const groups = [];
  const r = mulberry32(seed);
  const grow = Math.min(1.5, keep ** -0.4);
  const mats = Array.isArray(materials) ? materials : [materials];
  const box = new THREE.Box3(), v = new THREE.Vector3(), c = new THREE.Vector3();
  const list = geo.groups.length ? geo.groups : [{ start: 0, count: I.length, materialIndex: 0 }];
  for (const g of list) {
    const card = (mats[g.materialIndex] ?? mats[0])?.alphaTest > 0;
    // the triangles of each piece in this slot
    const pieces = new Map();
    for (let t = g.start; t < g.start + g.count; t += 3) {
      const k = find(I[t]);
      let p = pieces.get(k);
      if (!p) pieces.set(k, (p = []));
      p.push(t);
    }
    const start = out.length;
    for (const tris of pieces.values()) {
      box.makeEmpty();
      for (const t of tris) for (let j = 0; j < 3; j++) box.expandByPoint(v.fromBufferAttribute(P, I[t + j]));
      if (card) {
        if (r() > keep) continue;
        // grow the card about its centre (each vertex once)
        box.getCenter(c);
        const done = new Set();
        for (const t of tris) {
          for (let j = 0; j < 3; j++) {
            const i = I[t + j];
            if (done.has(i)) continue;
            done.add(i);
            for (let a = 0; a < 3; a++) pos[i * 3 + a] = c.getComponent(a) + (P.array[i * 3 + a] - c.getComponent(a)) * grow;
          }
        }
      } else if (box.getSize(v).length() < size * minPart) continue;
      for (const t of tris) out.push(I[t], I[t + 1], I[t + 2]);
    }
    if (out.length > start) groups.push({ start, count: out.length - start, materialIndex: g.materialIndex });
  }
  const lod = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) lod.setAttribute(name, name === 'position' ? new THREE.BufferAttribute(pos, 3) : attr);
  lod.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1));
  if (geo.groups.length) for (const g of groups) lod.addGroup(g.start, g.count, g.materialIndex);
  lod.computeBoundingSphere();
  lod.computeBoundingBox();
  return lod;
}
