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

// Box with UVs scaled to world size so tiling textures keep their density.
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
