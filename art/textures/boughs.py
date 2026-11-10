# Bough cards for the trees' crowns, composed from the photographed twigs already in the canopy
# atlas. One twig card carries about thirty leaves; stretched to the size a giant's crown needs,
# its leaves come out half a metre long and the crown reads as stamped paper. A bough is a small
# branch drawn with a dozen or more of those twigs at a third of their size, set along a forking
# stem, the lower ones darker (they sit under the others), so a card of the same size carries
# several hundred small leaves and a ragged, open outline.
#
#   uv run --no-project --with numpy --with pillow --with scipy art/textures/boughs.py
#
# Reads public/textures/canopy.webp and atlas.json (so it needs no raw photographs); writes
# boughs.webp, boughs_n.jpg and the "boughs" cells in atlas.json. Deterministic. Run it again
# after process.py rebuilds the canopy atlas.
import json, math, os, random, sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import process as P  # noqa: E402  (bleed, cell_normal, colour helpers)

OUT = P.OUT
SIZE = 2048
WORK = 1800  # each bough is drawn on a canvas this big, then cropped and fitted to its cell


def load_twigs():
    atlas = np.asarray(Image.open(os.path.join(OUT, 'canopy.webp')).convert('RGBA'), np.float32) / 255
    cells = json.load(open(os.path.join(OUT, 'atlas.json')))['canopy']
    H, W = atlas.shape[:2]
    out = {}
    for name in ('twig0', 'twig1', 'twig2', 'twig3'):
        c = cells[name]
        x0, x1 = round(c['u0'] * W), round(c['u1'] * W)
        y0, y1 = round((1 - c['v1']) * H), round((1 - c['v0']) * H)
        cut = atlas[y0:y1, x0:x1].copy()
        cut[..., :3] *= cut[..., 3:]  # premultiplied: resampling can't pull dark fringes in
        out[name] = cut
    return out


def sprite(src, height, angle):
    """The twig scaled to `height` pixels and turned `angle` degrees clockwise from straight up.
    Returns the premultiplied RGBA array and where its stalk end landed in it (x, y)."""
    h0, w0 = src.shape[:2]
    s = height / h0
    w, h = max(2, round(w0 * s)), max(2, round(h0 * s))
    im = Image.fromarray((np.clip(src, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    im = im.rotate(-angle, resample=Image.BICUBIC, expand=True)
    th = math.radians(-angle)
    px = im.width / 2 + (h / 2) * math.sin(th)
    py = im.height / 2 + (h / 2) * math.cos(th)
    return np.asarray(im, np.float32) / 255, (px, py)


class Canvas:
    def __init__(self, n=WORK):
        self.rgb = np.zeros((n, n, 3), np.float32)  # premultiplied
        self.a = np.zeros((n, n), np.float32)
        self.n = n

    def over(self, spr, pivot, at, shade=(1, 1, 1)):
        x = round(at[0] - pivot[0])
        y = round(at[1] - pivot[1])
        h, w = spr.shape[:2]
        x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, self.n), min(y + h, self.n)
        if x1 <= x0 or y1 <= y0:
            return
        s = spr[y0 - y:y1 - y, x0 - x:x1 - x]
        sa = s[..., 3]
        self.rgb[y0:y1, x0:x1] = s[..., :3] * np.array(shade, np.float32) + self.rgb[y0:y1, x0:x1] * (1 - sa[..., None])
        self.a[y0:y1, x0:x1] = sa + self.a[y0:y1, x0:x1] * (1 - sa)

    def stem(self, pts, w0, w1, col=(0.2, 0.13, 0.08)):
        """A woody stem through pts, w0 wide at the start and w1 at the end."""
        yy, xx = np.mgrid[0:self.n, 0:self.n]
        for i in range(len(pts) - 1):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            w = w0 + (w1 - w0) * (i + 0.5) / (len(pts) - 1)
            pad = int(w) + 2
            x0, x1 = int(max(min(ax, bx) - pad, 0)), int(min(max(ax, bx) + pad, self.n))
            y0, y1 = int(max(min(ay, by) - pad, 0)), int(min(max(ay, by) + pad, self.n))
            if x1 <= x0 or y1 <= y0:
                continue
            X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
            dx, dy = bx - ax, by - ay
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / max(dx * dx + dy * dy, 1e-6), 0, 1)
            d = np.hypot(X - (ax + t * dx), Y - (ay + t * dy))
            m = np.clip(w / 2 + 0.5 - d, 0, 1)
            self.rgb[y0:y1, x0:x1] = np.array(col, np.float32) * m[..., None] + self.rgb[y0:y1, x0:x1] * (1 - m[..., None])
            self.a[y0:y1, x0:x1] = m + self.a[y0:y1, x0:x1] * (1 - m)

    def cut(self):
        """Cropped to the drawing, straight (not premultiplied) colour and alpha."""
        ys, xs = np.nonzero(self.a > 0.1)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        a = self.a[y0:y1, x0:x1]
        rgb = self.rgb[y0:y1, x0:x1] / np.maximum(a, 1e-3)[..., None]
        return np.clip(rgb, 0, 1), np.clip(a, 0, 1)


def polar(at, ang, dist):
    """A point `dist` from `at`, `ang` degrees clockwise from straight up."""
    r = math.radians(ang)
    return (at[0] + math.sin(r) * dist, at[1] - math.cos(r) * dist)


def tinted(r, depth):
    """A twig's shade: `depth` 0 (underneath) to 1 (on top), with a little warm/cool drift."""
    k = 0.6 + 0.38 * depth + r.uniform(-0.05, 0.05)
    w = r.uniform(-0.05, 0.05)
    return (k * (1 + w), k, k * (1 - w * 1.5))


def bough(twigs, seed, lean=0.0, spread=1.0, length=1.0):
    """A leafy branch: a gently curving stem with side shoots to left and right, each carrying
    twigs, the whole fanning out toward the tip."""
    r = random.Random(seed)
    names = list(twigs)
    c = Canvas()
    base = (WORK / 2, WORK - 120)
    L = WORK * 0.56 * length
    # the main stem
    axis, ang, at = [base], lean * 14, base
    n = 7
    for i in range(n):
        ang += r.uniform(-9, 9) + lean * 5
        at = polar(at, ang, L / n)
        axis.append(at)
    c.stem(axis, 15, 5)
    jobs = []  # (depth, twig, height, angle, at)
    side = r.choice((-1, 1))
    for i in range(1, n + 1):
        t = i / n
        here = axis[i]
        a0 = math.degrees(math.atan2(axis[i][0] - axis[i - 1][0], -(axis[i][1] - axis[i - 1][1])))
        if i < n:
            for s in ((side,) if r.random() < 0.35 else (side, -side)):
                # shoots are longest low on the bough and stand off it the most there
                off = s * r.uniform(38, 70) * spread * (1.05 - 0.35 * t)
                sl = WORK * r.uniform(0.1, 0.2) * (1.15 - 0.6 * t) * spread
                end = polar(here, a0 + off, sl)
                c.stem([here, polar(here, a0 + off * 0.8, sl * 0.5), end], 7, 3)
                jobs.append((0.25 + 0.6 * t + r.uniform(-0.1, 0.1), r.choice(names), WORK * r.uniform(0.21, 0.29), a0 + off + r.uniform(-14, 14), end))
                if r.random() < 0.7:
                    mid = polar(here, a0 + off * 0.8, sl * 0.5)
                    jobs.append((0.1 + 0.5 * t + r.uniform(-0.1, 0.1), r.choice(names), WORK * r.uniform(0.17, 0.23), a0 + off * r.uniform(0.2, 0.6) + r.uniform(-20, 20), mid))
            side = -side
        # twigs straight off the stem too
        if i >= 2 and r.random() < 0.8:
            jobs.append((0.35 + 0.6 * t, r.choice(names), WORK * r.uniform(0.19, 0.26), a0 + r.uniform(-28, 28), here))
    jobs.append((1.0, r.choice(names), WORK * 0.3, ang + r.uniform(-8, 8), axis[-1]))
    for depth, name, h, a, at in sorted(jobs, key=lambda j: j[0]):
        spr, piv = sprite(twigs[name], h, a)
        c.over(spr, piv, at, tinted(r, min(depth, 1)))
    return c.cut()


def clump(twigs, seed, n=17, arc=118):
    """A dense, domed mass of twigs fanning from one point: a whole spray of the crown on one
    card, for the trees' distant copies."""
    r = random.Random(seed)
    names = list(twigs)
    c = Canvas()
    base = (WORK / 2, WORK * 0.72)
    jobs = []
    for i in range(n):
        a = -arc + 2 * arc * (i + r.uniform(0.15, 0.85)) / n
        k = 1 - 0.3 * abs(a) / arc
        jobs.append((r.uniform(0, 0.45), a, WORK * r.uniform(0.07, 0.2) * k, WORK * r.uniform(0.25, 0.33)))
    for i in range(n // 2):
        a = r.uniform(-arc * 0.7, arc * 0.7)
        jobs.append((r.uniform(0.6, 1), a, WORK * r.uniform(0.0, 0.1), WORK * r.uniform(0.24, 0.3)))
    # the stalks all meet at the base: twigs set back behind it cover the bare spot
    for i in range(5):
        a = -arc * 0.8 + 1.6 * arc * (i + r.uniform(0.2, 0.8)) / 5
        jobs.append((r.uniform(0.45, 0.8), a, -WORK * r.uniform(0.09, 0.15), WORK * r.uniform(0.24, 0.3)))
    for depth, a, out, h in sorted(jobs):
        spr, piv = sprite(twigs[r.choice(names)], h, a + r.uniform(-12, 12))
        c.over(spr, piv, polar(base, a, out), tinted(r, depth))
    return c.cut()


CELLS = [
    # name, x, y, w, h, maker
    ('bough0', 0, 0, 1024, 1024, lambda t: bough(t, 11)),
    ('bough1', 1024, 0, 1024, 1024, lambda t: bough(t, 23, lean=0.5, spread=1.1)),
    ('bough2', 0, 1024, 1024, 1024, lambda t: bough(t, 37, lean=-0.4, spread=0.85, length=1.1)),
    ('clump0', 1024, 1024, 512, 512, lambda t: clump(t, 5)),
    ('clump1', 1536, 1024, 512, 512, lambda t: clump(t, 9, n=14, arc=100)),
    ('spray0', 1024, 1536, 512, 512, lambda t: clump(t, 13, n=19, arc=150)),
]
# cells carried over from the canopy atlas as they are, so a giant's climbers and epiphytes
# draw with its crown (one material, one draw call)
COPIES = [('vine0', 1536, 1536, 96, 512), ('brom0', 1648, 1536, 384, 384)]


def carried(name, w, h):
    """A canopy cell's colour, alpha, normal and thickness, fitted into w x h."""
    rgba = np.asarray(Image.open(os.path.join(OUT, 'canopy.webp')).convert('RGBA'), np.float32) / 255
    nt = np.asarray(Image.open(os.path.join(OUT, 'canopy_n.jpg')).convert('RGB'), np.float32) / 255
    c = json.load(open(os.path.join(OUT, 'atlas.json')))['canopy'][name]
    H, W = rgba.shape[:2]
    x0, x1 = round(c['u0'] * W), round(c['u1'] * W)
    y0, y1 = round((1 - c['v1']) * H), round((1 - c['v0']) * H)
    k = nt.shape[0] / H  # the normal map may be stored smaller
    a = Image.fromarray((rgba[y0:y1, x0:x1] * 255 + 0.5).astype(np.uint8), 'RGBA')
    b = Image.fromarray((nt[round(y0 * k):round(y1 * k), round(x0 * k):round(x1 * k)] * 255 + 0.5).astype(np.uint8))
    s = min(w / a.width, h / a.height)
    size = (max(1, int(a.width * s)), max(1, int(a.height * s)))
    return np.asarray(a.resize(size, Image.LANCZOS), np.float32) / 255, np.asarray(b.resize(size, Image.LANCZOS), np.float32) / 255



def main():
    twigs = load_twigs()
    col = np.zeros((SIZE, SIZE, 3), np.float32)
    alpha = np.zeros((SIZE, SIZE), np.float32)
    nrm = np.zeros((SIZE, SIZE, 3), np.float32)
    nrm[..., 2] = 1
    thick = np.zeros((SIZE, SIZE), np.float32)
    cells = {}
    for name, x, y, w, h, make in CELLS:
        c, a = make(twigs)
        # the twigs' young leaves are yellow, and a bough gathers thirty twigs' worth of them at
        # its rim: seen whole, the crown went mustard. Pull them back to a lighter green.
        over = np.maximum(c[..., 0] - 0.74 * c[..., 1], 0)
        c[..., 0] -= 0.65 * over
        c *= (1 - 0.9 * over)[..., None]
        sh, sw = a.shape
        s = min((w - 8) / sw, (h - 8) / sh)
        nw, nh = max(1, int(sw * s)), max(1, int(sh * s))
        # colour bled under the gaps before it is resampled, so the edges stay green
        c = P.bleed(c, a)
        cimg = np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(c[..., k]), 'F').resize((nw, nh), Image.LANCZOS)) for k in range(3)], -1)
        aimg = np.clip(np.asarray(Image.fromarray(np.ascontiguousarray(a), 'F').resize((nw, nh), Image.LANCZOS)), 0, 1)
        cimg = np.clip(cimg, 0, 1)
        ox, oy = x + (w - nw) // 2, y + (h - nh) - 4
        n_, t_ = P.cell_normal(cimg, aimg, 3.0, 0.025)
        col[oy:oy + nh, ox:ox + nw] = cimg
        alpha[oy:oy + nh, ox:ox + nw] = aimg
        nrm[oy:oy + nh, ox:ox + nw] = n_
        thick[oy:oy + nh, ox:ox + nw] = t_
        cells[name] = {'u0': ox / SIZE, 'v0': 1 - (oy + nh) / SIZE, 'u1': (ox + nw) / SIZE, 'v1': 1 - oy / SIZE, 'aspect': nw / nh}
        print(f'  boughs.{name}: {nw}x{nh} at {ox},{oy}, cover {float((aimg > 0.5).mean()):.2f}')
    for name, x, y, w, h in COPIES:
        c, n = carried(name, w, h)
        nh, nw = c.shape[:2]
        ox, oy = x + (w - nw) // 2, y + (h - nh)
        col[oy:oy + nh, ox:ox + nw] = c[..., :3]
        alpha[oy:oy + nh, ox:ox + nw] = c[..., 3]
        nrm[oy:oy + nh, ox:ox + nw, :2] = n[..., :2] * 2 - 1
        thick[oy:oy + nh, ox:ox + nw] = n[..., 2]
        cells[name] = {'u0': ox / SIZE, 'v0': 1 - (oy + nh) / SIZE, 'u1': (ox + nw) / SIZE, 'v1': 1 - oy / SIZE, 'aspect': nw / nh}
        print(f'  boughs.{name}: {nw}x{nh} at {ox},{oy} (from the canopy atlas)')
    col = P.bleed(np.clip(col, 0, 1), alpha)
    rgba = np.concatenate([col, alpha[..., None]], -1)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'boughs.webp'), quality=88, method=6, exact=True)
    nt = np.stack([nrm[..., 0] * 0.5 + 0.5, nrm[..., 1] * 0.5 + 0.5, thick], -1)
    Image.fromarray((np.clip(nt, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, 'boughs_n.jpg'), quality=90, subsampling=0)
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path))
    manifest['boughs'] = cells
    json.dump(manifest, open(path, 'w'), indent=1)


if __name__ == '__main__':
    main()
