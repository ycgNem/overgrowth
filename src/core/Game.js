// Game orchestration: owns every system and runs the frame loop.
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
import { Inventory } from '../items/Inventory.js';
import { ITEMS, ITEM_IDS, RARITY, rollLoot } from '../items/ItemDB.js';
import { renderItemIcons } from '../items/ItemModels.js';
import { AudioSys } from '../audio/AudioSys.js';
import { HUD } from '../ui/HUD.js';
import { smoothstep, damp } from '../utils/math.js';

// Yield so the loading bar can paint; falls back to a timeout because
// requestAnimationFrame is paused in background tabs.
const nextFrame = () => new Promise((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
const REACH = 2.7;

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
    progress(0.05, 'Painting leaves…');
    await nextFrame();
    this.flora = new Flora();
    progress(0.35, 'Raising the terrain…');
    await nextFrame();
    this.sky = new Sky(this.scene, this.renderer);
    if (this.startTime !== null) this.sky.time = this.startTime;
    this.water = new Water(this.scene);
    this.world = new World(this.scene, this.flora);
    this.player = new Player(this.camera, this.world);
    const sp = findSpawn();
    this.player.spawn(sp.x, sp.z);
    this.faceNearestTemple();
    progress(0.5, 'Growing the jungle…');
    await nextFrame();
    this.world.update(this.player.pos.x, this.player.pos.z, 0, true);
    progress(0.75, 'Scattering secrets…');
    await nextFrame();
    this.machete = new Machete(this.camera.fov);
    this.machete.onHit = () => this.onSwingHit();
    this.particles = new Particles(this.scene, this.flora.textures.leaf);
    this.ambient = new Ambient(this.scene, this.world, this.sky);
    this.pickups = new Pickups(this.scene, this.world);
    this.hud.setIcons(renderItemIcons(this.renderer, ITEM_IDS));
    this.player.update(0.016, this.input, null);
    this.sky.update(0, this.player.pos, true);
    progress(0.9, 'Warming up shaders…');
    await nextFrame();
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    this.hud.updateMinimap(this.player.pos, 0, true);
    this.inventory.onChange = () => this.hud.stats();
    progress(1, 'Ready');
    this.running = true;
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  faceNearestTemple() {
    const p = this.player.pos;
    const cx = Math.floor(p.x / CHUNK_SIZE), cz = Math.floor(p.z / CHUNK_SIZE);
    let best = null, bd = Infinity;
    for (const s of poisAround(cx, cz, 8)) {
      if (s.type !== 'temple') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) this.player.yaw = Math.atan2(-(best.x - p.x), -(best.z - p.z));
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

  // ------------------------------------------------------------- actions

  forwardXZ() {
    return new THREE.Vector2(-Math.sin(this.player.yaw), -Math.cos(this.player.yaw));
  }

  onSwingHit() {
    const p = this.player.pos;
    const fwd = this.forwardXZ();
    const lookDown = this.player.pitch;
    let cut = 0;

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
      for (const id of rollLoot(c.def.cut.loot, this.rand)) this.pickups.spawn(id, center.clone().add(new THREE.Vector3(0, 0.3, 0)));
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

    // Nothing soft in reach? Ring off a trunk, rock or wall.
    if (!cut && !broke) {
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
        if (inside) {
          probe.y = Math.min(eye.y - 0.3 - lookDown * 0.5, c.top - 0.1);
          this.particles.sparks(probe, c.top === Infinity ? 0xd0a060 : 0xfff0c0, 10);
          c.top === Infinity ? this.audio.wood() : this.audio.clank();
          this.player.shake = 0.5;
          break;
        }
      }
    }
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
      if (facing < 0.45) continue;
      const score = facing * 2 - d;
      if (score > bs) { bs = score; best = it; }
    }
    return best;
  }

  checkDone(chunk) {
    if (chunk?.poi && chunk.interactables.every((i) => i.done)) this.doneSet.add(chunk.poi.key);
  }

  collect(id) {
    this.inventory.add(id);
    const r = RARITY[ITEMS[id].rarity];
    this.audio.pickup(r.order);
    this.hud.toast(id);
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
    const active = !this.paused && !this.hud.inventoryOpen;

    if (active) {
      this.player.look(input.mouse.dx, input.mouse.dy);
      this.machete.addSway(input.mouse.dx, input.mouse.dy);
      this.player.update(dt, input, this.audio);
      if (input.mouse.clicked || (input.mouse.down && !this.machete.swinging)) {
        if (this.machete.swing()) {
          this.audio.swing();
          this.player.stamina = Math.max(0, this.player.stamina - 0.03);
        }
      }
      // hold E to search
      const it = this.findInteractable();
      if (it && it.kind === 'search') {
        if (input.down('KeyE')) {
          if (this.search !== it) { this.search = it; this.searchT = 0; }
          this.searchT += dt / (it.time || 1.5);
          if (Math.floor(this.searchT * 6) !== Math.floor((this.searchT - dt / (it.time || 1.5)) * 6)) this.audio.rummage();
          if (this.searchT >= 1) {
            this.world.finishInteractable(it, it.chunk);
            this.checkDone(it.chunk);
            const at = new THREE.Vector3(it.x, it.y + 0.4, it.z);
            this.particles.sparkle(at, 0xffe0a0, 18);
            for (const id of rollLoot(it.loot, this.rand)) this.pickups.spawn(id, at.clone(), 0.8, true);
            this.search = null;
            this.searchT = 0;
          }
        } else {
          this.searchT = Math.max(0, this.searchT - dt * 2);
        }
        this.hud.prompt(it.label, this.search === it ? this.searchT : 0);
      } else if (it && it.kind === 'break') {
        this.hud.prompt(`${it.label} — swing`, 0);
      } else {
        this.search = null;
        this.hud.prompt(null);
      }
    } else {
      this.player.update(0, input, null);
    }

    if (input.hit('Tab') || input.hit('KeyI')) {
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
    this.sky.timeScale = input.down('KeyT') ? 90 : 1;

    const pos = this.player.pos;
    this.world.update(pos.x, pos.z, dt);
    this.water.update(pos);

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
    this.renderer.toneMappingExposure = 1.0 + this.sky.state.night * 0.8;

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
    this.machete.update(dt, this.camera, this.player, {
      dir: sun.position.clone().sub(sun.target.position).normalize(),
      color: sun.color, intensity: sun.intensity * (1 - this.cover * 0.65),
      hemiSky: this.sky.hemi.color, hemiGround: this.sky.hemi.groundColor, hemiIntensity: this.sky.hemi.intensity,
      env: this.scene.environment, envIntensity: this.scene.environmentIntensity,
    });

    this.hud.frame(dt, {
      player: pos, heading: -this.player.yaw, stamina: this.player.stamina, clock: this.sky.clock,
      underwater: this.camera.position.y < WATER_LEVEL - 0.05, done: this.doneSet,
    });

    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.machete.scene, this.machete.camera);
    input.endFrame();
  }
}
