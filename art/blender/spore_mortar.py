# Spore Mortar: a squat dry-stone emplacement with a swivelling, banded log barrel that
# flares into a giant mushroom bell. Glowing spore sacs grow all over it; a bellows on the
# breech puffs the spore pods out in a high arc.
# Forward is -Y (glTF +Z). Animated nodes: "Turret" (yaw), "Aim" (pitch, child of Turret),
# "Bellows" (squash on fire, child of Aim).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('SporeMortar')
root = root_empty('SporeMortar', coll)
rnd = random.Random(33)

wood = get_mat('Wood', 0.85)
bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.92)
rope = get_mat('Rope', 0.95)
metal = get_mat('IronDark', 0.55, 0.7)
moss = get_mat('Moss', 1.0)
plant = get_mat('Plant', 0.8)
shroom = get_mat('Shroom', 0.6)
leather = get_mat('Leather', 0.75)
leafm = get_mat('LeafDS', 0.7, double=True)
spore = get_mat('SporeGlow', 0.35, emit=(0.62, 1.0, 0.18), strength=2.2)
gill = get_mat('GillGlow', 0.5, emit=(0.75, 0.3, 1.0), strength=3.0)

B = Part('Body', 5)
# dry-stone ring: three courses of irregular blocks, offset like brickwork
R0 = 0.95
for course in range(3):
    n = 13 - course
    z = course * 0.17
    for i in range(n):
        a = (i + 0.5 * (course % 2)) / n * TAU
        r = R0 - course * 0.05
        w = 2 * r * math.sin(TAU / n / 2) * 0.9
        m = M((math.cos(a) * r, math.sin(a) * r, z), (rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), a + rnd.uniform(-0.05, 0.05)))
        B.add(box(0.32, w, 0.17), stone, rnd.choice(['#8f8b7f', '#9c988b', '#857f73', '#a29e90']), m, deform=jitter(0.03, course * 40 + i, 3.0), ao=0.35, ao_h=0.4, streak=0.12)
# packed earth top inside the ring
B.add(cyl(0.82, 0.8, 0.06, 16), stone, '#5a4632', M((0, 0, 0.44)), deform=jitter(0.02, 8))
# moss and little mushrooms on the wall
for i in range(9):
    a = rnd.uniform(0, TAU)
    B.add(ico(rnd.uniform(0.1, 0.18), 1), moss, rnd.choice(['#4f7a2a', '#5a8730']), M((math.cos(a) * 0.95, math.sin(a) * 0.95, rnd.uniform(0.2, 0.52)), (0, 0, a), (0.6, 1.3, 0.8)), deform=jitter(0.03, 60 + i), var=0.25)
for i in range(5):
    a = rnd.uniform(0, TAU)
    for k in range(rnd.randint(2, 3)):
        p = Vector((math.cos(a) * 1.08 + rnd.uniform(-0.08, 0.08), math.sin(a) * 1.08 + rnd.uniform(-0.08, 0.08), 0.0))
        mushroom_parts(B, plant, shroom, M(p), h=rnd.uniform(0.08, 0.16), r=rnd.uniform(0.05, 0.09), cap=rnd.choice(['#8a5a3a', '#a8643a']),
                       rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0), spots=None, seed=i * 7 + k)

# glowing spore sacs bulging out between the stones
for i in range(7):
    a = rnd.uniform(0, TAU)
    z = rnd.uniform(0.1, 0.4)
    p = Vector((math.cos(a) * 1.0, math.sin(a) * 1.0, z))
    for k in range(3):
        B.add(sphere(rnd.uniform(0.045, 0.08), 8, 6), spore, (1, 1, 1), M(p + Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), rnd.uniform(-0.05, 0.05)))), smooth=True)

# woven basket of spore pods at the back
bp = Vector((0.75, 0.95, 0))
B.add(cyl(0.24, 0.3, 0.36, 14), wood, '#9a7a4a', M(bp), streak=0.4)
for k in range(5):
    B.add(torus(0.25 + k * 0.012, 0.016, 14, 4), rope, '#8a6a3c', M(bp + Vector((0, 0, 0.04 + k * 0.075))))
for k in range(7):
    a = k / 7 * TAU
    B.add(sphere(0.085, 10, 7), spore, (1, 1, 1), M(bp + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.36 + (k % 2) * 0.05))), smooth=True)
    B.add(sphere(0.088, 10, 7), plant, '#6f8a2a', M(bp + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.33 + (k % 2) * 0.05)), (0, 0, 0), (1, 1, 0.6)), smooth=True)

# ferns at the foot
for i in range(3):
    a = i / 3 * TAU + 1.2
    p = Vector((math.cos(a) * 1.2, math.sin(a) * 1.2, 0))
    for q in range(6):
        lm = Matrix.Translation(p) @ Euler((rnd.uniform(0.9, 1.3), 0, q / 6 * TAU)).to_matrix().to_4x4()
        B.add(leaf(rnd.uniform(0.35, 0.5), 0.12, 0.15, 0.45, 6), leafm, rnd.choice(['#4d8a2f', '#5c9a36']), lm, var=0.12)

body = B.build(coll, root)

# ---------------------------------------------------------------- turret: turntable + A-frames
T = Part('Turret', 6)
T.add(cyl(0.72, 0.7, 0.1, 18), wood, '#9c7650', M((0, 0, 0)), streak=0.3)
for k in range(6):  # planks of the turntable
    T.add(box(0.012, 1.38, 0.012), wood, '#5a4028', M((-0.6 + k * 0.24, 0, 0.1)))
T.add(torus(0.71, 0.03, 24, 5), metal, '#3d3833', M((0, 0, 0.05)))
for sx in (-1, 1):
    for sy in (-1, 1):
        m, ln = look_m((sx * 0.36, sy * 0.45, 0.08), (sx * 0.36, 0, 0.88))
        T.add(ringed_cyl(0.06, 0.05, ln, 8, 3), bark, '#7a5a3c', m, smooth=True, streak=0.3)
    # axle cap + lashing at the apex
    T.add(cyl(0.085, 0.085, 0.09, 10), metal, '#3d3833', M((sx * 0.4, 0, 0.9), (0, math.pi / 2, 0)))
    lash(T, rope, M((sx * 0.36, 0, 0.84)), r=0.08, turns=3, color='#b39563')
    # cross brace
    m, ln = look_m((sx * 0.36, -0.36, 0.25), (sx * 0.36, 0.36, 0.25))
    T.add(cyl(0.035, 0.035, ln, 6), wood, '#7d5c3c', m)
turret = T.build(coll, root, (0, 0, 0.47))

# ---------------------------------------------------------------- barrel (pitch node, pivot = axle)
A = Part('Aim', 7)
# The barrel is built along -Y then the node is pitched up 40 degrees.
BL = 1.25
def barrel(bm):
    seg, rings = 16, 8
    rows = []
    for j in range(rings + 1):
        t = j / rings
        r = 0.2 + 0.03 * math.sin(t * math.pi)  # slight belly
        y = 0.35 - t * BL
        rows.append([bm.verts.new((math.cos(i / seg * TAU) * r, y, math.sin(i / seg * TAU) * r)) for i in range(seg)])
    # inner wall (hollow muzzle)
    inner = [bm.verts.new((math.cos(i / seg * TAU) * 0.13, 0.35 - BL + 0.02, math.sin(i / seg * TAU) * 0.13)) for i in range(seg)]
    deep = [bm.verts.new((math.cos(i / seg * TAU) * 0.13, 0.35 - BL + 0.5, math.sin(i / seg * TAU) * 0.13)) for i in range(seg)]
    for j in range(rings):
        for i in range(seg):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]))
    for i in range(seg):
        bm.faces.new((rows[-1][i], rows[-1][(i + 1) % seg], inner[(i + 1) % seg], inner[i]))
        bm.faces.new((inner[i], inner[(i + 1) % seg], deep[(i + 1) % seg], deep[i]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(deep)
A.add(barrel, bark, '#6e4f35', deform=jitter(0.008, 3, 4), smooth=True, streak=0.35)
# iron bands and a rope wrap
for y in (0.25, -0.15, -0.55):
    A.add(torus(0.225, 0.022, 18, 4), metal, '#3d3833', M((0, y, 0), (math.pi / 2, 0, 0)))
for k in range(5):
    A.add(torus(0.232, 0.013, 18, 4), rope, '#b39563', M((0, -0.32 + k * 0.024, 0), (math.pi / 2, 0, 0)))
# trunnions
for sx in (-1, 1):
    A.add(cyl(0.06, 0.06, 0.2, 10), metal, '#3d3833', M((sx * 0.2, 0, 0), (0, math.pi / 2 * sx, 0)))
# trumpet-mushroom bell at the muzzle: a wavy funnel, ridged gills outside, glowing throat
MY = 0.35 - BL
def funnel(scale, lip):
    def b(bm):
        seg = 22
        prof = [(0.2, 0.0), (0.23, -0.07), (0.28, -0.14), (0.36, -0.2), (0.45, -0.24), (0.52, -0.25 + lip)]
        rows = []
        for j, (r, y) in enumerate(prof):
            row = []
            for i in range(seg):
                a = i / seg * TAU
                wav = 1 + 0.08 * math.sin(a * 5) * (j / 5) ** 2
                row.append(bm.verts.new((math.cos(a) * r * wav * scale, y - 0.04 * math.sin(a * 5) * (j / 5) ** 2, math.sin(a) * r * wav * scale)))
            rows.append(row)
        for j in range(len(rows) - 1):
            for i in range(seg):
                bm.faces.new((rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]))
    return b
A.add(funnel(1.0, 0.03), shroom, '#6b4d3c', M((0, MY + 0.02, 0)), smooth=True, var=0.08, streak=0.35)
# inner throat, facing the other way so it lights the inside of the funnel
def flip(f):
    def b(bm):
        f(bm)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return b
A.add(flip(funnel(0.95, 0.0)), shroom, '#8c6650', M((0, MY + 0.012, 0)), smooth=True, var=0.05)
# glowing gill dots ringing the throat
for i in range(18):
    a = i / 18 * TAU
    A.add(sphere(0.022, 6, 4), gill, (1, 1, 1), M((math.cos(a) * 0.3, MY - 0.135, math.sin(a) * 0.3)))
# gill ridges fanning under the bell
for i in range(20):
    a = i / 20 * TAU
    mm, ll = look_m((math.cos(a) * 0.22, MY - 0.05, math.sin(a) * 0.22), (math.cos(a) * 0.48, MY - 0.22, math.sin(a) * 0.48))
    A.add(box(0.012, 0.03, ll, base=True), shroom, '#c8a890', mm)
# glowing spores waiting in the muzzle
for k in range(4):
    A.add(sphere(0.06, 8, 6), spore, (1, 1, 1), M((rnd.uniform(-0.05, 0.05), MY + 0.12 + k * 0.05, rnd.uniform(-0.05, 0.05))), smooth=True)
# spore sacs growing on the barrel
for k in range(6):
    a = rnd.uniform(0.3, math.pi - 0.3)
    y = rnd.uniform(-0.75, 0.15)
    A.add(sphere(rnd.uniform(0.04, 0.065), 8, 6), spore, (1, 1, 1), M((math.cos(a) * 0.22, y, math.sin(a) * 0.22)), smooth=True)
# vine around the barrel
for k in range(12):
    t = k / 11
    ang = t * 8
    p = Vector((math.cos(ang) * 0.235, 0.3 - t * 0.95, math.sin(ang) * 0.235))
    if k % 3 == 0:
        lm = Matrix.Translation(p) @ Euler((rnd.uniform(0, TAU), rnd.uniform(0, TAU), 0)).to_matrix().to_4x4()
        A.add(leaf(0.13, 0.07, 0.25, 0.15, 4), leafm, '#4f8a30', lm)
aim = A.build(coll, turret, (0, 0, 0.9))
aim.rotation_euler = (-0.7, 0, 0)  # 40 degrees up (local -Y forward tilts toward +Z)

# ---------------------------------------------------------------- bellows on the breech
W = Part('Bellows', 8)
for k in range(5):
    W.add(cyl(0.17 - k * 0.006, 0.17 - k * 0.006, 0.05, 14), leather, '#7a4e30' if k % 2 else '#8a5a38', M((0, 0.04 + k * 0.05, 0), (-math.pi / 2, 0, 0)), smooth=True)
W.add(cyl(0.2, 0.2, 0.04, 14), wood, '#8a6644', M((0, 0.3, 0), (-math.pi / 2, 0, 0)))
W.add(box(0.05, 0.4, 0.04), wood, '#7d5c3c', M((0, 0.5, -0.02)))
W.add(cyl(0.03, 0.03, 0.18, 8), wood, '#9a7a50', M((-0.09, 0.69, 0), (0, math.pi / 2, 0)))
bellows = W.build(coll, aim, (0, 0.35, 0))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
