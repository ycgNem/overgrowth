// The first-person viewmodels: the machete, the slingshot and whatever consumable is in
// hand. Rendered in their own scene on top of the world so they never clip into plants.
// Machete swings alternate forehand / backhand and bite (a short hold) when they connect.
// Switching belt slots drops one tool out of view and raises the next.
import * as THREE from 'three';
import { bladeTexture, handleWoodTexture } from '../art/textures.js';
import { clamp } from '../utils/math.js';
import { getItemModel } from '../items/ItemModels.js';

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
  const blade = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bladeTexture(), metalness: 0.75, roughness: 0.55, envMapIntensity: 0.45, color: 0xa8a6a0 }));
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

// ------------------------------------------------------------------ slingshot
function slingModel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: handleWoodTexture(), roughness: 0.6 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.95 });
  const limb = (a, b, r) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, d.length(), 10), wood);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.add(m);
  };
  const crotch = new THREE.Vector3(0, 0, 0);
  limb(new THREE.Vector3(0, -0.15, 0.01), crotch, 0.017);
  const tips = [new THREE.Vector3(-0.065, 0.11, 0), new THREE.Vector3(0.065, 0.11, 0)];
  for (const t of tips) limb(crotch, t, 0.013);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.021, 0.09, 10), wrap);
  grip.position.set(0, -0.095, 0.008);
  g.add(grip);
  for (const t of tips) {
    const k = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 5, 10), wrap);
    k.position.copy(t).add(new THREE.Vector3(0, -0.012, 0));
    k.rotation.x = Math.PI / 2;
    g.add(k);
  }
  return { g, tips };
}

class SlingView {
  constructor() {
    this.root = new THREE.Group();
    const { g, tips } = slingModel();
    this.fork = g;
    this.tips = tips;
    this.root.add(g);
    const band = new THREE.MeshStandardMaterial({ color: 0x4a6d25, roughness: 0.7 });
    this.bands = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), band);
      this.root.add(m);
      return m;
    });
    this.pouch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.022, 0.03), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
    this.root.add(this.pouch);
    this.stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.016, 0), new THREE.MeshStandardMaterial({ color: 0x8e8a7e, roughness: 0.9 }));
    this.pouch.add(this.stone);
    this.stone.position.y = 0.01;
    this.snap = 0; // pouch spring after a shot
    this.snapV = 0;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // draw: 0..1 how far back the pouch is pulled; aimK: 0..1 fork raised to the centre
  update(dt, draw, loaded, aimK) {
    const rest = new THREE.Vector3(0.2, -0.27, -0.46);
    // low enough that the pouch, drawn back, sits under the crosshair instead of on it
    const aim = new THREE.Vector3(0.0, -0.19, -0.5);
    this.fork.position.lerpVectors(rest, aim, aimK);
    this.fork.rotation.set(0.15 - aimK * 0.12, 0.25 * (1 - aimK), -0.25 * (1 - aimK));
    this.fork.updateMatrix();
    // the pouch is on a spring: after a shot it snaps forward past the fork and settles
    this.snapV += (-this.snap * 260 - this.snapV * 12) * dt;
    this.snap += this.snapV * dt;
    const tipW = this.tips.map((t) => t.clone().applyMatrix4(this.fork.matrix));
    const mid = this._a.copy(tipW[0]).add(tipW[1]).multiplyScalar(0.5);
    const p = this.pouch.position;
    p.copy(mid);
    p.y -= 0.07 * (1 - Math.max(aimK, draw));
    p.z += 0.025 + draw * 0.3 + this.snap * 0.1;
    p.y -= draw * 0.045;
    this.pouch.rotation.set(-draw * 0.4, 0, 0);
    this.stone.visible = loaded;
    this.bands.forEach((b, i) => {
      const a = tipW[i];
      const d = this._b.subVectors(p, a);
      const len = d.length();
      b.position.copy(a).addScaledVector(d, 0.5);
      b.quaternion.setFromUnitVectors(this._up, d.normalize());
      b.scale.set(1 - draw * 0.45, len, 1 - draw * 0.45);
    });
  }

  release(power) {
    this.snap = 0.2;
    this.snapV = -5 - power * 9;
  }
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
    // the other things you can hold
    this.sling = new SlingView();
    this.sling.root.visible = false;
    this.root.add(this.sling.root);
    this.item = new THREE.Group();
    this.item.visible = false;
    this.root.add(this.item);
    this.itemId = null;
    this.mode = 'machete'; // machete | sling | item | none
    this.want = 'machete';
    this.equipT = 1;
    this.useT = 0; // consumable animation, 1 -> 0
    this.useKind = null;
    this.useFired = false;
    this.onUse = null;
    this.impact = 0;
    this.hold = 0; // hit-stop: the blade bites and hangs for a moment

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
    if (this.cooldown > 0 || this.mode !== 'machete' || this.equipT < 0.7) return false;
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

  // the blade connected: hang on the impact for a moment
  bite(strength = 1) {
    this.hold = 0.06 * strength;
    this.impact = strength;
  }

  // what's in hand: 'machete', 'sling', 'none' or an item id for a consumable
  equip(what) {
    if (what === this.want) return;
    this.want = what;
    this.equipT = 0;
    this.useT = 0;
  }

  get ready() {
    return this.equipT >= 0.7 && this.useT <= 0;
  }

  // play the consumable's use animation; onUse fires at the right moment
  use(kind) {
    if (this.useT > 0 || this.equipT < 0.7 || this.mode !== 'item') return false;
    this.useT = 1;
    this.useKind = kind;
    this.useFired = false;
    return true;
  }

  updateEquip(dt) {
    const prev = this.equipT;
    this.equipT = Math.min(1, this.equipT + dt / 0.32);
    // halfway down, swap what's in hand
    if (prev < 0.45 && this.equipT >= 0.45) {
      const w = this.want;
      this.mode = w === 'machete' || w === 'sling' || w === 'none' ? w : 'item';
      this.pivot.visible = this.mode === 'machete';
      this.sling.root.visible = this.mode === 'sling';
      this.item.visible = this.mode === 'item';
      if (this.mode === 'item' && this.itemId !== w) {
        this.item.clear();
        const m = getItemModel(w);
        m.scale.multiplyScalar(0.5);
        this.item.add(m);
        this.itemId = w;
      }
      if (this.mode === 'machete') {
        this.state = 'idle';
        this.setPose(this.poses.idle, 1);
      }
    }
    // down and back up: 0 -> 0.45 lowering, 0.45 -> 1 raising
    const k = this.equipT < 0.45 ? this.equipT / 0.45 : 1 - (this.equipT - 0.45) / 0.55;
    return k * k * (3 - 2 * k);
  }

  updateItem(dt) {
    const it = this.item;
    let px = 0.22, py = -0.26, pz = -0.45, rx = 0.3, ry = -0.5;
    if (this.useT > 0) {
      this.useT = Math.max(0, this.useT - dt / (this.useKind === 'throw' ? 0.55 : 0.8));
      const u = 1 - this.useT;
      if (this.useKind === 'throw') {
        // wind back over the shoulder, then hurl it forward
        const back = Math.min(1, u / 0.45), fwd = clamp((u - 0.45) / 0.25, 0, 1);
        px += back * 0.1 - fwd * 0.2;
        py += back * 0.3 - fwd * 0.2;
        pz += back * 0.25 - fwd * 0.5;
        rx += -back * 1.2 + fwd * 2;
        it.visible = u < 0.7;
        if (!this.useFired && u >= 0.6) {
          this.useFired = true;
          this.onUse?.(this.useKind);
        }
      } else {
        // bring it up to the mouth (or hold it high), then lower it
        const up = Math.sin(Math.min(1, u / 0.85) * Math.PI);
        px -= up * 0.2;
        py += up * 0.14;
        pz += up * 0.18;
        rx += up * 0.6;
        ry += up * 0.4;
        if (!this.useFired && u >= 0.5) {
          this.useFired = true;
          this.onUse?.(this.useKind);
        }
      }
      if (this.useT <= 0) it.visible = true;
    } else {
      py += Math.sin(performance.now() * 0.002) * 0.006;
    }
    it.position.set(px, py, pz);
    it.rotation.set(rx, ry + performance.now() * 0.0003, 0.1);
  }

  update(dt, mainCamera, player, lighting, sling = {}) {
    if (this.hold > 0) {
      // hit-stop: the swing freezes on the impact
      this.hold -= dt;
      dt *= 0.08;
    }
    this.impact = Math.max(0, this.impact - dt * 6);
    this.cooldown -= dt;
    this.t += dt;
    const lower = this.updateEquip(dt);
    if (this.mode === 'item') this.updateItem(dt);
    if (this.mode === 'sling') this.sling.update(dt, sling.draw || 0, sling.loaded ?? true, sling.aim || 0);

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
    // the blade bounces back off whatever it bit
    if (this.impact > 0) this.pivot.rotateZ(this.impact * 0.12 * (this.combo ? -1 : 1));

    // Weapon sway lags behind camera motion; bob with footsteps.
    this.sway.x = THREE.MathUtils.damp(this.sway.x, 0, 8, dt);
    this.sway.y = THREE.MathUtils.damp(this.sway.y, 0, 8, dt);
    const bob = player.bob * Math.PI;
    const steady = this.mode === 'sling' ? 1 - (sling.aim || 0) * 0.8 : 1;
    this.root.position.set(
      (this.sway.x * 0.02 + Math.sin(bob) * 0.012 * player.bobAmt) * steady,
      (this.sway.y * 0.02 - Math.abs(Math.cos(bob)) * 0.012 * player.bobAmt) * steady - player.landDip * 0.3 - lower * 0.45,
      0,
    );
    this.root.rotation.x = -lower * 0.6;

    // Light the viewmodel with the world's sun, expressed in camera space.
    this.camera.aspect = mainCamera.aspect;
    this.camera.fov = mainCamera.fov;
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
