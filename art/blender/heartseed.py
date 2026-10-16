# The Heartseed sapling: a cutting of the Heartwood planted in a ring of river stones, its
# trunk twisted round a knot of warm green light, its roots reaching out over the ground (they
# push the Rot back). About 1.8 m tall. Origin on the ground at the centre.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Heartseed')
root = root_empty('Heartseed', coll)
rnd = random.Random(44)

bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.9)
moss = get_mat('Moss', 1.0)
leafm = get_mat('LeafDS', 0.75, double=True)
heart = get_mat('HeartGlow', 0.3, emit=(0.55, 1.0, 0.6), strength=2.4)

B = Part('Body', 1)
# the ring of stones
for k in range(11):
    a = k / 11 * math.tau + rnd.uniform(-0.1, 0.1)
    r = 0.62 + rnd.uniform(-0.04, 0.05)
    B.add(ico(rnd.uniform(0.11, 0.16), 1), stone, rnd.choice(['#8a857a', '#7a756c', '#948e80']), M((math.cos(a) * r, math.sin(a) * r, 0.04), (rnd.random(), rnd.random(), 0), (1.2, 1, 0.75)), deform=jitter(0.02, k, 6), smooth=False, var=0.12, ao=0.3, ao_h=0.1)
# dark soil mounded in the ring, mossed at the edge
B.add(sphere(0.6, 14, 6), bark, '#3a2a1e', M((0, 0, -0.04), (0, 0, 0), (1, 1, 0.16)), deform=jitter(0.02, 3, 5), smooth=True)
for k in range(6):
    a = rnd.uniform(0, math.tau)
    B.add(ico(0.1, 1), moss, rnd.choice(['#5a7a2a', '#4e6e24']), M((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.05), (0, 0, 0), (1.4, 1.2, 0.4)), deform=jitter(0.02, 30 + k), var=0.2)
# roots reaching out over the stones
for k in range(7):
    a = k / 7 * math.tau + 0.3
    pts = [Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.12)), Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.06)), Vector((math.cos(a + 0.2) * 0.85, math.sin(a + 0.2) * 0.85, 0.0))]
    for j in range(2):
        mm, ll = look_m(pts[j], pts[j + 1])
        B.add(ringed_cyl(0.045 - j * 0.015, 0.03 - j * 0.012, ll * 1.06, 6, 2), bark, '#5a4430', mm, deform=jitter(0.01, k * 3 + j, 8), smooth=True)
# the trunk: two stems twisted round each other, round the heart-knot
for s in (0, math.pi):
    pts = []
    for j in range(7):
        t = j / 6
        a = s + t * 2.6
        r = 0.07 * (1 - t) + 0.02 + (0.09 if 0.3 < t < 0.6 else 0) * math.sin((t - 0.3) / 0.3 * math.pi)
        pts.append(Vector((math.cos(a) * r, math.sin(a) * r, 0.1 + t * 1.45)))
    for j in range(6):
        mm, ll = look_m(pts[j], pts[j + 1])
        B.add(ringed_cyl(0.05 - j * 0.006, 0.045 - j * 0.006, ll * 1.06, 6, 2), bark, '#6a5038', mm, smooth=True, streak=0.4)
# branches at the top, and a crown of young leaves
for k in range(5):
    a = k / 5 * math.tau + rnd.uniform(-0.3, 0.3)
    p0 = Vector((0, 0, 1.35 + rnd.uniform(-0.1, 0.1)))
    p1 = p0 + Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, rnd.uniform(0.15, 0.35)))
    mm, ll = look_m(p0, p1)
    B.add(cyl(0.022, 0.01, ll, 5), bark, '#6a5038', mm)
    for j in range(4):
        q = p0.lerp(p1, 0.5 + j * 0.17)
        lm = Matrix.Translation(q) @ Euler((rnd.uniform(-1.2, -0.3), rnd.uniform(-0.4, 0.4), a + rnd.uniform(-0.8, 0.8))).to_matrix().to_4x4()
        B.add(leaf(0.24, 0.1, 0.2, 0.15, 3), leafm, rnd.choice(['#6aa83a', '#7ab844', '#5e9a34']), lm, var=0.15)
B.build(coll, root)

# the heart-knot: warm green light caught between the stems (named Rune so it stays its own mesh)
H = Part('Rune', 2)
H.add(sphere(0.09, 10, 8), heart, (1, 1, 1), M((0, 0, 0), (0, 0, 0), (1, 1, 1.25)))
H.build(coll, root, (0, 0, 0.75))
isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
