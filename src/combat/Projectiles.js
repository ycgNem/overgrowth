// What the player throws and shoots: slingshot stones (and scrap shot) on a ballistic arc, and
// firepots that burst into a patch of burning ground. Hits are tested along each step of
// flight (a swept sphere), so fast stones can't tunnel through a Blightling.
import * as THREE from 'three';
import { terrainHeight } from '../world/WorldGen.js';

const stoneGeo = new THREE.DodecahedronGeometry(0.08, 0);
// a short pale streak behind each stone, so you can follow your shot
const trailGeo = new THREE.CylinderGeometry(0.012, 0.035, 1, 6, 1, true);
trailGeo.rotateX(Math.PI / 2);
trailGeo.translate(0, 0, -0.5);
const trailMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e8a7e, roughness: 0.9 });
const scrapMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6, metalness: 0.5 });
const potGeo = new THREE.SphereGeometry(0.09, 10, 8);
const potMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.1, emissive: 0x4a2000, emissiveIntensity: 0.8 });

const _seg = new THREE.Vector3();
const _to = new THREE.Vector3();
const _bc = new THREE.Vector3();

// distance from point p to segment ab
function segDist(a, b, p) {
  _seg.subVectors(b, a);
  const l2 = _seg.lengthSq();
  const t = l2 > 0 ? Math.max(0, Math.min(1, _to.subVectors(p, a).dot(_seg) / l2)) : 0;
  return _to.copy(a).addScaledVector(_seg, t).distanceTo(p);
}

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.fires = []; // burning patches on the ground
  }

  stone(from, vel, dmg, { crit = false, scrap = false } = {}) {
    const mesh = new THREE.Mesh(stoneGeo, scrap ? scrapMat : stoneMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.position.copy(from);
    this.scene.add(trail);
    this.list.push({ kind: 'stone', mesh, trail, pos: from.clone(), vel: vel.clone(), dmg, crit, scrap, age: 0 });
  }

  firepot(from, vel) {
    const mesh = new THREE.Mesh(potGeo, potMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.list.push({ kind: 'pot', mesh, pos: from.clone(), vel: vel.clone(), age: 0 });
  }

  // ctx: { enemies, particles, audio, lights, damageCtx, onStoneLand(pos, scrap), base }
  update(dt, ctx) {
    const { enemies, particles } = ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.age += dt;
      const prev = s.pos.clone();
      s.vel.y -= (s.kind === 'pot' ? 14 : 7.5) * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.x += dt * 9;
      s.mesh.rotation.z += dt * 6;
      if (s.trail) {
        s.trail.position.copy(s.pos);
        s.trail.lookAt(_to.copy(s.pos).add(s.vel));
        s.trail.scale.set(1, 1, Math.min(1.6, s.vel.length() * 0.05) * Math.min(1, s.age * 8));
      }
      if (s.kind === 'pot' && Math.random() < dt * 30) particles.embers(s.pos.clone(), 1, 0.05);
      // enemies along the step
      let hit = null;
      for (const e of enemies.list) {
        if (e.dying || e.rise > 0.6) continue;
        const r = e.def.radius * e.def.scale * 0.75 + (s.kind === 'pot' ? 0.25 : 0.14);
        const c = enemies.chest(e);
        if (segDist(prev, s.pos, c) < r + (e.def.flying ? 0.25 : 0)) {
          hit = e;
          break;
        }
      }
      // a Blight Bloom: a squat target round its pods
      let bloom = null;
      if (!hit && ctx.blooms) {
        for (const b of ctx.blooms.list) {
          if (b.dead) continue;
          _bc.set(b.x, b.cy, b.z);
          if (segDist(prev, s.pos, _bc) < 1.15) {
            bloom = b;
            break;
          }
        }
      }
      const ground = terrainHeight(s.pos.x, s.pos.z);
      const landed = s.pos.y <= ground + 0.03;
      if (bloom) {
        if (s.kind === 'stone') ctx.onBloomHit?.(bloom, s.dmg, s.pos.clone(), s.crit);
        else this.burst(s.pos.clone(), ctx);
        this.scene.remove(s.mesh);
        if (s.trail) this.scene.remove(s.trail);
        this.list.splice(i, 1);
        continue;
      }
      if (!hit && !landed && s.age < 6) continue;
      if (s.kind === 'stone') {
        if (hit) {
          const knock = new THREE.Vector3(s.vel.x, 0, s.vel.z).normalize().multiplyScalar(s.crit ? 5 : 3);
          enemies.damage(hit, s.dmg, ctx.damageCtx, knock, { source: 'sling', crit: s.crit, stagger: s.crit ? 0.35 : 0.2 });
          particles.chipBurst(s.pos.clone(), 0x6a3a7a, s.crit ? 14 : 8, hit.pos.y);
          ctx.audio.stoneHit?.(s.crit);
          ctx.onHitmark?.(hit.dying, s.crit);
        } else if (landed) {
          s.pos.y = ground + 0.05;
          particles.chipBurst(s.pos.clone(), 0x7a7268, 5, ground);
          ctx.audio.stone?.();
          ctx.onStoneLand?.(s.pos.clone(), s.scrap);
        }
      } else {
        this.burst(s.pos.clone(), ctx);
      }
      this.scene.remove(s.mesh);
      if (s.trail) this.scene.remove(s.trail);
      this.list.splice(i, 1);
    }

    // burning patches set alight whatever walks through
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      f.tick -= dt;
      const k = Math.min(1, f.t / 1.5);
      if (Math.random() < dt * 40 * k) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * f.r;
        const x = f.pos.x + Math.cos(a) * r, z = f.pos.z + Math.sin(a) * r;
        particles.embers(new THREE.Vector3(x, terrainHeight(x, z) + 0.1, z), 1, 0.1, Math.random() < 0.5 ? 0xffb040 : 0xff6020);
      }
      ctx.lights?.request(f.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a2a, 30 * k, 12, 2);
      if (f.tick <= 0) {
        f.tick = 0.4;
        for (const e of enemies.inRadius(f.pos.x, f.pos.z, f.r, { ground: true })) enemies.ignite(e, 10, 3);
      }
      if (f.t <= 0) this.fires.splice(i, 1);
    }
  }

  burst(pos, ctx) {
    const { enemies, particles } = ctx;
    const R = 3.4;
    for (const e of enemies.inRadius(pos.x, pos.z, R)) {
      enemies.ignite(e, 12, 4);
      enemies.damage(e, 18, ctx.damageCtx, null, { source: 'fire' });
    }
    // fire is the surest cure for a Bloom
    for (const b of ctx.blooms?.list || []) {
      if (!b.dead && Math.hypot(b.x - pos.x, b.z - pos.z) < R + 1.2) ctx.onBloomHit?.(b, 55, new THREE.Vector3(b.x, b.cy, b.z), false);
    }
    particles.embers(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 40, 1.2, 0xffa040);
    particles.sporeBurst(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xff7020, 24, 1.2);
    particles.ring(pos, R, 0xff8030, 0.5);
    ctx.lights?.flash(pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff8a30, 80, 0.35);
    ctx.audio.firepot?.();
    this.fires.push({ pos: pos.clone(), r: R * 0.8, t: 5, tick: 0 });
  }
}
