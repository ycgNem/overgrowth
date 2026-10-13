// First-person explorer: movement, stamina, swimming and camera feel.
import * as THREE from 'three';
import { WATER_LEVEL, terrainNormal } from '../world/WorldGen.js';
import { clamp, damp } from '../utils/math.js';

const EYE = 1.62;
const RADIUS = 0.35;
const SWIM_DEPTH = 1.25;

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
    this.landDip = 0;
    this.stepDist = 0;
    this.sensitivity = 1;
    this.shake = 0;
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
    this.yaw -= dx * 0.0022 * this.sensitivity;
    this.pitch = clamp(this.pitch - dy * 0.0022 * this.sensitivity, -1.45, 1.45);
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
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 0.2);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * 0.16);
    }

    let speed = this.sprinting ? 7.4 : 4.3;
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

    if (input.hit('Space') && this.onGround && !this.swimming) {
      this.vel.y = 5.8;
      this.onGround = false;
      audio?.jump();
    }

    // Slide off very steep slopes.
    if (this.onGround && n.y < 0.55) {
      this.vel.x += n.x * 9 * dt;
      this.vel.z += n.z * 9 * dt;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collide(this.pos, RADIUS, this.pos.y, this.pos.y + 1.7);

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
    if ((this.onGround || this.swimming) && hs > 0.5) {
      this.bob += hs * dt * (this.swimming ? 1.2 : 2.1);
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 2.6 : 2.0;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        audio?.footstep(this.wading > 0.1 || this.swimming, this.sprinting);
      }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround && hs > 0.5 ? clamp(hs / 7, 0.3, 1) : 0, 8, dt);
    this.landDip = damp(this.landDip, 0, 6, dt);
    this.shake = damp(this.shake, 0, 10, dt);

    // Smooth eye height so step-ups don't snap.
    const eyeTarget = this.pos.y + EYE - this.landDip;
    this.eyeY = Math.abs(eyeTarget - this.eyeY) > 2 ? eyeTarget : damp(this.eyeY, eyeTarget, 18, dt);

    const bobY = Math.abs(Math.sin(this.bob * Math.PI)) * 0.06 * this.bobAmt;
    const bobX = Math.sin(this.bob * Math.PI) * 0.035 * this.bobAmt;
    const cam = this.camera;
    cam.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.eyeY + bobY, this.pos.z - Math.sin(this.yaw) * bobX);
    const sh = this.shake;
    cam.rotation.set(
      this.pitch + (Math.random() - 0.5) * sh * 0.02,
      this.yaw + (Math.random() - 0.5) * sh * 0.02,
      Math.sin(this.bob * Math.PI) * 0.006 * this.bobAmt,
    );
  }
}
