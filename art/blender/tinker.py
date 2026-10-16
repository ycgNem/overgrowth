# The Tinker's Bench: a supply crate turned on its side for a desk, a plank top, coils of
# copper wire, gears, a hand-cranked drill, a battery and a hurricane lamp ("Lamp" glows in
# the game). "L2" adds a pegboard of salvaged parts; "L3" the wreck's radio set with its valves
# lit. About 1.3 m long. Origin on the ground at the centre; the working side faces -y.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Tinker')
root = root_empty('Tinker', coll)
rnd = random.Random(83)

wood = get_mat('Crate', 0.85)
paint = get_mat('CratePaint', 0.8)
iron = get_mat('Iron', 0.5, 0.65)
copper = get_mat('Copper', 0.35, 0.9)
brass = get_mat('Brass', 0.35, 0.9)
glass = get_mat('LampGlow', 0.3, 0.0, emit=(1.0, 0.78, 0.45), strength=2.0)
valve = get_mat('ValveGlow', 0.3, 0.0, emit=(1.0, 0.55, 0.25), strength=2.0)
black = get_mat('Bakelite', 0.6)

B = Part('Body', 3)
# two crates as legs, a plank top
for x in (-0.45, 0.45):
    B.add(box(0.45, 0.5, 0.7, chamfer=0.01), paint, '#4f5a36', M((x, 0, 0)), deform=jitter(0.004, int(x * 9) + 4, 6), var=0.15, ao=0.35, ao_h=0.25)
    for z in (0.08, 0.62):
        B.add(box(0.47, 0.52, 0.04, base=False), wood, '#434d2e', M((x, 0, z)), var=0.12)
for i in range(4):
    B.add(box(1.36, 0.15, 0.035, base=False), wood, rnd.choice(['#a07a4c', '#94704a', '#ad8656']), M((0, -0.24 + i * 0.16, 0.72)), deform=jitter(0.003, i, 8), var=0.15, streak=0.5)
# coils of copper wire
for k, (x, y) in enumerate(((-0.4, 0.05), (-0.25, 0.12))):
    for j in range(3):
        B.add(torus(0.08 - j * 0.004, 0.01, 14, 4), copper, '#c87a3a', M((x, y, 0.75 + j * 0.016)), var=0.1)
# gears
for k, (x, r) in enumerate(((0.05, 0.07), (0.2, 0.05), (0.12, 0.035))):
    B.add(cyl(r, r, 0.015, 12), brass, '#b8903a', M((x, -0.1 + k * 0.04, 0.75)), var=0.12)
    for t in range(10):
        a = t / 10 * math.tau
        B.add(box(0.012, 0.012, 0.015, base=False), brass, '#b8903a', M((x + math.cos(a) * r, -0.1 + k * 0.04 + math.sin(a) * r, 0.758)), var=0.1)
# a battery and a hand drill
B.add(box(0.1, 0.07, 0.12), black, '#2a2a2a', M((0.45, 0.1, 0.735)), var=0.1)
for dx in (-0.025, 0.025):
    B.add(cyl(0.008, 0.008, 0.02, 6), brass, '#c8a04a', M((0.45 + dx, 0.1, 0.855)))
B.add(cyl(0.012, 0.012, 0.32, 6), iron, '#6a6a6a', M((0.3, -0.15, 0.76), (0, math.pi / 2, 0.4)), var=0.1)
B.add(torus(0.05, 0.008, 10, 4), iron, '#6a6a6a', M((0.36, -0.12, 0.76), (math.pi / 2, 0, 0.4)), var=0.1)
# the lamp's frame
B.add(cyl(0.06, 0.07, 0.03, 10), iron, '#3a3633', M((-0.55, -0.12, 0.735)), var=0.1)
for a in range(4):
    B.add(cyl(0.006, 0.006, 0.2, 4), iron, '#3a3633', M((-0.55 + math.cos(a * math.pi / 2) * 0.055, -0.12 + math.sin(a * math.pi / 2) * 0.055, 0.765)))
B.add(cone(0.07, 0.07, 10), iron, '#3a3633', M((-0.55, -0.12, 0.965)), var=0.1)
B.add(torus(0.04, 0.006, 8, 4), iron, '#3a3633', M((-0.55, -0.12, 1.06), (math.pi / 2, 0, 0)))
# scrap leaning on it
for k in range(3):
    B.add(box(0.4, 0.01, 0.3, base=False), iron, rnd.choice(['#6a5040', '#5a4a3e']), M((0.75 + k * 0.03, 0.15, 0.2), (0.1, -0.4, rnd.uniform(-0.2, 0.2))), var=0.2, streak=0.6)
B.build(coll, root)

Lp = Part('Lamp', 5)
Lp.add(cyl(0.05, 0.05, 0.17, 10), glass, '#ffd090', M((-0.55, -0.12, 0.775)))
Lp.build(coll, root)

L2 = Part('L2', 4)
L2.add(box(1.2, 0.03, 0.7, base=False), wood, '#866440', M((0, 0.3, 1.15)), var=0.12, streak=0.4)
for x in (-0.55, 0.55):
    L2.add(stake(0.03, 1.5, 6), wood, '#6a4c2e', M((x, 0.33, 0)), var=0.15)
for k in range(12):
    kind = rnd.random()
    x, z = rnd.uniform(-0.5, 0.5), rnd.uniform(0.9, 1.4)
    if kind < 0.4:
        L2.add(cyl(rnd.uniform(0.03, 0.06), rnd.uniform(0.03, 0.06), 0.012, 10), brass, '#b8903a', M((x, 0.27, z), (math.pi / 2, 0, 0)), var=0.12)
    elif kind < 0.7:
        L2.add(torus(0.05, 0.008, 12, 4), copper, '#c87a3a', M((x, 0.27, z), (math.pi / 2, 0, 0)), var=0.1)
    else:
        L2.add(box(0.15, 0.01, 0.03, base=False), iron, '#7a7a7a', M((x, 0.27, z), (0, rnd.uniform(-0.6, 0.6), 0)), var=0.1)
L2.build(coll, root)

L3 = Part('L3', 6)
L3.add(box(0.42, 0.24, 0.26), black, '#3a3428', M((0.05, 0.12, 0.74)), var=0.12)
L3.add(box(0.36, 0.01, 0.16, base=False), brass, '#9a7a3a', M((0.05, -0.006, 0.87)), var=0.1)
for k in range(3):
    L3.add(cyl(0.022, 0.018, 0.08, 8), valve, '#ffa060', M((-0.05 + k * 0.1, 0.12, 1.0)))
for dx in (-0.1, 0.1):
    L3.add(cyl(0.022, 0.022, 0.02, 10), black, '#151515', M((0.05 + dx, -0.01, 0.82), (math.pi / 2, 0, 0)))
# a mast lashed to the bench with the aerial strung off it: the radio reaches out
L3.add(stake(0.035, 2.8, 6), wood, '#6a4c2e', M((0.66, 0.3, 0)), var=0.15)
L3.add(cyl(0.006, 0.004, 0.6, 4), iron, '#5a5a5a', M((0.22, 0.2, 1.0), (0.2, 0.15, 0)))
mm, ll = look_m((0.66, 0.3, 2.7), (0.25, 0.15, 1.0))
L3.add(cyl(0.005, 0.005, ll, 4), copper, '#c87a3a', mm)
for z in (1.6, 2.2, 2.6):
    L3.add(box(0.36, 0.012, 0.012, base=False), iron, '#6a6a6a', M((0.66, 0.3, z)), var=0.1)
L3.build(coll, root)
isolate(coll)
print('ok')
