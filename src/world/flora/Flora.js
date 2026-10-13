// The plant library. Builds every species once at startup (several seeded
// variants each) as merged geometries; chunks then scatter them with
// InstancedMesh so thousands of plants cost only a few draw calls.
import * as THREE from 'three';
import * as T from '../../art/textures.js';
import { addWind, addFoliageLighting, addMoss } from '../../art/shaders.js';
import { createNoise2D } from '../../utils/noise.js';
import { mulberry32, range, irange } from '../../utils/rng.js';
import { clamp, smoothstep } from '../../utils/math.js';
import {
  prep, paint, setUV, scaleUV, radialNormals, mergeSlots, taperedTube,
  frondStrip, leafCard, blob, transform,
} from './geom.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TREE_WIND = { sway: 0.0035 };
const PLANT_WIND = { sway: 0.03 };

function foliageMat(map, wind, { glow = 0.07, flutter = 0, rough = 0.78 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map, vertexColors: true, alphaTest: 0.45, alphaToCoverage: true,
    side: THREE.DoubleSide, roughness: rough, metalness: 0,
  });
  addFoliageLighting(m, glow);
  addWind(m, { ...wind, flutter });
  return m;
}

export class Flora {
  constructor() {
    const t = {
      canopy: T.leafClusterTexture(11, { hue: 108, sat: 50, light: 27 }),
      under: T.leafClusterTexture(23, { hue: 92, sat: 55, light: 33, count: 30 }),
      bush: T.leafClusterTexture(37, { hue: 116, sat: 46, light: 25, count: 40 }),
      palm: T.palmFrondTexture(5),
      fern: T.fernTexture(9),
      banana: T.bananaLeafTexture(13),
      grass: T.grassTexture(17),
      bark: T.barkTexture(19),
      palmBark: T.palmBarkTexture(29),
      rock: T.rockTexture(31),
      moss: T.mossTexture(41),
      litter: T.litterTexture(43),
      mud: T.mudTexture(47),
      leaf: T.singleLeafTexture(),
    };
    this.textures = t;

    const bark = new THREE.MeshStandardMaterial({ map: t.bark, vertexColors: true, roughness: 0.95 });
    addWind(bark, TREE_WIND);
    const palmBark = new THREE.MeshStandardMaterial({ map: t.palmBark, vertexColors: true, roughness: 0.92 });
    addWind(palmBark, TREE_WIND);
    const stem = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    addWind(stem, PLANT_WIND);
    const flower = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    addWind(flower, PLANT_WIND);
    const rock = new THREE.MeshStandardMaterial({ map: t.rock, vertexColors: true, roughness: 0.9, color: 0x9a9888 });
    addMoss(rock, t.moss, { amount: 0.55 });
    const log = new THREE.MeshStandardMaterial({ map: t.bark, vertexColors: true, roughness: 0.95 });
    addMoss(log, t.moss, { amount: 0.75, scale: 0.6 });

    this.materials = {
      bark, palmBark, stem, flower, rock, log,
      canopy: foliageMat(t.canopy, TREE_WIND, { flutter: 0.012 }),
      under: foliageMat(t.under, TREE_WIND, { flutter: 0.015 }),
      palm: foliageMat(t.palm, TREE_WIND, { flutter: 0.025 }),
      fern: foliageMat(t.fern, PLANT_WIND, { flutter: 0.02 }),
      bush: foliageMat(t.bush, PLANT_WIND, { flutter: 0.012 }),
      banana: foliageMat(t.banana, PLANT_WIND, { flutter: 0.01, rough: 0.6 }),
      grass: foliageMat(t.grass, { sway: 0.09 }, { glow: 0.04, rough: 0.9 }),
    };

    const m = this.materials;
    const variants = (n, seed0, fn) => Array.from({ length: n }, (_, i) => fn(seed0 + i * 101));
    // cut: can be hacked with the machete; loot: table rolled when cut.
    this.types = {
      bigTree: { variants: variants(3, 1000, (s) => this.bigTree(s)), material: [m.bark, m.canopy], shadow: true },
      palm: { variants: variants(3, 2000, (s) => this.palm(s)), material: [m.palmBark, m.palm], shadow: true },
      smallTree: { variants: variants(2, 3000, (s) => this.smallTree(s)), material: [m.bark, m.under], shadow: true },
      fern: { variants: variants(2, 4000, (s) => this.fern(s)), material: m.fern, shadow: true, cut: { r: 0.9, loot: 'fern', color: 0x6a9a2a } },
      bush: { variants: variants(2, 5000, (s) => this.bush(s)), material: m.bush, shadow: true, cut: { r: 1.1, loot: 'bush', color: 0x3f6e22 } },
      banana: { variants: variants(2, 6000, (s) => this.banana(s)), material: [m.stem, m.banana], shadow: true, cut: { r: 1.2, loot: 'banana', color: 0x7aa83a } },
      grass: { variants: [this.grass(7000, false), this.grass(7001, true)], material: m.grass, shadow: false, cut: { r: 0.6, loot: 'grass', color: 0x8aa040 } },
      flower: { variants: [this.heliconia(8000), this.blooms(8001), this.mushrooms(8002)], material: m.flower, shadow: false, cut: { r: 0.55, loot: 'flower', color: 0xd04030 } },
      rock: { variants: variants(3, 9000, (s) => this.rock(s)), material: m.rock, shadow: true },
      log: { variants: variants(2, 9500, (s) => this.log(s)), material: m.log, shadow: true },
    };
  }

  // ------------------------------------------------------------ trees

  bigTree(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const bark = [], leaves = [];
    const H = range(r, 17, 23);
    const lean = V(range(r, -1.6, 1.6), 0, range(r, -1.6, 1.6));
    const top = V(lean.x, H, lean.z);
    const rb = range(r, 0.8, 1.0);
    const pts = [
      V(0, -1.5, 0),
      V(lean.x * 0.1 + range(r, -0.3, 0.3), H * 0.3, lean.z * 0.1 + range(r, -0.3, 0.3)),
      V(lean.x * 0.5 + range(r, -0.5, 0.5), H * 0.65, lean.z * 0.5 + range(r, -0.5, 0.5)),
      top.clone(),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunk = taperedTube(pts, (t) => rb * (1 - 0.62 * t) + rb * 1.1 * Math.exp(-t * 16), 16, 11, 3, H / 3.5);
    paint(trunk, (p, n, c) => {
      const ao = 0.4 + 0.6 * smoothstep(-1, 5, p.y);
      const mossy = 1 - smoothstep(0, 6, p.y);
      c.setRGB(ao * (1 - mossy * 0.35), ao * (1 - mossy * 0.08), ao * (1 - mossy * 0.5));
    });
    bark.push(trunk);

    // Buttress roots — the signature of rainforest giants.
    const nr = irange(r, 5, 7);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * TAU + range(r, -0.3, 0.3);
      const len = range(r, 1.8, 3.4), hgt = range(r, 2.2, 4.2);
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(len, 0);
      s.quadraticCurveTo(len * 0.12, hgt * 0.1, 0, hgt);
      s.lineTo(0, 0);
      const g = prep(new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 7 }));
      g.translate(rb * 0.45, -0.45, -0.15);
      g.rotateY(-a);
      scaleUV(g, 0.33, 0.33);
      paint(g, (p, n, c) => {
        const ao = 0.35 + 0.65 * smoothstep(-0.5, 3, p.y);
        c.setRGB(ao * 0.7, ao * 0.85, ao * 0.55);
      });
      bark.push(g);
    }

    // Branches out to canopy clusters.
    const crownC = top.clone().add(V(0, 2.5, 0));
    const clusters = [];
    const nc = irange(r, 6, 8);
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * TAU + range(r, -0.35, 0.35);
      const rad = range(r, 3.5, 7.0);
      const P = V(top.x + Math.cos(a) * rad, H + range(r, -0.5, 3.5), top.z + Math.sin(a) * rad);
      clusters.push({ P, R: range(r, 2.8, 3.8) });
      const S = curve.getPointAt(range(r, 0.78, 0.97));
      const M = S.clone().lerp(P, 0.5).add(V(0, range(r, 0.5, 1.5), 0));
      const br = taperedTube([S, M, P], (t) => 0.4 * (1 - t * 0.7), 7, 6, 1, 2);
      paint(br, (p, n, c) => c.setRGB(0.75, 0.72, 0.68));
      bark.push(br);
    }
    clusters.push({ P: crownC, R: range(r, 3.4, 4.2) });

    for (const { P, R } of clusters) {
      const b = blob(R * 0.75, 1, nz, 0.3, 0.75);
      transform(b, { position: P });
      setUV(b, 0.5, 0.5);
      radialNormals(b, crownC, 0.3);
      paint(b, (p, n, c) => c.setRGB(0.8, 0.88, 0.7));
      leaves.push(b);
      const cards = irange(r, 20, 26);
      for (let k = 0; k < cards; k++) {
        const dir = V(range(r, -1, 1), range(r, -0.6, 1), range(r, -1, 1)).normalize();
        const pos = P.clone().add(V(dir.x * R * range(r, 0.5, 1.05), dir.y * R * 0.75 * range(r, 0.5, 1), dir.z * R * range(r, 0.5, 1.05)));
        // mix outward-facing with random facing so the crown reads as a volume from any angle
        const face = dir.clone().multiplyScalar(0.6).add(V(range(r, -1, 1), range(r, -0.3, 1), range(r, -1, 1)).normalize()).normalize();
        const card = leafCard(range(r, 2.8, 4.2), pos, face, r() * TAU);
        radialNormals(card, crownC, 0.35);
        const tr = range(r, 0.82, 1.05), tg = range(r, 0.92, 1.06), tb = range(r, 0.7, 0.92);
        paint(card, (p, n, c) => {
          const s = clamp(0.62 + (p.y - H) * 0.08, 0.5, 1.15);
          c.setRGB(s * tr, s * tg, s * tb);
        });
        leaves.push(card);
      }
    }

    // Lianas looping down to the ground and thin hanging vines.
    const nl = irange(r, 2, 4);
    for (let i = 0; i < nl; i++) {
      const cl = clusters[Math.floor(r() * clusters.length)];
      const A = cl.P.clone().add(V(0, -cl.R * 0.4, 0));
      const ang = r() * TAU, gd = range(r, 2.5, 6);
      const G = V(Math.cos(ang) * gd, -0.3, Math.sin(ang) * gd);
      const m1 = A.clone().lerp(G, 0.35).add(V(range(r, -1.5, 1.5), -range(r, 0.5, 2), range(r, -1.5, 1.5)));
      const m2 = A.clone().lerp(G, 0.7).add(V(range(r, -1.5, 1.5), -range(r, 0.5, 1.5), range(r, -1.5, 1.5)));
      const rad = range(r, 0.05, 0.09);
      const l = taperedTube([A, m1, m2, G], () => rad, 20, 4, 1, 6);
      paint(l, (p, n, c) => c.setRGB(0.6, 0.62, 0.4));
      bark.push(l);
    }
    const nh = irange(r, 5, 10);
    for (let i = 0; i < nh; i++) {
      const cl = clusters[Math.floor(r() * clusters.length)];
      const A = cl.P.clone().add(V(range(r, -1, 1) * cl.R * 0.8, -cl.R * 0.3, range(r, -1, 1) * cl.R * 0.8));
      const len = range(r, 3, 10);
      const w = () => range(r, -0.4, 0.4);
      const l = taperedTube([A, A.clone().add(V(w(), -len * 0.5, w())), A.clone().add(V(w(), -len, w()))], (t) => 0.035 * (1 - t * 0.5), 6, 3, 1, 3);
      paint(l, (p, n, c) => c.setRGB(0.42, 0.62, 0.28));
      bark.push(l);
    }

    return { geometry: mergeSlots([bark, leaves]), colliders: [{ x: 0, z: 0, r: rb * 1.15 }], canopy: 8 };
  }

  palm(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const bark = [], leaves = [];
    const H = range(r, 7, 12);
    const la = r() * TAU, lean = range(r, 0.8, 2.8);
    const L = V(Math.cos(la) * lean, 0, Math.sin(la) * lean);
    const pts = [V(0, -0.5, 0), V(L.x * 0.08, H * 0.33, L.z * 0.08), V(L.x * 0.4, H * 0.66, L.z * 0.4), V(L.x, H, L.z)];
    const trunk = taperedTube(pts, (t) => 0.28 * (1 - 0.3 * t) + 0.16 * Math.exp(-t * 9), 18, 8, 1, H / 1.3);
    paint(trunk, (p, n, c) => {
      const ao = 0.5 + 0.5 * smoothstep(-0.5, 3, p.y);
      c.setRGB(ao, ao, ao * 0.95);
    });
    bark.push(trunk);
    const top = pts[3];
    const crown = blob(0.42, 1, nz, 0.15, 1.3);
    transform(crown, { position: top.clone().add(V(0, 0.15, 0)) });
    setUV(crown, 0.3, 0.3);
    paint(crown, (p, n, c) => c.setRGB(0.65, 0.7, 0.45));
    bark.push(crown);
    if (r() < 0.75) {
      const nco = irange(r, 3, 6);
      for (let k = 0; k < nco; k++) {
        const a = r() * TAU;
        const g = prep(new THREE.SphereGeometry(0.16, 8, 6));
        transform(g, { position: top.clone().add(V(Math.cos(a) * 0.38, -0.25 - r() * 0.15, Math.sin(a) * 0.38)) });
        setUV(g, 0.5, 0.5);
        const green = r() < 0.4;
        paint(g, (p, n, c) => (green ? c.setRGB(0.45, 0.6, 0.2) : c.setRGB(0.5, 0.36, 0.18)));
        bark.push(g);
      }
    }
    const nf = irange(r, 11, 15);
    for (let i = 0; i < nf; i++) {
      const yaw = (i / nf) * TAU + range(r, -0.2, 0.2);
      const dead = i % 4 === 0 && r() < 0.5;
      const fr = frondStrip({
        length: range(r, 3.6, 5.2), width: range(r, 1.3, 1.6), segs: 10,
        elev: dead ? range(r, -0.9, -0.4) : range(r, 0.05, 0.85),
        droop: dead ? 0.15 : range(r, 0.45, 0.8), fold: 0.18, taper: 0.35,
      });
      transform(fr, { rotation: { y: yaw }, position: top });
      const tint = dead ? [0.95, 0.62, 0.3] : [range(r, 0.85, 1.0), 1, range(r, 0.75, 0.95)];
      paint(fr, (p, n, c) => c.setRGB(...tint));
      leaves.push(fr);
    }
    return { geometry: mergeSlots([bark, leaves]), colliders: [{ x: 0, z: 0, r: 0.38 }], canopy: 3 };
  }

  smallTree(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const bark = [], leaves = [];
    const H = range(r, 5, 8.5);
    const lx = range(r, -0.6, 0.6), lz = range(r, -0.6, 0.6);
    const pts = [V(0, -0.5, 0), V(lx * 0.3, H * 0.5, lz * 0.3), V(lx, H, lz)];
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunk = taperedTube(pts, (t) => 0.2 * (1 - 0.5 * t) + 0.12 * Math.exp(-t * 10), 10, 7, 1, H / 3);
    paint(trunk, (p, n, c) => {
      const ao = 0.5 + 0.5 * smoothstep(-0.5, 3, p.y);
      c.setRGB(ao * 0.95, ao, ao * 0.9);
    });
    bark.push(trunk);
    const center = V(lx, H + 0.5, lz);
    const nc = irange(r, 3, 5);
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * TAU + r();
      const rad = i === 0 ? 0 : range(r, 1.2, 2.4);
      const P = V(lx + Math.cos(a) * rad, H + range(r, -1.2, 1.2), lz + Math.sin(a) * rad);
      const R = range(r, 1.2, 1.7);
      if (rad > 0) {
        const S = curve.getPointAt(range(r, 0.6, 0.9));
        const br = taperedTube([S, S.clone().lerp(P, 0.5).add(V(0, 0.4, 0)), P], (t) => 0.1 * (1 - t * 0.6), 5, 5, 1, 1);
        bark.push(br);
      }
      const b = blob(R * 0.7, 1, nz, 0.3, 0.75);
      transform(b, { position: P });
      setUV(b, 0.5, 0.5);
      radialNormals(b, center, 0.3);
      paint(b, (p, n, c) => c.setRGB(0.85, 0.9, 0.75));
      leaves.push(b);
      const cards = irange(r, 13, 17);
      for (let k = 0; k < cards; k++) {
        const dir = V(range(r, -1, 1), range(r, -0.5, 1), range(r, -1, 1)).normalize();
        const pos = P.clone().addScaledVector(dir, R * range(r, 0.45, 1));
        const face = dir.clone().multiplyScalar(0.6).add(V(range(r, -1, 1), range(r, -0.3, 1), range(r, -1, 1)).normalize()).normalize();
        const card = leafCard(range(r, 1.8, 2.6), pos, face, r() * TAU);
        radialNormals(card, center, 0.35);
        const s = range(r, 0.85, 1.1);
        paint(card, (p, n, c) => c.setRGB(s, s, s * 0.9));
        leaves.push(card);
      }
    }
    return { geometry: mergeSlots([bark, leaves]), colliders: [{ x: 0, z: 0, r: 0.3 }], canopy: 2.5 };
  }

  // --------------------------------------------------------- undergrowth

  fern(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const nf = irange(r, 10, 15);
    for (let i = 0; i < nf; i++) {
      const fr = frondStrip({
        length: range(r, 0.9, 1.6), width: 0.5, segs: 7,
        elev: range(r, 0.45, 1.15), droop: range(r, 0.55, 0.95), fold: 0.2, taper: 0.2,
      });
      transform(fr, { rotation: { y: (i / nf) * TAU + range(r, -0.2, 0.2) }, position: V(0, 0.03, 0) });
      const tint = range(r, 0.85, 1.1);
      paint(fr, (p, n, c) => {
        const d = Math.hypot(p.x, p.z);
        const s = (0.55 + 0.45 * smoothstep(0, 0.8, d)) * tint;
        c.setRGB(s, s, s * 0.9);
      });
      parts.push(fr);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  bush(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const parts = [];
    const R = range(r, 0.85, 1.15);
    const C = V(0, R * 0.55, 0);
    const b = blob(R * 0.55, 1, nz, 0.3, 0.75);
    transform(b, { position: C });
    setUV(b, 0.5, 0.5);
    radialNormals(b, C, 0.2);
    paint(b, (p, n, c) => c.setRGB(0.85, 0.9, 0.75));
    parts.push(b);
    const nc = irange(r, 15, 20);
    for (let k = 0; k < nc; k++) {
      const dir = V(range(r, -1, 1), range(r, -0.1, 1), range(r, -1, 1)).normalize();
      const pos = C.clone().add(V(dir.x * R, dir.y * R * 0.75, dir.z * R).multiplyScalar(range(r, 0.55, 1)));
      const card = leafCard(range(r, 1.0, 1.45), pos, dir.clone().add(V(0, 0.4, 0)).normalize(), r() * TAU);
      radialNormals(card, C.clone().add(V(0, -0.3, 0)), 0.25);
      const s = range(r, 0.85, 1.1);
      paint(card, (p, n, c) => {
        const ao = 0.55 + 0.45 * smoothstep(0, R * 1.3, p.y);
        c.setRGB(s * ao, s * ao, s * ao * 0.9);
      });
      parts.push(card);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  banana(seed) {
    const r = mulberry32(seed);
    const stems = [], leaves = [];
    const SH = range(r, 1.0, 1.5);
    const ps = taperedTube([V(0, -0.2, 0), V(0, SH * 0.5, 0), V(0, SH, 0)], (t) => 0.13 * (1 - 0.35 * t), 4, 7, 1, 1);
    paint(ps, (p, n, c) => c.setRGB(0.36, 0.48, 0.18));
    stems.push(ps);
    const nl = irange(r, 5, 8);
    for (let i = 0; i < nl; i++) {
      const yaw = (i / nl) * TAU + range(r, -0.3, 0.3);
      const h0 = SH * range(r, 0.75, 1.0);
      const d = V(Math.cos(yaw), 0, -Math.sin(yaw));
      const Q = V(d.x * 0.4, h0 + range(r, 0.3, 0.7), d.z * 0.4);
      const pet = taperedTube([V(0, h0, 0), V(d.x * 0.2, h0 + 0.3, d.z * 0.2), Q], () => 0.035, 4, 4, 1, 1);
      paint(pet, (p, n, c) => c.setRGB(0.45, 0.58, 0.22));
      stems.push(pet);
      const leaf = frondStrip({
        length: range(r, 1.6, 2.4), width: range(r, 0.55, 0.7), segs: 9,
        elev: range(r, 0.15, 0.75), droop: range(r, 0.45, 0.85), fold: 0.1, taper: 0,
      });
      transform(leaf, { rotation: { y: yaw }, position: Q });
      const s = range(r, 0.85, 1.1);
      paint(leaf, (p, n, c) => c.setRGB(s, s, s * 0.92));
      leaves.push(leaf);
    }
    return { geometry: mergeSlots([stems, leaves]), colliders: [] };
  }

  grass(seed, tall) {
    const r = mulberry32(seed);
    const parts = [];
    const H = tall ? 1.6 : 0.85, W = tall ? 1.1 : 1.3;
    for (let i = 0; i < 3; i++) {
      const g = prep(new THREE.PlaneGeometry(W, H));
      g.translate(0, H / 2 - 0.05, 0);
      g.rotateY((i / 3) * Math.PI + r() * 0.3);
      paint(g, (p, n, c) => {
        const s = 0.45 + 0.55 * (p.y / H);
        c.setRGB(s, s, s);
      });
      const nrm = g.attributes.normal;
      for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
      parts.push(g);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  heliconia(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const stem = taperedTube([V(0, 0, 0), V(0.05, 0.6, 0), V(0, 1.2, 0)], () => 0.025, 5, 4, 1, 1);
    paint(stem, (p, n, c) => c.setRGB(0.25, 0.4, 0.12));
    parts.push(stem);
    for (let i = 0; i < 6; i++) {
      const y = 0.55 + i * 0.11;
      const side = i % 2 ? 1 : -1;
      const g = prep(new THREE.ConeGeometry(0.06, 0.36, 6));
      g.rotateZ(side * 1.0);
      g.translate(side * 0.12, y, 0);
      paint(g, (p, n, c) => {
        const t = smoothstep(y - 0.12, y + 0.18, p.y);
        c.setRGB(0.85, 0.08 + t * 0.6, 0.04);
      });
      parts.push(g);
    }
    for (let i = 0; i < 3; i++) {
      const g = prep(new THREE.SphereGeometry(0.5, 8, 4));
      g.scale(0.22, 0.03, 1);
      g.translate(0, 0.35 + i * 0.12, 0.45);
      g.rotateX(-0.5);
      g.rotateY((i / 3) * TAU + r());
      paint(g, (p, n, c) => c.setRGB(0.18, 0.4, 0.1));
      parts.push(g);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  blooms(seed) {
    const r = mulberry32(seed);
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const g = prep(new THREE.SphereGeometry(0.4, 8, 4));
      g.scale(0.25, 0.04, 1);
      g.translate(0, 0.08, 0.32);
      g.rotateX(-0.25);
      g.rotateY((i / 5) * TAU);
      paint(g, (p, n, c) => c.setRGB(0.2, 0.42, 0.12));
      parts.push(g);
    }
    const palettes = [[0.95, 0.35, 0.65], [0.98, 0.95, 0.9], [0.65, 0.3, 0.85], [1.0, 0.55, 0.15]];
    const nb = irange(r, 3, 5);
    for (let b = 0; b < nb; b++) {
      const a = r() * TAU, d = range(r, 0.05, 0.25), h = range(r, 0.45, 0.8);
      const top = V(Math.cos(a) * d * 1.6, h, Math.sin(a) * d * 1.6);
      const stem = taperedTube([V(0, 0, 0), V(Math.cos(a) * d * 0.5, h * 0.5, Math.sin(a) * d * 0.5), top], () => 0.012, 4, 3, 1, 1);
      paint(stem, (p, n, c) => c.setRGB(0.25, 0.45, 0.15));
      parts.push(stem);
      const col = palettes[Math.floor(r() * palettes.length)];
      for (let k = 0; k < 5; k++) {
        const g = prep(new THREE.SphereGeometry(0.07, 6, 4));
        g.scale(1, 0.25, 0.55);
        g.translate(0.07, 0, 0);
        g.rotateZ(0.35);
        g.rotateY((k / 5) * TAU);
        g.translate(top.x, top.y, top.z);
        paint(g, (p, n, c) => c.setRGB(...col));
        parts.push(g);
      }
      const ctr = prep(new THREE.SphereGeometry(0.03, 6, 4));
      ctr.translate(top.x, top.y + 0.02, top.z);
      paint(ctr, (p, n, c) => c.setRGB(1, 0.85, 0.2));
      parts.push(ctr);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  mushrooms(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const parts = [];
    const n = irange(r, 4, 7);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = range(r, 0, 0.3);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = range(r, 0.08, 0.25), cr = range(r, 0.05, 0.13);
      const stem = prep(new THREE.CylinderGeometry(cr * 0.3, cr * 0.38, h, 6));
      stem.translate(x, h / 2, z);
      paint(stem, (p, nn, c) => c.setRGB(0.9, 0.86, 0.75));
      parts.push(stem);
      const cap = prep(new THREE.SphereGeometry(cr, 10, 5, 0, TAU, 0, Math.PI / 2));
      cap.scale(1, 0.7, 1);
      cap.translate(x, h, z);
      const red = r() < 0.5;
      paint(cap, (p, nn, c) => {
        const spot = nz(p.x * 60, p.z * 60) > 0.55;
        if (spot) c.setRGB(0.98, 0.95, 0.88);
        else if (red) c.setRGB(0.75, 0.12, 0.05);
        else c.setRGB(0.9, 0.5, 0.12);
      });
      parts.push(cap);
    }
    return { geometry: mergeSlots([parts]), colliders: [] };
  }

  // ------------------------------------------------------------ ground

  rock(seed) {
    const r = mulberry32(seed);
    const nz = createNoise2D(seed);
    const squash = range(r, 0.5, 0.8);
    const g = blob(1, 2, nz, 0.38, squash);
    g.translate(0, -0.15, 0);
    scaleUV(g, 1.5, 1.5);
    paint(g, (p, n, c) => {
      const ao = 0.45 + 0.55 * smoothstep(-0.2, 0.5, p.y);
      c.setRGB(ao, ao, ao);
    });
    return { geometry: mergeSlots([[g]]), colliders: [{ x: 0, z: 0, r: 0.95, top: squash * 1.1 - 0.15 }] };
  }

  log(seed) {
    const r = mulberry32(seed);
    const parts = [];
    const L = range(r, 5, 8), r0 = range(r, 0.38, 0.55);
    const pts = [V(-L / 2, r0 * 0.75, 0), V(0, r0 * 0.85, range(r, -0.4, 0.4)), V(L / 2, r0 * 0.7, 0)];
    const body = taperedTube(pts, (t) => r0 * (1 - 0.2 * t), 12, 9, 2, L / 2.5);
    paint(body, (p, n, c) => {
      const ao = 0.5 + 0.5 * smoothstep(0, r0 * 1.4, p.y);
      c.setRGB(ao * 0.9, ao * 0.85, ao * 0.75);
    });
    parts.push(body);
    for (const [end, rr] of [[pts[0], r0], [pts[2], r0 * 0.8]]) {
      const cap = prep(new THREE.CircleGeometry(rr * 0.98, 9));
      cap.rotateY(end.x < 0 ? -Math.PI / 2 : Math.PI / 2);
      cap.translate(end.x, end.y, end.z);
      setUV(cap, 0.1, 0.1);
      paint(cap, (p, n, c) => c.setRGB(0.9, 0.7, 0.5));
      parts.push(cap);
    }
    for (let i = 0; i < 2; i++) {
      const x = range(r, -L * 0.3, L * 0.3);
      const S = V(x, r0 * 0.8, 0);
      const side = r() < 0.5 ? -1 : 1;
      const E = V(x + range(r, -0.5, 0.5), r0 * 0.8 + range(r, 0.4, 1.0), side * range(r, 0.6, 1.2));
      parts.push(taperedTube([S, S.clone().lerp(E, 0.5), E], (t) => 0.12 * (1 - 0.6 * t), 4, 5, 1, 1));
    }
    const colliders = [];
    for (let x = -L / 2 + 0.5; x <= L / 2 - 0.4; x += 0.9) colliders.push({ x, z: 0, r: r0 * 0.95, top: r0 * 1.6 });
    return { geometry: mergeSlots([parts]), colliders };
  }
}
