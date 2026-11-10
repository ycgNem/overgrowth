// Small hand-built 3D models for every item. Built once, then cloned for
// pickups; also rendered to images for the inventory icons.
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeToGeometry, sharedBaked } from '../art/merge.ts';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rustTexture } from '../art/textures.js';
import { ITEMS } from './ItemDB.ts';
import { cloneModel, hasModel } from '../assets/Models.js';

const TAU = Math.PI * 2;

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
type Mats = ReturnType<typeof makeMats>;
let M: Mats | null = null;
function mats(): Mats {
  return (M ??= makeMats());
}
function makeMats() {
  return {
    rust: std({ map: rustTexture(3), roughness: 0.85, metalness: 0.3 }),
    steel: std({ name: 'BitScrap', color: 0x8a8f94, roughness: 0.4, metalness: 0.9 }),
    darkSteel: std({ name: 'BitScrap', color: 0x4a4038, roughness: 0.7, metalness: 0.6 }),
    brass: std({ name: 'BitScrap', color: 0xb8923e, roughness: 0.32, metalness: 1 }),
    gold: std({ color: 0xffc94a, roughness: 0.22, metalness: 1, emissive: 0x3a2400 }),
    silver: std({ color: 0xd8dde2, roughness: 0.2, metalness: 1 }),
    copper: std({ name: 'BitScrap', color: 0xc8693a, roughness: 0.3, metalness: 1 }),
    glass: std({ color: 0x3f8f4a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.6 }),
    clearGlass: std({ color: 0xcfe8f0, roughness: 0.05, transparent: true, opacity: 0.35 }),
    rope: std({ color: 0xa88a5a, roughness: 0.95 }),
    fiber: std({ color: 0x7c9e3a, roughness: 0.8 }),
    seed: std({ color: 0x3fd0b0, roughness: 0.25, metalness: 0.3, emissive: 0x0a3a30 }),
    jade: std({ color: 0x2f9a62, roughness: 0.25, metalness: 0.05, emissive: 0x041a0c }),
    white: std({ color: 0xf2efe6, roughness: 0.5 }),
    red: std({ color: 0xc02a1a, roughness: 0.5 }),
    black: std({ color: 0x1a1a1a, roughness: 0.6 }),
    battery: std({ name: 'BitScrap', color: 0x2f4a2a, roughness: 0.5, metalness: 0.2 }),
    label: std({ name: 'BitScrap', color: 0x9a6a3a, roughness: 0.7 }),
    filament: std({ color: 0xff8a2a, emissive: 0xff6a10, emissiveIntensity: 2 }),
    turquoise: std({ color: 0x30d0c0, roughness: 0.3, emissive: 0x0a3030 }),
    orchid: std({ color: 0xf6f2ff, roughness: 0.4, emissive: 0x201a30 }),
    // (the Bit* names: lying in the world or held, these take the forest's photographed bark,
    // wood, rock and moss at a small thing's scale, see art/merge.ts)
    bark: std({ name: 'BitBark', color: 0x5e4330, roughness: 0.95 }),
    wood: std({ name: 'BitWood', color: 0xc49a68, roughness: 0.85 }),
    woodInner: std({ name: 'BitWood', color: 0xc49a68, roughness: 0.85, side: THREE.BackSide }),
    woodDark: std({ name: 'BitWood', color: 0x8a6644, roughness: 0.85 }),
    stone: std({ name: 'BitRock', color: 0x8e8a7e, roughness: 0.9 }),
    flint: std({ color: 0x3e3f48, roughness: 0.25, metalness: 0.1, flatShading: true }),
    flintEdge: std({ name: 'BitRock', color: 0x8a8578, roughness: 0.6, flatShading: true }),
    leaf: std({ color: 0x4b8a31, roughness: 0.7, side: THREE.DoubleSide }),
    leafDry: std({ color: 0x5e4426, roughness: 0.9, side: THREE.DoubleSide }),
    leafDark: std({ color: 0x3e2c1a, roughness: 0.95, side: THREE.DoubleSide }),
    soil: std({ color: 0x241b12, roughness: 1 }),
    vine: std({ color: 0x4a6d25, roughness: 0.8 }),
    resin: std({ color: 0xd88a1a, roughness: 0.15, emissive: 0x3a1a00 }),
    capRed: std({ color: 0xc0402a, roughness: 0.5 }),
    stem: std({ color: 0xe6dcc0, roughness: 0.7 }),
    glowcap: std({ color: 0x6ab8ff, roughness: 0.4, emissive: 0x2a7aff, emissiveIntensity: 1.6 }),
    berry: std({ color: 0x8a1a3a, roughness: 0.3 }),
    reed: std({ color: 0xb8a468, roughness: 0.7 }),
    reedHead: std({ color: 0x5a3a20, roughness: 0.9 }),
    eel: std({ color: 0x23261c, roughness: 0.25, metalness: 0.1 }),
    smoked: std({ color: 0x4a2a14, roughness: 0.6 }),
    bogIron: std({ color: 0x7a3a1a, roughness: 0.85, metalness: 0.25 }),
    // red-brown and wet-looking, so it never reads as a stone beside one
    clay: std({ color: 0xa8603a, roughness: 0.42 }),
    feather: std({ color: 0xe8e2d2, roughness: 0.8, side: THREE.DoubleSide }),
    featherTip: std({ color: 0x3a3f4a, roughness: 0.8, side: THREE.DoubleSide }),
    bone: std({ color: 0xe4dcc4, roughness: 0.7 }),
    moss: std({ name: 'BitMoss', color: 0x5a7a34, roughness: 1 }),
    thorn: std({ color: 0x9a7a46, roughness: 0.6 }),
    canvas: std({ color: 0x6e6a44, roughness: 0.9 }),
    weave: std({ color: 0xa48a52, roughness: 0.95 }),
    hide: std({ color: 0x6a4a34, roughness: 0.8 }),
    oilcloth: std({ color: 0x3e4a32, roughness: 0.55 }),
  };
}

type Vec3 = [number, number, number];
type Builder = (m: Mats) => THREE.Object3D;

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, { p = [0, 0, 0], r = [0, 0, 0], s = 1 }: { p?: Vec3; r?: Vec3; s?: number | Vec3 } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  typeof s === 'number' ? m.scale.setScalar(s) : m.scale.set(...s);
  m.castShadow = true;
  return m;
}

function gearGeometry(teeth = 10, r0 = 0.12, r1 = 0.16, hole = 0.04, depth = 0.04) {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * TAU;
    const rr = i % 4 < 2 ? r1 : r0;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, TAU, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 1 });
  g.center();
  return g;
}

// a pack: a rounded body, a flap and two straps (also the lost satchel in the world)
function packModel(m: Mats, body: THREE.Material, flap: THREE.Material, w = 0.3, h = 0.36, d = 0.18) {
  const g = new THREE.Group();
  const b = new THREE.SphereGeometry(0.5, 12, 8);
  b.scale(w, h, d);
  g.add(mesh(b, body, { p: [0, h / 2, 0] }));
  g.add(mesh(new THREE.BoxGeometry(w * 0.9, 0.03, d * 0.8), flap, { p: [0, h * 0.86, d * 0.12], r: [0.5, 0, 0] }));
  for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(h * 0.32, 0.012, 5, 12, Math.PI), m.rope, { p: [s * w * 0.25, h * 0.5, -d * 0.45], r: [0, Math.PI / 2, Math.PI / 2] }));
  g.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 10), m.brass, { p: [0, h * 0.68, d * 0.5] }));
  return g;
}

const builders: Record<string, Builder> = {
  // the expedition: a torn page, the Thornback's heart, the grafts
  torn_page(m) {
    const geo = new THREE.PlaneGeometry(0.3, 0.38, 5, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 12) * 0.012 + p.getY(i) * p.getY(i) * 0.15);
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9, side: THREE.DoubleSide }), { r: [-1.1, 0, 0.2] }));
    for (let k = 0; k < 5; k++) g.add(mesh(new THREE.BoxGeometry(0.2 - (k % 2) * 0.06, 0.004, 0.008), m.black, { p: [-0.01, 0.06 - k * 0.045, 0.01 + k * 0.02], r: [-1.1, 0, 0.2] }));
    return g;
  },
  thornback_heart(m) {
    const g = new THREE.Group();
    const b = new THREE.SphereGeometry(0.12, 14, 10);
    b.scale(1, 1.25, 0.9);
    g.add(mesh(b, new THREE.MeshStandardMaterial({ color: 0x6a2a3a, roughness: 0.4, emissive: 0x3a0818, emissiveIntensity: 1.2 })));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.012, 4, 10, Math.PI), m.bark, { r: [Math.PI / 2, a, 0.3], s: [1, 1.2, 1] }));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6), m.bark, { p: [0.03, 0.16, 0], r: [0, 0, -0.4] }));
    g.add(mesh(new THREE.ConeGeometry(0.02, 0.12, 4), m.thorn, { p: [-0.08, 0.1, 0.05], r: [0.3, 0, 0.8] }));
    return g;
  },
  glowcap_lens(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), m.brass));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x8ad0ff, roughness: 0.1, emissive: 0x2a6aff, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }), { r: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), m.brass, { p: [0, -0.16, 0] }));
    return g;
  },
  bog_heads(m) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const h = new THREE.Group();
      h.add(mesh(new THREE.ConeGeometry(0.035, 0.12, 4), m.bogIron, { p: [0, 0.06, 0] }));
      h.add(mesh(new THREE.BoxGeometry(0.09, 0.02, 0.01), m.bogIron, { p: [0, 0.01, 0], r: [0, 0, 0] }));
      h.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 5), m.bogIron, { p: [0, -0.04, 0] }));
      h.position.set((k - 1) * 0.09, 0, k * 0.02);
      h.rotation.z = (k - 1) * 0.3;
      g.add(h);
    }
    return g;
  },
  resin_drip(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.1, 10), m.clay));
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), m.resin, { p: [0, 0.045, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.02, 6, 5), m.resin, { p: [0.06, -0.08, 0], s: [1, 1.6, 1] }));
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI), m.rope, { p: [0, 0.09, 0] }));
    return g;
  },
  coiled_spring(m) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * TAU * 3.5, r = 0.03 + (i / 60) * 0.09;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    const g = new THREE.Group();
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.008, 5), m.steel));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), m.brass, { r: [Math.PI / 2, 0, 0] }));
    return g;
  },
  root_anchor(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), m.bark, { s: [1, 1.2, 1] }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      g.add(mesh(new THREE.ConeGeometry(0.025, 0.2, 5), m.bark, { p: [Math.cos(a) * 0.08, -0.08, Math.sin(a) * 0.08], r: [Math.sin(a) * 0.7 + Math.PI, 0, -Math.cos(a) * 0.7] }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshStandardMaterial({ color: 0x8ad060, emissive: 0x3a8a20, emissiveIntensity: 1 }), { p: [0, 0.07, 0.03] }));
    return g;
  },
  pry_bar(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.46, 6), m.bogIron, { r: [0, 0, Math.PI / 2 - 0.15] }));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.03), m.bogIron, { p: [0.24, 0.05, 0], r: [0, 0, 0.9] }));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), m.rope, { p: [-0.16, -0.02, 0], r: [0, 0, Math.PI / 2 - 0.15] }));
    return g;
  },
  rot_hide(m) {
    const geo = new THREE.PlaneGeometry(0.42, 0.32, 6, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.02 + Math.cos(p.getY(i) * 11) * 0.015);
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a3e2c, roughness: 0.85, side: THREE.DoubleSide }), { r: [-Math.PI / 2 + 0.2, 0, 0.3] }));
    return g;
  },
  woven_satchel(m) {
    return packModel(m, m.weave, m.weave);
  },
  hide_pack(m) {
    return packModel(m, m.hide, m.hide, 0.32, 0.4, 0.2);
  },
  rucksack(m) {
    const g = packModel(m, m.canvas, m.hide, 0.34, 0.44, 0.22);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8), m.canvas, { p: [0, 0.5, -0.02], r: [0, 0, Math.PI / 2] }));
    return g;
  },
  // not an item: a bundle hidden in the roots (World's root caches), and a dropped satchel
  root_cache(m) {
    const g = new THREE.Group();
    const b = new THREE.SphereGeometry(0.5, 10, 7);
    b.scale(0.5, 0.26, 0.34);
    g.add(mesh(b, m.oilcloth, { p: [0, 0.12, 0] }));
    for (const x of [-0.12, 0.1]) g.add(mesh(new THREE.TorusGeometry(0.14, 0.012, 4, 12), m.rope, { p: [x, 0.12, 0], r: [0, Math.PI / 2, 0], s: [1, 0.95, 1.3] }));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), m.woodDark, { p: [0.22, 0.05, 0.08], r: [0, 0.4, 0] }));
    return g;
  },
  fiber(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.4, 0.006), m.fiber, { r: [0, i * 0.4, (i - 3) * 0.06] }));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), m.rope, { r: [Math.PI / 2, 0, 0] }));
    return g;
  },
  scrap_metal(m) {
    const geo = new THREE.BoxGeometry(0.42, 0.02, 0.3, 8, 1, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) + x * x * 1.2 + Math.sin(z * 18) * 0.01);
    }
    geo.computeVertexNormals();
    return mesh(geo, m.rust, { r: [0.3, 0.4, 0.2] });
  },
  rusty_bolts(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      b.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 6), m.darkSteel));
      b.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), m.darkSteel, { p: [0, -0.08, 0] }));
      b.position.set((i - 1) * 0.08, 0, (i % 2) * 0.05);
      b.rotation.set(1.3 + i * 0.3, i, 0.2);
      g.add(b);
    }
    return g;
  },
  frayed_rope(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.13 - i * 0.012, 0.028, 8, 20), m.rope, { p: [0, i * 0.045, 0], r: [Math.PI / 2, 0, 0] }));
    return g;
  },
  old_bottle(m) {
    const pts = [[0, 0], [0.07, 0], [0.075, 0.02], [0.075, 0.2], [0.06, 0.25], [0.025, 0.3], [0.024, 0.38], [0.03, 0.39], [0, 0.39]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.Group();
    g.add(mesh(new THREE.LatheGeometry(pts, 16), m.glass, { p: [0, -0.19, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.04, 8), m.label, { p: [0, 0.2, 0] }));
    g.rotation.z = 0.4;
    return g;
  },
  tin_can(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 16), m.steel));
    g.add(mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.12, 16, 1, true), m.label));
    return g;
  },
  copper_wire(m) {
    return mesh(new THREE.TorusKnotGeometry(0.1, 0.012, 80, 6, 3, 7), m.copper);
  },
  strange_seeds(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), m.seed, { p: [Math.cos(a) * 0.06, (i % 2) * 0.03, Math.sin(a) * 0.06], s: [1, 0.7, 1.3] }));
    }
    return g;
  },
  brass_gear(m) {
    const g = new THREE.Group();
    g.add(mesh(gearGeometry(12, 0.13, 0.17, 0.04), m.brass));
    g.add(mesh(gearGeometry(8, 0.06, 0.085, 0.02), m.brass, { p: [0.15, 0.1, 0.03] }));
    return g;
  },
  battery(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 16), m.battery));
    g.add(mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.05, 16), m.steel, { p: [0, -0.1, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), m.copper, { p: [0, 0.13, 0] }));
    g.rotation.z = 0.5;
    return g;
  },
  compass(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.05, 24), m.brass));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.052, 24), m.white));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.01, 0.025), m.red, { p: [0, 0.03, 0], r: [0, 0.6, 0] }));
    g.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), m.brass, { p: [0, 0, -0.17], r: [0, 0, 0] }));
    g.rotation.x = 0.5;
    return g;
  },
  pocket_watch(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 24), m.silver));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.042, 24), m.white));
    g.add(mesh(new THREE.BoxGeometry(0.008, 0.01, 0.08), m.black, { p: [0, 0.025, -0.03] }));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.008), m.black, { p: [0.025, 0.025, 0] }));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), m.silver, { p: [0, 0, -0.16], r: [0, 0, 0] }));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 24, Math.PI), m.silver, { p: [0, 0, -0.25], r: [Math.PI / 2, 0, 0] }));
    g.rotation.x = 0.6;
    return g;
  },
  vacuum_tube(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), m.black, { p: [0, -0.12, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 16), m.clearGlass));
    g.add(mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, TAU, 0, Math.PI / 2), m.clearGlass, { p: [0, 0.09, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.12, 0.01), m.filament));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05), m.steel, { p: [Math.cos(i * 1.57) * 0.03, -0.17, Math.sin(i * 1.57) * 0.03] }));
    return g;
  },
  ghost_orchid(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3), m.fiber, { p: [0, -0.1, 0] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), m.orchid, { p: [Math.cos(a) * 0.06, 0.06, Math.sin(a) * 0.06], s: [1, 0.25, 0.5], r: [0, -a, 0.3] }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), m.turquoise, { p: [0, 0.07, 0] }));
    return g;
  },
  doubloon(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), m.gold));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 24), m.gold, { r: [Math.PI / 2, 0, 0], p: [0, 0.01, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.008, 0.025), m.gold, { p: [0, 0.012, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.025, 0.008, 0.1), m.gold, { p: [0, 0.012, 0] }));
    g.rotation.x = 1.2;
    return g;
  },
  jade_figurine(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 10), m.jade, { r: [0, 0, Math.PI / 2] }));
    g.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), m.jade, { p: [0.14, 0.05, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.02, 0.04, 4), m.jade, { p: [0.14, 0.12, 0.03] }));
    g.add(mesh(new THREE.ConeGeometry(0.02, 0.04, 4), m.jade, { p: [0.14, 0.12, -0.03] }));
    for (const [x, z] of [[-0.08, 0.04], [-0.08, -0.04], [0.07, 0.04], [0.07, -0.04]])
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.1), m.jade, { p: [x, -0.08, z] }));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.18), m.jade, { p: [-0.17, 0.04, 0], r: [0, 0, 0.9] }));
    g.add(mesh(new THREE.SphereGeometry(0.012, 6, 6), m.gold, { p: [0.19, 0.07, 0.035] }));
    g.add(mesh(new THREE.SphereGeometry(0.012, 6, 6), m.gold, { p: [0.19, 0.07, -0.035] }));
    return g;
  },
  golden_idol(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.06, 0.18), m.gold, { p: [0, -0.2, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 12), m.gold, { p: [0, -0.06, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.17, 0.16, 0.14), m.gold, { p: [0, 0.12, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.16), m.gold, { p: [0, 0.22, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), m.jade, { p: [-0.035, 0.14, 0.072] }));
    g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), m.jade, { p: [0.035, 0.14, 0.072] }));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.015, 0.01), m.darkSteel, { p: [0, 0.08, 0.072] }));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), m.gold, { p: [s * 0.1, 0.12, 0] }));
    return g;
  },
  sun_mask(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24), m.gold, { r: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.09, 4), m.gold, { p: [Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0], r: [0, 0, a - Math.PI / 2] }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), m.turquoise, { p: [-0.05, 0.03, 0.02], s: [1.4, 0.8, 0.5] }));
    g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), m.turquoise, { p: [0.05, 0.03, 0.02], s: [1.4, 0.8, 0.5] }));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), m.darkSteel, { p: [0, -0.06, 0.02] }));
    return g;
  },
};

// a leaf blade shape (flat, pointed both ends) for vines, berries, poultices
function leafGeo(len = 0.16, w = 0.07) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w, len * 0.45, 0, len);
  s.quadraticCurveTo(-w, len * 0.45, 0, 0);
  return new THREE.ShapeGeometry(s, 6);
}

function lumpy<G extends THREE.BufferGeometry>(geo: G, amt: number, seed = 1): G {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 31 + seed) * Math.cos(y * 27 + seed * 2) * Math.sin(z * 23 + seed * 3);
    const k = 1 + n * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  // rounded, not faceted: the polyhedra come split per face, so their own normals are flat
  // (a material that wants the facets, like knapped flint, asks for them with flatShading)
  return toCreasedNormals(geo, 1.2) as G;
}

const forestBuilders: Record<string, Builder> = {
  stick(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.5, 6), m.bark, { r: [0, 0, Math.PI / 2 - 0.1] }));
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.14, 5), m.bark, { p: [0.06, 0.04, 0], r: [0, 0, -0.6] }));
    g.add(mesh(new THREE.CircleGeometry(0.024, 6), m.wood, { p: [0.25, 0.025, 0], r: [0, Math.PI / 2, 0] }));
    return g;
  },
  log(m) {
    const g = new THREE.Group();
    g.add(mesh(lumpy(new THREE.CylinderGeometry(0.11, 0.12, 0.42, 10, 3), 0.04), m.bark, { r: [0, 0, Math.PI / 2] }));
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.CircleGeometry(0.1, 10), m.wood, { p: [s * 0.212, 0, 0], r: [0, s * Math.PI / 2, 0] }));
      g.add(mesh(new THREE.RingGeometry(0.045, 0.055, 10), m.woodDark, { p: [s * 0.214, 0, 0], r: [0, s * Math.PI / 2, 0] }));
    }
    return g;
  },
  stone(m) {
    return mesh(lumpy(new THREE.DodecahedronGeometry(0.13, 1), 0.12, 3), m.stone, { s: [1.2, 0.8, 1] });
  },
  flint(m) {
    const g = new THREE.Group();
    g.add(mesh(lumpy(new THREE.OctahedronGeometry(0.13, 0), 0.15, 5), m.flint, { s: [1.3, 0.55, 0.9] }));
    g.add(mesh(lumpy(new THREE.OctahedronGeometry(0.06, 0), 0.2, 7), m.flintEdge, { p: [0.08, 0.02, 0.03], s: [1, 0.5, 1] }));
    return g;
  },
  vine(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 30, Math.PI * 3.4), m.vine, { r: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      g.add(mesh(leafGeo(), m.leaf, { p: [Math.cos(a) * 0.11, 0.01, Math.sin(a) * 0.11], r: [-1.1, a, 0.3] }));
    }
    return g;
  },
  bark(m) {
    const g = new THREE.Group();
    g.add(mesh(lumpy(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10, 2, true, 0, Math.PI * 0.9), 0.05), m.bark, { r: [0.2, 0, 0.3] }));
    g.add(mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.29, 10, 1, true, 0, Math.PI * 0.9), m.woodInner, { r: [0.2, 0, 0.3] }));
    return g;
  },
  resin(m) {
    const g = new THREE.Group();
    g.add(mesh(lumpy(new THREE.SphereGeometry(0.1, 12, 10), 0.18, 2), m.resin, { s: [1.2, 0.8, 1] }));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), m.resin, { p: [0.09, -0.03, 0.04] }));
    return g;
  },
  thorns(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.4, 5), m.vine, { r: [0, 0, Math.PI / 2 + 0.2] }));
    for (let i = 0; i < 9; i++) {
      const x = -0.17 + i * 0.042;
      const a = i * 2.4;
      g.add(mesh(new THREE.ConeGeometry(0.012, 0.07, 4), m.thorn, { p: [x, x * 0.2 + Math.cos(a) * 0.02, Math.sin(a) * 0.02], r: [a, 0, Math.cos(a) * 1.2] }));
    }
    return g;
  },
  mushroom(m) {
    const g = new THREE.Group();
    const cap = new THREE.SphereGeometry(0.11, 14, 8, 0, TAU, 0, Math.PI / 2);
    g.add(mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.16, 8), m.stem, { p: [0, -0.04, 0] }));
    g.add(mesh(cap, m.capRed, { p: [0, 0.03, 0], s: [1, 0.65, 1] }));
    for (let i = 0; i < 7; i++) {
      const a = i * 2.3, e = 0.4 + (i % 3) * 0.3;
      g.add(mesh(new THREE.SphereGeometry(0.014, 6, 4), m.stem, { p: [Math.cos(a) * Math.cos(e) * 0.11, 0.03 + Math.sin(e) * 0.07, Math.sin(a) * Math.cos(e) * 0.11], s: [1, 0.5, 1] }));
    }
    return g;
  },
  glowcap(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = 1 - i * 0.25, a = i * 2.1;
      const o = [Math.cos(a) * 0.06 * i, 0, Math.sin(a) * 0.06 * i];
      g.add(mesh(new THREE.CylinderGeometry(0.012 * s, 0.016 * s, 0.16 * s, 6), m.stem, { p: [o[0], -0.04 * s, o[2]] }));
      g.add(mesh(new THREE.ConeGeometry(0.06 * s, 0.07 * s, 10), m.glowcap, { p: [o[0], 0.06 * s, o[2]] }));
    }
    return g;
  },
  berries(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.03 + (i % 3) * 0.025;
      g.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), m.berry, { p: [Math.cos(a) * r, (i % 2) * 0.03, Math.sin(a) * r] }));
    }
    g.add(mesh(leafGeo(0.18, 0.08), m.leaf, { p: [0.02, 0.04, 0], r: [-1.2, 0.4, 0] }));
    g.add(mesh(leafGeo(0.15, 0.07), m.leaf, { p: [-0.02, 0.04, 0], r: [-1.3, 2.6, 0] }));
    return g;
  },
  clay(m) {
    // a smooth, squashed slab (the stone is grey and faceted)
    return mesh(lumpy(new THREE.SphereGeometry(0.13, 18, 12), 0.03, 9), m.clay, { s: [1.45, 0.45, 1.05] });
  },
  feather(m) {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.05, 0.15, 0.012, 0.36);
    s.lineTo(-0.01, 0.36);
    s.quadraticCurveTo(-0.04, 0.12, 0, 0);
    g.add(mesh(new THREE.ShapeGeometry(s, 8), m.feather, { r: [0, 0, -0.5] }));
    g.add(mesh(new THREE.PlaneGeometry(0.05, 0.06), m.featherTip, { p: [0.165, 0.29, 0.001], r: [0, 0, -0.5] }));
    g.add(mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.42, 4), m.bone, { p: [0.09, 0.15, 0.002], r: [0, 0, -0.5] }));
    return g;
  },
  reed(m) {
    // a bundle of hollow stems tied round the middle
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = i ? 0.028 : 0;
      g.add(mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.5 + (i % 3) * 0.04, 6), m.reed, { p: [Math.cos(a) * r, 0, Math.sin(a) * r], r: [0, 0, Math.PI / 2 + (i % 2 ? 0.05 : -0.04)] }));
    }
    g.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 5, 12), m.fiber, { r: [0, Math.PI / 2, 0] }));
    for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.012, 0.09, 5), m.reedHead, { p: [s * 0.29, 0.01, 0.01], r: [0, 0, -s * Math.PI / 2] }));
    return g;
  },
  eel(m) {
    // a sinuous black body, paler beneath, along a lazy S
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3((i / 12 - 0.5) * 0.5, 0, Math.sin(i * 0.65) * 0.06));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 36, 0.024, 8, false);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 9) / 36;
      const c = curve.getPointAt(Math.min(1, t));
      const k = 0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.5;
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, p.getY(i) * k * 0.8, c.z + (p.getZ(i) - c.z) * k);
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, m.eel));
    g.add(mesh(new THREE.SphereGeometry(0.006, 6, 4), m.black, { p: [0.245, 0.01, 0.02] }));
    return g;
  },
  smoked_eel(m) {
    const g = forestBuilders.eel(m);
    (g.children[0] as THREE.Mesh).material = m.smoked;
    g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.62, 5), m.wood, { r: [0, 0, Math.PI / 2] }));
    return g;
  },
  bog_iron(m) {
    // rust-red nodules fused into a lump
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7;
      g.add(mesh(lumpy(new THREE.IcosahedronGeometry(0.05 + (i % 3) * 0.012, 1), 0.3, i + 11), m.bogIron, { p: [Math.cos(a) * 0.05, (i % 2) * 0.03, Math.sin(a) * 0.05] }));
    }
    return g;
  },
  bone(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.34, 8), m.bone, { r: [0, 0, Math.PI / 2] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), m.bone, { p: [sx * 0.17, 0, sz * 0.025] }));
    return g;
  },
  moss(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      g.add(mesh(lumpy(new THREE.IcosahedronGeometry(0.08, 1), 0.2, i), m.moss, { p: [Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07], s: [1.2, 0.45, 1.2] }));
    }
    return g;
  },
  poultice(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), m.leaf, { s: [1, 0.75, 1] }));
    for (let i = 0; i < 4; i++) g.add(mesh(leafGeo(0.22, 0.12), m.leaf, { p: [0, -0.05, 0], r: [-0.4, (i / 4) * TAU, 0] }));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), m.rope, { r: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), m.berry, { p: [0, 0.08, 0] }));
    return g;
  },
  spike_trap(m) {
    return spikeTrapModel(m);
  },
  slingshot(m) {
    const g = new THREE.Group();
    const fork = (a, b, r) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const c = mesh(new THREE.CylinderGeometry(r * 0.85, r, d.length(), 8), m.wood, { p: a.clone().addScaledVector(d, 0.5).toArray() });
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.add(c);
    };
    const base = new THREE.Vector3(0, -0.2, 0), crotch = new THREE.Vector3(0, 0.02, 0);
    fork(base, crotch, 0.026);
    for (const sx of [-1, 1]) fork(crotch, new THREE.Vector3(sx * 0.1, 0.17, 0), 0.02);
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), m.rope, { p: [0, -0.12, 0] }));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.008, 5, 16, Math.PI), m.vine, { p: [0, 0.17, 0.0], r: [0, 0, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.03, 0.035), m.label, { p: [0, 0.07, 0] }));
    return g;
  },
  scrap_shot(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      g.add(mesh(lumpy(new THREE.IcosahedronGeometry(0.045, 0), 0.35, i + 3), m.rust, { p: [Math.cos(a) * 0.06, (i % 2) * 0.03, Math.sin(a) * 0.06] }));
    }
    return g;
  },
  firepot(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.09, 14, 10), m.glass, { p: [0, 0, 0], s: [1, 1.15, 1] }));
    g.add(mesh(new THREE.SphereGeometry(0.075, 12, 8), m.resin, { p: [0, -0.015, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10), m.glass, { p: [0, 0.12, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), m.rope, { p: [0.01, 0.19, 0], r: [0, 0, 0.3] }));
    g.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), m.filament, { p: [0.025, 0.24, 0] }));
    return g;
  },
  orchid_salve(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.07, 14), m.woodDark, { p: [0, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), m.moss, { p: [0, 0.04, 0] }));
    for (let i = 0; i < 5; i++) g.add(mesh(leafGeo(0.09, 0.05), m.orchid, { p: [0, 0.06, 0], r: [-0.9, (i / 5) * TAU, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), m.resin, { p: [0, 0.07, 0] }));
    return g;
  },
};

// Spike trap: also placed in the world, so it's exported. A scrape of bare earth set with
// sharpened stakes, no two leaning the same way, a few tipped with flint; two poles lashed
// across hold them, and dead leaves are strewn over the lot to hide it. (It was a square of
// new planks with a grid of pins: a shipping pallet.)
export function spikeTrapModel(m: Mats = mats()) {
  const g = new THREE.Group();
  let seed = 4127;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the scrape: a low, uneven mound of dark soil
  const soil = lumpy(new THREE.CylinderGeometry(0.46, 0.7, 0.05, 13, 1), 0.09, 2);
  g.add(mesh(soil, m.soil, { p: [0, 0.022, 0], s: [1, 1, 0.92] }));
  // two poles lashed in a cross, half sunk
  for (const [ry, len] of [[0.35, 1.12], [1.85, 1.0]] as const) {
    g.add(mesh(lumpy(new THREE.CylinderGeometry(0.03, 0.036, len, 6, 4), 0.03, 5 + ry), m.bark, { p: [0, 0.07, 0], r: [Math.PI / 2, 0, ry] }));
  }
  g.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), m.rope, { p: [0, 0.075, 0], r: [Math.PI / 2, 0, 0.4] }));
  g.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), m.rope, { p: [0, 0.075, 0], r: [0.5, 0.9, 0] }));
  // the stakes: scattered, each its own height and lean (outward, away from the middle)
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU * 2.4 + r() * 0.9, d = 0.1 + 0.4 * Math.sqrt((i + 0.5) / n) + (r() - 0.5) * 0.08;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 0.2 + r() * 0.16, lean = 0.12 + r() * 0.38, rad = 0.016 + r() * 0.008;
    const stake = new THREE.Group();
    stake.add(mesh(new THREE.CylinderGeometry(rad * 0.85, rad * 1.2, h, 5), m.bark, { p: [0, h / 2, 0] }));
    // whittled to a point: pale wood, and on the best of them a flake of flint bound on
    const tip = i % 3 === 0;
    stake.add(mesh(new THREE.ConeGeometry(rad * 0.9, 0.07 + r() * 0.03, 5), tip ? m.flint : m.wood, { p: [0, h + 0.035, 0] }));
    if (tip) stake.add(mesh(new THREE.CylinderGeometry(rad * 1.05, rad * 1.05, 0.025, 5), m.rope, { p: [0, h - 0.005, 0] }));
    stake.position.set(x, 0.04, z);
    // tip the stake's top away from the centre
    stake.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    g.add(stake);
  }
  // dead leaves over it, and a couple still green
  for (let i = 0; i < 20; i++) {
    const a = r() * TAU, d = 0.12 + r() * 0.56;
    g.add(mesh(leafGeo(0.2 + r() * 0.14, 0.08 + r() * 0.05), i % 7 === 0 ? m.leaf : i % 2 ? m.leafDry : m.leafDark,
      { p: [Math.cos(a) * d, 0.075 + r() * 0.03, Math.sin(a) * d], r: [-Math.PI / 2 + (r() - 0.5) * 0.5, (r() - 0.5) * 0.4, r() * TAU] }));
  }
  return g;
}

const cache = new Map<string, THREE.Group>();
const worldCache = new Map<string, { geometry: THREE.BufferGeometry; double: boolean }>();

// The item as it lies in the world or sits in the hand: the same model merged into one mesh
// on the baked material, so its stone is the forest's stone and not a flat grey (the plain
// model is for icons, which want clean colours). Models made in Blender are that already.
export function getWorldItemModel(id: string): THREE.Object3D {
  const def = ITEMS[id];
  if (def?.model && hasModel(def.model)) return getItemModel(id);
  if (!worldCache.has(id)) {
    const holder = new THREE.Group();
    const plain = getItemModel(id);
    // (glass stays glass: the baked material has no see-through)
    let glass = false;
    plain.traverse((o) => { if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).transparent) glass = true; });
    if (glass) return plain;
    holder.add(plain);
    const { geometry, double } = mergeToGeometry(holder);
    worldCache.set(id, { geometry, double });
  }
  const w = worldCache.get(id)!;
  const mesh = new THREE.Mesh(w.geometry, sharedBaked(w.double));
  mesh.userData.shared = true;
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

export function getItemModel(id: string): THREE.Group {
  if (!cache.has(id)) {
    const def = ITEMS[id];
    const g = def?.model && hasModel(def.model) ? cloneModel(def.model)
      : builders[id] ? builders[id](mats())
        : forestBuilders[id] ? forestBuilders[id](mats())
          : new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mats().steel);
    const root = new THREE.Group();
    root.add(g);
    // normalise to ~0.38m so every pickup reads well on the ground
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    g.position.sub(center);
    root.scale.setScalar(0.42 / size);
    cache.set(id, root);
  }
  return cache.get(id).clone();
}

// Render every item to a transparent PNG for the inventory UI.
export function renderItemIcons(renderer: THREE.WebGLRenderer, ids: Iterable<string>): Record<string, string> {
  const size = 128;
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404050, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(1, 2, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.5);
  rim.position.set(-2, 1, -1);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  camera.position.set(0.42, 0.34, 0.66);
  camera.lookAt(0, 0, 0);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const icons: Record<string, string> = {};
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.setClearColor(0x000000, 0);
  for (const id of ids) {
    const model = getItemModel(id);
    model.rotation.y = -0.5;
    scene.add(model);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(pixels.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    icons[id] = canvas.toDataURL();
    scene.remove(model);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.toneMapping = prevTone;
  target.dispose();
  envRT.dispose();
  pmrem.dispose();
  return icons;
}
