# Husk: the day-walker. Built on the Blightling's frame (same animated nodes: Head > Jaw, the
# four legs, Tail) but grown over: pale weathered bark, moss on the back, amber eyes instead of
# blight-violet, and the rags of what it used to be draped over its shoulders: a strip of the
# expedition's canvas, a strap and buckle, a tin cup on a cord.
import math, random
ROOT_ = r"C:/Users/jacks/Documents/overgrowth/art/blender"
src = open(f"{ROOT_}/blightling.py").read()
for a, b in (
    ("fresh_collection('Blightling')", "fresh_collection('Husk')"),
    ("root_empty('Blightling', coll)", "root_empty('Husk', coll)"),
    ("random.Random(66)", "random.Random(77)"),
    ("emit=(0.7, 0.18, 1.0), strength=3.0", "emit=(1.0, 0.5, 0.15), strength=2.2"),
    ("emit=(1.0, 0.45, 0.95), strength=8.0", "emit=(1.0, 0.72, 0.3), strength=6.0"),
    ("DARK = '#3c3836'", "DARK = '#5e5040'"),
    ("MID = '#5c564a'", "MID = '#7e705a'"),
    ("isolate(coll)\nprint(", "husk_extra(coll, root)\nisolate(coll)\nprint("),
):
    assert a in src, a
    src = src.replace(a, b)


def husk_extra(coll, root):
    rr = random.Random(5)
    canvas = get_mat('Canvas', 0.9)
    moss = get_mat('Moss', 0.95)
    iron = get_mat('Iron', 0.5, 0.6)
    leather = get_mat('Leather', 0.8)
    X = Part('Rags', 21)
    # moss in clumps along the back
    for k in range(7):
        y = 0.28 - k * 0.1
        X.add(ico(rr.uniform(0.05, 0.08), 1), moss, rr.choice(['#5a7a2a', '#4e6e24', '#68862f']),
              M((rr.uniform(-0.1, 0.1), y, BODY_Z + 0.2 + 0.04 * math.sin(k)), (0, 0, 0), (1.4, 1.2, 0.5)), deform=jitter(0.01, k, 12), var=0.2)
    # a strip of canvas over the shoulders, hanging down both sides, torn at the ends
    def rag(bm):
        bmesh.ops.create_grid(bm, x_segments=6, y_segments=3, size=0.5)
    def drape(co):
        x = co.x  # -0.5..0.5 across the back
        z = -abs(x) * 0.6 + 0.08 * math.sin(co.y * 9)
        return Vector((x * 0.62, co.y * 0.26, z + noise.noise(co * 6) * 0.02))
    X.add(rag, canvas, '#6e6a44', M((0, -0.2, BODY_Z + 0.24)), deform=drape, var=0.25, streak=0.3)
    # a leather strap round the chest with a buckle
    X.add(torus(0.2, 0.014, 14, 4), leather, '#4a3424', M((0, -0.12, BODY_Z + 0.02), (math.pi / 2 - 0.2, 0, 0), (1.1, 0.95, 1)), var=0.15)
    X.add(box(0.05, 0.012, 0.05, base=False), iron, '#8a7a5a', M((0.21, -0.12, BODY_Z + 0.02)), var=0.1)
    # a tin cup on a cord at its hip
    X.add(cyl(0.035, 0.03, 0.06, 8), iron, '#7a7a76', M((-0.22, 0.12, BODY_Z - 0.2)), var=0.15)
    X.add(cyl(0.004, 0.004, 0.16, 4), leather, '#4a3424', M((-0.2, 0.12, BODY_Z - 0.14), (0.2, 0, 0)), var=0.1)
    # the explorer's pack still strapped to its back, a bedroll across the top: it was one of them
    X.add(box(0.3, 0.2, 0.32, chamfer=0.02), canvas, '#5e5a3a', M((0, 0.08, BODY_Z + 0.16), (0.25, 0, 0)), deform=jitter(0.015, 3, 6), var=0.2, streak=0.3)
    X.add(box(0.26, 0.04, 0.16, chamfer=0.01), leather, '#4a3424', M((0, -0.02, BODY_Z + 0.3), (0.25, 0, 0)), var=0.15)
    X.add(cyl(0.07, 0.07, 0.42, 10), canvas, '#7a6a48', M((-0.21, 0.12, BODY_Z + 0.5), (0, math.pi / 2, 0)), var=0.2)
    for x in (-0.12, 0.12):
        X.add(torus(0.075, 0.01, 10, 4), leather, '#3a2a1c', M((x, 0.12, BODY_Z + 0.5), (0, math.pi / 2, 0)), var=0.1)
    X.build(coll, root)


exec(src)
