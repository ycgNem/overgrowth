# Blight Wisp: the flying enemy (night 4+). A hollow bark mask with three burning eyes, a
# purple heart-light behind it, moth wings of rotten leaf and a long ragged mantle of moss
# and vine strips trailing beneath. It ignores walls and drifts straight for the Heartwood.
# Forward is -Y (glTF +Z). The origin is the centre of the core: it floats.
# Animated nodes: "WingL" "WingR" (pivot at the shoulder), "Tail" (pivot under the core),
# "Core" (pulse).
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Wisp')
root = root_empty('Wisp', coll)
rnd = random.Random(91)

bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.75)
bone = get_mat('Bone', 0.7)
leafm = get_mat('LeafDS', 0.7, double=True)
moss = get_mat('MossDS', 1.0, double=True)
glow = get_mat('BlightGlow', 0.3, emit=(0.7, 0.18, 1.0), strength=3.0)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.45, 0.95), strength=8.0)
vein = get_mat('VeinGlow', 0.3, emit=(0.85, 0.35, 1.0), strength=2.2)

DARK = '#4e3a44'
MID = '#76606a'

# ---------------------------------------------------------------- mask + hood (Body)
B = Part('Body', 1)
# the mask: a dished, cracked bark face, longer than wide, pointing forward (-Y)
def mask(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=1.0)
    for v in bm.verts:
        # hollow it: push the back half forward so it reads as a shell
        if v.co.y > 0.1:
            v.co.y = 0.1 + (v.co.y - 0.1) * 0.25
        v.co.z *= 1.25 if v.co.z > 0 else 1.05
        v.co.x *= 0.85
B.add(mask, bark, DARK, M((0, -0.16, 0.02), (0.1, 0, 0), (0.17, 0.14, 0.17)), deform=jitter(0.012, 4, 9), smooth=True, streak=0.5)
# brow ridge and cheek plates
B.add(box(0.26, 0.06, 0.05), crust, MID, M((0, -0.28, 0.08), (0.25, 0, 0)), deform=jitter(0.01, 6, 10))
for sx in (-1, 1):
    B.add(box(0.05, 0.1, 0.12), crust, MID, M((sx * 0.12, -0.24, -0.06), (0.2, sx * 0.35, sx * 0.2)), deform=jitter(0.01, 7 + sx, 10))
    # swept-back horns, long and thin, pale bone
    mm, ll = look_m((sx * 0.1, -0.18, 0.15), (sx * 0.3, 0.22, 0.42))
    B.add(ringed_cyl(0.03, 0.004, ll, 6, 5), bone, '#d4c8ac', mm, deform=lambda co, ll=ll: Vector((co.x, co.y + 0.08 * (co.z / ll) ** 2, co.z)), smooth=True)
# three eyes in a triangle, hot pink
for x, z, r in ((-0.06, 0.03, 0.032), (0.06, 0.03, 0.032), (0.0, 0.11, 0.024)):
    B.add(sphere(r, 8, 6), eyeg, (1, 1, 1), M((x, -0.3, z)), smooth=True)
# mouth slit glowing
B.add(box(0.1, 0.02, 0.018), glow, (1, 1, 1), M((0, -0.3, -0.08)))
# the hood: tattered leaf cards fanned behind the mask
for k in range(11):
    a = (k / 10 - 0.5) * 2.6
    lm = Matrix.Translation((math.sin(a) * 0.14, 0.0, 0.12 + math.cos(a) * 0.06)) @ Euler((-0.9 + rnd.uniform(-0.15, 0.15), 0, a)).to_matrix().to_4x4()
    B.add(leaf(0.28, 0.12, 0.25, 0.25, 4), leafm, rnd.choice(['#3e2c36', '#4a3442', '#36262f']), lm, var=0.15)
# thorn collar under the chin
for k in range(7):
    a = (k / 7) * TAU
    mm, ll = look_m((math.cos(a) * 0.1, math.sin(a) * 0.08 + 0.02, -0.12), (math.cos(a) * 0.2, math.sin(a) * 0.16 + 0.04, -0.22))
    B.add(cone(0.018, ll, 4), bone, '#b8aa8c', mm)
body = B.build(coll, root)

# ---------------------------------------------------------------- core (pulses)
C = Part('Core', 2)
C.add(ico(0.11, 2), glow, (1, 1, 1), M((0, 0.04, 0.0)))
# a cage of twigs around the light
for k in range(6):
    a = k / 6 * TAU
    pts = [Vector((math.cos(a) * 0.05, 0.04 + math.sin(a) * 0.05, -0.15)), Vector((math.cos(a) * 0.16, 0.04 + math.sin(a) * 0.16, 0.0)), Vector((math.cos(a) * 0.05, 0.04 + math.sin(a) * 0.05, 0.15))]
    for j in range(2):
        mm, ll = look_m(pts[j], pts[j + 1])
        C.add(cyl(0.012, 0.01, ll, 4), bark, DARK, mm)
core = C.build(coll, root)

# ---------------------------------------------------------------- wings (pivot at the shoulder)
def wing(name, sx, seed):
    W = Part(name, seed)
    # three long moth-leaf panes per wing, veined with blight light
    for k, (ang, L, Wd) in enumerate(((0.35, 0.62, 0.3), (0.0, 0.5, 0.26), (-0.4, 0.38, 0.2))):
        lm = Euler((0, 0, 0)).to_matrix().to_4x4()
        # lay the leaf out sideways (+x for the right wing), fanned and slightly swept back
        lm = Matrix.Rotation(sx * (math.pi / 2), 4, 'Y') @ Matrix.Rotation(ang * sx, 4, 'X')
        lm = Matrix.Rotation(-0.25 * sx, 4, 'Z') @ lm
        W.add(leaf(L, Wd, 0.08, -0.05, 5), leafm, rnd.choice(['#5a3e52', '#4d3448', '#634660']), lm, var=0.12)
        # the vein: a thin glowing rod along the leaf's midrib
        d = lm @ Vector((0, 0, L * 0.9))
        mm, ll = look_m((0, 0, 0), d)
        W.add(cyl(0.008, 0.003, ll, 4), vein, (1, 1, 1), mm)
    # a bone strut along the leading edge
    d = Matrix.Rotation(-0.25 * sx, 4, 'Z') @ Matrix.Rotation(sx * (math.pi / 2), 4, 'Y') @ Matrix.Rotation(0.5 * sx, 4, 'X') @ Vector((0, 0, 0.66))
    mm, ll = look_m((0, 0, 0), d)
    W.add(ringed_cyl(0.022, 0.006, ll, 5, 3), bone, '#c8bca0', mm, smooth=True)
    return W.build(coll, root, (sx * 0.12, 0.08, 0.1))

wl = wing('WingL', -1, 11)
wr = wing('WingR', 1, 12)

# ---------------------------------------------------------------- mantle / tail (pivot under the core)
T = Part('Tail', 9)
for k in range(9):
    a = k / 9 * TAU + rnd.uniform(-0.2, 0.2)
    r0 = 0.08
    top = Vector((math.cos(a) * r0, 0.06 + math.sin(a) * r0, 0))
    L = rnd.uniform(0.55, 0.95)
    # a long ragged strip hanging down and trailing back (+Y)
    lm = Matrix.Translation(top) @ Euler((math.pi - 0.45 + rnd.uniform(-0.15, 0.15), 0, a + math.pi / 2)).to_matrix().to_4x4()
    T.add(leaf(L, rnd.uniform(0.08, 0.13), 0.1, -0.3, 6), moss, rnd.choice(['#3c4a28', '#4a4030', '#3a3040', '#45583a']), lm, var=0.2)
# vine tendrils with glowing tips
for k in range(4):
    a = k / 4 * TAU + 0.4
    pts = [Vector((math.cos(a) * 0.05, 0.06 + math.sin(a) * 0.05, 0))]
    for j in range(4):
        p = pts[-1] + Vector((math.cos(a) * 0.04 + rnd.uniform(-0.03, 0.03), 0.1 + rnd.uniform(0, 0.05), -0.16))
        pts.append(p)
    for j in range(len(pts) - 1):
        mm, ll = look_m(pts[j], pts[j + 1])
        T.add(cyl(0.016 * (1 - j / 5), 0.012 * (1 - j / 5), ll * 1.05, 5), bark, DARK, mm)
    T.add(sphere(0.025, 6, 4), glow, (1, 1, 1), M(pts[-1]))
tail = T.build(coll, root, (0, 0.04, -0.12))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
