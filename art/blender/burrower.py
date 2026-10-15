# Burrower: an armoured grub the length of a man, plated in stone-hard crust, with a wedge of
# a head and two great shovel claws. It digs under walls and comes up on the far side.
# Forward is -Y (glTF +Z). Origin on the ground under the body.
# Animated nodes: "Head" (pivot at neck) > "Jaw", "LegFL" "LegFR" (the shovel claws, pivot at
# the shoulder), "LegBL" "LegBR" (stubby hind legs), "Tail" (pivot at base). The rest is "Body".
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Burrower')
root = root_empty('Burrower', coll)
rnd = random.Random(47)

bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.7)
bone = get_mat('Bone', 0.65)
glow = get_mat('BlightGlow', 0.3, emit=(0.7, 0.18, 1.0), strength=3.0)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.45, 0.95), strength=8.0)
soil = get_mat('Soil', 0.95)

DARK = '#3b3631'
PLATE = '#5e5648'
BODY_Z = 0.34

# ---------------------------------------------------------------- body: six overlapping plates
B = Part('Body', 1)
SEG = 6
for k in range(SEG):
    y = -0.3 + k * 0.15
    s = 1.0 - 0.06 * abs(k - 1.5)
    # the soft core under each plate
    B.add(sphere(0.22, 12, 8), bark, DARK, M((0, y, BODY_Z), (0, 0, 0), (1.05 * s, 0.7, 0.85 * s)), smooth=True, streak=0.3)
    # the plate: a squashed half-shell, overlapping the next one back
    def shell(bm, s=s):
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
        for v in bm.verts:
            if v.co.z < -0.15:
                v.co.z = -0.15
    B.add(shell, crust, PLATE, M((0, y + 0.03, BODY_Z + 0.05), (0.18, 0, 0), (0.26 * s, 0.13, 0.22 * s)), deform=jitter(0.012, 10 + k, 7), smooth=None)
    # glowing seam behind each plate
    if k < SEG - 1:
        B.add(torus(0.2 * s, 0.014, 14, 4), glow, (1, 1, 1), M((0, y + 0.1, BODY_Z + 0.02), (math.pi / 2 + 0.2, 0, 0), (1.1, 1, 0.9)))
    # ridge knobs along the spine
    B.add(cone(0.035, 0.09, 5), bone, '#a89a7c', M((0, y + 0.02, BODY_Z + 0.25 * s), (0.4, 0, 0)))
# clods of earth stuck to its flanks
for k in range(7):
    p = Vector((rnd.choice((-1, 1)) * rnd.uniform(0.18, 0.24), rnd.uniform(-0.3, 0.45), BODY_Z + rnd.uniform(-0.15, 0.05)))
    B.add(ico(rnd.uniform(0.03, 0.06), 1), soil, rnd.choice(['#4a3a2a', '#5a4632', '#3e3226']), M(p), deform=jitter(0.01, 30 + k, 9), smooth=False)
body = B.build(coll, root)

# ---------------------------------------------------------------- head: a digging wedge
NECK = Vector((0, -0.38, BODY_Z + 0.02))
Hd = Part('Head', 2)
def wedge(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for v in bm.verts:
        if v.co.y < 0:
            v.co.y *= 1.7
            v.co.z *= 1 - 0.45 * (-v.co.y / 1.7)
Hd.add(wedge, crust, PLATE, M((0, -0.12, 0), (0.1, 0, 0), (0.17, 0.14, 0.13)), deform=jitter(0.01, 3, 10), smooth=None)
# a bony digging blade along the brow
mm, ll = look_m((0, -0.05, 0.11), (0, -0.33, 0.02))
Hd.add(cone(0.06, ll, 4), bone, '#d2c6a6', mm @ M((0, 0, 0), (0, 0, math.pi / 4), (1.6, 0.5, 1)))
for sx in (-1, 1):
    # small eyes, deep set
    for k in range(2):
        Hd.add(sphere(0.022 - k * 0.006, 8, 6), eyeg, (1, 1, 1), M((sx * (0.1 - k * 0.012), -0.14 + k * 0.05, 0.05)), smooth=True)
    # mandibles
    mm, ll = look_m((sx * 0.08, -0.26, -0.04), (sx * 0.02, -0.4, -0.06))
    Hd.add(cone(0.03, ll, 5), bone, '#e0d6bc', mm)
Hd.add(sphere(0.05, 8, 6), glow, (1, 1, 1), M((0, -0.22, -0.06)))
head = Hd.build(coll, root, NECK)

J = Part('Jaw', 3)
J.add(box(0.14, 0.14, 0.04), crust, '#4e463a', M((0, -0.08, 0), (0.1, 0, 0)), deform=jitter(0.008, 9, 9))
for x in (-0.05, -0.02, 0.02, 0.05):
    J.add(cone(0.012, 0.05, 4), bone, '#e0d6bc', M((x, -0.15, 0.01), (-1.3, 0, 0)))
jaw = J.build(coll, head, (0, -0.1, -0.08))

# ---------------------------------------------------------------- shovel claws (front)
def claw(name, sx, seed):
    P = Part(name, seed)
    elbow = Vector((sx * 0.14, -0.1, -0.12))
    hand = Vector((sx * 0.2, -0.22, -BODY_Z + 0.06))
    mm, ll = look_m((0, 0, 0), elbow)
    P.add(ringed_cyl(0.075, 0.06, ll, 8, 3), bark, DARK, mm, smooth=True, streak=0.3)
    mm, ll = look_m(elbow, hand)
    P.add(ringed_cyl(0.06, 0.05, ll, 8, 3), crust, PLATE, mm, smooth=True)
    P.add(sphere(0.03, 6, 4), glow, (1, 1, 1), M(elbow))
    # a broad spade of a hand with four thick nails
    P.add(box(0.16, 0.1, 0.04), crust, PLATE, M(hand + Vector((0, -0.03, 0.0)), (0.5, 0, sx * 0.2)), deform=jitter(0.01, seed, 8))
    for k in range(4):
        x = (k - 1.5) * 0.04
        mm, ll = look_m(hand + Vector((x, -0.06, 0)), hand + Vector((x * 1.3, -0.17, -0.04)))
        P.add(cone(0.02, ll, 5), bone, '#d8ceb4', mm)
    return P.build(coll, root, (sx * 0.17, -0.26, BODY_Z - 0.02))

def hind(name, sx, seed):
    P = Part(name, seed)
    foot = Vector((sx * 0.1, 0.06, -BODY_Z + 0.03))
    mm, ll = look_m((0, 0, 0), foot)
    P.add(ringed_cyl(0.05, 0.03, ll, 7, 3), bark, DARK, mm, smooth=True)
    for k in (-1, 1):
        mm, ll = look_m(foot, foot + Vector((k * 0.03, -0.06, -0.02)))
        P.add(cone(0.014, ll, 4), bone, '#d8ceb4', mm)
    return P.build(coll, root, (sx * 0.15, 0.3, BODY_Z - 0.06))

legs = [claw('LegFL', -1, 11), claw('LegFR', 1, 12), hind('LegBL', -1, 13), hind('LegBR', 1, 14)]

# ---------------------------------------------------------------- tail: tapering plates and a spike
T = Part('Tail', 9)
for k in range(3):
    y = k * 0.11
    s = 0.15 - k * 0.035
    T.add(sphere(s, 10, 6), crust, PLATE, M((0, y, 0.02 * k), (0, 0, 0), (1, 0.8, 0.8)), smooth=True)
mm, ll = look_m((0, 0.28, 0.06), (0, 0.48, 0.16))
T.add(cone(0.04, ll, 5), bone, '#cfc4a8', mm)
tail = T.build(coll, root, (0, 0.5, BODY_Z - 0.04))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
