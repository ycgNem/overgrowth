# Glowcap Lantern: a lashed pole on a tripod with a crooked arm, from which hangs a cage of
# bent sticks full of glowcaps. Its cold blue light drags Burrowers up out of the ground and
# shows up every Blight that walks into it.
# Forward is -Y (glTF +Z). Origin on the ground at the pole's foot.
# Animated nodes: "Orb" (the hanging cage, pivot where it hangs, so it can sway and pulse).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('GlowLantern')
root = root_empty('GlowLantern', coll)
rnd = random.Random(12)

wood = get_mat('Wood', 0.85)
bark = get_mat('Bark', 0.9)
rope = get_mat('Rope', 0.9)
stone = get_mat('Stone', 0.85)
moss = get_mat('Moss', 0.95)
capg = get_mat('GlowcapGlow', 0.3, emit=(0.18, 0.5, 1.0), strength=1.6)
stem = get_mat('GlowcapStem', 0.6, emit=(0.4, 0.62, 0.8), strength=0.5)

H = 2.35
ARM = Vector((0, -0.62, H - 0.08))

B = Part('Body', 1)
# the pole, a little crooked
mm, ll = look_m((0, 0, 0), (0.03, 0.02, H))
B.add(stake(0.065, ll, 8), bark, '#5a4a36', mm, deform=gnarl(0.03, 3, 0.2, (0.02, 0), ll, 3), streak=0.4)
# tripod legs
for k in range(3):
    a = k / 3 * TAU + 0.4
    foot = Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, 0))
    mm, ll = look_m(foot, (0.01, 0.01, 0.95))
    B.add(stake(0.04, ll, 7), wood, '#6a5840', mm, streak=0.3)
    B.add(ico(0.11, 1), stone, rnd.choice(['#6c6a62', '#5e5c54']), M(foot + Vector((0, 0, 0.04)), (0, 0, a), (1, 1, 0.6)), deform=jitter(0.02, 20 + k, 6), smooth=False)
lash(B, rope, M((0.01, 0.01, 0.92)), r=0.08, turns=4)
# the crooked arm
mm, ll = look_m((0.02, 0.0, H - 0.25), ARM + Vector((0, -0.04, 0.02)))
B.add(stake(0.04, ll, 7), wood, '#6a5840', mm, streak=0.3)
lash(B, rope, M((0.02, -0.02, H - 0.22)), r=0.075, turns=3)
mm, ll = look_m((0.02, 0, H - 0.75), (0.01, -0.36, H - 0.18))
B.add(cyl(0.025, 0.02, ll, 6), wood, '#6a5840', mm)
# moss and a few small glowcaps at the foot
for k in range(5):
    a = rnd.uniform(0, TAU)
    r = rnd.uniform(0.12, 0.4)
    B.add(sphere(rnd.uniform(0.05, 0.09), 8, 5), moss, rnd.choice(['#4e6a2a', '#5a7a30']), M((math.cos(a) * r, math.sin(a) * r, 0.0), (0, 0, 0), (1, 1, 0.4)), smooth=True)
for k in range(6):
    a = rnd.uniform(0, TAU)
    r = rnd.uniform(0.1, 0.45)
    h = rnd.uniform(0.05, 0.12)
    p = Vector((math.cos(a) * r, math.sin(a) * r, 0))
    mm, ll = look_m(p, p + Vector((rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), h)))
    B.add(cyl(0.012, 0.01, ll, 5), stem, (1, 1, 1), mm)
    B.add(sphere(0.03 + h * 0.2, 8, 5), capg, (1, 1, 1), mm @ M((0, 0, ll), (0, 0, 0), (1, 1, 0.45)), smooth=True)
body = B.build(coll, root)

# ---------------------------------------------------------------- the hanging cage
O = Part('Orb', 2)
# hanging cord
O.add(cyl(0.008, 0.008, 0.22, 4), rope, '#b09a6a', M((0, 0, -0.22)))
# a cage of bent sticks: six ribs bowed out between two rings
top, bot, R = -0.24, -0.72, 0.17
for k in range(6):
    a = k / 6 * TAU
    pts = []
    for j in range(6):
        t = j / 5
        rr = R * math.sin(t * math.pi) + 0.05
        pts.append(Vector((math.cos(a) * rr, math.sin(a) * rr, top + (bot - top) * t)))
    for j in range(5):
        mm, ll = look_m(pts[j], pts[j + 1])
        O.add(cyl(0.012, 0.012, ll * 1.05, 4), wood, '#6a5636', mm)
for z, r in ((top, 0.055), (bot, 0.055)):
    O.add(torus(r, 0.014, 10, 4), rope, '#a08a5a', M((0, 0, z)))
# the glowcaps inside: a clump of caps on a lump of rotten wood
O.add(sphere(0.07, 8, 6), wood, '#4a3c2a', M((0, 0, bot + 0.06), (0, 0, 0), (1.2, 1, 0.6)), smooth=True)
for k in range(9):
    a = k / 9 * TAU + rnd.uniform(-0.2, 0.2)
    r = rnd.uniform(0.02, 0.08)
    h = rnd.uniform(0.08, 0.22)
    p = Vector((math.cos(a) * r, math.sin(a) * r, bot + 0.07))
    tip = p + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, h))
    mm, ll = look_m(p, tip)
    O.add(cyl(0.012, 0.01, ll, 5), stem, (1, 1, 1), mm)
    O.add(sphere(0.045 + h * 0.15, 10, 6), capg, (1, 1, 1), mm @ M((0, 0, ll), (0, 0, 0), (1, 1, 0.45)), smooth=True)
orb = O.build(coll, root, ARM)

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
