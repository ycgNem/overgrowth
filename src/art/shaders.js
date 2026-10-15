// Small composable patches for three's built-in materials. Each patch hooks
// onBeforeCompile so we keep PBR lighting, shadows and fog for free while
// adding wind, moss, foliage lighting and terrain splatting.
import * as THREE from 'three';

export const globalUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uDay: { value: 1 }, // 1 = full daylight, 0 = night
  uPom: { value: 1 }, // ground relief (parallax occlusion) on or off, for the quality setting
  uWet: { value: 0 }, // how wet the world is: rises in the rain, dries after (Weather)
  // the player brushing through plants: x, z, radius, strength (0 = standing still)
  uPush: { value: new THREE.Vector4(0, 0, 0.9, 0) },
  // the last machete swing: x, z, its age in seconds, reach; and the sweep direction (x, z)
  uSwing: { value: new THREE.Vector4(0, 0, 99, 2.6) },
  uSwingDir: { value: new THREE.Vector2(1, 0) },
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
// push: the plant also bends away from the player walking through it, and whips round when a
// machete swing passes through it (uPush, uSwing)
export function addWind(material, { sway = 0.004, flutter = 0, push = false } = {}) {
  return patch(material, `wind:${sway}:${flutter}:${push ? 1 : 0}`, (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uWind = globalUniforms.uWind;
    if (push) Object.assign(shader.uniforms, { uPush: globalUniforms.uPush, uSwing: globalUniforms.uSwing, uSwingDir: globalUniforms.uSwingDir });
    const pushTerm = !push ? '' : /* glsl */`
      {
        // where this vertex stands in the world, before any bending
        #ifdef USE_INSTANCING
          vec3 wp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          mat3 im = mat3(instanceMatrix);
        #else
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          mat3 im = mat3(1.0);
        #endif
        float h = min(hgt, 2.5);
        // brushed aside: the stems lean away from the player, most at the top
        vec2 d = wp.xz - uPush.xy;
        float l = length(d);
        float k = (1.0 - smoothstep(uPush.z * 0.3, uPush.z, l)) * uPush.w;
        vec2 away = d / max(l, 1e-3) * k * 0.35 * h;
        // the swing: everything in reach whips along with the blade and springs back
        float ls = length(wp.xz - uSwing.xy);
        float reach = 1.0 - smoothstep(uSwing.w * 0.6, uSwing.w, ls);
        away += uSwingDir * reach * exp(-uSwing.z * 5.0) * sin(uSwing.z * 22.0 + 0.6) * 0.3 * h;
        // into the plant's own frame (instances are rotated and scaled)
        vec3 aw = vec3(away.x, 0.0, away.y);
        float sc = max(length(im[0]), 1e-3);
        transformed.x += dot(aw, normalize(im[0])) / sc;
        transformed.z += dot(aw, normalize(im[2])) / sc;
        transformed.y -= dot(away, away) * 0.6 / sc;
      }`;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + (push ? 'uniform vec4 uPush;\nuniform vec4 uSwing;\nuniform vec2 uSwingDir;\n' : '') +
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
        ${pushTerm}
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
// declare uDay once however many patches use it (a second declaration fails to compile)
const withDay = (src) => (src.includes('uniform float uDay;') ? src : 'uniform float uDay;\n' + src);

export function addNightFill(material, amount = 0.35) {
  return patch(material, `nightfill:${amount}`, (shader) => {
    shader.uniforms.uDay = globalUniforms.uDay;
    shader.fragmentShader = withDay(shader.fragmentShader).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 0.65, 1.0) * ${f(amount)} * (1.0 - uDay);`);
  });
}

// The directional (sun/moon) part of three's light loop, rewritten for leaves:
// thin cards self-shadow into acne at the global bias, so foliage gets extra receiver
// bias, and sunlight that passes *through* a leaf toward the eye is added back as a warm
// yellow-green glow (translucency). The shadow term is already in directLight.color, so
// leaves in shade don't glow.
const LB = THREE.ShaderChunk.lights_fragment_begin;
const DIR0 = LB.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
const DIR1 = LB.indexOf('#endif', LB.indexOf('#pragma unroll_loop_end', DIR0));
const FOLIAGE_LIGHTS = LB.slice(0, DIR0) + LB.slice(DIR0, DIR1)
  .replace('directionalLightShadow.shadowBias,', '( directionalLightShadow.shadowBias - 0.0012 ),')
  .replace('RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    {
      float ogBack = saturate( dot( - geometryViewDir, directLight.direction ) );
      float ogWrap = saturate( dot( - geometryNormal, directLight.direction ) * 0.5 + 0.5 );
      float ogTr = ( pow( ogBack, 5.0 ) * 1.4 + 0.18 ) * ogWrap * ogThin;
      // energy like the Lambert term it sits beside (1/pi), or backlit leaves blaze yellow
      reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseColor ) * vec3( 0.95, 1.08, 0.62 ) * ogTr * OG_TRANS * 1.6;
    }`) + LB.slice(DIR1);
// both faces of a card keep its authored ("fluffy") normal instead of the flipped one
const FOLIAGE_NORMAL_BEGIN = THREE.ShaderChunk.normal_fragment_begin.replace(
  /#else\s*vec3 normal = normalize\( vNormal \);\s*#ifdef DOUBLE_SIDED\s*normal \*= faceDirection;\s*#endif/,
  '#else\n\tvec3 normal = normalize( vNormal );');

export function addFoliageLighting(material, glow = 0.07, trans = 0.6) {
  return patch(material, `foliage:${glow}:${trans}`, (shader) => {
    shader.uniforms.uDay = globalUniforms.uDay;
    shader.fragmentShader = `#define OG_TRANS ${f(trans)}\n` + withDay(shader.fragmentShader)
      .replace('#include <lights_fragment_begin>', FOLIAGE_LIGHTS)
      .replace('#include <normal_fragment_begin>', FOLIAGE_NORMAL_BEGIN)
      .replace('#include <normal_fragment_maps>', `
        float ogThin = 1.0;
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec4 ogNm = texture2D( normalMap, vNormalMapUv );
          vec3 mapN = vec3( ogNm.xy * 2.0 - 1.0, 0.0 );
          mapN.z = sqrt( max( 1.0 - dot( mapN.xy, mapN.xy ), 0.0 ) );
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
          // the blue channel is the leaf's thickness: thin edges let more light through
          ogThin = 1.0 - 0.45 * ogNm.b;
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${f(glow)} * uDay;`)
      // mipmaps average leaf alpha with the gaps between leaves, so distant crowns thin out
      // and vanish: scale alpha up with the mip level to keep their coverage
      .replace('#include <alphatest_fragment>', `
        #ifdef USE_MAP
        {
          vec2 ogTs = vec2(textureSize(map, 0));
          vec2 ogDx = dFdx(vMapUv * ogTs), ogDy = dFdy(vMapUv * ogTs);
          float ogLod = 0.5 * log2(max(max(dot(ogDx, ogDx), dot(ogDy, ogDy)), 1e-8));
          diffuseColor.a *= 1.0 + max(ogLod, 0.0) * 0.25;
        }
        #endif
        #include <alphatest_fragment>`);
  });
}

// Normal maps from TextureLib store X/Y only (B holds height): rebuild Z.
// Specular anti-aliasing (Tokuyoshi & Kaplanyan): where the shading normal turns a lot within
// a pixel, widen the highlight to cover all of it instead of letting it sparkle.
const SPEC_AA = /* glsl */`
{
  vec3 ogDu = dFdx( normal ), ogDv = dFdy( normal );
  float ogA = roughnessFactor * roughnessFactor;
  ogA = sqrt( clamp( ogA * ogA + min( 0.3 * ( dot( ogDu, ogDu ) + dot( ogDv, ogDv ) ), 0.2 ), 0.0, 1.0 ) );
  roughnessFactor = sqrt( ogA );
}`;
// B holds the surface's height: low (furrows, pits, cracks) gets less of the sky
const PACKED_NORMAL_MAPS = 'float ogCavS = 1.0;\n' + THREE.ShaderChunk.normal_fragment_maps.replace(
  'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
  `vec4 ogNm4 = texture2D( normalMap, vNormalMapUv );
  vec3 mapN = vec3( ogNm4.xy * 2.0 - 1.0, 0.0 );
  mapN.z = sqrt( max( 1.0 - dot( mapN.xy, mapN.xy ), 0.0 ) );
  ogCavS = mix( 0.45, 1.0, smoothstep( 0.05, 0.62, ogNm4.b ) );`) + SPEC_AA;
if (PACKED_NORMAL_MAPS === THREE.ShaderChunk.normal_fragment_maps || FOLIAGE_NORMAL_BEGIN === THREE.ShaderChunk.normal_fragment_begin) {
  console.warn('shaders.js: a three.js chunk changed; normal patches did not apply');
}

// The colour map as detail over the vertex colours: its variation about its (linear) mean, at
// `strength` of its own contrast. Plant stems are coloured by their vertex colours; multiplied
// by a bark texture's albedo (~0.12) a green stalk came out 1% grey, a black post.
export function addDetailMap(material, mean, strength = 0.6) {
  return patch(material, `detail:${mean}:${strength}`, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`#ifdef USE_MAP
      diffuseColor.rgb *= mix(vec3(1.0), texture2D(map, vMapUv).rgb / ${f(mean)}, ${f(strength)});
    #endif`);
  });
}

// Parallax relief for the tiling surfaces on models (bark, rock, dead wood, temple stone), the
// same idea as the ground's: march the eye ray down through the height in the normal map's B
// channel and sample everything where it lands, so fissures and pits have real depth up
// close instead of being painted on. depth: the relief's depth in metres. The texture's scale
// comes from the screen-space derivatives (texels per metre), so one setting fits every mesh.
// Fades out by ~10 m and with the quality setting (uPom). Call before addPackedNormal.
export function addRelief(material, depth = 0.03) {
  return patch(material, `relief:${depth}`, (shader) => {
    shader.uniforms.uPom = globalUniforms.uPom;
    shader.fragmentShader = 'uniform float uPom;\n' + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      vec2 ogUv = vNormalMapUv;
      {
        float dist = length(vViewPosition);
        float k = (1.0 - smoothstep(4.0, 10.0, dist)) * uPom;
        if (k > 0.01) {
          vec3 p = -vViewPosition;
          vec3 dpx = dFdx(p), dpy = dFdy(p);
          vec2 dux = dFdx(vNormalMapUv), duy = dFdy(vNormalMapUv);
          vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
          // the texture's axes on screen (a cotangent frame from the derivatives)
          vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
          vec3 T = r1 * dux.x + r2 * duy.x, B = r1 * dux.y + r2 * duy.y;
          float tl = length(T), bl = length(B);
          if (tl > 1e-8 && bl > 1e-8) {
            vec3 V = normalize(vViewPosition);
            // at grazing angles the march's steps show as fur along every ridge: fade it out
            k *= smoothstep(0.12, 0.4, dot(V, N));
            float vn = max(dot(V, N), 0.25);
            // texels per metre along each axis
            float upm = length(dux) / max(length(dpx), 1e-6) * 0.5 + length(duy) / max(length(dpy), 1e-6) * 0.5;
            vec2 dir = -vec2(dot(V, T / tl), dot(V, B / bl)) / vn * ${f(depth)} * upm * k;
            float n = floor(mix(16.0, 6.0, vn));
            float stepH = 1.0 / n;
            vec2 dP = dir * stepH, q = vNormalMapUv;
            float ray = 1.0, h = textureGrad(normalMap, q, dux, duy).b, prevH = h, prevRay = 1.0;
            for (int i = 0; i < 16; i++) {
              if (float(i) >= n || h >= ray) break;
              prevH = h; prevRay = ray;
              q += dP; ray -= stepH;
              h = textureGrad(normalMap, q, dux, duy).b;
            }
            float after = h - ray, before = prevRay - prevH;
            float t = clamp(after / max(after + before, 1e-4), 0.0, 1.0);
            ogUv = q - dP * t;
          }
        }
      }
      #define vMapUv ogUv
      #define vNormalMapUv ogUv
      #include <map_fragment>`);
  });
}

export function addPackedNormal(material) {
  return patch(material, 'packednormal', (shader) => {
    shader.uniforms.uWet = globalUniforms.uWet;
    shader.fragmentShader = 'uniform float uWet;\n' + shader.fragmentShader.replace('#include <normal_fragment_maps>', PACKED_NORMAL_MAPS + `
        // rain-soaked: darker and a little glossy
        diffuseColor.rgb *= 1.0 - 0.32 * uWet;
        roughnessFactor = mix(roughnessFactor, 0.5, uWet * 0.55);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= ogCavS;
        reflectedLight.indirectSpecular *= ogCavS;
        reflectedLight.directDiffuse *= mix( 1.0, ogCavS, 0.35 );
        // porous bark, stone and dead wood: almost no sheen (a rough GGX lobe at grazing
        // angles rims every trunk in cyan-white)
        reflectedLight.directSpecular *= 0.35;
        reflectedLight.indirectSpecular *= 0.6;`);
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

// World-space moss on upward-facing surfaces (rocks, ruins, logs). `low` also grows it all
// the way round the bottom `low` metres of a model (damp trunk bases, buttresses).
// `flat`: a second, flat moss mixed into the cushions by a noise mask (one even field of
// identical cushions reads as bubble wrap)
// `side`: the low band grows mostly on one side of a trunk (the damp side), not all round it
export function addMoss(material, mossMap, { amount = 0.5, scale = 0.35, low = 0, tile = 0.3, flat = null, side = false } = {}) {
  return patch(material, `moss:${amount}:${scale}:${low}:${tile}:${flat ? 1 : 0}:${side ? 1 : 0}`, (shader) => {
    shader.uniforms.uMossMap = { value: mossMap };
    shader.uniforms.uMossFlat = { value: flat ?? mossMap };
    shader.vertexShader = 'varying vec3 vMossN;\nvarying vec3 vMossP;\nvarying float vMossLow;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      {
        mat4 mm = modelMatrix;
        #ifdef USE_INSTANCING
          mm = modelMatrix * instanceMatrix;
        #endif
        vMossN = normalize(mat3(mm) * objectNormal);
        vMossP = (mm * vec4(transformed, 1.0)).xyz;
        vMossLow = transformed.y;
      }`);
    // the damp band round the bottom, broken into patches and streaks that run down the bark
    // with the rain (an even collar of moss reads as paint)
    const lowTerm = low > 0
      ? `float pat = ogNoise(vec2(vMossP.x * 2.2 + vMossP.z * 1.7, vMossP.y * 0.45) + 11.0) * 0.6 + ogNoise(vMossP.xz * 0.8 + vMossP.y * 0.6 + 3.0) * 0.4;
        float lowSide = ${side ? 'mix(0.2, 1.0, smoothstep(-0.5, 0.6, dot(normalize(vMossN.xz + vec2(1e-4)), vec2(0.6, -0.8))))' : '1.0'};
        up = max(up, (1.0 - smoothstep(0.0, ${f(low)}, vMossLow + (nz - 0.5) * ${f(low * 0.8)})) * mix(0.25, 0.95, smoothstep(0.32, 0.68, pat)) * lowSide);`
      : '';
    // with packed normals the surface's cavities shade the moss too: moss fills them in
    const cav = shader.fragmentShader.includes('ogCavS') ? 'ogCavS = mix(ogCavS, 1.0, ogMossM * 0.8);' : '';
    shader.fragmentShader = 'uniform sampler2D uMossMap;\nuniform sampler2D uMossFlat;\nvarying vec3 vMossN;\nvarying vec3 vMossP;\nvarying float vMossLow;\n' + NOISE_GLSL +
      shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>', /* glsl */`{
        // moss buries the relief under it (bark fissures, stone pores: lit through moss they
        // read as green static) and has its own, soft clumps bumped from its brightness
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        float hx = dFdx(ogMossH), hy = dFdy(ogMossH);
        vec3 N0 = normalize(mix(normal, nonPerturbedNormal, ogMossM * 0.85));
        vec3 R1 = cross(sy, N0), R2 = cross(N0, sx);
        float det = dot(sx, R1) * faceDirection;
        vec3 Nb = abs(det) * N0 - sign(det) * (hx * R1 + hy * R2);
        Nb = dot(Nb, Nb) > 1e-30 ? normalize(Nb) : N0;
        normal = normalize(mix(normal, Nb, ogMossM));
        roughnessFactor = mix(roughnessFactor, 1.0, ogMossM);
        ${cav}
      }
      #include <clearcoat_normal_fragment_begin>`).replace('#include <map_fragment>', /* glsl */`float ogMossM = 0.0, ogMossH = 0.0;
      #include <map_fragment>
      {
        float nz = ogNoise(vMossP.xz * ${f(scale)} + vMossP.y * 0.3) * 0.65 + ogNoise(vMossP.xz * 1.9 + vMossP.y) * 0.35;
        float up = vMossN.y + (nz - 0.5) * 1.1 + ${f(amount - 0.5)};
        ${lowTerm}
        float m = smoothstep(0.2, 0.62, up);
        // tri-planar so moss doesn't streak down steep faces; weighted by the true face, mostly
        // (smoothed normals lean across sharp edges, and the projection they picked there
        // stretched into stripes)
        vec3 fN = normalize(cross(dFdx(vMossP), dFdy(vMossP)));
        fN *= sign(dot(fN, vMossN) + 1e-4);
        vec3 tw = pow(abs(normalize(fN * 0.8 + vMossN * 0.2)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 mc = (texture2D(uMossMap, vMossP.zy * ${f(tile)}).rgb * tw.x + texture2D(uMossMap, vMossP.xz * ${f(tile)}).rgb * tw.y
                 + texture2D(uMossMap, vMossP.xy * ${f(tile)}).rgb * tw.z);
        ${flat ? `{
          const float FT = ${f(tile * 1.7)};
          vec3 fc = texture2D(uMossFlat, vMossP.zy * FT + 0.37).rgb * tw.x + texture2D(uMossFlat, vMossP.xz * FT + 0.37).rgb * tw.y
                  + texture2D(uMossFlat, vMossP.xy * FT + 0.37).rgb * tw.z;
          float fk = smoothstep(0.25, 0.75, ogNoise(vMossP.xz * 0.9 + vMossP.y * 0.7 + 4.0));
          mc = mix(mc, fc * 1.15, 0.25 + 0.5 * fk);
        }` : ''}
        mc *= 0.75 + 0.5 * nz;
        diffuseColor.rgb = mix(diffuseColor.rgb, mc, m);
        ogMossM = m;
        // brighter moss stands proud: the clumps' height, in metres
        ogMossH = dot(mc, vec3(0.3, 0.55, 0.15)) * 0.03;
      }`);
  });
}

// Terrain: a height-blended splat of forest litter, moss, rock and wet mud/gravel. Every
// layer is a generated surface (albedo + normal/height, see TextureLib). The height is used
// to blend, so moss settles between leaves and pebbles poke out of the mud. Two rotated
// samples per layer, picked by a noise mask along height edges, hide the tiling; a low
// frequency tint and value variation break up big areas; rock is tri-planar so cliffs
// don't smear. Layers with no weight are skipped (explicit gradients keep mips correct).
// Sun and moon on the terrain fade out where the ground itself (not its bumps) turns away
// from them: there the shadow map tests the ground against its own back faces, and the
// bump-lit pixels came out in stair-step bands. Point lights are left alone.
const TERRAIN_LIGHTS = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  `getDirectionalLightInfo( directionalLight, directLight );
		directLight.color *= smoothstep( 0.0, 0.18, dot( ogGeoN, directLight.direction ) );`);
if (TERRAIN_LIGHTS === THREE.ShaderChunk.lights_fragment_begin) console.warn('shaders.js: lights chunk changed; terrain light fade did not apply');

export function makeTerrainMaterial(lib) {
  const S = lib.surface;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  return patch(mat, 'terrain2', (shader) => {
    Object.assign(shader.uniforms, {
      // short grass in the open (it took the old wet-litter layer's place: the shader is at its
      // 16 texture units)
      tTurf: { value: S.turf.map }, nTurf: { value: S.turf.nmap },
      tLitter2: { value: S.litter3.map }, nLitter2: { value: S.litter3.nmap },
      tMoss: { value: S.moss.map }, nMoss: { value: S.moss.nmap },
      tRock: { value: S.rock.map }, nRock: { value: S.rock.nmap },
      // bare earth: the humus doubles as the riverbank mud (the wet band darkens it there)
      tMud: { value: S.humus.map }, nMud: { value: S.humus.nmap },
      tGravel: { value: S.gravel.map }, nGravel: { value: S.gravel.nmap },
      uDay: globalUniforms.uDay, uSunDir: { value: fogSun.dir }, uPom: globalUniforms.uPom, uWet: globalUniforms.uWet,
    });
    shader.vertexShader = 'attribute vec4 splat;\nattribute float grass;\nvarying vec4 vSplat;\nvarying float vGrass;\nvarying vec3 vTP;\nvarying vec3 vTN;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat;
        vGrass = grass;
        vTP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = /* glsl */`
      uniform sampler2D tTurf; uniform sampler2D nTurf; uniform sampler2D tMoss; uniform sampler2D nMoss;
      uniform sampler2D tLitter2; uniform sampler2D nLitter2;
      uniform sampler2D tRock; uniform sampler2D nRock; uniform sampler2D tMud; uniform sampler2D nMud;
      uniform sampler2D tGravel; uniform sampler2D nGravel;
      uniform float uDay; uniform vec3 uSunDir; uniform float uPom; uniform float uWet;
      varying vec4 vSplat; varying float vGrass; varying vec3 vTP; varying vec3 vTN;
      ${NOISE_GLSL}
      struct Layer { vec3 col; vec2 n; float h; };
      // A crisp switch between two samples that follows their heights: the weight of B. The
      // higher one wins outright; bias tips close calls (and, at the ends of a transition,
      // decides alone); wk, about a pixel's worth of height, softens the edge so it doesn't
      // alias. Any softer and two leaf plateaus of about the same height cross-fade into a
      // double exposure.
      float ogPick(float hA, float hB, float bias, float wk) {
        return clamp((hB - hA + bias) / wk + 0.5, 0.0, 1.0);
      }
      // that edge for a pixel footprint of uv derivatives dx, dy
      float ogPickW(vec2 dx, vec2 dy) {
        return clamp(length(abs(dx) + abs(dy)) * 15.0, 0.004, 0.15);
      }
      // One layer, sampled twice (the second rotated and offset). The pick follows the height,
      // so the switch runs along leaf and pebble outlines instead of cross-fading. sw (-0.5 to
      // 0.5, a slow noise) leans toward one sample or the other.
      Layer ogLayer(sampler2D tc, sampler2D tn, vec2 p, float sc, float ang, vec2 off, float sw, vec2 dx, vec2 dy) {
        float c = cos(ang), s = sin(ang);
        mat2 R = mat2(c, -s, s, c);
        vec2 uv = p * sc, uv2 = R * uv + off;
        vec2 dx1 = dx * sc, dy1 = dy * sc, dx2 = R * dx1, dy2 = R * dy1;
        vec4 a = textureGrad(tn, uv, dx1, dy1), b = textureGrad(tn, uv2, dx2, dy2);
        // pick on the heights a mip down: the outlines of leaves, not the thinnest twigs on them
        float ha = textureGrad(tn, uv, dx1 * 2.0, dy1 * 2.0).b, hb = textureGrad(tn, uv2, dx2 * 2.0, dy2 * 2.0).b;
        float k = ogPick(ha, hb, sw * 0.8, ogPickW(dx1, dy1));
        Layer L;
        L.col = mix(textureGrad(tc, uv, dx1, dy1).rgb, textureGrad(tc, uv2, dx2, dy2).rgb, k);
        // rotate the second sample's normal back into the first one's frame: uv2 = R uv, so a
        // slope in the texture is R^T of it in world uv (this was R, which turned the litter's
        // bumps 194 degrees: half the leaves were lit as if they were dents)
        vec2 nb = b.rg * 2.0 - 1.0;
        nb = vec2(c * nb.x - s * nb.y, s * nb.x + c * nb.y);
        L.n = mix(a.rg * 2.0 - 1.0, nb, k);
        L.h = mix(a.b, b.b, k);
        return L;
      }
      // A layer on steep ground, seen from the side: sampled on the vertical planes facing x and
      // z (ax = 1 facing x), its relief returned as a world-space normal offset in nW. Where the
      // slope faces between the two, the higher texel wins (a cross-fade of two leaf photos
      // reads as a double exposure); the switch runs along leaf outlines.
      Layer ogLayerSide(sampler2D tc, sampler2D tn, float sc, float ang, vec2 off, float sw, float ax, vec3 dPx, vec3 dPy, out vec3 nW) {
        Layer A; A.col = vec3(0.0); A.n = vec2(0.0); A.h = 0.0;
        Layer B = A;
        if (ax > 0.001) A = ogLayer(tc, tn, vTP.zy, sc, ang, off, sw, dPx.zy, dPy.zy);
        if (ax < 0.999) B = ogLayer(tc, tn, vTP.xy, sc, ang, off + vec2(0.29, 0.53), sw, dPx.xy, dPy.xy);
        // (far from the diagonal the other plane is badly stretched: the bias rules it out)
        float k = ax <= 0.001 ? 0.0 : ax >= 0.999 ? 1.0 : ogPick(B.h, A.h, (ax - 0.5) * 2.4, ogPickW(dPx.zy * sc, dPy.zy * sc));
        nW = vec3(0.0, A.n.y, A.n.x) * k + vec3(B.n.x, B.n.y, 0.0) * (1.0 - k);
        A.col = mix(B.col, A.col, k); A.h = mix(B.h, A.h, k); A.n = vec2(0.0);
        return A;
      }
      // how much of a layer shows its side projection on ground this steep: the higher of the
      // two texels wins through the transition (on gentle ground the side view is badly
      // stretched: the bias rules it out there)
      float ogSteepK(float hTop, float hSide, float steep, float wk) {
        return steep >= 0.999 ? 1.0 : ogPick(hTop, hSide, (steep - 0.5) * 2.4, wk);
      }
      // one height texel of ground layer id (0 litter, 1 turf, 2 humus and mud, 3 moss,
      // 4 gravel): the march picks its layer per pixel, and a sampler can't be chosen at run
      // time (the shader is also at its 16 texture units), so it branches
      float ogHeightTex(int id, vec2 uv, vec2 dx, vec2 dy) {
        float h;
        if (id == 0) h = textureGrad(nLitter2, uv, dx, dy).b;
        else if (id == 1) h = textureGrad(nTurf, uv, dx, dy).b;
        else if (id == 2) h = textureGrad(nMud, uv, dx, dy).b;
        else if (id == 3) h = textureGrad(nMoss, uv, dx, dy).b;
        else h = textureGrad(nGravel, uv, dx, dy).b;
        return h;
      }
      // the height ogLayer would pick at p (two fetches)
      float ogLayerH(int id, vec2 p, float sc, float ang, vec2 off, float sw, vec2 dx, vec2 dy) {
        float c = cos(ang), s = sin(ang);
        mat2 R = mat2(c, -s, s, c);
        vec2 uv = p * sc, uv2 = R * uv + off;
        vec2 dx1 = dx * sc, dy1 = dy * sc;
        // up to two mips down (the caller scales it by distance): a smooth field has no thin
        // slices for the march to step through
        dx1 *= 4.0; dy1 *= 4.0;
        float a = ogHeightTex(id, uv, dx1, dy1), b = ogHeightTex(id, uv2, R * dx1, R * dy1);
        return mix(a, b, ogPick(a, b, sw * 0.8, 0.15));
      }
      // Parallax occlusion: march the eye ray down through a layer's height field (top = the
      // mesh surface) and return where it lands. dir: the ray's world xz shift over the full
      // depth; n: steps.
      vec2 ogPom(int id, vec2 p, float sc, float ang, vec2 off, float sw, vec2 dir, float n, vec2 dx, vec2 dy, out float hit) {
        float stepH = 1.0 / n;
        vec2 dP = dir * stepH, q = p;
        float ray = 1.0, h = ogLayerH(id, p, sc, ang, off, sw, dx, dy);
        float prevH = h, prevRay = 1.0;
        for (int i = 0; i < 24; i++) {
          if (float(i) >= n || h >= ray) break;
          prevH = h; prevRay = ray;
          q += dP; ray -= stepH;
          h = ogLayerH(id, q, sc, ang, off, sw, dx, dy);
        }
        // between the last step above the surface and the first one below it
        float after = h - ray, before = prevRay - prevH;
        float t = clamp(after / max(after + before, 1e-4), 0.0, 1.0);
        hit = mix(h, prevH, t);
        return q - dP * t;
      }
      // Sunlight the height field blocks at q (height h0): march toward the light, the
      // deepest blocker wins, so leaf edges throw small soft shadows on the leaves below.
      float ogPomShadow(int id, vec2 q, float h0, float sc, float ang, vec2 off, float sw, vec2 ldir, vec2 dx, vec2 dy) {
        float sh = 0.0;
        for (int i = 1; i <= 6; i++) {
          float f = float(i) / 6.0;
          float hh = h0 + (1.0 - h0) * f;
          float hs = ogLayerH(id, q + ldir * (hh - h0), sc, ang, off, sw, dx, dy);
          sh = max(sh, (hs - hh) * (1.0 - f * 0.7));
        }
        // never fully dark: the litter is translucent and the shadows are small
        return 1.0 - 0.55 * clamp(sh * 3.5, 0.0, 1.0);
      }
    ` + shader.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
      vec3 ogN = vec3(0.0, 0.0, 1.0);
      float ogRough = 0.9;
      float ogSelf = 1.0, ogCav = 1.0;
      vec3 ogRockN = vec3(0.0);
      float ogRockW = 0.0;
      vec3 ogSideN = vec3(0.0);
      {
        vec2 p = vTP.xz;
        vec2 dpx = dFdx(p), dpy = dFdy(p);
        vec3 dPx = dFdx(vTP), dPy = dFdy(vTP);
        float dist = length(vViewPosition);
        float macro = ogNoise(p * 0.016) * 0.6 + ogNoise(p * 0.07) * 0.4;
        float sw = ogNoise(p * 0.11 + 17.0) - 0.5;
        vec4 w = vSplat;
        // break the splat's straight vertex-grid edges (litter against gravel ruled a line)
        w += (vec4(ogNoise(p * 0.9), ogNoise(p * 0.9 + 5.0), 0.0, ogNoise(p * 0.9 + 9.0)) - 0.5) * 0.3 * step(0.02, w);
        w = max(w, vec4(0.0));
        w /= max(w.x + w.y + w.z + w.w, 1e-4);
        // moss never carpets evenly: break it into cushions with litter blown over the gaps
        float mb = ogNoise(p * 0.45 + 31.0) * 0.6 + ogNoise(p * 1.4 + 5.0) * 0.4;
        float mk = smoothstep(0.42, 0.6, mb);
        w.x += w.y * (1.0 - mk) * 0.85;
        w.y *= mk;
        // moss thinner than a patch only shows as bright specks in the gaps between leaves
        w.y *= smoothstep(0.2, 0.45, w.y);

        Layer Ll; Ll.col = vec3(0.0); Ll.n = vec2(0.0); Ll.h = 0.0;
        Layer Lm = Ll; Layer Ld = Ll;
        // the two litters' scales (repeats per metre): leaves of 10-40 cm
        const float LS2 = 0.66;
        // a pixel's worth of litter height, for the switches between samples (see ogPick)
        float ogWk = ogPickW(dpx * LS2, dpy * LS2);
        // relief near the eye: the litter is a few centimetres of leaves lying on each other
        const float DEPTH = 0.035;
        vec3 wn0 = normalize(vTN);
        // how much a pixel is steep bank rather than floor (0 under ~34 degrees, 1 over ~52),
        // and whether the slope faces x (1) or z (0)
        float steep = 1.0 - smoothstep(0.72, 0.9, wn0.y);
        float ax = smoothstep(-0.12, 0.12, abs(wn0.x) - abs(wn0.z));
        // where the floor is turf: the vertex weight, its edge broken up into tufts and runs
        float gk = vGrass + (ogNoise(p * 0.3 + 41.0) - 0.5) * 0.8 + (ogNoise(p * 1.6 + 3.0) - 0.5) * 0.4;
        gk = smoothstep(0.28, 0.72, gk);
        // bare humus in patches a few metres across: dark crumbly earth and roots, with only
        // the leaves lying highest still on it (the floor was one unbroken carpet of leaves)
        float hm = ogNoise(p * 0.06 + 23.0) * 0.65 + ogNoise(p * 0.23 + 7.0) * 0.35;
        float hk = smoothstep(0.44, 0.7, hm) * (1.0 - w.y) * (1.0 - gk);
        // gravel bars along the water's edge, in patches
        float gv = smoothstep(0.45, 0.7, ogNoise(p * 0.08 + 3.0)) * (1.0 - smoothstep(0.2, 1.4, vTP.y + (ogNoise(p * 0.45 + 9.0) - 0.5) * 1.1));
        // Relief: the eye ray is marched through the height field of whichever layer covers
        // most of the pixel (leaves, turf, humus, moss, gravel or mud), and every layer is
        // sampled where it lands. Still one march a pixel: when only the leaves had relief,
        // the turf, moss and bare earth beside them read as paint.
        int pid = 0;
        float pw = w.x * (1.0 - gk) * (1.0 - hk), pq;
        pq = w.x * gk; if (pq > pw) { pid = 1; pw = pq; }
        pq = w.x * hk; if (pq > pw) { pid = 2; pw = pq; }
        pq = w.y; if (pq > pw) { pid = 3; pw = pq; }
        float gvk = smoothstep(0.25, 0.5, gv);
        pq = w.w * gvk; if (pq > pw) { pid = 4; pw = pq; }
        pq = w.w * (1.0 - gvk); if (pq > pw) { pid = 5; pw = pq; }
        // that layer's texture, scale, turn, offset and depth (as a share of the litter's)
        int tid = pid == 5 ? 2 : pid;
        float psc = LS2, pang = 0.6, pdk = 1.0; vec2 poff = vec2(0.11, 0.47);
        if (pid == 1) { psc = 0.55; pang = 1.1; poff = vec2(0.53, 0.19); pdk = 1.15; }
        else if (pid == 2) { psc = 0.42; pang = 0.4; poff = vec2(0.71, 0.13); pdk = 0.75; }
        else if (pid == 3) { psc = 0.36; pang = 2.3; poff = vec2(0.13, 0.57); pdk = 0.9; }
        else if (pid == 4) { psc = 0.42; pang = 2.9; poff = vec2(0.21, 0.83); pdk = 0.9; }
        else if (pid == 5) { psc = 0.3; pang = 0.9; poff = vec2(0.61, 0.29); pdk = 0.7; }
        // (none on slopes: there the march and its sun shadows doubled every leaf's outline)
        float pomK = (1.0 - smoothstep(4.0, 12.0, dist)) * smoothstep(0.1, 0.3, pw) * uPom * smoothstep(0.8, 0.9, wn0.y);
        vec3 Vw = normalize(cameraPosition - vTP);
        float vn = max(dot(Vw, wn0), 0.3);
        vec2 vdir = -(Vw.xz - wn0.xz * vn) / vn * DEPTH * pdk * pomK;
        float steps = floor(mix(22.0, 8.0, vn));
        float ln = dot(uSunDir, wn0);
        vec2 ldir = (uSunDir.xz - wn0.xz * ln) / max(ln, 0.12) * DEPTH * pdk * pomK;
        bool selfSh = pomK > 0.01 && ln > 0.0 && uDay > 0.05;
        // the march's height field: full detail up close (blurred there, leaf edges melted like
        // wax), two mips down from ~9 m
        float pb = mix(0.25, 1.0, smoothstep(3.0, 9.0, dist));
        vec2 pp = p;
        float pomS = 1.0;
        if (pomK > 0.01) {
          float hit = 0.0;
          pp = ogPom(tid, p, psc, pang, poff, sw, vdir, steps, dpx * pb, dpy * pb, hit);
          if (selfSh) pomS = ogPomShadow(tid, pp, hit, psc, pang, poff, sw, ldir, dpx * pb, dpy * pb);
        }
        // the march's shadow per splat channel (litter, moss, mud): only on the marched layer
        float sL = 1.0, sM = pid == 3 ? pomS : 1.0, sD = pid >= 4 ? pomS : 1.0;
        if (w.x > 0.002) {
          // a mix of many species' leaves (brown, russet, olive, a few still green) over dark earth
          if (gk < 0.999) Ll = ogLayer(tLitter2, nLitter2, pp, LS2, 0.6, vec2(0.11, 0.47), sw, dpx, dpy);
          float kh = 0.0, kt = 0.0;
          if (hk > 0.01) {
            Layer Lh = ogLayer(tMud, nMud, pp, 0.42, 0.4, vec2(0.71, 0.13), sw, dpx, dpy);
            float hs = mix(-0.4, 0.9, hk) + Lh.h * 0.2;
            kh = clamp((hs - Ll.h) / max(ogWk * 2.0, 0.04) + 0.5, 0.0, 1.0);
            Ll.col = mix(Ll.col, Lh.col, kh); Ll.n = mix(Ll.n, Lh.n, kh); Ll.h = mix(Ll.h, Lh.h * 0.5, kh);
          }
          // turf: grass grows up through the leaves, and only the leaves lying highest stay on top
          if (gk > 0.001) {
            Layer Lt = ogLayer(tTurf, nTurf, pp, 0.55, 1.1, vec2(0.53, 0.19), sw, dpx, dpy);
            // sunny dry turf goes golden, damp turf stays deep green
            float gd = smoothstep(0.3, 0.8, ogNoise(p * 0.05 + 61.0));
            Lt.col *= mix(vec3(0.88, 1.02, 0.86), vec3(1.12, 1.06, 0.78), gd);
            // past the 3D blades the turf takes on their lit green, so the meadow doesn't turn
            // into a grainy olive carpet where they stop
            Lt.col = mix(Lt.col, Lt.col * vec3(0.95, 1.18, 0.8), smoothstep(10.0, 26.0, dist) * 0.6);
            float ht = mix(-0.6, 1.1, gk) + Lt.h * 0.35;
            kt = gk >= 0.999 ? 1.0 : clamp((ht - Ll.h) / max(ogWk * 2.0, 0.04) + 0.5, 0.0, 1.0);
            Ll.col = mix(Ll.col, Lt.col, kt); Ll.n = mix(Ll.n, Lt.n * 0.85, kt); Ll.h = mix(Ll.h, Lt.h, kt);
          }
          // the shadow falls on the part of the floor that was marched
          sL = pid == 0 ? mix(pomS, 1.0, max(kh, kt)) : pid == 1 ? mix(1.0, pomS, kt) : pid == 2 ? mix(1.0, pomS, kh) : 1.0;
        }
        if (w.y > 0.002) Lm = ogLayer(tMoss, nMoss, pp, 0.36, 2.3, vec2(0.13, 0.57), sw, dpx, dpy);
        if (w.w > 0.002) {
          Ld = ogLayer(tMud, nMud, pp, 0.3, 0.9, vec2(0.61, 0.29), sw, dpx, dpy);
          if (gv > 0.01) {
            Layer Lg = ogLayer(tGravel, nGravel, pp, 0.42, 2.9, vec2(0.21, 0.83), sw, dpx, dpy);
            float kg = clamp((Lg.h - Ld.h) * 4.0 + gv * 2.0 - 0.7, 0.0, 1.0);
            Ld.col = mix(Ld.col, Lg.col, kg); Ld.n = mix(Ld.n, Lg.n, kg); Ld.h = mix(Ld.h, Lg.h, kg);
          }
          // the humus photo is very dark: lift it, and lift it more where it's dry ground (the
          // camp, banks well above the water) rather than wet mud
          Ld.col *= 1.45 * mix(1.0, 1.35, smoothstep(2.5, 5.0, vTP.y));
        }
        // Steep ground: seen from above the texture stretches down the slope (leaves smeared
        // into streaks on every bank), so steep pixels sample the layers from the side too
        vec3 sideL = vec3(0.0), sideM = vec3(0.0), sideD = vec3(0.0);
        if (steep > 0.001) {
          vec3 nS;
          if (w.x > 0.002) {
            Layer S;
            if (gk > 0.5) S = ogLayerSide(tTurf, nTurf, 0.55, 1.1, vec2(0.53, 0.19), sw, ax, dPx, dPy, nS);
            else S = ogLayerSide(tLitter2, nLitter2, LS2, 0.6, vec2(0.11, 0.47), sw, ax, dPx, dPy, nS);
            float kLl = ogSteepK(Ll.h, S.h, steep, ogWk);
            Ll.col = mix(Ll.col, S.col, kLl); Ll.h = mix(Ll.h, S.h, kLl); Ll.n *= 1.0 - kLl; sideL = nS * kLl;
          }
          if (w.y > 0.002) {
            Layer S = ogLayerSide(tMoss, nMoss, 0.36, 2.3, vec2(0.13, 0.57), sw, ax, dPx, dPy, nS);
            float kLm = ogSteepK(Lm.h, S.h, steep, ogWk);
            Lm.col = mix(Lm.col, S.col, kLm); Lm.h = mix(Lm.h, S.h, kLm); Lm.n *= 1.0 - kLm; sideM = nS * kLm;
          }
          if (w.w > 0.002) {
            Layer S = ogLayerSide(tMud, nMud, 0.3, 0.9, vec2(0.61, 0.29), sw, ax, dPx, dPy, nS);
            float kLd = ogSteepK(Ld.h, S.h, steep, ogWk);
            Ld.col = mix(Ld.col, S.col, kLd); Ld.h = mix(Ld.h, S.h, kLd); Ld.n *= 1.0 - kLd; sideD = nS * kLd;
          }
        }
        // tri-planar rock, with a second, larger octave so cliffs aren't one even grey
        vec3 rockC = vec3(0.0); float hR = 0.0;
        vec3 wn = normalize(vTN);
        vec3 an = pow(abs(wn), vec3(6.0)); an /= (an.x + an.y + an.z);
        if (w.z > 0.002) {
          const float RS = 0.16, RB = 0.045;
          vec2 rx = vTP.zy * RS, ry = p * RS, rz = vTP.xy * RS;
          vec2 gxx = dPx.zy * RS, gxy = dPy.zy * RS, gyx = dpx * RS, gyy = dpy * RS, gzx = dPx.xy * RS, gzy = dPy.xy * RS;
          vec4 nx = textureGrad(nRock, rx, gxx, gxy), ny = textureGrad(nRock, ry, gyx, gyy), nz = textureGrad(nRock, rz, gzx, gzy);
          rockC = textureGrad(tRock, rx, gxx, gxy).rgb * an.x + textureGrad(tRock, ry, gyx, gyy).rgb * an.y + textureGrad(tRock, rz, gzx, gzy).rgb * an.z;
          float k = RB / RS;
          vec3 big = textureGrad(tRock, rx * k + 0.3, gxx * k, gxy * k).rgb * an.x + textureGrad(tRock, ry * k + 0.3, gyx * k, gyy * k).rgb * an.y
                   + textureGrad(tRock, rz * k + 0.3, gzx * k, gzy * k).rgb * an.z;
          rockC *= mix(0.7, 1.3, smoothstep(0.06, 0.25, dot(big, vec3(0.333))));
          hR = nx.b * an.x + ny.b * an.y + nz.b * an.z;
          // whiteout-style tri-planar normals, as a world-space offset
          vec2 gx = nx.rg * 2.0 - 1.0, gy = ny.rg * 2.0 - 1.0, gz = nz.rg * 2.0 - 1.0;
          ogRockN = vec3(0.0, gx.y, gx.x * sign(wn.x)) * an.x + vec3(gy.x, 0.0, gy.y) * an.y + vec3(gz.x * sign(wn.z), gz.y, 0.0) * an.z;
          // damp streaks down the faces
          float streak = ogNoise(vec2((vTP.x + vTP.z) * 0.3, vTP.y * 0.2));
          rockC *= 0.75 + 0.45 * streak;
        }
        // macro tint: dry warm patches and damp dark ones
        float dry = smoothstep(0.3, 0.75, macro);
        Ll.col *= mix(vec3(0.86, 0.8, 0.72), vec3(1.06, 1.02, 0.94), dry);
        Lm.col *= mix(vec3(0.85, 0.95, 0.88), vec3(1.15, 1.08, 0.82), smoothstep(0.3, 0.8, ogNoise(p * 0.045 + 7.0)));
        // moss in shade and moss in light differ a lot: break big patches into tones
        Lm.col *= mix(0.6, 1.0, ogNoise(p * 0.3 + 2.0));
        // moss that only fills the gaps between leaves is in their shade: dark and dull
        Lm.col = mix(vec3(dot(Lm.col, vec3(0.3, 0.55, 0.15))) * 0.6, Lm.col, smoothstep(0.3, 0.7, w.y));

        // height-aware blend
        vec4 hh = vec4(Ll.h, mix(0.5, Lm.h, 0.3), hR, Ld.h);
        vec4 a = w + hh * 0.5;
        float ma = max(max(a.x, a.y), max(a.z, a.w)) - mix(0.05, 0.16, smoothstep(8.0, 30.0, dist));
        vec4 b = max(a - ma, vec4(0.0));
        b /= max(b.x + b.y + b.z + b.w, 1e-5);
        vec3 col = Ll.col * b.x + Lm.col * b.y + rockC * b.z + Ld.col * b.w;
        ogN = vec3((Ll.n * b.x + Lm.n * b.y + Ld.n * b.w) * 0.8, 1.0);
        ogSideN = (sideL * b.x + sideM * b.y + sideD * b.w) * 0.8;
        ogRockW = b.z;
        // earth is matte away from the water (glossy, it mirrored the blue sky: tarmac)
        ogRough = dot(b, vec4(0.88, 0.95, 0.8, 0.8));
        // sun hidden by the floor's own relief, and the gaps between leaves and stones
        // getting less of the sky: the depth that survives in shade
        ogSelf = 1.0 - (1.0 - sL) * b.x - (1.0 - sM) * b.y - (1.0 - sD) * b.w;
        float hc = Ll.h * b.x + Lm.h * b.y + hR * b.z + Ld.h * b.w;
        ogCav = mix(mix(0.42, 0.65, b.w), 1.0, smoothstep(0.06, 0.68, hc));
        // a dark, glossy wet band at the water's edge
        float wet = 1.0 - smoothstep(0.1, 1.1, vTP.y + (ogNoise(p * 0.15) - 0.5) * 1.2);
        col *= mix(vec3(1.0), vec3(0.86, 0.8, 0.74), wet);
        // rain soaks the floor: dark, saturated leaves with a sheen (bare rock less so)
        col *= mix(vec3(1.0), vec3(0.62, 0.6, 0.57), uWet * (1.0 - 0.5 * b.z));
        // damp, not glazed: a mirror finish on bumpy ground sparkles white at every grazing view
        ogRough = mix(ogRough, 0.62, wet);
        ogRough = mix(ogRough, 0.45, uWet * 0.8);
        ogN.xy *= 1.0 - 0.6 * wet;
        // fade the fine relief out where a pixel covers many texels
        float fade = 1.0 - smoothstep(25.0, 70.0, dist);
        ogN.xy *= fade;
        ogRockN *= fade;
        ogSideN *= fade;
        diffuseColor.rgb *= col;
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = ogRough;`)
      // litter and moss scatter the sky; only the wet band near water mirrors it
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectSpecular *= mix(0.35, 1.0, smoothstep(0.75, 0.5, ogRough)) * ogCav;
        reflectedLight.indirectDiffuse *= ogCav;
        reflectedLight.directDiffuse *= ogSelf * mix(1.0, ogCav, 0.45);
        reflectedLight.directSpecular *= ogSelf * ogCav;`)
      // a faint cool moonlit fill on the ground at night, so dark litter in shade keeps its detail
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 0.65, 1.0) * 0.16 * (1.0 - uDay);`)
      // sun and moon fade where the ground itself turns from them (see TERRAIN_LIGHTS)
      .replace('#include <lights_fragment_begin>', TERRAIN_LIGHTS)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 ogGeoN = normalize((viewMatrix * vec4(normalize(vTN), 0.0)).xyz);
        {
          // tangent frame of a heightfield textured in world XZ: T along +x, B along +z
          vec3 wn = normalize(vTN);
          vec3 T = normalize(vec3(1.0, 0.0, 0.0) - wn * wn.x);
          vec3 B = normalize(cross(T, wn));
          vec3 nw = normalize(T * ogN.x + B * ogN.y + wn * ogN.z);
          nw = normalize(nw + ogRockN * ogRockW * 0.9);
          nw = normalize(nw + ogSideN);
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }
        ${SPEC_AA}`);
  });
}

// The sun's direction and the colour it adds to the haze looking toward it. These are
// typed arrays on purpose: three deep-clones Vector3/Color uniform values per material but
// passes typed arrays by reference, so every material reads these same two arrays.
// params: x = valley mist strength (Sky raises it at dawn and dusk), y = mist height falloff.
export const fogSun = { dir: new Float32Array([0, 1, 0]), color: new Float32Array([0, 0, 0]), params: new Float32Array([0.5, 0.14, 0]) };

// Replace three's fog with distance fog + low-lying valley mist, lit by the sun: haze
// looking toward the sun glows warm, away from it stays cool (aerial perspective).
// Uses only mvPosition so it works in every built-in shader (including sprites).
export function installFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth;
    varying float vFogWorldY;
    varying vec3 vFogDir;
  #endif`;
  C.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vFogDir = transpose(mat3(viewMatrix)) * mvPosition.xyz;
    vFogWorldY = (transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz)).y;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    uniform vec3 fogSunDir;
    uniform vec3 fogSunColor;
    uniform vec3 fogParams;
    varying float vFogDepth;
    varying float vFogWorldY;
    varying vec3 vFogDir;
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
      float mistH = exp( - max( vFogWorldY - 0.5, 0.0 ) * fogParams.y );
      float mist = mistH * ( 1.0 - exp( - vFogDepth * fogDensity * 1.6 ) ) * fogParams.x;
      fogFactor = clamp( max( fogFactor, mist ), 0.0, 1.0 );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    float fogSunAmt = max( dot( normalize( vFogDir ), fogSunDir ), 0.0 );
    vec3 fogCol = fogColor + fogSunColor * ( pow( fogSunAmt, 10.0 ) + 0.25 * pow( fogSunAmt, 2.0 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
  #endif`;
  // give every built-in material the shared sun uniforms (ShaderLib is cloned per material)
  for (const lib of Object.values(THREE.ShaderLib)) {
    if (lib.uniforms && 'fogColor' in lib.uniforms) {
      lib.uniforms.fogSunDir = { value: fogSun.dir };
      lib.uniforms.fogSunColor = { value: fogSun.color };
      lib.uniforms.fogParams = { value: fogSun.params };
    }
  }
}

// Soft sun shadows that harden at contact. Three's PCF blurs every shadow by about a texel
// (5 cm), so a leaf card 20 m up laid a crisp leaf on the ground: under the canopy the floor
// was printed with sharp leaf shapes that read as ghostly leaves over the litter, in bands on
// slopes. A real shadow blurs with its distance from the caster (the sun's disc is half a
// degree, about 1 cm per metre; the canopy scatters more). A short blocker search finds how
// far above the receiver the casters are and the filter widens to match: a trunk's foot
// stays crisp, the canopy becomes soft flecks. A light opts in with shadow.radius > 1.5,
// which then scales the blur. width and depth: the shadow camera's frustum in metres.
export function installSoftShadows({ width, depth }) {
  const C = THREE.ShaderChunk;
  const src = C.shadowmap_pars_fragment;
  const fn = /* glsl */`
	const vec2 OG_PD[16] = vec2[](
		vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.09418410, -0.92938870), vec2(0.34495938, 0.29387760),
		vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
		vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
		vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));
	float ogSoftShadow( sampler2D shadowMap, vec2 shadowMapSize, float k, vec3 sc ) {
		vec2 texel = 1.0 / shadowMapSize;
		// a different turn of the sample pattern per pixel: fine grain instead of ghost copies
		// (a hash: gradient noise's diagonal structure showed as a crosshatch)
		vec3 h3 = fract( vec3( gl_FragCoord.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
		h3 += dot( h3, h3.yzx + 33.33 );
		float a = 6.2831853 * fract( ( h3.x + h3.y ) * h3.z );
		mat2 R = mat2( cos( a ), sin( a ), - sin( a ), cos( a ) );
		// blockers within ~40 cm across: their mean depth. Anything less than 40 cm above the
		// receiver is the ground itself (a slope seen by the light), not a caster
		float bsum = 0.0, bn = 0.0;
		for ( int i = 0; i < 8; i ++ ) {
			float d = unpackRGBAToDepth( texture2D( shadowMap, sc.xy + R * OG_PD[ i * 2 ] * ( 8.0 * texel ) ) );
			if ( d < sc.z - ${(0.4 / depth).toFixed(6)} ) { bsum += d; bn += 1.0; }
		}
		if ( bn < 0.5 ) return 1.0;
		float dist = ( sc.z - bsum / bn ) * ${depth.toFixed(1)};
		// the penumbra's radius: half the sun's 0.53 degree disc times the distance, times k
		float r = clamp( dist * 0.0047 * k * shadowMapSize.x / ${width.toFixed(1)}, 1.0, 8.0 );
		// a wide filter on sloping ground reaches texels of the ground itself that sit nearer
		// the light: the receiver's own depth slope (per texel) sets the bias for each sample
		vec2 dz = vec2( dFdx( sc.z ), dFdy( sc.z ) );
		vec2 duvx = dFdx( sc.xy ), duvy = dFdy( sc.xy );
		float det = duvx.x * duvy.y - duvx.y * duvy.x;
		vec2 slope = abs( det ) > 1e-12 ? vec2( dz.x * duvy.y - dz.y * duvx.y, dz.y * duvx.x - dz.x * duvy.x ) / det : vec2( 0.0 );
		// (per unit of shadow-map uv: 1.0 is a slope of about 73 degrees across a texel)
		slope = clamp( slope, vec2( - 1.0 ), vec2( 1.0 ) );
		float s = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			vec2 o = R * OG_PD[ i ] * ( r * texel );
			s += texture2DCompare( shadowMap, sc.xy + o, sc.z + dot( slope, o ) - abs( dot( slope, o ) ) * 0.5 - 0.0002 );
		}
		return s / 16.0;
	}
	float getShadow(`;
  let out = src.replace('\tfloat getShadow(', fn);
  // (three's build strips blank lines from its chunks: the PCF branch is found by its first
  // two statements, the only place they appear together)
  const pcf = 'vec2 texelSize = vec2( 1.0 ) / shadowMapSize;\n\t\t\tfloat dx0';
  out = out.replace(pcf, 'if ( shadowRadius > 1.5 ) return mix( 1.0, ogSoftShadow( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xyz ), shadowIntensity );\n\t\t\t' + pcf);
  if (!out.includes('ogSoftShadow( shadowMap, shadowMapSize, shadowRadius') || !out.includes('float ogSoftShadow')) {
    console.warn('shaders.js: shadow chunk changed; soft shadows not installed');
    return;
  }
  C.shadowmap_pars_fragment = out;
}
