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

// A wedge-shaped notch: torn dark bark round a lens of pale, splintery wood, the far wall of
// the cut in shade. Drawn along x (the line of the blade).
function gashMaps() {
  const W = 256, H = 128;
  const c = canvas(W, H), g = c.getContext('2d');
  const r = mulberry32(17);
  const h = new Float32Array(W * H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 2 - 1, v = (y / H) * 2 - 1;
      // the lens: widest in the middle, pointed at the ends, with a ragged rim
      // a blunt, ragged chunk hacked out (a pointed lens read as a leaf stuck on the bark)
      const half = 0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 3.5)), 0.5) * (1 + 0.2 * Math.sin(u * 17 + Math.sin(u * 5) * 2) + 0.1 * Math.sin(u * 41));
      const d = Math.abs(v) / Math.max(half, 1e-3); // < 1 inside the cut
      const i = (y * W + x) * 4;
      let a = 0, R = 0, G = 0, B = 0, ht = 0;
      // smooth ragged noise for the torn edge (per-pixel noise read as speckle)
      const rag = Math.sin(u * 31 + 1.7) * 0.5 + Math.sin(u * 13.3 + v * 4) * 0.35 + Math.sin(u * 71) * 0.15;
      const lip = 1.38 + rag * 0.16;
      if (d < lip && half > 0.02) {
        if (d < 1) {
          // fresh wood in a V-shaped notch: the upper wall faces down into shade, the lower wall
          // catches the light, the crease between them is dark; faint grain along the cut
          const grain = 1 + 0.06 * Math.sin(u * 26 + Math.sin(v * 5) * 1.2) + (r() - 0.5) * 0.05;
          const crease = 0.35 + 0.65 * Math.min(1, d / 0.18);
          const wall = v < 0 ? 0.42 + 0.25 * d : 0.82 + 0.18 * d;
          const k = grain * wall * crease;
          R = 188 * k; G = 160 * k; B = 122 * k;
          ht = -(1 - d) * (v < 0 ? 1.0 : 0.7);
          a = 255;
        } else {
          // the torn bark lip, lifted a little: dark, with fibres of inner bark showing
          const k = (d - 1) / (lip - 1);
          const fib = 0.5 + 0.5 * Math.sin(u * 90 + v * 3);
          R = 70 + 50 * fib * (1 - k); G = 48 + 34 * fib * (1 - k); B = 30 + 18 * fib * (1 - k);
          ht = 0.3 * (1 - k);
          a = 255;
        }
      }
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = a;
      h[y * W + x] = ht;
    }
  }
  g.putImageData(img, 0, 0);
  // splinters standing out of the rim
  for (let k = 0; k < 26; k++) {
    const x = W * (0.2 + r() * 0.6), y = H * (r() < 0.5 ? 0.22 : 0.78) + (r() - 0.5) * 10;
    g.strokeStyle = `rgba(${200 + r() * 30 | 0},${168 + r() * 25 | 0},${110 + r() * 20 | 0},0.9)`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 30, y + (y < H / 2 ? -1 : 1) * (4 + r() * 8));
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

export class Marks {
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
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
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
