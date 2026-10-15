# The explorers' tent: a canvas A-frame on a ridge pole, sagging between its poles, pegged
# and guyed, one door flap tied back on a dark inside with a bedroll. 2.3 m wide, 2.8 m long
# (along Y), 1.75 m to the ridge. Origin on the ground at the centre.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Tent')
root = root_empty('Tent', coll)
rnd = random.Random(23)

cloth = get_mat('Cloth', 0.95, double=True)
pole = get_mat('Wood', 0.85)
rope = get_mat('Rope', 0.95)
dark = get_mat('Cloth', 0.95, double=True)
wool = get_mat('ClothWool', 1.0)
iron = get_mat('Iron', 0.5, 0.6)

W, L, H = 2.3, 2.8, 1.75
HEM = 0.06
C = Part('Body', 5)


def sheet(fn, nu, nv):
    """A grid of quads from fn(u, v) -> Vector, u and v in 0..1."""
    def b(bm):
        rows = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    return b


wr = noise.noise  # wrinkles


def slope(side):
    """One side of the canvas: u from the ridge down to the hem, v along the length."""
    def f(u, v):
        y = -L / 2 + v * L
        x = side * (W / 2) * u
        z = H - (H - HEM) * u
        # sags in between the ridge and the hem, more in the middle of the length
        sag = 0.075 * math.sin(math.pi * u) * (0.55 + 0.45 * math.sin(math.pi * v))
        # and wrinkles running down the cloth from the ridge
        wk = 0.018 * wr(Vector((v * 9, u * 2, side * 3))) * math.sin(math.pi * u)
        n = Vector((side * H, 0, (W / 2))).normalized()
        p = Vector((x, y, z)) - n * (sag + wk)
        # the hem lifts a little between the pegs
        if u > 0.97:
            p.z += 0.03 * abs(math.sin(v * math.pi * 3))
        return p
    return f


for side in (-1, 1):
    C.add(sheet(slope(side), 7, 14), cloth, '#9b8b5e', var=0.1, ao=0.35, ao_h=1.0, streak=0.25)

# the back wall: a triangle panel, bellied out a little
def back(u, v):
    # u across (-1..1), v up (0..1): a triangle squashed from a square
    x = (u * 2 - 1) * (W / 2) * (1 - v)
    z = HEM + (H - HEM) * v
    belly = 0.06 * math.sin(math.pi * v) * math.cos((u * 2 - 1) * math.pi / 2)
    return Vector((x, L / 2 + belly, z))
C.add(sheet(back, 6, 6), cloth, '#958556', var=0.1, ao=0.35, ao_h=1.0)

# the door: the left flap hangs closed, the right is rolled and tied back
def flap(u, v):
    x = -(W / 2) * (1 - v) * (1 - u * 0.95)
    z = HEM + (H - HEM) * v
    return Vector((x, -L / 2 - 0.02 - 0.05 * math.sin(math.pi * u) * (1 - v), z))
C.add(sheet(flap, 5, 6), cloth, '#9b8b5e', var=0.12, ao=0.35, ao_h=1.0)
# the rolled flap: a sausage of canvas down the right edge, tied in two places
p0 = Vector((W / 2 - 0.08, -L / 2 - 0.05, HEM + 0.05))
p1 = Vector((0.12, -L / 2 - 0.05, H - 0.14))
mm, ll = look_m(p0, p1)
C.add(ringed_cyl(0.055, 0.04, ll, 8, 6), cloth, '#7a6c44', mm, deform=gnarl(0.05, 4, 1.5, (0, 0), ll, 4), smooth=True, var=0.15)
for t in (0.3, 0.7):
    q = p0.lerp(p1, t)
    C.add(torus(0.075, 0.012, 10, 4), rope, '#b39563', look_m(q, q + (p1 - p0).normalized())[0])

# the dark inside: a ground sheet, a rolled bedroll, a pack
C.add(box(W * 0.85, L * 0.92, 0.02, base=True), dark, '#2c2a20', M((0, 0.05, 0.0)), var=0.1)
# (lying along the tent by the right wall, foot toward the door)
C.add(ringed_cyl(0.15, 0.15, 0.85, 10, 2), wool, '#6a3a2a', M((0.42, 1.0, 0.16), (math.pi / 2, 0, 0.08)), smooth=True, var=0.15, streak=0.4)
for y in (0.85, 0.3):
    C.add(torus(0.155, 0.012, 12, 4), rope, '#a08a5a', M((0.42 + (1.0 - y) * 0.08, y, 0.16), (math.pi / 2, 0, 0.08)))
C.add(box(0.38, 0.28, 0.5, chamfer=0.04), get_mat('ClothPack', 0.95), '#4a5233', M((-0.55, 0.85, 0.02), (0, 0, 0.3)), smooth=True, var=0.15)

# poles: two uprights and the ridge
for y in (-1, 1):
    yy = y * (L / 2 + 0.03)
    C.add(cyl(0.035, 0.03, H + 0.06, 7), pole, '#6e5638', M((0, yy, 0)), streak=0.3)
mm, ll = look_m((0, -L / 2 - 0.18, H + 0.01), (0, L / 2 + 0.18, H + 0.01))
C.add(cyl(0.032, 0.032, ll, 7), pole, '#73593a', mm, streak=0.3)
lash(C, rope, M((0, -L / 2 - 0.03, H - 0.02), (math.pi / 2, 0, 0)), r=0.05, turns=2)
lash(C, rope, M((0, L / 2 + 0.03, H - 0.02), (math.pi / 2, 0, 0)), r=0.05, turns=2)


def peg(p, toward):
    """A wooden peg at p, leaning away from the tent."""
    d = (Vector(p) - Vector(toward)).normalized()
    top = Vector(p) + Vector((0, 0, 0.2)) - d * 0.06
    mm, ll = look_m(Vector(p) - Vector((0, 0, 0.05)), top)
    C.add(stake(0.018, ll, 5), pole, '#8a6d45', mm)
    return top


def rope_line(a, b, sag=0.03):
    pts = [Vector(a).lerp(Vector(b), t) - Vector((0, 0, sag * math.sin(math.pi * t))) for t in (0, 0.33, 0.66, 1)]
    for j in range(3):
        mm, ll = look_m(pts[j], pts[j + 1])
        C.add(cyl(0.007, 0.007, ll, 4), rope, '#b8a274', mm)


# guy lines from the ridge ends, and pegs along the hems
for y in (-1, 1):
    a = Vector((0, y * (L / 2 + 0.16), H + 0.02))
    for sx in (-0.5, 0.5):
        pp = Vector((sx * 0.9, y * (L / 2 + 1.05), 0.0))
        t = peg(pp, (0, 0, 0))
        rope_line(a, t)
for side in (-1, 1):
    for v in (0.0, 0.5, 1.0):
        y = -L / 2 + v * L
        hem = Vector((side * W / 2, y, HEM + 0.02))
        pp = hem + Vector((side * 0.35, 0, -HEM))
        t = peg(pp, (0, y, 0))
        rope_line(hem, t, 0.01)

# a tin mug and a coil of rope by the door
C.add(cyl(0.04, 0.04, 0.09, 10), iron, '#5a6a5a', M((0.75, -L / 2 - 0.45, 0)), var=0.15, streak=0.4)
C.add(torus(0.025, 0.006, 8, 4), iron, '#5a6a5a', M((0.79, -L / 2 - 0.45, 0.05), (math.pi / 2, 0, 0)))
for k in range(4):
    C.add(torus(0.13 - k * 0.012, 0.012, 14, 4), rope, '#b39563', M((-0.85, -L / 2 - 0.55, 0.012 + k * 0.022)))

body = C.build(coll, root)
isolate(coll)
print('ok', len(body.data.polygons))
