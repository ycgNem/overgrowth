# Blightling: the swarm enemy. A spindly, hunched thing of blackened bark held together by
# purple blight-light, with thorn spines, a split jaw and four jointed legs.
# Forward is -Y (glTF +Z). Origin on the ground under the body.
# Animated nodes: "Head" (pivot at neck) > "Jaw", "LegFL" "LegFR" "LegBL" "LegBR" (pivot at hip),
# "Tail" (pivot at base). Everything else is "Body".
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Blightling')
root = root_empty('Blightling', coll)
rnd = random.Random(66)

bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.75)
bone = get_mat('Bone', 0.7)
fung = get_mat('Fungus', 0.6)
glow = get_mat('BlightGlow', 0.3, emit=(0.7, 0.18, 1.0), strength=3.0)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.45, 0.95), strength=8.0)
leafm = get_mat('LeafDS', 0.7, double=True)

DARK = '#3c3836'
MID = '#5c564a'
BODY_Z = 0.56

# ---------------------------------------------------------------- torso
B = Part('Body', 1)
# hunched, twisted barrel running along Y, higher at the shoulders
L = 0.78
m, ln = look_m((0, 0.36, BODY_Z - 0.02), (0, -0.4, BODY_Z + 0.14), 0)
def torso(co, ln=ln):
    t = co.z / ln
    bulge = 0.75 + 0.45 * math.sin(t * math.pi) ** 0.7 + 0.25 * t  # chest heavier than hips
    d = gnarl(0.05, 4.0, 1.1, (0, 0), ln, 5)(co)
    return Vector((d.x * bulge * 1.05, d.y * bulge * 0.9, d.z))
B.add(ringed_cyl(0.17, 0.15, ln, 12, 10), bark, DARK, m, deform=torso, smooth=True, streak=0.45)
# ribs: bark plates wrapping the belly
for k in range(5):
    t = 0.25 + k * 0.12
    p = axis_point(m, torso, ln * t)
    B.add(torus(0.17 + 0.03 * math.sin(t * math.pi), 0.025, 12, 4), crust, MID, M(p, (math.pi / 2 - 0.15, 0, 0), (1.05, 0.9, 1)), deform=jitter(0.01, 10 + k, 8))
# blight cracks glowing between the plates
for k in range(4):
    t = 0.3 + k * 0.13
    p = axis_point(m, torso, ln * t)
    for sx in (-1, 1):
        q = p + Vector((sx * 0.19, 0, 0.04))
        mm, ll = look_m(q + Vector((0, 0.04, 0.05)), q + Vector((sx * 0.01, -0.05, -0.07)))
        B.add(cyl(0.012, 0.008, ll, 4), glow, (1, 1, 1), mm)
# thorn spines along the back, longest over the shoulders, pale with glowing tips
for k in range(7):
    t = 0.14 + k * 0.12
    p = axis_point(m, torso, ln * t) + Vector((0, 0, 0.17 + 0.05 * math.sin(t * math.pi)))
    h = 0.12 + 0.2 * math.sin(t * math.pi) ** 1.5
    for sx in ((-1, 1) if k % 2 else (0,)):
        lean = rnd.uniform(0.08, 0.2)
        mm, ll = look_m(p + Vector((sx * 0.05, 0, -0.03)), p + Vector((sx * 0.14 + rnd.uniform(-0.03, 0.03), lean, h)))
        B.add(cone(0.035, ll, 5), bone, '#a8997a', mm, deform=jitter(0.006, 30 + k, 9))
        B.add(cone(0.012, 0.05, 4), glow, (1, 1, 1), mm @ M((0, 0, ll * 0.82)))
# fungal clusters on the shoulders
for sx in (-1, 1):
    base = axis_point(m, torso, ln * 0.75) + Vector((sx * 0.17, 0, 0.08))
    for k in range(4):
        p = base + Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.06, 0.06), rnd.uniform(0, 0.05)))
        B.add(sphere(rnd.uniform(0.03, 0.05), 8, 5), fung, rnd.choice(['#5a3a52', '#6a4058', '#4e3448']), M(p, (0, sx * 0.6, 0), (1, 1, 0.55)), smooth=True)
# hanging moss/vine scraps under the belly
for k in range(4):
    p = axis_point(m, torso, ln * (0.3 + k * 0.15)) + Vector((rnd.uniform(-0.08, 0.08), 0, -0.14))
    lm = Matrix.Translation(p) @ Euler((math.pi + rnd.uniform(-0.3, 0.3), 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
    B.add(leaf(0.16, 0.06, 0.1, -0.2, 4), leafm, '#5a6a2a', lm)
body = B.build(coll, root)

# ---------------------------------------------------------------- head + jaw (pivot at neck)
NECK = Vector((0, -0.4, BODY_Z + 0.16))
Hd = Part('Head', 2)
# elongated skull, pushed forward and down, with a brow ridge
def skull(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for v in bm.verts:
        y = v.co.y
        if y < 0:
            v.co.y = y * 2.1  # long snout
            v.co.z *= 1 - 0.35 * (-y)
        v.co.x *= 0.85
Hd.add(skull, bark, DARK, M((0, -0.13, 0.0), (0.18, 0, 0), (0.13, 0.13, 0.12)), deform=jitter(0.008, 3, 12), smooth=True, streak=0.4)
for sx in (-1, 1):
    # brow horns curling back
    mm, ll = look_m((sx * 0.07, -0.12, 0.08), (sx * 0.16, 0.1, 0.2))
    Hd.add(ringed_cyl(0.035, 0.005, ll, 6, 4), bone, '#cfc4a8', mm, deform=lambda co, ll=ll: Vector((co.x, co.y + 0.06 * (co.z / ll) ** 2, co.z)), smooth=True)
    # three glowing eyes per side, in a slanted row
    for k in range(3):
        Hd.add(sphere(0.034 - k * 0.008, 8, 6), eyeg, (1, 1, 1), M((sx * (0.09 - k * 0.01), -0.21 + k * 0.055, 0.05 + k * 0.02)), smooth=True)
    # cheek plates
    Hd.add(box(0.03, 0.12, 0.07), crust, MID, M((sx * 0.1, -0.16, -0.04), (0, sx * 0.25, sx * 0.2)), deform=jitter(0.006, 40 + sx, 10))
# upper fangs
for k, x in enumerate((-0.05, -0.02, 0.02, 0.05)):
    Hd.add(cone(0.014, 0.08 if abs(x) > 0.03 else 0.05, 4), bone, '#e0d6bc', M((x, -0.34 + abs(x) * 0.8, -0.05), (math.pi, 0, 0)))
# glowing throat behind the jaw
Hd.add(sphere(0.05, 8, 6), glow, (1, 1, 1), M((0, -0.16, -0.06)))
head = Hd.build(coll, root, NECK)

J = Part('Jaw', 3)
def jaw(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    for v in bm.verts:
        if v.co.z > 0.2:
            v.co.z = 0.2
        if v.co.y < 0:
            v.co.y *= 1.6
J.add(jaw, crust, MID, M((0, -0.14, -0.02), (0, 0, 0), (0.09, 0.14, 0.06)), smooth=True, streak=0.3)
for x in (-0.05, -0.025, 0.025, 0.05):
    J.add(cone(0.012, 0.06, 4), bone, '#e0d6bc', M((x, -0.3 + abs(x) * 0.8, -0.02)))
jawo = J.build(coll, head, (0, -0.06, -0.06))
jawo.rotation_euler = (0.35, 0, 0)  # hanging open

# ---------------------------------------------------------------- legs (pivot at hip)
def make_leg(name, sx, front, seed):
    P = Part(name, seed)
    fwd = -1 if front else 1
    knee = Vector((sx * 0.2, fwd * 0.08 + (0.1 if front else -0.06), -0.2 if front else -0.16))
    foot = Vector((sx * 0.26, fwd * 0.12, -BODY_Z + 0.02 + (0.0 if front else 0.04)))
    hipz = 0 if front else 0.04
    # thigh: thick, bark plated
    mm, ll = look_m((0, 0, hipz), knee)
    P.add(ringed_cyl(0.065, 0.04, ll, 8, 4), bark, DARK, mm, deform=gnarl(0.04, 6, 0.4, (0, 0), ll, seed), smooth=True, streak=0.4)
    # knee spur
    mm2, _ = look_m(knee, knee + Vector((sx * 0.03, fwd * -0.02, 0.12)))
    P.add(cone(0.025, 0.1, 5), bone, '#cfc4a8', mm2)
    # shin: spindly, kinked
    mid = knee.lerp(foot, 0.5) + Vector((sx * 0.03, fwd * -0.03, 0))
    for a, b, r1, r2 in ((knee, mid, 0.038, 0.028), (mid, foot, 0.028, 0.018)):
        mm, ll = look_m(a, b)
        P.add(ringed_cyl(r1, r2, ll, 7, 2), bark, MID, mm, smooth=True, streak=0.3)
    # glow at the joint
    P.add(sphere(0.022, 6, 4), glow, (1, 1, 1), M(mid))
    # three hooked claws
    for k in (-1, 0, 1):
        d = Vector((k * 0.06 + sx * 0.02, fwd * -0.08 if front else 0.07, -0.03))
        mm, ll = look_m(foot, foot + d)
        P.add(cone(0.016, ll, 4), bone, '#d8ceb4', mm)
    return P.build(coll, root, (sx * 0.12, (-0.22 if front else 0.28), BODY_Z + (0.02 if front else -0.03)))

legs = [make_leg('LegFL', -1, True, 11), make_leg('LegFR', 1, True, 12), make_leg('LegBL', -1, False, 13), make_leg('LegBR', 1, False, 14)]

# ---------------------------------------------------------------- tail: vine whip with a glowing pod
T = Part('Tail', 9)
pts = [Vector((0, 0, 0)), Vector((0, 0.18, 0.06)), Vector((0, 0.34, 0.16)), Vector((0.04, 0.46, 0.3)), Vector((0.08, 0.52, 0.42))]
for j in range(len(pts) - 1):
    mm, ll = look_m(pts[j], pts[j + 1])
    r = 0.05 * (1 - j / len(pts)) + 0.012
    T.add(ringed_cyl(r, r * 0.8, ll * 1.08, 7, 2), bark, DARK, mm, smooth=True, streak=0.4)
    T.add(cone(0.014, 0.06, 4), bone, '#cfc4a8', M(pts[j] + Vector((0, 0, r)), (-0.6, 0, 0)))
T.add(sphere(0.06, 10, 7), glow, (1, 1, 1), M(pts[-1], (0, 0, 0), (1, 1, 1.3)), smooth=True)
for k in range(4):
    a = k / 4 * TAU
    lm = Matrix.Translation(pts[-1] + Vector((0, 0, -0.04))) @ Euler((0.5, 0, a)).to_matrix().to_4x4()
    T.add(leaf(0.1, 0.06, 0.3, -0.1, 3), fung, '#5a2e6a', lm)
tail = T.build(coll, root, (0, 0.36, BODY_Z - 0.0))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
