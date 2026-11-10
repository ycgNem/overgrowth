# The Rot Mother: night 10 and every fifth after. A gaunt, high-backed crone of a beast dragging
# a brood sac bigger than she is: a wet, lobed, veined bladder with her eggs pressing out
# through the skin, slung behind her hips in a cradle of pale ribs and root straps. She walks on
# long mantis forelimbs and squat, splayed hind legs; her head hangs low on a vulture's neck: a
# long skull-mask with six small eyes, under a lopsided crown of dead antler branches hung with
# root curtains. A ridge of crooked spines down her back, more curtains under her belly.
# Origin on the ground under the body; forward is -Y (glTF +Z).
# Animated nodes (the Thornback's rig): "Head" (pivot at the base of the neck) > "Jaw",
# "LegFL" "LegFR" "LegBL" "LegBR" (pivot at the shoulder / hip; swung about X), "Tail" (the
# ovipositor at the back of the cradle; yaws), "Sac" (the brood sac; pulses up to ~1.3x on a slam:
# the cradle ribs stand 12% clear of it).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('RotMother')
root = root_empty('RotMother', coll)
rnd = random.Random(515)

def glowskin(name, rough, emit, strength):
    """Emissive material that keeps its vertex colours as the base (get_mat's emissive is flat)."""
    m = get_mat(name, rough, emit=emit, strength=strength)
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
    return m

hide = get_mat('Hide', 0.85)
flesh = get_mat('Flesh', 0.7)
bone = get_mat('Bone', 0.7)
crust = get_mat('Crust', 0.8)
wood = get_mat('Wood', 0.9)
rootm = get_mat('Root', 0.9)
moss = get_mat('Moss', 1.0)
mossd = get_mat('MossDS', 1.0, double=True)
fung = get_mat('Fungus', 0.6)
vein = get_mat('Vein', 0.45)
# emissives kept low: the game's bloom turns anything brighter into a white blob
sacm = glowskin('SacSkin', 0.42, (0.3, 0.09, 0.18), 0.25)
eggm = glowskin('EggGlow', 0.3, (0.4, 0.56, 0.14), 0.5)
eyeg = get_mat('RotEye', 0.2, emit=(0.7, 1.0, 0.3), strength=1.3)
dimg = get_mat('RotDim', 0.4, emit=(0.4, 0.56, 0.14), strength=0.6)
EYEC = (0.7, 1.0, 0.3)
DIMC = (0.4, 0.56, 0.14)

SKIN = '#6d5262'      # bruise-violet hide
SKIN_D = '#4b3745'
BELLY = '#8a6c76'
BONEC = '#cdbf9e'
ROOTC = '#3d3029'
X = Vector((1, 0, 0))

def helix(a, b, r, turns, n=14, phase=0.0, r2=None):
    a, b = Vector(a), Vector(b)
    d = b - a
    t = d.normalized()
    u = t.orthogonal().normalized()
    v = t.cross(u)
    r2 = r if r2 is None else r2
    return [a + d * (i / n) + (u * math.cos(phase + i / n * turns * TAU) + v * math.sin(phase + i / n * turns * TAU)) * (r + (r2 - r) * i / n) for i in range(n + 1)]

def strand(P, p0, L, r=0.022, col=None, sway=0.06, drift=(0, 0, 0)):
    """One hanging root: a thin wavering tube from p0 down L."""
    p = Vector(p0)
    pts = [p.copy()]
    for j in range(4):
        p = p + Vector((rnd.uniform(-sway, sway) + drift[0] * L / 4, rnd.uniform(-sway, sway) + drift[1] * L / 4, -L / 4))
        pts.append(p.copy())
    P.add(tube(pts, r, r * 0.25, 3), rootm, col or rnd.choice(['#3d3029', '#4a3a30', '#2f2622']), smooth=True, var=0.2)
    return pts

def curtain(P, a, b, n, Lmin, Lmax, r=0.022, rags=True, drift=(0, 0, 0)):
    """A curtain of roots hanging along the line a->b, with rags of moss caught in it."""
    a, b = Vector(a), Vector(b)
    for k in range(n):
        f = (k + rnd.uniform(0.1, 0.9)) / n
        L = rnd.uniform(Lmin, Lmax)
        pts = strand(P, a.lerp(b, f), L, r * rnd.uniform(0.7, 1.3), drift=drift)
        if rags and k % 2 == 0:
            lm = Matrix.Translation(pts[rnd.choice((1, 2))]) @ Euler((math.pi + rnd.uniform(-0.25, 0.25), 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
            P.add(leaf(L * rnd.uniform(0.35, 0.6), rnd.uniform(0.09, 0.16), 0.25, -0.15, 3), mossd, rnd.choice(['#3c4a26', '#46402c', '#33402a', '#4c5530']), lm, var=0.25)

# ---------------------------------------------------------------- torso
SPN = spline([(0, 0.85, 1.78), (0, 0.4, 2.2), (0, -0.2, 2.5), (0, -0.75, 2.48), (0, -1.1, 2.3)], 6)
def sp(t):
    f = max(0.0, min(1.0, t)) * (len(SPN) - 1)
    i = min(int(f), len(SPN) - 2)
    return SPN[i].lerp(SPN[i + 1], f - i), (SPN[i + 1] - SPN[i]).normalized()
PROF = [(0.0, 0.5, 0.42), (0.3, 0.4, 0.38), (0.62, 0.5, 0.5), (0.85, 0.47, 0.42), (1.0, 0.25, 0.25)]
def prof(t):
    for (t0, x0, y0), (t1, x1, y1) in zip(PROF, PROF[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            k = k * k * (3 - 2 * k)
            return x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    return PROF[-1][1], PROF[-1][2]
def torso_pt(t, a, grow=1.0):
    """A point on the trunk: t 0 (hips) .. 1 (neck); a round it (0 = +X flank, pi/2 = the back, -pi/2 = the belly)."""
    p, tan = sp(t)
    back = tan.cross(X)
    rx, ry = prof(t)
    s, c = math.sin(a), math.cos(a)
    ry *= 1 + 0.22 * max(0.0, s) * math.exp(-((t - 0.6) / 0.22) ** 2)       # a sharp, high back
    ry *= 1 - 0.42 * max(0.0, -s) * math.exp(-((t - 0.34) / 0.2) ** 2)      # starved belly
    rx *= 1 - 0.12 * max(0.0, s) ** 2                                         # narrow along the spine
    return p + X * (c * rx * grow) + back * (s * ry * grow)

B = Part('Body', 1)
n0 = nfaces(B)
B.add(grid_surface(18, 14, lambda u, v: torso_pt(v, u * TAU)), hide, (0.8, 0.8, 0.8), deform=jitter(0.03, 3, 2.5), smooth=True, var=0.16)
def skin(co, c):
    p, tan = sp(min(1.0, max(0.0, (0.85 - co.y) / 1.95)))
    up = (co - p).dot(tan.cross(X)) / 0.45                    # +1 on the back, -1 under the belly
    col = mixc(SKIN, SKIN_D, up * 0.8 + 0.2)
    col = mixc(col, BELLY, -up * 1.1 - 0.25)
    col = mixc(col, '#414a2c', noise.noise(co * 1.7) * 1.2 - 0.25 + max(0.0, up) * 0.2)     # moss-green rot on the back
    return col * (c.x / 0.8)
paint(B, n0, skin)
B.add(sphere(0.5, 12, 8), hide, SKIN_D, M(SPN[0] + Vector((0, 0.08, -0.05)), (0.2, 0, 0), (1.05, 0.8, 0.86)), deform=jitter(0.03, 5, 3), smooth=True, var=0.15)
# ribs standing out of the wasted flanks
for k in range(6):
    t = 0.4 + k * 0.062
    for sx in (-1, 1):
        pts = []
        for i in range(7):
            a = 1.0 - i * 0.4
            pts.append(torso_pt(t - 0.05 * i / 6, a if sx > 0 else math.pi - a, 1.02))
        B.add(tube(pts, seg=4, radii=[0.01, 0.036, 0.042, 0.042, 0.038, 0.03, 0.006]), bone, BONEC, smooth=True, var=0.12)
    # a seam of sick light in the dark between two ribs, here and there
    if k in (1, 3, 4):
        for sx in (-1, 1):
            if (k + sx) % 3 == 0:
                continue
            pts = [torso_pt(t + 0.031 - 0.05 * i / 6, (0.55 - i * 0.4) if sx > 0 else math.pi - (0.55 - i * 0.4), 1.0) for i in range(1, 4)]
            B.add(tube(pts, 0.014, 0.008, 3, cap=False), dimg, DIMC)
# the ridge: crooked spines of bone down the back, tallest over the shoulders, some snapped
RIDGE = []
for k in range(11):
    t = 0.05 + k * 0.088
    base = torso_pt(t, math.pi / 2, 0.96)
    p, tan = sp(t)
    back = tan.cross(X)
    h = (0.22 + 0.55 * math.sin(min(1.0, t * 1.15) * math.pi) ** 1.3) * (0.45 if k in (3, 8) else 1.0)
    lean = rnd.uniform(-0.12, 0.12)
    tip = base + back * h - tan * h * 0.55 + X * lean
    mid = base.lerp(tip, 0.55) + back * 0.05 + X * lean * 0.6
    B.add(tube(spline([base, mid, tip], 2), 0.06, 0.03 if k in (3, 8) else 0.0, 5), bone, rnd.choice(['#c9bb9a', '#b3a586', '#d6c9a8']), deform=jitter(0.012, 60 + k, 5), smooth=True, var=0.14)
    RIDGE.append(tip)
# rags of moss strung from spine to spine
for k in range(len(RIDGE) - 1):
    if k % 3 == 2:
        continue
    a, b = RIDGE[k], RIDGE[k + 1]
    B.add(tube([a, a.lerp(b, 0.5) + Vector((0, 0, -0.14)), b], 0.014, 0.014, 3, cap=False), rootm, ROOTC)
    lm = Matrix.Translation(a.lerp(b, 0.5) + Vector((0, 0, -0.12))) @ Euler((math.pi, 0, math.pi / 2 + rnd.uniform(-0.3, 0.3))).to_matrix().to_4x4()
    B.add(leaf(rnd.uniform(0.25, 0.45), 0.16, 0.2, -0.1, 3), mossd, rnd.choice(['#3c4a26', '#46402c', '#33402a']), lm, var=0.25)
# scabs of crust over the shoulders and hips
for k in range(12):
    front = k % 2 == 0
    t = rnd.uniform(0.74, 0.92) if front else rnd.uniform(0.02, 0.2)
    sx = rnd.choice((-1, 1))
    a = rnd.uniform(0.15, 0.95)
    p = torso_pt(t, a if sx > 0 else math.pi - a, 1.0)
    sc = rnd.uniform(0.7, 1.2)
    B.add(ico(0.2, 1), crust, rnd.choice(['#3a2c32', '#44343a', '#33262c']), M(p, (rnd.uniform(-0.5, 0.5), sx * 0.9 + rnd.uniform(-0.3, 0.3), rnd.uniform(0, TAU)), (1.1 * sc, 0.9 * sc, 0.32 * sc)),
          deform=jitter(0.035, 20 + k, 5), var=0.15)
# shelf fungus stacked on her right shoulder (nothing about her is even)
for k, (t, a, r) in enumerate(((0.8, 0.55, 0.3), (0.86, 0.3, 0.24), (0.74, 0.25, 0.2), (0.82, 0.85, 0.17))):
    p = torso_pt(t, a, 1.0)
    n0 = nfaces(B)
    m = M(p + Vector((0.04, 0, 0)), (rnd.uniform(-0.15, 0.15), -0.25 + rnd.uniform(-0.1, 0.1), k), (r, r, r * 0.28))
    B.add(sphere(1.0, 10, 5), fung, rnd.choice(['#8f7388', '#7c6278', '#9a8090']), m, deform=jitter(0.06, 30 + k, 3), smooth=True, var=0.12)
    inv = m.inverted()
    def lip(co, c, inv=inv):
        q = inv @ co
        d = math.hypot(q.x, q.y)
        k2 = c * (0.75 + 0.25 * math.sin(d * 13))
        return mixc(k2, '#d9cdb8', (d - 0.78) / 0.22) if q.z > -0.2 else mixc(k2, '#cbbfa8', 0.7)
    paint(B, n0, lip)
# dugs: two rows of swollen pods under the belly, a point of light in each tip
for k in range(4):
    t = 0.16 + k * 0.15
    for sx in (-1, 1):
        p = torso_pt(t, -math.pi / 2 + sx * 0.45, 0.92)
        L = rnd.uniform(0.3, 0.46) * (1 - 0.12 * k)
        r = L * 0.42
        n0 = nfaces(B)
        def pod(bm, r=r, L=L):
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r)
            for v in bm.verts:
                if v.co.z > 0:
                    v.co.x *= 1 - 0.55 * (v.co.z / r)
                    v.co.y *= 1 - 0.55 * (v.co.z / r)
                    v.co.z *= L / r
        m = M(p + Vector((sx * 0.02, 0, -L * 0.75)), (rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), 0))
        B.add(pod, sacm, (0.8, 0.8, 0.8), m, deform=jitter(0.02, 80 + k, 5), smooth=True, var=0.14)
        zc = p.z - L * 0.75
        paint(B, n0, lambda co, c, zc=zc, r=r: mixc('#4c2a40', '#8a5f62', (zc - co.z) / r * 0.9 + 0.35) * (c.x / 0.8))
        B.add(ico(r * 0.2, 1), dimg, DIMC, M(p + Vector((sx * 0.02, 0, -L * 0.75 - r * 0.93)), (0, 0, 0), (1, 1, 1.3)))
# root curtains under the belly, chest to hips, both flanks
for sx in (-1, 1):
    curtain(B, torso_pt(0.12, -math.pi / 2 + sx * 0.95, 0.97), torso_pt(0.55, -math.pi / 2 + sx * 0.8, 0.97), 5, 0.4, 0.95, 0.024)
    curtain(B, torso_pt(0.6, -math.pi / 2 + sx * 0.7, 0.97), torso_pt(0.9, -math.pi / 2 + sx * 0.5, 0.97), 4, 0.35, 0.7, 0.022)

# ---------------------------------------------------------------- the brood sac: its shape
SC = Vector((0, 1.78, 1.04))
AX = (0.95, 1.12, 0.82)
LOBES = [((0.0, 0.8, -0.45), 0.22, 0.5), ((-0.8, 0.1, -0.5), 0.27, 0.45), ((0.6, 0.5, 0.45), 0.2, 0.4),
         ((0.78, -0.4, -0.4), 0.24, 0.42), ((-0.5, -0.35, 0.6), 0.14, 0.38), ((-0.45, 0.75, 0.3), 0.18, 0.36),
         ((0.45, 0.85, -0.05), 0.16, 0.32), ((0.0, 0.95, 0.35), 0.12, 0.3)]
RIBS = (-0.82, -0.42, 0.0, 0.42, 0.82, 1.2)
def relief(d):
    """How far the skin swells (+) or is pinched in (-) along direction d."""
    bump = 0.0
    for L, amp, w in LOBES:
        bump += amp * math.exp(-(d.angle(L) / w) ** 2)
    psi = math.asin(max(-1.0, min(1.0, d.y)))
    # the cradle's ribs bite into it: it bulges out between them
    pinch = min(abs(psi - r) for r in RIBS)
    bump += 0.05 * (min(1.0, pinch / 0.2) ** 0.7 - 0.6) * math.cos(psi) * (0.35 + 0.65 * min(1.0, (1 - d.z) * 0.9))
    bump += 0.05 * noise.noise(d * 2.6 + Vector((4, 1, 9))) + 0.022 * noise.noise(d * 7.0)
    return bump
LOBES = [(Vector(d).normalized(), a, w) for d, a, w in LOBES]
def sac_local(d, k=1.0):
    """The sac's surface along unit direction d from its centre (k pushes in/out): an ellipsoid
    swollen into lobes, pear-heavy below, its rear end drooping."""
    d = Vector(d).normalized()
    r = 1.0 / math.sqrt((d.x / AX[0]) ** 2 + (d.y / AX[1]) ** 2 + (d.z / AX[2]) ** 2)
    p = d * (r * (1 + relief(d)))
    if p.z < 0:
        t = min(1.0, -p.z / AX[2])
        p.x *= 1 + 0.17 * t
        p.y *= 1 + 0.1 * t
    p.z -= 0.14 * max(0.0, p.y / AX[1]) ** 2
    return p * k
def dirv(psi, a):
    """Direction on the sac: psi = latitude toward the rear (+Y), a = angle round from the top (+ = her +X side)."""
    return Vector((math.cos(psi) * math.sin(a), math.sin(psi), math.cos(psi) * math.cos(a)))

# ---------------------------------------------------------------- the cradle (Body): ribs and root straps holding the sac
KC = 1.12
spine_c = [SC + sac_local(dirv(-1.25 + i / 15 * 3.1, 0), KC + 0.03) + Vector((0, 0, 0.03)) for i in range(16)]
spine_c = [torso_pt(0.06, math.pi / 2, 0.9)] + spine_c
B.add(tube(spine_c, seg=7, radii=[0.13] + [0.12 - 0.05 * (i / 15) for i in range(16)]), bone, '#bfb192', deform=jitter(0.015, 7, 4), smooth=True, var=0.14, streak=0.3)
for i in range(2, 15, 2):   # knuckles along it
    B.add(ico(0.1 - i * 0.003, 1), bone, '#d2c5a4', M(spine_c[i] + Vector((0, 0, 0.07)), (0, 0, i), (1.0, 0.8, 0.8)), deform=jitter(0.012, i, 8))
for k, psi in enumerate(RIBS):
    for sx in (-1, 1):
        amax = 2.05 - 0.12 * abs(k - 2) + (0.12 if sx < 0 else 0)
        pts = []
        for i in range(9):
            a = sx * (0.1 + (amax - 0.1) * i / 8)
            kk = KC - 0.08 * max(0.0, i - 6) / 2       # the tips hook in under it
            pts.append(SC + sac_local(dirv(psi + 0.03 * math.sin(i / 8 * math.pi), a), kk + 0.03))
        B.add(tube(pts, seg=6, radii=[0.075, 0.075, 0.07, 0.066, 0.06, 0.055, 0.046, 0.032, 0.0]), bone, rnd.choice(['#cdbf9e', '#c2b492', '#d6c9a8']), deform=jitter(0.01, 40 + k, 5), smooth=True, var=0.13, streak=0.25)
# root straps lashed across it, corner to corner
for sx, p0, p1, a0, a1 in ((1, -1.0, 1.25, 0.35, 2.3), (-1, -1.0, 1.25, 0.35, 2.3), (1, 1.2, -0.7, 0.4, 2.2), (-1, 1.0, -0.9, 0.5, 2.25)):
    pts = [SC + sac_local(dirv(p0 + (p1 - p0) * i / 14, sx * (a0 + (a1 - a0) * i / 14)), 1.065 + 0.02 * math.sin(i * 1.3)) for i in range(15)]
    B.add(tube(pts, 0.036, 0.022, 5), rootm, rnd.choice([ROOTC, '#4a3a30']), deform=jitter(0.012, 9, 6), smooth=True, var=0.2)
# roots hanging off the cradle's lower rim
for sx in (-1, 1):
    for psi in (-0.6, -0.1, 0.4, 0.9):
        p = SC + sac_local(dirv(psi + rnd.uniform(-0.15, 0.15), sx * 1.75), 1.08)
        strand(B, p, min(p.z - 0.05, rnd.uniform(0.35, 0.75)), 0.022)
body = B.build(coll, root)

# ---------------------------------------------------------------- the sac itself (pulses)
PIV = Vector((0, -0.15, 0.45))            # the node sits high in the sac, so it swells down and back
ST = Matrix.Translation(-PIV)
S = Part('Sac', 3)
# her eggs: scattered over the flanks and the hanging underside, a few on top
re = random.Random(8)
EGGS = []
tries = 0
while len(EGGS) < 32 and tries < 6000:
    tries += 1
    top = len(EGGS) < 5
    psi = re.uniform(-0.95, 1.5)
    a = re.choice((-1, 1)) * (re.uniform(0.3, 0.85) if top else re.uniform(1.0, 2.6))
    d = dirv(psi, a)
    r = re.uniform(0.09, 0.185)
    c = sac_local(d, 1.0)
    c = c - d * (r * 0.55)
    if all((c - c2).length > (r + r2) * 1.02 for c2, r2, d2 in EGGS):
        EGGS.append((c, r, d))
def sacb(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=22, radius=1.0)
    for v in bm.verts:
        v.co = sac_local(Vector((v.co.x, -v.co.z, v.co.y)))
n0 = nfaces(S)
S.add(sacb, sacm, (0.8, 0.8, 0.8), ST, smooth=True, var=0.1)
def sac_paint(co, c):
    q = co + PIV
    rl = relief(q.normalized())
    col = mixc('#4e2a42', '#2a1524', -q.z / 0.8 * 0.5 + 0.3 + noise.noise(q * 2.2) * 0.5)        # bruised, darker where it hangs
    col = mixc(col, '#7d5a56', rl * 4.5 - 0.25 + noise.noise(q * 1.3 + Vector((7, 7, 7))) * 0.6)    # stretched pale over each swelling
    col = mixc(col, '#1f0f1c', -rl * 9.0 - 0.1)                                                     # dark in the creases
    col = mixc(col, '#5e6a34', noise.noise(q * 3.1 + Vector((2, 9, 4))) * 1.6 - 0.75)               # blotches of green rot
    near = min(((q - ec).length - er) / er for ec, er, ed in EGGS)
    col = mixc(col, '#a8996a', 1.0 - near / 0.55)                                                    # worn thin over each egg
    return col * (c.x / 0.8)
paint(S, n0, sac_paint)
for ec, er, ed in EGGS:
    n0 = nfaces(S)
    q = ed.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    S.add(sphere(er, 8, 5), eggm, (0.8, 0.8, 0.8), ST @ Matrix.Translation(ec) @ q @ M((0, 0, 0), (0, 0, re.uniform(0, 6)), (1.0, 1.0, 1.15)), smooth=True, var=0.1)
    def egg_paint(co, c, ec=ec, er=er, ed=ed):
        h = ((co + PIV) - ec).dot(ed) / er                      # -1 buried .. +1 the pole poking out
        return mixc('#6f7a3a', '#cfd08a', h * 0.9 + 0.1) * (c.x / 0.8)
    paint(S, n0, egg_paint)
    # the thing curled inside, a dark comma against the light
    tw = re.uniform(0, TAU)
    off = (q @ Vector((math.cos(tw), math.sin(tw), 0))) * (er * 0.28)
    S.add(ico(er * 0.42, 1), vein, '#1d1a12', ST @ Matrix.Translation(ec + ed * (er * 0.9) + off) @ q @ M((0, 0, 0), (0, 0, tw), (1.3, 0.75, 0.45)), var=0.05)
# veins: dark vessels branching down over it from the spine
def vein_path(psi, a, n, dpsi, da, r0, depth=0):
    pts = []
    for i in range(n):
        pts.append(sac_local(dirv(psi, a), 1.012))
        psi += dpsi + re.uniform(-0.07, 0.07)
        a += da * (1 + re.uniform(-0.3, 0.3))
        if depth < 1 and i in (n // 3, 2 * n // 3) and re.random() < 0.85:
            vein_path(psi, a, max(4, n - i - 1), dpsi + re.choice((-1, 1)) * re.uniform(0.07, 0.13), da * 0.8, r0 * (1 - i / n) * 0.75, depth + 1)
    if len(pts) > 1:
        S.add(tube(pts, max(0.018, r0), 0.008, 3, cap=False), vein, re.choice(['#3a1428', '#4a1a30', '#2e1024']), ST, smooth=True, var=0.15)
for k in range(12):
    sx = 1 if k % 2 else -1
    vein_path(-0.95 + k * 0.215 + re.uniform(-0.05, 0.05), sx * 0.22, 11, re.uniform(-0.04, 0.04), sx * 0.24, 0.048)
sac = S.build(coll, root, SC + PIV)

# ---------------------------------------------------------------- head + jaw (pivot at the base of the neck)
NECK = SPN[-1].copy()
SK = Vector((0, -0.95, -0.72))                           # middle of the face, from the neck pivot
HM = Matrix.Translation(SK) @ Matrix.Rotation(-0.22, 4, 'X')
H = Part('Head', 4)
neck = spline([(0, 0.3, 0.05), (0, -0.32, -0.05), (0, -0.7, -0.32), (0, -0.84, -0.6)], 3)
H.add(tube(neck, 0.27, 0.15, 9), hide, SKIN, deform=jitter(0.02, 3, 5), smooth=True, var=0.16, streak=0.4)
for i in range(1, len(neck) - 1, 2):
    H.add(ico(0.07, 1), bone, BONEC, M(Vector(neck[i]) + Vector((0, 0.03, 0.2 - i * 0.012)), (0, 0, i), (0.8, 1, 1)), deform=jitter(0.01, i, 9))
def face(xn, zn, out=0.0):
    """A point on the skull-mask: xn -1..1 across, zn -1 (the tip of the snout) .. 1 (the crown)."""
    w = 0.3 * (1 - 0.85 * abs(zn) ** 2.4) if zn > 0 else 0.3 * (1 - 0.8 * abs(zn) ** 1.15)
    a = math.asin(max(-1.0, min(1.0, xn))) * 0.97
    return Vector((w * math.sin(a), -w * math.cos(a) * 0.8 - 0.12 * max(0.0, -zn) ** 1.6 - out, zn * (0.3 if zn > 0 else 0.68)))
n0 = nfaces(H)
H.add(grid_surface(14, 16, lambda u, v: face(math.sin((u - 0.5) * math.pi), -1 + 2 * v)), bone, (0.8, 0.8, 0.8), HM, deform=jitter(0.012, 6, 5), smooth=True, var=0.14, streak=0.5)
hinv = HM.inverted()
def stain(co, c):
    q = hinv @ co
    e = min(1.0, abs(q.x) / 0.3) ** 2.2 * 0.5 + max(0.0, -q.z / 0.68) ** 2 * 0.35
    col = mixc('#d3c6a6', '#6d5c50', e + noise.noise(co * 4) * 0.25)
    return col * (c.x / 0.8)
paint(H, n0, stain)
# the back of the skull, dark; a throat with a little sick light in it
H.add(sphere(0.27, 12, 8), hide, '#241a22', HM @ M((0, 0.12, 0.02), (0, 0, 0), (1.0, 0.75, 1.15)), smooth=True, var=0.1)
H.add(sphere(0.16, 8, 6), hide, '#1a1218', HM @ M((0, 0.1, -0.33), (0, 0, 0), (0.9, 0.8, 1.6)), smooth=True, var=0.1)
H.add(ico(0.06, 1), dimg, DIMC, HM @ M((0, 0.03, -0.3), (0, 0, 0), (1, 1, 1.6)))
for sx in (-1, 1):
    # three eyes a side, shrinking down the snout, each sunk in a dark pit
    for k, (xn, zn, r) in enumerate(((0.55, 0.28, 0.07), (0.5, -0.02, 0.055), (0.45, -0.27, 0.042))):
        H.add(sphere(r, 8, 5), hide, '#120c10', HM @ M(face(sx * xn, zn, -r * 0.35), (0.1, sx * 0.5, sx * 0.2), (1.2, 0.55, 0.85)), smooth=True, var=0.05)
        H.add(ico(r * 0.42, 1), eyeg, EYEC, HM @ M(face(sx * xn * 0.97, zn, r * 0.12)))
    # brow ridge
    pts = spline([face(sx * 0.1, 0.5, 0.02), face(sx * 0.6, 0.55, 0.03), face(sx * 0.97, 0.4, 0.0)], 3)
    H.add(tube(pts, seg=5, radii=[0.03 + 0.03 * math.sin(i / (len(pts) - 1) * math.pi) for i in range(len(pts))]), bone, '#b5a78a', HM, smooth=True)
    # upper fangs down the edges of the snout, needles
    for k in range(6):
        zn = -0.38 - k * 0.1
        p = face(sx * 0.9, zn, -0.01)
        mm, ll = look_m(p, p + Vector((-sx * 0.03, 0.06 + 0.02 * (k % 2), -0.1 - 0.04 * (k % 2))))
        H.add(cone(0.02, ll, 4), bone, '#e4dabc', HM @ mm)
    # cheek roots: a beard hanging from the corners of the mask
    curtain(H, HM @ face(sx * 0.95, 0.1, -0.03), HM @ face(sx * 0.95, -0.4, -0.03), 4, 0.35, 0.75, 0.018, rags=(sx > 0))
# a crack down the mask from the crown, light in it
crack = [face(0.05, 0.85, 0.004), face(-0.1, 0.55, 0.004), face(0.08, 0.25, 0.004), face(-0.05, -0.05, 0.004), face(0.1, -0.3, 0.004), face(0.0, -0.55, 0.004)]
H.add(tube(crack, 0.014, 0.006, 3, cap=False), dimg, DIMC, HM)
# the crown: dead antler branches, the left one towering, the right one snapped short
def tine(a, d, r, fork=True, seed=0):
    a, d = Vector(a), Vector(d)
    b = a + d
    mid = a.lerp(b, 0.55) + Vector((0, 0, -0.06 * d.length)) + d.cross(Vector((0, 0, 1))) * 0.08
    H.add(tube(spline([a, mid, b], 2), r, 0.0 if not fork else r * 0.55, 5), wood, rnd.choice(['#a09480', '#8f8370', '#ada18a']), deform=jitter(r * 0.2, seed, 5), smooth=True, var=0.18, streak=0.5)
    if fork:
        tine(b, Vector((d.x * 0.5 + rnd.uniform(-0.12, 0.12), d.y * 0.6 - 0.05, abs(d.z) * 0.5 + 0.22)) * 0.75, r * 0.55, False, seed + 1)
        tine(b, Vector((d.x * 0.8, d.y * 0.7 + 0.1, -0.05 + d.z * 0.2)) * 0.6, r * 0.5, False, seed + 2)
        if seed % 2 == 0:
            H.add(ico(0.03, 1), dimg, DIMC, M(b + Vector((0, 0, 0.05))))
BL = HM @ face(-0.45, 0.8, -0.05)
BR = HM @ face(0.45, 0.8, -0.05)
beamL = spline([BL, BL + Vector((-0.24, 0.2, 0.45)), BL + Vector((-0.56, 0.42, 0.95)), BL + Vector((-0.66, 0.78, 1.48)), BL + Vector((-0.5, 1.1, 1.92))], 3)
H.add(tube(beamL, seg=7, radii=[0.17 - 0.1 * (i / (len(beamL) - 1)) ** 0.8 for i in range(len(beamL))]), wood, '#a09480', deform=jitter(0.025, 70, 4), smooth=True, var=0.2, streak=0.6)
tine(beamL[2], (-0.12, -0.42, 0.3), 0.1, True, 71)
tine(beamL[5], (-0.3, -0.55, 0.42), 0.105, True, 74)
tine(beamL[8], (-0.2, -0.5, 0.5), 0.09, True, 77)
tine(beamL[10], (0.25, -0.2, 0.5), 0.065, False, 80)
tine(beamL[-1], (-0.1, 0.3, 0.45), 0.06, False, 81)
tine(beamL[-1], (0.15, -0.35, 0.3), 0.06, False, 82)
beamR = spline([BR, BR + Vector((0.26, 0.14, 0.36)), BR + Vector((0.6, 0.3, 0.62)), BR + Vector((0.74, 0.5, 0.95))], 3)
H.add(tube(beamR, seg=7, radii=[0.15 - 0.06 * (i / (len(beamR) - 1)) for i in range(len(beamR))]), wood, '#968a76', deform=jitter(0.025, 90, 4), smooth=True, var=0.2, streak=0.6)
for k in range(4):   # the snapped end: splinters
    H.add(cone(0.035, rnd.uniform(0.12, 0.26), 4), wood, '#8a7c66', look_m(beamR[-1], Vector(beamR[-1]) + Vector((0.15 + rnd.uniform(-0.2, 0.2), 0.2 + rnd.uniform(-0.2, 0.2), 0.5)))[0] @ M((math.cos(k * 1.6) * 0.035, math.sin(k * 1.6) * 0.035, -0.02)))
tine(beamR[3], (0.2, -0.45, 0.28), 0.09, True, 91)
tine(beamR[6], (0.3, -0.1, 0.1), 0.06, False, 94)
# root curtains strung from the crown, a veil down her left side
curtain(H, beamL[5], beamL[9], 5, 0.5, 1.0, 0.018, drift=(0, 0.1, 0))
curtain(H, beamL[1], beamL[4], 3, 0.4, 0.7, 0.018)
curtain(H, beamR[1], beamR[5], 3, 0.3, 0.6, 0.018)
# a dewlap of roots under the neck
curtain(H, Vector(neck[2]) + Vector((0, 0, -0.2)), Vector(neck[-2]) + Vector((0, 0.05, -0.14)), 4, 0.3, 0.7, 0.02)
head = H.build(coll, root, NECK)

J = Part('Jaw', 5)
# built pointing down the snout from the hinge (-Z, a little forward); the game swings it back to open
def jawf(u, v):
    w = 0.21 * (1 - 0.78 * v ** 1.1)
    a = (u - 0.5) * math.pi * 0.95
    return Vector((w * math.sin(a), 0.03 + w * math.cos(a) * 0.55 - 0.1 * v ** 1.5, -0.05 - 0.6 * v))
def flipped(build):
    def b(bm):
        build(bm)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return b
J.add(grid_surface(8, 7, jawf), bone, '#a89b80', deform=jitter(0.01, 4, 6), smooth=True, var=0.14, streak=0.4)
J.add(flipped(grid_surface(8, 7, lambda u, v: jawf(u, v) + Vector((0, -0.012, 0)))), bone, '#5a4a48', deform=jitter(0.01, 4, 6), smooth=True, var=0.14)   # the inside of the mouth
for sx in (-1, 1):
    for k in range(6):
        v = 0.2 + k * 0.125
        p = jawf(0.5 + sx * 0.47, v)
        mm, ll = look_m(p, p + Vector((sx * 0.01, -0.11 - 0.03 * (k % 2), -0.03)))
        J.add(cone(0.018, ll, 4), bone, '#e4dabc', mm)
    J.add(tube([jawf(0.5 + sx * 0.5, 0.0) + Vector((0, 0, 0.08)), jawf(0.5 + sx * 0.5, 0.25)], 0.04, 0.03, 5), bone, '#9c8f76', smooth=True)
for k in range(4):
    strand(J, jawf(0.5 + (k - 1.5) * 0.18, 0.75) + Vector((0, 0.03, 0)), rnd.uniform(0.25, 0.55), 0.016)
jawo = J.build(coll, head, HM @ Vector((0, 0.07, -0.1)))
jawo.rotation_euler = (-0.22 + 0.2, 0, 0)

# ---------------------------------------------------------------- forelimbs: long, starved, mantis-jointed
def make_arm(name, sx, seed):
    P = Part(name, seed)
    big = sx < 0                                 # her left arm is the heavier
    E = Vector((sx * 0.32, 0.36, -1.0))          # elbow, cocked back and out
    W = Vector((sx * 0.34, -0.32, -2.03))        # wrist
    G = -2.3
    k = 1.15 if big else 1.0
    P.add(sphere(0.27, 10, 7), hide, SKIN, M((0, 0, 0), (0, 0, 0), (1.0, 1.1, 1.0)), deform=jitter(0.03, seed, 4), smooth=True, var=0.15)
    P.add(tube(spline([(0, 0, 0), E * 0.5 + Vector((sx * 0.07, 0.05, 0)), E], 3), 0.21 * k, 0.12 * k, 9), hide, SKIN, deform=jitter(0.02, seed, 5), smooth=True, var=0.16, streak=0.4)
    P.add(sphere(0.155 * k, 8, 6), bone, '#b8aa8c', M(E), deform=jitter(0.015, seed, 6), smooth=True, var=0.12)
    P.add(tube(spline([E, E + Vector((sx * 0.06, 0.3, 0.12)), E + Vector((sx * 0.12, 0.52, 0.34))], 2), 0.085 * k, 0.0, 5), bone, BONEC, smooth=True, var=0.12)
    fa = spline([E, E.lerp(W, 0.5) + Vector((sx * 0.04, 0.09, 0)), W], 3)
    P.add(tube(fa, 0.12 * k, 0.08 * k, 8), hide, SKIN_D, deform=jitter(0.015, seed + 3, 6), smooth=True, var=0.16, streak=0.4)
    # the shin-blade: a ridge of bone down the front of the forearm, toothed
    blade = [p + Vector((0, -0.085 * k, 0)) for p in fa[1:-1]]
    P.add(tube(blade, seg=4, radii=[0.02] + [0.045 * k] * (len(blade) - 2) + [0.02]), bone, BONEC, smooth=True, var=0.12)
    for i in range(1, len(blade) - 1):
        P.add(cone(0.028, 0.14, 4), bone, '#d9cdae', look_m(blade[i], blade[i] + Vector((0, -0.8, -0.6)))[0])
    P.add(sphere(0.105 * k, 8, 5), bone, '#b8aa8c', M(W), smooth=True, var=0.12)
    # three long claws spread on the ground, a dewclaw behind
    for j in (-1, 0, 1):
        p0 = W + Vector((j * 0.06, -0.04, -0.05))
        pts = spline([p0, p0 + Vector((j * 0.14, -0.3, -0.06)), Vector((p0.x + j * 0.24, p0.y - 0.58, G + 0.05)), Vector((p0.x + j * 0.27, p0.y - 0.74, G - 0.02))], 2)
        P.add(tube(pts, 0.062 * k, 0.012, 5), bone, '#c4b696' if j else '#d2c5a4', smooth=True, var=0.12)
    pts = spline([W + Vector((0, 0.05, -0.05)), W + Vector((sx * 0.05, 0.22, -0.12)), Vector((W.x + sx * 0.06, W.y + 0.3, G))], 2)
    P.add(tube(pts, 0.05, 0.01, 4), bone, '#c4b696', smooth=True)
    # roots wound round the upper arm, more hanging from the elbow
    P.add(tube(helix(Vector((0, 0, -0.15)), E, 0.24 * k, 1.8, 14, seed, 0.15 * k), 0.032, 0.02, 4), rootm, ROOTC, smooth=True, var=0.2)
    curtain(P, E + Vector((0, -0.05, -0.1)), E + Vector((0, 0.15, -0.05)), 3 if big else 2, 0.3, 0.6, 0.018, rags=big)
    if big:
        for i in range(3):
            P.add(ico(0.15, 1), crust, '#3a2c32', M(E * (0.2 + i * 0.22) + Vector((sx * 0.2, 0, 0)), (rnd.uniform(-0.4, 0.4), sx * 0.3, rnd.uniform(0, 3)), (0.45, 1.0, 1.2)), deform=jitter(0.025, seed + i, 6), var=0.15)
    return P.build(coll, root, (sx * 0.5, -0.72, 2.3))

# ---------------------------------------------------------------- hind legs: squat, splayed wide to carry the sac
def make_leg(name, sx, seed):
    P = Part(name, seed)
    K = Vector((sx * 0.72, -0.32, -0.22))        # knee, out to the side and high
    A = Vector((sx * 0.86, 0.02, -1.3))          # ankle
    G = -1.65
    P.add(sphere(0.36, 10, 7), hide, SKIN_D, M((sx * 0.05, 0, 0), (0, 0, 0), (1.0, 1.05, 0.95)), deform=jitter(0.03, seed, 4), smooth=True, var=0.15)
    P.add(tube(spline([(0, 0, 0), K * 0.5 + Vector((0, 0, 0.08)), K], 3), 0.31, 0.2, 9), hide, SKIN, deform=jitter(0.025, seed, 5), smooth=True, var=0.16, streak=0.4)
    P.add(sphere(0.215, 9, 6), bone, '#b8aa8c', M(K + Vector((sx * 0.02, -0.02, 0.02))), deform=jitter(0.02, seed, 6), smooth=True, var=0.12)
    P.add(cone(0.08, 0.34, 5), bone, BONEC, look_m(K, K + Vector((sx * 0.4, -0.2, 0.5)))[0])
    P.add(tube(spline([K, K.lerp(A, 0.5) + Vector((sx * 0.05, 0.08, 0)), A], 3), 0.19, 0.115, 8), hide, SKIN_D, deform=jitter(0.02, seed + 3, 6), smooth=True, var=0.16, streak=0.4)
    P.add(sphere(0.14, 8, 5), bone, '#b8aa8c', M(A), smooth=True, var=0.12)
    for j in (-1, 0, 1):
        p0 = A + Vector((j * 0.06, -0.03, -0.06))
        pts = spline([p0, Vector((p0.x + j * 0.16 + sx * 0.05, p0.y - 0.3, G + 0.1)), Vector((p0.x + j * 0.24 + sx * 0.08, p0.y - 0.52, G - 0.02))], 2)
        P.add(tube(pts, 0.085, 0.015, 5), bone, '#c4b696', smooth=True, var=0.12)
    P.add(tube([A + Vector((0, 0.05, -0.08)), Vector((A.x, A.y + 0.28, G))], 0.075, 0.015, 5), bone, '#c4b696', smooth=True)
    for i in range(3):
        P.add(ico(0.17, 1), crust, rnd.choice(['#3a2c32', '#44343a']), M(K * (0.25 + i * 0.3) + Vector((sx * 0.1, -0.05, 0.22)), (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3)), (1.1, 1.0, 0.35)), deform=jitter(0.03, seed + i, 6), var=0.15)
    P.add(tube(helix(K, A, 0.2, 1.6, 12, seed, 0.13), 0.03, 0.018, 4), rootm, ROOTC, smooth=True, var=0.2)
    curtain(P, K + Vector((0, 0.1, -0.15)), K + Vector((-sx * 0.3, 0.15, -0.05)), 2, 0.3, 0.55, 0.018, rags=False)
    return P.build(coll, root, (sx * 0.5, 0.78, 1.66))

legs = [make_arm('LegFL', -1, 11), make_arm('LegFR', 1, 12), make_leg('LegBL', -1, 13), make_leg('LegBR', 1, 14)]

# ---------------------------------------------------------------- "tail": the ovipositor at the back of the cradle
TP = spine_c[-1].copy()
T = Part('Tail', 9)
ov = spline([(0, -0.1, 0.05), (0, 0.22, -0.02), (0.03, 0.42, -0.3), (0.0, 0.42, -0.62), (-0.02, 0.33, -0.86)], 3)
n0 = nfaces(T)
T.add(tube(ov, seg=8, radii=[0.1 + 0.05 * math.sin(i * 1.9) ** 2 - 0.045 * i / (len(ov) - 1) for i in range(len(ov))]), sacm, (0.8, 0.8, 0.8), deform=jitter(0.012, 5, 6), smooth=True, var=0.14)
paint(T, n0, lambda co, c: mixc('#4c2a40', '#8a5f62', -co.z / 0.9 + noise.noise(co * 6) * 0.4) * (c.x / 0.8))
# an egg half out of it, and a string of small ones already laid, hanging
tip = Vector(ov[-1])
n0 = nfaces(T)
T.add(sphere(0.12, 9, 6), eggm, (0.8, 0.8, 0.8), M(tip + Vector((0, -0.01, -0.07)), (0, 0, 0), (1, 1, 1.2)), smooth=True, var=0.1)
paint(T, n0, lambda co, c: mixc('#6f7a3a', '#cfd08a', (tip.z - co.z) / 0.14) * (c.x / 0.8))
T.add(torus(0.085, 0.03, 9, 4), sacm, '#5a3a4a', M(tip + Vector((0, 0, 0.0)), (0.25, 0, 0)), deform=jitter(0.01, 3, 9), smooth=True, var=0.12)
p = Vector(ov[2]) + Vector((0.1, 0, -0.08))
for j in range(3):
    q = p + Vector((rnd.uniform(-0.04, 0.04), 0.03, -0.17 - j * 0.02))
    T.add(tube([p, q], 0.012, 0.012, 3, cap=False), vein, '#3a1428')
    T.add(sphere(0.075 - j * 0.01, 7, 5), eggm, '#a9ae6a', M(q + Vector((0, 0, -0.06)), (0, 0, 0), (1, 1, 1.2)), smooth=True, var=0.1)
    p = q + Vector((0, 0, -0.12))
curtain(T, Vector((-0.12, 0.0, 0.0)), Vector((0.12, 0.25, -0.1)), 5, 0.4, 0.85, 0.018)
tail = T.build(coll, root, TP)

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
