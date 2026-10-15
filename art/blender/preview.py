# Quick look at models while modelling: builds each named model and renders it (Workbench,
# vertex colours, a 3/4 view and a side view) to OG_PREVIEW (default: <repo>/e2e/out/models).
#   blender -b --factory-startup -P art/blender/preview.py -- crate tent
import os, sys, bpy, math
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))).replace("\\", "/")
# COLL (model name -> collection) from the exporter
exec(open(f"{ROOT}/art/blender/export_new.py").read().split('names =')[0])
OUT = os.environ.get('OG_PREVIEW', f"{ROOT}/e2e/out/models")
os.makedirs(OUT, exist_ok=True)
names = sys.argv[sys.argv.index('--') + 1:]
exec(open(f"{ROOT}/art/blender/oglib.py").read())
SCN = bpy.context.scene
# the factory scene's cube, light and camera
for o in list(SCN.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SCN.render.engine = 'BLENDER_WORKBENCH'
sh = SCN.display.shading
sh.light = 'STUDIO'
sh.color_type = 'VERTEX'
sh.show_shadows = True
sh.show_cavity = True
SCN.render.resolution_x, SCN.render.resolution_y = 900, 700
SCN.render.film_transparent = False
SCN.world = SCN.world or bpy.data.worlds.new('W')
cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
SCN.collection.objects.link(cam)
SCN.camera = cam
for name in names:
    exec(open(f"{ROOT}/art/blender/{name}.py").read())
    coll = bpy.data.collections[COLL[name]]
    obs = [o for o in coll.all_objects if o.type == 'MESH']
    lo = Vector((1e9, 1e9, 1e9)); hi = -lo
    for o in obs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    ctr = (lo + hi) / 2
    size = (hi - lo).length
    for tag, az, el in (('a', -0.75, 0.42), ('b', 0.9, 0.18)):
        d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        cam.location = ctr + d * size * 1.25
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = 50
        SCN.render.filepath = f"{OUT}/{name}_{tag}.png"
        bpy.ops.render.render(write_still=True)
    for o in coll.all_objects:
        o.hide_render = True
    print('PREVIEW', name, sum(len(o.data.polygons) for o in obs), 'faces')
