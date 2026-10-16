# The Workbench: a split-log slab on two stump legs, a peg vise, a bundle of sticks, a coil of
# vine and a mallet. Upgrades show on it: "L2" adds a tool rack with a bow saw and a drawknife
# behind the slab, "L3" an iron anvil-stone and a lashed lean-to roof. About 1.8 m long.
# Origin on the ground at the centre; the working side faces -y (three +z).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Workbench')
root = root_empty('Workbench', coll)
rnd = random.Random(61)

wood = get_mat('Crate', 0.85)
bark = get_mat('Bark', 0.9)
iron = get_mat('Iron', 0.5, 0.65)
rope = get_mat('Rope', 0.95)
stone = get_mat('Stone', 0.9)
leafm = get_mat('LeafDS', 0.8, double=True)

B = Part('Body', 3)
# the slab: a half log, flat face up
slab = ringed_cyl(0.3, 0.3, 1.8, 12, 4)
B.add(slab, wood, '#9a7448', M((-0.9, 0, 0.62), (0, math.pi / 2, 0), (0.75, 1, 1)), deform=jitter(0.01, 2, 3), var=0.15, streak=0.5)
B.add(box(1.78, 0.44, 0.04, base=False), wood, '#b89060', M((0, 0, 0.84)), deform=jitter(0.004, 5, 6), var=0.12, streak=0.6)
# stump legs
for x in (-0.6, 0.6):
    B.add(ringed_cyl(0.2, 0.17, 0.62, 10, 3), bark, '#5a4430', M((x, 0, 0)), deform=gnarl(0.03, 3, 0.2, (0, 0), 0.62, seed=int(x * 10) + 9), var=0.2, ao=0.5, ao_h=0.2)
    B.add(cyl(0.17, 0.17, 0.02, 10), wood, '#c9a272', M((x, 0, 0.61)), var=0.1)
# peg vise at the right end
for dx in (0.0, 0.12):
    B.add(cyl(0.03, 0.03, 0.22, 6), wood, '#6e5232', M((0.72 + dx, -0.12, 0.84)), var=0.15)
B.add(box(0.2, 0.06, 0.08, base=False), wood, '#7e5e3a', M((0.78, -0.12, 0.98)), var=0.15)
# a bundle of sticks lashed together at the left end, and a coil of vine
for k in range(7):
    a = rnd.uniform(0, math.tau)
    B.add(cyl(0.022, 0.02, 0.9, 5), wood, rnd.choice(['#8a6a42', '#7a5c38', '#94744a']),
          M((-0.55 + math.cos(a) * 0.04, 0.05 + math.sin(a) * 0.04, 0.9 + 0.03), (0, math.pi / 2, rnd.uniform(-0.05, 0.05))), var=0.15)
lash(B, rope, M((-0.3, 0.05, 0.93), (0, math.pi / 2, 0)), r=0.07, turns=3)
B.add(torus(0.12, 0.022, 14, 5), bark, '#5a7030', M((0.25, 0.08, 0.88)), var=0.2)
B.add(torus(0.09, 0.02, 12, 5), bark, '#5a7030', M((0.25, 0.08, 0.92)), var=0.2)
# a mallet lying on the slab
B.add(cyl(0.05, 0.05, 0.18, 8), wood, '#6a4a2c', M((0.1, -0.12, 0.92), (0, math.pi / 2, 0)), var=0.15)
B.add(cyl(0.015, 0.015, 0.3, 5), wood, '#a07a4c', M((0.19, -0.12, 0.92), (0, 0, math.pi / 2 + 0.3)), var=0.1)
# flint knapped on the bench
for k in range(3):
    B.add(ico(0.035, 0), stone, '#4a4a4e', M((rnd.uniform(-0.2, 0.0), rnd.uniform(-0.15, 0.1), 0.88)), smooth=False, var=0.2)
# chips and shavings at its feet
for k in range(10):
    B.add(box(0.05, 0.02, 0.005), wood, '#c9a272', M((rnd.uniform(-0.8, 0.8), rnd.uniform(-0.5, 0.3), 0.0), (0, 0, rnd.uniform(0, 3))), var=0.2)
B.build(coll, root)

# level 2: a rack of tools on two posts behind the slab
R = Part('L2', 4)
for x in (-0.7, 0.7):
    R.add(stake(0.04, 1.6, 6), wood, '#7a5a38', M((x, 0.42, 0)), var=0.15)
R.add(cyl(0.03, 0.03, 1.5, 6), wood, '#866440', M((-0.75, 0.42, 1.35), (0, math.pi / 2, 0)), var=0.15)
# a bow saw
R.add(torus(0.22, 0.012, 16, 4), wood, '#8a6a42', M((-0.3, 0.38, 1.1), (math.pi / 2, 0, 0), (1, 0.6, 1)), var=0.1)
R.add(box(0.44, 0.004, 0.04, base=False), iron, '#8a8a88', M((-0.3, 0.38, 0.98)), var=0.1)
# a drawknife and a hatchet hanging from the bar
R.add(box(0.3, 0.01, 0.04, base=False), iron, '#7a7a78', M((0.2, 0.38, 1.18)), var=0.1)
R.add(cyl(0.02, 0.02, 0.4, 5), wood, '#6a4a2c', M((0.45, 0.38, 1.0)), var=0.1)
R.add(box(0.12, 0.02, 0.09, base=False), iron, '#5a5a5a', M((0.45, 0.38, 1.18)), var=0.1)
lash(R, rope, M((-0.7, 0.42, 1.35)), r=0.05, turns=2)
lash(R, rope, M((0.7, 0.42, 1.35)), r=0.05, turns=2)
R.build(coll, root)

# level 3: an anvil stone beside it and a lean-to roof of palm thatch
A = Part('L3', 6)
A.add(ico(0.28, 1), stone, '#5e5c58', M((1.25, -0.05, 0.12), (0, 0, 0.3), (1.2, 0.9, 0.75)), smooth=False, var=0.15, ao=0.3, ao_h=0.2)
A.add(box(0.3, 0.16, 0.05, base=False), iron, '#3a3633', M((1.25, -0.05, 0.36)), var=0.15)
for x in (-0.95, 0.95):
    A.add(stake(0.05, 2.2, 6), wood, '#6a4c2e', M((x, 0.55, 0)), var=0.15)
    A.add(stake(0.045, 1.7, 6), wood, '#6a4c2e', M((x, -0.55, 0)), var=0.15)
# two rafters and a thatch of palm fronds laid in rows, drooping over the edges
for x in (-0.95, 0.95):
    mm, ll = look_m((x, 0.6, 2.2), (x, -0.62, 1.68))
    A.add(cyl(0.035, 0.035, ll, 6), wood, '#6a4c2e', mm, var=0.15)
for row in range(5):
    y = 0.58 - row * 0.29
    z = 2.2 - row * 0.125
    for k in range(12):
        x = -1.05 + k * 0.19 + rnd.uniform(-0.05, 0.05)
        lm = Matrix.Translation((x, y, z)) @ Euler((math.pi / 2 + 0.42 + rnd.uniform(-0.1, 0.1), rnd.uniform(-0.15, 0.15), math.pi + rnd.uniform(-0.2, 0.2))).to_matrix().to_4x4()
        A.add(leaf(0.66, 0.3, 0.2, 0.2, 4), leafm, rnd.choice(['#6a7a34', '#7a8a3c', '#8a8444', '#9a8a4a']), lm, var=0.2)
A.build(coll, root)
isolate(coll)
print('ok')
