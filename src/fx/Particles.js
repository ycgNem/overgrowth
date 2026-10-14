// Pooled instanced quads for leaf bursts, wood chips, dust and sparks.
import * as THREE from 'three';
import { glowTexture } from '../art/textures.js';
import { addPackedNormal, patch } from '../art/shaders.js';

// the dead-leaf photos' mean (linear) luminance over their opaque pixels
const LEAF_LUM = 0.054;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Pool {
  // cells: atlas rects to pick from, one per particle (an aCell attribute the material reads)
  constructor(scene, material, count, cells = null) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.cells = cells;
    if (cells) geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
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
    if (this.cells && !o.cell) o.cell = this.cells[Math.floor(Math.random() * this.cells.length)];
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
      let size = p.size * (p.shrink ? fade : 1);
      // glows and puffs right in your face wash the screen out: fade them out up close
      let near = 1;
      if (p.billboard) {
        const d = p.pos.distanceTo(camera.position);
        near = Math.min(1, Math.max(0, (d - 0.8) / 2.7));
        near = near * near * (3 - 2 * near);
        if (!p.additive) size *= 0.25 + 0.75 * near;
      }
      if (p.billboard) _q.copy(camera.quaternion);
      else _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z));
      _m.compose(p.pos, _q, _s.set(size * (p.cell?.aspect ?? 1), size, size));
      this.mesh.setMatrixAt(n, _m);
      if (p.cell) {
        const c = p.cell;
        this.mesh.geometry.attributes.aCell.array.set([c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0], n * 4);
      }
      this.mesh.setColorAt(n, _c.copy(p.color).multiplyScalar(p.additive ? fade * near : 1));
      n++;
    }
    this.items = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.cells) this.mesh.geometry.attributes.aCell.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene, lib) {
    // leaves: the dead-leaf photos, each particle its own cell, recoloured per instance (the
    // photo's luminance times the instance colour) so a cut throws leaves of the plant's green
    const A = lib.atlas.debris;
    const leafMat = new THREE.MeshStandardMaterial({
      map: A.map, normalMap: A.nmap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0,
    });
    addPackedNormal(leafMat);
    patch(leafMat, 'leafparticle', (shader) => {
      shader.vertexShader = 'attribute vec4 aCell;\n' + shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = aCell.xy + uv * aCell.zw;
        vNormalMapUv = vMapUv;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = vec3(clamp(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)) / ${LEAF_LUM.toFixed(4)}, 0.25, 2.2));`);
    });
    const cells = ['dead0', 'dead1', 'dead2', 'dead3', 'dead4', 'dead5', 'dead6', 'dead7'].map((n) => lib.cell('debris', n));
    this.leaves = new Pool(scene, leafMat, 500, cells);
    this.chips = new Pool(scene, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), 200);
    this.glow = new Pool(scene, new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }), 300);
    this.smoke = new Pool(scene, new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, opacity: 0.45, depthWrite: false, fog: true,
    }), 160);
    this.scene = scene;
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.warnGeo = new THREE.RingGeometry(0.955, 1, 72);
    this.warnGeo.rotateX(-Math.PI / 2);
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
    // leaves in the plant's own colour, and every fourth a brown scrap of litter kicked up
    for (let i = 0; i < count; i++) {
      const dead = i % 4 === 3;
      this.leaves.spawn(this.base(pos, {
        spread: 0.8, speed: 5, up: 4.5, life: 2.6, size: dead ? 0.14 : 0.2, gravity: 3.5, drag: 2.2, flutter: 9,
        color: dead ? 0x7a5a36 : color, floor,
      }));
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

  // a soft cloud of glowing spores (mortar hits, Blight deaths)
  sporeBurst(pos, color, count = 30, sizeMul = 1) {
    for (let i = 0; i < count; i++) {
      const p = this.base(pos, { spread: 0.8, speed: 5, up: 3, life: 1.4, size: 0.45 * sizeMul, gravity: -0.6, drag: 3, color });
      p.billboard = true;
      p.additive = true;
      p.shrink = true;
      this.glow.spawn(p);
    }
  }

  // fire: hot sparks that rise and wink out (burning Blight, the brazier)
  embers(pos, count = 4, spread = 0.3, color = 0xff8a30) {
    for (let i = 0; i < count; i++) {
      const p = this.base(pos, { spread, speed: 1.2, up: 2.5, life: 0.8, size: 0.13, gravity: -3, drag: 1.5, flutter: 6, color });
      p.billboard = true;
      p.additive = true;
      p.shrink = true;
      this.glow.spawn(p);
    }
  }

  // motes of blight-ash drifting up from dissolving creatures and open rifts
  ash(pos, count = 2, spread = 0.4, color = 0xa050e0) {
    for (let i = 0; i < count; i++) {
      const p = this.base(pos, { spread: spread * 2, speed: 0.8, up: 1.6, life: 1.5, size: 0.11, gravity: -1.2, drag: 1, flutter: 3, color });
      p.billboard = true;
      p.additive = true;
      p.shrink = true;
      this.glow.spawn(p);
    }
  }

  // a puff of dust kicked out along the ground (placing a building, slams, collapses)
  dust(pos, count = 16, radius = 1, color = 0x8a7a5a) {
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const p = this.base(pos, { spread: 0.2, speed: 0, up: 0.8, life: 1.1, size: 0.9 * radius, gravity: -0.3, drag: 2.5, color });
      p.vel.x = Math.cos(a) * 3.2 * radius;
      p.vel.z = Math.sin(a) * 3.2 * radius;
      p.pos.x += Math.cos(a) * radius * 0.6;
      p.pos.z += Math.sin(a) * radius * 0.6;
      p.billboard = true;
      p.shrink = true;
      this.smoke.spawn(p);
    }
  }

  // an expanding ring on the ground (boss slam, spore pod impact)
  ring(pos, radius = 4, color = 0xc070ff, life = 0.6) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    m.position.copy(pos);
    m.position.y += 0.12;
    this.scene.add(m);
    this.rings.push({ m, t: 0, life, radius });
  }

  // A warning circle on the ground: a boss attack lands inside it when it closes.
  warn(pos, radius = 6, life = 0.75, color = 0xff4060) {
    const m = new THREE.Mesh(this.warnGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    m.position.copy(pos);
    m.position.y += 0.15;
    m.scale.setScalar(radius);
    this.scene.add(m);
    // the inner ring shrinks onto the edge as the hit gets close
    const inner = new THREE.Mesh(this.warnGeo, m.material.clone());
    m.add(inner);
    this.rings.push({ m, inner, t: 0, life, radius, warn: true });
  }

  update(dt, camera) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      if (r.warn) {
        r.m.material.opacity = 0.35 + 0.35 * Math.sin(r.t * 30) ** 2;
        r.inner.scale.setScalar(0.15 + 0.85 * k);
        r.inner.material.opacity = 0.25 + 0.6 * k;
        if (k >= 1) {
          this.scene.remove(r.m);
          r.m.material.dispose();
          r.inner.material.dispose();
          this.rings.splice(i, 1);
        }
        continue;
      }
      r.m.scale.setScalar(0.2 + r.radius * (1 - (1 - k) ** 3));
      r.m.material.opacity = Math.max(0, 1 - k) * 0.9;
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    this.smoke.update(dt, camera);
    this.leaves.update(dt, camera);
    this.chips.update(dt, camera);
    this.glow.update(dt, camera);
  }
}
