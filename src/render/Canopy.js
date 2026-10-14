// Sky occlusion under the canopy. A small texture around the player says, per square
// metre-and-a-half, how much of the sky the tree crowns hide and how high they are. It is
// stamped on the CPU from the planned trees (no extra render pass) whenever the player
// moves a few metres, and every lit material reads it to dim its *ambient* light: the
// forest floor under the giants goes dark and green while sunflecks and clearings keep
// their full sun. (Direct sunlight is the shadow map's job.)
//
// three clones Vector/Color/Texture uniform values per material; a clone of a texture
// shares its GPU texture through `source`, and typed arrays are passed by reference, so
// one update here reaches every material.
import * as THREE from 'three';
import { CHUNK_SIZE as CS } from '../world/WorldGen.js';

const N = 128;
const SIZE = 192;
const SNAP = 12;
const TX = SIZE / N;

// x0, z0, size, strength (0 = no map yet; Game sets how much sky the crowns hide)
export const canopyBox = new Float32Array([0, 0, SIZE, 0]);

// crown footprint per tree type: radius scale and how solid the crown is
const CASTERS = { bigTree: 0.95, midTree: 0.6, smallTree: 0.75, palm: 0.5, treeFern: 0.6 };

export class CanopyMap {
  constructor() {
    this.cov = new Float32Array(N * N);
    this.top = new Float32Array(N * N);
    this.data = new Uint16Array(N * N * 4);
    const t = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    this.texture = t;
    this.key = '';
  }

  update(world, flora, px, pz, renderer, force = false) {
    const x0 = Math.round(px / SNAP) * SNAP - SIZE / 2, z0 = Math.round(pz / SNAP) * SNAP - SIZE / 2;
    const key = `${x0},${z0},${world.cut.size},${world.clearings.length}`;
    if (!force && key === this.key) return;
    this.key = key;
    const cov = this.cov.fill(0), top = this.top.fill(-50);
    const T = flora.types;
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor((x0 + SIZE) / CS); cx++) {
      for (let cz = Math.floor(z0 / CS); cz <= Math.floor((z0 + SIZE) / CS); cz++) {
        const items = world.plan(cx, cz).items;
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const solid = CASTERS[it.type];
          if (!solid || world.cut.has(`${cx},${cz}:${idx}`)) continue;
          const crown = T[it.type].variants[it.v].crown;
          if (!crown) continue;
          const R = crown.r * it.s, H = it.y + crown.top * it.s;
          // the crown sits over the trunk top, which leans: offset is part of the crown info
          const c = Math.cos(it.ry), s = Math.sin(it.ry);
          const ox = it.x + (crown.x * c + crown.z * s) * it.s, oz = it.z + (-crown.x * s + crown.z * c) * it.s;
          const i0 = Math.max(0, Math.floor((ox - R - x0) / TX)), i1 = Math.min(N - 1, Math.ceil((ox + R - x0) / TX));
          const j0 = Math.max(0, Math.floor((oz - R - z0) / TX)), j1 = Math.min(N - 1, Math.ceil((oz + R - z0) / TX));
          for (let j = j0; j <= j1; j++) {
            const wz = z0 + (j + 0.5) * TX;
            for (let i = i0; i <= i1; i++) {
              const wx = x0 + (i + 0.5) * TX;
              const d = Math.hypot(wx - ox, wz - oz) / R;
              if (d >= 1) continue;
              const k = solid * (1 - smoothstep(0.5, 1, d));
              const n = j * N + i;
              cov[n] = 1 - (1 - cov[n]) * (1 - k);
              if (H > top[n]) top[n] = H;
            }
          }
        }
      }
    }
    // clearings (the base) let the sky in however the plan reads
    const half = THREE.DataUtils.toHalfFloat;
    const D = this.data;
    for (let n = 0; n < N * N; n++) {
      D[n * 4] = half(cov[n]);
      D[n * 4 + 1] = half(top[n]);
      D[n * 4 + 2] = 0;
      D[n * 4 + 3] = half(1);
    }
    canopyBox[0] = x0; canopyBox[1] = z0; canopyBox[2] = SIZE; canopyBox[3] = Math.max(canopyBox[3], 0.5);
    this.texture.needsUpdate = true;
    // materials hold clones of this texture; uploading the original updates the shared GPU copy
    renderer.initTexture(this.texture);
  }
}

// Canopy cover (0..1) over a world point, blurred over a few metres (for eye adaptation).
CanopyMap.prototype.coverAt = function coverAt(x, z) {
  if (!this.key) return 0;
  const i = Math.floor((x - canopyBox[0]) / TX), j = Math.floor((z - canopyBox[1]) / TX);
  let s = 0, n = 0;
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      s += this.cov[jj * N + ii];
      n++;
    }
  }
  return n ? s / n : 0;
};

// the same over a wider area (radius r cells, every other cell): how much of the air around
// the player is in the crowns' shade, for the haze, which shouldn't flicker with every sun fleck
CanopyMap.prototype.coverAround = function coverAround(x, z, r = 10) {
  if (!this.key) return 0;
  const i = Math.floor((x - canopyBox[0]) / TX), j = Math.floor((z - canopyBox[1]) / TX);
  let s = 0, n = 0;
  for (let dj = -r; dj <= r; dj += 2) {
    for (let di = -r; di <= r; di += 2) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      s += this.cov[jj * N + ii];
      n++;
    }
  }
  return n ? s / n : 0;
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Hook the occlusion into every lit built-in material (call before any material compiles).
export function installCanopy(texture) {
  const C = THREE.ShaderChunk;
  if (C.lights_pars_begin.includes('ogSkyVis')) return;
  C.lights_pars_begin += /* glsl */`
uniform sampler2D ogCanopy;
uniform vec4 ogCanopyBox;
// fraction of the sky still visible from world point p
float ogSkyVis( vec3 p ) {
  if ( ogCanopyBox.w <= 0.0 ) return 1.0;
  vec2 uv = ( p.xz - ogCanopyBox.xy ) / ogCanopyBox.z;
  if ( uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) return 1.0;
  float topY = textureLod( ogCanopy, uv, 0.0 ).g;
  float below = topY - p.y;
  // deeper under the canopy, the sky hides behind a wider patch of crowns
  float lod = clamp( log2( max( below, 1.0 ) * 0.8 / ${TX.toFixed(3)} ), 0.0, 5.0 );
  float cov = textureLod( ogCanopy, uv, lod ).r;
  return 1.0 - cov * smoothstep( 0.3, 4.0, below ) * ogCanopyBox.w;
}
`;
  // lit materials only (RE_IndirectDiffuse): MeshBasicMaterial includes this chunk too
  C.aomap_fragment = C.aomap_fragment + /* glsl */`
#if defined( RE_IndirectDiffuse )
{
  vec3 ogWP = cameraPosition + transpose( mat3( viewMatrix ) ) * ( - vViewPosition );
  float ogSV = ogSkyVis( ogWP );
  // what light is left under the leaves comes through them: a little greener
  reflectedLight.indirectDiffuse *= ogSV * mix( vec3( 1.0 ), vec3( 0.86, 1.0, 0.78 ), 1.0 - ogSV );
  // reflections come from a narrower patch of sky than the diffuse fill: the crowns hide more of it
  reflectedLight.indirectSpecular *= ogSV * ogSV;
}
#endif
`;
  for (const id of ['standard', 'physical', 'lambert', 'phong', 'toon']) {
    const u = THREE.ShaderLib[id]?.uniforms;
    if (!u) continue;
    u.ogCanopy = { value: texture };
    u.ogCanopyBox = { value: canopyBox };
  }
}
