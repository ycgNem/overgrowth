// Game orchestration: owns every system and runs the frame loop.
//
// The loop: by day you roam, cut and forage; in the satchel you craft what you found into
// defences; you place them around the Heartwood. At dusk the Waves director opens the
// rifts and the Blight follows the flow field to the Heart. Towers, traps, your machete and
// slingshot hold them off until dawn. Relics offered at the Heartwood earn boons; every fifth
// night the Thornback comes; hold ten nights and the Heartwood blooms.
import * as THREE from 'three';
import { PostFX } from '../render/PostFX.js';
import { TextureLib } from '../art/TextureLib.js';
import { setDetailTextures } from '../art/merge.js';
import { CanopyMap, installCanopy, canopyBox } from '../render/Canopy.js';
import { globalUniforms } from '../art/shaders.js';
import { Flora } from '../world/flora/Flora.js';
import { World } from '../world/World.js';
import { Litter } from '../world/Litter.js';
import { Cover } from '../world/Cover.js';
import { Grass } from '../world/Grass.js';
import { Sky } from '../world/Sky.js';
import { Water } from '../world/Water.js';
import { findSpawn, terrainHeight, WATER_LEVEL, CHUNK_SIZE } from '../world/WorldGen.js';
import { POI_INFO, poisAround, buildPOI } from '../world/poi/POI.js';
import { Player } from '../player/Player.js';
import { Machete } from '../player/Machete.js';
import { Input } from './Input.js';
import { Particles } from '../fx/Particles.js';
import { Marks } from '../fx/Marks.js';
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
import { Blooms, BLOOM_RADIUS } from '../defense/Blooms.js';
import { Projectiles } from '../combat/Projectiles.js';
import { PERKS, baseMods, offerPerks, thresholds } from './Perks.js';
import { Journal } from './Journal.js';
import { writeSave, clearSave, recordBest, addRecords } from './Save.js';
import { difficulty } from './Difficulty.js';
import { MEMORIES, unlocked } from './Memories.js';

// Yield so the loading bar can paint; falls back to a timeout because
// requestAnimationFrame is paused in background tabs.
const nextFrame = () => new Promise((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
const REACH = 2.7;
// what the machete bites into (and leaves a gash in) rather than rings off
const WOODY = new Set(['bigTree', 'smallTree', 'midTree', 'palm', 'treeFern', 'log', 'stump', 'branch']);
const MACHETE_DMG = 28;
const RESPAWN = 5;
const FOV = 72;
const STARTER = [['bow_tower', 1], ['spike_trap', 2], ['poultice', 2]];
// the title's light: late afternoon, the sun low and gold through the crowns
const TITLE_TIME = 0.728;
const TITLE_SHOT = 19;
const ease = (t) => 1 - (1 - t) ** 3;
const _white = new THREE.Color();

export class Game {
  constructor(canvas, { debug = false, time = null } = {}) {
    this.debug = debug;
    // no canvas MSAA: the scene is drawn into multisampled targets by PostFX
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // the sun crawls and the shadow box is snapped to texels: every other frame is plenty
    this.renderer.shadowMap.autoUpdate = false;
    this.frameNo = 0;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
    this.input = new Input(canvas);
    // per-pixel sky occlusion under the tree crowns (must hook the shaders before any compile)
    this.canopy = new CanopyMap();
    installCanopy(this.canopy.texture);
    this.audio = new AudioSys();
    this.inventory = new Inventory();
    this.hud = new HUD(this.inventory);
    this.journal = new Journal(this.hud);
    this.running = false;
    this.paused = true;
    this.modal = null; // 'perks' | 'victory' | 'over' while an overlay owns the mouse
    this.startTime = time;
    this.cover = 0;
    this._ahead = new THREE.Vector3();
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
    this.stats = { built: 0, upgraded: 0, bosses: 0, blooms: 0 };
    this.difficulty = 'warden';
    this.fadeEl = document.getElementById('title-fade'); // black, for the title's cuts and the fly-in
    this.bloom = true;
    this.rand = Math.random;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // High / Medium / Low: the costly parts a slower machine can do without
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * (q === 'low' ? 0.75 : 1));
    this.resize();
    this.post.enabled.ao = q !== 'low';
    this.post.enabled.vol = q === 'high';
    globalUniforms.uPom.value = q === 'low' ? 0 : 1;
    // billboard light shafts only where the ray-marched ones are off
    this.ambient.shaftScale = q === 'high' ? 0 : 1;
    for (const m of [...this.litter.meshes, ...this.groundCover.meshes, ...this.grass.meshes]) m.visible = q !== 'low';
    const sh = this.sky.sun.shadow, size = q === 'low' ? 1024 : 2048;
    // soft contact-hardening shadows above Low (see installSoftShadows); Low keeps plain PCF
    sh.radius = q === 'low' ? 1 : 2.5;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) {
      const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.post.setSize(s.x, s.y);
    }
  }

  async init(progress) {
    progress(0.03, 'Carving the Heartwood…');
    let loaded = 0;
    await loadModels(() => progress(0.03 + (++loaded / MODEL_NAMES.length) * 0.12, 'Carving the Heartwood…'));
    progress(0.15, 'Gathering leaves…');
    const lib = await new TextureLib(this.renderer).load((p) => progress(0.15 + p * 0.15, 'Gathering leaves…'));
    setDetailTextures(lib);
    progress(0.3, 'Growing the plants…');
    await nextFrame();
    this.flora = new Flora(lib);
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
    this.litter = new Litter(this.scene, this.world, lib);
    this.litter.update(this.player.pos.x, this.player.pos.z);
    this.groundCover = new Cover(this.scene, this.world);
    this.groundCover.update(this.player.pos.x, this.player.pos.z);
    this.grass = new Grass(this.scene, this.world);
    this.grass.update(this.player.pos.x, this.player.pos.z);

    progress(0.62, 'Mapping the Blight’s paths…');
    await nextFrame();
    this.field = new FlowField(this.world, this.base.x, this.base.z, GOAL_RADIUS);
    this.field.rebuild([]);
    this.rifts = pickRifts(this.field, this.base.x, this.base.z, 5, Math.round(sp.x + sp.z)).map((r) => new Rift(this.scene, r.x, r.z, r.night));
    this.enemies = new Enemies(this.scene);
    this.buildings = new Buildings(this.scene, this.world);
    this.ghost = new BuildGhost(this.scene);
    this.lights = new LightPool(this.scene, 6);
    this.weather = new Weather(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.blooms = new Blooms(this.scene);
    this.hud.markers = [
      { key: 'heartwood', x: this.base.x, z: this.base.z, icon: '❦', label: 'Heartwood', cls: 'base' },
    ];
    this.showRifts(1);
    this.heartMarker = this.hud.markers[0];
    this.waves = new Waves({ sky: this.sky, enemies: this.enemies, rifts: this.rifts, hud: this.hud, audio: this.audio, world: this.world, base: this.base });
    this.waves.onDay = () => {
      this.weather.target = 0;
      this.sproutBlooms();
      this.autosave();
    };
    this.waves.onNight = (n) => {
      this.showRifts(n);
      this.hatchBlooms();
      this.journal.event('night');
      this.bloomUsed = false;
      this.rootT = 6;
    };
    this.waves.onDawn = (_held, won) => {
      this.weather.target = 0;
      this.bankRecords({ nights: 1, wins: won ? 1 : 0 });
      if (this.mods.harvest) this.harvestDawn();
      if (this.mods.dawnMend) for (const b of this.buildings.list) b.hp = b.maxHp;
      if (won) this.onVictory();
    };
    this.waves.onOver = () => this.onDefeat();

    progress(0.75, 'Scattering secrets…');
    await nextFrame();
    this.machete = new Machete(this.camera.fov);
    this.machete.onHit = (combo) => this.onSwingHit(combo);
    this.machete.onUse = () => this.finishUse();
    this.particles = new Particles(this.scene, this.flora.lib);
    this.marks = new Marks(this.scene);
    this.uniforms = globalUniforms; // (for e2e probes)
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

    // HDR pipeline: AO, sun shafts, bloom (emissives glow without clipping), then the grade
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.sky);
    this.post.water = this.water;
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
    // every point-of-interest kit and every plant, buried under the player where the shadow
    // camera still sees them: their programs (and shadow-depth variants) compile now, not the
    // first time a temple or wreck streams in
    const warmGroups = [];
    const gy = terrainHeight(this.player.pos.x, this.player.pos.z) - 25;
    for (const type of Object.keys(POI_INFO)) {
      const res = buildPOI({ type, key: `warm:${type}`, x: this.player.pos.x, z: this.player.pos.z, y: gy, rot: 0, seed: 7, radius: POI_INFO[type].radius }, this.flora);
      this.scene.add(res.group);
      warmGroups.push(res.group);
    }
    warmGroups.push(this.world.warmFlora(this.player.pos.x, gy, this.player.pos.z));
    const warmBloom = this.blooms.add(this.player.pos.x + 3, this.player.pos.z);
    warmBloom.group.position.y = gy;
    // compile for the target play renders into: PostFX's linear half-float scene buffer. Bound
    // to the canvas (sRGB, tone mapped) every program came out a different variant and was
    // compiled again mid-game, a 0.5-1.5 s freeze the first time each kit streamed in
    this.renderer.setRenderTarget(this.post.sceneRT);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setRenderTarget(this.post.sceneRT);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    for (const g of warmGroups) this.scene.remove(g);
    this.blooms.clear();
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

  // ------------------------------------------------------------- title

  // Behind the title menu the camera drifts through a few slow shots of the clearing at
  // golden hour. The player isn't there yet: the clock is held and nothing hunts.
  startTitle() {
    this.title = { t: 0, shot: 0, shotT: 0, fade: 1, fly: null };
    this.sky.time = TITLE_TIME;
    this.sky.timeScale = 0.15;
  }

  // shot k at local time u (seconds): where the eye is and what it looks at
  titleShot(k, u, eye, at) {
    const b = this.base, h = b.heartPos;
    const ang = (a, r, y) => eye.set(b.x + Math.sin(a) * r, 0, b.z + Math.cos(a) * r).setY(terrainHeight(eye.x, eye.z) + y);
    if (k === 0) {
      // low and slow round the Heartwood, through the grass
      const a = 2.0 + u * 0.022;
      ang(a, 17 - u * 0.06, 1.5 + u * 0.02);
      at.copy(h).add(new THREE.Vector3(0, -0.6, 0));
    } else if (k === 1) {
      // a crane up out of the undergrowth at the clearing's edge
      const a = -0.6 + u * 0.01;
      ang(a, 24 - u * 0.2, 1.0 + u * 0.28);
      at.copy(h).add(new THREE.Vector3(0, -1.2 + u * 0.05, 0));
    } else {
      // from inside the treeline, pushing in toward the light of the clearing
      const a = 3.4 - u * 0.012;
      ang(a, 29 - u * 0.3, 1.8 + u * 0.03);
      at.copy(h).add(new THREE.Vector3(0, 1.5, 0));
    }
    // frame the subject right of centre: the menu sits on the left
    const side = new THREE.Vector3().subVectors(at, eye).cross(new THREE.Vector3(0, 1, 0)).setY(0).normalize();
    at.addScaledVector(side, -eye.distanceTo(at) * 0.26);
  }

  updateTitle(dt) {
    const T = this.title;
    T.t += dt;
    const eye = this._tEye ??= new THREE.Vector3(), at = this._tAt ??= new THREE.Vector3();
    const cam = this.camera;
    if (T.fly) {
      // the eye glides from the shot down into the player's head
      const f = T.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = (f.k = f.t * f.t * (3 - 2 * f.t));
      // dip to black at the end, where the clock jumps to the morning
      this.setFade(smoothstep(0.62, 1, f.t));
      this.player.update(0, this.input, null);
      eye.copy(f.eye).lerp(cam.position, k);
      const q = f.quat.clone().slerp(cam.quaternion, k);
      cam.position.copy(eye);
      cam.quaternion.copy(q);
      if (f.t >= 1) {
        this.title = null;
        this.sky.time = f.wake;
        this.sky.timeScale = 1;
        this.renderer.shadowMap.needsUpdate = true;
        // hold the black a beat while the morning bakes, then open the eyes
        setTimeout(() => this.setFade(0, 1.4), 120);
        f.done?.();
      }
      return;
    }
    T.shotT += dt;
    if (T.shotT > TITLE_SHOT) {
      T.shotT = 0;
      T.shot = (T.shot + 1) % 3;
    }
    // a slow fade through black at each cut
    T.fade = Math.min(1, T.shotT / 1.6, (TITLE_SHOT - T.shotT) / 1.2, T.t / 3.5);
    this.setFade(1 - T.fade);
    this.titleShot(T.shot, T.shotT, eye, at);
    // the world streams in around the eye, not the empty spawn
    this.player.pos.set(eye.x, terrainHeight(eye.x, eye.z), eye.z);
    // a breath of handheld drift
    eye.x += Math.sin(T.t * 0.31) * 0.08;
    eye.y += Math.sin(T.t * 0.23 + 1) * 0.06;
    cam.position.copy(eye);
    cam.lookAt(at);
    cam.rotation.z += Math.sin(T.t * 0.17) * 0.006;
  }

  // Leave the title: the camera flies to the player's eye, then `done` runs.
  flyIn(done, dur = 1.8) {
    if (!this.title) return done?.();
    this.respawn();
    const wake = this.title.wake ?? this.startTime ?? 0.29;
    this.title.fly = { t: 0, dur, eye: this.camera.position.clone(), quat: this.camera.quaternion.clone(), done, wake };
  }

  setFade(v, secs = 0) {
    const el = this.fadeEl;
    if (!el) return;
    el.style.transition = secs ? `opacity ${secs}s ease-out` : 'none';
    el.style.opacity = String(v);
  }

  // A new run on the chosen difficulty: the Heartwood's HP, the Blight and the starting kit.
  setDifficulty(id) {
    const d = difficulty(id);
    this.difficulty = id;
    this.waves.setDifficulty(d);
    this.base.maxHp = this.base.hp = Math.round(500 * d.heart);
    const inv = this.inventory;
    inv.slots.fill(null);
    for (const [item, n] of d.starter) inv.add(item, n);
    // what the Memories of the Heartwood add to every vigil
    const mem = unlocked();
    for (const m of MEMORIES) if (mem.has(m.id)) for (const [item, n] of m.kit || []) inv.add(item, n);
    inv.select(inv.slots.findIndex((s, i) => !s && i < HOTBAR));
    inv.changed();
  }

  // Bank what this run has done since the last time into the lifetime records.
  bankRecords(extra = {}) {
    if (this.debug) return;
    const now = { kills: this.enemies.kills, bosses: this.stats.bosses, blooms: this.stats.blooms, built: this.buildings.stats.built };
    const last = this.banked ?? now;
    const delta = { ...extra };
    for (const k in now) delta[k] = Math.max(0, now[k] - last[k]);
    this.banked = now;
    const had = unlocked();
    const r = addRecords(delta, Object.keys(this.enemies.killsByType), { deepest: this.waves.night - 1 });
    // a Memory earned: say so once the dawn (or the defeat) has had its moment
    const fresh = MEMORIES.filter((m) => !had.has(m.id) && unlocked(r).has(m.id));
    fresh.forEach((m, i) => setTimeout(() => {
      this.hud.message(`Memory of the Heartwood: ${m.name}. ${m.reward}`, '#ffe08a');
      this.audio.boon();
    }, 4500 + i * 3500));
  }

  // A fresh run starts with the day-one banner; a loaded one with its own.
  begin() {
    if (this.begun) return;
    this.begun = true;
    // records count from here (a loaded run banked its past already)
    this.banked = { kills: this.enemies.kills, bosses: this.stats.bosses, blooms: this.stats.blooms, built: this.buildings.stats.built };
    if (!this.loaded && !this.debug) addRecords({ runs: 1 });
    const w = this.waves;
    if (this.loaded) this.hud.banner(`Day ${w.night}`, 'The Heartwood remembers you.');
    else this.hud.banner('Day 1', 'Gather from the forest, craft defences, guard the Heartwood.');
    if (w.phase === 'day') setTimeout(() => { if (!this.blooms.list.length && this.waves.phase === 'day') this.sproutBlooms(); }, 2500);
  }

  // Put the player beside the Heartwood, facing it.
  respawn() {
    const a = 2.2;
    const x = this.base.x + Math.sin(a) * 16, z = this.base.z + Math.cos(a) * 16;
    this.player.spawn(x, z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = Math.atan2(-(this.base.x - x), -(this.base.z - z));
    this.player.pitch = 0.05;
    this.player.hp = this.player.maxHp;
  }

  // map markers for every rift that has opened by night n (the late ones appear when they tear)
  showRifts(n) {
    this.rifts.forEach((r, i) => {
      const key = `rift${i}`;
      if (r.night <= n && !this.hud.markers.some((m) => m.key === key)) {
        this.hud.markers.push({ key, x: r.x, z: r.z, icon: '✶', label: 'Rift', cls: 'rift' });
      }
    });
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
    this.difficulty = d.difficulty || 'warden';
    this.waves.setDifficulty(difficulty(this.difficulty));
    this.player.maxHp = d.player?.maxHp || 100;
    this.player.hp = this.player.maxHp;
    this.waves.setNight(d.night);
    this.showRifts(d.night);
    this.waves.won = !!d.won;
    if (this.waves.won) this.base.bloom(this.flora, true);
    // on the title the clock is the cinematic's until the fly-in lands
    if (this.title) this.title.wake = DAWN + 0.004;
    else this.sky.time = DAWN + 0.004;
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
    // every plant the blade sweeps through whips along with it (forehand right to left)
    const side = combo ? 1 : -1;
    globalUniforms.uSwing.value.set(p.x + fwd.x * 1.2, p.z + fwd.y * 1.2, 0, REACH + 0.6);
    globalUniforms.uSwingDir.value.set(-fwd.y * side, fwd.x * side);
    const lookDown = this.player.pitch;
    let cut = 0;

    // Blight first: the machete bites up to three in the arc. Three clicked hits in a row make a
    // finisher: a heavy, staggering crit.
    const now = this.timer.getElapsed();
    this.chain = this.swingTapped && now - this.lastStrike < 1.1 ? this.chain + 1 : 1;
    let struck = 0;
    const foes = this.enemies.list
      .filter((e) => !e.dying && !e.dig && e.rise < 0.6)
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
    // a Blight Bloom in the arc
    const bloom = this.blooms.near(p.x, p.z, REACH);
    if (bloom) {
      const dx = bloom.x - p.x, dz = bloom.z - p.z, l = Math.hypot(dx, dz) || 1;
      if (l < BLOOM_RADIUS + 0.6 || (dx * fwd.x + dz * fwd.y) / l > 0.3) {
        const crit = !!finisher || (this.chain >= 3 && !foes.length);
        const at = new THREE.Vector3(bloom.x - (dx / l) * BLOOM_RADIUS * 0.7, Math.min(bloom.cy, this.camera.position.y - 0.4), bloom.z - (dz / l) * BLOOM_RADIUS * 0.7);
        this.hitBloom(bloom, MACHETE_DMG * this.mods.macheteDmg * (crit ? 1.8 : 1) * (combo ? 1.1 : 1), at, crit);
        this.hud.hitmarker(bloom.dead, crit);
        struck++;
        if (crit) this.chain = 0;
      }
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
    let heavy = false;
    for (const [, c] of hits.slice(0, 7)) {
      this.world.cutPlant(c, { x: c.x - p.x, z: c.z - p.z });
      if (c.r >= 1) heavy = true;
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

    // a thick stem bites back a little
    if (heavy) {
      this.machete.bite(0.5);
      this.hitStop = Math.max(this.hitStop, 0.03);
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
      best.maxHp ??= best.hp;
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
    let solid = false;
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
        const hit = this.bladeContact(c, probe);
        const at = hit.point, out = hit.normal;
        // the way the blade travels across the surface: forehand right to left
        const side = combo ? 1 : -1;
        const sweep = new THREE.Vector3(-fwd.y * side, combo ? -0.35 : -0.5, fwd.x * side);
        const woody = WOODY.has(c.kind);
        if (c.building) {
          this.audio.wood();
          this.particles.chipBurst(at, 0x8a6a40, 6, p.y, out);
          this.machete.bite(0.7, 'wood');
        } else if (woody) {
          if (c.top === Infinity) this.harvestTrunk(c, at, out);
          else {
            this.audio.wood();
            this.particles.chipBurst(at, 0x7a6248, 10, p.y, out);
          }
          this.marks.add('wood', at, out, sweep, c.kind === 'palm' || c.kind === 'treeFern' ? 0.28 : 0.4);
          this.machete.bite(1, 'wood');
        } else if (c.kind === 'rock' || c.kind === 'cliffRock') {
          this.harvestRock(c, at, out);
          this.marks.add('stone', at, out, sweep, 0.34);
          this.machete.bite(1, 'stone');
        } else {
          this.particles.sparks(at, 0xfff0c0, 12, out);
          this.particles.chipBurst(at, 0x8a877b, 5, p.y, out);
          this.marks.add('stone', at, out, sweep, 0.3);
          this.audio.clank();
          this.machete.bite(1, 'stone');
        }
        this.player.shake = woody ? 0.45 : 0.6;
        solid = true;
        break;
      }
    }

    // Looking down with nothing else in reach: the blade bites into the forest floor and
    // kicks up leaves and dirt
    if (!cut && !broke && !struck && !solid && lookDown < -0.35) {
      const eye = this.camera.position;
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      for (let t = 0.4; t < REACH + 0.6; t += 0.08) {
        const x = eye.x + d.x * t, y = eye.y + d.y * t, z = eye.z + d.z * t;
        const gy = terrainHeight(x, z);
        if (y > gy) continue;
        const at = new THREE.Vector3(x, gy + 0.03, z);
        if (gy < WATER_LEVEL) {
          this.particles.sparkle(at, 0xcfe8ff, 10);
          this.audio.chop();
        } else {
          this.particles.leafBurst(at, 0x6b4a2c, 9, gy);
          this.particles.dust(at, 8, 0.25, 0x5a4630);
          this.particles.chipBurst(at, 0x3a2a1c, 5, gy, new THREE.Vector3(0, 1, 0));
          this.audio.thud();
          this.machete.bite(0.6, 'wood');
        }
        this.player.shake = Math.max(this.player.shake, 0.3);
        break;
      }
    }
  }

  // Where the blade meets a collider's model: a ray from the eye to the struck point on the
  // real mesh (trunks lean and flare, rocks are lumpy), with the surface's outward normal.
  // Falls back to the collider's own shape when there's no mesh or the ray misses.
  bladeContact(c, probe) {
    const eye = this.camera.position;
    const out = { point: probe.clone(), normal: new THREE.Vector3() };
    if (c.type === 'circle') {
      const dx = eye.x - c.x, dz = eye.z - c.z, l = Math.hypot(dx, dz) || 1;
      out.normal.set(dx / l, 0, dz / l);
      out.point.set(c.x + (dx / l) * c.r, probe.y, c.z + (dz / l) * c.r);
    } else {
      const f = this.forwardXZ();
      out.normal.set(-f.x, 0, -f.y);
    }
    if (!c.mesh) return out;
    const m = this._hitMesh ||= new THREE.Mesh();
    m.geometry = c.mesh.geometry;
    m.material = c.mesh.material;
    c.mesh.getMatrixAt(c.instance, m.matrixWorld);
    m.matrixWorld.premultiply(c.mesh.matrixWorld);
    const rc = this._hitRay ||= new THREE.Raycaster();
    rc.far = REACH + 1.5;
    const dirs = [
      new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion),
      out.point.clone().sub(eye).normalize(),
    ];
    for (const d of dirs) {
      rc.set(eye, d);
      const hits = rc.intersectObject(m, false);
      const h = hits.find((x) => x.face);
      if (!h) continue;
      out.point.copy(h.point);
      out.normal.copy(h.face.normal).transformDirection(m.matrixWorld);
      if (out.normal.dot(d) > 0) out.normal.negate();
      break;
    }
    return out;
  }

  // Hacking at a tree: bark, resin, vines; every third good blow frees a log.
  harvestTrunk(c, at, out) {
    this.audio.wood();
    this.particles.chipBurst(at, 0x8a6a40, 14, this.player.pos.y, out);
    this.particles.chipBurst(at, 0xd8bf8c, 8, this.player.pos.y, out); // fresh pale wood
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

  harvestRock(c, at, out) {
    this.audio.stone();
    this.particles.sparks(at, 0xfff0c0, 12, out);
    this.particles.chipBurst(at, 0x8a877b, 8, this.player.pos.y, out);
    this.particles.dust(at, 6, 0.15, 0xb0aa98);
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
      // at night the Heartwood only asks for attention when you carry something to offer
      if (it.kind === 'base' && this.waves.phase === 'night' && !this.inventory.relicValue) continue;
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

  // ------------------------------------------------------------- Blight Blooms

  // Dawn: the day's blooms push up out in the forest, each with its guards.
  sproutBlooms() {
    const n = this.waves.night;
    this.hud.markers = this.hud.markers.filter((m) => !m.key.startsWith('bloom'));
    // never through a trunk or a boulder
    // never through a trunk or a boulder, and only where the Blight can walk to the Heart from
    const blocked = (x, z) => {
      const k = this.field.idx(x, z);
      if (k < 0 || !Number.isFinite(this.field.dist[k])) return true;
      return this.world.staticCircles(x - 4, z - 4, x + 4, z + 4).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 2.6);
    };
    const list = this.blooms.sprout(n, this.base, this.rand, blocked);
    const guards = Blooms.guardsFor(n);
    list.forEach((b, i) => {
      for (let k = 0; k < guards; k++) {
        const a = (k / guards) * Math.PI * 2 + this.rand();
        const e = this.enemies.spawn('blightling', b.x + Math.cos(a) * 3, b.z + Math.sin(a) * 3, this.waves.hpScale * 0.85);
        e.guard = { x: b.x, z: b.z, r: 6, leash: 24 };
        b.guards.push(e);
      }
      this.world.clearAround(b.x, b.z, 3.2);
      b.key = `bloom${i}`;
      this.hud.markers.push({ key: b.key, x: b.x, z: b.z, icon: '✺', label: 'Blight Bloom', cls: 'rift' });
    });
    if (list.length) {
      this.hud.message(`${list.length} Blight Bloom${list.length > 1 ? 's have' : ' has'} sprouted ✺ Cut ${list.length > 1 ? 'them' : 'it'} down before dusk, or the Blight comes through ${list.length > 1 ? 'them' : 'it'} tonight`, '#d9a0ff');
      this.audio.windup?.(0.4);
    }
  }

  // Dusk: every bloom still standing opens. All night it is one more mouth the wave pours out
  // of (a lane onto the Heart from where it stands) and its guards march with the rest. Cut it
  // down in the dark and the lane closes.
  hatchBlooms() {
    const live = this.blooms.alive;
    for (const e of this.enemies.list) e.guard = null;
    for (const b of live) {
      b.lane = true;
      this.waves.open = [...(this.waves.open || []), { x: b.x, z: b.z, bloom: b }];
      const at = new THREE.Vector3(b.x, b.cy, b.z);
      this.particles.sporeBurst(at, 0xb050ff, 50, 1.6);
      this.particles.ring(new THREE.Vector3(b.x, b.y + 0.1, b.z), 6, 0xb050ff, 0.8);
      const m = this.hud.markers.find((q) => q.key === b.key);
      if (m) m.label = 'Bloom lane';
    }
    if (live.length) setTimeout(() => this.hud.message(`${live.length} Blight Bloom${live.length > 1 ? 's' : ''} opened: the Blight is coming through ${live.length > 1 ? 'them' : 'it'} too ✺`, '#d9a0ff'), 3500);
  }

  hitBloom(b, dmg, at, crit = false) {
    const killed = this.blooms.damage(b, dmg);
    this.particles.chipBurst(at.clone(), 0x7a3a9a, crit ? 16 : 10, b.y);
    this.particles.sporeBurst(at.clone(), 0xb050ff, 8, 0.6);
    this.hud.damageNumber(at.clone().add(new THREE.Vector3(0, 0.5, 0)), Math.round(dmg), crit ? 'crit' : '');
    this.audio.enemyHit();
    if (killed) this.onBloomCleansed(b);
    return killed;
  }

  onBloomCleansed(b) {
    const at = new THREE.Vector3(b.x, b.cy, b.z);
    this.particles.sporeBurst(at, 0xc070ff, 60, 1.8);
    this.particles.sparkle(at, 0x9affb0, 30);
    this.particles.ring(new THREE.Vector3(b.x, b.y + 0.1, b.z), 6, 0x9affb0, 0.9);
    this.lights.flash(at, 0xc080ff, 90, 0.5, 24);
    this.player.shake = Math.max(this.player.shake, 0.7);
    this.audio.enemyDie(true);
    this.audio.boon?.();
    this.loot('bloom', at, 1.2, true);
    this.stats.blooms++;
    this.journal.event('bloom');
    this.hud.markers = this.hud.markers.filter((m) => m.key !== b.key);
    // its guards wither with it; an open lane closes
    for (const e of b.guards) if (!e.dying && e.guard) this.enemies.damage(e, 1e6, this.combatCtx, null, { source: 'tower' });
    if (b.lane) {
      this.waves.open = (this.waves.open || []).filter((o) => o.bloom !== b);
      if (!this.waves.open.length) this.waves.open = this.rifts.filter((r) => r.night <= this.waves.night);
      this.hud.message('A bloom lane closes', '#9affb0');
    }
    const favour = 10 + 2 * this.waves.night;
    this.favour += favour;
    const left = this.blooms.alive.length;
    this.hud.banner('Bloom cleansed', `+${favour} favour with the Heartwood${left ? ` · ${left} still growing` : ' · the forest is clean'}`, 'win');
    while (this.favour >= thresholds(this.boonsTaken + this.pendingBoons)) this.pendingBoons++;
    if (this.pendingBoons) setTimeout(() => { if (!this.modal) this.offerBoon(); }, 1200);
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
      // (an E held to rake up forage never also calls the night or packs a tower)
      if (input.down(key) && !(this.gathering && key === 'KeyE')) {
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
    // keep holding E after a pick-up and you rake up everything loose around you
    if (this.gathering) {
      if (!input.down('KeyE') || !this.playerAlive) this.gathering = false;
      else {
        this.gatherT += dt;
        if (this.gatherT > 0.35) {
          this.gatherTick = (this.gatherTick || 0) - dt;
          if (this.gatherTick <= 0) {
            this.gatherTick = 0.07;
            const near = this.nearestForage(3);
            if (near) this.takeForage(near);
          }
        }
      }
    }
    if (it?.kind !== 'forage') this.highlightForage(null);
    if (!it) {
      this.search = null;
      const b = this.blooms.near(this.player.pos.x, this.player.pos.z, REACH + 1.5);
      if (b) this.hud.prompt('Blight Bloom', 1 - b.hp / b.maxHp, 'LMB', 'Cut it down before dusk');
      else this.hud.prompt(null);
      return;
    }
    if (it.kind === 'forage') {
      this.hud.prompt(it.label, 0, 'E', 'Hold to gather everything nearby');
      this.highlightForage(it);
      if (input.hit('KeyE')) {
        this.takeForage(it);
        this.gathering = true;
        this.gatherT = 0;
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
      // smashed with the machete, not a key: the ring fills with each blow
      it.maxHp ??= it.hp;
      const left = Math.max(0, it.hp);
      this.hud.prompt(it.label, 1 - left / it.maxHp, 'LMB', `Swing to smash · ${left} blow${left === 1 ? '' : 's'}`);
    } else if (it.kind === 'base') {
      this.interactBase(holdAction);
    } else if (it.kind === 'building') {
      this.interactBuilding(it.building, holdAction, input);
    }
  }

  // the item the prompt means lights up, with a glint now and then, so you can find it among
  // the leaves
  highlightForage(it) {
    const prev = this.hiForage;
    if (prev !== it) {
      if (prev && !prev.done) {
        prev.mesh.setColorAt(prev.instance, _white.setRGB(1, 1, 1));
        prev.mesh.instanceColor.needsUpdate = true;
      }
      this.hiForage = it;
      this.glintT = 0;
      if (it) {
        it.mesh.setColorAt(it.instance, _white.setRGB(1.8, 1.75, 1.5));
        it.mesh.instanceColor.needsUpdate = true;
      }
    }
    if (it && (this.glintT = (this.glintT ?? 0) - 0.016) <= 0) {
      this.glintT = 0.7;
      this.particles.sparkle(new THREE.Vector3(it.x, it.y + 0.05, it.z), 0xfff4d0, 3);
    }
  }

  takeForage(it) {
    if (!this.inventory.fits(it.id, 1)) {
      this.hud.message('Satchel full', '#ff9a7a');
      this.gathering = false;
      return false;
    }
    this.world.takeForage(it);
    this.collect(it.id);
    this.journal.event('forage');
    this.particles.sparkle(new THREE.Vector3(it.x, it.y, it.z), RARITY[ITEMS[it.id].rarity].color, 8);
    return true;
  }

  nearestForage(r) {
    const p = this.player.pos;
    let best = null, bd = r;
    for (const it of this.world.near(p.x, p.z, 'interactables')) {
      if (it.done || it.kind !== 'forage' || Math.abs(it.y - p.y) > 1.6) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
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
    const mem = unlocked();
    const options = offerPerks(this.perks, Math.random, mem.has('fourth') ? 4 : 3, mem);
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
    // Rotting Bloom: a slowed Blight bursts into spores that slow its neighbours
    if (this.mods.sporeBurst && e.slowT > 0 && e.slow < 1) {
      for (const o of this.enemies.inRadius(e.pos.x, e.pos.z, 4, { ground: true })) this.enemies.slowDown(o, 0.5, 3);
      this.particles.sporeBurst(at, 0xa0e040, 30, 1.2);
      this.particles.ring(e.pos.clone(), 4, 0x9ae040, 0.5);
    }
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

  // Harvest Dawn: each tower brings in two building materials
  harvestDawn() {
    const POOL = ['stick', 'stick', 'stone', 'fiber', 'vine', 'bark', 'resin', 'thorns', 'flint'];
    let n = 0;
    for (const b of this.buildings.list) {
      if (['wall', 'trap', 'snare'].includes(b.def.kind)) continue;
      for (let k = 0; k < 2; k++) this.collect(POOL[Math.floor(this.rand() * POOL.length)], 1, true);
      this.particles.sparkle(new THREE.Vector3(b.x, b.y + 2, b.z), 0xffe08a, 6);
      n++;
    }
    if (n) this.hud.message(`Harvest Dawn: your ${n} tower${n > 1 ? 's' : ''} brought in supplies`, '#ffe08a');
  }

  // Grasping Roots: at night the Heartwood seizes the Blight closest to it
  rootPulse(dt) {
    if (!this.mods.rootPulse || this.waves.phase !== 'night') return;
    this.rootT = (this.rootT ?? 6) - dt;
    if (this.rootT > 0) return;
    this.rootT = 12;
    const b = this.base;
    const near = this.enemies.inRadius(b.x, b.z, 18, { ground: true })
      .sort((p, q) => Math.hypot(p.pos.x - b.x, p.pos.z - b.z) - Math.hypot(q.pos.x - b.x, q.pos.z - b.z))
      .slice(0, 4);
    for (const e of near) {
      this.enemies.root(e, 2.5);
      this.enemies.damage(e, 10, this.combatCtx, null, { source: 'tower', stagger: 0.3 });
      this.particles.chipBurst(e.pos.clone().setY(e.pos.y + 0.3), 0x5a4026, 18, e.pos.y);
      this.particles.ring(e.pos.clone(), 1.4, 0x9ad060, 0.5);
    }
    if (near.length) this.audio.snare?.();
  }

  hitBase(dmg, e) {
    this.base.damage(dmg);
    if (this.mods.heartBurn && e && !e.dying) this.enemies.ignite(e, 8, 3);
    // Last Bloom: once a night the failing Heartwood bursts and throws the Blight back
    if (this.mods.lastBloom && !this.bloomUsed && this.base.hp > 0 && this.base.hp < this.base.maxHp * 0.3) {
      this.bloomUsed = true;
      const b = this.base;
      b.heal(b.maxHp * 0.25);
      for (const o of this.enemies.inRadius(b.x, b.z, 12)) {
        const knock = new THREE.Vector3(o.pos.x - b.x, 0, o.pos.z - b.z).normalize().multiplyScalar(9);
        this.enemies.damage(o, 60, this.combatCtx, knock, { source: 'tower', stagger: 0.8 });
      }
      this.particles.ring(new THREE.Vector3(b.x, b.y + 0.5, b.z), 12, 0x9affc0, 1.0);
      this.particles.sporeBurst(b.heartPos, 0xc8ffd8, 80, 2.2);
      this.lights.flash(b.heartPos, 0xa0ffc8, 160, 0.7, 40);
      this.player.shake = Math.max(this.player.shake, 0.6);
      this.hud.message('Last Bloom: the Heartwood bursts!', '#9affc0');
    }
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

  // 1 beside the player, 0 at 40 m: how loud something out in the clearing sounds
  near(p) {
    return Math.max(0, 1 - Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) / 40);
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
    this.bankRecords();
    clearSave();
  }

  onVictory() {
    this.base.bloom(this.flora);
    this.lights.flash(this.base.heartPos, 0xffe8a0, 200, 1.2, 50);
    this.particles.sporeBurst(this.base.heartPos, 0xfff0c8, 120, 3);
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
    {
      // plants lean away from the player moving through them; the last swing's whip ages
      const pp = this.player.pos, pv = this.player.vel;
      globalUniforms.uPush.value.set(pp.x, pp.z, 0.95, Math.min(1, Math.hypot(pv.x, pv.z) / 3.5));
      globalUniforms.uSwing.value.z = Math.min(99, globalUniforms.uSwing.value.z + realDt);
    }
    const input = this.input;
    const over = this.waves.phase === 'over';
    const paused = this.paused || !!this.modal;
    const active = !paused && !this.hud.inventoryOpen && !over && !this.title;

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
    } else if (this.title) {
      this.updateTitle(realDt);
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
    // (and opens a little at a sprint)
    const fov = this.title ? 50 + (FOV - 50) * (this.title.fly?.k ?? 0) : FOV - this.aimK * 4 - this.draw * 6 + (this.player.runK || 0) * 5;
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
    if (input.hit('KeyM')) this.audio.toggleMute();

    const pos = this.player.pos;
    this.world.update(pos.x, pos.z, dt);
    this.litter.update(pos.x, pos.z);
    this.groundCover.update(pos.x, pos.z);
    // blades clear out from under anything built since
    const bl = this.buildings.list, bloomsUp = this.blooms.alive;
    const sig = bl.reduce((a, b) => a + b.x * 1.7 + b.z, bl.length) + bloomsUp.reduce((a, b) => a + b.x * 3.1 + b.z * 0.7, 0);
    if (sig !== this.grassSig) {
      this.grassSig = sig;
      this.grass.setBlockers([...bl.flatMap((b) => b.footprint), ...bloomsUp.map((b) => ({ x: b.x, z: b.z, r: 2.4 }))]);
    }
    this.grass.update(pos.x, pos.z);
    this.canopy.update(this.world, this.flora, pos.x, pos.z, this.renderer);
    this.water.update(pos, this.world);

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
        onSpit: (e) => this.audio.spit(this.near(e.pos)),
        onGlobLand: (at) => this.audio.splat(this.near(at)),
        onDig: (e, phase) => this.audio.burrow(this.near(e.pos), phase),
      });
      if (this.playerAlive) this.shovePlayer();
      this.rootPulse(dt);
      this.buildings.update(dt, t, ctx);
      this.projectiles.update(dt, {
        ...ctx,
        blooms: this.blooms,
        onBloomHit: (b, dmg, at, crit) => {
          this.hitBloom(b, dmg, at, crit);
          this.hud.hitmarker(b.dead, crit);
        },
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
    this.base.update(dt, t, this.sky.state.night, this.particles);
    this.blooms.update(dt, t);
    for (const b of this.blooms.list) {
      if (!b.dead && Math.random() < dt * (b.lane ? 10 : 4) && Math.hypot(b.x - pos.x, b.z - pos.z) < 70) {
        this.particles.ash(new THREE.Vector3(b.x, b.cy + 0.6, b.z), 1, 0.8, 0xc070ff);
      }
    }
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
    // and the crowns overhead in general darken the haze (deep green under the forest, bright in gaps)
    this.haze = damp(this.haze ?? 0, this.canopy.coverAround(pos.x, pos.z, 10), 0.8, dt);
    this.camera.getWorldDirection(this._ahead).setY(0).normalize();
    this.sky.update(dt, pos, false, Math.max(this.cover, this.haze), this._ahead);
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
      color: sun.color, intensity: sun.intensity * (1 - this.cover * 0.65) * (1 - 0.85 * (this.shade ?? 0)),
      hemiSky: this.sky.hemi.color, hemiGround: this.sky.hemi.groundColor, hemiIntensity: this.sky.hemi.intensity * (1 - 0.72 * (this.shade ?? 0)),
      env: this.scene.environment, envIntensity: this.scene.environmentIntensity * (1 - 0.72 * (this.shade ?? 0)),
    }, { draw: this.draw, aim: this.aimK, loaded: this.inventory.count('stone') + this.inventory.count('scrap_shot') > 0 });

    this.hud.frame(realDt, {
      player: pos, heading: -this.player.yaw, stamina: this.player.stamina, clock: this.sky.clock,
      underwater: this.camera.position.y < WATER_LEVEL - 0.05, done: this.doneSet,
      hp: this.player.hp, maxHp: this.player.maxHp, waves: this.waves, base: this.base,
      buildings: this.buildings.list, enemies: this.enemies.list, buildRadius: BUILD_RADIUS,
      camera: this.camera, boss: this.enemies.boss, journal: this.journal.lines(this.waves.phase),
    });

    this.post.enabled.bloom = this.bloom;
    // eye adaptation: under the canopy the eye opens up, so sunlit gaps blaze
    this.shade = damp(this.shade ?? 0, this.canopy.coverAt(pos.x, pos.z), 1.2, realDt);
    // at night the eye opens up too, and the crowns hide less of a sky that's dark anyway
    // (opening up a full stop in shade bleached the sunlit leaves beyond it white)
    this.post.exposure = Math.pow(2, this.shade * 0.6 * this.sky.state.day + 0.4 * this.sky.state.night);
    if (canopyBox[3] > 0) canopyBox[3] = 0.35 + 0.2 * this.sky.state.day;
    this.frameNo++;
    this.renderer.shadowMap.needsUpdate = this.frameNo % 2 === 0 || this.sky.timeScale > 2;
    this.post.render(realDt, this.machete);
    input.endFrame();
  }
}
