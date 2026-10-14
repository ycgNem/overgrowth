// What a machete cut leaves standing: a few short stalks sliced off at an angle, their cut
// faces pale and wet, sized to the plant that was cut. One instanced mesh; the oldest stub
// is reused when the pool is full.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../utils/rng.js';

const MAX = 160;

function stubGeometry() {
  const r = mulberry32(5);
  const parts = [];
  const side = new THREE.Color(0x4f6e2c), top = new THREE.Color(0xd9e0a8);
  for (let k = 0; k < 6; k++) {
    const rad = 0.018 + r() * 0.022, h = 0.05 + r() * 0.12;
    const g = new THREE.CylinderGeometry(rad * 0.85, rad, h, 7, 1, false);
    g.translate(0, h / 2, 0);
    // a slanted cut: the top ring sheared along x
    const p = g.attributes.position;
    const slant = 0.6 + r() * 0.5;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.99) p.setY(i, h + p.getX(i) * slant);
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const c = p.getY(i) > h * 0.6 && Math.abs(g.attributes.normal.getY(i)) > 0.5 ? top : side.clone().multiplyScalar(0.7 + 0.3 * (p.getY(i) / h));
      c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // the cap: a disc on the slanted top, pale
    const cap = new THREE.CircleGeometry(rad * 0.85, 7);
    cap.rotateX(-Math.PI / 2);
    const cp = cap.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setY(i, h + cp.getX(i) * slant + 0.001);
    const cc = new Float32Array(cp.count * 3);
    for (let i = 0; i < cp.count; i++) top.toArray(cc, i * 3);
    cap.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const a = r() * Math.PI * 2, d = r() * 0.09;
    for (const geo of [g, cap]) {
      geo.rotateY(r() * Math.PI * 2);
      geo.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      geo.deleteAttribute('uv');
      parts.push(geo.toNonIndexed());
    }
  }
  const out = mergeGeometries(parts);
  out.computeVertexNormals();
  return out;
}

export class Stubs {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(stubGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    scene.add(this.mesh);
    this.n = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._c = new THREE.Color();
  }

  // size: the cut plant's radius; tint: its colour (stems take a little of it)
  add(x, y, z, size, tint) {
    const i = this.n % MAX;
    this.n++;
    const s = Math.max(0.5, Math.min(2.2, size * 1.4));
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    this._m.compose(new THREE.Vector3(x, y - 0.01, z), this._q, new THREE.Vector3(s, s * (0.8 + Math.random() * 0.5), s));
    this.mesh.setMatrixAt(i, this._m);
    this._c.set(tint).lerp(new THREE.Color(1, 1, 1), 0.6);
    this.mesh.setColorAt(i, this._c);
    this.mesh.count = Math.min(this.n, MAX);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
