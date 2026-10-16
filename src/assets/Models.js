// Blender-made models (public/models/*.glb, built by art/blender/*.py).
//
// Each model is loaded once, flattened (one draw call per animated part, see art/merge.js)
// and cloned for every use. Geometry and the shared baked material are reused by clones.
// If a file is missing the game still runs: a plain placeholder stands in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { flatten, ownMaterials } from '../art/merge.js';

export const MODEL_NAMES = [
  'heartwood', 'bow_tower', 'spore_mortar', 'tesla_totem', 'ember_brazier', 'vine_snare', 'barricade',
  'blightling', 'rotboar', 'wisp', 'thornback', 'spitter', 'burrower', 'husk', 'glow_lantern',
  // the expedition: the Rot Mother and her eggs, the Heartseed sapling
  'rot_mother', 'rot_egg', 'heartseed',
  // point-of-interest props
  'crate', 'crate_b', 'tent', 'wreck',
  // the camp: the stash and the benches
  'coffer', 'workbench', 'firepit', 'tinker',
];

// Part names that stay separate so code can animate them.
const KEEP = /^(Heart|Orbit|Turret|Aim|Bolt|Bellows|Orb|Rings|Head|Jaw|Leg|Tail|Wing|Core|Sac|Flame|Coals|Grab|Lid|Rune|Ember|Lamp|L2|L3)/;
// Small creatures don't need to cast shadows; buildings do.
const NO_SHADOW = new Set(['blightling', 'wisp', 'rot_egg']);

const templates = new Map();

// The models are meshopt-compressed (art/compress.mjs), so every loader needs the decoder.
export function gltfLoader() {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

export async function loadModels(onEach) {
  const loader = gltfLoader();
  const base = `${import.meta.env.BASE_URL}models/`;
  await Promise.all(MODEL_NAMES.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`${base}${name}.glb`);
      const src = gltf.scene.children.length === 1 ? gltf.scene.children[0] : gltf.scene;
      src.position.set(0, 0, 0);
      const flat = flatten(src, KEEP, { shadow: !NO_SHADOW.has(name) });
      flat.name = name;
      templates.set(name, flat);
    } catch (err) {
      console.warn(`model ${name} failed to load, using a placeholder`, err);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
      m.position.y = 0.5;
      const g = new THREE.Group();
      g.add(m);
      templates.set(name, g);
    }
    onEach?.(name);
  }));
}

export function hasModel(name) {
  return templates.has(name);
}

// A fresh copy. own: give it private materials (hit flash / ghost tint).
export function cloneModel(name, { own = false } = {}) {
  const t = templates.get(name);
  if (!t) return new THREE.Group();
  const c = t.clone(true);
  return own ? ownMaterials(c) : c;
}

// Every descendant (parts) or the first one (part) whose (sanitised) name starts with `prefix`, e.g. part(tower, 'Turret').
export function parts(root, prefix) {
  const out = [];
  root.traverse((o) => {
    if (o.name.startsWith(prefix) && !o.isMesh) out.push(o);
  });
  return out;
}

export function part(root, prefix) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.name.startsWith(prefix) && !o.isMesh) found = o;
  });
  return found;
}
