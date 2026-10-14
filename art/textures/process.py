"""Turn raw generated images (art/textures/raw, made with Flux in ComfyUI) into game textures.

  uv run --no-project --with numpy --with pillow --with scipy art/textures/process.py [names...]

Two kinds of source:

* Tiling surfaces (ground, bark, rock...). Each is made seamless with a minimum-error cut
  through a wrapped overlap (image quilting), flattened so big light/dark blotches don't
  repeat, colour-calibrated to a target albedo, and written as
    public/textures/<name>.jpg      sRGB albedo
    public/textures/<name>_n.jpg    normal X/Y in R/G, height in B (z is rebuilt in the shader)

* Cut-outs (leaves, fronds, flowers), photographed on white. The white is keyed out and
  un-mixed from the edge pixels, colour is bled into the transparent area so mipmaps don't
  halo, and they are packed into atlases:
    public/textures/<atlas>.webp    sRGB colour + alpha
    public/textures/<atlas>_n.jpg   normal X/Y + thickness
  with the UV rectangle of every cell in public/textures/atlas.json.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('OG_RAW', os.path.join(ROOT, 'raw'))
OUT = os.environ.get('OG_OUT', os.path.join(ROOT, '..', '..', 'public', 'textures'))

# name: source file, output size, normal strength, target mean albedo (sRGB 0-1) and saturation scale,
# flatten (0 = keep big shading, 1 = remove it), height mode
TILES = {
    # a square metre of floor each (leaves 5-15 cm; the first photos had a few giant leaves per
    # frame, so at any tiling the floor read as a picture of leaves).
    # 0.5: a floor of many species' leaves in mixed colours (the pale dry litter2 read as one
    # carpet of identical chips) and bare humus between the drifts. (0.6 dropped the dark wet
    # 'litter' tile: the floor read as one dark carpet, and the turf needed its texture units.)
    'litter3':  dict(src='litter7_00002_.png', size=1024, strength=2.4, mean=0.235, sat=0.58, flat=0.8, despec=0.6, gain=[1.0, 0.97, 0.9]),
    # short grass with clover in the open gaps and round the camp (0.6)
    'turf':     dict(src='turf_00002_.png', size=1024, strength=2.2, mean=0.3, sat=0.74, flat=0.85, despec=0.5, gain=[0.9, 1.0, 0.86]),
    'humus':    dict(src='humus_00002_.png', size=1024, strength=3.5, mean=0.16, sat=0.8, flat=0.7, despec=0.5),
    # cushion moss for logs, rocks and stone (the ground gets the flat carpet above)
    'cushion':  dict(src='moss2_00001_.png', size=1024, strength=5.0, mean=0.3, sat=0.72, flat=0.6, fsig=40),
    'moss':     dict(src='moss3_00001_.png', size=1024, strength=3.0, mean=0.24, sat=0.75, flat=0.6, fsig=40, gain=[1.08, 1.0, 0.82]),
    # dry fractured limestone in angular plates (0.5: the pitted rock4 read as foam, every pore
    # a white speck; the wet basalt before it read as black glass)
    'rock':     dict(src='rock7_00002_.png', size=1024, strength=4.0, mean=0.33, sat=0.6, flat=0.65, gain=[1.03, 1.0, 0.93]),
    'bark':     dict(src='bark4_00001_.png', size=1024, strength=6.0, mean=0.34, sat=0.8, flat=0.8, fsig=6),
    'palmbark': dict(src='palmbark_00002_.png', size=1024, strength=6.0, mean=0.38, sat=0.8, flat=0.6),
    'deadwood': dict(src='deadwood2_00001_.png', size=1024, strength=5.0, mean=0.42, sat=0.75, flat=0.6),
    'stone':    dict(src='stone4_00003_.png', size=1024, strength=5.0, mean=0.3, sat=0.65, flat=0.85, crop=[0, 0.06, 1, 1], gain=[1.06, 1.02, 0.9]),
    # one dressed temple block's face: pitted limestone, no joints (the blocks are geometry)
    # (cropped below the photo's pale tide-line band, which repeated on every block; its big
    # blotches flattened out so the pitting reads as stone, not popcorn stucco)
    'block':    dict(src='block2_00001_.png', size=1024, strength=2.5, mean=0.36, sat=0.3, flat=0.85, fsig=7, preflat=True, crop=[0.05, 0.2, 0.95, 0.88], gain=[1.0, 1.0, 0.94]),
    'gravel':   dict(src='gravel_00001_.png', size=1024, strength=6.0, mean=0.27, sat=0.8, flat=0.7),
}

# atlases: list of cells [name, source, x, y, w, h] in atlas pixels
ATLAS_SPEC = os.environ.get('OG_ATLASES', os.path.join(ROOT, 'atlases.json'))
ATLASES = json.load(open(ATLAS_SPEC)) if os.path.exists(ATLAS_SPEC) else {}


def load(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


# ------------------------------------------------------------------ tiling

def min_cut_path(err):
    """Cheapest top-to-bottom path through an (H, W) error map; returns column per row."""
    H, W = err.shape
    cost = err.copy()
    back = np.zeros((H, W), dtype=np.int32)
    for y in range(1, H):
        prev = cost[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        stack = np.stack([left, prev, right])
        k = np.argmin(stack, axis=0)
        back[y] = k - 1
        cost[y] += stack[k, np.arange(W)]
    path = np.zeros(H, dtype=np.int32)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(H - 1, 0, -1):
        path[y - 1] = np.clip(path[y] + back[y, path[y]], 0, W - 1)
    return path


def wrap_x(img, ov):
    """Make img periodic horizontally; output width W - ov."""
    H, W, _ = img.shape
    A = img[:, W - ov:]   # continues from the right end
    B = img[:, :ov]       # continues into the rest
    err = ((A - B) ** 2).sum(-1)
    err = ndimage.gaussian_filter(err, 1.5)
    # the strip's first columns must stay A and its last B, or the wrap breaks
    err[:, :6] = 1e6
    err[:, -6:] = 1e6
    path = min_cut_path(err)
    xs = np.arange(ov)[None, :]
    # soft switch over a few pixels around the cut
    t = np.clip((xs - path[:, None]) / 3.0 + 0.5, 0, 1)[..., None]
    strip = A * (1 - t) + B * t
    out = img[:, :W - ov].copy()
    out[:, :ov] = strip
    return out


def make_tileable(img, ov):
    img = wrap_x(img, ov)
    img = wrap_x(img.transpose(1, 0, 2), ov).transpose(1, 0, 2)
    return img


def resize_wrap(img, size):
    """Resample a periodic image to size x size without breaking the wrap."""
    C = img.shape[2]
    big = np.tile(img, (3, 3, 1))
    chans = []
    for c in range(C):
        ch = Image.fromarray(big[..., c].astype(np.float32), 'F').resize((size * 3, size * 3), Image.LANCZOS)
        chans.append(np.asarray(ch))
    out = np.stack(chans, -1)
    return out[size:2 * size, size:2 * size]


def gblur_wrap(x, s):
    return ndimage.gaussian_filter(x, s, mode='wrap')


def normal_from_height(h, strength, wrap=True):
    mode = 'wrap' if wrap else 'nearest'
    gx = ndimage.sobel(h, axis=1, mode=mode) / 8.0
    gy = ndimage.sobel(h, axis=0, mode=mode) / 8.0
    n = np.stack([-gx * strength * h.shape[1] / 256.0, gy * strength * h.shape[0] / 256.0, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def calibrate(srgb, mean, sat):
    """Scale linear albedo so the mean luminance hits `mean` (in sRGB), then scale saturation."""
    lin = srgb_to_lin(srgb)
    L = lum(lin)
    target = srgb_to_lin(np.array(mean))
    lin = lin * (target / max(L.mean(), 1e-4))
    L = lum(lin)[..., None]
    lin = L + (lin - L) * sat
    return lin_to_srgb(np.clip(lin, 0.004, 0.9))


def despecular(img, size, k, sig=None):
    """Photos of wet ground carry the sky's glints in the albedo: small spots brighter and
    greyer than their surroundings. Pull those back to the local colour."""
    lin = srgb_to_lin(np.clip(img, 0, 1))
    L = lum(lin)
    sig = sig or size / 128
    Lloc = gblur_wrap(L, sig)
    mx, mn = lin.max(-1), lin.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    spec = np.clip((L / np.maximum(Lloc, 1e-4) - 1.1) / 0.8, 0, 1) * np.clip(1 - sat * 2.0, 0, 1)
    loc = np.stack([gblur_wrap(lin[..., c], sig) for c in range(3)], -1)
    w = (spec * k)[..., None]
    return lin_to_srgb(lin * (1 - w) + np.minimum(loc, lin) * w)


def unspot(img, size, k):
    """Fade out big pale blotches (lichen discs on bark) by filling them from around."""
    lin = srgb_to_lin(np.clip(img, 0, 1))
    L = lum(lin)
    mx, mn = lin.max(-1), lin.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    m = (L > np.percentile(L, 78)) & (sat < np.percentile(sat, 45))
    m = ndimage.binary_opening(m, iterations=2)
    m = ndimage.binary_dilation(m, iterations=3)
    soft = gblur_wrap(m.astype(np.float32), 2.0)
    keep = 1.0 - np.clip(soft * 1.5, 0, 1)
    fill = np.empty_like(lin)
    for c in range(3):
        num = gblur_wrap(lin[..., c] * keep, size / 40)
        den = gblur_wrap(keep, size / 40)
        fill[..., c] = num / np.maximum(den, 1e-4)
    # keep the fine grain of the spot area, take the colour and level from the fill
    detail = lin / np.maximum(gblur_wrap(L, 3.0), 1e-4)[..., None]
    fillc = fill * np.clip(detail, 0.6, 1.4)
    w = (np.clip(soft * 1.5, 0, 1) * k)[..., None]
    return lin_to_srgb(lin * (1 - w) + fillc * w)


def desheen(img, size, k, hue=(1.4, 0.91, 0.67)):
    """Wet leaves photographed under a grey sky wear its reflection as broad grey-blue
    patches. Those pixels (greyish, or bluer than red without being green) get a warm litter
    hue, keeping their brightness, and the brightest of them, the sheen itself, are pulled
    down. Green and brown leaves are left alone."""
    lin = srgb_to_lin(np.clip(img, 0, 1))
    L = np.maximum(lum(lin), 1e-4)
    mx, mn = lin.max(-1), lin.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    grey = np.clip(1 - sat / 0.3, 0, 1)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    blue = np.clip((b - r) / L * 3, 0, 1) * np.clip(1 - (g - np.maximum(r, b)) / L * 3, 0, 1)
    w = np.maximum(grey, blue) * k
    target = np.array(hue, np.float32)
    chroma = (lin / L[..., None]) * (1 - w[..., None]) + target * w[..., None]
    lo, hi = np.percentile(L, 50), np.percentile(L, 92)
    bright = np.clip((L - lo) / max(hi - lo, 1e-4), 0, 1)
    Lw = L * (1 - 0.4 * w * bright)
    return lin_to_srgb(chroma * Lw[..., None])


def mortar(img, k):
    """Thin bright lines (mortar joints, scratches) darkened to the stone around them."""
    lin = srgb_to_lin(np.clip(img, 0, 1))
    L = lum(lin)
    opened = ndimage.grey_opening(L, size=(9, 9), mode='wrap')
    th = L - opened
    m = np.clip((th / np.maximum(opened, 1e-3) - 0.25) / 0.6, 0, 1)
    m = gblur_wrap(m, 1.0)
    f = 1 - k * m * (1 - opened / np.maximum(L, 1e-4))
    return lin_to_srgb(lin * f[..., None])


def process_tile(name, cfg):
    img = load(os.path.join(RAW, cfg['src']))
    if cfg.get('crop'):
        # keep a box of the photo (fractions x0, y0, x1, y1), squared back up
        H, W, _ = img.shape
        x0, y0, x1, y1 = cfg['crop']
        sub = img[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]
        img = np.stack([np.asarray(Image.fromarray(sub[..., c].astype(np.float32), 'F').resize((W, H), Image.LANCZOS)) for c in range(3)], -1)
    H, W, _ = img.shape
    if cfg.get('preflat'):
        # flatten the photo's broad light before tiling: a top edge brighter than the bottom
        # leaves the wrap's seam as a visible wavy band across every tile
        lin = srgb_to_lin(np.clip(img, 0, 1))
        L = lum(lin)
        Lb = ndimage.gaussian_filter(L, W / 10, mode='nearest')
        img = lin_to_srgb(lin * (L.mean() / np.maximum(Lb, 1e-4))[..., None])
    ov = W // 8
    img = make_tileable(img, ov)
    img = resize_wrap(img, cfg['size'])
    # flatten big shading: divide out a blurred luminance (in linear light)
    lin = srgb_to_lin(np.clip(img, 0, 1))
    L = lum(lin)
    Lb = gblur_wrap(L, cfg['size'] / cfg.get('fsig', 10))
    f = (L.mean() / np.maximum(Lb, 1e-4)) ** cfg['flat']
    lin = lin * f[..., None]
    img = lin_to_srgb(lin)
    if cfg.get('despec'):
        img = despecular(img, cfg['size'], cfg['despec'], cfg.get('despec_sig'))
    if cfg.get('gain'):
        img = lin_to_srgb(srgb_to_lin(np.clip(img, 0, 1)) * np.array(cfg['gain'], np.float32))
    if cfg.get('mortar'):
        img = mortar(img, cfg['mortar'])
    if cfg.get('desheen'):
        img = desheen(img, cfg['size'], cfg['desheen'])
    if cfg.get('unspot'):
        img = unspot(img, cfg['size'], cfg['unspot'])
    img = calibrate(img, cfg['mean'], cfg['sat'])
    # height: luminance band-passed (bright = raised for leaves, pebbles, bark ridges)
    L = lum(srgb_to_lin(img))
    h = gblur_wrap(L, 1.0) - gblur_wrap(L, cfg['size'] / 24)
    h = (h - h.min()) / max(h.max() - h.min(), 1e-5)
    h = np.clip((h - np.percentile(h, 1)) / max(np.percentile(h, 99) - np.percentile(h, 1), 1e-5), 0, 1)
    n = normal_from_height(gblur_wrap(h, 0.8), cfg['strength'])
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}.jpg'), quality=88, subsampling=0)
    nh = np.stack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, h], -1)
    # normals and height at half resolution: the albedo carries the fine detail
    nimg = Image.fromarray((np.clip(nh, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((cfg['size'] // 2, cfg['size'] // 2), Image.LANCZOS)
    nimg.save(os.path.join(OUT, f'{name}_n.jpg'), quality=90, subsampling=0)
    print(f'{name}: tile {cfg["size"]} from {cfg["src"]}')


# ------------------------------------------------------------------ cut-outs

def key_white(img, sat_key=False):
    """Alpha from distance to the white backdrop, then un-mix white from the edge pixels.
    sat_key: also drop pale *grey* pixels (the plant's soft shadow on the backdrop, which
    shows between leaves); green leaves and brown stems are saturated, shadows aren't."""
    d = np.max(1.0 - img, axis=-1)
    # the backdrop isn't perfectly white: estimate it from the border
    border = np.concatenate([d[:8].ravel(), d[-8:].ravel(), d[:, :8].ravel(), d[:, -8:].ravel()])
    bg = np.percentile(border, 90)
    a = np.clip((d - (bg + 0.03)) / 0.10, 0, 1)
    if sat_key:
        mx, mn = img.max(-1), img.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1e-4)
        a_sat = np.clip((sat - 0.1) / 0.12, 0, 1)
        a_dark = np.clip((d - 0.3) / 0.12, 0, 1)
        a = np.maximum(a * a_sat, a_dark)
    # remove specks and keep the solid shapes
    solid = a > 0.5
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes > max(sizes.max() * 0.002, 30)
        a = a * ndimage.binary_dilation(keep[lab], iterations=2)
    # shave a pixel so the white fringe goes
    a = np.minimum(a, ndimage.grey_erosion(a, size=(3, 3)) * 0.5 + a * 0.5)
    safe = np.maximum(a, 1e-3)[..., None]
    col = np.clip((img - (1 - a[..., None])) / safe, 0, 1)
    col = np.where(a[..., None] > 0.02, col, img)
    return col, a


def bleed(col, a):
    """Copy the nearest opaque colour into transparent pixels (no dark/white mip halos)."""
    mask = a < 0.5
    _, (iy, ix) = ndimage.distance_transform_edt(mask, return_indices=True)
    out = col[iy, ix]
    out = np.where(mask[..., None], ndimage.gaussian_filter(out, (2, 2, 0)), col)
    return out


def cell_normal(col, a, strength=3.0, puff=0.08):
    """Leaf normals: a soft dome from the distance to the edge (leaves read as curved, not
    flat paper) plus vein and blade detail from the luminance."""
    inside = a > 0.5
    d = ndimage.distance_transform_edt(inside)
    D = max(4.0, puff * max(a.shape))
    dome = np.sqrt(np.clip(d / D, 0, 1))
    L = lum(srgb_to_lin(col))
    det = ndimage.gaussian_filter(L, 0.7) - ndimage.gaussian_filter(L, 6)
    det = det / max(np.abs(det).max(), 1e-4)
    h = dome * 0.6 + det * 0.25
    n = normal_from_height(ndimage.gaussian_filter(h, 1.0), strength, wrap=False)
    thick = np.clip(dome, 0, 1)
    return n, thick


def process_atlas(name, spec):
    W, H = spec['size']
    col = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    nrm = np.zeros((H, W, 3), np.float32)
    nrm[..., 2] = 1
    thick = np.zeros((H, W), np.float32)
    cells = {}
    for cell in spec['cells']:
        cname, src, x, y, w, h = cell[:6]
        opts = cell[6] if len(cell) > 6 else {}
        img = load(os.path.join(RAW, src))
        if opts.get('flip'):
            img = img[::-1, ::-1].copy()  # stalk end to the bottom
        if opts.get('rot'):
            img = np.rot90(img, k=opts['rot']).copy()  # -1: a quarter turn clockwise
        c, a = key_white(img, opts.get('satkey', False))
        # crop to the shape with a small margin, keeping the aspect inside the cell
        ys, xs = np.nonzero(a > 0.1)
        pad = 6
        y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, a.shape[0] - 1)
        x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, a.shape[1] - 1)
        c, a = c[y0:y1 + 1, x0:x1 + 1], a[y0:y1 + 1, x0:x1 + 1]
        sh, sw = a.shape
        s = min(w / sw, h / sh)
        nw, nh = max(1, int(sw * s)), max(1, int(sh * s))
        if opts.get('stretch'):
            nw, nh = w, h
        cimg = np.stack([np.asarray(Image.fromarray(c[..., k], 'F').resize((nw, nh), Image.LANCZOS)) for k in range(3)], -1)
        aimg = np.asarray(Image.fromarray(a, 'F').resize((nw, nh), Image.LANCZOS))
        aimg = np.clip(aimg, 0, 1)
        if 'hue' in opts or 'sat' in opts or 'gain' in opts:
            lin = srgb_to_lin(np.clip(cimg, 0, 1))
            L = lum(lin)[..., None]
            lin = L + (lin - L) * opts.get('sat', 1.0)
            lin = lin * np.array(opts.get('gain', [1, 1, 1]))
            cimg = lin_to_srgb(lin)
        if 'mean' in opts:
            m = aimg > 0.5
            lin = srgb_to_lin(np.clip(cimg, 0, 1))
            cur = lum(lin)[m].mean()
            lin = lin * (srgb_to_lin(np.array(opts['mean'])) / max(cur, 1e-4))
            cimg = lin_to_srgb(lin)
        # place: bottom-centre aligned in the cell (stems at the bottom edge)
        ox = x + (w - nw) // 2
        oy = y + (h - nh) if opts.get('align', 'bottom') == 'bottom' else y + (h - nh) // 2
        n_, t_ = cell_normal(cimg, aimg, opts.get('normal', 3.0), opts.get('puff', 0.06))
        col[oy:oy + nh, ox:ox + nw] = cimg
        alpha[oy:oy + nh, ox:ox + nw] = aimg
        nrm[oy:oy + nh, ox:ox + nw] = n_
        thick[oy:oy + nh, ox:ox + nw] = t_
        # UVs with v up (three flips images so v=0 is the bottom row)
        cells[cname] = {
            'u0': ox / W, 'v0': 1 - (oy + nh) / H, 'u1': (ox + nw) / W, 'v1': 1 - oy / H,
            'aspect': nw / nh,
        }
        print(f'  {name}.{cname}: {nw}x{nh} at {ox},{oy} from {src}')
    col = bleed(np.clip(col, 0, 1), alpha)
    rgba = np.concatenate([col, alpha[..., None]], -1)
    os.makedirs(OUT, exist_ok=True)
    # exact=True keeps the bled colour under transparent pixels (no mip halos)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'{name}.webp'), quality=88, method=6, exact=True)
    nt = np.stack([nrm[..., 0] * 0.5 + 0.5, nrm[..., 1] * 0.5 + 0.5, thick], -1)
    Image.fromarray((np.clip(nt, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}_n.jpg'), quality=90, subsampling=0)
    return cells


if __name__ == '__main__':
    only = set(sys.argv[1:])
    for name, cfg in TILES.items():
        if only and name not in only:
            continue
        if os.path.exists(os.path.join(RAW, cfg['src'])):
            process_tile(name, cfg)
        else:
            print(f'{name}: missing {cfg["src"]}')
    manifest_path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for name, spec in ATLASES.items():
        if only and name not in only:
            continue
        if not all(os.path.exists(os.path.join(RAW, c[1])) for c in spec['cells']):
            print(f'{name}: missing sources')
            continue
        print(f'{name}: atlas {spec["size"]}')
        manifest[name] = process_atlas(name, spec)
    json.dump(manifest, open(manifest_path, 'w'), indent=1)
