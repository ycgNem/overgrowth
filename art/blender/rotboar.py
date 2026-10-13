# Rotboar: the tank enemy. A hulking boar of rotten, moss-backed wood with shelf fungi on
# its flanks, a ridge of snapped branches, bone tusks and glowing rot-cracks.
# Forward is -Y (glTF +Z). Origin on the ground under the body.
# Animated nodes: "Head" (pivot at neck), "LegFL" "LegFR" "LegBL" "LegBR" (pivot at hip), "Tail".
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Rotboar')
root = root_empty('Rotboar', coll)
rnd = random.Random(77)

bark = get_mat('Bark', 0.9)
crust = get_mat('Crust', 0.75)
bone = get_mat('Bone', 0.7)
moss = get_mat('Moss', 1.0)
fung = get_mat('Fungus', 0.6)
stone = get_mat('Stone', 0.92)
glow = get_mat('BlightGlow', 0.3, emit=(0.7, 0.18, 1.0), strength=3.0)
eyeg = get_mat('BlightEye', 0.2, emit=(1.0, 0.45, 0.95), strength=8.0)
leafm = get_mat('LeafDS', 0.7, double=True)
plant = get_mat('Plant', 0.8)
shroom = get_mat('Shroom', 0.6)

WOOD = '#7a5644'
DARKW = '#634a3e'
BZ = 0.82  # body centre height

# ---------------------------------------------------------------- body
B = Part('Body', 1)
m, ln = look_m((0, 0.75, BZ - 0.05), (0, -0.7, BZ + 0.08), 0)
def torso(co, ln=ln):
    t = co.z / ln
    # hunched: big shoulders (t~0.75), tapering rump
    prof = 0.62 + 0.5 * math.sin(min(1, t * 1.15) * math.pi) ** 0.6 + 0.2 * t
    d = gnarl(0.035, 3.0, 0.5, (0, 0), ln, 9)(co)
    hump = 0.12 * math.exp(-((t - 0.72) / 0.18) ** 2) if co.y > 0 else 0
    return Vector((d.x * prof * 1.0, d.y * prof * 0.92 + hump, d.z))
B.add(ringed_cyl(0.38, 0.33, ln, 16, 12), bark, WOOD, m, deform=torso, smooth=True, streak=0.45)
# rump cap so the back end isn't a flat disc
B.add(sphere(0.33, 12, 8), bark, WOOD, M((0, 0.76, BZ - 0.06), (0, 0, 0), (1.0, 0.7, 0.92)), smooth=True, streak=0.4, deform=jitter(0.02, 4, 4))
# bark plates over the flanks
for sx in (-1, 1):
    for k in range(5):
        t = 0.2 + k * 0.14
        p = axis_point(m, torso, ln * t)
        r = 0.4 + 0.12 * math.sin(t * math.pi)
        B.add(box(0.04, 0.17, 0.2), crust, '#6e5446', M(p + Vector((sx * r * 0.9, 0, 0.06)), (0, sx * 0.15, rnd.uniform(-0.1, 0.1))), deform=jitter(0.015, 10 + k * 2 + sx, 7), streak=0.3)
# glowing rot-cracks between plates
for sx in (-1, 1):
    for k in range(4):
        t = 0.27 + k * 0.14
        p = axis_point(m, torso, ln * t)
        r = 0.4 + 0.12 * math.sin(t * math.pi)
        q = p + Vector((sx * r * 0.93, 0, -0.08))
        mm, ll = look_m(q + Vector((0, 0.03, 0.07)), q + Vector((0, -0.04, -0.08)))
        B.add(cyl(0.011, 0.006, ll, 4), glow, (1, 1, 1), mm)
# moss blanket over the spine
for k in range(10):
    t = 0.1 + k * 0.085
    p = axis_point(m, torso, ln * t)
    r = 0.4 + 0.13 * math.sin(t * math.pi)
    B.add(ico(0.2 + 0.06 * math.sin(t * math.pi), 1), moss, rnd.choice(['#4f7a2a', '#5a8730', '#466c25']), M(p + Vector((0, 0, r * 0.82)), (0, 0, rnd.uniform(0, TAU)), (1.3, 1.2, 0.45)), deform=jitter(0.04, 30 + k), var=0.2)
# ridge of snapped branches and thorns along the back
for k in range(7):
    t = 0.2 + k * 0.1
    p = axis_point(m, torso, ln * t)
    r = 0.4 + 0.13 * math.sin(t * math.pi)
    base = p + Vector((rnd.uniform(-0.06, 0.06), 0, r * 0.85))
    h = 0.25 + 0.3 * math.sin(t * math.pi)
    tip = base + Vector((rnd.uniform(-0.1, 0.1), rnd.uniform(0.05, 0.2), h))
    mm, ll = look_m(base, tip)
    B.add(ringed_cyl(0.05, 0.012, ll, 6, 3), bark, '#7a5a42', mm, deform=gnarl(0.05, 6, 0.3, (0.02, 0), ll, 50 + k), smooth=True)
    # snapped pale end on some
    if k % 2:
        B.add(cyl(0.02, 0.0, 0.05, 5), get_mat('Wood', 0.85), '#c49a68', mm @ M((0, 0, ll)))
    # glowing bead on the tallest
    if 2 <= k <= 4:
        B.add(sphere(0.022, 6, 4), glow, (1, 1, 1), M(tip))
# shelf fungi stacked on the flanks
for sx in (-1, 1):
    for k in range(3):
        t = 0.3 + k * 0.17 + rnd.uniform(-0.03, 0.03)
        p = axis_point(m, torso, ln * t)
        r = 0.4 + 0.12 * math.sin(t * math.pi)
        base = p + Vector((sx * r * 1.02, 0, 0.18 - k * 0.08))
        def shelf(bm):
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0)
            for v in bm.verts:
                v.co.z *= 0.25 if v.co.z > 0 else 0.1
                if v.co.x * sx < 0:
                    v.co.x *= 0.2
        B.add(shelf, fung, rnd.choice(['#c09050', '#b07a40', '#d0a060']), M(base, (0, 0, 0), (0.16, 0.2, 0.2)), smooth=True, streak=0.3)
        B.add(torus(0.12, 0.012, 12, 3), fung, '#8a5a2a', M(base + Vector((sx * 0.03, 0, 0.005)), (0, 0, 0), (1.2, 1.5, 1)))
# mushrooms sprouting from the moss
for k in range(6):
    t = rnd.uniform(0.2, 0.8)
    p = axis_point(m, torso, ln * t)
    r = 0.4 + 0.13 * math.sin(t * math.pi)
    mushroom_parts(B, plant, shroom, M(p + Vector((rnd.uniform(-0.15, 0.15), 0, r * 0.9))), h=rnd.uniform(0.08, 0.15), r=rnd.uniform(0.04, 0.07),
                   cap=rnd.choice(['#7a3fa0', '#c2532e']), rot=(rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0), spots=plant, seed=k)
# trailing vines under the belly
for k in range(5):
    p = axis_point(m, torso, ln * (0.25 + k * 0.12)) + Vector((rnd.uniform(-0.2, 0.2), 0, -0.36))
    L = rnd.uniform(0.12, 0.25)
    B.add(cyl(0.01, 0.006, L, 4), plant, '#4a6d25', M(p - Vector((0, 0, L))))
    lm = Matrix.Translation(p - Vector((0, 0, L))) @ Euler((math.pi, 0, rnd.uniform(0, TAU))).to_matrix().to_4x4()
    B.add(leaf(0.1, 0.05, 0.2, 0.1, 3), leafm, '#4f8a30', lm)
body = B.build(coll, root)

# ---------------------------------------------------------------- head
NECK = Vector((0, -0.62, BZ + 0.05))
H = Part('Head', 2)
def head(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=1.0)
    for v in bm.verts:
        y = v.co.y
        if y < 0:
            k = -y
            v.co.y = y * 1.9  # long tapering snout
            v.co.x *= 1 - 0.4 * k
            v.co.z = v.co.z * (1 - 0.35 * k) - 0.25 * k
H.add(head, bark, WOOD, M((0, -0.22, -0.08), (0.25, 0, 0), (0.27, 0.26, 0.28)), deform=jitter(0.01, 3, 8), smooth=True, streak=0.4)
# snout disc with nostrils
snout = M((0, -0.67, -0.27), (1.2, 0, 0))
H.add(cyl(0.11, 0.12, 0.08, 14), crust, '#5a3e36', snout, smooth=True)
for sx in (-1, 1):
    H.add(cyl(0.025, 0.025, 0.02, 8), crust, '#1a1210', snout @ M((sx * 0.045, 0, 0.075)))
# brow plates and small glowing eyes deep under them
for sx in (-1, 1):
    H.add(box(0.12, 0.14, 0.05), crust, DARKW, M((sx * 0.13, -0.3, 0.08), (0.3, sx * 0.2, sx * 0.3)), deform=jitter(0.008, 10 + sx, 9))
    H.add(sphere(0.03, 8, 6), eyeg, (1, 1, 1), M((sx * 0.15, -0.36, 0.02)), smooth=True)
    # ears: bark leaves, laid back
    lm = Matrix.Translation((sx * 0.18, -0.08, 0.15)) @ Euler((-0.6, sx * 0.8, sx * 0.4)).to_matrix().to_4x4()
    H.add(leaf(0.22, 0.14, 0.4, 0.1, 4), get_mat('BarkDS', 0.9, double=True), '#5a4034', lm)
    # tusks: curved bone, sweeping up and out from the jaw
    mm, ll = look_m((sx * 0.1, -0.52, -0.3), (sx * 0.24, -0.66, 0.0))
    H.add(ringed_cyl(0.04, 0.008, ll, 8, 5), bone, '#e6dcc0', mm, deform=lambda co, ll=ll, sx=sx: Vector((co.x + sx * 0.05 * (co.z / ll) ** 2, co.y + 0.07 * (co.z / ll) ** 2, co.z)), smooth=True)
    # smaller lower tusk
    mm, ll = look_m((sx * 0.07, -0.45, -0.32), (sx * 0.14, -0.52, -0.16))
    H.add(cone(0.022, ll, 6), bone, '#d8ceb4', mm)
# lower jaw line + teeth
H.add(box(0.16, 0.34, 0.06), crust, '#4a342c', M((0, -0.45, -0.36), (0.25, 0, 0)), deform=jitter(0.008, 20, 9))
# moss cap on the head
H.add(ico(0.16, 1), moss, '#55802d', M((0, -0.1, 0.18), (0, 0, 0), (1.3, 1.5, 0.45)), deform=jitter(0.03, 40))
head_o = H.build(coll, root, NECK)
head_o.scale = (1.2, 1.2, 1.2)

# ---------------------------------------------------------------- legs
def make_leg(name, sx, front, seed):
    P = Part(name, seed)
    hip = Vector((0, 0, 0))
    knee = Vector((sx * 0.04, -0.06 if front else 0.08, -0.38))
    foot = Vector((sx * 0.03, 0.0, -BZ + 0.12 + (0.0 if front else 0.05)))
    mm, ll = look_m(hip, knee)
    P.add(ringed_cyl(0.16, 0.11, ll, 10, 4), bark, WOOD, mm, deform=gnarl(0.04, 5, 0.3, (0, 0), ll, seed), smooth=True, streak=0.4)
    mm, ll = look_m(knee, foot)
    P.add(ringed_cyl(0.1, 0.085, ll, 9, 3), bark, DARKW, mm, deform=gnarl(0.03, 6, 0.2, (0, 0), ll, seed + 5), smooth=True, streak=0.35)
    # knee plate
    P.add(box(0.14, 0.06, 0.12, base=False), crust, DARKW, M(knee + Vector((0, -0.08 if front else 0.08, 0))), deform=jitter(0.01, seed, 8))
    # stone hoof, split
    for k in (-1, 1):
        P.add(cyl(0.065, 0.075, 0.12, 8), stone, '#4a4440', M(foot + Vector((k * 0.045, -0.02, -0.12)), (0, 0, 0)), deform=jitter(0.006, seed + k, 10))
    # fetlock moss tuft
    P.add(ico(0.08, 1), moss, '#4a6d28', M(foot + Vector((0, 0.03, 0.04)), (0, 0, 0), (1.3, 1.3, 0.8)), deform=jitter(0.02, seed + 9))
    return P.build(coll, root, (sx * 0.27, -0.42 if front else 0.48, BZ - 0.05))

legs = [make_leg('LegFL', -1, True, 11), make_leg('LegFR', 1, True, 12), make_leg('LegBL', -1, False, 13), make_leg('LegBR', 1, False, 14)]

# ---------------------------------------------------------------- tail
T = Part('Tail', 9)
pts = [Vector((0, 0, 0)), Vector((0.02, 0.12, -0.04)), Vector((0.05, 0.2, -0.14)), Vector((0.04, 0.24, -0.26))]
for j in range(len(pts) - 1):
    mm, ll = look_m(pts[j], pts[j + 1])
    T.add(cyl(0.03 - j * 0.007, 0.024 - j * 0.007, ll * 1.08, 6), plant, '#4a5a28', mm)
for k in range(4):
    lm = Matrix.Translation(pts[-1]) @ Euler((math.pi + rnd.uniform(-0.5, 0.5), 0, k / 4 * TAU)).to_matrix().to_4x4()
    T.add(leaf(0.1, 0.05, 0.2, 0.1, 3), leafm, '#4f8a30', lm)
tail = T.build(coll, root, (0, 0.98, BZ + 0.05))

isolate(coll)
print('ok', sum(len(o.data.polygons) for o in coll.all_objects if o.type == 'MESH'))
