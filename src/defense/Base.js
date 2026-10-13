// The Heartwood: the shrine you defend, and the Blight rifts the night spills out of.
import * as THREE from 'three';
import { cloneModel, part } from '../assets/Models.js';
import { terrainHeight, terrainNormal, WATER_LEVEL } from '../world/WorldGen.js';
import { glowTexture } from '../art/textures.js';
import { setFlash } from '../art/merge.js';

export const BASE_CLEAR = 15; // vegetation-free radius around the Heartwood
export const BUILD_RADIUS = 46; // you may build this far from the Heart
export const GOAL_RADIUS = 4.2; // enemies this close are attacking the Heart

const TAU = Math.PI * 2;

export class Base {
  constructor(scene, world, x, z) {
    this.scene = scene;
    this.world = world;
    this.x = x;
    this.z = z;
    // sit on the lowest ground under the dais so no edge floats
    let lo = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      lo = Math.min(lo, terrainHeight(x + Math.cos(a) * 3, z + Math.sin(a) * 3));
    }
    this.y = Math.min(lo, terrainHeight(x, z)) - 0.05;
    this.maxHp = 500;
    this.hp = this.maxHp;
    this.flash = 0;

    const root = cloneModel('heartwood', { own: true });
    root.position.set(x, this.y, z);
    scene.add(root);
    this.root = root;
    this.heart = part(root, 'Heart');
    this.orbit = part(root, 'Orbit');

    // the seed lights its clearing
    this.light = new THREE.PointLight(0x7dffb0, 8, 22, 1.6);
    this.light.position.set(x, this.y + 4.1, z);
    scene.add(this.light);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x8affc0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7, fog: false,
    }));
    this.halo.scale.setScalar(3.2);
    this.halo.position.copy(this.light.position);
    scene.add(this.halo);

    // walkable dais steps, the trunk, the standing stones
    const y = this.y;
    const cols = [
      { type: 'circle', x, z, r: 3.05, top: y + 0.24 },
      { type: 'circle', x, z, r: 2.45, top: y + 0.44 },
      { type: 'circle', x, z, r: 1.9, top: y + 0.62 },
      { type: 'circle', x, z, r: 1.0, top: Infinity, kind: 'heartwood' },
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      // Blender +X/+Y -> three +X/-Z
      cols.push({ type: 'circle', x: x + Math.cos(a) * 3.45, z: z - Math.sin(a) * 3.45, r: 0.38, top: Infinity, kind: 'stone' });
    }
    world.extra.colliders.push(...cols);
    this.interactable = { kind: 'base', x, y: y + 1.2, z, r: 3.6, label: 'Heartwood' };
    world.extra.interactables.push(this.interactable);
  }

  get dead() {
    return this.hp <= 0;
  }

  // Terrain height, raised by the dais steps (enemies don't query the full collider set).
  groundAt(x, z) {
    const h = terrainHeight(x, z);
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > 3.05) return h;
    return Math.max(h, this.y + (d < 1.9 ? 0.62 : d < 2.45 ? 0.44 : 0.24));
  }

  damage(n) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - n);
    this.flash = 1;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  update(dt, t) {
    const pulse = 1 + Math.sin(t * 2.2) * 0.05 + this.flash * 0.25;
    if (this.heart) {
      this.heart.scale.setScalar(pulse);
      this.heart.rotation.y += dt * 0.3;
    }
    if (this.orbit) this.orbit.rotation.y -= dt * 0.5;
    const hurt = 1 - this.hp / this.maxHp;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.light.color.setRGB(0.49 + hurt * 0.5 + this.flash * 0.5, 1 - hurt * 0.55, 0.69 - hurt * 0.4);
    this.light.intensity = (7 + Math.sin(t * 2.2) * 1.2) * (0.5 + 0.5 * (this.hp / this.maxHp)) + this.flash * 10;
    this.halo.material.color.copy(this.light.color);
    this.halo.scale.setScalar(3.2 * pulse);
    setFlash(this.root, this.flash * 0.9, this.flash * 0.15, this.flash * 0.1);
  }
}

// ----------------------------------------------------------------- site

// A good place for the Heartwood: flat under the dais, dry, and with plenty of buildable
// ground around it. Spirals out from `start` and takes the first spot that passes.
export function findBaseSite(start) {
  for (let r = 0; r < 900; r += 6) {
    const steps = Math.max(1, Math.floor((r * TAU) / 10));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const x = start.x + Math.cos(a) * r, z = start.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < WATER_LEVEL + 1.2 || h > 14) continue;
      if (terrainNormal(x, z).y < 0.96) continue;
      let lo = h, hi = h, ok = true;
      for (let k = 0; k < 16 && ok; k++) {
        const b = (k / 16) * TAU;
        for (const rr of [4, 9]) {
          const hh = terrainHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr);
          lo = Math.min(lo, hh);
          hi = Math.max(hi, hh);
        }
        if (hi - lo > 1.3) ok = false;
      }
      if (!ok) continue;
      // most of the build ring should be dry and walkable
      let good = 0, n = 0;
      for (let k = 0; k < 24; k++) {
        const b = (k / 24) * TAU;
        for (const rr of [16, 26, 36]) {
          n++;
          const px = x + Math.cos(b) * rr, pz = z + Math.sin(b) * rr;
          if (terrainHeight(px, pz) > WATER_LEVEL + 0.3 && terrainNormal(px, pz).y > 0.85) good++;
        }
      }
      if (good / n < 0.8) continue;
      return { x, z };
    }
  }
  return { x: start.x, z: start.z };
}

// ----------------------------------------------------------------- rifts

// Where the Blight comes from: tears in the forest floor out past the build radius.
// Chosen once per run, on reachable dry ground, spread around the compass.
export function pickRifts(field, bx, bz, count = 3, seed = 1) {
  const out = [];
  const start = (seed * 2.399) % TAU;
  for (let k = 0; k < count; k++) {
    let best = null;
    for (let tries = 0; tries < 48 && !best; tries++) {
      const a = start + (k / count) * TAU + ((tries % 8) - 3.5) * 0.12;
      const d = 70 + Math.floor(tries / 8) * 4;
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.4) continue;
      if (!field.reachable(x, z)) continue;
      best = { x, z };
    }
    if (best) out.push(best);
  }
  return out;
}

export class Rift {
  constructor(scene, x, z) {
    this.x = x;
    this.z = z;
    this.y = terrainHeight(x, z);
    this.open = 0;
    this.target = 0;
    const g = new THREE.Group();
    g.position.set(x, this.y, z);
    // a ring of black thorns around a glowing wound in the ground
    const thorn = new THREE.MeshStandardMaterial({ color: 0x241820, roughness: 0.6 });
    const cone = new THREE.ConeGeometry(0.22, 1.8, 5);
    cone.translate(0, 0.9, 0);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const m = new THREE.Mesh(cone, thorn);
      m.position.set(Math.cos(a) * 2.2, -0.2, Math.sin(a) * 2.2);
      m.rotation.set(Math.sin(a) * -0.6, 0, Math.cos(a) * 0.6);
      m.scale.setScalar(0.6 + ((i * 7) % 5) * 0.15);
      m.castShadow = true;
      g.add(m);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2, 24), new THREE.MeshBasicMaterial({ color: 0xa040ff, transparent: true, opacity: 0.8, fog: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    g.add(disc);
    this.disc = disc;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xb050ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    }));
    this.glow.scale.set(7, 4, 1);
    this.glow.position.y = 1;
    g.add(this.glow);
    g.scale.setScalar(0.001);
    g.visible = false;
    scene.add(g);
    this.group = g;
  }

  update(dt, t) {
    this.open += (this.target - this.open) * Math.min(1, dt * 1.5);
    const s = Math.max(0.001, this.open);
    this.group.visible = this.open > 0.01;
    this.group.scale.setScalar(s);
    this.group.rotation.y += dt * 0.15;
    this.glow.material.opacity = (0.6 + Math.sin(t * 3 + this.x) * 0.2) * s;
    this.disc.material.opacity = 0.65 + Math.sin(t * 5) * 0.15;
  }
}
