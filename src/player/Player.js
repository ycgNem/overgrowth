// First-person explorer: movement, stamina, swimming and camera feel.
import * as THREE from 'three';
import { WATER_LEVEL, terrainNormal } from '../world/WorldGen.js';
import { clamp, damp } from '../utils/math.js';

const EYE = 1.62;
const RADIUS = 0.35;
const SWIM_DEPTH = 1.25;
const LOOK = 0.0018; // radians per mouse count at sensitivity 1
const COYOTE = 0.12; // s after walking off a ledge that a jump still works
const JUMP_BUFFER = 0.15; // s a jump press is remembered before landing

export function loadSensitivity() {
  try {
    const v = parseFloat(localStorage.getItem('og.sensitivity'));
    return Number.isFinite(v) ? v : 1;
  } catch {
    return 1;
  }
}

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.stamina = 1;
    this.staminaDelay = 0;
    this.sprinting = false;
    this.swimming = false;
    this.wading = 0;
    this.eyeY = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.runK = 0; // 0 walking, 1 at a full sprint (eased)
    this.landDip = 0;
    this.stepDist = 0;
    this.sensitivity = loadSensitivity();
    this.invertY = false;
    this.shake = 0;
    this.airTime = 0;
    this.jumpBuffer = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.hurtT = 0;
    this.speedMul = 1; // boons
    this.moveMul = 1; // this frame only (drawing the slingshot)
    this.staminaRegen = 1;
    camera.rotation.order = 'YXZ';
  }

  spawn(x, z) {
    this.pos.set(x, this.world.groundHeight(x, z) + 0.1, z);
    this.eyeY = this.pos.y + EYE;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  look(dx, dy) {
    const k = LOOK * this.sensitivity;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k * (this.invertY ? -1 : 1), -1.45, 1.45);
  }

  update(dt, input, audio) {
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    if (input.down('ArrowLeft')) this.yaw += dt * 2;
    if (input.down('ArrowRight')) this.yaw -= dt * 2;
    if (input.down('ArrowUp')) this.pitch = clamp(this.pitch + dt * 1.5, -1.45, 1.45);
    if (input.down('ArrowDown')) this.pitch = clamp(this.pitch - dt * 1.5, -1.45, 1.45);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sy * f + cy * s, 0, -cy * f - sy * s);
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();

    const ground = this.world.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    const depth = WATER_LEVEL - ground;
    this.swimming = depth > SWIM_DEPTH;
    this.wading = clamp((WATER_LEVEL - this.pos.y) / 1.0, 0, 1);

    const wantSprint = input.down('ShiftLeft') && f > 0 && !this.swimming;
    this.sprinting = wantSprint && this.stamina > 0.02 && (this.sprinting || this.stamina > 0.15);
    // a full bar is ~8 s (~60 m) of sprinting; it drains only while you actually cover ground
    if (this.sprinting && (this.groundSpeed ?? 0) > 3) {
      this.stamina = Math.max(0, this.stamina - dt * 0.12);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * 0.2 * this.staminaRegen);
    }

    let speed = (this.sprinting ? 7.4 : 4.3) * this.speedMul * this.moveMul;
    if (this.swimming) speed = 2.6;
    else speed *= 1 - this.wading * 0.45;

    // Steep terrain resists climbing.
    const n = terrainNormal(this.pos.x, this.pos.z);
    if (moving && n.y < 0.75 && this.onGround) {
      const uphill = -(wish.x * n.x + wish.z * n.z);
      if (uphill > 0) speed *= clamp((n.y - 0.5) / 0.25, 0.15, 1);
    }

    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.vel.x = damp(this.vel.x, wish.x * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z * speed, accel, dt);

    // Jump: remember a press briefly (so one just before landing still counts) and
    // allow it a moment after stepping off an edge.
    if (dt > 0 && input.hit('Space')) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    if (this.jumpBuffer > 0 && this.airTime < COYOTE && this.vel.y <= 0.01 && !this.swimming) {
      this.vel.y = 5.8;
      this.onGround = false;
      this.airTime = COYOTE;
      this.jumpBuffer = 0;
      audio?.jump();
    }

    // Slide off very steep slopes.
    if (this.onGround && n.y < 0.55) {
      this.vel.x += n.x * 9 * dt;
      this.vel.z += n.z * 9 * dt;
    }

    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collide(this.pos, RADIUS, this.pos.y, this.pos.y + 1.7);
    // pinned against a wall you go nowhere: keep only the motion that happened (else you
    // bobbed, stepped and burned stamina running on the spot)
    if (dt > 0) {
      this.vel.x = (this.pos.x - px) / dt;
      this.vel.z = (this.pos.z - pz) / dt;
    }
    this.groundSpeed = Math.hypot(this.vel.x, this.vel.z);

    const g = this.world.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    const wasGround = this.onGround;
    if (WATER_LEVEL - g > SWIM_DEPTH) {
      // float with the head above the surface
      const target = WATER_LEVEL - SWIM_DEPTH - 0.15 + Math.sin(performance.now() * 0.002) * 0.05;
      this.vel.y = damp(this.vel.y, (target - this.pos.y) * 4, 6, dt);
      this.pos.y += this.vel.y * dt;
      this.onGround = false;
    } else {
      this.vel.y -= 20 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= g) {
        if (!wasGround && this.vel.y < -7) {
          this.landDip = clamp(-this.vel.y * 0.02, 0, 0.25);
          audio?.land();
        }
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
      } else if (this.pos.y - g > 0.3 || this.vel.y > 0) {
        this.onGround = false;
      } else {
        // stick to the ground when walking downhill
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    // Footsteps and head-bob.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // One unit of bob is one step, so the head, the arms and the footfalls keep the same beat
    // (the bob used to run four times faster than the feet: a frantic jitter at a sprint).
    this.runK = damp(this.runK || 0, this.sprinting && this.onGround && hs > 3 ? 1 : 0, 7, dt);
    if ((this.onGround || this.swimming) && hs > 0.5) {
      const stride = this.swimming ? 1.6 : 2.0 + 0.6 * this.runK;
      const prev = this.bob;
      this.bob += (hs * dt) / stride;
      if (Math.floor(this.bob) !== Math.floor(prev) && !this.swimming) audio?.footstep(this.wading > 0.1, this.sprinting);
      this.stepDist += hs * dt;
      if (this.swimming && this.stepDist > 2) {
        this.stepDist = 0;
        audio?.footstep(true, false);
      }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround && hs > 0.5 ? clamp(hs / 7, 0.3, 1) : 0, 8, dt);
    this.landDip = damp(this.landDip, 0, 6, dt);
    this.shake = damp(this.shake, 0, 10, dt);

    // Smooth eye height so step-ups don't snap. In the air the body already moves
    // smoothly, so the eye follows it exactly (smoothing there made jumps rubbery).
    const eyeTarget = this.pos.y + EYE - this.landDip;
    if (!this.onGround && !this.swimming) this.eyeY = eyeTarget;
    else this.eyeY = Math.abs(eyeTarget - this.eyeY) > 2 ? eyeTarget : damp(this.eyeY, eyeTarget, 18, dt);

    // the head dips at each footfall and rides over the stride; it sways toward the planted foot
    const bobY = (Math.abs(Math.sin(this.bob * Math.PI)) - 0.5) * (0.045 + 0.03 * this.runK) * this.bobAmt;
    const bobX = Math.sin(this.bob * Math.PI) * (0.03 + 0.012 * this.runK) * this.bobAmt;
    const cam = this.camera;
    cam.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.eyeY + bobY, this.pos.z - Math.sin(this.yaw) * bobX);
    const sh = this.shake;
    cam.rotation.set(
      this.pitch + (Math.random() - 0.5) * sh * 0.02,
      this.yaw + (Math.random() - 0.5) * sh * 0.02,
      Math.sin(this.bob * Math.PI) * (0.005 + 0.004 * this.runK) * this.bobAmt,
    );
  }
}
