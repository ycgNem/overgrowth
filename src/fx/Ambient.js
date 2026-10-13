// Atmosphere: pollen motes, fireflies, butterflies, birds and light shafts.
import * as THREE from 'three';
import { butterflyTexture } from '../art/textures.js';
import { globalUniforms } from '../art/shaders.js';

const TAU = Math.PI * 2;

const motesVert = /* glsl */`
uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uOffset; uniform float uSize; uniform float uBlink;
attribute float aSeed;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.3 + aSeed * 6.0) * 1.5;
  p.y += sin(uTime * 0.23 + aSeed * 4.0) * 0.6;
  p.z += cos(uTime * 0.27 + aSeed * 5.0) * 1.5;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam + uOffset;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vAlpha = smoothstep(uBox.x * 0.5, uBox.x * 0.2, length(p.xz - uCam.xz)) * smoothstep(0.3, 1.5, dist);
  vAlpha *= mix(1.0, smoothstep(0.2, 1.0, sin(uTime * (1.2 + aSeed * 1.5) + aSeed * 40.0)), uBlink);
  gl_PointSize = uSize * (300.0 / max(dist, 0.1));
  gl_Position = projectionMatrix * mv;
}`;
const motesFrag = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(uColor * a * vAlpha * uOpacity, 1.0);
}`;

function makeMotes(scene, count, box, offset, size, color, blink) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box.x;
    pos[i * 3 + 1] = Math.random() * box.y;
    pos[i * 3 + 2] = Math.random() * box.z;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uOffset: { value: offset },
      uSize: { value: size }, uBlink: { value: blink }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 },
    },
    vertexShader: motesVert, fragmentShader: motesFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}

const shaftVert = /* glsl */`
varying vec2 vUv; varying float vFade;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  vFade = smoothstep(2.0, 9.0, d) * smoothstep(70.0, 35.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const shaftFrag = /* glsl */`
uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
varying vec2 vUv; varying float vFade;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  float len = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
  float streak = 0.55 + 0.45 * n(vec2(vUv.x * 5.0 + uTime * 0.07, vUv.y * 0.6));
  float a = edge * edge * len * streak * uIntensity * vFade;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

export class Ambient {
  constructor(scene, world, sky) {
    this.scene = scene;
    this.world = world;
    this.sky = sky;
    this.motes = makeMotes(scene, 700, new THREE.Vector3(36, 14, 36), new THREE.Vector3(0, 2, 0), 0.05, 0xfff2c0, 0);
    this.fireflies = makeMotes(scene, 420, new THREE.Vector3(50, 5, 50), new THREE.Vector3(0, -0.5, 0), 0.22, 0xd4ff70, 1);

    // Butterflies
    const wingMats = ['morpho', 'monarch'].map((k) => new THREE.MeshStandardMaterial({
      map: butterflyTexture(k), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5,
      emissive: k === 'morpho' ? 0x0a2a5a : 0x2a1000,
    }));
    const wingGeo = new THREE.PlaneGeometry(0.17, 0.17);
    wingGeo.translate(0.085, 0, 0);
    wingGeo.rotateX(-Math.PI / 2);
    const bodyGeo = new THREE.CylinderGeometry(0.008, 0.006, 0.1, 5);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    this.butterflies = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const mat = wingMats[i % 2];
      const r = new THREE.Mesh(wingGeo, mat);
      const l = new THREE.Mesh(wingGeo, mat);
      l.scale.x = -1;
      g.add(r, l, new THREE.Mesh(bodyGeo, bodyMat));
      g.scale.setScalar(i % 2 ? 1 : 1.3);
      scene.add(g);
      this.butterflies.push({ g, r, l, pos: new THREE.Vector3(1e9, 0, 0), target: new THREE.Vector3(), vel: new THREE.Vector3(), phase: Math.random() * 10, timer: 0 });
    }

    // Birds circling high above the canopy
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.1, 0.0, -0.1], 3));
    birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
    this.birds = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const r = new THREE.Mesh(birdGeo, birdMat);
      const l = new THREE.Mesh(birdGeo, birdMat);
      l.scale.x = -1;
      g.add(r, l);
      g.scale.setScalar(1.4);
      scene.add(g);
      this.birds.push({ g, r, l, a: Math.random() * TAU, rad: 40 + Math.random() * 50, h: 34 + Math.random() * 18, speed: (0.08 + Math.random() * 0.06) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 10, cx: 0, cz: 0 });
    }

    // Light shafts
    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff0c8) }, uIntensity: { value: 0.1 }, uTime: globalUniforms.uTime },
      vertexShader: shaftVert, fragmentShader: shaftFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const shaftGeo = new THREE.PlaneGeometry(1, 1);
    shaftGeo.translate(0, 0.5, 0);
    this.shafts = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(shaftGeo, this.shaftMat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      scene.add(m);
      this.shafts.push({ m, pos: new THREE.Vector3(1e9, 0, 0), w: 2 + Math.random() * 4 });
    }
    this._x = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  update(dt, t, camera, player) {
    const { day, night, twilight } = this.sky.state;
    const cam = camera.position;
    this.motes.material.uniforms.uCam.value.copy(cam);
    this.motes.material.uniforms.uOpacity.value = 0.35 + day * 0.65;
    this.fireflies.material.uniforms.uCam.value.copy(cam);
    this.fireflies.material.uniforms.uOpacity.value = Math.max(night, twilight * 0.4) * 1.6;
    this.fireflies.visible = night > 0.02 || twilight > 0.3;

    // butterflies: by day only, wandering around the player
    for (const b of this.butterflies) {
      b.g.visible = day > 0.3;
      if (!b.g.visible) continue;
      if (b.pos.distanceToSquared(player) > 45 * 45) {
        const a = Math.random() * TAU, d = 8 + Math.random() * 20;
        b.pos.set(player.x + Math.cos(a) * d, 0, player.z + Math.sin(a) * d);
        b.pos.y = this.world.groundHeight(b.pos.x, b.pos.z) + 1 + Math.random() * 1.5;
        b.timer = 0;
      }
      b.timer -= dt;
      if (b.timer <= 0) {
        b.timer = 1.5 + Math.random() * 3;
        const a = Math.random() * TAU, d = 1 + Math.random() * 5;
        b.target.set(b.pos.x + Math.cos(a) * d, 0, b.pos.z + Math.sin(a) * d);
        b.target.y = Math.max(0.3, this.world.groundHeight(b.target.x, b.target.z)) + 0.5 + Math.random() * 2;
      }
      this._t.subVectors(b.target, b.pos);
      b.vel.lerp(this._t.normalize().multiplyScalar(1.8), 1 - Math.exp(-2 * dt));
      b.pos.addScaledVector(b.vel, dt);
      b.pos.y += Math.sin(t * 6 + b.phase) * 0.6 * dt;
      b.g.position.copy(b.pos);
      b.g.lookAt(this._t.copy(b.pos).add(b.vel));
      const flap = Math.sin(t * 22 + b.phase) * 1.15;
      b.r.rotation.z = flap;
      b.l.rotation.z = -flap;
    }

    // birds: re-centre their circle slowly on the player
    for (const b of this.birds) {
      b.g.visible = night < 0.6;
      b.cx += (player.x - b.cx) * Math.min(1, dt * 0.05);
      b.cz += (player.z - b.cz) * Math.min(1, dt * 0.05);
      if (Math.abs(b.cx - player.x) > 300) { b.cx = player.x; b.cz = player.z; }
      b.a += b.speed * dt;
      const x = b.cx + Math.cos(b.a) * b.rad, z = b.cz + Math.sin(b.a) * b.rad;
      b.g.position.set(x, player.y + b.h + Math.sin(t * 0.5 + b.phase) * 2, z);
      const dir = Math.sign(b.speed);
      b.g.rotation.set(0, -b.a - (dir > 0 ? 0 : Math.PI), dir * 0.25);
      const glide = Math.sin(t * 0.7 + b.phase) > 0.2;
      const flap = glide ? 0.15 : Math.sin(t * 9 + b.phase) * 0.6;
      b.r.rotation.z = flap;
      b.l.rotation.z = -flap;
    }

    // light shafts, angled along the sun
    const sun = this.sky.sunDir;
    const intensity = sun.y > 0.05 ? (0.05 + twilight * 0.07) * day : 0;
    this.shaftMat.uniforms.uIntensity.value = intensity;
    this.shaftMat.uniforms.uColor.value.copy(this.sky.uniforms.uSunColor.value);
    for (const s of this.shafts) {
      s.m.visible = intensity > 0.002;
      if (!s.m.visible) continue;
      const dx = s.pos.x - player.x, dz = s.pos.z - player.z;
      if (dx * dx + dz * dz > 48 * 48) {
        const a = Math.random() * TAU, d = 8 + Math.random() * 36;
        s.pos.set(player.x + Math.cos(a) * d, 0, player.z + Math.sin(a) * d);
        s.pos.y = this.world.groundHeight(s.pos.x, s.pos.z) - 1;
        s.w = 2 + Math.random() * 4;
      }
      const L = 32;
      this._t.subVectors(cam, s.pos).normalize();
      this._x.crossVectors(sun, this._t).normalize();
      this._z.crossVectors(this._x, sun);
      s.m.matrix.makeBasis(this._x.multiplyScalar(s.w), this._t.copy(sun).multiplyScalar(L), this._z);
      s.m.matrix.setPosition(s.pos);
      s.m.matrixWorldNeedsUpdate = true;
    }
  }
}
