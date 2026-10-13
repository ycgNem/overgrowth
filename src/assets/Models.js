// Blender-made models (public/models/*.glb, built by art/blender/*.py).
//
// Each model is loaded once, flattened (one draw call per animated part, see art/merge.js)
// and cloned for every use. Geometry and the shared baked material are reused by clones.
// If a file is missing the game still runs: a plain placeholder stands in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { flatten, ownMaterials } from '../art/merge.js';

export const MODEL_NAMES = ['heartwood', 'bow_tower', 'spore_mortar', 'tesla_totem', 'barricade', 'blightling', 'rotboar'];

// Part names that stay separate so code can animate them.
const KEEP = /^(Heart|Orbit|Turret|Aim|Bolt|Bellows|Orb|Rings|Head|Jaw|Leg|Tail)/;
// Small creatures don't need to cast shadows; buildings do.
const NO_SHADOW = new Set(['blightling']);

const templates = new Map();

export async function loadModels(onEach) {
  const loader = new GLTFLoader();
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

// First descendant whose (sanitised) name starts with `prefix`, e.g. part(tower, 'Turret').
export function part(root, prefix) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.name.startsWith(prefix) && !o.isMesh) found = o;
  });
  return found;
}
