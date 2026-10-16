// Everything the player builds: towers, barricades and traps, their placement ghost,
// targeting, upgrades and repairs, and projectiles (crossbow bolts, spore pods, chain
// lightning, gouts of flame, grasping vines).
import * as THREE from 'three';
import { cloneModel, part, parts } from '../assets/Models.js';
import { flatten, setFlash, setTint, setEmit, ownMaterials } from '../art/merge.js';
import { spikeTrapModel } from '../items/ItemModels.js';
import { terrainHeight, terrainNormal, WATER_LEVEL } from '../world/WorldGen.js';
import { glowTexture } from '../art/textures.js';
import { BUILD_RADIUS, GOAL_RADIUS } from './Base.js';

const TAU = Math.PI * 2;
const backOut = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const ease = (t) => 1 - (1 - t) ** 3;

export const BUILD_DEFS = {
  bow_tower: {
    model: 'bow_tower', hp: 320, r: 1.45, range: 22, rate: 1.0, dmg: 30, pathCost: 60, blocks: true,
    muzzle: 3.35, kind: 'bow', air: true,
  },
  spore_mortar: {
    model: 'spore_mortar', hp: 260, r: 1.25, range: 30, minRange: 6, rate: 2.8, dmg: 42, splash: 3.6, slow: 0.45, slowTime: 2.6,
    pathCost: 60, blocks: true, muzzle: 1.9, kind: 'mortar',
  },
  tesla_totem: {
    model: 'tesla_totem', hp: 220, r: 0.85, range: 15, rate: 1.5, dmg: 28, chain: 4, chainRange: 6.5, pathCost: 60, blocks: true,
    muzzle: 3.45, kind: 'tesla', air: true,
  },
  ember_brazier: {
    model: 'ember_brazier', hp: 240, r: 0.95, range: 9, rate: 0.7, dmg: 6, burn: 9, burnTime: 3, pathCost: 60, blocks: true,
    muzzle: 1.5, kind: 'fire', air: true, light: true,
  },
  barricade: { model: 'barricade', hp: 280, r: 0.62, pathCost: 30, blocks: true, thorns: 5, kind: 'wall', rotates: true },
  spike_trap: { model: null, hp: 14, r: 0.7, pathCost: 0, blocks: false, dmg: 22, rate: 0.55, kind: 'trap' },
  vine_snare: { model: 'vine_snare', hp: 6, r: 0.85, pathCost: 0, blocks: false, dmg: 6, rate: 1.4, root: 2.6, grabs: 3, kind: 'snare' },
  // lights the ground: Blight in it take more damage, Burrowers can't stay under in it
  glow_lantern: { model: 'glow_lantern', hp: 160, r: 0.6, range: 10, expose: 1.25, pathCost: 40, blocks: true, kind: 'lantern', light: true },
  // a cutting of the Heartwood: the Rot pulls back from it (world/Rot.js) and can't spread there
  heartseed: { model: 'heartseed', hp: 150, r: 0.7, ward: 9, pathCost: 30, blocks: true, kind: 'seed', light: false },
};

// Grafts: attachments found in containers and supply drops, fitted with G once the Thornback's
// heart is set in the Workbench. A tower has one slot at tier 2 and two at tier 3.
export const GRAFTS = {
  glowcap_lens: { glyph: '◉', color: 0x7ac8ff, say: '+20% range', fits: (d) => !!(d.range && d.dmg) },
  bog_heads: { glyph: '➶', color: 0xd07a40, say: 'ignores resistances', fits: (d) => !!d.dmg },
  resin_drip: { glyph: '♨', color: 0xffa030, say: 'sets the Blight burning', fits: (d) => !!d.dmg && d.kind !== 'fire' },
  coiled_spring: { glyph: '⟳', color: 0xe0c870, say: '+20% fire rate', fits: (d) => !!(d.dmg && d.rate) },
  root_anchor: { glyph: '⚓', color: 0x8ad060, say: '+30% HP, slowly mends', fits: () => true },
};
// Settings: a colour-blind safe palette for the placement ghost (and the Blight: Enemies.js)
export const PALETTE = { cb: false };
export const graftSlots = (tier) => (tier >= 3 ? 2 : tier >= 2 ? 1 : 0);
// a hit from a grafted building: Bog-iron Heads cut through hide, Resin Drip sets it alight
const graftOpts = (b, opts) => {
  if (b?.grafts?.includes('bog_heads')) opts.pierceArmour = true;
  return opts;
};
const graftHit = (b, e, enemies) => {
  if (b?.grafts?.includes('resin_drip') && !e.dying) enemies.ignite(e, 5, 2.5);
};
const graftMats = {};
function graftSprite(id) {
  graftMats[id] ??= new THREE.SpriteMaterial({ map: glowTexture(), color: GRAFTS[id].color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
  const s = new THREE.Sprite(graftMats[id]);
  s.scale.setScalar(0.5);
  s.name = 'Graft';
  return s;
}

// Upgrades: stat multipliers per tier, and what each step costs.
export const TIER_MUL = {
  1: { dmg: 1, range: 1, rate: 1, hp: 1 },
  2: { dmg: 1.5, range: 1.12, rate: 0.85, hp: 1.4 },
  3: { dmg: 2.2, range: 1.25, rate: 0.72, hp: 1.9 },
};
export const UPGRADES = {
  bow_tower: { 2: { log: 1, flint: 3, feather: 2, rusty_bolts: 2 }, 3: { log: 2, bone: 4, brass_gear: 1, glowcap: 1 } },
  spore_mortar: { 2: { clay: 2, mushroom: 4, resin: 2 }, 3: { stone: 4, glowcap: 2, strange_seeds: 3 } },
  tesla_totem: { 2: { copper_wire: 2, scrap_metal: 2, rusty_bolts: 2 }, 3: { vacuum_tube: 1, brass_gear: 2, battery: 1 } },
  ember_brazier: { 2: { resin: 3, clay: 2, flint: 2 }, 3: { resin: 4, glowcap: 2, bone: 3 } },
  // the top wall is thatched with grove reeds and banded with bog iron
  barricade: { 2: { log: 1, thorns: 4, vine: 2 }, 3: { log: 1, reed: 6, bog_iron: 2 } },
  glow_lantern: { 2: { glowcap: 2, resin: 2, stick: 2 }, 3: { glowcap: 3, strange_seeds: 3, battery: 1 } },
};
// What a full repair costs: towers want bark and resin, walls sticks and thorns.
export const REPAIRS = {
  wall: { stick: 2, thorns: 2 },
  tower: { bark: 2, resin: 1 },
};
export const TIER_NAMES = { 1: '', 2: 'Overgrown', 3: 'Heartbound' };
// What each building draws from the Heartwood's roots (Game.rootCap is how many it can feed)
export const ROOTS = { barricade: 1, spike_trap: 1, vine_snare: 1, glow_lantern: 2, heartseed: 2, bow_tower: 3, ember_brazier: 3, spore_mortar: 4, tesla_totem: 4 };

let trapTemplate = null;
function buildModel(id) {
  const def = BUILD_DEFS[id];
  if (def.model) return cloneModel(def.model, { own: true });
  if (!trapTemplate) trapTemplate = flatten(spikeTrapModel(), /^$/, { shadow: false });
  return ownMaterials(trapTemplate.clone(true));
}

// The look of an upgrade: living vines wind up the tower (second tier), and the third adds a
// bound collar of bone-pale wood near the top under a faint amber halo.
const decorMats = {
  vine: new THREE.MeshStandardMaterial({ color: 0x3e5e22, roughness: 0.8 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4f8a30, roughness: 0.7, side: THREE.DoubleSide }),
  band: new THREE.MeshStandardMaterial({ color: 0xb8a882, roughness: 0.6, metalness: 0.1 }),
};
function tierDecor(b, tier) {
  const g = new THREE.Group();
  g.name = 'TierDecor';
  const def = b.def;
  const wall = def.kind === 'wall';
  const h = wall ? 1.1 : Math.min(2.4, (def.muzzle || 2) * 0.55);
  const R = wall ? 0.35 : def.r * 0.72;
  const rings = tier >= 3 ? 2 : 1;
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1);
  for (let k = 0; k < rings; k++) {
    const y = h * (k ? 0.45 : 1);
    if (wall) {
      // a vine strung along the top rail, with leaves
      const pts = [];
      for (let i = 0; i <= 16; i++) pts.push(new THREE.Vector3((i / 16 - 0.5) * 2.4, y + Math.sin(i * 1.3 + k) * 0.06 - k * 0.25, Math.sin(i * 0.9) * 0.08));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.03, 5), decorMats.vine));
      for (let i = 1; i < 16; i += 3) {
        const l = new THREE.Mesh(leafGeo, decorMats.leaf);
        l.position.copy(pts[i]).add(new THREE.Vector3(0, 0.05, 0.05));
        l.rotation.set(-0.7, (i % 2 ? 0.4 : -0.4), 0);
        g.add(l);
      }
      continue;
    }
    // a helix of vine, 1.5 turns, from y - 0.35 to y
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = t * TAU * 1.5 + k;
      pts.push(new THREE.Vector3(Math.cos(a) * R, y - 0.35 + t * 0.35, Math.sin(a) * R));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.035, 5), decorMats.vine);
    tube.castShadow = true;
    g.add(tube);
    for (let i = 0; i < 5; i++) {
      const p = pts[2 + i * 5];
      const l = new THREE.Mesh(leafGeo, decorMats.leaf);
      l.position.copy(p).add(new THREE.Vector3(p.x * 0.1, 0.05, p.z * 0.1));
      l.rotation.set(-0.8, Math.atan2(p.x, p.z), 0);
      g.add(l);
    }
  }
  if (tier >= 3 && !wall) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.05, 6, 20), decorMats.band);
    band.rotation.x = Math.PI / 2;
    band.position.y = h * 1.12;
    band.castShadow = true;
    g.add(band);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25 }));
    halo.scale.setScalar(1.4);
    halo.position.y = (def.muzzle || 2) + 0.5;
    g.add(halo);
  }
  return g;
}

// ------------------------------------------------------------------ one building
class Building {
  constructor(id, x, z, rot, ground) {
    const def = BUILD_DEFS[id];
    this.id = id;
    this.def = def;
    this.x = x;
    this.z = z;
    this.rot = rot;
    this.y = ground;
    this.tier = 1;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.grafts = [];
    this.blocks = def.blocks;
    this.pathCost = def.pathCost;
    this.cooldown = 0.5;
    this.flash = 0;
    this.dead = false;
    this.buildT = 0;
    this.popT = 0;
    this.idleT = 0;
    this.barT = 0;
    this.obj = buildModel(id);
    this.obj.position.set(x, ground, z);
    this.obj.rotation.y = rot;
    this.turret = part(this.obj, 'Turret');
    this.aim = part(this.obj, 'Aim');
    this.bolt = part(this.obj, 'Bolt');
    this.orb = part(this.obj, 'Orb');
    this.rings = part(this.obj, 'Rings');
    this.bellows = part(this.obj, 'Bellows');
    this.flame = part(this.obj, 'Flame');
    this.coals = part(this.obj, 'Coals');
    this.grabs = parts(this.obj, 'Grab');
    for (const g of this.grabs) g.userData.rest = g.rotation.clone();
    this.recoil = 0;
    this.charge = 0;
    this.grabT = 0;
    if (this.aim) this.aimRest = this.aim.rotation.x;
    // barricades are three circles along their length; everything else one circle
    if (def.kind === 'wall') {
      const cx = Math.cos(rot), sz = -Math.sin(rot);
      this.footprint = [-1, 0, 1].map((k) => ({ x: x + cx * k * 1.05, z: z + sz * k * 1.05, r: def.r }));
      this.collider = { type: 'box', x, z, hx: 1.5, hz: 0.42, rot, top: Infinity, building: this };
    } else {
      this.footprint = [{ x, z, r: def.r }];
      this.collider = def.blocks ? { type: 'circle', x, z, r: def.r, top: Infinity, building: this } : null;
    }
    this.interactable = { kind: 'building', x, y: ground + 1, z, r: def.kind === 'wall' ? 1.8 : def.r + 0.6, label: '', building: this };
  }

  // a stat after the tier and the player's boons
  stat(key, mods = {}) {
    const base = this.def[key];
    if (base === undefined) return undefined;
    const m = TIER_MUL[this.tier];
    if (key === 'dmg') return base * m.dmg * (mods.towerDmg || 1);
    if (key === 'range') return base * m.range * (mods.towerRange || 1) * (this.grafts.includes('glowcap_lens') ? 1.2 : 1) * (mods.fogRange || 1);
    // (standing on the Rot, its roots choke: up to 15% slower)
    if (key === 'rate') return base * m.rate * (mods.towerRate || 1) * (this.grafts.includes('coiled_spring') ? 0.82 : 1) * (1 + 0.25 * (this.rotK || 0));
    if (key === 'splash') return base * (this.tier >= 3 ? 1.35 : 1) * (mods.mortarSplash || 1);
    if (key === 'chain') return base + (this.tier >= 3 ? 2 : this.tier >= 2 ? 1 : 0);
    if (key === 'thorns') return base * (this.tier === 3 ? 3 : this.tier === 2 ? 2 : 1);
    if (key === 'burn') return base * m.dmg;
    if (key === 'expose') return base + (this.tier - 1) * 0.1;
    return base;
  }

  get upgradable() {
    return !!UPGRADES[this.id] && this.tier < 3;
  }

  get upgradeCost() {
    return UPGRADES[this.id]?.[this.tier + 1] || null;
  }

  // a full repair; the higher the tier, the more it takes
  get repairCost() {
    const base = this.def.kind === 'wall' ? REPAIRS.wall : REPAIRS.tower;
    const k = 1 + 0.5 * (this.tier - 1);
    const out = {};
    for (const [id, n] of Object.entries(base)) out[id] = Math.round(n * k);
    return out;
  }

  // Left under 30% at dawn, a building is scarred: 10% less max HP until an orchid salve (or an
  // upgrade) mends it
  scar() {
    if (this.scarred) return false;
    this.scarred = true;
    this.maxHp = Math.round(this.maxHp * 0.9);
    this.hp = Math.min(this.hp, this.maxHp);
    return true;
  }

  heal() {
    this.scarred = false;
    this.maxHp = Math.round(this.def.hp * TIER_MUL[this.tier].hp * this.hpK);
    this.hp = this.maxHp;
  }

  get hpK() {
    return this.grafts.includes('root_anchor') ? 1.3 : 1;
  }

  // free graft slots, and whether this graft can go on it
  get graftRoom() {
    return graftSlots(this.tier) - this.grafts.length;
  }

  canGraft(id) {
    return this.graftRoom > 0 && !!GRAFTS[id]?.fits(this.def) && !this.grafts.includes(id);
  }

  addGraft(id) {
    this.grafts.push(id);
    if (id === 'root_anchor') {
      const was = this.maxHp;
      this.maxHp = Math.round(this.maxHp * 1.3);
      this.hp += this.maxHp - was;
    }
    this.dressGrafts();
  }

  // a bead of light per graft, round the top of the building
  dressGrafts() {
    for (const o of this.obj.children.filter((c) => c.name === 'Graft')) this.obj.remove(o);
    const h = (this.def.muzzle || 1.6) * 0.8;
    this.grafts.forEach((id, i) => {
      const s = graftSprite(id);
      const a = i * 2.4 + 0.6;
      s.position.set(Math.sin(a) * this.def.r * 0.8, h, Math.cos(a) * this.def.r * 0.8);
      this.obj.add(s);
    });
  }

  get repairable() {
    return this.def.kind !== 'trap' && this.def.kind !== 'snare' && this.hp < this.maxHp - 0.5;
  }

  upgrade() {
    this.tier++;
    this.scarred = false;
    const frac = this.hp / this.maxHp;
    this.maxHp = Math.round(this.def.hp * TIER_MUL[this.tier].hp * this.hpK);
    this.hp = Math.max(this.maxHp * frac, this.maxHp * 0.6);
    this.popT = 1;
    const old = this.obj.getObjectByName('TierDecor');
    if (old) this.obj.remove(old);
    this.obj.add(tierDecor(this, this.tier));
  }

  distTo(x, z) {
    let d = Infinity;
    for (const c of this.footprint) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
    return d;
  }

  pushOut(pos, r) {
    for (const c of this.footprint) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  // world position of the muzzle / orb / fire
  muzzle(out) {
    if (this.def.kind === 'tesla' && this.orb) return this.orb.getWorldPosition(out);
    if (this.def.kind === 'fire' && this.flame) return this.flame.getWorldPosition(out).add(new THREE.Vector3(0, 0.3, 0));
    if (this.aim) {
      this.aim.getWorldPosition(out);
      if (this.def.kind === 'mortar') out.y += 0.6;
      return out;
    }
    return out.set(this.x, this.y + (this.def.muzzle || 1), this.z);
  }
}

// ------------------------------------------------------------------ projectiles
const boltGeo = (() => {
  const g = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6);
  g.rotateX(Math.PI / 2);
  return g;
})();
const boltMat = new THREE.MeshStandardMaterial({ color: 0xd8b078, roughness: 0.6, emissive: 0x3a2a10 });
const trailGeo = (() => {
  const g = new THREE.CylinderGeometry(0.045, 0.0, 1.6, 8, 1, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -1.1);
  return g;
})();
const trailMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
const podGeo = new THREE.SphereGeometry(0.26, 12, 10);
const podMat = new THREE.MeshStandardMaterial({ color: 0x9ad040, emissive: 0x80c020, emissiveIntensity: 1.2, roughness: 0.4 });
// lightning: a ribbon with a white-hot core and blue edges
const arcMat = new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 1 } },
  vertexShader: 'attribute float aSide; varying float vSide; void main(){ vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uOpacity; varying float vSide;
    void main(){ float k = clamp(1.0 - abs(vSide), 0.0, 1.0); vec3 c = mix(vec3(0.35, 0.65, 1.0), vec3(1.0), pow(k, 3.0));
      gl_FragColor = vec4(c * pow(k, 1.5) * uOpacity * 1.6, 1.0); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class Buildings {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.dying = [];
    this.shots = [];
    this.arcs = [];
    this.changed = true;
    this.glowTex = glowTexture();
    this.stats = { built: 0, upgraded: 0, lost: 0 };
  }

  get blocking() {
    return this.list.filter((b) => !b.dead);
  }

  place(id, x, z, rot, { instant = false } = {}) {
    const b = new Building(id, x, z, rot, terrainHeight(x, z) - 0.02);
    if (instant) b.buildT = 1;
    this.scene.add(b.obj);
    this.list.push(b);
    if (b.collider) this.world.extra.colliders.push(b.collider);
    this.world.extra.interactables.push(b.interactable);
    this.changed = true;
    if (!instant) this.stats.built++;
    return b;
  }

  // Pack up (instant) or destroyed (collapses first).
  remove(b, collapse = false) {
    b.dead = true;
    this.list = this.list.filter((o) => o !== b);
    const ex = this.world.extra;
    ex.colliders = ex.colliders.filter((c) => c !== b.collider);
    ex.interactables = ex.interactables.filter((i) => i !== b.interactable);
    this.changed = true;
    if (collapse) {
      b.deathT = 0;
      b.fall = Math.random() * TAU;
      this.dying.push(b);
    } else this.scene.remove(b.obj);
  }

  damage(b, n) {
    if (b.dead) return false;
    b.hp -= n;
    b.flash = 1;
    b.barT = 4;
    if (b.hp <= 0) {
      this.stats.lost++;
      this.remove(b, true);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- placement
  // Can `id` go at (x, z)? Returns null if fine, or the reason it can't.
  check(id, x, z, rot, { base, player, roots }) {
    const def = BUILD_DEFS[id];
    if (roots && roots.used + (ROOTS[id] || 1) > roots.cap) return `The Heartwood can't feed more roots (${roots.used}/${roots.cap}): upgrade instead, or bury a relic in it`;
    const dBase = Math.hypot(x - base.x, z - base.z);
    if (dBase > BUILD_RADIUS) return 'Too far from the Heartwood';
    if (dBase < GOAL_RADIUS + 1.2 + def.r) return 'Too close to the Heartwood';
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.05) return 'Needs dry ground';
    if (terrainNormal(x, z).y < 0.82) return 'Too steep';
    const probe = def.kind === 'wall'
      ? [-1, 0, 1].map((k) => ({ x: x + Math.cos(rot) * k * 1.05, z: z - Math.sin(rot) * k * 1.05, r: def.r }))
      : [{ x, z, r: def.r }];
    for (const p of probe) {
      for (const b of this.list) {
        for (const c of b.footprint) if (Math.hypot(p.x - c.x, p.z - c.z) < p.r + c.r + 0.1) return 'Overlaps a building';
      }
      for (const c of this.world.near(p.x, p.z, 'colliders')) {
        if (c.dead || c.building || c.type !== 'circle') continue;
        if (c.top !== Infinity && c.top < h + 0.4) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < p.r + c.r) return 'Something is in the way';
      }
      if (def.blocks && Math.hypot(p.x - player.x, p.z - player.z) < p.r + 0.5) return 'You are standing there';
    }
    return null;
  }

  // ---------------------------------------------------------------- combat
  // ctx: { enemies, field, audio, particles, lights, mods, rain, camera }
  update(dt, t, ctx) {
    const { enemies, field, audio, particles, lights } = ctx;
    const mods = ctx.mods || {};
    for (const b of this.list) {
      b.flash = Math.max(0, b.flash - dt * 4);
      b.barT -= dt;
      setFlash(b.obj, b.flash * 0.7, b.flash * 0.18, b.flash * 0.08);
      // rising out of the ground when placed, a bounce when upgraded
      if (b.buildT < 1) {
        b.buildT = Math.min(1, b.buildT + dt / 0.6);
        const k = backOut(b.buildT);
        b.obj.scale.set(0.7 + 0.3 * b.buildT, Math.max(0.02, k), 0.7 + 0.3 * b.buildT);
        if (b.buildT >= 1) particles.dust(new THREE.Vector3(b.x, b.y + 0.1, b.z), 10, b.def.r * 0.8);
      } else {
        b.popT = Math.max(0, b.popT - dt * 1.6);
        const s = (1 + (b.tier - 1) * 0.05) * (1 + Math.sin(b.popT * Math.PI * 3) * b.popT * 0.12);
        b.obj.scale.setScalar(s);
      }
      if (mods.buildRegen && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * mods.buildRegen * dt);
      if (b.grafts.length && b.hp < b.maxHp && b.grafts.includes('root_anchor')) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.004 * dt);

      b.recoil = Math.max(0, b.recoil - dt * 3);
      if (b.bellows) b.bellows.scale.z = 1 - b.recoil * 0.4;
      if (b.bolt) b.bolt.visible = b.cooldown < b.stat('rate', mods) * 0.6;
      b.cooldown = Math.max(-1, b.cooldown - dt);
      if (b.buildT < 1) continue;
      const kind = b.def.kind;

      if (kind === 'fire') {
        this.updateFire(b, dt, t, ctx, mods);
        continue;
      }
      if (kind === 'trap' || kind === 'snare') {
        this.updateTrap(b, dt, t, ctx);
        continue;
      }
      if (kind === 'lantern') {
        this.updateLantern(b, dt, t, ctx, mods);
        continue;
      }
      if (!b.def.range) continue;
      if (b.orb) {
        // the orb gathers charge before each strike
        const rate = b.stat('rate', mods);
        b.charge = Math.min(1, Math.max(0, 1 - b.cooldown / rate));
        b.orb.scale.setScalar(1 + Math.sin(t * 7 + b.x) * 0.06 + b.charge ** 3 * 0.3);
        if (b.charge > 0.85 && Math.random() < dt * 20) particles.sparks(b.muzzle(_c).clone(), 0xa0e0ff, 1);
      }
      if (b.rings) b.rings.rotation.y += dt * (1.6 + b.charge * 6);

      // pick the enemy in range that is furthest along the path (closest to the Heart); a
      // crossbow picks out Spitters first, wherever they stand (they hang back and shell it)
      const range = b.stat('range', mods) * (ctx.rain ? 0.9 : 1);
      const spotter = kind === 'bow';
      let best = null, bd = Infinity;
      for (const e of enemies.list) {
        if (e.dying || e.rise > 0.5) continue;
        if (e.def.flying && !b.def.air) continue;
        const d = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
        if (d > range || d < (b.def.minRange || 0)) continue;
        const fd = (e.def.flying ? Math.hypot(e.pos.x - ctx.base.x, e.pos.z - ctx.base.z) : field.distAt(e.pos.x, e.pos.z)) + d * 0.1 - (spotter && e.def.spit ? 40 : 0);
        if (fd < bd) { bd = fd; best = e; }
      }
      if (!best) {
        // idle: the turret sweeps slowly, watching the treeline
        b.idleT += dt;
        if (b.turret && b.idleT > 1.5) b.turret.rotation.y += Math.sin(t * 0.4 + b.x) * dt * 0.35;
        if (b.aim && b.def.kind === 'bow') b.aim.rotation.x += (b.aimRest - b.aim.rotation.x) * Math.min(1, dt * 2);
        continue;
      }
      b.idleT = 0;

      // swing the turret round (it can only fire when roughly facing the target)
      const tgt = enemies.chest(best);
      const yawW = Math.atan2(tgt.x - b.x, tgt.z - b.z);
      let facing = true;
      if (b.turret) {
        const want = yawW - b.rot;
        const d = ((want - b.turret.rotation.y) % TAU + TAU * 1.5) % TAU - Math.PI;
        const step = dt * 5;
        b.turret.rotation.y += Math.max(-step, Math.min(step, d));
        facing = Math.abs(d) < 0.25;
      }
      if (kind === 'bow' && b.aim) {
        const m = b.muzzle(_a);
        const pitch = Math.atan2(tgt.y - m.y, Math.hypot(tgt.x - m.x, tgt.z - m.z));
        // the crossbow kicks up on each shot and settles back
        b.aim.rotation.x = -pitch - b.recoil * 0.22;
      }
      if (kind === 'mortar' && b.aim) b.aim.rotation.x = b.aimRest - b.recoil * 0.25;
      if (b.cooldown > 0 || !facing) continue;
      b.cooldown = b.stat('rate', mods);
      b.recoil = 1;
      this.fire(b, best, ctx, mods);
      // tier 3 crossbows loose a second bolt at another target
      if (kind === 'bow' && b.tier >= 3) {
        const second = enemies.list.find((e) => e !== best && !e.dying && e.rise <= 0.5 && Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < range);
        if (second) this.fire(b, second, ctx, mods);
      }
    }

    // collapsing buildings
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const b = this.dying[i];
      b.deathT += dt;
      const k = ease(Math.min(1, b.deathT / 0.9));
      b.obj.rotation.set(Math.cos(b.fall) * k * 1.1, b.rot, Math.sin(b.fall) * k * 1.1);
      b.obj.position.y = b.y - k * 0.6;
      setFlash(b.obj, 0.3 * (1 - k), 0.05, 0);
      if (b.deathT < 0.5 && Math.random() < dt * 30) particles.chipBurst(new THREE.Vector3(b.x, b.y + 1, b.z), 0x8a6a40, 2, b.y);
      if (b.deathT > 0.9 && !b.dusted) {
        b.dusted = true;
        particles.dust(new THREE.Vector3(b.x, b.y + 0.2, b.z), 18, 1.4);
      }
      if (b.deathT > 1.6) {
        b.obj.position.y -= (b.deathT - 1.6) * 2;
        if (b.deathT > 2.2) {
          this.scene.remove(b.obj);
          this.dying.splice(i, 1);
        }
      }
    }

    this.updateShots(dt, ctx);
    // lightning fades out
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      a.mesh.material.uniforms.uOpacity.value = Math.max(0, a.life / 0.25);
      if (a.life <= 0) {
        this.scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        a.mesh.material.dispose();
        this.arcs.splice(i, 1);
      }
    }
    void lights;
    void audio;
  }

  updateFire(b, dt, t, ctx, mods) {
    const { enemies, particles, audio, lights } = ctx;
    const rainK = ctx.rain ? 0.6 : 1;
    const flare = b.recoil;
    if (b.flame) {
      const f = 0.85 + Math.sin(t * 13 + b.x) * 0.08 + Math.sin(t * 23.7 + b.z) * 0.06;
      b.flame.scale.set(1 + flare * 0.25 + (f - 0.85) * 0.5, (f + flare * 0.5) * rainK + 0.2, 1 + flare * 0.25);
      b.flame.rotation.y += dt * 0.8;
    }
    if (b.coals) b.coals.scale.setScalar(1 + Math.sin(t * 3 + b.z) * 0.02);
    const top = b.muzzle(_a).clone();
    if (Math.random() < dt * (10 + b.tier * 6)) particles.embers(top, 1, 0.3);
    lights?.request(top, 0xff8a3a, (24 + flare * 30 + Math.sin(t * 17) * 4) * rainK * (1 + (b.tier - 1) * 0.2), 18 + b.tier * 2, 2);
    if (b.cooldown > 0) return;
    const range = b.stat('range', mods);
    const near = enemies.list.filter((e) => !e.dying && e.rise <= 0.5 && Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < range + e.def.radius);
    if (!near.length) return;
    b.cooldown = b.stat('rate', mods);
    b.recoil = 1;
    near.sort((p, q) => Math.hypot(p.pos.x - b.x, p.pos.z - b.z) - Math.hypot(q.pos.x - b.x, q.pos.z - b.z));
    for (const e of near.slice(0, 4 + b.tier)) {
      enemies.ignite(e, b.stat('burn', mods) * rainK, b.def.burnTime * (b.tier >= 3 ? 1.5 : 1));
      enemies.damage(e, b.stat('dmg', mods) * rainK, ctx, null, graftOpts(b, { source: 'tower', type: 'fire' }));
      // a gout of flame licks out to the target
      const to = enemies.chest(e).clone();
      for (let k = 0; k < 6; k++) {
        const p = top.clone().lerp(to, k / 6);
        p.y += Math.sin((k / 6) * Math.PI) * 0.8;
        particles.embers(p, 1, 0.15, k < 3 ? 0xffc060 : 0xff7020);
      }
    }
    audio.flame?.();
  }

  // A cold blue light on the ground: every Blight in it glows and takes more damage, and a
  // Burrower tunnelling through it is dragged up and dazed.
  updateLantern(b, dt, t, ctx, mods) {
    const { enemies, particles, lights } = ctx;
    const range = b.stat('range', mods) * (mods.lanternRange || 1);
    const expose = b.stat('expose') + (mods.lanternExpose || 0);
    if (b.orb) {
      b.orb.rotation.z = Math.sin(t * 0.9 + b.x) * 0.06;
      b.orb.rotation.x = Math.sin(t * 0.7 + b.z) * 0.05;
      const s = 1 + Math.sin(t * 2.2 + b.x) * 0.04 + b.recoil * 0.15;
      b.orb.scale.setScalar(s);
    }
    const top = b.orb ? b.orb.getWorldPosition(_a).add(new THREE.Vector3(0, -0.45, 0)) : _a.set(b.x, b.y + 2, b.z);
    lights?.request(top.clone(), 0x6ab8ff, 16 + b.tier * 4 + b.recoil * 16, range * 1.4, 1);
    if (Math.random() < dt * 3) particles.sparkle(top.clone(), 0x9ad8ff, 1);
    for (const e of enemies.list) {
      if (e.dying || e.def.flying) continue;
      const d = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
      if (d > range + e.def.radius) continue;
      // under two lanterns, the brighter one counts
      e.lit = e.litT > 0.2 ? Math.max(e.lit, expose) : expose;
      e.litT = 0.3;
      if (e.dig && e.dig.phase === 'tunnel' && !e.dig.forced) {
        e.dig.forced = true;
        b.recoil = 1;
      }
    }
  }

  updateTrap(b, dt, t, ctx) {
    const { enemies, particles, audio } = ctx;
    const def = b.def;
    // snare tendrils whip up, hold, and sink back
    if (b.grabs.length) {
      b.grabT = Math.max(0, b.grabT - dt / 1.8);
      const lift = b.grabT > 0.7 ? ease((1 - b.grabT) / 0.3) : b.grabT / 0.7;
      b.grabs.forEach((g, i) => {
        g.rotation.x = g.userData.rest.x - lift * 1.35 + Math.sin(t * 9 + i) * 0.05 * lift;
      });
    } else {
      b.obj.position.y = b.y + b.recoil * 0.12;
    }
    if (b.cooldown > 0) return;
    const hits = enemies.inRadius(b.x, b.z, def.r, { ground: true }).filter((e) => e.rise <= 0.3 && !(def.kind === 'snare' && e.rootT > 0));
    if (!hits.length) return;
    b.cooldown = def.rate;
    b.recoil = 1;
    if (def.kind === 'snare') {
      b.grabT = 1;
      for (const e of hits.slice(0, def.grabs)) {
        enemies.root(e, def.root);
        enemies.damage(e, def.dmg, ctx, null, { source: 'trap', type: 'pierce' });
      }
      particles.leafBurst(new THREE.Vector3(b.x, b.y + 0.4, b.z), 0x4c6a26, 14, b.y);
      audio.snare?.();
    } else {
      for (const e of hits) enemies.damage(e, def.dmg, ctx, null, { source: 'trap', type: 'pierce', stagger: 0.3 });
      particles.chipBurst(new THREE.Vector3(b.x, b.y + 0.3, b.z), 0x6a3a7a, 8, b.y);
      audio.stab?.();
    }
    b.hp -= 1;
    b.barT = 3;
    if (b.hp <= 0) this.remove(b, true);
  }

  // A homing bolt. With Splitting Shafts the first one splits on impact and a second,
  // weaker bolt seeks the nearest other Blight.
  bolt(from, target, dmg, ctx, mods, canSplit, src = null) {
    const { enemies, particles } = ctx;
    const mesh = new THREE.Mesh(boltGeo, boltMat);
    mesh.add(new THREE.Mesh(trailGeo, trailMat));
    mesh.position.copy(from);
    this.scene.add(mesh);
    const to = enemies.chest(target).clone();
    this.shots.push({
      kind: 'bolt', mesh, from, to, target, t: 0, dur: Math.max(0.08, from.distanceTo(to) / 42),
      hit: () => {
        if (!target.dying) {
          const knock = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize().multiplyScalar(3);
          enemies.damage(target, dmg, ctx, knock, graftOpts(src, { source: 'tower', type: 'pierce', stagger: 0.15 }));
          graftHit(src, target, enemies);
          particles.chipBurst(to, 0x6a3a7a, 8, target.pos.y);
        }
        if (canSplit && mods.boltSplit) {
          let next = null, nd = 7;
          for (const e of enemies.list) {
            if (e.dying || e.dig || e === target) continue;
            const d = Math.hypot(e.pos.x - to.x, e.pos.z - to.z);
            if (d < nd) { nd = d; next = e; }
          }
          if (next) {
            particles.sparks(to, 0xffe0a0, 4);
            this.bolt(to.clone(), next, dmg * mods.boltSplit, ctx, mods, false, src);
          }
        }
      },
    });
  }

  updateShots(dt, ctx) {
    const { enemies, particles } = ctx;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      if (s.kind === 'bolt') {
        // homing: chase the target's chest while it lives
        if (s.target && !s.target.dying) s.to.copy(enemies.chest(s.target));
        s.mesh.position.lerpVectors(s.from, s.to, k);
        s.mesh.lookAt(s.to);
      } else {
        s.mesh.position.lerpVectors(s.from, s.to, k);
        s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
        s.mesh.rotation.x += dt * 6;
        if (Math.random() < dt * 40) particles.sparkle(s.mesh.position, 0x9ad040, 1);
      }
      if (k >= 1) {
        s.hit();
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
  }

  fire(b, target, ctx, mods) {
    const { enemies, audio, particles, lights } = ctx;
    const from = b.muzzle(new THREE.Vector3());
    const dmg = b.stat('dmg', mods);
    if (b.def.kind === 'bow') {
      this.bolt(from, target, dmg, ctx, mods, true, b);
      particles.sparks(from, 0xffe0a0, 3);
      audio.bowShot?.();
    } else if (b.def.kind === 'mortar') {
      const mesh = new THREE.Mesh(podGeo, podMat);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xb0ff60, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      halo.scale.setScalar(1.3);
      mesh.add(halo);
      mesh.position.copy(from);
      this.scene.add(mesh);
      // lead the target a little
      const lead = 1.1;
      const to = new THREE.Vector3(target.pos.x + target.vel.x * lead, 0, target.pos.z + target.vel.z * lead);
      to.y = terrainHeight(to.x, to.z) + 0.2;
      const dist = from.distanceTo(to);
      const splash = b.stat('splash', mods);
      this.shots.push({
        kind: 'pod', mesh, from, to, t: 0, dur: 1.1, arc: 4 + dist * 0.25,
        hit: () => {
          for (const e of enemies.inRadius(to.x, to.z, splash, { ground: true })) {
            const d = Math.hypot(e.pos.x - to.x, e.pos.z - to.z);
            const knock = new THREE.Vector3(e.pos.x - to.x, 0, e.pos.z - to.z).normalize().multiplyScalar(4);
            enemies.damage(e, dmg * (1 - 0.5 * d / splash), ctx, knock, graftOpts(b, { source: 'tower', type: 'blunt', stagger: 0.2 }));
            graftHit(b, e, enemies);
            enemies.slowDown(e, b.def.slow * (mods.sporeSlow || 1), b.def.slowTime);
          }
          particles.sporeBurst(to, 0xa0e040, 60, 1.6);
          particles.ring(to, splash, 0x9ae040, 0.55);
          lights?.flash(to.clone().add(new THREE.Vector3(0, 1, 0)), 0xa0ff50, 40, 0.25);
          audio.sporePop?.();
        },
      });
      particles.sporeBurst(from, 0xa0e040, 10, 0.8);
      audio.mortar?.();
    } else if (b.def.kind === 'tesla') {
      const chain = [target];
      let cur = target;
      const n = b.stat('chain', mods);
      for (let k = 1; k < n; k++) {
        let next = null, nd = Infinity;
        for (const e of enemies.list) {
          if (e.dying || e.dig || chain.includes(e)) continue;
          const d = Math.hypot(e.pos.x - cur.pos.x, e.pos.z - cur.pos.z);
          if (d < b.def.chainRange && d < nd) { nd = d; next = e; }
        }
        if (!next) break;
        chain.push(next);
        cur = next;
      }
      let prev = from.clone();
      chain.forEach((e, k) => {
        const p = enemies.chest(e).clone();
        this.arc(prev, p);
        enemies.damage(e, dmg * Math.pow(0.8, k), ctx, null, graftOpts(b, { source: 'tower', type: 'arc', stagger: 0.25 }));
        graftHit(b, e, enemies);
        particles.sparks(p, 0xa0e0ff, 10);
        prev = p;
      });
      lights?.flash(from, 0x9fd8ff, 60, 0.14);
      lights?.flash(enemies.chest(target).clone(), 0x9fd8ff, 30, 0.12);
      audio.zap?.();
    }
  }

  // a jagged bolt of lightning between two points, drawn as two crossed ribbons
  arc(a, b) {
    const segs = 10;
    _b.subVectors(b, a);
    const len = _b.length();
    const dir = _b.clone().normalize();
    const side1 = new THREE.Vector3().crossVectors(dir, _up);
    if (side1.lengthSq() < 1e-4) side1.set(1, 0, 0);
    side1.normalize();
    const side2 = new THREE.Vector3().crossVectors(dir, side1).normalize();
    const pts = [a.clone()];
    for (let i = 1; i < segs; i++) {
      const p = a.clone().addScaledVector(_b, i / segs);
      const j = len * 0.09 * Math.sin((i / segs) * Math.PI);
      p.addScaledVector(side1, (Math.random() - 0.5) * 2 * j).addScaledVector(side2, (Math.random() - 0.5) * 2 * j);
      pts.push(p);
    }
    pts.push(b.clone());
    const pos = [], sideAttr = [], idx = [];
    const w = 0.09;
    for (const side of [side1, side2]) {
      const base = pos.length / 3;
      pts.forEach((p) => {
        pos.push(p.x + side.x * w, p.y + side.y * w, p.z + side.z * w, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
        sideAttr.push(1, -1);
      });
      for (let i = 0; i < pts.length - 1; i++) {
        const o = base + i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(sideAttr, 1));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, arcMat.clone());
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.arcs.push({ mesh, life: 0.25 });
  }
}

// ------------------------------------------------------------------ placement ghost
const ringMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide });
const RING_SEG = 96;
// A thin ring of fixed width that lies on the ground: world-space vertices, re-fitted to the
// terrain whenever it moves (a scaled RingGeometry got wider with range and cut into slopes).
function groundRing() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RING_SEG + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < RING_SEG; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setIndex(idx);
  geo.userData.key = '';
  return geo;
}
function fitRing(geo, x, z, r, w = 0.14) {
  const key = `${x.toFixed(2)},${z.toFixed(2)},${r.toFixed(2)}`;
  if (geo.userData.key === key) return;
  geo.userData.key = key;
  const p = geo.attributes.position;
  for (let i = 0; i <= RING_SEG; i++) {
    const a = (i / RING_SEG) * TAU, c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < 2; j++) {
      const rr = r - w * j;
      const px = x + c * rr, pz = z + s * rr;
      p.setXYZ(i * 2 + j, px, terrainHeight(px, pz) + 0.08, pz);
    }
  }
  p.needsUpdate = true;
  geo.computeBoundingSphere();
}

export class BuildGhost {
  constructor(scene) {
    this.scene = scene;
    this.id = null;
    this.obj = null;
    this.rot = 0;
    this.valid = false;
    this.reason = '';
    this.pos = new THREE.Vector3();
    this.ring = new THREE.Mesh(groundRing(), ringMat(0xffffff, 0.55));
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    scene.add(this.ring);
    const footGeo = new THREE.RingGeometry(0.8, 1, 48);
    footGeo.rotateX(-Math.PI / 2);
    this.foot = new THREE.Mesh(footGeo, ringMat(0xffffff, 0.7));
    this.foot.visible = false;
    scene.add(this.foot);
    this.others = []; // range rings of towers already standing
  }

  show(id) {
    if (this.id === id) return;
    this.hide();
    this.id = id;
    this.obj = buildModel(id);
    // a translucent hologram of the building, so you can see where it goes. A depth-only copy
    // drawn first keeps the inside faces from stacking up into a bright jelly, and the baked
    // glow is switched off so nothing on it blooms.
    setEmit(this.obj, 0);
    const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    const depth = this.obj.clone(true);
    depth.traverse((o) => { if (o.isMesh) { o.material = depthMat; o.renderOrder = 3; o.castShadow = false; } });
    this.obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material.transparent = true;
      o.material.opacity = 0.42;
      o.material.depthWrite = false;
      o.renderOrder = 4;
    });
    this.obj.add(depth);
    this.scene.add(this.obj);
  }

  hide() {
    if (this.obj) this.scene.remove(this.obj);
    this.obj = null;
    this.id = null;
    this.ring.visible = false;
    this.foot.visible = false;
    for (const r of this.others) r.visible = false;
  }

  // March the view ray to the ground (2.5 to 10 m) and test the spot.
  update(camera, buildings, ctx) {
    if (!this.obj) return;
    const dir = camera.getWorldDirection(_a);
    const o = camera.position;
    let hit = null;
    for (let d = 2.5; d <= 10; d += 0.2) {
      const x = o.x + dir.x * d, y = o.y + dir.y * d, z = o.z + dir.z * d;
      if (y <= terrainHeight(x, z)) { hit = { x, z }; break; }
    }
    if (!hit) {
      const fl = Math.hypot(dir.x, dir.z) || 1;
      hit = { x: o.x + (dir.x / fl) * 6, z: o.z + (dir.z / fl) * 6 };
    }
    const def = BUILD_DEFS[this.id];
    if (!def.rotates) this.rot = Math.atan2(o.x - hit.x, o.z - hit.z); // towers face the player
    this.pos.set(hit.x, terrainHeight(hit.x, hit.z), hit.z);
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.rot;
    this.reason = buildings.check(this.id, hit.x, hit.z, this.rot, ctx);
    this.valid = !this.reason;
    // (colour-blind safe: blue for yes, orange for no)
    const col = this.valid ? (PALETTE.cb ? 0x50a8ff : 0x7affa0) : (PALETTE.cb ? 0xff9a20 : 0xff5040);
    setTint(this.obj, col, 0.5);
    this.foot.visible = true;
    this.foot.position.set(hit.x, this.pos.y + 0.08, hit.z);
    this.foot.scale.setScalar(def.kind === 'wall' ? 1.6 : def.r + 0.1);
    this.foot.material.color.set(col);
    const range = def.range ? def.range * (ctx.mods?.towerRange || 1) : 0;
    if (range) {
      this.ring.visible = true;
      fitRing(this.ring.geometry, hit.x, hit.z, range);
      this.ring.material.color.set(this.valid ? (PALETTE.cb ? 0x70b8ff : 0x9affb0) : (PALETTE.cb ? 0xffa040 : 0xff6060));
    } else this.ring.visible = false;
    // show the reach of every tower already standing, faintly
    let n = 0;
    for (const b of buildings.list) {
      if (!b.def.range) continue;
      if (!this.others[n]) {
        const m = new THREE.Mesh(groundRing(), ringMat(0xf0d070, 0.15));
        m.frustumCulled = false;
        this.scene.add(m);
        this.others[n] = m;
      }
      const m = this.others[n++];
      m.visible = true;
      fitRing(m.geometry, b.x, b.z, b.stat('range', ctx.mods), 0.1);
    }
    for (; n < this.others.length; n++) this.others[n].visible = false;
  }
}
