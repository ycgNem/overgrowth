# Spitter: the Blight's artillery. A squat, low thing of blackened bark on four splayed legs,
# carrying a swollen sac of sick green bile on its back. It raises a long tube of a mouth and
# lobs globs of the stuff at towers from range.
# Forward is -Y (glTF +Z). Origin on the ground under the body.
# Animated nodes: "Head" (pivot at neck) > "Jaw", "Sac" (pivot at its base, swells before a
# shot), "LegFL" "LegFR" "LegBL" "LegBR" (pivot at hip). Everything else is "Body".
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Spitter')
root = root_empty('Spitter', coll)
rnd = random.Random(31)

bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.75)
bone = get_mat('Bone', 0.7)
fung = get_mat('Fungus', 0.6)
bile = get_mat('BileGlow', 0.25, emit=(0.32, 0.8, 0.08), strength=1.1)
glow = get_mat('BlightGlow', 0.3, emit=(0.7, 0.18, 1.0), strength=3.0)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.45, 0.95), strength=8.0)

DARK = '#3a3532'
MID = '#58503f'
BODY_Z = 0.42

# ---------------------------------------------------------------- body: a low, wide barrel
B = Part('Body', 1)
m, ln = look_m((0, 0.4, BODY_Z), (0, -0.36, BODY_Z + 0.06), 0)
def torso(co, ln=ln):
    t = co.z / ln
    bulge = 0.85 + 0.4 * max(0.0, math.sin(t * math.pi)) ** 0.6
    d = gnarl(0.05, 3.5, 0.6, (0, 0), ln, 4)(co)
    return Vector((d.x * bulge * 1.35, d.y * bulge * 0.85, d.z))
B.add(ringed_cyl(0.2, 0.17, ln, 12, 10), bark, DARK, m, deform=torso, smooth=True, streak=0.45)
# belly plates
for k in range(5):
    t = 0.18 + k * 0.15
    p = axis_point(m, torso, ln * t) + Vector((0, 0, -0.1))
    B.add(box(0.36 - 0.03 * abs(k - 2), 0.12, 0.05), crust, MID, M(p, (0.1, 0, 0)), deform=jitter(0.012, 20 + k, 8))
# a collar of bark spines where the sac sits
for k in range(9):
    a = k / 9 * TAU
    p = Vector((math.cos(a) * 0.24, 0.05 + math.sin(a) * 0.2, BODY_Z + 0.16))
    mm, ll = look_m(p, p + Vector((math.cos(a) * 0.12, math.sin(a) * 0.1, 0.16 + rnd.uniform(0, 0.08))))
    B.add(cone(0.03, ll, 5), bone, '#a69878', mm, deform=jitter(0.006, 40 + k, 9))
# veins of bile running from the sac down the flanks
for sx in (-1, 1):
    for k in range(3):
        q = Vector((sx * 0.26, -0.12 + k * 0.16, BODY_Z + 0.08))
        mm, ll = look_m(q, q + Vector((sx * 0.06, rnd.uniform(-0.05, 0.05), -0.18)))
        B.add(cyl(0.014, 0.008, ll, 4), bile, (1, 1, 1), mm)
# fungus on the rump
for k in range(5):
    p = Vector((rnd.uniform(-0.18, 0.18), 0.36 + rnd.uniform(-0.05, 0.05), BODY_Z + rnd.uniform(0.0, 0.12)))
    B.add(sphere(rnd.uniform(0.03, 0.05), 8, 5), fung, rnd.choice(['#5a3a52', '#6a4058']), M(p, (0.4, 0, 0), (1, 1, 0.55)), smooth=True)
body = B.build(coll, root)

# ---------------------------------------------------------------- the sac (pivot at its base)
SAC = Vector((0, 0.06, BODY_Z + 0.16))
S = Part('Sac', 5)
def blob(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        n = noise.noise(v.co * 2.2 + Vector((3, 1, 7)))
        v.co *= 1 + 0.12 * n
        if v.co.z < -0.55:
            v.co.z = -0.55
S.add(blob, bile, (1, 1, 1), M((0, 0, 0.26), (0.15, 0, 0), (0.3, 0.34, 0.3)), smooth=True)
# dark ribs of crust binding it
for k in range(4):
    a = k / 4 * math.pi
    S.add(torus(0.31, 0.022, 18, 4), crust, '#2e2a26', M((0, 0, 0.26), (math.pi / 2, 0, a), (1, 1.1, 1)), deform=jitter(0.01, 60 + k, 7))
# a knot of crust on top with a pore
S.add(sphere(0.07, 8, 6), crust, '#2e2a26', M((0, 0.02, 0.55), (0, 0, 0), (1, 1, 0.6)), smooth=True)
sac = S.build(coll, root, SAC)

# ---------------------------------------------------------------- head (pivot at neck) + jaw
NECK = Vector((0, -0.38, BODY_Z + 0.08))
Hd = Part('Head', 2)
# a long, ringed neck-tube that ends in a puckered mouth
pts = [Vector((0, 0, 0)), Vector((0, -0.12, 0.1)), Vector((0, -0.22, 0.24)), Vector((0, -0.3, 0.34))]
for j in range(len(pts) - 1):
    mm, ll = look_m(pts[j], pts[j + 1])
    r = 0.1 - j * 0.018
    Hd.add(ringed_cyl(r, r * 0.88, ll * 1.06, 10, 3), bark, DARK, mm, smooth=True, streak=0.4)
mouth = pts[-1]
mm, ll = look_m(mouth, mouth + Vector((0, -0.05, 0.07)))
Hd.add(ringed_cyl(0.07, 0.085, ll, 10, 2), crust, MID, mm, smooth=True)
Hd.add(torus(0.07, 0.02, 12, 4), bile, (1, 1, 1), mm @ M((0, 0, ll)))
# eyes clustered either side of the tube
for sx in (-1, 1):
    for k in range(3):
        Hd.add(sphere(0.026 - k * 0.006, 8, 6), eyeg, (1, 1, 1), M((sx * (0.075 + k * 0.012), -0.18 + k * 0.05, 0.2 - k * 0.04)), smooth=True)
    # bony flanges behind the eyes
    mm, ll = look_m((sx * 0.07, -0.1, 0.16), (sx * 0.16, 0.0, 0.28))
    Hd.add(cone(0.035, ll, 5), bone, '#cfc4a8', mm)
head = Hd.build(coll, root, NECK)

J = Part('Jaw', 3)
# a lower lip-flap under the mouth
J.add(box(0.12, 0.1, 0.03), crust, MID, M((0, -0.04, 0), (0.2, 0, 0)), deform=jitter(0.008, 9, 9))
for x in (-0.04, 0, 0.04):
    J.add(cone(0.012, 0.05, 4), bone, '#e0d6bc', M((x, -0.08, 0.01), (-1.2, 0, 0)))
jaw = J.build(coll, head, mouth + Vector((0, -0.02, -0.06)))

# ---------------------------------------------------------------- four short splayed legs
def make_leg(name, sx, front, seed):
    P = Part(name, seed)
    fwd = -1 if front else 1
    knee = Vector((sx * 0.26, fwd * 0.06, 0.06))
    foot = Vector((sx * 0.36, fwd * 0.12, -BODY_Z + 0.02))
    mm, ll = look_m((0, 0, 0), knee)
    P.add(ringed_cyl(0.07, 0.05, ll, 8, 3), bark, DARK, mm, deform=gnarl(0.04, 6, 0.3, (0, 0), ll, seed), smooth=True, streak=0.4)
    mm, ll = look_m(knee, foot)
    P.add(ringed_cyl(0.05, 0.025, ll, 7, 3), bark, MID, mm, smooth=True, streak=0.3)
    P.add(sphere(0.03, 6, 4), glow, (1, 1, 1), M(knee))
    mm, _ = look_m(knee, knee + Vector((sx * 0.04, 0, 0.12)))
    P.add(cone(0.028, 0.12, 5), bone, '#cfc4a8', mm)
    for k in (-1, 0, 1):
        d = Vector((k * 0.05 + sx * 0.03, fwd * 0.06, -0.03))
        mm, ll = look_m(foot, foot + d)
        P.add(cone(0.016, ll, 4), bone, '#d8ceb4', mm)
    return P.build(coll, root, (sx * 0.2, (-0.22 if front else 0.26), BODY_Z - 0.04))

legs = [make_leg('LegFL', -1, True, 11), make_leg('LegFR', 1, True, 12), make_leg('LegBL', -1, False, 13), make_leg('LegBR', 1, False, 14)]

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
