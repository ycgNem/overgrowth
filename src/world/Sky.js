// Sky dome, sun/moon, day-night cycle, fog and image-based lighting.
import * as THREE from 'three';
import { smoothstep, clamp } from '../utils/math.js';
import { globalUniforms } from '../art/shaders.js';

const TAU = Math.PI * 2;
const col = (hex) => new THREE.Color(hex);

// Palette keyed by sun state; colours are authored in sRGB.
const P = {
  dayZenith: col('#3c78c8'), dayHorizon: col('#b9d3d6'), dayFog: col('#9db4a4'),
  setZenith: col('#2b3c6e'), setHorizon: col('#f39a5c'), setFog: col('#b48a6a'),
  nightZenith: col('#0e1e40'), nightHorizon: col('#1c2c48'), nightFog: col('#16243a'),
  sunDay: col('#fff0d4'), sunSet: col('#ff9248'), moon: col('#9fb8f0'),
  hemiSkyDay: col('#cfe3ff'), hemiSkyNight: col('#4f669a'), hemiGround: col('#3a4a22'),
};

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uFog; uniform vec3 uSunColor;
uniform float uTime; uniform float uNight; uniform float uCloud;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  col = mix(col, uFog, 1.0 - smoothstep(-0.03, 0.16, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float above = smoothstep(-0.12, 0.02, uSunDir.y);
  col += uSunColor * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.6) * above;
  col += uSunColor * smoothstep(0.99935, 0.9997, sd) * 18.0 * above;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.85 + vec2(uTime * 0.004, uTime * 0.0016);
    float c = fbm(uv * 1.5);
    c = smoothstep(0.5 - uCloud * 0.12, 0.86, c);
    float fade = smoothstep(0.0, 0.22, h);
    float shade = fbm(uv * 1.5 + vec2(0.06, 0.04) * 3.0);
    vec3 lit = mix(uHorizon, vec3(1.0), 0.55) * (0.25 + 0.75 * (1.0 - uNight)) + uSunColor * pow(sd, 3.0) * 0.8 * above;
    vec3 dark = mix(uZenith, uFog, 0.6) * 0.75;
    vec3 cc = mix(lit, dark, smoothstep(0.42, 0.85, shade));
    col = mix(col, cc, c * fade * 0.92);
    if (uNight > 0.01) {
      vec3 sp = d * 260.0;
      vec3 cell = floor(sp);
      float r = hash3(cell);
      float star = step(0.9965, r) * smoothstep(0.2, 0.0, length(fract(sp) - 0.5));
      float tw = 0.55 + 0.45 * sin(uTime * 2.5 + r * 300.0);
      col += vec3(0.85, 0.9, 1.0) * star * tw * uNight * (1.0 - c) * smoothstep(0.0, 0.25, h) * 2.0;
    }
  }
  float md = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.9, 0.93, 1.0) * smoothstep(0.99955, 0.9998, md) * uNight * 2.5;
  col += vec3(0.25, 0.32, 0.5) * pow(md, 120.0) * uNight * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this._time = 0.3; // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    this.dayLength = 20 * 60; // seconds per full day
    this.timeScale = 1;

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uCloud: { value: 0.5 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.dome = new THREE.Mesh(geo, this.material);
    this.dome.scale.setScalar(800);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // Separate scene to bake the sky into an environment map.
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(geo, this.material);
    envDome.scale.setScalar(50);
    this.envScene.add(envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    // the environment map is re-baked as sky time moves (not on a wall clock), so
    // fast-forwarding never leaves the scene lit by a stale sky and then snaps
    this.envTime = NaN;
    this.envCooldown = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = sh.camera.bottom = -48;
    sh.camera.right = sh.camera.top = 48;
    sh.camera.near = 1;
    sh.camera.far = 320;
    sh.bias = -0.0004;
    sh.normalBias = 0.08;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0x9db4a4, 0.011);
    this.state = { day: 1, night: 0, twilight: 0, elev: 1 };
    this.sunDir = new THREE.Vector3();
    this.update(0, new THREE.Vector3(), true);
  }

  get clock() {
    const h = (this.time * 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  get time() {
    return this._time;
  }

  // Jumping the clock (debug, ?t=, save games) re-bakes on the next update.
  set time(t) {
    this._time = ((t % 1) + 1) % 1;
    this.envTime = NaN;
  }

  update(dt, focus, forceEnv = false, cover = 0) {
    this._time = (this._time + (dt * this.timeScale) / this.dayLength) % 1;
    const a = (this.time - 0.25) * TAU;
    const sunDir = this.sunDir.set(Math.cos(a), Math.sin(a), 0.38).normalize();
    const elev = sunDir.y;
    const day = smoothstep(-0.06, 0.28, elev);
    const twilight = Math.exp(-(((elev - 0.03) / 0.15) ** 2));
    const night = 1 - smoothstep(-0.22, 0.03, elev);
    Object.assign(this.state, { day, night, twilight, elev });

    const u = this.uniforms;
    u.uSunDir.value.copy(sunDir);
    u.uTime.value += dt;
    u.uNight.value = night;
    u.uZenith.value.copy(P.nightZenith).lerp(P.dayZenith, day).lerp(P.setZenith, twilight * 0.55);
    u.uHorizon.value.copy(P.nightHorizon).lerp(P.dayHorizon, day).lerp(P.setHorizon, twilight * 0.8);
    u.uFog.value.copy(P.nightFog).lerp(P.dayFog, day).lerp(P.setFog, twilight * 0.55);
    u.uSunColor.value.copy(P.sunDay).lerp(P.sunSet, clamp(twilight * 1.2, 0, 1));
    globalUniforms.uDay.value = day;

    // Fog: thicker at dawn/dusk and at night, a touch denser under canopy.
    this.scene.fog.color.copy(u.uFog.value);
    this.scene.fog.density = 0.0105 + twilight * 0.004 + night * 0.006 + cover * 0.003;

    // Sun by day, moon by night (same light, swapped direction).
    const moonUp = elev < -0.02;
    const L = moonUp ? sunDir.clone().negate() : sunDir;
    if (moonUp) {
      this.sun.color.copy(P.moon);
      this.sun.intensity = 0.8 * smoothstep(0.0, 0.25, -elev);
    } else {
      this.sun.color.copy(u.uSunColor.value);
      this.sun.intensity = 3.4 * smoothstep(-0.02, 0.2, elev);
    }
    // Keep the shadow camera centred on the player, snapped to texels.
    const texel = 96 / 2048;
    const tx = Math.round(focus.x / texel) * texel, tz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(tx, focus.y, tz);
    this.sun.position.set(tx + L.x * 150, focus.y + L.y * 150, tz + L.z * 150);
    this.sun.target.updateMatrixWorld();

    this.hemi.color.copy(P.hemiSkyNight).lerp(P.hemiSkyDay, day);
    // Night keeps a cool moonlit fill so shadows hold detail instead of crushing to black.
    this.hemi.groundColor.copy(P.hemiGround).multiplyScalar(0.9 + 0.1 * day);
    // canopy only dims the daylight fill; at night ambient is all there is
    this.hemi.intensity = (3.2 - 2.4 * day) * (1 - cover * 0.35 * day);
    this.scene.environmentIntensity = (1.3 - 0.45 * day) * (1 - cover * 0.45 * day);

    this.dome.position.copy(focus);

    // re-bake every ~3.6 game minutes of sky change, at most every 0.06 s of real time
    this.envCooldown -= dt;
    const moved = Math.abs(this._time - this.envTime);
    if (forceEnv || Number.isNaN(this.envTime) || (Math.min(moved, 1 - moved) > 0.0025 && this.envCooldown <= 0)) {
      this.envTime = this._time;
      this.envCooldown = 0.06;
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 100);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
  }
}
