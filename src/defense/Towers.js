// Everything the player builds: towers, barricades and traps, their placement ghost,
// targeting, and projectiles (crossbow bolts, spore pods, chain lightning).
import * as THREE from 'three';
import { cloneModel, part } from '../assets/Models.js';
import { flatten, setFlash, setTint, ownMaterials } from '../art/merge.js';
import { spikeTrapModel } from '../items/ItemModels.js';
import { terrainHeight, terrainNormal, WATER_LEVEL } from '../world/WorldGen.js';
import { glowTexture } from '../art/textures.js';
import { BUILD_RADIUS, GOAL_RADIUS } from './Base.js';

const TAU = Math.PI * 2;

export const BUILD_DEFS = {
  bow_tower: {
    model: 'bow_tower', hp: 320, r: 1.45, range: 28, rate: 1.0, dmg: 34, pathCost: 60, blocks: true,
    muzzle: 3.35, kind: 'bow',
  },
  spore_mortar: {
    model: 'spore_mortar', hp: 260, r: 1.25, range: 32, minRange: 6, rate: 2.8, dmg: 42, splash: 3.4, slow: 0.45, slowTime: 2.6,
    pathCost: 60, blocks: true, muzzle: 1.9, kind: 'mortar',
  },
  tesla_totem: {
    model: 'tesla_totem', hp: 220, r: 0.85, range: 15, rate: 1.5, dmg: 28, chain: 4, chainRange: 6.5, pathCost: 60, blocks: true,
    muzzle: 3.45, kind: 'tesla',
  },
  barricade: { model: 'barricade', hp: 280, r: 0.62, pathCost: 30, blocks: true, thorns: 5, kind: 'wall', rotates: true },
  spike_trap: { model: null, hp: 14, r: 0.7, pathCost: 0, blocks: false, dmg: 22, rate: 0.55, kind: 'trap' },
};

let trapTemplate = null;
function buildModel(id) {
  const def = BUILD_DEFS[id];
  if (def.model) return cloneModel(def.model, { own: true });
  if (!trapTemplate) trapTemplate = flatten(spikeTrapModel(), /^$/, { shadow: false });
  return ownMaterials(trapTemplate.clone(true));
}

// ------------------------------------------------------------------ one building
class Building {
  constructor(id, x, z, rot, ground) {
    const def = BUILD_DEFS[id];
    this.id = id;
    this.def = def;
    this.x = x;
    this.z = z;
    this.rot = rot;
    this.y = ground;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.blocks = def.blocks;
    this.pathCost = def.pathCost;
    this.cooldown = 0.5;
    this.flash = 0;
    this.dead = false;
    this.obj = buildModel(id);
    this.obj.position.set(x, ground, z);
    this.obj.rotation.y = rot;
    this.turret = part(this.obj, 'Turret');
    this.aim = part(this.obj, 'Aim');
    this.bolt = part(this.obj, 'Bolt');
    this.orb = part(this.obj, 'Orb');
    this.rings = part(this.obj, 'Rings');
    this.bellows = part(this.obj, 'Bellows');
    this.recoil = 0;
    if (this.aim) this.aimRest = this.aim.rotation.x;
    // barricades are three circles along their length; everything else one circle
    if (def.kind === 'wall') {
      const cx = Math.cos(rot), sz = -Math.sin(rot);
      this.footprint = [-1, 0, 1].map((k) => ({ x: x + cx * k * 1.05, z: z + sz * k * 1.05, r: def.r }));
      this.collider = { type: 'box', x, z, hx: 1.5, hz: 0.42, rot, top: Infinity, building: this };
    } else {
      this.footprint = [{ x, z, r: def.r }];
      this.collider = def.blocks ? { type: 'circle', x, z, r: def.r, top: Infinity, building: this } : null;
    }
    this.interactable = { kind: 'building', x, y: ground + 1, z, r: def.kind === 'wall' ? 1.8 : def.r + 0.6, label: '', building: this };
  }

  distTo(x, z) {
    let d = Infinity;
    for (const c of this.footprint) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
    return d;
  }

  pushOut(pos, r) {
    for (const c of this.footprint) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  // world position of the muzzle / orb
  muzzle(out) {
    if (this.def.kind === 'tesla' && this.orb) return this.orb.getWorldPosition(out);
    if (this.aim) {
      this.aim.getWorldPosition(out);
      if (this.def.kind === 'mortar') out.y += 0.6;
      return out;
    }
    return out.set(this.x, this.y + this.def.muzzle, this.z);
  }
}

// ------------------------------------------------------------------ projectiles
const boltGeo = (() => {
  const g = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5);
  g.rotateX(Math.PI / 2);
  return g;
})();
const boltMat = new THREE.MeshStandardMaterial({ color: 0xc19a68, roughness: 0.7 });
const podGeo = new THREE.SphereGeometry(0.22, 10, 8);
const podMat = new THREE.MeshStandardMaterial({ color: 0x9ad040, emissive: 0x80c020, emissiveIntensity: 1.6, roughness: 0.4 });
const arcMat = new THREE.LineBasicMaterial({ color: 0xa0e0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Buildings {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.shots = [];
    this.arcs = [];
    this.changed = true;
    this.glowTex = glowTexture();
  }

  get blocking() {
    return this.list.filter((b) => !b.dead);
  }

  place(id, x, z, rot) {
    const b = new Building(id, x, z, rot, terrainHeight(x, z) - 0.02);
    this.scene.add(b.obj);
    this.list.push(b);
    if (b.collider) this.world.extra.colliders.push(b.collider);
    this.world.extra.interactables.push(b.interactable);
    this.changed = true;
    return b;
  }

  remove(b) {
    b.dead = true;
    this.scene.remove(b.obj);
    this.list = this.list.filter((o) => o !== b);
    const ex = this.world.extra;
    ex.colliders = ex.colliders.filter((c) => c !== b.collider);
    ex.interactables = ex.interactables.filter((i) => i !== b.interactable);
    this.changed = true;
  }

  damage(b, n) {
    if (b.dead) return false;
    b.hp -= n;
    b.flash = 1;
    if (b.hp <= 0) {
      this.remove(b);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- placement
  // Can `id` go at (x, z)? Returns null if fine, or the reason it can't.
  check(id, x, z, rot, { base, player }) {
    const def = BUILD_DEFS[id];
    const dBase = Math.hypot(x - base.x, z - base.z);
    if (dBase > BUILD_RADIUS) return 'Too far from the Heartwood';
    if (dBase < GOAL_RADIUS + 1.2 + def.r) return 'Too close to the Heartwood';
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.05) return 'Needs dry ground';
    if (terrainNormal(x, z).y < 0.82) return 'Too steep';
    const probe = def.kind === 'wall'
      ? [-1, 0, 1].map((k) => ({ x: x + Math.cos(rot) * k * 1.05, z: z - Math.sin(rot) * k * 1.05, r: def.r }))
      : [{ x, z, r: def.r }];
    for (const p of probe) {
      for (const b of this.list) {
        for (const c of b.footprint) if (Math.hypot(p.x - c.x, p.z - c.z) < p.r + c.r + 0.1) return 'Overlaps a building';
      }
      for (const c of this.world.near(p.x, p.z, 'colliders')) {
        if (c.dead || c.building || c.type !== 'circle') continue;
        if (c.top !== Infinity && c.top < h + 0.4) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < p.r + c.r) return 'Something is in the way';
      }
      if (def.blocks && Math.hypot(p.x - player.x, p.z - player.z) < p.r + 0.5) return 'You are standing there';
    }
    return null;
  }

  // ---------------------------------------------------------------- combat
  update(dt, t, ctx) {
    const { enemies, field, audio, particles } = ctx;
    for (const b of this.list) {
      b.flash = Math.max(0, b.flash - dt * 4);
      setFlash(b.obj, b.flash * 0.8, b.flash * 0.2, b.flash * 0.1);
      if (b.orb) b.orb.scale.setScalar(1 + Math.sin(t * 7 + b.x) * 0.08);
      if (b.rings) b.rings.rotation.y += dt * 1.6;
      b.recoil = Math.max(0, b.recoil - dt * 3);
      if (b.bellows) b.bellows.scale.z = 1 - b.recoil * 0.4;
      if (b.bolt) b.bolt.visible = b.cooldown < b.def.rate * 0.6;
      b.cooldown -= dt;

      if (b.def.kind === 'trap') {
        if (b.cooldown > 0) continue;
        const hits = enemies.inRadius(b.x, b.z, b.def.r);
        if (!hits.length) continue;
        b.cooldown = b.def.rate;
        b.recoil = 1;
        for (const e of hits) enemies.damage(e, b.def.dmg, ctx);
        audio.stab?.();
        b.hp -= 1;
        if (b.hp <= 0) this.remove(b);
        continue;
      }
      if (!b.def.range) continue;

      // pick the enemy in range that is furthest along the path (closest to the Heart)
      let best = null, bd = Infinity;
      for (const e of enemies.list) {
        if (e.dying || e.rise > 0.5) continue;
        const d = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
        if (d > b.def.range || d < (b.def.minRange || 0)) continue;
        const fd = field.distAt(e.pos.x, e.pos.z) + d * 0.1;
        if (fd < bd) { bd = fd; best = e; }
      }
      if (!best) continue;

      // swing the turret round (it can only fire when roughly facing the target)
      const tgt = enemies.chest(best);
      const yawW = Math.atan2(tgt.x - b.x, tgt.z - b.z);
      let facing = true;
      if (b.turret) {
        const want = yawW - b.rot;
        let d = ((want - b.turret.rotation.y) % TAU + TAU * 1.5) % TAU - Math.PI;
        const step = dt * 5;
        b.turret.rotation.y += Math.max(-step, Math.min(step, d));
        facing = Math.abs(d) < 0.25;
      }
      if (b.def.kind === 'bow' && b.aim) {
        const m = b.muzzle(_a);
        const pitch = Math.atan2(tgt.y - m.y, Math.hypot(tgt.x - m.x, tgt.z - m.z));
        b.aim.rotation.x = -pitch;
      }
      if (b.cooldown > 0 || !facing) continue;
      b.cooldown = b.def.rate;
      b.recoil = 1;
      this.fire(b, best, ctx);
    }

    // projectiles
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      if (s.kind === 'bolt') {
        // homing: chase the target's chest while it lives
        if (s.target && !s.target.dying) s.to.copy(enemies.chest(s.target));
        s.mesh.position.lerpVectors(s.from, s.to, k);
        s.mesh.lookAt(s.to);
      } else {
        s.mesh.position.lerpVectors(s.from, s.to, k);
        s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
        s.mesh.rotation.x += dt * 6;
        if (Math.random() < dt * 30) particles.sparkle(s.mesh.position, 0x9ad040, 1);
      }
      if (k >= 1) {
        s.hit();
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
    // lightning fades out
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      a.line.material.opacity = Math.max(0, a.life / 0.22);
      if (a.life <= 0) {
        this.scene.remove(a.line);
        a.line.geometry.dispose();
        a.line.material.dispose();
        this.arcs.splice(i, 1);
      }
    }
  }

  fire(b, target, ctx) {
    const { enemies, audio, particles } = ctx;
    const from = b.muzzle(new THREE.Vector3());
    if (b.def.kind === 'bow') {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.position.copy(from);
      this.scene.add(mesh);
      const to = enemies.chest(target).clone();
      this.shots.push({
        kind: 'bolt', mesh, from, to, target, t: 0, dur: Math.max(0.08, from.distanceTo(to) / 48),
        hit: () => {
          if (!target.dying) {
            const knock = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize().multiplyScalar(2);
            enemies.damage(target, b.def.dmg, ctx, knock);
            particles.chipBurst(to, 0x6a3a7a, 6, target.pos.y);
          }
        },
      });
      audio.bowShot?.();
    } else if (b.def.kind === 'mortar') {
      const mesh = new THREE.Mesh(podGeo, podMat);
      mesh.position.copy(from);
      this.scene.add(mesh);
      // lead the target a little
      const lead = 1.1;
      const to = new THREE.Vector3(target.pos.x + target.vel.x * lead, 0, target.pos.z + target.vel.z * lead);
      to.y = terrainHeight(to.x, to.z) + 0.2;
      const dist = from.distanceTo(to);
      this.shots.push({
        kind: 'pod', mesh, from, to, t: 0, dur: 1.1, arc: 4 + dist * 0.25,
        hit: () => {
          for (const e of enemies.inRadius(to.x, to.z, b.def.splash)) {
            const d = Math.hypot(e.pos.x - to.x, e.pos.z - to.z);
            enemies.damage(e, b.def.dmg * (1 - 0.5 * d / b.def.splash), ctx);
            enemies.slowDown(e, b.def.slow, b.def.slowTime);
          }
          particles.sporeBurst?.(to, 0xa0e040, 40);
          audio.sporePop?.();
        },
      });
      audio.mortar?.();
    } else if (b.def.kind === 'tesla') {
      const chain = [target];
      let cur = target;
      for (let k = 1; k < b.def.chain; k++) {
        let next = null, nd = Infinity;
        for (const e of enemies.list) {
          if (e.dying || chain.includes(e)) continue;
          const d = Math.hypot(e.pos.x - cur.pos.x, e.pos.z - cur.pos.z);
          if (d < b.def.chainRange && d < nd) { nd = d; next = e; }
        }
        if (!next) break;
        chain.push(next);
        cur = next;
      }
      let prev = from.clone();
      chain.forEach((e, k) => {
        const p = enemies.chest(e).clone();
        this.arc(prev, p);
        enemies.damage(e, b.def.dmg * Math.pow(0.8, k), ctx);
        particles.sparks(p, 0xa0e0ff, 8);
        prev = p;
      });
      audio.zap?.();
    }
  }

  // a jagged, forked bolt of lightning between two points
  arc(a, b) {
    const pts = [];
    const segs = 9;
    _b.subVectors(b, a);
    const len = _b.length();
    for (let pass = 0; pass < 2; pass++) {
      let last = a.clone();
      for (let i = 1; i <= segs; i++) {
        const p = a.clone().addScaledVector(_b, i / segs);
        if (i < segs) p.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(len * 0.12));
        pts.push(last, p);
        last = p;
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineSegments(geo, arcMat.clone());
    line.frustumCulled = false;
    this.scene.add(line);
    this.arcs.push({ line, life: 0.22 });
  }
}

// ------------------------------------------------------------------ placement ghost
export class BuildGhost {
  constructor(scene) {
    this.scene = scene;
    this.id = null;
    this.obj = null;
    this.rot = 0;
    this.valid = false;
    this.reason = '';
    this.pos = new THREE.Vector3();
    const ringGeo = new THREE.RingGeometry(0.97, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    this.ring.visible = false;
    scene.add(this.ring);
  }

  show(id) {
    if (this.id === id) return;
    this.hide();
    this.id = id;
    this.obj = buildModel(id);
    this.obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.scene.add(this.obj);
  }

  hide() {
    if (this.obj) this.scene.remove(this.obj);
    this.obj = null;
    this.id = null;
    this.ring.visible = false;
  }

  // March the view ray to the ground (up to 9 m) and test the spot.
  update(camera, buildings, ctx) {
    if (!this.obj) return;
    const dir = camera.getWorldDirection(_a);
    const o = camera.position;
    let hit = null;
    for (let d = 1.5; d <= 9; d += 0.2) {
      const x = o.x + dir.x * d, y = o.y + dir.y * d, z = o.z + dir.z * d;
      if (y <= terrainHeight(x, z)) { hit = { x, z }; break; }
    }
    if (!hit) {
      const fl = Math.hypot(dir.x, dir.z) || 1;
      hit = { x: o.x + (dir.x / fl) * 6, z: o.z + (dir.z / fl) * 6 };
    }
    const def = BUILD_DEFS[this.id];
    if (!def.rotates) this.rot = Math.atan2(o.x - hit.x, o.z - hit.z); // towers face the player
    this.pos.set(hit.x, terrainHeight(hit.x, hit.z), hit.z);
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.rot;
    this.reason = buildings.check(this.id, hit.x, hit.z, this.rot, ctx);
    this.valid = !this.reason;
    setTint(this.obj, this.valid ? 0x60ff90 : 0xff4040, 0.45);
    if (def.range) {
      this.ring.visible = true;
      this.ring.position.set(hit.x, this.pos.y + 0.15, hit.z);
      this.ring.scale.setScalar(def.range);
      this.ring.material.color.set(this.valid ? 0x9affb0 : 0xff6060);
    } else this.ring.visible = false;
  }
}
