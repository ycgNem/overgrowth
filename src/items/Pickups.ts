// Items lying in the world: pop out of whatever dropped them, settle,
// bob with a rarity glow, then fly to the player when close. One pickup can be a whole stack
// (n). Something the player put down (`dropped`) never comes by itself: it waits on the ground
// until they tap E at it (Game.interact, `grab`).
import * as THREE from 'three';
import { getItemModel } from './ItemModels.ts';
import { ITEMS, RARITY } from './ItemDB.ts';
import { glowTexture } from '../art/textures.js';

const beamMat = new Map<string, THREE.ShaderMaterial>();
function beamMaterial(color: string) {
  if (!beamMat.has(color)) {
    beamMat.set(color, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ float a = pow(clamp(1.0 - vY, 0.0, 1.0), 2.5) * smoothstep(0.0, 0.05, vY) * 0.14; gl_FragColor = vec4(uColor * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  }
  return beamMat.get(color);
}

const beamGeo = new THREE.CylinderGeometry(0.025, 0.07, 3.5, 8, 1, true);
beamGeo.translate(0, 1.75, 0);

export interface Pickup {
  id: string;
  root: THREE.Group;
  model: THREE.Object3D;
  glow: THREE.Sprite;
  rarity: { color: string; order: number };
  vel: THREE.Vector3;
  age: number;
  settled: boolean;
  ground: number;
  phase: number;
  magnet: boolean;
  auto: boolean;
  n: number;
  dropped: boolean;
}

// what pickups need from the world: where the ground is
interface Ground { groundHeight(x: number, z: number, feetY?: number): number }

export class Pickups {
  scene: THREE.Scene;
  world: Ground;
  items: Pickup[];
  glowTex: THREE.Texture;
  canTake: (id: string) => boolean; // items stay put while the satchel is full
  blocked: string | null = null;

  constructor(scene: THREE.Scene, world: Ground) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this.glowTex = glowTexture();
    this.canTake = () => true;
  }

  // auto: fly to the player even from a distance (loot from searches). n: how many it holds.
  // dropped: thrown out by the player (see above).
  spawn(id: string, origin: THREE.Vector3, impulse = 1, auto = false, n = 1, dropped = false): Pickup {
    const def = ITEMS[id];
    const rarity = RARITY[def.rarity];
    const root = new THREE.Group();
    const model = getItemModel(id);
    root.add(model);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: rarity.color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      transparent: true, opacity: 0.55,
    }));
    glow.scale.setScalar(rarity.order >= 2 ? 1.4 : 0.9);
    root.add(glow);
    if (rarity.order >= 2) {
      const beam = new THREE.Mesh(beamGeo, beamMaterial(rarity.color));
      beam.position.y = -0.2;
      root.add(beam);
    }
    root.position.copy(origin);
    this.scene.add(root);
    const a = Math.random() * Math.PI * 2;
    const sp = (1.2 + Math.random() * 1.8) * impulse;
    const item: Pickup = {
      id, root, model, glow, rarity,
      vel: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 2.5, Math.sin(a) * sp),
      age: 0, settled: false, ground: 0, phase: Math.random() * 10, magnet: false, auto, n, dropped,
    };
    this.items.push(item);
    return item;
  }

  // Returns ids collected this frame. this.blocked: something in reach the satchel can't take
  // (the game says why), else null.
  update(dt: number, t: number, playerPos: THREE.Vector3) {
    const got: { id: string; n: number; pos: THREE.Vector3 }[] = [];
    this.blocked = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      const pos = p.root.position;
      const dx = playerPos.x - pos.x, dy = playerPos.y + 0.9 - pos.y, dz = playerPos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (!p.magnet && !p.dropped && p.age > 0.7 && (d < 2.6 || (p.auto && p.age > 1.1 && d < 15))) {
        if (this.canTake(p.id)) p.magnet = true;
        else if (d < 2.6) this.blocked = p.id;
      }
      if (p.magnet) {
        const speed = 4 + p.age * 3;
        pos.x += (dx / d) * speed * dt * Math.min(1, d * 2);
        pos.y += (dy / d) * speed * dt * Math.min(1, d * 2);
        pos.z += (dz / d) * speed * dt * Math.min(1, d * 2);
        p.root.scale.setScalar(Math.max(0.3, Math.min(1, d)));
        if (d < 0.45) {
          got.push({ id: p.id, n: p.n, pos: pos.clone() });
          this.remove(i);
          continue;
        }
      } else if (!p.settled) {
        p.vel.y -= 16 * dt;
        pos.addScaledVector(p.vel, dt);
        const g = Math.max(this.world.groundHeight(pos.x, pos.z, pos.y), 0) + 0.32;
        if (pos.y < g) {
          pos.y = g;
          if (p.vel.y < -2) {
            p.vel.y *= -0.35;
            p.vel.x *= 0.5;
            p.vel.z *= 0.5;
          } else {
            p.settled = true;
            p.ground = g;
          }
        }
        p.model.rotation.x += dt * 8;
      } else {
        pos.y = p.ground + 0.12 + Math.sin(t * 2.2 + p.phase) * 0.07;
        p.model.rotation.x *= 0.9;
      }
      p.model.rotation.y += dt * 1.6;
      p.glow.material.opacity = 0.4 + Math.sin(t * 3 + p.phase) * 0.15;
    }
    return got;
  }

  // The put-down pile nearest (x, z) within r that the player is facing (fx, fz: the look
  // direction on the ground), or null.
  pileAt(x: number, z: number, fx: number, fz: number, r = 2.4): Pickup | null {
    let best: Pickup | null = null, bd = r;
    for (const p of this.items) {
      if (!p.dropped || p.magnet) continue;
      const dx = p.root.position.x - x, dz = p.root.position.z - z, d = Math.hypot(dx, dz);
      if (d >= bd || (d > 0.6 && (dx * fx + dz * fz) / d < 0.6)) continue;
      best = p;
      bd = d;
    }
    return best;
  }

  // pick a put-down pile up: it flies to the player like anything else
  grab(p: Pickup) {
    p.dropped = false;
    p.magnet = true;
  }

  remove(i: number) {
    const p = this.items[i];
    this.scene.remove(p.root);
    p.glow.material.dispose();
    this.items.splice(i, 1);
  }
}
