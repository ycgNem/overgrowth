# Thorn Barricade: a cheval-de-frise. A long log spine bristling with sharpened stakes in
# an X pattern, lashed with rope and choked with thorny bramble. 3 m wide along X.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

coll = fresh_collection('Barricade')
root = root_empty('Barricade', coll)
rnd = random.Random(55)

wood = get_mat('Wood', 0.85)
bark = get_mat('Bark', 0.9)
stone = get_mat('Stone', 0.92)
rope = get_mat('Rope', 0.95)
plant = get_mat('Plant', 0.8)
leafm = get_mat('LeafDS', 0.7, double=True)
bone = get_mat('Bone', 0.7)
moss = get_mat('Moss', 1.0)

B = Part('Body', 1)
W = 3.0
SPINE_Z = 0.62
# spine log with pale cut ends
m, ln = look_m((-W / 2, 0, SPINE_Z), (W / 2, 0, SPINE_Z + 0.04))
B.add(ringed_cyl(0.14, 0.13, ln, 10, 8), bark, '#7a5a3e', m, deform=gnarl(0.025, 2.5, 0.3, (0, 0), ln, 3), smooth=True, streak=0.35)
for end in (0, 1):
    e = M((-W / 2 if end == 0 else W / 2, 0, SPINE_Z + 0.04 * end), (0, math.pi / 2, 0))
    B.add(cyl(0.125, 0.125, 0.012, 10), wood, '#c49a68', e @ M((0, 0, -0.006 if end == 0 else -0.006)))
    B.add(torus(0.06, 0.007, 10, 3), wood, '#9c7448', e)

# stakes: through the spine, alternating X pairs, all sharpened at both ends
N = 7
for i in range(N):
    x = -W / 2 + 0.25 + i * (W - 0.5) / (N - 1)
    for k, ang in enumerate((0.75, -0.75)):
        a2 = ang + rnd.uniform(-0.08, 0.08)
        L = rnd.uniform(1.55, 1.8)
        d = Vector((rnd.uniform(-0.08, 0.08), math.sin(a2), math.cos(a2))).normalized()
        c = Vector((x + (k - 0.5) * 0.07, 0, SPINE_Z))
        p0 = c - d * (L * 0.5)
        p1 = c + d * (L * 0.5)
        mm, ll = look_m(p0, p1, rnd.uniform(0, TAU))
        B.add(stake(0.045, ll * 0.55, 7), bark, rnd.choice(['#7d5c3c', '#6f5036', '#86643f']), mm @ M((0, 0, ll * 0.45)), streak=0.3)
        # second half pointing the other way (sharpened too)
        mm2, _ = look_m(p1, p0, rnd.uniform(0, TAU))
        B.add(stake(0.045, ll * 0.55, 7), bark, rnd.choice(['#7d5c3c', '#6f5036']), mm2 @ M((0, 0, ll * 0.45)), streak=0.3)
        # pale whittled tips
        for (pa, pb) in ((p0, p1), (p1, p0)):
            tm, tl = look_m(pb, pa)
            B.add(cyl(0.047, 0.0, 0.19, 7), wood, '#d0aa78', tm @ M((0, 0, tl - 0.185)))
    lash(B, rope, M((x, 0, SPINE_Z), (0, math.pi / 2, 0)), r=0.16, turns=3, color='#b39563', pitch=0.04)

# bramble: thorny vines spiralling along the spine and up some stakes
for v in range(3):
    ph = v * 2.1
    prev = None
    for j in range(36):
        t = j / 35
        x = -W / 2 + 0.1 + t * (W - 0.2)
        ang = t * 22 + ph
        p = Vector((x, math.cos(ang) * (0.2 + 0.05 * v), SPINE_Z + math.sin(ang) * (0.2 + 0.05 * v)))
        if prev:
            mm, ll = look_m(prev, p)
            B.add(cyl(0.017, 0.015, ll * 1.1, 5), plant, '#3f5e28', mm)
        prev = p
        if j % 2 == 0:
            dirn = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
            mm, _ = look_m(p, p + dirn)
            B.add(cone(0.012, 0.07, 4), plant, '#9a7a46', mm)
        if j % 3 == 0:
            lm = Matrix.Translation(p) @ Euler((rnd.uniform(0, TAU), rnd.uniform(0, TAU), 0)).to_matrix().to_4x4()
            B.add(leaf(rnd.uniform(0.12, 0.18), 0.07, 0.25, 0.2, 4), leafm, rnd.choice(['#467f2c', '#55902f', '#3a6e26']), lm, var=0.12)
        if j % 11 == 5:
            # a few red bramble berries
            for q in range(3):
                B.add(sphere(0.02, 6, 4), get_mat('Berry', 0.35), '#8a1a2a', M(p + Vector((rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04)))))

# a warding bone charm hung from the middle lashing
cx = -W / 2 + 0.25 + 3 * (W - 0.5) / (N - 1)
B.add(cyl(0.004, 0.004, 0.32, 4), rope, '#c8b088', M((cx, -0.17, SPINE_Z - 0.32)))
def skull(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=0.07)
    for v in bm.verts:
        if v.co.y < -0.02:
            v.co.y = -0.02 + (v.co.y + 0.02) * 1.8  # snout
        if v.co.z < -0.03:
            v.co.z = -0.03 + (v.co.z + 0.03) * 0.5
B.add(skull, bone, '#e4dcc4', M((cx, -0.19, SPINE_Z - 0.38)), smooth=True)
for sx in (-1, 1):
    B.add(sphere(0.016, 6, 4), get_mat('Socket', 0.9), '#1a1410', M((cx + sx * 0.03, -0.24, SPINE_Z - 0.36)))
    mm, ll = look_m((cx + sx * 0.05, -0.2, SPINE_Z - 0.33), (cx + sx * 0.14, -0.22, SPINE_Z - 0.22))
    B.add(cyl(0.012, 0.004, ll, 5), bone, '#e4dcc4', mm)

# rocks and moss pinning the feet
for i in range(10):
    x = rnd.uniform(-W / 2, W / 2)
    y = rnd.choice([-1, 1]) * rnd.uniform(0.35, 0.6)
    B.add(ico(rnd.uniform(0.08, 0.15), 1), stone, rnd.choice(['#8f8b7f', '#7f7a6f']), M((x, y, 0.03), (rnd.random(), rnd.random(), 0), (1, 1, 0.7)), deform=jitter(0.02, 70 + i))
for i in range(5):
    x = rnd.uniform(-W / 2, W / 2)
    B.add(ico(0.2, 1), moss, '#4f7a2a', M((x, rnd.uniform(-0.5, 0.5), 0.0), (0, 0, 0), (1.5, 1, 0.25)), deform=jitter(0.04, 90 + i), var=0.2)

body = B.build(coll, root)
isolate(coll)
print('ok', len(body.data.polygons))
