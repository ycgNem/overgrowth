# The first-person hand: a right hand in a worn leather work glove, closed round a machete
# handle, with the wrist and a rolled canvas sleeve running off-screen.
#
# The base form is metaballs (balls strung along each finger, the palm, the thumb and the
# forearm) so knuckles, webbing and the cuff blend into one soft surface; negative balls run
# down the gaps between the fingers so each finger stands on its own instead of fusing into a
# mitten. On top of that mesh, in code:
#   - wrinkles: the leather bunches in grooves across the back of every joint
#   - seams: raised, stitched welts along the sides of the fingers (the fourchettes), the
#     three "points" down the back of the hand, round the thumb and the cuff's hem
#   - colour: baked occlusion (ray-cast against the hand itself and the handle it holds),
#     scuffed pale leather over the knuckles, grime at the fingertips and in the creases, a
#     darker reinforced palm, a darker cuff, pale thread on the welts
#
# Frame (three.js, after export): the handle runs along +x (the blade continues past
# x = 0), the spine is +y, the back of the hand faces +z. The grip's centre is the origin.
# Parts: "Glove" (hand and cuff), "Sleeve".
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

coll = fresh_collection('Hand')
root = root_empty('Hand', coll)
rnd = random.Random(7)
K = 10.0  # build at 10x: metaball resolution is absolute


def B(x, y, z):
    """three.js (x, y, z) -> Blender (x, -z, y), scaled."""
    return Vector((x * K, -z * K, y * K))


def T3(v):
    """Blender (unscaled) -> three.js."""
    return Vector((v.x, v.z, -v.y))


def Bu(p):
    """three.js -> Blender, unscaled."""
    return Vector((p[0], -p[2], p[1]))


mb = bpy.data.metaballs.new('HandMB')
mb.resolution = 0.0024 * K
mb.render_resolution = 0.0024 * K
mb.threshold = 0.6
mob = bpy.data.objects.new('HandMB', mb)
coll.objects.link(mob)


def ball(p, r, stiff=2.0, neg=False):
    e = mb.elements.new()
    e.type = 'BALL'
    e.co = p
    e.radius = r * K * 1.9
    e.stiffness = stiff
    e.use_negative = neg
    return e


def ellip(p, rx, ry, rz, stiff=2.0):
    e = mb.elements.new()
    e.type = 'ELLIPSOID'
    e.co = p
    e.radius = 1.9
    e.size_x, e.size_y, e.size_z = rx * K, rz * K, ry * K  # Blender y = -three z
    e.stiffness = stiff
    return e


def chain(pts, radii, step=0.004, neg=False, stiff=2.0):
    """balls every `step` metres along a polyline (three coords), radius interpolated"""
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        n = max(1, int((b - a).length / step))
        for k in range(n + (i == len(pts) - 2)):
            t = k / n
            p = a.lerp(b, t)
            ball(B(*p), radii[i] + (radii[i + 1] - radii[i]) * t, stiff, neg)


HY, HZ = 0.0165, 0.0135  # handle half-height, half-thickness


def around(x, th, rf, out=0.0):
    """a point on a finger wrapped round the handle: angle th from +z toward +y"""
    t = math.radians(th)
    return (x, math.sin(t) * (HY + rf + out), math.cos(t) * (HZ + rf + out))


# --- fingers: index (nearest the blade) to little finger
FINGERS = [  # x, radius, angle at the knuckle, the tip's angle
    (-0.031, 0.0089, 32, -178),
    (-0.052, 0.0093, 28, -184),
    (-0.072, 0.0088, 25, -180),
    (-0.090, 0.0076, 22, -168),
]
JOINTS = (0.06, 0.42, 0.72)  # along each finger: the knuckle, the middle and the last joint
NF = 32
fingers = []  # per finger: (points, radii) along t = 0..1, three coords
mcps = []
for i, (x, rf, a0, a1) in enumerate(FINGERS):
    pts, rad = [], []
    for k in range(NF + 1):
        t = k / NF
        th = a0 + (a1 - a0) * t
        # knuckles stand proud of the curve: the MCP most, the middle joint a little
        out = 0.0078 * max(0.0, 1 - t * 5) + 0.003 * math.exp(-((t - 0.42) / 0.07) ** 2) + 0.0012 * math.exp(-((t - 0.72) / 0.06) ** 2)
        # the finger slants a little toward the little finger as it wraps (oblique grip)
        xx = x - 0.004 * t * (i - 1.5) * 0.6
        pts.append(around(xx, th, rf, out))
        # thinner between the joints, the pad of the tip rounded
        r = rf * (1.06 - 0.2 * t) * (1 + 0.09 * math.exp(-((t - 0.42) / 0.06) ** 2) + 0.06 * math.exp(-((t - 0.72) / 0.06) ** 2))
        rad.append(r)
    chain(pts, rad, 0.0022)
    fingers.append((pts, rad))
    mcps.append(Vector(pts[0]))
# the gaps between the fingers: negative balls down the midline of each pair, from just past
# the knuckles to the tips, so the fingers part instead of fusing into a mitten
for i in range(len(fingers) - 1):
    (pa, ra), (pb, rb) = fingers[i], fingers[i + 1]
    for k in range(4, NF + 1, 1):
        p = (Vector(pa[k]) + Vector(pb[k])) * 0.5
        gap = (Vector(pa[k]) - Vector(pb[k])).length - ra[k] - rb[k]
        ball(B(*p), 0.0021 + max(0.0, gap) * 0.3, 2.0, True)

# --- back of the hand and palm
W = Vector((-0.064, 0.088, 0.010))  # wrist centre
for i, m in enumerate(mcps):
    w = Vector((W.x + (m.x - W.x) * 0.45, W.y - 0.006, W.z + 0.004 * (1.5 - i)))
    chain([tuple(m), tuple(w)], [0.0108, 0.0128], 0.003)
# palm: the fleshy pad over the handle's top and the heel of the hand
ellip(B(-0.062, 0.040, 0.002), 0.043, 0.020, 0.021)
ellip(B(-0.084, 0.060, -0.004), 0.020, 0.026, 0.020)  # hypothenar (little-finger heel)
ellip(B(-0.036, 0.058, -0.010), 0.020, 0.022, 0.018)  # thenar (thumb ball)

# --- thumb: from the base of the palm, round the handle's far side, over the fingers
THUMB = [(-0.040, 0.066, -0.010), (-0.022, 0.044, -0.026), (-0.017, 0.020, -0.034), (-0.022, -0.001, -0.037), (-0.030, -0.017, -0.034)]
chain(THUMB, [0.0142, 0.0122, 0.0106, 0.0096, 0.0086], 0.0025)

# --- wrist, glove cuff and the sleeve up the forearm
F = Vector((-0.30, 1.0, 0.18)).normalized()  # wrist -> elbow
chain([tuple(W), tuple(W + F * 0.05)], [0.024, 0.026], 0.004)
for k in range(8):  # the cuff: a flared leather band
    p = W + F * (0.045 + k * 0.004)
    ball(B(*p), 0.030 + 0.002 * math.sin(k) + 0.0015 * k / 7)
chain([tuple(W + F * 0.075), tuple(W + F * 0.36), tuple(W + F * 0.7)], [0.031, 0.037, 0.042], 0.006)
# the sleeve, rolled up into a thick fold, with a few lumps of cloth
side = Vector((-F.y, F.x, 0)).normalized()
up = F.cross(side).normalized()
for k in range(14):
    a = k / 14 * math.tau
    p = W + F * (0.12 + 0.012 * math.sin(a * 2)) + (side * math.cos(a) + up * math.sin(a)) * 0.036
    ball(B(*p), 0.016 + 0.004 * rnd.random())
for k in range(10):
    t = 0.15 + rnd.random() * 0.2
    a = rnd.random() * math.tau
    p = W + F * t + (side * math.cos(a) + up * math.sin(a)) * 0.033
    ball(B(*p), 0.010 + 0.006 * rnd.random())

# --- mesh it
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(mob.evaluated_get(dg))
bpy.data.objects.remove(mob, do_unlink=True)
bpy.data.metaballs.remove(mb)
ob = bpy.data.objects.new('HandRaw', me)
coll.objects.link(ob)
bpy.context.view_layer.objects.active = ob
for o in bpy.context.selected_objects:
    o.select_set(False)
ob.select_set(True)
dec = ob.modifiers.new('dec', 'DECIMATE')
dec.ratio = 0.36
bpy.ops.object.modifier_apply(modifier='dec')
sm = ob.modifiers.new('sm', 'SMOOTH')
sm.factor = 0.5
sm.iterations = 1
bpy.ops.object.modifier_apply(modifier='sm')
me = ob.data
me.transform(Matrix.Scale(1 / K, 4))

Wb, Fb = Bu(W), Bu(F)


def along_arm(co):
    return (co - Wb).dot(Fb)


# --- split: the sleeve from the glove
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
sleeve_faces = set(f.index for f in bm.faces if along_arm(f.calc_center_median()) > 0.072)


def part_bm(keep_sleeve):
    b = bmesh.new()
    b.from_mesh(me)
    b.faces.ensure_lookup_table()
    bmesh.ops.delete(b, geom=[f for f in b.faces if (f.index in sleeve_faces) != keep_sleeve], context='FACES')
    b.normal_update()
    return b


gbm = part_bm(False)
sbm = part_bm(True)
bm.free()

# where a point lies along the fingers: (finger, t, distance from the finger's axis, its radius)
SAMPLES = []
for fi, (pts, rad) in enumerate(fingers):
    for k in range(len(pts)):
        SAMPLES.append((fi, k / NF, Bu(pts[k]), rad[k]))


def nearest_finger(co):
    best = None
    for fi, t, p, r in SAMPLES:
        d = (co - p).length
        if best is None or d < best[2]:
            best = (fi, t, d, r)
    return best


def finger_point(fi, t):
    pts = fingers[fi][0]
    f = t * NF
    k = min(int(f), NF - 1)
    return Bu(pts[k]).lerp(Bu(pts[k + 1]), f - k)


HANDLE_AXIS_Y = 0.0  # the handle's axis is three's x axis: Blender (x, 0, 0)


def outward(co):
    """how much a surface point faces away from the handle (1: the back of a finger)"""
    q = Vector((0.0, co.y, co.z))
    return q.normalized() if q.length > 1e-9 else Vector((0, 0, 1))


# --- wrinkles: grooves across the back of each joint, where the leather bunches as it bends
gbm.verts.ensure_lookup_table()
moves = []
for v in gbm.verts:
    hit = nearest_finger(v.co)
    if not hit:
        continue
    fi, t, d, r = hit
    if d > r * 1.7:
        continue
    face_out = max(0.0, v.normal.dot(outward(v.co)))
    g = 0.0
    for tj in JOINTS:
        for o, w in ((-0.028, 1.0), (0.0, 0.7), (0.028, 0.85), (0.052, 0.4)):
            u = (t - tj - o) / 0.011
            g += w * math.exp(-u * u)
    # a little wander, so the grooves aren't ruled lines
    g *= 0.75 + 0.5 * (noise.noise(v.co * 400) * 0.5 + 0.5)
    moves.append((v, -v.normal * 0.00055 * min(g, 1.4) * (0.35 + 0.65 * face_out)))
for v, dv in moves:
    v.co += dv
gbm.normal_update()

# --- seams: stitched welts, laid on the surface (each point snapped to it and lifted a hair)
gtree = BVHTree.FromBMesh(gbm)
n_glove_faces = len(gbm.faces)
seam_paths = []


def on_surface(pts, lift=0.00035):
    out = []
    for p in pts:
        loc, nrm, idx, dist = gtree.find_nearest(p)
        if loc is None:
            continue
        out.append(loc + nrm * lift)
    return out


# the fourchettes: down each side of every finger, from past the knuckle to the tip
for fi, (pts, rad) in enumerate(fingers):
    for sgn in (-1, 1):
        line = []
        for k in range(5, NF - 1):
            t = k / NF
            c = finger_point(fi, t)
            # the finger's side: along three's x, a radius out
            line.append(c + Vector((sgn * rad[k] * 0.98, 0, 0)))
        seam_paths.append(on_surface(line))
# the points: three welts down the back of the hand from between the knuckles toward the wrist
for i in range(3):
    a = (mcps[i] + mcps[i + 1]) * 0.5
    line = []
    for k in range(9):
        s = 0.12 + 0.6 * k / 8
        p3 = a.lerp(W, s) + Vector((0, 0, 0.012))
        line.append(Bu(p3))
    seam_paths.append(on_surface(line))
# the cuff's hem and the seam where the glove meets the cuff
for ring_at in (0.042, 0.071):
    c = W + F * ring_at
    line = []
    for k in range(41):
        a = k / 40 * math.tau
        line.append(Bu(c + (side * math.cos(a) + up * math.sin(a)) * 0.045))
    seam_paths.append(on_surface(line))
# round the base of the thumb
tb = Vector(THUMB[1])
line = []
for k in range(25):
    a = k / 24 * math.tau
    line.append(Bu(tb + Vector((math.cos(a) * 0.016, math.sin(a) * 0.012, 0.004 * math.sin(a * 2)))))
seam_paths.append(on_surface(line, 0.0003))

seam_face_start = len(gbm.faces)
for path in seam_paths:
    if len(path) < 3:
        continue
    pts = spline([tuple(p) for p in path], 3)
    tube(pts, 0.00062, seg=5, cap=True)(gbm)
gbm.faces.ensure_lookup_table()
gbm.normal_update()

# --- occlusion: rays from every vertex against the glove, the sleeve and the handle it holds
def handle_box():
    hb = bmesh.new()
    bmesh.ops.create_cube(hb, size=1.0)
    for v in hb.verts:
        v.co = Vector(((v.co.x + 0.5) * -0.16 + 0.004, v.co.y * 2 * -HZ * 0.98, v.co.z * 2 * HY * 0.98))
    return hb


occ_bms = [gbm, sbm, handle_box()]
verts, polys, off = [], [], 0
for b in occ_bms:
    b.verts.index_update()
    b.faces.index_update()
    b.verts.ensure_lookup_table()
    verts += [v.co.copy() for v in b.verts]
    polys += [[off + v.index for v in f.verts] for f in b.faces]
    off += len(b.verts)
tree = BVHTree.FromPolygons(verts, polys)
DIRS = []
for k in range(14):
    # a fixed spread over the hemisphere (spiral)
    z = 1 - (k + 0.5) / 14
    rr = math.sqrt(max(0.0, 1 - z * z))
    a = k * 2.39996
    DIRS.append(Vector((math.cos(a) * rr, math.sin(a) * rr, z)))


def occlusion(co, n):
    t = n.orthogonal().normalized()
    bt = n.cross(t)
    hit = 0.0
    for d in DIRS:
        w = t * d.x + bt * d.y + n * d.z
        loc, nrm, idx, dist = tree.ray_cast(co + n * 0.0004, w, 0.025)
        if loc is not None:
            hit += 1.0 - dist / 0.025 * 0.6
    return hit / len(DIRS)


# --- colour
leather = get_mat('Leather', 0.72)
cloth = get_mat('Canvas', 0.95)
LEATHER = Vector(hexc('#6f4c2f'))
WORN = Vector(hexc('#9c8468'))
GRIME = Vector(hexc('#33261a'))
PALM = Vector(hexc('#563823'))
CUFF = Vector(hexc('#4c3321'))
THREAD = Vector(hexc('#a99372'))
CANVAS = Vector(hexc('#56603e'))


def smooth_ao(b, occ, n=2):
    # rays from each vertex are noisy: average each with its neighbours
    for _ in range(n):
        nxt = {}
        for v in b.verts:
            ns = [e.other_vert(v).index for e in v.link_edges]
            nxt[v.index] = (occ[v.index] * 2 + sum(occ[i] for i in ns)) / (2 + len(ns))
        occ = nxt
    return occ


def colour_glove():
    col = gbm.loops.layers.color.new('Col')
    gbm.verts.ensure_lookup_table()
    occ = smooth_ao(gbm, {v.index: occlusion(v.co, v.normal) for v in gbm.verts})
    near = {v.index: nearest_finger(v.co) for v in gbm.verts}
    for f in gbm.faces:
        seam = f.index >= seam_face_start
        for l in f.loops:
            v = l.vert
            p = v.co
            p3 = T3(p)
            nz = noise.noise(p * 70) * 0.5 + noise.noise(p * 180) * 0.15
            on_cuff = (p3 - W).dot(F) > 0.04
            if seam:
                # pale thread in dashes along the welt, dirty where it runs over the grime
                dash = math.sin((p.x * 1.0 + p.y * 1.3 + p.z * 0.7) * 2200) > -0.1
                c = THREAD * (0.75 + 0.2 * nz) if dash else LEATHER * 0.7
            else:
                base = CUFF if on_cuff else LEATHER
                c = base * (0.9 + 0.2 * nz)
                if not on_cuff:
                    hit = near[v.index]
                    out = max(0.0, v.normal.dot(outward(p)))
                    # scuffed pale where it rubs: the knuckles and the backs of the fingers
                    knuck = 0.0
                    if hit and hit[2] < hit[3] * 1.8:
                        fi, t, d, r = hit
                        knuck = max(math.exp(-((t - 0.06) / 0.09) ** 2), 0.7 * math.exp(-((t - 0.42) / 0.07) ** 2)) * out
                        # grime worked into the fingertips
                        c = c.lerp(GRIME, 0.55 * max(0.0, (t - 0.7) / 0.3) * (0.6 + 0.4 * out))
                    knuck = min(1.0, knuck * (0.85 + 0.3 * (noise.noise(p * 90) * 0.5 + 0.5)))
                    c = c.lerp(WORN, 0.42 * knuck)
                    # the palm and the inside of the grip: a darker, smoother reinforced patch
                    inner = max(0.0, -v.normal.dot(outward(p)))
                    c = c.lerp(PALM, 0.5 * inner)
                # stains and darker blotches
                st = noise.noise(p * 40 + Vector((3, 1, 7)))
                if st > 0.3:
                    c = c * (1 - 0.18 * min(1.0, (st - 0.3) * 3))
            ao = occ[v.index]
            c = c * (1 - 0.68 * min(1.0, ao * 1.25))
            l[col] = (min(c.x, 1), min(c.y, 1), min(c.z, 1), 1)


def colour_sleeve():
    col = sbm.loops.layers.color.new('Col')
    sbm.verts.ensure_lookup_table()
    occ = smooth_ao(sbm, {v.index: occlusion(v.co, v.normal) for v in sbm.verts})
    for f in sbm.faces:
        for l in f.loops:
            p = l.vert.co
            nz = noise.noise(p * 90) * 0.5 + noise.noise(p * 300) * 0.25
            c = CANVAS * (0.86 + 0.28 * nz)
            # grime at the rolled edge
            c = c * (1 - 0.6 * min(1.0, occ[l.vert.index] * 1.3))
            l[col] = (min(c.x, 1), min(c.y, 1), min(c.z, 1), 1)


colour_glove()
colour_sleeve()
for f in gbm.faces:
    f.smooth = True
for f in sbm.faces:
    f.smooth = True


def make(name, b, mat):
    m = bpy.data.meshes.new(name)
    b.to_mesh(m)
    b.free()
    o = bpy.data.objects.new(name, m)
    coll.objects.link(o)
    m.materials.append(mat)
    try:
        m.color_attributes.active_color_name = 'Col'
        m.color_attributes.render_color_index = m.color_attributes.active_color_index
    except Exception:
        pass
    o.parent = root
    return o


make('Glove', gbm, leather)
make('Sleeve', sbm, cloth)
me_raw = ob.data
bpy.data.objects.remove(ob, do_unlink=True)
bpy.data.meshes.remove(me_raw)
