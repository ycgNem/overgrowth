// Procedural texture library. Every texture in the game is painted here with
// the 2D canvas API — no image files needed. Tileable textures wrap their
// strokes across edges so they repeat seamlessly on terrain and props.
import * as THREE from 'three';
import { mulberry32 } from '../utils/rng.js';

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
    const sr = r() * S * 0.12;
    const x = S / 2 + Math.cos(ang) * sr;
    const y = S / 2 + Math.sin(ang) * sr;
    const len = S * (0.22 + r() * 0.13);
    const wid = len * (0.2 + r() * 0.13);
    drawLeaf(ctx, x, y, ang + (r() - 0.5) * 0.7, len, wid,
      hue + (r() - 0.5) * 16, sat + (r() - 0.5) * 16, light * (0.72 + 0.55 * t) + (r() - 0.5) * 6,
      { curl: (r() - 0.5) * 0.6 });
  }
  return alphaTexture(c);
}

// Long palm frond: rachis runs up the centre, base at the bottom.
export function palmFrondTexture(seed) {
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
      const hue = 88 + r() * 18 + t * 6;
      const light = 26 + r() * 10 + t * 6;
      drawLeaf(ctx, W / 2, y + r() * 2, a, L * (0.85 + r() * 0.2), 4.2 + r() * 1.4, hue, 50, light,
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
      const light = 30 + t * 14 + r() * 6;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(a);
      // lobes
      const lobes = Math.max(3, Math.floor(L / 5));
      for (let k = 0; k < lobes; k++) {
        const u = k / lobes;
        const lx = L * u + 3;
        const lw = 3.6 * (1 - u * 0.8);
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

// Single leaf for particles.
export function singleLeafTexture() {
  const S = 64;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  drawLeaf(ctx, 4, S / 2, 0, S - 8, 14, 100, 50, 38);
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
    ctx.strokeStyle = `rgba(15,10,6,${0.35 + r() * 0.4})`;
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

// Forest floor: dark soil under a carpet of fallen leaves and twigs.
export function litterTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 5);
  paintNoise(ctx, S, (i) => {
    const v = 0.55 + n[i] * 0.6;
    return [62 * v, 48 * v, 30 * v];
  });
  for (let k = 0; k < 1100; k++) {
    const x = r() * S, y = r() * S;
    const len = 8 + r() * 20;
    const wid = len * (0.25 + r() * 0.15);
    const t = r();
    let h, s, l;
    if (t < 0.55) { h = 24 + r() * 16; s = 22 + r() * 18; l = 12 + r() * 13; }
    else if (t < 0.8) { h = 36 + r() * 14; s = 26; l = 17 + r() * 10; }
    else if (t < 0.95) { h = 70 + r() * 25; s = 28; l = 14 + r() * 9; }
    else { h = 20 + r() * 10; s = 45; l = 22 + r() * 8; }
    const a = r() * TAU;
    wrapped(S, x, y, len, (px, py) =>
      drawLeaf(ctx, px, py, a, len, wid, h, s, l, { veins: len > 22, alpha: 0.9 }));
  }
  ctx.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    const x = r() * S, y = r() * S, a = r() * TAU, len = 20 + r() * 60;
    const w = 1 + r() * 2.5;
    wrapped(S, x, y, len, (px, py) => {
      ctx.strokeStyle = hsl(25, 30, 12 + r() * 10);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(a + 0.3) * len * 0.5, py + Math.sin(a + 0.3) * len * 0.5,
        px + Math.cos(a) * len, py + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  return canvasTexture(c, { repeat: true });
}

export function mossTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  const n2 = periodicNoise(S, 64, seed + 3, 2);
  paintNoise(ctx, S, (i) => {
    const v = 0.45 + n[i] * 0.7 + (n2[i] - 0.5) * 0.35;
    return [52 * v, 82 * v, 26 * v];
  });
  for (let k = 0; k < 4000; k++) {
    const x = r() * S, y = r() * S, rad = 0.8 + r() * 2.2;
    ctx.fillStyle = hsl(80 + r() * 30, 50 + r() * 20, 22 + r() * 22, 0.7);
    wrapped(S, x, y, rad, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, TAU);
      ctx.fill();
    });
  }
  // little clover-like sprigs
  for (let k = 0; k < 160; k++) {
    const x = r() * S, y = r() * S;
    const len = 6 + r() * 8;
    wrapped(S, x, y, len * 2, (px, py) => {
      for (let j = 0; j < 3; j++)
        drawLeaf(ctx, px, py, (j / 3) * TAU + r(), len, len * 0.45, 95 + r() * 15, 55, 30 + r() * 12, { veins: false });
    });
  }
  return canvasTexture(c, { repeat: true });
}

export function rockTexture(seed, { hue = 40, sat = 6, light = 42 } = {}) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 4, seed, 7, 0.55);
  const n2 = periodicNoise(S, 32, seed + 1, 3);
  const base = new THREE.Color();
  paintNoise(ctx, S, (i) => {
    const v = (0.55 + n[i] * 0.7 + (n2[i] - 0.5) * 0.3) * light;
    base.setHSL(hue / 360, sat / 100, Math.min(0.85, v / 100));
    return [base.r * 255, base.g * 255, base.b * 255];
  });
  // cracks
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = r() * S, y = r() * S, a = r() * TAU;
    const steps = 6 + Math.floor(r() * 14);
    ctx.strokeStyle = `rgba(20,18,15,${0.3 + r() * 0.4})`;
    ctx.lineWidth = 0.8 + r() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 1.2;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 2000; k++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,240,0.10)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  for (let k = 0; k < 40; k++) {
    const x = r() * S, y = r() * S, rad = 4 + r() * 14;
    wrapped(S, x, y, rad, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(190,190,150,${0.18 + r() * 0.2})`);
      g.addColorStop(1, 'rgba(190,190,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, TAU);
      ctx.fill();
    });
  }
  return canvasTexture(c, { repeat: true });
}

export function mudTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  paintNoise(ctx, S, (i) => {
    const v = 0.6 + n[i] * 0.55;
    return [92 * v, 76 * v, 52 * v];
  });
  for (let k = 0; k < 700; k++) {
    const x = r() * S, y = r() * S, rx = 1.2 + r() * 3.2, ry = rx * (0.6 + r() * 0.4), a = r() * TAU;
    const l = 18 + r() * 20;
    wrapped(S, x, y, rx, (px, py) => {
      ctx.fillStyle = hsl(30 + r() * 15, 12 + r() * 12, l);
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, a, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,230,0.08)';
      ctx.beginPath();
      ctx.ellipse(px - rx * 0.25, py - ry * 0.3, rx * 0.45, ry * 0.35, a, 0, TAU);
      ctx.fill();
    });
  }
  return canvasTexture(c, { repeat: true });
}

// Carved temple stone: staggered blocks with mortar, chips and glyphs.
export function stoneBlockTexture(seed) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const n = periodicNoise(S, 8, seed, 6);
  paintNoise(ctx, S, (i) => {
    const v = 0.65 + n[i] * 0.5;
    return [78 * v, 74 * v, 62 * v];
  });
  const rows = 4, rh = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 120;
    while (x < S) {
      const w = 90 + r() * 110;
      const y = row * rh;
      const l = 42 + r() * 14;
      const hue = 35 + r() * 15;
      const drawBlock = (bx) => {
        const g = ctx.createLinearGradient(0, y, 0, y + rh);
        g.addColorStop(0, hsl(hue, 10, l + 6, 0.85));
        g.addColorStop(1, hsl(hue, 10, l - 8, 0.85));
        ctx.fillStyle = g;
        ctx.fillRect(bx + 3, y + 3, w - 6, rh - 6);
        ctx.strokeStyle = 'rgba(25,22,18,0.75)';
        ctx.lineWidth = 4;
        ctx.strokeRect(bx + 2, y + 2, w - 4, rh - 4);
        ctx.strokeStyle = 'rgba(255,250,230,0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx + 5, y + rh - 6);
        ctx.lineTo(bx + 5, y + 5);
        ctx.lineTo(bx + w - 6, y + 5);
        ctx.stroke();
      };
      drawBlock(x);
      if (x + w > S) drawBlock(x - S);
      if (x < 0) drawBlock(x + S);
      // glyph on some blocks
      if (r() < 0.22 && w > 120 && x > 0 && x + w < S) {
        const cx = x + w / 2, cy = row * rh + rh / 2;
        ctx.strokeStyle = 'rgba(30,26,20,0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let a = 0; a < TAU * 2.2; a += 0.2) {
          const rad = 3 + a * 3.2;
          const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.strokeRect(cx - 40, cy - 40, 80, 80);
      }
      x += w;
    }
  }
  for (let k = 0; k < 120; k++) {
    const x = r() * S, y = r() * S, rad = 2 + r() * 6;
    ctx.fillStyle = 'rgba(20,18,14,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
  }
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
