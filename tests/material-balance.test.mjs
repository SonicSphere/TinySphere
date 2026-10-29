import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.js';
import { MATERIAL_BALANCE } from '../src/settings/material-balance.js';
import { createMaterialBalance, materialBalanceResponse } from '../src/engine/material-balance.js';
import { applySkyFrameMaterials } from '../src/engine/sky-cloth.js';

assert.deepEqual(MATERIAL_BALANCE, { bandSky: 0.30, bandShow: 0.52,
  woodSky: 0.82, woodWarmth: 0.55, woodShow: 0.96 });
for (const atmosphere of ['sunrise', 'sunset', 'peach-dusk', 'stars']) {
  assert.deepEqual(materialBalanceResponse(atmosphere), { ...MATERIAL_BALANCE,
    woodWarmth: ['sunrise', 'sunset'].includes(atmosphere) ? 0.55 : 1 });
}
const balance = createMaterialBalance();
assert.equal(balance.uniforms.balanceBandSky.value, 0.30);
assert.equal(balance.uniforms.balanceWoodSky.value, 0.82);
balance.update('stars');
assert.equal(balance.uniforms.balanceWoodWarmth.value, 1);
balance.update('sunset');
assert.equal(balance.uniforms.balanceWoodWarmth.value, 0.55);

const cloth = new THREE.ShaderMaterial({ fragmentShader:
  'vec3 reflected=irradiance*vec3(.91,.92,.90)/3.14159265359;\ngl_FragColor.rgb+=reflectedSkyCloth();',
  uniforms: { brightness: { value: 1.2 } },
});
const scene = new THREE.Scene();
const wood = new THREE.MeshStandardMaterial();
const metal = new THREE.MeshStandardMaterial();
let woodHooks = 0;
wood.onBeforeCompile = shader => {
  woodHooks++;
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
    'getPointLightInfo( pointLight, geometryPosition, directLight );');
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
    'totalEmissiveRadiance+=diffuseColor.rgb*vPlayaBounce;');
};
const legs = new THREE.Mesh(new THREE.BoxGeometry(), wood);
legs.userData.playaWood = true;
scene.add(legs, new THREE.Mesh(new THREE.BoxGeometry(), metal));
applySkyFrameMaterials(scene, { materialCounts: { wood: 0, struts: 0 },
  uniforms: { studyWoodLight: { value: 2.11 }, studyStrutLight: { value: 1.53 } } });
const metalHook = metal.onBeforeCompile;
balance.apply(cloth, scene);
assert.equal(cloth.uniforms.brightness.value, 1.2, 'Material response preserves show brightness');
assert.ok(cloth.fragmentShader.includes('mix(1.,balanceBandSky,clamp(vWrapMask,0.,1.))'));
assert.equal(metal.onBeforeCompile, metalHook, 'Metal is not retuned');
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader };
wood.onBeforeCompile(shader, null);
assert.equal(woodHooks, 1);
assert.equal(shader.uniforms.balanceWoodSky, balance.uniforms.balanceWoodSky);
assert.ok(shader.fragmentShader.includes('directLight.color*=balanceWoodShow;'));
assert.ok(shader.fragmentShader.includes('vPlayaBounce*balanceWoodShow;'));
assert.ok(shader.fragmentShader.includes('studyEnabled*balanceWoodSky;'));
assert.ok(shader.fragmentShader.includes('#include <map_fragment>'), 'Wood grain remains in the shader');
assert.throws(() => balance.apply(new THREE.ShaderMaterial(), new THREE.Scene()), /accepted material shader/);
console.log(JSON.stringify({ passed: true, checks: ['exact Chrome material defaults',
  'warm tint in Sunrise/Sunset only', 'masked bands', 'wood lights and bounce',
  'unchanged metal and LED brightness', 'preserved material hooks and grain'] }));
