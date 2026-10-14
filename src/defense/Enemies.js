// The Blight: creatures that pour out of the rifts at night and march on the Heartwood.
//
// Walkers follow the shared flow field, with a little separation so a swarm spreads out
// instead of stacking. They bite whatever is in their way: a barricade or tower standing in
// the next cell, the player if they come close, and finally the Heart. Every bite is
// telegraphed: the head rears back and the jaw opens for a beat before the damage lands.
// Wisps fly straight over everything. The Thornback (every fifth night) slams the ground and
// calls Blightlings to it.
//
// Legs, jaw, head, wings and tail are animated procedurally on the Blender model's parts.
// Spawning and dying use the baked material's dissolve, so the Blight seeps out of the rift
// and burns away to ash.
import * as THREE from 'three';
import { cloneModel, part } from '../assets/Models.js';
import { setFlash, setRim, setDissolve } from '../art/merge.js';
import { terrainHeight } from '../world/WorldGen.js';
import { clamp, damp, angleDelta } from '../utils/math.js';
import { GOAL_RADIUS } from './Base.js';
import { glowTexture } from '../art/textures.js';

// one shared glow for every Wisp (additive, so it never darkens what's behind it)
let wispGlowMat = null;
function wispGlow() {
  if (!wispGlowMat) {
    wispGlowMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xb060ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false,
    });
  }
  const s = new THREE.Sprite(wispGlowMat);
  s.scale.setScalar(1.6);
  return s;
}

export const ENEMY_TYPES = {
  blightling: {
    name: 'Blightling', model: 'blightling', hp: 40, speed: 3.5, radius: 0.55, dmg: 8, rate: 1.0, reach: 1.4, windup: 0.32,
    aggro: 7, chest: 0.6, loot: 'blightling', gait: 10, swing: 0.7, scale: 1.35, pounce: true,
  },
  rotboar: {
    name: 'Rotboar', model: 'rotboar', hp: 240, speed: 2.2, radius: 0.95, dmg: 22, rate: 1.5, reach: 1.9, windup: 0.5,
    aggro: 5, chest: 0.9, loot: 'rotboar', gait: 6, swing: 0.45, scale: 1, wallBreaker: 1.8, heavy: 0.5, towerAggro: 6,
  },
  wisp: {
    name: 'Blight Wisp', model: 'wisp', hp: 55, speed: 3.4, radius: 0.5, dmg: 7, rate: 0.9, reach: 1.2, windup: 0.25,
    aggro: 0, chest: 0, loot: 'wisp', scale: 2.2, flying: true, altitude: 2.7,
  },
  thornback: {
    name: 'Thornback', model: 'thornback', hp: 1800, speed: 1.45, radius: 2.0, dmg: 40, rate: 2.2, reach: 3.7, windup: 0.6,
    aggro: 6, chest: 2.6, loot: 'thornback', gait: 3.2, swing: 0.32, scale: 1.4, wallBreaker: 3, heavy: 0.9, boss: true,
  },
};

const RIM = { blightling: 0xb050ff, rotboar: 0xc070ff, wisp: 0xd080ff, thornback: 0xd060e0 };
const _v = new THREE.Vector3();
const ease = (t) => 1 - (1 - t) ** 3;

export class Enemies {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.kills = 0;
    this.killsByType = {};
  }

  get alive() {
    return this.list.filter((e) => !e.dying).length;
  }

  get boss() {
    return this.list.find((e) => e.def.boss && !e.dying) || null;
  }

  spawn(type, x, z, hpScale = 1) {
    const def = ENEMY_TYPES[type];
    const obj = cloneModel(def.model, { own: true });
    obj.scale.setScalar(def.scale);
    const gy = terrainHeight(x, z);
    const e = {
      type, def, obj,
      pos: new THREE.Vector3(x, def.flying ? gy + 1 : gy, z),
      vel: new THREE.Vector3(),
      knock: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      slow: 1, slowT: 0, rootT: 0, burnT: 0, burnDps: 0, burnTick: 0, stagger: 0,
      phase: Math.random() * 10, attackT: Math.random() * def.rate, windT: 0, windTarget: null, lunge: 0,
      flash: 0, hitT: 0, barT: 0, dying: false, deathT: 0, rise: 1, leap: null, pounceCD: 1 + Math.random() * 2,
      slamCD: 6, slamT: 0, summonCD: 12, roar: 0,
      legs: ['LegFL', 'LegFR', 'LegBL', 'LegBR'].map((n) => part(obj, n)),
      head: part(obj, 'Head'), jaw: part(obj, 'Jaw'), tail: part(obj, 'Tail'),
      wings: [part(obj, 'WingL'), part(obj, 'WingR')], core: part(obj, 'Core'), sac: part(obj, 'Sac'),
    };
    for (const k of ['head', 'jaw', 'tail']) if (e[k]) e[k].userData.rest = e[k].rotation.clone();
    for (const l of e.legs) if (l) l.userData.rest = l.rotation.clone();
    for (const w of e.wings) if (w) w.userData.rest = w.rotation.clone();
    setRim(obj, 0.5, RIM[type]);
    setDissolve(obj, 0.9);
    if (type === 'wisp') {
      // a halo round the core, so it reads as a light in the dark rather than flat shards
      e.glow = wispGlow();
      e.glow.position.set(0, 0.05, 0);
      obj.add(e.glow);
    }
    obj.position.copy(e.pos);
    obj.position.y -= 1.2; // climbs out of the rift
    this.scene.add(obj);
    this.list.push(e);
    return e;
  }

  // Damage one enemy. Returns true if this hit killed it.
  // opts: { crit, source: 'melee'|'sling'|'tower'|'burn'|'trap', stagger }
  damage(e, n, ctx, knock, opts = {}) {
    if (e.dying || n <= 0) return false;
    e.hp -= n;
    e.flash = opts.source === 'burn' ? Math.max(e.flash, 0.35) : 1;
    e.hitT = 1;
    e.barT = 4;
    if (knock) e.knock.addScaledVector(knock, (1 - (e.def.heavy || 0)) / Math.max(0.6, e.def.radius * 1.6));
    if (opts.stagger && !e.def.boss) {
      e.stagger = Math.max(e.stagger, opts.stagger * (1 - (e.def.heavy || 0)));
      // a solid hit interrupts a bite that's winding up
      if (e.windT > 0 && !e.def.heavy) {
        e.windT = 0;
        e.attackT = e.def.rate * 0.6;
      }
    }
    ctx.onDamage?.(e, n, opts);
    if (e.hp <= 0) {
      e.dying = true;
      e.deathT = 0;
      e.leap = null;
      this.kills++;
      this.killsByType[e.type] = (this.killsByType[e.type] || 0) + 1;
      e.obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      ctx.onKill?.(e, opts);
      return true;
    }
    ctx.onHurt?.(e);
    return false;
  }

  slowDown(e, factor, time) {
    e.slow = Math.min(e.slow, factor);
    e.slowT = Math.max(e.slowT, time);
  }

  ignite(e, dps, time) {
    e.burnDps = Math.max(e.burnDps, dps);
    e.burnT = Math.max(e.burnT, time);
  }

  root(e, time) {
    if (e.def.flying) return;
    if (e.def.boss) this.slowDown(e, 0.5, time);
    else e.rootT = Math.max(e.rootT, time);
  }

  // ground: skip flyers (mortar splash, traps). air: only flyers.
  inRadius(x, z, r, { ground = false, air = false } = {}) {
    return this.list.filter((e) => !e.dying && !(ground && e.def.flying) && !(air && !e.def.flying)
      && (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < (r + e.def.radius) ** 2);
  }

  clear() {
    for (const e of this.list) this.scene.remove(e.obj);
    this.list = [];
  }

  // ctx: { field, base, player, playerAlive, buildings, hitPlayer(dmg, e), hitBuilding(b, dmg, e),
  //        hitBase(dmg, e), damageCtx, particles, night, speedMul, onSlam(e), summon(e), onWindup(e) }
  update(dt, t, ctx) {
    const { field, base, player } = ctx;
    const rimK = 0.08 + 0.3 * (ctx.night ?? 1);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const def = e.def;
      e.flash = Math.max(0, e.flash - dt * 9);
      e.hitT = Math.max(0, e.hitT - dt * 5);
      e.barT -= dt;
      const wind = e.windT > 0 ? 1 - e.windT / def.windup : 0;
      // hit flash is a quick violet-white pop; a winding-up bite glows hot pink at the rim
      setFlash(e.obj, e.flash * 0.5, e.flash * 0.4, e.flash * 0.5);
      // an outline to find them in the dark, never enough to wash the body out under bloom
      setRim(e.obj, Math.min(0.45, rimK + wind * 0.25));

      if (e.dying) {
        this.animateDeath(e, dt, ctx);
        if (e.deathT > 1.45) {
          this.scene.remove(e.obj);
          this.list.splice(i, 1);
        }
        continue;
      }

      // statuses
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slow = 1;
      }
      e.rootT = Math.max(0, e.rootT - dt);
      e.stagger = Math.max(0, e.stagger - dt);
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (Math.random() < dt * 14) ctx.particles?.embers(this.chest(e).clone(), 1, def.radius);
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.damage(e, e.burnDps * 0.5, ctx.damageCtx, null, { source: 'burn' });
          if (e.dying) continue;
        }
        if (e.burnT <= 0) e.burnDps = 0;
      }

      if (def.flying) this.updateFlyer(e, dt, t, ctx);
      else this.updateWalker(e, dt, t, ctx);
      if (e.dying) continue;

      // spawning: seep up out of the rift
      e.rise = Math.max(0, e.rise - dt * 1.3);
      setDissolve(e.obj, e.rise * 0.85);
    }
  }

  // ---------------------------------------------------------------- walkers
  updateWalker(e, dt, t, ctx) {
    const { field, base, player } = ctx;
    const def = e.def;
    let speed = def.speed * e.slow * (ctx.speedMul ?? 1);
    if (e.rootT > 0 || e.stagger > 0 || e.rise > 0.35 || e.slamT > 0) speed = 0;

    // ---- choose what to go for
    const toBase = Math.hypot(base.x - e.pos.x, base.z - e.pos.z);
    const toPlayer = Math.hypot(player.x - e.pos.x, player.z - e.pos.z);
    let want = null; // desired direction
    let attack = null; // { kind, ref }
    // a bloom's guards see further, but won't be drawn far from it
    const g = e.guard;
    const aggro = g ? 10 : def.aggro;
    const seesPlayer = ctx.playerAlive && toPlayer < aggro && Math.abs(player.y - e.pos.y) < 2.5
      && (!g || Math.hypot(player.x - g.x, player.z - g.z) < g.leash);
    // Rotboars break off to gore a tower that comes within reach, and stay on it until it falls
    if (def.towerAggro && !seesPlayer && !g) {
      if (e.prey && (e.prey.dead || e.prey.distTo(e.pos.x, e.pos.z) > def.towerAggro * 1.5)) e.prey = null;
      if (!e.prey) {
        let bd = def.towerAggro;
        for (const b of ctx.buildings) {
          if (b.dead || !b.def.range) continue;
          const d = b.distTo(e.pos.x, e.pos.z);
          if (d < bd) { bd = d; e.prey = b; }
        }
      }
    }
    if (seesPlayer) {
      want = { x: (player.x - e.pos.x) / toPlayer, z: (player.z - e.pos.z) / toPlayer };
      if (toPlayer < def.reach * def.scale * 0.8 + 0.4) attack = { kind: 'player' };
    } else if (g) {
      // prowl round the bloom: amble to a spot near it, pause, pick another
      e.idleT = (e.idleT ?? 0) - dt;
      if (!e.roam || Math.hypot(e.roam.x - e.pos.x, e.roam.z - e.pos.z) < 0.8) {
        if (e.idleT <= 0) {
          const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * (g.r - 2.5);
          e.roam = { x: g.x + Math.cos(a) * r, z: g.z + Math.sin(a) * r };
          e.idleT = 1.5 + Math.random() * 3;
        }
      }
      const dx = (e.roam?.x ?? g.x) - e.pos.x, dz = (e.roam?.z ?? g.z) - e.pos.z, dl = Math.hypot(dx, dz) || 1;
      want = dl < 0.8 ? { x: 0, z: 0 } : { x: dx / dl, z: dz / dl };
      speed *= 0.35;
    } else if (e.prey) {
      const dx = e.prey.x - e.pos.x, dz = e.prey.z - e.pos.z, dl = Math.hypot(dx, dz) || 1;
      want = { x: dx / dl, z: dz / dl };
      if (e.prey.distTo(e.pos.x, e.pos.z) - def.radius < def.reach * 0.6) attack = { kind: 'building', ref: e.prey };
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

    // ---- pounce: Blightlings leap at a player a few metres off, up into view
    e.pounceCD -= dt;
    if (def.pounce && !e.leap && seesPlayer && e.rise <= 0 && e.rootT <= 0 && e.stagger <= 0 && e.pounceCD <= 0
      && toPlayer > 2.2 && toPlayer < 5.2 && e.windT <= 0) {
      const k = (toPlayer - 1.1) / toPlayer;
      e.leap = {
        t: 0, dur: 0.5, from: e.pos.clone(),
        to: new THREE.Vector3(e.pos.x + (player.x - e.pos.x) * k, 0, e.pos.z + (player.z - e.pos.z) * k), hit: false,
      };
      e.pounceCD = 3.5 + Math.random() * 2.5;
      ctx.onWindup?.(e, 'pounce');
    }
    if (e.leap) {
      const L = e.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      e.pos.x = L.from.x + (L.to.x - L.from.x) * k;
      e.pos.z = L.from.z + (L.to.z - L.from.z) * k;
      const gy = base.groundAt(e.pos.x, e.pos.z);
      e.pos.y = gy + Math.sin(k * Math.PI) * 1.3;
      if (!L.hit && k > 0.75 && ctx.playerAlive && Math.hypot(player.x - e.pos.x, player.z - e.pos.z) < 1.5) {
        L.hit = true;
        ctx.hitPlayer(def.dmg * 1.2, e);
      }
      if (k >= 1) e.leap = null;
      e.yaw += angleDelta(e.yaw, Math.atan2(L.to.x - L.from.x, L.to.z - L.from.z)) * Math.min(1, dt * 12);
      e.phase += dt * 4;
      this.pose(e, dt, t, 1, 0, 0.6);
      this.place(e, 0, -0.5 + k);
      return;
    }

    // ---- steer: desired velocity + separation from the pack
    let wx = want.x * speed, wz = want.z * speed;
    if (attack) {
      wx *= 0.05;
      wz *= 0.05;
    }
    for (const o of this.list) {
      if (o === e || o.dying || o.def.flying) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const min = (def.radius + o.def.radius) * 1.1;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) / min;
        const w = def.boss ? 0.5 : 4;
        wx += (dx / d) * push * w;
        wz += (dz / d) * push * w;
      }
    }
    e.vel.x = damp(e.vel.x, wx, 6, dt);
    e.vel.z = damp(e.vel.z, wz, 6, dt);
    e.knock.multiplyScalar(Math.exp(-dt * 6));
    e.pos.x += (e.vel.x + e.knock.x) * dt;
    e.pos.z += (e.vel.z + e.knock.z) * dt;

    // solid things push back: buildings, the Heartwood trunk
    for (const b of ctx.buildings) {
      if (!b.blocks || b.dead) continue;
      b.pushOut(e.pos, def.radius);
    }
    const db = Math.hypot(e.pos.x - base.x, e.pos.z - base.z);
    const core = base.trunkR + def.radius;
    if (db < core) {
      e.pos.x = base.x + ((e.pos.x - base.x) / db) * core;
      e.pos.z = base.z + ((e.pos.z - base.z) / db) * core;
    }
    const gy = base.groundAt(e.pos.x, e.pos.z);
    e.pos.y = damp(e.pos.y, gy, 14, dt);

    // ---- face where we're going (or what we're biting)
    const fx = attack ? want.x : e.vel.x, fz = attack ? want.z : e.vel.z;
    if (fx * fx + fz * fz > 0.01 && e.rootT <= 0) {
      e.yaw += angleDelta(e.yaw, Math.atan2(fx, fz)) * Math.min(1, dt * (def.boss ? 3 : 8));
    }

    // ---- boss abilities: ground slam, and calling the swarm
    if (def.boss) this.bossAbilities(e, dt, ctx, attack, toPlayer);

    // ---- attack: wind up, then bite if the target is still in reach
    e.attackT -= dt;
    if (e.windT > 0) {
      e.windT -= dt;
      if (e.windT <= 0) {
        e.lunge = 1;
        e.attackT = def.rate;
        const a = e.windTarget;
        if (a && attack && a.kind === attack.kind) {
          if (a.kind === 'player') ctx.hitPlayer(def.dmg, e);
          else if (a.kind === 'base') ctx.hitBase(def.dmg, e);
          else if (a.kind === 'building' && attack.ref === a.ref) ctx.hitBuilding(a.ref, def.dmg * (def.wallBreaker || 1), e);
        }
        e.windTarget = null;
      }
    } else if (attack && e.attackT <= 0 && e.rootT <= 0 && e.stagger <= 0 && e.slamT <= 0 && e.rise <= 0.2) {
      e.windT = def.windup;
      e.windTarget = attack;
      ctx.onWindup?.(e, attack.kind);
    }
    e.lunge = Math.max(0, e.lunge - dt * 4);

    // ---- animate
    const hs = Math.hypot(e.vel.x, e.vel.z);
    e.phase += dt * def.gait * clamp(hs / def.speed, 0.15, 1.3);
    const wind = e.windT > 0 ? ease(1 - e.windT / def.windup) : 0;
    this.pose(e, dt, t, clamp(hs / def.speed, 0, 1), wind, attack ? 0.25 : 0);
    // rooted: struggle against the vines
    const struggle = e.rootT > 0 ? Math.sin(t * 28 + e.phase) * 0.12 : 0;
    this.place(e, struggle, 0);
  }

  bossAbilities(e, dt, ctx, attack, toPlayer) {
    e.slamCD -= dt;
    e.summonCD -= dt;
    if (e.slamT > 0) {
      const before = e.slamT;
      e.slamT -= dt;
      // impact at 0.25 s left
      if (before > 0.25 && e.slamT <= 0.25) ctx.onSlam?.(e);
    } else if (e.slamCD <= 0 && e.rise <= 0 && (attack || toPlayer < 6.5)) {
      e.slamT = 1.0;
      e.slamCD = 6.5 + Math.random() * 2;
      e.windT = 0;
      // mark the ground it is about to hit (the slam lands 0.75 s later, radius 6)
      ctx.particles?.warn(e.pos, 6, 0.75);
      ctx.onWindup?.(e, 'slam');
    }
    if (e.summonCD <= 0 && e.rise <= 0) {
      e.summonCD = 14 + Math.random() * 4;
      e.roar = 1;
      ctx.summon?.(e);
    }
    e.roar = Math.max(0, e.roar - dt * 0.8);
  }

  // ---------------------------------------------------------------- flyers
  updateFlyer(e, dt, t, ctx) {
    const { base } = ctx;
    const def = e.def;
    const speed = (e.stagger > 0 || e.rise > 0.4 ? 0.3 : 1) * def.speed * e.slow * (ctx.speedMul ?? 1);
    const dx = base.x - e.pos.x, dz = base.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const ring = GOAL_RADIUS + 0.6;
    let wx, wz;
    let attack = false;
    if (d > ring) {
      // drift in on a lazy spiral
      const sw = Math.sin(t * 0.7 + e.phase) * 0.45;
      wx = (dx / d + (-dz / d) * sw) * speed;
      wz = (dz / d + (dx / d) * sw) * speed;
    } else {
      // circle the Heart and dive at it
      wx = (-dz / d) * speed * 0.5 + (dx / d) * (d - ring + 0.4) * 2;
      wz = (dx / d) * speed * 0.5 + (dz / d) * (d - ring + 0.4) * 2;
      attack = true;
    }
    for (const o of this.list) {
      if (o === e || o.dying || !o.def.flying) continue;
      const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < 1.8 && d2 > 1e-6) {
        const k = Math.sqrt(d2);
        wx += (ox / k) * 2;
        wz += (oz / k) * 2;
      }
    }
    e.vel.x = damp(e.vel.x, wx, 3, dt);
    e.vel.z = damp(e.vel.z, wz, 3, dt);
    e.knock.multiplyScalar(Math.exp(-dt * 4));
    e.pos.x += (e.vel.x + e.knock.x) * dt;
    e.pos.z += (e.vel.z + e.knock.z) * dt;
    e.lunge = Math.max(0, e.lunge - dt * 3);
    const gy = Math.max(terrainHeight(e.pos.x, e.pos.z), base.y + 0.6);
    const alt = def.altitude + Math.sin(t * 1.9 + e.phase) * 0.35 - e.lunge * 1.4 - e.rise * 1.5;
    e.pos.y = damp(e.pos.y, gy + alt, 3, dt);
    if (Math.hypot(e.vel.x, e.vel.z) > 0.2) e.yaw += angleDelta(e.yaw, attack ? Math.atan2(dx, dz) : Math.atan2(e.vel.x, e.vel.z)) * Math.min(1, dt * 4);

    e.attackT -= dt;
    if (e.windT > 0) {
      e.windT -= dt;
      if (e.windT <= 0) {
        e.lunge = 1;
        e.attackT = def.rate;
        if (attack) ctx.hitBase(def.dmg, e);
      }
    } else if (attack && e.attackT <= 0 && e.rise <= 0) {
      e.windT = def.windup;
      ctx.onWindup?.(e, 'base');
    }

    // wings beat, the mantle trails, the core throbs
    const flap = Math.sin(t * 11 + e.phase);
    const [wl, wr] = e.wings;
    if (wl) wl.rotation.z = wl.userData.rest.z - flap * 0.55;
    if (wr) wr.rotation.z = wr.userData.rest.z + flap * 0.55;
    if (e.tail) e.tail.rotation.x = e.tail.userData.rest.x + Math.sin(t * 3 + e.phase) * 0.25 + Math.hypot(e.vel.x, e.vel.z) * 0.08;
    if (e.core) e.core.scale.setScalar(1 + Math.sin(t * 6 + e.phase) * 0.12 + (e.windT > 0 ? 0.35 : 0));
    if (e.glow) e.glow.scale.setScalar((1.5 + Math.sin(t * 6 + e.phase) * 0.15 + (e.windT > 0 ? 0.6 : 0)) * (1 - e.rise));
    // it sheds motes of blight-light as it flies
    if (ctx.particles && Math.random() < dt * 9) {
      _v.copy(e.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.2 + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4));
      ctx.particles.ash(_v.clone(), 1, 0.15, 0xc070ff);
    }
    const bank = clamp(-angleDelta(e.yaw, Math.atan2(e.vel.x, e.vel.z)) * 0.5, -0.5, 0.5);
    e.obj.position.copy(e.pos);
    e.obj.position.y += flap * 0.06;
    e.obj.rotation.set(0.15 + e.lunge * 0.5 - e.hitT * 0.4, e.yaw, bank);
  }

  // ---------------------------------------------------------------- shared animation
  // move: 0..1 gait amount; wind: 0..1 bite wind-up; open: extra jaw
  pose(e, dt, t, move, wind, open) {
    const def = e.def;
    const sw = (def.swing || 0) * move;
    const pairs = [0, Math.PI, Math.PI, 0];
    e.legs.forEach((l, k) => {
      if (!l) return;
      l.rotation.x = l.userData.rest.x + Math.sin(e.phase + pairs[k]) * sw;
      l.rotation.z = damp(l.rotation.z, l.userData.rest.z, 10, dt);
    });
    const slam = e.slamT > 0 ? e.slamT : 0;
    if (e.head) {
      e.head.rotation.x = e.head.userData.rest.x + Math.sin(e.phase * 2) * 0.05 - wind * 0.55 + e.lunge * 0.45 - e.roar * 0.5;
      e.head.rotation.y = e.head.userData.rest.y + Math.sin(t * 1.7 + e.phase) * 0.12 * (1 - wind);
    }
    if (e.jaw) e.jaw.rotation.x = e.jaw.userData.rest.x + wind * 0.75 + e.roar * 0.6 + open + (wind ? 0 : Math.sin(t * 6 + e.phase) * 0.08);
    if (e.tail) e.tail.rotation.y = e.tail.userData.rest.y + Math.sin(e.phase * 0.5) * 0.4;
    if (e.sac) e.sac.scale.setScalar(1 + Math.sin(t * 3.2) * 0.07 + slam * 0.15 + e.flash * 0.1);
    void slam;
  }

  // body transform: bob, flinch, wind-up rear, lunge, slam
  place(e, struggle, leapPitch) {
    const def = e.def;
    const hs = Math.hypot(e.vel.x, e.vel.z);
    const bob = Math.abs(Math.sin(e.phase)) * 0.04 * clamp(hs, 0, 1);
    const wind = e.windT > 0 ? ease(1 - e.windT / def.windup) : 0;
    let rear = -e.hitT * 0.3 - wind * 0.18 + e.lunge * 0.12 + leapPitch * 0.4;
    if (e.slamT > 0) {
      // rear up for 0.75 s, then crash down
      const s = e.slamT;
      rear = s > 0.25 ? -0.45 * ease((1 - s) / 0.75) : -0.45 * (s / 0.25) ** 2;
    }
    e.obj.position.set(e.pos.x, e.pos.y + bob - e.rise * 1.2, e.pos.z);
    e.obj.rotation.set(rear, e.yaw + struggle, struggle * 0.5);
    e.obj.translateZ(e.lunge * 0.3 * def.scale - wind * 0.12);
    const sq = e.hitT * 0.12;
    e.obj.scale.set(def.scale * (1 + sq), def.scale * (1 - sq), def.scale * (1 + sq));
  }

  animateDeath(e, dt, ctx) {
    e.deathT += dt;
    const k = Math.min(1, e.deathT / 0.35);
    if (e.def.flying) {
      // tumble out of the air
      e.vel.y = (e.vel.y || 0) - 12 * dt;
      e.pos.y = Math.max(terrainHeight(e.pos.x, e.pos.z) + 0.3, e.pos.y + e.vel.y * dt);
      e.obj.position.copy(e.pos);
      e.obj.rotation.x += dt * 5;
      e.obj.rotation.z += dt * 3;
    } else {
      // legs give way and splay, the body drops and rolls a little
      e.legs.forEach((l, i) => {
        if (!l) return;
        l.rotation.z = l.userData.rest.z + (i % 2 ? 1 : -1) * 0.9 * ease(k);
        l.rotation.x = l.userData.rest.x + (i < 2 ? -0.4 : 0.4) * ease(k);
      });
      if (e.head) e.head.rotation.x = e.head.userData.rest.x + 0.5 * ease(k);
      if (e.jaw) e.jaw.rotation.x = e.jaw.userData.rest.x + 0.6;
      const drop = e.def.chest * 0.5 * ease(k);
      e.obj.position.set(e.pos.x, e.pos.y - drop * e.def.scale, e.pos.z);
      e.obj.rotation.set(-0.1 * k, e.yaw, (e.phase % 2 > 1 ? 1 : -1) * 0.25 * ease(k));
    }
    const d = clamp((e.deathT - 0.2) / 1.1, 0, 1);
    setDissolve(e.obj, d);
    if (d > 0 && d < 0.95 && Math.random() < dt * (e.def.boss ? 60 : 18)) {
      ctx.particles?.ash(this.chest(e).clone(), e.def.boss ? 3 : 1, e.def.radius * e.def.scale);
    }
  }

  // world-space aim point (chest height)
  chest(e) {
    return _v.set(e.pos.x, e.pos.y + e.def.chest * e.def.scale, e.pos.z);
  }
}
