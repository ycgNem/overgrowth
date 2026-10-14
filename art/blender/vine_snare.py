# Vine Snare: a trap. A ring of short, sharpened root stakes around a mat of leaves, with five
# coiled liana tendrils lying flat. When the Blight steps in, the tendrils whip up and
# bind it in place.
# Animated nodes: "Grab0".."Grab4" (pivot at the ring, rotate about their local X to lift).
# Each tendril lies along its local -Y (pointing at the centre) at rest.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('VineSnare')
root = root_empty('VineSnare', coll)
rnd = random.Random(31)

bark = get_mat('Bark', 0.9)
wood = get_mat('Wood', 0.85)
vine = get_mat('Vine', 0.8)
leafm = get_mat('LeafDS', 0.7, double=True)
moss = get_mat('Moss', 1.0)
thorn = get_mat('Bone', 0.7)
glow = get_mat('SapGlow', 0.4, emit=(0.55, 1.0, 0.35), strength=2.0)

R = 0.62
B = Part('Body', 1)
# low mossy mound
B.add(sphere(0.78, 16, 6), moss, '#4a6a2a', M((0, 0, -0.26), (0, 0, 0), (1, 1, 0.38)), deform=jitter(0.04, 2), var=0.2)
# leaf mat in the middle (the trigger)
for k in range(14):
    a = rnd.uniform(0, TAU); r = rnd.uniform(0, 0.35)
    lm = Matrix.Translation((math.cos(a) * r, math.sin(a) * r, 0.04 + k * 0.003)) @ Euler((math.pi / 2 - 0.08, 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
    B.add(leaf(rnd.uniform(0.22, 0.32), rnd.uniform(0.1, 0.14), 0.1, 0.02, 4), leafm, rnd.choice(['#6a7a30', '#7a6a2c', '#5a7230', '#8a6a34']), lm, var=0.15)
# ring of short stakes leaning out, lashed with vine
for i in range(9):
    a = i / 9 * TAU + 0.2
    p = Vector((math.cos(a) * (R + 0.12), math.sin(a) * (R + 0.12), -0.05))
    L = rnd.uniform(0.35, 0.55)
    mm, ll = look_m(p, p + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, L)))
    B.add(stake(0.04, ll, 6), wood, '#8a6a46', mm, deform=jitter(0.006, i, 8), ao=0.3, ao_h=0.3)
# a vine hoop binding the stakes together
B.add(torus(R + 0.14, 0.025, 28, 5), vine, '#4c6a26', M((0, 0, 0.1)), deform=jitter(0.02, 7, 4))
# sap pods: little glowing buds where the tendrils are rooted
for i in range(5):
    a = i / 5 * TAU
    B.add(sphere(0.045, 8, 5), glow, (1, 1, 1), M((math.cos(a) * R, math.sin(a) * R, 0.08), (0, 0, 0), (1, 1, 0.8)))
body = B.build(coll, root)

# ---------------------------------------------------------------- the tendrils
for i in range(5):
    a = i / 5 * TAU
    T = Part(f'Grab{i}', 10 + i)
    # in the node's local frame: lying along -Y, slightly coiled, tapering, with thorns
    pts = []
    for j in range(8):
        t = j / 7
        y = -t * 0.62
        x = math.sin(t * 5.5) * 0.06 * t
        z = 0.03 + math.sin(t * math.pi) * 0.03
        pts.append(Vector((x, y, z)))
    for j in range(len(pts) - 1):
        mm, ll = look_m(pts[j], pts[j + 1])
        r = 0.04 * (1 - j / 8) + 0.008
        T.add(cyl(r, r * 0.85, ll * 1.06, 6), vine, rnd.choice(['#4c6a26', '#577630', '#466222']), mm, smooth=True)
        if j % 2 == 1:
            mm2, ll2 = look_m(pts[j], pts[j] + Vector((0, 0, 0.06)))
            T.add(cone(0.012, ll2, 4), thorn, '#c8b48a', mm2)
    # curled tip and a leaf
    T.add(torus(0.035, 0.009, 10, 4), vine, '#577630', M(pts[-1] + Vector((0, -0.02, 0.02)), (0, math.pi / 2, 0)))
    lm = Matrix.Translation(pts[3]) @ Euler((math.pi / 2 - 0.3, 0, 0.8)).to_matrix().to_4x4()
    T.add(leaf(0.14, 0.07, 0.2, 0.05, 3), leafm, '#5a7a30', lm)
    ob = T.build(coll, root, (math.cos(a) * R, math.sin(a) * R, 0.06))
    # point local -Y at the centre: rotate about Z so -Y faces inward
    ob.rotation_euler = (0, 0, a - math.pi / 2)

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
