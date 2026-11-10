// The trees. Each builder grows a tree once from a seed and returns two geometries of it: the
// one drawn up close, and a far lighter one of the same tree for the distance (the pools swap
// to it past the LOD line, see World.js).
//
// A tree is a skeleton and its leaves. The skeleton forks: a limb runs out, turns a little
// toward the light and splits into two or three thinner ones, to a set depth; where the last
// shoots end, a pad of bough cards fans out, mostly facing the sky, the way a real crown holds
// its leaves in layers on top of its branches (a ball of cards around a point reads as a
// pom-pom on a stick). The far copy keeps the trunk and main limbs as a few flat-sided tubes and
// hangs fewer, bigger cards at the same shoots, so the outline holds when the pools swap.
//
// Leaves are photographed cut-outs from the atlases (TextureLib): the giants' boughs are whole
// leafy branches (art/textures/boughs.py), the understory's are small-leaved sprays.
import * as THREE from 'three';
import { createNoise2D } from '../../utils/noise.js';
import { mulberry32, range, irange } from '../../utils/rng.js';
import { clamp, smoothstep } from '../../utils/math.js';
import { prep, paint, mergeSlots, taperedTube, blob, transform, leafBlade, plankRoot, rosetteDisc } from './geom.js';

const TAU = Math.PI * 2;
const SRGB = THREE.SRGBColorSpace;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

type Geo = THREE.BufferGeometry;
type Rand = () => number;
export interface Cell { u0: number; v0: number; u1: number; v1: number; aspect: number }
export type CellFn = (atlas: string, name: string) => Cell;
export interface TreeModel {
  geometry: Geo;
  /** the same tree for the distance (absent: World thins the near one) */
  lod?: Geo;
  colliders: { x: number; z: number; r: number; top?: number }[];
  canopy?: number;
  /** where its shade falls: the crown's radius, top and centre */
  crown?: { r: number; top: number; x: number; z: number };
}

// One of the two copies being built: wood and leaf parts, merged per material slot at the end.
class Build {
  wood: Geo[] = [];
  leaf: Geo[] = [];
  extra: Geo[] = [];
  // leaf cards wait here until the crown's extent is known (their shading depends on it)
  cards: { g: Geo; tint: number[] }[] = [];
}

// ------------------------------------------------------------------ parts

// A limb through `pts`, r0 thick at its start and r1 at its end, lit `k`. The bark's grain
// repeats every `grain` metres along it and a whole number of times around.
function wood(pts: THREE.Vector3[], r0: number, r1: number, tubular: number, radial: number, k = 0.8, grain = 1.8): Geo {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const around = Math.max(1, Math.round((TAU * (r0 + r1) * 0.5) / grain));
  const g = taperedTube(pts, (t) => r0 + (r1 - r0) * t, tubular, radial, around, Math.max(len / grain, 0.3));
  paint(g, (p, n, c) => c.setRGB(k, k * 0.98, k * 0.94));
  return g;
}

// A leaf card on one atlas cell: its stalk end at `at`, running out along `dir`, its face
// turned toward `up`, drooping by `bend` at the tip and cupped across.
function card(cell: Cell, size: number, at: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, bend = 0.2, cup = 0.12, segs = 3, across = 2): Geo {
  const L = size, W = size * cell.aspect;
  const g = new THREE.PlaneGeometry(W, L, across, segs);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + L / 2, t = y / L;
    p.setXYZ(i, x, y, -bend * L * t * t + (cup * x * x) / Math.max(W, 1e-3));
    uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
  }
  const Y = _a.copy(dir).normalize();
  const Z = _b.copy(up).addScaledVector(Y, -up.dot(Y));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(at));
  return prep(g);
}

// Where a tree holds its leaves.
interface Tip { at: THREE.Vector3; dir: THREE.Vector3 }

interface Habit {
  /** how many times a limb forks before it ends in leaves */
  levels: number;
  /** shoots per fork */
  forks: [number, number];
  /** the angle a shoot leaves its parent at */
  spread: [number, number];
  /** a shoot's length as a share of its parent's */
  shrink: [number, number];
  /** how hard a limb turns toward the sky along its length */
  lift: number;
  /** 0..1: how far the shoots are pressed into a flat layer (umbrella crowns) */
  flat: number;
  /** the chance of a side shoot from the middle of a limb */
  side: number;
  /** limbs thinner than this are left off the distant copy */
  farMin: number;
}

// Grow a limb from `start` along `dir`, and everything that forks from it.
function grow(r: Rand, N: Build, F: Build, start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, level: number, h: Habit, tips: Tip[]) {
  const d1 = dir.clone().add(V(0, h.lift, 0)).normalize();
  // any vector square to the limb, to kink it and to fan its shoots around
  const ax = Math.abs(d1.y) < 0.9 ? V(0, 1, 0).cross(d1).normalize() : V(1, 0, 0).cross(d1).normalize();
  const bx = V().crossVectors(d1, ax);
  const kink = range(r, -0.09, 0.09) * len, kink2 = range(r, -0.09, 0.09) * len;
  const mid = start.clone().addScaledVector(dir, len * 0.5).addScaledVector(ax, kink).addScaledVector(bx, kink2);
  const end = mid.clone().addScaledVector(d1, len * 0.5);
  const r1 = rad * 0.62;
  N.wood.push(wood([start, mid, end], rad, r1, rad > 0.1 ? 6 : 4, rad > 0.2 ? 8 : rad > 0.06 ? 6 : 5));
  if (rad >= h.farMin) F.wood.push(wood([start, mid, end], rad, r1, level === 0 ? 2 : 1, level === 0 ? 4 : 3));
  if (level >= h.levels) {
    tips.push({ at: end, dir: d1 });
    return;
  }
  const n = irange(r, h.forks[0], h.forks[1]);
  const a0 = r() * TAU;
  const shoot = (az: number, th: number) => {
    const side = ax.clone().multiplyScalar(Math.cos(az)).addScaledVector(bx, Math.sin(az));
    const d = d1.clone().multiplyScalar(Math.cos(th)).addScaledVector(side, Math.sin(th));
    // pressed toward a layer: neither diving nor shooting straight up
    d.y = d.y * (1 - h.flat) + 0.22 * h.flat;
    if (d.y < -0.15) d.y = -0.15;
    return d.normalize();
  };
  const cr = r1 * Math.pow(n, -0.4) * 1.05;
  for (let i = 0; i < n; i++) {
    const d = shoot(a0 + (i / n) * TAU + range(r, -0.45, 0.45), range(r, h.spread[0], h.spread[1]));
    grow(r, N, F, end, d, len * range(r, h.shrink[0], h.shrink[1]), cr, level + 1, h, tips);
  }
  if (r() < h.side) {
    const d = shoot(r() * TAU, range(r, h.spread[1], h.spread[1] + 0.35));
    grow(r, N, F, mid, d, len * range(r, 0.45, 0.6), cr * 0.8, Math.max(level + 1, h.levels - 1), h, tips);
  }
}

interface PadSpec {
  cells: Cell[];
  /** denser cells for the distant copy's standing cards (default: the same) */
  farCells?: Cell[];
  size: [number, number];
  /** cards fanned around each shoot */
  n: [number, number];
  /** how far the cards tip up out of the layer, radians */
  tilt: [number, number];
  /** the chance of an upright card through the middle (so a pad has some depth from the side) */
  upright: number;
  /** every nth shoot keeps its leaves on the distant copy, the cards this much bigger */
  farEvery: number;
  farGrow: number;
  /** a tint over the whole crown */
  tint?: [number, number, number];
}

// The leaves at the end of one shoot: cards fanned around it like spokes, faces to the sky,
// each at its own height and tilt so the pad is a loose mound and not a plate, and a card or
// two standing through the middle so it has depth seen from the side. The distant copy keeps
// one spoke and two standing cards crossed, bigger, at every other shoot: from far off the
// view is level, where a spoke is a line and only the standing cards have any body.
function pad(r: Rand, N: Build, F: Build, tip: Tip, i: number, s: PadSpec) {
  const n = irange(r, s.n[0], s.n[1]);
  const a0 = r() * TAU;
  const t0 = s.tint ?? [1, 1, 1];
  const tint = [range(r, 0.88, 1.04) * t0[0], range(r, 0.94, 1.05) * t0[1], range(r, 0.78, 1.0) * t0[2]];
  const far = i % s.farEvery === 0;
  const farCells = s.farCells ?? s.cells;
  for (let k = 0; k < n; k++) {
    const az = a0 + (k / n) * TAU + range(r, -0.3, 0.3);
    const el = range(r, s.tilt[0], s.tilt[1]);
    const d = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).lerp(tip.dir, 0.25).normalize();
    const up = V(range(r, -0.4, 0.4), 1, range(r, -0.4, 0.4)).normalize();
    const size = range(r, s.size[0], s.size[1]);
    const at = tip.at.clone().addScaledVector(d, -size * 0.1).add(V(0, range(r, -0.16, 0.16) * size, 0));
    const c = s.cells[Math.floor(r() * s.cells.length)];
    const bend = range(r, 0.12, 0.32);
    N.cards.push({ g: card(c, size, at, d, up, bend, 0.14), tint });
    if (far && k < 1) {
      // the distant spokes stand steeper: seen from far off and level, a flat card is a line
      const fd = V(d.x, Math.max(d.y, 0.3) + 0.25, d.z).normalize();
      F.cards.push({ g: card(c, size * s.farGrow, tip.at.clone().addScaledVector(fd, -size * s.farGrow * 0.3), fd, up, bend, 0, 2, 1), tint });
    }
  }
  const stand = (B: Build, cells: Cell[], az: number, size: number, segs: number, across: number) => {
    // the card stands on the shoot, leaning a little, its face turned sideways
    const d = V(Math.cos(az) * 0.4, 1, Math.sin(az) * 0.4).normalize();
    const face = V(-Math.sin(az), 0.2, Math.cos(az));
    const c = cells[Math.floor(r() * cells.length)];
    B.cards.push({ g: card(c, size, tip.at.clone().addScaledVector(d, -size * 0.35), d, face, 0.12, across > 1 ? 0.1 : 0, segs, across), tint });
  };
  const az = r() * TAU, size = range(r, s.size[0], s.size[1]) * 0.95;
  if (r() < s.upright) stand(N, s.cells, az, size, 3, 2);
  else r();
  if (r() < s.upright * 0.6) stand(N, s.cells, az + Math.PI / 2 + range(r, -0.4, 0.4), size * 0.9, 3, 2);
  else r();
  if (far) {
    stand(F, farCells, az, size * s.farGrow * 0.9, 1, 1);
    stand(F, farCells, az + Math.PI / 2, size * s.farGrow * 0.85, 1, 1);
  } else {
    r();
    r();
  }
}

// Shade and light the waiting cards now the crown's extent is known: dark inside and below,
// bright on top and at the rim, their normals swept away from the crown's heart so the whole
// crown shades as one rounded mass.
function finishCards(B: Build, tips: Tip[], margin: number) {
  let y0 = Infinity, y1 = -Infinity, cx = 0, cz = 0;
  for (const t of tips) {
    y0 = Math.min(y0, t.at.y);
    y1 = Math.max(y1, t.at.y);
    cx += t.at.x;
    cz += t.at.z;
  }
  cx /= tips.length;
  cz /= tips.length;
  let rad = 1;
  for (const t of tips) rad = Math.max(rad, Math.hypot(t.at.x - cx, t.at.z - cz));
  rad += margin;
  y0 -= margin * 0.6;
  y1 += margin * 0.5;
  const span = Math.max(y1 - y0, 1);
  const heart = V(cx, y0 + span * 0.25, cz);
  for (const { g, tint } of B.cards) {
    const p = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i).sub(heart);
      _n.y *= 1.3;
      _n.normalize();
      _n.y += 0.5;
      _n.normalize();
      nrm.setXYZ(i, _n.x, _n.y, _n.z);
    }
    paint(g, (q, nn, col) => {
      const hgt = clamp((q.y - y0) / span, 0, 1);
      const out = clamp(Math.hypot(q.x - cx, q.z - cz) / rad, 0, 1);
      const s = 0.36 + 0.5 * hgt + 0.2 * out * out;
      col.setRGB(s * tint[0], s * tint[1], s * tint[2]);
    });
    B.leaf.push(g);
  }
  B.cards.length = 0;
  return { x: cx, z: cz, r: rad, top: y1, bottom: y0 };
}

// Several copies of a vine cell stacked into one long strip hanging from `top`.
function hangingVine(cell: Cell, top: THREE.Vector3, length: number, width: number, r: Rand, segs: number, sway = 0.3): Geo[] {
  const seg = width / cell.aspect;
  const n = Math.max(1, Math.round(length / seg));
  const parts: Geo[] = [];
  const yaw = r() * TAU;
  for (let i = 0; i < n; i++) {
    const turn = yaw + (r() - 0.5) * 0.4;
    const g = leafBlade(cell, { length: seg * 1.02, segs, across: 1, elev: -Math.PI / 2 + 0.02, droop: 0, fold: 0.05, upBias: 0.2 });
    transform(g, { rotation: { y: turn }, position: V(top.x + Math.sin(i * 1.3) * sway * (i / n), top.y - i * seg, top.z + Math.cos(i * 1.7) * sway * (i / n)) });
    parts.push(g);
  }
  return parts;
}

// An epiphyte: a top-down rosette cut-out on a cupped disc.
function rosette(r: Rand, cell: Cell, at: THREE.Vector3, size: number): Geo {
  const g = rosetteDisc(cell, { radius: size, rings: 3, segs: 10, rise: 0.75, droop: 0.75, spin: r() * TAU });
  transform(g, { rotation: { y: r() * TAU }, position: at });
  paint(g, (p, n, c) => {
    const k = 0.45 + 0.55 * smoothstep(0, 0.6, Math.hypot(p.x - at.x, p.z - at.z) / size);
    c.setRGB(k, k, k);
  });
  return g;
}

// A buttress for the distant copy: a wedge of two faces from the trunk out to a point.
function fin(angle: number, r0: number, length: number, height: number, thick: number): Geo {
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (d: number, y: number, w: number) => [c * d - s * w, y, s * d + c * w];
  const top = at(r0 * 0.6, height, 0), l = at(r0 * 0.7, -1, thick * 1.6), rr = at(r0 * 0.7, -1, -thick * 1.6), tip = at(r0 + length, -0.6, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...top, ...tip, ...l, ...top, ...rr, ...tip], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, height * 0.55, length * 0.55, 0, 0, 0, 0, height * 0.55, 0, 0, length * 0.55, 0], 2));
  g.computeVertexNormals();
  const out = prep(g);
  paint(out, (p, n, col) => {
    const ao = 0.4 + 0.6 * smoothstep(-0.4, 2.5, p.y);
    col.setRGB(ao, ao * 0.97, ao * 0.92);
  });
  return out;
}

function model(N: Build, F: Build, rest: Omit<TreeModel, 'geometry' | 'lod'>): TreeModel {
  const slots = (B: Build) => [B.wood, B.leaf, B.extra].filter((s) => s.length);
  return { geometry: mergeSlots(slots(N)), lod: mergeSlots(slots(F)), ...rest };
}

// ------------------------------------------------------------------ the giants

// Rainforest giants, in three habits so the skyline is not one tree repeated:
//   0 the emergent: a clean grey column to a whorl of great level limbs and a flat-topped
//     umbrella of leaves above everything else
//   1 the dome: the trunk parts two thirds of the way up into rising leaders under a deep,
//     rounded crown
//   2 the old one: leaning, grown into a gap, heavy on one side, a low limb and a dead stub
// All stand on plank buttresses with surface roots between them, carry climbers up the bole,
// bromeliads on the limbs, and trail lianas and curtains of vine.
export function giant(seed: number, habit: number, cell: CellFn): TreeModel {
  const r = mulberry32(seed);
  const nz = createNoise2D(seed);
  const N = new Build(), F = new Build();
  const emergent = habit === 0, old = habit === 2;
  const H = emergent ? range(r, 25, 30) : range(r, 20, 25);
  const leanBy = old ? range(r, 2.2, 3.6) : range(r, 0.3, 1.5), leanA = r() * TAU;
  const lean = V(Math.cos(leanA) * leanBy, 0, Math.sin(leanA) * leanBy);
  const rb = emergent ? range(r, 0.9, 1.15) : range(r, 0.78, 1.0);
  // the bole ends where the crown takes over
  const Ht = emergent ? H : H * range(r, 0.6, 0.68);
  const pts = [
    V(0, -1.5, 0),
    V(lean.x * 0.08 + range(r, -0.3, 0.3), Ht * 0.3, lean.z * 0.08 + range(r, -0.3, 0.3)),
    V(lean.x * 0.45 + range(r, -0.5, 0.5), Ht * 0.66, lean.z * 0.45 + range(r, -0.5, 0.5)),
    V(lean.x, Ht, lean.z),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const thin = emergent ? 0.62 : 0.45;
  const radius = (t: number) => rb * (1 - thin * t) + rb * 0.9 * Math.exp(-t * 14);
  const uRep = Math.max(2, Math.round((TAU * rb) / 1.8));
  const trunk = taperedTube(pts, radius, 28, 18, uRep, (Ht + 1.5) / 1.8);
  // knobbly and irregular: no bole is a lathe-turned column
  {
    const p = trunk.attributes.position, c = V(), q = V();
    for (let i = 0; i < p.count; i++) {
      q.fromBufferAttribute(p, i);
      curve.getPointAt(clamp((q.y + 1.5) / (Ht + 1.5), 0, 1), c);
      const dx = q.x - c.x, dz = q.z - c.z, a = Math.atan2(dz, dx);
      const k = nz(q.y * 0.22, Math.cos(a) * 1.3 + Math.sin(a) * 0.7) * 0.09 + nz(q.y * 0.9, a * 2.1) * 0.03;
      const s = 1 + k * (1 + 1.5 * Math.exp(-(q.y + 1.5) * 0.5));
      p.setXYZ(i, c.x + dx * s, q.y, c.z + dz * s);
    }
    trunk.computeVertexNormals();
  }
  const boleShade = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    const ao = 0.5 + 0.5 * smoothstep(-1, 4, p.y);
    c.setRGB(ao, ao * 0.98, ao * 0.95);
  };
  paint(trunk, boleShade);
  N.wood.push(trunk);
  F.wood.push(paint(taperedTube(pts, radius, 7, 6, uRep, (Ht + 1.5) / 1.8), boleShade));

  // plank buttresses, the signature of rainforest giants
  const nr = irange(r, 5, 7);
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU + range(r, -0.3, 0.3);
    const length = range(r, 2.2, 4.0), height = range(r, 2.4, 4.6), thick = range(r, 0.28, 0.4);
    const g = plankRoot({ angle: a, r0: rb, length, height, thick, wiggle: range(r, -0.5, 0.5), segs: 18, uvScale: 0.55, seed: range(r, 0, 10) });
    paint(g, (p, n, c) => {
      const ao = 0.38 + 0.62 * smoothstep(-0.4, 2.5, p.y);
      c.setRGB(ao, ao * 0.97, ao * 0.92);
    });
    N.wood.push(g);
    F.wood.push(fin(a, rb, length, height, thick));
  }
  // surface roots snaking away between the buttresses, half buried
  const ns = irange(r, 4, 7);
  for (let i = 0; i < ns; i++) {
    const a = ((i + 0.5) / ns) * TAU + range(r, -0.4, 0.4);
    const len = range(r, 2.5, 5);
    const rp: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, aa = a + Math.sin(t * 3 + i) * 0.25, d = rb * 0.8 + len * t;
      rp.push(V(Math.cos(aa) * d, 0.06 - t * 0.14 + Math.sin(t * 7 + i * 2) * 0.05, Math.sin(aa) * d));
    }
    const r0 = range(r, 0.13, 0.22);
    const g = taperedTube(rp, (t) => r0 * (1 - 0.75 * t) + 0.03, 12, 7, 1, len / 1.5);
    paint(g, (p, n, c) => {
      const ao = 0.5 + 0.5 * smoothstep(-0.1, 0.25, p.y);
      c.setRGB(ao, ao, ao * 0.95);
    });
    N.wood.push(g);
  }

  // the limbs
  const top = pts[3];
  const tips: Tip[] = [];
  const perches: THREE.Vector3[] = [];
  const outward = (a: number, el: number) => V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
  if (emergent) {
    const h: Habit = { levels: 2, forks: [2, 3], spread: [0.4, 0.78], shrink: [0.55, 0.7], lift: 0.2, flat: 0.38, side: 0.45, farMin: 0.09 };
    const nl = irange(r, 6, 8);
    const a0 = r() * TAU;
    for (let i = 0; i < nl; i++) {
      const t = 0.74 + 0.22 * (i / (nl - 1)) + range(r, -0.02, 0.02);
      const a = a0 + i * 2.4 + range(r, -0.3, 0.3);
      const S = curve.getPointAt(clamp(t, 0, 1));
      const k = 1.12 - (t - 0.74) * 1.5;
      const len = range(r, 5.5, 7.5) * k;
      grow(r, N, F, S, outward(a, range(r, 0.1, 0.32) + (t - 0.74) * 1.4), len, 0.36 * k + 0.04, 0, h, tips);
      perches.push(S.clone().add(outward(a, 0.2).multiplyScalar(len * range(r, 0.2, 0.45))).add(V(0, 0.25, 0)));
    }
    grow(r, N, F, top.clone().add(V(0, -0.3, 0)), V(range(r, -0.2, 0.2), 1, range(r, -0.2, 0.2)).normalize(), 2.2, 0.26, 1, { ...h, spread: [0.8, 1.2] }, tips);
  } else {
    const h: Habit = { levels: 3, forks: [2, 3], spread: [0.38, 0.72], shrink: [0.6, 0.74], lift: 0.22, flat: 0.12, side: 0.45, farMin: 0.1 };
    const nl = old ? 3 : irange(r, 3, 4);
    const a0 = r() * TAU;
    for (let i = 0; i < nl; i++) {
      // the old one throws its leaders out over the side it leans to
      const a = old ? leanA + range(r, -1.2, 1.2) : a0 + (i / nl) * TAU + range(r, -0.35, 0.35);
      const S = top.clone().add(V(0, -range(r, 0.2, 1.4), 0));
      const el = range(r, 0.55, 1.0);
      grow(r, N, F, S, outward(a, el), range(r, 4.6, 6.2), rb * 0.4, 0, h, tips);
      perches.push(S.clone().add(outward(a, el).multiplyScalar(range(r, 1.5, 3))).add(V(0, 0.3, 0)));
    }
    // a leader straight on up through the middle
    grow(r, N, F, top.clone().add(V(0, -0.4, 0)), V(range(r, -0.25, 0.25), 1, range(r, -0.25, 0.25)).normalize(), range(r, 3.6, 4.6), rb * 0.36, 1, h, tips);
    // old growth keeps a limb or two well under the crown
    const nlow = old ? 2 : r() < 0.6 ? 1 : 0;
    for (let i = 0; i < nlow; i++) {
      const S = curve.getPointAt(range(r, 0.55, 0.8));
      const a = old ? leanA + Math.PI + range(r, -0.9, 0.9) : r() * TAU;
      grow(r, N, F, S, outward(a, range(r, 0.2, 0.5)), range(r, 3.2, 4.6), 0.2, 2, { ...h, flat: 0.5 }, tips);
    }
    if (old) {
      // a limb that broke off long ago: a short dead stub
      const S = curve.getPointAt(range(r, 0.45, 0.6)), a = r() * TAU;
      const E = S.clone().add(outward(a, 0.35).multiplyScalar(range(r, 1.2, 2.0)));
      N.wood.push(wood([S, S.clone().lerp(E, 0.5).add(V(0, 0.1, 0)), E], 0.24, 0.16, 4, 7, 0.7));
    }
  }

  // the leaves
  const boughs = ['bough0', 'bough1', 'bough2'].map((n) => cell('boughs', n));
  const clumps = ['clump0', 'clump1', 'spray0'].map((n) => cell('boughs', n));
  const spec: PadSpec = emergent
    ? { cells: boughs, farCells: clumps, size: [2.5, 3.5], n: [4, 5], tilt: [-0.15, 0.6], upright: 0.8, farEvery: 2, farGrow: 1.8 }
    : { cells: boughs, farCells: clumps, size: [2.4, 3.3], n: [3, 5], tilt: [-0.25, 0.75], upright: 0.9, farEvery: 2, farGrow: 1.8 };
  tips.forEach((t, i) => pad(r, N, F, t, i, spec));
  const crown = finishCards(N, tips, 2.6);
  finishCards(F, tips, 2.6);

  // climbers: strips of vine spiralling up the bole, flat against the bark, starting between
  // two buttresses
  const vine = cell('boughs', 'vine0');
  const ncl = r() < 0.8 ? irange(r, 1, 2) : 0;
  for (let i = 0; i < ncl; i++) {
    const a0 = ((Math.floor(r() * nr) + 0.5) / nr) * TAU;
    const turns = range(r, 0.15, 0.55) * (r() < 0.5 ? -1 : 1);
    const w = range(r, 0.5, 0.7), seg = w / vine.aspect;
    const y0 = 0.1, y1 = Ht * range(r, 0.5, 0.9);
    const n = Math.max(2, Math.round((y1 - y0) / seg));
    for (let k = 0; k < n; k++) {
      const y = y0 + k * seg;
      const t = clamp((y + 1.5) / (Ht + 1.5), 0, 1);
      const c = curve.getPointAt(t);
      const ang = a0 + turns * TAU * (k / n) + range(r, -0.08, 0.08);
      const rr = radius(t) * (1.14 + 0.15 * Math.exp(-(y + 1.5) * 0.5)) + 0.06;
      for (const [B, segs] of [[N, 2], [F, 1]] as const) {
        const g = leafBlade(vine, { length: seg * 1.04, segs, across: 1, elev: Math.PI / 2 - 0.03, droop: 0, fold: 0.12, upBias: 0.15 });
        transform(g, { rotation: { y: -ang }, position: V(c.x + Math.cos(ang) * rr, y, c.z + Math.sin(ang) * rr) });
        paint(g, (p, nn, col) => {
          const s = 0.5 + 0.35 * smoothstep(0, Ht * 0.6, p.y);
          col.setRGB(s * 0.95, s, s * 0.88);
        });
        B.leaf.push(g);
      }
    }
  }
  // epiphytes: bromeliads riding on the limbs
  const brom = cell('boughs', 'brom0');
  const ne = irange(r, 2, 5);
  for (let i = 0; i < ne; i++) N.leaf.push(rosette(r, brom, perches[Math.floor(r() * perches.length)].clone().add(V(range(r, -0.3, 0.3), 0, range(r, -0.3, 0.3))), range(r, 0.5, 0.9)));
  // lianas looping down to the ground
  const nl = irange(r, 2, 4);
  for (let i = 0; i < nl; i++) {
    const A = tips[Math.floor(r() * tips.length)].at.clone().add(V(0, -0.6, 0));
    const ang = r() * TAU, gd = range(r, 2.5, 6);
    const G = V(Math.cos(ang) * gd, -0.3, Math.sin(ang) * gd);
    const m1 = A.clone().lerp(G, 0.35).add(V(range(r, -1.5, 1.5), -range(r, 0.5, 2), range(r, -1.5, 1.5)));
    const m2 = A.clone().lerp(G, 0.7).add(V(range(r, -1.5, 1.5), -range(r, 0.5, 1.5), range(r, -1.5, 1.5)));
    const rad = range(r, 0.06, 0.12);
    N.wood.push(paint(taperedTube([A, m1, m2, G], (t) => rad * (1 - 0.3 * t), 24, 6, 1, 8), (p, n, c) => c.setRGB(0.55, 0.55, 0.45)));
    F.wood.push(paint(taperedTube([A, m1, m2, G], (t) => rad * 1.3 * (1 - 0.3 * t), 6, 3, 1, 8), (p, n, c) => c.setRGB(0.55, 0.55, 0.45)));
  }
  // curtains of hanging vine under the crown
  const nh = irange(r, 4, 9);
  for (let i = 0; i < nh; i++) {
    const tip = tips[Math.floor(r() * tips.length)];
    const A = tip.at.clone().add(V(range(r, -1, 1), -0.5, range(r, -1, 1)));
    const length = range(r, 3, 11), width = range(r, 0.45, 0.7), s0 = mulberry32(seed * 31 + i);
    for (const [B, segs] of [[N, 3], [F, 1]] as const) {
      // (both copies from the same roll, so the strip hangs in the same place)
      const rr = B === N ? s0 : mulberry32(seed * 31 + i);
      for (const g of hangingVine(vine, A, length, width, rr, segs)) {
        paint(g, (p, n, c) => {
          const s = 0.55 + 0.35 * smoothstep(crown.bottom - 8, crown.bottom + 2, p.y);
          c.setRGB(s, s, s * 0.9);
        });
        B.leaf.push(g);
      }
    }
  }
  return model(N, F, {
    colliders: [{ x: 0, z: 0, r: rb * 1.2 }], canopy: 9,
    crown: { r: crown.r, top: crown.top, x: crown.x, z: crown.z },
  });
}

// ------------------------------------------------------------------ the understory

// Young and small trees under the giants, in three habits:
//   0 the layered one: a straight pole holding its leaves in two or three loose storeys
//   1 the coppice: two or three crooked stems from one foot under a loose rounded crown
//   2 the pole: a thin leaning stem with one tuft of crown at the top, reaching for a gap
export function understory(seed: number, habit: number, cell: CellFn): TreeModel {
  const r = mulberry32(seed);
  const nz = createNoise2D(seed + 7);
  const N = new Build(), F = new Build();
  const H = habit === 2 ? range(r, 9, 13) : range(r, 6.5, 10.5);
  const lx = range(r, -0.8, 0.8) * (habit === 2 ? 2 : 1), lz = range(r, -0.8, 0.8) * (habit === 2 ? 2 : 1);
  const tips: Tip[] = [];
  const outward = (a: number, el: number) => V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
  const stem = (pts: THREE.Vector3[], r0: number, r1: number, flare: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const y0 = pts[0].y, y1 = pts[pts.length - 1].y;
    const rf = (t: number) => r0 + (r1 - r0) * t + flare * Math.exp(-t * 10);
    const g = taperedTube(pts, rf, 20, 10, 1, (y1 - y0) / 1.8);
    // lumps and knots up the stem, fluting toward the foot
    const p = g.attributes.position, c = V(), q = V();
    for (let i = 0; i < p.count; i++) {
      q.fromBufferAttribute(p, i);
      curve.getPointAt(clamp((q.y - y0) / (y1 - y0), 0, 1), c);
      const dx = q.x - c.x, dz = q.z - c.z, a = Math.atan2(dz, dx);
      const foot = Math.exp(-(q.y - y0) * 0.7);
      const k = nz(q.y * 0.3, Math.cos(a) * 1.4 + Math.sin(a) * 0.8) * 0.12 + nz(q.y * 1.7, a * 2.3 + 5) * 0.04
        + (Math.abs(Math.sin(a * 2.5 + nz(q.y * 0.15, 9) * 2)) - 0.5) * 0.19 * foot;
      p.setXYZ(i, c.x + dx * (1 + k), q.y, c.z + dz * (1 + k));
    }
    g.computeVertexNormals();
    const shade = (q2: THREE.Vector3, n: THREE.Vector3, col: THREE.Color) => {
      const ao = 0.55 + 0.45 * smoothstep(y0, y0 + 3.5, q2.y);
      col.setRGB(ao * 0.95, ao, ao * 0.9);
    };
    N.wood.push(paint(g, shade));
    F.wood.push(paint(taperedTube(pts, (t) => rf(t) * 1.1, 4, 4, 1, (y1 - y0) / 1.8), shade));
    return curve;
  };
  if (habit === 0) {
    const pts = [V(0, -0.5, 0), V(lx * 0.3 + range(r, -0.15, 0.15), H * 0.45, lz * 0.3 + range(r, -0.15, 0.15)), V(lx, H, lz)];
    const curve = stem(pts, 0.19, 0.05, 0.13);
    const h: Habit = { levels: 1, forks: [2, 3], spread: [0.45, 0.8], shrink: [0.55, 0.72], lift: 0.14, flat: 0.5, side: 0.4, farMin: 0.045 };
    const tiers = irange(r, 2, 3);
    let a0 = r() * TAU;
    for (let i = 0; i < tiers; i++) {
      const t = 0.5 + 0.42 * (i / Math.max(tiers - 1, 1)) + range(r, -0.04, 0.04);
      const nb = irange(r, 2, 4);
      a0 += 1.1 + r();
      for (let b = 0; b < nb; b++) {
        const a = a0 + (b / nb) * TAU + range(r, -0.5, 0.5);
        const S = curve.getPointAt(clamp(t + range(r, -0.06, 0.06), 0, 0.97));
        grow(r, N, F, S, outward(a, range(r, 0.1, 0.5)), range(r, 1.3, 2.3) * (1.15 - 0.5 * (i / tiers)), 0.065, 0, h, tips);
      }
    }
    tips.push({ at: pts[2].clone(), dir: V(0, 1, 0) });
  } else if (habit === 1) {
    const h: Habit = { levels: 2, forks: [2, 3], spread: [0.45, 0.85], shrink: [0.6, 0.75], lift: 0.3, flat: 0.1, side: 0.4, farMin: 0.05 };
    const stems = irange(r, 2, 3);
    const a0 = r() * TAU;
    for (let i = 0; i < stems; i++) {
      const a = a0 + (i / stems) * TAU + range(r, -0.4, 0.4);
      const out = range(r, 0.9, 1.9), hh = H * range(r, 0.55, 0.72);
      const pts = [
        V(Math.cos(a) * 0.08, -0.5, Math.sin(a) * 0.08),
        V(Math.cos(a) * out * 0.35 + range(r, -0.2, 0.2), hh * 0.45, Math.sin(a) * out * 0.35 + range(r, -0.2, 0.2)),
        V(Math.cos(a) * out, hh, Math.sin(a) * out),
      ];
      stem(pts, 0.14, 0.07, 0.1);
      const d = pts[2].clone().sub(pts[1]).normalize();
      grow(r, N, F, pts[2], d, range(r, 1.3, 1.9), 0.07, 0, h, tips);
    }
  } else {
    const pts = [V(0, -0.5, 0), V(lx * 0.2 + range(r, -0.25, 0.25), H * 0.4, lz * 0.2 + range(r, -0.25, 0.25)), V(lx * 0.65, H * 0.78, lz * 0.65), V(lx, H, lz)];
    const curve = stem(pts, 0.17, 0.05, 0.12);
    const h: Habit = { levels: 1, forks: [2, 3], spread: [0.5, 0.9], shrink: [0.6, 0.75], lift: 0.25, flat: 0.25, side: 0.3, farMin: 0.045 };
    const nb = irange(r, 4, 6);
    const a0 = r() * TAU;
    for (let b = 0; b < nb; b++) {
      const S = curve.getPointAt(range(r, 0.72, 0.97));
      grow(r, N, F, S, outward(a0 + b * 2.4 + range(r, -0.3, 0.3), range(r, 0.25, 0.75)), range(r, 1.2, 2.0), 0.06, 0, h, tips);
    }
    tips.push({ at: pts[3].clone(), dir: V(0, 1, 0) });
  }
  const sprays = ['twigs0', 'twigs1'].map((n) => cell('under', n));
  const spec: PadSpec = habit === 0
    ? { cells: sprays, size: [1.25, 1.75], n: [3, 4], tilt: [-0.15, 0.45], upright: 0.6, farEvery: 2, farGrow: 1.6, tint: [0.96, 1.06, 0.8] }
    : { cells: sprays, size: [1.2, 1.7], n: [3, 4], tilt: [-0.2, 0.65], upright: 0.85, farEvery: 2, farGrow: 1.6, tint: [0.96, 1.06, 0.8] };
  tips.forEach((t, i) => pad(r, N, F, t, i, spec));
  const crown = finishCards(N, tips, 1.3);
  finishCards(F, tips, 1.3);
  return model(N, F, {
    colliders: [{ x: 0, z: 0, r: habit === 1 ? 0.4 : 0.3 }], canopy: 2.5,
    crown: { r: crown.r, top: crown.top, x: crown.x, z: crown.z },
  });
}

// The umbrella tree of the middle layer (a cecropia): a thin, pale, ringed trunk, a few
// candelabra arms sweeping out and up, and at the end of each a whorl of great hand-shaped
// leaves on long stalks. Nothing else in the forest has its outline.
export function umbrella(seed: number, cell: CellFn): TreeModel {
  const r = mulberry32(seed);
  const N = new Build(), F = new Build();
  const H = range(r, 11, 16.5);
  const lx = range(r, -1.2, 1.2), lz = range(r, -1.2, 1.2);
  const pts = [V(0, -0.5, 0), V(lx * 0.2 + range(r, -0.3, 0.3), H * 0.4, lz * 0.2 + range(r, -0.3, 0.3)), V(lx * 0.6, H * 0.75, lz * 0.6), V(lx, H, lz)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const rf = (t: number) => 0.2 * (1 - 0.55 * t) + 0.12 * Math.exp(-t * 10);
  const pale = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    const ao = 0.75 + 0.45 * smoothstep(-0.5, 4, p.y);
    c.setRGB(ao * 1.0, ao * 1.02, ao * 0.95);
  };
  N.wood.push(paint(taperedTube(pts, rf, 24, 10, 1, H / 0.9), pale));
  F.wood.push(paint(taperedTube(pts, (t) => rf(t) * 1.1, 4, 4, 1, H / 0.9), pale));
  const tips: Tip[] = [{ at: pts[3].clone(), dir: V(0, 1, 0) }];
  const arms = irange(r, 2, 4);
  const a0 = r() * TAU;
  for (let i = 0; i < arms; i++) {
    const a = a0 + i * 2.2 + range(r, -0.4, 0.4);
    const S = curve.getPointAt(range(r, 0.58, 0.88));
    const L = range(r, 2.0, 3.6);
    const o = V(Math.cos(a), 0, Math.sin(a));
    const M = S.clone().addScaledVector(o, L * 0.6).add(V(0, L * 0.12, 0));
    const E = S.clone().addScaledVector(o, L * 0.9).add(V(0, L * 0.75, 0));
    N.wood.push(paint(taperedTube([S, M, E], (t) => 0.085 * (1 - 0.4 * t), 8, 6, 1, L / 0.9), pale));
    F.wood.push(paint(taperedTube([S, M, E], (t) => 0.1 * (1 - 0.4 * t), 3, 3, 1, L / 0.9), pale));
    tips.push({ at: E, dir: E.clone().sub(M).normalize() });
    // some arms fork once more
    if (r() < 0.45) {
      const b = a + (r() < 0.5 ? -1 : 1) * range(r, 0.7, 1.2), L2 = L * range(r, 0.45, 0.65);
      const o2 = V(Math.cos(b), 0, Math.sin(b));
      const M2 = M.clone().addScaledVector(o2, L2 * 0.55).add(V(0, L2 * 0.2, 0));
      const E2 = M.clone().addScaledVector(o2, L2 * 0.8).add(V(0, L2 * 0.8, 0));
      N.wood.push(paint(taperedTube([M, M2, E2], (t) => 0.06 * (1 - 0.35 * t), 6, 5, 1, L2 / 0.9), pale));
      F.wood.push(paint(taperedTube([M, M2, E2], (t) => 0.075 * (1 - 0.35 * t), 2, 3, 1, L2 / 0.9), pale));
      tips.push({ at: E2, dir: E2.clone().sub(M2).normalize() });
    }
  }
  // the whorls: young leaves stand up in the middle, the oldest hang below
  const hand = cell('under', 'seed0');
  const up = V(0, 1, 0), q = new THREE.Quaternion();
  let top = 0, rad = 0;
  tips.forEach((tip, ti) => {
    const n = irange(r, 8, 11);
    const a1 = r() * TAU;
    const tint = range(r, 0.85, 1.05);
    for (let k = 0; k < n; k++) {
      const age = k / (n - 1); // 0 the newest
      const az = a1 + k * 2.4 + range(r, -0.2, 0.2);
      const el = 1.15 - 1.5 * age + range(r, -0.12, 0.12);
      const d = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const stalk = range(r, 0.55, 0.95) * (0.6 + 0.4 * age);
      const at = tip.at.clone().addScaledVector(d, stalk);
      const size = range(r, 0.6, 0.85) * (0.55 + 0.45 * Math.min(1, age * 2.5));
      // the blade faces the sky, tipped a little out along its stalk
      const axis = V(d.x * 0.45, 1, d.z * 0.45).normalize();
      q.setFromUnitVectors(up, axis);
      const k0 = (0.62 + 0.4 * (1 - age)) * tint;
      const shade = (p: THREE.Vector3, nn: THREE.Vector3, c: THREE.Color) => {
        const rr = Math.hypot(p.x - at.x, p.z - at.z) / size;
        const s = k0 * (0.7 + 0.3 * smoothstep(0, 0.7, rr));
        c.setRGB(s * 0.98, s, s * 0.9);
      };
      const g = rosetteDisc(hand, { radius: size, rings: 2, segs: 8, rise: 0.22, droop: 0.75, spin: r() * TAU, upBias: 0.6 });
      g.applyQuaternion(q);
      g.translate(at.x, at.y, at.z);
      N.leaf.push(paint(g, shade));
      N.wood.push(paint(taperedTube([tip.at, tip.at.clone().lerp(at, 0.5).add(V(0, 0.06, 0)), at], () => 0.014, 2, 3, 1, 1), (p, nn, c) => c.setRGB(1.6, 2.1, 1.0)));
      if ((k + ti) % 2 === 0) {
        const f = rosetteDisc(hand, { radius: size * 1.35, rings: 1, segs: 6, rise: 0.1, droop: 0.5, spin: r() * TAU, upBias: 0.6 });
        f.applyQuaternion(q);
        f.translate(at.x, at.y, at.z);
        F.leaf.push(paint(f, shade));
      } else r();
      top = Math.max(top, at.y + 0.3);
      rad = Math.max(rad, Math.hypot(at.x - lx, at.z - lz) + size);
    }
  });
  return model(N, F, { colliders: [{ x: 0, z: 0, r: 0.3 }], canopy: 2.5, crown: { r: rad, top, x: lx, z: lz } });
}

// ------------------------------------------------------------------ palms and ferns

// Coconut palm: a ringed, leaning, gently curved trunk under a full head of fronds: the young
// ones standing in the middle, the grown ones arching out and over, the old ones hanging and a
// few dead and brown against the trunk; coconuts under the crown.
export function palm(seed: number, cell: CellFn): TreeModel {
  const r = mulberry32(seed);
  const nz = createNoise2D(seed);
  const N = new Build(), F = new Build();
  const H = range(r, 8, 13);
  const la = r() * TAU, lean = range(r, 1.0, 3.2);
  const L = V(Math.cos(la) * lean, 0, Math.sin(la) * lean);
  const pts = [V(0, -0.5, 0), V(L.x * 0.06, H * 0.33, L.z * 0.06), V(L.x * 0.38, H * 0.66, L.z * 0.38), V(L.x, H, L.z)];
  const rf = (t: number) => 0.23 * (1 - 0.28 * t) + 0.17 * Math.exp(-t * 9) + 0.05 * Math.exp(-(1 - t) * 14);
  const shade = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    const ao = 0.55 + 0.45 * smoothstep(-0.5, 3, p.y);
    c.setRGB(ao, ao, ao * 0.96);
  };
  N.wood.push(paint(taperedTube(pts, rf, 22, 10, 1, H / 1.6), shade));
  F.wood.push(paint(taperedTube(pts, rf, 5, 5, 1, H / 1.6), shade));
  const top = pts[3];
  // the heart the fronds come out of
  const heart = blob(0.34, 1, nz, 0.15, 1.35);
  transform(heart, { position: top.clone().add(V(0, 0.12, 0)) });
  N.wood.push(paint(heart, (p, n, c) => c.setRGB(0.6, 0.55, 0.42)));
  if (r() < 0.8) {
    const nco = irange(r, 3, 7);
    for (let k = 0; k < nco; k++) {
      const a = r() * TAU;
      const g = prep(new THREE.SphereGeometry(0.15, 10, 7));
      g.scale(1, 1.15, 1);
      transform(g, { position: top.clone().add(V(Math.cos(a) * 0.32, -0.28 - r() * 0.15, Math.sin(a) * 0.32)) });
      const green = r() < 0.4;
      N.extra.push(paint(g, (p, n, c) => (green ? c.setRGB(0.32, 0.42, 0.12, SRGB) : c.setRGB(0.42, 0.28, 0.14, SRGB))));
    }
  }
  const fr = ['palm0', 'palm1'].map((n) => cell('fronds', n));
  const nf = irange(r, 17, 22);
  for (let i = 0; i < nf; i++) {
    const yaw = i * 2.4 + range(r, -0.25, 0.25);
    const age = i / (nf - 1); // 0 the newest
    const dead = age > 0.86 && r() < 0.7;
    const opts = {
      length: range(r, 4.4, 5.8) * (0.72 + 0.28 * Math.min(1, age * 3)),
      elev: dead ? range(r, -1.25, -0.8) : 1.3 - 1.65 * age + range(r, -0.12, 0.12),
      droop: dead ? 0.1 : 0.35 + 0.6 * Math.min(1, age * 1.6) + range(r, -0.08, 0.08),
      fold: 0.14, twist: range(r, -0.3, 0.3), upBias: 0.5,
    };
    const t = dead ? [0.85, 0.6, 0.32] : [range(r, 0.9, 1.0), 1, range(r, 0.85, 1.0)];
    const col = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
      const k = dead ? 0.8 : 0.72 + 0.28 * smoothstep(top.y - 3, top.y + 1.5, p.y);
      c.setRGB(t[0] * k, t[1] * k, t[2] * k);
    };
    for (const [B, segs, across] of [[N, 12, 2], [F, 4, 2]] as const) {
      const g = leafBlade(fr[i % 2], { ...opts, segs, across });
      transform(g, { rotation: { y: yaw }, position: top });
      B.leaf.push(paint(g, col));
    }
  }
  return model(N, F, { colliders: [{ x: 0, z: 0, r: 0.36 }], canopy: 3, crown: { r: 4.6, top: H + 2.5, x: L.x, z: L.z } });
}

// Tree fern: a thin, shaggy trunk, thicker toward its top, carrying a parasol of long arching
// fronds; uncurling croziers stand in the middle and last year's fronds hang dead and brown
// down the trunk.
export function treeFern(seed: number, cell: CellFn): TreeModel {
  const r = mulberry32(seed);
  const nz = createNoise2D(seed);
  const N = new Build(), F = new Build();
  const H = range(r, 2.6, 5.2);
  const lx = range(r, -0.4, 0.4), lz = range(r, -0.4, 0.4);
  const pts = [V(0, -0.3, 0), V(lx * 0.3, H * 0.5, lz * 0.3), V(lx, H, lz)];
  // the mantle of old stalk bases makes the top the thickest part
  const rf = (t: number) => 0.13 + 0.07 * Math.exp(-t * 6) + 0.035 * smoothstep(0.6, 1, t);
  const shade = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    const ao = 0.7 + 0.3 * smoothstep(-0.3, 2, p.y);
    c.setRGB(ao * 0.9, ao * 0.82, ao * 0.7);
  };
  N.wood.push(paint(taperedTube(pts, rf, 12, 9, 1, H / 1.2), shade));
  F.wood.push(paint(taperedTube(pts, rf, 3, 4, 1, H / 1.2), shade));
  const top = pts[2];
  // the crown the fronds leave from: a rough knob that closes the trunk's end
  const knob = blob(0.19, 1, nz, 0.22, 0.8);
  transform(knob, { position: top.clone().add(V(0, 0.02, 0)) });
  const knobShade = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => c.setRGB(1.5, 1.05, 0.6);
  N.wood.push(paint(knob, knobShade));
  const cap = prep(new THREE.ConeGeometry(0.17, 0.2, 4, 1));
  transform(cap, { position: top.clone().add(V(0, 0.1, 0)) });
  F.wood.push(paint(cap, knobShade));
  // croziers: young fronds still coiled, standing in the middle
  for (let i = 0; i < irange(r, 1, 3); i++) {
    const a = r() * TAU, h = range(r, 0.35, 0.7), o = 0.07;
    const c0 = top.clone().add(V(Math.cos(a) * o, 0.1, Math.sin(a) * o));
    const hook = [c0, c0.clone().add(V(0, h * 0.6, 0)), c0.clone().add(V(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05)), c0.clone().add(V(Math.cos(a) * 0.14, h * 0.96, Math.sin(a) * 0.14)), c0.clone().add(V(Math.cos(a) * 0.13, h * 0.8, Math.sin(a) * 0.13))];
    N.wood.push(paint(taperedTube(hook, (t) => 0.028 * (1 - 0.4 * t), 10, 5, 1, 1), (p, n, c) => c.setRGB(0.75, 0.62, 0.38)));
  }
  const cells = ['fern0', 'fern1'].map((n) => cell('fronds', n));
  const nf = irange(r, 14, 18);
  for (let i = 0; i < nf; i++) {
    const yaw = i * 2.4 + range(r, -0.2, 0.2);
    const age = i / (nf - 1);
    const dead = age > 0.84;
    const opts = {
      length: range(r, 2.3, 3.3) * (dead ? 0.8 : 1),
      elev: dead ? range(r, -1.35, -1.0) : 1.0 - 0.95 * age + range(r, -0.1, 0.1),
      droop: dead ? 0.05 : range(r, 0.6, 0.95), fold: 0.1, twist: range(r, -0.2, 0.2), upBias: 0.5,
    };
    const s = range(r, 0.85, 1.05);
    const col = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
      if (dead) return c.setRGB(0.62, 0.42, 0.22);
      const k = 0.68 + 0.32 * smoothstep(top.y - 2, top.y + 0.8, p.y);
      return c.setRGB(s * k, s * k, s * k * 0.85);
    };
    for (const [B, segs, across] of [[N, 9, 2], [F, 3, 2]] as const) {
      if (dead && B === F) continue;
      const g = leafBlade(cells[i % 2], { ...opts, segs, across });
      transform(g, { rotation: { y: yaw }, position: top.clone().add(V(0, dead ? -0.15 : 0.05, 0)) });
      B.leaf.push(paint(g, col));
    }
  }
  return model(N, F, { colliders: [{ x: 0, z: 0, r: 0.22 }], canopy: 2, crown: { r: 2.8, top: H + 0.4, x: lx, z: lz } });
}

// ------------------------------------------------------------------ the drowned grove

// Mangrove: a short, crooked trunk held clear of the water on a cage of prop roots that leave
// it in smooth arcs and dive into the pool, the bigger ones forking on the way down, with a few
// thin aerial roots dropping from the limbs, under a dense, dark crown of leathery leaves.
export function mangrove(seed: number, cell: CellFn): TreeModel {
  const r = mulberry32(seed);
  const nz = createNoise2D(seed + 3);
  const N = new Build(), F = new Build();
  const H = range(r, 5.5, 8.5);
  const R0 = range(r, 1.2, 1.7); // where the trunk leaves its roots
  const lx = range(r, -0.7, 0.7), lz = range(r, -0.7, 0.7);
  const pts = [V(0, -0.7, 0), V(lx * 0.05, R0 + (H - R0) * 0.15, lz * 0.05), V(lx * 0.45, R0 + (H - R0) * 0.6, lz * 0.45), V(lx, H * 0.8, lz)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const y0 = pts[0].y, y1 = pts[3].y;
  // (below the point its roots leave from, the trunk runs on down as one more root)
  const tr = (R0 + 0.7) / (y1 - y0);
  const rf = (t: number) => 0.2 * (1 - 0.5 * t) * (0.5 + 0.5 * smoothstep(tr * 0.5, tr * 1.3, t));
  const trunk = taperedTube(pts, rf, 16, 10, 1, (y1 - y0) / 1.6);
  {
    const p = trunk.attributes.position, c = V(), q = V();
    for (let i = 0; i < p.count; i++) {
      q.fromBufferAttribute(p, i);
      curve.getPointAt(clamp((q.y - y0) / (y1 - y0), 0, 1), c);
      const dx = q.x - c.x, dz = q.z - c.z, a = Math.atan2(dz, dx);
      const k = nz(q.y * 0.4, Math.cos(a) * 1.4 + Math.sin(a) * 0.8) * 0.12 + nz(q.y * 1.7, a * 2.3 + 5) * 0.04;
      p.setXYZ(i, c.x + dx * (1 + k), q.y, c.z + dz * (1 + k));
    }
    trunk.computeVertexNormals();
  }
  const dark = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    const ao = 0.6 + 0.4 * smoothstep(R0, H, p.y);
    c.setRGB(ao * 0.8, ao * 0.78, ao * 0.72);
  };
  N.wood.push(paint(trunk, dark));
  F.wood.push(paint(taperedTube(pts, (t) => rf(t) * 1.1, 4, 4, 1, (y1 - y0) / 1.6), dark));
  // dark and slick below the waterline
  const wet = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    const k = 0.42 + 0.58 * smoothstep(-0.1, 0.4, p.y);
    c.setRGB(k * 0.75, k * 0.72, k * 0.66);
  };
  const arc = (from: THREE.Vector3, a: number, out: number, rise: number) => {
    const o = V(Math.cos(a), 0, Math.sin(a)), path: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, q = (u * Math.PI) / 2;
      path.push(from.clone().addScaledVector(o, out * Math.sin(q)).setY(-0.6 + (from.y + 0.6) * Math.cos(q) + rise * Math.sin(u * Math.PI) * (1 - u) * 2));
    }
    return path;
  };
  const nr = irange(r, 9, 13);
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU + range(r, -0.25, 0.25);
    const from = V(Math.cos(a) * 0.08, R0 + range(r, -0.5, 0.9), Math.sin(a) * 0.08);
    const out = range(r, 1.1, 2.3) * (0.7 + 0.3 * (from.y / R0));
    const path = arc(from, a, out, range(r, 0.05, 0.3));
    const w = range(r, 0.055, 0.085);
    N.wood.push(paint(taperedTube(path, (t) => w * (1 - 0.4 * t), 16, 6, 1, 2.5), wet));
    if (i % 2 === 0) F.wood.push(paint(taperedTube(path, (t) => w * 1.5 * (1 - 0.4 * t), 5, 3, 1, 2.5), wet));
    // a root forking off the arch on its way down
    if (r() < 0.55) {
      const b = a + (r() < 0.5 ? -1 : 1) * range(r, 0.5, 1.0);
      const S = path[2].clone().lerp(path[3], range(r, 0.1, 0.9));
      const sub = arc(S, b, range(r, 0.45, 1.0), 0.03);
      N.wood.push(paint(taperedTube(sub, (t) => w * 0.62 * (1 - 0.35 * t), 10, 5, 1, 1.5), wet));
    }
  }
  // a few aerial roots hanging straight down from the low limbs
  for (let i = 0; i < irange(r, 3, 5); i++) {
    const a = r() * TAU, d = range(r, 0.8, 1.8), yy = R0 + range(r, 1.4, 2.6);
    const p0 = V(lx * 0.4 + Math.cos(a) * d, yy, lz * 0.4 + Math.sin(a) * d);
    N.wood.push(paint(taperedTube([p0, p0.clone().add(V(0.05, -yy * 0.5, 0)), V(p0.x + 0.08, -0.3, p0.z)], (t) => 0.022 * (1 - 0.3 * t), 6, 4, 1, 2), wet));
  }
  // the crown: low, wide and dense
  const tips: Tip[] = [];
  const h: Habit = { levels: 2, forks: [2, 3], spread: [0.5, 0.9], shrink: [0.6, 0.75], lift: 0.12, flat: 0.45, side: 0.4, farMin: 0.06 };
  const nb = irange(r, 3, 4), a0 = r() * TAU;
  for (let i = 0; i < nb; i++) {
    const a = a0 + (i / nb) * TAU + range(r, -0.4, 0.4), el = range(r, 0.3, 0.8);
    grow(r, N, F, pts[3].clone().add(V(0, -range(r, 0.1, 0.9), 0)), V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), range(r, 1.2, 1.8), 0.085, 0, h, tips);
  }
  const boughs = ['bough0', 'bough1', 'bough2'].map((n) => cell('boughs', n));
  const clumps = ['clump0', 'clump1'].map((n) => cell('boughs', n));
  const spec: PadSpec = { cells: boughs, farCells: clumps, size: [1.5, 2.1], n: [3, 4], tilt: [-0.25, 0.45], upright: 0.6, farEvery: 2, farGrow: 1.8 };
  tips.forEach((t, i) => pad(r, N, F, t, i, spec));
  const crown = finishCards(N, tips, 1.6);
  finishCards(F, tips, 1.6);
  // leathery and dark
  for (const B of [N, F]) for (const g of B.leaf) paint(g, (p, n, c) => c.multiplyScalar(0.82));
  return model(N, F, {
    colliders: [{ x: 0, z: 0, r: 0.9, top: R0 + 0.2 }], canopy: 2.5,
    crown: { r: crown.r, top: crown.top, x: crown.x, z: crown.z },
  });
}

// Dead snag: a drowned tree, bleached and bare, its top snapped off and a few broken limbs.
export function snag(seed: number): TreeModel {
  const r = mulberry32(seed);
  const nz = createNoise2D(seed);
  const parts: Geo[] = [];
  const H = range(r, 5, 11);
  const lx = range(r, -0.6, 0.6), lz = range(r, -0.6, 0.6);
  const pts = [V(0, -0.6, 0), V(lx * 0.3, H * 0.5, lz * 0.3), V(lx, H, lz)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const R = range(r, 0.2, 0.32);
  const trunk = taperedTube(pts, (t) => R * (1 - 0.55 * t) + R * 0.6 * Math.exp(-t * 9), 16, 10, 1, H / 2);
  const p = trunk.attributes.position, c = V(), q = V();
  for (let i = 0; i < p.count; i++) {
    q.fromBufferAttribute(p, i);
    curve.getPointAt(clamp((q.y + 0.6) / (H + 0.6), 0, 1), c);
    const dx = q.x - c.x, dz = q.z - c.z, a = Math.atan2(dz, dx);
    const foot = Math.exp(-(q.y + 0.6) * 0.7);
    const k = nz(q.y * 0.3, Math.cos(a) * 1.4 + Math.sin(a) * 0.8) * 0.1 + nz(q.y * 1.7, a * 2.3 + 5) * 0.035
      + (Math.abs(Math.sin(a * 2.5 + nz(q.y * 0.15, 9) * 2)) - 0.5) * 0.16 * foot;
    let y = q.y;
    // the snapped top: jagged splinters
    if (y >= H - 0.05) y += Math.abs(nz(Math.cos(a) * 3, Math.sin(a) * 3)) * 0.9 + (Math.abs(Math.sin(a * 5)) > 0.8 ? 0.4 : 0);
    p.setXYZ(i, c.x + dx * (1 + k), y, c.z + dz * (1 + k));
  }
  trunk.computeVertexNormals();
  paint(trunk, (v, nn, col) => {
    const wet = 0.5 + 0.5 * smoothstep(-0.2, 0.9, v.y);
    col.setRGB(wet * 0.85, wet * 0.83, wet * 0.78);
  });
  parts.push(trunk);
  for (let i = 0; i < irange(r, 2, 4); i++) {
    const S = curve.getPointAt(range(r, 0.35, 0.8));
    const a = r() * TAU, L = range(r, 0.8, 2.2);
    const E = S.clone().add(V(Math.cos(a) * L, L * range(r, 0.1, 0.7), Math.sin(a) * L));
    parts.push(wood([S, S.clone().lerp(E, 0.5).add(V(0, 0.1, 0)), E], R * 0.35, R * 0.1, 5, 6, 0.8, 1));
  }
  return { geometry: mergeSlots([parts]), colliders: [{ x: 0, z: 0, r: R + 0.05 }] };
}
