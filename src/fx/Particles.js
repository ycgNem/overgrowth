// Pooled instanced quads for leaf bursts, wood chips, dust and sparks.
import * as THREE from 'three';
import { glowTexture } from '../art/textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Pool {
  constructor(scene, material, count) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    scene.add(this.mesh);
    this.items = [];
    this.max = count;
  }
  spawn(o) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(o);
  }
  update(dt, camera) {
    let n = 0;
    const alive = [];
    for (const p of this.items) {
      p.life -= dt;
      if (p.life <= 0) continue;
      alive.push(p);
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      if (p.flutter) {
        p.vel.x += Math.sin(p.life * 7 + p.seed) * p.flutter * dt;
        p.vel.z += Math.cos(p.life * 5 + p.seed) * p.flutter * dt;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        p.vel.set(0, 0, 0);
        p.spin.multiplyScalar(0.0);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const fade = Math.min(1, p.life / 0.4);
      const size = p.size * (p.shrink ? fade : 1);
      if (p.billboard) _q.copy(camera.quaternion);
      else _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z));
      _m.compose(p.pos, _q, _s.set(size, size, size));
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.copy(p.color).multiplyScalar(p.additive ? fade : 1));
      n++;
    }
    this.items = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene, leafTexture) {
    this.leaves = new Pool(scene, new THREE.MeshStandardMaterial({
      map: leafTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8,
    }), 500);
    this.chips = new Pool(scene, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), 200);
    this.glow = new Pool(scene, new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }), 300);
    this.rand = Math.random;
  }

  base(pos, o) {
    const r = this.rand;
    return {
      pos: pos.clone().add(_p.set((r() - 0.5) * o.spread, (r() - 0.2) * o.spread, (r() - 0.5) * o.spread)),
      vel: new THREE.Vector3((r() - 0.5) * o.speed, r() * o.up, (r() - 0.5) * o.speed),
      rot: new THREE.Vector3(r() * 6, r() * 6, r() * 6),
      spin: new THREE.Vector3((r() - 0.5) * 12, (r() - 0.5) * 12, (r() - 0.5) * 12),
      life: o.life * (0.6 + r() * 0.6), seed: r() * 100, floor: o.floor ?? -100,
      size: o.size * (0.6 + r() * 0.6), gravity: o.gravity, drag: o.drag, flutter: o.flutter || 0,
      color: new THREE.Color(o.color).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.12),
    };
  }

  leafBurst(pos, color = 0x4f7f2a, count = 22, floor) {
    // the leaf texture is already green, so tint gently toward the plant colour
    const tint = new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.55);
    for (let i = 0; i < count; i++) {
      this.leaves.spawn(this.base(pos, { spread: 0.8, speed: 5, up: 4.5, life: 2.6, size: 0.24, gravity: 3.5, drag: 2.2, flutter: 9, color: tint, floor }));
    }
  }

  chipBurst(pos, color = 0x8a6a40, count = 16, floor) {
    for (let i = 0; i < count; i++) {
      const p = this.base(pos, { spread: 0.4, speed: 6, up: 5, life: 1.6, size: 0.12, gravity: 16, drag: 0.6, color, floor });
      p.shrink = true;
      this.chips.spawn(p);
    }
  }

  sparks(pos, color = 0xffc070, count = 10) {
    for (let i = 0; i < count; i++) {
      const p = this.base(pos, { spread: 0.05, speed: 7, up: 4, life: 0.45, size: 0.12, gravity: 14, drag: 1.5, color });
      p.billboard = true;
      p.additive = true;
      p.shrink = true;
      this.glow.spawn(p);
    }
  }

  sparkle(pos, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const p = this.base(pos, { spread: 0.3, speed: 2.5, up: 2.5, life: 0.9, size: 0.18, gravity: -1, drag: 2, color });
      p.billboard = true;
      p.additive = true;
      p.shrink = true;
      this.glow.spawn(p);
    }
  }

  update(dt, camera) {
    this.leaves.update(dt, camera);
    this.chips.update(dt, camera);
    this.glow.update(dt, camera);
  }
}
