# Bramble Bow Tower: a lashed log watchtower with a swivelling heavy crossbow.
# Forward is -Y in Blender (= +Z in glTF / three.js, so Object3D.lookAt aims it).
# Animated nodes: "Turret" (yaw, pivot on the platform), "Aim" (pitch, child of Turret),
# "Bolt" (the loaded bolt, hidden while reloading).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('BowTower')
root = root_empty('BowTower', coll)
rnd = random.Random(21)

wood = get_mat('Wood', 0.85)
bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.92)
rope = get_mat('Rope', 0.95)
metal = get_mat('IronDark', 0.55, 0.7)
leafm = get_mat('LeafDS', 0.7, double=True)
plant = get_mat('Plant', 0.8)
cloth = get_mat('ClothDS', 0.95, double=True)
moss = get_mat('Moss', 1.0)

LOG = '#6a4c33'
CUT = '#c49a68'
PLANK = '#7d5b3c'
ROPE = '#b39563'

def log(P, a, b, r, seed, color=LOG, ends=True):
    m, ln = look_m(a, b, rnd.uniform(0, TAU))
    P.add(ringed_cyl(r, r * 0.9, ln, 9, 5), bark, color, m, deform=gnarl(0.025, 2.5, 0.2, (0, 0), ln, seed), smooth=True, streak=0.35)
    if ends:
        # pale cut faces with a darker ring
        P.add(cyl(r * 0.86, r * 0.86, 0.012, 9), wood, CUT, m @ M((0, 0, ln - 0.004)))
        P.add(torus(r * 0.45, 0.008, 9, 3), wood, '#9c7448', m @ M((0, 0, ln + 0.009)))
    return m, ln

B = Part('Body', 3)
H = 2.55          # platform deck height
S = 0.78          # half-size of the leg square at the deck
F = 1.12          # half-size at the feet

# stone cairns the legs stand in
for sx in (-1, 1):
    for sy in (-1, 1):
        c = Vector((sx * F, sy * F, 0))
        for k in range(6):
            a = k / 6 * TAU + rnd.uniform(-0.3, 0.3)
            p = c + Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, rnd.uniform(0.02, 0.08)))
            B.add(ico(rnd.uniform(0.11, 0.17), 2), stone, rnd.choice(['#6e6a60', '#5e5a52', '#66625a']), smooth=True, m=M(p, (rnd.random(), rnd.random(), rnd.random()), (1, 1, 0.7)), deform=jitter(0.025, k + sx * 10 + sy * 20))
        B.add(ico(0.16, 1), moss, '#4f7a2a', M(c + Vector((0.12 * sx, 0.1 * sy, 0.12)), (0, 0, 0), (1.2, 1.2, 0.35)), deform=jitter(0.04, 50 + sx + sy * 3))

# legs (slightly splayed), running a little above the deck as rail posts
legs = []
for sx in (-1, 1):
    for sy in (-1, 1):
        a = Vector((sx * F, sy * F, -0.1))
        b = Vector((sx * (S - 0.04), sy * (S - 0.04), H + 0.95))
        log(B, a, b, 0.11, int(10 + sx * 3 + sy * 7))
        legs.append((a, b))

def leg_at(i, z):
    a, b = legs[i]
    t = (z - a.z) / (b.z - a.z)
    return a.lerp(b, t)

# X braces on each side, lashed where they cross the legs
sides = [(0, 1), (2, 3), (0, 2), (1, 3)]
for si, (i, j) in enumerate(sides):
    for (z1, z2) in [(0.35, 1.55), (1.55, 0.35), (1.55, 2.45), (2.45, 1.55)]:
        p1, p2 = leg_at(i, z1), leg_at(j, z2)
        inset = (p1 + p2) / 2
        n = Vector((inset.x, inset.y, 0)).normalized() * 0.1  # sit on the outside of the legs
        log(B, p1 + n, p2 + n, 0.055, 100 + si * 7 + int(z1 * 10), '#735238', ends=False)
    for z in (0.35, 1.55, 2.45):
        for k in (i, j):
            p = leg_at(k, z)
            lash(B, rope, M(p, (0, 0, 0)), r=0.125, turns=3, color=ROPE, pitch=0.035)

# deck: support beams + planks with nail heads and gaps
for sy in (-1, 1):
    log(B, Vector((-S - 0.2, sy * (S - 0.08), H - 0.08)), Vector((S + 0.2, sy * (S - 0.08), H - 0.08)), 0.075, 200 + sy, ends=True)
n_pl = 8
for i in range(n_pl):
    x = -S - 0.12 + (i + 0.5) * (2 * S + 0.24) / n_pl
    w = (2 * S + 0.24) / n_pl * 0.92
    L = 2 * S + 0.3 + rnd.uniform(-0.06, 0.06)
    m = M((x, rnd.uniform(-0.03, 0.03), H), (rnd.uniform(-0.015, 0.015), 0, rnd.uniform(-0.03, 0.03)))
    B.add(box(w, L, 0.06), wood, rnd.choice([PLANK, '#7d5c3c', '#957050']), m, deform=jitter(0.006, 300 + i, 6), streak=0.25)
    for sy in (-1, 1):
        B.add(cyl(0.012, 0.012, 0.012, 6), metal, '#3a3632', m @ M((0, sy * (S - 0.08), 0.06)))
# a few broken/short boards poking out
B.add(box(0.16, 0.5, 0.05), wood, '#7a5a3b', M((S + 0.28, 0.35, H + 0.01), (0, 0.06, 0.4)), deform=jitter(0.008, 330, 6), streak=0.25)

# railing: rails between the leg tops, lashed
for (i, j) in sides:
    for z in (H + 0.45, H + 0.85):
        p1, p2 = leg_at(i, z), leg_at(j, z)
        log(B, p1, p2, 0.042, 400 + i * 4 + j + int(z * 10), '#75553a', ends=False)
        lash(B, rope, M(p1), r=0.12, turns=2, color=ROPE)
        lash(B, rope, M(p2), r=0.12, turns=2, color=ROPE)
# sharpened stakes along two rails
for sy in (-1, 1):
    for k in range(5):
        x = -S + 0.2 + k * (2 * S - 0.4) / 4
        B.add(stake(0.035, 0.75 + rnd.uniform(-0.08, 0.1), 6), bark, '#6f5036', M((x, sy * (S - 0.02), H + 0.1), (sy * 0.18, rnd.uniform(-0.06, 0.06), 0)), smooth=False, streak=0.2)

# ladder on the back (+Y side)
for sx in (-1, 1):
    log(B, Vector((sx * 0.24, S + 0.75, 0)), Vector((sx * 0.24, S + 0.05, H + 0.35)), 0.04, 500 + sx, '#7a583a', ends=True)
for k in range(8):
    z = 0.3 + k * 0.3
    t = z / (H + 0.35)
    y = S + 0.75 - t * 0.7
    B.add(cyl(0.028, 0.028, 0.56, 6), wood, '#8c6b48', M((-0.28, y, z), (0, math.pi / 2, 0)), streak=0.2)

# thorny bramble vine wound around one leg and along a rail
a, b = legs[0]
for k in range(14):
    t = k / 13
    p = a.lerp(b, t * 0.75)
    ang = t * 9
    q = p + Vector((math.cos(ang) * 0.13, math.sin(ang) * 0.13, 0))
    p2 = a.lerp(b, (k + 1) / 13 * 0.75) + Vector((math.cos(ang + 0.7) * 0.13, math.sin(ang + 0.7) * 0.13, 0))
    m, ln = look_m(q, p2)
    B.add(cyl(0.018, 0.016, ln * 1.1, 5), plant, '#42612a', m)
    B.add(cone(0.014, 0.06, 4), plant, '#8a6a3a', M(q, (rnd.uniform(-1.4, 1.4), rnd.uniform(-1.4, 1.4), 0)))
    if k % 2 == 0:
        lm = Matrix.Translation(q) @ Euler((rnd.uniform(0.8, 2.2), 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
        B.add(leaf(0.14, 0.07, 0.25, 0.15, 4), leafm, rnd.choice(['#467f2c', '#55902f']), lm, var=0.12)

# pennant on the front-left post
pole_base = leg_at(0, H + 0.9)
B.add(cyl(0.022, 0.018, 1.0, 6), wood, '#80603f', M(pole_base))
def flag(bm):
    rows = []
    for j in range(6):
        t = j / 5
        x = t * 0.55
        h = 0.32 * (1 - t * 0.7)
        y = math.sin(t * 3.2) * 0.05
        rows.append((bm.verts.new((x, y, 0)), bm.verts.new((x, y, -h))))
    for j in range(5):
        bm.faces.new((rows[j][0], rows[j + 1][0], rows[j + 1][1], rows[j][1]))
B.add(flag, cloth, '#3f6e3a', M(pole_base + Vector((0.02, 0, 0.98)), (0, 0, 2.4)), var=0.08)

body = B.build(coll, root)

# ---------------------------------------------------------------- turret
T = Part('Turret', 9)
# swivel: a log round on the deck + an upright post with a forked yoke
T.add(cyl(0.34, 0.32, 0.14, 14), wood, CUT, M((0, 0, 0)), streak=0.2)
for k in range(3):
    T.add(torus(0.12 + k * 0.08, 0.006, 14, 3), wood, '#9c7448', M((0, 0, 0.142)))
T.add(cyl(0.34, 0.34, 0.06, 14), bark, LOG, M((0, 0, -0.05)))
T.add(ringed_cyl(0.1, 0.085, 0.95, 8, 4), bark, LOG, M((0, 0, 0.12)), smooth=True, streak=0.3)
for sx in (-1, 1):
    T.add(box(0.06, 0.16, 0.34), wood, '#7d5c3c', M((sx * 0.13, 0, 1.0)), streak=0.2)
    T.add(cyl(0.035, 0.035, 0.08, 8), metal, '#3a3632', M((sx * 0.17, 0, 1.18), (0, math.pi / 2, 0)))
# quiver of spare bolts strapped to the post
T.add(cyl(0.075, 0.085, 0.42, 10), get_mat('Leather', 0.75), '#8a5a36', M((0.13, 0.12, 0.15), (0.12, -0.1, 0)), smooth=True)
for k in range(5):
    a = k / 5 * TAU
    p = Vector((0.13 + math.cos(a) * 0.035, 0.12 + math.sin(a) * 0.035, 0.5))
    T.add(cyl(0.008, 0.008, 0.18, 4), wood, '#b08a5a', M(p, (0.12, -0.1, 0)))
    T.add(leaf(0.06, 0.03, 0.0, 0.0, 2), leafm, '#e8e2d2', M(p + Vector((0, 0, 0.14)), (0.12, -0.1, a)))
turret = T.build(coll, root, (0, 0, H + 0.06))

# ---------------------------------------------------------------- crossbow (pitch node)
A = Part('Aim', 13)
# stock: tapering beam along -Y with a raised rail
def stock(bm):
    prof = [(-0.05, 0), (0.05, 0), (0.045, 0.07), (-0.045, 0.07)]
    rows = []
    for j, (y, k) in enumerate([(0.42, 0.85), (0.1, 1.0), (-0.35, 1.0), (-0.7, 0.75)]):
        rows.append([bm.verts.new((x * k, y, z * k)) for x, z in prof])
    for j in range(3):
        for i in range(4):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % 4], rows[j + 1][(i + 1) % 4], rows[j + 1][i]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
A.add(stock, wood, '#7a5534', M((0, 0, -0.035)), streak=0.25)
A.add(box(0.02, 0.95, 0.012), metal, '#2f2b28', M((0, -0.15, 0.035)))  # bolt groove rail
# iron bands
for y in (-0.6, -0.2, 0.25):
    A.add(box(0.115, 0.03, 0.09), metal, '#3b3530', M((0, y, -0.04)))
# trigger + stirrup
A.add(box(0.015, 0.05, 0.1), metal, '#3b3530', M((0, 0.22, -0.12)))
A.add(torus(0.08, 0.012, 16, 4), metal, '#3b3530', M((0, -0.78, 0), (0, math.pi / 2, 0)))
# bow limbs: bent saplings, recurved toward the shooter
LIMB = 0.62
for sx in (-1, 1):
    m, ln = look_m((sx * 0.04, -0.62, 0.0), (sx * 0.66, -0.47, 0.0), 0)
    def ld(co, ln=ln, sx=sx):
        t = co.z / ln
        return Vector((co.x, co.y + 0.12 * t * t, co.z))  # local +y bends tips backwards
    A.add(ringed_cyl(0.035, 0.016, ln, 7, 6), wood, '#6d4a2c', m, deform=ld, smooth=True, streak=0.2)
    tip = axis_point(m, ld, ln)
    # string from limb tip to the nut
    sm, sl = look_m(tip, (0, 0.05, 0.03))
    A.add(cyl(0.006, 0.006, sl, 4), rope, '#d8c9a0', sm)
    A.add(torus(0.04, 0.01, 8, 3), rope, ROPE, M(axis_point(m, ld, ln * 0.12), (0, math.pi / 2, 0)))
# bow centre wrapped in rope
for k in range(4):
    A.add(torus(0.06, 0.012, 10, 4), rope, ROPE, M((0, -0.62 + (k - 1.5) * 0.025, 0), (math.pi / 2, 0, 0)))
aim = A.build(coll, turret, (0, 0, 1.18))
aim.scale = (1.55, 1.55, 1.55)

# loaded bolt: shaft, flint head, feather fletching
BL = Part('Bolt', 17)
BL.add(cyl(0.011, 0.011, 0.72, 6), wood, '#c19a68', M((0, 0.32, 0.055), (math.pi / 2, 0, 0)))
BL.add(cyl(0.03, 0.0, 0.11, 4), stone, '#3c3a3c', M((0, -0.4, 0.055), (math.pi / 2, 0, 0)), deform=jitter(0.004, 7, 20))
for k in range(3):
    a = k / 3 * TAU
    BL.add(leaf(0.12, 0.05, 0.0, 0.0, 2), leafm, '#d9d0bc' if k else '#a8302a', M((0, 0.3, 0.055), (math.pi / 2, a, 0)) @ M((0, 0, 0), (0, 0, 0)))
bolt = BL.build(coll, aim, (0, 0, 0))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
