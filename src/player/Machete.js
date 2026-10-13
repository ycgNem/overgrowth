// The machete viewmodel. Rendered in its own scene on top of the world so
// it never clips into plants; swings alternate forehand / backhand.
import * as THREE from 'three';
import { bladeTexture, handleWoodTexture } from '../art/textures.js';
import { clamp } from '../utils/math.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;

function buildModel() {
  const g = new THREE.Group();
  // Blade outline along +x (spine on top, edge below), clipped point.
  const s = new THREE.Shape();
  s.moveTo(0, 0.021);
  s.lineTo(0.34, 0.03);
  s.quadraticCurveTo(0.43, 0.034, 0.48, 0.012);
  s.quadraticCurveTo(0.49, -0.032, 0.42, -0.06);
  s.quadraticCurveTo(0.22, -0.058, 0.0, -0.027);
  s.lineTo(0, 0.021);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.003, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16,
  });
  geo.translate(0, 0, -0.0015);
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.49, (p.getY(i) + 0.062) / 0.098);
  const blade = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bladeTexture(), metalness: 0.75, roughness: 0.42, envMapIntensity: 0.45, color: 0xf2ece4 }));
  g.add(blade);

  const wood = new THREE.MeshStandardMaterial({ map: handleWoodTexture(), roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: 0.9, roughness: 0.45 });
  const cord = new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.9 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.135, 14), wood);
  handle.rotation.z = Math.PI / 2;
  handle.scale.set(1, 1, 0.72);
  handle.position.set(-0.07, -0.002, 0);
  g.add(handle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), wood);
  pommel.scale.set(0.8, 1.05, 0.7);
  pommel.position.set(-0.14, -0.006, 0);
  g.add(pommel);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.02), steel);
  guard.position.set(0.0, -0.002, 0);
  g.add(guard);
  for (const x of [-0.03, -0.075, -0.12]) {
    for (const z of [-0.0125, 0.0125]) {
      const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 10), brass);
      rv.rotation.x = Math.PI / 2;
      rv.position.set(x, 0, z);
      g.add(rv);
    }
  }
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0035, 6, 18), cord);
  loop.position.set(-0.165, -0.022, 0);
  loop.rotation.set(0.3, 0.2, 0.8);
  g.add(loop);
  return g;
}

export class Machete {
  constructor(fov) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 0.8);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.root = new THREE.Group(); // follows bob/sway
    this.pivot = new THREE.Group(); // swings, pivot at the grip
    this.model = buildModel();
    this.model.position.set(0.07, 0, 0); // grip at pivot
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    this.scene.add(this.root);

    // Poses in camera space (x right, y up, -z forward): grip position,
    // blade direction, and the direction the flat of the blade faces.
    const pose = (p, dir, face) => {
      const x = new THREE.Vector3(...dir).normalize();
      const z = new THREE.Vector3(...face);
      z.addScaledVector(x, -z.dot(x)).normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      return { p: new THREE.Vector3(...p), q };
    };
    this.poses = {
      idle: pose([0.3, -0.34, -0.48], [-0.28, 0.5, -0.82], [0.6, 0.3, 0.75]),
      windA: pose([0.36, -0.08, -0.34], [0.35, 0.75, 0.55], [-0.2, 0.3, 0.9]),
      slashA: pose([-0.24, -0.36, -0.5], [-0.85, -0.25, -0.45], [0.1, 0.95, 0.3]),
      windB: pose([-0.18, -0.1, -0.38], [-0.5, 0.7, 0.45], [0.3, 0.2, 0.9]),
      slashB: pose([0.4, -0.34, -0.46], [0.85, -0.2, -0.5], [-0.1, 0.95, 0.3]),
    };
    this.debugPose = null;
    this.state = 'idle';
    this.t = 0;
    this.combo = 0;
    this.cooldown = 0;
    this.onHit = null;
    this.hitDone = false;
    this.sway = new THREE.Vector2();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this.from = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.setPose(this.poses.idle, 1);
  }

  setPose(pose, w, fromP, fromQ) {
    if (fromP) {
      this.pivot.position.lerpVectors(fromP, pose.p, w);
      this.pivot.quaternion.slerpQuaternions(fromQ, pose.q, w);
    } else {
      this.pivot.position.copy(pose.p);
      this.pivot.quaternion.copy(pose.q);
    }
  }

  swing() {
    if (this.cooldown > 0) return false;
    this.state = 'wind';
    this.t = 0;
    this.hitDone = false;
    this.combo = 1 - this.combo;
    this.cooldown = 0.5;
    this.from.p.copy(this.pivot.position);
    this.from.q.copy(this.pivot.quaternion);
    return true;
  }

  get swinging() {
    return this.state !== 'idle';
  }

  update(dt, mainCamera, player, lighting) {
    this.cooldown -= dt;
    this.t += dt;
    const P = this.poses;
    const wind = this.combo ? P.windB : P.windA;
    const slash = this.combo ? P.slashB : P.slashA;
    if (this.state === 'wind') {
      const w = clamp(this.t / 0.11, 0, 1);
      this.setPose(wind, ease(w), this.from.p, this.from.q);
      if (w >= 1) {
        this.state = 'slash';
        this.t = 0;
        this.from.p.copy(this.pivot.position);
        this.from.q.copy(this.pivot.quaternion);
      }
    } else if (this.state === 'slash') {
      const w = clamp(this.t / 0.13, 0, 1);
      this.setPose(slash, easeIn(w) * 0.4 + ease(w) * 0.6, this.from.p, this.from.q);
      if (!this.hitDone && w > 0.45) {
        this.hitDone = true;
        this.onHit?.(this.combo);
      }
      if (w >= 1) {
        this.state = 'recover';
        this.t = 0;
        this.from.p.copy(this.pivot.position);
        this.from.q.copy(this.pivot.quaternion);
      }
    } else if (this.state === 'recover') {
      const w = clamp(this.t / 0.32, 0, 1);
      this.setPose(P.idle, ease(w), this.from.p, this.from.q);
      if (w >= 1) this.state = 'idle';
    } else if (this.debugPose) {
      this.setPose(P[this.debugPose], 1);
    } else {
      // idle breathing
      const b = Math.sin(performance.now() * 0.0016) * 0.004;
      this.setPose(P.idle, 1);
      this.pivot.position.y += b;
    }

    // Weapon sway lags behind camera motion; bob with footsteps.
    this.sway.x = THREE.MathUtils.damp(this.sway.x, 0, 8, dt);
    this.sway.y = THREE.MathUtils.damp(this.sway.y, 0, 8, dt);
    const bob = player.bob * Math.PI;
    this.root.position.set(
      this.sway.x * 0.02 + Math.sin(bob) * 0.012 * player.bobAmt,
      this.sway.y * 0.02 - Math.abs(Math.cos(bob)) * 0.012 * player.bobAmt - player.landDip * 0.3,
      0,
    );

    // Light the viewmodel with the world's sun, expressed in camera space.
    this.camera.aspect = mainCamera.aspect;
    this.camera.updateProjectionMatrix();
    const inv = mainCamera.quaternion.clone().invert();
    this.sun.position.copy(lighting.dir).applyQuaternion(inv).multiplyScalar(5);
    this.sun.color.copy(lighting.color);
    this.sun.intensity = lighting.intensity;
    this.hemi.color.copy(lighting.hemiSky);
    this.hemi.groundColor.copy(lighting.hemiGround);
    this.hemi.intensity = lighting.hemiIntensity;
    this.scene.environment = lighting.env;
    this.scene.environmentIntensity = lighting.envIntensity * 0.7;
    this.scene.environmentRotation.setFromQuaternion(mainCamera.quaternion);
  }

  addSway(dx, dy) {
    this.sway.x = clamp(this.sway.x - dx * 0.02, -1.5, 1.5);
    this.sway.y = clamp(this.sway.y + dy * 0.02, -1.5, 1.5);
  }
}
