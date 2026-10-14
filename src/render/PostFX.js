// The frame pipeline after the scene is drawn. Everything stays in linear HDR until
// the last pass:
//
//   scene (MSAA, half float, depth texture)
//     -> ambient occlusion from depth (half res, bilateral blur)
//     -> sun shafts: a short ray march through the sun's shadow map (half res, blur)
//     -> composite (AO, light shafts) + the viewmodel drawn on top
//     -> bloom
//     -> tone map, colour grade, vignette, dither -> screen
//
// The light shafts are real volumetric light: each pixel walks its view ray through the
// humid air and asks the shadow map whether each step is in sunlight, so the canopy
// casts visible beams from any angle, not just when looking at the sun.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec2 uFull;
varying vec2 vUv;
vec3 viewPos(vec2 uv, float d) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
// interleaved gradient noise (Jimenez 2014)
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// Scalable ambient obscurance with normals rebuilt from depth.
const AO_FRAG = COMMON + /* glsl */`
uniform float uRadius; uniform float uIntensity; uniform float uProjScale; uniform float uFade;
void main() {
  float d = textureLod(tDepth, vUv, 0.0).r;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv, d);
  vec2 px = 1.0 / uFull;
  vec3 Pr = viewPos(vUv + vec2(px.x, 0.0), textureLod(tDepth, vUv + vec2(px.x, 0.0), 0.0).r);
  vec3 Pl = viewPos(vUv - vec2(px.x, 0.0), textureLod(tDepth, vUv - vec2(px.x, 0.0), 0.0).r);
  vec3 Pu = viewPos(vUv + vec2(0.0, px.y), textureLod(tDepth, vUv + vec2(0.0, px.y), 0.0).r);
  vec3 Pd = viewPos(vUv - vec2(0.0, px.y), textureLod(tDepth, vUv - vec2(0.0, px.y), 0.0).r);
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  float rPix = min(uRadius * uProjScale / -P.z, 90.0);
  if (rPix < 1.5) { gl_FragColor = vec4(1.0); return; }
  float ang = ign(gl_FragCoord.xy) * 6.2831853;
  float occ = 0.0;
  float R2 = uRadius * uRadius;
  for (int i = 0; i < 12; i++) {
    float t = (float(i) + 0.5) / 12.0;
    float a = ang + float(i) * 2.39996;
    vec2 suv = vUv + vec2(cos(a), sin(a)) * (t * rPix) * px;
    vec3 S = viewPos(suv, textureLod(tDepth, suv, 0.0).r);
    vec3 v = S - P;
    float vv = dot(v, v);
    float f = max(R2 - vv, 0.0) / R2;
    occ += f * f * max(dot(v, N) * inversesqrt(vv + 1e-4) - 0.12, 0.0);
  }
  float ao = clamp(1.0 - uIntensity * occ / 12.0 * 2.2, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(uFade * 0.6, uFade, -P.z));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

// Depth-aware separable blur, used for both AO and the light shafts.
const BLUR_FRAG = COMMON + /* glsl */`
uniform sampler2D tSrc; uniform vec2 uStep; uniform float uNear; uniform float uFar;
float lz(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float zc = lz(textureLod(tDepth, vUv, 0.0).r);
  vec4 sum = vec4(0.0); float ws = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uStep * float(i);
    float z = lz(textureLod(tDepth, uv, 0.0).r);
    float w = exp(-float(i * i) / 10.0) * exp(-abs(z - zc) / (0.04 * zc + 0.05));
    sum += textureLod(tSrc, uv, 0.0) * w;
    ws += w;
  }
  gl_FragColor = sum / max(ws, 1e-4);
}`;

const VOL_FRAG = COMMON + /* glsl */`
#include <packing>
uniform sampler2D tShadow; uniform mat4 uShadowMat; uniform vec3 uCam; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uDensity; uniform float uMaxDist; uniform float uG; uniform float uBias; uniform float uFogBase;
void main() {
  float d = textureLod(tDepth, vUv, 0.0).r;
  vec3 Pv = viewPos(vUv, d);
  // looking at the sky, only the air near you scatters (a full march there is a white veil)
  float dist = d >= 0.99999 ? 22.0 : min(length(Pv), uMaxDist);
  vec3 dir = normalize((uViewInv * vec4(Pv, 0.0)).xyz);
  float j = ign(gl_FragCoord.xy);
  float stepLen = dist / 28.0;
  float lit = 0.0;
  for (int i = 0; i < 28; i++) {
    vec3 W = uCam + dir * ((float(i) + j) * stepLen);
    vec4 sc = uShadowMat * vec4(W, 1.0);
    float vis = 1.0;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0)
      vis = step(sc.z - uBias, unpackRGBAToDepth(textureLod(tShadow, sc.xy, 0.0)));
    // humid air pools low: thicker near the forest floor, thinning above the canopy
    float h = exp(-max(W.y - uFogBase, 0.0) * 0.045);
    lit += vis * h;
  }
  float c = dot(dir, uSunDir);
  float g = uG, g2 = g * g;
  float hg = (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-3), 1.5);
  float phase = mix(1.0, hg, 0.92) * 0.08;
  // shafts are contrast: rays that run through sunlit air and shadow alike read as beams,
  // air that's lit all the way (open ground) is the fog's job, not ours
  float lf = lit / 28.0;
  // (the lit-air floor is small: under dense crowns every ray is partly lit, and a big floor
  // lifted the whole frame into a milky haze with no beam in it)
  float beam = lf * (1.0 - lf) * 4.0 * 0.7 + lf * 0.08;
  vec3 col = uSunColor * beam * dist * uDensity * phase;
  gl_FragColor = vec4(col, 1.0);
}`;

const COMP_FRAG = COMMON + /* glsl */`
uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tVol; uniform float uAO; uniform float uVol;
uniform sampler2D tWaterN; uniform float uWaterY; uniform float uWaterOn; uniform float uTime;
uniform mat4 uProj; uniform mat4 uView; uniform vec3 uCamPos;
// Screen-space reflection on the water. Returns the reflected colour (rgb) and how much of it
// to use (a): Fresnel times how sure the march is of its hit.
vec4 ogWaterSSR(vec2 uv) {
  float d = textureLod(tDepth, uv, 0.0).r;
  vec3 Pw = (uViewInv * vec4(viewPos(uv, d), 1.0)).xyz;
  vec3 dir = normalize(Pw - uCamPos);
  if (uCamPos.y <= uWaterY + 0.02 || dir.y > -0.0005) return vec4(0.0);
  float tPlane = (uWaterY - uCamPos.y) / dir.y;
  float tBed = d >= 0.99999 ? 1e9 : length(Pw - uCamPos);
  if (tPlane >= tBed || tPlane > 160.0) return vec4(0.0);
  vec3 S = uCamPos + dir * tPlane;
  // the same two scrolling ripple layers as the water material
  vec2 q = S.xz / 9.0;
  vec2 n1 = texture2D(tWaterN, q + vec2(uTime * 0.018, uTime * 0.011)).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(tWaterN, q * 0.43 + vec2(-uTime * 0.009, uTime * 0.016)).xy * 2.0 - 1.0;
  // ripples bend the reflection; Fresnel follows the calm surface (rippled Fresnel flickers)
  vec3 n = normalize(vec3((n1.x + n2.x) * 0.15, 1.0, (n1.y + n2.y) * 0.15));
  vec3 R = reflect(dir, n);
  R.y = max(R.y, 0.02);
  float fres = 0.02 + 0.98 * pow(1.0 - max(-dir.y, 0.0), 5.0);
  // march the reflected ray in view space, steps growing with distance
  vec3 p = (uView * vec4(S, 1.0)).xyz, rd = normalize(mat3(uView) * R);
  float stepLen = 0.25 + tPlane * 0.01;
  vec2 hitUv = vec2(-1.0);
  float jitter = ign(gl_FragCoord.xy + fract(uTime) * 37.0);
  p += rd * stepLen * jitter;
  for (int i = 0; i < 40; i++) {
    vec3 prev = p;
    p += rd * stepLen;
    stepLen *= 1.1;
    vec4 cl = uProj * vec4(p, 1.0);
    if (cl.w <= 0.0) break;
    vec2 sp = cl.xy / cl.w * 0.5 + 0.5;
    if (sp.x < 0.0 || sp.y < 0.0 || sp.x > 1.0 || sp.y > 1.0) break;
    float sd = textureLod(tDepth, sp, 0.0).r;
    if (sd >= 0.99999) continue;
    float sz = viewPos(sp, sd).z;
    float behind = sz - p.z; // > 0: the ray has gone behind what the screen shows
    if (behind > 0.0 && behind < max(1.2, stepLen * 2.5)) {
      // refine between the last two steps
      vec3 a = prev, b = p;
      for (int k = 0; k < 5; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 mc = uProj * vec4(m, 1.0);
        vec2 ms = mc.xy / mc.w * 0.5 + 0.5;
        float mz = viewPos(ms, textureLod(tDepth, ms, 0.0).r).z;
        if (mz - m.z > 0.0) b = m; else a = m;
      }
      vec4 bc = uProj * vec4(b, 1.0);
      hitUv = bc.xy / bc.w * 0.5 + 0.5;
      break;
    }
  }
  if (hitUv.x < 0.0) return vec4(0.0);
  // fade toward the screen's edges, where the march runs out of picture
  vec2 e = smoothstep(0.0, 0.08, hitUv) * smoothstep(0.0, 0.08, 1.0 - hitUv);
  float conf = e.x * e.y * smoothstep(0.0, 0.08, uWaterY - Pw.y + (d >= 0.99999 ? 1.0 : 0.0));
  return vec4(texture2D(tScene, hitUv).rgb, fres * conf);
}
void main() {
  vec4 c = texture2D(tScene, vUv);
  if (uWaterOn > 0.5) {
    vec4 ref = ogWaterSSR(vUv);
    c.rgb = mix(c.rgb, ref.rgb, clamp(ref.a, 0.0, 0.85));
  }
  float ao = texture2D(tAO, vUv).r;
  // occlusion is for the soft fill; brightly sunlit pixels keep most of their light
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = uAO * (1.0 - 0.55 * smoothstep(0.35, 2.0, l));
  c.rgb *= mix(1.0, ao, k);
  c.rgb += texture2D(tVol, vUv).rgb * uVol;
  gl_FragColor = vec4(c.rgb, 1.0);
}`;

const FINAL_FRAG = /* glsl */`
#include <tonemapping_pars_fragment>
uniform sampler2D tColor; uniform float uExposure; uniform float uContrast; uniform float uSat;
uniform vec3 uLift; uniform vec3 uGain; uniform float uVignette; uniform float uMode; uniform float uTime;
uniform vec3 uShadowTint; uniform vec3 uHighTint;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * uExposure;
  // contrast in linear light, pivoting on mid grey: a power curve has no floor to clip against
  c = 0.18 * pow(max(c, vec3(0.0)) / 0.18, vec3(uContrast));
  c = uMode < 0.5 ? ACESFilmicToneMapping(c) : AgXToneMapping(c);
  c = clamp(c, 0.0, 1.0);
  // split toning in linear: cool shadows, warm highlights
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.5, l));
  vec3 s = toSRGB(clamp(c, 0.0, 1.0));
  // saturation, lift and gain
  float ls = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s = mix(vec3(ls), s, uSat);
  s = uLift + s * (uGain - uLift);
  // vignette
  vec2 q = vUv - 0.5;
  s *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  // dither away banding in the fog and sky
  s += (ign(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, ...opts });
}

export class PostFX {
  constructor(renderer, scene, camera, sky) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.enabled = { ao: true, vol: true, bloom: true };
    this.size = new THREE.Vector2(1, 1);

    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.UnsignedIntType;
    this.sceneRT = rt(1, 1, { samples: 4, depthBuffer: true, depthTexture: depth });
    // the composite keeps its own depth so the viewmodel can be drawn into it
    this.compRT = rt(1, 1, { samples: 4, depthBuffer: true });
    this.aoA = rt(1, 1);
    this.aoB = rt(1, 1);
    this.volA = rt(1, 1);
    this.volB = rt(1, 1);

    const common = () => ({
      tDepth: { value: depth },
      uProjInv: { value: camera.projectionMatrixInverse },
      uViewInv: { value: camera.matrixWorld },
      uFull: { value: new THREE.Vector2(1, 1) },
    });
    // toneMapped: false keeps three from injecting its own tone mapping into these passes
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.aoMat = mat(AO_FRAG, {
      ...common(), uRadius: { value: 1.1 }, uIntensity: { value: 1.0 }, uProjScale: { value: 500 }, uFade: { value: 70 },
    });
    this.blurMat = mat(BLUR_FRAG, {
      ...common(), tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uNear: { value: camera.near }, uFar: { value: camera.far },
    });
    this.volMat = mat(VOL_FRAG, {
      ...common(), tShadow: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uDensity: { value: 0.007 },
      uMaxDist: { value: 35 }, uG: { value: 0.7 }, uBias: { value: 0.002 }, uFogBase: { value: 0 },
    });
    this.camPos = new THREE.Vector3();
    this.compMat = mat(COMP_FRAG, {
      ...common(), tScene: { value: this.sceneRT.texture }, tAO: { value: this.aoA.texture }, tVol: { value: this.volA.texture },
      uAO: { value: 0.85 }, uVol: { value: 1 },
      tWaterN: { value: null }, uWaterY: { value: 0 }, uWaterOn: { value: 0 }, uTime: { value: 0 },
      uProj: { value: camera.projectionMatrix }, uView: { value: camera.matrixWorldInverse }, uCamPos: { value: this.camPos },
    });
    this.finalMat = mat(FINAL_FRAG, {
      tColor: { value: this.compRT.texture }, uExposure: { value: 1 }, uContrast: { value: 1.06 }, uSat: { value: 1.0 },
      uLift: { value: new THREE.Vector3(0.018, 0.022, 0.018) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uVignette: { value: 0.22 }, uMode: { value: 0 }, uTime: { value: 0 },
      uShadowTint: { value: new THREE.Vector3(1.0, 0.99, 0.95) }, uHighTint: { value: new THREE.Vector3(1.04, 1.0, 0.94) },
    });
    this.quad = new FullScreenQuad(null);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 1.15);
    this.time = 0;
  }

  setSize(w, h) {
    this.size.set(w, h);
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));
    this.sceneRT.setSize(w, h);
    this.compRT.setSize(w, h);
    for (const t of [this.aoA, this.aoB, this.volA, this.volB]) t.setSize(hw, hh);
    for (const m of [this.aoMat, this.blurMat, this.volMat, this.compMat]) m.uniforms.uFull.value.set(w, h);
    this.bloom.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  blur(src, tmp, w, h) {
    const u = this.blurMat.uniforms;
    u.tSrc.value = src.texture;
    u.uStep.value.set(1 / w, 0);
    this.pass(this.blurMat, tmp);
    u.tSrc.value = tmp.texture;
    u.uStep.value.set(0, 1 / h);
    this.pass(this.blurMat, src);
  }

  // `viewmodel` is drawn into the HDR composite so it shares the grade and bloom.
  render(dt, viewmodel) {
    const r = this.renderer, cam = this.camera;
    this.time += dt;
    const [w, h] = [this.size.x, this.size.y];
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, cam);

    // AO
    if (this.enabled.ao) {
      const u = this.aoMat.uniforms;
      u.uProjScale.value = cam.projectionMatrix.elements[5] * 0.5 * h;
      this.pass(this.aoMat, this.aoA);
      this.blur(this.aoA, this.aoB, hw, hh);
    }
    this.compMat.uniforms.uAO.value = this.enabled.ao ? 0.85 : 0;

    // light shafts through the sun's (or moon's) shadow map
    const sun = this.sky.sun;
    const vol = this.enabled.vol && sun.intensity > 0.01 && sun.shadow.map;
    if (vol) {
      const u = this.volMat.uniforms;
      u.tShadow.value = sun.shadow.map.texture;
      u.uShadowMat.value.copy(sun.shadow.matrix);
      u.uCam.value.copy(cam.position);
      u.uSunDir.value.subVectors(sun.position, sun.target.position).normalize();
      u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
      u.uFogBase.value = cam.position.y - 2;
      this.pass(this.volMat, this.volA);
      this.blur(this.volA, this.volB, hw, hh);
    }
    this.compMat.uniforms.uVol.value = vol ? this.volumeStrength ?? 1 : 0;
    // reflections on the water (see ogWaterSSR)
    const cu = this.compMat.uniforms;
    cu.uWaterOn.value = this.water && this.enabled.ssr !== false ? 1 : 0;
    if (this.water) {
      cu.tWaterN.value = this.water.normalTex;
      cu.uWaterY.value = this.water.mesh.position.y;
      cu.uTime.value = this.water.time();
    }
    this.camPos.setFromMatrixPosition(cam.matrixWorld);

    // composite + viewmodel
    this.pass(this.compMat, this.compRT);
    if (viewmodel) {
      r.setRenderTarget(this.compRT);
      r.clearDepth();
      r.render(viewmodel.scene, viewmodel.camera);
    }

    if (this.enabled.bloom) this.bloom.render(r, null, this.compRT, dt, false);

    this.finalMat.uniforms.uTime.value = this.time;
    this.finalMat.uniforms.uExposure.value = this.exposure ?? 1;
    this.pass(this.finalMat, null);
  }
}
