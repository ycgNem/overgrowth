# The Rot Mother: night 15 and every fifth after. The Thornback's frame (the same animated nodes:
# Head > Jaw, the four legs, Tail, Sac), gone soft and swollen: bruise-violet bark, fewer thorns,
# a brood sac glowing sick green where the Thornback's burned violet, and behind her hips a vast
# abdomen studded with eggs and trailing strings of them. Origin on the ground; forward is -Y.
import math, random
ROOT_ = r"C:/Users/jacks/Documents/overgrowth/art/blender"
src = open(f"{ROOT_}/thornback.py").read()
for a, b in (
    ("fresh_collection('Thornback')", "fresh_collection('RotMother')"),
    ("root_empty('Thornback', coll)", "root_empty('RotMother', coll)"),
    ("random.Random(505)", "random.Random(515)"),
    ("WOOD = '#4c403a'", "WOOD = '#5c4048'"),
    ("DARK = '#3a302e'", "DARK = '#40282f'"),
    ("PALE = '#b5a88c'", "PALE = '#c8b4a0'"),
    ("emit=(0.8, 0.25, 1.0), strength=2.4", "emit=(0.75, 1.0, 0.35), strength=2.2"),
    ("for k in range(26):", "for k in range(12):"),
    # softer and smoother than the Thornback: her bark plates are a level lighter (the budget)
    ("B.add(ico(0.25, 2), crust", "B.add(ico(0.25, 1), crust"),
    ("P.add(ico(0.2, 2), crust", "P.add(ico(0.2, 1), crust"),
    ("S.add(sphere(0.42, 16, 12), sacm", "S.add(sphere(0.55, 14, 10), sacm"),
    ("for k in range(8):\n    t = rnd.uniform(0.15, 0.85)", "for k in range(4):\n    t = rnd.uniform(0.15, 0.85)"),
    ("for k in range(10):\n    t = rnd.uniform(0.1, 0.9)", "for k in range(6):\n    t = rnd.uniform(0.1, 0.9)"),
    ("isolate(coll)\nprint(", "mother_extra(coll, root)\nisolate(coll)\nprint("),
):
    assert a in src, a
    src = src.replace(a, b)


def mother_extra(coll, root):
    rr = random.Random(9)
    flesh = get_mat('Flesh', 0.55)
    bark2 = get_mat('Bark', 0.9)
    egg = get_mat('EggGlow', 0.35, emit=(0.75, 1.0, 0.35), strength=1.6)
    shell = get_mat('EggShell', 0.5)
    X = Part('Brood', 22)
    # the abdomen: a swollen, ribbed bulb hanging off the hips, low to the ground
    A = HP + Vector((0, 1.05, -0.35))
    X.add(sphere(0.85, 14, 10), flesh, '#6a4858', M(A, (0.25, 0, 0), (1.0, 1.3, 0.85)), deform=jitter(0.06, 4, 2), smooth=True, streak=0.5, var=0.15)
    # bark bands gripping it
    for k in range(4):
        y = -0.45 + k * 0.32
        X.add(torus(0.82 - abs(y) * 0.35, 0.05, 14, 4), bark2, '#3a2830', M(A + Vector((0, y * 1.2, 0.02)), (math.pi / 2 + 0.25, 0, 0), (1.0, 0.85, 1)), deform=jitter(0.02, 20 + k, 6), smooth=True)
    # eggs pushing out through the skin, glowing green inside a pale shell
    for k in range(12):
        a = rr.uniform(0, math.tau)
        t = rr.uniform(-0.8, 0.8)
        p = A + Vector((math.cos(a) * 0.78 * math.sqrt(1 - t * t), t * 1.05, math.sin(a) * 0.66 * math.sqrt(1 - t * t)))
        if p.z < A.z - 0.45:
            continue
        s = rr.uniform(0.1, 0.17)
        X.add(sphere(s, 7, 5), shell, '#d8d0b8', M(p, (0, 0, 0), (1, 1, 1.25)), smooth=True, var=0.1)
        X.add(sphere(s * 0.7, 5, 3), egg, (1, 1, 1), M(p + (p - A).normalized() * s * 0.4))
    # strings of eggs trailing from under it to the ground
    for k in range(4):
        base = A + Vector((rr.uniform(-0.4, 0.4), rr.uniform(0.2, 0.8), -0.6))
        for j in range(4):
            q = base + Vector((rr.uniform(-0.05, 0.05), j * 0.08, -j * 0.14))
            if q.z < 0.08:
                break
            X.add(sphere(0.07 - j * 0.008, 5, 3), egg, (1, 1, 1), M(q))
    # a clutch on her back, between the remaining thorns
    for k in range(5):
        p = SH + (HP - SH) * rr.uniform(0.25, 0.85) + Vector((rr.uniform(-0.35, 0.35), 0, 0.72 + rr.uniform(0, 0.1)))
        s = rr.uniform(0.12, 0.18)
        X.add(sphere(s, 7, 5), shell, '#cfc6ac', M(p, (0, 0, 0), (1, 1, 1.2)), smooth=True, var=0.1)
        X.add(sphere(s * 0.65, 5, 3), egg, (1, 1, 1), M(p + Vector((0, 0, s * 0.35))))
    X.build(coll, root)


exec(src)
