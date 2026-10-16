// The machete you hold: a long Latin-style blade of dark carbon steel with a bright filed
// edge, hardwood scales on a full tang, and the gloved hand closed round it (hand.glb, made
// by art/blender/hand.py).
//
// Frame: the blade runs along +x from x = 0, the spine is +y, the handle lies along -x and
// the grip's centre is at about x = -0.06. The hand model shares this frame.
import * as THREE from 'three';
import { gltfLoader } from '../assets/Models.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../utils/rng.js';

export const BLADE_LEN = 0.47;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ blade

// The outline: spine height and blade width at s = 0..1 along the blade. The spine drops a
// little toward the tip; the belly widens toward the tip and rounds up into it.
const spineY = (s) => 0.015 - 0.007 * s * s * s;
const widthAt = (s) => {
  const w = 0.034 + 0.03 * Math.pow(s, 1.35);
  const t = (s - 0.8) / 0.2;
  return s < 0.8 ? w : w * Math.sqrt(Math.max(0, 1 - t * t * 0.985));
};
const BEVEL = 0.66; // where the flat of the blade ends and the filed edge bevel begins (0 spine .. 1 edge)
// half the steel's thickness at (s, v): thick at the spine, thinner toward the tip, the
// bevel running down to a hair at the edge
function halfThick(s, v) {
  const T = 0.0023 * (1 - 0.5 * s);
  if (v <= BEVEL) return T * (1 - 0.18 * v);
  const k = (v - BEVEL) / (1 - BEVEL);
  return T * (1 - 0.18 * BEVEL) * (1 - k) + 0.00012;
}

function grid(ns, nv, fn, flip) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    for (let j = 0; j <= nv; j++) {
      const [p, u] = fn(i / ns, j / nv);
      pos.push(...p);
      uv.push(...u);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < ns; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
      if (flip) idx.push(a, d, b, b, d, c);
      else idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function bladeGeometry() {
  const L = BLADE_LEN, NS = 56;
  const at = (s, v, side) => {
    const y = spineY(s) - widthAt(s) * v;
    return [[s * L, y, side * halfThick(s, v)], [s, 1 - v]];
  };
  const parts = [];
  for (const side of [1, -1]) {
    // the flat and the bevel are separate strips so the grind line stays crisp
    parts.push(grid(NS, 5, (s, t) => at(s, t * BEVEL, side), side < 0));
    parts.push(grid(NS, 3, (s, t) => at(s, BEVEL + t * (1 - BEVEL), side), side < 0));
  }
  // the spine: a narrow rounded strip from one face over to the other
  parts.push(grid(NS, 4, (s, t) => {
    const a = Math.PI * (t - 0.5);
    const h = halfThick(s, 0);
    return [[s * L, spineY(s) + Math.cos(a) * h * 0.6, Math.sin(a) * h], [s, 1]];
  }, false));
  // the ricasso's end, hidden in the bolster: a cap so no hole shows
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeBoundingSphere();
  return g;
}

// Dark carbon steel: a mottled blue-black patina, rust freckles near the spine, long scuffs,
// and a bright bevel filed by hand (short diagonal strokes), its very edge almost white.
function bladeMaps() {
  const W = 1024, H = 256;
  const c = canvas(W, H), g = c.getContext('2d');
  const rc = canvas(W, H), rg = rc.getContext('2d'); // roughness
  const r = mulberry32(431);
  const bevelY = H * BEVEL;
  // body
  const body = g.createLinearGradient(0, 0, 0, bevelY);
  body.addColorStop(0, '#4a4d50');
  body.addColorStop(0.5, '#5d6164');
  body.addColorStop(1, '#6a6e72');
  g.fillStyle = body;
  g.fillRect(0, 0, W, bevelY);
  rg.fillStyle = '#8c8c8c';
  rg.fillRect(0, 0, W, bevelY);
  // patina: soft cloudy blotches of brown and blue-grey
  for (let k = 0; k < 160; k++) {
    const x = r() * W, y = r() * bevelY, rad = 8 + r() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() < 0.55 ? '70,52,38' : r() < 0.5 ? '28,32,40' : '82,86,90';
    grd.addColorStop(0, `rgba(${col},${0.1 + r() * 0.22})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // rust freckles toward the spine and the ricasso
  for (let k = 0; k < 220; k++) {
    const x = Math.pow(r(), 1.6) * W, y = Math.pow(r(), 2.2) * bevelY, rad = 0.6 + r() * 2.6;
    g.fillStyle = `rgba(${110 + r() * 40 | 0},${52 + r() * 20 | 0},${22 + r() * 10 | 0},${0.35 + r() * 0.4})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    rg.fillStyle = 'rgba(240,240,240,0.6)';
    rg.beginPath();
    rg.arc(x, y, rad, 0, Math.PI * 2);
    rg.fill();
  }
  // long scuffs from use
  for (let k = 0; k < 340; k++) {
    const x = r() * W, y = r() * bevelY, len = 20 + r() * 140;
    const light = r() < 0.7;
    g.strokeStyle = light ? `rgba(150,156,160,${0.05 + r() * 0.16})` : `rgba(10,10,12,${0.08 + r() * 0.15})`;
    g.lineWidth = 0.5 + r() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (r() - 0.5) * 8);
    g.stroke();
    if (light) {
      rg.strokeStyle = 'rgba(60,60,60,0.25)';
      rg.lineWidth = g.lineWidth;
      rg.beginPath();
      rg.moveTo(x, y);
      rg.lineTo(x + len, y + (r() - 0.5) * 8);
      rg.stroke();
    }
  }
  // a small maker's stamp near the ricasso: a leaf in a ring
  g.save();
  g.translate(110, bevelY * 0.42);
  g.strokeStyle = 'rgba(12,12,12,0.55)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.ellipse(0, 0, 24, 22, 0, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(-14, 10);
  g.quadraticCurveTo(-10, -16, 14, -12);
  g.quadraticCurveTo(10, 12, -14, 10);
  g.moveTo(-14, 10);
  g.lineTo(8, -8);
  g.stroke();
  g.restore();
  // the bevel: bright filed steel
  const bev = g.createLinearGradient(0, bevelY, 0, H);
  bev.addColorStop(0, '#9aa1a6');
  bev.addColorStop(0.55, '#c3c9cd');
  bev.addColorStop(0.92, '#dde2e5');
  bev.addColorStop(1, '#f6f8f9');
  g.fillStyle = bev;
  g.fillRect(0, bevelY, W, H - bevelY);
  rg.fillStyle = '#626262';
  rg.fillRect(0, bevelY, W, H - bevelY);
  // file strokes, angled across the bevel
  for (let k = 0; k < 1400; k++) {
    const x = r() * W, y = bevelY + r() * (H - bevelY);
    const dark = r() < 0.5;
    g.strokeStyle = dark ? `rgba(60,64,68,${0.1 + r() * 0.2})` : `rgba(235,240,242,${0.1 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6 + r() * 10, y + 8 + r() * 10);
    g.stroke();
  }
  // a nick or two in the edge
  for (let k = 0; k < 6; k++) {
    const x = 100 + r() * (W - 200);
    g.fillStyle = 'rgba(70,72,74,0.9)';
    g.fillRect(x, H - 8, 2 + r() * 4, 8);
  }
  // the grind line: a thin dark seam where the bevel meets the flat
  g.fillStyle = 'rgba(20,20,22,0.6)';
  g.fillRect(0, bevelY - 1, W, 2);
  // the spine edge, darker
  g.fillStyle = 'rgba(15,15,16,0.7)';
  g.fillRect(0, 0, W, 3);
  return { map: tex(c), rough: tex(rc, false) };
}

// Hardwood scales: dark reddish brown with long grain, worn paler where the hand rubs.
function woodMap() {
  const W = 512, H = 128;
  const c = canvas(W, H), g = c.getContext('2d');
  const r = mulberry32(57);
  g.fillStyle = '#4a2616';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 220; k++) {
    const y = r() * H;
    g.strokeStyle = r() < 0.5 ? `rgba(120,62,34,${0.15 + r() * 0.35})` : `rgba(18,8,4,${0.2 + r() * 0.4})`;
    g.lineWidth = 0.5 + r() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 18, W * 0.65, y + (r() - 0.5) * 18, W, y + (r() - 0.5) * 10);
    g.stroke();
  }
  // a pale worn patch in the middle (the grip)
  const grd = g.createRadialGradient(W * 0.5, H * 0.5, 4, W * 0.5, H * 0.5, W * 0.35);
  grd.addColorStop(0, 'rgba(150,100,70,0.22)');
  grd.addColorStop(1, 'rgba(150,100,70,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Fine pebbled grain for the leather glove and a canvas weave for the sleeve, as tangent
// normal maps (box-projected; see boxUV).
function grainNormal(kind) {
  const S = 256;
  const c = canvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const r = mulberry32(kind === 'cloth' ? 91 : 73);
  const h = new Float32Array(S * S);
  if (kind === 'cloth') {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = Math.sin((x / S) * Math.PI * 2 * 48), wy = Math.sin((y / S) * Math.PI * 2 * 48);
        h[y * S + x] = (((Math.floor(x / (S / 48)) + Math.floor(y / (S / 48))) & 1) ? wx : wy) * 0.5 + r() * 0.3;
      }
    }
  } else {
    // pebbled: many small soft bumps
    for (let k = 0; k < 2600; k++) {
      const cx = r() * S, cy = r() * S, rad = 1.5 + r() * 3.5;
      for (let y = -6; y <= 6; y++) {
        for (let x = -6; x <= 6; x++) {
          const d = Math.hypot(x, y) / rad;
          if (d > 1) continue;
          const px = (Math.floor(cx) + x + S) % S, py = (Math.floor(cy) + y + S) % S;
          h[py * S + px] += (1 - d * d) * 0.6;
        }
      }
    }
    for (let i = 0; i < S * S; i++) h[i] += r() * 0.15;
  }
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 1.2, dy = (H(x, y + 1) - H(x, y - 1)) * 1.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// UVs by projecting each triangle on the axis plane it faces most (the GLB has none)
function boxUV(geo, scale) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const q = [a, b, c][k];
      const [u, v] = ay >= ax && ay >= az ? [q.x, q.z] : ax >= az ? [q.z, q.y] : [q.x, q.y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function handleShape() {
  // side profile of one scale, x from the bolster (0) back to the butt (-0.15)
  const s = new THREE.Shape();
  s.moveTo(-0.004, 0.0125);
  s.bezierCurveTo(-0.04, 0.0155, -0.09, 0.0165, -0.128, 0.0145);
  s.quadraticCurveTo(-0.146, 0.0145, -0.151, 0.004);
  // the butt hooks down so the hand can't slip off the end
  s.quadraticCurveTo(-0.153, -0.016, -0.143, -0.028);
  s.quadraticCurveTo(-0.134, -0.031, -0.128, -0.022);
  s.bezierCurveTo(-0.11, -0.016, -0.06, -0.0185, -0.03, -0.016);
  s.quadraticCurveTo(-0.012, -0.0145, -0.004, -0.0145);
  s.lineTo(-0.004, 0.0125);
  return s;
}

export function buildMachete() {
  const g = new THREE.Group();
  const { map, rough } = bladeMaps();
  const steel = new THREE.MeshStandardMaterial({
    map, roughnessMap: rough, roughness: 1, metalness: 0.65, envMapIntensity: 0.5, side: THREE.DoubleSide,
  });
  // the flat of a 47 cm blade turned to the sun is a mirror the size of the screen: keep its
  // highlight under the bloom threshold so it glints instead of glowing like a lamp
  steel.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n\treflectedLight.directSpecular *= 0.5;')
      .replace('#include <opaque_fragment>', 'outgoingLight = min(outgoingLight, vec3(0.95));\n#include <opaque_fragment>');
  };
  const blade = new THREE.Mesh(bladeGeometry(), steel);
  blade.name = 'blade';
  g.add(blade);

  const wood = new THREE.MeshStandardMaterial({ map: woodMap(), roughness: 0.6, metalness: 0 });
  const shape = handleShape();
  const T = 0.0085;
  for (const side of [1, -1]) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: T, bevelEnabled: true, bevelThickness: 0.0035, bevelSize: 0.0032, bevelSegments: 4, curveSegments: 20,
    });
    // scale UVs (shape coords in metres) to the wood map: grain along x
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6.5, uv.getY(i) * 6.5 + 0.5);
    geo.translate(0, 0, side > 0 ? 0.0019 : -0.0019 - T);
    g.add(new THREE.Mesh(geo, wood));
  }
  // the tang between the scales, and the steel bolster where the blade leaves the handle
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.9, roughness: 0.45 });
  const tang = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.0038, bevelEnabled: false, curveSegments: 20 }), dark);
  tang.geometry.translate(0, 0, -0.0019);
  tang.scale.set(1, 0.985, 1);
  g.add(tang);
  const bolster = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0138, 0.012, 16, 1), dark);
  bolster.rotation.z = Math.PI / 2;
  bolster.scale.set(1, 1, 0.78);
  bolster.position.set(-0.004, -0.001, 0);
  g.add(bolster);
  // brass rivets (the hand hides the middle ones) and a leather thong through the butt
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a48, metalness: 1, roughness: 0.38 });
  for (const x of [-0.022, -0.075, -0.125]) {
    for (const z of [1, -1]) {
      const rv = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), brass);
      rv.rotation.x = z * Math.PI / 2;
      rv.scale.set(1, 0.35, 1);
      rv.position.set(x, x < -0.1 ? -0.004 : 0, z * (0.0019 + T + 0.0032));
      g.add(rv);
    }
  }
  const thongMat = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.9 });
  const thongPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.142, -0.014, 0.0), new THREE.Vector3(-0.15, -0.03, 0.012), new THREE.Vector3(-0.145, -0.07, 0.02),
    new THREE.Vector3(-0.128, -0.1, 0.012), new THREE.Vector3(-0.118, -0.115, 0.0),
  ]);
  const thong = new THREE.Mesh(new THREE.TubeGeometry(thongPath, 20, 0.0022, 5), thongMat);
  thong.name = 'thong';
  g.add(thong);
  return g;
}

// The gloved hand (async). Resolves to a group in the machete's frame, or null.
export async function loadHand() {
  try {
    const gltf = await gltfLoader().loadAsync(`${import.meta.env.BASE_URL}models/hand.glb`);
    const out = new THREE.Group();
    const leatherN = grainNormal('leather'), clothN = grainNormal('cloth');
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const cloth = /sleeve/i.test(o.name) || /canvas/i.test(o.material?.name || '');
      let geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      geo = boxUV(geo, cloth ? 22 : 34);
      // fresh float normals (the file's are quantized to 8 bits: recomputing into those clamps)
      geo.deleteAttribute('normal');
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: cloth ? 0.95 : 0.62, metalness: 0,
        normalMap: cloth ? clothN : leatherN, normalScale: new THREE.Vector2(cloth ? 0.5 : 0.35, cloth ? 0.5 : 0.35),
        envMapIntensity: cloth ? 0.3 : 0.6,
        // the baked colours read orange under the jungle sun: a duller, darker leather
        color: cloth ? 0xd8d8d0 : 0xa89a90,
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = cloth ? 'sleeve' : 'glove';
      out.add(m);
    });
    return out;
  } catch (err) {
    console.warn('hand model failed to load', err);
    return null;
  }
}
