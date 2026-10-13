// Game orchestration: owns every system and runs the frame loop.
//
// The loop: by day you roam, cut and forage; in the satchel you craft what you found into
// defences; you place them around the Heartwood. At dusk the Waves director opens the
// rifts and the Blight follows the flow field to the Heart. Towers, traps and your
// machete hold them off until dawn.
import * as THREE from 'three';
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
import { Pickups } from '../items/Pickups.js';
import { Inventory, HOTBAR } from '../items/Inventory.js';
import { ITEMS, ITEM_IDS, RARITY, rollLoot } from '../items/ItemDB.js';
import { renderItemIcons } from '../items/ItemModels.js';
import { AudioSys } from '../audio/AudioSys.js';
import { HUD } from '../ui/HUD.js';
import { smoothstep, damp } from '../utils/math.js';
import { loadModels } from '../assets/Models.js';
import { Base, Rift, pickRifts, findBaseSite, BASE_CLEAR, BUILD_RADIUS, GOAL_RADIUS } from '../defense/Base.js';
import { FlowField } from '../defense/FlowField.js';
import { Enemies } from '../defense/Enemies.js';
import { Buildings, BuildGhost, BUILD_DEFS } from '../defense/Towers.js';
import { Waves, DUSK } from '../defense/Waves.js';

// Yield so the loading bar can paint; falls back to a timeout because
// requestAnimationFrame is paused in background tabs.
const nextFrame = () => new Promise((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
const REACH = 2.7;
const MACHETE_DMG = 24;
const RESPAWN = 5;
const STARTER = [['bow_tower', 1], ['poultice', 2]];

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
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000);
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.inventory = new Inventory();
    this.hud = new HUD(this.inventory);
    this.running = false;
    this.paused = true;
    this.startTime = time;
    this.cover = 0;
    this.search = null;
    this.searchT = 0;
    this.doneSet = new Set();
    this.envTick = 0;
    this.nearWater = 0;
    this.deadT = 0;
    this.lastHit = 99;
    this.rand = Math.random;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async init(progress) {
    progress(0.03, 'Carving the Heartwood…');
    let loaded = 0;
    await loadModels(() => progress(0.03 + (++loaded / 7) * 0.12, 'Carving the Heartwood…'));
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
    this.world.addClearing(sp.x, sp.z, BASE_CLEAR);
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
    this.hud.markers = [
      { key: 'heartwood', x: this.base.x, z: this.base.z, icon: '❦', label: 'Heartwood', cls: 'base' },
      ...this.rifts.map((r, i) => ({ key: `rift${i}`, x: r.x, z: r.z, icon: '✶', label: 'Rift', cls: 'rift' })),
    ];
    this.waves = new Waves({ sky: this.sky, enemies: this.enemies, rifts: this.rifts, hud: this.hud, audio: this.audio, world: this.world, base: this.base });

    progress(0.75, 'Scattering secrets…');
    await nextFrame();
    this.machete = new Machete(this.camera.fov);
    this.machete.onHit = () => this.onSwingHit();
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
    this.hud.onUse = (i) => this.useSlot(i);
    this.hud.onDrop = (i) => this.dropSlot(i);
    this.hud.stats();
    this.player.update(0.016, this.input, null);
    this.sky.update(0, this.player.pos, true);

    progress(0.9, 'Warming up shaders…');
    await nextFrame();
    // compile enemy/projectile materials up front so the first night doesn't hitch
    const warm = [this.enemies.spawn('blightling', this.base.x + 8, this.base.z), this.enemies.spawn('rotboar', this.base.x - 8, this.base.z)];
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    for (const e of warm) this.scene.remove(e.obj);
    this.enemies.list = [];
    this.hud.updateMinimap(this.player.pos, 0, true);
    progress(1, 'Ready');
    this.running = true;
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
    setTimeout(() => this.hud.banner('Day 1', 'Gather from the forest, craft defences, guard the Heartwood.'), 400);
  }

  // Put the player beside the Heartwood, facing it.
  respawn() {
    const a = 2.2;
    const x = this.base.x + Math.sin(a) * 8, z = this.base.z + Math.cos(a) * 8;
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

  // ------------------------------------------------------------- actions

  forwardXZ() {
    return new THREE.Vector2(-Math.sin(this.player.yaw), -Math.cos(this.player.yaw));
  }

  get playerAlive() {
    return this.deadT <= 0;
  }

  onSwingHit() {
    const p = this.player.pos;
    const fwd = this.forwardXZ();
    const lookDown = this.player.pitch;
    let cut = 0;

    // Blight first: the machete bites up to three in the arc
    let struck = 0;
    const foes = this.enemies.list
      .filter((e) => !e.dying)
      .map((e) => [Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.def.radius, e])
      .filter(([d, e]) => {
        if (d > REACH || Math.abs(e.pos.y - p.y) > 2) return false;
        const dx = e.pos.x - p.x, dz = e.pos.z - p.z, l = Math.hypot(dx, dz) || 1;
        return l < 0.8 || (dx * fwd.x + dz * fwd.y) / l > 0.35;
      })
      .sort((a, b) => a[0] - b[0])
      .slice(0, 3);
    for (const [, e] of foes) {
      const knock = new THREE.Vector3(fwd.x, 0, fwd.y).multiplyScalar(5);
      this.enemies.damage(e, MACHETE_DMG, this.combatCtx, knock);
      this.particles.chipBurst(this.enemies.chest(e).clone(), 0x5a2a6a, 10, e.pos.y);
      struck++;
    }
    if (struck) {
      this.player.shake = 0.55;
      this.audio.enemyHit();
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
      const center = new THREE.Vector3(c.x, c.y + 0.5 * Math.min(1.5, c.r), c.z);
      this.particles.leafBurst(center, c.def.cut.color, c.type === 'grass' ? 10 : 24, c.y + 0.02);
      // the third flower variant is a mushroom patch
      let table = c.def.cut.loot;
      if (c.type === 'flower' && c.v === 2) table = 'mushrooms';
      else if (c.type === 'seedling') table = 'seedling';
      for (const id of rollLoot(table, this.rand)) this.pickups.spawn(id, center.clone().add(new THREE.Vector3(0, 0.3, 0)));
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
      for (const id of rollLoot('trunk', this.rand)) drop(id);
    }
  }

  harvestRock(c, at) {
    this.audio.stone();
    this.particles.sparks(at, 0xfff0c0, 8);
    this.particles.chipBurst(at, 0x8a877b, 8, this.player.pos.y);
    c.hits = (c.hits || 0) + 1;
    if (c.hits <= 8) for (const id of rollLoot('rock', this.rand)) this.pickups.spawn(id, at.clone(), 0.6);
  }

  findInteractable() {
    const p = this.player.pos;
    const fwd = this.forwardXZ();
    let best = null, bs = -Infinity;
    for (const it of this.world.near(p.x, p.z, 'interactables')) {
      if (it.done) continue;
      const dx = it.x - p.x, dz = it.z - p.z, dy = it.y - (p.y + 1);
      const d = Math.hypot(dx, dz);
      if (d > it.r + 1.4 || Math.abs(dy) > 2.2) continue;
      const facing = d < 0.5 ? 1 : (dx * fwd.x + dz * fwd.y) / d;
      if (facing < (it.kind === 'forage' ? 0.7 : 0.45)) continue;
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
    if (!this.hud.inventoryOpen) return;
    this.hud.renderInventory();
  }

  useSlot(i) {
    const s = this.inventory.slots[i];
    if (!s || ITEMS[s.id].kind !== 'use') return;
    const def = ITEMS[s.id];
    if (def.heal) {
      if (this.player.hp >= this.player.maxHp) {
        this.hud.message('Already at full health');
        return;
      }
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + def.heal);
      this.particles.sparkle(this.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xff8080, 16);
      this.audio.pickup(1);
    }
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

  // Interactions that need E (tap or hold).
  interact(dt, input) {
    const it = this.findInteractable();
    const held = input.down('KeyE');
    const holdAction = (label, time, done) => {
      if (held) {
        if (this.search !== it) { this.search = it; this.searchT = 0; }
        const prev = this.searchT;
        this.searchT += dt / time;
        if (Math.floor(this.searchT * 6) !== Math.floor(prev * 6)) this.audio.rummage();
        if (this.searchT >= 1) {
          done();
          this.search = null;
          this.searchT = 0;
        }
      } else {
        this.searchT = Math.max(0, this.searchT - dt * 2);
      }
      this.hud.prompt(label, this.search === it ? this.searchT : 0);
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
      const relics = this.inventory.relicValue;
      if (relics > 0) {
        holdAction(`Offer relics to the Heartwood (+${relics} HP)`, 1.2, () => {
          for (const s of this.inventory.slots) if (s && ITEMS[s.id].kind === 'relic') this.inventory.remove(s.id, s.n);
          this.base.maxHp += Math.round(relics * 0.25);
          this.base.heal(relics);
          this.particles.sparkle(new THREE.Vector3(this.base.x, this.base.y + 4, this.base.z), 0x8affb0, 40);
          this.audio.pickup(4);
          this.hud.banner('The Heartwood drinks', `+${relics} HP · max HP ${this.base.maxHp}`);
        });
      } else if (this.waves.phase === 'day' && !this.waves.skipping) {
        holdAction('Call the night early', 1.5, () => this.waves.callNight());
      } else {
        this.hud.prompt(`Heartwood · ${Math.ceil(this.base.hp)} / ${this.base.maxHp}`, 0, '❦');
      }
    } else if (it.kind === 'building') {
      const b = it.building;
      const name = ITEMS[b.id].name;
      if (this.waves.phase === 'day' || this.waves.phase === 'dawn') {
        holdAction(`Pack up ${name} (${Math.ceil(b.hp)}/${b.maxHp})`, 1.2, () => {
          this.buildings.remove(b);
          this.collect(b.id);
        });
      } else {
        this.hud.prompt(`${name} · ${Math.ceil(b.hp)}/${b.maxHp}`, 0, '⚒');
      }
    }
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
    this.ghost.update(this.camera, this.buildings, { base: this.base, player: this.player.pos });
    const rot = def.rotates ? ' · R rotate' : '';
    this.hud.buildHint(this.ghost.valid ? `LMB place ${ITEMS[held.id].name}${rot}` : this.ghost.reason, this.ghost.valid);
    if (input.mouse.clicked) {
      if (this.ghost.valid) {
        const g = this.ghost;
        this.buildings.place(held.id, g.pos.x, g.pos.z, g.rot);
        this.inventory.remove(held.id, 1);
        this.audio.place();
        this.particles.chipBurst(g.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x8a6a40, 20, g.pos.y);
      } else {
        this.audio.ui();
      }
    }
    return true;
  }

  // What combat callbacks need (enemies, towers).
  get combatCtx() {
    if (!this._ctx) {
      this._ctx = {
        audio: this.audio,
        particles: this.particles,
        enemies: this.enemies,
        onKill: (e) => {
          const at = this.enemies.chest(e).clone();
          this.particles.sporeBurst(at, 0xb050ff, e.type === 'rotboar' ? 50 : 24);
          this.audio.enemyDie(e.type === 'rotboar');
          for (const id of rollLoot(e.def.loot, this.rand)) this.pickups.spawn(id, at.clone(), 0.8);
        },
        onHurt: () => {},
      };
    }
    this._ctx.field = this.field;
    return this._ctx;
  }

  hitPlayer(dmg) {
    if (!this.playerAlive) return;
    this.player.hp -= dmg;
    this.lastHit = 0;
    this.player.shake = 0.8;
    this.hud.hurt(0.6);
    this.audio.hurt();
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.deadT = RESPAWN;
      this.ghost.hide();
    }
  }

  // ---------------------------------------------------------------- loop

  setPaused(p) {
    this.paused = p;
  }

  frame(ts) {
    this.timer.update(ts);
    const dt = Math.min(Math.max(this.timer.getDelta(), 0), 0.05);
    const t = this.timer.getElapsed();
    globalUniforms.uTime.value = t;
    const input = this.input;
    const over = this.waves.phase === 'over';
    const active = !this.paused && !this.hud.inventoryOpen && !over;

    // dead: wait, then come back at the Heartwood
    if (this.deadT > 0 && !this.paused) {
      this.deadT -= dt;
      if (this.deadT <= 0) {
        this.respawn();
        this.hud.message('The Heartwood pulls you back', '#8affb0');
      }
    }
    this.hud.setDead(this.deadT);

    if (active && this.playerAlive) {
      // belt selection
      for (let i = 0; i < HOTBAR; i++) if (input.hit(`Digit${i + 1}`)) this.inventory.select(i);
      if (input.mouse.wheel) this.inventory.select(this.inventory.selected + input.mouse.wheel);

      this.player.look(input.mouse.dx, input.mouse.dy);
      this.machete.addSway(input.mouse.dx, input.mouse.dy);
      this.player.update(dt, input, this.audio);
      const building = this.updateBuild(input);
      if (!building && (input.mouse.clicked || (input.mouse.down && !this.machete.swinging))) {
        if (this.machete.swing()) {
          this.audio.swing();
          this.player.stamina = Math.max(0, this.player.stamina - 0.03);
        }
      }
      if (input.mouse.rclicked) this.useSlot(this.inventory.selected);
      this.interact(dt, input);
    } else {
      this.player.update(0, input, null);
      if (!this.playerAlive) this.hud.prompt(null);
    }

    // health comes back slowly once you've been out of the fight a while
    this.lastHit += dt;
    if (this.playerAlive && this.lastHit > 6) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * 4);

    if (!over && (input.hit('Tab') || input.hit('KeyI'))) {
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
    if (!this.paused) {
      this.waves.update(dt, { fastForward: input.down('KeyT') && active });
      const ctx = this.combatCtx;
      this.enemies.update(dt, t, {
        field: this.field, base: this.base, player: pos, playerAlive: this.playerAlive,
        buildings: this.buildings.list,
        hitPlayer: (dmg) => this.hitPlayer(dmg),
        hitBase: (dmg) => {
          this.base.damage(dmg);
          this.audio.heartHurt();
        },
        hitBuilding: (b, dmg, e) => {
          const broke = this.buildings.damage(b, dmg);
          this.audio.bite();
          if (b.def.thorns) this.enemies.damage(e, b.def.thorns, ctx);
          if (broke) {
            this.particles.chipBurst(new THREE.Vector3(b.x, b.y + 1, b.z), 0x8a6a40, 40, b.y);
            this.audio.breakWood();
            this.hud.message(`${ITEMS[b.id].name} destroyed`, '#ff9a7a');
          }
        },
      });
      this.buildings.update(dt, t, ctx);
    }
    this.base.update(dt, t);
    for (const r of this.rifts) r.update(dt, t);

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

    for (const g of this.pickups.update(dt, t, pos)) this.collect(g.id);
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

    const sun = this.sky.sun;
    this.machete.root.visible = this.playerAlive && !this.ghost.obj;
    this.machete.update(dt, this.camera, this.player, {
      dir: sun.position.clone().sub(sun.target.position).normalize(),
      color: sun.color, intensity: sun.intensity * (1 - this.cover * 0.65),
      hemiSky: this.sky.hemi.color, hemiGround: this.sky.hemi.groundColor, hemiIntensity: this.sky.hemi.intensity,
      env: this.scene.environment, envIntensity: this.scene.environmentIntensity,
    });

    this.hud.frame(dt, {
      player: pos, heading: -this.player.yaw, stamina: this.player.stamina, clock: this.sky.clock,
      underwater: this.camera.position.y < WATER_LEVEL - 0.05, done: this.doneSet,
      hp: this.player.hp, maxHp: this.player.maxHp, waves: this.waves, base: this.base,
      buildings: this.buildings.list, enemies: this.enemies.list, buildRadius: BUILD_RADIUS,
    });

    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.machete.scene, this.machete.camera);
    input.endFrame();
  }
}
