// The first-person viewmodels: the machete, the slingshot and whatever consumable is in
// hand. Rendered in their own scene on top of the world so they never clip into plants.
// Machete swings alternate forehand / backhand and bite (a short hold) when they connect.
// Switching belt slots drops one tool out of view and raises the next.
import * as THREE from 'three';
import { handleWoodTexture } from '../art/textures.js';
import { buildMachete, loadHand } from './MacheteModel.js';
import { clamp } from '../utils/math.js';
import { getItemModel } from '../items/ItemModels.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;

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
    // a leather pouch: a squashed, cupped ball (a box read as a cardboard block)
    const pg = new THREE.SphereGeometry(0.022, 14, 8);
    pg.scale(1.1, 0.45, 0.85);
    this.pouch = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.85 }));
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
    const rest = new THREE.Vector3(0.2, -0.12, -0.5);
    // low enough that the pouch, drawn back, sits under the crosshair instead of on it
    const aim = new THREE.Vector3(0.0, -0.1, -0.52);
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

// A faint smear of disturbed air behind the blade during a slash: a ribbon between the
// blade's middle and its tip over the last few frames, fading with age.
class SwingTrail {
  constructor(n = 14) {
    this.n = n;
    this.pts = []; // { a, b, age }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.alpha = new Float32Array(n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(vec3(0.55, 0.58, 0.6) * vA, 1.0); }',
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  update(dt, on, model) {
    for (const p of this.pts) p.age += dt;
    this.pts = this.pts.filter((p) => p.age < 0.12);
    if (on) {
      const a = this._a.set(0.2, 0.0, 0).applyMatrix4(model.matrixWorld);
      const b = this._b.set(0.45, 0.0, 0).applyMatrix4(model.matrixWorld);
      this.pts.unshift({ a: a.clone(), b: b.clone(), age: 0 });
      if (this.pts.length > this.n) this.pts.length = this.n;
    }
    this.mesh.visible = this.pts.length > 1;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      p.a.toArray(this.pos, i * 6);
      p.b.toArray(this.pos, i * 6 + 3);
      const k = i < this.pts.length ? (1 - p.age / 0.12) * (1 - i / this.n) : 0;
      this.alpha[i * 2] = k * 0.05;
      this.alpha[i * 2 + 1] = k * 0.22;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
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
    this.model = buildMachete();
    this.model.position.set(0.06, 0, 0); // grip at pivot
    this.pivot.add(this.model);
    loadHand().then((h) => {
      if (!h) return;
      this.hand = h;
      this.model.add(h);
      // the same fist round the slingshot's grip: the hand's handle axis (x) runs up the
      // grip, the forearm (its y) comes back toward the camera
      const sh = h.clone();
      sh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -0.15, 1).normalize(), new THREE.Vector3(1, 0, 0.15).normalize()));
      sh.position.set(0, -0.045, 0.008);
      this.sling.fork.add(sh);
    });
    this.root.add(this.pivot);
    this.scene.add(this.root);
    this.trail = new SwingTrail();
    this.scene.add(this.trail.mesh);
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
    this.biteKind = 'flesh';
    this._back = new THREE.Vector3();

    // Poses in camera space (x right, y up, -z forward): grip position, the blade's
    // direction, and roughly where the forearm runs from the grip (the hand's +y; the back
    // of the hand, +z, follows).
    this.poses = {
      idle: this.makePose([0.255, -0.215, -0.44], [-0.2, 0.76, -0.62], [0.8, -0.5, 0.3]),
      // forehand: cocked over the right shoulder, cut down and across to the lower left
      windA: this.makePose([0.27, -0.02, -0.34], [0.15, 0.75, 0.6], [0.25, -0.9, 0.3]),
      slashA: this.makePose([-0.15, -0.3, -0.5], [-0.8, -0.3, -0.5], [0.6, -0.3, 0.75]),
      // backhand: from high on the left, back across to the lower right
      windB: this.makePose([-0.12, -0.05, -0.36], [-0.6, 0.7, 0.35], [0.5, -0.7, 0.5]),
      slashB: this.makePose([0.36, -0.3, -0.46], [0.85, -0.2, -0.5], [-0.2, -0.6, 0.75]),
      // sprinting: carried low at your side, out of the middle of the view, pumping with the arm
      run: this.makePose([0.29, -0.25, -0.42], [0.3, 0.35, -0.89], [0.8, -0.5, 0.3]),
    };
    this._runQ = new THREE.Quaternion();
    this._pumpQ = new THREE.Quaternion();
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this._zAxis = new THREE.Vector3(0, 0, 1);
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

  // face: the third vector is the flat of the blade's normal (the hand's +z) instead of the arm
  makePose(p, dir, arm, face = false) {
    const x = new THREE.Vector3(...dir).normalize();
    const v = new THREE.Vector3(...arm);
    v.addScaledVector(x, -v.dot(x)).normalize();
    let y, z;
    if (face) { z = v; y = new THREE.Vector3().crossVectors(z, x); } else { y = v; z = new THREE.Vector3().crossVectors(x, y); }
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return { p: new THREE.Vector3(...p), q };
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
  // kind: 'flesh' (Blight, thick stems), 'wood' (the blade sinks in and sticks for a moment,
  // then is wrenched free) or 'stone' (it rings off and bounces back)
  bite(strength = 1, kind = 'flesh') {
    this.biteKind = kind;
    this.hold = (kind === 'wood' ? 0.12 : kind === 'stone' ? 0.025 : 0.06) * strength;
    this.impact = strength * (kind === 'stone' ? 1.7 : kind === 'wood' ? 0.7 : 1);
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
      // a sprint lowers the blade across the body and pumps it with the arm: forward and up
      // on one step, back and down on the next (one bob unit is one step)
      const r = player.runK || 0;
      if (r > 0.001) {
        const k = r * r * (3 - 2 * r);
        this.pivot.position.lerp(P.run.p, k);
        this.pivot.quaternion.slerp(P.run.q, k);
        const ph = player.bob * Math.PI, sw = Math.sin(ph), up = Math.abs(Math.cos(ph));
        this.pivot.position.x += sw * 0.018 * k;
        this.pivot.position.y += (up - 0.5) * 0.045 * k;
        this.pivot.position.z -= sw * 0.03 * k;
        this.pivot.quaternion.premultiply(this._pumpQ.setFromAxisAngle(this._xAxis, -sw * 0.05 * k));
        this.pivot.quaternion.premultiply(this._pumpQ.setFromAxisAngle(this._zAxis, sw * 0.03 * k));
      }
    }
    // the blade bounces back off whatever it bit
    if (this.impact > 0) {
      this.pivot.rotateZ(this.impact * 0.12 * (this.combo ? -1 : 1));
      // stone throws the blade back at you; wood tugs it as it comes free
      if (this.biteKind === 'stone') this.pivot.position.z += this.impact * 0.035;
      else if (this.biteKind === 'wood') this.pivot.position.addScaledVector(this._back.set(0.3, 0.2, 1), this.impact * 0.02);
    }
    // the smear behind the blade, sampled where the blade is now (in the viewmodel's space)
    this.root.updateMatrixWorld(true);
    this.trail.update(dt, this.state === 'slash' && this.mode === 'machete' && this.pivot.visible, this.model);

    // Weapon sway lags behind camera motion; bob with footsteps.
    this.sway.x = THREE.MathUtils.damp(this.sway.x, 0, 8, dt);
    this.sway.y = THREE.MathUtils.damp(this.sway.y, 0, 8, dt);
    const bob = player.bob * Math.PI;
    const run = player.runK || 0;
    const steady = this.mode === 'sling' ? 1 - (sling.aim || 0) * 0.8 : 1;
    // the hand rides the stride: it settles as each foot lands
    const ax = (0.01 + 0.008 * run) * player.bobAmt, ay = (0.01 + 0.012 * run) * player.bobAmt;
    this.root.position.set(
      (this.sway.x * 0.02 + Math.sin(bob) * ax) * steady,
      (this.sway.y * 0.02 + (Math.abs(Math.sin(bob)) - 0.5) * ay) * steady - player.landDip * 0.3 - lower * 0.45
        - (this.mode === 'machete' ? 0 : run * 0.05),
      0,
    );
    this.root.rotation.x = -lower * 0.6 - (this.mode === 'machete' ? 0 : run * 0.25);
    this.root.rotation.z = this.mode === 'machete' ? 0 : run * 0.2;

    // Light the viewmodel with the world's sun, expressed in camera space.
    this.camera.aspect = mainCamera.aspect;
    // narrower than the world camera: at 72 degrees the blade stretched into a long thin sword
    this.camera.fov = mainCamera.fov - 14;
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
