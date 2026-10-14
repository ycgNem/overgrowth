# Generate the raw photographs for the world's textures with Flux (ComfyUI), one job after
# another, skipping jobs whose images already exist. The prompts and seeds are in jobs.json;
# process.py then turns the raw images into the tiles and atlases in public/textures.
#
#   uv run --no-project art/textures/generate.py [raw_dir]       (default: art/textures/raw)
#
# Needs ComfyUI on http://127.0.0.1:8188 and the comfyui skill's comfy.py + Flux.2 workflow
# (COMFY_SKILL, default ~/.claude/skills/comfyui). Raw images are not committed.
import json, os, subprocess, sys, glob, time

ROOT = os.path.dirname(os.path.abspath(__file__))
C = os.environ.get('COMFY_SKILL', os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'comfyui'))
jobs = json.load(open(os.path.join(ROOT, 'jobs.json'), encoding='utf-8'))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'raw')
os.makedirs(out, exist_ok=True)
for j in jobs:
    have = glob.glob(os.path.join(out, f"{j['name']}_*.png"))
    if len(have) >= j.get('batch', 1):
        print(f"skip {j['name']}", flush=True)
        continue
    t0 = time.time()
    cmd = ['uv', 'run', '--no-project', os.path.join(C, 'scripts', 'comfy.py'), 'run',
           os.path.join(C, 'workflows', 'txt2img_flux2_klein9b.json'),
           '--prompt', j['prompt'], '--name', j['name'], '--out', out, '--seed', str(j.get('seed', 1)),
           '--set', f"batch={j.get('batch', 1)}", '--set', f"width={j['w']}", '--set', f"height={j['h']}"]
    if j.get('negative'):
        cmd += ['--set', f"negative={j['negative']}"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(f"{j['name']}: rc={r.returncode} {int(time.time() - t0)}s {r.stderr.strip()[-300:]}", flush=True)
print('ALL DONE', flush=True)
