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

// Shear an instance's low parts onto the ground slope (aSlope = dh/dx, dh/dz
// per instance), so roots, buttresses, stumps and logs follow a hillside
// instead of sticking out of it. Fades out by `top` metres up the model.
export function addSlopeShear(material, top = 3) {
  return patch(material, `slope:${top}`, (shader) => {
    shader.vertexShader = 'attribute vec2 aSlope;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      #ifdef USE_INSTANCING
      {
        vec3 wo = mat3(instanceMatrix) * transformed;
        float sc = length(instanceMatrix[0].xyz);
        transformed.y += dot(wo.xz, aSlope) / sc * (1.0 - smoothstep(0.2, ${f(top)}, transformed.y));
      }
      #endif`);
  });
}

// Foliage cards carry custom "outward" normals; undo three's back-face flip
// so canopies light like soft volumes, and add a little sub-surface glow.
// A faint cool moonlit fill at night, for big dark surfaces (ground, stone)
// so shade keeps its detail without raising exposure for the whole scene.
export function addNightFill(material, amount = 0.35) {
  return patch(material, `nightfill:${amount}`, (shader) => {
    shader.uniforms.uDay = globalUniforms.uDay;
    shader.fragmentShader = 'uniform float uDay;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 0.65, 1.0) * ${f(amount)} * (1.0 - uDay);`);
  });
}

// Thin cards self-shadow into acne at the global bias; foliage gets its own
// extra receiver bias (contact shadows on terrain and props are untouched).
const FOLIAGE_LIGHTS = THREE.ShaderChunk.lights_fragment_begin.replace(
  'directionalLightShadow.shadowBias,', '( directionalLightShadow.shadowBias - 0.0012 ),');

export function addFoliageLighting(material, glow = 0.07) {
  return patch(material, `foliage:${glow}`, (shader) => {
    shader.uniforms.uDay = globalUniforms.uDay;
    shader.fragmentShader = 'uniform float uDay;\n' + shader.fragmentShader
      .replace('#include <lights_fragment_begin>', FOLIAGE_LIGHTS)
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
        // tri-planar so moss doesn't streak down steep faces
        vec3 tw = pow(abs(vMossN), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 mc = (texture2D(uMossMap, vMossP.zy * 0.35).rgb * tw.x + texture2D(uMossMap, vMossP.xz * 0.35).rgb * tw.y
                 + texture2D(uMossMap, vMossP.xy * 0.35).rgb * tw.z) * (0.75 + 0.5 * nz);
        diffuseColor.rgb = mix(diffuseColor.rgb, mc, m);
      }`);
  });
}

// Four-way splat for the terrain: forest litter, moss, rock (tri-planar), mud.
// Each layer has a height field (tex.heights: r litter, g moss, b rock, a mud)
// used to blend by height, so moss settles between leaves and pebbles poke out
// of the mud, and as a bump map. Two rotated samples per layer, switched by a
// noise mask, hide the tiling; a low-frequency tint breaks up big areas.
export function makeTerrainMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  return patch(mat, 'terrain', (shader) => {
    Object.assign(shader.uniforms, {
      tLitter: { value: tex.litter },
      tMoss: { value: tex.moss },
      tRock: { value: tex.rock },
      tMud: { value: tex.mud },
      tHeight: { value: tex.heights },
      uDay: globalUniforms.uDay,
    });
    shader.vertexShader = 'attribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vTP;\nvarying vec3 vTN;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat;
        vTP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = /* glsl */`
      uniform sampler2D tLitter; uniform sampler2D tMoss; uniform sampler2D tRock; uniform sampler2D tMud;
      uniform sampler2D tHeight;
      uniform float uDay;
      varying vec4 vSplat; varying vec3 vTP; varying vec3 vTN;
      ${NOISE_GLSL}
      vec2 ogRot(vec2 p, float a, vec2 o) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * p + o; }
      // three's bump-map perturbation (perturbNormalArb), for a height computed in-shader
      // Voronoi cells on a rock face: a random tilt per cell and the F2-F1 edge
      // distance, so a cliff breaks into blocky planes with dark seams between them.
      vec3 ogFacet(vec2 q, out float edge) {
        vec2 i = floor(q), f = fract(q), id = vec2(0.0);
        float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + vec2(ogHash(i + g), ogHash(i + g + 19.7)) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) { d2 = d; }
          }
        }
        edge = sqrt(d2) - sqrt(d1);
        return vec3(ogHash(id + 3.1), ogHash(id + 7.3), ogHash(id + 11.9)) * 2.0 - 1.0;
      }
      vec3 ogPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float fd) {
        vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
        vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
        float det = dot(sx, r1) * fd;
        vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
        return normalize(abs(det) * surfNorm - grad);
      }
    ` + shader.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
      float ogH = 0.0;
      vec3 ogFacetN = vec3(0.0);
      float ogRough = 0.92;
      {
        vec2 p = vTP.xz;
        float dist = length(vViewPosition);
        float macro = ogNoise(p * 0.018) * 0.6 + ogNoise(p * 0.09) * 0.4;
        // pick between the two samples by height, not by cross-fade, so the
        // seam follows leaf and cushion outlines instead of ghosting
        float swn = (ogNoise(p * 0.13 + 17.0) - 0.5) * 10.0 + 0.5;
        vec2 uL = p * 0.3125, uL2 = ogRot(uL, 1.7, vec2(0.37, 0.71));
        vec2 uM = p * 0.385, uM2 = ogRot(uM, 2.3, vec2(0.13, 0.57));
        vec2 uD = p * 0.333, uD2 = ogRot(uD, 0.9, vec2(0.61, 0.29));
        float hA = texture2D(tHeight, uL).r, hB = texture2D(tHeight, uL2).r;
        float k = clamp((hB - hA) * 6.0 + swn, 0.0, 1.0);
        vec3 litter = mix(texture2D(tLitter, uL).rgb, texture2D(tLitter, uL2).rgb, k);
        float hL = mix(hA, hB, k);
        hA = texture2D(tHeight, uM).g; hB = texture2D(tHeight, uM2).g;
        k = clamp((hB - hA) * 6.0 + swn, 0.0, 1.0);
        vec3 moss = mix(texture2D(tMoss, uM).rgb, texture2D(tMoss, uM2).rgb, k);
        float hM = mix(hA, hB, k);
        hA = texture2D(tHeight, uD).a; hB = texture2D(tHeight, uD2).a;
        k = clamp((hB - hA) * 6.0 + swn, 0.0, 1.0);
        vec3 mud = mix(texture2D(tMud, uD).rgb, texture2D(tMud, uD2).rgb, k);
        float hD = mix(hA, hB, k);
        vec3 an = abs(normalize(vTN));
        an = pow(an, vec3(8.0)); an /= (an.x + an.y + an.z);
        vec2 rx = vTP.zy * 0.12, ry = p * 0.12, rz = vTP.xy * 0.12;
        vec3 rock = texture2D(tRock, rx).rgb * an.x + texture2D(tRock, ry).rgb * an.y + texture2D(tRock, rz).rgb * an.z;
        // a second, much larger rock octave so cliffs aren't one flat grey plane
        vec3 rockBig = texture2D(tRock, vTP.zy * 0.07 + 0.3).rgb * an.x + texture2D(tRock, p * 0.07 + 0.3).rgb * an.y
                     + texture2D(tRock, vTP.xy * 0.07 + 0.3).rgb * an.z;
        rock = mix(rock, rock * rockBig * 2.2, 0.4);
        float hR = texture2D(tHeight, rx).b * an.x + texture2D(tHeight, ry).b * an.y + texture2D(tHeight, rz).b * an.z;
        // wet dark streaks running down cliff faces, moss creeping over ledges
        float streak = ogNoise(vec2((vTP.x + vTP.z) * 0.35, vTP.y * 0.25));
        rock *= 0.8 + 0.4 * ogNoise(vTP.xz * 0.05 + vTP.y * 0.05);
        rock *= vec3(0.66, 0.67, 0.6) * (0.6 + 0.8 * streak);
        // two octaves of cells, wider than tall like bedding planes, with seams that come and go
        // (one octave of even cells with unbroken dark grout read as paving slabs)
        float fEdge, fEdge2;
        vec2 fq = (an.y > 0.5 ? p : (an.x > an.z ? vTP.zy : vTP.xy)) * vec2(0.42, 0.7);
        vec3 facet = ogFacet(fq, fEdge);
        vec3 facet2 = ogFacet(fq * 2.4 + 5.1, fEdge2);
        facet = normalize(facet + facet2 * 0.6 + 1e-4) * length(facet);
        float seamOn = smoothstep(0.3, 0.7, ogNoise(fq * 1.7 + 3.3));
        float seam = min(smoothstep(0.0, 0.045, fEdge), mix(1.0, smoothstep(0.0, 0.03, fEdge2), 0.5));
        fEdge = mix(1.0, seam, seamOn) * 0.05;
        // the seams become chipped bevels in the bump height, so light catches them
        float chip = smoothstep(0.0, 0.12, fEdge * 20.0);
        float ledge = smoothstep(0.6, 0.85, vTN.y + (macro - 0.5) * 0.5 + (hR - 0.5) * 0.3);
        vec3 rockFacet = rock * (0.8 + 0.3 * (facet.x * 0.5 + 0.5)) * (0.85 + 0.3 * hR);
        rock = mix(rock, moss * 0.85, ledge * 0.8);
        hR = mix(hR, hM, ledge * 0.8);
        // macro tint: dry warm patches and damp dark ones
        float dry = smoothstep(0.3, 0.75, macro);
        litter *= mix(vec3(0.72, 0.7, 0.68), vec3(1.15, 1.06, 0.94), dry);
        moss *= mix(vec3(0.82, 0.95, 0.85), vec3(1.18, 1.1, 0.78), smoothstep(0.3, 0.8, ogNoise(p * 0.05 + 7.0)));
        // height-aware blend
        vec4 w = max(vSplat, vec4(0.0));
        w /= max(w.x + w.y + w.z + w.w, 1e-4);
        vec4 hh = vec4(hL, hM, hR, hD);
        vec4 a = w + hh * 0.5;
        // a tight band up close (no see-through leaves), softer with distance (no aliasing)
        float ma = max(max(a.x, a.y), max(a.z, a.w)) - mix(0.04, 0.14, smoothstep(8.0, 25.0, dist));
        vec4 b = max(a - ma, vec4(0.0));
        b /= max(b.x + b.y + b.z + b.w, 1e-5);
        // facets only where the blend ends up mostly bare rock, never through moss or on ledges
        float bare = smoothstep(0.55, 0.85, b.z) * (1.0 - ledge);
        rock = mix(rock, rockFacet, bare);
        vec3 col = litter * b.x + moss * 0.85 * b.y + rock * b.z + mud * b.w;
        ogH = dot(b, hh) + (chip - 1.0) * 0.5 * bare;
        ogFacetN = facet * 0.12 * bare * (1.0 - smoothstep(40.0, 90.0, dist));
        ogRough = dot(b, vec4(0.9, 0.96, 0.82, 0.75));
        // a dark, glossy wet band at the water's edge
        float wet = 1.0 - smoothstep(0.1, 1.0, vTP.y + (ogNoise(p * 0.15) - 0.5) * 1.2);
        col *= 1.0 - wet * 0.45;
        ogRough = mix(ogRough, 0.45, wet);
        ogH *= 1.0 - smoothstep(20.0, 55.0, dist);
        // no bump where a pixel covers several centimetres (grazing crests): it aliases into stripes
        ogH *= 1.0 - smoothstep(0.015, 0.06, length(fwidth(vTP)));
        diffuseColor.rgb *= col * 2.0;
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = ogRough;`)
      // a faint cool moonlit fill on the ground at night, so dark litter in shade keeps its detail
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 0.65, 1.0) * 0.35 * (1.0 - uDay);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 dh = vec2(dFdx(ogH), dFdy(ogH)) * 2.0;
          dh *= min(1.0, 0.08 / max(length(dh), 1e-5));
          normal = ogPerturb(-vViewPosition, normal, dh, faceDirection);
          // tilt each rock cell's plane (world-space offset, tangent to the face)
          vec3 tn = normalize(vTN);
          vec3 fo = ogFacetN - tn * dot(ogFacetN, tn);
          normal = normalize(normal + (viewMatrix * vec4(fo, 0.0)).xyz);
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
