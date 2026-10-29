import { MATERIAL_BALANCE } from '../settings/material-balance.js';

export function materialBalanceResponse(atmosphere) {
  return { ...MATERIAL_BALANCE, woodWarmth: ['sunrise', 'sunset'].includes(atmosphere)
    ? MATERIAL_BALANCE.woodWarmth : 1 };
}

function replaceRequired(source, marker, replacement) {
  if (!source.includes(marker)) throw Error('Material balance needs the accepted material shader: ' + marker);
  return source.replace(marker, replacement);
}

export function createMaterialBalance() {
  let sky = 'sunset';
  const uniforms = Object.fromEntries(Object.keys(MATERIAL_BALANCE).map(key => [
    'balance' + key[0].toUpperCase() + key.slice(1), { value: 1 },
  ]));
  function sync() {
    for (const [key, value] of Object.entries(materialBalanceResponse(sky)))
      uniforms['balance' + key[0].toUpperCase() + key.slice(1)].value = value;
  }
  sync();
  function apply(cloth, scene) {
    cloth.fragmentShader = 'uniform float balanceBandSky,balanceBandShow;\n' + cloth.fragmentShader;
    cloth.fragmentShader = replaceRequired(cloth.fragmentShader,
      'vec3 reflected=irradiance*vec3(.91,.92,.90)/3.14159265359;',
      'vec3 reflected=irradiance*vec3(.91,.92,.90)/3.14159265359*balanceBandShow;');
    cloth.fragmentShader = replaceRequired(cloth.fragmentShader,
      'gl_FragColor.rgb+=reflectedSkyCloth();',
      'gl_FragColor.rgb+=reflectedSkyCloth()*mix(1.,balanceBandSky,clamp(vWrapMask,0.,1.));');
    Object.assign(cloth.uniforms, uniforms);
    cloth.needsUpdate = true;
    const seen = new Set();
    scene.traverse(object => {
      if (!object.userData.playaWood) return;
      for (const material of [object.material].flat()) {
        if (!material?.isMeshStandardMaterial || seen.has(material)) continue;
        seen.add(material);
        const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
        material.onBeforeCompile = function(shader, renderer) {
          compile.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = 'uniform float balanceWoodSky,balanceWoodWarmth,balanceWoodShow;\n' + shader.fragmentShader;
          shader.fragmentShader = replaceRequired(shader.fragmentShader,
            'totalEmissiveRadiance+=diffuseColor.rgb*vPlayaBounce;',
            'totalEmissiveRadiance+=diffuseColor.rgb*vPlayaBounce*balanceWoodShow;');
          shader.fragmentShader = replaceRequired(shader.fragmentShader,
            'getPointLightInfo( pointLight, geometryPosition, directLight );',
            'getPointLightInfo( pointLight, geometryPosition, directLight );\n directLight.color*=balanceWoodShow;');
          shader.fragmentShader = replaceRequired(shader.fragmentShader,
            'vec3 studyReflection=diffuseSky(studyNormal)*diffuseColor.rgb;',
            `vec3 balanceIncident=diffuseSky(studyNormal);
             float balanceLuma=dot(balanceIncident,vec3(.2126,.7152,.0722));
             vec3 studyReflection=mix(vec3(balanceLuma),balanceIncident,balanceWoodWarmth)*diffuseColor.rgb;`);
          shader.fragmentShader = replaceRequired(shader.fragmentShader,
            'outgoingLight+=studyReflection*studyOpaqueStrength*studyEnabled;',
            'outgoingLight+=studyReflection*studyOpaqueStrength*studyEnabled*balanceWoodSky;');
        };
        material.customProgramCacheKey = () => cacheKey + '|material-balance-wood-v1';
        material.needsUpdate = true;
      }
    });
  }
  return {
    uniforms, apply,
    update(atmosphere) { if (sky !== atmosphere) { sky = atmosphere; sync(); } },
  };
}
