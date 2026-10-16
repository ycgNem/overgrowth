# The Coffer: the camp's stash, a heavy plank chest the Heartwood's roots have grown over and
# claimed. Iron bands, a curved lid on a back hinge (the "Lid" part opens in the game), roots
# that run over the lid and down into the ground, moss in the joints and a pale rune burning
# on the lock plate. About 1.2 m long. Origin on the ground at the centre; the front faces -y
# (three +z).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Coffer')
root = root_empty('Coffer', coll)
rnd = random.Random(53)

wood = get_mat('Crate', 0.85)
iron = get_mat('Iron', 0.55, 0.6)
bark = get_mat('Bark', 0.9)
moss = get_mat('Moss', 0.95)
rune = get_mat('RuneGlow', 0.4, 0.0, emit=(0.45, 1.0, 0.65), strength=2.2)

L, D, H = 1.1, 0.62, 0.48  # body length, depth, height
T = 0.04
B = Part('Body', 5)
cols = ['#7a5a36', '#6e5030', '#84623c', '#6a4c2e']
# planked walls: four boards a side, slightly warped
for side in (-1, 1):
    for i in range(4):
        z = 0.06 + (H - 0.06) / 4 * (i + 0.5)
        B.add(box(L, T, (H - 0.06) / 4 - 0.008, base=False, cuts=1), wood, rnd.choice(cols), M((0, side * (D / 2 - T / 2), z)),
              deform=jitter(0.004, rnd.randint(0, 99), 8), var=0.18, streak=0.4)
    for i in range(4):
        z = 0.06 + (H - 0.06) / 4 * (i + 0.5)
        B.add(box(T, D - 2 * T, (H - 0.06) / 4 - 0.008, base=False, cuts=1), wood, rnd.choice(cols), M((side * (L / 2 - T / 2), 0, z)),
              deform=jitter(0.004, rnd.randint(0, 99), 8), var=0.18, streak=0.4)
# the plinth it sits on, and the floor
B.add(box(L + 0.06, D + 0.06, 0.07, chamfer=0.01), wood, '#4e3822', M((0, 0, 0)), var=0.15, ao=0.4, ao_h=0.07)
# iron bands round the body and corner straps
for x in (-L * 0.32, L * 0.32):
    for side in (-1, 1):
        B.add(box(0.06, 0.008, H - 0.04, base=False), iron, '#2e2a26', M((x, side * (D / 2 + 0.004), H / 2 + 0.02)), var=0.15, streak=0.6)
    for side in (-1, 1):
        pass
for sx in (-1, 1):
    for sy in (-1, 1):
        B.add(box(0.07, 0.07, H - 0.02, base=False), iron, '#36302b', M((sx * (L / 2 - 0.02), sy * (D / 2 - 0.02), H / 2 + 0.01)), var=0.15)
# the lock plate and its rune, on the front
B.add(box(0.16, 0.012, 0.18, base=False, chamfer=0.006), iron, '#4a4038', M((0, -D / 2 - 0.008, H - 0.12)), var=0.2)
G = Part('Rune', 7)
for a, l in ((0.0, 0.11), (0.9, 0.06), (-0.9, 0.06)):
    G.add(box(0.012, 0.004, l, base=False), rune, '#9affc0', M((math.sin(a) * 0.02, -D / 2 - 0.016, H - 0.12 + math.cos(a) * 0.015), (0, a, 0)))
G.build(coll, root)

def root_path(pts, r0, r1, seed, P=B, col='#4a3a28'):
    """A root along a Catmull-Rom curve through pts, tapering r0 -> r1, in short overlapping
    pieces so the joints don't gap."""
    ext = [pts[0] * 2 - pts[1]] + list(pts) + [pts[-1] * 2 - pts[-2]]
    sm = []
    for j in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[j - 1], ext[j], ext[j + 1], ext[j + 2]
        for k in range(3):
            t = k / 3
            sm.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    sm.append(pts[-1])
    n = len(sm) - 1
    for j in range(n):
        ra = r0 + (r1 - r0) * (j / n)
        mm, ll = look_m(sm[j], sm[j + 1])
        P.add(ringed_cyl(ra, ra * 0.95, ll + ra * 0.6, 5, 1), bark, col, mm @ M((0, 0, -ra * 0.3)), var=0.18)

# the lid: a shallow barrel vault of boards, hinged along the back top edge
P = Part('Lid', 9)
R = D / 2 + 0.02
n = 7
for i in range(n):
    a0 = math.pi * (i / n)
    a1 = math.pi * ((i + 1) / n)
    am = (a0 + a1) / 2
    w = 2 * R * math.sin((a1 - a0) / 2) - 0.006
    # board centre on the arc, relative to the hinge at (0, +D/2, 0)
    cy, cz = -D / 2 - R * math.cos(am), R * math.sin(am) * 0.55
    P.add(box(L + 0.02, w, T, base=False, cuts=1), wood, rnd.choice(cols), M((0, cy, cz), (math.pi / 2 - am, 0, 0)),
          deform=jitter(0.004, rnd.randint(0, 99), 8), var=0.18, streak=0.4)
for x in (-L * 0.32, L * 0.32):
    for i in range(n):
        am = math.pi * ((i + 0.5) / n)
        cy, cz = -D / 2 - R * math.cos(am), R * math.sin(am) * 0.55 + 0.022
        P.add(box(0.06, 2 * R * math.sin(math.pi / n / 2) + 0.004, 0.008, base=False), iron, '#2e2a26', M((x, cy, cz), (math.pi / 2 - am, 0, 0)), var=0.15)
def half_disc(r, sz, t, seg=10):
    def b(bm):
        top, bot = [], []
        for i in range(seg + 1):
            a = math.pi * i / seg
            y, z = -r * math.cos(a), r * math.sin(a) * sz
            top.append(bm.verts.new((t / 2, y, z)))
            bot.append(bm.verts.new((-t / 2, y, z)))
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        for i in range(seg):
            bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
        bm.faces.new((top[0], top[-1], bot[-1], bot[0]))
    return b
for side in (-1, 1):
    P.add(half_disc(R - 0.01, 0.55, T), wood, '#6a4c2e', M((side * (L / 2 - 0.01), -D / 2, 0)), var=0.15, streak=0.3)
# a hasp hanging down over the lock
P.add(box(0.06, 0.01, 0.1, base=False), iron, '#3a342e', M((0, -D - 0.02, -0.02)), var=0.15)
for k, x in enumerate((-0.3, 0.12)):
    pts = []
    for i in range(7):
        am = math.pi * (1 - i / 6)
        pts.append(Vector((x + 0.05 * math.sin(i * 1.3 + k), -D / 2 - (R + 0.03) * math.cos(am), (R + 0.03) * math.sin(am) * 0.55 + 0.03)))
    root_path(pts, 0.035, 0.018, 20 + k, P=P)
P.build(coll, root, loc=(0, D / 2, H))

# roots: they come in from behind along the ground, climb the back and wrap round the ends
# (on the body, so the lid still lifts); a thin one creeps over the lid itself
for side in (-1, 1):
    ex = side * (L / 2 + 0.035)
    root_path([Vector((side * 0.3, D / 2 + 0.75, -0.04)), Vector((side * 0.45, D / 2 + 0.3, 0.0)), Vector((ex, D / 2 - 0.02, 0.16)),
               Vector((ex + side * 0.01, 0.05, 0.34)), Vector((ex, -D / 2 + 0.12, 0.22)), Vector((ex + side * 0.12, -D / 2 - 0.12, -0.03))],
              0.06, 0.03, 3 + side)
for k, x in enumerate((-0.28, 0.22)):
    root_path([Vector((x + 0.25 * (k - 0.5), D / 2 + 0.95, -0.05)), Vector((x + 0.05, D / 2 + 0.4, 0.02)), Vector((x, D / 2 + 0.05, 0.18)),
               Vector((x - 0.04, D / 2 + 0.04, H - 0.04))], 0.08, 0.035, 7 + k, col='#3e3122')

# moss in the joints and on the plinth
for k in range(9):
    x = rnd.uniform(-L / 2, L / 2)
    side = rnd.choice((-1, 1))
    B.add(ico(rnd.uniform(0.05, 0.09), 1), moss, rnd.choice(['#5a7a2a', '#4e6e24', '#68862f']),
          M((x, side * (D / 2 + 0.02), rnd.uniform(0.02, 0.12)), (0, 0, 0), (1.4, 0.6, 0.5)), deform=jitter(0.01, k, 12), var=0.2)
for k in range(4):
    B.add(ico(rnd.uniform(0.06, 0.1), 1), moss, '#5a7a2a', M((rnd.uniform(-0.4, 0.4), D / 2 + 0.1, H - 0.02), (0, 0, 0), (1.5, 0.8, 0.45)), deform=jitter(0.01, k + 20, 12), var=0.2)

body = B.build(coll, root)
isolate(coll)
print('ok', len(body.data.polygons))
