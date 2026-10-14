// Fallen leaves as real geometry: a few thousand cupped and curled leaves lying on the
// ground around the player, so the forest floor has silhouettes and depth up close instead
// of reading as a photograph on a smooth surface. Each leaf sits on the terrain mesh's own
// triangle (World.groundAt), only where litter covers the ground, tinted by the ground's
// baked shade, and shrinks away over the last few metres of the ring.
import * as THREE from 'three';
import { mulberry32, range } from '../utils/rng.js';
import { addPackedNormal, addNightFill, patch } from '../art/shaders.js';

const CELL = 4; // metres; leaves are generated per cell, once, and kept while near
const RADIUS = 14;
const PER_CELL = 180; // tries per cell at full litter cover
// half the tries land in drifts: a few per cell, leaves within ~0.3 m of the drift's centre
const DRIFTS = [2, 5], DRIFT_SHARE = 0.5, DRIFT_R = 0.32;
const CELLS = ['dead0', 'dead1', 'dead2', 'dead3', 'dead4', 'dead5', 'dead6', 'dead7'];
// three shapes, each its own instanced mesh: nearly flat, cupped, and curled at the tip
const SHAPES = [
  { cup: 0.08, arch: 0.05, curl: 0.04 },
  { cup: 0.18, arch: 0.06, curl: 0.14 },
  { cup: 0.26, arch: 0.03, curl: 0.42 },
];
const CAP = 8000;

// A leaf one unit long along +z (stem at -z) and one unit wide along x; heights are in units
// of its length, so they scale with it.
function leafGeometry({ cup, arch, curl }, rows = 6) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    for (let j = 0; j <= 2; j++) {
      const s = j / 2 - 0.5;
      const y = Math.abs(s) * 2 * cup + Math.sin(t * Math.PI) * arch + Math.pow(Math.max(0, t - 0.6) / 0.4, 2) * curl;
      pos.push(s, y, t - 0.5);
      uv.push(j / 2, t);
    }
    if (i < rows) for (let j = 0; j < 2; j++) { const a = i * 3 + j; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A stick: a crooked, tapering six-sided rod one unit long along +z and one unit in radius,
// scaled per instance.
function stickGeometry(segs = 5, sides = 6) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, rad = 1 - 0.45 * t;
    const bx = Math.sin(t * 2.6) * 0.9, by = Math.sin(t * Math.PI) * 0.6;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      pos.push(bx + Math.cos(a) * rad, by + Math.sin(a) * rad, t - 0.5);
      uv.push(k / sides * 0.12, t * 1.5);
    }
    if (i < segs) for (let k = 0; k < sides; k++) { const a = i * (sides + 1) + k; idx.push(a, a + 1, a + sides + 1, a + 1, a + sides + 2, a + sides + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _basis = new THREE.Matrix4();
const _tilt = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
const _g = {};

export class Litter {
  constructor(scene, world, lib) {
    this.world = world;
    this.cells = new Map(); // key -> per-shape arrays of matrices, colours, atlas rects
    this.cx = null; this.cz = null;
    this.rects = CELLS.map((n) => lib.cell('debris', n));
    const A = lib.atlas.debris;
    const mat = new THREE.MeshStandardMaterial({
      map: A.map, normalMap: A.nmap, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.8, metalness: 0, envMapIntensity: 0.35,
    });
    addPackedNormal(mat);
    addNightFill(mat, 0.3);
    // everything shrinks to nothing toward the edge of the ring instead of popping
    const FADE = `#include <begin_vertex>
      {
        vec3 ogIp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        transformed *= 1.0 - smoothstep(${(RADIUS - 6).toFixed(1)}, ${(RADIUS - 1).toFixed(1)}, distance(ogIp, cameraPosition));
      }`;
    // each leaf picks its cell from the atlas
    patch(mat, 'litterleaf', (shader) => {
      shader.vertexShader = 'attribute vec4 aCell;\n' + shader.vertexShader
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = aCell.xy + uv * aCell.zw;
          vNormalMapUv = vMapUv;`)
        .replace('#include <begin_vertex>', FADE);
    });
    // sticks: grey-brown dead wood
    const S = lib.surface.deadwood;
    const stickMat = new THREE.MeshStandardMaterial({ map: S.map, normalMap: S.nmap, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
    addPackedNormal(stickMat);
    addNightFill(stickMat, 0.3);
    patch(stickMat, 'litterstick', (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', FADE);
    });
    this.meshes = [...SHAPES, null].map((shape) => {
      const stick = !shape;
      const geo = stick ? stickGeometry() : leafGeometry(shape);
      if (!stick) geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4));
      const mesh = new THREE.InstancedMesh(geo, stick ? stickMat : mat, CAP);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
  }

  // The leaves of one cell, or null if the ground under it isn't built yet.
  build(i, j) {
    const world = this.world, r = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0);
    const out = [...SHAPES, null].map(() => ({ m: [], c: [], a: [] }));
    const pois = world.poisNear(i * CELL + CELL / 2, j * CELL + CELL / 2, CELL + 30);
    const drifts = [];
    for (let d = Math.floor(range(r, DRIFTS[0], DRIFTS[1] + 1)); d > 0; d--) drifts.push([(i + r()) * CELL, (j + r()) * CELL]);
    for (let k = 0; k < PER_CELL; k++) {
      let x = (i + r()) * CELL, z = (j + r()) * CELL;
      if (r() < DRIFT_SHARE) {
        // gathered into a drift (a rough gaussian round its centre), kept inside the cell
        const [dx, dz] = drifts[Math.floor(r() * drifts.length)];
        const a = r() * Math.PI * 2, rr = DRIFT_R * Math.sqrt(-2 * Math.log(Math.max(r(), 1e-4))) * 0.7;
        x = Math.min((i + 1) * CELL - 0.01, Math.max(i * CELL, dx + Math.cos(a) * rr));
        z = Math.min((j + 1) * CELL - 0.01, Math.max(j * CELL, dz + Math.sin(a) * rr));
      }
      const roll = r(), shapeRoll = r(), cellRoll = r(), yaw = r() * Math.PI * 2;
      const g = world.groundAt(x, z, _g);
      if (!g) return null;
      if (g.h < 0.4 || g.ny < 0.58 || g.rock > 0.45 || g.mud > 0.5) continue;
      if (roll > g.litter * (1 - g.moss * 0.8)) continue;
      if (pois.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.radius * 0.85) ** 2)) continue;
      if (shapeRoll > 0.94) {
        // a stick, lying along the ground
        const L = range(r, 0.3, 0.95), rad = range(r, 0.007, 0.02);
        _y.set(g.nx, g.ny, g.nz);
        _x.set(Math.cos(yaw), 0, Math.sin(yaw));
        _z.crossVectors(_x, _y).normalize();
        _x.crossVectors(_y, _z);
        _q.setFromRotationMatrix(_basis.makeBasis(_x, _y, _z));
        _m.compose(_p.set(x, g.h + rad * 0.6, z), _q, _s.set(rad, rad, L));
        const o = out[3], tone = range(r, 0.55, 0.95) * g.shade;
        o.m.push(..._m.elements);
        o.c.push(tone, tone * 0.95, tone * 0.88);
        continue;
      }
      const rect = this.rects[Math.floor(cellRoll * CELLS.length)];
      const L = range(r, 0.13, 0.3), W = L * rect.aspect;
      // lie on the ground; about half rest on the litter beneath with one end lifted
      const lift = r() < 0.5 ? range(r, 0.1, 0.38) : range(r, -0.05, 0.05);
      _y.set(g.nx + range(r, -0.1, 0.1), g.ny, g.nz + range(r, -0.1, 0.1)).normalize();
      _x.set(Math.cos(yaw), 0, Math.sin(yaw));
      _z.crossVectors(_x, _y).normalize();
      _x.crossVectors(_y, _z);
      _basis.makeBasis(_x, _y, _z);
      _q.setFromRotationMatrix(_basis).multiply(_tilt.setFromAxisAngle(_ax, -lift));
      _m.compose(_p.set(x, g.h + 0.006 + Math.sin(Math.abs(lift)) * L * 0.5, z), _q, _s.set(W, L, L));
      const o = out[shapeRoll < 0.38 ? 0 : shapeRoll < 0.74 ? 1 : 2];
      o.m.push(..._m.elements);
      // mostly brown; some fresh fallen ones still yellow-green, some gone red
      const tone = range(r, 0.6, 1.1) * g.shade, kind = r();
      if (kind < 0.16) o.c.push(tone * 1.05, tone * 1.12, tone * 0.55);
      else if (kind < 0.28) o.c.push(tone * 1.12, tone * 0.82, tone * 0.7);
      else { const warm = range(r, -0.06, 0.06); o.c.push(tone * (1 + warm), tone, tone * (1 - warm)); }
      o.a.push(rect.u0, rect.v0, rect.u1 - rect.u0, rect.v1 - rect.v0);
    }
    return out.map((o) => ({ m: new Float32Array(o.m), c: new Float32Array(o.c), a: new Float32Array(o.a) }));
  }

  update(px, pz) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    if (ci === this.cx && cj === this.cz && !this.missing) return;
    this.cx = ci; this.cz = cj;
    this.missing = false;
    const R = Math.ceil(RADIUS / CELL) + 1;
    const counts = this.meshes.map(() => 0);
    const keep = new Set();
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (Math.hypot((i + 0.5) * CELL - px, (j + 0.5) * CELL - pz) > RADIUS + CELL * 0.75) continue;
        const key = `${i},${j}`;
        keep.add(key);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = this.build(i, j);
          if (!cell) { this.missing = true; continue; }
          this.cells.set(key, cell);
        }
        cell.forEach((s, k) => {
          const mesh = this.meshes[k], n = s.c.length / 3;
          if (counts[k] + n > CAP) return;
          mesh.instanceMatrix.array.set(s.m, counts[k] * 16);
          mesh.instanceColor.array.set(s.c, counts[k] * 3);
          mesh.geometry.attributes.aCell?.array.set(s.a, counts[k] * 4);
          counts[k] += n;
        });
      }
    }
    for (const key of this.cells.keys()) if (!keep.has(key)) this.cells.delete(key);
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      if (mesh.geometry.attributes.aCell) mesh.geometry.attributes.aCell.needsUpdate = true;
    });
  }
}
