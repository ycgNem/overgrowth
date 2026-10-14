# Overgrowth Blender helpers: build low-poly, vertex-coloured game assets from code
# and export them as GLB for three.js. Exec this file at the top of each asset script:
#   exec(open(r"<repo>/art/blender/oglib.py").read())
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler, noise

TAU = math.pi * 2
SHARP_ANGLE = math.radians(42)


def get_mat(name, rough=0.8, metal=0.0, emit=None, strength=3.0, double=False):
    """Vertex-coloured PBR material ('Col' attribute -> base colour), or a flat emissive one."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_backface_culling = not double
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit is not None:
        c = (*emit, 1.0)
        bsdf.inputs['Base Color'].default_value = c
        bsdf.inputs['Emission Color'].default_value = c
        bsdf.inputs['Emission Strength'].default_value = strength
    else:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def hexc(h):
    """'#rrggbb' -> sRGB floats. Byte colour attributes are stored in sRGB; Blender and the
    glTF exporter convert them to linear themselves."""
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


class Part:
    """One exported mesh node: geometry appended primitive by primitive, each with
    its own material slot and colour. Corner colours get per-face variation and
    optional darkening toward the ground (cheap baked occlusion)."""

    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.mats = []
        self.rand = random.Random(seed)

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add(self, build, mat, color, m=Matrix(), deform=None, var=0.12, smooth=None,
            ao=0.0, ao_h=1.0, ao_base=0.0, streak=0.0):
        # smooth: None = smooth shading with hard edges over SHARP_ANGLE (organic parts);
        # False = faceted (cut stone, flint); True = smooth everywhere.
        tmp = bmesh.new()
        build(tmp)
        if deform:
            for v in tmp.verts:
                v.co = deform(v.co.copy())
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        me = bpy.data.meshes.new('_tmp')
        tmp.to_mesh(me)
        tmp.free()
        n0 = len(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self.bm.faces.ensure_lookup_table()
        mi = self._mi(mat)
        base = Vector(color if not isinstance(color, str) else hexc(color))
        # colour variation is a smooth noise over the surface (plus a little per face) so
        # parts read as weathered material, not a mosaic of differently tinted facets
        off = Vector((self.rand.uniform(0, 50), self.rand.uniform(0, 50), self.rand.uniform(0, 50)))
        for f in self.bm.faces[n0:]:
            f.material_index = mi
            f.smooth = smooth is not False
            kf = self.rand.uniform(-var, var) * 0.25
            for l in f.loops:
                k = 1 + kf + var * 1.4 * noise.noise(l.vert.co * 3.3 + off)
                z = l.vert.co.z
                occ = 1.0
                if ao > 0:
                    occ = 1 - ao * max(0.0, 1 - (z - ao_base) / ao_h)
                s = 1.0
                if streak > 0:
                    s = 1 + streak * noise.noise(l.vert.co * Vector((9, 9, 1.4)))
                c = base * (k * occ * s)
                l[self.col] = (min(c.x, 1), min(c.y, 1), min(c.z, 1), 1.0)
        return self

    def build(self, coll, parent=None, loc=(0, 0, 0)):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        try:  # hard edges where faces meet at more than SHARP_ANGLE, smooth elsewhere
            me.set_sharp_from_angle(angle=SHARP_ANGLE)
        except Exception:
            pass
        for mat in self.mats:
            me.materials.append(mat)
        try:  # make 'Col' the colour attribute the glTF exporter writes as COLOR_0
            me.color_attributes.active_color_name = 'Col'
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except Exception:
            pass
        ob = bpy.data.objects.new(self.name, me)
        coll.objects.link(ob)
        ob.location = loc
        if parent:
            ob.parent = parent
        return ob


# ------------------------------------------------------------------ primitives
def cyl(r1=0.5, r2=None, h=1.0, seg=10, caps=True):
    r2 = r1 if r2 is None else r2
    def b(bm):
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)  # base at z=0
    return b


def ringed_cyl(r1, r2, h, seg=10, rings=6):
    """Cylinder with intermediate loops so it can be bent / twisted / noised."""
    def b(bm):
        verts = []
        for j in range(rings + 1):
            t = j / rings
            r = r1 + (r2 - r1) * t
            row = [bm.verts.new((math.cos(i / seg * TAU) * r, math.sin(i / seg * TAU) * r, h * t)) for i in range(seg)]
            verts.append(row)
        for j in range(rings):
            for i in range(seg):
                a, c = verts[j][i], verts[j][(i + 1) % seg]
                d, e = verts[j + 1][(i + 1) % seg], verts[j + 1][i]
                bm.faces.new((a, c, d, e))
        bm.faces.new(list(reversed(verts[0])))
        if r2 > 1e-4:
            bm.faces.new(verts[-1])
        else:
            pass
    return b


def box(sx=1, sy=1, sz=1, base=True, cuts=0, chamfer=0.0):
    """cuts: grid-subdivide each face so a deformer can carve it.
    chamfer: bevel the corner edges (in metres) so they catch light like worked stone."""
    def b(bm):
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
        if cuts:
            bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
        if chamfer:
            sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal) > 1.0]
            bmesh.ops.bevel(bm, geom=sharp, offset=chamfer, segments=1, affect='EDGES', clamp_overlap=True)
        if base:
            bmesh.ops.translate(bm, vec=(0, 0, sz / 2), verts=bm.verts)
    return b


def ico(r=0.5, sub=1):
    def b(bm):
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return b


def sphere(r=0.5, seg=12, rings=8):
    def b(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return b


def cone(r=0.2, h=0.6, seg=6):
    return cyl(r, 0.0, h, seg)


def torus(R=0.5, r=0.08, seg=16, tube=6):
    def b(bm):
        rows = []
        for i in range(seg):
            a = i / seg * TAU
            ca, sa = math.cos(a), math.sin(a)
            row = []
            for j in range(tube):
                t = j / tube * TAU
                rr = R + math.cos(t) * r
                row.append(bm.verts.new((ca * rr, sa * rr, math.sin(t) * r)))
            rows.append(row)
        for i in range(seg):
            for j in range(tube):
                a = rows[i][j]; b2 = rows[(i + 1) % seg][j]
                c = rows[(i + 1) % seg][(j + 1) % tube]; d = rows[i][(j + 1) % tube]
                bm.faces.new((a, b2, c, d))
    return b


# ------------------------------------------------------------------ transforms
def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(s))


def look_m(a, b, roll=0.0):
    """Matrix placing a z-up primitive at a, pointing to b; returns (matrix, length)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = d.normalized().to_track_quat('Z', 'Y')
    m = Matrix.Translation(a) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Z')
    return m, d.length


def gnarl(amp=0.06, freq=2.5, twist=0.0, bend=(0, 0), h=1.0, seed=0):
    """Deform for ringed cylinders: noise bulges, twist around z, quadratic bend."""
    off = Vector((seed * 7.1, seed * 3.3, seed * 1.7))
    def d(co):
        t = co.z / h
        a = twist * t
        x, y = co.x, co.y
        x, y = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
        n = noise.noise(co * freq + off)
        r = 1 + amp * n * 4
        return Vector((x * r + bend[0] * t * t, y * r + bend[1] * t * t, co.z))
    return d


def jitter(amp, seed=0, freq=3.0):
    off = Vector((seed * 5.3, seed * 2.1, seed * 9.7))
    def d(co):
        return co + noise.noise_vector(co * freq + off) * amp
    return d


# ------------------------------------------------------------------ scene + export
def fresh_collection(name):
    sc = bpy.context.scene
    old = bpy.data.collections.get(name)
    if old:
        for ob in list(old.all_objects):
            me = ob.data if ob.type == 'MESH' else None
            bpy.data.objects.remove(ob, do_unlink=True)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
        bpy.data.collections.remove(old)
    c = bpy.data.collections.new(name)
    sc.collection.children.link(c)
    return c


def root_empty(name, coll):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    coll.objects.link(e)
    return e


def export_glb(coll, path):
    for ob in bpy.context.scene.objects:
        try:
            ob.select_set(False)
        except RuntimeError:
            pass
    lc = bpy.context.view_layer.layer_collection.children.get(coll.name)
    if lc:
        lc.hide_viewport = False
    for ob in coll.all_objects:
        ob.hide_set(False)
        ob.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True,
              export_yup=True, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    tris = 0
    for ob in coll.all_objects:
        if ob.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    return tris


def isolate(coll):
    """Show only this collection (for look/renders)."""
    for c in bpy.context.scene.collection.children:
        lc = bpy.context.view_layer.layer_collection.children.get(c.name)
        if lc:
            lc.hide_viewport = c != coll


def leaf(L=0.5, W=0.18, fold=0.25, curl=0.15, seg=5):
    """Leaf card along +z: pointed ends, folded along the midrib, curled back."""
    def b(bm):
        rows = []
        for j in range(seg + 1):
            t = j / seg
            w = W * math.sin(math.pi * min(1.0, t * 1.08)) ** 0.8 * 0.5
            z = L * t
            y = -curl * t * t * L
            rows.append((bm.verts.new((-w, y + w * fold, z)), bm.verts.new((0, y, z)), bm.verts.new((w, y + w * fold, z))))
        for j in range(seg):
            a, c = rows[j], rows[j + 1]
            bm.faces.new((a[0], a[1], c[1], c[0]))
            bm.faces.new((a[1], a[2], c[2], c[1]))
    return b


def mushroom_parts(P, mat_stem, mat_cap, at, h=0.18, r=0.12, cap='#b8412c', stem='#e6dcc0', rot=(0, 0, 0), spots=None, seed=0):
    """Stem + domed cap (+ optional spots) appended to Part P at matrix `at`."""
    P.add(cyl(r * 0.28, r * 0.22, h, 8), mat_stem, stem, at @ M((0, 0, 0), rot), smooth=True)
    def dome(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0)
        for v in bm.verts:
            if v.co.z < -0.05:
                v.co.z = -0.05 + (v.co.z + 0.05) * 0.15
    P.add(dome, mat_cap, cap, at @ M((0, 0, 0), rot) @ M((0, 0, h), (0, 0, 0), (r, r, r * 0.62)), smooth=True)
    if spots:
        rr = random.Random(seed)
        for i in range(5):
            a = rr.uniform(0, TAU); el = rr.uniform(0.35, 1.0)
            p = Vector((math.cos(a) * math.cos(el) * r * 0.98, math.sin(a) * math.cos(el) * r * 0.98, h + math.sin(el) * r * 0.6))
            P.add(ico(r * 0.13, 1), spots, '#f2ecd8', at @ M((0, 0, 0), rot) @ M(p, (0, 0, 0), (1, 1, 0.4)))


def stake(r=0.07, L=1.6, seg=7):
    """Sharpened pole: shaft + pointed tip, base at z=0."""
    def b(bm):
        tip = min(L * 0.18, r * 4)
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r * 0.92, depth=L - tip)
        bmesh.ops.translate(bm, vec=(0, 0, (L - tip) / 2), verts=bm.verts)
        t2 = bmesh.new()
        bmesh.ops.create_cone(t2, cap_ends=False, cap_tris=False, segments=seg, radius1=r * 0.92, radius2=0.0, depth=tip)
        bmesh.ops.translate(t2, vec=(0, 0, L - tip / 2), verts=t2.verts)
        me = bpy.data.meshes.new('_t'); t2.to_mesh(me); t2.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    return b


def lash(P, mat, at, r=0.09, turns=3, color='#a8895a', pitch=0.03):
    """Rope lashing: stacked thin tori around a pole at matrix `at`."""
    for k in range(turns):
        P.add(torus(r, 0.014, 12, 4), mat, color, at @ M((0, 0, (k - (turns - 1) / 2) * pitch), (0.12 * (k % 2 - 0.5), 0, 0)), var=0.08)


def axis_point(m, deform, z):
    """World position of a point on a deformed primitive's axis (to attach things to bent limbs)."""
    p = Vector((0, 0, z))
    if deform:
        p = deform(p)
    return m @ p
