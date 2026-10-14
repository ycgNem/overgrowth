# Ember Brazier: a fire tower. A fired-clay bowl banded with salvaged iron, standing on three
# lashed log legs over a ring of hearth stones, heaped with glowing coals. It burns the
# Blight that comes near and lights the clearing at night.
# Animated nodes: "Flame" (pivot on the coals: flicker), "Coals" (glow pulse).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('EmberBrazier')
root = root_empty('EmberBrazier', coll)
rnd = random.Random(55)

wood = get_mat('Wood', 0.85)
bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.92)
clay = get_mat('Clay', 0.8)
iron = get_mat('IronDark', 0.55, 0.7)
rope = get_mat('Rope', 0.95)
moss = get_mat('Moss', 1.0)
char = get_mat('Char', 0.95)
ember = get_mat('Ember', 0.5, emit=(1.0, 0.38, 0.08), strength=4.0)
flame_hot = get_mat('FlameHot', 0.5, emit=(1.0, 0.75, 0.3), strength=6.0)
flame = get_mat('Flame', 0.5, emit=(1.0, 0.42, 0.1), strength=5.0)

BOWL_Z = 1.15

B = Part('Body', 3)
# hearth: a ring of blackened stones on a mossy mound
for i in range(11):
    a = i / 11 * TAU + rnd.uniform(-0.15, 0.15)
    r = rnd.uniform(0.62, 0.78)
    B.add(ico(rnd.uniform(0.13, 0.2), 1), stone, rnd.choice(['#6f6a60', '#7d776b', '#5e5850']), M((math.cos(a) * r, math.sin(a) * r, 0.05), (rnd.random(), rnd.random(), 0), (1, 1, 0.6)), deform=jitter(0.025, i), ao=0.4, ao_h=0.2)
B.add(sphere(0.7, 14, 6), moss, '#46652a', M((0, 0, -0.2), (0, 0, 0), (1, 1, 0.35)), deform=jitter(0.04, 3), var=0.2)
# ash and spilled embers on the hearth
B.add(cyl(0.48, 0.44, 0.04, 14), char, '#3a342e', M((0, 0, 0.02)), deform=jitter(0.02, 5, 6), var=0.25)
for k in range(9):
    a = rnd.uniform(0, TAU); r = rnd.uniform(0.05, 0.4)
    B.add(ico(rnd.uniform(0.025, 0.045), 1), ember, (1, 1, 1), M((math.cos(a) * r, math.sin(a) * r, 0.05)))
# three log legs, splayed, lashed where they cross under the bowl
legs_top = []
for i in range(3):
    a = i / 3 * TAU + 0.5
    foot = Vector((math.cos(a) * 0.62, math.sin(a) * 0.62, 0.0))
    top = Vector((math.cos(a + math.pi) * 0.12, math.sin(a + math.pi) * 0.12, BOWL_Z + 0.15))
    mm, ll = look_m(foot, top)
    B.add(ringed_cyl(0.075, 0.06, ll, 8, 4), bark, '#6a4c36', mm, deform=gnarl(0.03, 4, 0.3, (0, 0), ll, i), smooth=True, streak=0.4, ao=0.35, ao_h=0.5)
    legs_top.append(top)
    # stub branch
    p = foot.lerp(top, 0.35)
    mm2, ll2 = look_m(p, p + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.15)))
    B.add(cone(0.03, ll2, 5), bark, '#5e4432', mm2)
lash(B, rope, M((0, 0, BOWL_Z - 0.22)), r=0.13, turns=4, pitch=0.035)
# the bowl: thick fired clay, flared lip, charred inside
def bowl(bm):
    rows = []
    prof = [(0.12, 0.0), (0.34, 0.06), (0.5, 0.2), (0.6, 0.38), (0.64, 0.44), (0.58, 0.44), (0.52, 0.36), (0.42, 0.22), (0.0, 0.18)]
    seg = 18
    for r, z in prof:
        rows.append([bm.verts.new((math.cos(i / seg * TAU) * r, math.sin(i / seg * TAU) * r, z)) for i in range(seg)])
    for j in range(len(rows) - 1):
        for i in range(seg):
            a, c = rows[j][i], rows[j][(i + 1) % seg]
            d, e = rows[j + 1][(i + 1) % seg], rows[j + 1][i]
            bm.faces.new((a, c, d, e))
    bm.faces.new(list(reversed(rows[0])))
B.add(bowl, clay, '#9a6a4a', M((0, 0, BOWL_Z - 0.2)), deform=jitter(0.012, 9, 6), smooth=True, streak=0.35)
# soot darkening the upper rim inside: a thin dark ring just inside the lip
B.add(torus(0.55, 0.035, 18, 5), char, '#3c2c24', M((0, 0, BOWL_Z + 0.2)), var=0.2)
# iron band with rivets around the belly
B.add(torus(0.6, 0.03, 20, 4), iron, '#4a4038', M((0, 0, BOWL_Z + 0.08), (0, 0, 0), (1, 1, 1.6)))
for i in range(10):
    a = i / 10 * TAU
    B.add(sphere(0.02, 5, 3), iron, '#6a5a48', M((math.cos(a) * 0.63, math.sin(a) * 0.63, BOWL_Z + 0.08)))
# painted marks on the clay (white zig-zags)
for i in range(6):
    a = i / 6 * TAU + 0.26
    B.add(box(0.03, 0.12, 0.012), clay, '#e6dcc4', M((math.cos(a) * 0.52, math.sin(a) * 0.52, BOWL_Z - 0.05), (0.6, 0, a + math.pi / 2)))
# glowcap charms hanging from the lip on cords
for i in range(3):
    a = i / 3 * TAU + 1.0
    p = Vector((math.cos(a) * 0.62, math.sin(a) * 0.62, BOWL_Z + 0.22))
    mm, ll = look_m(p, p + Vector((0, 0, -0.28)))
    B.add(cyl(0.006, 0.006, ll, 3), rope, '#a8895a', mm)
    B.add(sphere(0.04, 6, 4), bark, '#6a4c36', M(p + Vector((0, 0, -0.3)), (0, 0, 0), (1, 1, 1.3)))
body = B.build(coll, root)

# ---------------------------------------------------------------- coals (pulse)
C = Part('Coals', 4)
for k in range(26):
    a = rnd.uniform(0, TAU); r = rnd.uniform(0, 0.46) ** 0.8 * 0.95
    z = 0.3 - r * 0.25 + rnd.uniform(0, 0.05)
    hot = rnd.random() < 0.55
    C.add(ico(rnd.uniform(0.05, 0.09), 1), ember if hot else char, (1, 1, 1) if hot else '#2c2622', M((math.cos(a) * r, math.sin(a) * r, z), (rnd.random(), rnd.random(), 0), (1, 1, 0.7)), deform=jitter(0.015, k, 12))
# a few half-burnt sticks poking out
for k in range(4):
    a = k / 4 * TAU + 0.3
    p = Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.28))
    mm, ll = look_m(p, p + Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, 0.22)))
    C.add(cyl(0.03, 0.022, ll, 5), char, '#2a2420', mm)
    C.add(sphere(0.026, 5, 3), ember, (1, 1, 1), M(p + Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, 0.22))))
coals = C.build(coll, root, (0, 0, BOWL_Z - 0.2))

# ---------------------------------------------------------------- flame (flickers)
F = Part('Flame', 5)
def tongue(bm):
    rows = []
    seg = 7
    for j in range(7):
        t = j / 6
        r = math.sin(math.pi * min(1, t * 1.15 + 0.12)) ** 0.9 * (1 - t) ** 0.4
        row = [bm.verts.new((math.cos(i / seg * TAU) * r, math.sin(i / seg * TAU) * r, t)) for i in range(seg)]
        rows.append(row)
    for j in range(len(rows) - 1):
        for i in range(seg):
            a, c = rows[j][i], rows[j][(i + 1) % seg]
            d, e = rows[j + 1][(i + 1) % seg], rows[j + 1][i]
            bm.faces.new((a, c, d, e))
for k in range(7):
    a = k / 7 * TAU + rnd.uniform(-0.2, 0.2)
    r = 0.0 if k == 0 else rnd.uniform(0.12, 0.26)
    h = 0.9 if k == 0 else rnd.uniform(0.45, 0.7)
    w = 0.2 if k == 0 else rnd.uniform(0.09, 0.14)
    tw = rnd.uniform(-0.5, 0.5)
    F.add(tongue, flame, (1, 1, 1), M((math.cos(a) * r, math.sin(a) * r, 0), (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0), (w, w, h)),
          deform=lambda co, tw=tw: Vector((co.x + math.sin(co.z * 4 + tw) * 0.15 * co.z, co.y + math.cos(co.z * 3 + tw) * 0.1 * co.z, co.z)))
    F.add(tongue, flame_hot, (1, 1, 1), M((math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, 0), (0, 0, 0), (w * 0.55, w * 0.55, h * 0.6)))
flame_o = F.build(coll, root, (0, 0, BOWL_Z + 0.1))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
