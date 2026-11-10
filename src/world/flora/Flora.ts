// The plant library. Builds every species once at startup (several seeded variants each)
// as merged geometries; chunks then scatter them with InstancedMesh so thousands of plants
// cost only a few draw calls.
//
// The trees are grown in trees.ts (each with its own lighter copy for the distance); the
// undergrowth, rocks and floor dressing are built here.
//
// Leaves, fronds and twigs are photographed cut-outs (generated, keyed and packed into
// atlases by art/textures/process.py, loaded by TextureLib). Geometry gives each one its
// curve: blades arch and droop from their stalks, twig cards bend, fronds fan out. Wood
// and stone use tiling surfaces with normal maps. Vertex colours carry ambient occlusion
// (dark crown interiors, dark bases) and per-part tint, and every instance gets its own
// small colour shift, so no two plants match.
import * as THREE from 'three';
import * as T from '../../art/textures.js';
import { addWind, addFoliageLighting, addMoss, addSlopeShear, addPackedNormal, addNightFill, addDetailMap, addRelief } from '../../art/shaders.js';
import { createNoise2D } from '../../utils/noise.js';
import { mulberry32, range, irange } from '../../utils/rng.js';
import { clamp, smoothstep } from '../../utils/math.js';
import {
  prep, paint, scaleUV, radialNormals, mergeSlots, taperedTube, blob, transform,
  leafBlade, twigCard, plankRoot, rosetteDisc,
} from './geom.js';
import { giant, understory, umbrella, palm, treeFern, mangrove, snag, type CellFn, type TreeModel } from './trees.ts';

const TAU = Math.PI * 2;
const _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 0.55, 0);
// colours on untextured parts are picked in sRGB; vertex colours are linear
const SRGB = THREE.SRGBColorSpace;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TREE_WIND = { sway: 0.0035 };
const PLANT_WIND = { sway: 0.03, push: true };

// Rocks and props: per-triangle box projection (no spherical pinching at the poles).
function boxUV(geo, scale) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const q = [a, b, c][k];
      if (ay >= ax && ay >= az) uv.setXY(i + k, q.x * scale, q.z * scale);
      else if (ax >= az) uv.setXY(i + k, q.z * scale, q.y * scale);
      else uv.setXY(i + k, q.x * scale, q.y * scale);
    }
  }
  return geo;
}

function shade(geo, fn) {
  return paint(geo, fn);
}

// One species (or prop): its seeded variants and how they are drawn.
export interface PlantType {
  variants: TreeModel[];
  material: THREE.Material | THREE.Material[];
  shadow: boolean;
  /** [hue jitter, lightness jitter] for the per-instance colour shift */
  tint?: [number, number];
  /** can be hacked with the machete: reach, loot table and chip colour */
  cut?: { r: number; loot: string; color: number };
}

export class Flora {
  lib: any;
  cell: CellFn;
  textures: Record<string, any>;
  materials: Record<string, THREE.MeshStandardMaterial>;
  types: Record<string, PlantType>;

  constructor(lib) {
    this.lib = lib;
    const S = lib.surface, A = lib.atlas;
    const cell: CellFn = (a, n) => lib.cell(a, n);
    this.cell = cell;
    this.textures = {
      moss: S.cushion.map, mossFlat: S.moss.map, rock: S.rock.map, bark: S.bark.map, stone: S.stone,
    };

    // relief: the surface's parallax depth in metres (0 = none)
    const surf = (s: string, { relief = 0, ...opts }: { relief?: number } & THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.MeshStandardMaterial({
        // rough, porous surfaces: only a little of the sky in them
        map: S[s].map, normalMap: S[s].nmap, vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.45, ...opts,
      });
      if (relief) addRelief(m, relief);
      addPackedNormal(m);
      return m;
    };
    const bark = surf('bark', { relief: 0.035 });
    addWind(bark, TREE_WIND);
    addSlopeShear(bark, 3);
    addMoss(bark, S.cushion.map, { amount: 0.22, low: 1.6, side: true, tile: 0.3, flat: S.moss.map });
    const palmBark = surf('palmbark', { relief: 0.02 });
    addWind(palmBark, TREE_WIND);
    addSlopeShear(palmBark, 1.5);
    const fernTrunk = surf('palmbark', { relief: 0.02 });
    addWind(fernTrunk, { sway: 0.012 });
    // a cool moonlit fill so trunks hold their shape at night
    for (const mat of [bark, palmBark, fernTrunk]) addNightFill(mat, 0.2);
    const rock = surf('rock', { roughness: 0.85, relief: 0.05 });
    addMoss(rock, S.cushion.map, { amount: 0.36, tile: 0.28, flat: S.moss.map });
    const log = surf('bark', { relief: 0.035 });
    addMoss(log, S.cushion.map, { amount: 0.5, scale: 0.6, tile: 0.35, flat: S.moss.map });
    addSlopeShear(log, 2);
    const deadwood = surf('deadwood', { relief: 0.025 });
    addMoss(deadwood, S.cushion.map, { amount: 0.25, tile: 0.3, flat: S.moss.map });
    addSlopeShear(deadwood, 1.5);
    const pebble = surf('rock', { roughness: 0.7 });
    // stalks and petioles: their vertex colour, with the bark's fibres as faint striations
    // (the palm bark's rings turned banana stems into bamboo)
    const stem = surf('bark', { roughness: 0.6 });
    addDetailMap(stem, 0.095, 0.35);
    addWind(stem, PLANT_WIND);
    // mushrooms: matte, their colour in the vertex colours, the dead wood's grain as faint detail
    const fungus = new THREE.MeshStandardMaterial({ map: S.deadwood.map, vertexColors: true, roughness: 0.85 });
    addDetailMap(fungus, 0.148, 0.3);

    // leaf materials, one per atlas and wind profile
    // leaves keep a waxy sheen but only a little of the sky in it (the canopy hides most of it)
    const leaf = (atlas, wind, { glow = 0.04, trans = 0.65, rough = 0.62, flutter = 0.01, env = 0.5 } = {}) => {
      const m = new THREE.MeshStandardMaterial({
        map: A[atlas].map, normalMap: A[atlas].nmap, vertexColors: true, alphaTest: 0.5, alphaToCoverage: true,
        side: THREE.DoubleSide, roughness: rough, metalness: 0, envMapIntensity: env,
      });
      addFoliageLighting(m, glow, trans);
      addWind(m, { ...wind, flutter });
      addNightFill(m, 0.15);
      return m;
    };
    const m = this.materials = {
      bark, palmBark, fernTrunk, rock, log, deadwood, pebble, stem, fungus,
      canopy: leaf('canopy', TREE_WIND, { flutter: 0.012, trans: 0.75 }),
      // the giants' and mangroves' crowns: whole boughs of small leaves
      boughs: leaf('boughs', TREE_WIND, { flutter: 0.012, trans: 0.7 }),
      canopyLow: leaf('canopy', { sway: 0.006 }, { flutter: 0.015, trans: 0.75 }),
      palm: leaf('fronds', TREE_WIND, { flutter: 0.02, rough: 0.5 }),
      fern: leaf('fronds', PLANT_WIND, { flutter: 0.02, trans: 0.8 }),
      treeFern: leaf('fronds', { sway: 0.012 }, { flutter: 0.02, trans: 0.8 }),
      grass: leaf('fronds', { sway: 0.09, push: true }, { glow: 0.04, rough: 0.7, flutter: 0 }),
      broad: leaf('broad', PLANT_WIND, { flutter: 0.01, rough: 0.55, trans: 0.7, env: 0.3 }),
      under: leaf('under', PLANT_WIND, { flutter: 0.012, trans: 0.7 }),
      underTree: leaf('under', TREE_WIND, { flutter: 0.012, trans: 0.7 }),
      deadLeaf: leaf('fronds', { sway: 0.0 }, { glow: 0.0, rough: 0.85, trans: 0, flutter: 0 }),
    };

    const variants = (n, seed0, fn) => Array.from({ length: n }, (_, i) => fn(seed0 + i * 101));
    // the big-leaved herbs and the rocks are built twice from the same seed: the second, for
    // the distance, with a few segments to a leaf or a coarser ball (the same shape, a quarter
    // of the triangles)
    const twice = (n, seed0, fn) => variants(n, seed0, (s) => ({ ...fn(s, false), lod: fn(s, true).geometry }));
    // cut: can be hacked with the machete; loot: table rolled when cut.
    // tint: [hue jitter, lightness jitter] for the per-instance colour shift
    this.types = {
      // six giants, two of each habit (trees.ts)
      bigTree: { variants: Array.from({ length: 6 }, (_, i) => giant(1000 + i * 101, i % 3, cell)), material: [m.bark, m.boughs], shadow: true, tint: [0.03, 0.12] },
      palm: { variants: variants(3, 2000, (s) => palm(s, cell)), material: [m.palmBark, m.palm, m.stem], shadow: true, tint: [0.03, 0.1] },
      smallTree: { variants: Array.from({ length: 6 }, (_, i) => understory(3000 + i * 101, i % 3, cell)), material: [m.bark, m.underTree], shadow: true, tint: [0.04, 0.14] },
      midTree: { variants: variants(3, 3200, (s) => umbrella(s, cell)), material: [m.palmBark, m.underTree], shadow: true, tint: [0.03, 0.12] },
      treeFern: { variants: variants(3, 3500, (s) => treeFern(s, cell)), material: [m.fernTrunk, m.treeFern], shadow: true, tint: [0.03, 0.12] },
      fern: { variants: variants(3, 4000, (s) => this.fern(s)), material: m.fern, shadow: false, tint: [0.04, 0.16], cut: { r: 0.9, loot: 'fern', color: 0x6a9a2a } },
      bush: { variants: variants(3, 5000, (s) => this.bush(s)), material: [m.stem, m.under], shadow: false, tint: [0.04, 0.14], cut: { r: 1.1, loot: 'bush', color: 0x3f6e22 } },
      banana: { variants: twice(3, 6000, (s, far) => this.banana(s, far)), material: [m.stem, m.broad], shadow: true, tint: [0.03, 0.1], cut: { r: 1.2, loot: 'banana', color: 0x7aa83a } },
      monstera: { variants: twice(3, 6500, (s, far) => this.monstera(s, far)), material: [m.stem, m.broad], shadow: true, tint: [0.03, 0.12], cut: { r: 1.1, loot: 'banana', color: 0x2f6a22 } },
      grass: { variants: [this.grass(7000, false), this.grass(7001, true), this.grass(7002, false)], material: m.grass, shadow: false, tint: [0.05, 0.16], cut: { r: 0.6, loot: 'grass', color: 0x8aa040 } },
      flower: { variants: [this.heliconia(8000), this.heliconia(8001)], material: [m.stem, m.broad], shadow: false, tint: [0.02, 0.08], cut: { r: 0.55, loot: 'flower', color: 0xd04030 } },
      orchid: { variants: variants(2, 8100, (s) => this.orchid(s)), material: m.under, shadow: false, tint: [0.02, 0.08], cut: { r: 0.5, loot: 'flower', color: 0xb060c0 } },
      mushrooms: { variants: [this.mushrooms(8002), this.mushrooms(8003)], material: m.fungus, shadow: false, cut: { r: 0.45, loot: 'flower', color: 0xd08040 } },
      rock: { variants: twice(4, 9000, (s, far) => this.rock(s, far)), material: m.rock, shadow: true, tint: [0.02, 0.12] },
      cliffRock: { variants: twice(4, 9100, (s, far) => this.cliffRock(s, far)), material: m.rock, shadow: true, tint: [0.02, 0.1] },
      log: { variants: variants(2, 9500, (s) => this.log(s)), material: m.log, shadow: true, tint: [0.02, 0.1] },
      // forest floor dressing
      branch: { variants: variants(3, 9600, (s) => this.branch(s)), material: m.deadwood, shadow: true, tint: [0.02, 0.12] },
      stump: { variants: variants(2, 9700, (s) => this.stump(s)), material: m.deadwood, shadow: true, tint: [0.02, 0.1] },
      pebbles: { variants: variants(2, 9800, (s) => this.pebbles(s)), material: m.pebble, shadow: false, tint: [0.02, 0.12] },
      deadFrond: { variants: variants(2, 9950, (s) => this.deadFrond(s)), material: m.deadLeaf, shadow: false, tint: [0.03, 0.12] },
      seedling: { variants: variants(3, 10000, (s) => this.seedlings(s)), material: m.under, shadow: false, tint: [0.05, 0.16], cut: { r: 0.5, loot: 'grass', color: 0x5f8f2f } },
      taro: { variants: twice(3, 10100, (s, far) => this.taro(s, far)), material: [m.stem, m.broad], shadow: true, tint: [0.03, 0.12], cut: { r: 1.0, loot: 'banana', color: 0x4f7a2a } },
      mangrove: { variants: variants(3, 11000, (s) => mangrove(s, cell)), material: [m.bark, m.boughs], shadow: true, tint: [0.03, 0.1] },
      reeds: { variants: variants(3, 11100, (s) => this.reeds(s)), material: [m.stem, m.grass], shadow: false, tint: [0.05, 0.14], cut: { r: 0.6, loot: 'reeds', color: 0x9aa050 } },
      lily: { variants: variants(2, 11200, (s) => this.lilies(s)), material: [m.broad, m.under], shadow: false, tint: [0.03, 0.1] },
      snag: { variants: variants(3, 11300, (s) => snag(s)), material: m.deadwood, shadow: true, tint: [0.02, 0.08] },
      bromeliad: { variants: variants(2, 10200, (s) => this.bromeliad(s)), material: m.canopyLow, shadow: false, tint: [0.03, 0.1], cut: { r: 0.6, loot: 'grass', color: 0x6a8a2a } },
    };
  }

  // A crown of twig cards around a cluster centre: cards near the top and outside face the
  // sky; the inside and underside are darker (ambient occlusion), the top catches the light.
  // Big cards all facing the sky in a squashed layer read as flat paper plates from below and
  // as cut-outs from the side, so the cards are smaller and more of them, face every way out
  // of the crown (only leaning toward the sky), and over half get a second card crossed
  // through them along the twig, so no twig is ever seen edge-on as a line.
  crown(r, out, clusters, crownC, { cards = [16, 24], size = [2.2, 3.2], flat = 0.65, cells, topY, bottomY }) {
    const span = Math.max(topY - bottomY, 1);
    const fl = flat + (1 - flat) * 0.5;
    const paint = (card, tr, tg, tb) => {
      radialNormals(card, crownC, 0.45);
      shade(card, (p, nn, col) => {
        const h = clamp((p.y - bottomY) / span, 0, 1);
        const inner = clamp(p.clone().sub(crownC).setY(0).length() / (span * 1.4), 0, 1);
        const s = 0.42 + 0.5 * h + 0.2 * inner;
        col.setRGB(s * tr, s * tg, s * tb);
      });
      out.push(card);
    };
    for (const { P, R, from, k: kk = 1 } of clusters) {
      const n = Math.max(4, Math.round(irange(r, cards[0], cards[1]) * kk * 1.5));
      for (let k = 0; k < n; k++) {
        const d = V(range(r, -1, 1), range(r, -0.45, 1), range(r, -1, 1)).normalize();
        const pos = P.clone().add(V(d.x * R, d.y * R * fl, d.z * R).multiplyScalar(range(r, 0.25, 0.92)));
        // the twig points away from its branch, the leaves face out of the crown, leaning up
        const stemDir = pos.clone().sub(from).normalize().lerp(d, 0.5).normalize();
        const up = d.clone().multiplyScalar(0.9).add(V(range(r, -0.4, 0.4), 0.55, range(r, -0.4, 0.4))).normalize();
        const c = cells[Math.floor(r() * cells.length)];
        const sz = range(r, size[0], size[1]) * 0.74;
        const tr = range(r, 0.9, 1.05), tg = range(r, 0.95, 1.05), tb = range(r, 0.8, 1.0);
        paint(twigCard(c, sz, pos, stemDir, up, { bend: range(r, 0.1, 0.3), cup: 0.14 }), tr, tg, tb);
        if (r() < 0.6) {
          // the crossed card: the same twig seen turned a quarter round its stem
          const side = V().crossVectors(stemDir, up).normalize().lerp(up, 0.25).normalize();
          const c2 = cells[Math.floor(r() * cells.length)];
          paint(twigCard(c2, sz * range(r, 0.75, 0.9), pos.clone().addScaledVector(stemDir, sz * 0.08), stemDir, side, { bend: range(r, 0.1, 0.25), cup: 0.14 }), tr, tg, tb);
        }
      }
    }
  }

  // --------------------------------------------------------- the drowned grove

  // Reed bed: a dense clump of tall blades with a few cattail spikes standing out of it.
  reeds(seed) {
    const r = mulberry32(seed);
    const stems = [], blades = [];
    const cell = this.cell('fronds', 'grass1');
    const n = irange(r, 6, 9);
    for (let i = 0; i < n; i++) {
      const H = range(r, 1.6, 2.5), W = H * cell.aspect * 0.8;
      const g = prep(new THREE.PlaneGeometry(W, H, 1, 3));
      g.translate(0, H / 2 - 0.05, 0);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + uv.getX(k) * (cell.u1 - cell.u0), cell.v0 + uv.getY(k) * (cell.v1 - cell.v0));
      const lean = range(r, 0.05, 0.3), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) + (p.getY(k) / H) ** 2 * lean * H * 0.3);
      g.rotateY(r() * Math.PI);
      const a = r() * TAU, d = Math.sqrt(r()) * 0.4;
      g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      shade(g, (q, nn, c) => {
        const k = 0.3 + 0.7 * Math.pow(Math.max(q.y, 0) / H, 0.6);
        c.setRGB(k * 1.02, k, k * 0.82);
      });
      const nrm = g.attributes.normal;
      for (let k = 0; k < nrm.count; k++) {
        _n.fromBufferAttribute(nrm, k).multiplyScalar(0.45).add(_up).normalize();
        nrm.setXYZ(k, _n.x, _n.y, _n.z);
      }
      blades.push(g);
    }
    // cattails: a thin stalk and a brown velvet spike near the top
    for (let i = 0; i < irange(r, 2, 5); i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.35, H = range(r, 1.9, 2.7);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, tx = x + range(r, -0.15, 0.15), tz = z + range(r, -0.15, 0.15);
      const stalk = taperedTube([V(x, -0.1, z), V((x + tx) / 2, H * 0.5, (z + tz) / 2), V(tx, H, tz)], () => 0.012, 6, 4, 1, 1);
      shade(stalk, (q, nn, c) => c.setRGB(0.55, 0.62, 0.32));
      stems.push(stalk);
      const head = prep(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 7, 1));
      head.translate(tx, H - 0.25, tz);
      shade(head, (q, nn, c) => c.setRGB(0.32, 0.2, 0.11));
      stems.push(head);
    }
    return { geometry: mergeSlots([stems, blades]), colliders: [] };
  }

  // Water lilies: round pads lying on a pool, and a pale flower or two standing among them.
  lilies(seed) {
    const r = mulberry32(seed);
    const pads = [], flowers = [];
    const cell = this.cell('broad', 'taro0');
    const n = irange(r, 6, 11);
    for (let i = 0; i < n; i++) {
      const L = range(r, 0.35, 0.6);
      const g = leafBlade(cell, { length: L, segs: 3, across: 2, elev: 0.0, droop: 0.0, fold: -0.04, upBias: 3 });
      g.translate(-L * 0.45, 0, 0);
      const a = r() * TAU, d = Math.sqrt(r()) * 1.3;
      transform(g, { rotation: { y: r() * TAU }, position: V(Math.cos(a) * d, 0.01 + i * 0.002, Math.sin(a) * d) });
      const k = range(r, 0.55, 0.8);
      shade(g, (q, nn, c) => c.setRGB(k * 0.8, k, k * 0.75));
      pads.push(g);
    }
    const fl = this.cell('under', 'orchid0');
    for (let i = 0; i < irange(r, 1, 3); i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.9;
      for (let k = 0; k < 2; k++) {
        const g = prep(new THREE.PlaneGeometry(0.16, 0.16));
        const uv = g.attributes.uv;
        for (let q = 0; q < uv.count; q++) uv.setXY(q, fl.u0 + uv.getX(q) * (fl.u1 - fl.u0), fl.v0 + uv.getY(q) * (fl.v1 - fl.v0));
        g.translate(0, 0.09, 0);
        g.rotateY(k * Math.PI / 2 + a);
        g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
        shade(g, (q, nn, c) => c.setRGB(1.1, 1.05, 1.1));
        flowers.push(g);
      }
    }
    return { geometry: mergeSlots([pads, flowers]), colliders: [] };
  }

  // --------------------------------------------------------- undergrowth

  // Ground fern: a rosette of arching fronds.
  fern(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const cells = ['fern0', 'fern1'].map((n) => this.cell('fronds', n));
    const nf = irange(r, 9, 14);
    for (let i = 0; i < nf; i++) {
      const g = leafBlade(cells[Math.floor(r() * 2)], {
        length: range(r, 0.9, 1.6), segs: 7, across: 2, elev: range(r, 0.5, 1.15), droop: range(r, 0.6, 1.0),
        fold: 0.12, twist: range(r, -0.3, 0.3), upBias: 0.6,
      });
      transform(g, { rotation: { y: (i / nf) * TAU + range(r, -0.25, 0.25) }, position: V(0, 0.02, 0) });
      const tint = range(r, 0.88, 1.08);
      shade(g, (p, n, c) => {
        const d = Math.hypot(p.x, p.z);
        const s = (0.5 + 0.5 * smoothstep(0, 0.8, d)) * tint;
        c.setRGB(s, s, s * 0.9);
      });
      parts.push(g);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // Shrub: a few leaning stems, each ending in a loose spray of leafy twigs, so the outline
  // is lumpy and open rather than a ball.
  bush(seed) {
    const r = mulberry32(seed);
    const stems = [], parts = [];
    const cells = ['twigs0', 'twigs1'].map((n) => this.cell('under', n));
    // a few thin woody stems, each holding its sprays out in loose flat tiers (understory
    // shrubs spread their leaves to catch the little light that gets down here)
    const ns = irange(r, 3, 5);
    let top = 0;
    for (let s = 0; s < ns; s++) {
      const a = (s / ns) * TAU + range(r, -0.5, 0.5);
      const lean = range(r, 0.2, 0.7), h = range(r, 0.8, 1.9);
      top = Math.max(top, h);
      const base = V(Math.cos(a) * 0.06, -0.1, Math.sin(a) * 0.06);
      const tip = V(Math.cos(a) * lean, h, Math.sin(a) * lean);
      const mid = base.clone().lerp(tip, 0.5).add(V(range(r, -0.12, 0.12), 0, range(r, -0.12, 0.12)));
      const st = taperedTube([base, mid, tip], (t) => 0.028 * (1 - 0.65 * t), 6, 5, 1, 2);
      shade(st, (p, n, c) => c.setRGB(0.4, 0.34, 0.26, SRGB));
      stems.push(st);
      const nc = irange(r, 5, 8);
      for (let k = 0; k <= nc; k++) {
        const t = k === nc ? 1 : range(r, 0.4, 0.95);
        const at = base.clone().lerp(tip, t);
        const ya = a + range(r, -1.5, 1.5);
        const out = k === nc ? V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize() : V(Math.cos(ya), range(r, 0.35, 0.85), Math.sin(ya)).normalize();
        // roll each spray about its own axis so they don't stack like plates
        const side = V(-Math.sin(ya), 0, Math.cos(ya)).multiplyScalar(range(r, -0.5, 0.5));
        const up = V(0, 1, 0).addScaledVector(out, -0.25).add(side).normalize();
        const sz = range(r, 0.6, 0.95) * (0.7 + 0.3 * t);
        const tn = range(r, 0.88, 1.08);
        const sprays = [twigCard(cells[Math.floor(r() * 2)], sz, at, out, up, { bend: range(r, 0.2, 0.4), cup: 0.12 })];
        // a second spray crossed through it, so the bush has depth from every side
        if (r() < 0.55) sprays.push(twigCard(cells[Math.floor(r() * 2)], sz * 0.8, at, out, V().crossVectors(out, up).normalize().lerp(up, 0.3).normalize(), { bend: range(r, 0.2, 0.35), cup: 0.12 }));
        for (const card of sprays) {
          radialNormals(card, V(0, h * 0.55, 0), 0.45);
          shade(card, (p, n, c) => {
            const ao = 0.45 + 0.55 * smoothstep(0, 1.9, p.y);
            c.setRGB(tn * ao, tn * ao, tn * ao * 0.9);
          });
          parts.push(card);
        }
      }
    }
    return { geometry: mergeSlots([stems, parts]), colliders: [] };
  }


  // Banana: a fleshy pseudo-stem holding huge torn paddle leaves; the oldest hang dry.
  banana(seed, far = false) {
    const r = mulberry32(seed);
    const stems = [], leaves = [];
    const SH = range(r, 1.1, 1.8);
    const ps = taperedTube([V(0, -0.2, 0), V(0, SH * 0.5, 0), V(0, SH, 0)], (t) => 0.14 * (1 - 0.35 * t), far ? 2 : 5, far ? 4 : 9, 1, 1);
    shade(ps, (p, n, c) => {
      const ao = 0.6 + 0.4 * smoothstep(0, SH, p.y);
      c.setRGB(0.5 * ao, 0.57 * ao, 0.28 * ao, SRGB);
    });
    stems.push(ps);
    const cells = ['banana0', 'banana1', 'banana2'].map((n) => this.cell('broad', n));
    const nl = irange(r, 6, 9);
    for (let i = 0; i < nl; i++) {
      const yaw = (i / nl) * TAU + range(r, -0.3, 0.3);
      const old = i === 0 && r() < 0.7;
      const h0 = SH * range(r, 0.8, 1.0);
      const d = V(Math.cos(yaw), 0, -Math.sin(yaw));
      const Q = V(d.x * 0.35, h0 + range(r, 0.25, 0.6), d.z * 0.35);
      const pet = taperedTube([V(0, h0, 0), V(d.x * 0.15, h0 + 0.3, d.z * 0.15), Q], () => (far ? 0.045 : 0.035), far ? 1 : 4, far ? 3 : 5, 1, 1);
      shade(pet, (p, n, c) => c.setRGB(0.42, 0.55, 0.22, SRGB));
      stems.push(pet);
      const g = leafBlade(cells[Math.floor(r() * 3)], {
        length: range(r, 1.8, 2.7), segs: far ? 3 : 9, across: 2,
        elev: old ? range(r, -1.1, -0.6) : range(r, 0.2, 0.8), droop: old ? 0.1 : range(r, 0.45, 0.8),
        fold: 0.08, curl: -0.08, twist: range(r, -0.2, 0.2), upBias: 0.4,
      });
      transform(g, { rotation: { y: yaw }, position: Q });
      const t = old ? [0.75, 0.62, 0.35] : [range(r, 0.92, 1.0), 1, range(r, 0.9, 1.0)];
      shade(g, (p, n, c) => c.setRGB(...t));
      leaves.push(g);
    }
    return { geometry: mergeSlots([stems, leaves]), colliders: [] };
  }

  // Monstera: split, holed leaves held out on long stalks at different heights.
  monstera(seed, far = false) {
    const r = mulberry32(seed);
    const stems = [], leaves = [];
    const cells = ['monst0', 'monst1'].map((n) => this.cell('broad', n));
    const nl = irange(r, 5, 9);
    for (let i = 0; i < nl; i++) {
      const yaw = (i / nl) * TAU + range(r, -0.4, 0.4);
      const ph = range(r, 0.45, 1.5), out = range(r, 0.25, 0.7);
      const d = V(Math.cos(yaw), 0, -Math.sin(yaw));
      const Q = V(d.x * out, ph, d.z * out);
      const pet = taperedTube([V(0, -0.05, 0), V(d.x * out * 0.25, ph * 0.7, d.z * out * 0.25), Q], (t) => (far ? 0.04 : 0.03) * (1 - 0.3 * t), far ? 2 : 6, far ? 3 : 5, 1, 1);
      shade(pet, (p, n, c) => {
        const ao = 0.6 + 0.4 * smoothstep(0, ph, p.y);
        c.setRGB(0.4 * ao, 0.52 * ao, 0.24 * ao, SRGB);
      });
      stems.push(pet);
      const len = range(r, 0.7, 1.15);
      const g = leafBlade(cells[Math.floor(r() * 2)], {
        length: len, segs: far ? 2 : 6, across: far ? 2 : 4, elev: range(r, 0.0, 0.5), droop: range(r, 0.35, 0.7), fold: 0.18, curl: -0.15, upBias: 0.35,
      });
      transform(g, { position: V(-len * 0.08, 0, 0) });
      transform(g, { rotation: { y: yaw }, position: Q });
      const s = range(r, 0.85, 1.05);
      shade(g, (p, n, c) => {
        const k = 0.65 + 0.35 * smoothstep(0, 1.6, p.y);
        c.setRGB(s * k, s * k, s * k * 0.95);
      });
      leaves.push(g);
    }
    return { geometry: mergeSlots([stems, leaves]), colliders: [] };
  }

  // Grass and sedge tufts: crossed cards of a photographed tuft, normals half turned up so
  // the tuft lights like the ground it grows from, half its own way so the cards differ.
  grass(seed, tall) {
    const r = mulberry32(seed);
    const parts = [];
    const cell = this.cell('fronds', tall ? 'grass1' : 'grass0');
    const H = tall ? range(r, 1.4, 1.8) : range(r, 0.6, 0.9);
    const W = H * cell.aspect;
    for (let i = 0; i < 3; i++) {
      const g = prep(new THREE.PlaneGeometry(W, H, 1, 2));
      g.translate(0, H / 2 - 0.04, 0);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + uv.getX(k) * (cell.u1 - cell.u0), cell.v0 + uv.getY(k) * (cell.v1 - cell.v0));
      // lean the top of each card out a little
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) + (p.getY(k) / H) ** 2 * 0.15);
      g.rotateY((i / 3) * Math.PI + r() * 0.4);
      // dark down in the tuft where the blades crowd and shade each other
      shade(g, (q, n, c) => {
        const s = 0.28 + 0.72 * Math.pow(Math.max(q.y, 0) / H, 0.7);
        c.setRGB(s, s, s * 0.95);
      });
      const nrm = g.attributes.normal;
      for (let k = 0; k < nrm.count; k++) {
        _n.fromBufferAttribute(nrm, k).multiplyScalar(0.45).add(_up).normalize();
        nrm.setXYZ(k, _n.x, _n.y, _n.z);
      }
      parts.push(g);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // Heliconia: a flower stalk of red and gold bracts among a few paddle leaves.
  heliconia(seed) {
    const r = mulberry32(seed);
    const stems = [], leaves = [];
    const fl = this.cell('broad', 'helic0');
    const bl = this.cell('broad', 'banana0');
    const nl = irange(r, 3, 5);
    for (let i = 0; i < nl; i++) {
      const yaw = (i / nl) * TAU + range(r, -0.3, 0.3);
      const g = leafBlade(bl, { length: range(r, 0.9, 1.3), segs: 6, across: 2, elev: range(r, 0.6, 1.1), droop: range(r, 0.5, 0.8), fold: 0.1, upBias: 0.4 });
      transform(g, { rotation: { y: yaw }, position: V(0, 0.05, 0) });
      shade(g, (p, n, c) => c.setRGB(0.95, 1, 0.95));
      leaves.push(g);
    }
    const ns = irange(r, 1, 3);
    for (let i = 0; i < ns; i++) {
      const a = r() * TAU;
      const h = range(r, 0.9, 1.4);
      const g = leafBlade(fl, { length: h, segs: 4, across: 1, elev: Math.PI / 2 - range(r, 0.05, 0.25), droop: 0.1, fold: 0, upBias: 0.3 });
      transform(g, { rotation: { y: a }, position: V(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15) });
      shade(g, (p, n, c) => c.setRGB(1, 1, 1));
      leaves.push(g);
    }
    const st = taperedTube([V(0, -0.05, 0), V(0.02, 0.3, 0), V(0, 0.6, 0)], () => 0.025, 3, 4, 1, 1);
    shade(st, (p, n, c) => c.setRGB(0.42, 0.54, 0.24, SRGB));
    stems.push(st);
    return { geometry: mergeSlots([stems, leaves]), colliders: [] };
  }

  // Wild orchids: a couple of upright sprays.
  orchid(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const c = this.cell('under', 'orchid0');
    const n = irange(r, 2, 3);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const h = range(r, 0.45, 0.75);
      const g = leafBlade(c, { length: h, segs: 3, across: 1, elev: Math.PI / 2 - range(r, 0.1, 0.4), droop: 0.15, fold: 0, upBias: 0.3 });
      transform(g, { rotation: { y: a + i * 2 }, position: V(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1) });
      shade(g, (p, nn, col) => col.setRGB(1, 1, 1));
      parts.push(g);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // A clump of mushrooms of different ages: young ones small with a closed, domed cap, old
  // ones wide and flat. Lathe-turned caps with a rim curling under and gills beneath, on
  // tapering stems that lean a little and swell at the foot.
  mushrooms(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const parts = [];
    const n = irange(r, 4, 8);
    // one species per clump: a rusty red, a tawny brown or a pale buff
    const kind = r();
    const top = kind < 0.3 ? [0.42, 0.2, 0.12] : kind < 0.65 ? [0.52, 0.36, 0.22] : [0.66, 0.57, 0.44];
    const gill = [0.78, 0.7, 0.58];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = range(r, 0, 0.3);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const age = r();
      const h = range(r, 0.05, 0.16) * (0.65 + 0.6 * age), cr = range(r, 0.035, 0.09) * (0.6 + 0.7 * age);
      const lean = V(range(r, -0.18, 0.18), 1, range(r, -0.18, 0.18)).normalize();
      const tip = V(x + lean.x * h, lean.y * h, z + lean.z * h);
      const stem = taperedTube([V(x, -0.02, z), V(x + lean.x * h * 0.5, h * 0.5, z + lean.z * h * 0.5), tip],
        (t) => cr * (0.3 - 0.08 * t) + cr * 0.2 * Math.exp(-t * 7), 4, 7, 1, 1);
      shade(stem, (p, nn, c) => {
        const k = 0.75 + 0.25 * smoothstep(0, h, p.y);
        c.setRGB(0.82 * k, 0.77 * k, 0.66 * k, SRGB);
      });
      parts.push(stem);
      // the cap's profile, from the gills by the stem out under the rim and up over the top to
      // its centre (x = radius, y = height; this way round the lathe's faces look outward)
      const dome = cr * (1.0 - 0.6 * age);
      const prof = [[0.28, -0.12], [0.6, -0.14], [0.9, -0.12], [1.0, -0.06], [0.98, 0.04], [0.86, 0.2], [0.65, 0.37], [0.35, 0.5], [0, 0.55]]
        .map(([pr, py]) => new THREE.Vector2(pr * cr, py >= 0 ? py * dome * 1.6 : py * cr));
      const cap = prep(new THREE.LatheGeometry(prof, 12));
      cap.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), lean.clone().lerp(V(0, 1, 0), 0.5).normalize())));
      cap.translate(tip.x, tip.y, tip.z);
      shade(cap, (p, nn, c) => {
        // gills under the rim; the top darker at its centre, paler toward the edge, mottled
        const under = nn.y < -0.2;
        const k = 0.82 + 0.18 * nz(p.x * 40, p.z * 40);
        const rim = smoothstep(0, cr, Math.hypot(p.x - tip.x, p.z - tip.z));
        const col = under ? gill : top.map((v) => v * (0.8 + 0.35 * rim));
        c.setRGB(col[0] * k, col[1] * k, col[2] * k, SRGB);
      });
      parts.push(cap);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // A rosette from a cut-out photographed from above: an outer layer arching out and an
  // inner, more upright one turned against it, so the cup is full from any side.
  rosette(r, cell, at, size, petals, cupUp = 0.6) {
    const out = [];
    const layers = petals > 6 ? 2 : 1;
    for (let l = 0; l < layers; l++) {
      const inner = l === 1;
      const g = rosetteDisc(cell, {
        radius: size * (inner ? 0.62 : 1), rings: 3, segs: 12,
        rise: (inner ? 1.5 : 0.9) * (0.4 + 0.6 * cupUp), droop: inner ? 0.5 : 0.75, spin: r() * TAU,
      });
      transform(g, { rotation: { y: r() * TAU }, position: at.clone().add(V(0, inner ? size * 0.05 : 0, 0)) });
      shade(g, (p, n, c) => {
        // dark heart, lit rims
        const rr = Math.hypot(p.x - at.x, p.z - at.z) / size;
        const k = 0.45 + 0.55 * smoothstep(0, 0.6, rr);
        c.setRGB(k, k, k);
      });
      out.push(g);
    }
    return out;
  }

  bromeliad(seed) {
    const r = mulberry32(seed);
    const parts = this.rosette(r, this.cell('canopy', 'brom0'), V(0, 0.02, 0), range(r, 0.45, 0.7), irange(r, 7, 10), 1);
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // Low broadleaf seedlings: the knee-high carpet between the big plants.
  seedlings(seed) {
    const r = mulberry32(seed);
    const leaves = [];
    const cells = ['seed0', 'seed1'].map((n) => this.cell('under', n));
    const np = irange(r, 2, 4);
    for (let j = 0; j < np; j++) {
      const a = r() * TAU, d = j === 0 ? 0 : range(r, 0.25, 0.65);
      const sz = range(r, 0.2, 0.34);
      // a whole little plant photographed from above, cupped into shape
      const parts = this.rosette(r, cells[(j + seed) % 2], V(Math.cos(a) * d, 0.01, Math.sin(a) * d), sz, j === 0 ? 8 : 6, range(r, 0.35, 0.7));
      const s = range(r, 0.85, 1.1);
      for (const g of parts) {
        paint(g, (q, n, c) => c.setRGB(c.r * s, c.g * s, c.b * s * 0.95));
        leaves.push(g);
      }
    }
    return { geometry: mergeSlots([leaves]), colliders: [] };
  }


  // Elephant ear: huge heart-shaped leaves held out on long stalks.
  taro(seed, far = false) {
    const r = mulberry32(seed);
    const stems = [], leaves = [];
    const cells = ['taro0', 'taro1'].map((n) => this.cell('broad', n));
    const nl = irange(r, 3, 6);
    for (let i = 0; i < nl; i++) {
      const yaw = (i / nl) * TAU + range(r, -0.4, 0.4);
      const ph = range(r, 0.9, 1.6), out = range(r, 0.2, 0.5);
      const d = V(Math.cos(yaw), 0, -Math.sin(yaw));
      const Q = V(d.x * out, ph, d.z * out);
      const pet = taperedTube([V(0, -0.05, 0), V(d.x * out * 0.3, ph * 0.6, d.z * out * 0.3), Q], (t) => (far ? 0.055 : 0.045) * (1 - 0.4 * t), far ? 2 : 5, far ? 3 : 6, 1, 1);
      shade(pet, (q, n, c) => {
        const ao = 0.6 + 0.4 * smoothstep(0, ph, q.y);
        c.setRGB(0.4 * ao, 0.52 * ao, 0.24 * ao, SRGB);
      });
      stems.push(pet);
      const len = range(r, 1.1, 1.7);
      const g = leafBlade(cells[Math.floor(r() * 2)], {
        length: len, segs: far ? 3 : 7, across: far ? 2 : 4, elev: range(r, 0.2, 0.6), droop: range(r, 0.7, 1.0), fold: 0.25, curl: -0.1, upBias: 0.35,
      });
      transform(g, { position: V(-len * 0.12, 0, 0) }); // the stalk joins near the notch
      transform(g, { rotation: { y: yaw }, position: Q });
      const s = range(r, 0.85, 1.05);
      shade(g, (q, n, c) => c.setRGB(s, s, s * 0.95));
      leaves.push(g);
    }
    return { geometry: mergeSlots([stems, leaves]), colliders: [] };
  }

  // ------------------------------------------------------------ ground

  // Boulder: a lumpy core cut by a few fracture planes (crisp faces with soft edges), then
  // roughened at two scales. Box-mapped rock surface, moss on top.
  // A cliff outcrop: two or three slabs of bedded limestone, each squared off by fracture
  // planes, lumpy and pitted, stacked with their faces stepped back like the ledges a jungle
  // cliff weathers into. Built facing +z (open air); the world turns it down the slope and
  // beds its back into the face.
  cliffRock(seed, far = false) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const parts = [];
    const n = irange(r, 2, 3);
    let y = -0.6, back = 0, top = 0, wMax = 0;
    for (let i = 0; i < n; i++) {
      const w = range(r, 2.6, 4.2) * (1 - i * 0.12), h = range(r, 0.8, 1.4), d = range(r, 1.8, 2.6);
      let g = new THREE.IcosahedronGeometry(1, far ? 1 : 3);
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      const p = g.attributes.position, v = V();
      const planes = [
        { n: V(0, 1, 0), d: range(r, 0.5, 0.65) }, { n: V(0, -1, 0), d: range(r, 0.5, 0.65) },
        { n: V(range(r, -0.15, 0.15), range(r, -0.1, 0.25), 1).normalize(), d: range(r, 0.62, 0.78) },
        { n: V(1, 0, range(r, -0.3, 0.3)).normalize(), d: range(r, 0.66, 0.85) },
        { n: V(-1, 0, range(r, -0.3, 0.3)).normalize(), d: range(r, 0.66, 0.85) },
      ];
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        v.multiplyScalar(1 + nz(v.x * 1.3 + i * 3.1, v.z * 1.3 + v.y) * 0.16);
        for (const pl of planes) {
          const e = v.dot(pl.n) - pl.d;
          if (e > 0) v.addScaledVector(pl.n, -e * 0.9);
        }
        v.multiplyScalar(1 + nz(v.x * 5 + i, v.z * 5 + v.y * 4) * 0.03);
        p.setXYZ(k, v.x, v.y, v.z);
      }
      // to size: w wide, h tall, d deep, its foot at y and its face stepped back by `back`
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -bb.max.z);
      g.scale(w / (bb.max.x - bb.min.x), h / (bb.max.y - bb.min.y), d / (bb.max.z - bb.min.z));
      g.translate(range(r, -0.3, 0.3), y, 0.6 - back);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
      g = prep(g);
      g = smoothRock(g);
      boxUV(g, 0.55);
      shade(g, (q, nn, c) => {
        // darker under each ledge and toward the face it's bedded into
        const ao = (0.55 + 0.45 * smoothstep(-0.1, 0.6, nn.y + 0.3)) * (0.75 + 0.25 * smoothstep(-1.5, 0.4, q.z));
        c.setRGB(ao, ao, ao * 0.97);
      });
      parts.push(g);
      top = y + h;
      wMax = Math.max(wMax, w);
      y += h * range(r, 0.82, 0.94);
      back += range(r, 0.35, 0.75);
    }
    return { geometry: mergeSlots([parts]), colliders: [{ x: 0, z: -0.4, r: wMax * 0.42, top }] };
  }

  rock(seed, far = false) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const squash = range(r, 0.6, 0.9);
    let g = new THREE.IcosahedronGeometry(1, far ? 2 : 4);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const p = g.attributes.position;
    const planes = [];
    const np = irange(r, 4, 7);
    for (let i = 0; i < np; i++) {
      const n = V(range(r, -1, 1), range(r, -0.3, 1), range(r, -1, 1)).normalize();
      planes.push({ n, d: range(r, 0.62, 0.85) });
    }
    const v = V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + nz(v.x * 1.1 + v.y * 0.7, v.z * 1.1 - v.y * 0.5) * 0.22);
      // fracture planes: clamp the point back onto any plane it pokes through
      for (const pl of planes) {
        const k = v.dot(pl.n) - pl.d;
        if (k > 0) v.addScaledVector(pl.n, -k * 0.92);
      }
      v.multiplyScalar(1 + nz(v.x * 4.3, v.z * 4.3 + v.y * 3.1) * 0.035);
      v.y *= squash;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g = prep(g);
    g.translate(0, -0.15, 0);
    // smooth shading across the lumps (indexed merge), crisp only where faces are planar
    g = smoothRock(g);
    boxUV(g, 0.55);
    shade(g, (q, n, c) => {
      const ao = 0.55 + 0.45 * smoothstep(-0.2, 0.55, q.y);
      c.setRGB(ao, ao, ao * 0.97);
    });
    return { geometry: mergeSlots([[g]]), colliders: [{ x: 0, z: 0, r: 0.95, top: squash * 0.95 - 0.15 }] };
  }

  log(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const L = range(r, 5, 8), r0 = range(r, 0.38, 0.55);
    const pts = [V(-L / 2, r0 * 0.75, 0), V(0, r0 * 0.85, range(r, -0.4, 0.4)), V(L / 2, r0 * 0.7, 0)];
    const body = taperedTube(pts, (t) => r0 * (1 - 0.2 * t), 16, 12, 2, L / 1.6);
    shade(body, (p, n, c) => {
      const ao = 0.5 + 0.5 * smoothstep(0, r0 * 1.4, p.y);
      c.setRGB(ao * 0.95, ao * 0.92, ao * 0.85);
    });
    parts.push(body);
    for (const [end, rr] of [[pts[0], r0], [pts[2], r0 * 0.8]]) {
      const cap = prep(new THREE.CircleGeometry(rr * 0.98, 12));
      cap.rotateY(end.x < 0 ? -Math.PI / 2 : Math.PI / 2);
      cap.translate(end.x, end.y, end.z);
      // a small patch of the texture: a single constant UV breaks the normal map into static
      scaleUV(cap, 0.15, 0.15);
      shade(cap, (p, n, c) => c.setRGB(0.95, 0.75, 0.55));
      parts.push(cap);
    }
    for (let i = 0; i < 2; i++) {
      const x = range(r, -L * 0.3, L * 0.3);
      const S = V(x, r0 * 0.8, 0);
      const side = r() < 0.5 ? -1 : 1;
      const E = V(x + range(r, -0.5, 0.5), r0 * 0.8 + range(r, 0.4, 1.0), side * range(r, 0.6, 1.2));
      const g = taperedTube([S, S.clone().lerp(E, 0.5), E], (t) => 0.12 * (1 - 0.6 * t), 5, 6, 1, 1);
      parts.push(g);
    }
    const colliders = [];
    for (let x = -L / 2 + 0.5; x <= L / 2 - 0.4; x += 0.9) colliders.push({ x, z: 0, r: r0 * 0.95, top: r0 * 1.6 });
    return { geometry: mergeSlots([parts]), colliders };
  }

  // Fallen limb: a crooked branch with a few side twigs, lying on the ground.
  branch(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const L = range(r, 1.6, 3.4), r0 = range(r, 0.05, 0.11);
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push(V(-L / 2 + L * t, r0 * 0.55 + Math.sin(t * Math.PI) * range(r, 0, 0.08), range(r, -0.22, 0.22)));
    }
    const sh = (p, n, c) => {
      const ao = 0.5 + 0.5 * smoothstep(0, r0 * 1.6, p.y);
      c.setRGB(ao, ao * 0.95, ao * 0.88);
    };
    const body = taperedTube(pts, (t) => r0 * (1 - 0.6 * t), 12, 7, 1, L / 0.8);
    shade(body, sh);
    parts.push(body);
    const nb = irange(r, 1, 3);
    for (let i = 0; i < nb; i++) {
      const S = pts[1 + Math.floor(r() * 3)].clone();
      const side = r() < 0.5 ? -1 : 1, l = range(r, 0.35, 0.9);
      const E = S.clone().add(V(range(r, 0.2, 0.6) * l, range(r, 0, 0.2), side * l));
      const tw = taperedTube([S, S.clone().lerp(E, 0.5).add(V(0, 0.04, 0)), E], (t) => r0 * 0.5 * (1 - 0.75 * t), 4, 5, 1, 1);
      shade(tw, sh);
      parts.push(tw);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // Old snapped trunk: splintered top, flared roots, a pale heartwood face.
  stump(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const parts = [];
    const R0 = range(r, 0.35, 0.55), Ht = range(r, 0.45, 1.3);
    const body = taperedTube([V(0, -0.3, 0), V(0, Ht * 0.45, 0), V(0, Ht, 0)],
      (t) => R0 * (1 - 0.12 * t) + R0 * 0.55 * Math.exp(-t * 7), 8, 18, 2, Ht * 1.4);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < Ht - 0.02) continue;
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const lift = Math.pow(Math.abs(nz(Math.cos(a) * 4, Math.sin(a) * 4)), 0.7) * Ht * 0.2
        + Math.pow(Math.abs(Math.sin(a * 11 + nz(a, 0) * 2)), 3) * Ht * 0.3;
      const pull = 1 - 0.13 * (lift / (Ht * 0.5));
      p.setXYZ(i, p.getX(i) * pull, p.getY(i) + lift, p.getZ(i) * pull);
    }
    body.computeVertexNormals();
    shade(body, (q, n, c) => {
      const ao = 0.6 + 0.4 * smoothstep(-0.2, Ht, q.y);
      c.setRGB(ao, ao * 0.96, ao * 0.9);
    });
    parts.push(body);
    const cap = prep(new THREE.CircleGeometry(R0 * 0.86, 14));
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, Ht - 0.01, 0);
    scaleUV(cap, 0.15, 0.15);
    shade(cap, (q, n, c) => {
      const ring = 0.85 + 0.15 * Math.sin((Math.hypot(q.x, q.z) / R0) * 40);
      c.setRGB(1.1 * ring, 0.85 * ring, 0.6 * ring);
    });
    parts.push(cap);
    const nr = irange(r, 4, 6);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * TAU + range(r, -0.3, 0.3), len = range(r, 0.5, 1.0);
      const wob = range(r, -0.35, 0.35);
      const at = (dd, y, k) => V(Math.cos(a + wob * k) * dd, y, Math.sin(a + wob * k) * dd);
      const root = taperedTube([
        at(R0 * 0.7, Ht * 0.18, 0), at(R0 + len * 0.25, 0.05, 0.4), at(R0 + len * 0.6, -0.02, 0.8), at(R0 + len, -0.15, 1),
      ], (t) => R0 * 0.35 * Math.exp(-t * 2.2) + 0.02, 8, 7, 1, 1);
      shade(root, (q, n, c) => {
        const ao = 0.65 + 0.35 * smoothstep(-0.1, 0.4, q.y);
        c.setRGB(ao, ao * 0.96, ao * 0.9);
      });
      parts.push(root);
    }
    return { geometry: mergeSlots([parts]), colliders: [{ x: 0, z: 0, r: R0 * 1.1, top: Ht }] };
  }

  // A spill of river stones and gravel, half sunk into the ground.
  pebbles(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const n = irange(r, 10, 18);
    for (let i = 0; i < n; i++) {
      const nz = createNoise2D(seed * 7 + i);
      const s = i < 2 ? range(r, 0.08, 0.16) : range(r, 0.03, 0.1);
      const a = r() * TAU, d = Math.sqrt(r()) * 0.9;
      const g = blob(1, i < 2 ? 2 : 1, nz, 0.25, range(r, 0.4, 0.7));
      transform(g, { scale: V(s * range(r, 0.8, 1.3), s, s), rotation: { y: r() * TAU } });
      g.translate(Math.cos(a) * d, -s * 0.25, Math.sin(a) * d);
      boxUV(g, 3);
      const tone = range(r, 0.7, 1.0);
      shade(g, (q, nn, c) => {
        const ao = 0.65 + 0.35 * smoothstep(-s * 0.2, s * 0.6, q.y);
        c.setRGB(ao * tone, ao * tone, ao * tone * 0.96);
      });
      parts.push(g);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // A dead palm frond lying where it fell.
  deadFrond(seed) {
    const r = mulberry32(seed);
    const g = leafBlade(this.cell('fronds', r() < 0.5 ? 'palm0' : 'palm1'), {
      length: range(r, 3.2, 4.4), segs: 9, across: 2, elev: 0.04, droop: 0.02, fold: 0.15, upBias: 0.8,
    });
    transform(g, { position: V(-1.8, 0.04, 0) });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0.025, p.getY(i) * 0.4 + Math.abs(p.getZ(i)) * 0.12));
    // dry and grey-brown: warmer and the tips glowed neon orange even in shade
    const tint = [range(r, 0.6, 0.7), range(r, 0.5, 0.56), range(r, 0.38, 0.42)];
    shade(g, (q, n, c) => c.setRGB(...tint));
    return { geometry: mergeSlots([[g]]), colliders: [] };
  }
}

// Weld a non-indexed rock so lumps shade smoothly, then split it again for box UVs.
function smoothRock(g) {
  const pos = g.attributes.position;
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const acc = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)); // area-weighted
    for (let k = 0; k < 3; k++) {
      const kk = key(i + k);
      const v = acc.get(kk) || new THREE.Vector3();
      acc.set(kk, v.add(n));
    }
  }
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(key(i)).clone().normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

