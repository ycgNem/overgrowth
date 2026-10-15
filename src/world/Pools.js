// Instance pools: one InstancedMesh per plant variant (and per forage item) for the whole
// streaming window, instead of one per variant per chunk (that was 450-790 draw calls).
//
// A chunk that loads takes a contiguous block of slots in each pool it needs and writes its
// instances there; unloading frees the block. Every frame the blocks that can be seen, by the
// camera or by the sun's shadow camera, are packed to the front of the pool's GPU buffers. That
// only changes when a chunk comes into or out of view, or a plant is cut or lit, so most frames
// upload nothing. Visibility is per block (per chunk), the same granularity the per-chunk
// meshes were culled at.
//
// A block answers getMatrixAt / setMatrixAt / setColorAt / getColorAt like an InstancedMesh, so
// the code that hides, recolours or ray-casts one plant (World.cutPlant, Game.highlightForage,
// the machete's hit test) doesn't care that it's pooled.
//
// Distance: a pool can stop drawing past `far`, and can hand plants past `lodDist` to a second
// mesh with lighter geometry (the trees' crowns thinned to fewer, bigger cards). Both are
// decided per plant, re-sorted whenever the camera has moved a few metres; a block wholly on
// one side of the line is copied in one go.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _shadowFrustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const IDENTITY = new THREE.Matrix4();

// A geometry that shares a library geometry's buffers (uploaded once) but can carry its own
// per-instance attributes.
export function shareGeometry(src) {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  if (src.index) g.setIndex(src.index);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (!src.boundingSphere) src.computeBoundingSphere();
  g.boundingSphere = src.boundingSphere.clone();
  g.boundingBox = src.boundingBox;
  return g;
}

// free a shared geometry without taking the library's buffers with it
function disposeShared(g, own) {
  for (const name of Object.keys(g.attributes)) if (name !== own) g.deleteAttribute(name);
  g.setIndex(null);
  g.dispose();
}

class Block {
  constructor(pool, start, n) {
    this.pool = pool;
    this.start = start;
    this.n = n;
    this.box = new THREE.Box3();
    this.seen = false;
    this.geometry = pool.src;
    this.material = pool.material;
    this.matrixWorld = IDENTITY;
    // `mesh.instanceMatrix.needsUpdate = true` from the callers marks the pool for a repack
    this.instanceMatrix = this.instanceColor = { set needsUpdate(v) { if (v) pool.dirty = true; } };
  }

  setMatrixAt(i, m) {
    m.toArray(this.pool.mat, (this.start + i) * 16);
    this.pool.dirty = true;
  }

  getMatrixAt(i, m) {
    return m.fromArray(this.pool.mat, (this.start + i) * 16);
  }

  setColorAt(i, c) {
    c.toArray(this.pool.col, (this.start + i) * 3);
    this.pool.dirty = true;
  }

  getColorAt(i, c) {
    return c.fromArray(this.pool.col, (this.start + i) * 3);
  }

  setSlopeAt(i, sx, sz) {
    const s = this.pool.slp, k = (this.start + i) * 2;
    s[k] = sx;
    s[k + 1] = sz;
  }

  // the block's bounds from its instances (call once they're all written)
  seal() {
    const r = this.pool.radius, c = this.pool.center;
    this.box.makeEmpty();
    for (let i = 0; i < this.n; i++) {
      this.getMatrixAt(i, _m);
      const s = _m.getMaxScaleOnAxis();
      if (s === 0) continue;
      _v.copy(c).applyMatrix4(_m);
      this.box.expandByPoint(_v.addScalar(r * s));
      this.box.expandByPoint(_v.addScalar(-2 * r * s));
    }
    this.pool.dirty = true;
  }

  free() {
    this.pool.release(this);
  }
}

export class Pool {
  // slope: the plant shader's per-instance aSlope; shadow: casts; far: drawn out to this
  // distance only (metres from the camera); lod: lighter geometry drawn from lodDist out
  // lodShadow: whether the far copies cast too (only the trees' far shadows are worth drawing)
  constructor(scene, geometry, material, { slope = false, shadow = false, far = Infinity, lod = null, lodDist = Infinity, lodShadow = true } = {}) {
    this.scene = scene;
    this.src = geometry;
    this.material = material;
    this.slope = slope;
    this.shadow = shadow;
    this.lodShadow = lodShadow;
    this.far = far;
    this.lod = lod;
    this.lodDist = lod ? lodDist : Infinity;
    // sorted by distance as well as visibility
    this.ranged = this.far < Infinity || !!lod;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    this.center = geometry.boundingSphere.center.clone();
    this.radius = geometry.boundingSphere.radius;
    this.cap = 0;
    this.mat = new Float32Array(0);
    this.col = new Float32Array(0);
    this.slp = new Float32Array(0);
    this.free = []; // [start, length] runs, sorted by start
    this.blocks = new Set();
    this.mesh = null;
    this.lodMesh = null;
    this.dirty = false;
  }

  makeMesh(src, cap) {
    const g = shareGeometry(src);
    const mesh = new THREE.InstancedMesh(g, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // every instanced caster carries instance colours: when three's shared depth material
    // meets meshes with and without them it rebuilds its program key on every switch
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    if (this.slope) g.setAttribute('aSlope', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage));
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return mesh;
  }

  dropMesh(mesh) {
    if (!mesh) return;
    this.scene.remove(mesh);
    disposeShared(mesh.geometry, 'aSlope');
    mesh.dispose();
  }

  grow(need) {
    const cap = Math.max(64, Math.ceil(Math.max(this.cap * 1.5, this.cap + need * 2)));
    const mat = new Float32Array(cap * 16), col = new Float32Array(cap * 3), slp = new Float32Array(cap * 2);
    mat.set(this.mat);
    col.set(this.col);
    slp.set(this.slp);
    this.addFree(this.cap, cap - this.cap);
    this.mat = mat;
    this.col = col;
    this.slp = slp;
    this.cap = cap;
    // bigger meshes to draw them with
    this.dropMesh(this.mesh);
    this.dropMesh(this.lodMesh);
    this.mesh = this.makeMesh(this.src, cap);
    if (this.lod) this.lodMesh = this.makeMesh(this.lod, cap);
    this.dirty = true;
  }

  addFree(start, n) {
    if (n <= 0) return;
    const f = this.free;
    let i = 0;
    while (i < f.length && f[i][0] < start) i++;
    f.splice(i, 0, [start, n]);
    // merge with the neighbours
    if (i + 1 < f.length && f[i][0] + f[i][1] === f[i + 1][0]) {
      f[i][1] += f[i + 1][1];
      f.splice(i + 1, 1);
    }
    if (i > 0 && f[i - 1][0] + f[i - 1][1] === f[i][0]) {
      f[i - 1][1] += f[i][1];
      f.splice(i, 1);
    }
  }

  // n contiguous slots
  alloc(n) {
    let run = this.free.find((r) => r[1] >= n);
    if (!run) {
      this.grow(n);
      run = this.free.find((r) => r[1] >= n);
    }
    const start = run[0];
    run[0] += n;
    run[1] -= n;
    if (!run[1]) this.free.splice(this.free.indexOf(run), 1);
    const b = new Block(this, start, n);
    this.blocks.add(b);
    return b;
  }

  release(b) {
    if (!this.blocks.delete(b)) return;
    this.addFree(b.start, b.n);
    if (b.seen) this.dirty = true;
  }

  // pack the blocks in view to the front of the GPU buffers: the near plants into the mesh,
  // the far ones into the lighter one (eye: the camera's position)
  pack(eye, scale = 1) {
    const mesh = this.mesh;
    if (!mesh) return;
    const A = buffers(mesh, this.slope), B = this.lodMesh ? buffers(this.lodMesh, this.slope) : null;
    const near = this.lodDist * scale, far = this.far * scale;
    const near2 = near * near, far2 = far * far;
    for (const b of this.blocks) {
      if (!b.seen) continue;
      if (!this.ranged) {
        this.copy(A, b.start, b.n);
        continue;
      }
      const lo = b.box.distanceToPoint(eye), hi = farthest(b.box, eye);
      if (hi < near && hi < far) this.copy(A, b.start, b.n);
      else if (B && lo >= near && hi < far) this.copy(B, b.start, b.n);
      else {
        // straddles a line: one plant at a time
        const M = this.mat;
        for (let i = b.start, e = b.start + b.n; i < e; i++) {
          const dx = M[i * 16 + 12] - eye.x, dy = M[i * 16 + 13] - eye.y, dz = M[i * 16 + 14] - eye.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= far2) continue;
          if (d2 < near2) this.copy(A, i, 1);
          else if (B) this.copy(B, i, 1);
        }
      }
    }
    finishBuffers(A);
    if (B) finishBuffers(B);
    this.dirty = false;
  }

  copy(T, a, n) {
    const e = a + n, o = T.o;
    T.M.set(this.mat.subarray(a * 16, e * 16), o * 16);
    T.C.set(this.col.subarray(a * 3, e * 3), o * 3);
    if (T.S) T.S.set(this.slp.subarray(a * 2, e * 2), o * 2);
    T.o += n;
  }
}

function buffers(mesh, slope) {
  return { mesh, o: 0, M: mesh.instanceMatrix.array, C: mesh.instanceColor.array, S: slope ? mesh.geometry.attributes.aSlope.array : null };
}

function finishBuffers(T) {
  const mesh = T.mesh, o = T.o;
  mesh.count = o;
  for (const attr of T.S ? [mesh.instanceMatrix, mesh.instanceColor, mesh.geometry.attributes.aSlope] : [mesh.instanceMatrix, mesh.instanceColor]) {
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, o * attr.itemSize);
    attr.needsUpdate = true;
  }
}

// the distance from p to the box's farthest corner
function farthest(box, p) {
  const dx = Math.max(Math.abs(p.x - box.min.x), Math.abs(p.x - box.max.x));
  const dy = Math.max(Math.abs(p.y - box.min.y), Math.abs(p.y - box.max.y));
  const dz = Math.max(Math.abs(p.z - box.min.z), Math.abs(p.z - box.max.z));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// All the pools, culled and packed together once a frame.
export class Pools {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.eye = new THREE.Vector3();
    this.sortedAt = new THREE.Vector3(1e9, 0, 0);
    this.scale = 1; // draw distances (far and LOD lines) times this: the quality setting
    this.lodShadows = true; // (off on Low: only the near plants cast)
  }

  setScale(k) {
    if (k === this.scale) return;
    this.scale = k;
    this.sortedAt.set(1e9, 0, 0); // re-sort everything next frame
  }

  get(key, make) {
    let p = this.map.get(key);
    if (!p) this.map.set(key, (p = make()));
    return p;
  }

  // camera: the view; shadow: the sun's shadow camera (or null)
  update(camera, shadow) {
    _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (shadow) _shadowFrustum.setFromProjectionMatrix(_pm.multiplyMatrices(shadow.projectionMatrix, shadow.matrixWorldInverse));
    const eye = this.eye.setFromMatrixPosition(camera.matrixWorld);
    // the near/far plants are re-sorted every few metres the camera moves
    const moved = eye.distanceToSquared(this.sortedAt) > 16;
    if (moved) this.sortedAt.copy(eye);
    for (const p of this.map.values()) {
      if (moved && p.ranged) p.dirty = true;
      if (p.lodMesh) p.lodMesh.castShadow = p.shadow && p.lodShadow && this.lodShadows;
      const far2 = (p.far * this.scale) ** 2;
      for (const b of p.blocks) {
        let seen = b.n > 0 && !b.box.isEmpty();
        if (seen && p.far < Infinity) seen = b.box.distanceToPoint(eye) ** 2 < far2;
        if (seen) seen = _frustum.intersectsBox(b.box) || (p.shadow && !!shadow && _shadowFrustum.intersectsBox(b.box));
        if (seen !== b.seen) {
          b.seen = seen;
          p.dirty = true;
        }
      }
      if (p.dirty) p.pack(this.sortedAt, this.scale);
    }
  }

  // draw calls and instances drawn, for the perf scripts
  stats() {
    let meshes = 0, drawn = 0, slots = 0;
    for (const p of this.map.values()) {
      for (const m of [p.mesh, p.lodMesh]) {
        if (m?.count) meshes++;
        drawn += m?.count || 0;
      }
      slots += p.cap;
    }
    return { pools: this.map.size, meshes, drawn, slots };
  }
}
