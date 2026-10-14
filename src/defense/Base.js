// The Heartwood: the shrine you defend, and the Blight rifts the night spills out of.
import * as THREE from 'three';
import { cloneModel, part } from '../assets/Models.js';
import { terrainHeight, terrainNormal, WATER_LEVEL } from '../world/WorldGen.js';
import { glowTexture } from '../art/textures.js';
import { setFlash } from '../art/merge.js';

const S = 1.35; // the Heartwood model is drawn larger than it was built
export const BASE_CLEAR = 30; // vegetation-free radius around the Heartwood (the arena)
export const BASE_SOFT = 10; // the jungle thins out over this many metres beyond it
export const BUILD_RADIUS = 40; // you may build this far from the Heart
export const GOAL_RADIUS = 5.4; // enemies this close are attacking the Heart

const TAU = Math.PI * 2;

// A soft vertical shaft of light: the Heartwood is a landmark you can find from anywhere.
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.5 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        // bright where you look through the middle of the shaft, fading to nothing at its sides
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
        float h = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, vUv.y);
        float wisps = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 2.0 + vUv.x * 12.0);
        gl_FragColor = vec4(uColor * edge * edge * h * wisps * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

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
      lo = Math.min(lo, terrainHeight(x + Math.cos(a) * 3 * S, z + Math.sin(a) * 3 * S));
    }
    this.y = Math.min(lo, terrainHeight(x, z)) - 0.05;
    this.maxHp = 500;
    this.hp = this.maxHp;
    this.flash = 0;
    this.shake = 0;
    this.dyingT = 0;
    this.trunkR = 1.3 * S;

    const root = cloneModel('heartwood', { own: true });
    root.position.set(x, this.y, z);
    root.scale.setScalar(S);
    scene.add(root);
    this.root = root;
    this.heart = part(root, 'Heart');
    this.orbit = part(root, 'Orbit');
    this.heartRest = this.heart ? this.heart.position.clone() : null;

    // the seed lights its clearing
    this.light = new THREE.PointLight(0x7dffb0, 60, 36, 1.7);
    this.light.position.set(x, this.y + 4.1 * S, z);
    scene.add(this.light);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x8affc0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7, fog: false,
    }));
    this.halo.scale.setScalar(4);
    this.halo.position.copy(this.light.position);
    scene.add(this.halo);
    const beamGeo = new THREE.CylinderGeometry(1.4, 0.6, 46, 20, 1, true);
    beamGeo.translate(0, 23, 0);
    this.beam = new THREE.Mesh(beamGeo, beamMaterial(0x6affa0));
    this.beam.position.set(x, this.y + 4.1 * S, z);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 2;
    scene.add(this.beam);

    // walkable dais steps, the trunk, the standing stones
    const y = this.y;
    const cols = [
      { type: 'circle', x, z, r: 3.05 * S, top: y + 0.24 * S },
      { type: 'circle', x, z, r: 2.45 * S, top: y + 0.44 * S },
      { type: 'circle', x, z, r: 1.9 * S, top: y + 0.62 * S },
      { type: 'circle', x, z, r: 1.0 * S, top: Infinity, kind: 'heartwood' },
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      // Blender +X/+Y -> three +X/-Z
      cols.push({ type: 'circle', x: x + Math.cos(a) * 3.45 * S, z: z - Math.sin(a) * 3.45 * S, r: 0.38 * S, top: Infinity, kind: 'stone' });
    }
    world.extra.colliders.push(...cols);
    this.interactable = { kind: 'base', x, y: y + 1.2, z, r: 3.6 * S, label: 'Heartwood' };
    world.extra.interactables.push(this.interactable);
  }

  get dead() {
    return this.hp <= 0;
  }

  get heartPos() {
    return new THREE.Vector3(this.x, this.y + 4.1 * S, this.z);
  }

  // Terrain height, raised by the dais steps (enemies don't query the full collider set).
  groundAt(x, z) {
    const h = terrainHeight(x, z);
    const d = Math.hypot(x - this.x, z - this.z) / S;
    if (d > 3.05) return h;
    return Math.max(h, this.y + (d < 1.9 ? 0.62 : d < 2.45 ? 0.44 : 0.24) * S);
  }

  damage(n) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - n);
    this.flash = Math.min(1, this.flash + 0.6);
    this.shake = Math.min(1, this.shake + n / 40);
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  // night: 0..1 from the sky, so the light only dominates after dark
  update(dt, t, night = 1) {
    const hurt = 1 - this.hp / this.maxHp;
    let life = 1;
    if (this.dead) {
      this.dyingT += dt;
      life = Math.max(0, 1 - this.dyingT / 2.2);
    }
    const pulse = (1 + Math.sin(t * (2.2 + hurt * 3)) * 0.05 + this.flash * 0.15) * (0.35 + 0.65 * life);
    if (this.heart) {
      this.heart.scale.setScalar(pulse);
      this.heart.rotation.y += dt * (0.3 + hurt * 1.2);
      if (this.heartRest) this.heart.position.y = this.heartRest.y - (1 - life) * 1.6;
    }
    if (this.orbit) this.orbit.rotation.y -= dt * 0.5 * life;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 4);
    // a struck Heartwood shudders
    const sh = this.shake * 0.05;
    this.root.position.set(this.x + (Math.random() - 0.5) * sh, this.y, this.z + (Math.random() - 0.5) * sh);
    this.light.color.setRGB(0.49 + hurt * 0.5 + this.flash * 0.3, 1 - hurt * 0.55, 0.69 - hurt * 0.4);
    const k = (0.5 + 0.5 * (this.hp / this.maxHp)) * life;
    this.light.intensity = ((18 + 62 * night) + Math.sin(t * 2.2) * 6) * k + this.flash * 25;
    this.halo.material.color.copy(this.light.color);
    this.halo.scale.setScalar((3 + 3 * night) * pulse);
    this.halo.material.opacity = 0.7 * life;
    this.beam.material.uniforms.uColor.value.copy(this.light.color);
    this.beam.material.uniforms.uOpacity.value = 0.55 * night * life;
    this.beam.visible = night > 0.01;
    this.beam.material.uniforms.uTime.value = t;
    // only the seed flashes when bitten (the whole tree used to turn pink)
    if (this.heart) setFlash(this.heart, this.flash * 0.5, this.flash * 0.1, this.flash * 0.05);
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

// Where the Blight comes from: tears in the forest floor just past the clearing's ragged edge.
// Chosen once per run, on flat, dry, reachable ground, spread around the compass.
export function pickRifts(field, bx, bz, count = 3, seed = 1) {
  const out = [];
  const start = (seed * 2.399) % TAU;
  for (let k = 0; k < count; k++) {
    let best = null;
    for (let tries = 0; tries < 96 && !best; tries++) {
      // sweep up to about ±60 degrees around this rift's direction, then step outwards
      const a = start + (k / count) * TAU + ((tries % 12) - 5.5) * 0.18;
      const d = 50 + Math.floor(tries / 12) * 3;
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.4) continue;
      if (terrainNormal(x, z).y < 0.9) continue;
      if (!field.reachable(x, z)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 30)) continue;
      best = { x, z };
    }
    if (best) out.push(best);
  }
  return out;
}

// curved thorn: a tapered cylinder bent toward +x
function thornGeometry(h, r, bend) {
  const g = new THREE.CylinderGeometry(r * 0.05, r, h, 8, 6);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setX(i, p.getX(i) + bend * t * t * h);
  }
  g.computeVertexNormals();
  return g;
}

const riftMat = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
  vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; uniform float uOpen; varying vec2 vP;
    void main(){
      float r = length(vP) / 2.4;
      float a = atan(vP.y, vP.x);
      float swirl = sin(a * 5.0 + r * 9.0 - uTime * 2.4) * 0.5 + 0.5;
      float swirl2 = sin(a * 3.0 - r * 14.0 + uTime * 1.7) * 0.5 + 0.5;
      vec3 deep = vec3(0.03, 0.0, 0.06);
      vec3 hot = vec3(0.95, 0.35, 1.4);
      float rim = smoothstep(0.25, 0.85, r) * (1.0 - smoothstep(0.85, 1.0, r));
      vec3 col = mix(deep, hot, rim * (0.45 + 0.55 * swirl) + swirl2 * 0.15 * (1.0 - r));
      float alpha = (1.0 - smoothstep(0.88, 1.0, r)) * uOpen;
      gl_FragColor = vec4(col, alpha);
    }`,
  transparent: true, depthWrite: false, fog: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

export class Rift {
  constructor(scene, x, z) {
    this.x = x;
    this.z = z;
    this.y = terrainHeight(x, z);
    this.open = 0;
    this.target = 0;
    const g = new THREE.Group();
    g.position.set(x, this.y, z);
    // a crown of curved black thorns leaning in over a glowing wound in the ground
    const thorn = new THREE.MeshStandardMaterial({ color: 0x1e141c, roughness: 0.45, emissive: 0x2a0838, emissiveIntensity: 0.6 });
    this.thorns = new THREE.Group();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + Math.sin(i * 7.3) * 0.2;
      const h = 1.3 + ((i * 5) % 7) * 0.27;
      const m = new THREE.Mesh(thornGeometry(h, 0.2 + (i % 3) * 0.04, -0.35), thorn);
      const rr = 2.3 + (i % 2) * 0.35;
      m.position.set(Math.cos(a) * rr, terrainHeight(x + Math.cos(a) * rr, z + Math.sin(a) * rr) - this.y - 0.25, Math.sin(a) * rr);
      // bend points along local +x; face it inward, lean back out a little at the root
      m.rotation.set(0, -a, 0.28);
      m.castShadow = true;
      this.thorns.add(m);
    }
    g.add(this.thorns);
    // the wound follows the ground so it never sinks into a crest
    const geo = new THREE.RingGeometry(0.02, 2.4, 40, 6);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(x + p.getX(i), z + p.getZ(i)) - this.y + 0.06);
    this.disc = new THREE.Mesh(geo, riftMat());
    g.add(this.disc);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xb050ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    }));
    this.glow.scale.set(3.2, 9, 1);
    this.glow.position.y = 3.2;
    g.add(this.glow);
    // lit through the shared LightPool: a light of its own, hidden by day, changed the scene's
    // light count at the first dusk and recompiled every lit shader (a multi-second freeze)
    this.lightPos = new THREE.Vector3(x, this.y + 1.5, z);
    g.visible = false;
    scene.add(g);
    this.group = g;
  }

  update(dt, t, particles, lights) {
    this.open += (this.target - this.open) * Math.min(1, dt * 1.5);
    const s = this.open;
    this.group.visible = s > 0.01;
    if (!this.group.visible) return;
    this.thorns.scale.set(1, Math.max(0.01, s), 1);
    this.thorns.rotation.y += dt * 0.08;
    this.disc.material.uniforms.uTime.value = t;
    this.disc.material.uniforms.uOpen.value = s;
    this.glow.material.opacity = (0.55 + Math.sin(t * 3 + this.x) * 0.2) * s;
    lights?.request(this.lightPos, 0xb050ff, (28 + Math.sin(t * 5 + this.z) * 6) * s, 20, 0.5);
    if (particles && s > 0.3 && Math.random() < dt * 10) {
      const a = Math.random() * TAU, r = Math.random() * 2;
      particles.ash(new THREE.Vector3(this.x + Math.cos(a) * r, this.y + 0.2, this.z + Math.sin(a) * r), 1, 0.2, 0xc060ff);
    }
  }
}
