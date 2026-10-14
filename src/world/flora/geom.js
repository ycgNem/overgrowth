// Geometry building blocks for procedural plants and props.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP = new Set(['position', 'normal', 'uv', 'color']);
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

// Normalise a geometry so it can be merged with any other: non-indexed,
// exactly position/normal/uv/color.
export function prep(geo, color = null) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const arr = new Float32Array(n * 3);
    const c = color || _c.setRGB(1, 1, 1);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  return g;
}

// Per-vertex colouring: fn(position, normal, outColor, index).
export function paint(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    _n.fromBufferAttribute(n, i);
    _c.setRGB(c.getX(i), c.getY(i), c.getZ(i));
    fn(_v, _n, _c, i);
    c.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return geo;
}

export function setUV(geo, u, v) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return geo;
}

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// Point every normal away from `center`, blended with straight up.
// This is the classic trick that makes card-based canopies look fluffy.
export function radialNormals(geo, center, up = 0.35) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).sub(center).normalize();
    _v.y += up;
    _v.normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return geo;
}

export function merge(list) {
  return mergeGeometries(list.map((g) => prep(g)), false);
}

// Merge a list of parts per material slot into one geometry with groups.
export function mergeSlots(slots) {
  const parts = slots.map((list) => mergeVertices(merge(list), 1e-4));
  return mergeGeometries(parts, true);
}

// Tube along a smooth curve with a radius profile r(t). UVs: u around, v along
// the length (so vertical bark streaks run up the trunk).
export function taperedTube(points, radiusFn, tubular = 12, radial = 8, uRepeat = 2, vRepeat = 3) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const r = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      _v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, _v.x, _v.y, _v.z);
      uv.setXY(idx, (j / radial) * uRepeat, t * vRepeat);
    }
  }
  return prep(geo);
}

// An arching strip — palm fronds, fern fronds, banana leaves. Built along +X
// from the origin; `elev` is the launch angle, `droop` bends it down.
// Three vertices across (left, ridge, right) give a folded V profile.
export function frondStrip({ length = 4, width = 1, segs = 10, elev = 0.5, droop = 0.6, fold = 0.12, taper = 0.5, minWidth = 0 }) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = length * Math.cos(elev) * t * (1 - 0.12 * t);
    const y = length * (Math.sin(elev) * t - droop * t * t);
    const w = Math.max(minWidth, width * (1 - taper * t * t)) * 0.5;
    const rise = fold * w * 2;
    pos.push(x, y, -w, x, y + rise, 0, x, y, w);
    uv.push(0, t, 0.5, t, 1, t);
    if (i < segs) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // bias normals upward for soft, readable lighting from both sides
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    _n.fromBufferAttribute(n, i);
    if (_n.y < 0) _n.negate();
    _n.y += 0.8;
    _n.normalize();
    n.setXYZ(i, _n.x, _n.y, _n.z);
  }
  return prep(g);
}

const _dummy = new THREE.Object3D();

// A square card facing `dir`, spun randomly about that axis.
export function leafCard(size, position, dir, spin) {
  const g = new THREE.PlaneGeometry(size, size);
  _dummy.position.copy(position);
  _dummy.lookAt(_v.copy(position).add(dir));
  _dummy.rotateZ(spin);
  _dummy.updateMatrix();
  g.applyMatrix4(_dummy.matrix);
  return prep(g);
}

// Lumpy blob, used to fill the inside of canopies and as rocks.
export function blob(radius, detail, noiseFn, amp = 0.25, squashY = 1) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const d = 1 + noiseFn(_v.x * 0.9 + _v.y * 0.5, _v.z * 0.9 - _v.y * 0.4) * amp;
    _v.multiplyScalar(d);
    _v.y *= squashY;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  // spherical uv
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    uv[i * 2] = (Math.atan2(_v.z, _v.x) / (Math.PI * 2) + 0.5) * 2;
    uv[i * 2 + 1] = _v.y * 0.5;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return prep(g);
}

export function transform(geo, { position, rotation, scale } = {}) {
  _dummy.position.set(0, 0, 0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.set(1, 1, 1);
  if (position) _dummy.position.copy(position);
  if (rotation) _dummy.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  if (scale) typeof scale === 'number' ? _dummy.scale.setScalar(scale) : _dummy.scale.copy(scale);
  _dummy.updateMatrix();
  geo.applyMatrix4(_dummy.matrix);
  return geo;
}

// A leaf blade (or frond, or twig card) mapped onto one atlas cell. Built from its base at
// the origin out along +X: `elev` is the launch angle, `droop` bends the tip down, `fold`
// lifts the sides into a V along the midrib and `curl` rolls the edges. The cell's
// aspect sets the width, so the photographed silhouette keeps its proportions.
export function leafBlade(cell, {
  length = 1, segs = 6, across = 2, elev = 0.5, droop = 0.5, fold = 0.15, curl = 0, twist = 0, widthScale = 1, upBias = 0.6,
} = {}) {
  const W = length * cell.aspect * widthScale;
  const pos = [], uv = [], idx = [];
  const cols = across + 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = length * Math.cos(elev) * t * (1 - 0.1 * t);
    const y = length * (Math.sin(elev) * t - droop * t * t);
    const tw = twist * t;
    for (let j = 0; j <= across; j++) {
      const s = j / across - 0.5; // -0.5 .. 0.5 across the blade
      const z = s * W;
      const lift = Math.abs(s) * W * fold + s * s * W * curl;
      // twist the cross-section about the midrib
      const zz = z * Math.cos(tw) - lift * Math.sin(tw) * Math.sign(s || 1);
      const yy = y + lift * Math.cos(tw) + z * Math.sin(tw) * 0.5;
      pos.push(x, yy, zz);
      uv.push(cell.u0 + (s + 0.5) * (cell.u1 - cell.u0), cell.v0 + t * (cell.v1 - cell.v0));
    }
    if (i < segs) {
      for (let j = 0; j < across; j++) {
        const a = i * cols + j;
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // both faces light like the upper side, with a lean toward the sky
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    _n.fromBufferAttribute(n, i);
    if (_n.y < 0) _n.negate();
    _n.y += upBias;
    _n.normalize();
    n.setXYZ(i, _n.x, _n.y, _n.z);
  }
  return prep(g);
}

// A top-down cut-out (a rosette photographed from above) projected onto a polar mesh shaped
// like the plant: the leaves rise out of the centre at `rise`, arch over and droop at the
// tips. Seen from above it is the photo; from the side it has the cup a real rosette has.
export function rosetteDisc(cell, { radius = 0.5, rings = 5, segs = 16, rise = 0.9, droop = 0.6, spin = 0, upBias = 0.5 } = {}) {
  const pos = [], uv = [], idx = [];
  const cu = (cell.u0 + cell.u1) / 2, cv = (cell.v0 + cell.v1) / 2;
  const hu = (cell.u1 - cell.u0) / 2, hv = (cell.v1 - cell.v0) / 2;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = radius * (rise * t - (rise + droop) * 0.5 * t * t * t);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(c * radius * t, y, s * radius * t);
      uv.push(cu + Math.cos(a + spin) * hu * t, cv + Math.sin(a + spin) * hv * t);
    }
    if (i < rings) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j;
        idx.push(a, a + segs + 1, a + 1, a + 1, a + segs + 1, a + segs + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    _n.fromBufferAttribute(n, i);
    if (_n.y < 0) _n.negate();
    _n.y += upBias;
    _n.normalize();
    n.setXYZ(i, _n.x, _n.y, _n.z);
  }
  return prep(g);
}

// A gently bent card for a leafy twig, placed at `position`, its stem pointing back along
// -`dir` (toward the branch) and its face turned toward `up`.
export function twigCard(cell, size, position, dir, up, { bend = 0.18, cup = 0.1 } = {}) {
  const L = size, W = size * cell.aspect;
  const g = new THREE.PlaneGeometry(W, L, 2, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + L / 2; // base at y = 0
    const t = y / L;
    p.setXYZ(i, x, y, -bend * L * t * t + cup * x * x / Math.max(W, 1e-3));
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
  }
  g.computeVertexNormals();
  // orient: local +y along dir, local +z toward `up` (orthogonalised)
  const Y = _v.copy(dir).normalize();
  const Z = _n.copy(up).addScaledVector(Y, -up.dot(Y));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(position);
  g.applyMatrix4(m);
  return prep(g);
}

// A plank buttress: a thin, tall wall of root flaring out from a trunk, with a rounded top
// edge, tapering in height and thickness to its tip, and snaking a little in plan.
// A buttress: a thin wall running out from the trunk, tall at the trunk and sloping down to the
// ground. A wall of constant thickness reads as a sheet of card, so it flares where it meets
// the ground, thins toward its crest, leans a little and ripples in diagonal ridges along its
// length. UVs are metric: up each face from the ground (mirrored at the crest) and along the
// root, sheared so the bark's grain runs down and out the way the wood flows.
export function plankRoot({ angle = 0, r0 = 0.8, length = 3, height = 3, thick = 0.32, wiggle = 0.25, segs = 10, uvScale = 1, seed = 0 }) {
  // one face of the cross-section, ground to crest: [height fraction (< 0: below ground), half-thickness factor]
  const prof = [[-1, 1.7], [0, 1.5], [0.1, 1.18], [0.3, 0.98], [0.55, 0.9], [0.8, 0.74], [0.94, 0.46], [1, 0]];
  const crest = prof.length - 1;
  const ring = [...prof.map(([h, s]) => [h, -s]), ...prof.slice(0, -1).reverse()];
  const n = ring.length;
  const pos = [], uv = [], idx = [];
  const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  const side = new THREE.Vector2(-dir.y, dir.x);
  const P = new Float32Array(n * 3), acc = new Float32Array(n);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const d = r0 * 0.75 + length * t;
    const off = Math.sin(t * Math.PI * 1.3) * wiggle * t;
    const cx = dir.x * d + side.x * off, cz = dir.y * d + side.y * off;
    const top = height * Math.pow(1 - t, 1.7) + 0.08;
    const w = thick * (1 - 0.75 * t) + 0.04;
    // the wall leans over toward its crest, by an amount that drifts along the root
    const lean = (Math.sin(d * 1.3 + seed) * 0.14 + Math.sin(d * 3.1 + seed * 2.3) * 0.05) * Math.min(1, top / 1.5);
    for (let k = 0; k < n; k++) {
      const [h, s] = ring[k];
      // the foot runs well underground, so on a slope the end never shows a cut face
      const y = h < 0 ? -1.5 : h * top;
      const hh = Math.max(h, 0);
      // diagonal ridges, running down and out like the trunk's flutes carried into the root
      const rip = 1 + 0.24 * Math.sin(3.0 * (d + 0.55 * y) + seed) + 0.1 * Math.sin(7.7 * (d - 0.3 * y) + seed * 1.7);
      const x = s * w * rip + lean * hh * hh;
      P[k * 3] = cx + side.x * x;
      P[k * 3 + 1] = y;
      P[k * 3 + 2] = cz + side.y * x;
      acc[k] = k ? acc[k - 1] + Math.hypot(P[k * 3] - P[k * 3 - 3], P[k * 3 + 1] - P[k * 3 - 2], P[k * 3 + 2] - P[k * 3 - 1]) : 0;
    }
    for (let k = 0; k < n; k++) {
      pos.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
      // metres up the face from below ground; the far face mirrors the near one at the crest
      const up = k <= crest ? acc[k] : 2 * acc[crest] - acc[k];
      uv.push((up + 0.4 * d) * uvScale + seed * 0.29, d * uvScale + seed * 0.53);
    }
    if (i < segs) {
      for (let k = 0; k < n - 1; k++) {
        const a = i * n + k;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return prep(g);
}

// Box with UVs scaled to world size so tiling textures keep their density.
// A dressed block: a box whose 12 edges are bevelled at 45 degrees (`c` metres), flat shaded,
// 44 triangles, non-indexed. UVs are box-projected in metres (`uvScale` metres per repeat) and
// shifted by `off`, so every block shows its own patch of the texture.
export function chamferBlock(w, h, d, c = 0.05, uvScale = 2, off = [0, 0]) {
  const H = [w / 2, h / 2, d / 2];
  const cc = Math.min(c, H[0] * 0.45, H[1] * 0.45, H[2] * 0.45);
  // the corner (s0, s1, s2) as seen from the face of axis a
  const P = (a, s) => [0, 1, 2].map((i) => s[i] * (i === a ? H[i] : H[i] - cc));
  const tris = [];
  const quad = (A, B, C, D) => tris.push(A, B, C, A, C, D);
  const S = [-1, 1];
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, e = (a + 2) % 3;
    const sv = (va, vb, ve) => { const s = [0, 0, 0]; s[a] = va; s[b] = vb; s[e] = ve; return s; };
    for (const s of S) quad(P(a, sv(s, -1, -1)), P(a, sv(s, 1, -1)), P(a, sv(s, 1, 1)), P(a, sv(s, -1, 1)));
    // the bevel between the faces of a and b, running along e
    for (const sa of S) for (const sb of S) quad(P(a, sv(sa, sb, -1)), P(a, sv(sa, sb, 1)), P(b, sv(sa, sb, 1)), P(b, sv(sa, sb, -1)));
  }
  for (const x of S) for (const y of S) for (const z of S) tris.push(P(0, [x, y, z]), P(1, [x, y, z]), P(2, [x, y, z]));
  const n = tris.length;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let t = 0; t < n; t += 3) {
    let A = tris[t], B = tris[t + 1], C = tris[t + 2];
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let N = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    // convex and centred: a face whose normal points at the centre is wound the wrong way
    if (N[0] * (A[0] + B[0] + C[0]) + N[1] * (A[1] + B[1] + C[1]) + N[2] * (A[2] + B[2] + C[2]) < 0) {
      [B, C] = [C, B];
      N = N.map((v) => -v);
    }
    const L = Math.hypot(N[0], N[1], N[2]) || 1;
    N = N.map((v) => v / L);
    const ax = Math.abs(N[0]) >= Math.abs(N[1]) && Math.abs(N[0]) >= Math.abs(N[2]) ? 0 : Math.abs(N[1]) >= Math.abs(N[2]) ? 1 : 2;
    const [ua, va] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
    [A, B, C].forEach((p, k) => {
      const i = t + k;
      pos.set(p, i * 3);
      nrm.set(N, i * 3);
      uv[i * 2] = p[ua] / uvScale + off[0];
      uv[i * 2 + 1] = p[va] / uvScale + off[1];
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// The chamfered block's topology, once: for every triangle corner which face axis it sits on
// and its corner signs, plus the triangle's normal and the axes its UVs are projected from.
// With the same bevel on every edge none of these depend on the block's size.
let TPL = null;
function chamferTemplate() {
  if (TPL) return TPL;
  const verts = [];
  const quad = (A, B, C, D) => verts.push(A, B, C, A, C, D);
  const S = [-1, 1];
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, e = (a + 2) % 3;
    const sv = (ax, va, vb, ve) => { const v = [ax, 0, 0, 0]; v[a + 1] = va; v[b + 1] = vb; v[e + 1] = ve; return v; };
    for (const s of S) quad(sv(a, s, -1, -1), sv(a, s, 1, -1), sv(a, s, 1, 1), sv(a, s, -1, 1));
    for (const sa of S) for (const sb of S) quad(sv(a, sa, sb, -1), sv(a, sa, sb, 1), sv(b, sa, sb, 1), sv(b, sa, sb, -1));
  }
  for (const x of S) for (const y of S) for (const z of S) verts.push([0, x, y, z], [1, x, y, z], [2, x, y, z]);
  const n = verts.length;
  const t = { n, a: new Int8Array(n), s: new Int8Array(n * 3), nrm: new Float32Array(n * 3), ua: new Int8Array(n), va: new Int8Array(n) };
  const P = (v) => [0, 1, 2].map((i) => v[i + 1] * (i === v[0] ? 0.5 : 0.4));
  for (let i = 0; i < n; i += 3) {
    const tri = [verts[i], verts[i + 1], verts[i + 2]];
    let [A, B, C] = tri.map(P);
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let N = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (N[0] * (A[0] + B[0] + C[0]) + N[1] * (A[1] + B[1] + C[1]) + N[2] * (A[2] + B[2] + C[2]) < 0) {
      [tri[1], tri[2]] = [tri[2], tri[1]];
      N = N.map((v) => -v);
    }
    const L = Math.hypot(N[0], N[1], N[2]);
    N = N.map((v) => v / L);
    const ax = Math.abs(N[0]) >= Math.abs(N[1]) && Math.abs(N[0]) >= Math.abs(N[2]) ? 0 : Math.abs(N[1]) >= Math.abs(N[2]) ? 1 : 2;
    const [ua, va] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
    for (let k = 0; k < 3; k++) {
      t.a[i + k] = tri[k][0];
      t.s.set(tri[k].slice(1), (i + k) * 3);
      t.nrm.set(N, (i + k) * 3);
      t.ua[i + k] = ua;
      t.va[i + k] = va;
    }
  }
  TPL = t;
  return t;
}

// Many dressed blocks written straight into one geometry (position, normal, uv, colour).
export class BlockBatch {
  constructor() {
    this.n = 0;
    this.cap = 0;
    this.grow(132 * 256);
    this._m = new THREE.Matrix4();
    this._e = new THREE.Euler();
  }

  grow(cap) {
    const more = (old, k) => { const a = new Float32Array(cap * k); if (old) a.set(old.subarray(0, this.n * k)); return a; };
    this.pos = more(this.pos, 3); this.nrm = more(this.nrm, 3); this.uv = more(this.uv, 2); this.col = more(this.col, 3);
    this.cap = cap;
  }

  // a w x h x d block bevelled by c, centred at p and turned by the XYZ Euler angles rot; UVs in
  // block-local metres (uvScale per repeat) offset by off; colour rgb scaled by shade(worldY)
  add(w, h, d, c, p, rot, uvScale, off, rgb, shade) {
    const T = chamferTemplate();
    if (this.n + T.n > this.cap) this.grow(Math.max(this.cap * 2, this.n + T.n));
    const H = [w / 2, h / 2, d / 2];
    const cc = Math.min(c, H[0] * 0.45, H[1] * 0.45, H[2] * 0.45);
    const e = this._m.makeRotationFromEuler(this._e.set(rot[0], rot[1], rot[2])).elements;
    const q = [0, 0, 0];
    for (let i = 0; i < T.n; i++) {
      const a = T.a[i], o = this.n + i;
      for (let k = 0; k < 3; k++) q[k] = T.s[i * 3 + k] * (k === a ? H[k] : H[k] - cc);
      const x = e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + p[0];
      const y = e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + p[1];
      const z = e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + p[2];
      this.pos[o * 3] = x; this.pos[o * 3 + 1] = y; this.pos[o * 3 + 2] = z;
      const nx = T.nrm[i * 3], ny = T.nrm[i * 3 + 1], nz = T.nrm[i * 3 + 2];
      this.nrm[o * 3] = e[0] * nx + e[4] * ny + e[8] * nz;
      this.nrm[o * 3 + 1] = e[1] * nx + e[5] * ny + e[9] * nz;
      this.nrm[o * 3 + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
      this.uv[o * 2] = q[T.ua[i]] / uvScale + off[0];
      this.uv[o * 2 + 1] = q[T.va[i]] / uvScale + off[1];
      const s = shade(y);
      this.col[o * 3] = rgb[0] * s; this.col[o * 3 + 1] = rgb[1] * s; this.col[o * 3 + 2] = rgb[2] * s;
    }
    this.n += T.n;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, this.n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n * 3), 3));
    return g;
  }
}

export function worldBox(w, h, d, uvScale = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / uvScale, (uv.getY(i) * dims[f][1]) / uvScale);
    }
  }
  return g;
}
