# Tesla Totem: a carved, painted totem pole wrapped in a copper coil and skirted with
# bolted scrap plates, wired to a salvaged battery. A crown of copper prongs holds a
# vacuum-tube orb that throws chain lightning.
# Animated nodes: "Orb" (pulse), "Rings" (spin around the orb).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('TeslaTotem')
root = root_empty('TeslaTotem', coll)
rnd = random.Random(44)

wood = get_mat('Wood', 0.85)
bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.92)
rust = get_mat('Rust', 0.85, 0.35)
copper = get_mat('Copper', 0.32, 1.0)
metal = get_mat('IronDark', 0.55, 0.7)
paint = get_mat('Paint', 0.7)
rope = get_mat('Rope', 0.95)
moss = get_mat('Moss', 1.0)
rubber = get_mat('Rubber', 0.6)
glow = get_mat('ArcGlow', 0.2, emit=(0.45, 0.85, 1.0), strength=6.0)
filament = get_mat('Filament', 0.3, emit=(1.0, 0.6, 0.25), strength=5.0)
glass = get_mat('GlassTint', 0.08, 0.0)

B = Part('Body', 2)
# footing stones and a mossy mound
for i in range(10):
    a = i / 10 * TAU + rnd.uniform(-0.2, 0.2)
    r = rnd.uniform(0.55, 0.8)
    B.add(ico(rnd.uniform(0.14, 0.22), 1), stone, rnd.choice(['#8f8b7f', '#9c988b', '#7f7a6f']), M((math.cos(a) * r, math.sin(a) * r, 0.04), (rnd.random(), rnd.random(), 0), (1, 1, 0.65)), deform=jitter(0.03, i))
B.add(sphere(0.62, 14, 6), moss, '#4a6f28', M((0, 0, -0.18), (0, 0, 0), (1, 1, 0.4)), deform=jitter(0.04, 30), var=0.2)

# scrap skirt: rusted sheets leaning against the pole, bolted, edges ragged
for i in range(7):
    a = i / 7 * TAU + 0.2
    h = rnd.uniform(0.6, 0.9)
    m = M((math.cos(a) * 0.42, math.sin(a) * 0.42, 0.0), (0, -0.22, a))
    def sheet(bm, h=h):
        cols, rows = 4, 4
        vs = [[bm.verts.new(((c / cols - 0.5) * 0.36, 0, r / rows * h + (rnd.uniform(-0.04, 0.03) if r == rows else 0))) for c in range(cols + 1)] for r in range(rows + 1)]
        for r in range(rows):
            for c in range(cols):
                bm.faces.new((vs[r][c], vs[r][c + 1], vs[r + 1][c + 1], vs[r + 1][c]))
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.015)
    B.add(sheet, rust, rnd.choice(['#8a4a2a', '#7a4428', '#9a5a32', '#6f4a3a']), m @ M((0, 0, 0), (0, 0, math.pi / 2)), deform=jitter(0.015, 40 + i, 5), streak=0.5)
    for k in range(2):
        B.add(cyl(0.018, 0.018, 0.02, 6), metal, '#3a3632', m @ M((0, 0, h * (0.3 + k * 0.45)), (0, math.pi / 2, 0)) @ M((0, 0, 0.01)))

# the pole: three carved, painted faces stacked up
PH = 2.6
B.add(ringed_cyl(0.25, 0.21, PH, 14, 8), bark, '#93704e', M((0, 0, 0)), deform=gnarl(0.012, 3, 0.1, (0, 0), PH, 2), smooth=True, streak=0.3)
faces = [(0.85, '#2f8a8a', '#b8402e'), (1.45, '#c8a040', '#2f6a8a'), (2.05, '#b8402e', '#2f8a8a')]
for fi, (z, c1, c2) in enumerate(faces):
    fwd = M((0, -0.215, z), (0, 0, 0))
    # painted bands above and below the face
    B.add(torus(0.235, 0.025, 16, 4), paint, c1, M((0, 0, z - 0.24)))
    B.add(torus(0.23, 0.025, 16, 4), paint, c2, M((0, 0, z + 0.26)))
    # brow ridge
    B.add(box(0.4, 0.1, 0.08), wood, '#a07a52', fwd @ M((0, 0, 0.12)), deform=jitter(0.005, fi, 9))
    # eyes: painted rings with dark sockets
    for sx in (-1, 1):
        B.add(cyl(0.065, 0.065, 0.03, 10), paint, '#e8e0c8', fwd @ M((sx * 0.09, -0.01, 0.05), (math.pi / 2, 0, 0)))
        B.add(cyl(0.035, 0.035, 0.035, 8), paint, '#141414', fwd @ M((sx * 0.09, -0.02, 0.05), (math.pi / 2, 0, 0)))
    # nose wedge
    def nose(bm):
        v = [bm.verts.new(p) for p in [(-0.04, 0, 0.05), (0.04, 0, 0.05), (0, -0.09, -0.07), (-0.05, 0, -0.08), (0.05, 0, -0.08)]]
        bm.faces.new((v[0], v[1], v[2])); bm.faces.new((v[1], v[4], v[2])); bm.faces.new((v[4], v[3], v[2])); bm.faces.new((v[3], v[0], v[2]))
    B.add(nose, wood, '#86603f', fwd @ M((0, -0.01, -0.02)))
    # mouth: teeth in a dark slot
    B.add(box(0.2, 0.03, 0.06), paint, '#141414', fwd @ M((0, -0.005, -0.16)))
    for k in range(5):
        B.add(box(0.03, 0.035, 0.025), paint, '#e8e0c8', fwd @ M((-0.08 + k * 0.04, -0.012, -0.135)))
    # ear plates
    for sx in (-1, 1):
        B.add(box(0.06, 0.16, 0.22), wood, '#8a6644', M((sx * 0.25, 0, z - 0.02), (0, sx * 0.15, 0)), deform=jitter(0.006, fi * 3 + sx, 8))

# carved wings near the top
for sx in (-1, 1):
    def wing(bm, sx=sx):
        pts = [(0, 0), (0.55, 0.12), (0.72, 0.32), (0.6, 0.3), (0.62, 0.42), (0.45, 0.36), (0.42, 0.48), (0.25, 0.32), (0, 0.3)]
        top = [bm.verts.new((sx * x, -0.03, y)) for x, y in pts]
        bot = [bm.verts.new((sx * x, 0.03, y)) for x, y in pts]
        f1 = bm.faces.new(top if sx > 0 else list(reversed(top)))
        f2 = bm.faces.new(list(reversed(bot)) if sx > 0 else bot)
        n = len(pts)
        for i in range(n):
            q = (top[i], top[(i + 1) % n], bot[(i + 1) % n], bot[i])
            bm.faces.new(q if sx < 0 else tuple(reversed(q)))
    B.add(wing, paint, '#2f8a8a', M((sx * 0.2, 0, 2.25)), streak=0.15)
    for k in range(3):
        B.add(box(0.12, 0.07, 0.04), paint, '#c8a040', M((sx * (0.32 + k * 0.12), 0, 2.36 + k * 0.03)))

# copper coil wound around the upper pole (helix of short segments)
pts = []
for j in range(70):
    t = j / 69
    ang = t * TAU * 7
    pts.append(Vector((math.cos(ang) * 0.255, math.sin(ang) * 0.255, 1.72 + t * 0.2)))
for j in range(len(pts) - 1):
    m, ln = look_m(pts[j], pts[j + 1])
    B.add(cyl(0.016, 0.016, ln * 1.1, 5), copper, '#d07a45', m)

# salvaged battery strapped at the foot, cabled up the pole
bp = M((0.38, -0.42, 0.0), (0, 0, 0.5))
B.add(box(0.34, 0.24, 0.3), get_mat('BatteryCase', 0.5, 0.2), '#2f4a2a', bp, deform=jitter(0.006, 50, 6))
B.add(box(0.36, 0.26, 0.04), metal, '#3a3632', bp @ M((0, 0, 0.3)))
for sx in (-1, 1):
    B.add(cyl(0.025, 0.025, 0.06, 8), copper, '#d07a45', bp @ M((sx * 0.1, 0, 0.34)))
B.add(box(0.36, 0.03, 0.05), rope, '#6a4a2a', bp @ M((0, -0.125, 0.14)))
# cable: from battery terminal, around the pole, up to the coil
cable = [Vector(bp @ Vector((0.1, 0, 0.4))), Vector((0.3, -0.3, 0.55)), Vector((0.26, -0.12, 0.8)), Vector((0.27, 0.05, 1.1)), Vector((0.26, 0.1, 1.4)), Vector((0.25, 0.0, 1.72))]
for j in range(len(cable) - 1):
    m, ln = look_m(cable[j], cable[j + 1])
    B.add(cyl(0.022, 0.022, ln * 1.05, 6), rubber, '#1e1e1e', m)
cable2 = [Vector(bp @ Vector((-0.1, 0, 0.4))), Vector((0.1, -0.5, 0.35)), Vector((-0.1, -0.45, 0.15)), Vector((-0.3, -0.3, 0.12))]
for j in range(len(cable2) - 1):
    m, ln = look_m(cable2[j], cable2[j + 1])
    B.add(cyl(0.02, 0.02, ln * 1.05, 6), rubber, '#5a1e1a', m)

# crown: a copper collar with four prongs, little ball tips
B.add(cyl(0.26, 0.3, 0.12, 16), copper, '#c86f3c', M((0, 0, PH - 0.05)))
B.add(torus(0.29, 0.02, 16, 4), metal, '#3a3632', M((0, 0, PH)))
for i in range(4):
    a = i / 4 * TAU + math.pi / 4
    m, ln = look_m((math.cos(a) * 0.22, math.sin(a) * 0.22, PH + 0.05), (math.cos(a) * 0.38, math.sin(a) * 0.38, PH + 0.62))
    B.add(cyl(0.022, 0.012, ln, 6), copper, '#d07a45', m)
    B.add(sphere(0.04, 8, 6), copper, '#e09060', M((math.cos(a) * 0.38, math.sin(a) * 0.38, PH + 0.64)), smooth=True)
# the vacuum tube itself: socket, glass envelope, glowing filament
B.add(cyl(0.11, 0.1, 0.1, 12), rubber, '#1e1e1e', M((0, 0, PH + 0.07)))
B.add(ringed_cyl(0.085, 0.06, 0.32, 12, 4), glass, '#bfe3ea', M((0, 0, PH + 0.17)), deform=lambda co: Vector((co.x * (1 + 0.25 * math.sin(co.z / 0.32 * math.pi)), co.y * (1 + 0.25 * math.sin(co.z / 0.32 * math.pi)), co.z)), smooth=True)
B.add(box(0.05, 0.012, 0.16), filament, (1, 1, 1), M((0, 0, PH + 0.22)))
# hanging talismans: feathers and bones on twine from the wings
for sx in (-1, 1):
    for k in range(2):
        x = sx * (0.5 + k * 0.15)
        B.add(cyl(0.004, 0.004, 0.3, 4), rope, '#c8b088', M((x, 0, 2.0)))
        B.add(leaf(0.14, 0.05, 0.0, 0.0, 3), get_mat('LeafDS', 0.7, double=True), '#e0d8c4' if k else '#a8302a', M((x, 0, 2.0), (math.pi, 0, rnd.uniform(0, TAU))))
body = B.build(coll, root)

# ---------------------------------------------------------------- orb + rings
O = Part('Orb', 4)
O.add(ico(0.16, 3), glow, (1, 1, 1), smooth=True)
for i in range(6):
    m, ln = look_m((0, 0, 0), Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.6, 1))).normalized() * 0.26)
    O.add(cyl(0.02, 0.0, ln, 4), glow, (1, 1, 1), m)
orb = O.build(coll, root, (0, 0, PH + 0.85))

R = Part('Rings', 6)
for i, (r, tilt) in enumerate([(0.3, 0.5), (0.36, -0.6)]):
    R.add(torus(r, 0.014, 28, 4), copper, '#d88a50', M((0, 0, 0), (tilt, 0.2 * i, 0)))
rings = R.build(coll, root, (0, 0, PH + 0.85))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
