# The Heartwood: the shrine the player defends. A glowing seed cradled in the curled
# branches of a fluted, twisted trunk, rooted on a three-step stone dais inside a ring of
# carved standing stones. Glowing veins run up the bark to the seed.
# Animated nodes: "Heart" (pulse/spin), "Orbit" (rune stones circling the seed).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Heartwood')
root = root_empty('Heartwood', coll)
rnd = random.Random(7)

bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.92)
moss = get_mat('Moss', 1.0)
leafm = get_mat('LeafDS', 0.7, double=True)
plant = get_mat('Plant', 0.8)
rune = get_mat('RuneGlow', 0.4, emit=(0.35, 1.0, 0.62), strength=4.0)
heartm = get_mat('HeartGlow', 0.2, emit=(0.55, 1.0, 0.7), strength=6.0)
vein = get_mat('VeinGlow', 0.4, emit=(0.3, 0.95, 0.55), strength=2.5)
shroom = get_mat('Shroom', 0.6)

BARK = '#5b4331'
B = Part('Body', 11)

# ---------------------------------------------------------------- dais (3 steps of cut stone)
steps = [(3.05, 0.0, 0.24), (2.45, 0.22, 0.22), (1.9, 0.42, 0.18)]
for si, (R, z0, h) in enumerate(steps):
    n = 12
    for i in range(n):
        a0 = i / n * TAU
        mid = a0 + TAU / n / 2
        w = 2 * R * math.sin(TAU / n / 2) * 0.96
        depth = 0.62 if si < 2 else 0.5
        rc = R - depth / 2
        m = M((math.cos(mid) * rc, math.sin(mid) * rc, z0 + rnd.uniform(-0.015, 0.02)), (rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), mid))
        B.add(box(depth, w, h), stone, rnd.choice(['#7f7b70', '#76736a', '#878377']), m, deform=jitter(0.025, si * 50 + i, 3.0), ao=0.35, ao_h=0.35, ao_base=z0, streak=0.12)
# central floor disc under the trunk
B.add(cyl(1.5, 1.45, 0.2, 12), stone, '#6a675e', M((0, 0, 0.42)), deform=jitter(0.03, 5))
# moss creeping over the steps
for i in range(14):
    a = rnd.uniform(0, TAU); r = rnd.uniform(1.4, 2.9)
    z = 0.62 if r < 1.9 else (0.44 if r < 2.45 else 0.24)
    B.add(ico(rnd.uniform(0.18, 0.38), 1), moss, rnd.choice(['#4d7429', '#58822f', '#466a25']), M((math.cos(a) * r, math.sin(a) * r, z - 0.02), (0, 0, a), (1.6, 1.0, 0.18)), deform=jitter(0.05, 200 + i), var=0.2)

# ---------------------------------------------------------------- standing stones
for i in range(8):
    a = i / 8 * TAU + 0.2
    h = rnd.uniform(1.25, 1.85)
    tilt = rnd.uniform(-0.07, 0.07)
    m = M((math.cos(a) * 3.45, math.sin(a) * 3.45, -0.2), (tilt, rnd.uniform(-0.05, 0.05), a))
    sc = rnd.choice(['#858175', '#7b786d', '#8e8a7d'])
    B.add(box(0.42, 0.66, h), stone, sc, m, deform=jitter(0.04, 10 + i, 2.0), ao=0.5, ao_h=1.1, streak=0.18)
    # bevelled pyramid cap
    B.add(cyl(0.48, 0.16, 0.32, 4), stone, sc, m @ M((0, 0, h), (0, 0, math.pi / 4), (0.62, 0.95, 1)), deform=jitter(0.03, 20 + i, 2.0))
    # moss on the cap and a strip down the back
    B.add(ico(0.26, 1), moss, '#56802e', m @ M((0.02, 0, h + 0.12), (0, 0, 0), (1.0, 1.4, 0.45)), deform=jitter(0.05, 30 + i), var=0.25)
    for k in range(3):
        B.add(ico(rnd.uniform(0.1, 0.17), 1), moss, '#4f7a2a', m @ M((0.2, rnd.uniform(-0.2, 0.2), h * rnd.uniform(0.15, 0.8)), (0, 0, 0), (0.35, 1.0, 1.4)), deform=jitter(0.04, 40 + i * 3 + k), var=0.25)
    # glyph: a vertical bar with ticks and a ring, on the inward face
    g = m @ M((-0.215, 0, h * 0.42))
    B.add(box(0.03, 0.06, 0.5), rune, (1, 1, 1), g)
    for k, (dz, dy) in enumerate([(0.12, 0.09), (-0.08, -0.09), (0.28, -0.07)]):
        B.add(box(0.03, 0.12, 0.045), rune, (1, 1, 1), g @ M((0, dy, dz)))
    B.add(torus(0.07, 0.015, 10, 4), rune, (1, 1, 1), g @ M((0, 0, 0.62), (0, math.pi / 2, 0)))
    # foot stones
    for k in range(2):
        B.add(ico(rnd.uniform(0.1, 0.16), 1), stone, '#8a877b', m @ M((rnd.uniform(-0.35, 0.35), rnd.choice([-0.45, 0.45]), 0.25), (rnd.random(), rnd.random(), 0)), deform=jitter(0.02, 300 + i * 2 + k))
# one toppled stone
B.add(box(0.4, 0.6, 1.4), stone, '#7d7a70', M((3.9, -1.9, 0.2), (math.pi / 2 - 0.15, 0, 2.6)), deform=jitter(0.05, 99, 2.0), ao=0.3, ao_h=0.5, streak=0.15)

# ---------------------------------------------------------------- trunk
TH = 2.7
def trunk_def(co):
    t = co.z / TH
    ang = math.atan2(co.y, co.x)
    flute = 1 + 0.07 * math.cos(ang * 7 + t * 2.5)  # bark ridges that wind up the trunk
    d = gnarl(0.04, 2.2, 1.3, (0, 0), TH, 4)(co)
    flare = 1 + 0.6 * max(0, 1 - t * 3) ** 2
    return Vector((d.x * flare * flute, d.y * flare * flute, d.z))
B.add(ringed_cyl(0.8, 0.4, TH, 20, 16), bark, BARK, M((0, 0, 0.5)), deform=trunk_def, smooth=True, streak=0.35, ao=0.45, ao_h=1.2, ao_base=0.5)
# knot holes
for i, (a, z) in enumerate([(0.6, 1.4), (3.4, 2.0)]):
    r = 0.66 - z * 0.08
    B.add(torus(0.13, 0.05, 10, 5), bark, '#4a3526', M((math.cos(a) * r, math.sin(a) * r, z), (math.pi / 2, 0, a + math.pi / 2), (1, 1.4, 1)), smooth=True)
    B.add(cyl(0.1, 0.1, 0.03, 10), bark, '#1c140e', M((math.cos(a) * (r - 0.01), math.sin(a) * (r - 0.01), z), (math.pi / 2, 0, a + math.pi / 2), (1, 1.4, 1)))

# glowing veins spiralling up the bark toward the seed
for i in range(4):
    a0 = i / 4 * TAU + 0.3
    pts = []
    for j in range(10):
        t = j / 9
        zl = t * (TH - 0.15)
        a = a0 + t * 0.9
        r = 0.8 + (0.4 - 0.8) * zl / TH
        co = trunk_def(Vector((math.cos(a) * r, math.sin(a) * r, zl)))
        pts.append(Vector((co.x * 1.03, co.y * 1.03, co.z + 0.5)))
    for j in range(len(pts) - 1):
        m, ln = look_m(pts[j], pts[j + 1])
        B.add(cyl(0.03, 0.026, ln * 1.08, 5), vein, (1, 1, 1), m)

# ---------------------------------------------------------------- roots
for i in range(9):
    a = i / 9 * TAU + rnd.uniform(-0.15, 0.15)
    L = rnd.uniform(2.4, 3.3)
    end_z = 0.05 if L > 2.6 else 0.3
    m, ln = look_m((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.15), (math.cos(a) * L, math.sin(a) * L, end_z))
    def rd(co, ln=ln, s=i):
        d = gnarl(0.05, 3, 0.5, (0, 0), ln, 40 + s)(co)
        t = co.z / ln
        return Vector((d.x + 0.4 * math.sin(t * math.pi), d.y + 0.12 * math.sin(t * 5 + s), d.z))
    B.add(ringed_cyl(0.36, 0.04, ln, 10, 9), bark, BARK, m, deform=rd, smooth=True, streak=0.3, ao=0.3, ao_h=0.6, ao_base=0.3)
    # side rootlets
    for k in range(2):
        t = 0.45 + k * 0.25
        p = axis_point(m, rd, ln * t)
        sgn = 1 if k else -1
        side = Vector((math.cos(a + sgn * 0.9), math.sin(a + sgn * 0.9), 0))
        m2, l2 = look_m(p, p + side * rnd.uniform(0.5, 0.8) + Vector((0, 0, -0.25)))
        B.add(ringed_cyl(0.09, 0.015, l2, 6, 4), bark, '#54402f', m2, deform=gnarl(0.04, 4, 0, (0.05, 0), l2, 70 + i * 2 + k), smooth=True)
    # mushrooms on some roots
    if i % 3 == 0:
        p = axis_point(m, rd, ln * 0.7)
        for k in range(3):
            off = Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0.05))
            mushroom_parts(B, plant, shroom, M(p + off), h=rnd.uniform(0.1, 0.2), r=rnd.uniform(0.06, 0.1),
                           cap=rnd.choice(['#c2532e', '#d07a2c']), rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0), spots=plant, seed=i * 10 + k)

# ---------------------------------------------------------------- cradle branches + leaves
for i in range(6):
    a = i / 6 * TAU + 0.5
    base = Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, TH + 0.3))
    tip = Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, TH + 1.85 + rnd.uniform(-0.15, 0.2)))
    m, ln = look_m(base, tip, 0)
    inward = Vector((-math.cos(a), -math.sin(a), 0))
    loc_in = m.to_3x3().inverted() @ inward
    def bd(co, ln=ln, s=i, loc_in=loc_in):
        d = gnarl(0.04, 3, 0.8, (0, 0), ln, 60 + s)(co)
        t = co.z / ln
        return d + loc_in * (t ** 2.4) * 1.05
    B.add(ringed_cyl(0.23, 0.03, ln, 10, 10), bark, BARK, m, deform=bd, smooth=True, streak=0.3)
    # twigs with leaf clusters off the outside of each branch
    for k in range(3):
        t = 0.38 + k * 0.2
        p = axis_point(m, bd, ln * t)
        out = Vector((math.cos(a + rnd.uniform(-0.6, 0.6)), math.sin(a + rnd.uniform(-0.6, 0.6)), rnd.uniform(-0.2, 0.4))).normalized()
        tw_end = p + out * rnd.uniform(0.35, 0.6)
        m2, l2 = look_m(p, tw_end)
        B.add(ringed_cyl(0.045, 0.012, l2, 5, 3), bark, '#5a4430', m2, smooth=True)
        for q in range(6):
            yaw = q / 6 * TAU + rnd.uniform(-0.3, 0.3)
            pitch = rnd.uniform(0.7, 1.5)
            lm = Matrix.Translation(tw_end) @ Euler((pitch, 0, yaw)).to_matrix().to_4x4()
            B.add(leaf(rnd.uniform(0.28, 0.42), rnd.uniform(0.13, 0.19), 0.3, 0.25), leafm, rnd.choice(['#3f7d2c', '#4b8a31', '#356d26', '#5a9a38']), lm, var=0.15)
    # moss collar where each branch leaves the trunk
    B.add(ico(0.2, 1), moss, '#55802d', M(base + Vector((0, 0, -0.05)) - inward * 0.12, (0, 0, a), (1.3, 0.9, 0.7)), deform=jitter(0.04, 120 + i))

# hanging vines with leaves
for i in range(7):
    a = i / 7 * TAU + 0.2
    r = rnd.uniform(1.0, 1.3)
    top = TH + rnd.uniform(1.3, 1.6)
    L = rnd.uniform(1.3, 2.6)
    B.add(ringed_cyl(0.022, 0.016, L, 5, 6), plant, '#4a6d25', M((math.cos(a) * r, math.sin(a) * r, top - L)), deform=jitter(0.07, 90 + i, 1.4))
    for q in range(4):
        z = top - L * (0.2 + q * 0.22)
        lm = Matrix.Translation((math.cos(a) * r, math.sin(a) * r, z)) @ Euler((rnd.uniform(1.8, 2.5), 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
        B.add(leaf(0.16, 0.08, 0.2, 0.1, 4), leafm, '#4f8a30', lm, var=0.15)

# ferns at the trunk base
for i in range(5):
    a = i / 5 * TAU + 0.9
    p = Vector((math.cos(a) * 1.25, math.sin(a) * 1.25, 0.6))
    for q in range(7):
        yaw = q / 7 * TAU
        lm = Matrix.Translation(p) @ Euler((rnd.uniform(0.9, 1.25), 0, yaw)).to_matrix().to_4x4()
        B.add(leaf(rnd.uniform(0.45, 0.6), 0.14, 0.15, 0.45, 6), leafm, rnd.choice(['#4d8a2f', '#5c9a36']), lm, var=0.12)

body = B.build(coll, root)

# ---------------------------------------------------------------- the seed
H = Part('Heart', 3)
H.add(ico(0.42, 3), heartm, (1, 1, 1), smooth=True)
for i in range(7):
    a = i / 7 * TAU
    # opening bark petals cupping the glow
    H.add(sphere(0.22, 10, 7), bark, '#3d2a1e', M((math.cos(a) * 0.36, math.sin(a) * 0.36, -0.22), (0.75 * math.sin(a), -0.75 * math.cos(a), 0), (0.6, 1.0, 1.9)), smooth=True, streak=0.3)
for i in range(5):
    a = i / 5 * TAU + 0.3
    # crystal shards poking out of the glow
    m, ln = look_m((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.1), (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.4 + rnd.uniform(-0.1, 0.12)))
    H.add(cyl(0.07, 0.0, ln, 5), heartm, (1, 1, 1), m)
heart = H.build(coll, root, (0, 0, TH + 1.35))

# ---------------------------------------------------------------- orbiting rune stones
O = Part('Orbit', 5)
for i in range(3):
    a = i / 3 * TAU
    p = Vector((math.cos(a) * 1.05, math.sin(a) * 1.05, rnd.uniform(-0.15, 0.15)))
    m = M(p, (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), a))
    O.add(box(0.16, 0.24, 0.32, base=False), stone, '#8d897d', m, deform=jitter(0.025, 400 + i, 4.0))
    O.add(box(0.02, 0.06, 0.18, base=False), rune, (1, 1, 1), m @ M((-0.085, 0, 0)))
    O.add(box(0.02, 0.14, 0.035, base=False), rune, (1, 1, 1), m @ M((-0.085, 0, 0.05)))
orbit = O.build(coll, root, (0, 0, TH + 1.35))

isolate(coll)
print('ok', len(body.data.polygons), len(heart.data.polygons), len(orbit.data.polygons))
