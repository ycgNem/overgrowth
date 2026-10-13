// The Blight: creatures that pour out of the rifts at night and march on the Heartwood.
//
// Movement follows the shared flow field, with a little separation so a swarm spreads
// out instead of stacking. Enemies bite whatever is in their way: a barricade or tower
// standing in the next cell, the player if they come close, and finally the Heart.
// Legs, jaw, head and tail are animated procedurally on the Blender model's parts.
import * as THREE from 'three';
import { cloneModel, part } from '../assets/Models.js';
import { setFlash } from '../art/merge.js';
import { terrainHeight } from '../world/WorldGen.js';
import { clamp, damp, angleDelta } from '../utils/math.js';
import { GOAL_RADIUS } from './Base.js';

export const ENEMY_TYPES = {
  blightling: {
    name: 'Blightling', model: 'blightling', hp: 40, speed: 3.5, radius: 0.45, dmg: 8, rate: 0.85, reach: 1.25,
    aggro: 6, chest: 0.6, loot: 'blightling', gait: 11, swing: 0.7, scale: 1,
  },
  rotboar: {
    name: 'Rotboar', model: 'rotboar', hp: 240, speed: 2.2, radius: 0.95, dmg: 22, rate: 1.4, reach: 1.9,
    aggro: 2.6, chest: 0.9, loot: 'rotboar', gait: 6, swing: 0.45, scale: 1, wallBreaker: 1.8,
  },
};

const _v = new THREE.Vector3();

export class Enemies {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.kills = 0;
  }

  get alive() {
    return this.list.filter((e) => !e.dying).length;
  }

  spawn(type, x, z, hpScale = 1) {
    const def = ENEMY_TYPES[type];
    const obj = cloneModel(def.model, { own: true });
    obj.scale.setScalar(def.scale);
    const e = {
      type, def, obj,
      pos: new THREE.Vector3(x, terrainHeight(x, z), z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      slow: 1, slowT: 0, phase: Math.random() * 10, attackT: Math.random() * def.rate, lunge: 0,
      flash: 0, dying: false, deathT: 0, rise: 1, target: null,
      legs: ['LegFL', 'LegFR', 'LegBL', 'LegBR'].map((n) => part(obj, n)),
      head: part(obj, 'Head'), jaw: part(obj, 'Jaw'), tail: part(obj, 'Tail'),
    };
    for (const k of ['head', 'jaw', 'tail']) if (e[k]) e[k].userData.rest = e[k].rotation.clone();
    for (const l of e.legs) if (l) l.userData.rest = l.rotation.clone();
    obj.position.copy(e.pos);
    obj.position.y -= 1.2; // climbs out of the rift
    this.scene.add(obj);
    this.list.push(e);
    return e;
  }

  // Damage one enemy. Returns true if this hit killed it.
  damage(e, n, ctx, knock) {
    if (e.dying) return false;
    e.hp -= n;
    e.flash = 1;
    if (knock) e.vel.addScaledVector(knock, 1 / (e.def.radius * 2));
    if (e.hp <= 0) {
      e.dying = true;
      e.deathT = 0;
      this.kills++;
      ctx.onKill?.(e);
      return true;
    }
    ctx.onHurt?.(e);
    return false;
  }

  slowDown(e, factor, time) {
    e.slow = Math.min(e.slow, factor);
    e.slowT = Math.max(e.slowT, time);
  }

  inRadius(x, z, r) {
    return this.list.filter((e) => !e.dying && (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < (r + e.def.radius) ** 2);
  }

  clear() {
    for (const e of this.list) this.scene.remove(e.obj);
    this.list = [];
  }

  // ctx: { field, base, player, playerAlive, buildings, hitPlayer(dmg, e), hitBuilding(b, dmg, e), hitBase(dmg, e), audio }
  update(dt, t, ctx) {
    const { field, base, player } = ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const def = e.def;
      e.flash = Math.max(0, e.flash - dt * 6);
      setFlash(e.obj, e.flash * 1.4, e.flash * 1.1, e.flash * 1.4);

      if (e.dying) {
        e.deathT += dt;
        e.obj.rotation.z = Math.min(1.5, e.deathT * 4) * (e.yaw > 0 ? 1 : -1);
        e.obj.position.y = e.pos.y - Math.max(0, e.deathT - 0.5) * 1.2;
        if (e.deathT > 1.4) {
          this.scene.remove(e.obj);
          this.list.splice(i, 1);
        }
        continue;
      }

      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slow = 1;
      }
      const speed = def.speed * e.slow;

      // ---- choose what to go for
      const toBase = Math.hypot(base.x - e.pos.x, base.z - e.pos.z);
      const toPlayer = Math.hypot(player.x - e.pos.x, player.z - e.pos.z);
      let want = null; // desired direction
      let attack = null; // { kind, ref, dist }
      if (ctx.playerAlive && toPlayer < def.aggro && Math.abs(player.y - e.pos.y) < 2.5) {
        want = { x: (player.x - e.pos.x) / toPlayer, z: (player.z - e.pos.z) / toPlayer };
        if (toPlayer < def.reach + 0.35) attack = { kind: 'player' };
      } else if (toBase < GOAL_RADIUS + def.radius) {
        want = { x: (base.x - e.pos.x) / toBase, z: (base.z - e.pos.z) / toBase };
        attack = { kind: 'base' };
      } else {
        const d = field.dirAt(e.pos.x, e.pos.z);
        if (d) {
          want = d;
          // a building in the way: chew through it
          const b = field.blockerAt(d.next) || field.blockerAt(field.idx(e.pos.x, e.pos.z));
          if (b && b.blocks && !b.dead) {
            const gap = b.distTo(e.pos.x, e.pos.z) - def.radius;
            if (gap < def.reach * 0.6) attack = { kind: 'building', ref: b };
          }
        } else {
          want = { x: (base.x - e.pos.x) / toBase, z: (base.z - e.pos.z) / toBase };
        }
      }

      // ---- steer: desired velocity + separation from the pack
      let wx = want.x * speed, wz = want.z * speed;
      if (attack) {
        wx *= 0.05;
        wz *= 0.05;
      }
      for (const o of this.list) {
        if (o === e || o.dying) continue;
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
        const min = (def.radius + o.def.radius) * 1.1;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / min;
          wx += (dx / d) * push * 4;
          wz += (dz / d) * push * 4;
        }
      }
      e.vel.x = damp(e.vel.x, wx, 6, dt);
      e.vel.z = damp(e.vel.z, wz, 6, dt);
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;

      // solid things push back: buildings, the Heartwood trunk, the player
      for (const b of ctx.buildings) {
        if (!b.blocks || b.dead) continue;
        b.pushOut(e.pos, def.radius);
      }
      const db = Math.hypot(e.pos.x - base.x, e.pos.z - base.z);
      const core = 1.3 + def.radius;
      if (db < core) {
        e.pos.x = base.x + ((e.pos.x - base.x) / db) * core;
        e.pos.z = base.z + ((e.pos.z - base.z) / db) * core;
      }

      const gy = base.groundAt(e.pos.x, e.pos.z);
      e.pos.y = damp(e.pos.y, gy, 14, dt);
      e.rise = Math.max(0, e.rise - dt * 1.4);

      // ---- face where we're going (or what we're biting)
      const fx = attack ? want.x : e.vel.x, fz = attack ? want.z : e.vel.z;
      if (fx * fx + fz * fz > 0.01) {
        const target = Math.atan2(fx, fz);
        e.yaw += angleDelta(e.yaw, target) * Math.min(1, dt * 8);
      }

      // ---- attack
      e.attackT -= dt;
      if (attack && e.attackT <= 0) {
        e.attackT = def.rate;
        e.lunge = 1;
        if (attack.kind === 'player') ctx.hitPlayer(def.dmg, e);
        else if (attack.kind === 'base') ctx.hitBase(def.dmg, e);
        else if (attack.kind === 'building') ctx.hitBuilding(attack.ref, def.dmg * (def.wallBreaker || 1), e);
      }
      e.lunge = Math.max(0, e.lunge - dt * 4);

      // ---- animate
      const hs = Math.hypot(e.vel.x, e.vel.z);
      e.phase += dt * def.gait * clamp(hs / def.speed, 0.15, 1.3);
      const sw = def.swing * clamp(hs / def.speed, 0, 1);
      const pairs = [0, Math.PI, Math.PI, 0];
      e.legs.forEach((l, k) => {
        if (!l) return;
        l.rotation.x = l.userData.rest.x + Math.sin(e.phase + pairs[k]) * sw;
      });
      if (e.head) {
        e.head.rotation.x = e.head.userData.rest.x + Math.sin(e.phase * 2) * 0.05 + e.lunge * 0.35;
        e.head.rotation.y = e.head.userData.rest.y + Math.sin(t * 1.7 + e.phase) * 0.12;
      }
      if (e.jaw) e.jaw.rotation.x = e.jaw.userData.rest.x + (attack ? 0.25 + e.lunge * 0.5 : Math.sin(t * 6 + e.phase) * 0.08);
      if (e.tail) e.tail.rotation.y = e.tail.userData.rest.y + Math.sin(e.phase * 0.5) * 0.4;

      const bob = Math.abs(Math.sin(e.phase)) * 0.04 * clamp(hs, 0, 1);
      e.obj.position.set(e.pos.x, e.pos.y + bob - e.rise * 1.2, e.pos.z);
      e.obj.rotation.set(0, e.yaw, 0);
      e.obj.translateZ(e.lunge * 0.25);
    }
  }

  // world-space aim point (chest height)
  chest(e) {
    return _v.set(e.pos.x, e.pos.y + e.def.chest, e.pos.z);
  }
}
