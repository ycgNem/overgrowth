// Marks the machete leaves behind: gashes of pale fresh wood cut through the bark of trunks
// and logs, and bright scrapes on stone. Each kind is one instanced mesh of small curved
// decals laid on the surface the blade struck, along the line of the swing. The oldest mark
// is reused once the pool is full. A second blow close to an earlier gash deepens that gash
// instead of adding another.
import * as THREE from 'three';
import { mulberry32 } from '../utils/rng.js';

const MAX = 64;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// height field -> tangent-space normal map (R = x, G = y)
function normalFrom(h, W, H, strength) {
  const c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const at = (x, y) => h[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// A wedge-shaped notch: torn dark bark round a lens of fresh wood, the far wall of the cut in
// shade. Drawn along x (the line of the blade). Nothing in it repeats: the rims wander on
// smooth noise, each to its own (regular waves and evenly spaced splinters read as a zipper).
function gashMaps() {
  const W = 256, H = 128;
  const c = canvas(W, H), g = c.getContext('2d')!;
  const r = mulberry32(17);
  // smooth 1D noise, -1..1
  const tab = Array.from({ length: 64 }, () => r() * 2 - 1);
  const n1 = (x: number) => {
    const i = Math.floor(x), f = x - i, k = f * f * (3 - 2 * f);
    return tab[i & 63] + (tab[(i + 1) & 63] - tab[i & 63]) * k;
  };
  const h = new Float32Array(W * H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 2 - 1, v = (y / H) * 2 - 1;
      const up = v < 0;
      // a blunt chunk hacked out, each rim ragged in its own way, the cut a little off-centre
      const o = up ? 0 : 23.7;
      const body = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 1.04 + 0.03), 3.2)), 0.55);
      const half = body * (up ? 0.4 : 0.48) * (1 + 0.3 * n1(u * 2.6 + o) + 0.16 * n1(u * 7.3 + o + 5) + 0.07 * n1(u * 19 + o + 9));
      const d = Math.abs(v) / Math.max(half, 1e-3); // < 1 inside the cut
      const i = (y * W + x) * 4;
      let a = 0, R = 0, G = 0, B = 0, ht = 0;
      const lip = 1.3 + 0.22 * n1(u * 5.1 + o + 31) + 0.1 * n1(u * 23 + o + 40);
      if (d < lip && half > 0.02) {
        if (d < 1) {
          // fresh wood in a V-shaped notch: the upper wall faces down into shade, the lower wall
          // catches the light, the crease between them is dark; long fibres along the cut
          const grain = 1 + 0.09 * n1(u * 3 + v * 34) + 0.05 * n1(u * 11 + v * 61 + 7) + (r() - 0.5) * 0.04;
          const crease = 0.3 + 0.7 * Math.min(1, d / 0.2);
          const wall = up ? 0.36 + 0.24 * d : 0.74 + 0.2 * d;
          const k = grain * wall * crease;
          // (damp sapwood, not dry pine: at full brightness it glared off dark bark like a sticker)
          R = 138 * k; G = 114 * k; B = 84 * k;
          ht = -(1 - d) * (up ? 1.0 : 0.7);
          a = 255;
        } else {
          // the torn bark lip, lifted a little: dark, with fibres of inner bark showing
          const k = (d - 1) / (lip - 1);
          const fib = 0.5 + 0.5 * n1(u * 37 + v * 6 + o);
          R = 58 + 46 * fib * (1 - k); G = 40 + 30 * fib * (1 - k); B = 26 + 16 * fib * (1 - k);
          ht = 0.3 * (1 - k);
          a = 255;
        }
      }
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = a;
      h[y * W + x] = ht;
    }
  }
  g.putImageData(img, 0, 0);
  // a few splinters lifted off the lower rim, lying nearly along the cut, no two alike
  for (let k = 0; k < 7; k++) {
    const x = W * (0.18 + r() * 0.64), y = H * (0.5 + (r() < 0.75 ? 1 : -1) * (0.2 + r() * 0.07));
    const len = 8 + r() * r() * 30, dir = r() < 0.5 ? -1 : 1;
    g.strokeStyle = `rgba(${150 + r() * 40 | 0},${118 + r() * 30 | 0},${78 + r() * 20 | 0},${0.55 + r() * 0.35})`;
    g.lineWidth = 0.8 + r() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dir * len, y + (y < H / 2 ? -1 : 1) * (1 + r() * 5));
    g.stroke();
  }
  return { map: c, normal: normalFrom(h, W, H, 6) };
}

// Bright scratches and pale dust where steel skidded over stone.
function scrapeMaps() {
  const W = 256, H = 128;
  const c = canvas(W, H), g = c.getContext('2d');
  const r = mulberry32(23);
  const grd = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.45);
  grd.addColorStop(0, 'rgba(230,226,215,0.75)');
  grd.addColorStop(1, 'rgba(225,222,212,0)');
  g.save();
  g.scale(1, 0.4);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H / 0.4);
  g.restore();
  for (let k = 0; k < 22; k++) {
    const y = H * (0.3 + r() * 0.4), x0 = W * (0.1 + r() * 0.2), x1 = W * (0.7 + r() * 0.2);
    g.strokeStyle = `rgba(250,250,245,${0.7 + r() * 0.3})`;
    g.lineWidth = 1.2 + r() * 2;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y + (r() - 0.5) * 6);
    g.stroke();
  }
  const h = new Float32Array(W * H);
  return { map: c, normal: normalFrom(h, W, H, 1) };
}

function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a plane bent round a cylinder of radius ~0.7 m, so it hugs a trunk
function curvedPlane() {
  const g = new THREE.PlaneGeometry(1, 1, 8, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, -(x * x) * 0.3);
  }
  g.computeVertexNormals();
  return g;
}

interface Kind { mesh: THREE.InstancedMesh; list: any[]; next: number }

export class Marks {
  kinds: Record<string, Kind>;
  _m = new THREE.Matrix4();
  _q = new THREE.Quaternion();
  _x = new THREE.Vector3();
  _y = new THREE.Vector3();

  constructor(scene) {
    const gash = gashMaps(), scrape = scrapeMaps();
    const mk = (maps, opts) => {
      const mat = new THREE.MeshStandardMaterial({
        map: tex(maps.map, true), normalMap: tex(maps.normal, false), alphaTest: 0.5, roughness: 0.85,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...opts,
      });
      const mesh = new THREE.InstancedMesh(curvedPlane(), mat, MAX);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return { mesh, list: [], next: 0 };
    };
    this.kinds = {
      wood: mk(gash, {}),
      stone: mk(scrape, { alphaTest: 0.08, transparent: true, depthWrite: false, roughness: 0.6 }),
    };
  }

  // kind: 'wood' | 'stone'; at: the struck point; normal: the surface's outward normal;
  // along: the blade's sweep direction (projected onto the surface).
  add(kind, at, normal, along, size = 0.3) {
    const K = this.kinds[kind];
    // a blow on an earlier gash makes it longer and deeper-looking
    for (const m of K.list) {
      if (m.pos.distanceToSquared(at) < 0.12 * 0.12) {
        m.scale = Math.min(m.scale * 1.18, size * 1.9);
        this.write(K, m);
        return;
      }
    }
    const n = normal.clone().normalize();
    const x = this._x.copy(along).addScaledVector(n, -along.dot(n));
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0).addScaledVector(n, -n.x);
    x.normalize();
    const y = this._y.crossVectors(n, x);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    const m = { pos: at.clone().addScaledVector(n, 0.012), q, scale: size * (0.85 + Math.random() * 0.3), slot: 0 };
    // (a small mark first; each blow on it opens it up, see above)
    if (K.list.length < MAX) {
      m.slot = K.list.length;
      K.list.push(m);
    } else {
      m.slot = K.next;
      K.list[K.next] = m;
      K.next = (K.next + 1) % MAX;
    }
    this.write(K, m);
  }

  write(K, m) {
    this._m.compose(m.pos, m.q, new THREE.Vector3(m.scale, m.scale * 0.42, m.scale));
    K.mesh.setMatrixAt(m.slot, this._m);
    K.mesh.count = K.list.length;
    K.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const K of Object.values(this.kinds)) {
      K.list.length = 0;
      K.next = 0;
      K.mesh.count = 0;
    }
  }
}
