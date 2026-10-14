# Thornback: the boss of every fifth night. A towering, ape-shouldered brute of rotten heartwood
# with a thicket of black thorns growing out of its back around a swollen, glowing blight sac,
# a horse-skull face crowned with dead antler branches, long knuckle-walking forelimbs and
# short hind legs. Origin on the ground under the body; forward is -Y (glTF +Z).
# Animated nodes: "Head" (pivot at the neck) > "Jaw", "LegFL" "LegFR" "LegBL" "LegBR" (pivot at
# the shoulder/hip), "Tail", "Sac" (pulse).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Thornback')
root = root_empty('Thornback', coll)
rnd = random.Random(505)

bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.75)
bone = get_mat('Bone', 0.7)
moss = get_mat('Moss', 1.0)
fung = get_mat('Fungus', 0.6)
stone = get_mat('Stone', 0.92)
thornm = get_mat('Thorn', 0.55)
glow = get_mat('BlightGlow', 0.3, emit=(0.7, 0.18, 1.0), strength=3.0)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.45, 0.95), strength=8.0)
sacm = get_mat('SacGlow', 0.25, emit=(0.8, 0.25, 1.0), strength=2.4)
leafm = get_mat('LeafDS', 0.7, double=True)

WOOD = '#4c403a'
DARK = '#3a302e'
PALE = '#b5a88c'

SH = Vector((0, -0.75, 2.25))   # shoulders (front)
HP = Vector((0, 0.95, 1.45))    # hips (back)

# ---------------------------------------------------------------- body
B = Part('Body', 1)
m, ln = look_m(HP + Vector((0, 0.25, -0.05)), SH + Vector((0, -0.25, 0.1)))
def torso(co, ln=ln):
    t = co.z / ln
    prof = 0.55 + 0.75 * math.sin(min(1, t * 1.1) * math.pi * 0.85) ** 0.7 + 0.35 * t
    d = gnarl(0.03, 2.2, 0.4, (0, 0), ln, 21)(co)
    return Vector((d.x * prof * 1.05, d.y * prof * 0.9, d.z))
B.add(ringed_cyl(0.62, 0.6, ln, 18, 14), bark, WOOD, m, deform=torso, smooth=True, streak=0.8, var=0.15)
B.add(sphere(0.62, 14, 9), bark, WOOD, M(HP + Vector((0, 0.3, -0.05)), (0, 0, 0), (1.05, 0.8, 0.9)), smooth=True, streak=0.8, var=0.15, deform=jitter(0.03, 3, 3))
# gnarled bark plates on the flanks and shoulders
for sx in (-1, 1):
    for k in range(7):
        t = 0.15 + k * 0.12
        p = axis_point(m, torso, ln * t)
        r = 0.62 + 0.3 * math.sin(t * math.pi * 0.85)
        # overlapping bark scutes, each a different size and tilt
        sc = rnd.uniform(0.6, 1.3)
        B.add(ico(0.25, 2), crust, rnd.choice(['#4e423e', '#463a38', '#564842']), M(p + Vector((sx * r * 0.9, rnd.uniform(-0.05, 0.05), 0.1 + rnd.uniform(-0.08, 0.08))),
              (rnd.uniform(-0.4, 0.4), sx * 0.2 + rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4)), (0.35 * sc, 1.0 * sc, 1.3 * sc)),
              deform=jitter(0.03, 10 + k * 2 + sx, 5), smooth=True, streak=0.6, var=0.12)
    # cracks of blight light between the plates
    for k in range(5):
        t = 0.22 + k * 0.13
        p = axis_point(m, torso, ln * t)
        r = 0.62 + 0.3 * math.sin(t * math.pi * 0.85)
        q = p + Vector((sx * r * 0.95, 0, -0.12))
        mm, ll = look_m(q + Vector((0, 0.05, 0.14)), q + Vector((0, -0.06, -0.16)))
        B.add(cyl(0.02, 0.01, ll, 4), glow, (1, 1, 1), mm)
# the thicket: dozens of long black thorns erupting from the back, leaning back and out
for k in range(26):
    t = rnd.uniform(0.12, 0.92)
    p = axis_point(m, torso, ln * t)
    r = 0.62 + 0.3 * math.sin(t * math.pi * 0.85)
    side = rnd.uniform(-1, 1)
    base = p + Vector((side * r * 0.6, 0, r * 0.75 * math.cos(side * 0.9)))
    h = rnd.uniform(0.6, 1.4) * (0.6 + 0.6 * math.sin(t * math.pi))
    tip = base + Vector((side * rnd.uniform(0.2, 0.6), rnd.uniform(0.1, 0.5), h))
    mm, ll = look_m(base, tip)
    B.add(ringed_cyl(rnd.uniform(0.05, 0.09), 0.008, ll, 6, 4), thornm, rnd.choice(['#2a2026', '#33262c', '#3a2c30']), mm, deform=gnarl(0.05, 5, 0.6, (rnd.uniform(-0.1, 0.1), 0.1), ll, 40 + k), smooth=True)
    if k % 3 == 0:
        B.add(sphere(0.03, 6, 4), glow, (1, 1, 1), M(tip))
# moss and mushrooms in the hollows
for k in range(10):
    t = rnd.uniform(0.1, 0.9)
    p = axis_point(m, torso, ln * t)
    r = 0.62 + 0.3 * math.sin(t * math.pi * 0.85)
    sx = rnd.choice((-1, 1))
    B.add(ico(0.22, 1), moss, rnd.choice(['#4a6a2a', '#56752e', '#3e5c24']), M(p + Vector((sx * r * 0.7, 0, r * 0.55)), (0, sx * 0.6, rnd.uniform(0, TAU)), (1.4, 1.2, 0.5)), deform=jitter(0.05, 60 + k), var=0.2)
for k in range(8):
    t = rnd.uniform(0.15, 0.85)
    p = axis_point(m, torso, ln * t)
    r = 0.62 + 0.3 * math.sin(t * math.pi * 0.85)
    sx = rnd.choice((-1, 1))
    mushroom_parts(B, fung, fung, M(p + Vector((sx * r * 0.85, 0, r * 0.3))), h=rnd.uniform(0.1, 0.2), r=rnd.uniform(0.07, 0.12),
                   cap=rnd.choice(['#5a3a4a', '#6a4058', '#4e3040']), rot=(0, sx * 1.0, 0), spots=None, seed=k)
# hanging vines and dead leaves under the belly
for k in range(8):
    p = axis_point(m, torso, ln * (0.15 + k * 0.1)) + Vector((rnd.uniform(-0.3, 0.3), 0, -0.6))
    L = rnd.uniform(0.25, 0.5)
    B.add(cyl(0.018, 0.01, L, 4), moss, '#3e5426', M(p - Vector((0, 0, L))))
    lm = Matrix.Translation(p - Vector((0, 0, L))) @ Euler((math.pi, 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
    B.add(leaf(0.18, 0.08, 0.2, 0.1, 3), leafm, '#4e5a2a', lm)
body = B.build(coll, root)

# ---------------------------------------------------------------- the sac (pulses)
S = Part('Sac', 3)
S.add(sphere(0.42, 16, 12), sacm, (1, 1, 1), M((0, 0, 0), (0, 0, 0), (1, 1.15, 0.85)), deform=jitter(0.04, 5, 3), smooth=True)
# veins of bark gripping it
for k in range(6):
    a = k / 6 * TAU
    pts = [Vector((math.cos(a) * 0.3, math.sin(a) * 0.34, -0.25)), Vector((math.cos(a) * 0.45, math.sin(a) * 0.5, 0.0)), Vector((math.cos(a) * 0.25, math.sin(a) * 0.3, 0.32))]
    for j in range(2):
        mm, ll = look_m(pts[j], pts[j + 1])
        S.add(cyl(0.045, 0.03, ll * 1.05, 5), bark, DARK, mm, smooth=True)
sac = S.build(coll, root, axis_point(m, torso, ln * 0.55) + Vector((0, 0, 0.95)))

# ---------------------------------------------------------------- head + jaw
NECK = SH + Vector((0, -0.45, 0.05))
H = Part('Head', 4)
def skull(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        y = v.co.y
        if y < 0:
            k = -y
            v.co.y = y * 2.3
            v.co.x *= 1 - 0.45 * k
            v.co.z = v.co.z * (1 - 0.3 * k) - 0.2 * k
H.add(skull, bone, PALE, M((0, -0.42, -0.05), (0.35, 0, 0), (0.36, 0.34, 0.36)), deform=jitter(0.02, 3, 6), smooth=True, streak=0.6, var=0.12)
# dark eye sockets with burning eyes, a cracked brow
for sx in (-1, 1):
    H.add(sphere(0.16, 10, 7), bark, '#1c1418', M((sx * 0.17, -0.55, 0.06), (0, 0, 0), (1, 0.6, 0.8)), smooth=True)
    # a heavy brow ridge over each socket
    mm, ll = look_m(Vector((sx * 0.02, -0.66, 0.15)), Vector((sx * 0.32, -0.5, 0.14)))
    H.add(ringed_cyl(0.06, 0.04, ll, 8, 3), bone, '#a89a7e', mm, deform=jitter(0.01, 30 + sx, 6), smooth=True, streak=0.5)
    H.add(sphere(0.055, 8, 6), eyeg, (1, 1, 1), M((sx * 0.18, -0.6, 0.06)), smooth=True)
    H.add(box(0.2, 0.18, 0.06), crust, DARK, M((sx * 0.16, -0.5, 0.17), (0.35, sx * 0.25, sx * 0.3)), deform=jitter(0.01, 10 + sx, 8))
    # crown of dead antler branches
    base = Vector((sx * 0.18, -0.3, 0.25))
    def branch(a, b, r, depth, seed):
        mm, ll = look_m(a, b)
        H.add(ringed_cyl(r, r * 0.6, ll, 6, 3), bark, '#3a2c2e', mm, deform=gnarl(0.06, 6, 0.4, (0, 0), ll, seed), smooth=True)
        if depth > 0:
            d = (b - a)
            for k in range(2):
                n = Vector((d.x + sx * rnd.uniform(0.05, 0.3), d.y + rnd.uniform(-0.2, 0.25), d.z * rnd.uniform(0.5, 0.8)))
                branch(b, b + n * 0.75, r * 0.6, depth - 1, seed + k + 1)
        elif seed % 2 == 0:
            H.add(sphere(0.025, 5, 3), glow, (1, 1, 1), M(b))
    branch(base, base + Vector((sx * 0.35, 0.15, 0.6)), 0.07, 2, 70 + sx * 5)
# muzzle teeth along the upper jaw
for k in range(7):
    x = (k - 3) * 0.045
    H.add(cone(0.022, 0.13 if k in (1, 5) else 0.08, 4), bone, '#e6dcc0', M((x, -0.98 + abs(x) * 0.9, -0.2), (math.pi, 0, 0)))
# glowing throat
H.add(sphere(0.12, 8, 6), glow, (1, 1, 1), M((0, -0.5, -0.2)))
# moss mane over the neck
for k in range(6):
    H.add(ico(0.18, 1), moss, rnd.choice(['#46652a', '#3e5a24']), M((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.15, 0.15), 0.2), (0, 0, rnd.uniform(0, TAU)), (1.3, 1.2, 0.5)), deform=jitter(0.04, 80 + k))
head = H.build(coll, root, NECK)

J = Part('Jaw', 5)
def jaw(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0)
    for v in bm.verts:
        if v.co.z > 0.25:
            v.co.z = 0.25
        if v.co.y < 0:
            v.co.y *= 2.0
            v.co.x *= 1 + 0.4 * v.co.y
J.add(jaw, bone, '#a89c82', M((0, -0.3, -0.04), (0, 0, 0), (0.2, 0.3, 0.1)), smooth=True, streak=0.3)
for k in range(6):
    x = (k - 2.5) * 0.05
    J.add(cone(0.02, 0.1 if k in (0, 5) else 0.07, 4), bone, '#e6dcc0', M((x, -0.82 + abs(x) * 0.9, 0.0)))
jawo = J.build(coll, head, (0, -0.25, -0.22))
jawo.rotation_euler = (0.25, 0, 0)

# ---------------------------------------------------------------- limbs
def make_leg(name, sx, front, seed):
    P = Part(name, seed)
    if front:
        # long, ape-like forelimb ending in a knuckled fist of roots
        elbow = Vector((sx * 0.25, -0.15, -1.05))
        wrist = Vector((sx * 0.22, -0.2, -2.05))
        r0, r1, r2 = 0.3, 0.2, 0.16
    else:
        elbow = Vector((sx * 0.08, -0.35, -0.65))
        wrist = Vector((sx * 0.06, 0.05, -1.32))
        r0, r1, r2 = 0.32, 0.22, 0.16
    mm, ll = look_m((0, 0, 0), elbow)
    P.add(ringed_cyl(r0, r1, ll, 12, 5), bark, WOOD, mm, deform=gnarl(0.04, 3, 0.4, (0, 0), ll, seed), smooth=True, streak=0.4)
    mm, ll = look_m(elbow, wrist)
    P.add(ringed_cyl(r1, r2, ll, 11, 4), bark, DARK, mm, deform=gnarl(0.04, 4, 0.3, (0, 0), ll, seed + 5), smooth=True, streak=0.35)
    # elbow spike
    mm2, ll2 = look_m(elbow, elbow + Vector((sx * 0.1, 0.25 if front else -0.2, 0.15)))
    P.add(ringed_cyl(0.07, 0.005, ll2, 6, 3), thornm, '#2e2228', mm2, smooth=True)
    # plates on the upper limb
    for k in range(2):
        sc = rnd.uniform(0.6, 1.0)
        P.add(ico(0.2, 2), crust, rnd.choice(['#4e423e', '#463a38']), M(elbow * (0.35 + 0.3 * k) + Vector((sx * r0 * 0.75, 0, 0)), (rnd.uniform(-0.4, 0.4), sx * 0.2, rnd.uniform(-0.4, 0.4)), (0.4 * sc, 0.9 * sc, 1.3 * sc)),
              deform=jitter(0.02, seed + k, 6), smooth=True, streak=0.6)
    # the fist / foot: a clump of stone and root knuckles
    for k in range(4):
        a = (k - 1.5) * 0.5
        p = wrist + Vector((math.sin(a) * 0.14, -math.cos(a) * 0.12 - 0.05, -0.08))
        P.add(ico(0.1 if front else 0.09, 1), stone, rnd.choice(['#4a4440', '#3e3834']), M(p, (rnd.random(), rnd.random(), 0), (1, 1.2, 0.9)), deform=jitter(0.015, seed + k, 8))
        mm3, ll3 = look_m(p, p + Vector((math.sin(a) * 0.1, -0.15, -0.06)))
        P.add(cone(0.035, ll3, 5), bone, '#cfc4a8', mm3)
    P.add(ico(0.12, 1), moss, '#46652a', M(wrist + Vector((0, 0.05, 0.12)), (0, 0, 0), (1.3, 1.3, 0.7)), deform=jitter(0.02, seed + 9))
    loc = SH + Vector((sx * 0.6, 0.05, -0.15)) if front else HP + Vector((sx * 0.55, 0.0, -0.1))
    return P.build(coll, root, loc)

legs = [make_leg('LegFL', -1, True, 11), make_leg('LegFR', 1, True, 12), make_leg('LegBL', -1, False, 13), make_leg('LegBR', 1, False, 14)]

# ---------------------------------------------------------------- tail: a stump of roots
T = Part('Tail', 9)
pts = [Vector((0, 0, 0)), Vector((0, 0.3, -0.12)), Vector((0.05, 0.55, -0.35)), Vector((0.02, 0.7, -0.65))]
for j in range(len(pts) - 1):
    mm, ll = look_m(pts[j], pts[j + 1])
    T.add(ringed_cyl(0.12 - j * 0.03, 0.09 - j * 0.03, ll * 1.08, 7, 2), bark, DARK, mm, smooth=True, streak=0.4)
    T.add(cone(0.03, 0.15, 4), thornm, '#2e2228', M(pts[j] + Vector((0, 0, 0.1)), (-0.6, 0, 0)))
tail = T.build(coll, root, HP + Vector((0, 0.55, 0.0)))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
