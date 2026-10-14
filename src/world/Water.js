// River/lake surface: one big plane that follows the player, with two scrolling normal-map
// layers. It knows how deep it is: the terrain heights of the loaded chunks are copied into
// a small float texture, so the shallows are clear and show the bed, deep water turns a
// murky green-brown, the edge fades in softly and foam gathers along the banks.
import * as THREE from 'three';
import { waterNormalTexture } from '../art/textures.js';
import { patch, globalUniforms } from '../art/shaders.js';
import { WATER_LEVEL, CHUNK_SIZE } from './WorldGen.js';

const SIZE = 1400;
const TILE = 9;
const WIN = 5; // chunks across the depth window
const RES = 48; // height samples per chunk (matches the terrain mesh)

export class Water {
  constructor(scene) {
    const tex = waterNormalTexture();
    tex.repeat.set(SIZE / TILE, SIZE / TILE);
    // PostFX samples the ripples too, for its screen-space reflections
    this.normalTex = tex;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const N = WIN * RES;
    // half floats: filterable everywhere WebGL2 runs
    this.heights = new Uint16Array(N * N).fill(THREE.DataUtils.toHalfFloat(50));
    this.heightTex = new THREE.DataTexture(this.heights, N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
    this.box = new THREE.Vector4(0, 0, WIN * CHUNK_SIZE, 0.5 / N);
    this.window = { cx: NaN, cz: NaN, keys: '' };
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a2f22, roughness: 0.06, metalness: 0.0,
      normalMap: tex, normalScale: new THREE.Vector2(0.2, 0.2),
      transparent: true, opacity: 1, depthWrite: false,
    });
    patch(mat, 'water2', (shader) => {
      shader.uniforms.uTime = globalUniforms.uTime;
      shader.uniforms.tHeight = { value: this.heightTex };
      shader.uniforms.uHBox = { value: this.box };
      shader.vertexShader = 'varying vec3 vWP;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = 'uniform float uTime;\nuniform sampler2D tHeight;\nuniform vec4 uHBox;\nvarying vec3 vWP;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
          vec2 ogHuv = (vWP.xz - uHBox.xy) / uHBox.z + uHBox.w;
          float ogBed = texture2D(tHeight, ogHuv).r;
          float ogDepth = max(${WATER_LEVEL.toFixed(2)} - ogBed, 0.0);
          // shallow water takes on the bed's warm tint; depth goes to dark olive-green
          vec3 ogShallow = vec3(0.10, 0.11, 0.06), ogDeep = vec3(0.012, 0.03, 0.022);
          diffuseColor.rgb = mix(ogShallow, ogDeep, 1.0 - exp(-ogDepth * 0.9));
          // foam: broken lines hugging the bank, drifting with the current
          float ogN1 = sin(vWP.x * 2.3 + uTime * 0.7 + sin(vWP.z * 1.7) * 2.0) * 0.5 + 0.5;
          float ogN2 = sin(vWP.z * 3.1 - uTime * 0.5 + sin(vWP.x * 1.3) * 2.0) * 0.5 + 0.5;
          // broken up by a coarse noise so it never draws straight strokes
          float ogBreak = sin(vWP.x * 0.61 + sin(vWP.z * 0.47) * 2.1) * sin(vWP.z * 0.53 - uTime * 0.2 + sin(vWP.x * 0.39) * 1.7) * 0.5 + 0.5;
          float ogFoam = smoothstep(0.35, 0.02, ogDepth) * smoothstep(0.45, 0.85, ogN1 * ogN2 + 0.35) * smoothstep(0.35, 0.75, ogBreak);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.51, 0.46), ogFoam * 0.3);`)
        .replace('#include <normal_fragment_maps>', /* glsl */`
          vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.018, uTime * 0.011)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(normalMap, vNormalMapUv * 0.43 + vec2(-uTime * 0.009, uTime * 0.016)).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
          mapN.xy *= normalScale;
          normal = normalize(tbn * mapN);`)
        // The sky probe has no trees in it, but a jungle river mostly mirrors its banks: low
        // reflection angles see the dark forest wall (coloured like the haze, much darker),
        // only steep ones see the sky.
        .replace('#include <lights_fragment_maps>', /* glsl */`#include <lights_fragment_maps>
          {
            vec3 ogRw = inverseTransformDirection( reflect( - geometryViewDir, normal ), viewMatrix );
            #ifdef USE_FOG
              vec3 ogWall = fogColor * vec3( 0.16, 0.22, 0.15 );
            #else
              vec3 ogWall = vec3( 0.02, 0.035, 0.02 );
            #endif
            radiance = mix( ogWall, radiance, smoothstep( 0.06, 0.42, ogRw.y ) );
          }`)
        // water isn't paint: almost no light scatters back out of it, the colour is reflection
        .replace('#include <aomap_fragment>', /* glsl */`#include <aomap_fragment>
          reflectedLight.directDiffuse *= 0.3;
          reflectedLight.indirectDiffuse *= 0.6;`)
        .replace('#include <opaque_fragment>', /* glsl */`
          float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
          // clear in the shallows, opaque in the deep, always a little reflective at grazing angles
          float ogA = mix(0.25, 0.94, 1.0 - exp(-ogDepth * 1.6));
          ogA = max(ogA, fres * 0.9);
          ogA = max(ogA, ogFoam * 0.8);
          // a soft edge where the water meets the bank
          ogA *= smoothstep(0.0, 0.06, ogDepth);
          diffuseColor.a = ogA;
          #include <opaque_fragment>`);
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  // Copy the loaded chunks' terrain heights into the depth window around the player.
  updateDepth(world) {
    const cx = world.cx, cz = world.cz;
    if (!Number.isFinite(cx)) return;
    // only rebuild when the window moves or a chunk inside it appears or disappears
    let keys = '';
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) keys += world.chunks.has(`${cx + dx},${cz + dz}`) ? '1' : '0';
    if (cx === this.window.cx && cz === this.window.cz && keys === this.window.keys) return;
    this.window = { cx, cz, keys };
    const N = WIN * RES, H = this.heights;
    const half = THREE.DataUtils.toHalfFloat;
    H.fill(half(50));
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ch = world.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch || !ch.heights) continue;
        const W = RES + 3; // the chunk keeps a one-sample border
        const ox = (dx + 2) * RES, oz = (dz + 2) * RES;
        for (let j = 0; j < RES; j++) {
          for (let i = 0; i < RES; i++) H[(oz + j) * N + ox + i] = half(ch.heights[(j + 1) * W + (i + 1)]);
        }
      }
    }
    this.box.set((cx - 2) * CHUNK_SIZE, (cz - 2) * CHUNK_SIZE, WIN * CHUNK_SIZE, 0.5 / N);
    this.heightTex.needsUpdate = true;
  }

  // the shader clock the ripples scroll with
  time() {
    return globalUniforms.uTime.value;
  }

  update(focus, world) {
    this.mesh.position.x = Math.round(focus.x / TILE) * TILE;
    this.mesh.position.z = Math.round(focus.z / TILE) * TILE;
    if (world) this.updateDepth(world);
  }
}
