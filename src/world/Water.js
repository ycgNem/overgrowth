// River/lake surface: one big plane that follows the player, with two
// scrolling normal-map layers and fresnel-based transparency.
import * as THREE from 'three';
import { waterNormalTexture } from '../art/textures.js';
import { patch, globalUniforms } from '../art/shaders.js';
import { WATER_LEVEL } from './WorldGen.js';

const SIZE = 1400;
const TILE = 9;

export class Water {
  constructor(scene) {
    const tex = waterNormalTexture();
    tex.repeat.set(SIZE / TILE, SIZE / TILE);
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c3a2e, roughness: 0.05, metalness: 0.05,
      normalMap: tex, normalScale: new THREE.Vector2(0.4, 0.4),
      transparent: true, opacity: 0.85,
    });
    patch(mat, 'water', (shader) => {
      shader.uniforms.uTime = globalUniforms.uTime;
      shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader
        .replace('#include <normal_fragment_maps>', /* glsl */`
          vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.018, uTime * 0.011)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(normalMap, vNormalMapUv * 0.43 + vec2(-uTime * 0.009, uTime * 0.016)).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
          mapN.xy *= normalScale;
          normal = normalize(tbn * mapN);`)
        .replace('#include <opaque_fragment>', /* glsl */`
          float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
          diffuseColor.a = mix(0.72, 0.97, fres);
          #include <opaque_fragment>`);
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(focus) {
    this.mesh.position.x = Math.round(focus.x / TILE) * TILE;
    this.mesh.position.z = Math.round(focus.z / TILE) * TILE;
  }
}
