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
import { World, FORAGE_TINT, CACHE_EMPTY } from '../world/World.js';
import { Trample } from '../world/Trample.js';
import { Rot } from '../world/Rot.js';
import { Litter } from '../world/Litter.js';
import { Cover } from '../world/Cover.js';
import { Grass } from '../world/Grass.js';
import { Sky } from '../world/Sky.js';
import { Water } from '../world/Water.js';
import { findSpawn, grove, sampleTerrain, terrainHeight, WATER_LEVEL, CHUNK_SIZE } from '../world/WorldGen.js';
import { POI_INFO, poisAround, buildPOI } from '../world/poi/POI.js';
import { Player } from '../player/Player.js';
import { Machete } from '../player/Machete.js';
import { Input, keyName } from './Input.js';
import { Particles } from '../fx/Particles.js';
import { Marks } from '../fx/Marks.js';
import { Ambient } from '../fx/Ambient.js';
import { LightPool } from '../fx/LightPool.js';
import { Weather } from '../fx/Weather.js';
import { Pickups } from '../items/Pickups.ts';
import { Inventory, HOTBAR, BELT_KINDS, Sources, craftFrom, transfer } from '../items/Inventory.ts';
import { ITEMS, ITEM_IDS, RARITY, PACKS, rollLoot } from '../items/ItemDB.ts';
import { BENCHES, recipeFor, benchOf } from '../items/Recipes.js';
import { Containers } from '../items/Containers.ts';
import { renderItemIcons, getItemModel } from '../items/ItemModels.ts';
import { glowTexture } from '../art/textures.js';
import { AudioSys } from '../audio/AudioSys.js';
import { HUD } from '../ui/HUD.js';
import { smoothstep, damp, clamp } from '../utils/math.js';
import { loadModels, MODEL_NAMES } from '../assets/Models.js';
import { Base, Rift, pickRifts, pickGroveRift, findBaseSite, BASE_CLEAR, BASE_SOFT, BUILD_RADIUS, GOAL_RADIUS } from '../defense/Base.js';
import { FlowField } from '../defense/FlowField.js';
import { Enemies } from '../defense/Enemies.js';
import { Buildings, BuildGhost, hologram, BUILD_DEFS, TIER_NAMES, ROOTS, GRAFTS } from '../defense/Towers.ts';
import type { Building, TowerCtx } from '../defense/Towers.ts';
import type { Recipe } from '../items/Inventory.ts';
import type { Container } from '../items/Containers.ts';
import { Camp } from '../defense/Camp.js';
import { Waves, DUSK, DAWN, SIGNS, signFor } from '../defense/Waves.js';
import { Blooms, BLOOM_RADIUS } from '../defense/Blooms.js';
import { Projectiles } from '../combat/Projectiles.js';
import { PERKS, baseMods, offerPerks, thresholds } from './Perks.js';
import { Journal } from './Journal.ts';
import { writeSave, clearSave, recordBest, addRecords } from './Save.js';
import { difficulty, kitItems } from './Difficulty.js';
import { MEMORIES, unlocked } from './Memories.js';
import { checkAchievements, scoreOf } from './Achievements.js';
import { DAILY } from './Seed.js';
import { Tips } from './Tips.js';
import { bootQuality } from './Quality.js';
import { Expedition } from './Expedition.js';

// Yield so the loading bar can paint; falls back to a timeout because
// requestAnimationFrame is paused in background tabs.
const nextFrame = () => new Promise<void>((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
const REACH = 2.7;
// what the Coffer holds (stacks); weight doesn't count in it
const COFFER_SLOTS = 60;
// loot tables whose containers never fill again (the temple's idol, the shrine's altar)
const UNIQUE = new Set(['temple', 'shrine']);
// a lost satchel's beam: 12 m of soft gold light, pulsing (no light source, an additive shell)
const LOST_BEAM = new THREE.CylinderGeometry(0.35, 0.5, 12, 12, 1, true).translate(0, 6, 0);
let lostBeam: THREE.ShaderMaterial | null = null;
function lostBeamMat() {
  lostBeam ??= new THREE.ShaderMaterial({
    uniforms: { uTime: globalUniforms.uTime },
    vertexShader: 'varying float vY; void main(){ vY = position.y / 12.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying float vY; void main(){ float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.8) * (0.55 + 0.45 * sin(uTime * 3.0)) * 0.32; gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  return lostBeam;
}
// what the machete bites into (and leaves a gash in) rather than rings off
const WOODY = new Set(['bigTree', 'smallTree', 'midTree', 'palm', 'treeFern', 'log', 'stump', 'branch']);
const MACHETE_DMG = 28;
const RESPAWN = 5;
const FOV = 72;
const STARTER: [string, number][] = [['bow_tower', 1], ['spike_trap', 2], ['poultice', 2]];
// the title's light: late afternoon, the sun low and gold through the crowns
const TITLE_TIME = 0.728;
const TITLE_SHOT = 19;
const ease = (t: number) => 1 - (1 - t) ** 3;
const _white = new THREE.Color();

// Shapes still defined only in JS (World's interactables and colliders, a chunk, an enemy, a
// Bloom, a save): named here so the signatures say what they take, typed when those files are.
type Interactable = any;
type Collider = any;
type Chunk = any;
type Enemy = any;
type Bloom = any;
type SaveData = any;
// how a hit landed, for the damage numbers and kill callbacks (Enemies.damage fills in k)
interface HitInfo { source?: string; type?: string; crit?: boolean; stagger?: number; shield?: boolean; k?: number }
// hold a key to do it, with a progress ring on the prompt (Game.interact makes one per frame)
type HoldAction = (label: string, time: number, done: () => void, sub?: string, key?: string) => void;
// the satchel's other pane: the Coffer, or a container being searched (HUD.otherPane)
interface OtherPane {
  kind: 'coffer' | 'container';
  title: string;
  sub: string;
  inv: Inventory;
  actions: { label: string; key?: string; fn: () => void }[];
  hidden?: Set<number>;
  rec?: Container;
  it?: Interactable;
}
// a torn page (Story.NOTES)
interface Note { id: string; title: string; map?: unknown }

// what combat callbacks get (enemies, towers, projectiles): Game.combatCtx
interface CombatCtx extends TowerCtx {
  base: Base;
  lights: LightPool;
  onKill: (e: Enemy, opts?: HitInfo) => void;
  onDamage: (e: Enemy, n: number, opts: HitInfo) => void;
  damageCtx?: CombatCtx;
}
type TerrainSample = ReturnType<typeof sampleTerrain>;

export class Game {
  debug: boolean;
  renderer: THREE.WebGLRenderer;
  frameNo: number;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  input: Input;
  canopy: CanopyMap;
  audio: AudioSys;
  captions: boolean;
  inventory: Inventory;
  coffer: Inventory;
  owns: (id: string) => boolean;
  containers: Containers;
  restockable: Set<string>; // container ids
  lost: Interactable[];
  lostN: number;
  noises: { x: number; z: number; r: number; t: number }[];
  hud: HUD;
  journal: Journal;
  tips: Tips;
  running: boolean;
  paused: boolean;
  modal: string | null;
  startTime: number | null;
  cover: number;
  _ahead: THREE.Vector3;
  search: Interactable | null; // what E is being held on
  searchT: number;
  searchKey: string;
  doneSet: Set<string>; // POI keys
  envTick: number;
  nearWater: number;
  deadT: number;
  lastHit: number;
  hitStop: number;
  chain: number;
  lastStrike: number;
  draw: number;
  aimK: number;
  drawing: boolean;
  noAmmoT: number;
  alertT: number;
  alertHold: number;
  saveT: number;
  overT: number;
  mods: ReturnType<typeof baseMods>;
  perks: string[];
  favour: number;
  boonsTaken: number;
  pendingBoons: number;
  stats: { built: number; upgraded: number; bosses: number; blooms: number; elites: number; grafts: number; seals: number; drops: number; burns: number };
  rootBonus: number;
  difficulty: string;
  fadeEl: HTMLElement;
  bloom: boolean;
  rand: () => number;
  autoRes: boolean;
  fpsCap: number;
  nextFrameAt: number;
  resScale: number;
  res: { avg: number; cool: number; hold: number; fast: number; sinceUp: number };
  quality: string;
  basePR: number;
  shadowEvery: number;
  resFloor: number;
  bootQuality: string;
  flora: Flora;
  sky: Sky;
  water: Water;
  world: World;
  base: Base;
  camp: Camp;
  trample: Trample;
  rot: Rot;
  player: Player;
  litter: Litter;
  groundCover: Cover;
  grass: Grass;
  field: FlowField;
  rifts: (Rift & { grove: boolean })[];
  enemies: Enemies;
  buildings: Buildings;
  ghost: BuildGhost;
  lights: LightPool;
  weather: Weather;
  projectiles: Projectiles;
  blooms: Blooms;
  heartMarker: any;
  waves: Waves;
  expedition: Expedition;
  bloomUsed: boolean;
  rootT: number;
  machete: Machete;
  particles: Particles;
  marks: Marks;
  uniforms: typeof globalUniforms;
  ambient: Ambient;
  pickups: Pickups;
  post: PostFX;
  timer: THREE.Timer;
  title: { t: number; shot: number; shotT: number; fade: number; fly: any; wake?: number } | null;
  banked: { kills: number; bosses: number; blooms: number; built: number; elites: number; grafts: number; seals: number; drops: number; burns: number };
  begun: boolean;
  compileAgain: boolean;
  compiling: boolean;
  compiledAt: number;
  tipT: number;
  capture: { pos: THREE.Vector3; home: THREE.Vector3; yaw: number; pitch: number; speed: number; freeze: boolean };
  loaded: boolean;
  paneFrame: number;
  usingId: string;
  seenHusk: boolean;
  gathering: boolean;
  gatherTick: number;
  gatherT: number;
  hiForage: Interactable | null;
  glintT: number;
  _ctx: CombatCtx;
  rotT: number;
  rewearT: number;
  signFog: number;
  signMoon: number;
  wasInCamp: boolean;
  hudHidden: boolean;
  swingTapped: boolean;
  grassSig: number;
  playerNoise: number;
  haze: number;
  swampAir: number;
  blockedT: number;
  shade: number;
  // scratch, made on first use
  _tEye: THREE.Vector3;
  _tAt: THREE.Vector3;
  _fwd: THREE.Vector2;
  _nearI: Interactable[];
  _hitMesh: THREE.Mesh;
  _hitRay: THREE.Raycaster;
  _campSrc: Sources;
  _ground: TerrainSample;
  campChip: HTMLElement | null;

  constructor(canvas: HTMLCanvasElement, { debug = false, time = null }: { debug?: boolean; time?: number | null } = {}) {
    this.debug = debug;
    // no canvas MSAA: the scene is drawn into multisampled targets by PostFX
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    // reading back every program's info log stalls the CPU on each compile; only when developing
    this.renderer.debug.checkShaderErrors = debug || import.meta.env.DEV;
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
    this.captions = false; // Settings: sounds written out at the foot of the screen
    this.captionAudio();
    this.inventory = new Inventory();
    this.inventory.setPack('woven_satchel');
    // the camp's stash: no belt, no pouch, no weight limit
    this.coffer = new Inventory({ hotbar: 0, pack: COFFER_SLOTS, safe: 0, capacity: Infinity, packSize: COFFER_SLOTS, safeSize: 0 });
    // whether you have one of id, carried or stored (the journal's goals ask)
    this.owns = (id) => this.inventory.count(id) + this.coffer.count(id) > 0;
    this.containers = new Containers();
    this.restockable = new Set(); // emptied containers that may fill again at dawn
    this.lost = []; // dropped satchels lying in the world
    this.lostN = 0;
    this.noises = []; // { x, z, r, t }: what the Blight can hear this moment
    this.hud = new HUD(this.inventory);
    this.journal = new Journal(this.hud);
    this.tips = new Tips(this.hud);
    this.tips.off = debug;
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
    this.stats = { built: 0, upgraded: 0, bosses: 0, blooms: 0, elites: 0, grafts: 0, seals: 0, drops: 0, burns: 0 };
    this.rootBonus = 0; // root capacity from relics buried in the Heartwood
    this.difficulty = 'warden';
    this.fadeEl = document.getElementById('title-fade'); // black, for the title's cuts and the fly-in
    this.bloom = true;
    this.rand = Math.random;
    this.autoRes = true;
    this.fpsCap = 0; // frames a second at most (0: every display refresh); the menu sets it
    this.nextFrameAt = 0;
    this.resScale = 1;
    this.res = { avg: 1 / 60, cool: 3, hold: 0, fast: 0, sinceUp: 99 };
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // High / Medium / Low: the costly parts a slower machine can do without
  setQuality(q: string) {
    this.quality = q;
    this.basePR = Math.min(devicePixelRatio, 1.5) * (q === 'low' ? 0.75 : 1);
    this.applyRes();
    this.post.enabled.ao = q !== 'low';
    this.post.enabled.vol = q === 'high';
    // small plants, forage and the trees' full-detail crowns stop sooner below High (the fog
    // closes in to hide the line), and the sun's shadows are redrawn less often on Low
    this.world.pools.setScale(q === 'high' ? 1 : q === 'medium' ? 0.8 : 0.6);
    this.world.pools.lodShadows = q !== 'low';
    this.sky.fogBoost = q === 'low' ? 0.006 : 0;
    this.shadowEvery = q === 'low' ? 3 : 2;
    this.resFloor = q === 'low' ? 0.5 : 0.6;
    globalUniforms.uPom.value = q === 'low' ? 0 : 1;
    // billboard light shafts only where the ray-marched ones are off
    this.ambient.shaftScale = q === 'high' ? 0 : 1;
    for (const m of [...this.litter.meshes, ...this.groundCover.meshes, ...this.grass.meshes]) m.visible = q !== 'low';
    const sh = this.sky.sun.shadow, size = q === 'low' ? 1024 : 2048;
    // soft contact-hardening shadows on High (see installSoftShadows); the others keep plain PCF
    sh.radius = q === 'high' ? 2.5 : 1;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  applyRes() {
    this.renderer.setPixelRatio((this.basePR ?? Math.min(devicePixelRatio, 1.5)) * (this.autoRes ? this.resScale : 1));
    this.resize();
  }

  // Steady frame rate: when frames run slow for a second or two the scene is drawn at a
  // little lower resolution (down to 60%), and creeps back up once there's room again. A step
  // up that brings the slowdown straight back isn't tried again for a while.
  tickRes(dt: number) {
    if (!this.autoRes || dt > 0.25) return;
    const r = this.res;
    r.avg += (dt - r.avg) * Math.min(1, dt * 2);
    r.cool -= dt;
    r.hold -= dt;
    if (r.cool > 0) return;
    const floor = this.resFloor || 0.6;
    if (r.avg > 1 / 48 && this.resScale > floor) {
      // a drop soon after a step up: that step was too far
      if (r.sinceUp < 5) r.hold = 45;
      this.resScale = Math.max(floor, this.resScale - 0.1);
      r.cool = 2;
      r.fast = 0;
      this.applyRes();
    } else if (r.avg < 1 / 57 && this.resScale < 1 && r.hold <= 0) {
      r.fast += dt;
      if (r.fast > 6) {
        this.resScale = Math.min(1, this.resScale + 0.05);
        r.cool = 2;
        r.fast = 0;
        r.sinceUp = 0;
        this.applyRes();
      }
    } else r.fast = 0;
    r.sinceUp += dt;
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

  async init(progress: (k: number, label: string) => void) {
    progress(0.03, 'Carving the Heartwood…');
    let loaded = 0;
    await loadModels(() => progress(0.03 + (++loaded / MODEL_NAMES.length) * 0.12, 'Carving the Heartwood…'));
    progress(0.15, 'Gathering leaves…');
    // the texture sizes follow the quality the game boots with (a change applies on restart);
    // a first boot guesses it from the graphics card
    this.bootQuality = this.debug ? 'high' : bootQuality(this.renderer);
    const lib = await new TextureLib(this.renderer, this.bootQuality).load((p) => progress(0.15 + p * 0.15, 'Gathering leaves…'));
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
    this.camp = new Camp(this.scene, this.world, this.base);
    this.trample = this.world.trample = new Trample(sp.x, sp.z);
    this.rot = this.world.rot = new Rot(sp.x, sp.z);
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
    const riftSpots: { x: number; z: number; night: number; grove?: boolean }[] = pickRifts(this.field, this.base.x, this.base.z, 5, Math.round(sp.x + sp.z));
    const gr = pickGroveRift(this.field, this.base.x, this.base.z, grove());
    if (gr) riftSpots.push(gr);
    this.rifts = riftSpots.map((r) => Object.assign(new Rift(this.scene, r.x, r.z, r.night), { grove: !!r.grove }));
    this.enemies = new Enemies(this.scene);
    this.buildings = new Buildings(this.scene, this.world);
    this.ghost = new BuildGhost(this.scene);
    // every lit pixel loops over all of these: Low keeps three (fixed for the run, since a
    // change recompiles every shader)
    this.lights = new LightPool(this.scene, this.bootQuality === 'low' ? 3 : 6);
    this.weather = new Weather(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.blooms = new Blooms(this.scene);
    this.hud.markers = [
      { key: 'heartwood', x: this.base.x, z: this.base.z, icon: '❦', label: 'Heartwood', cls: 'base' },
    ];
    this.showRifts(1);
    this.heartMarker = this.hud.markers[0];
    this.waves = new Waves({ sky: this.sky, enemies: this.enemies, rifts: this.rifts, hud: this.hud, audio: this.audio, world: this.world, base: this.base });
    this.waves.coverage = (x, z) => this.coverage(x, z);
    // the Blood Moon only rises while you carry the golden idol (in the satchel or the Coffer)
    this.waves.signOf = (n) => {
      const idol = this.inventory.count('golden_idol') + this.coffer.count('golden_idol') > 0;
      return signFor(n, idol, idol && !this.expedition.moonHeld);
    };
    this.expedition = new Expedition(this);
    this.expedition.init();
    this.containers.extra = (it) => this.expedition.pageFor(it);
    this.waves.onDay = () => {
      this.weather.target = 0;
      this.sproutBlooms();
      this.sproutHusks();
      this.autosave();
    };
    this.waves.onNight = (n) => {
      this.expireLost('day');
      // the day's Husks sink back into the soil
      for (const e of this.enemies.list) if (e.patrol) this.enemies.crumble(e);
      this.showRifts(n);
      this.hatchBlooms();
      this.journal.event('night');
      this.journal.meet(Object.keys(this.waves.preview.counts).filter((k) => this.waves.preview.counts[k] > 0));
      this.bloomUsed = false;
      this.rootT = 6;
      this.expedition.onNight();
      this.applySign(this.waves.sign);
      this.syncRifts();
      // the guided first night: what to do while the tower works
      // (the rest of it is said on the wave clock, in checkTips)
      if (n === 1 && !this.tips.off) {
        if (!this.buildings.list.some((b) => !b.dead && b.def.range)) {
          this.hud.message('Night falls and nothing guards the Heartwood! Pick your Bow Tower on the belt (1) and click near the Heartwood to build it', '#ffb0a0');
        } else this.tips.show('night1', 'Night falls: the Blight crawl out of the rifts ✶ and make for the Heartwood', '#bfe8ff', 3000);
      }
    };
    this.waves.onDawn = (_held, won) => {
      this.weather.target = 0;
      this.expireLost('night');
      this.restock();
      // the night's routes wear into the ground, and the Rot creeps out from the rifts
      this.trample.settle();
      const hadRot = this.rot.any;
      this.rot.spread(_held, this.rifts, (r) => r.night <= _held && !this.expedition.dormant(r), this.wards());
      if (this.rot.any && !hadRot) {
        this.journal.flag('rot');
        setTimeout(() => this.hud.message('The ground round the rifts is dying ✚ The Blight run faster on the Rot, and towers on it fire slower. Fire burns it back', '#d8a0ff'), 6500);
      }
      this.rot.dirty = false;
      this.world.wearAll();
      this.applySign(null);
      this.expedition.onDawn();
      this.syncRifts();
      for (const layer of [this.grass, this.litter, this.groundCover]) layer.reset();
      this.bankRecords({ nights: 1, wins: won ? 1 : 0, hardWins: won && this.difficulty !== 'verdant' ? 1 : 0, blightWins: won && this.difficulty === 'blightborn' ? 1 : 0 });
      if (this.mods.harvest) this.harvestDawn();
      if (this.mods.dawnMend) for (const b of this.buildings.list) b.hp = b.maxHp;
      // left near broken, a building comes out of the night scarred
      let scars = 0;
      for (const b of this.buildings.list) if (!b.dead && b.def.kind !== 'trap' && b.def.kind !== 'snare' && b.hp < b.maxHp * 0.3 && b.scar()) scars++;
      if (scars) setTimeout(() => this.hud.message(`${scars} building${scars > 1 ? 's' : ''} came out of the night scarred: 10% less HP until an orchid salve or an upgrade mends ${scars > 1 ? 'them' : 'it'}`, '#ffb080'), 4000);
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
    this.pickups.canTake = (id) => this.inventory.takeable(id, 1);
    this.hud.setIcons(renderItemIcons(this.renderer, ITEM_IDS));
    for (const [id, n] of STARTER) this.inventory.add(id, n);
    // start with the machete out, not a tower
    this.inventory.select(this.inventory.slots.findIndex((s, i) => !s && i < HOTBAR));
    this.inventory.onChange = () => this.hud.stats();
    // a crafted thing too heavy (or too big) to carry: into the Coffer in camp, else on the ground
    this.inventory.onOverflow = (id, n) => this.overflow(id, n);
    this.hud.craftCtx = () => this.craftContext();
    this.hud.keyLabel = (code) => keyName(this.input.bound(code));
    this.hud.onSalvage = (i) => this.salvage(i);
    this.hud.onCloseOther = (o) => this.closeOther(o);
    this.hud.onFull = (o) => {
      this.audio.ui();
      this.hud.message(o ? 'No room in there' : this.inventory.burden === 'encumbered' ? 'Too heavy: your pack can take no more' : 'No room in your pack', '#ff9a7a');
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
    const warm = ['blightling', 'rotboar', 'wisp', 'spitter', 'burrower', 'thornback', 'husk', 'rot_mother', 'rot_egg'].map((t, i) => this.enemies.spawn(t, this.base.x + 8 + i * 3, this.base.z));
    // one of every defence, standing and as the placement hologram (its see-through and
    // depth-only materials were a half-second freeze the first time you held a barricade)
    const warmBuilt = Object.keys(BUILD_DEFS).map((id, i) => this.buildings.place(id, this.base.x - 9 + (i % 4) * 3, this.base.z + 9 + ((i / 4) | 0) * 3, 0, { instant: true }));
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
    // and one of every item as a pickup (model, glow and beam): the icons are drawn under
    // their own lights, so the in-game program for each item's materials was still compiled
    // the first time it dropped, a 0.2 s freeze mid-run
    const warmPicks = ITEM_IDS.map((id) => this.pickups.spawn(id, new THREE.Vector3(this.player.pos.x, gy, this.player.pos.z), 0));
    for (const id of Object.keys(BUILD_DEFS)) {
      const h = hologram(id);
      h.position.set(this.player.pos.x, gy, this.player.pos.z);
      this.scene.add(h);
      warmGroups.push(h);
    }
    // compile for the target play renders into: PostFX's linear half-float scene buffer. Bound
    // to the canvas (sRGB, tone mapped) every program came out a different variant and was
    // compiled again mid-game, a 0.5-1.5 s freeze the first time each kit streamed in
    this.renderer.setRenderTarget(this.post.sceneRT);
    try {
      await this.compileSafe();
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    // what you hold (one of every belt item, and the slingshot) is drawn under the viewmodel's
    // own lights into the composite: compile those for that target too
    const vm = this.machete, held = ITEM_IDS.filter((id) => BELT_KINDS.has(ITEMS[id].kind)).map((id) => getItemModel(id));
    vm.item.add(...held);
    vm.item.visible = vm.sling.root.visible = true;
    // (lit as in play: its environment is the sky's, which its update hands it every frame)
    vm.scene.environment = this.scene.environment;
    this.renderer.setRenderTarget(this.post.compRT);
    try {
      await this.compileSafe(vm.scene, vm.camera);
    } catch {
      this.renderer.compile(vm.scene, vm.camera);
    }
    vm.item.remove(...held);
    vm.item.visible = vm.sling.root.visible = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.cullWorld();
    this.renderer.setRenderTarget(this.post.sceneRT);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    for (const g of warmGroups) this.scene.remove(g);
    for (const pk of warmPicks) this.pickups.remove(this.pickups.items.indexOf(pk));
    this.blooms.clear();
    for (const e of warm) this.scene.remove(e.obj);
    this.enemies.list = [];
    for (const b of warmBuilt) this.buildings.remove(b);
    this.buildings.stats.built = 0;
    for (const r of this.rifts) r.group.visible = false;
    this.weather.rain.visible = false;
    this.hud.updateMinimap(this.player.pos, 0, true);
    progress(1, 'Ready');
    this.running = true;
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop((ts) => this.tick(ts));
  }

  // Frame limit: on a fast display the browser asks for a frame every refresh (144 a second
  // on a 144 Hz screen) and the GPU draws every one of them flat out. Frames come on a
  // schedule instead, at most fpsCap a second (0 = every refresh). Paused, or behind another
  // window, nothing needs more than 30. (?debug runs draw every frame: e2e timings.)
  tick(ts: number) {
    const idle = !this.debug && ((this.paused && !this.title) || !document.hasFocus());
    const cap = idle ? Math.min(this.fpsCap || 30, 30) : this.fpsCap;
    if (cap > 0) {
      const step = 1000 / cap;
      // (a millisecond early still counts: refreshes jitter around the step)
      if (ts < this.nextFrameAt - 1) return;
      this.nextFrameAt = Math.max(this.nextFrameAt + step, ts - step * 0.5);
    }
    this.frame(ts);
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
  titleShot(k: number, u: number, eye: THREE.Vector3, at: THREE.Vector3) {
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

  updateTitle(dt: number) {
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
  flyIn(done?: () => void, dur = 1.8) {
    if (!this.title) return done?.();
    this.respawn();
    const wake = this.title.wake ?? this.startTime ?? 0.29;
    this.title.fly = { t: 0, dur, eye: this.camera.position.clone(), quat: this.camera.quaternion.clone(), done, wake };
  }

  setFade(v: number, secs = 0) {
    const el = this.fadeEl;
    if (!el) return;
    el.style.transition = secs ? `opacity ${secs}s ease-out` : 'none';
    el.style.opacity = String(v);
  }

  // A new run on the chosen difficulty: the Heartwood's HP, the Blight and the starting kit
  // (the difficulty's own unless Many Paths is earned and another was picked).
  setDifficulty(id: string, kit = 'starter') {
    // the daily vigil is the same for everyone: Warden, the starter kit, no Memories
    if (DAILY) id = 'warden';
    const d = difficulty(id);
    const mem = DAILY ? new Set() : unlocked();
    if (!mem.has('paths')) kit = 'starter';
    this.difficulty = id;
    this.waves.setDifficulty(d);
    this.base.maxHp = this.base.hp = Math.round(500 * d.heart);
    const inv = this.inventory;
    inv.slots.fill(null);
    inv.setPack('woven_satchel');
    this.coffer.slots.fill(null);
    this.camp.restore(null);
    for (const [item, n] of kitItems(d, kit)) inv.add(item, n);
    // what the Memories of the Heartwood add to every vigil (one of each weapon is plenty)
    for (const m of MEMORIES) {
      if (!mem.has(m.id)) continue;
      for (const [item, n] of (m.kit || []) as [string, number][]) if (ITEMS[item].kind !== 'tool' || !inv.count(item)) inv.add(item, n);
    }
    inv.select(inv.slots.findIndex((s, i) => !s && i < HOTBAR));
    inv.changed();
    // The Seals Hold: every vigil after knows how to graft
    this.expedition.grafting = mem.has('sealed');
  }

  // Bank what this run has done since the last time into the lifetime records.
  // what this run has banked into the records (each counter banked as it grows)
  bankable() {
    const s = this.stats;
    return { kills: this.enemies.kills, bosses: s.bosses, blooms: s.blooms, built: this.buildings.stats.built, elites: s.elites, grafts: s.grafts, seals: s.seals, drops: s.drops, burns: s.burns };
  }

  bankRecords(extra: Record<string, number> = {}) {
    if (this.debug) return;
    const now = this.bankable();
    const last = this.banked ?? now;
    const delta = { ...extra };
    for (const k in now) delta[k] = Math.max(0, now[k] - (last[k] || 0));
    this.banked = now;
    const had = unlocked();
    const most: { deepest: number; dailyBest?: number } = { deepest: this.waves.night - 1 };
    if (DAILY) most.dailyBest = this.waves.night - 1;
    const r = addRecords(delta, Object.keys(this.enemies.killsByType), most);
    recordBest(this.waves.night - 1, this.enemies.kills, this.score);
    // achievements earned: a toast each, after any Memory
    checkAchievements(r).forEach((a, i) => setTimeout(() => {
      this.hud.message(`Achievement: ${a.glyph} ${a.name} · ${a.desc}`, '#f0d890');
      this.audio.pickup(3);
    }, 2500 + i * 3000));
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
    this.banked = this.bankable();
    if (!this.loaded && !this.debug) addRecords({ runs: 1 });
    const w = this.waves;
    if (this.loaded) this.hud.banner(`Day ${w.night}`, 'The Heartwood remembers you.');
    else this.hud.banner('Day 1', 'Gather from the forest, craft defences, guard the Heartwood.');
    // the first new run explains itself before the day starts
    let seen = true;
    try { seen = localStorage.getItem('og.intro') === '1'; } catch { /* storage blocked */ }
    if (!this.loaded && !this.debug && !seen) {
      try { localStorage.setItem('og.intro', '1'); } catch { /* storage blocked */ }
      this.showIntro();
    }
    if (w.phase === 'day') setTimeout(() => { if (!this.blooms.list.length && this.waves.phase === 'day') this.sproutBlooms(); }, 2500);
  }

  // the "Your vigil" card (a new run's first, and How to play on the pause menu)
  showIntro(done?: () => void) {
    this.modal = 'intro';
    this.input.unlock();
    this.hud.showIntro(() => {
      this.modal = null;
      if (done) done();
      else if (!this.debug) this.input.lock();
    });
  }

  // Shaders for everything in the scene, compiled off the main thread where the browser can
  // (KHR_parallel_shader_compile), so a material first seen mid-run doesn't stall a frame: a
  // Blight Bloom's pods coming into view were a 300 ms hitch. Asked for when chunks load and
  // blooms sprout; at most once a second.
  precompile() {
    const now = performance.now();
    if (this.compiling || now - (this.compiledAt || 0) < 1000) {
      this.compileAgain = true;
      return;
    }
    this.compiling = true;
    this.compiledAt = now;
    this.compileAgain = false;
    this.compileSafe().catch(() => {}).finally(() => {
      this.compiling = false;
      if (this.compileAgain) setTimeout(() => this.precompile(), 1000);
    });
  }

  // renderer.compileAsync, but a material disposed while it waits (a Husk crumbling, a lost
  // satchel picked up) is dropped from the wait instead of throwing in three's timer
  // Compiled for the target the scene is really drawn into (PostFX's linear scene buffer, or
  // the composite for what you hold): bound to the canvas, three makes the sRGB, tone-mapped
  // variant of every program instead, dozens of programs nothing uses, while the ones play
  // needs still compiled mid-frame.
  compileSafe(scene: THREE.Object3D = this.scene, camera: THREE.Camera = this.camera) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    if (this.post) r.setRenderTarget(scene === this.scene ? this.post.sceneRT : this.post.compRT);
    let mats;
    try {
      mats = r.compile(scene, camera);
    } finally {
      r.setRenderTarget(prev);
    }
    return new Promise<void>((resolve) => {
      const tick = () => {
        for (const m of mats) {
          const prog = (r.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
          if (!prog || prog.isReady()) mats.delete(m);
        }
        if (mats.size === 0) resolve();
        else setTimeout(tick, 10);
      };
      tick();
    });
  }

  // Captions: the sounds that carry meaning, written out (Settings > Captions). Each sound's
  // method is wrapped so whatever plays it also captions it, a few seconds apart at most.
  captionAudio() {
    const CAPS: Record<string, [string, number]> = {
      horn: ['A horn: night falls, the Blight are coming', 0], roar: ['A great roar', 3], heartHurt: ['The Heartwood is being bitten', 4],
      bite: ['Something is chewing on a defence', 5], windup: ['A hiss close by: a bite is coming', 3], huskCreak: ['Creaking wood: a Husk nearby', 7],
      spit: ['A wet spit: a Spitter', 5], burrow: ['Digging under the ground', 6], wispCry: ['A Wisp keens overhead', 7],
      slam: ['The ground shakes', 3], dawn: ['Birdsong: dawn', 0], heartAlarm: ['The Heartwood cries out', 4], thunder: ['Thunder', 8],
    };
    const last: Record<string, number> = {};
    for (const [name, [text, gap]] of Object.entries(CAPS)) {
      const fn = this.audio[name];
      if (typeof fn !== 'function') continue;
      // (the bare sound, for a use that means something else: a Bloom sprouting)
      (this.audio.raw ??= {})[name] = fn;
      this.audio[name] = (...args) => {
        const now = performance.now();
        if (this.captions && this.hud && (!last[name] || now - last[name] > gap * 1000)) {
          last[name] = now;
          this.hud.caption(text);
        }
        return fn.apply(this.audio, args);
      };
    }
  }

  // a word the first time something new turns up (Tips: once, ever), checked once a second
  checkTips() {
    if (this.tips.off || (this.tipT = (this.tipT ?? 1) - 1 / 60) > 0) return;
    this.tipT = 1;
    const T = this.tips;
    if (this.inventory.burden !== 'light') T.show('laden', 'Your pack is heavy: you slow down, tire faster and the Husks hear you further off. Store things in the Coffer at camp', '#ffd28a');
    if (this.waves.phase === 'night' && this.enemies.list.some((e) => e.affix && !e.dying && e.pos.distanceTo(this.player.pos) < 30)) {
      T.show('elite', 'An elite: a coloured outline and a mark over its health bar. Tougher, with one quirk (the Field Guide lists them), and it drops better things', '#ffe0a0');
    }
    if (this.base.hp < this.base.maxHp - 1 && this.waves.phase === 'night') T.show('bitten', 'The Heartwood is being bitten! Get back to it: its health is the bar at the top', '#ff9a9a');
    // the guided first night, on the wave clock (a pause holds it)
    if (this.waves.phase === 'night' && this.waves.night === 1) {
      const c = this.waves.clock;
      if (c > 11 && this.buildings.list.some((b) => !b.dead && b.def.range)) T.show('night1b', 'Your Bow Tower fires on its own. Stay near the Heartwood and cut down whatever gets past it (LMB)', '#bfe8ff');
      if (c > 40) T.show('night1d', 'When the last of them falls, dawn comes, and the forest grows back', '#bfe8ff');
    }
    if (this.player.hp < 70 && this.inventory.count('poultice')) T.show('night1c', 'Hurt? Pick a poultice on the belt and right-click to heal', '#bfe8ff');
    if (this.camp.levels.tinker >= 1) T.show('radio', "The Tinker's Bench can mend Hollis's radio: hold F at it to see what the next part is", '#bfe8ff');
  }

  // ---------------------------------------------------------------- capture mode

  toggleCapture() {
    if (this.capture) {
      this.capture = null;
      this.hud.show(!this.hudHidden);
      this.hud.message('Capture mode off', '#f3ead2');
      return;
    }
    const cam = this.camera;
    this.capture = { pos: cam.position.clone(), home: this.player.pos.clone(), yaw: this.player.yaw, pitch: this.player.pitch, speed: 6, freeze: false };
    this.hud.show(false);
    this.ghost.hide();
  }

  // WASD and the mouse fly, Space / C rise and sink, Shift is faster, the wheel sets the speed,
  // P holds the world still, F8 lands again
  updateCapture(dt: number, input: Input) {
    const C = this.capture, cam = this.camera;
    C.yaw -= input.mouse.dx * 0.0022;
    C.pitch = clamp(C.pitch - input.mouse.dy * 0.0022, -1.5, 1.5);
    if (input.mouse.wheel) C.speed = clamp(C.speed * (input.mouse.wheel < 0 ? 1.25 : 0.8), 0.5, 80);
    if (input.hit('KeyP')) C.freeze = !C.freeze;
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const u = (input.down('Space') ? 1 : 0) - (input.down('KeyC') ? 1 : 0);
    const v = C.speed * (input.down('ShiftLeft') ? 4 : 1) * dt;
    const cp = Math.cos(C.pitch);
    C.pos.x += (-Math.sin(C.yaw) * cp * f + Math.cos(C.yaw) * s) * v;
    C.pos.z += (-Math.cos(C.yaw) * cp * f - Math.sin(C.yaw) * s) * v;
    C.pos.y += (Math.sin(C.pitch) * f + u) * v;
    C.pos.y = Math.max(C.pos.y, terrainHeight(C.pos.x, C.pos.z) + 0.3);
    cam.position.copy(C.pos);
    cam.rotation.set(C.pitch, C.yaw, 0, 'YXZ');
    this.machete.root.visible = false;
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

  // The tower damage a second that reaches the Blight's path from (x, z) to the Heart, walked
  // down the flow field: low means a thin side
  coverage(x: number, z: number) {
    let dps = 0, px = x, pz = z;
    const towers = this.buildings.list.filter((b) => !b.dead && b.def.range && b.def.dmg);
    for (let i = 0; i < 70; i++) {
      if (Math.hypot(px - this.base.x, pz - this.base.z) < GOAL_RADIUS + 2) break;
      for (const b of towers) if (Math.hypot(b.x - px, b.z - pz) < b.stat('range', this.mods)) dps += b.stat('dmg', this.mods) / b.stat('rate', this.mods);
      const d = this.field.dirAt(px, pz);
      if (!d) break;
      px += d.x * 2;
      pz += d.z * 2;
    }
    return dps;
  }

  // map markers for every rift that has opened by night n (the late ones appear when they tear)
  showRifts(n: number) {
    this.rifts.forEach((r, i) => {
      const key = `rift${i}`;
      if (r.night <= n && !this.hud.markers.some((m) => m.key === key)) {
        this.hud.markers.push({ key, x: r.x, z: r.z, icon: '✶', label: 'Rift', cls: 'rift' });
      }
    });
  }

  // Debug helper: game.teleport('temple') jumps next to the nearest POI.
  teleport(type: string, dist = 16, angle = 0) {
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

  // the pooled plants in view of the camera (as it is this frame) or the sun's shadow camera
  cullWorld() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.world.cull(cam, this.sky.sun.castShadow ? this.sky.sun.shadow.camera : null);
  }

  // Debug helpers
  give(id: string, n = 1) {
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
  loadFrom(d: SaveData) {
    const inv = this.inventory;
    inv.setPack(PACKS[d.pack] ? d.pack : 'woven_satchel');
    this.coffer.restore(d.coffer || []);
    // a save from before the backpack (0.9: 8 + 24 slots) loads stack by stack; what doesn't
    // fit any more goes to the Coffer
    const spill = inv.restore(d.slots);
    for (const [id, n] of spill) this.coffer.add(id, n);
    this.camp.restore(d.camp);
    this.containers.restore(d.containers);
    for (const id of d.restock || []) this.restockable.add(id);
    for (const id of d.looted || []) this.world.looted.add(id);
    for (const [id, x, z, expires] of d.lost || []) if (this.containers.has(id)) this.placeLost(id, x, z, expires);
    this.lostN = d.lostN || 0;
    this.rootBonus = d.rootBonus || 0;
    inv.selected = d.selected || 0;
    for (const id of d.found || []) if (ITEMS[id]) inv.found.add(id);
    for (const [id, x, z, rot, tier, hp, scar, grafts] of d.buildings || []) {
      if (!BUILD_DEFS[id]) continue;
      const b = this.buildings.place(id, x, z, rot, { instant: true });
      while (b.tier < tier) b.upgrade();
      for (const gid of grafts || []) if (GRAFTS[gid]) b.addGraft(gid);
      if (scar) b.scar();
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
    this.expedition.restore(d.expedition);
    if (d.rot) this.rot.restore(d.rot);
    if (d.trample) this.trample.restore(d.trample);
    if (d.trample || d.rot) {
      this.rot.dirty = false;
      this.world.wearAll();
    }
    this.syncRifts();
    this.loaded = true;
    inv.changed();
  }

  // ------------------------------------------------------------- actions

  forwardXZ(out = new THREE.Vector2()) {
    return out.set(-Math.sin(this.player.yaw), -Math.cos(this.player.yaw));
  }

  get playerAlive() {
    return this.deadT <= 0;
  }

  loot(table: string, at: THREE.Vector3, impulse = 0.8, auto = false) {
    const ids = rollLoot(table, this.rand);
    if (this.mods.lootBonus && this.rand() < this.mods.lootBonus) ids.push(...rollLoot(table, this.rand).slice(0, 1));
    for (const id of ids) this.pickups.spawn(id, at.clone(), impulse, auto);
  }

  onSwingHit(combo: number) {
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
      if (e.affix === 'thorned') this.hitPlayer(Math.min(9, dmg * 0.2));
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
      this.makeNoise(10);
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
      if (it.done || it.kind !== 'break' || it.smashed || this.containers.has(it.id)) continue;
      const dx = it.x - p.x, dz = it.z - p.z, dy = it.y - (p.y + 1);
      const d = Math.sqrt(dx * dx + dz * dz);
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
      this.makeNoise(14);
      if (best.hp <= 0) {
        // smashed: the box is gone and what was in it spills out onto the ground, all at once,
        // but whatever was fragile may have broken; and that carried
        best.smashed = true;
        const rec = this.containers.roll(best, this.rand, { smashed: true, bonus: this.mods.lootBonus });
        if (rec.broke.length) this.hud.message(`Something broke inside: ${rec.broke.map((id) => ITEMS[id].name).join(', ')}`, '#ff9a7a');
        const spill = at.clone().add(new THREE.Vector3(0, 0.4, 0));
        // (and comes to you, like a search's finds: it can land somewhere you can't reach)
        for (const s of rec.inv.slots) if (s) for (let k = 0; k < s.n; k++) this.pickups.spawn(s.id, spill, 0.7, true);
        this.journal.event('search');
        this.expedition.opened(best);
        this.containers.forget(best.id);
        this.finishContainer(best);
        this.makeNoise(22);
        this.particles.chipBurst(at, best.debris, 30, best.y - 0.6);
        best.loot === 'ruin' ? this.audio.pottery() : this.audio.breakWood();
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
  bladeContact(c: Collider, probe: THREE.Vector3) {
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
  harvestTrunk(c: Collider, at: THREE.Vector3, out: THREE.Vector3) {
    this.makeNoise(11);
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

  harvestRock(c: Collider, at: THREE.Vector3, out: THREE.Vector3) {
    this.makeNoise(11);
    this.audio.stone();
    this.particles.sparks(at, 0xfff0c0, 12, out);
    this.particles.chipBurst(at, 0x8a877b, 8, this.player.pos.y, out);
    this.particles.dust(at, 6, 0.15, 0xb0aa98);
    c.hits = (c.hits || 0) + 1;
    if (c.hits <= 8) this.loot('rock', at, 0.6);
  }

  findInteractable() {
    const p = this.player.pos;
    const fwd = this.forwardXZ(this._fwd ??= new THREE.Vector2());
    this._nearI ??= [];
    let best = null, bs = -Infinity;
    for (const it of this.world.near(p.x, p.z, 'interactables', this._nearI)) {
      if (it.done) continue;
      const dx = it.x - p.x, dz = it.z - p.z, dy = it.y - (p.y + 1);
      const d = Math.sqrt(dx * dx + dz * dz);
      // buildings can be worked from a few steps back, so you can watch an upgrade land
      const far = it.kind === 'building' ? 3.5 : 1.4;
      if (d > it.r + far || Math.abs(dy) > 2.2) continue;
      const facing = d < 0.5 ? 1 : (dx * fwd.x + dz * fwd.y) / d;
      if (facing < (it.kind === 'forage' ? 0.7 : d > it.r + 1.4 ? 0.8 : 0.45)) continue;
      // small things on the floor need you to actually look down at them
      if (it.kind === 'forage' && d > 1.2 && this.player.pitch > -0.25) continue;
      // at night the Heartwood only asks for attention when you carry something to offer
      if (it.kind === 'base' && this.waves.phase === 'night' && !this.inventory.relicValue) continue;
      // a seal sits under its altar's own search: the search comes first while it's there
      // a seal comes first while you carry a relic for it (it shares the temple altar's spot)
      const score = facing * 2 - d - (it.kind === 'base' || it.kind === 'building' ? 1.5 : it.kind === 'seal' ? (this.inventory.relicValue > 0 ? -1 : 0.8) : 0);
      if (score > bs) { bs = score; best = it; }
    }
    return best;
  }

  checkDone(chunk: Chunk) {
    if (chunk?.poi && chunk.interactables.every((i) => i.done || i.kind === 'forage')) this.doneSet.add(chunk.poi.key);
  }

  collect(id: string, n = 1, quiet = false) {
    const k = this.inventory.room(id, n);
    const left = n - k + this.inventory.add(id, k);
    if (left > 0) this.overflow(id, left, true);
    if (n - left > 0) {
      const r = RARITY[ITEMS[id].rarity];
      if (!quiet) this.audio.pickup(r.order);
      this.hud.toast(id, n - left);
    }
  }

  // What won't fit in the satchel: the Coffer takes it in camp, otherwise it drops at your feet.
  overflow(id: string, n: number, warn = false) {
    const p = this.player.pos;
    if (this.camp.inCamp(p.x, p.z)) {
      const left = this.coffer.add(id, n);
      this.hud.message(`${ITEMS[id].name}: no room to carry it, so it went in the Coffer`, '#f0c86a');
      if (!left) return;
      n = left;
    } else if (warn) this.hud.message(this.inventory.slotRoom(id) < 1 ? 'Satchel full' : 'Too heavy to carry', '#ff9a7a');
    for (let i = 0; i < n; i++) {
      const pk = this.pickups.spawn(id, p.clone().add(new THREE.Vector3(0, 1, 0)), 0.4);
      if (pk) pk.age = -2;
    }
  }

  // What crafting can see from here: in camp, the built benches and the Coffer as well as the
  // satchel; out in the forest, the satchel and the recipes marked Anywhere.
  craftContext() {
    const p = this.player.pos;
    const atCamp = this.camp.inCamp(p.x, p.z);
    return { atCamp, benches: this.camp.levels, roots: { used: this.rootsUsed, cap: this.rootCap }, src: atCamp ? (this._campSrc ??= new Sources([this.coffer, this.inventory])) : this.inventory };
  }

  craft(recipe: Recipe) {
    const st = this.hud.recipeState(recipe);
    if (!st.ok) {
      this.audio.ui();
      if (!st.where) this.hud.message(st.note, '#ff9a7a');
      return;
    }
    const ctx = this.craftContext();
    if (ITEMS[recipe.out].kind === 'pack') {
      // a backpack goes straight on (the old one is unpicked for its frame)
      if (this.inventory.packId === recipe.out) {
        this.hud.message('You already wear one', '#f3ead2');
        return;
      }
      for (const [id, n] of Object.entries(recipe.needs)) ctx.src.remove(id, n);
      this.inventory.setPack(recipe.out);
      const pk = PACKS[recipe.out];
      this.hud.banner(ITEMS[recipe.out].name, `${pk.cap} kg, ${pk.slots} pockets, ${pk.safe} safe pouch${pk.safe > 1 ? 'es' : ''}`, 'win');
    // (out of camp the source is the satchel alone)
    } else if (!craftFrom(recipe, ctx.src instanceof Sources ? ctx.src : [ctx.src], this.inventory)) {
      this.audio.ui();
      return;
    }
    this.audio.craft();
    this.hud.toast(recipe.out, recipe.n, 'Crafted');
    this.journal.event('craft', recipe.out);
    if (!this.hud.inventoryOpen) return;
    this.hud.renderInventory();
  }

  // Right-click a defence in the satchel: break it down for parts. At the Tinker's Bench in camp
  // that gives back most of what it took; anywhere else, about a third.
  salvage(i: number) {
    const s = this.inventory.slots[i];
    const r = s && recipeFor(s.id);
    if (!r || ITEMS[s.id].kind !== 'build') return;
    const ctx = this.craftContext();
    const full = ctx.atCamp && this.camp.levels.tinker > 0;
    const got = [];
    for (const [id, n] of Object.entries(r.needs)) {
      const m = Math.floor(n * (full ? 0.6 : 0.3) + (full ? 0.5 : 0.34));
      if (m > 0) got.push([id, m]);
    }
    const name = ITEMS[s.id].name;
    s.n--;
    if (s.n <= 0) this.inventory.slots[i] = null;
    this.inventory.changed(s.id);
    for (const [id, m] of got) this.collect(id, m, true);
    this.audio.breakWood();
    this.hud.message(`Salvaged the ${name}: ${got.map(([id, m]) => `${m} ${ITEMS[id].name}`).join(', ')}${full ? '' : " (half the parts: the Tinker's Bench gets more)"}`, '#f0c86a');
  }

  // ------------------------------------------------------------- the Coffer and containers

  // the satchel with something open beside it (a container or the Coffer)
  openPane(pane: OtherPane) {
    this.paneFrame = this.frameNo; // (the E that opened it isn't also the E that shuts it)
    this.hud.toggleInventory(true, pane);
    this.audio.ui();
    this.input.unlock();
  }

  closePane() {
    if (!this.hud.inventoryOpen) return;
    this.hud.toggleInventory(false);
    if (!this.debug) this.input.lock();
  }

  openCoffer() {
    this.camp.openWant = 1;
    this.audio.rummage();
    this.openPane({
      kind: 'coffer', title: 'The Coffer', inv: this.coffer,
      sub: 'Nothing weighs on you in here. Anywhere in camp, crafting draws on the Coffer as well as your satchel.',
      actions: [{ label: 'Store materials', fn: () => this.storeAll() }],
    });
  }

  // every material and bit of salvage in the pack (not the belt or the pouch) into the Coffer
  storeAll() {
    const inv = this.inventory;
    let n = 0;
    for (let i = inv.packStart; i < inv.packStart + inv.packSize; i++) {
      const s = inv.slots[i];
      if (s && ['material', 'scrap'].includes(ITEMS[s.id].kind)) n += transfer(inv, i, this.coffer);
    }
    this.audio.rummage();
    if (n) this.journal.event('store');
    this.hud.message(n ? `Stored ${n} thing${n > 1 ? 's' : ''} in the Coffer` : 'Nothing to store', '#f3ead2');
  }

  openContainer(it: Interactable, rec: Container) {
    this.audio.rummage();
    if (!it.lost) this.journal.event('search');
    this.expedition.opened(it);
    if (rec.broke?.length) {
      this.hud.message(`${rec.broke.map((id) => ITEMS[id].name).join(', ')} broke when you smashed it open`, '#ff9a7a');
      rec.broke = null;
    }
    const name = it.label.replace(/^(Search|Take) (the )?/, '');
    this.openPane({
      kind: 'container', title: name.charAt(0).toUpperCase() + name.slice(1), inv: rec.inv, hidden: rec.hidden, rec, it,
      sub: rec.hidden.size ? 'Searching… click a find to take it.' : 'Click a find to take it. Shift-click your own things to leave them here.',
      actions: [{ label: 'Take all', key: 'R', fn: () => this.takeAll() }],
    });
  }

  takeAll() {
    const o = this.hud.otherPane;
    if (!o?.rec) return;
    let blocked = false;
    o.inv.slots.forEach((s, i) => {
      if (!s || o.hidden?.has(i)) return;
      transfer(o.inv, i, this.inventory);
      if (o.inv.slots[i]) blocked = true;
    });
    if (blocked) this.hud.onFull(null);
    this.audio.pickup(1);
    this.hud.renderInventory();
  }

  closeOther(o: OtherPane) {
    if (o.kind === 'coffer') this.camp.openWant = 0;
    if (o.kind !== 'container') return;
    if (!this.containers.empty(o.rec)) return;
    // emptied: it's done (and maybe fills again some dawn)
    this.containers.forget(o.it.id);
    this.finishContainer(o.it);
  }

  finishContainer(it: Interactable) {
    if (it.lost) {
      this.removeLost(it);
      return;
    }
    if (it.drop) {
      this.expedition.removeDrop(it);
      return;
    }
    if (!it.smashed) it.hide = null; // a prised-open crate stays standing
    this.world.finishInteractable(it, it.chunk);
    if (it.container === 'cache' && it.mesh) {
      it.mesh.setColorAt(it.instance, CACHE_EMPTY);
      it.mesh.instanceColor.needsUpdate = true;
    }
    if (!UNIQUE.has(it.loot)) this.restockable.add(it.id);
    this.checkDone(it.chunk);
  }

  // Dawn: half the emptied containers fill again
  restock() {
    for (const id of [...this.restockable]) {
      if (this.rand() > (id.includes(':c') ? 0.3 : 0.15)) continue;
      this.restockable.delete(id);
      this.world.looted.delete(id);
      for (const ch of this.world.chunks.values()) {
        const it = ch.interactables.find((q) => q.id === id);
        if (!it) continue;
        it.done = false;
        it.smashed = false;
        if (it.label0) it.label = it.label0;
        if (it.hide) for (const o of it.hide) o.visible = true;
        if (it.collider) it.collider.dead = false;
        if (it.container === 'cache' && it.mesh) {
          it.mesh.setColorAt(it.instance, FORAGE_TINT);
          it.mesh.instanceColor.needsUpdate = true;
        }
        if (ch.poi) this.doneSet.delete(ch.poi.key);
      }
    }
  }

  // ------------------------------------------------------------- a lost satchel

  // Fallen out in the forest (or outside the camp at night), your pack drops where you lay. What
  // you use from the belt stays with you (all of it on Warden; on Blightborn the belt drops too,
  // all but the slingshot), and so does the safe pouch; materials, salvage and relics tucked in
  // the belt drop with the pack. Get back to it before the phase turns, or the Blight tramples it.
  dropPack() {
    const mode = difficulty(this.difficulty).keepOnDeath ?? 'pack';
    const p = this.player.pos;
    if (mode === 'all') return;
    if (this.waves.phase !== 'day' && Math.hypot(p.x - this.base.x, p.z - this.base.z) < BUILD_RADIUS) return;
    const inv = this.inventory;
    const take = [];
    inv.slots.forEach((s, i) => {
      if (!s || inv.isSafe(i)) return;
      const k = ITEMS[s.id].kind;
      if (i < inv.hotbar && BELT_KINDS.has(k) && (mode !== 'hotbar' || k === 'tool')) return;
      take.push(i);
    });
    if (!take.length) return;
    const id = `lost:${++this.lostN}`;
    const rec = this.containers.make(id, [], 30, { hidden: false });
    for (const i of take) transfer(inv, i, rec.inv);
    const expires = this.waves.phase === 'day' ? 'day' : 'night';
    this.placeLost(id, p.x, p.z, expires);
    setTimeout(() => this.hud.message(`Your pack lies where you fell ✚ Get back to it before ${expires === 'day' ? 'dusk' : 'dawn'}, or the Blight will trample it`, '#ffd28a'), 5600);
  }

  placeLost(id: string, x: number, z: number, expires: string) {
    const y = terrainHeight(x, z);
    const obj = new THREE.Group();
    const bag = getItemModel('woven_satchel');
    bag.scale.multiplyScalar(2.4);
    bag.rotation.set(-1.3, Math.random() * 6, 0);
    bag.position.y = 0.18;
    obj.add(bag);
    // a pale glow standing over it, so it can be found again (a sprite: no light)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7, fog: false }));
    glow.scale.set(1.6, 1.6, 1);
    glow.position.y = 0.6;
    obj.add(glow);
    const beam = new THREE.Mesh(LOST_BEAM, lostBeamMat());
    beam.frustumCulled = false;
    beam.renderOrder = 2;
    obj.add(beam);
    obj.position.set(x, y, z);
    this.scene.add(obj);
    const it = { kind: 'search', lost: true, id, x, y: y + 0.4, z, r: 1.0, label: 'Your lost satchel', time: 0.4, obj, glow, beam, expires };
    this.world.extra.interactables.push(it);
    this.lost.push(it);
    this.hud.markers.push({ key: id, x, z, icon: '✚', label: 'Lost satchel', cls: 'lost' });
  }

  removeLost(it: Interactable, trampled = false) {
    this.scene.remove(it.obj);
    it.glow.material.dispose();
    it.beam = null;
    it.done = true;
    this.lost = this.lost.filter((q) => q !== it);
    this.world.extra.interactables = this.world.extra.interactables.filter((q) => q !== it);
    this.hud.markers = this.hud.markers.filter((m) => m.key !== it.id);
    this.containers.forget(it.id);
    if (trampled) this.hud.message('The Blight trampled your lost satchel', '#ff9a7a');
  }

  // the phase turned: satchels dropped in the last one are gone
  expireLost(phase: string) {
    for (const it of [...this.lost]) if (it.expires === phase) this.removeLost(it, true);
  }

  // ------------------------------------------------------------- noise

  // Something loud at (x, z): the Blight within r hear it (Enemies reads game.noises)
  makeNoise(r: number, at: { x: number; z: number } = this.player.pos) {
    this.noises.push({ x: at.x, z: at.z, r, t: 0.3 });
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

  applyConsumable(id: string) {
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
      this.makeNoise(26);
      this.audio.swing();
    } else if (def.salve) {
      let n = 0;
      for (const b of this.buildings.list) {
        if (Math.hypot(b.x - p.x, b.z - p.z) > 20 || b.def.kind === 'trap' || b.def.kind === 'snare') continue;
        b.heal();
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
  useFromSatchel(i: number) {
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

  dropSlot(i: number) {
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
    this.precompile();
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
      this.audio.raw?.windup?.call(this.audio, 0.4);
    }
  }

  // Dawn, from day 3: Husks walk the forest in twos and threes, round the old camps, crates and
  // wrecks, hunting by sound. More of them each day; they never come near the camp.
  sproutHusks() {
    const n = this.waves.night;
    if (n < 2) return;
    const groups = Math.min(6, n);
    const b = this.base;
    const cx = Math.floor(b.x / CHUNK_SIZE), cz = Math.floor(b.z / CHUNK_SIZE);
    // round the places worth searching, 50-170 m out (or open forest when there aren't enough)
    const spots = poisAround(cx, cz, 3).filter((p) => {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      return d > 50 && d < 170 && p.type !== 'temple';
    }).sort(() => this.rand() - 0.5);
    for (let k = 0; k < groups; k++) {
      let c = spots[k];
      if (!c) {
        const a = this.rand() * Math.PI * 2, d = 60 + this.rand() * 90;
        c = { x: b.x + Math.cos(a) * d, z: b.z + Math.sin(a) * d, radius: 6 };
      }
      if (terrainHeight(c.x, c.z) < WATER_LEVEL + 0.2) continue;
      // a round of three points about the spot
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + this.rand(), r = (c.radius || 6) + 6 + this.rand() * 10;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (terrainHeight(x, z) > WATER_LEVEL + 0.1) pts.push({ x, z });
      }
      if (pts.length < 2) continue;
      const m = 2 + (this.rand() < 0.4 + n * 0.04 ? 1 : 0);
      for (let i = 0; i < m; i++) {
        const e = this.enemies.spawn('husk', pts[0].x + (i - 1) * 1.6, pts[0].z + (this.rand() - 0.5) * 2, this.waves.hpScale * 0.85);
        e.patrol = { pts, i: (i + 1) % pts.length, x: c.x, z: c.z, leash: 70 };
      }
    }
    if (!this.seenHusk) {
      this.seenHusk = true;
      setTimeout(() => this.hud.message('Husks walk the forest by day ✚ They hunt by sound: a sprint, a heavy pack, a smashed crate all carry', '#ffc080'), 6000);
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

  hitBloom(b: Bloom, dmg: number, at: THREE.Vector3, crit = false) {
    const killed = this.blooms.damage(b, dmg);
    this.particles.chipBurst(at.clone(), 0x7a3a9a, crit ? 16 : 10, b.y);
    this.particles.sporeBurst(at.clone(), 0xb050ff, 8, 0.6);
    this.hud.damageNumber(at.clone().add(new THREE.Vector3(0, 0.5, 0)), Math.round(dmg), crit ? 'crit' : '');
    this.audio.enemyHit();
    if (killed) this.onBloomCleansed(b);
    return killed;
  }

  onBloomCleansed(b: Bloom) {
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

  updateSling(dt: number, input: Input) {
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
    this.makeNoise(6);
    this.machete.sling.release(k);
    this.audio.slingRelease(k);
    this.player.shake = Math.max(this.player.shake, 0.15 + k * 0.2);
  }

  // ------------------------------------------------------------- interaction

  // Interactions that need E or F (tap or hold).
  interact(dt: number, input: Input) {
    const it = this.findInteractable();
    const holdAction: HoldAction = (label, time, done, sub = '', key = 'KeyE') => {
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
      this.hud.prompt(label, prog, key.replace('Key', ''), sub);
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
    } else if (it.kind === 'search' || it.kind === 'break') {
      this.interactContainer(it, holdAction, input);
    } else if (it.kind === 'camp') {
      this.interactCamp(it, holdAction, input);
    } else if (it.kind === 'seal') {
      this.expedition.interactSeal(it, holdAction);
    } else if (it.kind === 'base') {
      this.interactBase(holdAction, input);
    } else if (it.kind === 'building') {
      this.interactBuilding(it.building, holdAction, input);
    }
  }

  // A container: searched open with E (a crate can also be smashed with the machete: quicker,
  // loud, and fragile things inside may break). Once open, a tap of E opens it again.
  interactContainer(it: Interactable, holdAction: HoldAction, input: Input) {
    const rec = this.containers.get(it.id);
    if (rec) {
      const left = this.containers.left(rec);
      this.hud.prompt(it.label, 0, 'E', left ? `${left} thing${left > 1 ? 's' : ''} inside · tap to open` : 'Empty · tap to open');
      if (input.hit('KeyE')) this.openContainer(it, rec);
      return;
    }
    const open = (smashedNoise) => {
      if (smashedNoise) this.makeNoise(smashedNoise);
      const r = this.containers.roll(it, this.rand, { bonus: this.mods.lootBonus });
      this.particles.sparkle(new THREE.Vector3(it.x, it.y + 0.3, it.z), 0xffe0a0, 10);
      this.openContainer(it, r);
    };
    if (it.kind === 'break') {
      // prise it open quietly, or (locked, without a pry bar) force it, which carries
      const bar = this.inventory.count('pry_bar') > 0;
      const t = it.locked ? (bar ? 1.4 : 4.5) : bar ? 1.0 : 2.5;
      it.maxHp ??= it.hp;
      const label = it.locked ? `${bar ? 'Prise' : 'Force'} the lock · ${it.label}` : `Prise open · ${it.label}`;
      const sub = it.locked && !bar ? 'Slow and loud. A pry bar opens it quietly. Or swing to smash it' : `Quiet. Or swing to smash it (${Math.max(0, it.hp)} blow${it.hp === 1 ? '' : 's'}): quick and loud, shakes out one more find, but fragile things may break`;
      holdAction(label, t, () => open(it.locked && !bar ? 28 : 0), sub);
      return;
    }
    const verb = /^(Search|Take)/.test(it.label) ? it.label : `Search the ${it.label.toLowerCase()}`;
    holdAction(verb, (it.time || 1.5) * 0.5, () => open(0));
  }

  // The Coffer (tap E) and the benches: build one, or raise it a level (hold E).
  interactCamp(it: Interactable, holdAction: HoldAction, input: Input) {
    const id = it.site;
    if (id === 'coffer') {
      const used = this.coffer.used;
      this.hud.prompt('The Coffer', 0, 'E', `${used ? `${used} stack${used > 1 ? 's' : ''} stored` : 'Empty'} · tap to open`);
      if (input.hit('KeyE')) this.openCoffer();
      return;
    }
    const B = BENCHES[id], lv = this.camp.levels[id], cost: Record<string, number> | null = this.camp.nextCost(id);
    const src = this.craftContext().src;
    // F at the benches: the Thornback's heart into the Workbench; Hollis's radio at the Tinker's
    // When the story's next step is in hand it is the prompt's title (F); raising the bench
    // (E) is still there below it
    let fHint = '';
    const X = this.expedition;
    const raise = cost ? ` · or hold <kbd>E</kbd>: ${lv ? `raise to level ${lv + 1}` : 'build it'}` : '';
    if (id === 'bench' && lv >= 1 && !X.grafting && this.inventory.count('thornback_heart')) {
      if (!input.down('KeyE')) {
        holdAction("Set the Thornback's heart into the Workbench", 1.6, () => this.learnGrafting(), `It still beats. Its roots will teach the bench to graft${raise}`, 'KeyF');
        return;
      }
    }
    if (id === 'tinker' && lv >= 1) {
      const rp = X.radioPrompt(src);
      if (rp.have && !input.down('KeyE')) {
        holdAction(`Fit the ${ITEMS[rp.id].name} to Hollis's radio`, 2.0, () => X.fitPart(src), `${X.radio + 1}/4 · each part calls a supply drop at noon${raise}`, 'KeyF');
        return;
      }
      fHint = ` · ${rp.text}`;
    }
    if (!cost) {
      this.hud.prompt(`${B.name} · level 3`, 0, B.glyph, `${B.blurb}${fHint}`);
      return;
    }
    const label = lv ? `Raise the ${B.name} to level ${lv + 1}` : `Build the ${B.name}`;
    const gain = lv ? `unlocks tier ${lv + 1} upgrades for what's made here` : B.blurb;
    const sub = `${this.hud.costHtml(cost, src)} · ${gain}${fHint}`;
    if (!src.canAfford(cost)) {
      this.hud.prompt(label, 0, 'E', sub);
      return;
    }
    holdAction(label, 1.6, () => {
      for (const [k, n] of Object.entries(cost)) src.remove(k, n);
      this.camp.setLevel(id, lv + 1);
      const s = this.camp.sites[id];
      const at = new THREE.Vector3(s.x, s.y + 0.8, s.z);
      this.particles.sparkle(at, 0xffe08a, 30);
      this.particles.dust(at.clone().setY(s.y + 0.1), 16, 1.2);
      this.audio.upgrade();
      this.journal.event('bench', id);
      this.hud.banner(B.name, lv ? `Level ${lv + 1}: ${gain}` : `Built. ${B.blurb}`, 'win');
      this.precompile();
    }, sub);
  }

  // the item the prompt means lights up, with a glint now and then, so you can find it among
  // the leaves
  highlightForage(it: Interactable | null) {
    const prev = this.hiForage;
    if (prev !== it) {
      if (prev && !prev.done) {
        prev.mesh.setColorAt(prev.instance, FORAGE_TINT);
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

  takeForage(it: Interactable) {
    if (!this.inventory.takeable(it.id, 1)) {
      this.hud.message(this.inventory.slotRoom(it.id) < 1 ? 'Satchel full' : 'Too heavy: your pack can take no more', '#ff9a7a');
      this.gathering = false;
      return false;
    }
    this.world.takeForage(it);
    this.collect(it.id);
    this.journal.event('forage');
    this.particles.sparkle(new THREE.Vector3(it.x, it.y, it.z), RARITY[ITEMS[it.id].rarity].color, 8);
    return true;
  }

  nearestForage(r: number) {
    const p = this.player.pos;
    let best = null, bd = r;
    for (const it of this.world.near(p.x, p.z, 'interactables')) {
      if (it.done || it.kind !== 'forage' || Math.abs(it.y - p.y) > 1.6) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // Root capacity: how much building the Heartwood can feed. It grows each night, with relics
  // buried in it, and with the difficulty
  get rootCap() {
    return Math.round((12 + 2 * (this.waves.night - 1)) * (difficulty(this.difficulty).roots ?? 1)) + this.rootBonus + (this.mods.roots || 0);
  }

  // each upgrade tier draws one more root, so the cap is a real choice between more and better
  get rootsUsed() {
    let n = 0;
    for (const b of this.buildings.list) if (!b.dead) n += (ROOTS[b.id] || 1) + (b.tier - 1);
    return n;
  }

  // what burying the relics you carry would add (a root for every 15 of a relic's worth)
  get relicRoots() {
    let n = 0;
    for (const s of this.inventory.slots) if (s && ITEMS[s.id].kind === 'relic') n += Math.max(1, Math.floor(ITEMS[s.id].value / 15)) * s.n;
    return n;
  }

  interactBase(holdAction: HoldAction, input: Input) {
    const relics = this.inventory.relicValue;
    const next = thresholds(this.boonsTaken + this.pendingBoons);
    if (relics > 0 && input?.down('KeyF')) {
      holdAction('Bury the relics in the roots', 1.4, () => this.buryRelics(), `+${this.relicRoots} root capacity (now ${this.rootsUsed}/${this.rootCap})`, 'KeyF');
    } else if (relics > 0) {
      holdAction('Offer relics to the Heartwood', 1.2, () => this.offerRelics(), `+${relics} favour · +${relics} HP · next boon at ${next} · or hold <kbd>F</kbd> to bury them: +${this.relicRoots} roots`);
    } else if (this.waves.phase === 'day' && !this.waves.skipping) {
      holdAction('Call the night early', 1.5, () => this.waves.callNight(), `Heartwood ${Math.ceil(this.base.hp)}/${this.base.maxHp} · favour ${this.favour}/${next} · roots ${this.rootsUsed}/${this.rootCap}`);
    } else {
      this.hud.prompt(`Heartwood · ${Math.ceil(this.base.hp)} / ${this.base.maxHp}`, 0, '❦', `favour ${this.favour}/${next} · roots ${this.rootsUsed}/${this.rootCap}`);
    }
  }

  buryRelics() {
    const n = this.relicRoots;
    for (const s of this.inventory.slots) if (s && ITEMS[s.id].kind === 'relic') this.inventory.remove(s.id, s.n);
    this.rootBonus += n;
    this.particles.sparkle(new THREE.Vector3(this.base.x, this.base.y + 0.4, this.base.z), 0x9ad060, 40);
    this.particles.leafBurst(new THREE.Vector3(this.base.x, this.base.y + 0.5, this.base.z), 0x4f8a30, 24, this.base.y);
    this.audio.upgrade();
    this.hud.banner('The roots spread', `+${n} root capacity · ${this.rootsUsed}/${this.rootCap}`, 'win');
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
    const mem = DAILY ? new Set() : unlocked();
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

  interactBuilding(b: Building, holdAction: HoldAction, input: Input) {
    const glyphs = b.grafts.map((g) => GRAFTS[g].glyph).join('');
    const name = `${TIER_NAMES[b.tier] ? `${TIER_NAMES[b.tier]} ` : ''}${ITEMS[b.id].name}${glyphs ? ` ${glyphs}` : ''}`;
    const day = this.waves.phase === 'day' || this.waves.phase === 'dawn';
    const hp = `${Math.ceil(b.hp)}/${b.maxHp}`;
    let packHint = day ? ' · hold <kbd>F</kbd> to pack up' : '';
    // F: pack it back into the satchel (day only); its grafts come off with it
    if (day && input.down('KeyF')) {
      holdAction(`Pack up ${name}`, 1.2, () => {
        this.buildings.remove(b);
        this.collect(b.id);
        for (const g of b.grafts) this.collect(g);
      }, b.tier > 1 ? 'Upgrades are lost' : '', 'KeyF');
      return;
    }
    // G: graft something you carry onto it
    if (this.expedition.grafting && b.graftRoom > 0) {
      const graft = this.inventory.slots.find((s) => s && ITEMS[s.id].kind === 'graft' && b.canGraft(s.id))?.id;
      if (graft && input.down('KeyG')) {
        holdAction(`Graft the ${ITEMS[graft].name} onto ${name}`, 1.3, () => this.graftOn(b, graft), GRAFTS[graft].say, 'KeyG');
        return;
      }
      if (graft) packHint += ` · hold <kbd>G</kbd>: graft the ${ITEMS[graft].name} (${GRAFTS[graft].say})`;
      else packHint += ` · ${b.graftRoom} graft slot${b.graftRoom > 1 ? 's' : ''} free`;
    }
    const src = this.craftContext().src;
    if (b.repairable) {
      const cost = b.repairCost;
      const ok = src.canAfford(cost);
      const sub = `${this.hud.costHtml(cost, src)}${packHint}`;
      if (ok) {
        holdAction(`Repair ${name} (${hp})`, 1.0, () => {
          for (const [id, n] of Object.entries(cost)) src.remove(id, n);
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
      // tier t needs the bench it's made at to be level t
      const bid = benchOf(b.id) === 'field' ? 'bench' : benchOf(b.id);
      const need = b.tier + 1;
      const label = `Upgrade to ${TIER_NAMES[b.tier + 1]} (tier ${b.tier + 1})`;
      if (this.camp.levels[bid] < need) {
        this.hud.prompt(`${name} · ${label}`, 0, '⚒', `Needs the ${BENCHES[bid].name} at level ${need}${packHint}`);
        return;
      }
      if (this.rootsUsed + 1 > this.rootCap) {
        this.hud.prompt(`${name} · ${label}`, 0, '⚒', `The Heartwood can't feed another root (${this.rootsUsed}/${this.rootCap}): pack something up, or bury a relic${packHint}`);
        return;
      }
      const ok = src.canAfford(cost);
      const sub = `${this.hud.costHtml(cost, src)} · +1 root <small>(${this.rootsUsed}/${this.rootCap})</small>${packHint}`;
      if (ok) {
        holdAction(label, 1.4, () => {
          for (const [id, n] of Object.entries(cost)) src.remove(id, n);
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
  updateBuild(input: Input) {
    const held = this.inventory.held;
    const def = held && BUILD_DEFS[held.id];
    if (!def || !this.playerAlive) {
      this.ghost.hide();
      this.hud.buildHint(null);
      return false;
    }
    this.ghost.show(held.id);
    if (input.hit('KeyR') && def.rotates) this.ghost.rot += Math.PI / 4;
    const roots = { used: this.rootsUsed, cap: this.rootCap };
    this.ghost.update(this.camera, this.buildings, { base: this.base, player: this.player.pos, mods: this.mods, roots });
    const rot = def.rotates ? ' · <kbd>R</kbd> rotate' : '';
    const rc = ` · roots ${ROOTS[held.id] || 1} <small>(${roots.used}/${roots.cap})</small>`;
    this.hud.buildHint(this.ghost.valid ? `<kbd>LMB</kbd> place ${ITEMS[held.id].name}${rot}${rc}` : this.ghost.reason, this.ghost.valid);
    if (input.mouse.clicked) {
      if (this.ghost.valid) {
        const g = this.ghost;
        const b = this.buildings.place(held.id, g.pos.x, g.pos.z, g.rot);
        this.inventory.remove(held.id, 1);
        this.audio.place();
        this.particles.dust(g.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 14, def.r);
        this.journal.event('place', held.id);
        // a Heartseed sapling pushes the Rot back round itself
        if (def.ward && this.rot.clearAround(b.x, b.z, def.ward, 3)) {
          this.rot.dirty = true;
          this.particles.sparkle(new THREE.Vector3(b.x, b.y + 0.8, b.z), 0x9affb0, 40);
          this.journal.event('burnrot');
        }
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
      } as CombatCtx;
      this._ctx.damageCtx = this._ctx;
    }
    this._ctx.field = this.field;
    this._ctx.mods = this.mods;
    this._ctx.rain = this.weather.raining;
    return this._ctx;
  }

  onEnemyDamage(e: Enemy, n: number, opts: HitInfo) {
    const at = this.enemies.chest(e).clone();
    at.y += 0.4 * e.def.scale;
    const near = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 22;
    const src = opts.source;
    // resisted, a weakness, or the crust took it
    const rk = opts.shield && n <= 0 ? ' shield' : opts.k < 0.95 ? ' weak' : opts.k > 1.05 ? ' strong' : '';
    if (opts.shield && n <= 0) {
      if (near) this.hud.damageNumber(at, '◆', 'shield');
    } else if (src === 'burn') {
      if (near) this.hud.damageNumber(at, n, `burn${rk}`);
    } else if (src === 'melee' || src === 'sling' || src === 'fire') {
      this.hud.damageNumber(at, n, (opts.crit ? 'crit' : '') + rk);
    } else if (near) this.hud.damageNumber(at, n, `tower${rk}`);
  }

  onKill(e: Enemy, opts: HitInfo = {}) {
    const at = this.enemies.chest(e).clone();
    // a burst that fills the screen at arm's length reads as a glitch: scale it with distance
    const d = at.distanceTo(this.camera.position);
    const k = clamp(d / 8, 0.4, 1);
    const big = e.def.boss ? 4 : e.type === 'rotboar' ? 2 : 1;
    this.particles.sporeBurst(at, 0xb050ff, Math.round(18 * big * k + 6), (0.6 + 0.4 * k) * (e.def.boss ? 2 : 1));
    this.particles.ash(at, 10 * big, 0.6 * e.def.scale);
    this.audio.enemyDie(e.type !== 'blightling' && e.type !== 'wisp');
    this.loot(e.def.loot, at, 0.8);
    // under the Blood Moon everything they drop drops twice
    if (this.waves.sign === 'blood' && this.waves.phase === 'night') this.loot(e.def.loot, at, 0.8);
    if (e.affix) {
      this.stats.elites++;
      this.loot('elite', at, 1);
      if (e.affix === 'bloated') {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + this.rand();
          this.enemies.spawn('blightling', e.pos.x + Math.cos(a) * 1.4, e.pos.z + Math.sin(a) * 1.4, this.waves.hpScale * 0.6).rise = 0.3;
        }
        this.particles.sporeBurst(at, 0xd0ff40, 40, 1.4);
        this.audio.splat?.(this.near(e.pos));
      }
    }
    if (this.mods.killHeal && this.playerAlive) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.mods.killHeal);
    // Rotting Bloom: a slowed Blight bursts into spores that slow its neighbours
    if (this.mods.sporeBurst && e.slowT > 0 && e.slow < 1) {
      for (const o of this.enemies.inRadius(e.pos.x, e.pos.z, 4, { ground: true })) this.enemies.slowDown(o, 0.5, 3);
      this.particles.sporeBurst(at, 0xa0e040, 30, 1.2);
      this.particles.ring(e.pos.clone(), 4, 0x9ae040, 0.5);
    }
    if (opts.source === 'sling') this.hud.hitmarker(true, opts.crit);
    if (opts.source === 'melee') this.journal.event('melee', e.type);
    if (e.def.boss) {
      this.stats.bosses++;
      this.particles.ring(e.pos.clone(), 9, 0xff60c0, 1.2);
      this.lights.flash(at, 0xff60c0, 120, 0.6, 30);
      this.player.shake = 1.2;
      this.audio.roar();
      if (e.type === 'rot_mother') this.hud.banner('The Rot Mother falls', 'She splits like rotten fruit. Whatever Dr. Vane was is gone into the soil.', 'win');
      else this.hud.banner('The Thornback falls', 'Its sac bursts. Something precious spills out.', 'win');
    }
  }

  hitPlayer(dmg: number) {
    if (!this.playerAlive) return;
    dmg *= this.mods.playerArmor;
    this.player.hp -= dmg;
    this.lastHit = 0;
    this.player.shake = 0.8;
    this.hud.hurt(0.4 + dmg / 40);
    this.audio.hurt();
    if (this.hud.otherPane?.kind === 'container') this.closePane();
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.deadT = RESPAWN;
      this.closePane();
      this.dropPack();
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
  rootPulse(dt: number) {
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

  hitBase(dmg: number, e: Enemy) {
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

  onSlam(e: Enemy) {
    const f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const at = e.pos.clone().addScaledVector(f, 2.2);
    at.y = terrainHeight(at.x, at.z);
    const R = 6;
    for (const b of [...this.buildings.list]) {
      const d = b.distTo(at.x, at.z);
      if (d < R) {
        this.buildings.damage(b, 85 * (1 - (d / R) * 0.5));
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
  // the Rot Mother lays three eggs behind her as she walks
  layEggs(e: Enemy) {
    // two at a time on night 10 (with the surge round her, three were too many), three after
    const n = this.waves.night >= 15 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = e.yaw + Math.PI + (i - (n - 1) / 2) * 0.8;
      const x = e.pos.x + Math.sin(a) * 3, z = e.pos.z + Math.cos(a) * 3;
      const egg = this.enemies.spawn('rot_egg', x, z, this.waves.hpScale * 0.7);
      egg.rise = 0.4;
      this.particles.dust(new THREE.Vector3(x, e.pos.y + 0.1, z), 12, 0.8, 0x5a3a4a);
    }
    this.audio.splat?.(this.near(e.pos));
  }

  summon(e: Enemy) {
    for (let i = 0; i < 3; i++) {
      const a = e.yaw + Math.PI + (i - 1) * 0.9;
      const x = e.pos.x + Math.sin(a) * 2.6, z = e.pos.z + Math.cos(a) * 2.6;
      this.enemies.spawn('blightling', x, z, this.waves.hpScale);
      this.particles.ash(new THREE.Vector3(x, e.pos.y + 1, z), 12, 0.8);
    }
    this.audio.roar();
  }

  // 1 beside the player, 0 at 40 m: how loud something out in the clearing sounds
  near(p: { x: number; z: number }) {
    return Math.max(0, 1 - Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) / 40);
  }

  onWindup(e: Enemy, kind: string) {
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
      upgraded: this.buildings.stats.upgraded, boons: this.perks.length, bosses: this.stats.bosses, score: this.score,
      daily: DAILY,
    };
  }

  // the vigil's score (nights held, Blight felled, bosses, by the difficulty)
  get score() {
    return scoreOf({ nights: this.waves.night - 1, kills: this.enemies.kills, bosses: this.stats.bosses }, this.difficulty);
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

  // Ten nights held. What it ends in depends on the run: the idol set back in the Sun Seal (the
  // true ending), the radio mended (a plane at first light: fly out, or stay), or the bloom.
  onVictory() {
    this.base.bloom(this.flora);
    this.lights.flash(this.base.heartPos, 0xffe8a0, 200, 1.2, 50);
    this.particles.sporeBurst(this.base.heartPos, 0xfff0c8, 120, 3);
    this.audio.victory();
    const X = this.expedition;
    this.hud.banner(X.idolSet ? 'The Seals hold' : 'The Heartwood blooms', X.idolSet ? 'The idol is home. Ten nights held.' : 'Ten nights held.', 'win');
    this.particles.sparkle(this.base.heartPos, 0xb8ffcf, 60);
    if (X.idolSet && !this.debug) {
      // the true ending's achievement lands now, not at some later dawn
      checkAchievements(addRecords({ sealed: 1 })).forEach((a, i) => setTimeout(() => {
        this.hud.message(`Achievement: ${a.glyph} ${a.name} · ${a.desc}`, '#f0d890');
        this.audio.pickup(3);
      }, 4000 + i * 3000));
    }
    setTimeout(() => {
      this.modal = 'victory';
      this.input.unlock();
      const best = recordBest(this.waves.night - 1, this.enemies.kills, this.score);
      const stats = { ...this.runStats(), best };
      const stay = () => {
        if (X.idolSet) {
          this.hud.showEnding({
            kind: 'true', eyebrow: 'Ten nights held · the true ending', title: 'The Seals Hold', stats,
            lead: 'The idol sits in the Sun Seal, and the lines cut into the altar close round it like a hand. The Heartwood blooms. The doors are shut again, the way Ruiz\'s grandmother said they should be. The Blight still come out of the soil, but now they can be beaten back for good.',
            buttons: [{ label: 'Keep going', primary: true, fn: () => this.continueEndless() }, { label: 'Title screen', fn: () => location.reload() }],
          });
        } else this.hud.victory(stats);
      };
      if (X.radioDone) {
        this.hud.showEnding({
          kind: 'flight', eyebrow: 'Ten nights held · first light', title: 'The Rescue Plane',
          lead: 'Engines over the ridge, the first in years. A float plane comes down on the river flats and taxis in, and someone on the wing is waving. Hollis\'s people came. There is room for one, and the Heartwood cannot come with you.',
          buttons: [{ label: 'Fly out', primary: true, fn: () => this.flyOut(stats) }, { label: 'Stay with the Heartwood', fn: stay }],
        });
      } else stay();
    }, 2600);
  }

  // The escape ending: you fly out, and the run is over
  flyOut(stats: Record<string, unknown>) {
    if (!this.debug) addRecords({ flights: 1 });
    this.bankRecords();
    clearSave();
    this.expedition.flown = true;
    this.hud.showEnding({
      kind: 'flight', eyebrow: 'The escape ending', title: 'The Last Flight', stats,
      lead: 'You fly out at dawn. Below, the clearing shrinks to a green coin and then to nothing, and the forest closes over it. Somewhere down there the Heartwood is still holding, for as long as it can. You will draw this map again from memory, and get it wrong on purpose.',
      buttons: [{ label: 'Title screen', primary: true, fn: () => location.reload() }],
    });
  }

  // ---------------------------------------------------------------- the expedition

  // a page read: by day it opens (the world waits); at night it's kept for the satchel's Notes
  onPage(q: Note) {
    this.audio.pickup(2);
    if (this.waves.phase === 'night' || this.modal || this.debug) {
      this.hud.message(`A page: "${q.title}" ✚ read it in the satchel (Tab, Notes)`, '#e8d8a8');
      return;
    }
    const wasOpen = this.hud.inventoryOpen;
    this.modal = 'note';
    this.input.unlock();
    this.hud.showNote(q, () => {
      this.modal = null;
      if (q.map) this.hud.message('Marked on your compass ✕', '#e8a080');
      if (!wasOpen && !this.hud.inventoryOpen && !this.debug) this.input.lock();
    });
  }

  learnGrafting() {
    this.inventory.remove('thornback_heart', 1);
    this.expedition.grafting = true;
    const s = this.camp.sites.bench;
    const at = new THREE.Vector3(s.x, s.y + 0.9, s.z);
    this.particles.sparkle(at, 0xff6080, 40);
    this.particles.leafBurst(at, 0x4f8a30, 24, s.y);
    this.audio.boon();
    this.journal.flag('heart');
    this.hud.banner('Grafting', 'The heart beats into the bench and roots spread through the grain. Tier 2 towers take a graft, tier 3 two: hold G on a tower with one in your satchel.', 'win');
  }

  graftOn(b: Building, id: string) {
    this.inventory.remove(id, 1);
    this.stats.grafts++;
    b.addGraft(id);
    b.popT = 0.6;
    this.particles.sparkle(new THREE.Vector3(b.x, b.y + 1.6, b.z), GRAFTS[id].color, 26);
    this.audio.upgrade();
    this.journal.event('graft');
    this.hud.banner(ITEMS[b.id].name, `grafted: ${ITEMS[id].name}, ${GRAFTS[id].say}`, 'win');
  }

  // the Heartseed saplings standing (the Rot keeps out of their reach)
  wards() {
    return this.buildings.list.filter((b) => !b.dead && b.def.ward).map((b) => ({ x: b.x, z: b.z, r: b.def.ward }));
  }

  burnRot(x: number, z: number, r: number, amount: number) {
    if (!this.rot.any) return;
    if (this.rot.burn(x, z, r, amount) && amount >= 0.5) {
      this.journal.event('burnrot');
      this.stats.burns++;
    }
  }

  // Once a second: braziers burn back the Rot round them, towers standing on it choke, and the
  // ground is repainted when it has changed (at most every few seconds)
  tickRot(dt: number) {
    if (!this.rot.any) return;
    this.rotT = (this.rotT ?? 0) - dt;
    if (this.rotT > 0) return;
    this.rotT = 1;
    for (const b of this.buildings.list) {
      if (b.dead) continue;
      if (b.def.kind === 'fire') this.burnRot(b.x, b.z, b.stat('range', this.mods) * 0.9, 0.06);
      b.rotK = this.rot.at(b.x, b.z);
      // a tower whose roots are choking breathes out violet spores (it fires slower)
      if (b.rotK > 0.3 && b.def.range) this.particles.sparkle(new THREE.Vector3(b.x, b.y + 1.6, b.z), 0xa070d0, 3 + Math.round(b.rotK * 4));
    }
    this.rewearT = (this.rewearT ?? 0) - 1;
    if (this.rot.dirty && this.rewearT <= 0) {
      this.rot.dirty = false;
      this.rewearT = 5;
      this.world.wearAll();
      for (const layer of [this.grass, this.litter, this.groundCover]) layer.reset();
    }
  }

  // a sign tonight (or none): the fog thins the towers' sight
  applySign(sign: string | null) {
    this.mods.fogRange = sign === 'fog' ? 0.7 : 1;
    this.signFog = sign === 'fog' ? 1 : 0;
    this.signMoon = sign === 'blood' ? 1 : 0;
  }

  // the rifts' compass marks say which a seal holds
  syncRifts() {
    this.rifts.forEach((r, i) => {
      const m = this.hud.markers.find((q) => q.key === `rift${i}`);
      if (!m) return;
      const asleep = this.expedition.dormant(r);
      m.label = asleep ? 'Rift (sealed)' : 'Rift';
      m.cls = asleep ? 'rift sealed' : 'rift';
    });
  }

  continueEndless() {
    this.hud.hideVictory();
    this.modal = null;
    if (!this.debug) this.input.lock();
  }

  // ---------------------------------------------------------------- loop

  setPaused(p: boolean) {
    this.paused = p;
  }

  frame(ts: number) {
    this.timer.update(ts);
    let dt = Math.min(Math.max(this.timer.getDelta(), 0), 0.05);
    const t = this.timer.getElapsed();
    const realDt = dt;
    // hit-stop: the world freezes for a beat when the machete connects
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.06;
    }
    // capture mode can hold the world still while the camera moves
    if (this.capture?.freeze) dt = 0;
    // the Heartwood falls in slow motion
    if (this.overT > 0) {
      dt *= 0.35;
      this.overT -= realDt;
      if (this.overT <= 0) {
        this.modal = 'over';
        this.input.unlock();
        const best = recordBest(this.waves.night - 1, this.enemies.kills, this.score);
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
    input.poll(realDt);
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
    this.player.burden = this.inventory.burden;
    // in camp or out: the chip by the belt says when the benches and the Coffer count
    {
      const inCamp = this.camp.inCamp(this.player.pos.x, this.player.pos.z);
      if (inCamp !== this.wasInCamp) {
        this.wasInCamp = inCamp;
        (this.campChip ??= document.getElementById('camp-chip'))?.classList.toggle('on', inCamp);
        if (this.hud.inventoryOpen) this.hud.renderInventory();
      }
    }
    // capture mode (F8): a free camera for trailers and screenshots; F9 hides the HUD alone
    if (input.hit('F8') && !this.title && !over) this.toggleCapture();
    if (input.hit('F9') && !this.title) {
      this.hudHidden = !this.hudHidden;
      this.hud.show(!this.hudHidden);
    }
    if (this.capture) {
      this.updateCapture(realDt, input);
    } else if (active && this.playerAlive) {
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

    // a container or the Coffer open: it's searched while you look; R takes everything, E shuts it
    const pane = this.hud.inventoryOpen ? this.hud.otherPane : null;
    if (pane) {
      if (pane.rec) {
        const was = pane.searching;
        if (!input.down('KeyE')) pane.released = true;
        const i = pane.released ? this.containers.search(pane.rec, realDt) : -1;
        pane.searching = pane.rec.searching;
        pane.prog = pane.rec.prog;
        if (i >= 0) {
          this.audio.pickup(RARITY[ITEMS[pane.rec.inv.slots[i].id].rarity].order);
          this.hud.revealFlash(i);
          if (!pane.rec.hidden.size) pane.sub = 'Click a find to take it. Shift-click your own things to leave them here.';
        }
        if (i >= 0 || was !== null || pane.searching !== null) this.hud.renderOther();
      }
      if (input.hit('KeyR') && pane.rec) this.takeAll();
      else if ((input.hit('KeyE') || input.hit('Escape')) && this.paneFrame !== this.frameNo) {
        this.closePane();
        this.audio.ui();
      }
    }
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
    // the forest streams round the camera in capture mode (the player stays where they were)
    const stream = this.capture ? this.capture.pos : pos;
    const chunks = this.world.chunks.size;
    this.world.update(stream.x, stream.z, dt);
    if (this.world.chunks.size > chunks) this.precompile();
    this.litter.update(stream.x, stream.z);
    this.groundCover.update(stream.x, stream.z);
    // blades clear out from under anything built since
    const bl = this.buildings.list, bloomsUp = this.blooms.alive;
    const sig = bl.reduce((a, b) => a + b.x * 1.7 + b.z, bl.length) + bloomsUp.reduce((a, b) => a + b.x * 3.1 + b.z * 0.7, 0);
    if (sig !== this.grassSig) {
      this.grassSig = sig;
      this.grass.setBlockers([...bl.flatMap((b) => b.footprint), ...bloomsUp.map((b) => ({ x: b.x, z: b.z, r: 2.4 }))]);
    }
    this.grass.update(stream.x, stream.z);
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
      // (no rain under the Stillness)
      if (w.phase === 'night' || (w.phase === 'day' && this.sky.time > DUSK - 0.03)) this.weather.target = w.rainTonight && w.sign !== 'still' ? 1 : 0;
      this.waves.update(dt, { fastForward: input.down('KeyT') && active });
      if (w.phase === 'night') this.trample.step(dt, this.enemies.list);
      // how far your footsteps carry: walking a little, sprinting or under a heavy pack a long way
      {
        const pl = this.player, sp = Math.hypot(pl.vel.x, pl.vel.z);
        let nr = sp < 0.6 || !this.playerAlive ? 0 : pl.sprinting ? 14 : 4.5;
        if (sp >= 0.6 && pl.burden === 'encumbered') nr = Math.max(nr, 12);
        else if (sp >= 0.6 && pl.burden === 'laden') nr += 3;
        this.playerNoise = nr;
      }
      this.enemies.update(dt, t, {
        noises: this.noises, playerNoise: this.playerNoise,
        onAlert: (e) => {
          const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
          if (d < 30) this.audio.windup?.(0.5);
          if (d < 40) this.hud.heard();
        },
        field: this.field, base: this.base, player: pos, playerAlive: this.playerAlive,
        buildings: this.buildings.list, particles: this.particles, damageCtx: ctx,
        night: this.sky.state.night, speedMul: (this.weather.raining ? 0.85 : 1) * (this.waves.sign === 'blood' && this.waves.phase === 'night' ? 1.2 : 1),
        hitPlayer: (dmg) => this.hitPlayer(dmg),
        hitBase: (dmg, e) => this.hitBase(dmg, e),
        hitBuilding: (b, dmg, e) => {
          const broke = this.buildings.damage(b, dmg);
          this.audio.bite();
          const thorns = b.stat('thorns');
          if (thorns) this.enemies.damage(e, thorns, ctx, null, { source: 'tower', type: 'pierce' });
          if (broke) {
            this.particles.chipBurst(new THREE.Vector3(b.x, b.y + 1, b.z), 0x8a6a40, 40, b.y);
            this.audio.breakWood();
            this.hud.message(`${ITEMS[b.id].name} destroyed`, '#ff9a7a');
          }
        },
        onSlam: (e) => this.onSlam(e),
        summon: (e) => this.summon(e),
        lay: (e) => this.layEggs(e),
        onHatch: (e) => {
          this.particles.sporeBurst(new THREE.Vector3(e.pos.x, e.pos.y + 0.4, e.pos.z), 0xc0ff60, 26, 1);
          this.audio.splat?.(this.near(e.pos));
        },
        rotAt: this.rot.any ? (x, z) => this.rot.at(x, z) : null,
        onWindup: (e, kind) => this.onWindup(e, kind),
        onSpit: (e) => this.audio.spit(this.near(e.pos)),
        onGlobLand: (at) => this.audio.splat(this.near(at)),
        onDig: (e, phase) => this.audio.burrow(this.near(e.pos), phase),
      });
      if (this.playerAlive) this.shovePlayer();
      this.rootPulse(dt);
      this.buildings.update(dt, t, ctx);
      this.expedition.update();
      this.tickRot(dt);
      this.checkTips();
      this.sky.signFog = damp(this.sky.signFog || 0, this.signFog || 0, 0.5, dt);
      this.sky.signMoon = damp(this.sky.signMoon || 0, this.signMoon || 0, 0.5, dt);
      this.projectiles.update(dt, {
        ...ctx,
        blooms: this.blooms,
        onFire: (p, r) => this.burnRot(p.x, p.z, r, 1),
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
        if (e.type === 'husk' && !e.dying && Math.random() < dt * 0.35) {
          const d = e.pos.distanceTo(pos);
          if (d < 28) this.audio.huskCreak(1 - d / 28);
        }
      }
    }
    this.alertT -= realDt;
    this.alertHold -= realDt;
    if (this.alertHold <= 0) this.heartMarker.alert = false;
    this.base.update(dt, t, this.sky.state.night, this.particles);
    this.camp.update(dt, t, this.sky.state.night, this.lights);
    for (let i = this.noises.length - 1; i >= 0; i--) if ((this.noises[i].t -= dt) <= 0) this.noises.splice(i, 1);
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
    // the drowned grove's air: thick, green-grey, still
    this.swampAir = damp(this.swampAir ?? 0, sampleTerrain(pos.x, pos.z, this._ground ||= {} as TerrainSample).swamp, 0.6, dt);
    this.sky.update(dt, pos, false, Math.max(this.cover, this.haze), this._ahead, this.swampAir);
    this.weather.update(realDt, t, this.camera, this.sky, this.audio, this.sky.state.night);
    this.hud.lightning(this.weather.uniforms.uFlash.value);
    this.lights.update(realDt, pos);

    for (const g of this.pickups.update(dt, t, pos)) {
      this.collect(g.id);
      // picking up drops counts toward the first journal step as much as tapping E does
      this.journal.event('forage');
    }
    // standing over something the satchel won't take: say why (now and then, not every frame)
    const stuck = this.pickups.blocked;
    this.blockedT = Math.max(0, (this.blockedT || 0) - dt);
    if (stuck && this.blockedT <= 0) {
      this.blockedT = 4;
      const full = this.inventory.slotRoom(stuck) < 1;
      this.hud.message(`${ITEMS[stuck].name}: ${full ? 'no pocket free in your pack or belt' : 'too heavy to carry'} ✚ Drop or store something (${this.hud.keyLabel('Tab')})`, '#ff9a7a');
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
    this.machete.root.visible = this.playerAlive && !over && !this.paused && !this.capture;
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
      camera: this.camera, boss: this.enemies.boss, journal: this.journal.lines(this.waves.phase, this.owns),
    });

    this.post.enabled.bloom = this.bloom;
    // eye adaptation: under the canopy the eye opens up, so sunlit gaps blaze
    this.shade = damp(this.shade ?? 0, this.canopy.coverAt(pos.x, pos.z), 1.2, realDt);
    // at night the eye opens up too, and the crowns hide less of a sky that's dark anyway
    // (opening up a full stop in shade bleached the sunlit leaves beyond it white)
    this.post.exposure = Math.pow(2, this.shade * 0.6 * this.sky.state.day + 0.4 * this.sky.state.night);
    if (canopyBox[3] > 0) canopyBox[3] = 0.35 + 0.2 * this.sky.state.day;
    this.frameNo++;
    this.renderer.shadowMap.needsUpdate = this.frameNo % (this.shadowEvery || 2) === 0 || this.sky.timeScale > 2;
    this.cullWorld();
    this.post.render(realDt, this.machete);
    this.tickRes(realDt);
    input.endFrame();
  }
}
