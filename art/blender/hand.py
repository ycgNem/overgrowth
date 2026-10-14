# The first-person hand: a right hand in a worn leather work glove, closed round a machete
# handle, with the wrist and a rolled canvas sleeve running off-screen. Built from metaballs
# (balls strung along each finger, the palm and the forearm) so knuckles, webbing and the
# cuff blend into one soft surface, then meshed, decimated and vertex-coloured.
#
# Frame (three.js, after export): the handle runs along +x (the blade continues past
# x = 0), the spine is +y, the back of the hand faces +z. The grip's centre is the origin.
# Parts: "Glove" (hand and cuff), "Sleeve".
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random
from mathutils import Vector

coll = fresh_collection('Hand')
root = root_empty('Hand', coll)
rnd = random.Random(7)
K = 10.0  # build at 10x: metaball resolution is absolute


def B(x, y, z):
    """three.js (x, y, z) -> Blender (x, -z, y), scaled."""
    return Vector((x * K, -z * K, y * K))


mb = bpy.data.metaballs.new('HandMB')
mb.resolution = 0.0032 * K
mb.render_resolution = 0.0032 * K
mb.threshold = 0.6
mob = bpy.data.objects.new('HandMB', mb)
coll.objects.link(mob)


def ball(p, r, stiff=2.0):
    e = mb.elements.new()
    e.type = 'BALL'
    e.co = p
    e.radius = r * K * 1.9
    e.stiffness = stiff
    return e


def ellip(p, rx, ry, rz, stiff=2.0):
    e = mb.elements.new()
    e.type = 'ELLIPSOID'
    e.co = p
    e.radius = 1.9
    e.size_x, e.size_y, e.size_z = rx * K, rz * K, ry * K  # Blender y = -three z
    e.stiffness = stiff
    return e


def chain(pts, radii, step=0.004):
    """balls every `step` metres along a polyline (three coords), radius interpolated"""
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        n = max(1, int((b - a).length / step))
        for k in range(n + (i == len(pts) - 2)):
            t = k / n
            p = a.lerp(b, t)
            ball(B(*p), radii[i] + (radii[i + 1] - radii[i]) * t)


HY, HZ = 0.0165, 0.0135  # handle half-height, half-thickness


def around(x, th, rf, out=0.0):
    """a point on a finger wrapped round the handle: angle th from +z toward +y"""
    t = math.radians(th)
    return (x, math.sin(t) * (HY + rf + out), math.cos(t) * (HZ + rf + out))


# --- fingers: index (nearest the blade) to little finger
FINGERS = [  # x, radius, angle at the knuckle, the tip's angle
    (-0.031, 0.0093, 32, -178),
    (-0.052, 0.0097, 28, -184),
    (-0.072, 0.0092, 25, -180),
    (-0.090, 0.0080, 22, -168),
]
mcps = []
for i, (x, rf, a0, a1) in enumerate(FINGERS):
    pts, rad = [], []
    n = 16
    for k in range(n + 1):
        t = k / n
        th = a0 + (a1 - a0) * t
        # knuckles stand proud of the curve: the MCP most, the middle joint a little
        out = 0.007 * max(0.0, 1 - t * 5) + 0.0025 * math.exp(-((t - 0.42) / 0.08) ** 2)
        # the finger slants a little toward the little finger as it wraps (oblique grip)
        xx = x - 0.004 * t * (i - 1.5) * 0.6
        pts.append(around(xx, th, rf, out))
        rad.append(rf * (1.08 - 0.22 * t) * (1 + 0.1 * math.exp(-((t - 0.42) / 0.07) ** 2)))
    chain(pts, rad, 0.003)
    mcps.append(Vector(pts[0]))

# --- back of the hand and palm
W = Vector((-0.064, 0.088, 0.010))  # wrist centre
for i, m in enumerate(mcps):
    w = Vector((W.x + (m.x - W.x) * 0.45, W.y - 0.006, W.z + 0.004 * (1.5 - i)))
    chain([tuple(m), tuple(w)], [0.0115, 0.0135], 0.004)
# palm: the fleshy pad over the handle's top and the heel of the hand
ellip(B(-0.062, 0.040, 0.002), 0.043, 0.020, 0.021)
ellip(B(-0.084, 0.060, -0.004), 0.020, 0.026, 0.020)  # hypothenar (little-finger heel)
ellip(B(-0.036, 0.058, -0.010), 0.020, 0.022, 0.018)  # thenar (thumb ball)

# --- thumb: from the base of the palm, round the handle's far side, over the fingers
chain([(-0.040, 0.066, -0.010), (-0.022, 0.044, -0.026), (-0.017, 0.020, -0.034), (-0.022, -0.001, -0.037), (-0.030, -0.017, -0.034)],
      [0.0145, 0.0125, 0.0108, 0.0098, 0.0088], 0.003)

# --- wrist, glove cuff and the sleeve up the forearm
F = Vector((-0.30, 1.0, 0.18)).normalized()  # wrist -> elbow
chain([tuple(W), tuple(W + F * 0.05)], [0.024, 0.026], 0.004)
for k in range(8):  # the cuff: a flared leather band
    p = W + F * (0.045 + k * 0.004)
    ball(B(*p), 0.030 + 0.002 * math.sin(k))
chain([tuple(W + F * 0.075), tuple(W + F * 0.36), tuple(W + F * 0.7)], [0.031, 0.037, 0.042], 0.006)
# the sleeve, rolled up into a thick fold, with a few lumps of cloth
for k in range(14):
    a = k / 14 * math.tau
    side = Vector((-F.y, F.x, 0)).normalized()
    up = F.cross(side).normalized()
    p = W + F * (0.12 + 0.012 * math.sin(a * 2)) + (side * math.cos(a) + up * math.sin(a)) * 0.036
    ball(B(*p), 0.016 + 0.004 * rnd.random())
for k in range(10):
    t = 0.15 + rnd.random() * 0.2
    a = rnd.random() * math.tau
    side = Vector((-F.y, F.x, 0)).normalized()
    up = F.cross(side).normalized()
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
dec.ratio = 0.3
bpy.ops.object.modifier_apply(modifier='dec')
sm = ob.modifiers.new('sm', 'SMOOTH')
sm.factor = 0.5
sm.iterations = 2
bpy.ops.object.modifier_apply(modifier='sm')
me = ob.data
me.transform(Matrix.Scale(1 / K, 4))

# --- vertex colours and the glove / sleeve split
leather = get_mat('Leather', 0.72)
cloth = get_mat('Canvas', 0.95)
bm = bmesh.new()
bm.from_mesh(me)
col = bm.loops.layers.color.new('Col')
Wb = Vector((W.x, -W.z, W.y))
Fb = Vector((F.x, -F.z, F.y))
glove_faces, sleeve_faces = [], []
bm.faces.ensure_lookup_table()
for f in bm.faces:
    c = f.calc_center_median()
    along = (c - Wb).dot(Fb)
    (sleeve_faces if along > 0.072 else glove_faces).append(f)
    f.smooth = True
sleeve_set = set(f.index for f in sleeve_faces)
glove_idx = [f.index for f in glove_faces]
sleeve_idx = list(sleeve_set)
for f in bm.faces:
    sleeve = f.index in sleeve_set
    for l in f.loops:
        p = l.vert.co
        nz = noise.noise(p * 90) * 0.5 + noise.noise(p * 300) * 0.25
        if sleeve:
            base = Vector(hexc('#56603e'))
            k = 0.9 + 0.25 * nz
        else:
            base = Vector(hexc('#6b4a2e'))
            # worn, paler leather over the knuckles and the finger backs; dark in the creases
            three = Vector((p.x, p.z, -p.y))
            wear = max(0.0, three.z - 0.012) * 18 + max(0.0, (three - W).dot(F) - 0.04) * -6
            k = 0.85 + 0.3 * nz + min(0.35, wear)
            if (three - W).dot(F) > 0.04:  # the cuff, darker
                base = Vector(hexc('#4a3220'))
        c = base * k
        l[col] = (min(c.x, 1), min(c.y, 1), min(c.z, 1), 1)
bm.to_mesh(me)
bm.free()


def split(name, faces_sel, mat):
    o = ob.copy()
    o.data = ob.data.copy()
    o.name = name
    o.data.name = name
    coll.objects.link(o)
    b2 = bmesh.new()
    b2.from_mesh(o.data)
    keep = set(faces_sel)
    bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in keep], context='FACES')
    b2.to_mesh(o.data)
    b2.free()
    o.data.materials.clear()
    o.data.materials.append(mat)
    try:
        o.data.color_attributes.active_color_name = 'Col'
        o.data.color_attributes.render_color_index = o.data.color_attributes.active_color_index
    except Exception:
        pass
    o.parent = root
    return o


split('Glove', glove_idx, leather)
split('Sleeve', sleeve_idx, cloth)
me_raw = ob.data
bpy.data.objects.remove(ob, do_unlink=True)
bpy.data.meshes.remove(me_raw)
