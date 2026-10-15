# Headless export of one or more models:  blender -b --factory-startup -P export_new.py -- wisp thornback ...
import os, sys, bpy
# the repo root, two levels up from this script
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))).replace("\\", "/")
COLL = {'heartwood': 'Heartwood', 'bow_tower': 'BowTower', 'spore_mortar': 'SporeMortar', 'tesla_totem': 'TeslaTotem',
        'barricade': 'Barricade', 'blightling': 'Blightling', 'rotboar': 'Rotboar', 'wisp': 'Wisp', 'thornback': 'Thornback',
        'ember_brazier': 'EmberBrazier', 'vine_snare': 'VineSnare', 'hand': 'Hand',
        'spitter': 'Spitter', 'burrower': 'Burrower', 'glow_lantern': 'GlowLantern',
        'crate': 'Crate', 'crate_b': 'CrateB', 'tent': 'Tent', 'wreck': 'Wreck'}
# OG_OUT overrides the output folder (e.g. to compare before copying over the live models)
OUT = os.environ.get('OG_OUT', f"{ROOT}/public/models")
names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(COLL)
exec(open(f"{ROOT}/art/blender/oglib.py").read())
for _model in names:
    exec(open(f"{ROOT}/art/blender/{_model}.py").read())
    print('EXPORT', _model, export_glb(bpy.data.collections[COLL[_model]], f"{OUT}/{_model}.glb"))
