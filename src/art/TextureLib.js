// Loads the generated surface textures and leaf atlases from public/textures (made by
// art/textures/process.py). Each surface has an sRGB albedo and an "_n" map holding the
// normal's X/Y in R/G (Z is rebuilt in the shader) and a height or thickness in B.
// Atlases carry a UV rectangle per cell in atlas.json.
import * as THREE from 'three';

export const SURFACES = ['turf', 'litter3', 'humus', 'moss', 'cushion', 'rock', 'bark', 'palmbark', 'deadwood', 'stone', 'gravel', 'block'];
export const ATLASES = ['canopy', 'broad', 'fronds', 'under', 'debris'];

const BASE = `${import.meta.env.BASE_URL}textures/`;

function setup(tex, { srgb, repeat = true, aniso = 8 }) {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

export class TextureLib {
  // detail: the quality the game booted with. The leaf atlases and their normal maps are most
  // of the video memory (about 245 MB at full size): Medium loads the atlases' normal maps at
  // half size, Low every atlas and ground map (about 170 MB less, for integrated graphics).
  constructor(renderer, detail = 'high') {
    // 16x: the ground is mostly seen at grazing angles, where 8x smears it into streaks
    this.aniso = Math.min(detail === 'low' ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
    this.detail = detail;
    this.surface = {};
    this.atlas = {};
    this.cells = {};
  }

  async load(progress = () => {}) {
    const loader = new THREE.TextureLoader();
    // atlases keep the colour bled under transparent pixels: no premultiply on decode
    const bitmaps = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const jobs = [];
    let done = 0;
    const total = SURFACES.length * 2 + ATLASES.length * 2 + 1;
    const tick = () => progress(++done / total);
    const low = this.detail === 'low', mid = this.detail === 'medium';
    // a texture's image at half size (flip: an <img> that WebGL would have flipped on upload;
    // a bitmap ignores flipY, so the flip happens here instead)
    const halve = async (t, flip) => {
      const src = t.image;
      t.image = await createImageBitmap(src, {
        resizeWidth: Math.max(1, src.width >> 1), resizeHeight: Math.max(1, src.height >> 1), resizeQuality: 'high',
        imageOrientation: flip ? 'flipY' : 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
      });
      if (flip) t.flipY = false;
      src.close?.();
      return t;
    };
    const tex = (file, opts, half = false) => loader.loadAsync(BASE + file).then((t) => (half ? halve(t, true) : t)).then((t) => {
      tick();
      return setup(t, { ...opts, aniso: this.aniso });
    });
    for (const s of SURFACES) {
      jobs.push(Promise.all([tex(`${s}.jpg`, { srgb: true }, low), tex(`${s}_n.jpg`, { srgb: false }, low)])
        .then(([map, nmap]) => { this.surface[s] = { map, nmap }; }));
    }
    const manifest = fetch(BASE + 'atlas.json').then((r) => r.json()).then((j) => { tick(); this.cells = j; });
    for (const a of ATLASES) {
      const map = bitmaps.loadAsync(BASE + `${a}.webp`).then((bmp) => {
        const t = new THREE.Texture(bmp);
        t.flipY = false;
        return low ? halve(t, false) : t;
      }).then((t) => {
        tick();
        return setup(t, { srgb: true, repeat: false, aniso: this.aniso });
      });
      jobs.push(Promise.all([map, tex(`${a}_n.jpg`, { srgb: false, repeat: false }, low || mid)])
        .then(([m, n]) => { this.atlas[a] = { map: m, nmap: n }; }));
    }
    jobs.push(manifest);
    await Promise.all(jobs);
    return this;
  }

  // UV rectangle of an atlas cell: {u0, v0, u1, v1, aspect}
  cell(atlas, name) {
    const c = this.cells[atlas]?.[name];
    if (!c) throw new Error(`atlas cell ${atlas}.${name} missing`);
    return c;
  }
}
