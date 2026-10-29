import {normalizeOpticalInput} from '../src/camera/optical-zoom.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ARRIVAL_DEFAULTS } from '../src/settings/arrival-defaults.js';
import { LOOK_INFO, PALETTES } from '../src/engine/artwork.js';
import { FORM_STYLES } from '../src/engine/tube-lights.js';
import { MAX_CAMERA_DISTANCE } from '../src/camera/orbit.js';
import { PaletteWalk } from '../src/engine/palette-walk.js';
import { SKY_PRESETS, skyPresetLighting, presetFromTime } from '../src/environment/time-of-day.js';

// Exercise the actual app startup, with persisted preferences from other visits.
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const startup = app.slice(app.indexOf('const $ ='), app.indexOf('let musicMotion ='));
const stale = {
  ...ARRIVAL_DEFAULTS,
  formStyle: 'floatingLights',
  look: 'lava',
  palette: 'aurora',
  haze: 0.1,
  lightSpill: 0,
  brightness: 0,
  playing: false,
  orbit: false,
  seed: 7,
  detail: 0.45,
  softness: 2,
  distance: 1500,
  elevation: 1,
  flowTime: 1,
};
const linked = (value) => '#view=' + Buffer.from(JSON.stringify(value)).toString('base64url');
const scenarios = [
  { name: 'fresh visit' },
  { name: 'returning visit', saved: stale },
  { name: 'after changing the look', saved: stale, qa: 'arrival-reload' },
  { name: 'legacy saved preferences', legacy: stale },
  { name: 'malformed preferences', saved: 'invalid JSON' },
  { name: 'unavailable storage', blocked: true },
  { name: 'malformed view link', hash: '#view=bad' },
  {
    name: 'explicit shared view',
    hash: linked({ ...stale, venue: 'burning-man' }),
    expected: stale,
  },
  {
    name: 'legacy model camera',
    hash: linked({ venue: 'nashville', distance: 14, elevation: 1, azimuth: 0 }),
  },
];
const results = [];
for (const compact of [false, true])
  for (const scenario of scenarios) {
    const key = 'sonic-sphere-minimal-v3' + (scenario.qa ? '-qa-' + scenario.qa : '');
    const storage = new Map([
      [key, typeof scenario.saved === 'string' ? scenario.saved : JSON.stringify(scenario.saved)],
      ['sonic-sphere-public-studio-v1', JSON.stringify(scenario.legacy)],
    ]);
    const context = {
      normalizeOpticalInput,
    ARRIVAL_DEFAULTS,
      LOOK_INFO,
      PALETTES,
      FORM_STYLES,
      MAX_CAMERA_DISTANCE,
      PaletteWalk,
      SKY_PRESETS,
      skyPresetLighting,
      presetFromTime,
      URLSearchParams,
      atob,
      location: { search: scenario.qa ? '?qa=' + scenario.qa : '', hash: scenario.hash ?? '' },
      compactLayout: { matches: compact },
      localStorage: {
        getItem: (key) => {
          if (scenario.blocked) throw new Error('Storage unavailable');
          return storage.get(key) ?? null;
        },
      },
    };
    const actual = JSON.parse(vm.runInNewContext(startup + '\nJSON.stringify(state)', context));
    assert.deepEqual(actual, {lensFov:180,showTime:0,...(scenario.expected ?? ARRIVAL_DEFAULTS)}, scenario.name);
    results.push({ scenario: scenario.name, compact, passed: true });
  }
console.log(JSON.stringify({ passed: true, cases: results.length, results }, null, 2));
