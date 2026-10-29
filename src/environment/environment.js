import * as THREE from '../vendor/three.module.js';
import { clusterFixtures, clusterRadiance, diffuseProbe } from './playa-lighting.js';
import { createTopography } from './topography.js';
import { skyPresetLighting } from './time-of-day.js';
import { loadPhotoPlaya, photoPlayaFragment, PLAYA_MATERIAL } from './playa-material.js';

// Lowest modeled tripod mounting bracket, measured from the approved BM mesh.
// The old -5 cm plane left the complete installation 8.3 cm above the floor.
export const GROUND_Z = 0.03268612523729755;
export const WOOD_SPILL_RESPONSE = 85 / 45;

// A ray field replaces both the finite ground tile and the sky sphere.
// Rotation changes the sky; camera translation only changes the ground sample.
const backdropVertex = `varying vec2 screen;
void main(){screen=position.xy;gl_Position=vec4(position.xy,1.,1.);}`;
const backdropFragment = `
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform vec3 eye;
uniform float groundZ;
uniform float dusk;
uniform float sunset;
uniform float stars;
uniform float daylight;
uniform float photoDusk;
uniform float haze;
uniform sampler2D clay;
uniform vec3 fixturePosition[16];
uniform vec3 fixtureRadiance[16];
uniform vec3 emitterDirection[16];
uniform float directedEmitters;
uniform vec2 installationCenter;
varying vec2 screen;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03+7.1)+.15*noise(p*4.11+19.);}
float starHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
// Points live on world directions, with no longitude seam or zenith pole.
// Nearby 3D lattice vertices identify the sparse stars without a sky texture.
vec3 starField(vec3 d){
 vec3 cell=floor(d*160.);
 float width=max(.00025,.60*max(length(dFdx(d)),length(dFdy(d))));
 vec3 color=vec3(0.);
 for(int x=0;x<2;x++)for(int y=0;y<2;y++)for(int z=0;z<2;z++){
   vec3 id=cell+vec3(float(x),float(y),float(z));
   float chance=starHash(id);
   if(chance>.99){
     vec3 point=id+.18*(vec3(starHash(id+17.2),starHash(id+61.7),starHash(id+43.7))-.5);
     float shell=1.-smoothstep(.20,.65,abs(length(point)-160.));
     vec3 delta=normalize(point)-d;
     float pointLight=exp(-dot(delta,delta)/(2.*width*width))*shell;
     float magnitude=.12+1.1*pow(starHash(id+92.3),7.);
     color+=mix(vec3(.66,.78,1.),vec3(1.,.90,.75),starHash(id+43.7))*pointLight*magnitude;
   }
 }
 return color;
}
vec3 linearColor(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
// A single, stationary cloud field is shared by every lighting preset. No sky
// selector, artwork seed or animation clock enters its coordinates or shape.
float cloudCoverage(vec3 d){
 float h=max(d.z,0.);
 vec2 position=d.xy/(.22+h)*2.7;
 float cloud=smoothstep(.49,.69,fbm(position*vec2(1.,3.8)));
 return cloud*smoothstep(.015,.055,h)*(1.-smoothstep(.30,.78,h));
}
vec3 peachSky(vec3 d){
 float h=max(d.z,0.);
 float glow=pow(.5+.5*dot(normalize(d.xy+vec2(.00001)),normalize(vec2(-.13,.99))),3.);
 vec3 horizon=mix(linearColor(vec3(.66,.39,.39)),linearColor(vec3(1.12,.57,.31)),glow);
 vec3 middle=mix(linearColor(vec3(.47,.43,.48)),linearColor(vec3(.68,.53,.47)),glow);
 vec3 zenith=linearColor(vec3(.40,.445,.49));
 vec3 color=mix(horizon,middle,smoothstep(0.,.14,h));
 return mix(color,zenith,smoothstep(.08,.60,h));
}
vec3 skyColor(vec3 d){
 float h=max(d.z,0.);
 vec2 sun=normalize(vec2(-.7,.7));
 float facing=pow(max(0.,dot(normalize(d.xy+vec2(.00001)),sun))*.5+.5,3.);
 vec3 horizon=mix(linearColor(vec3(.62,.65,.69)),linearColor(vec3(1.,.79,.44)),facing);
 vec3 middle=linearColor(vec3(.48,.56,.62));
 vec3 zenith=linearColor(vec3(.17,.23,.29));
 horizon=mix(horizon,linearColor(vec3(1.,.49,.18)),sunset*(.5+.5*facing));
 middle=mix(middle,linearColor(vec3(.90,.40,.20)),sunset*(.55+.45*facing));
 zenith=mix(zenith,linearColor(vec3(.40,.28,.36)),sunset);
 vec3 twilight=mix(horizon,middle,smoothstep(0.,.19,h));
 twilight=mix(twilight,zenith,smoothstep(.12,.85,h));
 twilight+=linearColor(vec3(1.,.68,.30))*.22*facing*exp(-h*30.);
 // Keep a faint blue night backdrop so black ridgelines remain legible.
 vec3 night=mix(linearColor(vec3(.10,.13,.19)),linearColor(vec3(.045,.065,.105)),smoothstep(0.,.75,h));
 vec3 color=mix(night,twilight,dusk);
 vec3 dayHorizon=linearColor(vec3(.79,.87,.92));
 vec3 dayZenith=linearColor(vec3(.23,.56,.91));
 vec3 daySky=mix(dayHorizon,dayZenith,smoothstep(0.,.72,h));
 daySky+=linearColor(vec3(1.,.96,.83))*.12*facing*exp(-h*9.);
 color=mix(color,daySky,daylight);
 color=mix(color,peachSky(d),photoDusk);
 float cloud=cloudCoverage(d);
 vec3 cloudColor=mix(linearColor(vec3(.20,.21,.25)),linearColor(vec3(1.,1.,1.)),daylight);
 cloudColor=mix(cloudColor,linearColor(vec3(.63,.40,.42)),photoDusk);
 cloudColor=mix(cloudColor,linearColor(vec3(.025,.035,.060)),stars);
 float cloudLight=mix(mix(.48*dusk,.92,daylight),.18,photoDusk);
 color=mix(color,cloudColor,cloud*mix(cloudLight,.38,stars));
 if(stars>0. && dusk<1.){
 color+=starField(d)*stars*pow(1.-dusk,4.)*smoothstep(.002,.06,h)*(1.-cloud*.88);
 }
 return color;
}
void main(){
 vec4 viewRay=inverseProjection*vec4(screen,1.,1.);
 vec3 d=normalize(mat3(cameraWorld)*viewRay.xyz);
 vec3 color=vec3(0.);
 if(d.z>=0.)color=skyColor(d);
 else{
   float height=max(.001,eye.z-groundZ);
   float distance=height/max(-d.z,.0000001);
   float opticalDepth=haze*(.00065*distance+1.8*.007*(1.-exp(-height/1.8))/max(-d.z,.000001));
   opticalDepth=mix(opticalDepth,haze*.000024*distance,photoDusk);
   float visibility=exp(-min(30.,opticalDepth));
   // Daylight lights the playa, then fades out completely for the starry view.
   // At night the old sphere-only illumination and absorbing haze remain.
   if(daylight>0.)color=daylight*skyColor(normalize(vec3(d.xy,.002)))*(1.-visibility);
   color+=photoDusk*linearColor(vec3(.25,.27,.32))*(1.-visibility);
   if(visibility>.002){
     vec2 position=eye.xy+d.xy*distance;
     vec3 texel=texture2D(clay,position/1.5).rgb;
     float luminance=dot(texel,vec3(.2126,.7152,.0722));
     vec3 albedo=mix(vec3(luminance),texel,.10)*vec3(.83,.83,.84);
     albedo*=.90+.18*fbm(position*.045);
     vec3 irradiance=vec3(1.65,1.59,1.46)*daylight;
     irradiance+=photoDusk*vec3(.055,.080,.112);
     if(length(position-installationCenter)<75.)for(int i=0;i<16;i++){
       vec3 delta=fixturePosition[i]-vec3(position,groundZ);
       float r2=dot(delta,delta);
       float range=pow(clamp(1.-pow(sqrt(r2)/38.,4.),0.,1.),2.);
       float emission=mix(1.,4.*max(0.,dot(emitterDirection[i],-delta/max(.0001,sqrt(r2)))),directedEmitters);
       irradiance+=fixtureRadiance[i]*emission*max(0.,delta.z)*range/max(.16,r2*sqrt(r2));
     }
     color+=albedo*irradiance*visibility;
   }
 }
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

// Reuse the analytic sky for diffuse material light without a second palette.
export const SKY_COLOR_GLSL = backdropFragment.slice(
  backdropFragment.indexOf('float hash('), backdropFragment.indexOf('void main(){'),
);

export async function createPlayaEnvironment(
  scene,
  renderer,
  center,
  fixturePositions,
  woodReceiver,
  assets = {},
) {
  const topography = createTopography(scene, center, assets);
  const root = new THREE.Group();
  root.name = 'PLAYA / infinite flat horizon';
  scene.add(root);
  const [clay] = await Promise.all([loadPhotoPlaya(renderer, assets.loadBytes), topography.load()]);
  const clothGroups = clusterFixtures(fixturePositions, 16),
    ledEmitters = assets.ledEmitters;
  if (ledEmitters && ledEmitters.groups.length !== 16)
    throw Error('The LED field must fit the shared 16-light budget.');
  let groups = clothGroups,
    emitterSource = 'cloth';
  const colors = new Float32Array(groups.length * 3);
  const positions = groups.map((group) => new THREE.Vector3(...group.position)),
    radiance = groups.map(() => new THREE.Vector3());
  const emitterDirection = { value: groups.map(() => new THREE.Vector3()) },
    directedEmitters = { value: 0 };
  const uniforms = {
    inverseProjection: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() },
    eye: { value: new THREE.Vector3() },
    groundZ: { value: GROUND_Z },
    dusk: { value: 1 },
    sunset: { value: 0 },
    stars: { value: 0 },
    daylight: { value: 0 },
    photoDusk: { value: 0 },
    haze: { value: 1 },
    clay: { value: clay },
    fixturePosition: { value: positions },
    fixtureRadiance: { value: radiance },
    emitterDirection,
    directedEmitters,
    installationCenter: { value: new THREE.Vector2(center.x, center.y) },
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const backdrop = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: backdropVertex,
      fragmentShader: photoPlayaFragment(backdropFragment),
      depthTest: false,
      depthWrite: false,
    }),
  );
  backdrop.name = 'PLAYA / analytic infinite ground and sky';
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1000;
  root.add(backdrop);
  const lights = groups.map((group, i) => {
    const light = new THREE.PointLight(0xffffff, 24 * (group.fixtures.length / 9), 38, 2);
    light.position.fromArray(group.position);
    light.name = 'PLAYA / live sail light ' + i;
    scene.add(light);
    return light;
  });
  // Use the same LED-facing lobe for the real meshes and the analytic ground.
  // Reuse the existing 16 lights instead of adding thousands of shadow lights.
  const configuredMaterials = new Set();
  scene.traverse((object) => {
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!mat?.isMeshStandardMaterial || configuredMaterials.has(mat)) continue;
      configuredMaterials.add(mat);
      const compile = mat.onBeforeCompile,
        cacheKey = mat.customProgramCacheKey();
      mat.onBeforeCompile = (shader, webgl) => {
        compile.call(mat, shader, webgl);
        Object.assign(shader.uniforms, { emitterDirection, directedEmitters });
        shader.fragmentShader =
          'uniform vec3 emitterDirection[16]; uniform float directedEmitters;\n' +
          shader.fragmentShader;
        const call = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
        const lighting = THREE.ShaderChunk.lights_fragment_begin.replace(
          call,
          call +
            '\n directLight.color *= mix(1.,4.*max(0.,dot(mat3(viewMatrix)*emitterDirection[ i ],-directLight.direction)),directedEmitters);',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_begin>',
          lighting,
        );
      };
      mat.customProgramCacheKey = () => cacheKey + ' / active-emitter-directions-v1';
    }
  });
  const dayFill = new THREE.HemisphereLight(0xe3efff, 0xc6b798, 0);
  dayFill.position.set(0, 0, 1);
  dayFill.name = 'PLAYA / daytime sky fill';
  scene.add(dayFill);
  const sunLight = new THREE.DirectionalLight(0xfff4df, 0);
  sunLight.position.copy(center).add(new THREE.Vector3(-40, 40, 65));
  sunLight.target.position.copy(center);
  sunLight.name = 'PLAYA / daytime sun';
  scene.add(sunLight, sunLight.target);
  const woodBounces = [];
  scene.traverse((object) => {
    if (!object.userData.playaWood) return;
    object.geometry.computeBoundingBox();
    const local = object.geometry.boundingBox.getCenter(new THREE.Vector3()),
      matrix = new THREE.Matrix4(),
      probes = [];
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      const p = local.clone().applyMatrix4(matrix);
      probes.push([p.x, p.y, GROUND_Z + 0.01]);
    }
    woodBounces.push({ attribute: object.geometry.getAttribute('playaBounce'), probes });
  });
  renderer.shadowMap.enabled = false;
  let dusk = 1,
    lastBrightness = 1,
    lastSpill = 1,
    atmosphere = 'sunrise',
    dust = 1,
    starsVisible = false;
  let setting = skyPresetLighting('sunset');
  function updateCamera(camera) {
    camera.updateMatrixWorld();
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
  }
  function update(state, pixels, camera, source = 'cloth') {
    if (source !== emitterSource) {
      if (source === 'tube-leds' && !ledEmitters)
        throw Error('Tube LEDs require their own emitter field.');
      emitterSource = source;
      groups = source === 'tube-leds' ? ledEmitters.groups : clothGroups;
      directedEmitters.value = source === 'tube-leds' ? 1 : 0;
      for (let i = 0; i < lights.length; i++) {
        positions[i].fromArray(groups[i].position);
        lights[i].position.copy(positions[i]);
        lights[i].intensity = 24 * ((groups[i].weight ?? groups[i].fixtures.length) / 9);
        lights[i].name = 'PLAYA / ' + source + ' light ' + i;
        emitterDirection.value[i].fromArray(groups[i].direction ?? [0, 0, 0]);
      }
    }
    setting = skyPresetLighting(state.atmosphere);
    dusk = setting.dusk;
    atmosphere = state.atmosphere;
    topography.update({ ...state, atmosphere, sky: Math.pow(dusk, 2 / 3) });
    lastBrightness = state.brightness;
    lastSpill = state.lightSpill;
    dust = state.haze;
    starsVisible = setting.stars > 0;
    dayFill.intensity = 2.8 * setting.daylight + 0.12 * setting.photoDusk;
    sunLight.intensity = 2.2 * setting.daylight;
    dayFill.color.setHex(setting.photoDusk ? 0xa7bfd8 : 0xe3efff);
    dayFill.groundColor.setHex(setting.photoDusk ? 0x5a5968 : 0xc6b798);
    updateCamera(camera);
    uniforms.dusk.value = dusk;
    uniforms.sunset.value = setting.sunset;
    uniforms.stars.value = setting.stars;
    uniforms.daylight.value = setting.daylight;
    uniforms.haze.value = dust;
    uniforms.photoDusk.value = setting.photoDusk;
    if (emitterSource === 'none') colors.fill(0);
    else if (emitterSource === 'tube-leds')
      ledEmitters.update(
        pixels,
        state.brightness * setting.artVisibility,
        state.lightSpill,
        colors,
      );
    else clusterRadiance(pixels, groups, state.brightness, state.lightSpill, colors);
    for (let i = 0; i < lights.length; i++) {
      lights[i].color.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      radiance[i]
        .set(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
        .multiplyScalar(lights[i].intensity);
    }
    for (const bounce of woodBounces) {
      for (let i = 0; i < bounce.probes.length; i++) {
        const rgb = diffuseProbe(bounce.probes[i], [0, 0, 1], groups, colors, 24);
        bounce.attribute.setXYZ(i, rgb[0] * 0.15, rgb[1] * 0.15, rgb[2] * 0.15);
      }
      bounce.attribute.needsUpdate = true;
    }
    document.body.dataset.sky = String(dusk);
    document.body.dataset.lightSpill = String(state.lightSpill);
    document.body.dataset.timeOfDay = String(setting.timeOfDay);
    document.body.dataset.daylight = String(setting.daylight);
    document.body.dataset.emitterSource = emitterSource;
  }
  function stats() {
    return {
      groundMaterial: 'photo-guided-playa',
      playaMaterial: PLAYA_MATERIAL,
      groundMetres: null,
      groundZ: GROUND_Z,
      groundFlat: true,
      infiniteGround: true,
      skyAtInfinity: true,
      groundMethod: 'analytic ray-plane intersection',
      skyMethod: 'world direction only; translation independent',
      cutawayVoxelCount: 0,
      liveLights: emitterSource === 'none' ? 0 : lights.length,
      allocatedSphereLights: lights.length,
      contributingFixtures:
        emitterSource === 'none' ? 0 : emitterSource === 'tube-leds'
          ? ledEmitters.fixtureCount
          : groups.reduce((sum, g) => sum + g.fixtures.length, 0),
      emitterSource,
      contributingLEDs: emitterSource === 'tube-leds' ? ledEmitters.ledCount : 0,
      usesClothCenterSample: emitterSource === 'cloth',
      directionalEmission: directedEmitters.value === 1,
      sky: dusk,
      atmosphere,
      starsVisible,
      timeOfDay: setting.timeOfDay,
      daylight: setting.daylight,
      stars: setting.stars,
      haze: dust,
      brightness: lastBrightness,
      lightSpill: lastSpill,
      nightSky: starsVisible
        ? 'Faint blue backdrop with pixel-sized stars'
        : 'Faint blue backdrop without stars',
      woodResponseGain: WOOD_SPILL_RESPONSE,
      woodEquivalentSpill: lastSpill * WOOD_SPILL_RESPONSE,
      onlySphereLights: setting.daylight === 0 && !setting.photoDusk,
      groundAmbientRgb: [1.65, 1.59, 1.46].map(
        (v, i) => v * setting.daylight + setting.photoDusk * [0.055, 0.08, 0.112][i],
      ),
      hazeAddsLight: setting.daylight > 0 || setting.photoDusk > 0,
      photoDusk: setting.photoDusk,
      photoReference: 'User-supplied final dusk photograph; palette and atmosphere only',
      topography: topography.stats(),
      otherLightCount: scene.children.filter(
        (object) => object.isLight && !lights.includes(object) && object.intensity > 0,
      ).length,
      allocatedDayLights: 2,
      dayFillIntensity: dayFill.intensity,
      sunIntensity: sunLight.intensity,
      groundIrradiance: diffuseProbe(
        [center.x + 3, center.y, GROUND_Z],
        [0, 0, 1],
        groups,
        colors,
        24,
      ),
      woodReceiver,
      woodIrradiance: woodReceiver
        ? diffuseProbe(woodReceiver.position, woodReceiver.normal, groups, colors, 24).map(
            (v) => v * WOOD_SPILL_RESPONSE,
          )
        : null,
      spillRgbSum: Array.from(colors).reduce((sum, c) => sum + c, 0),
      woodBounceInstances: woodBounces.reduce((sum, b) => sum + b.probes.length, 0),
      cameraHeightMetres: uniforms.eye.value.z - GROUND_Z,
      optics:
        'Sunrise, sunset and stars retain sphere-only foreground lighting. Peach dusk adds faint cool fill and dusty ground haze. Cloth-free forms use the actual LED chip positions, facing directions and angular colors in the existing 16-light grouping; clothed forms retain diffuse cloth lighting. Lighting and haze are artistic real-time approximations.',
    };
  }
  return {
    update,
    updateCamera,
    stats,
    root,
    ground: backdrop,
    wrapLighting: { position: uniforms.fixturePosition, radiance: uniforms.fixtureRadiance },
  };
}
