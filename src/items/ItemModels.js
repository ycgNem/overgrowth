// Small hand-built 3D models for every item. Built once, then cloned for
// pickups; also rendered to images for the inventory icons.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rustTexture } from '../art/textures.js';
import { ITEMS } from './ItemDB.js';
import { cloneModel, hasModel } from '../assets/Models.js';

const TAU = Math.PI * 2;

const std = (o) => new THREE.MeshStandardMaterial(o);
let M = null;
function mats() {
  if (M) return M;
  M = {
    rust: std({ map: rustTexture(3), roughness: 0.85, metalness: 0.3 }),
    steel: std({ color: 0x8a8f94, roughness: 0.4, metalness: 0.9 }),
    darkSteel: std({ color: 0x4a4038, roughness: 0.7, metalness: 0.6 }),
    brass: std({ color: 0xc9a046, roughness: 0.32, metalness: 1 }),
    gold: std({ color: 0xffc94a, roughness: 0.22, metalness: 1, emissive: 0x3a2400 }),
    silver: std({ color: 0xd8dde2, roughness: 0.2, metalness: 1 }),
    copper: std({ color: 0xc8693a, roughness: 0.3, metalness: 1 }),
    glass: std({ color: 0x3f8f4a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.6 }),
    clearGlass: std({ color: 0xcfe8f0, roughness: 0.05, transparent: true, opacity: 0.35 }),
    rope: std({ color: 0xa88a5a, roughness: 0.95 }),
    fiber: std({ color: 0x7c9e3a, roughness: 0.8 }),
    seed: std({ color: 0x3fd0b0, roughness: 0.25, metalness: 0.3, emissive: 0x0a3a30 }),
    jade: std({ color: 0x2f9a62, roughness: 0.25, metalness: 0.05, emissive: 0x041a0c }),
    white: std({ color: 0xf2efe6, roughness: 0.5 }),
    red: std({ color: 0xc02a1a, roughness: 0.5 }),
    black: std({ color: 0x1a1a1a, roughness: 0.6 }),
    battery: std({ color: 0x2f4a2a, roughness: 0.5, metalness: 0.2 }),
    label: std({ color: 0x9a6a3a, roughness: 0.7 }),
    filament: std({ color: 0xff8a2a, emissive: 0xff6a10, emissiveIntensity: 2 }),
    turquoise: std({ color: 0x30d0c0, roughness: 0.3, emissive: 0x0a3030 }),
    orchid: std({ color: 0xf6f2ff, roughness: 0.4, emissive: 0x201a30 }),
    bark: std({ color: 0x5e4330, roughness: 0.95 }),
    wood: std({ color: 0xc49a68, roughness: 0.85 }),
    woodInner: std({ color: 0xc49a68, roughness: 0.85, side: THREE.BackSide }),
    woodDark: std({ color: 0x8a6644, roughness: 0.85 }),
    stone: std({ color: 0x8e8a7e, roughness: 0.9, flatShading: true }),
    flint: std({ color: 0x3e3f48, roughness: 0.25, metalness: 0.1, flatShading: true }),
    flintEdge: std({ color: 0x8a8578, roughness: 0.6, flatShading: true }),
    leaf: std({ color: 0x4b8a31, roughness: 0.7, side: THREE.DoubleSide }),
    vine: std({ color: 0x4a6d25, roughness: 0.8 }),
    resin: std({ color: 0xd88a1a, roughness: 0.15, emissive: 0x3a1a00 }),
    capRed: std({ color: 0xc0402a, roughness: 0.5 }),
    stem: std({ color: 0xe6dcc0, roughness: 0.7 }),
    glowcap: std({ color: 0x6ab8ff, roughness: 0.4, emissive: 0x2a7aff, emissiveIntensity: 1.6 }),
    berry: std({ color: 0x8a1a3a, roughness: 0.3 }),
    clay: std({ color: 0x8a8278, roughness: 0.75 }),
    feather: std({ color: 0xe8e2d2, roughness: 0.8, side: THREE.DoubleSide }),
    featherTip: std({ color: 0x3a3f4a, roughness: 0.8, side: THREE.DoubleSide }),
    bone: std({ color: 0xe4dcc4, roughness: 0.7 }),
    moss: std({ color: 0x55802d, roughness: 1, flatShading: true }),
    thorn: std({ color: 0x9a7a46, roughness: 0.6 }),
  };
  return M;
}

function mesh(geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
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

const builders = {
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

function lumpy(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 31 + seed) * Math.cos(y * 27 + seed * 2) * Math.sin(z * 23 + seed * 3);
    const k = 1 + n * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

const forestBuilders = {
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
    return mesh(lumpy(new THREE.SphereGeometry(0.13, 14, 10), 0.08, 9), m.clay, { s: [1.3, 0.6, 1] });
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

// Spike trap: also placed in the world, so it's exported.
export function spikeTrapModel(m = mats()) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 1.2), m.woodDark, { p: [0, 0.03, 0] }));
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(1.24, 0.07, 0.08), m.bark, { p: [0, 0.05, -0.45 + i * 0.3] }));
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const x = -0.44 + i * 0.22 + (j % 2) * 0.05, z = -0.44 + j * 0.22;
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.22, 5), m.bark, { p: [x, 0.15, z], r: [(i - 2) * 0.06, 0, (j - 2) * 0.06] }));
      g.add(mesh(new THREE.ConeGeometry(0.022, 0.09, 4), m.flint, { p: [x + (j - 2) * 0.006, 0.3, z - (i - 2) * 0.006], r: [(i - 2) * 0.06, 0, (j - 2) * 0.06] }));
    }
  }
  for (let i = 0; i < 6; i++) g.add(mesh(leafGeo(0.3, 0.14), m.leaf, { p: [-0.5 + i * 0.2, 0.08, (i % 2) * 0.5 - 0.25], r: [-1.45, i * 1.7, 0] }));
  return g;
}

const cache = new Map();

export function getItemModel(id) {
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
export function renderItemIcons(renderer, ids) {
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
  const icons = {};
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
