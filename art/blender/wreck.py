# The plane wreck: a twin-engined bush plane that came down in the jungle decades ago. The
# fuselage broke behind the wing; the nose half lies where it stopped with its cockpit glass
# smashed, the tail half slewed off to one side with its fin leaning, the left wing still on
# with its engine and a bent propeller, the right wing torn off and thrown ahead. Faded olive
# paint over rust, moss on everything that faces the sky, vines hanging off it.
#
# Authored in the game's local frame (x right, y up, z toward the nose) through G(), so it
# lines up with the colliders and the cockpit search in world/poi/POI.js (buildWreck).
# Origin on the ground at the POI's centre.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Wreck')
root = root_empty('Wreck', coll)
rnd = random.Random(91)


def G(x, y, z):
    """game local (x, y up, z nose) -> Blender (x, -z, y)"""
    return Vector((x, -z, y))


# painted skin: dielectric, or it mirrors the sky and reads white
skin = get_mat('Metal', 0.72, 0.08, double=True)
inner = get_mat('Interior', 0.9, double=True)
rust = get_mat('Rust', 0.88, 0.12)
glass = get_mat('Glass', 0.08, 0.6)
tyre = get_mat('Rubber', 0.95)
moss = get_mat('Moss', 1.0)
leafm = get_mat('LeafDS', 0.7, double=True)
vine = get_mat('Vine', 0.8)
OLIVE = Vector(hexc('#4b4f34'))
BELLY = Vector(hexc('#6a6a5e'))
GRIME = Vector(hexc('#3a3424'))
MOSS = Vector(hexc('#4c6a26'))
mn = noise.noise


def weather(P, n0, top=0.55, amount=0.75, belly=True, scale=1.6):
    """Repaint the faces added since n0: olive above, grey belly below, rust where the paint's
    gone, moss where the face looks at the sky."""
    P.bm.faces.ensure_lookup_table()
    for f in P.bm.faces[n0:]:
        f.normal_update()
        nz = f.normal.z
        for l in f.loops:
            co = l.vert.co
            c = Vector(l[P.col][:3])
            # the belly was painted grey
            if belly and nz < -0.3:
                c = c.lerp(BELLY, 0.6)
            # grime washed down the sides, darker toward the ground
            c = c.lerp(GRIME, max(0.0, min(0.6, 0.35 - co.z * 0.12 + 0.25 * mn(co * Vector((4, 4, 0.8))))))
            # paint lost to rust in blotches
            r = mn(co * 1.3 + Vector((3, 1, 7)))
            if r > 0.12:
                k = min(1.0, (r - 0.12) * 2.5)
                c = c.lerp(Vector(hexc('#5a3420')), k * 0.85)
            # moss on the upward faces, in patches
            m = max(0.0, nz - (1 - top)) / top
            m *= max(0.0, min(1.0, 0.5 + mn(co * scale) * 1.4))
            c = c.lerp(MOSS * (0.8 + 0.3 * mn(co * 6)), min(1.0, m * amount))
            l[P.col] = (min(c.x, 1), min(c.y, 1), min(c.z, 1), 1.0)


def frame(axis0, axis1, t, radius, seg=16, flat=0.82):
    """(point on the axis, side, up, r) at t along a hull, to hang things off its surface."""
    a0, a1 = Vector(axis0), Vector(axis1)
    fw = (a1 - a0).normalized()
    side = fw.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(fw).normalized()
    return a0.lerp(a1, t), fw, side, up, radius(t)


def hull(axis0, axis1, radius, n_rings=14, seg=16, flat=0.82, jag=0.0, jag_end=1, dent=0.06, seed=0, holes=0.0):
    """A fuselage shell between two axis points: rings with a rounded-box cross-section
    (flattened belly), radius(t) per ring. jag tears the ring at jag_end (0 = start, 1 = end)."""
    a0, a1 = Vector(axis0), Vector(axis1)
    ax = (a1 - a0)
    Lh = ax.length
    fw = ax.normalized()
    side = fw.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(fw).normalized()
    off = Vector((seed * 3.1, seed * 1.7, seed * 5.3))

    def b(bm):
        rows = []
        for j in range(n_rings + 1):
            t = j / n_rings
            r = radius(t)
            row = []
            for i in range(seg):
                th = i / seg * TAU
                cx, cy = math.cos(th), math.sin(th)
                # rounded box: superellipse, the belly flatter than the back
                ex = 2.6
                sx = math.copysign(abs(cx) ** (2 / ex), cx)
                sy = math.copysign(abs(cy) ** (2 / ex), cy) * (flat if cy < 0 else 1.0)
                p = a0 + fw * (Lh * t) + side * (sx * r) + up * (sy * r)
                # dents and buckles
                p += (side * sx + up * sy) * (dent * (mn(p * 1.1 + off) + 0.5 * mn(p * 3.1 + off)))
                # the torn end: ragged, pulled in and bent
                e = t if jag_end == 1 else 1 - t
                if jag and e > 0.999:
                    p += fw * (jag * (mn(p * 3.3 + off) * 1.6 + (0.4 if i % 3 == 0 else 0)) * (1 if jag_end == 1 else -1))
                row.append(bm.verts.new(p))
            rows.append(row)
        for j in range(n_rings):
            for i in range(seg):
                # skin panels torn away (never along the belly, never at the ends)
                if holes and 0 < j < n_rings - 2 and (i < seg * 0.45 or i > seg * 0.95):
                    c = (rows[j][i].co + rows[j + 1][(i + 1) % seg].co) / 2
                    if mn(c * 0.9 + off) > 1 - holes:
                        continue
                bm.faces.new((rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]))
        return rows
    return b


# ------------------------------------------------------------------ the nose half
P = Part('Body', 7)
# nose dug into the ground, the break end up on its belly
NOSE = G(0.0, 0.5, 6.3)
BREAK = G(0.0, 1.0, -1.5)
R0 = 1.12


def front_r(t):
    # t from the break (0) to the nose (1): a long body, then an ogive nose
    if t > 0.66:
        u = (t - 0.66) / 0.34
        return R0 * math.sqrt(max(0.0, 1 - u ** 1.8)) * (1 - 0.1 * u) + 0.06
    return R0 - 0.04 * t


n0 = len(P.bm.faces)
P.add(hull(BREAK, NOSE, front_r, 22, 18, jag=0.35, jag_end=0, seed=1, dent=0.08, holes=0.16), skin, '#4b4f34', var=0.08, smooth=True, streak=0.35)
weather(P, n0)
# the inside of the broken end: a dark lining a little inside the skin
P.add(hull(BREAK + Vector((0, -0.02, 0)), BREAK.lerp(NOSE, 0.55), lambda t: front_r(t * 0.55) - 0.06, 6, 18, jag=0.3, jag_end=0, seed=1, dent=0.02), inner, '#24221c', var=0.1, smooth=True)
# the ribs, showing where the skin has gone
for t in (0.08, 0.2, 0.32, 0.44, 0.56):
    c, fw, sd, up, r = frame(BREAK, NOSE, t, front_r)
    rm = Matrix.Translation(c) @ fw.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    P.add(torus(r * 0.95, 0.035, 18, 4), rust, '#4a3424', rm @ M((0, 0, 0), (0, 0, 0), (1, 0.9, 1)), var=0.2)
# a nose cone and the smashed cockpit glazing
P.add(sphere(0.16, 10, 6), rust, '#5a3a24', M(NOSE + G(0, 0, 0.03)), smooth=True)
# windscreen panes up on the nose's shoulder, side windows behind them; each pane sits on the
# hull's surface facing out of it
panes = []
for s_ in (-1, 1):
    panes.append((0.79, s_ * 0.38, 0.86, 0.5, 0.36, s_ < 0))   # windscreen: t, across, up, w, h, broken
    panes.append((0.7, s_ * 0.8, 0.62, 0.42, 0.32, s_ > 0))    # side windows
for (t, ax_, up_, w, h, broken) in panes:
    c, fw, sd, up, r = frame(BREAK, NOSE, t, front_r)
    n = (sd * ax_ + up * up_).normalized()
    c = c + n * r * 1.0 + fw * 0.0
    # pane frame: x across, y out of the hull (normal), z along the nose
    zx = fw - n * fw.dot(n)
    xx = n.cross(zx).normalized()
    rm = Matrix((xx.to_4d(), n.to_4d(), zx.normalized().to_4d(), Vector((0, 0, 0, 1)))).transposed()
    rm.translation = c
    # the frame
    for dx, dz, sx_, sz_ in ((0, h / 2, w + 0.06, 0.05), (0, -h / 2, w + 0.06, 0.05), (w / 2, 0, 0.05, h), (-w / 2, 0, 0.05, h)):
        P.add(box(sx_, 0.05, sz_, base=False), rust, '#3a3428', rm @ M((dx, 0, dz)), var=0.15)
    if broken:
        # a few shards left in the frame
        for q in range(3):
            P.add(box(rnd.uniform(0.08, 0.18), 0.01, rnd.uniform(0.08, 0.16), base=False), glass, '#1a262a', rm @ M((rnd.uniform(-w / 3, w / 3), 0.01, rnd.uniform(-h / 3, h / 3)), (0, rnd.uniform(-0.6, 0.6), 0)), var=0.1)
        P.add(box(w, 0.01, h, base=False), inner, '#0c0b09', rm @ M((0, -0.06, 0)), var=0.05)
    else:
        P.add(box(w, 0.012, h, base=False), glass, '#2a3c40', rm, var=0.12, streak=0.4)
def on_hull(t, ax_, up_, lift=1.01):
    """A matrix on the front hull's surface: x along the hull, y out of it, z round it."""
    c, fw, sd, up, r = frame(BREAK, NOSE, t, front_r)
    n = (sd * ax_ + up * up_).normalized()
    zz = n.cross(fw).normalized()
    m = Matrix((fw.to_4d(), n.to_4d(), zz.to_4d(), Vector((0, 0, 0, 1)))).transposed()
    m.translation = c + n * r * lift
    return m


paint = get_mat('Paint', 0.8)
for s_ in (-1, 1):
    # a faded roundel, and a pale stripe along the side
    rm = on_hull(0.37, s_, 0.12) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    P.add(cyl(0.4, 0.4, 0.012, 20), paint, '#a8a290', rm, var=0.3)
    P.add(cyl(0.19, 0.19, 0.016, 16), paint, '#5a2a22', rm, var=0.25)
    for k in range(10):
        t = 0.06 + k * 0.06
        P.add(box(0.36, 0.012, 0.09, base=False), paint, '#9c968a', on_hull(t, s_, -0.18), var=0.35)
# the cargo door on the right side, torn half off its hinges and hanging open
dm = on_hull(0.24, 1, -0.05, 1.03)
P.add(box(0.95, 0.05, 1.0, base=False), inner, '#121110', dm, var=0.05)
n0 = len(P.bm.faces)
P.add(box(0.95, 0.05, 1.0, base=False, cuts=1), skin, '#4b4f34', dm @ M((0.5, 0.0, 0.0)) @ M((0, 0, 0), (0, 0.2, -1.1)) @ M((0.48, 0, 0)), deform=jitter(0.03, 5, 2), var=0.1)
weather(P, n0)
# undercarriage: the nose wheel snapped off and lying by the nose
P.add(torus(0.3, 0.12, 16, 8), tyre, '#1c1a18', M(G(-1.4, 0.13, 6.4)) @ M((0, 0, 0), (0.15, 0.1, 0)), smooth=True)
P.add(cyl(0.12, 0.12, 0.2, 10), rust, '#5a5048', M(G(-1.4, 0.12, 6.4)) @ M((0, 0, -0.1)))

# ------------------------------------------------------------------ the left wing, engine, propeller
WR, WT = G(-0.9, 0.62, 2.8), G(-7.6, 0.18, 2.6)
n0 = len(P.bm.faces)
def wing(root, tip, chord0=2.0, chord1=1.25, th0=0.24, th1=0.1, segs=8, curl=0.0, seed=0):
    root, tip = Vector(root), Vector(tip)
    span = tip - root
    def b(bm):
        rows = []
        for j in range(segs + 1):
            t = j / segs
            c = chord0 + (chord1 - chord0) * t
            th = th0 + (th1 - th0) * t
            p = root.lerp(tip, t)
            # the outer end crumples up where it hit
            p.z += curl * max(0.0, t - 0.75) ** 2 * 16
            row = []
            # an airfoil loop: thick at the leading edge (+game z = -Blender y), thin at the trailing
            for i in range(10):
                a = i / 10 * TAU
                u = (math.cos(a) * 0.5 + 0.5)  # 0 trailing .. 1 leading
                y = -(u - 0.4) * c
                z = math.sin(a) * th * 0.5 * (0.35 + 0.65 * math.sin(min(1.0, u * 1.15) * math.pi * 0.5))
                q = p + Vector((0, y, z))
                q.z += 0.03 * mn(q * 2 + Vector((seed, 0, 0)))
                row.append(bm.verts.new(q))
            rows.append(row)
        for j in range(segs):
            for i in range(10):
                bm.faces.new((rows[j][i], rows[j][(i + 1) % 10], rows[j + 1][(i + 1) % 10], rows[j + 1][i]))
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
    return b
P.add(wing(WR, WT, curl=0.4, seed=2), skin, '#4b4f34', var=0.08, smooth=True, streak=0.3)
weather(P, n0, top=0.7, amount=0.95)
# a hanging aileron near the tip
am = Matrix.Translation(G(-6.0, 0.2, 1.75)) @ Euler((0.6, 0.15, 0.1)).to_matrix().to_4x4()
n0 = len(P.bm.faces)
P.add(box(1.6, 0.35, 0.05, base=False), skin, '#4b4f34', am, var=0.1)
weather(P, n0)
# the engine nacelle on the wing, cowling peeled, and the bent three-bladed propeller
EN0, EN1 = G(-3.2, 0.72, 0.55), G(-3.2, 0.78, 2.55)
n0 = len(P.bm.faces)
P.add(hull(EN0, EN1, lambda t: 0.52 - 0.12 * max(0.0, t - 0.6) / 0.4, 6, 14, flat=0.95, dent=0.05, seed=4), skin, '#46492f', var=0.1, smooth=True, streak=0.4)
weather(P, n0)
# the exposed cylinders where the cowling's gone
for k in range(7):
    a = k / 7 * TAU
    c = G(-3.2 + math.cos(a) * 0.36, 0.78 + math.sin(a) * 0.36, 2.48)
    mm, ll = look_m(c, c + (c - G(-3.2, 0.78, 2.48)).normalized() * 0.22)
    P.add(cyl(0.08, 0.07, ll, 8), rust, '#4a3828', mm, var=0.2)
HUB = G(-3.2, 0.78, 2.7)
P.add(sphere(0.17, 10, 6), rust, '#3f3a34', M(HUB, (0, 0, 0), (1, 1, 1.2)), smooth=True)
for k in range(3):
    a = k / 3 * TAU + 0.4
    d = Vector((math.cos(a), 0, math.sin(a)))
    tip = HUB + d * 1.15
    # bent back where it struck the ground
    bend = 0.55 if k == 1 else 0.18
    tip += Vector((0, bend, -0.25 if k == 1 else 0))
    mm, ll = look_m(HUB, tip, roll=0.4)
    P.add(box(0.2, 0.035, ll, base=True), rust, '#3a3530', mm, deform=jitter(0.02, 30 + k, 3), var=0.15, streak=0.4)

# ------------------------------------------------------------------ the tail half, slewed and rolled
TAIL0, TAIL1 = G(0.55, 0.85, -2.15), G(1.55, 0.95, -6.75)
P2_n0 = len(P.bm.faces)
def tail_r(t):
    return 1.08 - 0.72 * t
P.add(hull(TAIL0, TAIL1, tail_r, 12, 16, jag=0.35, jag_end=0, dent=0.09, seed=6, holes=0.12), skin, '#4b4f34', var=0.08, smooth=True, streak=0.35)
weather(P, P2_n0)
P.add(hull(TAIL0 + Vector((0, -0.02, 0)), TAIL0.lerp(TAIL1, 0.3), lambda t: tail_r(t * 0.3) - 0.06, 4, 16, jag=0.3, jag_end=0, seed=6, dent=0.02), inner, '#24221c', var=0.1, smooth=True)
# the fin, leaning with the roll of the tail, and the tailplanes
roll = -0.38
tail_dir = (TAIL1 - TAIL0).normalized()
fin_base = TAIL0.lerp(TAIL1, 0.82) + Vector((0, 0, 0.3))
fin_up = Vector((math.sin(-roll), 0, math.cos(roll)))
def fin(bm):
    pts = []
    for (u, v) in ((0, 0), (1.7, 0), (1.25, 2.1), (0.55, 2.2)):
        pts.append(fin_base - tail_dir * (u - 0.8) * -1 + fin_up * v)
    bm_v = [bm.verts.new(p + s * Vector((0.06, 0, 0))) for s in (-1, 1) for p in pts]
    bm.faces.new(bm_v[:4])
    bm.faces.new(list(reversed(bm_v[4:])))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((bm_v[i], bm_v[j], bm_v[4 + j], bm_v[4 + i]))
n0 = len(P.bm.faces)
P.add(fin, skin, '#4b4f34', var=0.08)
weather(P, n0, top=0.5)
tp_c = TAIL0.lerp(TAIL1, 0.88)
for s in (-1, 1):
    a = tp_c + Vector((0, 0, 0.15))
    b2 = a + Vector((s * 1.6 * math.cos(roll), 0, -s * 1.6 * math.sin(roll) * 0.6))
    n0 = len(P.bm.faces)
    P.add(wing(a, b2, chord0=1.1, chord1=0.7, th0=0.12, th1=0.06, segs=3, seed=7 + s), skin, '#4b4f34', var=0.08, smooth=True)
    weather(P, n0, top=0.7)

# ------------------------------------------------------------------ the torn-off right wing, thrown ahead
RW = Matrix.Translation(G(4.5, 0.12, 4.5)) @ Matrix.Rotation(-0.9, 4, 'Z') @ Matrix.Rotation(0.12, 4, 'Y')
n0 = len(P.bm.faces)
P.add(wing(Vector((-1.6, 0, 0)), Vector((1.7, 0, -0.1)), chord0=1.9, chord1=1.6, segs=5, seed=9), skin, '#4b4f34', RW, var=0.08, smooth=True)
weather(P, n0, top=0.7, amount=1.0)
# the spar sticking out of the torn root, and ribs
for k in range(2):
    mm, ll = look_m(Vector((-1.6, -0.2 - k * 0.6, 0)), Vector((-2.15 + k * 0.25, -0.25 - k * 0.6, 0.05)))
    P.add(box(0.06, 0.14, ll, base=True), rust, '#4a3628', RW @ mm, var=0.2)

# ------------------------------------------------------------------ debris, moss mounds, vines
for k in range(7):
    a = rnd.uniform(0, TAU)
    d = rnd.uniform(4.5, 9)
    c = G(math.cos(a) * d, 0.04, math.sin(a) * d)
    n0 = len(P.bm.faces)
    P.add(box(rnd.uniform(0.6, 1.3), rnd.uniform(0.4, 0.9), 0.03, base=False, cuts=2), skin, '#4b4f34',
          M(c, (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0, TAU))), deform=jitter(0.05, 40 + k, 1.5), var=0.1)
    weather(P, n0, top=0.9, amount=1.0)
soil = get_mat('Moss', 1.0)
for k in range(12):
    # soil and moss heaped against the hull where it ploughed into the ground
    t = rnd.uniform(0.15, 1.0) if k < 8 else rnd.uniform(0.0, 0.7)
    a0, a1 = (BREAK, NOSE) if k < 8 else (TAIL0, TAIL1)
    c = a0.lerp(a1, t)
    s = rnd.choice([-1, 1])
    c = c + Vector((s * rnd.uniform(0.8, 1.1), 0, 0))
    c.z = -0.12
    if k < 3:
        c = NOSE + Vector((rnd.uniform(-0.6, 0.6), -rnd.uniform(0.2, 0.8), -0.15))  # the furrow it dug at the nose
    P.add(ico(rnd.uniform(0.45, 0.75), 2), soil, rnd.choice(['#3a4a22', '#33421e', '#4a4a2a', '#3f3a26']), M(c, (0, 0, rnd.uniform(0, TAU)), (1.5, 1.0, 0.5)),
          deform=jitter(0.16, 60 + k, 1.4), var=0.25, smooth=True)
# lianas draped over the nose and hanging off the wing's edge, with a few leaves
def vine_curve(pts, r=0.025, leaves=6, seed=0):
    rr = random.Random(seed)
    for j in range(len(pts) - 1):
        mm, ll = look_m(pts[j], pts[j + 1])
        P.add(cyl(r, r * 0.9, ll * 1.04, 5), vine, '#2a3618', mm, var=0.15)
    for q in range(leaves):
        j = rr.randrange(len(pts) - 1)
        p = pts[j].lerp(pts[j + 1], rr.random())
        lm = Matrix.Translation(p) @ Euler((rr.uniform(0, TAU), rr.uniform(0, TAU), 0)).to_matrix().to_4x4()
        P.add(leaf(rr.uniform(0.16, 0.26), 0.1, 0.25, 0.2, 4), leafm, rr.choice(['#3f7a2a', '#4d8a30', '#356a24']), lm, var=0.12)
for k in range(5):
    gz = rnd.uniform(0.0, 5.0)
    s = rnd.choice([-1, 1])
    top = G(s * rnd.uniform(0.0, 0.4), 2.25, gz)
    pts = [G(-s * 1.4, 0.0, gz + rnd.uniform(-0.4, 0.4)), G(-s * 1.15, 1.2, gz), G(-s * 0.6, 2.1, gz), top,
           G(s * 0.7, 2.05, gz + 0.2), G(s * 1.2, 1.3, gz + 0.3), G(s * 1.35, 0.0, gz + rnd.uniform(-0.4, 0.4))]
    vine_curve(pts, 0.03, 7, 100 + k)
for k in range(4):
    x = -1.5 - k * 1.4
    edge = G(x, 0.55 - k * 0.1, 1.85)
    pts = [edge, edge + G(0.05, -0.2, -0.05), edge + G(-0.03, -0.42, -0.02)]
    vine_curve(pts, 0.015, 2, 200 + k)

body = P.build(coll, root)
isolate(coll)
print('ok', len(body.data.polygons))
