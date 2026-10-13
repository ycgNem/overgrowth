# Rebuild and export every Overgrowth model. Run inside Blender:
#   exec(open(r"<repo>/art/blender/export_all.py").read())
import os
ROOT = r"C:/Users/jacks/Documents/overgrowth"
JOBS = [('heartwood', 'Heartwood'), ('bow_tower', 'BowTower'), ('spore_mortar', 'SporeMortar'), ('tesla_totem', 'TeslaTotem'),
        ('barricade', 'Barricade'), ('blightling', 'Blightling'), ('rotboar', 'Rotboar')]
report = {}
for script, coll_name in JOBS:
    exec(open(f"{ROOT}/art/blender/{script}.py").read())
    report[script] = export_glb(bpy.data.collections[coll_name], f"{ROOT}/public/models/{script}.glb")
for c in bpy.context.scene.collection.children:
    lc = bpy.context.view_layer.layer_collection.children.get(c.name)
    if lc:
        lc.hide_viewport = False
bpy.ops.wm.save_as_mainfile(filepath=f"{ROOT}/art/blender/overgrowth_assets.blend", copy=True)
print(report)
