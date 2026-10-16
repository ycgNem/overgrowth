// The camp round the Heartwood: the Coffer (the stash) and the three benches (Workbench, Fire
// Pit, Tinker's Bench). Each has a fixed spot in the clearing, a little way out from the
// Heartwood on the side you come back to, facing in. A bench not built yet is a marked plot (a
// ring of stones and a flagged stake); building it and raising it to levels 2 and 3 shows on
// the model (its "L2" and "L3" parts). The Workbench starts built.
//
// Inside the camp (CAMP_RADIUS of the Heart) every built bench's recipes can be made from the
// satchel, and they draw on the Coffer too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cloneModel, part } from '../assets/Models.js';
import { setEmit } from '../art/merge.js';
import { terrainHeight } from '../world/WorldGen.js';
import { BENCHES } from '../items/Recipes.js';
import { BASE_CLEAR } from './Base.js';

export const CAMP_RADIUS = BASE_CLEAR;

// where each stands: angle round the Heart (the player respawns at 2.2), distance, collider
// tucked in close round the Heartwood's roots (inside 8.5 m), so the ring where towers want to
// stand (9-14 m) stays free on the camp's side too: out at 10 m the benches were eating it
const SITES = {
  coffer: { a: 2.3, d: 7.0, r: 0.85 },
  bench: { a: 1.84, d: 7.3, r: 1.05 },
  kiln: { a: 2.78, d: 7.3, r: 0.95 },
  tinker: { a: 1.38, d: 7.2, r: 0.9 },
};

// the plot of a bench not built yet: a ring of stones and a stake with a strip of cloth
let plotGeo = null;
const plotMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
function plotGeometry() {
  if (plotGeo) return plotGeo;
  const parts = [];
  const tint = (g, c) => {
    const col = new THREE.Color(c);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new THREE.DodecahedronGeometry(0.13 + (i % 3) * 0.03, 0);
    g.scale(1.2, 0.7, 1).translate(Math.cos(a) * 0.9, 0.05, Math.sin(a) * 0.9);
    parts.push(tint(g.index ? g.toNonIndexed() : g, i % 2 ? 0x77726a : 0x5e5a54));
  }

  plotGeo = mergeGeometries(parts);
  plotGeo.computeVertexNormals();
  return plotGeo;
}

export class Camp {
  constructor(scene, world, base) {
    this.scene = scene;
    this.base = base;
    this.levels = { bench: 1, kiln: 0, tinker: 0 };
    this.open = 0; // the Coffer's lid, 0 shut .. 1 open
    this.openWant = 0;
    this.sites = {};
    world.extraStatic = world.extraStatic || [];
    for (const [id, s] of Object.entries(SITES)) {
      const x = base.x + Math.sin(s.a) * s.d, z = base.z + Math.cos(s.a) * s.d;
      const y = terrainHeight(x, z) - 0.03;
      const site = { id, x, y, z, rot: s.a + Math.PI, r: s.r, obj: null, plot: null };
      this.sites[id] = site;
      // solid for the player and for placing, and the Blight walk round it
      world.extra.colliders.push({ type: 'circle', x, z, r: s.r, top: Infinity, kind: 'camp' });
      world.extraStatic.push({ x, z, r: s.r });
      const label = id === 'coffer' ? 'The Coffer' : BENCHES[id].name;
      site.interactable = { kind: 'camp', site: id, x, y: y + 0.8, z, r: s.r + 0.6, label };
      world.extra.interactables.push(site.interactable);
    }
    const c = this.sites.coffer;
    c.obj = this.place('coffer', c);
    this.lid = part(c.obj, 'Lid');
    this.rune = part(c.obj, 'Rune');
    for (const id of Object.keys(BENCHES)) this.show(id);
  }

  place(model, s) {
    const o = cloneModel(model, { own: true });
    o.position.set(s.x, s.y, s.z);
    o.rotation.y = s.rot;
    this.scene.add(o);
    return o;
  }

  // the model at its level, or the plot
  show(id) {
    const s = this.sites[id], lv = this.levels[id];
    if (lv > 0 && !s.obj) {
      s.obj = this.place(BENCHES[id].model, s);
      s.ember = part(s.obj, 'Ember') || part(s.obj, 'Lamp');
    }
    if (s.obj) {
      s.obj.visible = lv > 0;
      const l2 = part(s.obj, 'L2'), l3 = part(s.obj, 'L3');
      if (l2) l2.visible = lv >= 2;
      if (l3) l3.visible = lv >= 3;
    }
    if (lv === 0 && !s.plot) {
      // the bench as it will stand, pale and see-through, over its ring of stones
      s.plot = new THREE.Group();
      const ghost = cloneModel(BENCHES[id].model, { own: true });
      ghost.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.material.transparent = true;
        o.material.opacity = 0.28;
        o.material.depthWrite = false;
        if (/^L[23]/.test(o.parent?.name || '') || /^L[23]/.test(o.name)) o.visible = false;
      });
      for (const n of ['L2', 'L3']) { const q = part(ghost, n); if (q) q.visible = false; }
      s.plot.add(ghost);
      const ring = new THREE.Mesh(plotGeometry(), plotMat);
      ring.castShadow = true;
      s.plot.add(ring);
      s.plot.position.set(s.x, s.y, s.z);
      s.plot.rotation.y = s.rot;
      this.scene.add(s.plot);
    }
    if (s.plot) s.plot.visible = lv === 0;
  }

  setLevel(id, lv) {
    this.levels[id] = Math.max(0, Math.min(3, lv));
    this.show(id);
  }

  // what building or raising bench id costs next (null at level 3)
  nextCost(id) {
    return BENCHES[id].levels[this.levels[id]] ?? null;
  }

  inCamp(x, z) {
    return Math.hypot(x - this.base.x, z - this.base.z) < CAMP_RADIUS;
  }

  update(dt, t, night, lights) {
    // the lid swings up while the Coffer is open
    this.open += (this.openWant - this.open) * Math.min(1, dt * 7);
    if (this.lid) this.lid.rotation.x = -1.25 * this.open;
    if (this.rune) setEmit(this.rune, 0.8 + 0.35 * Math.sin(t * 1.7) + this.open * 0.6);
    for (const id of Object.keys(BENCHES)) {
      const s = this.sites[id];
      if (!s.ember || !s.obj?.visible) continue;
      const k = 0.85 + 0.2 * Math.sin(t * 3.1 + s.x) + 0.1 * Math.sin(t * 7.3);
      setEmit(s.ember, k);
      // the kiln and the tinker's lamp light the camp at night (a pooled light, asked for each frame)
      if (night > 0.3) {
        s.lightPos ??= new THREE.Vector3(s.x, s.y + (id === 'kiln' ? 0.5 : 1.0), s.z);
        lights?.request(s.lightPos, id === 'kiln' ? 0xff8a3a : 0xffc070, (id === 'kiln' ? 10 : 6) * k * night, 9, 0.5);
      }
    }
  }

  state() {
    return { ...this.levels };
  }

  restore(levels) {
    for (const id of Object.keys(BENCHES)) this.setLevel(id, levels?.[id] ?? (id === 'bench' ? 1 : 0));
  }
}
