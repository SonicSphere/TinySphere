import { applyMatteWrapMaterial, validateWrapMask, WRAP_MATERIAL } from './engine/wrap-material.js';
import { compactLayout } from './ui/ui.js';
import { FORM_STYLES, createTubeLights } from './engine/tube-lights.js';
import { FORM_WEIGHTS } from './engine/form-choice.js';
import {
  ORBIT_RADIANS_PER_SECOND,
  CAMERA_FOV_DEGREES,
  MAX_CAMERA_DISTANCE,
  advanceOrbit,
  orbitPose,
} from './camera/orbit.js';
import {
  preloadAssets,
  loadBytes,
  loadJSON,
  loadTexture,
  loadingStage,
  finishLoading,
  failLoading,
  loadingStatus,
  releaseDownloads,
} from './ui/loading.js';
import * as THREE from './vendor/three.module.js';
import {
  renderArtwork,
  prepareArtworkPoints,
  LOOKS,
  LOOK_INFO,
  PALETTES,
  spectralMusicPresence,
} from './engine/artwork.js';
import { TabAudio, MusicMotion } from './audio/audio.js';
import { DefaultMusic } from './audio/default-music.js';
import { bindCameraGestures } from './camera/gestures.js';
import { createPlayaEnvironment, WOOD_SPILL_RESPONSE } from './environment/environment.js';
import {
  SKY_PRESETS,
  SKY_LABELS,
  skyPresetLighting,
  presetFromTime,
} from './environment/time-of-day.js';
import { PaletteWalk } from './engine/palette-walk.js';
import { musicAsset, geometryAsset } from './load-manifest.js';
import { unpackGeometry } from './engine/geometry.js';
import { repairHardwareNormals, createHardwareContactMaterial } from './engine/hardware-shading.js';
import { ARRIVAL_DEFAULTS } from './settings/arrival-defaults.js';
import { LookWipe } from './engine/look-wipe.js';
import { SHOWS } from './shows/index.js';
import { THEMES, themeState } from './themes/index.js';

const $ = (id) => document.getElementById(id),
  qaKey = new URLSearchParams(location.search).get('qa'),
  storageKey = 'sonic-sphere-minimal-v3' + (qaKey === null ? '' : '-qa-' + qaKey.slice(0, 64));
const defaults = ARRIVAL_DEFAULTS;
const limits = {
  flowSpeed: [0.1, 10],
  washSpeed: [0.1, 10],
  flashSpeed: [0.1, 10],
  washAmount: [0, 1.5],
  washEvery: [8, 40],
  flashCount: [0, 40],
  flashSize: [0.05, 0.65],
  flashIntensity: [0, 4],
  buildTime: [0.5, 8],
  burstIntensity: [0.5, 3],
  burstEvery: [12, 60],
  brightness: [0, 2.5],
  softness: [0, 2],
  edgeFade: [0, 2],
  detail: [0.45, 2.1],
  wildness: [0, 1],
  seed: [1, 2147483646],
  flowTime: [0, 1e9],
  washTime: [0, 1e9],
  flashTime: [0, 1e9],
  realTime: [0, 1e9],
  distance: [0, MAX_CAMERA_DISTANCE],
  elevation: [-Math.PI / 2, Math.PI / 2],
  azimuth: [-1e6, 1e6],
};
limits.audioReaction = [0, 1];
limits.timeOfDay = [0, 1];
limits.mountainHaze = [0, 1];
limits.ridgeDetail = [0, 1];
Object.assign(limits, { sky: [0, 1], haze: [0.1, 2], lightSpill: [0, 2] });
function validated(input) {
  let next = { ...input };
  // Restore the earlier view when opening preferences or links from the
  // removed study. The deleted artwork and camera mode cannot reactivate.
  if (next.look === 'photo' || next.photoScene) {
    let earlier = {};
    try {
      earlier = JSON.parse(localStorage.getItem(storageKey + '-before-photo') || '{}');
    } catch {}
    next = { ...defaults, ...earlier };
  }
  const valid = {};
  if (next.look === 'forms') next.look = 'eq';
  if (next.time !== undefined) next.flowTime = next.time;
  if (next.speed !== undefined) next.flowSpeed = next.speed;
  for (const [k, v] of Object.entries(next)) {
    if (k in limits && Number.isFinite(Number(v)))
      valid[k] = Math.max(limits[k][0], Math.min(limits[k][1], Number(v)));
    else if (['playing', 'orbit', 'autoBurst', 'musicalPhrasing'].includes(k)) valid[k] = !!v;
    else if (k === 'look' && Object.hasOwn(LOOK_INFO, v)) valid[k] = v;
    else if (k === 'venue') valid[k] = 'burning-man';
    else if (k === 'formStyle' && Object.hasOwn(FORM_STYLES, v)) valid[k] = v;
    else if (k === 'palette' && Object.hasOwn(PALETTES, v)) valid[k] = v;
    else if (k === 'flashColorMode' && ['theme', 'custom'].includes(v)) valid[k] = v;
    else if (k === 'flashColor' && /^#[0-9a-f]{6}$/i.test(v)) valid[k] = v;
    else if (k === 'burstAt' && (v === null || Number.isFinite(v))) valid[k] = v;
    else if (k === 'framing' && ['island', 'playa', 'sphere'].includes(v))
      valid[k] = v === 'island' ? 'playa' : v;
    else if (k === 'atmosphere' && ['dusk', 'night', ...SKY_PRESETS].includes(v))
      valid[k] = v === 'dusk' ? 'sunset' : v === 'night' ? 'stars' : v;
    else if (k === 'terrainRadius' && Number(v) === 20) valid[k] = 20;
    else if (['dayNightVersion', 'skyPresetVersion'].includes(k) && v === 1) valid[k] = 1;
    else if (k === 'settingVersion' && [1, 2, 3].includes(v)) valid[k] = v;
  }
  if (valid.timeOfDay !== undefined && !valid.atmosphere)
    valid.atmosphere = presetFromTime(valid.timeOfDay);
  if (valid.flashCount !== undefined) valid.flashCount = Math.round(valid.flashCount);
  return valid;
}
let linked = {},
  linkedVenue = null;
try {
  const match = location.hash.match(/^#view=([A-Za-z0-9_-]{1,8192})$/);
  if (match) {
    const raw = JSON.parse(atob(match[1].replace(/-/g, '+').replace(/_/g, '/')));
    linkedVenue = raw.venue;
    linked = validated(raw);
  }
} catch {}
const cameraDefaults = {
  distance: compactLayout.matches ? 32 : 42,
  elevation: -0.1,
  azimuth: -0.9,
};
// Every normal arrival restores the complete approved appearance, including
// camera and animation phase. Earlier browser preferences cannot override it.
const state = { ...defaults, ...linked, venue: 'burning-man', terrainRadius: 20 };
// Nashville views refer to another model and cannot supply a camera here.
if (Object.keys(linked).length && linkedVenue !== 'burning-man') {
  for (const key of ['distance', 'elevation', 'azimuth']) state[key] = defaults[key];
}
state.skyPresetVersion = 1;
syncTimeOfDay();
const paletteWalk = new PaletteWalk(PALETTES, state.palette);
state.dayNightVersion = 1;
function syncTimeOfDay() {
  const light = skyPresetLighting(state.atmosphere);
  state.timeOfDay = light.timeOfDay;
  state.sky = light.dusk;
}
let musicMotion = new MusicMotion(),
  musicFrame = null;
let selectedSource = 'tree-voices',
  resumeDefault = false;
function activeAudio() {
  return selectedSource === 'tab' ? tabAudio : defaultMusic;
}
function syncAudioUI() {
  const tab = tabAudio.status(),
    status = activeAudio().status();
  const connected = tab.phase === 'connected',
    choosing = tab.phase === 'choosing';
  $('listen').disabled = connected || choosing;
  $('disconnect-audio').disabled = !connected && !choosing;
  $('listen').textContent = choosing ? 'Choose a tab…' : 'Connect browser tab';
  $('listen').hidden = connected;
  $('disconnect-audio').hidden = !connected && !choosing;
  $('disconnect-audio').textContent = choosing ? 'Cancel connection' : 'Disconnect tab';
  const songPlaying =
    selectedSource === 'tree-voices' && ['connected', 'starting'].includes(status.phase);
  $('default-track').setAttribute(
    'aria-label',
    selectedSource === 'tab'
      ? 'Play Tree Voices'
      : songPlaying
        ? 'Pause Tree Voices'
        : 'Play Tree Voices',
  );
  $('default-track').setAttribute('aria-busy', String(status.phase === 'starting'));
  $('track-title').textContent = selectedSource === 'tab' ? 'Browser tab' : 'Tree Voices';
  $('track-state').textContent =
    selectedSource === 'tab'
      ? choosing
        ? 'Choose a tab to connect'
        : 'Listening live'
      : status.phase === 'starting'
        ? 'Starting…'
        : status.phase === 'connected'
          ? 'Playing'
          : status.phase === 'paused'
            ? 'Paused'
            : status.phase === 'blocked'
              ? 'Tap play to begin'
              : status.phase === 'error'
                ? 'Tap to retry'
                : 'Ready to play';
  $('default-track').setAttribute(
    'aria-pressed',
    String(selectedSource === 'tree-voices' && status.phase === 'connected'),
  );
  $('audio-status').textContent = choosing
    ? 'Choose a tab · share audio'
    : tab.phase === 'error'
      ? tab.message
      : '';
  $('audio-status').dataset.phase = tab.phase;
  $('track-status').textContent =
    selectedSource === 'tree-voices' && status.phase === 'error' ? status.message : '';
  const tabSelected = selectedSource === 'tab';
  $('default-track').hidden = tabSelected;
  $('tab-track').hidden = !tabSelected;
  $('use-tree-voices').setAttribute('aria-pressed', String(!tabSelected));
  document.body.dataset.audio = status.phase;
  document.body.dataset.musicSource = selectedSource;
  const musicStatus = defaultMusic.status();
  document.body.dataset.musicPrepared = String(musicStatus.prepared);
  document.body.dataset.musicReadyState = String(musicStatus.readyState);
  document.body.dataset.musicStartMs = String(musicStatus.startup?.readyMs ?? '');
  if (status.phase !== 'connected') {
    musicMotion = new MusicMotion();
    musicFrame = null;
    lastArtworkState = '';
    $('audio-left').value = 0;
    $('audio-right').value = 0;
    $('tempo-status').textContent = '— BPM';
    $('beat-dot').style.opacity = '.2';
  }
}
function syncTabAudio(status) {
  if (status.phase === 'connected') closeSourceMenu();
  if (selectedSource === 'tab' && !['connected', 'choosing'].includes(status.phase)) {
    selectedSource = 'tree-voices';
    if (resumeDefault) {
      resumeDefault = false;
      void defaultMusic.play();
    }
  }
  syncAudioUI();
}
function closeSourceMenu() {
  const menu = document.querySelector('.audio-options');
  if (menu.open && menu.contains(document.activeElement)) menu.querySelector('summary').focus();
  menu.open = false;
}
const tabAudio = new TabAudio(syncTabAudio),
  defaultMusic = new DefaultMusic(syncAudioUI);
// Download and prepare the music alongside the scene, before exposing Play.
// No AudioContext or audible playback is started by this preparation.
const musicReady = defaultMusic.prepare((signal) => loadBytes(musicAsset.path, { signal }));
function connectAudio() {
  if (['connected', 'choosing'].includes(tabAudio.phase)) return Promise.resolve(false);
  resumeDefault = ['connected', 'starting'].includes(defaultMusic.phase);
  selectedSource = 'tab';
  defaultMusic.pause();
  return tabAudio.connect();
}
function useDefaultMusic() {
  selectedSource = 'tree-voices';
  resumeDefault = false;
  tabAudio.disconnect();
  return defaultMusic.play();
}
function toggleDefaultMusic() {
  if (selectedSource === 'tab') return useDefaultMusic();
  if (['connected', 'starting'].includes(defaultMusic.phase)) {
    defaultMusic.pause();
    return Promise.resolve(false);
  }
  return defaultMusic.play();
}

const canvas = $('view'),
  camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.08, 100000),
  cameraPixels = new THREE.Vector2();
camera.up.set(0, 0, 1);
let scene, material, tubeLights;
const formLayers = { cloth: [], legs: [], geodesic: [] };
let fixtureCount = 0,
  fieldRadius = 6.7;
let renderer,
  metadata,
  points,
  artworkPoints,
  pixels,
  texture,
  center,
  frameCount = 0,
  flashStats = {},
  revision = null;
let environment,
  hardwareNormalRepairs = 0;
let lookWipe = null,
  queuedLook = null,
  sourcePixels = null;
const appearanceKeys = new Set([
  'look',
  'atmosphere',
  'palette',
  'formStyle',
  'seed',
  'detail',
  'wildness',
  'brightness',
  'softness',
  'edgeFade',
  'haze',
  'lightSpill',
  'mountainHaze',
  'ridgeDetail',
  'washAmount',
  'washEvery',
  'flashCount',
  'flashSize',
  'flashIntensity',
  'flashColorMode',
  'flashColor',
  'buildTime',
  'burstIntensity',
]);
let last = 0,
  lastMeters = 0,
  lastReadings = 0,
  lastArtworkState = '',
  lastReaction = -1;
const vertex = `attribute vec2 contactUV; attribute float fixtureId;
varying vec2 vUV; varying float vId; varying vec3 vFabricNormal;
void main(){vFabricNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);vUV=contactUV;vId=fixtureId;vec4 p=instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*p;}`;
const fragment = `uniform sampler2D artwork;uniform float fixtureCount;uniform float brightness;uniform float softness;uniform float edgeFade;uniform float daylight;uniform float artVisibility;
varying vec2 vUV;varying float vId;varying vec3 vFabricNormal;
vec3 radialLight(float a,float y){
 a=mod(mod(a,21.)+21.,21.);float i=floor(a),f=fract(a);
 vec3 l=texture2D(artwork,vec2((i+.5)/22.,y)).rgb;
 vec3 r=texture2D(artwork,vec2((mod(i+1.,21.)+.5)/22.,y)).rgb;
 return mix(l,r,f);
}
void main(){
 float a=mod(atan(vUV.y,vUV.x)*21./6.28318530718+21.,21.);
 float y=(vId+.5)/fixtureCount,radius=length(vUV);
 // Blur neighboring segment radiance more as it travels through the spandex.
 // The normalized kernel preserves energy and wraps around the circular seam.
 float spread=.85*softness*pow(smoothstep(.08,.65,radius),1.15);
 vec3 light=radialLight(a,y)*.2270270270;
 light+=(radialLight(a+1.3846153846*spread,y)+radialLight(a-1.3846153846*spread,y))*.3162162162;
 light+=(radialLight(a+3.2307692308*spread,y)+radialLight(a-3.2307692308*spread,y))*.0702702703;
 float contact=smoothstep(.064,.0864,radius);
 float halo=contact/pow(1.+pow(radius/.38,2.),1.25);
 // Hold the glow near the hub, then let it die away toward the fabric tips.
 halo*=pow((1.+pow(.11/.30,2.))/(1.+pow(radius/.30,2.)),edgeFade*1.15);
 float sunFacing=abs(dot(normalize(vFabricNormal),normalize(vec3(-.7,.7,1.))));
 vec3 whiteFabric=vec3(.91,.92,.90)*daylight*(.52+.38*sunFacing)*mix(.18,1.,contact);
 gl_FragColor=vec4(whiteFabric+light*halo*brightness*4.2*artVisibility,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

function remember() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
}
function getState() {
  return { ...state, time: state.flowTime };
}
function applyFormStyle(renderState = state, updateUI = true) {
  const form = FORM_STYLES[renderState.formStyle];
  for (const [name, meshes] of Object.entries(formLayers))
    for (const mesh of meshes) mesh.visible = form[name];
  if (tubeLights) tubeLights.group.visible = form.lights;
  if (updateUI) document.body.dataset.formStyle = state.formStyle;
}
function syncUI() {
  applyFormStyle();
  $('orbit').setAttribute('aria-pressed', String(state.orbit));
  $('mobile-orbit').setAttribute('aria-pressed', String(state.orbit));
  $('mobile-orbit-label').textContent = state.orbit ? 'Orbit on' : 'Orbit off';
  $('new-look').title = LOOKS[state.look] + ' · ' + SKY_LABELS[state.atmosphere] + ' — Vibe shift';
  Object.assign(document.body.dataset, {
    look: state.look,
    skyPreset: state.atmosphere,
    palette: state.palette,
    playing: String(state.playing),
    strobes: String(state.flashIntensity > 0),
  });
}
function setState(next) {
  const update = validated(next);
  delete update.venue;
  const changesAppearance = Object.keys(update).some(
    (key) => appearanceKeys.has(key) && update[key] !== state[key],
  );
  if (changesAppearance && lookWipe?.active) {
    // Coalesce repeated appearance edits without snapping a wipe mid-flight.
    queuedLook = { ...(typeof queuedLook === 'object' ? queuedLook : {}), ...update };
    return;
  }
  const source =
    changesAppearance && lookWipe
      ? {
          ...state,
          paletteColors:
            selectedSource === 'tree-voices' ? paletteWalk.colors(state.palette) : undefined,
        }
      : null;
  Object.assign(state, update);
  if (update.palette) paletteWalk.reset(state.palette);
  syncTimeOfDay();
  syncUI();
  remember();
  if (source) {
    lookWipe.start(source, {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    syncWipeUI();
  }
}
function setLook(look) {
  if (Object.hasOwn(LOOK_INFO, look)) setState({ look, palette: LOOK_INFO[look].palette });
}
function applyTheme(id) {
  const next = themeState(id);
  if (!next) return false;
  setState(next);
  return getState();
}
function triggerBurst() {
  if (state.flashIntensity > 0) setState({ burstAt: state.realTime, playing: true });
}
function exportState() {
  const data = {
    ...getState(),
    format: 'Sonic Sphere layered surface artwork 2',
    model: metadata?.source_revision_sha256,
    regions: fixtureCount * 22,
    notes:
      'Angular artwork samples drive both the cloths and fitted tube LEDs. Hardware geometry remains illustrative.',
  };
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `sphere-${state.look}-${state.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return data;
}
window.addEventListener('error', () => {
  revision = 'page-error';
});
function toggleOrbit() {
  setState({ orbit: !state.orbit });
}
$('orbit').onclick = toggleOrbit;
$('mobile-orbit').onclick = toggleOrbit;
$('wide').onclick = () => setState({ ...cameraDefaults, distance: 65 });
$('close').onclick = () => setState({ ...cameraDefaults, distance: 30, elevation: 0.1 });
const lookBag = [],
  skyBag = [];
function drawDifferent(bag, choices, current) {
  const previous = bag.indexOf(current);
  if (previous !== -1) bag.splice(previous, 1);
  if (!bag.length) bag.push(...choices.filter((value) => value !== current));
  return bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
}
function randomizeLook() {
  if (lookWipe?.active) {
    queuedLook = 'random';
    return getState();
  }
  const look = drawDifferent(lookBag, Object.keys(LOOKS), state.look);
  const atmosphere = drawDifferent(skyBag, SKY_PRESETS, state.atmosphere);
  const formStyle = state.formStyle;
  const palettes = Object.keys(PALETTES).filter((id) => id !== state.palette);
  setState({
    look,
    atmosphere,
    formStyle,
    palette: palettes[Math.floor(Math.random() * palettes.length)],
    seed: 1 + Math.floor(Math.random() * 1000000),
    flowSpeed: Math.round((0.6 + Math.random() * 1.1) * 10) / 10,
    detail: Math.round((0.7 + Math.random() * 0.75) * 20) / 20,
    wildness: Math.round((0.2 + Math.random() * 0.65) * 20) / 20,
  });
  $('look-status').textContent =
    FORM_STYLES[formStyle].label + ' · ' + LOOKS[look] + ' · ' + SKY_LABELS[atmosphere];
  const icon = $('new-look').querySelector('img');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
    icon.animate([{ transform: 'rotate(-12deg)' }, { transform: 'rotate(348deg)' }], {
      duration: 420,
      easing: 'cubic-bezier(.2,.8,.2,1)',
    });
  return getState();
}
function syncWipeUI() {
  const active = String(Boolean(lookWipe?.active));
  if (document.body.dataset.wipeActive === active) return;
  document.body.dataset.wipeActive = active;
  $('new-look').setAttribute('aria-busy', active);
}
function drawLook(renderState, renderPixels) {
  applyFormStyle(renderState, false);
  texture.image.data = renderPixels;
  texture.needsUpdate = true;
  const light = skyPresetLighting(renderState.atmosphere);
  material.uniforms.daylight.value = light.daylight;
  material.uniforms.artVisibility.value = light.artVisibility;
  material.uniforms.brightness.value = renderState.brightness;
  material.uniforms.softness.value = renderState.softness;
  material.uniforms.edgeFade.value = renderState.edgeFade;
  tubeLights.update(renderState, camera, light);
  environment.update(
    renderState,
    renderPixels,
    camera,
    tubeLights.group.visible ? 'tube-leds' : 'cloth',
  );
  renderScene();
}
function drawCurrentFrame() {
  return lookWipe.render(
    (source) => {
      renderArtwork(
        artworkPoints,
        source.flowTime,
        source,
        sourcePixels,
        musicFrame ? { ...musicFrame, amount: state.audioReaction } : null,
      );
      drawLook(source, sourcePixels);
    },
    () => drawLook(state, pixels),
  );
}
$('new-look').onclick = randomizeLook;
function viewURL() {
  const url = new URL(location.href);
  url.hash =
    'view=' +
    btoa(JSON.stringify(getState())).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return url.href;
}
async function shareView() {
  const url = viewURL();
  try {
    await navigator.clipboard.writeText(url);
    $('look-status').textContent = 'View link copied';
  } catch {
    $('look-status').textContent = 'View link ready';
  }
  return url;
}
$('listen').onclick = connectAudio;
$('disconnect-audio').onclick = () => tabAudio.disconnect();
$('default-track').onclick = toggleDefaultMusic;
$('use-tree-voices').onclick = () => {
  closeSourceMenu();
  void useDefaultMusic();
};
syncAudioUI();
const releaseCameraGestures = bindCameraGestures(canvas, {
  // Rebase ground-limited exterior dragging in control coordinates so the
  // distance confinement is not applied a second time on every pointer move.
  getState: () => ({
    ...getState(),
    elevation: center
      ? orbitPose(center.toArray(), state, camera.aspect).controlElevation
      : state.elevation,
  }),
  setState,
});
window.addEventListener('beforeunload', () => {
  remember();
  releaseCameraGestures();
  lookWipe?.dispose();
  selectedSource = 'tree-voices';
  resumeDefault = false;
  tabAudio.disconnect();
  defaultMusic.dispose();
});
document.addEventListener('visibilitychange', () => {
  last = 0;
  remember();
});
let cameraPose = null;
function updateCamera() {
  if (!center) return;
  cameraPose = orbitPose(center.toArray(), state, camera.aspect);
  if (camera.fov !== cameraPose.fov || camera.near !== cameraPose.near) {
    camera.fov = cameraPose.fov;
    camera.near = cameraPose.near;
    camera.updateProjectionMatrix();
  }
  camera.position.fromArray(cameraPose.position);
  camera.up.fromArray(cameraPose.up);
  camera.lookAt(...cameraPose.target);
}
function renderScene() {
  environment.updateCamera(camera);
  tubeLights.updateCamera(
    camera,
    renderer.getDrawingBufferSize(cameraPixels).y,
    renderer.getPixelRatio(),
  );
  renderer.render(scene, camera);
}
function resize() {
  const box = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(box.width, box.height, false);
  camera.aspect = box.width / box.height;
  camera.updateProjectionMatrix();
}
async function createScene() {
  const scene = new THREE.Scene(),
    base = 'assets/burning-man/';
  let metadata, fixtureCount, fieldRadius, center, points, pixels, texture, environment;
  loadingStage(82, 'Preparing the sphere');
  const [model, packed] = await Promise.all([
    loadJSON(geometryAsset.metadataPath),
    loadBytes(geometryAsset.path),
  ]);
  metadata = model;
  const binary = await unpackGeometry(packed, geometryAsset);
  if (binary.byteLength !== metadata.binary_bytes) throw new Error('Incomplete sphere geometry.');
  fixtureCount = metadata.light_show.fixtures;
  fieldRadius = metadata.light_show.field_radius_metres ?? 6.7;
  if (fixtureCount !== 212) throw new Error('Invalid Burning Man fixture count.');
  center = new THREE.Vector3(...metadata.light_show.sphere_center);
  const fixturePositions = new Float32Array(fixtureCount * 3),
    tubeAxes = Array(fixtureCount);
  let woodReceiver = null,
    woodReceiverScore = -Infinity;
  points = new Float32Array(fixtureCount * 22 * 3);
  pixels = new Float32Array(fixtureCount * 22 * 4);
  texture = new THREE.DataTexture(pixels, 22, fixtureCount, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      artwork: { value: texture },
      fixtureCount: { value: fixtureCount },
      brightness: { value: state.brightness },
      softness: { value: state.softness },
      edgeFade: { value: state.edgeFade },
      daylight: { value: skyPresetLighting(state.atmosphere).daylight },
      artVisibility: { value: skyPresetLighting(state.atmosphere).artVisibility },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.DoubleSide,
  });
  loadingStage(85, 'Preparing materials');
  const materials = await Promise.all(
    metadata.materials.map(async (spec) => {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color()
          .setRGB(...spec.color_linear)
          .multiplyScalar(spec.role === 'wood' ? 1.6 : 0.7),
        roughness: spec.roughness ?? 0.8,
        metalness: spec.metalness ?? 0,
        side: THREE.DoubleSide,
      });
      if (spec.role === 'wood') {
        mat.color.multiplyScalar(1.45);
        mat.onBeforeCompile = (shader) => {
          shader.vertexShader =
            'attribute vec3 playaBounce; varying vec3 vPlayaBounce;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvPlayaBounce=playaBounce;',
          );
          shader.fragmentShader = 'varying vec3 vPlayaBounce;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vPlayaBounce;',
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            'outgoingLight*=' + WOOD_SPILL_RESPONSE.toFixed(12) + ';\n#include <opaque_fragment>',
          );
        };
        mat.customProgramCacheKey = () => 'bm-playa-wood-response-85-over-45';
      }
      if (spec.maps?.color) {
        const tex = await loadTexture(base + spec.maps.color);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        mat.map = tex;
      }
      return mat;
    }),
  );
  const matrix = new THREE.Matrix4(),
    hardwareMaterials = new Map();
  let loadedParts = 0;
  for (const part of metadata.parts) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, key, size] of [
      ['position', 'positions', 3],
      ['normal', 'normals', 3],
      ['contactUV', 'contact_uv', 2],
      ['uv', 'uv', 2],
    ]) {
      const s = part[key];
      if (!s || (part.category === 'sail' && name === 'uv')) continue;
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(binary, s.offset, s.count), size),
      );
    }
    geometry.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(binary, part.indices.offset, part.indices.count),
        1,
      ),
    );
    if (part.category === 'metal' && repairHardwareNormals(geometry)) hardwareNormalRepairs++;
    const sail = part.category === 'sail',
      chosen = [];
    for (const group of part.groups) {
      geometry.addGroup(group.start, group.count, chosen.length);
      let chosenMaterial = sail ? material : materials[group.material];
      if (part.category === 'metal' && loadedParts > 0) {
        if (!hardwareMaterials.has(chosenMaterial))
          hardwareMaterials.set(chosenMaterial, createHardwareContactMaterial(chosenMaterial));
        chosenMaterial = hardwareMaterials.get(chosenMaterial);
      }
      chosen.push(chosenMaterial);
    }
    const mesh = new THREE.InstancedMesh(geometry, chosen, part.instances),
      matrices = new Float32Array(binary, part.matrices.offset, part.matrices.count);
    mesh.frustumCulled = false;
    mesh.name = sail ? 'Cloths / ' + part.sail_shape : 'Original ' + part.category;
    mesh.castShadow = true;
    mesh.receiveShadow = !sail;
    if (part.category === 'wood') {
      mesh.userData.playaWood = true;
      geometry.setAttribute(
        'playaBounce',
        new THREE.InstancedBufferAttribute(new Float32Array(part.instances * 3), 3),
      );
    }
    if (sail)
      geometry.setAttribute(
        'fixtureId',
        part.batched_cloth
          ? new THREE.BufferAttribute(
              new Float32Array(
                binary,
                part.vertex_fixture_ids.offset,
                part.vertex_fixture_ids.count,
              ),
              1,
            )
          : new THREE.InstancedBufferAttribute(new Float32Array(part.fixture_ids), 1),
      );
    if (sail)
      geometry.setAttribute(
        'wrapMask',
        new THREE.BufferAttribute(
          part.batched_cloth
            ? validateWrapMask(
                new Float32Array(binary, part.wrap_mask.offset, part.wrap_mask.count),
                geometry.getAttribute('position').count,
              )
            : new Float32Array(geometry.getAttribute('position').count),
          1,
        ),
      );
    const locations = sail
      ? new Float32Array(binary, part.fixture_positions.offset, part.fixture_positions.count)
      : null;
    for (let i = 0; i < part.instances; i++) {
      matrix.fromArray(matrices, i * 16);
      mesh.setMatrixAt(i, matrix);
      if (part.category === 'wood') {
        const coordinates = geometry.getAttribute('position'),
          normals = geometry.getAttribute('normal'),
          normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        for (let j = 0; j < coordinates.count; j += 3) {
          const p = new THREE.Vector3(),
            n = new THREE.Vector3();
          for (let k = 0; k < 3; k++) {
            p.add(new THREE.Vector3().fromBufferAttribute(coordinates, j + k));
            n.add(new THREE.Vector3().fromBufferAttribute(normals, j + k));
          }
          p.divideScalar(3).applyMatrix4(matrix);
          n.applyMatrix3(normalMatrix).normalize();
          const delta = center.clone().sub(p),
            distance = delta.length(),
            facing = n.dot(delta.normalize()),
            score = facing / distance;
          if (p.z > 0.5 && p.z < 3.5 && facing > 0.4 && score > woodReceiverScore) {
            woodReceiverScore = score;
            woodReceiver = {
              position: p.toArray(),
              normal: n.toArray(),
              sourceInstance: part.source_instance_paths[i],
            };
          }
        }
      }
      if (sail && !part.batched_cloth) {
        const id = part.fixture_ids[i],
          axes = new THREE.Matrix3().setFromMatrix4(matrix);
        fixturePositions.set(locations.subarray(i * 3, i * 3 + 3), id * 3);
        const u = new THREE.Vector3(...part.art_axes.u).applyMatrix3(axes).normalize(),
          v = new THREE.Vector3(...part.art_axes.v).applyMatrix3(axes).normalize();
        tubeAxes[id] = { u: u.clone(), v: v.clone() };
        const p = new THREE.Vector3().fromArray(locations, i * 3).sub(center);
        for (let j = 0; j < 22; j++) {
          const a = (j * Math.PI * 2) / 21,
            q = p.clone();
          if (j < 21)
            q.addScaledVector(u, 0.34 * Math.cos(a)).addScaledVector(v, 0.34 * Math.sin(a));
          q.divideScalar(fieldRadius).toArray(points, (id * 22 + j) * 3);
        }
      }
    }
    formLayers[sail ? 'cloth' : loadedParts === 0 ? 'geodesic' : 'legs'].push(mesh);
    if (sail && part.batched_cloth) {
      const axesU = new Float32Array(binary, part.fixture_axes_u.offset, part.fixture_axes_u.count);
      const axesV = new Float32Array(binary, part.fixture_axes_v.offset, part.fixture_axes_v.count);
      for (let i = 0; i < part.fixture_ids.length; i++) {
        const id = part.fixture_ids[i],
          u = new THREE.Vector3().fromArray(axesU, i * 3),
          v = new THREE.Vector3().fromArray(axesV, i * 3);
        fixturePositions.set(locations.subarray(i * 3, i * 3 + 3), id * 3);
        tubeAxes[id] = { u: u.clone(), v: v.clone() };
        const p = new THREE.Vector3().fromArray(locations, i * 3).sub(center);
        for (let j = 0; j < 22; j++) {
          const a = (j * Math.PI * 2) / 21,
            q = p.clone();
          if (j < 21)
            q.addScaledVector(u, 0.34 * Math.cos(a)).addScaledVector(v, 0.34 * Math.sin(a));
          q.divideScalar(fieldRadius).toArray(points, (id * 22 + j) * 3);
        }
      }
    }
    scene.add(mesh);
    loadedParts++;
    loadingStage(87 + (5 * loadedParts) / metadata.parts.length, 'Preparing the sphere');
    if (loadedParts % 20 === 0) await new Promise(requestAnimationFrame);
  }
  const fits = await loadJSON('assets/burning-man/tube-fixtures.json');
  if (
    fits.model_revision !== metadata.model_revision &&
    !(
      metadata.cloth_design?.source_frame_preserved &&
      fits.model_revision === metadata.deprecates?.model_revision
    )
  )
    throw new Error('Fixture fit and sphere revision differ.');
  tubeLights = createTubeLights({ fits, axes: tubeAxes, texture, renderer });
  scene.add(tubeLights.group);
  applyFormStyle();
  loadingStage(93, 'Preparing the landscape');
  environment = await createPlayaEnvironment(
    scene,
    renderer,
    center,
    fixturePositions,
    woodReceiver,
    { loadJSON, loadBytes, loadTexture, ledEmitters: tubeLights.emitters },
  );
  applyMatteWrapMaterial(material, environment.wrapLighting);
  return {
    scene,
    metadata,
    fixtureCount,
    fieldRadius,
    center,
    points,
    pixels,
    texture,
    material,
    environment,
  };
}
async function loadModel() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);
  await preloadAssets();
  ({
    scene,
    metadata,
    fixtureCount,
    fieldRadius,
    center,
    points,
    pixels,
    texture,
    material,
    environment,
  } = await createScene());
  artworkPoints = prepareArtworkPoints(points);
  updateCamera();
  flashStats = renderArtwork(artworkPoints, state.flowTime, state, pixels, null);
  texture.needsUpdate = true;
  tubeLights.update(state, camera, skyPresetLighting(state.atmosphere));
  environment.update(state, pixels, camera, tubeLights.group.visible ? 'tube-leds' : 'cloth');
  loadingStage(96, 'Preparing the view');
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  renderScene();
  loadingStage(97, 'Preparing music');
  lookWipe = new LookWipe(renderer);
  sourcePixels = new Float32Array(pixels.length);
  await lookWipe.prepare();
  await musicReady;
  releaseDownloads();
  loadingStage(99, 'Opening the experience');
  document.body.dataset.venue = 'burning-man';
  document.body.dataset.modelRevision = metadata.model_revision ?? 'bm-sphere';
  document.body.dataset.sailCount = String(fixtureCount);
  document.body.dataset.regions = String(fixtureCount * 22);
  await finishLoading();
  document.body.dataset.ready = 'true';
  window.sphereStudio = {
    getState,
    listLooks: () => structuredClone(LOOK_INFO),
    listThemes: () => structuredClone(THEMES),
    applyTheme,
    setState,
    setLook,
    setTimeOfDay: (value) => setState({ timeOfDay: value }),
    setSkyPreset: (atmosphere) => setState({ atmosphere }),
    paletteWalkStatus: () => paletteWalk.status(),
    toggleOrbit,
    triggerBurst,
    viewURL,
    shareView,
    pause: () => setState({ playing: false }),
    play: () => setState({ playing: true }),
    seek: (t) =>
      setState({
        flowTime: t,
        washTime: t,
        flashTime: t,
        realTime: t,
        burstAt: null,
        playing: false,
      }),
    save: exportState,
    transitionLook: (next) => {
      setState(next);
      return getState();
    },
    wipeStatus: () => ({ ...lookWipe.status(), queued: Boolean(queuedLook) }),
    connectAudio,
    disconnectAudio: () => tabAudio.disconnect(),
    playDefaultMusic: useDefaultMusic,
    pauseDefaultMusic: () => defaultMusic.pause(),
    defaultMusicStatus: () => defaultMusic.status(),
    musicStatus: () => ({ ...activeAudio().status(), source: selectedSource }),
    toggleMusic: toggleDefaultMusic,
    randomizeLook,
    audioStatus: () => ({
      ...activeAudio().status(),
      source: selectedSource,
      tempo: musicFrame?.tempo ?? null,
      structure: musicFrame?.structure ?? null,
    }),
    setMode: (mode) => window.studioShell.setMode(mode),
    getMode: () => window.studioShell.getMode(),
    setTrayOpen: (open) => window.studioShell.setTrayOpen(open),
    isTrayOpen: () => window.studioShell.isTrayOpen(),
    setFormStyle: (formStyle) => setState({ formStyle }),
    listFormStyles: () => structuredClone(FORM_STYLES),
    formWeights: () => ({ ...FORM_WEIGHTS }),
    formStats: () => ({
      style: state.formStyle,
      layers: Object.fromEntries(
        Object.entries(formLayers).map(([key, meshes]) => [
          key,
          {
            visible: meshes.every((m) => m.visible),
            instances: meshes.reduce((sum, m) => sum + m.count, 0),
          },
        ]),
      ),
      tubesVisible: tubeLights.group.visible,
      ...tubeLights.stats(),
    }),
    radialMapping: () => structuredClone(tubeLights.records),
    radialPixels: () => Array.from(pixels),
    tubeColors: () => tubeLights.colors(pixels),
    radialDiagnostic: (enabled) => tubeLights.diagnostic(Boolean(enabled)),
    environment: () => environment?.stats(),
    camera: () => ({
      ...cameraPose,
      angularSpeed: ORBIT_RADIANS_PER_SECOND,
      automatic: state.orbit,
      renderPasses: 1,
    }),
    loadingStatus,
    stats: () => ({
      frames: frameCount,
      wipe: lookWipe.status(),
      wrapMaterial: { ...WRAP_MATERIAL },
      regions: fixtureCount * 22,
      sails: fixtureCount,
      model: {
        id: metadata.model_id,
        revision: metadata.model_revision ?? metadata.source_revision_sha256,
        status: metadata.status ?? 'active',
        meshInstances: metadata.rendered_mesh_instances ?? metadata.source_instances,
      },
      hardwareNormalRepairs,
      triangles: renderer.info.render.triangles,
      drawCalls: renderer.info.render.calls,
      addedEffectMeshes: 0,
      formStyle: state.formStyle,
      visibleTubeLEDs: tubeLights.group.visible ? 25440 : 0,
      clocks: { flow: state.flowTime, wash: state.washTime, flashes: state.flashTime },
      ...flashStats,
    }),
    capture: () => {
      drawCurrentFrame();
      return canvas.toDataURL('image/png');
    },
  };
  function animate(now) {
    requestAnimationFrame(animate);
    if (document.hidden || !scene) {
      last = 0;
      return;
    }
    const elapsed = last ? Math.max(0, (now - last) / 1000) : 0,
      dt = Math.min(0.1, elapsed);
    last = now;
    if (state.orbit) state.azimuth = advanceOrbit(state.azimuth, elapsed);
    const audio = activeAudio().sample(dt);
    if (state.playing) {
      musicFrame =
        activeAudio().phase === 'connected'
          ? musicMotion.advance(
              audio,
              dt,
              state.audioReaction,
              SHOWS[state.look].audioMode === 'bands',
              state.musicalPhrasing,
            )
          : null;
      const presence = SHOWS[state.look].spectralIdle ? spectralMusicPresence(musicFrame) : 1;
      const flowRate = 0.45 * (1 - presence) + (musicFrame?.flowRate ?? 1) * presence;
      state.flowTime += dt * state.flowSpeed * flowRate;
      state.washTime += dt * state.washSpeed;
      state.flashTime += dt * state.flashSpeed;
      state.realTime += dt;
      if (lookWipe.active) {
        const source = lookWipe.source,
          sourcePresence = SHOWS[source.look].spectralIdle ? spectralMusicPresence(musicFrame) : 1;
        const sourceRate =
          0.45 * (1 - sourcePresence) + (musicFrame?.flowRate ?? 1) * sourcePresence;
        source.flowTime += dt * source.flowSpeed * sourceRate;
        source.washTime += dt * source.washSpeed;
        source.flashTime += dt * source.flashSpeed;
        source.realTime += dt;
      }
    }
    const walking =
      selectedSource === 'tree-voices' && defaultMusic.phase === 'connected' && state.playing;
    if (walking) paletteWalk.advance(elapsed);
    const artworkState =
      selectedSource === 'tree-voices'
        ? { ...state, paletteColors: paletteWalk.colors(state.palette) }
        : state;
    updateCamera();
    const signature = JSON.stringify([
      state.look,
      state.palette,
      state.seed,
      state.detail,
      state.wildness,
      state.washAmount,
      state.washEvery,
      state.flashCount,
      state.flashSize,
      state.flashIntensity,
      state.flashColorMode,
      state.flashColor,
      state.buildTime,
      state.burstIntensity,
      state.burstEvery,
      state.autoBurst,
      state.burstAt,
      state.flowTime,
      state.washTime,
      state.flashTime,
      state.realTime,
      state.musicalPhrasing,
      selectedSource,
      paletteWalk.current,
      paletteWalk.mix,
    ]);
    const music = musicFrame ? { ...musicFrame, amount: state.audioReaction } : null;
    if (now - lastMeters >= 50) {
      lastMeters = now;
      $('audio-left').value = audio.left;
      $('audio-right').value = audio.right;
      if (music) {
        const tempo = music.tempo;
        const label =
          state.playing && audio.energy >= 0.025 && tempo.bpm && tempo.confidence > 0.28
            ? tempo.bpm + ' BPM'
            : '— BPM';
        if ($('tempo-status').textContent !== label) $('tempo-status').textContent = label;
        $('beat-dot').style.opacity = String(0.2 + tempo.pulse * 0.8);
        $('beat-dot').style.transform = 'scale(' + (1 + tempo.pulse * 0.45) + ')';
        const section = (audio.structure ?? music.structure)?.section ?? 'quiet';
        if (document.body.dataset.musicSection !== section)
          document.body.dataset.musicSection = section;
      }
    }
    if (
      signature !== lastArtworkState ||
      state.audioReaction !== lastReaction ||
      (music && state.playing)
    ) {
      flashStats = renderArtwork(artworkPoints, state.flowTime, artworkState, pixels, music);
      texture.needsUpdate = true;
      lastArtworkState = signature;
      lastReaction = state.audioReaction;
    }
    lookWipe.advance(elapsed);
    drawCurrentFrame();
    syncWipeUI();
    if (document.body.dataset.renderedLook !== state.look)
      document.body.dataset.renderedLook = state.look;
    frameCount++;
    if (!lookWipe.active && queuedLook) {
      const queued = queuedLook;
      queuedLook = null;
      if (queued === 'random') randomizeLook();
      else setState(queued);
    }
    if (now - lastReadings > 700) {
      lastReadings = now;
      document.body.dataset.spectralIdle = String(flashStats.spectralIdle ?? 0);
      document.body.dataset.environment = JSON.stringify(environment.stats());
      document.body.dataset.flowTime = state.flowTime.toFixed(3);
      document.body.dataset.washTime = state.washTime.toFixed(3);
      document.body.dataset.flashTime = state.flashTime.toFixed(3);
      document.body.dataset.artTime = state.flowTime.toFixed(3);
      document.body.dataset.burstPeak = String(flashStats.burstPeak);
      Object.assign(document.body.dataset, {
        audioLeft: audio.left.toFixed(4),
        audioRight: audio.right.toFixed(4),
        audioBalance: audio.balance.toFixed(4),
        audioEnergy: audio.energy.toFixed(4),
        musicEngine: activeAudio().session?.engine ?? '',
        musicPosition: (defaultMusic.session?.media?.currentTime ?? 0).toFixed(3),
        musicEvents: String(musicMotion.sequence),
        musicWaves: String(musicFrame?.waves.length ?? 0),
        musicBpm: String(musicFrame?.tempo.bpm ?? 0),
        musicConfidence: (musicFrame?.tempo.confidence ?? 0).toFixed(3),
        musicBeat: String(musicFrame?.tempo.count ?? 0),
        eqBands: audio.bands.map((x) => x.toFixed(3)).join(','),
        eqSubBass: audio.subBass.toFixed(3),
        eqSubPulse: (musicFrame?.subPulse ?? 0).toFixed(3),
        eqSubCount: String(musicFrame?.subCount ?? 0),
      });
    }
  }
  requestAnimationFrame(animate);
  void defaultMusic.play();
}
document.addEventListener('studio-sky', (event) => setState({ atmosphere: event.detail }));
document.addEventListener('studio-orbit', (event) => setState({ orbit: event.detail }));
$('loading-retry').onclick = () => location.reload();
syncUI();
loadModel().catch((error) => {
  failLoading(error);
  console.error(error);
});
