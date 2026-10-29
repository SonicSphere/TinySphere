import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.js';
import { SKY_CLOTH_APPEARANCE } from '../src/settings/sky-cloth.js';
import { applySkyClothMaterial, applySkyFrameMaterials, createSkyClothLighting } from '../src/engine/sky-cloth.js';
import { prepareFisheyeMeshes } from '../src/camera/fisheye-mesh.js';

assert.deepEqual(SKY_CLOTH_APPEARANCE, {
  enabled: true, skyFill: 0.83, horizonLight: 0.68, transmission: 0.21,
  verticalFalloff: 0.74, strutLight: 1.53, woodLight: 2.11,
  clothLight: 0.83, shadowDepth: 0.26, clothWhiteness: 0.58,
});

// A probe temporarily changes renderer state, including when a sky is first
// encountered inside either pass of a wipe. It must restore that state.
let renderTarget = { original: true }, scissorTest = true, samples = 0;
const originalTarget = renderTarget;
const viewport = new THREE.Vector4(3, 4, 500, 300);
const scissor = new THREE.Vector4(8, 9, 120, 180);
const renderer = {
  getRenderTarget: () => renderTarget,
  setRenderTarget: (value) => { renderTarget = value; },
  getViewport: (target) => target.copy(viewport),
  setViewport: (value) => viewport.copy(value),
  getScissor: (target) => target.copy(scissor),
  setScissor: (value) => scissor.copy(value),
  getScissorTest: () => scissorTest,
  setScissorTest: (value) => { scissorTest = value; },
  render: () => {},
  readRenderTargetPixels: (_target, _x, _y, _width, _height, bytes) => {
    samples++;
    bytes.fill(128);
  },
};
const lighting = createSkyClothLighting(renderer, new THREE.Vector3(0, 0, 11), 11);
for (const atmosphere of ['sunset', 'sunrise', 'peach-dusk', 'stars', 'sunset', 'stars']) {
  lighting.update(atmosphere);
  assert.equal(renderTarget, originalTarget);
  assert.deepEqual(viewport.toArray(), [3, 4, 500, 300]);
  assert.deepEqual(scissor.toArray(), [8, 9, 120, 180]);
  assert.equal(scissorTest, true);
  assert.equal(lighting.uniforms.studyClothWhiteness.value, atmosphere === 'sunset' ? 0.58 : 0);
  assert.equal(lighting.uniforms.studyShadowDepth.value, atmosphere === 'stars' ? 0 : 0.26);
}
assert.equal(samples, 4, 'Sky probes are cached across repeated wipe passes');
assert.equal(lighting.uniforms.studyStrength.value.x, 0.83);
assert.equal(lighting.uniforms.studyStrength.value.y, 0.68);
const failingRenderer = { ...renderer, readRenderTargetPixels: () => { throw Error('Read failed'); } };
assert.throws(() => createSkyClothLighting(failingRenderer, new THREE.Vector3(), 11).update('sunset'), /Read failed/);
assert.equal(renderTarget, originalTarget);
assert.equal(scissorTest, true);

const cloth = new THREE.ShaderMaterial({
  vertexShader: 'void main(){}',
  fragmentShader: 'varying float vWrapMask; void main(){\n#include <tonemapping_fragment>\n}',
  uniforms: { brightness: { value: 1.6 } },
});
applySkyClothMaterial(cloth, lighting);
assert.equal(cloth.uniforms.brightness.value, 1.6, 'Sky reflection does not change LED brightness');
assert.ok(cloth.vertexShader.includes('vStudySkyVisibility=skyVisibility'));
assert.ok(cloth.fragmentShader.indexOf('gl_FragColor.rgb+=reflectedSkyCloth()') < cloth.fragmentShader.indexOf('#include <tonemapping_fragment>'));
assert.throws(() => applySkyClothMaterial(new THREE.ShaderMaterial(), lighting), /matte wrap/);

const scene = new THREE.Scene();
const metal = new THREE.MeshStandardMaterial({ metalness: 0.7 });
const wood = new THREE.MeshStandardMaterial();
let chained = 0;
wood.onBeforeCompile = () => { chained++; };
const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(), metal, 2);
const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(), wood, 2);
legs.userData.playaWood = true;
scene.add(bars, legs, new THREE.Mesh(new THREE.BoxGeometry(), metal));
applySkyFrameMaterials(scene, lighting);
assert.deepEqual(lighting.materialCounts, { struts: 1, wood: 1 }, 'Shared materials are patched once');
for (const [material, key] of [[metal, 'studyStrutLight'], [wood, 'studyWoodLight']]) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.studyOpaqueStrength, lighting.uniforms[key]);
  assert.ok(shader.vertexShader.includes('instanceMatrix*studyWorld'));
  assert.ok(shader.fragmentShader.includes('inverseTransformDirection(normal,viewMatrix)'));
  assert.ok(shader.fragmentShader.includes('#include <map_fragment>'), 'Wood grain stays in the standard material');
}
assert.equal(chained, 1, 'Existing material hooks are preserved');

// Center-lens refinement must interpolate the new visibility attribute and
// retain every original value when returning to the exterior meshes.
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
geometry.setAttribute('skyVisibility', new THREE.Float32BufferAttribute([0, 1, 0.5], 1));
geometry.setIndex([0, 1, 2]);
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
const refineScene = new THREE.Scene();
refineScene.add(mesh);
globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
const refined = await prepareFisheyeMeshes(refineScene, new THREE.Vector3());
refined.apply(true);
const visibility = mesh.geometry.getAttribute('skyVisibility').array;
assert.ok(visibility.length > 3);
assert.deepEqual(Array.from(visibility.slice(0, 3)), [0, 1, 0.5]);
assert.ok(visibility.every((value) => value >= 0 && value <= 1));
refined.apply(false);
assert.equal(mesh.geometry, geometry);
refined.dispose();
delete globalThis.requestAnimationFrame;

console.log(JSON.stringify({ passed: true, skyProbes: samples, checks: [
  'approved material gains', 'four skies and cache', 'renderer state restored on failure',
  'cloth reflection preserves LED gain', 'metal/wood hooks and texture', 'center-lens occlusion interpolation',
] }));
