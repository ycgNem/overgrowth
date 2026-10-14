// A fixed set of point lights shared by everything that wants to glow: brazier fires, lightning
// flashes, muzzle flashes, the boss slam. three.js recompiles every lit shader when the number
// of lights changes, so lights are never added or removed during play; each frame the pool
// hands its lights to the most important requests near the player.
import * as THREE from 'three';

export class LightPool {
  constructor(scene, count = 6) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 1.8);
      l.position.set(0, -1000, 0);
      scene.add(l);
      this.lights.push(l);
    }
    this.requests = [];
    this.flashes = [];
  }

  // A light for this frame only (persistent emitters ask every frame).
  request(pos, color, intensity, distance = 16, priority = 1) {
    this.requests.push({ pos, color, intensity, distance, priority });
  }

  // A brief flash that fades out by itself.
  flash(pos, color, intensity, life = 0.12, distance = 14) {
    this.flashes.push({ pos: pos.clone(), color, intensity, life, t: 0, distance });
  }

  update(dt, focus) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.life) {
        this.flashes.splice(i, 1);
        continue;
      }
      this.requests.push({ pos: f.pos, color: f.color, intensity: f.intensity * (1 - f.t / f.life), distance: f.distance, priority: 3 });
    }
    // nearest and most important first
    for (const r of this.requests) r.score = r.priority * 100 - r.pos.distanceTo(focus);
    this.requests.sort((a, b) => b.score - a.score);
    this.lights.forEach((l, i) => {
      const r = this.requests[i];
      if (!r) {
        l.intensity = 0;
        return;
      }
      l.position.copy(r.pos);
      l.color.set(r.color);
      l.intensity = r.intensity;
      l.distance = r.distance;
    });
    this.requests.length = 0;
  }
}
