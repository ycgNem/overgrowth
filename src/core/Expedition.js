// The Lost Expedition, as it plays: torn pages turning up in containers (a few of them maps
// that mark a root cache), the three seals that once held the rifts shut, Hollis's radio at the
// Tinker's Bench and the supply drops it calls down, and what the last night can end in.
// The story's words live in Story.js; this is the run's side of it, saved with the run.
import * as THREE from 'three';
import { NOTES, noteById, SEALS, RADIO_PARTS, saveNote, loadNotes } from './Story.js';
import { ITEMS, lootGate } from '../items/ItemDB.ts';
import { grove, terrainHeight, terrainNormal, WATER_LEVEL, CHUNK_SIZE } from '../world/WorldGen.js';
import { poisAround } from '../world/poi/POI.js';
import { cloneModel } from '../assets/Models.js';
import { flatten } from '../art/merge.js';
import { glowTexture } from '../art/textures.js';
import { globalUniforms } from '../art/shaders.js';
import { addRecords } from './Save.js';

// the chance a container holds a page, by its loot table
const PAGE_ODDS = { camp: 0.6, wreck: 0.55, crate: 0.25, cache: 0.35, scrap: 0.12, ruin: 0.15, templeChest: 0.4, shrine: 0.5, drop: 0.3 };
// relics that close a seal for good: the gold the seals were made for
const FOREVER = new Set(['golden_idol', 'sun_mask']);
const SEAL_NIGHTS = 2;

// a column of soft light over a set seal or a supply drop's flare, tall enough to stand over
// the canopy (no light source: an additive shell like the Heartwood's, bright through its
// middle and fading to nothing at its sides, so it reads as light and not as a tube)
const BEAM_H = 70;
const BEAM = new THREE.CylinderGeometry(1.7, 0.9, BEAM_H, 16, 1, true).translate(0, BEAM_H / 2, 0);
const beamMats = {};
function beamMat(hex) {
  beamMats[hex] ??= new THREE.ShaderMaterial({
    uniforms: { uTime: globalUniforms.uTime, uCol: { value: new THREE.Color(hex) } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = position.y / ${BEAM_H.toFixed(1)}; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
        float h = pow(clamp(1.0 - vY, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.03, vY);
        float a = pow(edge, 3.0) * h * (0.8 + 0.2 * sin(uTime * 2.4 + vY * 30.0)) * 1.5;
        gl_FragColor = vec4(uCol * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  return beamMats[hex];
}
// a set seal glows in the Heartwood's own colours (not the Blight's violet); gold when it holds
// for good
const SEAL_HEX = 0xc8ffe0, FOREVER_HEX = 0xffd070;
function beam(hex) {
  const m = new THREE.Mesh(BEAM, beamMat(hex));
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}
function glowSprite(hex, s = 1.4) {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: hex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75, fog: false }));
  g.scale.set(s, s, 1);
  return g;
}
// a column of light and a flare, for the load-time shader warm-up (Game.init): the beam's
// shader was first compiled at noon on the day of the first supply drop, mid-frame
export function warmBeams() {
  const g = new THREE.Group();
  g.add(beam(SEAL_HEX), glowSprite(0xff5040, 1.8));
  return g;
}

// the Stone Seal, set up in the ruins: a dressed standing stone with a channel of runes. Its
// material is named Stone so merge.js gives it the ruins' photographed stone, and it is merged
// to a single draw like a Blender model
const stoneMat = new THREE.MeshStandardMaterial({ name: 'Stone', color: 0x8a857a, roughness: 0.95 });
const runeMat = new THREE.MeshStandardMaterial({ name: 'Rune', color: 0x10201a, emissive: 0x70e0b0, emissiveIntensity: 0.9, roughness: 0.6 });
function sealStone() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.5), stoneMat);
  s.position.y = 0.75;
  s.rotation.z = 0.04;
  s.castShadow = true;
  g.add(s);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.65), stoneMat);
  cap.position.y = 1.66;
  cap.castShadow = true;
  g.add(cap);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 1.1), stoneMat);
  slab.position.y = 0.05;
  g.add(slab);
  for (const [w, h, y] of [[0.08, 0.9, 0.8], [0.36, 0.06, 1.1], [0.26, 0.06, 0.55]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), runeMat);
    r.position.set(0, y, -0.26);
    g.add(r);
  }
  return flatten(g);
}

// Hollis's radio on the Tinker's Bench: a battered set with a lamp for every part fitted
const radioMats = {
  case: new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.8 }),
  face: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.6, metalness: 0.3 }),
  off: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5 }),
  on: new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffb050, emissiveIntensity: 1.2, roughness: 0.4 }),
};
function radioSet() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.15), radioMats.case);
  body.position.y = 0.08;
  g.add(body);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12).rotateX(Math.PI / 2), radioMats.face);
  dial.position.set(-0.07, 0.09, 0.078);
  g.add(dial);
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 4), radioMats.face);
  aerial.position.set(0.11, 0.3, -0.04);
  aerial.rotation.z = -0.25;
  g.add(aerial);
  // the case in one draw, the lamps apart (they change)
  const out = new THREE.Group();
  out.add(flatten(g, /^$/, { shadow: false }));
  out.userData.lamps = [0, 1, 2, 3].map((i) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), radioMats.off);
    l.position.set(-0.01 + i * 0.04, 0.11, 0.078);
    out.add(l);
    return l;
  });
  return out;
}

export class Expedition {
  constructor(game) {
    this.g = game;
    this.read = []; // note ids read this run, in order
    this.grafting = false; // the Thornback's heart set in the Workbench (see the setter)
    this.seals = {}; // id -> { relic, until (the night it wakes again), forever }
    this.sites = {}; // id -> { x, y, z, rift, it, key? }
    this.radio = 0; // parts fitted (RADIO_PARTS)
    this.pendingDrops = 0;
    this.drops = []; // live supply drops
    this.dropN = 0;
    this.maps = []; // [{ key, id }] caches a map page marked
    this.idolSet = false; // the golden idol set in the Sun Seal
    this.moonHeld = false; // the idol carried through a Blood Moon (then the Sun Seal takes it)
    this.flown = false;
  }

  // ------------------------------------------------------------------ setup

  // Where the three seals are, and which rift each one holds: the shrine the grove's, the temple
  // and the ruins nearest the Heartwood whichever are nearest them.
  init() {
    const g = this.g, b = g.base;
    const cx = Math.floor(b.x / CHUNK_SIZE), cz = Math.floor(b.z / CHUNK_SIZE);
    const pois = poisAround(cx, cz, 6);
    const nearest = (type, minD = 0) => pois.filter((p) => p.type === type && Math.hypot(p.x - b.x, p.z - b.z) > minD)
      .sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0];
    const G = grove();
    const temple = nearest('temple'), ruins = nearest('ruins', 40);
    const taken = new Set();
    const riftFor = (x, z, grovey = false) => {
      let best = null, bd = Infinity;
      for (const r of g.rifts) {
        if (taken.has(r) || (grovey && !r.grove && g.rifts.some((q) => q.grove && !taken.has(q)))) continue;
        const d = Math.hypot(r.x - x, r.z - z);
        if (d < bd) { bd = d; best = r; }
      }
      if (best) taken.add(best);
      return best;
    };
    if (G) this.addSite('shrine', G.x, WATER_LEVEL - 0.35 + 1.4, G.z, riftFor(G.x, G.z, true), { r: 2.6 });
    if (temple) this.addSite('temple', temple.x, temple.y + 4, temple.z, riftFor(temple.x, temple.z), { key: temple.key, pending: true });
    if (ruins) {
      // a standing stone on the side of the ruins that faces the Heartwood
      const dx = b.x - ruins.x, dz = b.z - ruins.z, dl = Math.hypot(dx, dz) || 1;
      let x = ruins.x + (dx / dl) * 9, z = ruins.z + (dz / dl) * 9;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.1) { x = ruins.x; z = ruins.z; }
      const y = terrainHeight(x, z);
      const stone = sealStone();
      stone.position.set(x, y - 0.05, z);
      stone.rotation.y = Math.atan2(dx, dz) + Math.PI;
      g.scene.add(stone);
      g.world.extra.colliders.push({ type: 'circle', x, z, r: 0.6, top: Infinity });
      this.addSite('ruins', x, y + 1, z, riftFor(x, z), { r: 1.6, obj: stone });
    }
    g.waves.dormant = (r) => this.dormant(r);
  }

  addSite(id, x, y, z, rift, { r = 2.2, key = null, pending = false, obj = null } = {}) {
    const site = { id, x, y, z, rift, key, pending, obj, beam: null };
    site.it = { kind: 'seal', seal: id, x, y, z, r, label: SEALS[id].name, done: pending };
    this.g.world.extra.interactables.push(site.it);
    this.sites[id] = site;
  }

  // the temple's seal is its top altar, found once the temple has streamed in; it only takes a
  // relic once the idol is off it
  resolveTemple() {
    const s = this.sites.temple;
    if (!s?.pending) return;
    for (const ch of this.g.world.chunks.values()) {
      if (ch.poi?.key !== s.key) continue;
      const idol = ch.interactables.find((i) => i.loot === 'temple');
      if (!idol) return;
      Object.assign(s.it, { x: idol.x, y: idol.y, z: idol.z - 0.01 });
      Object.assign(s, { x: idol.x, y: idol.y, z: idol.z, idolIt: idol });
      s.pending = false;
      s.it.done = false;
      return;
    }
  }

  // ------------------------------------------------------------------ pages

  // the unread pages that could turn up by now
  get unread() {
    const n = this.g.waves.night;
    return NOTES.filter((q) => q.from <= n && !this.read.includes(q.id));
  }

  // A container being filled: maybe a page in it (Containers.extra)
  pageFor(it) {
    const odds = PAGE_ODDS[it.loot] ?? 0;
    if (!odds || it.lost) return [];
    // never more pages lying about than there are left to read
    const out = this.unread.length - this.pagesOut();
    if (out <= 0) return [];
    // the first camp or wreck searched always has one: that's how the story starts
    const first = !this.read.length && !this.pagesOut() && (it.loot === 'camp' || it.loot === 'wreck');
    return first || this.g.rand() < odds ? ['torn_page'] : [];
  }

  pagesOut() {
    let n = 0;
    for (const rec of this.g.containers.map.values()) n += rec.inv.count('torn_page');
    return n + this.g.inventory.count('torn_page') + this.g.coffer.count('torn_page');
  }

  // Pages picked up are read at once (by day the page opens; at night it's kept for later)
  readPages() {
    const inv = this.g.inventory;
    let n = inv.count('torn_page');
    if (!n) return;
    inv.remove('torn_page', n);
    while (n-- > 0) {
      const q = this.unread[0];
      if (!q) {
        this.g.hud.message('The page is too far gone to read', '#c9bd9c');
        continue;
      }
      this.read.push(q.id);
      saveNote(q.id);
      if (!this.g.debug) addRecords({}, [], { pages: loadNotes().size });
      this.g.hud.notes = this.read.map(noteById);
      if (q.map) this.markCache(q);
      if (q.id === 'ruiz1' || q.id === 'ruiz2') this.showSeals();
      this.g.journal.event('page', q.id);
      this.g.onPage(q);
    }
  }

  // a map page: the nearest unsearched root cache it can find gets a mark on the compass
  markCache(q) {
    const g = this.g, p = g.player.pos;
    let best = null, bd = Infinity;
    for (const ch of g.world.chunks.values()) {
      for (const it of ch.interactables) {
        if (it.container !== 'cache' || it.done || g.containers.has(it.id) || this.maps.some((m) => m.id === it.id)) continue;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        const score = Math.abs(d - 90);
        if (d > 25 && score < bd) { bd = score; best = it; }
      }
    }
    if (!best) return;
    const key = `map:${q.id}`;
    this.maps.push({ key, id: best.id, x: best.x, z: best.z });
    g.hud.markers.push({ key, x: best.x, z: best.z, icon: '✕', label: 'Marked cache', cls: 'map' });
  }

  // a container opened: if a map marked it, the mark comes off; a drop counts as looted
  opened(it) {
    if (it.drop && !it.counted) {
      it.counted = true;
      this.g.stats.drops++;
    }
    const m = this.maps.find((q) => q.id === it.id);
    if (!m) return;
    this.maps = this.maps.filter((q) => q !== m);
    this.g.hud.markers = this.g.hud.markers.filter((q) => q.key !== m.key);
  }

  // the seals go on the compass once you know there are three
  showSeals() {
    if (this.sealsShown) return;
    this.sealsShown = true;
    for (const s of Object.values(this.sites)) {
      this.g.hud.markers.push({ key: `seal:${s.id}`, x: s.x, z: s.z, icon: '◈', label: SEALS[s.id].name, cls: 'seal' });
    }
  }

  // ------------------------------------------------------------------ seals

  dormant(r) {
    const n = this.g.waves.night;
    return Object.entries(this.seals).some(([id, s]) => this.sites[id]?.rift === r && (s.forever || n < s.until));
  }

  sealHolds(id) {
    const s = this.seals[id];
    return !!s && (s.forever || this.g.waves.night < s.until);
  }

  // which relic you'd set: gold that closes it for good if you carry any (the idol first, and
  // only in the Sun Seal can it go home), else the least of what you carry
  sealRelic(id) {
    const inv = this.g.inventory;
    let rel = inv.slots.filter((s) => s && ITEMS[s.id].kind === 'relic').map((s) => s.id);
    // (the Sun Seal won't take the idol before it has answered a Blood Moon)
    if (id === 'temple' && !this.moonHeld) rel = rel.filter((r) => r !== 'golden_idol');
    if (!rel.length) return null;
    if (id === 'temple' && rel.includes('golden_idol') && this.moonHeld) return 'golden_idol';
    const gold = rel.find((r) => FOREVER.has(r) && r !== 'golden_idol');
    if (gold) return gold;
    const cheap = rel.filter((r) => !FOREVER.has(r)).sort((a, b) => ITEMS[a].value - ITEMS[b].value)[0];
    return cheap || rel[0];
  }

  interactSeal(it, holdAction) {
    const g = this.g, id = it.seal, S = SEALS[id], site = this.sites[id];
    this.showSeals();
    const dir = this.dirOf(site.rift);
    if (this.sealHolds(id)) {
      const s = this.seals[id];
      g.hud.prompt(`${S.name} · holding`, 0, '◈', s.forever ? `The ${dir} rift is closed for good` : `The ${dir} rift sleeps until night ${s.until}`);
      return;
    }
    const relic = this.sealRelic(id);
    // the idol only goes home once it has answered a Blood Moon in your hands
    if (id === 'temple' && !this.moonHeld && g.inventory.count('golden_idol') && (!relic || relic === 'golden_idol')) {
      g.hud.prompt(S.name, 0, '◈', 'The altar is cold. The idol has not answered the moon yet: carry it through a Blood Moon');
      return;
    }
    if (!relic) {
      g.hud.prompt(S.name, 0, '◈', `Set a relic in it and the ${dir} rift sleeps for ${SEAL_NIGHTS} nights. Gold, set back where it belongs, closes it for good`);
      return;
    }
    const forever = FOREVER.has(relic) && (relic !== 'golden_idol' || id === 'temple');
    holdAction(`Set the ${ITEMS[relic].name} in ${S.name}`, 1.8, () => this.setSeal(id, relic, forever),
      forever ? `The ${dir} rift closes for good` : `The ${dir} rift sleeps for ${SEAL_NIGHTS} nights (until night ${g.waves.night + SEAL_NIGHTS})`);
  }

  setSeal(id, relic, forever) {
    const g = this.g, site = this.sites[id], S = SEALS[id];
    g.inventory.remove(relic, 1);
    // set by day it covers tonight and the next; set at night it starts tomorrow
    const n = g.waves.night + (g.waves.phase === 'night' ? 1 : 0);
    this.seals[id] = { relic, until: n + SEAL_NIGHTS, forever };
    g.stats.seals++;
    if (relic === 'golden_idol' && id === 'temple') this.idolSet = true;
    this.dressSeal(id);
    const at = new THREE.Vector3(site.x, site.y, site.z);
    g.particles.sparkle(at, forever ? 0xffd070 : 0xb080ff, 50);
    g.particles.ring(new THREE.Vector3(site.x, site.y - 0.8, site.z), 5, forever ? 0xffd070 : 0xb080ff, 1);
    g.lights.flash(at, forever ? 0xffd070 : 0xb080ff, 120, 0.8, 30);
    g.audio.boon();
    g.journal.event('seal', id);
    const dir = this.dirOf(site.rift);
    g.hud.banner(S.name, forever ? `holds for good. The ${dir} rift is closed.${this.idolSet ? ' The idol is home.' : ''}` : `holds. The ${dir} rift sleeps for ${SEAL_NIGHTS} nights.`, 'win');
    g.syncRifts();
  }

  // a set seal wears a column of light while it holds
  dressSeal(id) {
    const site = this.sites[id], s = this.seals[id];
    const on = this.sealHolds(id);
    if (on && !site.beam) {
      site.beam = new THREE.Group();
      site.beam.add(beam(s.forever ? FOREVER_HEX : SEAL_HEX));
      const glow = glowSprite(s.forever ? FOREVER_HEX : SEAL_HEX, 1.6);
      glow.position.y = 0.4;
      site.beam.add(glow);
      site.beam.position.set(site.x, site.y - 0.6, site.z);
      this.g.scene.add(site.beam);
    } else if (!on && site.beam) {
      this.g.scene.remove(site.beam);
      site.beam = null;
    }
    const m = this.g.hud.markers.find((q) => q.key === `seal:${id}`);
    if (m) m.cls = on ? 'seal on' : 'seal';
  }

  dirOf(r) {
    if (!r) return 'nearest';
    const dx = r.x - this.g.base.x, dz = r.z - this.g.base.z;
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return dirs[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
  }

  // ------------------------------------------------------------------ the radio

  get radioDone() {
    return this.radio >= RADIO_PARTS.length;
  }

  get nextPart() {
    return RADIO_PARTS[this.radio] || null;
  }

  // At the Tinker's Bench (hold F): fit the next part of Hollis's radio
  // the set sits on the bench from the day the bench is built, and lights a lamp a part
  dressRadio() {
    const t = this.g.camp.sites.tinker;
    if (!t?.obj) return;
    if (!this.radioObj) {
      this.radioObj = radioSet();
      this.radioObj.position.set(0.12, 0.75, -0.2);
      this.radioObj.rotation.y = -0.15;
      t.obj.add(this.radioObj);
      this.radioLit = -1;
    }
    if (this.radioLit !== this.radio) {
      this.radioLit = this.radio;
      this.radioObj.userData.lamps.forEach((l, i) => { l.material = i < this.radio ? radioMats.on : radioMats.off; });
    }
  }

  radioPrompt(src) {
    if (this.radioDone) return { done: true, text: 'The radio: the rescue plane comes at first light after the tenth night' };
    const [id, n] = this.nextPart;
    const have = src.count(id) >= n;
    return { have, id, n, text: `Hollis's radio ${this.radio}/${RADIO_PARTS.length} · next: ${n > 1 ? `${n} × ` : ''}${ITEMS[id].name}${have ? ' · hold <kbd>F</kbd> to fit it' : ''}` };
  }

  fitPart(src) {
    const g = this.g;
    const [id, n] = this.nextPart;
    src.remove(id, n);
    this.radio++;
    g.audio.upgrade();
    g.journal.event('radio', this.radio);
    const s = g.camp.sites.tinker;
    g.particles.sparks(new THREE.Vector3(s.x, s.y + 1, s.z), 0xa0e0ff, 24);
    if (this.radioDone) {
      g.hud.banner("Hollis's radio", 'A voice through the static: "Vane Expedition, we hear you. We fly at first light after your tenth night. Hold till then."', 'win');
    } else {
      this.pendingDrops++;
      g.hud.banner("Hollis's radio", `${this.radio}/${RADIO_PARTS.length} parts. Someone answers on 4217: a supply drop at noon. Others will hear it too.`, 'win');
    }
  }

  // ------------------------------------------------------------------ supply drops

  // noon: a crate on a flare somewhere in the forest. The Husks heard the call too.
  placeDrop() {
    const g = this.g, b = g.base;
    let x = 0, z = 0, ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      const a = g.rand() * Math.PI * 2, d = 80 + g.rand() * 70;
      x = b.x + Math.cos(a) * d;
      z = b.z + Math.sin(a) * d;
      ok = terrainHeight(x, z) > WATER_LEVEL + 0.4 && terrainNormal(x, z).y > 0.9;
    }
    if (!ok) return;
    const y = terrainHeight(x, z);
    const obj = new THREE.Group();
    const crate = cloneModel('crate');
    crate.scale.setScalar(1.15);
    crate.rotation.y = g.rand() * 6;
    obj.add(crate);
    // the flare: a red glow and a column of red light, so it's seen from far off
    const flare = glowSprite(0xff5040, 1.8);
    flare.position.set(0.9, 0.25, 0.6);
    obj.add(flare);
    obj.add(beam(0xff5a40));
    obj.position.set(x, y, z);
    g.scene.add(obj);
    const id = `drop:${++this.dropN}`;
    const it = { kind: 'search', drop: true, id, x, y: y + 0.6, z, r: 1.4, label: 'Supply drop', loot: 'drop', time: 1.8, obj, flare };
    g.world.extra.interactables.push(it);
    this.drops.push(it);
    g.hud.markers.push({ key: id, x, z, icon: '⚑', label: 'Supply drop', cls: 'drop' });
    g.hud.banner('Supply drop', 'A crate on a red flare, out in the forest. The Husks are already moving.', 'boss');
    g.audio.horn?.();
    // the Husks close in on it from all sides
    const m = 3 + (g.waves.night >= 6 ? 1 : 0);
    for (let i = 0, tries = 0; i < m && tries < 24; tries++) {
      const a = (i / m) * Math.PI * 2 + g.rand() * 1.5, d = 30 + g.rand() * 15;
      const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
      if (terrainHeight(hx, hz) < WATER_LEVEL + 0.1) continue;
      i++;
      const e = g.enemies.spawn('husk', hx, hz, g.waves.hpScale * 0.85);
      const pts = [0, 1, 2].map((k) => ({ x: x + Math.cos(a + k * 2.1) * 6, z: z + Math.sin(a + k * 2.1) * 6 }));
      e.patrol = { pts, i: 0, x, z, leash: 60 };
      e.alert = { x, z, t: 25 };
    }
  }

  removeDrop(it, gone = false) {
    const g = this.g;
    g.scene.remove(it.obj);
    it.flare.material.dispose();
    it.done = true;
    this.drops = this.drops.filter((q) => q !== it);
    g.world.extra.interactables = g.world.extra.interactables.filter((q) => q !== it);
    g.hud.markers = g.hud.markers.filter((m) => m.key !== it.id);
    g.containers.forget(it.id);
    if (gone) g.hud.message('Night took the supply drop', '#ff9a7a');
  }

  // ------------------------------------------------------------------ the day

  // every frame: the temple's altar, the noon drop
  // grafting learned: grafts start turning up in the loot
  get grafting() {
    return lootGate.grafting;
  }

  set grafting(on) {
    lootGate.grafting = !!on;
  }

  update() {
    const g = this.g;
    this.resolveTemple();
    this.dressRadio();
    const s = this.sites.temple;
    if (s?.idolIt) {
      // the seal only takes a relic once the idol is gone from the altar
      const id = s.idolIt.id;
      s.it.done = !g.world.looted.has(id) && !g.containers.has(id) && !this.seals.temple;
      // the idol taken (the coins may still be in there): it leaves the pedestal, and the
      // search becomes the altar's
      const rec = g.containers.get(id);
      if (rec && !s.idolGone && !rec.inv.count('golden_idol')) {
        s.idolGone = true;
        for (const o of s.idolIt.hide || []) o.visible = false;
        s.idolIt.label = 'Search the temple altar';
      }
    }
    if (g.waves.phase === 'day' && this.pendingDrops > 0 && g.sky.time >= 0.5 && g.sky.time < 0.6) {
      this.pendingDrops--;
      this.placeDrop();
    }
    this.readPages();
  }

  onNight() {
    for (const it of [...this.drops]) this.removeDrop(it, true);
    for (const id of Object.keys(this.seals)) this.dressSeal(id);
  }

  onDawn() {
    // the idol carried through a Blood Moon: now the Sun Seal will take it home
    const g = this.g;
    if (!this.moonHeld && g.waves.sign === 'blood' && g.inventory.count('golden_idol') + g.coffer.count('golden_idol') > 0) {
      this.moonHeld = true;
      setTimeout(() => g.hud.message('The idol has answered the Blood Moon. The Sun Seal in the temple will take it home now', '#ffd070'), 5000);
    }
    for (const id of Object.keys(this.seals)) {
      const was = !!this.sites[id].beam;
      this.dressSeal(id);
      if (was && !this.sealHolds(id)) this.g.hud.message(`${SEALS[id].name} has worn out: the ${this.dirOf(this.sites[id].rift)} rift will wake tonight`, '#d8b0ff');
    }
    if (this.g.waves.night >= 4) this.showSeals();
  }

  // ------------------------------------------------------------------ save

  state() {
    return {
      read: this.read, grafting: this.grafting, seals: this.seals, radio: this.radio, pending: this.pendingDrops,
      maps: this.maps, idol: this.idolSet, shown: !!this.sealsShown, dropN: this.dropN, moon: !!this.moonHeld,
    };
  }

  restore(d) {
    if (!d) return;
    this.read = (d.read || []).filter((id) => noteById(id));
    this.grafting = !!d.grafting;
    this.seals = d.seals || {};
    this.radio = d.radio || 0;
    this.pendingDrops = d.pending || 0;
    this.idolSet = !!d.idol;
    this.moonHeld = !!d.moon;
    this.dropN = d.dropN || 0;
    this.g.hud.notes = this.read.map(noteById);
    for (const m of d.maps || []) {
      this.maps.push(m);
      this.g.hud.markers.push({ key: m.key, x: m.x, z: m.z, icon: '✕', label: 'Marked cache', cls: 'map' });
    }
    if (d.shown) this.showSeals();
    for (const id of Object.keys(this.seals)) if (this.sites[id]) this.dressSeal(id);
  }
}
