# Husk: the day-walker. One of the lost expedition, overgrown: a hunched man knuckle-walking on
# arms grown too long, his khaki shirt and puttees in rags, the rucksack and bedroll still strapped
# to his back, a cracked pith helmet on a skull with one amber eye and a bracket fungus where the
# other was. The right arm has swollen into a club of dead wood, the left ends in root fingers;
# one boot is left. Moss, shelf fungus and a fern have taken the pack.
# Forward is -Y (glTF +Z). Origin on the ground under the body.
# Animated nodes (the Blightling's rig; the game swings them about X at the pivot):
#   "Head" (pivot at the neck) > "Jaw" (hinge under the ears),
#   "LegFL" "LegFR" = the arms (pivot at the shoulder), "LegBL" "LegBR" = the legs (pivot at the hip),
#   "Tail" = the rope and tin cup hanging off the pack (yaws side to side).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Husk')
root = root_empty('Husk', coll)
rnd = random.Random(77)

hide = get_mat('Hide', 0.85)
wood = get_mat('Wood', 0.9)
bone = get_mat('Bone', 0.7)
moss = get_mat('Moss', 1.0)
fung = get_mat('Fungus', 0.6)
vine = get_mat('Vine', 0.9)
sack = get_mat('Sack', 0.95)
canvas = get_mat('CanvasDS', 0.95, double=True)
leafm = get_mat('LeafDS', 0.7, double=True)
leather = get_mat('Leather', 0.8)
iron = get_mat('Iron', 0.5, 0.6)
pith = get_mat('PithDS', 0.9, double=True)
rope = get_mat('Rope', 0.95)
# amber, not blight-violet; kept dim so the game's bloom doesn't turn it into a white bulb
eyeg = get_mat('HuskEye', 0.25, emit=(1.0, 0.58, 0.14), strength=1.4)
glow = get_mat('HuskGlow', 0.35, emit=(1.0, 0.46, 0.1), strength=0.7)
EYEC = (1.0, 0.58, 0.14)
GLOWC = (1.0, 0.46, 0.1)

SKIN = '#8d806a'
SKIN_D = '#5f5446'
WOODC = '#5e4d3c'
KHAKI = '#857b56'
KHAKI_D = '#615b3e'
LEATHER = '#3e2c1f'
MOSSES = ['#55702c', '#4a6426', '#637c33']
X = Vector((1, 0, 0))

# ---------------------------------------------------------------- local builders
def cuff(L, r0, r1, seed, jag=0.4, nu=9, nv=3, flare=0.0):
    """Torn sleeve / trouser leg along +z: an open tube whose far hem is ragged."""
    rr = random.Random(seed)
    hem = [1 - jag * rr.random() for _ in range(nu)]
    def fn(u, v):
        i = int(round(u * nu)) % nu
        a = u * TAU
        r = r0 + (r1 - r0) * v + flare * v * v
        return Vector((math.cos(a) * r, math.sin(a) * r, L * v * hem[i]))
    return grid_surface(nu, nv, fn)

def ribbon(pts, w, up):
    """Flat strap through pts, w wide, lying across the direction `up` (fn: index -> Vector)."""
    def b(bm):
        rows = []
        for i, p in enumerate(pts):
            t = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
            s = t.cross(up(i)).normalized() * (w / 2)
            rows.append((bm.verts.new(Vector(p) - s), bm.verts.new(Vector(p) + s)))
        for i in range(len(rows) - 1):
            bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
    return b

def helix(a, b, r, turns, n=14, phase=0.0, r2=None):
    """Points winding round the segment a->b (a vine up a limb)."""
    a, b = Vector(a), Vector(b)
    d = (b - a)
    t = d.normalized()
    u = t.orthogonal().normalized()
    v = t.cross(u)
    r2 = r if r2 is None else r2
    return [a + d * (i / n) + (u * math.cos(phase + i / n * turns * TAU) + v * math.sin(phase + i / n * turns * TAU)) * (r + (r2 - r) * i / n) for i in range(n + 1)]

def bracket(P, pos, r, col='#b98a4e', tilt=(0, 0, 0), seed=0):
    """Shelf fungus: a flat dome with growth rings and a pale lip, half sunk into whatever it grows on."""
    n0 = nfaces(P)
    m = M(pos, tilt, (r, r, r * 0.3))
    P.add(sphere(1.0, 8, 4), fung, col, m, deform=jitter(0.06, seed, 3), smooth=True, var=0.12)
    inv = m.inverted()
    def lip(co, c):
        q = inv @ co
        d = math.hypot(q.x, q.y)
        k = c * (0.72 + 0.28 * math.sin(d * 14))          # growth rings
        return mixc(k, '#e6dcc0', (d - 0.8) / 0.2) if q.z > -0.2 else mixc(k, '#d8ceb0', 0.7)
    paint(P, n0, lip)

def moss_clump(P, p, r, seed, flat=0.5):
    P.add(ico(r, 2), moss, rnd.choice(MOSSES), M(p, (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, TAU)), (1.3, 1.15, flat)), deform=jitter(r * 0.28, seed, 9), var=0.22)

# ---------------------------------------------------------------- torso
# the spine: hips low at the back, a hump over the shoulders, the neck thrust forward and down
SP = spline([(0, 0.27, 0.5), (0, 0.18, 0.66), (0, 0.05, 0.8), (0, -0.11, 0.87), (0, -0.24, 0.85)], 6)
def sp(t):
    f = max(0.0, min(1.0, t)) * (len(SP) - 1)
    i = min(int(f), len(SP) - 2)
    return SP[i].lerp(SP[i + 1], f - i), (SP[i + 1] - SP[i]).normalized()
PROF = [(0.0, 0.15, 0.125), (0.28, 0.118, 0.098), (0.62, 0.188, 0.15), (0.84, 0.205, 0.132), (1.0, 0.1, 0.09)]
def prof(t):
    for (t0, x0, y0), (t1, x1, y1) in zip(PROF, PROF[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            k = k * k * (3 - 2 * k)
            return x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    return PROF[-1][1], PROF[-1][2]
def torso_pt(t, a, grow=1.0):
    """A point on the trunk: t 0 (hips) .. 1 (neck), a round it (0 = his left... +X, pi/2 = the back)."""
    p, tan = sp(t)
    back = tan.cross(X)
    rx, ry = prof(t)
    s, c = math.sin(a), math.cos(a)
    ry *= 1 + 0.3 * max(0.0, s) * math.exp(-((t - 0.62) / 0.2) ** 2)      # the hump
    ry *= 1 - 0.38 * max(0.0, -s) * math.exp(-((t - 0.3) / 0.2) ** 2)     # the belly, sucked in
    return p + X * (c * rx * grow) + back * (s * ry * grow)

B = Part('Body', 1)
n0 = nfaces(B)
B.add(grid_surface(14, 12, lambda u, v: torso_pt(v, u * TAU)), hide, (0.8, 0.8, 0.8), deform=jitter(0.01, 3, 7), smooth=True, var=0.16)
def skin(co, c):
    up = (co.z - 0.55) / 0.4
    col = mixc(SKIN_D, SKIN, 0.45 + up * 0.5)
    col = mixc(col, '#5a6a38', max(0.0, up - 0.35) * 1.1 + noise.noise(co * 5.0) * 0.45 - 0.1)   # green on the back
    return col * (c.x / 0.8)
paint(B, n0, skin)
B.add(sphere(0.15, 10, 6), sack, '#5a5532', M(SP[0] + Vector((0, 0.03, -0.03)), (0.3, 0, 0), (1.05, 0.9, 0.82)), deform=jitter(0.012, 8, 8), smooth=True, var=0.2, streak=0.3)
B.add(sphere(0.1, 8, 5), hide, SKIN_D, M(SP[-1] + Vector((0, 0.02, 0)), (0, 0, 0), (1.0, 1.0, 0.9)), smooth=True, var=0.15)
# ribs standing out under the skin of the flanks
for k in range(4):
    t = 0.44 + k * 0.07
    for sx in (-1, 1):
        pts = []
        for i in range(6):
            a = 0.95 - i * 0.42
            pts.append(torso_pt(t - 0.035 * i / 5, a if sx > 0 else math.pi - a, 1.015))
        B.add(tube(pts, seg=3, radii=[0.004, 0.015, 0.017, 0.016, 0.013, 0.003]), hide, '#9a8e78', smooth=True, var=0.1)
# knuckles of the spine pushing up through the back
for k in range(6):
    t = 0.14 + k * 0.085
    p = torso_pt(t, math.pi / 2, 1.0)
    B.add(ico(0.026, 1), bone, '#b7ab8e', M(p, (0, 0, 0), (0.8, 1.0, 0.8)), deform=jitter(0.004, k, 20))
# where the heart was: the left ribs laid open over a hollow with something amber growing in it
HA = 1.5 * math.pi - 0.75   # the front of the chest, off to one side
hc = torso_pt(0.6, HA, 0.9)
B.add(sphere(0.075, 9, 6), hide, '#1f1812', M(torso_pt(0.6, HA, 0.99), (0, 0, 0), (1.0, 1.0, 1.0)), smooth=True, var=0.05)
B.add(ico(0.03, 1), glow, GLOWC, M(torso_pt(0.6, HA, 1.06) + Vector((0, 0, -0.01)), (0, 0, 0), (1, 1, 1.25)), deform=jitter(0.006, 2, 20))
for k in range(4):
    t = 0.53 + k * 0.045
    pts = [torso_pt(t, HA - 0.55 + i * 0.275, 1.1 + 0.07 * math.sin(i / 4 * math.pi)) for i in range(5)]
    B.add(tube(pts, seg=4, radii=[0.006, 0.011, 0.012, 0.011, 0.004 if k % 2 else 0.011]), bone, '#cfc3a2', smooth=True, var=0.1)

# the shirt: khaki, open down the front, the hem and the back in rags
rs = random.Random(4)
HEM = [0.33 + 0.11 * rs.random() for _ in range(15)]
HOLES = {(2, 1), (2, 2), (5, 4), (6, 4), (12, 2), (4, 0), (1, 5), (8, 0)}
def shirt(u, v):
    i = int(round(u * 14)) % 14
    t = HEM[i] + (0.93 - HEM[i]) * v
    a = u * TAU
    g = 1.09 + 0.035 * math.sin(a * 5 + t * 9) + (0.05 * (1 - v) ** 2)
    return torso_pt(t, a, g)
n0 = nfaces(B)
B.add(grid_surface(14, 7, shirt, skip=lambda i, j: i in (9, 10) or (i in (8, 11) and j < 3) or (i, j) in HOLES), canvas, (0.8, 0.8, 0.8), smooth=True, var=0.2, streak=0.25)
def cloth(co, c):
    k = mixc(KHAKI_D, KHAKI, (co.z - 0.55) / 0.35 + noise.noise(co * 4) * 0.5)
    return mixc(k, '#50602e', noise.noise(co * 2.7 + Vector((3, 1, 7))) * 0.9 - 0.25) * (c.x / 0.8)   # mildew
paint(B, n0, cloth)
# collar points
for sx in (-1, 1):
    lm, _ = look_m(torso_pt(0.93, -math.pi / 2 + sx * 0.75, 1.12), torso_pt(0.8, -math.pi / 2 + sx * 0.55, 1.2))
    B.add(leaf(0.11, 0.07, 0.2, 0.1, 2), canvas, KHAKI, lm, var=0.15)
# belt and buckle
belt = [torso_pt(0.1, i / 14 * TAU, 1.07) for i in range(15)]
B.add(ribbon(belt, 0.04, lambda i: (belt[i] - sp(0.1)[0]).normalized()), leather, LEATHER, var=0.15)
B.add(box(0.055, 0.016, 0.05, base=False), iron, '#8f7f5c', M(torso_pt(0.1, -math.pi / 2, 1.1), (0.9, 0, 0)), var=0.1)
# bandolier across the chest, a canteen hanging from it at the right hip
band = [torso_pt(0.9 - 0.75 * i / 12, math.pi * 0.72 + i / 12 * (math.pi * 1.2), 1.17) for i in range(13)]
B.add(ribbon(band, 0.035, lambda i: (band[i] - sp(0.9 - 0.75 * i / 12)[0]).normalized()), leather, '#4a3626', var=0.15)
cp = torso_pt(0.14, -0.2, 1.28)
B.add(cyl(0.062, 0.062, 0.04, 10), sack, '#6a6a4a', M(cp + Vector((0.02, 0, -0.03)), (0, math.pi / 2, 0.2)), smooth=True, var=0.15)
B.add(cyl(0.014, 0.012, 0.03, 6), iron, '#77756c', M(cp + Vector((0.02, 0, 0.03))))

# ---------------------------------------------------------------- the rucksack
pp, ptan = sp(0.5)
pback = ptan.cross(X)
PK = Matrix.Translation(pp + pback * 0.235) @ Matrix((X, pback, ptan)).transposed().to_4x4()
n0 = nfaces(B)
B.add(box(0.3, 0.17, 0.33, base=False, cuts=1, chamfer=0.03), sack, '#716b47', PK, deform=jitter(0.02, 3, 5), var=0.2, streak=0.3)
B.add(box(0.31, 0.06, 0.15, base=False, chamfer=0.02), sack, '#7c744c', PK @ M((0, 0.07, 0.1), (-0.25, 0, 0)), deform=jitter(0.01, 5, 6), var=0.2)
for sx in (-1, 1):
    B.add(box(0.07, 0.12, 0.16, base=False, chamfer=0.02), sack, '#665f40', PK @ M((sx * 0.175, 0.0, -0.06)), deform=jitter(0.01, 7 + sx, 6), var=0.2)
    B.add(box(0.03, 0.012, 0.035, base=False), iron, '#8f7f5c', PK @ M((sx * 0.08, 0.105, 0.045), (-0.25, 0, 0)), var=0.1)
    B.add(box(0.03, 0.01, 0.1, base=False), leather, LEATHER, PK @ M((sx * 0.08, 0.1, 0.0), (-0.1, 0, 0)), var=0.1)
    # shoulder strap: from the top of the pack, round the chest, back to its foot
    st = [PK @ Vector((sx * 0.1, -0.07, 0.15))]
    for i in range(7):
        a = math.pi / 2 - sx * (0.55 + i / 6 * 2.2)
        st.append(torso_pt(0.86 - 0.3 * (i / 6) ** 1.5, a, 1.19))
    st.append(PK @ Vector((sx * 0.13, -0.07, -0.14)))
    B.add(tube(st, 0.017, 0.015, 4), leather, '#4a3626', smooth=True, var=0.15)
def mildew(co, c):
    return mixc(c, Vector(hexc('#4c5c2c')) * (c.x / 0.45), noise.noise(co * 3.1 + Vector((9, 2, 4))) * 1.1 - 0.15)
paint(B, n0, mildew)
# the bedroll across the top, its straps
B.add(cyl(0.068, 0.064, 0.42, 10), sack, '#8c7c56', PK @ M((-0.21, 0.015, 0.225), (0, math.pi / 2, 0)), deform=jitter(0.008, 9, 9), smooth=True, var=0.2, streak=0.3)
for x in (-0.12, 0.12):
    B.add(torus(0.072, 0.009, 10, 4), leather, LEATHER, PK @ M((x, 0.015, 0.225), (0, math.pi / 2, 0)), var=0.1)
# the forest has moved in: moss on the pack and shoulders, shelf fungus, toadstools, a fern
for k, (x, y, z, r) in enumerate(((0.07, 0.03, 0.29, 0.07), (-0.1, 0.02, 0.3, 0.06), (0.13, 0.09, 0.12, 0.05), (-0.02, 0.1, -0.02, 0.06), (-0.16, 0.06, -0.15, 0.05))):
    moss_clump(B, PK @ Vector((x, y, z)), r, 30 + k)
for sx, a, t, r in ((1, 0.55, 0.8, 0.075), (-1, 0.5, 0.74, 0.06), (1, 0.95, 0.42, 0.05), (-1, 1.2, 0.9, 0.05)):
    moss_clump(B, torso_pt(t, a if sx > 0 else math.pi - a, 1.08), r, 40 + int(t * 50))
for k, (x, z, r, tl) in enumerate(((0.16, 0.06, 0.085, 0.15), (0.165, -0.01, 0.065, -0.1), (0.15, -0.1, 0.05, 0.2), (-0.17, 0.1, 0.06, 0.1))):
    bracket(B, PK @ Vector((x, 0.04, z)), r, rnd.choice(['#b98a4e', '#a8743e', '#c49a5c']), (tl, math.copysign(0.2, x), k), 50 + k)
for k in range(4):
    mushroom_parts(B, fung, fung, PK @ M((-0.07 + k * 0.035 + rnd.uniform(-0.01, 0.01), 0.035 + rnd.uniform(-0.03, 0.03), 0.285)), h=rnd.uniform(0.06, 0.12), r=rnd.uniform(0.03, 0.045),
                   cap=rnd.choice(['#c8643a', '#b8532e', '#d07a44']), stem='#d8ceb0', rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0), seed=k)
for k in range(5):
    a = k / 5 * TAU + 0.3
    lm = PK @ Matrix.Translation((0.11, 0.03, 0.28)) @ Euler((0.75 + rnd.uniform(-0.15, 0.2), 0, a)).to_matrix().to_4x4()
    B.add(leaf(rnd.uniform(0.15, 0.22), 0.07, 0.3, 0.45, 5), leafm, rnd.choice(['#4f7a2e', '#5c8a34', '#467028']), lm, var=0.15)
body = B.build(coll, root)

# ---------------------------------------------------------------- head + jaw (pivot at the neck)
NECK = SP[-1].copy()
HC = Vector((0, -0.175, -0.015))                       # skull centre, from the neck
HMx = Matrix.Translation(HC) @ Matrix.Rotation(0.16, 4, 'X')   # the face thrust forward, glaring up from under the brim
Hd = Part('Head', 2)
Hd.add(tube(spline([(0, 0.07, -0.01), (0, -0.04, 0.0), HC + Vector((0, 0.04, 0.0))], 2), 0.066, 0.052, 7), hide, SKIN_D, smooth=True, var=0.15, streak=0.4)
def skullb(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for v in bm.verts:
        if v.co.z < 0:                    # hollow cheeks, a long upper jaw
            v.co.x *= 1 - 0.3 * (-v.co.z) ** 0.8
            v.co.y = v.co.y * (1 - 0.12 * (-v.co.z)) - 0.1 * (-v.co.z)
n0 = nfaces(Hd)
Hd.add(skullb, hide, (0.8, 0.8, 0.8), HMx @ M((0, 0, 0), (0, 0, 0), (0.098, 0.115, 0.112)), deform=jitter(0.005, 5, 12), smooth=True, var=0.14)
hinv = HMx.inverted()
def face_paint(co, c):
    q = hinv @ co
    col = mixc('#a39a84', '#6e6454', max(0.0, -q.z / 0.11) * 0.8)           # grey skin, darker at the mouth
    col = mixc(col, '#5c6b3a', (-q.x - 0.01) / 0.08 + noise.noise(co * 9) * 0.3)   # the left side has gone green
    return col * (c.x / 0.8)
paint(Hd, n0, face_paint)
for sx in (-1, 1):
    # sockets under a heavy brow, a cheekbone
    Hd.add(sphere(0.031, 8, 5), hide, '#16110d', HMx @ M((sx * 0.04, -0.094, 0.012), (0.1, sx * 0.25, 0), (1.15, 0.55, 0.95)), smooth=True, var=0.05)
    Hd.add(tube([HMx @ Vector(p) for p in ((sx * 0.005, -0.112, 0.04), (sx * 0.045, -0.112, 0.05), (sx * 0.085, -0.075, 0.035))], seg=4, radii=[0.012, 0.016, 0.01]), hide, '#9a917c', smooth=True)
    Hd.add(tube([HMx @ Vector(p) for p in ((sx * 0.03, -0.105, -0.025), (sx * 0.07, -0.085, -0.02), (sx * 0.088, -0.03, -0.015))], seg=4, radii=[0.008, 0.013, 0.008]), hide, '#958c78', smooth=True)
# the right eye: a small hot amber coal deep in the socket
Hd.add(ico(0.0135, 1), eyeg, EYEC, HMx @ M((0.04, -0.108, 0.01)))
# the left: a bracket fungus has pushed out through the socket, a root crawling up over the brow
for k, (dz, r) in enumerate(((0.0, 0.045), (0.022, 0.034), (-0.018, 0.03))):
    bracket(Hd, HMx @ Vector((-0.045 - k * 0.006, -0.1, 0.012 + dz)), r, ['#b98a4e', '#c49a5c', '#a8743e'][k], (0.45, 0.1, k), 60 + k)
Hd.add(tube([HMx @ Vector(p) for p in spline([(-0.05, -0.1, -0.02), (-0.075, -0.09, 0.03), (-0.06, -0.085, 0.075), (-0.02, -0.06, 0.1)], 2)], 0.008, 0.003, 4), vine, '#4a3c2c', smooth=True)
# nose hole, upper teeth
Hd.add(cone(0.016, 0.03, 4), hide, '#16110d', HMx @ M((0, -0.118, -0.035), (-0.3, 0, 0)), var=0.05)
for k in range(7):
    x = (k - 3) * 0.014
    Hd.add(box(0.011, 0.01, 0.02 if k != 2 else 0.011, base=False), bone, '#d9cfb2', HMx @ M((x, -0.112 + abs(x) * 0.35, -0.079), (0, 0, 0)), var=0.12)
# the pith helmet: cracked, stained, knocked askew, still strapped on
HELM = HMx @ M((0.005, 0.03, 0.062), (-0.4, 0.17, 0.1))
def dome(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
def brim(u, v):
    a = u * TAU
    stretch = 1.22 if math.sin(a) > 0 else 1.12          # longer over the neck
    r = 0.118 + v * 0.085
    return Vector((math.cos(a) * r, math.sin(a) * r * (1.12 + (stretch - 1.12) * abs(math.sin(a))), 0.004 - 0.05 * v ** 1.4))
n0 = nfaces(Hd)
Hd.add(dome, pith, (0.8, 0.8, 0.8), HELM @ M((0, 0, 0), (0, 0, 0), (0.123, 0.142, 0.1)), deform=jitter(0.004, 8, 10), smooth=True, var=0.1)
Hd.add(grid_surface(14, 2, brim, skip=lambda i, j: (i, j) in {(5, 1), (6, 1), (6, 0), (11, 1)}), pith, (0.8, 0.8, 0.8), HELM, deform=jitter(0.006, 9, 8), smooth=True, var=0.1)
hlinv = HELM.inverted()
def stainp(co, c):
    q = hlinv @ co
    col = mixc('#bdb28c', '#8f8660', 0.5 - q.z / 0.1 + noise.noise(co * 8) * 0.5)
    col = mixc(col, '#56682f', noise.noise(co * 6 + Vector((5, 5, 5))) * 1.3 - 0.2 + (0.25 if q.x < 0 else 0))
    return col * (c.x / 0.8)
paint(Hd, n0, stainp)
Hd.add(tube([HELM @ Vector((math.cos(i / 12 * TAU) * 0.121, math.sin(i / 12 * TAU) * 0.14, 0.014)) for i in range(13)], 0.011, 0.011, 4, cap=False), leather, '#4a3626', var=0.12)
Hd.add(cyl(0.016, 0.012, 0.016, 6), pith, '#a79c78', HELM @ M((0, 0, 0.097)))
moss_clump(Hd, HELM @ Vector((-0.06, 0.05, 0.075)), 0.045, 71, 0.45)
moss_clump(Hd, HELM @ Vector((0.03, 0.1, 0.05)), 0.035, 72, 0.45)
for k in range(3):
    lm = HELM @ Matrix.Translation((-0.07, 0.03, 0.085)) @ Euler((0.6 + k * 0.15, 0, k * 2.1 + 3.6)).to_matrix().to_4x4()
    Hd.add(leaf(0.12 + k * 0.03, 0.05, 0.3, 0.3, 4), leafm, ['#4f7a2e', '#5c8a34', '#467028'][k], lm, var=0.15)
# the chin strap, snapped, and lank roots hanging from under the brim like hair
Hd.add(tube([HELM @ Vector(p) for p in ((0.118, 0.0, 0.0), (0.105, -0.02, -0.09), (0.09, -0.05, -0.16))], 0.006, 0.005, 3), leather, LEATHER)
for k in range(6):
    a = 0.5 + k * 0.42
    p0 = HELM @ Vector((math.cos(a) * 0.1, math.sin(a) * 0.125, -0.01))
    L = rnd.uniform(0.1, 0.2)
    pts = [p0, p0 + Vector((rnd.uniform(-0.02, 0.02), 0.02, -L * 0.5)), p0 + Vector((rnd.uniform(-0.03, 0.03), 0.01, -L))]
    Hd.add(tube(pts, 0.007, 0.002, 3), vine, rnd.choice(['#4a3c2c', '#3c3626', '#55482f']), var=0.15)
head = Hd.build(coll, root, NECK)

J = Part('Jaw', 3)
# (built pointing forward from the hinge; the node's rest rotation drops it open)
arc = spline([(-0.062, 0.0, 0.012), (-0.058, -0.06, -0.012), (-0.034, -0.103, -0.02), (0.0, -0.117, -0.022), (0.034, -0.103, -0.02), (0.058, -0.06, -0.012), (0.062, 0.0, 0.012)], 2)
J.add(tube(arc, 0.015, 0.015, 5), hide, '#857c68', smooth=True, var=0.14)
J.add(grid_surface(4, 2, lambda u, v: Vector(((u - 0.5) * 0.1 * (1 - 0.5 * v), -0.02 - 0.085 * v, -0.022 - 0.012 * math.sin(u * math.pi))), None), hide, '#3a2c24', smooth=True, var=0.1)
for k in range(6):
    x = (k - 2.5) * 0.014
    J.add(box(0.01, 0.009, 0.018 if k != 4 else 0.01, base=False), bone, '#d4c9aa', M((x, -0.112 + abs(x) * 0.4, -0.004)), var=0.12)
# creeper spilling out of the mouth
for k in range(3):
    p0 = Vector(((k - 1) * 0.028, -0.085, -0.012))
    L = rnd.uniform(0.1, 0.19)
    pts = spline([p0, p0 + Vector((rnd.uniform(-0.02, 0.02), -0.03, -L * 0.4)), p0 + Vector((rnd.uniform(-0.03, 0.03), -0.015, -L))], 2)
    J.add(tube(pts, 0.008, 0.003, 3), vine, '#4f6a2c', smooth=True, var=0.15)
    lm = Matrix.Translation(pts[-1]) @ Euler((math.pi - 0.3, 0, k * 2.0)).to_matrix().to_4x4()
    J.add(leaf(0.06, 0.04, 0.3, 0.2, 2), leafm, '#5c8a34', lm, var=0.15)
jawo = J.build(coll, head, HMx @ Vector((0, -0.012, -0.07)))
jawo.rotation_euler = (0.16 + 0.3, 0, 0)

# ---------------------------------------------------------------- arms (LegF*: pivot at the shoulder)
def make_arm(name, sx, club, seed):
    P = Part(name, seed)
    E = Vector((sx * 0.085, 0.07, -0.37))         # elbow, carried back
    Wr = Vector((sx * 0.05, -0.27, -0.75))        # wrist
    G = -0.82                                     # the ground, from the shoulder
    P.add(sphere(0.078, 9, 6), hide, SKIN, M((0, 0, 0)), deform=jitter(0.008, seed, 8), smooth=True, var=0.15)
    P.add(tube(spline([(0, 0, 0), E * 0.5 + Vector((sx * 0.025, 0.02, 0)), E], 3), 0.062, 0.044, 7), hide, SKIN, deform=jitter(0.006, seed, 9), smooth=True, var=0.16, streak=0.3)
    # what is left of the sleeve
    mm, ll = look_m((0, 0, 0.02), E * 0.55)
    n0 = nfaces(P)
    P.add(cuff(ll, 0.08, 0.066, seed, 0.7, 10, 3, 0.012), canvas, (0.8, 0.8, 0.8), mm, smooth=True, var=0.2)
    paint(P, n0, lambda co, c: mixc(KHAKI_D, KHAKI, noise.noise(co * 6) + 0.5) * (c.x / 0.8))
    if club:
        # the forearm has swollen into a club of dead wood, knuckled with roots
        mid = E.lerp(Wr, 0.55) + Vector((sx * 0.03, 0.02, 0))
        fa = spline([E, mid, Wr, Wr + Vector((0, -0.03, -0.05))], 3)
        P.add(tube(fa, seg=10, radii=[0.05 + 0.055 * math.sin(min(1.0, i / (len(fa) - 1) * 1.25) * math.pi * 0.62) for i in range(len(fa))]), wood, WOODC,
              deform=jitter(0.03, seed + 1, 6), smooth=True, var=0.3, streak=0.6)
        # burls, a split with the pale heartwood showing, snapped stubs
        for k in range(5):
            f = 0.15 + k * 0.17
            a = k * 2.4 + 0.5
            p = E.lerp(Wr, f) + Vector((math.cos(a) * 0.075, math.sin(a) * 0.075, 0))
            P.add(ico(rnd.uniform(0.035, 0.05), 1), wood, rnd.choice(['#4e4032', '#6a5642', '#463a2e']), M(p, (a, f, 0), (1.0, 1.3, 0.8)), deform=jitter(0.012, seed + k, 10), var=0.2)
        for k, (f, a, L) in enumerate(((0.25, 2.4, 0.11), (0.6, 3.6, 0.14), (0.45, 1.2, 0.08))):
            p = E.lerp(Wr, f)
            mm2, ll2 = look_m(p, p + Vector((math.cos(a) * (0.09 + L), math.sin(a) * (0.09 + L) * 0.6, 0.06)))
            P.add(ringed_cyl(0.022, 0.01, ll2, 5, 2), wood, '#3e3328', mm2, deform=jitter(0.006, k, 12), smooth=True)
        for k in range(4):
            a = (k - 1.5) * 0.42
            p0 = Wr + Vector((math.sin(a) * 0.075, -0.03, -0.03))
            pts = spline([p0, p0 + Vector((math.sin(a) * 0.05, -0.07, -0.02)), Vector((p0.x + math.sin(a) * 0.07, p0.y - 0.09, G + 0.02)), Vector((p0.x + math.sin(a) * 0.06, p0.y - 0.04, G - 0.01))], 2)
            P.add(tube(pts, 0.034, 0.016, 5), wood, '#4e4032', deform=jitter(0.006, seed + k, 12), smooth=True, var=0.15)
        P.add(ico(0.05, 1), wood, '#4e4032', M(Wr + Vector((0, 0.02, 0.0)), (0, 0, 0), (1.5, 1.1, 0.9)), deform=jitter(0.012, seed, 9))
        for k, (f, r, tl) in enumerate(((0.3, 0.07, 0.1), (0.52, 0.085, -0.15), (0.75, 0.06, 0.2))):
            p = E.lerp(Wr, f) + Vector((sx * 0.085, 0.01, 0))
            bracket(P, p, r, ['#b98a4e', '#c49a5c', '#a8743e'][k], (tl, sx * 0.25, k), seed + 20 + k)
        moss_clump(P, E + Vector((sx * 0.02, 0.05, 0.03)), 0.06, seed + 30)
        P.add(tube(helix(E.lerp(Wr, 0.1), Wr, 0.085, 2.2, 16, 1.0, 0.1), 0.011, 0.007, 4), vine, '#48602a', smooth=True, var=0.15)
        for f in (0.35, 0.7):
            lm = Matrix.Translation(E.lerp(Wr, f) + Vector((-sx * 0.08, -0.03, 0))) @ Euler((1.9, 0, -sx * 1.2)).to_matrix().to_4x4()
            P.add(leaf(0.09, 0.05, 0.3, 0.2, 3), leafm, '#5c8a34', lm, var=0.15)
    else:
        # the other arm is still an arm: wasted, a wristwatch, the hand run out into root fingers
        P.add(sphere(0.05, 8, 5), hide, SKIN_D, M(E), smooth=True, var=0.15)
        P.add(tube(spline([E, E.lerp(Wr, 0.5) + Vector((sx * 0.01, 0.015, 0)), Wr], 3), 0.046, 0.034, 7), hide, SKIN_D, deform=jitter(0.005, seed, 9), smooth=True, var=0.16, streak=0.3)
        mm, ll = look_m(Wr.lerp(E, 0.14), Wr.lerp(E, 0.06))
        P.add(cyl(0.042, 0.042, ll, 8, caps=False), leather, LEATHER, mm, var=0.1)
        P.add(cyl(0.022, 0.022, 0.012, 8), iron, '#a39a7c', M(Wr.lerp(E, 0.1) + Vector((sx * 0.03, -0.022, 0.012)), (1.0, sx * 0.9, 0)), var=0.1)
        P.add(ico(0.045, 1), hide, SKIN_D, M(Wr + Vector((0, -0.02, -0.02)), (0, 0, 0), (1.2, 1.3, 0.8)), deform=jitter(0.008, seed, 9))
        for k in range(4):
            a = (k - 1.5) * 0.36
            p0 = Wr + Vector((math.sin(a) * 0.04, -0.04, -0.03))
            pts = spline([p0, p0 + Vector((math.sin(a) * 0.05, -0.06, 0.0)), Vector((p0.x + math.sin(a) * 0.1, p0.y - 0.13, G + 0.03)), Vector((p0.x + math.sin(a) * 0.13, p0.y - 0.2, G))], 2)
            P.add(tube(pts, 0.017, 0.004, 4), wood, '#54463a', smooth=True, var=0.15)
        pts = spline([Wr + Vector((-sx * 0.035, 0, -0.02)), Wr + Vector((-sx * 0.09, -0.02, -0.03)), Vector((Wr.x - sx * 0.12, Wr.y - 0.05, G))], 2)
        P.add(tube(pts, 0.016, 0.004, 4), wood, '#54463a', smooth=True)
        P.add(tube(helix(E, Wr, 0.05, 1.6, 12, 2.0, 0.04), 0.008, 0.005, 3), vine, '#48602a', smooth=True, var=0.15)
    return P.build(coll, root, (sx * 0.215, -0.15, 0.82))

# ---------------------------------------------------------------- legs (LegB*: pivot at the hip)
def make_leg(name, sx, boot, seed):
    P = Part(name, seed)
    K = Vector((sx * 0.05, -0.2, -0.17))          # knee, bent forward
    A = Vector((sx * 0.045, 0.02, -0.43))         # ankle
    G = -0.5
    P.add(tube(spline([(0, 0.02, 0.02), K * 0.5 + Vector((0, 0.0, 0.015)), K], 3), 0.088, 0.058, 8), hide, SKIN_D, deform=jitter(0.006, seed, 9), smooth=True, var=0.16, streak=0.3)
    P.add(sphere(0.058, 8, 5), hide, SKIN, M(K + Vector((0, -0.01, 0))), smooth=True, var=0.15)
    P.add(tube(spline([K, K.lerp(A, 0.5) + Vector((0, 0.025, 0)), A], 3), 0.054, 0.036, 7), hide, SKIN_D, deform=jitter(0.005, seed + 2, 9), smooth=True, var=0.16, streak=0.3)
    # shorts, torn off above the knee
    mm, ll = look_m((0, 0.03, 0.04), K * 0.95)
    n0 = nfaces(P)
    P.add(cuff(ll, 0.1, 0.074, seed, 0.6, 11, 3, 0.012), canvas, (0.8, 0.8, 0.8), mm, smooth=True, var=0.2)
    paint(P, n0, lambda co, c: mixc('#57522f', KHAKI_D, noise.noise(co * 6) + 0.5) * (c.x / 0.8))
    if boot:
        # puttee wound up the shin, and the boot
        P.add(tube(helix(K.lerp(A, 0.3), A + Vector((0, 0, 0.03)), 0.05, 4.2, 17, 0.0, 0.043), 0.017, 0.017, 4), sack, '#9a906c', smooth=True, var=0.2)
        P.add(tube([A + Vector((0, 0.005, 0.07)), A + Vector((0, 0.005, -0.03))], 0.056, 0.058, 8), leather, LEATHER, smooth=True, var=0.15)
        P.add(box(0.1, 0.22, 0.075, chamfer=0.02), leather, LEATHER, M((A.x + sx * 0.008, A.y - 0.06, G), (0, 0, sx * -0.12)), deform=jitter(0.006, seed, 9), var=0.15)
        P.add(box(0.105, 0.23, 0.018), leather, '#201812', M((A.x + sx * 0.008, A.y - 0.06, G), (0, 0, sx * -0.12)), var=0.1)
        P.add(sphere(0.052, 8, 5), leather, '#33241a', M((A.x + sx * 0.015, A.y - 0.13, G + 0.045), (0, 0, 0), (1.0, 1.2, 0.8)), smooth=True, var=0.12)
    else:
        # the bare foot has rooted and torn free too many times: a splay of root toes
        P.add(ico(0.05, 1), wood, '#54463a', M(A + Vector((0, -0.01, -0.03)), (0, 0, 0), (1.1, 1.3, 0.8)), deform=jitter(0.01, seed, 9))
        for k in range(4):
            a = (k - 1.5) * 0.45
            p0 = A + Vector((math.sin(a) * 0.03, -0.02, -0.03))
            pts = spline([p0, Vector((p0.x + math.sin(a) * 0.06, p0.y - 0.08, G + 0.025)), Vector((p0.x + math.sin(a) * 0.1, p0.y - 0.17, G))], 2)
            P.add(tube(pts, 0.02, 0.005, 4), wood, '#54463a', smooth=True, var=0.15)
        pts = [A + Vector((0, 0.02, -0.03)), Vector((A.x, A.y + 0.07, G))]
        P.add(tube(pts, 0.02, 0.006, 4), wood, '#54463a')
        P.add(tube(helix(K.lerp(A, 0.2), A, 0.048, 1.8, 12, 1.0, 0.04), 0.008, 0.005, 3), vine, '#48602a', smooth=True, var=0.15)
        moss_clump(P, K + Vector((sx * 0.02, -0.03, 0.03)), 0.04, seed + 9)
    return P.build(coll, root, (sx * 0.105, 0.235, 0.5))

legs = [make_arm('LegFL', -1, False, 11), make_arm('LegFR', 1, True, 12), make_leg('LegBL', -1, True, 13), make_leg('LegBR', 1, False, 14)]

# ---------------------------------------------------------------- "tail": a rope and his tin cup swinging from the pack
T = Part('Tail', 9)
rp = spline([(0, 0, 0), (0, 0.06, -0.05), (0.012, 0.1, -0.16), (0.0, 0.115, -0.27)], 3)
T.add(tube(rp, 0.012, 0.011, 4), rope, '#a98d5e', smooth=True, var=0.2, streak=0.4)
T.add(ico(0.02, 1), rope, '#a98d5e', M(rp[4]))
T.add(cyl(0.042, 0.035, 0.075, 9), iron, '#8d8c84', M(Vector(rp[-1]) + Vector((0, 0.0, -0.085)), (0.25, 0.1, 0)), var=0.15)
T.add(cyl(0.036, 0.03, 0.01, 9), hide, '#1c1814', M(Vector(rp[-1]) + Vector((0.002, -0.019, -0.012)), (0.25, 0.1, 0)))
T.add(torus(0.022, 0.005, 8, 3), iron, '#8d8c84', M(Vector(rp[-1]) + Vector((0.04, 0.012, -0.05)), (math.pi / 2 + 0.25, 0, 0)))
# a frayed strap and a root trailing with it
T.add(ribbon(spline([(0.07, 0, 0.01), (0.075, 0.06, -0.07), (0.068, 0.07, -0.2)], 3), 0.03, lambda i: Vector((0, 1, 0.3))), canvas, KHAKI_D, var=0.2)
pts = spline([(-0.07, 0, 0), (-0.08, 0.07, -0.08), (-0.06, 0.1, -0.22), (-0.075, 0.09, -0.34)], 2)
T.add(tube(pts, 0.009, 0.003, 3), vine, '#4a3c2c', smooth=True)
tail = T.build(coll, root, PK @ Vector((0, 0.07, -0.15)))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
