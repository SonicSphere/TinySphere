import { createSkyClothLighting, applySkyClothMaterial, applySkyFrameMaterials } from './engine/sky-cloth.js';
import { loadClothOcclusion } from './engine/cloth-occlusion.js';
import {normalizeOpticalInput,gestureZoomPosition} from './camera/optical-zoom.js';
import { createFisheyeRenderer } from './camera/fisheye.js';
import { applyMatteWrapMaterial, validateWrapMask, WRAP_MATERIAL } from './engine/wrap-material.js';
import './ui/ui.js';
import { FORM_STYLES, createTubeLights } from './engine/tube-lights.js';
import { FORM_WEIGHTS, SPHERE_VIEWS, SPHERE_VIEW_WEIGHTS, chooseSphereView } from './engine/form-choice.js';
import {
  ORBIT_RADIANS_PER_SECOND,
  CAMERA_FOV_DEGREES,
  MAX_CAMERA_DISTANCE,
  advanceOrbit,
  orbitPose,
} from './camera/orbit.js';
import { sonyA7EquivalentMm } from './camera/lens.js';
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
  renderArtwork as renderStudioArtwork,
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
import { loadRecoveredShows } from './shows/recovered/index.js';
import { createClothDiffusion, DIFFUSION_GLSL } from './engine/cloth-diffusion.js';
import { THEMES, themeState } from './themes/index.js';
import { createDesktopTools } from './ui/desktop-tools.js';

const fieldRevisions = new WeakMap();
function renderArtwork(points, seconds, state, out, music = null) {
  // A saved source clock may be far ahead. Replay a bounded chunk each frame
  // rather than blocking the camera, audio, or UI while rebuilding its history.
  const result = renderStudioArtwork(points, seconds, state, out, music, { maxSteps: 12 });
  fieldRevisions.set(out, (fieldRevisions.get(out) ?? 0) + 1);
  return result;
}

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
  showTime: [0, 1e9],
  washTime: [0, 1e9],
  flashTime: [0, 1e9],
  realTime: [0, 1e9],
  distance: [0, MAX_CAMERA_DISTANCE],
  lensFov: [180, 330],
  elevation: [-Math.PI / 2, Math.PI / 2],
  azimuth: [-1e6, 1e6],
};
limits.audioReaction = [0, 1];
limits.timeOfDay = [0, 1];
limits.mountainHaze = [0, 1];
limits.ridgeDetail = [0, 1];
Object.assign(limits, { sky: [0, 1], haze: [0.1, 2], lightSpill: [0, 2] });
function validated(input) {
  let next = normalizeOpticalInput(input);
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
    else if (k === 'sphereView' && Object.hasOwn(SPHERE_VIEWS, v)) valid[k] = v;
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
// Every normal arrival restores the complete approved appearance, including
// camera and animation phase. Earlier browser preferences cannot override it.
const state = { ...defaults, lensFov: 180, showTime: 0, ...linked, venue: 'burning-man', terrainRadius: 20 };
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
let clothDiffusion = null;
let skyClothLighting = null;
let lookWipe = null,
  queuedLook = null,
  sourcePixels = null;
let desktopTools = null,
  clothVisibilityOverride = null,
  tubeVisibilityOverride = null,
  frozenShotPixels = null;
const appearanceKeys = new Set([
  'look',
  'atmosphere',
  'palette',
  'formStyle',
  'sphereView',
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
uniform float clothDiffusionEnabled;
${DIFFUSION_GLSL}
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
 if(clothDiffusionEnabled>.5)light=transmittedClothLight(a,vId,radius);
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
function sphereVisibility(renderState = state) {
  if (renderState.sphereVisibility) return renderState.sphereVisibility;
  const form = FORM_STYLES[renderState.formStyle],
    view = SPHERE_VIEWS[renderState.sphereView],
    cloths = clothVisibilityOverride ?? view?.cloths ?? form.cloth,
    tubes = tubeVisibilityOverride ?? (clothVisibilityOverride === null ? view?.tubes ?? form.lights : !clothVisibilityOverride);
  return {
    cloths, tubes,
    mode: cloths ? 'full' : tubes ? 'tubes' : 'bare',
    clothOverride: clothVisibilityOverride,
    tubeOverride: tubeVisibilityOverride,
  };
}
function applyFormStyle(renderState = state, updateUI = true) {
  const form = FORM_STYLES[renderState.formStyle];
  const visibility = sphereVisibility(renderState);
  for (const [name, meshes] of Object.entries(formLayers))
    for (const mesh of meshes)
      mesh.visible = name === 'cloth' ? visibility.cloths : form[name];
  if (tubeLights) tubeLights.group.visible = visibility.tubes;
  if (updateUI) document.body.dataset.formStyle = state.formStyle;
}
function lightingSource() {
  return tubeLights.group.visible ? 'tube-leds'
    : formLayers.cloth.some((mesh) => mesh.visible) ? 'cloth' : 'none';
}
function syncUI() {
  applyFormStyle();
  desktopTools?.refresh();
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
  if (Object.keys(update).some((key) => appearanceKeys.has(key) ||
      ['flowTime', 'showTime', 'washTime', 'flashTime', 'realTime'].includes(key)) || update.playing === true)
    frozenShotPixels = null;
  const changesView = update.sphereView
    ? update.sphereView !== sphereVisibility().mode
    : Boolean(update.formStyle && state.sphereView);
  const changesAppearance = changesView || Object.keys(update).some(
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
          sphereVisibility: sphereVisibility(),
          paletteColors:
            selectedSource === 'tree-voices' ? paletteWalk.colors(state.palette) : undefined,
        }
      : null;
  // Dice choices supersede manual visibility; explicit legacy forms still work.
  if (update.sphereView) {
    clothVisibilityOverride = null;
    tubeVisibilityOverride = null;
  } else if (update.formStyle) delete state.sphereView;
  // Each newly selected performance starts at its own source clock. Store that
  // clock in views/recipes, independently of the long-running studio clocks.
  if (!Object.hasOwn(update, 'showTime') &&
      ((update.look && update.look !== state.look) ||
       (update.seed !== undefined && update.seed !== state.seed))) update.showTime = 0;
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
function resetView() {
  setState({
    distance: defaults.distance,
    elevation: defaults.elevation,
    azimuth: defaults.azimuth,
    framing: defaults.framing,
  });
  return getState();
}
$('orbit').onclick = toggleOrbit;
$('mobile-orbit').onclick = toggleOrbit;
$('reset-view').onclick = resetView;
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
  const sphereView = chooseSphereView();
  const palettes = Object.keys(PALETTES).filter((id) => id !== state.palette);
  setState({
    look,
    atmosphere,
    formStyle,
    sphereView,
    palette: palettes[Math.floor(Math.random() * palettes.length)],
    seed: 1 + Math.floor(Math.random() * 1000000),
    flowSpeed: Math.round((0.6 + Math.random() * 1.1) * 10) / 10,
    detail: Math.round((0.7 + Math.random() * 0.75) * 20) / 20,
    wildness: Math.round((0.2 + Math.random() * 0.65) * 20) / 20,
  });
  $('look-status').textContent =
    SPHERE_VIEWS[sphereView].label + ' · ' + LOOKS[look] + ' · ' + SKY_LABELS[atmosphere];
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
  skyClothLighting.update(renderState.atmosphere);
  applyFormStyle(renderState, false);
  const diffuse = Boolean(SHOWS[renderState.look].clothDiffusion);
  material.uniforms.clothDiffusionEnabled.value = diffuse ? 1 : 0;
  if (diffuse) clothDiffusion.update(renderPixels,
    renderPixels === pixels && frozenShotPixels ? frozenShotPixels :
      fieldRevisions.get(renderPixels));
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
    lightingSource(),
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
    distance: gestureZoomPosition(state),
    elevation: center
      ? orbitPose(center.toArray(), state, camera.aspect).controlElevation
      : state.elevation,
  }),
  setState,
});
window.addEventListener('beforeunload', () => {
  remember();
  desktopTools?.dispose();
  releaseCameraGestures();
  lookWipe?.dispose();
  fisheyeRenderer?.dispose();
  selectedSource = 'tree-voices';
  resumeDefault = false;
  tabAudio.disconnect();
  defaultMusic.dispose();
});
document.addEventListener('visibilitychange', () => {
  last = 0;
  remember();
});
let cameraPose = null, fisheyeRenderer;
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
  fisheyeRenderer.render(camera, cameraPose, (view, height, pixelRatio) => {
    environment.updateCamera(view);
    tubeLights.updateCamera(view, height, pixelRatio);
  });
}
function resize() {
  const box = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(box.width, box.height, false);
  camera.aspect = box.width / box.height;
  camera.updateProjectionMatrix();
}
function captureFrame() {
  drawCurrentFrame();
  return canvas.toDataURL('image/png');
}
function shotCamera() {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const vertical = Math.hypot(direction.x, direction.y) < 1e-10;
  const headingDirection = vertical
    ? camera.up.clone().multiplyScalar(direction.z > 0 ? -1 : 1) : direction;
  const lensState = fisheyeRenderer.stats(),
    diagonal = Math.hypot(camera.aspect, 1),
    normalTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const coverage = (radius) => {
    const q = radius / diagonal,
      fishAngle = lensState.lens.stereographic ? 2 * Math.atan(q*(cameraPose.lensScale??1)) : q * Math.PI / 2;
    return THREE.MathUtils.radToDeg(2 * ((1 - cameraPose.fisheye) * Math.atan(radius * normalTan) + cameraPose.fisheye * fishAngle));
  };
  return {
    ...cameraPose,
    ...lensState,
    position: camera.position.toArray(),
    target: [...cameraPose.target],
    up: camera.up.toArray(),
    quaternionXYZW: camera.quaternion.toArray(),
    matrixWorld: camera.matrixWorld.toArray(),
    direction: direction.toArray(),
    headingDegrees: (THREE.MathUtils.radToDeg(Math.atan2(headingDirection.x, headingDirection.y)) + 360) % 360,
    headingReference: vertical ? 'camera up-vector yaw at vertical' : 'horizontal look direction',
    pitchDegrees: THREE.MathUtils.radToDeg(Math.atan2(direction.z, Math.hypot(direction.x, direction.y))),
    perspectiveFovDegrees: camera.fov,
    verticalFovDegrees: coverage(1),
    horizontalFovDegrees: coverage(camera.aspect),
    diagonalFov: coverage(diagonal),
    fullFrameEquivalentMm: cameraPose.fisheye > 0 ? null : sonyA7EquivalentMm(camera.fov, camera.aspect),
    aspect: camera.aspect,
    near: camera.near,
    far: camera.far,
  };
}
function shotRecipe() {
  if (lookWipe.active || queuedLook) throw new Error('Wait for the appearance transition to finish.');
  updateCamera();
  if (!frozenShotPixels) {
    const artworkState = selectedSource === 'tree-voices'
      ? { ...state, paletteColors: paletteWalk.colors(state.palette) } : state;
    flashStats = renderArtwork(artworkPoints, state.flowTime, artworkState, pixels,
      musicFrame ? { ...musicFrame, amount: state.audioReaction } : null);
    if (flashStats.recoveredPending) throw new Error('Wait for the recovered pattern to finish seeking.');
  }
  drawCurrentFrame();
  const box = canvas.getBoundingClientRect();
  return {
    format: 'tiny-sphere-shot',
    version: 1,
    capturedAt: new Date().toISOString(),
    build: new URL(import.meta.url).searchParams.get('v') ?? 'source',
    coordinates: { units: 'metres', up: '+Z', headingZero: '+Y', headingPositive: 'toward +X', pitchPositive: 'up' },
    model: {
      id: metadata.model_id,
      revision: metadata.model_revision ?? metadata.source_revision_sha256,
      geometrySha256: geometryAsset.decodedSha256,
    },
    state: getState(),
    camera: shotCamera(),
    rendering: {
      cssWidth: box.width, cssHeight: box.height,
      width: canvas.width, height: canvas.height,
      pixelRatio: renderer.getPixelRatio(),
      antialias: renderer.getContext().getContextAttributes().antialias,
      toneMapping: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      colorSpace: renderer.outputColorSpace,
    },
    clothVisibilityOverride,
    tubeVisibilityOverride,
    sphereView: sphereVisibility().mode,
    paletteWalk: { ...paletteWalk.status(), bag: [...paletteWalk.bag] },
    paletteColors: selectedSource === 'tree-voices' ? paletteWalk.colors(state.palette) : PALETTES[state.palette],
    audio: {
      source: selectedSource,
      phase: activeAudio().phase,
      positionSeconds: defaultMusic.media?.currentTime ?? null,
      track: selectedSource === 'tree-voices' ? musicAsset : null,
      features: musicFrame ? structuredClone(musicFrame) : null,
    },
    // Preserve the actual rendered light field too. Live audio analysis and
    // a random palette walk cannot be recovered from a seed and track time.
    lightField: { channels: 'linear RGBA', width: 22, height: fixtureCount, pixels: Array.from(pixels) },
    replay: 'Use this build and viewport, then sphereStudio.restoreShot(recipe). The still holds the captured light field; sphereStudio.play() resumes procedural light.',
  };
}
function restoreShot(recipe) {
  if (recipe?.format !== 'tiny-sphere-shot' || recipe.version !== 1)
    throw new Error('Unsupported shot recipe.');
  if (recipe.model?.geometrySha256 !== geometryAsset.decodedSha256)
    throw new Error('This recipe uses a different sphere model.');
  const build = new URL(import.meta.url).searchParams.get('v') ?? 'source';
  if (recipe.build !== build) throw new Error('Use the application build recorded in this recipe.');
  if (!Number.isFinite(recipe.camera?.aspect) || Math.abs(recipe.camera.aspect - camera.aspect) > 0.002)
    throw new Error(`Match the recipe viewport: ${recipe.rendering?.cssWidth} × ${recipe.rendering?.cssHeight} CSS pixels.`);
  const samples = recipe.lightField?.pixels;
  if (!Array.isArray(samples) || samples.length !== pixels.length ||
      samples.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('The recipe light field is incomplete.');
  const restoredTubeOverride = recipe.tubeVisibilityOverride === undefined ? null : recipe.tubeVisibilityOverride;
  if (![null, true, false].includes(recipe.clothVisibilityOverride) ||
      ![null, true, false].includes(restoredTubeOverride) ||
      !Number.isFinite(recipe.rendering?.exposure) || recipe.rendering.exposure <= 0)
    throw new Error('The recipe rendering settings are incomplete.');
  const walk = recipe.paletteWalk;
  if (!walk || !Object.hasOwn(PALETTES, walk.current) || !Object.hasOwn(PALETTES, walk.target) ||
      !Number.isFinite(walk.elapsed) || walk.elapsed < 0 || walk.elapsed >= 15 ||
      !Number.isFinite(walk.mix) || walk.mix < 0 || walk.mix > 1 ||
      !Array.isArray(walk.bag) || walk.bag.some((id) => !Object.hasOwn(PALETTES, id)))
    throw new Error('The recipe palette state is incomplete.');
  const restored = validated(recipe.state);
  if (Object.keys(defaults).some((key) => key !== 'schemaVersion' && !(key in restored)))
    throw new Error('The recipe appearance or camera settings are incomplete.');
  lookWipe.cancel();
  queuedLook = null;
  selectedSource = 'tree-voices';
  resumeDefault = false;
  tabAudio.disconnect();
  defaultMusic.pause();
  setState({ ...restored, playing: false, orbit: false });
  Object.assign(paletteWalk, { current: walk.current, target: walk.target, elapsed: walk.elapsed, mix: walk.mix, bag: [...walk.bag] });
  clothVisibilityOverride = recipe.clothVisibilityOverride === null ? null : Boolean(recipe.clothVisibilityOverride);
  tubeVisibilityOverride = restoredTubeOverride;
  frozenShotPixels = new Float32Array(samples);
  pixels.set(frozenShotPixels);
  texture.needsUpdate = true;
  material.uniforms.brightness.value = state.brightness;
  renderer.toneMappingExposure = recipe.rendering.exposure;
  lookWipe.cancel();
  queuedLook = null;
  updateCamera();
  drawCurrentFrame();
  syncUI();
  syncWipeUI();
  return { restored: true, width: canvas.width, height: canvas.height, frozenLighting: true };
}
function sceneInfo() {
  const name = (id) => id.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  const walk = paletteWalk.status(),
    walking = selectedSource === 'tree-voices',
    palette = walking ? walk.current : state.palette,
    theme = Object.values(THEMES).find((entry) =>
      Object.entries(entry.state).every(([key, value]) => state[key] === value),
    ),
    visibility = sphereVisibility(),
    pose = shotCamera(),
    box = canvas.getBoundingClientRect(),
    vector = (value) => value.map((v) => v.toFixed(5)).join(', ');
  return {
    show: LOOKS[state.look],
    colors: walking ? paletteWalk.colors(state.palette) : PALETTES[state.palette],
    settings: {
      Atmosphere: SKY_LABELS[state.atmosphere],
      'Light show': LOOKS[state.look],
      Palette: walking && walk.mix > 0
        ? `${name(palette)} → ${name(walk.target)} · ${Math.round(walk.mix * 100)}%`
        : name(palette),
      'Theme preset': theme?.name ?? 'Custom look',
      Form: FORM_STYLES[state.formStyle].label,
      'Light cloths': visibility.cloths ? 'On · 212 sails' : 'Off',
      'Sphere view': SPHERE_VIEWS[visibility.mode].label,
      Brightness: state.brightness.toFixed(2),
      Haze: state.haze.toFixed(2),
      'Light spill': state.lightSpill.toFixed(2),
      'Flow speed': `${state.flowSpeed.toFixed(2)}×`,
      Detail: state.detail.toFixed(2),
      Wildness: `${Math.round(state.wildness * 100)}%`,
      Flashes: state.flashIntensity > 0
        ? `${state.flashColorMode === 'custom' ? state.flashColor : 'Theme color'} · ${state.flashIntensity.toFixed(1)}`
        : 'Off',
      Seed: String(state.seed),
      Audio: selectedSource === 'tab' ? 'Browser tab' : 'Tree Voices',
      Camera: state.orbit ? 'Orbit' : 'Still',
      Lens: cameraPose.fisheye>0
        ? `${cameraPose.diagonalFov>180.001?'Virtual fisheye':cameraPose.fisheye===1?'12 mm fisheye reference':'Fisheye transition'} · ${Math.round(cameraPose.diagonalFov)}° diagonal`
        : `≈ ${Math.round(sonyA7EquivalentMm(camera.fov, camera.aspect))} mm`,
    },
    recipeReady: !lookWipe.active && !queuedLook,
    recipe: {
      'Camera XYZ (m)': vector(pose.position),
      'Target XYZ (m)': vector(pose.target),
      'Heading / pitch': `${pose.headingDegrees.toFixed(5)}° / ${pose.pitchDegrees.toFixed(5)}°`,
      'Up vector XYZ': vector(pose.up),
      'Quaternion XYZW': vector(pose.quaternionXYZW),
      Projection: cameraPose.projection,
      'FOV V / H / diagonal': `${pose.verticalFovDegrees.toFixed(5)}° / ${pose.horizontalFovDegrees.toFixed(5)}° / ${pose.diagonalFov.toFixed(5)}°`,
      'Near / far (m)': `${pose.near.toFixed(5)} / ${pose.far.toFixed(0)}`,
      'Distance / radius (m)': `${state.distance.toFixed(5)} / ${pose.radius.toFixed(5)}`,
      'Azimuth / elevation (rad)': `${state.azimuth.toFixed(8)} / ${state.elevation.toFixed(8)}`,
      'Viewport (CSS px)': `${box.width} × ${box.height}`,
      'Image (px) / pixel ratio': `${canvas.width} × ${canvas.height} / ${renderer.getPixelRatio()}`,
      'Exposure / tone mapping': `${renderer.toneMappingExposure} / ACES filmic`,
      'Flow / wash clocks (s)': `${state.flowTime.toFixed(6)} / ${state.washTime.toFixed(6)}`,
      'Flash / real clocks (s)': `${state.flashTime.toFixed(6)} / ${state.realTime.toFixed(6)}`,
      'Wash speed / amount': `${state.washSpeed} / ${state.washAmount}`,
      'Wash interval': `${state.washEvery} s`,
      'Flash speed / count / size': `${state.flashSpeed} / ${state.flashCount} / ${state.flashSize}`,
      'Burst intensity / interval': `${state.burstIntensity} / ${state.burstEvery} s`,
      'Burst duration / start': `${state.buildTime} s / ${state.burstAt ?? 'None'}`,
      'Auto burst / phrasing': `${state.autoBurst ? 'On' : 'Off'} / ${state.musicalPhrasing ? 'On' : 'Off'}`,
      'Softness / edge fade': `${state.softness} / ${state.edgeFade}`,
      'Mountain haze / ridge detail': `${state.mountainHaze} / ${state.ridgeDetail}`,
      'Audio reaction': state.audioReaction,
      'Music position (s)': (defaultMusic.media?.currentTime ?? 0).toFixed(6),
      'Palette current / target': `${name(walk.current)} / ${name(walk.target)}`,
      'Palette mix / elapsed (s)': `${walk.mix.toFixed(8)} / ${walk.elapsed.toFixed(6)}`,
      'Lighting snapshot': frozenShotPixels ? 'Held recipe' : 'Live · saved in JSON',
      'Model revision': metadata.model_revision ?? metadata.source_revision_sha256,
      Build: new URL(import.meta.url).searchParams.get('v') ?? 'source',
    },
  };
}
async function createScene() {
  const scene = new THREE.Scene(),
    base = 'assets/burning-man/';
  let metadata, fixtureCount, fieldRadius, center, points, pixels, texture, environment;
  loadingStage(82, 'Preparing the sphere');
  const [model, packed, skyOcclusion] = await Promise.all([
    loadJSON(geometryAsset.metadataPath),
    loadBytes(geometryAsset.path),
    loadClothOcclusion(loadJSON, loadBytes, geometryAsset),
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
  clothDiffusion = createClothDiffusion(THREE, fixtureCount);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      artwork: { value: texture },
      diffusedArtwork: { value: clothDiffusion.texture },
      clothDiffusionEnabled: { value: 0 },
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
    if (sail) {
      if (skyOcclusion.values.length !== geometry.getAttribute('position').count)
        throw Error('Soft sky shadows have the wrong cloth vertex count.');
      geometry.setAttribute('skyVisibility', new THREE.BufferAttribute(skyOcclusion.values, 1));
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
  skyClothLighting = createSkyClothLighting(renderer, center, fieldRadius);
  skyClothLighting.update(state.atmosphere);
  applySkyClothMaterial(material, skyClothLighting);
  applySkyFrameMaterials(scene, skyClothLighting);
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
  await loadRecoveredShows(loadJSON, loadBytes);
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
  if (SHOWS[state.look].clothDiffusion) {
    clothDiffusion.update(pixels, fieldRevisions.get(pixels));
    material.uniforms.clothDiffusionEnabled.value = 1;
  }
  texture.needsUpdate = true;
  tubeLights.update(state, camera, skyPresetLighting(state.atmosphere));
  environment.update(state, pixels, camera, lightingSource());
  loadingStage(96, 'Preparing the view');
  fisheyeRenderer = await createFisheyeRenderer(renderer, scene, center);
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
  desktopTools = createDesktopTools({
    capture: captureFrame,
    getRecipe: shotRecipe,
    getSphereVisibility: sphereVisibility,
    setClothsVisible: (value) => {
      clothVisibilityOverride = value;
      tubeVisibilityOverride = null;
      applyFormStyle();
    },
    setSphereView: (mode) => {
      const view = SPHERE_VIEWS[mode];
      clothVisibilityOverride = view.cloths;
      tubeVisibilityOverride = view.tubes;
      applyFormStyle();
    },
  });
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
    resetView,
    triggerBurst,
    viewURL,
    shareView,
    pause: () => setState({ playing: false }),
    play: () => setState({ playing: true }),
    seek: (t) =>
      setState({
        flowTime: t,
        showTime: t,
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
    setDebugMenuOpen: desktopTools.setOpen,
    setDebugFPS: desktopTools.setFPS,
    setDebugInfo: desktopTools.setInfo,
    setClothsVisible: desktopTools.setCloths,
    setSphereView: desktopTools.setSphereView,
    getSphereView: () => sphereVisibility().mode,
    debugStatus: desktopTools.getStatus,
    clearDebug: desktopTools.clear,
    downloadScreenshot: desktopTools.screenshot,
    shotRecipe,
    restoreShot,
    copyShotRecipe: desktopTools.copyRecipe,
    downloadShotRecipe: desktopTools.saveRecipe,
    sceneInfo,
    setFormStyle: (formStyle) => setState({ formStyle }),
    listFormStyles: () => structuredClone(FORM_STYLES),
    formWeights: () => ({ ...FORM_WEIGHTS }),
    sphereViewWeights: () => ({ ...SPHERE_VIEW_WEIGHTS }),
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
      ...fisheyeRenderer.stats(),
      fullFrameEquivalentMm: cameraPose.fisheye>0 ? null : sonyA7EquivalentMm(camera.fov, camera.aspect),
      angularSpeed: ORBIT_RADIANS_PER_SECOND,
      automatic: state.orbit,
      renderPasses: 1,
    }),
    loadingStatus,
    stats: () => ({
      frames: frameCount,
      recoveredSeeking: Boolean(flashStats.recoveredPending),
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
    capture: captureFrame,
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
      if (SHOWS[state.look].renderField) state.showTime += dt * state.flowSpeed;
      state.washTime += dt * state.washSpeed;
      state.flashTime += dt * state.flashSpeed;
      state.realTime += dt;
      if (lookWipe.active) {
        const source = lookWipe.source,
          sourcePresence = SHOWS[source.look].spectralIdle ? spectralMusicPresence(musicFrame) : 1;
        const sourceRate =
          0.45 * (1 - sourcePresence) + (musicFrame?.flowRate ?? 1) * sourcePresence;
        source.flowTime += dt * source.flowSpeed * sourceRate;
        if (SHOWS[source.look].renderField) source.showTime += dt * source.flowSpeed;
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
      state.showTime,
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
    if (!frozenShotPixels && (
      signature !== lastArtworkState || flashStats.recoveredPending ||
      state.audioReaction !== lastReaction ||
      (music && state.playing)
    )) {
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
