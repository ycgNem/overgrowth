# Blight Wisp: the flying enemy (night 4+). A rot-moth the size of a man: a cracked dead-wood
# mask with three burning eyes, a cage of pale ribs clutching the heart-light, two tattered
# wings (veined, scalloped, torn, an eye-spot on each, a trailing streamer behind), a wasp's
# abdomen curling under it with a sting, and a beard of roots hanging beneath.
# It hovers nose-up like a hornet, the face tipped down at whatever it is hunting.
# Forward is -Y (glTF +Z). The origin is the centre of the core: it floats.
# Animated nodes: "WingL" "WingR" (pivot at the shoulder; the game rolls them about the forward
# axis), "Tail" (pivot at the pelvis; swings fore and aft), "Core" (pulses up to 1.5x: the ribs
# clear it).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Wisp')
root = root_empty('Wisp', coll)
rnd = random.Random(91)

chitin = get_mat('Chitin', 0.6)
bone = get_mat('Bone', 0.7)
maskm = get_mat('Wood', 0.85)
vine = get_mat('Vine', 0.9)
membr = get_mat('MembraneDS', 0.75, double=True)
fur = get_mat('FurDS', 1.0, double=True)
# (emissive strengths are low on purpose: the game's bloom turns anything over ~1.5 white)
glow = get_mat('BlightGlow', 0.3, emit=(0.62, 0.16, 0.95), strength=1.15)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.42, 0.9), strength=1.5)
dim = get_mat('BlightDim', 0.4, emit=(0.5, 0.14, 0.78), strength=0.75)
GLOWC = (0.62, 0.16, 0.95)
EYEC = (1.0, 0.42, 0.9)
DIMC = (0.5, 0.14, 0.78)

DK = '#2c2030'
SHELL = '#3d2c3c'
BONEC = '#cfc09c'

TILT = Matrix.Rotation(-0.5, 4, 'X')  # nose up, abdomen hanging
def tp(p):
    return TILT @ Vector(p)

# ---------------------------------------------------------------- thorax (Body)
B = Part('Body', 1)
# two solid bulbs (chest and pelvis) joined by a spine and a keel; the ribs between them
# cage the core
B.add(sphere(0.1, 12, 8), chitin, SHELL, TILT @ M((0, -0.135, 0.02), (0, 0, 0), (0.95, 1.05, 1.0)), deform=jitter(0.012, 3, 9), smooth=True, var=0.2)
B.add(sphere(0.085, 10, 7), chitin, SHELL, TILT @ M((0, 0.15, 0.0), (0, 0, 0), (0.95, 1.0, 0.95)), deform=jitter(0.01, 4, 9), smooth=True, var=0.2)
SPINE = spline([(0, -0.12, 0.10), (0, -0.06, 0.152), (0, 0.02, 0.162), (0, 0.10, 0.135), (0, 0.17, 0.06)], 3)
B.add(tube([tp(p) for p in SPINE], 0.032, 0.024, 6), chitin, DK, smooth=True, var=0.15)
B.add(tube([tp(p) for p in spline([(0, -0.12, -0.085), (0, -0.04, -0.15), (0, 0.05, -0.15), (0, 0.14, -0.075)], 3)], 0.02, 0.015, 5), chitin, DK, smooth=True)
# a row of thorns down the spine, raked back
for k in range(5):
    p = Vector(SPINE[1 + k * 2])
    h = 0.05 + 0.05 * math.sin((k + 0.5) / 5 * math.pi)
    mm, ll = look_m(tp(p + Vector((0, 0, 0.015))), tp(p + Vector((0, 0.05, h + 0.015))))
    B.add(cone(0.016, ll, 5), bone, BONEC, mm, var=0.1)
# the ribs: five a side, curling down round the core to open claw-points
for k in range(5):
    y = -0.085 + k * 0.0425
    R = 0.152 * (1 - 0.35 * ((y - 0.01) / 0.13) ** 2)
    for sx in (-1, 1):
        pts = []
        for j in range(8):
            ph = 0.2 + j / 7 * 2.5
            rake = 0.04 * math.sin(ph * 0.6)
            pts.append(tp((sx * R * math.sin(ph), y + rake, R * 1.02 * math.cos(ph) + 0.01)))
        B.add(tube(pts, seg=4, radii=[0.019, 0.019, 0.018, 0.017, 0.015, 0.012, 0.008, 0.0]), bone, BONEC, smooth=True, var=0.12)
# the stalk the heart-light hangs from
B.add(tube([tp((0, 0.02, 0.15)), tp((0.012, 0.012, 0.1)), tp((0, 0, 0.05))], 0.012, 0.008, 4), chitin, DK)
# a ruff of dead fibre round the neck
for k in range(11):
    a = k / 11 * TAU + 0.2
    base = Vector((math.cos(a) * 0.075, -0.125, math.sin(a) * 0.075 + 0.02))
    tip = base + Vector((math.cos(a) * 0.1, 0.085 + rnd.uniform(-0.02, 0.03), math.sin(a) * 0.1))
    mm, ll = look_m(tp(base), tp(tip), rnd.uniform(-0.4, 0.4))
    B.add(leaf(ll * rnd.uniform(0.9, 1.25), 0.07, 0.3, 0.25, 3), fur, rnd.choice(['#7d6874', '#8b7762', '#5f4c5c', '#6f5a50']), mm, var=0.2)
# six hooked legs tucked under it
for k, y in enumerate((-0.085, -0.01, 0.07)):
    for sx in (-1, 1):
        s = 1.0 - k * 0.12
        pts = spline([(sx * 0.04, y, -0.11), (sx * 0.13 * s, y - 0.03, -0.17), (sx * 0.12 * s, y - 0.07, -0.28 * s - 0.02), (sx * 0.06 * s, y - 0.11, -0.33 * s - 0.03)], 2)
        B.add(tube([tp(p) for p in pts], 0.014, 0.005, 3), chitin, DK, smooth=True)
        mm, ll = look_m(tp(pts[-1]), tp(Vector(pts[-1]) + Vector((-sx * 0.03, -0.035, -0.02))))
        B.add(cone(0.007, ll, 4), bone, BONEC, mm)

# ---------------------------------------------------------------- head: the mask (in Body)
HM = Matrix.Translation(tp((0, -0.235, 0.05))) @ Matrix.Rotation(0.32, 4, 'X')  # looking down at you
def face(xn, zn, out=0.0):
    """A point on the mask: xn -1..1 across, zn -1 (chin) .. 1 (crown); out pushes it forward."""
    w = 0.1 * (1 - 0.9 * abs(zn) ** 2.2) if zn > 0 else 0.1 * (1 - 0.78 * abs(zn) ** 1.3)
    a = math.asin(max(-1.0, min(1.0, xn))) * 0.95
    return Vector((w * math.sin(a), -w * math.cos(a) * 0.72 - 0.035 * max(0.0, -zn) ** 1.5 - out, zn * (0.105 if zn > 0 else 0.185)))
def mask_fn(u, v):
    return face(math.sin((u - 0.5) * math.pi), -1 + 2 * v)
n0 = nfaces(B)
B.add(grid_surface(10, 11, mask_fn), maskm, '#c2b494', HM, deform=jitter(0.004, 6, 14), smooth=True, var=0.14, streak=0.3)
# the mask is stained dark toward its edges and chin
def stain(co, c):
    q = HM.inverted() @ co
    e = min(1.0, abs(q.x) / 0.1) ** 2.5 * 0.45 + max(0.0, -q.z / 0.185) ** 2 * 0.4
    return c * (1 - e)
paint(B, n0, stain)
# the dark of the skull behind it
B.add(sphere(0.085, 10, 7), chitin, '#1e161f', HM @ M((0, 0.035, 0.0), (0, 0, 0), (1.0, 0.8, 1.25)), smooth=True)
for sx in (-1, 1):
    # slanted sockets, each with a small hot eye deep in it
    B.add(sphere(0.036, 8, 5), chitin, '#120c12', HM @ M(face(sx * 0.5, 0.16, -0.012), (0.1, sx * 0.55, sx * 0.25), (1.25, 0.55, 0.72)), smooth=True, var=0.05)
    B.add(ico(0.0135, 1), eyeg, EYEC, HM @ M(face(sx * 0.47, 0.15, 0.012)), smooth=True)
    # brow ridge sweeping up into a horn
    pts = spline([face(sx * 0.08, 0.36, 0.006), face(sx * 0.55, 0.47, 0.01), face(sx * 0.95, 0.42, 0.0), face(sx * 0.95, 0.42, 0.0) + Vector((sx * 0.06, 0.07, 0.07))], 2)
    B.add(tube(pts, seg=4, radii=[0.011 + 0.006 * math.sin(i / (len(pts) - 1) * math.pi) for i in range(len(pts) - 1)] + [0.0]), maskm, '#a8987a', HM, smooth=True)
    # cheek splinter
    mm, ll = look_m(face(sx * 0.8, -0.25, 0.0), face(sx * 0.8, -0.25, 0.0) + Vector((sx * 0.035, 0.02, -0.07)))
    B.add(cone(0.014, ll, 4), maskm, '#9c8c70', HM @ mm)
    # hooked mouthparts under the chin
    pts = spline([(sx * 0.03, 0.02, -0.12), (sx * 0.065, -0.03, -0.2), (sx * 0.045, -0.085, -0.255), (sx * 0.008, -0.1, -0.275)], 2)
    B.add(tube(pts, 0.013, 0.0, 4), bone, BONEC, HM, smooth=True)
    # feathered antennae swept back over the shoulders
    an = spline([(sx * 0.035, 0.0, 0.085), (sx * 0.09, 0.04, 0.17), (sx * 0.14, 0.13, 0.225), (sx * 0.17, 0.24, 0.235), (sx * 0.175, 0.33, 0.205)], 2)
    B.add(tube(an, 0.009, 0.003, 4), bone, '#a89674', HM, smooth=True)
    for i in range(2, len(an) - 1):
        f = 1 - (i - 2) / (len(an) - 3)
        mm, ll = look_m(an[i], Vector(an[i]) + Vector((sx * 0.045, 0.03, -0.035)) * (0.45 + 0.8 * math.sin(f * math.pi) ** 0.7))
        B.add(cone(0.006, ll, 3), bone, '#b9a986', HM @ mm)
# the third eye, and a crack running from it down the face
B.add(ico(0.0115, 1), eyeg, EYEC, HM @ M(face(0.0, 0.52, 0.004)), smooth=True)
crack = [face(0.03, 0.4, 0.002), face(-0.07, 0.2, 0.002), face(0.05, 0.0, 0.002), face(-0.06, -0.22, 0.002), face(0.08, -0.45, 0.002), face(-0.03, -0.7, 0.002)]
B.add(tube(crack, 0.0055, 0.003, 3, cap=False), dim, DIMC, HM)
# crown and chin splinters
for x, h in ((-0.45, 0.05), (0.0, 0.075), (0.45, 0.05)):
    p = face(x, 0.9, -0.01)
    mm, ll = look_m(p, p + Vector((x * 0.03, 0.025, h)))
    B.add(cone(0.016, ll, 4), maskm, '#a8987a', HM @ mm)
p = face(0.0, -0.93, -0.01)
mm, ll = look_m(p, p + Vector((0, -0.01, -0.06)))
B.add(cone(0.016, ll, 4), maskm, '#9c8c70', HM @ mm)
body = B.build(coll, root)

# ---------------------------------------------------------------- core (pulses)
C = Part('Core', 2)
C.add(sphere(0.074, 10, 7), glow, GLOWC, M((0, 0, 0)), deform=jitter(0.006, 2, 12), smooth=True)
# dark veins wrapped round the light break it up, so it reads as a heart and not a bulb
for rot in ((0.3, 0.2, 0), (1.3, 0.5, 0.4), (0.6, 1.5, 1.0)):
    C.add(torus(0.074, 0.0085, 10, 3), chitin, '#231823', M((0, 0, 0), rot), deform=jitter(0.006, 5, 20))
core = C.build(coll, root)

# ---------------------------------------------------------------- wings (pivot at the shoulder)
def disc(r, seg=9):
    def b(bm):
        bmesh.ops.create_circle(bm, cap_ends=True, segments=seg, radius=r)
    return b

def wing(name, sx, seed):
    W = Part(name, seed)
    rw = random.Random(seed)
    TH0 = -0.35
    def dirv(th):
        return Vector((sx * math.cos(th + TH0), math.sin(th + TH0), 0))
    def z_fore(r, th):
        return 0.85 * r - 0.85 * r * r - 0.11 * (max(th, 0.0) / 1.48) ** 1.5 * (r / 0.76)
    def z_hind(r, th):
        return -0.015 - 0.22 * r - 0.25 * r * r
    def fan(veins, lens, scal, zf, nt, nr, notches, holes, c_root, c_mid, c_edge, rmax):
        cells = len(veins) - 1
        def edge(c, t):
            R = (lens[c] + (lens[c + 1] - lens[c]) * t) * (1 - scal[c] * math.sin(math.pi * t) ** 0.8)
            for (nc, t0, w, d) in notches:
                if nc == c:
                    R *= 1 - d * max(0.0, 1 - abs(t - t0) / w)
            return R
        def fn(u, v):
            c = min(int(u * cells), cells - 1)
            t = u * cells - c
            th = veins[c] + (veins[c + 1] - veins[c]) * t
            rho = 0.07 + 0.93 * v ** 0.85
            r = rho * edge(c, t)
            p = dirv(th) * r
            p.z = zf(r, th) - 0.03 * math.sin(math.pi * t) * rho
            return p
        n0 = nfaces(W)
        W.add(grid_surface(cells * nt, nr, fn, skip=lambda i, j: (i, j) in holes), membr, (0.8, 0.8, 0.8), deform=jitter(0.006, seed, 7), smooth=True, var=0.16)
        def tint(co, c):
            rho = math.hypot(co.x, co.y) / rmax
            col = mixc(c_root, c_mid, rho * 1.7)
            col = mixc(col, c_edge, (rho - 0.62) / 0.38)
            return col * (c.x / 0.8)
        paint(W, n0, tint)
        # the veins: pale ribs on the membrane, running out past its edge as thorn tips
        for i, (th, L) in enumerate(zip(veins, lens)):
            pts = []
            for k in range(8):
                r = L * 1.06 * k / 7
                p = dirv(th) * r
                p.z = zf(r, th) + 0.004
                pts.append(p)
            r0 = 0.019 if i == 0 else 0.012
            W.add(tube(pts, seg=3, radii=[r0 * 1.15 * (1 - 0.8 * (k / 7) ** 0.8) for k in range(7)] + [0.0]), bone, '#d6c69e', smooth=True, var=0.1)
    # forewing
    fan([0.0, 0.33, 0.68, 1.06, 1.48], [0.62, 0.76, 0.7, 0.58, 0.46], [0.1, 0.17, 0.22, 0.3], z_fore, 6, 8,
        [(1, rw.uniform(0.35, 0.65), 0.16, 0.3), (2, rw.uniform(0.3, 0.7), 0.2, 0.42), (3, rw.uniform(0.3, 0.7), 0.22, 0.5)],
        {(8, 5), (8, 6), (15, 4), (20, 6), (21, 6), (13, 7)},
        '#33202f', '#7a4670', '#9a7c4c', 0.76)
    # hindwing, with a long streamer trailing behind
    fan([1.56, 1.84, 2.12, 2.36], [0.44, 0.5, 0.76, 0.28], [0.2, 0.42, 0.5], z_hind, 5, 7,
        [(0, rw.uniform(0.3, 0.7), 0.22, 0.45)], {(3, 4), (7, 3)},
        '#2c1c2b', '#643a5e', '#8a6e46', 0.66)
    # a thicker arm bone along the leading edge, with a thumb claw
    arm = []
    for k in range(5):
        r = 0.3 * k / 4
        p = dirv(-0.04) * r
        p.z = z_fore(r, 0) + 0.006
        arm.append(p)
    W.add(tube(arm, 0.028, 0.02, 6), chitin, '#3d2c3c', smooth=True)
    mm, ll = look_m(arm[-1], arm[-1] + Vector((sx * 0.02, -0.09, 0.03)))
    W.add(cone(0.014, ll, 4), bone, BONEC, mm)
    # the eye-spot: a pale ring, a black pupil and a small ember, on both faces of the wing
    th, r = 0.6, 0.42
    c = dirv(th) * r
    c.z = z_fore(r, th) - 0.014
    e = 0.01
    nrm = (dirv(th + e) * r + Vector((0, 0, z_fore(r, th + e))) - dirv(th - e) * r - Vector((0, 0, z_fore(r, th - e)))).cross(
        dirv(th) * (r + e) + Vector((0, 0, z_fore(r + e, th))) - dirv(th) * (r - e) - Vector((0, 0, z_fore(r - e, th)))).normalized()
    if nrm.z < 0:
        nrm = -nrm
    for side in (1, -1):
        for rr, mat, col, off in ((0.085, membr, '#c9aa6c', 0.012), (0.058, membr, '#150d15', 0.017), (0.024, dim, DIMC, 0.022)):
            mm, _ = look_m(c + nrm * off * side, c + nrm * (off + 1) * side)
            W.add(disc(rr, 12), mat, col, mm, var=0.08)
    return W.build(coll, root, tp((sx * 0.09, -0.06, 0.12)))

wl = wing('WingL', -1, 11)
wr = wing('WingR', 1, 12)

# ---------------------------------------------------------------- abdomen, sting and roots (pivot at the pelvis)
T = Part('Tail', 9)
AB = [Vector(p) for p in ((0, 0, 0), (0, 0.1, -0.075), (0, 0.165, -0.19), (0, 0.18, -0.33), (0, 0.14, -0.46), (0, 0.065, -0.555))]
RAD = [0.078, 0.09, 0.084, 0.07, 0.052, 0.036]
# overlapping plates along a curling centreline: each segment a short barrel that swells at
# its front lip and tucks under the next one
CL = spline(AB, 5)
NSEG = 6
per = (len(CL) - 1) // NSEG
for i in range(NSEG):
    seg = CL[i * per:min(len(CL), (i + 1) * per + 2)]
    R = RAD[i]
    R2 = RAD[min(i + 1, len(RAD) - 1)]
    k = len(seg)
    radii = [R * 0.55] + [R * (1.1 - 0.16 * j / (k - 2)) + (R2 - R) * 0.6 * j / (k - 2) for j in range(k - 2)] + [R2 * 0.7]
    n0 = nfaces(T)
    T.add(tube(seg, seg=8, radii=radii), chitin, (0.8, 0.8, 0.8), deform=jitter(0.006, 20 + i, 9), smooth=True, var=0.16)
    # dark plates on the back, a paler, sick belly, a dark groove where each plate ends
    a = seg[0]
    L = (seg[-1] - seg[0]).length
    def belly(co, c, a=a, L=L, ax=(seg[-1] - seg[0]).normalized()):
        fwd = Vector((0, -0.5, -0.85)).normalized()  # the abdomen's underside faces down and forward
        d = co - a
        s = d.dot(ax) / L
        side = (d - ax * d.dot(ax))
        kk = side.normalized().dot(fwd) if side.length > 1e-5 else 0
        col = mixc('#3a2a40', '#96707a', (kk + 0.2) * 1.3)
        return col * (c.x / 0.8) * (1.0 - 0.45 * max(0.0, s - 0.6) / 0.4)
    paint(T, n0, belly)
    # a dim slit of blight light under each plate's lip, low on the flank
    if 0 < i:
        for sx in (-1, 1):
            T.add(sphere(0.011, 6, 4), dim, DIMC, M(a + Vector((sx * R * 0.93, -0.025, -0.025)), (0.5, 0, 0), (0.6, 0.9, 1.9)))
# the sting, curling forward under it
st = spline([AB[-1], AB[-1] + Vector((0, -0.05, -0.065)), AB[-1] + Vector((0, -0.12, -0.07)), AB[-1] + Vector((0, -0.17, -0.03))], 3)
T.add(tube(st, 0.03, 0.0, 5), bone, BONEC, smooth=True)
# roots hanging from the abdomen: a ragged beard, a few ending in small buds of light
for k in range(8):
    i = rnd.choice((1, 2, 2, 3, 3, 4, 4, 5))
    p = AB[i] + Vector((rnd.uniform(-0.6, 0.6) * RAD[i], rnd.uniform(0.0, 0.5) * RAD[i], -RAD[i] * 0.55))
    pts = [p]
    L = rnd.uniform(0.3, 0.62)
    n = 5
    for j in range(n):
        p = p + Vector((rnd.uniform(-0.045, 0.045), 0.03 + rnd.uniform(0.0, 0.05), -L / n))
        pts.append(p)
    T.add(tube(pts, rnd.uniform(0.014, 0.021), 0.004, 4), vine, rnd.choice(['#4e3c30', '#3e3028', '#5a4638']), smooth=True, var=0.15)
    if k % 3 == 0:
        T.add(sphere(0.015, 6, 4), dim, DIMC, M(pts[-1], (0, 0, 0), (1, 1, 1.5)))
    elif k % 3 == 1:
        lm = Matrix.Translation(pts[-3]) @ Euler((math.pi + rnd.uniform(-0.4, 0.4), 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
        T.add(leaf(0.1, 0.05, 0.3, 0.2, 3), membr, '#5a3e52', lm, var=0.2)
# torn banners of wing-skin trailing from the pelvis
for k in range(4):
    a0 = (k - 1.5) * 0.7
    L = rnd.uniform(0.38, 0.6)
    wv = rnd.uniform(0, 6)
    x0 = math.sin(a0) * 0.07
    def rib(u, v, a0=a0, L=L, wv=wv, x0=x0):
        w = 0.05 * (1 - 0.75 * v) * (1 if v < 0.85 else 0.5)
        x = x0 + (u - 0.5) * 2 * w + 0.03 * math.sin(v * 5 + wv) * v + math.sin(a0) * 0.1 * v
        return Vector((x, 0.06 + 0.2 * v + 0.03 * math.sin(v * 7 + wv), -0.02 - L * v + abs(u - 0.5) * 0.02))
    n0 = nfaces(T)
    T.add(grid_surface(2, 6, rib), membr, (0.8, 0.8, 0.8), smooth=True, var=0.2)
    paint(T, n0, lambda co, c: mixc('#4a2e44', '#8a6e46', (-co.z - 0.2) / 0.4) * (c.x / 0.8))
tail = T.build(coll, root, tp((0, 0.17, -0.01)))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
