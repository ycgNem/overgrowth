// Rain: streaks that fall in a box around the camera (moved entirely on the GPU), a darker,
// foggier sky, the hiss of the downpour and, at night, lightning. Rain slows the Blight a
// little and dampens fire. Driven by Waves: some nights it rains.
import * as THREE from 'three';
import { globalUniforms } from '../art/shaders.js';

const N = 3000;
const BOX = 44; // metres across
const H = 22;

export class Weather {
  constructor(scene) {
    const pos = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * BOX, y = Math.random() * H, z = Math.random() * BOX, s = Math.random();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        seed[i * 2 + k] = s;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 }, uFlash: { value: 0 }, uDay: globalUniforms.uDay,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `uniform float uTime; uniform vec3 uCam; attribute float aEnd; attribute float aSeed; varying float vA; varying float vEnd;
        void main(){
          vec3 p = position;
          float fall = uTime * 17.0;
          p.y = mod(p.y - fall, ${H.toFixed(1)});
          vec3 w = vec3(uCam.x + mod(p.x - uCam.x, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)},
                        uCam.y - 7.0 + p.y,
                        uCam.z + mod(p.z - uCam.z, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)});
          // each streak is a short slanted line, its length and strength its own
          w += aEnd * vec3(0.04, 0.32 + 0.3 * aSeed, 0.02);
          vA = (1.0 - smoothstep(6.0, ${(BOX / 2).toFixed(1)}, length(w.xz - uCam.xz))) * (0.35 + 0.65 * fract(aSeed * 7.31));
          // a drop right at the eye would be a long bar across the screen
          vA *= smoothstep(0.8, 2.5, distance(w, uCam));
          vEnd = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform float uRain; uniform float uFlash; uniform float uDay; varying float vA; varying float vEnd;
        // brightest at the drop's head (the lower end), fading up its tail; by night only a
        // faint glint, unless the lightning catches it
        void main(){
          float lit = mix(0.25, 1.0, uDay) + uFlash * 3.0;
          gl_FragColor = vec4(vec3(0.62, 0.68, 0.75) * lit, 0.3 * uRain * vA * (1.0 - 0.75 * vEnd));
        }`,
      transparent: true, depthWrite: false, fog: false,
    });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.amount = 0; // 0..1 how hard it is raining
    this.wet = 0; // 0..1 how soaked the world is (globalUniforms.uWet)
    this.target = 0;
    this.flash = 0;
    this.boltT = 8;
    this.thunder = []; // pending thunder claps (delay after a flash)
  }

  get raining() {
    return this.amount > 0.3;
  }

  // after sky.update: dim and fog the scene by how hard it is raining
  update(dt, t, camera, sky, audio, night) {
    this.amount += (this.target - this.amount) * Math.min(1, dt * 0.25);
    const a = this.amount;
    // soaked in half a minute of downpour, dry again over a few minutes
    this.wet += a > this.wet ? (a - this.wet) * Math.min(1, dt / 30) : (a - this.wet) * Math.min(1, dt / 150);
    globalUniforms.uWet.value = this.wet;
    this.rain.visible = a > 0.02;
    this.uniforms.uTime.value = t;
    this.uniforms.uCam.value.copy(camera.position);
    this.uniforms.uRain.value = a;
    // lightning at night in a proper storm
    this.flash = Math.max(0, this.flash - dt * 5);
    if (a > 0.6 && night > 0.5) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 7 + Math.random() * 14;
        this.flash = 1;
        this.thunder.push(0.6 + Math.random() * 1.8);
      }
    }
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      this.thunder[i] -= dt;
      if (this.thunder[i] <= 0) {
        audio.thunder?.();
        this.thunder.splice(i, 1);
      }
    }
    // a double-flicker is how lightning really looks
    const fl = this.flash > 0.5 ? this.flash : this.flash * (Math.sin(t * 60) > 0 ? 1 : 0.3);
    this.uniforms.uFlash.value = fl;
    const scene = sky.scene;
    scene.fog.density *= 1 + a * 0.9;
    sky.sun.intensity *= 1 - a * 0.55;
    sky.hemi.intensity = sky.hemi.intensity * (1 - a * 0.25) + fl * 4;
    audio.setRain?.(a);
  }
}
