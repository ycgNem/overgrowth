# Supply crate: a 1 m box of planks on a batten frame, iron corner caps, rope handles and a
# painted stencil. Breakable in the game, so each crate is its own model. Origin on the ground
# at the centre of the base; it's scaled 0.85-1.1 in the game.
# CRATE_VARIANT = 'b' (set by crate_b.py) builds the expedition box instead: green paint,
# iron straps and latches, a pale stencil.
exec(open(r"C:/Users/jacks/Documents/overgrowth/art/blender/oglib.py").read())
import math, random

VAR = globals().pop('CRATE_VARIANT', 'a')
NAME = 'CrateB' if VAR == 'b' else 'Crate'
coll = fresh_collection(NAME)
root = root_empty(NAME, coll)
rnd = random.Random(31 if VAR == 'a' else 47)

# not 'Plank': the detail shader would swap the pine for the grey deadwood photo
plank = get_mat('Crate', 0.88)
paint = get_mat('CratePaint', 0.8)
iron = get_mat('Iron', 0.55, 0.6)
rope = get_mat('Rope', 0.95)
ink = get_mat('Ink', 0.9)

S = 1.0          # outer size
T = 0.035        # plank thickness
F = 0.07         # frame batten width
B = Part('Body', 3)
wood = paint if VAR == 'b' else plank
base_cols = ['#4f5a36', '#56613a', '#4a5432'] if VAR == 'b' else ['#b38b58', '#a67f4f', '#bd9661', '#9f7a4c']
frame_col = '#434d2e' if VAR == 'b' else '#8c6a40'

def planks(face):
    """Four planks across one face (with thin dark gaps), laid in the face's local frame:
    u across, v up, out of the face along +n."""
    n = 4
    w = (S - 2 * 0.004) / n
    for i in range(n):
        u = -S / 2 + 0.004 + w * (i + 0.5)
        col = rnd.choice(base_cols)
        B.add(box(w - 0.012, T, S - 0.01, base=False, cuts=1), wood, col, face @ M((u, 0, 0)),
              deform=jitter(0.003, rnd.randint(0, 99), 9), var=0.18, streak=0.35)

def face_m(k):
    """Matrix of side face k (0..3), centred at mid-height, normal outward (+y local)."""
    a = k * math.pi / 2
    return M((math.sin(a) * (S / 2 - T / 2), -math.cos(a) * (S / 2 - T / 2), S / 2), (0, 0, a))

for k in range(4):
    fm = face_m(k)
    planks(fm)
    # the batten frame proud of the planks
    out = M((0, -T, 0))
    for z in (-S / 2 + F / 2, S / 2 - F / 2):
        B.add(box(S - 0.02, T, F, base=False, chamfer=0.006), wood, frame_col, fm @ out @ M((0, 0, z)), var=0.12, streak=0.3)
    for u in (-S / 2 + F / 2, S / 2 - F / 2):
        B.add(box(F, T, S - 2 * F, base=False, chamfer=0.006), wood, frame_col, fm @ out @ M((u, 0, 0)), var=0.12, streak=0.3)
    if VAR == 'a' and k % 2 == 0:
        # a diagonal brace across the plain crate's front and back
        L = math.hypot(S - 2 * F, S - 2 * F)
        B.add(box(F * 0.9, T, L, base=False, chamfer=0.006), wood, frame_col, fm @ out @ M((0, 0, 0), (0, math.atan2(1, 1), 0)), var=0.12, streak=0.3)
    # stencil on the faces without a brace
    if (VAR == 'a' and k == 1) or (VAR == 'b' and k in (1, 3)):
        sc = '#2a2218' if VAR == 'a' else '#d9d2b8'
        sm = fm @ M((0, -T - 0.0035, -0.1))
        # a bar, the broad arrow (barbs meeting at the top of its stem) and a number block
        B.add(box(0.42, 0.003, 0.06, base=False), ink, sc, sm @ M((0, 0, 0.2)), var=0.25)
        for s in (-1, 1):
            B.add(box(0.035, 0.003, 0.15, base=False), ink, sc, sm @ M((s * 0.04, 0, 0.02), (0, -s * 0.6, 0)), var=0.25)
        B.add(box(0.035, 0.003, 0.25, base=False), ink, sc, sm @ M((0, 0, -0.03)), var=0.25)
        for j in range(3):
            B.add(box(0.06, 0.003, 0.09, base=False), ink, sc, sm @ M((-0.1 + j * 0.1, 0, -0.27)), var=0.3)

# lid and floor: planks across the top, a batten round the lid's edge
for z, flip in ((S - T / 2, 1), (T / 2, -1)):
    for i in range(4):
        w = S / 4
        y = -S / 2 + w * (i + 0.5)
        B.add(box(S - 0.01, w - 0.012, T, base=False, cuts=1), wood, rnd.choice(base_cols), M((0, y, z)), deform=jitter(0.003, rnd.randint(0, 99), 9), var=0.18, streak=0.35)
for k in range(4):
    a = k * math.pi / 2
    B.add(box(S + 0.01, F, T, base=False, chamfer=0.005), wood, frame_col, M((math.sin(a) * (S / 2 - F / 2), -math.cos(a) * (S / 2 - F / 2), S + T / 2), (0, 0, a)), var=0.12)

# iron corner caps on the eight corners
for cx in (-1, 1):
    for cy in (-1, 1):
        for cz in (0, 1):
            p = Vector((cx * (S / 2 + 0.004), cy * (S / 2 + 0.004), cz * (S + T) + (0.0 if cz else 0.0)))
            for ax in range(3):
                d = [0.11, 0.11, 0.11]
                d[ax] = 0.008
                o = [cx * -0.05, cy * -0.05, -0.05 if cz else 0.05]
                o[ax] = 0
                q = p + Vector(o)
                B.add(box(*d, base=False), iron, '#3a3532', M(q), var=0.2, streak=0.5)
            B.add(sphere(0.012, 6, 4), iron, '#4a4440', M(p + Vector((cx * 0.004, cy * -0.03, (-0.03 if cz else 0.03)))))

if VAR == 'b':
    # iron straps over the lid and down two sides, with latches
    for u in (-0.3, 0.3):
        for k in (1, 3):
            fm = face_m(k)
            B.add(box(0.05, 0.006, S - 0.04, base=False), iron, '#2f2c28', fm @ M((u, -T - 0.004, 0)), var=0.15, streak=0.6)
        B.add(box(S + 0.02, 0.05, 0.006, base=False), iron, '#2f2c28', M((0, u, S + T + 0.004)), var=0.15, streak=0.6)
    for u in (-0.25, 0.25):
        fm = face_m(0)
        B.add(box(0.07, 0.02, 0.1, base=False, chamfer=0.004), iron, '#5a5048', fm @ M((u, -T - 0.012, S / 2 - 0.12)), var=0.2)
        B.add(torus(0.022, 0.006, 8, 4), iron, '#5a5048', fm @ M((u, -T - 0.022, S / 2 - 0.2), (math.pi / 2, 0, 0)))

# rope handles on the two ends
for k in (1, 3) if VAR == 'a' else (0, 2):
    fm = face_m(k)
    hz = 0.3 if VAR == 'a' else 0.12
    hm = fm @ M((0, -T - 0.06, hz))
    for s in (-1, 1):
        B.add(cyl(0.012, 0.012, 0.07, 5), rope, '#b39563', fm @ M((s * 0.12, -T - 0.03, hz), (math.pi / 2, 0, 0)))
    pts = [Vector((s * 0.12, 0, 0)) for s in (-1,)] + [Vector((math.sin(t) * 0.12, -math.cos(t) * 0.05 - 0.02, -abs(math.sin(t)) * 0.02)) for t in (-1.2, -0.6, 0, 0.6, 1.2)] + [Vector((0.12, 0, 0))]
    for j in range(len(pts) - 1):
        mm, ll = look_m(pts[j], pts[j + 1])
        B.add(cyl(0.012, 0.012, ll * 1.05, 5), rope, '#b39563', hm @ mm)

body = B.build(coll, root)
isolate(coll)
print('ok', len(body.data.polygons))
