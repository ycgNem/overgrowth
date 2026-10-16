# A Rot egg: what the Rot Mother lays as she walks. A leathery pale ovoid half sunk in a nest of
# rotting roots, split by cracks with a green glow inside. "Core" (the glow) swells as it nears
# hatching. About 0.8 m tall. Origin on the ground at the centre.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('RotEgg')
root = root_empty('RotEgg', coll)
rnd = random.Random(21)

shell = get_mat('EggShell', 0.5)
bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.75)
egg = get_mat('EggGlow', 0.35, emit=(0.75, 1.0, 0.35), strength=2.0)

B = Part('Body', 1)
# the shell: a lumpy egg, a little lopsided
B.add(sphere(0.32, 14, 10), shell, '#cfc4a6', M((0, 0, 0.34), (0.08, 0.05, 0), (1, 0.92, 1.3)), deform=jitter(0.025, 3, 3), smooth=True, streak=0.4, var=0.15)
# veins over it
for k in range(5):
    a = k / 5 * math.tau + rnd.uniform(-0.2, 0.2)
    pts = [Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.08)), Vector((math.cos(a) * 0.32, math.sin(a) * 0.3, 0.32)), Vector((math.cos(a + 0.3) * 0.22, math.sin(a + 0.3) * 0.2, 0.62))]
    for j in range(2):
        mm, ll = look_m(pts[j], pts[j + 1])
        B.add(cyl(0.014, 0.01, ll * 1.05, 4), crust, '#5a3a48', mm, smooth=True)
# the nest of roots round its foot
for k in range(9):
    a = k / 9 * math.tau + rnd.uniform(-0.2, 0.2)
    p0 = Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, 0.06))
    p1 = Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.0))
    mm, ll = look_m(p0, p1)
    B.add(ringed_cyl(0.05, 0.02, ll, 6, 2), bark, rnd.choice(['#3e2a30', '#4a3036']), mm, deform=jitter(0.01, k, 8), smooth=True)
B.build(coll, root)

# the glow inside, seen through the cracks (scaled up as it nears hatching)
C = Part('Core', 2)
C.add(sphere(0.24, 10, 8), egg, (1, 1, 1), M((0, 0, 0), (0, 0, 0), (1, 1, 1.3)))
for k in range(4):
    a = k / 4 * math.tau + 0.4
    C.add(box(0.05, 0.05, 0.3, base=False), egg, (1, 1, 1), M((math.cos(a) * 0.3, math.sin(a) * 0.27, 0.04), (0.25, 0, a)))
C.build(coll, root, (0, 0, 0.34))
isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
