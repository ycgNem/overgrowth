// Game orchestration: owns every system and runs the frame loop.
//
// The loop: by day you roam, cut and forage; in the satchel you craft what you found into
// defences; you place them around the Heartwood. At dusk the Waves director opens the
// rifts and the Blight follows the flow field to the Heart. Towers, traps, your machete and
// slingshot hold them off until dawn. Relics offered at the Heartwood earn boons; every fifth
// night the Thornback comes; hold ten nights and the Heartwood blooms.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { globalUniforms } from '../art/shaders.js';
import { Flora } from '../world/flora/Flora.js';
import { World } from '../world/World.js';
import { Sky } from '../world/Sky.js';
import { Water } from '../world/Water.js';
import { findSpawn, terrainHeight, WATER_LEVEL, CHUNK_SIZE } from '../world/WorldGen.js';
import { POI_INFO, poisAround } from '../world/poi/POI.js';
import { Player } from '../player/Player.js';
import { Machete } from '../player/Machete.js';
import { Input } from './Input.js';
import { Particles } from '../fx/Particles.js';
import { Ambient } from '../fx/Ambient.js';
import { LightPool } from '../fx/LightPool.js';
import { Weather } from '../fx/Weather.js';
import { Pickups } from '../items/Pickups.js';
import { Inventory, HOTBAR } from '../items/Inventory.js';
import { ITEMS, ITEM_IDS, RARITY, rollLoot } from '../items/ItemDB.js';
import { renderItemIcons } from '../items/ItemModels.js';
import { AudioSys } from '../audio/AudioSys.js';
import { HUD } from '../ui/HUD.js';
import { smoothstep, damp, clamp } from '../utils/math.js';
import { loadModels, MODEL_NAMES } from '../assets/Models.js';
import { Base, Rift, pickRifts, findBaseSite, BASE_CLEAR, BASE_SOFT, BUILD_RADIUS, GOAL_RADIUS } from '../defense/Base.js';
import { FlowField } from '../defense/FlowField.js';
import { Enemies } from '../defense/Enemies.js';
import { Buildings, BuildGhost, BUILD_DEFS, TIER_NAMES } from '../defense/Towers.js';
import { Waves, DUSK, DAWN } from '../defense/Waves.js';
import { Projectiles } from '../combat/Projectiles.js';
import { PERKS, baseMods, offerPerks, thresholds } from './Perks.js';
import { Journal } from './Journal.js';
import { writeSave, clearSave, recordBest } from './Save.js';

// Yield so the loading bar can paint; falls back to a timeout because
// requestAnimationFrame is paused in background tabs.
const nextFrame = () => new Promise((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
const REACH = 2.7;
const MACHETE_DMG = 28;
const RESPAWN = 5;
const FOV = 72;
const STARTER = [['bow_tower', 1], ['spike_trap', 2], ['poultice', 2]];
const ease = (t) => 1 - (1 - t) ** 3;

export class Game {
  constructor(canvas, { debug = false, time = null } = {}) {
    this.debug = debug;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.inventory = new Inventory();
    this.hud = new HUD(this.inventory);
    this.journal = new Journal(this.hud);
    this.running = false;
    this.paused = true;
    this.modal = null; // 'perks' | 'victory' | 'over' while an overlay owns the mouse
    this.startTime = time;
    this.cover = 0;
    this.search = null;
    this.searchT = 0;
    this.searchKey = null;
    this.doneSet = new Set();
    this.envTick = 0;
    this.nearWater = 0;
    this.deadT = 0;
    this.lastHit = 99;
    this.hitStop = 0;
    this.chain = 0;
    this.lastStrike = -9;
    this.draw = 0;
    this.aimK = 0;
    this.drawing = false;
    this.noAmmoT = 0;
    this.alertT = 0;
    this.alertHold = 0;
    this.saveT = 30;
    this.overT = -1;
    this.mods = baseMods();
    this.perks = [];
    this.favour = 0;
    this.boonsTaken = 0;
    this.pendingBoons = 0;
    this.stats = { built: 0, upgraded: 0, bosses: 0 };
    this.bloom = true;
    this.rand = Math.random;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass.resolution.set(w / 2, h / 2);
    }
  }

  async init(progress) {
    progress(0.03, 'Carving the Heartwood…');
    let loaded = 0;
    await loadModels(() => progress(0.03 + (++loaded / MODEL_NAMES.length) * 0.12, 'Carving the Heartwood…'));
    progress(0.15, 'Painting leaves…');
    await nextFrame();
    this.flora = new Flora();
    progress(0.35, 'Raising the terrain…');
    await nextFrame();
    this.sky = new Sky(this.scene, this.renderer);
    this.sky.time = this.startTime ?? 0.29;
    this.water = new Water(this.scene);
    this.world = new World(this.scene, this.flora);

    // the base sits on flat, open ground near the old spawn; the jungle is kept back from it
    const sp = findBaseSite(findSpawn());
    this.world.addClearing(sp.x, sp.z, BASE_CLEAR, BASE_SOFT);
    this.base = new Base(this.scene, this.world, sp.x, sp.z);
    this.player = new Player(this.camera, this.world);
    this.respawn();
    progress(0.5, 'Growing the jungle…');
    await nextFrame();
    this.world.update(this.player.pos.x, this.player.pos.z, 0, true);

    progress(0.62, 'Mapping the Blight’s paths…');
    await nextFrame();
    this.field = new FlowField(this.world, this.base.x, this.base.z, GOAL_RADIUS);
    this.field.rebuild([]);
    this.rifts = pickRifts(this.field, this.base.x, this.base.z, 3, Math.round(sp.x + sp.z)).map((r) => new Rift(this.scene, r.x, r.z));
    this.enemies = new Enemies(this.scene);
    this.buildings = new Buildings(this.scene, this.world);
    this.ghost = new BuildGhost(this.scene);
    this.lights = new LightPool(this.scene, 6);
    this.weather = new Weather(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.hud.markers = [
      { key: 'heartwood', x: this.base.x, z: this.base.z, icon: '❦', label: 'Heartwood', cls: 'base' },
      ...this.rifts.map((r, i) => ({ key: `rift${i}`, x: r.x, z: r.z, icon: '✶', label: 'Rift', cls: 'rift' })),
    ];
    this.heartMarker = this.hud.markers[0];
    this.waves = new Waves({ sky: this.sky, enemies: this.enemies, rifts: this.rifts, hud: this.hud, audio: this.audio, world: this.world, base: this.base });
    this.waves.onDay = () => {
      this.weather.target = 0;
      this.autosave();
    };
    this.waves.onNight = () => this.journal.event('night');
    this.waves.onDawn = (_held, won) => {
      this.weather.target = 0;
      if (won) this.onVictory();
    };
    this.waves.onOver = () => this.onDefeat();

    progress(0.75, 'Scattering secrets…');
    await nextFrame();
    this.machete = new Machete(this.camera.fov);
    this.machete.onHit = (combo) => this.onSwingHit(combo);
    this.machete.onUse = () => this.finishUse();
    this.particles = new Particles(this.scene, this.flora.textures.leaf);
    this.ambient = new Ambient(this.scene, this.world, this.sky);
    this.pickups = new Pickups(this.scene, this.world);
    this.pickups.canTake = (id) => this.inventory.fits(id, 1);
    this.hud.setIcons(renderItemIcons(this.renderer, ITEM_IDS));
    for (const [id, n] of STARTER) this.inventory.add(id, n);
    // start with the machete out, not a tower
    this.inventory.select(this.inventory.slots.findIndex((s, i) => !s && i < HOTBAR));
    this.inventory.onChange = () => this.hud.stats();
    this.inventory.onOverflow = (id, n) => {
      for (let i = 0; i < n; i++) this.pickups.spawn(id, this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.5);
    };
    this.hud.onCraft = (r) => this.craft(r);
    this.hud.onUse = (i) => this.useFromSatchel(i);
    this.hud.onDrop = (i) => this.dropSlot(i);
    this.hud.stats();
    this.player.update(0.016, this.input, null);
    this.sky.update(0, this.player.pos, true);

    // bloom: emissive things (the Heart, rifts, fire, lightning) glow without clipping to white
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.45, 1.15);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.resize();

    progress(0.9, 'Warming up shaders…');
    await nextFrame();
    // compile enemy, projectile and effect materials up front so the first night doesn't hitch
    const warm = ['blightling', 'rotboar', 'wisp', 'thornback'].map((t, i) => this.enemies.spawn(t, this.base.x + 8 + i * 3, this.base.z));
    const wb = this.buildings.place('ember_brazier', this.base.x - 9, this.base.z + 9, 0, { instant: true });
    for (const r of this.rifts) r.group.visible = true;
    this.weather.rain.visible = true;
    this.particles.ring(new THREE.Vector3(this.base.x, this.base.y, this.base.z), 1);
    this.buildings.arc(new THREE.Vector3(this.base.x, this.base.y + 3, this.base.z), new THREE.Vector3(this.base.x + 2, this.base.y + 2, this.base.z));
    this.projectiles.stone(new THREE.Vector3(this.base.x, this.base.y + 40, this.base.z), new THREE.Vector3(), 0);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    for (const e of warm) this.scene.remove(e.obj);
    this.enemies.list = [];
    this.buildings.remove(wb);
    this.buildings.stats.built = 0;
    for (const r of this.rifts) r.group.visible = false;
    this.weather.rain.visible = false;
    this.hud.updateMinimap(this.player.pos, 0, true);
    progress(1, 'Ready');
    this.running = true;
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  // A fresh run starts with the day-one banner; a loaded one with its own.
  begin() {
    if (this.begun) return;
    this.begun = true;
    const w = this.waves;
    if (this.loaded) this.hud.banner(`Day ${w.night}`, 'The Heartwood remembers you.');
    else this.hud.banner('Day 1', 'Gather from the forest, craft defences, guard the Heartwood.');
  }

  // Put the player beside the Heartwood, facing it.
  respawn() {
    const a = 2.2;
    const x = this.base.x + Math.sin(a) * 10, z = this.base.z + Math.cos(a) * 10;
    this.player.spawn(x, z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = Math.atan2(-(this.base.x - x), -(this.base.z - z));
    this.player.pitch = 0.05;
    this.player.hp = this.player.maxHp;
  }

  // Debug helper: game.teleport('temple') jumps next to the nearest POI.
  teleport(type, dist = 16, angle = 0) {
    const p = this.player.pos;
    const cx = Math.floor(p.x / CHUNK_SIZE), cz = Math.floor(p.z / CHUNK_SIZE);
    let best = null, bd = Infinity;
    for (const s of poisAround(cx, cz, 12)) {
      if (s.type !== type) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    const a = best.rot + angle;
    const x = best.x + Math.sin(a) * dist, z = best.z + Math.cos(a) * dist;
    this.world.update(x, z, 0, true);
    this.player.spawn(x, z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = Math.atan2(-(best.x - x), -(best.z - z));
    this.player.pitch = 0;
    return best;
  }

  // Debug helpers
  give(id, n = 1) {
    this.inventory.add(id, n);
  }

  skipToNight() {
    this.sky.time = DUSK - 0.002;
  }

  // ------------------------------------------------------------- save / load

  autosave() {
    if (this.debug || this.waves.phase === 'over' || this.waves.phase === 'night') return;
    writeSave(this);
  }

  // Apply a save made by writeSave. Called once, before the player enters.
  loadFrom(d) {
    const inv = this.inventory;
    inv.slots = d.slots.map((s) => (s && ITEMS[s[0]] ? { id: s[0], n: s[1] } : null));
    while (inv.slots.length < HOTBAR + 24) inv.slots.push(null);
    inv.selected = d.selected || 0;
    for (const id of d.found || []) if (ITEMS[id]) inv.found.add(id);
    for (const [id, x, z, rot, tier, hp] of d.buildings || []) {
      if (!BUILD_DEFS[id]) continue;
      const b = this.buildings.place(id, x, z, rot, { instant: true });
      while (b.tier < tier) b.upgrade();
      b.popT = 0;
      b.hp = Math.min(b.maxHp, hp);
    }
    this.buildings.stats.built = d.stats?.built || 0;
    this.buildings.stats.upgraded = d.stats?.upgraded || 0;
    this.base.maxHp = d.base.maxHp;
    this.base.hp = d.base.hp;
    this.player.maxHp = d.player?.maxHp || 100;
    this.player.hp = this.player.maxHp;
    this.waves.setNight(d.night);
    this.waves.won = !!d.won;
    this.sky.time = DAWN + 0.004;
    this.perks = d.perks || [];
    const dummy = { base: { maxHp: 0, hp: 0 }, player: { maxHp: 0, hp: 0 } };
    for (const id of this.perks) PERKS.find((p) => p.id === id)?.apply(this.mods, dummy);
    this.applyMods();
    this.hud.boons(this.perks.map((id) => PERKS.find((p) => p.id === id)).filter(Boolean));
    this.favour = d.favour || 0;
    this.boonsTaken = d.boonsTaken || this.perks.length;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    this.enemies.kills = d.kills || 0;
    for (const k of d.discovered || []) this.hud.discovered.add(k);
    for (const k of d.done || []) this.doneSet.add(k);
    this.journal.restore(d.journal);
    this.loaded = true;
    inv.changed();
  }

  // ------------------------------------------------------------- actions

  forwardXZ() {
    return new THREE.Vector2(-Math.sin(this.player.yaw), -Math.cos(this.player.yaw));
  }

  get playerAlive() {
    return this.deadT <= 0;
  }

  loot(table, at, impulse = 0.8, auto = false) {
    const ids = rollLoot(table, this.rand);
    if (this.mods.lootBonus && this.rand() < this.mods.lootBonus) ids.push(...rollLoot(table, this.rand).slice(0, 1));
    for (const id of ids) this.pickups.spawn(id, at.clone(), impulse, auto);
  }

  onSwingHit(combo) {
    const p = this.player.pos;
    const fwd = this.forwardXZ();
    const lookDown = this.player.pitch;
    let cut = 0;

    // Blight first: the machete bites up to three in the arc. Three clicked hits in a row make a
    // finisher: a heavy, staggering crit.
    const now = this.timer.getElapsed();
    this.chain = this.swingTapped && now - this.lastStrike < 1.1 ? this.chain + 1 : 1;
    let struck = 0;
    const foes = this.enemies.list
      .filter((e) => !e.dying)
      .map((e) => [Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.def.radius * e.def.scale, e])
      .filter(([d, e]) => {
        if (d > REACH || e.pos.y - p.y > 2.6 || p.y - e.pos.y > 2) return false;
        const dx = e.pos.x - p.x, dz = e.pos.z - p.z, l = Math.hypot(dx, dz) || 1;
        return l < 0.8 || (dx * fwd.x + dz * fwd.y) / l > 0.35;
      })
      .sort((a, b) => a[0] - b[0])
      .slice(0, 3);
    const finisher = foes.length && this.chain >= 3;
    for (const [, e] of foes) {
      const crit = !!finisher;
      const knock = new THREE.Vector3(fwd.x, 0, fwd.y).multiplyScalar(crit ? 9 : 5);
      const dmg = MACHETE_DMG * this.mods.macheteDmg * (crit ? 1.8 : 1) * (combo ? 1.1 : 1);
      const killed = this.enemies.damage(e, dmg, this.combatCtx, knock, { source: 'melee', crit, stagger: crit ? 0.6 : 0.28 });
      this.particles.chipBurst(this.enemies.chest(e).clone(), 0x5a2a6a, crit ? 16 : 10, e.pos.y);
      this.hud.hitmarker(killed, crit);
      struck++;
    }
    if (struck) {
      this.lastStrike = now;
      if (finisher) this.chain = 0;
      this.player.shake = finisher ? 0.9 : 0.55;
      this.hitStop = finisher ? 0.09 : 0.05;
      this.machete.bite(finisher ? 1.4 : 1);
      this.audio.enemyHit();
      if (finisher) this.audio.stoneHit(true);
    }

    // Cut every plant in the arc in front of us.
    const hits = [];
    for (const c of this.world.near(p.x, p.z, 'cuttables')) {
      if (!c.alive) continue;
      const dx = c.x - p.x, dz = c.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d - c.r * 0.6 > REACH) continue;
      if (c.y > p.y + 2.2 || c.y < p.y - 2.2) continue;
      if (d > 0.3 && (dx * fwd.x + dz * fwd.y) / d < 0.3) continue;
      hits.push([d, c]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (const [, c] of hits.slice(0, 7)) {
      this.world.cutPlant(c);
      cut++;
      this.journal.event('cut');
      const center = new THREE.Vector3(c.x, c.y + 0.5 * Math.min(1.5, c.r), c.z);
      this.particles.leafBurst(center, c.def.cut.color, c.type === 'grass' ? 10 : 24, c.y + 0.02);
      // the third flower variant is a mushroom patch
      let table = c.def.cut.loot;
      if (c.type === 'flower' && c.v === 2) table = 'mushrooms';
      else if (c.type === 'seedling') table = 'seedling';
      this.loot(table, center.clone().add(new THREE.Vector3(0, 0.3, 0)), 1);
    }

    // Smash one breakable (crates, urns, chests).
    let broke = false;
    let best = null, bd = Infinity;
    for (const it of this.world.near(p.x, p.z, 'interactables')) {
      if (it.done || it.kind !== 'break') continue;
      const dx = it.x - p.x, dz = it.z - p.z, dy = it.y - (p.y + 1);
      const d = Math.hypot(dx, dz);
      if (d - it.r > REACH * 0.8 || Math.abs(dy) > 2) continue;
      if (d > 0.4 && (dx * fwd.x + dz * fwd.y) / d < 0.4) continue;
      if (d < bd) { bd = d; best = it; }
    }
    if (best) {
      broke = true;
      best.hp -= 1;
      const at = new THREE.Vector3(best.x, best.y, best.z);
      this.particles.chipBurst(at, best.debris, 10, best.y - 0.5);
      this.player.shake = 0.6;
      this.machete.bite(0.6);
      if (best.hp <= 0) {
        this.world.finishInteractable(best, best.chunk);
        this.checkDone(best.chunk);
        this.particles.chipBurst(at, best.debris, 30, best.y - 0.6);
        best.loot === 'ruin' ? this.audio.pottery() : this.audio.breakWood();
        for (const id of rollLoot(best.loot, this.rand)) this.pickups.spawn(id, at.clone(), 1.2, true);
      } else {
        best.loot === 'ruin' ? this.audio.stone() : this.audio.wood();
      }
    }

    if (cut) {
      this.audio.chop();
      this.player.shake = Math.max(this.player.shake, 0.25);
    }

    // Nothing soft in reach? Harvest a trunk or a rock (or ring off a wall).
    if (!cut && !broke && !struck) {
      const eye = this.camera.position;
      const probe = new THREE.Vector3(p.x + fwd.x * 1.4, 0, p.z + fwd.y * 1.4);
      for (const c of this.world.near(p.x, p.z, 'colliders')) {
        if (c.dead) continue;
        let inside = false;
        if (c.type === 'circle') inside = (probe.x - c.x) ** 2 + (probe.z - c.z) ** 2 < (c.r + 0.5) ** 2 && c.top > p.y + 0.3;
        else {
          const dx = probe.x - c.x, dz = probe.z - c.z;
          const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
          inside = Math.abs(dx * cs - dz * sn) < c.hx + 0.4 && Math.abs(dx * sn + dz * cs) < c.hz + 0.4 && c.top > p.y + 0.3;
        }
        if (!inside) continue;
        probe.y = Math.min(eye.y - 0.3 - lookDown * 0.5, c.top - 0.1);
        if (c.building) {
          this.audio.wood();
          this.particles.chipBurst(probe, 0x8a6a40, 6, p.y);
        } else if (c.top === Infinity && c.kind && c.kind !== 'stone' && c.kind !== 'heartwood') {
          this.harvestTrunk(c, probe);
        } else if (c.kind === 'rock') {
          this.harvestRock(c, probe);
        } else {
          this.particles.sparks(probe, 0xfff0c0, 10);
          this.audio.clank();
        }
        this.machete.bite(0.7);
        this.player.shake = 0.5;
        break;
      }
    }
  }

  // Hacking at a tree: bark, resin, vines; every third good blow frees a log.
  harvestTrunk(c, at) {
    this.audio.wood();
    this.particles.chipBurst(at, 0x8a6a40, 12, this.player.pos.y);
    c.hits = (c.hits || 0) + 1;
    const logs = c.kind === 'bigTree' ? 3 : c.kind === 'palm' ? 1 : 2;
    const drop = (id) => this.pickups.spawn(id, at.clone(), 0.6);
    if (c.hits % 3 === 0 && (c.logs || 0) < logs) {
      c.logs = (c.logs || 0) + 1;
      drop('log');
      this.audio.breakWood();
    } else {
      this.loot('trunk', at, 0.6);
    }
  }

  harvestRock(c, at) {
    this.audio.stone();
    this.particles.sparks(at, 0xfff0c0, 8);
    this.particles.chipBurst(at, 0x8a877b, 8, this.player.pos.y);
    c.hits = (c.hits || 0) + 1;
    if (c.hits <= 8) this.loot('rock', at, 0.6);
  }

  findInteractable() {
    const p = this.player.pos;
    const fwd = this.forwardXZ();
    let best = null, bs = -Infinity;
    for (const it of this.world.near(p.x, p.z, 'interactables')) {
      if (it.done) continue;
      const dx = it.x - p.x, dz = it.z - p.z, dy = it.y - (p.y + 1);
      const d = Math.hypot(dx, dz);
      // buildings can be worked from a few steps back, so you can watch an upgrade land
      const far = it.kind === 'building' ? 3.5 : 1.4;
      if (d > it.r + far || Math.abs(dy) > 2.2) continue;
      const facing = d < 0.5 ? 1 : (dx * fwd.x + dz * fwd.y) / d;
      if (facing < (it.kind === 'forage' ? 0.7 : d > it.r + 1.4 ? 0.8 : 0.45)) continue;
      // small things on the floor need you to actually look down at them
      if (it.kind === 'forage' && d > 1.2 && this.player.pitch > -0.25) continue;
      const score = facing * 2 - d - (it.kind === 'base' || it.kind === 'building' ? 1.5 : 0);
      if (score > bs) { bs = score; best = it; }
    }
    return best;
  }

  checkDone(chunk) {
    if (chunk?.poi && chunk.interactables.every((i) => i.done || i.kind === 'forage')) this.doneSet.add(chunk.poi.key);
  }

  collect(id, n = 1, quiet = false) {
    const left = this.inventory.add(id, n);
    if (left > 0) {
      this.hud.message('Satchel full', '#ff9a7a');
      for (let i = 0; i < left; i++) this.pickups.spawn(id, this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.4);
    }
    if (n - left > 0) {
      const r = RARITY[ITEMS[id].rarity];
      if (!quiet) this.audio.pickup(r.order);
      this.hud.toast(id, n - left);
    }
  }

  craft(recipe) {
    if (!this.inventory.craft(recipe)) {
      this.audio.ui();
      return;
    }
    this.audio.craft();
    this.hud.toast(recipe.out, recipe.n, 'Crafted');
    this.journal.event('craft', recipe.out);
    if (!this.hud.inventoryOpen) return;
    this.hud.renderInventory();
  }

  // ------------------------------------------------------------- consumables

  // RMB with a consumable in hand: play its animation; the effect lands in finishUse.
  startUse() {
    const s = this.inventory.held;
    if (!s) return;
    const def = ITEMS[s.id];
    if (def.kind !== 'use') return;
    if (def.heal && this.player.hp >= this.player.maxHp) {
      this.hud.message('Already at full health');
      return;
    }
    if (this.machete.use(def.throw ? 'throw' : def.salve ? 'raise' : 'eat')) {
      this.usingId = s.id;
      if (!def.throw) this.audio.rummage();
    }
  }

  finishUse() {
    const id = this.usingId;
    if (!id || this.inventory.count(id) <= 0) return;
    this.applyConsumable(id);
    this.inventory.remove(id, 1);
  }

  applyConsumable(id) {
    const def = ITEMS[id];
    const p = this.player.pos;
    if (def.heal) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + def.heal);
      this.particles.sparkle(p.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xff8080, 16);
      this.hud.damageNumber(p.clone().add(new THREE.Vector3(0, 1.4, 0)).add(this.player.forward.multiplyScalar(1.2)), `+${def.heal}`, 'heal');
      this.audio.pickup(1);
    } else if (def.throw) {
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      const from = this.camera.position.clone().addScaledVector(dir, 0.6);
      this.projectiles.firepot(from, dir.multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)));
      this.audio.swing();
    } else if (def.salve) {
      let n = 0;
      for (const b of this.buildings.list) {
        if (Math.hypot(b.x - p.x, b.z - p.z) > 20 || b.def.kind === 'trap' || b.def.kind === 'snare') continue;
        b.hp = b.maxHp;
        b.popT = 0.6;
        this.particles.sparkle(new THREE.Vector3(b.x, b.y + 1.5, b.z), 0x9affb0, 14);
        n++;
      }
      this.base.heal(120);
      this.particles.sparkle(this.base.heartPos, 0x8affb0, 30);
      this.audio.boon();
      this.hud.message(`Mended ${n} building${n === 1 ? '' : 's'} and the Heartwood`, '#8affb0');
    }
  }

  // Right-click in the satchel: eat/apply at once (no throwing from the bag).
  useFromSatchel(i) {
    const s = this.inventory.slots[i];
    if (!s || ITEMS[s.id].kind !== 'use') return;
    const def = ITEMS[s.id];
    if (def.throw) {
      this.hud.message('Put it on your belt and right-click to throw', '#f3ead2');
      return;
    }
    if (def.heal && this.player.hp >= this.player.maxHp) {
      this.hud.message('Already at full health');
      return;
    }
    this.applyConsumable(s.id);
    s.n--;
    if (s.n <= 0) this.inventory.slots[i] = null;
    this.inventory.changed(s.id);
  }

  dropSlot(i) {
    const s = this.inventory.slots[i];
    if (!s) return;
    const fwd = this.forwardXZ();
    const at = this.player.pos.clone().add(new THREE.Vector3(fwd.x * 1.5, 1, fwd.y * 1.5));
    this.inventory.remove(s.id, 1);
    const pk = this.pickups.spawn(s.id, at, 0.3);
    if (pk) pk.age = -2; // don't fly straight back
  }

  // ------------------------------------------------------------- slingshot

  updateSling(dt, input) {
    const has = this.inventory.count('scrap_shot') + this.inventory.count('stone') > 0;
    const ready = this.machete.mode === 'sling' && this.machete.ready;
    if (ready && input.mouse.down && has) {
      if (!this.drawing) this.audio.slingDraw();
      this.drawing = true;
      this.draw = Math.min(1, this.draw + (dt / 0.65) * this.mods.slingDraw);
    } else if (this.drawing) {
      if (this.draw > 0.15 && has) this.fireSling();
      this.drawing = false;
      this.draw = 0;
    } else if (ready && input.mouse.clicked && !has) {
      if (this.noAmmoT <= 0) this.hud.message('No stones: pick some up from the forest floor', '#ff9a7a');
      this.noAmmoT = 2;
      this.audio.ui();
    }
    this.noAmmoT -= dt;
    this.aimK = damp(this.aimK, this.drawing ? 1 : 0, 10, dt);
    this.hud.charge(this.drawing ? this.draw : 0);
  }

  fireSling() {
    const scrap = this.inventory.count('scrap_shot') > 0;
    this.inventory.remove(scrap ? 'scrap_shot' : 'stone', 1);
    const k = this.draw;
    const crit = k >= 0.98;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const from = this.camera.position.clone().addScaledVector(dir, 0.4).add(new THREE.Vector3(0, -0.08, 0));
    const vel = dir.multiplyScalar(18 + 30 * k);
    const dmg = (10 + 30 * k) * this.mods.slingDmg * (scrap ? ITEMS.scrap_shot.ammo : 1) * (crit ? 1.3 : 1);
    this.projectiles.stone(from, vel, dmg, { crit, scrap });
    this.machete.sling.release(k);
    this.audio.slingRelease(k);
    this.player.shake = Math.max(this.player.shake, 0.15 + k * 0.2);
  }

  // ------------------------------------------------------------- interaction

  // Interactions that need E or F (tap or hold).
  interact(dt, input) {
    const it = this.findInteractable();
    const holdAction = (label, time, done, sub = '', key = 'KeyE') => {
      if (input.down(key)) {
        if (this.search !== it || this.searchKey !== key) {
          this.search = it;
          this.searchT = 0;
          this.searchKey = key;
        }
        const prev = this.searchT;
        this.searchT += dt / time;
        if (Math.floor(this.searchT * 6) !== Math.floor(prev * 6)) this.audio.rummage();
        if (this.searchT >= 1) {
          done();
          this.search = null;
          this.searchT = 0;
        }
      } else if (this.searchKey === key) {
        this.searchT = Math.max(0, this.searchT - dt * 2);
      }
      const prog = this.search === it && this.searchKey === key ? this.searchT : 0;
      this.hud.prompt(label, prog, key === 'KeyF' ? 'F' : 'E', sub);
    };
    if (!it) {
      this.search = null;
      this.hud.prompt(null);
      return;
    }
    if (it.kind === 'forage') {
      this.hud.prompt(it.label, 0);
      if (input.hit('KeyE')) {
        if (!this.inventory.fits(it.id, 1)) {
          this.hud.message('Satchel full', '#ff9a7a');
          return;
        }
        this.world.takeForage(it);
        this.collect(it.id);
        this.journal.event('forage');
        this.particles.sparkle(new THREE.Vector3(it.x, it.y, it.z), RARITY[ITEMS[it.id].rarity].color, 8);
      }
    } else if (it.kind === 'search') {
      holdAction(it.label, it.time || 1.5, () => {
        this.world.finishInteractable(it, it.chunk);
        this.checkDone(it.chunk);
        const at = new THREE.Vector3(it.x, it.y + 0.4, it.z);
        this.particles.sparkle(at, 0xffe0a0, 18);
        for (const id of rollLoot(it.loot, this.rand)) this.pickups.spawn(id, at.clone(), 0.8, true);
      });
    } else if (it.kind === 'break') {
      this.hud.prompt(`${it.label} — swing`, 0);
    } else if (it.kind === 'base') {
      this.interactBase(holdAction);
    } else if (it.kind === 'building') {
      this.interactBuilding(it.building, holdAction, input);
    }
  }

  interactBase(holdAction) {
    const relics = this.inventory.relicValue;
    const next = thresholds(this.boonsTaken + this.pendingBoons);
    if (relics > 0) {
      holdAction('Offer relics to the Heartwood', 1.2, () => this.offerRelics(), `+${relics} favour · +${relics} HP · next boon at ${next}`);
    } else if (this.waves.phase === 'day' && !this.waves.skipping) {
      holdAction('Call the night early', 1.5, () => this.waves.callNight(), `Heartwood ${Math.ceil(this.base.hp)}/${this.base.maxHp} · favour ${this.favour}/${next}`);
    } else {
      this.hud.prompt(`Heartwood · ${Math.ceil(this.base.hp)} / ${this.base.maxHp}`, 0, '❦', `favour ${this.favour}/${next}`);
    }
  }

  offerRelics() {
    const relics = this.inventory.relicValue;
    for (const s of this.inventory.slots) if (s && ITEMS[s.id].kind === 'relic') this.inventory.remove(s.id, s.n);
    this.base.maxHp += Math.round(relics * 0.25);
    this.base.heal(relics);
    this.favour += relics;
    this.particles.sparkle(this.base.heartPos, 0x8affb0, 40);
    this.audio.pickup(4);
    this.journal.event('offer');
    while (this.favour >= thresholds(this.boonsTaken + this.pendingBoons)) this.pendingBoons++;
    if (this.pendingBoons) this.offerBoon();
    else this.hud.banner('The Heartwood drinks', `+${relics} HP · favour ${this.favour}/${thresholds(this.boonsTaken)}`, 'win');
  }

  offerBoon() {
    const options = offerPerks(this.perks);
    if (!options.length) {
      this.pendingBoons = 0;
      return;
    }
    this.modal = 'perks';
    this.input.unlock();
    this.audio.boon();
    this.hud.pickPerk(options, (p) => {
      this.perks.push(p.id);
      p.apply(this.mods, this);
      this.applyMods();
      this.boonsTaken++;
      this.pendingBoons--;
      this.hud.boons(this.perks.map((id) => PERKS.find((q) => q.id === id)));
      this.hud.banner(p.name, p.desc, 'win');
      this.audio.upgrade();
      this.modal = null;
      if (this.pendingBoons > 0) setTimeout(() => this.offerBoon(), 400);
      else if (!this.debug) this.input.lock();
    });
  }

  applyMods() {
    this.player.speedMul = this.mods.moveSpeed;
    this.player.staminaRegen = this.mods.staminaRegen;
  }

  interactBuilding(b, holdAction, input) {
    const name = `${TIER_NAMES[b.tier] ? `${TIER_NAMES[b.tier]} ` : ''}${ITEMS[b.id].name}`;
    const day = this.waves.phase === 'day' || this.waves.phase === 'dawn';
    const hp = `${Math.ceil(b.hp)}/${b.maxHp}`;
    const packHint = day ? ' · hold <kbd>F</kbd> to pack up' : '';
    // F: pack it back into the satchel (day only)
    if (day && input.down('KeyF')) {
      holdAction(`Pack up ${name}`, 1.2, () => {
        this.buildings.remove(b);
        this.collect(b.id);
      }, b.tier > 1 ? 'Upgrades are lost' : '', 'KeyF');
      return;
    }
    if (b.repairable) {
      const cost = b.repairCost;
      const ok = this.inventory.canAfford(cost);
      const sub = `${this.hud.costHtml(cost)}${packHint}`;
      if (ok) {
        holdAction(`Repair ${name} (${hp})`, 1.0, () => {
          for (const [id, n] of Object.entries(cost)) this.inventory.remove(id, n);
          b.hp = b.maxHp;
          b.popT = 0.5;
          this.particles.chipBurst(new THREE.Vector3(b.x, b.y + 1.2, b.z), 0x8a6a40, 14, b.y);
          this.audio.repair();
          this.hud.damageNumber(new THREE.Vector3(b.x, b.y + 2.2, b.z), 'Repaired', 'heal');
        }, sub);
      } else this.hud.prompt(`${name} · ${hp} · needs repair`, 0, 'E', sub);
      return;
    }
    if (b.upgradable) {
      const cost = b.upgradeCost;
      const ok = this.inventory.canAfford(cost);
      const sub = `${this.hud.costHtml(cost)}${packHint}`;
      const label = `Upgrade to ${TIER_NAMES[b.tier + 1]} (tier ${b.tier + 1})`;
      if (ok) {
        holdAction(label, 1.4, () => {
          for (const [id, n] of Object.entries(cost)) this.inventory.remove(id, n);
          b.upgrade();
          this.buildings.stats.upgraded++;
          this.particles.sparkle(new THREE.Vector3(b.x, b.y + 1.5, b.z), b.tier >= 3 ? 0xffc060 : 0x9affb0, 30);
          this.particles.leafBurst(new THREE.Vector3(b.x, b.y + 1.2, b.z), 0x4f8a30, 20, b.y);
          this.audio.upgrade();
          this.journal.event('upgrade');
          this.hud.banner(ITEMS[b.id].name, `is now ${TIER_NAMES[b.tier]}: stronger, tougher${b.def.range ? ', longer reach' : ''}`, 'win');
        }, sub);
      } else this.hud.prompt(`${name} · ${label}`, 0, 'E', sub);
      return;
    }
    this.hud.prompt(`${name} · ${hp}`, 0, b.tier >= 3 ? '★' : '⚒', day ? 'Hold <kbd>F</kbd> to pack up' : '');
  }

  // Holding a buildable: show the ghost and place on click.
  updateBuild(input) {
    const held = this.inventory.held;
    const def = held && BUILD_DEFS[held.id];
    if (!def || !this.playerAlive) {
      this.ghost.hide();
      this.hud.buildHint(null);
      return false;
    }
    this.ghost.show(held.id);
    if (input.hit('KeyR') && def.rotates) this.ghost.rot += Math.PI / 4;
    this.ghost.update(this.camera, this.buildings, { base: this.base, player: this.player.pos, mods: this.mods });
    const rot = def.rotates ? ' · <kbd>R</kbd> rotate' : '';
    this.hud.buildHint(this.ghost.valid ? `<kbd>LMB</kbd> place ${ITEMS[held.id].name}${rot}` : this.ghost.reason, this.ghost.valid);
    if (input.mouse.clicked) {
      if (this.ghost.valid) {
        const g = this.ghost;
        const b = this.buildings.place(held.id, g.pos.x, g.pos.z, g.rot);
        this.inventory.remove(held.id, 1);
        this.audio.place();
        this.particles.dust(g.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 14, def.r);
        this.journal.event('place', held.id);
        // clear the undergrowth under the footprint
        for (const f of b.footprint) {
          for (const c of this.world.near(f.x, f.z, 'cuttables')) {
            if (!c.alive || Math.hypot(c.x - f.x, c.z - f.z) > f.r + 0.6) continue;
            this.world.cutPlant(c);
            this.particles.leafBurst(new THREE.Vector3(c.x, c.y + 0.3, c.z), c.def.cut.color, 8, c.y);
          }
        }
      } else {
        this.audio.ui();
      }
    }
    return true;
  }

  // What combat callbacks need (enemies, towers, projectiles).
  get combatCtx() {
    if (!this._ctx) {
      this._ctx = {
        audio: this.audio,
        particles: this.particles,
        enemies: this.enemies,
        lights: this.lights,
        base: this.base,
        onKill: (e, opts) => this.onKill(e, opts),
        onDamage: (e, n, opts) => this.onEnemyDamage(e, n, opts),
      };
      this._ctx.damageCtx = this._ctx;
    }
    this._ctx.field = this.field;
    this._ctx.mods = this.mods;
    this._ctx.rain = this.weather.raining;
    return this._ctx;
  }

  onEnemyDamage(e, n, opts) {
    const at = this.enemies.chest(e).clone();
    at.y += 0.4 * e.def.scale;
    const near = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 22;
    const src = opts.source;
    if (src === 'burn') {
      if (near) this.hud.damageNumber(at, n, 'burn');
    } else if (src === 'melee' || src === 'sling' || src === 'fire') {
      this.hud.damageNumber(at, n, opts.crit ? 'crit' : '');
    } else if (near) this.hud.damageNumber(at, n, 'tower');
  }

  onKill(e, opts = {}) {
    const at = this.enemies.chest(e).clone();
    // a burst that fills the screen at arm's length reads as a glitch: scale it with distance
    const d = at.distanceTo(this.camera.position);
    const k = clamp(d / 8, 0.4, 1);
    const big = e.def.boss ? 4 : e.type === 'rotboar' ? 2 : 1;
    this.particles.sporeBurst(at, 0xb050ff, Math.round(18 * big * k + 6), (0.6 + 0.4 * k) * (e.def.boss ? 2 : 1));
    this.particles.ash(at, 10 * big, 0.6 * e.def.scale);
    this.audio.enemyDie(e.type !== 'blightling' && e.type !== 'wisp');
    this.loot(e.def.loot, at, 0.8);
    if (this.mods.killHeal && this.playerAlive) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.mods.killHeal);
    if (opts.source === 'sling') this.hud.hitmarker(true, opts.crit);
    if (e.def.boss) {
      this.stats.bosses++;
      this.particles.ring(e.pos.clone(), 9, 0xff60c0, 1.2);
      this.lights.flash(at, 0xff60c0, 120, 0.6, 30);
      this.player.shake = 1.2;
      this.audio.roar();
      this.hud.banner('The Thornback falls', 'Its sac bursts. Something precious spills out.', 'win');
    }
  }

  hitPlayer(dmg) {
    if (!this.playerAlive) return;
    dmg *= this.mods.playerArmor;
    this.player.hp -= dmg;
    this.lastHit = 0;
    this.player.shake = 0.8;
    this.hud.hurt(0.4 + dmg / 40);
    this.audio.hurt();
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.deadT = RESPAWN;
      this.ghost.hide();
      this.drawing = false;
    }
  }

  hitBase(dmg, e) {
    this.base.damage(dmg);
    this.audio.heartHurt();
    if (this.mods.heartThorns && e) this.enemies.damage(e, this.mods.heartThorns, this.combatCtx, null, { source: 'tower' });
    if (Math.random() < 0.35) this.particles.sparkle(this.base.heartPos, 0xff9070, 4);
    // tell a player who's off foraging
    const far = Math.hypot(this.base.x - this.player.pos.x, this.base.z - this.player.pos.z) > 28;
    this.heartMarker.alert = true;
    this.alertHold = 3;
    if (far && this.alertT <= 0) {
      this.alertT = 8;
      this.hud.message('The Heartwood is under attack!', '#ff7a6a');
      this.audio.heartAlarm();
    }
  }

  // the Thornback rears and crashes down: everything close is hurt and thrown
  // You can't walk through the Blight: push the player out of every ground body (otherwise you
  // end up standing inside the Thornback with the camera under its belly).
  shovePlayer() {
    const p = this.player.pos;
    for (const e of this.enemies.list) {
      if (e.dying || e.def.flying || e.rise > 0.3) continue;
      const r = e.def.radius * 0.85 + 0.35;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z, d2 = dx * dx + dz * dz;
      if (d2 >= r * r || Math.abs(p.y - e.pos.y) > 2.5) continue;
      const d = Math.sqrt(d2) || 1e-3;
      p.x = e.pos.x + (dx / d) * r;
      p.z = e.pos.z + (dz / d) * r;
    }
  }

  onSlam(e) {
    const f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const at = e.pos.clone().addScaledVector(f, 2.2);
    at.y = terrainHeight(at.x, at.z);
    const R = 6;
    for (const b of [...this.buildings.list]) {
      const d = b.distTo(at.x, at.z);
      if (d < R) {
        this.buildings.damage(b, 110 * (1 - (d / R) * 0.5));
        this.particles.chipBurst(new THREE.Vector3(b.x, b.y + 1, b.z), 0x8a6a40, 10, b.y);
      }
    }
    const p = this.player.pos;
    const dp = Math.hypot(p.x - at.x, p.z - at.z);
    if (dp < R && this.playerAlive && p.y - at.y < 1.5) {
      this.hitPlayer(26 * (1 - (dp / R) * 0.5));
      const away = new THREE.Vector3(p.x - at.x, 0, p.z - at.z).normalize();
      this.player.vel.x += away.x * 9;
      this.player.vel.z += away.z * 9;
      this.player.vel.y = 6;
      this.player.onGround = false;
    }
    if (Math.hypot(this.base.x - at.x, this.base.z - at.z) < GOAL_RADIUS + R * 0.6) this.hitBase(30, e);
    this.particles.ring(at, R, 0xff70c0, 0.7);
    this.particles.ring(at, R * 0.6, 0xffc0e0, 0.45);
    this.particles.dust(at.clone().add(new THREE.Vector3(0, 0.2, 0)), 30, 2.2, 0x6a5a48);
    this.particles.chipBurst(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x5a4a3a, 30, at.y);
    this.lights.flash(at.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xff70c0, 90, 0.3, 22);
    this.player.shake = Math.max(this.player.shake, clamp(1.6 - dp / 18, 0.2, 1.6));
    this.audio.slam();
  }

  // the Thornback calls Blightlings out of its back
  summon(e) {
    for (let i = 0; i < 3; i++) {
      const a = e.yaw + Math.PI + (i - 1) * 0.9;
      const x = e.pos.x + Math.sin(a) * 2.6, z = e.pos.z + Math.cos(a) * 2.6;
      this.enemies.spawn('blightling', x, z, this.waves.hpScale);
      this.particles.ash(new THREE.Vector3(x, e.pos.y + 1, z), 12, 0.8);
    }
    this.audio.roar();
  }

  onWindup(e, kind) {
    const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
    if (kind === 'slam') {
      this.audio.roar();
      return;
    }
    if (d < 14) this.audio.windup(1 - d / 14);
  }

  // ---------------------------------------------------------------- endings

  runStats() {
    return {
      nights: this.waves.night - 1, kills: this.enemies.kills, built: this.buildings.stats.built,
      upgraded: this.buildings.stats.upgraded, boons: this.perks.length, bosses: this.stats.bosses,
    };
  }

  onDefeat() {
    // the Heart withers (Base.update), the world slows, then the summary
    this.overT = 2.8;
    this.particles.sporeBurst(this.base.heartPos, 0xb050ff, 80, 2.2);
    this.particles.ring(new THREE.Vector3(this.base.x, this.base.y, this.base.z), 14, 0xb050ff, 2);
    this.lights.flash(this.base.heartPos, 0xb050ff, 140, 1.5, 40);
    this.audio.defeat();
    this.ghost.hide();
    this.hud.buildHint(null);
    this.hud.prompt(null);
    this.hud.charge(0);
    clearSave();
  }

  onVictory() {
    this.audio.victory();
    this.hud.banner('The Heartwood blooms', 'Ten nights held.', 'win');
    this.particles.sparkle(this.base.heartPos, 0xb8ffcf, 60);
    setTimeout(() => {
      this.modal = 'victory';
      this.input.unlock();
      const best = recordBest(this.waves.night - 1, this.enemies.kills);
      this.hud.victory({ ...this.runStats(), best });
    }, 2600);
  }

  continueEndless() {
    this.hud.hideVictory();
    this.modal = null;
    if (!this.debug) this.input.lock();
  }

  // ---------------------------------------------------------------- loop

  setPaused(p) {
    this.paused = p;
  }

  frame(ts) {
    this.timer.update(ts);
    let dt = Math.min(Math.max(this.timer.getDelta(), 0), 0.05);
    const t = this.timer.getElapsed();
    const realDt = dt;
    // hit-stop: the world freezes for a beat when the machete connects
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.06;
    }
    // the Heartwood falls in slow motion
    if (this.overT > 0) {
      dt *= 0.35;
      this.overT -= realDt;
      if (this.overT <= 0) {
        this.modal = 'over';
        this.input.unlock();
        const best = recordBest(this.waves.night - 1, this.enemies.kills);
        this.hud.gameOver({ ...this.runStats(), best });
      }
    }
    globalUniforms.uTime.value = t;
    const input = this.input;
    const over = this.waves.phase === 'over';
    const paused = this.paused || !!this.modal;
    const active = !paused && !this.hud.inventoryOpen && !over;

    // dead: wait, then come back at the Heartwood
    if (this.deadT > 0 && !paused) {
      this.deadT -= realDt;
      if (this.deadT <= 0) {
        this.respawn();
        this.hud.message('The Heartwood pulls you back', '#8affb0');
      }
    }
    this.hud.setDead(over ? 0 : this.deadT);

    // what's in hand decides the viewmodel
    const held = this.inventory.held;
    const hk = held && ITEMS[held.id].kind;
    const want = !held ? 'machete' : held.id === 'slingshot' ? 'sling' : hk === 'use' ? held.id : hk === 'build' ? 'none' : 'machete';
    this.machete.equip(want);

    this.player.moveMul = 1;
    if (active && this.playerAlive) {
      // belt selection
      for (let i = 0; i < HOTBAR; i++) if (input.hit(`Digit${i + 1}`)) this.inventory.select(i);
      if (input.mouse.wheel && !this.drawing) this.inventory.select(this.inventory.selected + input.mouse.wheel);

      this.player.look(input.mouse.dx, input.mouse.dy);
      this.machete.addSway(input.mouse.dx, input.mouse.dy);
      if (this.drawing) this.player.moveMul = 0.55;
      this.player.update(dt, input, this.audio);
      const building = this.updateBuild(input);
      if (want === 'sling') this.updateSling(realDt, input);
      else {
        this.drawing = false;
        this.draw = 0;
        this.aimK = damp(this.aimK, 0, 10, dt);
        this.hud.charge(0);
      }
      if (!building && want === 'machete' && (input.mouse.clicked || (input.mouse.down && !this.machete.swinging))) {
        if (this.machete.swing()) {
          // only clicked swings build the finisher chain; holding the button just keeps swinging
          this.swingTapped = input.mouse.clicked;
          this.audio.swing();
          this.player.stamina = Math.max(0, this.player.stamina - 0.03);
        }
      }
      if (input.mouse.rclicked) this.startUse();
      this.interact(dt, input);
    } else {
      this.player.update(0, input, null);
      if (!this.playerAlive || over) this.hud.prompt(null);
      if (over || !this.playerAlive) {
        this.ghost.hide();
        this.hud.buildHint(null);
      }
      this.drawing = false;
      this.draw = 0;
      this.hud.charge(0);
    }
    // the slingshot draw narrows the view a touch
    const fov = FOV - this.aimK * 4 - this.draw * 6;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    // fallen: the view drops and rolls onto its side
    if (!this.playerAlive && !over) {
      const k = ease(clamp((RESPAWN - this.deadT) / 0.8, 0, 1));
      this.camera.position.y -= 1.25 * k;
      this.camera.rotation.z = 1.2 * k;
      this.camera.rotation.x -= 0.3 * k;
    }

    // health comes back slowly once you've been out of the fight a while
    this.lastHit += dt;
    if (this.playerAlive && this.lastHit > 6) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * 4);

    if (!over && !this.modal && (input.hit('Tab') || input.hit('KeyI'))) {
      if (!this.paused || this.hud.inventoryOpen) {
        const open = !this.hud.inventoryOpen;
        this.hud.toggleInventory(open);
        this.audio.ui();
        if (open) input.unlock();
        else if (!this.debug) input.lock();
      }
    }
    if (input.hit('KeyM')) {
      this.audio.enabled = !this.audio.enabled;
      if (this.audio.master) this.audio.master.gain.value = this.audio.enabled ? 0.7 : 0;
    }

    const pos = this.player.pos;
    this.world.update(pos.x, pos.z, dt);
    this.water.update(pos);

    // ---- defence
    if (this.buildings.changed) {
      this.buildings.changed = false;
      this.field.rebuild(this.buildings.blocking);
    }
    const ctx = this.combatCtx;
    if (!paused) {
      // rain rolls in at dusk on wet nights and clears at dawn
      const w = this.waves;
      if (w.phase === 'night' || (w.phase === 'day' && this.sky.time > DUSK - 0.03)) this.weather.target = w.rainTonight ? 1 : 0;
      this.waves.update(dt, { fastForward: input.down('KeyT') && active });
      this.enemies.update(dt, t, {
        field: this.field, base: this.base, player: pos, playerAlive: this.playerAlive,
        buildings: this.buildings.list, particles: this.particles, damageCtx: ctx,
        night: this.sky.state.night, speedMul: this.weather.raining ? 0.85 : 1,
        hitPlayer: (dmg) => this.hitPlayer(dmg),
        hitBase: (dmg, e) => this.hitBase(dmg, e),
        hitBuilding: (b, dmg, e) => {
          const broke = this.buildings.damage(b, dmg);
          this.audio.bite();
          const thorns = b.stat('thorns');
          if (thorns) this.enemies.damage(e, thorns, ctx, null, { source: 'tower' });
          if (broke) {
            this.particles.chipBurst(new THREE.Vector3(b.x, b.y + 1, b.z), 0x8a6a40, 40, b.y);
            this.audio.breakWood();
            this.hud.message(`${ITEMS[b.id].name} destroyed`, '#ff9a7a');
          }
        },
        onSlam: (e) => this.onSlam(e),
        summon: (e) => this.summon(e),
        onWindup: (e, kind) => this.onWindup(e, kind),
      });
      if (this.playerAlive) this.shovePlayer();
      this.buildings.update(dt, t, ctx);
      this.projectiles.update(dt, {
        ...ctx,
        onHitmark: (kill, crit) => this.hud.hitmarker(kill, crit),
        onStoneLand: (p, scrap) => {
          if (!scrap && Math.random() < 0.45) {
            const pk = this.pickups.spawn('stone', p.add(new THREE.Vector3(0, 0.3, 0)), 0.2);
            if (pk) pk.age = -0.5;
          }
        },
      });
      for (const e of this.enemies.list) {
        if (e.type === 'wisp' && !e.dying && Math.random() < dt * 0.12 && e.pos.distanceTo(pos) < 30) this.audio.wispCry();
      }
    }
    this.alertT -= realDt;
    this.alertHold -= realDt;
    if (this.alertHold <= 0) this.heartMarker.alert = false;
    this.base.update(dt, t, this.sky.state.night);
    for (const r of this.rifts) r.update(dt, t, this.particles, this.lights);

    // canopy cover dims ambient light under big trees
    let cover = 0;
    const cx = Math.floor(pos.x / CHUNK_SIZE), cz = Math.floor(pos.z / CHUNK_SIZE);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const b of this.world.bigTrees(cx + dx, cz + dz)) {
        const d = Math.hypot(b.x - pos.x, b.z - pos.z);
        cover = Math.max(cover, smoothstep(9 * b.s, 3, d));
      }
    }
    this.cover = damp(this.cover, cover, 1.5, dt);
    this.sky.update(dt, pos, false, this.cover);
    this.weather.update(realDt, t, this.camera, this.sky, this.audio, this.sky.state.night);
    this.hud.lightning(this.weather.uniforms.uFlash.value);
    this.lights.update(realDt, pos);

    for (const g of this.pickups.update(dt, t, pos)) {
      this.collect(g.id);
      // picking up drops counts toward the first journal step as much as tapping E does
      this.journal.event('forage');
    }
    this.particles.update(dt, this.camera);
    this.ambient.update(dt, t, this.camera, pos);

    // discoveries
    for (const s of poisAround(cx, cz, 1)) {
      if (this.hud.discovered.has(s.key)) continue;
      if (Math.hypot(s.x - pos.x, s.z - pos.z) < s.radius + 5) {
        this.hud.discovered.add(s.key);
        this.hud.discover(POI_INFO[s.type].label);
        this.audio.pickup(2);
      }
    }

    // audio surroundings, sampled a few times a second
    this.envTick -= dt;
    if (this.envTick <= 0) {
      this.envTick = 0.4;
      let w = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        if (terrainHeight(pos.x + Math.cos(a) * 14, pos.z + Math.sin(a) * 14) < WATER_LEVEL) w++;
      }
      this.nearWater = Math.min(1, w / 3);
    }
    this.audio.update(dt, { ...this.sky.state, nearWater: this.nearWater, underCanopy: this.cover });

    // autosave through the day
    if (this.waves.phase === 'day' && !paused) {
      this.saveT -= realDt;
      if (this.saveT <= 0) {
        this.saveT = 30;
        this.autosave();
      }
    }

    const sun = this.sky.sun;
    this.machete.root.visible = this.playerAlive && !over && !this.paused;
    this.machete.update(realDt, this.camera, this.player, {
      dir: sun.position.clone().sub(sun.target.position).normalize(),
      color: sun.color, intensity: sun.intensity * (1 - this.cover * 0.65),
      hemiSky: this.sky.hemi.color, hemiGround: this.sky.hemi.groundColor, hemiIntensity: this.sky.hemi.intensity,
      env: this.scene.environment, envIntensity: this.scene.environmentIntensity,
    }, { draw: this.draw, aim: this.aimK, loaded: this.inventory.count('stone') + this.inventory.count('scrap_shot') > 0 });

    this.hud.frame(realDt, {
      player: pos, heading: -this.player.yaw, stamina: this.player.stamina, clock: this.sky.clock,
      underwater: this.camera.position.y < WATER_LEVEL - 0.05, done: this.doneSet,
      hp: this.player.hp, maxHp: this.player.maxHp, waves: this.waves, base: this.base,
      buildings: this.buildings.list, enemies: this.enemies.list, buildRadius: BUILD_RADIUS,
      camera: this.camera, boss: this.enemies.boss, journal: this.journal.lines(this.waves.phase),
    });

    const r = this.renderer;
    if (this.bloom && this.composer) {
      this.composer.render(realDt);
    } else {
      r.setRenderTarget(null);
      r.clear();
      r.render(this.scene, this.camera);
    }
    r.clearDepth();
    r.render(this.machete.scene, this.machete.camera);
    input.endFrame();
  }
}
