import { SKY_CLOTH_APPEARANCE } from '../settings/sky-cloth.js';
import * as THREE from '../vendor/three.module.js';
import { SKY_COLOR_GLSL } from '../environment/environment.js';
import { skyPresetLighting } from '../environment/time-of-day.js';

export function clothResponseSettings(settings, atmosphere) {
  return { gain: settings.clothLight,
    shadowDepth: atmosphere === 'stars' ? 0 : settings.shadowDepth,
    whiteness: atmosphere === 'sunset' ? settings.clothWhiteness : 0,
    nightUnchanged: atmosphere === 'stars' };
}

// Real SH through band two; convolution by the clamped cosine and division by
// pi give diffuse outgoing radiance for a unit-albedo Lambertian surface.
function basis([x, y, z]) {
  return [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x,
    1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
    1.092548 * x * z, 0.546274 * (x * x - y * y)];
}
const convolution = [1, 2 / 3, 2 / 3, 2 / 3, 1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 4];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function integrateSkyProbe(bytes, width, height) {
  const sky = Array.from({ length: 9 }, () => [0, 0, 0]);
  const horizon = Array.from({ length: 9 }, () => [0, 0, 0]);
  const mean = [0, 0, 0];
  const solidAngle = 2 * Math.PI / (width * height);
  for (let row = 0; row < height; row++) {
    const z = (row + 0.5) / height, radius = Math.sqrt(1 - z * z);
    const horizonWeight = 1 - smooth(0.08, 0.30, z);
    for (let col = 0; col < width; col++) {
      const phi = (col + 0.5) / width * 2 * Math.PI;
      const weights = basis([Math.cos(phi) * radius, Math.sin(phi) * radius, z]);
      const offset = (row * width + col) * 4;
      for (let channel = 0; channel < 3; channel++) {
        // The probe shader encodes a 0..2 scene-linear range into an 8-bit
        // gamma curve. Decode before integration; no display tone mapping.
        const radiance = (bytes[offset + channel] / 255) ** 2.2 * 2;
        mean[channel] += radiance / (width * height);
        for (let band = 0; band < 9; band++) {
          const energy = radiance * weights[band] * solidAngle * convolution[band];
          sky[band][channel] += energy * (1 - horizonWeight);
          horizon[band][channel] += energy * horizonWeight;
        }
      }
    }
  }
  return { sky, horizon, ground: mean.map((value, i) => value * [0.12, 0.105, 0.085][i]) };
}

export function createSkyClothLighting(renderer, center, radius) {
  const settings = SKY_CLOTH_APPEARANCE;
  let activeSky = null;
  const probes = new Map();
  const materialCounts = { struts: 0, wood: 0 };
  const uniforms = {
    studySky: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
    studyHorizon: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
    studyGround: { value: new THREE.Vector3() },
    studyStrength: { value: new THREE.Vector2(settings.skyFill, settings.horizonLight) },
    studyTransmission: { value: settings.transmission },
    studyVerticalFalloff: { value: settings.verticalFalloff },
    studyCenterHeight: { value: center.z },
    studyRadius: { value: radius },
    studyEnabled: { value: 1 },
    studyStrutLight: { value: settings.strutLight },
    studyWoodLight: { value: settings.woodLight },
    studyClothLight: { value: settings.clothLight },
    studyShadowDepth: { value: settings.shadowDepth },
    studyClothWhiteness: { value: 0 },
    studyNight: { value: 0 },
  };
  // Sample the SAME analytic sky, including its color gradients and clouds,
  // once per preset. The cloth shader only evaluates the compact diffuse probe.
  const probeUniforms = Object.fromEntries(
    ['dusk', 'sunset', 'stars', 'daylight', 'photoDusk'].map((name) => [name, { value: 0 }]),
  );
  const probeMaterial = new THREE.ShaderMaterial({
    uniforms: probeUniforms,
    vertexShader: 'varying vec2 probeUV; void main(){probeUV=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform float dusk,sunset,stars,daylight,photoDusk;
      varying vec2 probeUV;
      ${SKY_COLOR_GLSL}
      void main(){
        float z=probeUV.y,phi=probeUV.x*6.28318530718;
        float r=sqrt(max(0.,1.-z*z));
        vec3 d=vec3(cos(phi)*r,sin(phi)*r,z);
        gl_FragColor=vec4(pow(max(vec3(0.),skyColor(d))*.5,vec3(1./2.2)),1.);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const probeScene = new THREE.Scene();
  const probeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), probeMaterial);
  probeMesh.frustumCulled = false;
  probeScene.add(probeMesh);
  const probeCamera = new THREE.Camera();
  const width = 64, height = 32;
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, stencilBuffer: false });
  target.texture.colorSpace = THREE.NoColorSpace;
  function sample(atmosphere) {
    const light = skyPresetLighting(atmosphere);
    for (const key of Object.keys(probeUniforms)) probeUniforms[key].value = light[key];
    const previous = renderer.getRenderTarget();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const bytes = new Uint8Array(width * height * 4);
    try {
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      renderer.render(probeScene, probeCamera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
    }
    return integrateSkyProbe(bytes, width, height);
  }
  function syncClothResponse() {
    const response = clothResponseSettings(settings, activeSky);
    uniforms.studyClothLight.value = response.gain;
    uniforms.studyNight.value = response.nightUnchanged ? 1 : 0;
    uniforms.studyShadowDepth.value = response.shadowDepth;
    uniforms.studyClothWhiteness.value = response.whiteness;
  }
  function update(atmosphere) {
    if (activeSky === atmosphere) return;
    if (!probes.has(atmosphere)) probes.set(atmosphere, sample(atmosphere));
    const probe = probes.get(atmosphere);
    for (let i = 0; i < 9; i++) {
      uniforms.studySky.value[i].fromArray(probe.sky[i]);
      uniforms.studyHorizon.value[i].fromArray(probe.horizon[i]);
    }
    uniforms.studyGround.value.fromArray(probe.ground);
    activeSky = atmosphere;
    syncClothResponse();
  }
  return { uniforms, update, materialCounts };
}

const skyProbeGLSL = `
uniform vec3 studySky[9],studyHorizon[9],studyGround;
uniform vec2 studyStrength;
uniform float studyTransmission,studyEnabled,studyVerticalFalloff,studyCenterHeight,studyRadius;
vec3 diffuseSky(vec3 n){
  float b[9];
  b[0]=.282095;b[1]=.488603*n.y;b[2]=.488603*n.z;b[3]=.488603*n.x;
  b[4]=1.092548*n.x*n.y;b[5]=1.092548*n.y*n.z;
  b[6]=.315392*(3.*n.z*n.z-1.);b[7]=1.092548*n.x*n.z;
  b[8]=.546274*(n.x*n.x-n.y*n.y);
  vec3 sky=vec3(0.),horizon=vec3(0.);
  for(int i=0;i<9;i++){sky+=studySky[i]*b[i];horizon+=studyHorizon[i]*b[i];}
  return max(vec3(0.),sky)*studyStrength.x+max(vec3(0.),horizon)*studyStrength.y
    +studyGround*studyStrength.x*(.5-.5*n.z);
}
`;
const reflectedSky = skyProbeGLSL + `
uniform float studyClothLight,studyShadowDepth,studyClothWhiteness,studyNight;
varying float vStudySkyVisibility;
vec3 reflectedSkyCloth(){
  vec3 n=normalize(vFabricNormal)*(gl_FrontFacing?1.:-1.);
  vec3 incident=mix(diffuseSky(n),diffuseSky(-n),studyTransmission);
  float contact=smoothstep(.064,.0864,length(vUV));
  // Broad sky exposure, not a sun lobe: the crown sees more of the bright
  // hemisphere, while the lower fabric is sheltered by the installation.
  float height=(vWrapPosition.z-studyCenterHeight)/studyRadius;
  float falloff=studyVerticalFalloff;
  if(studyNight<.5)falloff=1.-pow(1.-falloff,1.15);
  float exposure=mix(1.,.12+.88*smoothstep(-.85,.95,height),falloff);
  // White fabric keeps a trace of sunset warmth, independently of LED colors.
  if(studyClothWhiteness>0.){
    float luminance=dot(incident,vec3(.2126,.7152,.0722));
    incident=mix(incident,vec3(luminance),studyClothWhiteness);
  }
  float skyVisibility=mix(clamp(vStudySkyVisibility,0.,1.),1.,.35*studyTransmission);
  float shadow=mix(1.,skyVisibility,studyShadowDepth);
  return incident*exposure*vec3(.91,.92,.90)*mix(.18,1.,max(contact,vWrapMask))*studyEnabled*studyClothLight*shadow;
}
`;
export function applySkyClothMaterial(material, lighting) {
  const marker = '#include <tonemapping_fragment>';
  if (!material.fragmentShader.includes(marker) || !material.fragmentShader.includes('vWrapMask'))
    throw Error('Apply sky lighting after the approved matte wrap material.');
  // Place the shared function after the original varying declarations.
  material.vertexShader = 'attribute float skyVisibility; varying float vStudySkyVisibility;\n' +
    material.vertexShader.replace('void main(){', 'void main(){vStudySkyVisibility=skyVisibility;');
  material.fragmentShader = material.fragmentShader.replace('void main(){', `${reflectedSky}\nvoid main(){`)
    .replace(marker, `gl_FragColor.rgb+=reflectedSkyCloth();\n${marker}`);
  Object.assign(material.uniforms, lighting.uniforms);
  material.needsUpdate = true;
}

export function applySkyFrameMaterials(scene, lighting) {
  const seen = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const role = object.userData.playaWood ? 'wood' : 'struts';
    for (const material of [object.material].flat()) {
      if (!material?.isMeshStandardMaterial || seen.has(material)) continue;
      seen.add(material);
      lighting.materialCounts[role]++;
      const compile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer);
        Object.assign(shader.uniforms, lighting.uniforms, {
          studyOpaqueStrength: role === 'wood' ? lighting.uniforms.studyWoodLight : lighting.uniforms.studyStrutLight,
        });
        shader.vertexShader = 'varying vec3 studyWorldPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
          #include <project_vertex>
          vec4 studyWorld=vec4(transformed,1.);
          #ifdef USE_BATCHING
            studyWorld=batchingMatrix*studyWorld;
          #endif
          #ifdef USE_INSTANCING
            studyWorld=instanceMatrix*studyWorld;
          #endif
          studyWorldPosition=(modelMatrix*studyWorld).xyz;
        `);
        shader.fragmentShader = `varying vec3 studyWorldPosition;
          uniform float studyOpaqueStrength;\n${skyProbeGLSL}\n` + shader.fragmentShader;
        const reflected = role === 'wood'
          ? 'vec3 studyReflection=diffuseSky(studyNormal)*diffuseColor.rgb;'
          : `vec3 studyView=normalize(cameraPosition-studyWorldPosition);
             vec3 studyReflected=reflect(-studyView,studyNormal);
             // A broad sky reflection supplies the metal's missing environment
             // response; the diffuse term and cylinder normals retain shape.
             vec3 studyEnvironment=mix(diffuseSky(studyReflected),diffuseSky(studyNormal),roughnessFactor);
             vec3 studyF0=mix(vec3(.04),diffuseColor.rgb,metalnessFactor);
             vec3 studyReflection=diffuseSky(studyNormal)*diffuseColor.rgb*(1.-metalnessFactor)
               +studyEnvironment*studyF0;`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
          vec3 studyNormal=normalize(inverseTransformDirection(normal,viewMatrix));
          ${reflected}
          outgoingLight+=studyReflection*studyOpaqueStrength*studyEnabled;
          #include <opaque_fragment>
        `);
      };
      material.customProgramCacheKey = () => cacheKey + '|sky-frame-' + role + '-v1';
      material.needsUpdate = true;
    }
  });
}
