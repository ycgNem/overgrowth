// Picking a quality for a machine nobody has tuned yet. The first time the game boots it reads
// the graphics card's name and guesses: integrated and software renderers start on Low, small
// laptops and older cards on Medium, everything else on High. The choice is stored as the
// player's setting, so the Settings page shows it and changing it sticks.
const KEY = 'og.quality';

export function storedQuality() {
  try {
    const q = localStorage.getItem(KEY);
    return q === 'low' || q === 'medium' || q === 'high' ? q : null;
  } catch {
    return null;
  }
}

// the GPU's name as the browser reports it ('' when it hides it)
export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return '';
  }
}

export function guessQuality(renderer) {
  const name = gpuName(renderer).toLowerCase();
  const mem = navigator.deviceMemory ?? 8, cores = navigator.hardwareConcurrency ?? 8;
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(name)) return 'low';
  // integrated graphics: Intel, AMD APUs ("Radeon(TM) Graphics", "Vega 8"), phone GPUs
  const integrated = /intel|iris|uhd|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|radeon graphics|vega \d\b|apple gpu/.test(name);
  if (integrated) return mem <= 8 || cores <= 4 ? 'low' : 'medium';
  // old or entry discrete cards
  if (/gtx (6|7|9)\d\d|gtx 10[56]0|mx\d{3}|gt \d{3,4}|rx (4|5)\d0|r[579] /.test(name)) return 'medium';
  if (mem <= 4 || cores <= 2) return 'medium';
  return 'high';
}

// the stored setting, or a guess that is then stored
export function bootQuality(renderer) {
  const q = storedQuality();
  if (q) return q;
  const g = guessQuality(renderer);
  try {
    localStorage.setItem(KEY, g);
  } catch {
    // storage blocked: guess again next time
  }
  return g;
}
