// Small composable patches for three's built-in materials. Each patch hooks
// onBeforeCompile so we keep PBR lighting, shadows and fog for free while
// adding wind, moss, foliage lighting and terrain splatting.
import * as THREE from 'three';

export const globalUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uDay: { value: 1 }, // 1 = full daylight, 0 = night
};

const f = (n) => Number(n).toFixed(5);

export function patch(material, key, fn) {
  const prev = material.onBeforeCompile;
  const keys = (material.userData.patchKeys ||= []);
  keys.push(key);
  material.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    fn(shader);
  };
  material.customProgramCacheKey = () => keys.join('|');
  return material;
}

// Height-proportional sway (whole plant) + optional leaf flutter.
export function addWind(material, { sway = 0.004, flutter = 0 } = {}) {
  return patch(material, `wind:${sway}:${flutter}`, (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uWind = globalUniforms.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float ph = ip.x * 0.21 + ip.z * 0.17;
        float hgt = max(transformed.y, 0.0);
        float gust = 0.55 + 0.45 * sin(uTime * 0.31 + ip.x * 0.013 + ip.z * 0.007);
        float s = (sin(uTime * 1.1 + ph) * 0.7 + sin(uTime * 2.3 + ph * 1.3) * 0.3) * gust * uWind;
        transformed.x += s * ${f(sway)} * hgt;
        transformed.z += s * ${f(sway * 0.5)} * hgt;
        ${flutter > 0 ? `transformed += objectNormal * sin(uTime * 7.0 + dot(position, vec3(3.1, 2.3, 2.7)) + ph) * ${f(flutter)} * min(hgt, 3.0) * gust;` : ''}
      }`);
  });
}

// Foliage cards carry custom "outward" normals; undo three's back-face flip
// so canopies light like soft volumes, and add a little sub-surface glow.
export function addFoliageLighting(material, glow = 0.07) {
  return patch(material, `foliage:${glow}`, (shader) => {
    shader.uniforms.uDay = globalUniforms.uDay;
    shader.fragmentShader = 'uniform float uDay;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${f(glow)} * uDay;`);
  });
}

const NOISE_GLSL = /* glsl */`
float ogHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ogNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ogHash(i), ogHash(i + vec2(1.0, 0.0)), f.x),
             mix(ogHash(i + vec2(0.0, 1.0)), ogHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// World-space moss on upward-facing surfaces (rocks, ruins, logs).
export function addMoss(material, mossMap, { amount = 0.5, scale = 0.35 } = {}) {
  return patch(material, `moss:${amount}:${scale}`, (shader) => {
    shader.uniforms.uMossMap = { value: mossMap };
    shader.vertexShader = 'varying vec3 vMossN;\nvarying vec3 vMossP;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      {
        mat4 mm = modelMatrix;
        #ifdef USE_INSTANCING
          mm = modelMatrix * instanceMatrix;
        #endif
        vMossN = normalize(mat3(mm) * objectNormal);
        vMossP = (mm * vec4(transformed, 1.0)).xyz;
      }`);
    shader.fragmentShader = 'uniform sampler2D uMossMap;\nvarying vec3 vMossN;\nvarying vec3 vMossP;\n' + NOISE_GLSL +
      shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
      {
        float nz = ogNoise(vMossP.xz * ${f(scale)} + vMossP.y * 0.3) * 0.65 + ogNoise(vMossP.xz * 1.9 + vMossP.y) * 0.35;
        float m = smoothstep(0.2, 0.62, vMossN.y + (nz - 0.5) * 1.1 + ${f(amount - 0.5)});
        vec3 mc = texture2D(uMossMap, vMossP.xz * 0.35 + vMossP.y * 0.1).rgb * (0.75 + 0.5 * nz);
        diffuseColor.rgb = mix(diffuseColor.rgb, mc, m);
      }`);
  });
}

// Four-way splat for the terrain: forest litter, moss, rock (tri-planar), mud.
export function makeTerrainMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  return patch(mat, 'terrain', (shader) => {
    Object.assign(shader.uniforms, {
      tLitter: { value: tex.litter },
      tMoss: { value: tex.moss },
      tRock: { value: tex.rock },
      tMud: { value: tex.mud },
    });
    shader.vertexShader = 'attribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vTP;\nvarying vec3 vTN;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat;
        vTP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = /* glsl */`
      uniform sampler2D tLitter; uniform sampler2D tMoss; uniform sampler2D tRock; uniform sampler2D tMud;
      varying vec4 vSplat; varying vec3 vTP; varying vec3 vTN;
      ${NOISE_GLSL}
    ` + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      {
        vec2 p = vTP.xz;
        float macro = ogNoise(p * 0.02) * 0.6 + ogNoise(p * 0.11) * 0.4;
        vec3 litter = mix(texture2D(tLitter, p * 0.21).rgb, texture2D(tLitter, p * 0.113 + 0.37).rgb, 0.3);
        vec3 moss = mix(texture2D(tMoss, p * 0.18).rgb, texture2D(tMoss, p * 0.077 + 0.61).rgb, 0.35);
        vec3 an = abs(normalize(vTN));
        an = pow(an, vec3(4.0)); an /= (an.x + an.y + an.z);
        vec3 rock = texture2D(tRock, vec2(vTP.z, vTP.y) * 0.16).rgb * an.x
                  + texture2D(tRock, p * 0.16).rgb * an.y
                  + texture2D(tRock, vec2(vTP.x, vTP.y) * 0.16).rgb * an.z;
        // wet dark streaks running down cliff faces
        float streak = ogNoise(vec2((vTP.x + vTP.z) * 0.9, vTP.y * 0.08));
        rock *= 0.75 + 0.5 * streak;
        vec3 mud = texture2D(tMud, p * 0.17).rgb;
        // cliffs: darker stone with moss creeping over ledges
        float ledge = smoothstep(0.5, 0.85, vTN.y + (macro - 0.5) * 0.5);
        rock = mix(rock * vec3(0.42, 0.43, 0.36), moss * 0.85, ledge * 0.8);
        vec4 w = vSplat;
        // break up blend edges with texture detail + macro noise
        w.x *= 0.6 + dot(litter, vec3(1.2)) + macro * 0.4;
        w.y *= 0.5 + dot(moss, vec3(1.0)) + (1.0 - macro) * 0.6;
        w.z *= 0.6 + dot(rock, vec3(1.0));
        w.w *= 0.7 + dot(mud, vec3(0.8));
        w = pow(max(w, vec4(0.0)), vec4(3.0));
        w /= max(w.x + w.y + w.z + w.w, 1e-5);
        vec3 col = litter * w.x + moss * w.y * 0.8 + rock * w.z + mud * w.w * 0.85;
        diffuseColor.rgb *= col * 1.9;
      }`);
  });
}

// Replace three's fog with distance fog + low-lying valley mist. Uses only
// mvPosition so it works in every built-in shader (including sprites).
export function installFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth;
    varying float vFogWorldY;
  #endif`;
  C.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vFogWorldY = (transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz)).y;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying float vFogWorldY;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      float mistH = exp( - max( vFogWorldY - 0.5, 0.0 ) * 0.14 );
      float mist = mistH * ( 1.0 - exp( - vFogDepth * fogDensity * 1.6 ) ) * 0.8;
      fogFactor = clamp( max( fogFactor, mist ), 0.0, 1.0 );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif`;
}
