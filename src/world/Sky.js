// Sky dome, sun/moon, day-night cycle, fog and image-based lighting.
import * as THREE from 'three';
import { smoothstep, clamp } from '../utils/math.js';
import { globalUniforms, fogSun } from '../art/shaders.js';

const TAU = Math.PI * 2;
const col = (hex) => new THREE.Color(hex);

// Palette keyed by sun state; colours are authored in sRGB.
const P = {
  dayZenith: col('#3c78c8'), dayHorizon: col('#b4cdd3'), dayFog: col('#8ea69c'),
  setZenith: col('#2b3c6e'), setHorizon: col('#f39a5c'), setFog: col('#b48a6a'),
  nightZenith: col('#0e1e40'), nightHorizon: col('#1c2c48'), nightFog: col('#25344c'),
  sunDay: col('#fff0d4'), sunSet: col('#ff9248'), moon: col('#9fb8f0'),
  hemiSkyDay: col('#d9dccb'), hemiSkyNight: col('#4f669a'), hemiGround: col('#5a4f36'),
  // the drowned grove's mist (scaled down at night)
  swampFog: col('#6f8270'),
};
const _swampFog = new THREE.Color();

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
// cumulus coverage at a point of the cloud layer: warped fbm, puffy (billowed) detail
float cloudAt(vec2 uv, float cover) {
  vec2 w = vec2(fbm(uv * 0.6 + 3.1), fbm(uv * 0.6 - 7.7)) - 0.5;
  vec2 q = uv + w * 0.9;
  float base = fbm(q * 0.9);
  float puff = 1.0 - abs(noise(q * 5.0) * 2.0 - 1.0);
  float c = base + (puff - 0.5) * 0.12;
  return smoothstep(0.52 - cover * 0.14, 0.78, c);
}
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
    float fade = smoothstep(0.0, 0.2, h);
    // high cirrus: faint streaks stretched along the wind
    vec2 cu = uv * vec2(0.6, 2.4) * 1.3 + vec2(uTime * 0.002, 0.0);
    float ci = smoothstep(0.55, 0.9, fbm(cu)) * 0.35 * fade;
    vec3 ciCol = mix(uHorizon, vec3(1.0), 0.5) * (0.2 + 0.8 * (1.0 - uNight)) + uSunColor * pow(sd, 6.0) * 0.5 * above;
    col = mix(col, ciCol, ci);
    // cumulus: density here, and toward the sun (light that had to get through)
    float c = cloudAt(uv * 1.5, uCloud);
    vec2 toSun = normalize(uSunDir.xz + vec2(1e-4)) * 0.05;
    float occ = cloudAt(uv * 1.5 + toSun, uCloud) * 0.55 + cloudAt(uv * 1.5 + toSun * 2.5, uCloud) * 0.45;
    float light = exp(-occ * 2.2);
    // silver lining: thin edges facing the sun glow, thick bellies go grey-blue
    float edge = (1.0 - smoothstep(0.0, 0.6, c)) * pow(sd, 4.0) * above;
    vec3 sunlit = mix(uHorizon, vec3(1.0), 0.6) * (0.25 + 0.75 * (1.0 - uNight)) + uSunColor * (0.35 + 0.9 * pow(sd, 3.0)) * above;
    vec3 belly = mix(uZenith, uFog, 0.65) * 0.62;
    vec3 cc = mix(belly, sunlit, light) + uSunColor * edge * 1.4;
    col = mix(col, cc, c * fade * 0.94);
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
    // The sky is a smooth gradient: a 64 px cube holds all of it. It is baked into this one
    // cube and prefiltered into the same target every time (fromScene allocated a new 256 px
    // target per bake: 20-45 ms hitches every second or two through the day).
    this.envCube = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.envCam = new THREE.CubeCamera(0.1, 100, this.envCube);
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
    sh.normalBias = 0.12;
    // soft shadows that widen with distance from the caster (installSoftShadows): 2.5x the
    // sun's own blur, for the light the canopy scatters
    sh.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0x9db4a4, 0.011);
    this.state = { day: 1, night: 0, twilight: 0, elev: 1 };
    // scratch vectors for the light-space shadow snap
    this._c = new THREE.Vector3(); this._t = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this._lx = new THREE.Vector3(); this._ly = new THREE.Vector3(); this._lz = new THREE.Vector3();
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

  // swamp: how deep in the drowned grove the player stands (greener, thicker fog)
  update(dt, focus, forceEnv = false, cover = 0, ahead = null, swamp = 0) {
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

    // Fog: thicker at dawn/dusk and at night, a touch denser under canopy. Under the crowns the
    // air is in their shade: a deep green haze with less of the sun's glow in it, not a milky veil
    this.scene.fog.color.copy(u.uFog.value).multiplyScalar(1 - 0.4 * cover);
    if (swamp > 0) this.scene.fog.color.lerp(_swampFog.copy(P.swampFog).multiplyScalar(0.25 + 0.75 * day), swamp * 0.7);
    this.scene.fog.density = 0.0082 + twilight * 0.004 + night * 0.006 + cover * 0.002 + swamp * 0.016 + (this.fogBoost || 0);

    // Sun by day, moon by night (same light, swapped direction).
    const moonUp = elev < -0.02;
    const L = moonUp ? sunDir.clone().negate() : sunDir;
    if (moonUp) {
      this.sun.color.copy(P.moon);
      this.sun.intensity = 1.1 * smoothstep(0.0, 0.25, -elev);
    } else {
      this.sun.color.copy(u.uSunColor.value);
      this.sun.intensity = 3.4 * smoothstep(-0.02, 0.2, elev);
    }
    // the haze glows toward the sun (or, faintly, the moon)
    const glow = (moonUp ? 0.1 * night : 0.6 * smoothstep(-0.04, 0.12, elev)) * (1 - 0.6 * cover);
    fogSun.dir[0] = L.x; fogSun.dir[1] = L.y; fogSun.dir[2] = L.z;
    fogSun.color[0] = this.sun.color.r * glow;
    fogSun.color[1] = this.sun.color.g * glow;
    fogSun.color[2] = this.sun.color.b * glow;
    // valley mist: pools in the lows at dawn, burns off by midday, gathers again at dusk and night
    const morning = Math.exp(-(((this.time - 0.27) / 0.06) ** 2));
    fogSun.params[0] = 0.12 + 0.45 * Math.max(morning, twilight * 0.7) + 0.25 * night;
    // Keep the shadow camera centred on the player (pushed ahead along the view, where the
    // shadows are actually seen), snapped to whole texels *in the light's own view plane* so
    // the shadow map's grid stays put in the world as the player moves (no crawling edges).
    // The basis matches three's lookAt for the shadow camera (up = +y).
    const texel = 96 / this.sun.shadow.mapSize.x;
    const C = this._c.set(focus.x + (ahead ? ahead.x * 18 : 0), focus.y, focus.z + (ahead ? ahead.z * 18 : 0));
    const lz = this._lz.copy(L).normalize();
    const lx = this._lx.crossVectors(this._up, lz);
    if (lx.lengthSq() < 1e-6) lx.set(1, 0, 0);
    lx.normalize();
    const ly = this._ly.crossVectors(lz, lx);
    const su = Math.round(C.dot(lx) / texel) * texel, sv = Math.round(C.dot(ly) / texel) * texel, sw = C.dot(lz);
    const T = this._t.copy(lx).multiplyScalar(su).addScaledVector(ly, sv).addScaledVector(lz, sw);
    this.sun.target.position.copy(T);
    this.sun.position.copy(T).addScaledVector(lz, 150);
    this.sun.target.updateMatrixWorld();

    this.hemi.color.copy(P.hemiSkyNight).lerp(P.hemiSkyDay, day);
    // Night keeps a cool moonlit fill so shadows hold detail instead of crushing to black.
    this.hemi.groundColor.copy(P.hemiGround).multiplyScalar(0.9 + 0.1 * day);
    // canopy only dims the daylight fill; at night ambient is all there is
    // the canopy map (render/Canopy.js) dims ambient per pixel under the crowns
    // (night was lit nearly like day: a lower fill lets the moon, fires, lanterns and the
    // Heartwood carve the clearing out of the dark, while the Blight's rims still carry)
    this.hemi.intensity = 2.0 - 1.2 * day;
    this.scene.environmentIntensity = 0.85;

    this.dome.position.copy(focus);

    // re-bake every ~3.6 game minutes of sky change, at most every 0.06 s of real time
    this.envCooldown -= dt;
    const moved = Math.abs(this._time - this.envTime);
    if (forceEnv || Number.isNaN(this.envTime) || (Math.min(moved, 1 - moved) > 0.0025 && this.envCooldown <= 0)) {
      this.envTime = this._time;
      this.envCooldown = 0.06;
      this.envCam.update(this.renderer, this.envScene);
      this.envRT = this.pmrem.fromCubemap(this.envCube.texture, this.envRT);
      this.scene.environment = this.envRT.texture;
    }
  }
}
