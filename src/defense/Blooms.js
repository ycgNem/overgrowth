// Blight Blooms: the day's errand. Every dawn a few corrupted pods push up out of the forest
// floor 45-90 m from the Heartwood, each watched by a couple of Blightlings. Cut one down (the
// machete, sling stones, a firepot) and it bursts into rare loot and favour with the Heartwood.
// Leave it standing and at dusk it opens: all night it is one more mouth the wave pours out of,
// a new lane onto the Heart from wherever it stood. So the day is a choice: hunt the blooms
// down, or build to cover the flank they will open. Cut one at night and its lane closes.
//
// A bloom is code-built (a lumpy mound, glowing pods, black thorns, a stain soaked into the
// ground) and lives outside the chunk system, like the rifts.
import * as THREE from 'three';
import { terrainHeight, terrainNormal, WATER_LEVEL, CHUNK_SIZE } from '../world/WorldGen.js';
import { glowTexture } from '../art/textures.js';
import { poisAround } from '../world/poi/POI.js';
import { BASE_CLEAR } from './Base.js';

export const BLOOM_HP = 170; // six machete blows
const SIZE = 1.35; // the body's scale: big enough to show over the undergrowth
export const BLOOM_RADIUS = 1.2 * SIZE;
const TAU = Math.PI * 2;

let shared = null;
function materials() {
  if (shared) return shared;
  const stain = document.createElement('canvas');
  stain.width = stain.height = 512;
  const c = stain.getContext('2d');
  const g = c.createRadialGradient(256, 256, 16, 256, 256, 256);
  g.addColorStop(0, 'rgba(18,10,20,0.95)');
  g.addColorStop(0.45, 'rgba(40,16,50,0.7)');
  g.addColorStop(0.8, 'rgba(56,24,66,0.22)');
  g.addColorStop(1, 'rgba(56,24,66,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 512);
  // fine veins creeping out through the soil
  c.strokeStyle = 'rgba(150,60,200,0.3)';
  c.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let x = 256, y = 256, a = (i / 14) * TAU + Math.random() * 0.3;
    c.lineWidth = 0.9 * 4;
    for (let k = 0; k < 12; k++) {
      a += (Math.random() - 0.5) * 0.7;
      const nx = x + Math.cos(a) * 18, ny = y + Math.sin(a) * 18;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + 0.4) * 10, y + Math.sin(a + 0.4) * 10, nx, ny);
      c.stroke();
      x = nx; y = ny;
      c.lineWidth = Math.max(0.9, c.lineWidth * 0.86);
    }
  }
  const stainTex = new THREE.CanvasTexture(stain);
  stainTex.colorSpace = THREE.SRGBColorSpace;
  // the pods' skin: dark and leathery, lit from inside along branching veins
  const vein = document.createElement('canvas');
  vein.width = vein.height = 256;
  const v = vein.getContext('2d');
  v.fillStyle = '#000';
  v.fillRect(0, 0, 256, 256);
  v.lineCap = 'round';
  // one set of branching, curving veins (recorded so it can be drawn twice: a blurred glow
  // under a thin sharp line)
  const segs = [];
  const branch = (x, y, a, w, n) => {
    if (n <= 0 || w < 0.35) return;
    const l = 10 + Math.random() * 14;
    const bend = (Math.random() - 0.5) * 0.9;
    const nx = x + Math.cos(a + bend * 0.5) * l, ny = y + Math.sin(a + bend * 0.5) * l;
    segs.push([x, y, x + Math.cos(a + bend) * l * 0.5, y + Math.sin(a + bend) * l * 0.5, nx, ny, w]);
    branch(nx, ny, a + bend * 0.6, w * 0.87, n - 1);
    if (Math.random() < 0.3) branch(nx, ny, a + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6), w * 0.6, n - 2);
  };
  // veins run from the bottom of the pod (v = 0) up toward its tip, wrapping round it
  for (let i = 0; i < 5; i++) {
    const x = (i / 5) * 256 + Math.random() * 30;
    for (const off of [0, -256, 256]) branch(x + off, 256, -Math.PI / 2 + (Math.random() - 0.5) * 0.5, 2.5, 15);
  }
  const drawVeins = (scale, alpha) => {
    for (const [x0, y0, cx, cy, x1, y1, w] of segs) {
      v.lineWidth = w * scale;
      v.strokeStyle = `rgba(255,255,255,${alpha})`;
      v.beginPath();
      v.moveTo(x0, y0);
      v.quadraticCurveTo(cx, cy, x1, y1);
      v.stroke();
    }
  };
  v.filter = 'blur(2px)';
  drawVeins(2.6, 0.45);
  v.filter = 'none';
  drawVeins(1, 0.9);
  const veinTex = new THREE.CanvasTexture(vein);
  // the beacon: bright at the root, fading up and out to the edges
  const bc = document.createElement('canvas');
  bc.width = 32; bc.height = 128;
  const bx = bc.getContext('2d');
  const gy = bx.createLinearGradient(0, 128, 0, 0);
  gy.addColorStop(0, 'rgba(255,255,255,0.9)');
  gy.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gy.addColorStop(1, 'rgba(255,255,255,0)');
  bx.fillStyle = gy;
  bx.fillRect(0, 0, 32, 128);
  bx.globalCompositeOperation = 'destination-in';
  const gx = bx.createLinearGradient(0, 0, 32, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)');
  gx.addColorStop(0.5, 'rgba(0,0,0,1)');
  gx.addColorStop(1, 'rgba(0,0,0,0)');
  bx.fillStyle = gx;
  bx.fillRect(0, 0, 32, 128);
  const beaconTex = new THREE.CanvasTexture(bc);
  veinTex.wrapS = THREE.RepeatWrapping;
  shared = {
    // (a faint glow of its own, or at night it was a black blob)
    mound: new THREE.MeshStandardMaterial({ color: 0x2a1530, roughness: 0.85, emissive: 0x3a1050, emissiveIntensity: 0.25 }),
    pod: new THREE.MeshStandardMaterial({ color: 0x3a1a44, roughness: 0.65, emissive: 0xc060ff, emissiveMap: veinTex, emissiveIntensity: 0.9 }),
    thorn: new THREE.MeshStandardMaterial({ color: 0x160b1a, roughness: 0.6 }),
    stain: new THREE.MeshStandardMaterial({
      map: stainTex, transparent: true, depthWrite: false, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }),
    beacon: new THREE.MeshBasicMaterial({
      map: beaconTex, color: 0xa070e0, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    }),
    beaconGeo: new THREE.PlaneGeometry(3, 28).translate(0, 14, 0),
    glow: new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xb060ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false,
    }),
  };
  return shared;
}

function lumpy(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 7.1 + seed) * Math.cos(z * 6.3 + seed * 1.7) + Math.sin(y * 9.7 + seed * 0.3) * 0.5;
    const k = 1 + n * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildBloom(x, z, seed) {
  const M = materials();
  const r = (() => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  // sunk to the lowest point under its rim, so no lip of its underside shows on a slope
  let y = Infinity;
  for (let k = 0; k < 6; k++) y = Math.min(y, terrainHeight(x + Math.cos((k * TAU) / 6) * 1.15, z + Math.sin((k * TAU) / 6) * 1.15));
  y -= 0.15;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // the stain: a grid draped over the ground
  const stainGeo = new THREE.PlaneGeometry(9, 9, 18, 18);
  stainGeo.rotateX(-Math.PI / 2);
  const sp = stainGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, terrainHeight(x + sp.getX(i), z + sp.getZ(i)) - y + 0.04);
  stainGeo.computeVertexNormals();
  const stain = new THREE.Mesh(stainGeo, M.stain);
  stain.receiveShadow = true;
  group.add(stain);
  const body = new THREE.Group();
  group.add(body);
  const mound = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1.15, 32, 16), 0.24, seed % 97), M.mound);
  mound.scale.set(1, 0.55, 1);
  mound.castShadow = mound.receiveShadow = true;
  body.add(mound);
  const pods = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.6, d = i === 0 ? 0 : 0.35 + r() * 0.45;
    const s = i === 0 ? 0.5 : 0.24 + r() * 0.18;
    const pod = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1, 14, 10), 0.08, seed + i), M.pod);
    pod.position.set(Math.cos(a) * d, 0.3 + s * 0.9, Math.sin(a) * d);
    pod.scale.set(s, s * 1.45, s);
    pod.rotation.set((r() - 0.5) * 0.5 + Math.sin(a) * d * 0.6, r() * TAU, (r() - 0.5) * 0.5 - Math.cos(a) * d * 0.6);
    pod.castShadow = true;
    pod.userData.base = pod.scale.clone();
    pod.userData.phase = r() * TAU;
    body.add(pod);
    pods.push(pod);
  }
  // thorns curling out of the mound
  // thorns curl outward as they rise: a cone bent along its length
  const thornGeo = new THREE.ConeGeometry(0.07, 1, 6, 6);
  thornGeo.translate(0, 0.5, 0);
  const tp = thornGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const h = tp.getY(i);
    tp.setX(i, tp.getX(i) * (1 - h * 0.35) + h * h * 0.35);
  }
  thornGeo.computeVertexNormals();
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, d = 0.6 + r() * 0.5;
    const t = new THREE.Mesh(thornGeo, M.thorn);
    t.position.set(Math.cos(a) * d, 0.15, Math.sin(a) * d);
    t.scale.setScalar(0.5 + r() * 0.7);
    // lean out from the mound, curling outward (the bend runs along the thorn's +x)
    t.rotation.order = 'YZX';
    t.rotation.set(0, -a, -0.5 - r() * 0.4);
    t.castShadow = true;
    body.add(t);
  }
  // a faint column of spores rising over the canopy, so you can find it from afar
  const beacon = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(M.beaconGeo, M.beacon);
    m.rotation.y = k * Math.PI / 2;
    beacon.add(m);
  }
  group.add(beacon);
  const glow = new THREE.Sprite(M.glow);
  glow.position.y = 0.9;
  glow.scale.setScalar(3.2);
  body.add(glow);
  // the pods' material is shared: each bloom pulses its own copy
  const podMat = M.pod.clone();
  for (const p of pods) p.material = podMat;
  body.scale.setScalar(SIZE);
  return { group, body, pods, podMat, glow, stain, beacon, y };
}

export class Blooms {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.enabled = true;
  }

  // how many sprout on day n, and how many Blight each one hatches at dusk
  // (left alone, a bloom adds only its two guards to the wave; what it costs is a new lane)
  static countFor(n) {
    return n <= 1 ? 1 : n <= 3 ? 2 : 3;
  }

  static guardsFor(n) {
    return n <= 1 ? 1 : 2;
  }

  static guardsTotal(n) {
    return Blooms.countFor(n) * Blooms.guardsFor(n);
  }

  get alive() {
    return this.list.filter((b) => !b.dead);
  }

  // one bloom at (x, z); also used to warm its shaders up at load
  add(x, z, seed = 1) {
    const b = { x, z, seed, hp: BLOOM_HP, maxHp: BLOOM_HP, dead: false, deathT: 0, hitT: 0, guards: [], ...buildBloom(x, z, seed) };
    b.cy = b.y + 0.8 * SIZE;
    this.scene.add(b.group);
    this.list.push(b);
    return b;
  }

  remove(b) {
    this.scene.remove(b.group);
    for (const m of [b.stain.geometry, ...b.pods.map((p) => p.geometry)]) m.dispose();
    b.podMat.dispose();
    this.list = this.list.filter((o) => o !== b);
  }

  clear() {
    for (const b of [...this.list]) this.remove(b);
  }

  // A new day's blooms, out in the forest around the base: on dry, gentle ground, clear of the
  // camp, the points of interest and each other.
  sprout(n, base, rand = Math.random, blocked = () => false) {
    this.clear();
    if (!this.enabled) return [];
    const want = Blooms.countFor(n);
    const pois = poisAround(Math.floor(base.x / CHUNK_SIZE), Math.floor(base.z / CHUNK_SIZE), 3);
    let tries = 0;
    const a0 = rand() * TAU;
    while (this.list.length < want && tries++ < 400) {
      // spread round the compass, then jitter
      const a = a0 + (this.list.length / want) * TAU + (rand() - 0.5) * 1.6;
      // (inside the Blight's flow field, which reaches 100 m from the Heart)
      const d = 45 + rand() * 45;
      const x = base.x + Math.cos(a) * d, z = base.z + Math.sin(a) * d;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.6 || terrainNormal(x, z).y < 0.88) continue;
      if (Math.hypot(x - base.x, z - base.z) < BASE_CLEAR + 10) continue;
      if (pois.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 6)) continue;
      if (this.list.some((o) => Math.hypot(x - o.x, z - o.z) < 28) || blocked(x, z)) continue;
      this.add(x, z, Math.floor(rand() * 1e9));
    }
    return this.list;
  }

  // the nearest living bloom whose body is within r of (x, z)
  near(x, z, r) {
    let best = null, bd = r;
    for (const b of this.list) {
      if (b.dead) continue;
      const d = Math.hypot(b.x - x, b.z - z) - BLOOM_RADIUS;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // Returns true if this hit killed it.
  damage(b, n) {
    if (b.dead) return false;
    b.hp -= n;
    b.hitT = 1;
    if (b.hp <= 0) {
      b.dead = true;
      b.deathT = 0;
      return true;
    }
    return false;
  }

  update(dt, t) {
    for (const b of [...this.list]) {
      b.hitT = Math.max(0, b.hitT - dt * 5);
      if (b.dead) {
        // the pods shrivel, the body sinks and the stain fades back into the soil
        b.deathT += dt;
        const k = Math.min(1, b.deathT / 1.2);
        b.body.scale.set(SIZE * (1 + k * 0.2), SIZE * Math.max(0.02, 1 - k), SIZE * (1 + k * 0.2));
        b.glow.visible = false;
        b.beacon.visible = false;
        b.stain.material = b.stain.material === shared.stain ? shared.stain.clone() : b.stain.material;
        b.stain.material.opacity = 1 - Math.min(1, b.deathT / 3);
        if (b.deathT > 3) this.remove(b);
        continue;
      }
      // a slow heartbeat, faster and brighter as it is cut down
      const hurt = 1 - b.hp / b.maxHp;
      // an open lane beats hard and fast
      const beat = Math.pow(Math.max(0, Math.sin(t * (2.2 + hurt * 2.5 + (b.lane ? 2.5 : 0)) + b.seed % 7)), 6);
      b.beacon.scale.set(1 + beat * 0.25, 1, 1 + beat * 0.25);
      // (peaks just past the bloom threshold, so the veins flare on each beat without washing out)
      b.podMat.emissiveIntensity = 0.55 + beat * 0.5 + b.hitT * 0.4;
      // pods burst one by one as it loses HP (the core goes last)
      const gone = Math.floor(hurt * (b.pods.length - 1) + 0.001);
      b.pods.forEach((p, i) => {
        const dead = i > 0 && b.pods.length - i <= gone;
        p.visible = !dead;
        const s = 1 + beat * 0.07 + b.hitT * 0.12;
        p.scale.set(p.userData.base.x * s, p.userData.base.y * (1 + beat * 0.1), p.userData.base.z * s);
      });
      b.body.scale.set(SIZE * (1 + b.hitT * 0.06), SIZE * (1 - b.hitT * 0.1), SIZE * (1 + b.hitT * 0.06));
      b.glow.scale.setScalar(2.8 + beat * 0.8);
    }
  }
}
