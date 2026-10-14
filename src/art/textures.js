// Procedural texture library. Every texture in the game is painted here with
// the 2D canvas API — no image files needed. Tileable textures wrap their
// strokes across edges so they repeat seamlessly on terrain and props.
import * as THREE from 'three';
import { mulberry32 } from '../utils/rng.js';
import { smoothstep } from '../utils/math.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- helpers

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const hsl = (h, s, l, a = 1) =>
  `hsla(${h.toFixed(1)}, ${Math.max(0, Math.min(100, s)).toFixed(1)}%, ${Math.max(0, Math.min(100, l)).toFixed(1)}%, ${a})`;

function canvasTexture(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Alpha cut-outs (leaves, grass): bleed edge colours into the transparent
// area so mipmaps don't produce dark halos, then upload as a DataTexture
// so the browser can't throw away colour under zero alpha.
function alphaTexture(c) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const n = w * h;
  const pr = new Float32Array(n), pg = new Float32Array(n), pb = new Float32Array(n), pa = new Float32Array(n);
  let ar = 0, ag = 0, ab = 0, an = 0;
  for (let i = 0; i < n; i++) {
    const a = src[i * 4 + 3] / 255;
    pr[i] = src[i * 4] * a; pg[i] = src[i * 4 + 1] * a; pb[i] = src[i * 4 + 2] * a; pa[i] = a;
    if (a > 0.5) { ar += src[i * 4]; ag += src[i * 4 + 1]; ab += src[i * 4 + 2]; an++; }
  }
  const avg = an ? [ar / an, ag / an, ab / an] : [80, 120, 60];
  // Two separable box-blur passes (radius 6) of premultiplied colour.
  const blur = (arr) => {
    const tmp = new Float32Array(n), R = 6;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -R; x <= R; x++) acc += arr[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc;
        acc += arr[y * w + Math.min(w - 1, x + R + 1)] - arr[y * w + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -R; y <= R; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        arr[y * w + x] = acc;
        acc += tmp[Math.min(h - 1, y + R + 1) * w + x] - tmp[Math.max(0, y - R) * w + x];
      }
    }
  };
  const br = pr.slice(), bg = pg.slice(), bb = pb.slice(), ba = pa.slice();
  blur(br); blur(bg); blur(bb); blur(ba);
  const out = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = ((h - 1 - y) * w + x) * 4; // flip rows: DataTexture row 0 is the bottom
      const a = src[i * 4 + 3];
      if (a > 8) {
        out[o] = src[i * 4]; out[o + 1] = src[i * 4 + 1]; out[o + 2] = src[i * 4 + 2];
      } else if (ba[i] > 0.001) {
        out[o] = br[i] / ba[i]; out[o + 1] = bg[i] / ba[i]; out[o + 2] = bb[i] / ba[i];
      } else {
        out[o] = avg[0]; out[o + 1] = avg[1]; out[o + 2] = avg[2];
      }
      out[o + 3] = a;
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Periodic value noise in [0,1]; `cells` must divide nicely into size.
function periodicNoise(size, cells, seed, octaves = 4, gain = 0.5) {
  const out = new Float32Array(size * size);
  const r = mulberry32(seed);
  let amp = 1, norm = 0, c = cells;
  for (let o = 0; o < octaves && c <= size; o++) {
    const g = new Float32Array(c * c);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * c, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy), y1 = (y0 + 1) % c;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * c, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx), x1 = (x0 + 1) % c;
        const a = g[y0 * c + x0], b = g[y0 * c + x1], d = g[y1 * c + x0], e = g[y1 * c + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (d + (e - d) * sx) * sy);
      }
    }
    norm += amp;
    amp *= gain;
    c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function paintNoise(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const c = fn(i, x, y);
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Draw something at (x,y) and its wrapped copies so tiles repeat cleanly.
function wrapped(size, x, y, margin, fn) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const px = x + dx * size, py = y + dy * size;
      if (px > -margin && px < size + margin && py > -margin && py < size + margin) fn(px, py);
    }
  }
}

function leafPath(ctx, len, wid, tipCurl = 0) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.22, -wid * 1.05, len * 0.72, -wid * 0.95, len, tipCurl);
  ctx.bezierCurveTo(len * 0.72, wid * 0.85, len * 0.22, wid * 1.0, 0, 0);
  ctx.closePath();
}

// A single shaded leaf with midrib and veins, drawn along +x from (x,y).
function drawLeaf(ctx, x, y, angle, len, wid, h, s, l, opts = {}) {
  const { veins = true, alpha = 1, curl = 0 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  leafPath(ctx, len, wid, curl * wid);
  const g = ctx.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, hsl(h, s, l + 7));
  g.addColorStop(0.48, hsl(h, s + 4, l + 2));
  g.addColorStop(0.52, hsl(h, s, l - 3));
  g.addColorStop(1, hsl(h + 4, s - 4, l - 9));
  ctx.fillStyle = g;
  ctx.fill();
  const g2 = ctx.createLinearGradient(0, 0, len, 0);
  g2.addColorStop(0, 'rgba(10,20,0,0.35)');
  g2.addColorStop(0.35, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(255,250,190,0.10)');
  ctx.fillStyle = g2;
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, wid * 0.05);
  ctx.strokeStyle = 'rgba(8,24,4,0.35)';
  ctx.stroke();
  if (veins && wid > 3) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, wid * 0.06, len * 0.96, curl * wid * 0.9);
    ctx.strokeStyle = hsl(h - 25, s + 10, l + 32, 0.55);
    ctx.lineWidth = Math.max(0.8, wid * 0.09);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.4, wid * 0.035);
    ctx.strokeStyle = hsl(h - 20, s, l + 25, 0.25);
    ctx.beginPath();
    const nv = Math.max(3, Math.round(len / (wid * 0.9)));
    for (let k = 1; k < nv; k++) {
      const t = k / (nv + 0.5);
      const vx = len * t;
      const w = wid * Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.88;
      ctx.moveTo(vx, 0);
      ctx.quadraticCurveTo(vx + len * 0.06, -w * 0.45, vx + len * 0.13, -w);
      ctx.moveTo(vx, 0);
      ctx.quadraticCurveTo(vx + len * 0.06, w * 0.45, vx + len * 0.13, w);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------ foliage

// Rosette of broad leaves; used on canopy cards and bushes.
export function leafClusterTexture(seed, { hue = 108, sat = 52, light = 30, count = 36 } = {}) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const core = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.24);
  core.addColorStop(0, hsl(hue, sat, light * 0.8));
  core.addColorStop(0.7, hsl(hue, sat, light * 0.75));
  core.addColorStop(1, hsl(hue, sat, light * 0.7, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.24, 0, TAU);
  ctx.fill();
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const ang = r() * TAU;
    const sr = Math.sqrt(r()) * S * 0.16;
    const x = S / 2 + Math.cos(ang) * sr;
    const y = S / 2 + Math.sin(ang) * sr;
    const len = S * (0.2 + r() * 0.12);
    const wid = len * (0.24 + r() * 0.14);
    drawLeaf(ctx, x, y, ang + (r() - 0.5) * 2.0, len, wid,
      hue + (r() - 0.5) * 16, sat + (r() - 0.5) * 16, light * (0.72 + 0.55 * t) + (r() - 0.5) * 6,
      { curl: (r() - 0.5) * 0.6 });
  }
  return alphaTexture(c);
}

// Long palm frond: rachis runs up the centre, base at the bottom.
export function palmFrondTexture(seed, { hue: H0 = 88, sat: S0 = 50, light: L0 = 26 } = {}) {
  const W = 128, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  for (let y = H - 26; y > 8; y -= 6.5) {
    const t = 1 - y / H;
    const L = 78 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)), 0.65);
    if (L < 6) continue;
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * (0.72 + r() * 0.16 + t * 0.15);
      const hue = H0 + r() * 18 * (S0 / 50) + t * 6;
      const light = L0 + r() * 10 + t * 6;
      drawLeaf(ctx, W / 2, y + r() * 2, a, L * (0.85 + r() * 0.2), 4.2 + r() * 1.4, hue, S0, light,
        { veins: false, curl: side * 0.4 });
      // dry brown tip on a few leaflets
      if (r() < 0.08) {
        ctx.save();
        ctx.translate(W / 2, y);
        ctx.rotate(a);
        ctx.fillStyle = hsl(36, 40, 34, 0.8);
        ctx.fillRect(L * 0.75, -2, L * 0.25, 4);
        ctx.restore();
      }
    }
  }
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, hsl(48, 45, 38));
  g.addColorStop(0.5, hsl(80, 40, 36));
  g.addColorStop(1, hsl(90, 40, 34));
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  for (let y = H; y > 2; y -= 4) {
    const t = 1 - y / H;
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, y);
    ctx.lineTo(W / 2, y - 5);
    ctx.stroke();
  }
  return alphaTexture(c);
}

// Fern frond: denser, shorter, lobed pinnae.
export function fernTexture(seed, hue = 96) {
  const W = 128, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  for (let y = H - 14; y > 6; y -= 5.2) {
    const t = 1 - y / H;
    const L = 60 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)), 0.8);
    if (L < 4) continue;
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * (1.15 - t * 0.3 + (r() - 0.5) * 0.08);
      const light = 24 + t * 10 + r() * 5;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(a);
      // lobes
      const lobes = Math.max(3, Math.floor(L / 5));
      for (let k = 0; k < lobes; k++) {
        const u = k / lobes;
        const lx = L * u + 3;
        const lw = Math.max(2, 3.8 * (1 - u * 0.55));
        ctx.fillStyle = hsl(hue + u * 10 + r() * 6, 55, light + u * 6);
        ctx.beginPath();
        ctx.ellipse(lx, -lw * 0.6, lw * 1.2, lw, -0.5, 0, TAU);
        ctx.ellipse(lx, lw * 0.6, lw * 1.2, lw, 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = hsl(hue - 10, 40, light - 8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L, 0);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.strokeStyle = hsl(70, 35, 26);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, 4);
  ctx.stroke();
  return alphaTexture(c);
}

// Big banana / elephant-ear leaf with wind tears.
export function bananaLeafTexture(seed) {
  const W = 128, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 2);
    ctx.bezierCurveTo(4, H * 0.82, 2, H * 0.25, W / 2, 3);
    ctx.bezierCurveTo(W - 2, H * 0.25, W - 4, H * 0.82, W / 2, H - 2);
    ctx.closePath();
  };
  shape();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, hsl(100, 48, 22));
  g.addColorStop(0.35, hsl(96, 55, 33));
  g.addColorStop(0.5, hsl(90, 55, 38));
  g.addColorStop(0.65, hsl(98, 52, 30));
  g.addColorStop(1, hsl(104, 46, 20));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  // lateral veins
  ctx.lineWidth = 1;
  for (let y = H - 10; y > 6; y -= 4) {
    ctx.strokeStyle = `rgba(200,240,140,${0.06 + r() * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(W / 2, y);
    ctx.quadraticCurveTo(W * 0.25, y - 6, 0, y - 22);
    ctx.moveTo(W / 2, y);
    ctx.quadraticCurveTo(W * 0.75, y - 6, W, y - 22);
    ctx.stroke();
  }
  // dry yellow edges
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(150,130,40,0.35)';
  shape();
  ctx.stroke();
  ctx.restore();
  // midrib
  const mg = ctx.createLinearGradient(0, H, 0, 0);
  mg.addColorStop(0, hsl(70, 45, 52));
  mg.addColorStop(1, hsl(85, 45, 42));
  ctx.strokeStyle = mg;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, 6);
  ctx.stroke();
  // wind tears along the vein direction
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 9; i++) {
    const y = H * (0.15 + r() * 0.7);
    const side = r() < 0.5 ? -1 : 1;
    const depth = 0.4 + r() * 0.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 + side * W * 0.5, y - 22);
    ctx.lineTo(W / 2 + side * W * 0.5 * (1 - depth), y - 22 * (1 - depth) - 3);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  return alphaTexture(c);
}

export function grassTexture(seed) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  for (let i = 0; i < 34; i++) {
    const bx = S * (0.2 + r() * 0.6);
    const hgt = S * (0.55 + r() * 0.42);
    const lean = (r() - 0.5) * S * 0.55;
    const w = 3 + r() * 5;
    const dry = r() < 0.12;
    const g = ctx.createLinearGradient(0, S, 0, S - hgt);
    if (dry) {
      g.addColorStop(0, hsl(50, 30, 22));
      g.addColorStop(1, hsl(48, 45, 55));
    } else {
      const hh = 85 + r() * 25;
      g.addColorStop(0, hsl(hh + 10, 50, 12));
      g.addColorStop(0.5, hsl(hh, 50, 28));
      g.addColorStop(1, hsl(hh - 15, 55, 46));
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - w, S);
    ctx.quadraticCurveTo(bx - w * 0.5 + lean * 0.3, S - hgt * 0.6, bx + lean, S - hgt);
    ctx.quadraticCurveTo(bx + w * 0.5 + lean * 0.3, S - hgt * 0.6, bx + w, S);
    ctx.closePath();
    ctx.fill();
  }
  return alphaTexture(c);
}

// One broad leaf filling the card, base at the bottom, tip at the top, for
// frondStrip leaves (u across, v along). `heart` adds the basal lobes of an
// elephant ear; `variegate` paints pale veins like a Alocasia.
export function broadLeafTexture(seed, { hue = 100, sat = 50, light = 30, heart = 0, variegate = 0 } = {}) {
  const W = 256, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const cx = W / 2, base = H * (heart ? 0.2 : 0.02), tip = 4;
  const outline = () => {
    ctx.beginPath();
    if (heart) {
      // petiole joins at `base`; lobes hang below it to the card's bottom edge
      ctx.moveTo(cx, H - base);
      ctx.bezierCurveTo(cx - W * 0.12, H - 2, cx - W * 0.5, H - 6, cx - W * 0.48, H * 0.55);
      ctx.bezierCurveTo(cx - W * 0.44, H * 0.28, cx - W * 0.1, tip + 30, cx, tip);
      ctx.bezierCurveTo(cx + W * 0.1, tip + 30, cx + W * 0.44, H * 0.28, cx + W * 0.48, H * 0.55);
      ctx.bezierCurveTo(cx + W * 0.5, H - 6, cx + W * 0.12, H - 2, cx, H - base);
    } else {
      ctx.moveTo(cx, H - 2);
      ctx.bezierCurveTo(cx - W * 0.55, H * 0.75, cx - W * 0.42, H * 0.2, cx, tip);
      ctx.bezierCurveTo(cx + W * 0.42, H * 0.2, cx + W * 0.55, H * 0.75, cx, H - 2);
    }
    ctx.closePath();
  };
  outline();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, hsl(hue, sat, light - 6));
  g.addColorStop(0.45, hsl(hue, sat + 4, light + 4));
  g.addColorStop(0.55, hsl(hue, sat, light + 1));
  g.addColorStop(1, hsl(hue + 4, sat - 4, light - 8));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // tip highlight and a darker, older base
  const g2 = ctx.createLinearGradient(0, H, 0, 0);
  g2.addColorStop(0, 'rgba(0,10,0,0.25)');
  g2.addColorStop(0.5, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(255,255,200,0.12)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
  const midY = H - base;
  ctx.strokeStyle = hsl(hue - 30, sat - 10, light + 30 + variegate * 25, 0.6 + variegate * 0.3);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx, midY);
  ctx.lineTo(cx, tip + 6);
  ctx.stroke();
  ctx.lineWidth = 2 + variegate * 1.5;
  ctx.strokeStyle = hsl(hue - 25, sat - 10, light + 22 + variegate * 30, 0.4 + variegate * 0.4);
  const nv = 7;
  for (let k = 0; k < nv; k++) {
    const y = midY - (midY - tip) * (k + 0.6) / (nv + 0.5);
    const spread = W * 0.46 * Math.sin(Math.PI * Math.min(1, (midY - y) / (midY - tip) * 1.1 + 0.15));
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + s * spread * 0.5, y - 10, cx + s * spread, y - 40 - r() * 20);
      ctx.stroke();
    }
  }
  ctx.restore();
  outline();
  ctx.strokeStyle = 'rgba(10,25,5,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return alphaTexture(c);
}

// --------------------------------------------------------- tiled surfaces

export function barkTexture(seed, { hue = 26, sat = 20, light = 30 } = {}) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 4, seed, 5);
  const n2 = periodicNoise(S, 16, seed + 9, 3);
  paintNoise(ctx, S, (i, x) => {
    const streak = 0.5 + 0.5 * Math.sin((x / S) * TAU * 9 + n[i] * 6);
    const v = (0.35 + n[i] * 0.5 + streak * 0.2 + n2[i] * 0.15) * light;
    const col = new THREE.Color().setHSL(hue / 360, sat / 100, Math.min(0.9, v / 100));
    return [col.r * 255, col.g * 255, col.b * 255];
  });
  // deep fissures
  for (let k = 0; k < 22; k++) {
    let x = r() * S;
    const w = 1 + r() * 3.5;
    ctx.strokeStyle = `rgba(15,10,6,${(0.35 + r() * 0.4) * (light > 45 ? 0.6 : 1)})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    const y0 = r() * S;
    const len = S * (0.3 + r() * 0.9);
    ctx.moveTo(x, y0);
    for (let y = y0; y < y0 + len; y += 8) {
      x += (r() - 0.5) * 4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    // wrap vertically/horizontally by re-drawing shifted copies
    for (const [dx, dy] of [[S, 0], [-S, 0], [0, -S]]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.stroke();
      ctx.restore();
    }
  }
  // lichen
  for (let k = 0; k < 30; k++) {
    const x = r() * S, y = r() * S, rad = 3 + r() * 10;
    wrapped(S, x, y, rad, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(170,180,140,${0.25 + r() * 0.2})`);
      g.addColorStop(1, 'rgba(170,180,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, TAU);
      ctx.fill();
    });
  }
  return canvasTexture(c, { repeat: true });
}

// Palm trunk: horizontal leaf-scar rings over fibrous grey-brown.
export function palmBarkTexture(seed) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 5);
  paintNoise(ctx, S, (i, x) => {
    const v = 0.6 + n[i] * 0.5 + Math.sin((x / S) * TAU * 24) * 0.04;
    return [88 * v, 76 * v, 60 * v];
  });
  for (let y = 0; y < S; y += 21.333) {
    const wob = r() * 4;
    for (const dy of [0, 4]) {
      ctx.strokeStyle = dy ? 'rgba(200,190,160,0.18)' : 'rgba(25,18,10,0.65)';
      ctx.lineWidth = dy ? 2 : 3 + r() * 2;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + dy + Math.sin((x / S) * TAU * 2 + wob) * 2.5);
      ctx.stroke();
    }
  }
  return canvasTexture(c, { repeat: true });
}

// ------------------------------------------------------------ ground layers
//
// The four terrain layers are painted together with a height field (kept on
// texture.userData.height, 0..1 per pixel). The terrain shader packs the four
// heights into one texture and uses them for height-aware blending (moss
// fills the gaps between leaves, pebbles poke through mud) and for bump.

const GROUND = 1024;

// Add a soft dome of radius `rad` and height `amp` into a wrapped field.
function splatDome(H, S, cx, cy, rad, amp, sharp = 0.5, mode = 'max') {
  const r2 = rad * rad;
  const x0 = Math.floor(cx - rad), x1 = Math.ceil(cx + rad);
  const y0 = Math.floor(cy - rad), y1 = Math.ceil(cy + rad);
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % S) + S) % S, dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const v = amp * Math.pow(1 - d2 / r2, sharp);
      const i = yy * S + (((x % S) + S) % S);
      if (mode === 'max') { if (v > H[i]) H[i] = v; } else H[i] += v;
    }
  }
}

// Bake soft top-left light into a colour array from a height field, so the
// relief reads even where the bump map is too fine to resolve.
function bakeRelief(H, S, k) {
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S;
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S, xp = (x + 1) % S;
      const dx = H[y * S + xp] - H[y * S + xm];
      const dy = H[yp + x] - H[ym + x];
      out[y * S + x] = Math.max(-0.6, Math.min(0.6, (-dx - dy) * k));
    }
  }
  return out;
}

function rgbTexture(S, R, G, B, H) {
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    d[i * 4] = R[i]; d[i * 4 + 1] = G[i]; d[i * 4 + 2] = B[i]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = canvasTexture(c, { repeat: true });
  t.userData.height = H;
  return t;
}

// A fallen leaf seen from above: lens, lance or broad heart shape.
function litterLeafPath(ctx, kind, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  if (kind === 0) { // elliptic
    ctx.bezierCurveTo(len * 0.25, -wid * 1.1, len * 0.75, -wid * 1.0, len, 0);
    ctx.bezierCurveTo(len * 0.75, wid * 1.0, len * 0.25, wid * 1.1, 0, 0);
  } else if (kind === 1) { // lance
    ctx.bezierCurveTo(len * 0.15, -wid * 0.9, len * 0.55, -wid * 0.8, len, 0);
    ctx.bezierCurveTo(len * 0.55, wid * 0.8, len * 0.15, wid * 0.9, 0, 0);
  } else { // broad, heart-based
    ctx.bezierCurveTo(-len * 0.12, -wid * 1.3, len * 0.6, -wid * 1.25, len, 0);
    ctx.bezierCurveTo(len * 0.6, wid * 1.25, -len * 0.12, wid * 1.3, 0, 0);
  }
  ctx.closePath();
}

// Forest floor: dark soil under overlapping fallen leaves, twigs and seeds.
// Tile = 3.2 m at 1024 px, so leaves are 4-14 cm.
export function litterTexture(seed) {
  const S = GROUND;
  const c = makeCanvas(S), hc = makeCanvas(S);
  const ctx = c.getContext('2d'), hx = hc.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  const g = periodicNoise(S, 256, seed + 5, 2);
  paintNoise(ctx, S, (i) => {
    const v = 0.6 + n[i] * 0.5 + (g[i] - 0.5) * 0.35;
    return [44 * v, 32 * v, 21 * v];
  });
  hx.fillStyle = '#000';
  hx.fillRect(0, 0, S, S);
  const N = 2300;
  for (let k = 0; k < N; k++) {
    const x = r() * S, y = r() * S;
    const kind = r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2;
    const len = (kind === 2 ? 26 : 18) + r() * (kind === 2 ? 22 : 26);
    const wid = len * (kind === 1 ? 0.16 + r() * 0.06 : 0.26 + r() * 0.12);
    const t = r();
    let h, s, l;
    if (t < 0.5) { h = 22 + r() * 14; s = 30 + r() * 20; l = 16 + r() * 12; } // brown
    else if (t < 0.72) { h = 34 + r() * 10; s = 38 + r() * 18; l = 24 + r() * 12; } // tan / ochre
    else if (t < 0.84) { h = 12 + r() * 10; s = 40 + r() * 16; l = 20 + r() * 10; } // rust
    else if (t < 0.94) { h = 55 + r() * 25; s = 22 + r() * 14; l = 20 + r() * 8; } // olive, fresh
    else { h = 28; s = 12; l = 10 + r() * 6; } // rotting, near black
    // later leaves lie on top: older ones are darker and flatter
    const age = 1 - k / N;
    l *= 0.78 + 0.32 * (1 - age);
    const a = r() * TAU, curl = r() < 0.25;
    const hv = 0.25 + 0.7 * Math.pow(k / N, 0.8);
    wrapped(S, x, y, len + 6, (px, py) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.shadowColor = 'rgba(8,5,2,0.6)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;
      litterLeafPath(ctx, kind, len, wid);
      const gr = ctx.createLinearGradient(0, -wid, 0, wid);
      gr.addColorStop(0, hsl(h, s, l + (curl ? 10 : 4)));
      gr.addColorStop(0.5, hsl(h, s, l));
      gr.addColorStop(1, hsl(h + 3, s - 5, l - (curl ? 8 : 4)));
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // midrib and a few veins
      ctx.strokeStyle = hsl(h + 6, s - 10, l + 10, 0.5);
      ctx.lineWidth = Math.max(0.7, wid * 0.08);
      ctx.beginPath();
      ctx.moveTo(len * 0.02, 0);
      ctx.lineTo(len * 0.95, 0);
      ctx.stroke();
      if (wid > 5) {
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = hsl(h, s - 8, l - 6, 0.45);
        ctx.beginPath();
        for (let v = 1; v < 5; v++) {
          const vx = len * v / 5.4;
          ctx.moveTo(vx, 0); ctx.lineTo(vx + len * 0.1, -wid * 0.7);
          ctx.moveTo(vx, 0); ctx.lineTo(vx + len * 0.1, wid * 0.7);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(10,6,2,${0.25 + age * 0.25})`;
      ctx.lineWidth = 0.8;
      litterLeafPath(ctx, kind, len, wid);
      ctx.stroke();
      ctx.restore();
      // height: stacked leaves, curled ones raised at the edges
      hx.save();
      hx.translate(px, py);
      hx.rotate(a);
      litterLeafPath(hx, kind, len, wid);
      const hg = hx.createLinearGradient(0, -wid, 0, wid);
      const v0 = Math.round(hv * 255), ve = Math.round(Math.min(1, hv + (curl ? 0.18 : 0.04)) * 255);
      hg.addColorStop(0, `rgb(${ve},${ve},${ve})`);
      hg.addColorStop(0.5, `rgb(${v0},${v0},${v0})`);
      hg.addColorStop(1, `rgb(${ve},${ve},${ve})`);
      hx.fillStyle = hg;
      hx.fill();
      hx.restore();
    });
  }
  // twigs and seed pods on top
  ctx.lineCap = hx.lineCap = 'round';
  for (let k = 0; k < 60; k++) {
    const x = r() * S, y = r() * S, a = r() * TAU, len = 40 + r() * 120, w = 2 + r() * 4;
    const bend = (r() - 0.5) * 0.6, l = 14 + r() * 14;
    wrapped(S, x, y, len, (px, py) => {
      const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
      const mx = px + Math.cos(a + bend) * len * 0.5, my = py + Math.sin(a + bend) * len * 0.5;
      ctx.save();
      ctx.shadowColor = 'rgba(8,5,2,0.6)';
      ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      ctx.strokeStyle = hsl(26, 28, l);
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = hsl(30, 25, l + 12, 0.6);
      ctx.lineWidth = w * 0.35;
      ctx.beginPath(); ctx.moveTo(px, py - w * 0.2); ctx.quadraticCurveTo(mx, my - w * 0.2, ex, ey - w * 0.2); ctx.stroke();
      hx.strokeStyle = '#fff';
      hx.lineWidth = w;
      hx.beginPath(); hx.moveTo(px, py); hx.quadraticCurveTo(mx, my, ex, ey); hx.stroke();
    });
  }
  for (let k = 0; k < 120; k++) {
    const x = r() * S, y = r() * S, rad = 2 + r() * 3.5;
    wrapped(S, x, y, rad + 4, (px, py) => {
      ctx.save();
      ctx.shadowColor = 'rgba(8,5,2,0.6)';
      ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
      ctx.fillStyle = hsl(20 + r() * 15, 35, 14 + r() * 10);
      ctx.beginPath(); ctx.ellipse(px, py, rad, rad * 0.75, r() * TAU, 0, TAU); ctx.fill();
      ctx.restore();
      hx.fillStyle = '#eee';
      hx.beginPath(); hx.arc(px, py, rad, 0, TAU); hx.fill();
    });
  }
  const hd = hx.getImageData(0, 0, S, S).data;
  const H = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) H[i] = hd[i * 4] / 255 * 0.85 + n[i] * 0.15;
  const t = canvasTexture(c, { repeat: true });
  t.userData.height = H;
  return t;
}

// Cushion moss: clumped domes with a fine fuzzy surface and a few leaves
// dropped on top. Tile = 2.6 m.
export function mossTexture(seed) {
  const S = GROUND;
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 5);
  const fine = periodicNoise(S, 512, seed + 1, 1);
  const mid = periodicNoise(S, 128, seed + 2, 2);
  const H = new Float32Array(S * S);
  for (let k = 0; k < 900; k++) splatDome(H, S, r() * S, r() * S, 14 + r() * 50, 0.35 + r() * 0.65, 0.6);
  for (let i = 0; i < S * S; i++) H[i] = H[i] * 0.75 + mid[i] * 0.15 + fine[i] * 0.1;
  const L = bakeRelief(H, S, 9);
  const R = new Uint8ClampedArray(S * S), G = new Uint8ClampedArray(S * S), B = new Uint8ClampedArray(S * S);
  for (let i = 0; i < S * S; i++) {
    const h = H[i], tone = n[i];
    // deep olive in the crevices, bright yellow-green on cushion tops
    const lit = 0.55 + h * 0.75 + L[i] + (fine[i] - 0.5) * 0.35;
    const yel = Math.max(0, tone - 0.45) * 1.4;
    R[i] = (38 + yel * 34) * lit;
    G[i] = (56 + yel * 14) * lit;
    B[i] = (20 + yel * 2) * lit;
  }
  const t = rgbTexture(S, R, G, B, H);
  // a scatter of dropped leaves and tiny sprigs, painted over the cushions
  const ctx = t.image.getContext('2d');
  for (let k = 0; k < 70; k++) {
    const x = r() * S, y = r() * S, len = 16 + r() * 22, a = r() * TAU;
    wrapped(S, x, y, len + 6, (px, py) => {
      ctx.save();
      ctx.translate(px, py); ctx.rotate(a);
      ctx.shadowColor = 'rgba(5,10,2,0.55)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 2.5;
      litterLeafPath(ctx, 0, len, len * 0.3);
      ctx.fillStyle = hsl(26 + r() * 12, 35, 18 + r() * 10);
      ctx.fill();
      ctx.restore();
    });
  }
  ctx.lineCap = 'round';
  for (let k = 0; k < 2600; k++) {
    const x = r() * S, y = r() * S, a = -Math.PI / 2 + (r() - 0.5) * 1.6, len = 3 + r() * 6;
    ctx.strokeStyle = hsl(75 + r() * 25, 50, 26 + r() * 22, 0.7);
    ctx.lineWidth = 1 + r();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  t.needsUpdate = true;
  return t;
}

// Weathered stone: warped strata, cracks and pale lichen. Tile = 4 m.
export function rockTexture(seed, { hue = 40, sat = 6, light = 42, strata = true } = {}) {
  const S = GROUND;
  const r = mulberry32(seed);
  const n = periodicNoise(S, 4, seed, 7, 0.55);
  const w = periodicNoise(S, 8, seed + 3, 3);
  const m = periodicNoise(S, 64, seed + 1, 3);
  const f = periodicNoise(S, 256, seed + 2, 2);
  const lich = periodicNoise(S, 16, seed + 4, 4);
  const H = new Float32Array(S * S);
  const bands = 3;
  const tone = new Float32Array(S * S); // each stratum its own shade
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      // strata: terraced bands along y, warped so they wander
      const bv = (y / S) * bands + (w[i] - 0.5) * 0.5; // gently wandering, never looping
      const bi = ((Math.floor(bv) % bands) + bands) % bands;
      const hb = Math.sin(bi * 12.9898 + seed) * 43758.5453;
      tone[i] = strata ? 0.85 + 0.3 * (hb - Math.floor(hb)) : 1;
      const step = bv - Math.floor(bv);
      const ledge = strata ? smoothstep(0, 0.35, step) * (1 - smoothstep(0.7, 1, step)) : 0.5;
      // river stones are water-worn: almost no fine grain
      H[i] = ledge * 0.3 + n[i] * 0.4 + m[i] * 0.12 + f[i] * (strata ? 0.04 : 0.01);
    }
  }
  // cracks: thin random walks, carved into the height afterwards
  const C = new Float32Array(S * S);
  for (let k = 0; k < 18; k++) {
    let x = r() * S, y = r() * S, a = r() * TAU;
    const steps = 40 + Math.floor(r() * 100), depth = 0.1 + r() * 0.12, w = 1.2 + r() * 1.0;
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.4;
      x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5;
      splatDome(C, S, x, y, w, depth, 1);
    }
  }
  for (let i = 0; i < S * S; i++) H[i] -= C[i];
  // relief from the rock body only: cracks stay dark lines, with no pale rims
  const HR = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) HR[i] = H[i] + C[i];
  const L = bakeRelief(HR, S, 7);
  const base = new THREE.Color();
  const R = new Uint8ClampedArray(S * S), G = new Uint8ClampedArray(S * S), B = new Uint8ClampedArray(S * S);
  for (let i = 0; i < S * S; i++) {
    const v = (0.55 + n[i] * 0.55 + (m[i] - 0.5) * 0.25 + (f[i] - 0.5) * (strata ? 0.1 : 0.05) + L[i] * (strata ? 1 : 0.4)) * light * tone[i];
    const crack = Math.min(1, C[i] * 3.5);
    base.setHSL(hue / 360, sat / 100, Math.max(0.03, Math.min(0.85, (v / 100) * (1 - crack * 0.7))));
    let rr = base.r, gg = base.g, bb = base.b;
    // lichen: soft pale grey-green blooms on the upper part of each band
    const lc = Math.min(0.35, Math.max(0, lich[i] - 0.6) * 3 * (0.6 + H[i]));
    rr += (0.55 - rr) * lc; gg += (0.58 - gg) * lc; bb += (0.46 - bb) * lc;
    R[i] = rr * 255; G[i] = gg * 255; B[i] = bb * 255;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < S * S; i++) { lo = Math.min(lo, H[i]); hi = Math.max(hi, H[i]); }
  for (let i = 0; i < S * S; i++) H[i] = (H[i] - lo) / (hi - lo);
  return rgbTexture(S, R, G, B, H);
}

// River mud: dark wet silt with pebbles, grit and dried edges. Tile = 3 m.
export function mudTexture(seed) {
  const S = GROUND;
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  const g = periodicNoise(S, 256, seed + 7, 2);
  const H = new Float32Array(S * S);
  const P = new Float32Array(S * S); // pebble mask
  for (let i = 0; i < S * S; i++) H[i] = n[i] * 0.3;
  const tone = new Float32Array(S * S);
  for (let k = 0, placed = 0; k < 4000 && placed < 45; k++) {
    const x = r() * S, y = r() * S, rad = 2.5 + Math.pow(r(), 3) * 10;
    const i0 = Math.floor(y) * S + Math.floor(x);
    if (P[i0] > 0 || n[i0] < 0.55) continue; // cluster in gravelly patches
    placed++;
    splatDome(P, S, x, y, rad, 1, 0.35);
    const tv = r();
    splatDome(tone, S, x, y, rad, tv, 0.01);
  }
  for (let i = 0; i < S * S; i++) H[i] = Math.max(H[i], P[i] * 0.7 + 0.3);
  const L = bakeRelief(H, S, 4);
  const R = new Uint8ClampedArray(S * S), G = new Uint8ClampedArray(S * S), B = new Uint8ClampedArray(S * S);
  for (let i = 0; i < S * S; i++) {
    const wet = 1 - n[i];
    const v = (0.55 + n[i] * 0.6 + (g[i] - 0.5) * 0.3) * (1 - wet * 0.35);
    let rr = 78 * v, gg = 60 * v, bb = 40 * v;
    if (P[i] > 0.02) {
      const pv = 0.6 + tone[i] * 0.4 + L[i] * 1.2;
      const pr = 62 + tone[i] * 22, pg = 56 + tone[i] * 18, pb = 45 + tone[i] * 12;
      const a = Math.min(1, P[i] * 6);
      rr += (pr * pv - rr) * a; gg += (pg * pv - gg) * a; bb += (pb * pv - bb) * a;
    } else {
      // dark ring of wet silt right around each pebble
      rr *= 1 + L[i] * 0.15; gg *= 1 + L[i] * 0.15; bb *= 1 + L[i] * 0.15;
    }
    R[i] = rr; G[i] = gg; B[i] = bb;
  }
  return rgbTexture(S, R, G, B, H);
}

// Pack the four layers' height fields (litter, moss, rock, mud) into one
// linear RGBA texture, rows flipped to match the canvas textures' flipY.
export function packHeights(layers) {
  const S = GROUND;
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x, o = ((S - 1 - y) * S + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = Math.round(Math.max(0, Math.min(1, layers[c].userData.height[i])) * 255);
    }
  }
  const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// A loose spray of fallen leaves on a transparent card, for the 3D litter
// piles that sit on the forest floor.
export function fallenLeavesTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  for (let k = 0; k < 160; k++) {
    const rad = Math.sqrt(r()) * S * 0.38;
    const a0 = r() * TAU;
    const x = S / 2 + Math.cos(a0) * rad, y = S / 2 + Math.sin(a0) * rad;
    const kind = r() < 0.6 ? 0 : 2, len = 22 + r() * 30, wid = len * (0.28 + r() * 0.12);
    const t = r();
    const h = t < 0.6 ? 22 + r() * 16 : t < 0.85 ? 36 + r() * 10 : 60 + r() * 20;
    const s = 30 + r() * 25, l = t < 0.85 ? 18 + r() * 18 : 14 + r() * 12;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(r() * TAU);
    litterLeafPath(ctx, kind, len, wid);
    const gr = ctx.createLinearGradient(0, -wid, 0, wid);
    gr.addColorStop(0, hsl(h, s, l + 8));
    gr.addColorStop(1, hsl(h + 3, s - 5, l - 6));
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = hsl(h + 6, s - 10, l + 12, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(len * 0.04, 0); ctx.lineTo(len * 0.94, 0); ctx.stroke();
    ctx.restore();
  }
  return alphaTexture(c);
}
// Carved temple stone: staggered blocks with mortar, chips and glyphs.
export function stoneBlockTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  const pit = periodicNoise(S, 128, seed + 3, 2);
  const grain = periodicNoise(S, 64, seed + 5, 3);
  paintNoise(ctx, S, (i) => {
    const v = 0.65 + n[i] * 0.5;
    return [70 * v, 68 * v, 56 * v];
  });
  const rows = 4, rh = S / rows;
  const glyph = (cx, cy, k) => {
    // carved relief: a dark lower-right stroke and a light upper-left one
    const path = () => {
      ctx.beginPath();
      if (k === 0) { // stepped fret
        ctx.moveTo(cx - 26, cy + 18); ctx.lineTo(cx - 26, cy - 18); ctx.lineTo(cx + 8, cy - 18);
        ctx.lineTo(cx + 8, cy + 4); ctx.lineTo(cx - 8, cy + 4); ctx.lineTo(cx - 8, cy - 4);
      } else { // eye and brow
        ctx.ellipse(cx, cy, 22, 11, 0, 0, TAU);
        ctx.moveTo(cx + 6, cy); ctx.arc(cx, cy, 6, 0, TAU);
        ctx.moveTo(cx - 26, cy - 18); ctx.quadraticCurveTo(cx, cy - 30, cx + 26, cy - 18);
      }
    };
    ctx.lineWidth = 4;
    ctx.save(); ctx.translate(1.5, 1.5); path(); ctx.strokeStyle = 'rgba(15,12,8,0.3)'; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(-1.5, -1.5); path(); ctx.strokeStyle = 'rgba(255,250,230,0.15)'; ctx.stroke(); ctx.restore();
  };
  for (let row = 0; row < rows; row++) {
    let x = -r() * 120;
    while (x < S) {
      const w = 90 + r() * 110;
      const y = row * rh;
      const l = 40 + r() * 12;
      const hue = 38 + r() * 14;
      const sag = r() * 3;
      const drawBlock = (bx) => {
        const g = ctx.createLinearGradient(0, y, 0, y + rh);
        g.addColorStop(0, hsl(hue, 10, l + 5, 0.8));
        g.addColorStop(1, hsl(hue, 10, l - 6, 0.8));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(bx + 3, y + 3 + sag, w - 6, rh - 6 - sag, 6);
        ctx.fill();
        // water stains running down from the top edge
        for (let k = 0; k < 3; k++) {
          const sx = bx + 10 + r() * (w - 20), sw = 6 + r() * 18, sl = rh * (0.3 + r() * 0.6);
          const sg = ctx.createLinearGradient(0, y, 0, y + sl);
          sg.addColorStop(0, 'rgba(20,24,14,0.22)');
          sg.addColorStop(1, 'rgba(20,24,14,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(sx, y + 4, sw, sl);
        }
        ctx.strokeStyle = 'rgba(25,22,18,0.4)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(bx + 2, y + 2 + sag, w - 4, rh - 4 - sag, 6);
        ctx.stroke();
        // moss in the bed joint along the bottom of each course
        ctx.strokeStyle = 'rgba(70,95,35,0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx + 4, y + rh - 2);
        for (let px = bx + 4; px < bx + w - 4; px += 6) ctx.lineTo(px, y + rh - 2 - r() * 3);
        ctx.stroke();
      };
      drawBlock(x);
      if (x + w > S) drawBlock(x - S);
      if (x < 0) drawBlock(x + S);
      if (r() < 0.06 && w > 120 && x > 0 && x + w < S) glyph(x + w / 2, row * rh + rh / 2, Math.floor(r() * 2));
      x += w;
    }
  }
  // pitting and grain from noise rather than painted dots
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const k = (pit[i] > 0.72 ? 0.88 : 1) * (0.92 + grain[i] * 0.16);
    d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: true });
}

export function plankTexture(seed, { stencil = false } = {}) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const planks = 4, ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    const l = 34 + r() * 10;
    ctx.fillStyle = hsl(30 + r() * 8, 32, l);
    ctx.fillRect(0, y, S, ph);
    for (let k = 0; k < 18; k++) {
      ctx.strokeStyle = `rgba(40,25,10,${0.15 + r() * 0.25})`;
      ctx.lineWidth = 0.6 + r() * 1.4;
      ctx.beginPath();
      const yy = y + r() * ph;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(S * 0.3, yy + (r() - 0.5) * 8, S * 0.7, yy + (r() - 0.5) * 8, S, yy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(15,8,2,0.8)';
    ctx.fillRect(0, y, S, 3);
    for (const nx of [10, S - 14]) {
      ctx.fillStyle = 'rgba(30,25,20,0.9)';
      ctx.beginPath();
      ctx.arc(nx, y + ph / 2, 2.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(130,60,20,0.4)';
      ctx.fillRect(nx - 1, y + ph / 2, 2, 12);
    }
  }
  // frame edge
  ctx.strokeStyle = 'rgba(20,12,4,0.85)';
  ctx.lineWidth = 14;
  ctx.strokeRect(0, 0, S, S);
  ctx.strokeStyle = hsl(30, 30, 28);
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, S - 12, S - 12);
  // mildew
  for (let k = 0; k < 25; k++) {
    const x = r() * S, y = S * (0.6 + r() * 0.4), rad = 6 + r() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(60,80,30,0.35)');
    g.addColorStop(1, 'rgba(60,80,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (stencil) {
    ctx.font = 'bold 34px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,16,10,0.55)';
    ctx.fillText('SUPPLY', S / 2, S / 2 + 4);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('No. 0' + Math.floor(r() * 90 + 10), S / 2, S / 2 + 30);
  }
  return canvasTexture(c);
}

export function rustTexture(seed) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 4, seed, 6);
  const n2 = periodicNoise(S, 16, seed + 5, 4);
  paintNoise(ctx, S, (i) => {
    const paint = n2[i] > 0.58;
    const v = 0.6 + n[i] * 0.6;
    if (paint) return [70 * v, 88 * v, 82 * v];
    return [120 * v, 62 * v, 30 * v];
  });
  for (let k = 0; k < 60; k++) {
    const x = r() * S;
    ctx.strokeStyle = `rgba(90,40,15,${0.1 + r() * 0.2})`;
    ctx.lineWidth = 1 + r() * 4;
    ctx.beginPath();
    const y = r() * S;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 6, y + 20 + r() * 80);
    ctx.stroke();
  }
  return canvasTexture(c, { repeat: true });
}

// Olive-drab aircraft skin with chipped paint, rivets and a tail number.
export function aircraftTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  const chips = periodicNoise(S, 64, seed + 2, 3);
  paintNoise(ctx, S, (i) => {
    const v = 0.7 + n[i] * 0.4;
    if (chips[i] > 0.72) return [112 * v, 70 * v, 40 * v];
    if (chips[i] > 0.68) return [138 * v, 138 * v, 128 * v];
    return [78 * v, 82 * v, 52 * v];
  });
  ctx.strokeStyle = 'rgba(20,20,10,0.5)';
  ctx.lineWidth = 2;
  for (let x = 0; x < S; x += 128) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(30,30,20,0.6)';
  for (let x = 0; x < S; x += 128) for (let y = 4; y < S; y += 12) ctx.fillRect(x + 4, y, 2, 2);
  ctx.font = 'bold 64px Arial Black, Impact, sans-serif';
  ctx.fillStyle = 'rgba(225,220,200,0.75)';
  ctx.fillText('N-47' + Math.floor(r() * 9), 150, 300);
  for (let k = 0; k < 50; k++) {
    const x = r() * S;
    ctx.strokeStyle = `rgba(80,45,20,${0.15 + r() * 0.2})`;
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath();
    const y = r() * S;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 30 + r() * 90);
    ctx.stroke();
  }
  return canvasTexture(c, { repeat: true });
}

export function clothTexture(seed, hue = 40) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 4, seed, 5);
  paintNoise(ctx, S, (i, x, y) => {
    const weave = ((x % 4 < 2) !== (y % 4 < 2)) ? 1.05 : 0.95;
    const v = (0.7 + n[i] * 0.45) * weave;
    const col = new THREE.Color().setHSL(hue / 360, 0.28, 0.42 * v);
    return [col.r * 255, col.g * 255, col.b * 255];
  });
  for (let k = 0; k < 14; k++) {
    const x = r() * S, y = r() * S, rad = 10 + r() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(50,40,20,0.35)');
    g.addColorStop(1, 'rgba(50,40,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return canvasTexture(c, { repeat: true });
}

// Machete blade: dark spine, ground bevel, bright cutting edge, wear.
export function bladeTexture() {
  const W = 512, H = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const r = mulberry32(77);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3a3c3e');
  g.addColorStop(0.12, '#55585b');
  g.addColorStop(0.55, '#8d9296');
  g.addColorStop(0.62, '#b8bdc0');
  g.addColorStop(0.9, '#d8dcde');
  g.addColorStop(1, '#f2f4f5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 260; k++) {
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '20,20,20'},${0.05 + r() * 0.12})`;
    ctx.lineWidth = 0.5 + r();
    const x = r() * W, y = r() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + r() * 50, y + (r() - 0.5) * 6);
    ctx.stroke();
  }
  for (let k = 0; k < 40; k++) {
    const x = r() * W, y = r() * H * 0.45, rad = 2 + r() * 9;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, 'rgba(120,60,20,0.55)');
    rg.addColorStop(1, 'rgba(120,60,20,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillStyle = 'rgba(30,30,30,0.45)';
  ctx.fillText('★ COLLINS & Co.', 60, 50);
  return canvasTexture(c);
}

export function handleWoodTexture() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(31);
  ctx.fillStyle = '#3b1f12';
  ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) {
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '110,55,30' : '20,8,4'},${0.2 + r() * 0.4})`;
    ctx.lineWidth = 0.6 + r() * 2;
    const y = r() * S;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 20, S * 0.6, y + (r() - 0.5) * 20, S, y + (r() - 0.5) * 10);
    ctx.stroke();
  }
  return canvasTexture(c, { repeat: true });
}

export function butterflyTexture(kind) {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  // Right wing pair drawn from the body at x=0; mirrored in geometry.
  const fore = () => {
    ctx.beginPath();
    ctx.moveTo(2, S * 0.5);
    ctx.bezierCurveTo(S * 0.3, S * 0.08, S * 0.9, S * 0.02, S * 0.96, S * 0.16);
    ctx.bezierCurveTo(S * 0.9, S * 0.4, S * 0.5, S * 0.5, 2, S * 0.52);
  };
  const hind = () => {
    ctx.beginPath();
    ctx.moveTo(2, S * 0.52);
    ctx.bezierCurveTo(S * 0.6, S * 0.5, S * 0.8, S * 0.75, S * 0.62, S * 0.92);
    ctx.bezierCurveTo(S * 0.4, S * 1.0, S * 0.15, S * 0.8, 2, S * 0.56);
  };
  const paint = (path) => {
    path();
    if (kind === 'morpho') {
      const g = ctx.createRadialGradient(S * 0.1, S * 0.5, 4, S * 0.1, S * 0.5, S * 0.85);
      g.addColorStop(0, '#0c2a6e');
      g.addColorStop(0.35, '#1f7cff');
      g.addColorStop(0.75, '#5fd0ff');
      g.addColorStop(0.86, '#08121c');
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(S * 0.1, S * 0.5, 4, S * 0.1, S * 0.5, S * 0.85);
      g.addColorStop(0, '#6b2a00');
      g.addColorStop(0.3, '#ff8a1c');
      g.addColorStop(0.75, '#ffb347');
      g.addColorStop(0.84, '#140800');
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0b0b0b';
    ctx.stroke();
  };
  paint(fore);
  paint(hind);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    ctx.arc(S * (0.6 + k * 0.06), S * (0.16 + k * 0.035), 2.2, 0, TAU);
    ctx.fill();
  }
  if (kind !== 'morpho') {
    ctx.strokeStyle = 'rgba(10,5,0,0.8)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(4, S * 0.51);
      ctx.lineTo(S * (0.4 + k * 0.12), S * (0.12 + k * 0.08));
      ctx.stroke();
    }
  }
  return alphaTexture(c);
}

// ------------------------------------------------------------- effects

export function glowTexture() {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c);
}

// Tileable water normal map built from periodic sine waves.
export function waterNormalTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const r = mulberry32(5);
  const waves = [];
  for (let i = 0; i < 18; i++) {
    const kx = Math.round((r() - 0.5) * 14), ky = Math.round((r() - 0.5) * 14);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1 / Math.hypot(kx, ky), p: r() * TAU });
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const ph = TAU * (w.kx * x + w.ky * y) / S + w.p;
        const cs = Math.cos(ph) * w.a;
        dx += cs * w.kx;
        dy += cs * w.ky;
      }
      const n = new THREE.Vector3(-dx * 0.09, -dy * 0.09, 1).normalize();
      const i = (y * S + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
