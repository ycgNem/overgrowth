// Flattening models into as few draw calls as possible.
//
// A Blender export (or a hand-built item model) has one mesh per material. Here every
// mesh that belongs to the same animated part is merged into a single geometry that
// carries its own colour, emissive and roughness/metalness per vertex, and is drawn with
// one shared "baked" material. A Blightling goes from ~30 draw calls to 8 (one per
// moving part), and a static prop to 1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

// Per-vertex colour/emissive/PBR material. `flash` is a per-material uniform (hit flash
// for enemies, placement tint for build ghosts): clone the material to give an object its own.
export function bakedMaterial({ side = THREE.FrontSide } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side });
  mat.userData.flash = { value: new THREE.Color(0, 0, 0) };
  mat.userData.tint = { value: new THREE.Vector4(1, 1, 1, 0) };
  // rim: a fresnel glow (rgb, strength) so dark creatures read against dark ground
  mat.userData.rim = { value: new THREE.Vector4(0.75, 0.3, 1, 0) };
  // dissolve: 0 = solid, 1 = gone; burns away along noise with a glowing edge
  mat.userData.dissolve = { value: 0 };
  // scales the baked emissive (the placement ghost turns it off so it doesn't bloom)
  mat.userData.emit = { value: 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = mat.userData.flash;
    shader.uniforms.uTint = mat.userData.tint;
    shader.uniforms.uRim = mat.userData.rim;
    shader.uniforms.uDissolve = mat.userData.dissolve;
    shader.uniforms.uEmit = mat.userData.emit;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aEmit;
attribute vec2 aPbr;
varying vec3 vEmit;
varying vec2 vPbr;
varying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vEmit = aEmit;
vPbr = aPbr;
vObj = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vEmit;
varying vec2 vPbr;
varying vec3 vObj;
uniform vec3 uFlash;
uniform vec4 uTint;
uniform vec4 uRim;
uniform float uDissolve;
uniform float uEmit;
float dHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float dEdge = 0.0;
if (uDissolve > 0.0) {
  float dn = dNoise(vObj * 7.0) * 0.65 + dNoise(vObj * 19.0) * 0.35;
  float de = dn - uDissolve * 1.08;
  if (de < 0.0) discard;
  dEdge = 1.0 - smoothstep(0.0, 0.09, de);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, uTint.rgb, uTint.a);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= vPbr.x;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor *= vPbr.y;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vEmit * uEmit + uFlash + uTint.rgb * uTint.a * 0.35;
float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
totalEmissiveRadiance += uRim.rgb * rimF * uRim.a + vec3(1.0, 0.45, 1.6) * dEdge * 2.5;`);
  };
  mat.customProgramCacheKey = () => 'baked';
  return mat;
}

const SHARED = { front: null, double: null };
function sharedBaked(double) {
  const k = double ? 'double' : 'front';
  if (!SHARED[k]) SHARED[k] = bakedMaterial({ side: double ? THREE.DoubleSide : THREE.FrontSide });
  return SHARED[k];
}

// One mesh (geometry + material, already in the target space) -> baked attributes.
function bakeGeometry(geo, mat) {
  let g = geo.clone();
  // Blender can export a blank white COLOR_0 next to the real colours in COLOR_1
  if (g.attributes.color_1) g.setAttribute('color', g.attributes.color_1);
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const base = mat.color ? mat.color : _c.set(1, 1, 1);
  const src = g.attributes.color;
  for (let i = 0; i < n; i++) {
    const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
    col[i * 3] = r * base.r;
    col[i * 3 + 1] = gg * base.g;
    col[i * 3 + 2] = b * base.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const emit = new Float32Array(n * 3);
  if (mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0) {
    // Blender strengths are tuned for Eevee bloom; without bloom they blow out to white
    const k = Math.min(mat.emissiveIntensity ?? 1, 1.6);
    for (let i = 0; i < n; i++) {
      emit[i * 3] = mat.emissive.r * k;
      emit[i * 3 + 1] = mat.emissive.g * k;
      emit[i * 3 + 2] = mat.emissive.b * k;
    }
  }
  g.setAttribute('aEmit', new THREE.BufferAttribute(emit, 3));
  const pbr = new Float32Array(n * 2);
  const rough = mat.roughness ?? 0.8, metal = mat.metalness ?? 0;
  for (let i = 0; i < n; i++) {
    pbr[i * 2] = rough;
    pbr[i * 2 + 1] = metal;
  }
  g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 2));
  return g;
}

// Blender exports every material double-sided; only the ones named ...DS (leaves, cloth)
// really are. Hand-built item models have unnamed materials and use side as usual.
function isDouble(m) {
  return m.name ? /DS$/.test(m.name) : m.side === THREE.DoubleSide;
}

function mergeList(list) {
  const anyNonIndexed = list.some((g) => !g.index);
  const gs = anyNonIndexed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
  return mergeGeometries(gs, false);
}

// Merge every mesh under `root` into one geometry in root's local space.
export function mergeToGeometry(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const list = [];
  let double = false;
  root.traverse((o) => {
    if (!o.isMesh) return;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some(isDouble)) double = true;
    const g = bakeGeometry(o.geometry, mats[0]);
    g.applyMatrix4(_m);
    list.push(g);
  });
  return { geometry: list.length ? mergeList(list) : null, double };
}

// Rebuild a model so each part whose name matches `keep` becomes one merged mesh, keeping
// the part hierarchy and pivots (so code can rotate a turret or swing a leg).
export function flatten(root, keep = /^$/, { shadow = true, receive = true } = {}) {
  root.updateMatrixWorld(true);
  const isKept = (o) => o === root || (o.name && keep.test(o.name));

  function build(src) {
    const out = new THREE.Group();
    out.name = src.name;
    _inv.copy(src.matrixWorld).invert();
    const geos = [];
    let double = false;
    const kids = [];
    const visit = (o) => {
      if (o !== src && isKept(o)) {
        kids.push(o);
        return;
      }
      if (o.isMesh) {
        _m.multiplyMatrices(_inv, o.matrixWorld);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some(isDouble)) double = true;
        const g = bakeGeometry(o.geometry, mats[0]);
        g.applyMatrix4(_m);
        geos.push(g);
      }
      for (const c of o.children) visit(c);
    };
    visit(src);
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeList(geos), sharedBaked(double));
      mesh.name = `${src.name}#mesh`;
      mesh.castShadow = shadow;
      mesh.receiveShadow = receive;
      out.add(mesh);
    }
    const srcInv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    for (const k of kids) {
      const child = build(k);
      new THREE.Matrix4().multiplyMatrices(srcInv, k.matrixWorld).decompose(child.position, child.quaternion, child.scale);
      out.add(child);
    }
    return out;
  }
  return build(root);
}

// Give every mesh under `obj` its own clone of its material (for per-object flash/tint).
export function ownMaterials(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      const src = o.material;
      const m = bakedMaterial({ side: src.side });
      o.material = m;
    }
  });
  return obj;
}

export function setFlash(obj, r, g, b) {
  obj.traverse((o) => {
    if (o.isMesh && o.material.userData.flash) o.material.userData.flash.value.setRGB(r, g, b);
  });
}

export function setRim(obj, strength, color) {
  obj.traverse((o) => {
    if (o.isMesh && o.material.userData.rim) {
      const r = o.material.userData.rim.value;
      if (color) {
        _c.set(color);
        r.set(_c.r, _c.g, _c.b, strength);
      } else r.w = strength;
    }
  });
}

export function setDissolve(obj, d) {
  obj.traverse((o) => {
    if (o.isMesh && o.material.userData.dissolve) o.material.userData.dissolve.value = d;
  });
}

export function setEmit(obj, k) {
  obj.traverse((o) => {
    if (o.isMesh && o.material.userData.emit) o.material.userData.emit.value = k;
  });
}

export function setTint(obj, color, amount) {
  obj.traverse((o) => {
    if (o.isMesh && o.material.userData.tint) {
      const t = o.material.userData.tint.value;
      if (color) {
        _c.set(color);
        t.set(_c.r, _c.g, _c.b, amount);
      } else t.w = 0;
    }
  });
}
