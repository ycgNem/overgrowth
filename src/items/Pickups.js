// Items lying in the world: pop out of whatever dropped them, settle,
// bob with a rarity glow, then fly to the player when close.
import * as THREE from 'three';
import { getItemModel } from './ItemModels.js';
import { ITEMS, RARITY } from './ItemDB.js';
import { glowTexture } from '../art/textures.js';

const beamMat = new Map();
function beamMaterial(color) {
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

export class Pickups {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this.glowTex = glowTexture();
    this.canTake = () => true; // items stay put while the satchel is full
  }

  // auto: fly to the player even from a distance (loot from searches).
  spawn(id, origin, impulse = 1, auto = false) {
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
    const item = {
      id, root, model, glow, rarity,
      vel: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 2.5, Math.sin(a) * sp),
      age: 0, settled: false, ground: 0, phase: Math.random() * 10, magnet: false, auto,
    };
    this.items.push(item);
    return item;
  }

  // Returns ids collected this frame.
  update(dt, t, playerPos) {
    const got = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      const pos = p.root.position;
      const dx = playerPos.x - pos.x, dy = playerPos.y + 0.9 - pos.y, dz = playerPos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (!p.magnet && p.age > 0.7 && (d < 2.6 || (p.auto && p.age > 1.1 && d < 15)) && this.canTake(p.id)) p.magnet = true;
      if (p.magnet) {
        const speed = 4 + p.age * 3;
        pos.x += (dx / d) * speed * dt * Math.min(1, d * 2);
        pos.y += (dy / d) * speed * dt * Math.min(1, d * 2);
        pos.z += (dz / d) * speed * dt * Math.min(1, d * 2);
        p.root.scale.setScalar(Math.max(0.3, Math.min(1, d)));
        if (d < 0.45) {
          got.push({ id: p.id, pos: pos.clone() });
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

  remove(i) {
    const p = this.items[i];
    this.scene.remove(p.root);
    p.glow.material.dispose();
    this.items.splice(i, 1);
  }
}
