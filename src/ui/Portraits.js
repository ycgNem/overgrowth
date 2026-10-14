// Studio portraits of the Blender models for the title's Field Guide: each model framed to
// fit, three-quarter on, under a warm key and a coloured rim, on a transparent background.
// Rendered once, the first time the guide opens, then kept as data URLs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cloneModel, hasModel } from '../assets/Models.js';
import { setRim } from '../art/merge.js';

const SIZE = 360;

// rim: the back light's colour (violet for the Blight, gold for what you build)
export function renderPortraits(renderer, list) {
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  const hemi = new THREE.HemisphereLight(0xfff0d8, 0x26301c, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe2b0, 3.2);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 4);
  rim.position.set(-2.5, 1.5, -2.5);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 200);
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const prev = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), tone: renderer.toneMapping, exp: renderer.toneMappingExposure };
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const out = {};
  const box = new THREE.Box3(), size = new THREE.Vector3(), centre = new THREE.Vector3();
  for (const { name, rimColor = 0xb070ff, yaw = -0.6, glow = 0 } of list) {
    if (!hasModel(name)) continue;
    const model = cloneModel(name, { own: glow > 0 });
    if (glow > 0) setRim(model, glow, rimColor);
    model.rotation.y = yaw;
    scene.add(model);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    box.getSize(size);
    box.getCenter(centre);
    rim.color.set(rimColor);
    // fit the bounding sphere, looking a little down on it
    const r = size.length() * 0.5;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.92;
    camera.position.copy(centre).add(new THREE.Vector3(0, 0.32, 1).normalize().multiplyScalar(dist));
    camera.lookAt(centre.x, centre.y - size.y * 0.03, centre.z);
    camera.near = dist * 0.1;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      img.data.set(pixels.subarray(src, src + SIZE * 4), y * SIZE * 4);
    }
    ctx.putImageData(img, 0, 0);
    out[name] = canvas.toDataURL('image/png');
    scene.remove(model);
  }
  renderer.setRenderTarget(prev.target);
  renderer.setClearColor(prev.color, prev.alpha);
  renderer.toneMapping = prev.tone;
  renderer.toneMappingExposure = prev.exp;
  target.dispose();
  envRT.dispose();
  pmrem.dispose();
  return out;
}
