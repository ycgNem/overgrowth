# The Fire Pit: a beehive kiln of river clay over a ring of stones, its mouth glowing ("Ember"
# pulses in the game), a smoking rack of sticks beside it and a pile of clay. "L2" adds a
# second, taller chimney and a clay water jar; "L3" bog-iron bands round the dome and a
# bellows. About 1.4 m across. Origin on the ground at the centre; the mouth faces -y.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Firepit')
root = root_empty('Firepit', coll)
rnd = random.Random(71)

clay = get_mat('Clay', 0.9)
stone = get_mat('Stone', 0.9)
wood = get_mat('Crate', 0.85)
iron = get_mat('Iron', 0.55, 0.6)
ember = get_mat('Ember', 0.6, 0.0, emit=(1.0, 0.45, 0.12), strength=2.4)
soot = get_mat('Soot', 0.95)
hide = get_mat('Hide', 0.85)

B = Part('Body', 3)
# ring of stones
for k in range(13):
    a = k / 13 * math.tau
    r = 0.62
    B.add(ico(rnd.uniform(0.11, 0.15), 1), stone, rnd.choice(['#6a6660', '#5e5a54', '#77726a']),
          M((math.cos(a) * r, math.sin(a) * r, 0.06), (rnd.uniform(0, 3), rnd.uniform(0, 3), 0), (1.2, 1, 0.8)), smooth=False, var=0.15, ao=0.4, ao_h=0.15)
# the dome: a squashed sphere with its mouth cut toward -y (two layers: the clay shell and a
# soot-blackened rim)
dome = sphere(0.5, 14, 9)
def dome_def(co):
    c = co.copy()
    if c.z < 0:
        c.z *= 0.1
    return c + noise.noise_vector(c * 4) * 0.02
B.add(dome, clay, '#a5876a', M((0, 0.04, 0.05), (0, 0, 0), (1, 1, 1.1)), deform=dome_def, var=0.18, ao=0.35, ao_h=0.3)
# the mouth: an arch of soot-dark clay proud of the dome, with the glow behind it
B.add(torus(0.17, 0.05, 12, 5), soot, '#2a221c', M((0, -0.44, 0.2), (math.pi / 2, 0, 0), (1, 1.25, 1)), var=0.15)
B.add(cyl(0.08, 0.06, 0.18, 8), clay, '#8e7058', M((0, 0.1, 0.55)), var=0.15)
B.add(torus(0.08, 0.025, 10, 4), soot, '#2a221c', M((0, 0.1, 0.73)), var=0.1)
# a rack of sticks to smoke on, at the side
for x in (0.75, 1.15):
    B.add(stake(0.025, 0.9, 5), wood, '#6a4c2e', M((x, -0.1, 0), (0, 0.08 * (x - 0.95), 0)), var=0.15)
B.add(cyl(0.02, 0.02, 0.5, 5), wood, '#7a5a38', M((0.7, -0.1, 0.82), (0, math.pi / 2, 0)), var=0.15)
for k in range(3):
    B.add(box(0.03, 0.012, 0.22, base=False), hide, '#3a2a1c', M((0.82 + k * 0.12, -0.1, 0.7)), var=0.2)
# a heap of clay lumps and a stack of split wood
for k in range(5):
    B.add(ico(rnd.uniform(0.07, 0.11), 1), clay, '#8a7a6a', M((-0.85 + rnd.uniform(-0.1, 0.1), -0.25 + rnd.uniform(-0.1, 0.1), 0.05)), var=0.15)
for k in range(6):
    B.add(cyl(0.04, 0.04, 0.45, 6), wood, rnd.choice(['#7a5a38', '#8a6a42']), M((-0.75, 0.3 + (k % 3) * 0.085, 0.04 + (k // 3) * 0.075), (0, math.pi / 2, 0)), var=0.15)
B.build(coll, root)

E = Part('Ember', 5)
E.add(sphere(0.14, 10, 6), ember, '#ff8a3a', M((0, -0.32, 0.14), (0, 0, 0), (1.2, 1, 0.7)))
for k in range(4):
    E.add(ico(0.04, 0), ember, '#ffb050', M((rnd.uniform(-0.08, 0.08), -0.38, 0.06), (0, 0, 0)), smooth=False)
E.build(coll, root)

L2 = Part('L2', 4)
# a tall A-frame smoking rack behind the kiln, hung with hides and eels
for x in (-0.55, 0.55):
    for y in (0.45, 0.95):
        mm, ll = look_m((x, y, 0), (x * 0.95, 0.7, 1.75))
        L2.add(cyl(0.03, 0.025, ll, 5), wood, '#6a4c2e', mm, var=0.15)
L2.add(cyl(0.025, 0.025, 1.2, 5), wood, '#7a5a38', M((-0.6, 0.7, 1.68), (0, math.pi / 2, 0)), var=0.15)
for k in range(5):
    x = -0.42 + k * 0.21
    if k % 2:
        L2.add(box(0.16, 0.012, 0.42, base=False), hide, '#5a4030', M((x, 0.7, 1.42), (0, 0, rnd.uniform(-0.1, 0.1))), var=0.2)
    else:
        L2.add(cyl(0.025, 0.012, 0.45, 6), soot, '#2a2018', M((x, 0.7, 1.2)), var=0.15)
L2.add(cyl(0.07, 0.05, 0.5, 8), clay, '#9a7c62', M((0.18, 0.2, 0.45)), var=0.15)
L2.add(torus(0.06, 0.02, 10, 4), soot, '#2a221c', M((0.18, 0.2, 0.95)), var=0.1)
L2.add(sphere(0.16, 10, 7), clay, '#a07a5a', M((-0.5, -0.55, 0.15), (0, 0, 0), (1, 1, 1.15)), var=0.15)
L2.add(cyl(0.07, 0.08, 0.08, 8), clay, '#8a6a4e', M((-0.5, -0.55, 0.3)), var=0.15)
L2.build(coll, root)

L3 = Part('L3', 6)
for z in (0.18, 0.36):
    L3.add(torus(0.49 - (z - 0.18) * 0.5, 0.018, 18, 4), iron, '#4a3428', M((0, 0.04, z)), var=0.2, streak=0.5)
# bellows: two boards and a hide bag pointed at the mouth
L3.add(box(0.36, 0.2, 0.02, base=False), wood, '#6a4c2e', M((0.45, -0.75, 0.12), (0, 0, 0.6)), var=0.15)
L3.add(box(0.36, 0.2, 0.02, base=False), wood, '#6a4c2e', M((0.45, -0.75, 0.24), (0.2, 0, 0.6)), var=0.15)
L3.add(sphere(0.12, 8, 6), hide, '#5a4030', M((0.45, -0.75, 0.18), (0, 0, 0.6), (1.3, 0.8, 0.4)), var=0.2)
L3.add(cyl(0.025, 0.02, 0.3, 6), iron, '#3a3633', M((0.3, -0.6, 0.18), (math.pi / 2, 0, 2.2)), var=0.1)
# a clay-and-stone chimney stack, taller than a man, smoke-blackened at the lip
for k in range(6):
    r = 0.2 - k * 0.018
    L3.add(cyl(r, r - 0.012, 0.32, 9), stone if k % 2 else clay, '#6e6660' if k % 2 else '#9a7a5e', M((-0.15, 0.5, 0.0 + k * 0.32)), deform=jitter(0.01, k, 6), var=0.15, ao=0.3, ao_h=0.4)
L3.add(torus(0.13, 0.04, 10, 4), soot, '#1e1814', M((-0.15, 0.5, 1.94)), var=0.1)
L3.build(coll, root)
isolate(coll)
print('ok')
