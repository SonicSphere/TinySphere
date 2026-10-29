import assert from 'node:assert/strict';
import { SHOWS } from '../src/shows/index.js';
import { defineShows } from '../src/shows/registry.js';
import { PALETTES, FLASH_ACCENTS } from '../src/themes/palettes.js';
import { THEMES, themeState } from '../src/themes/index.js';
import { defineThemes } from '../src/themes/registry.js';
import { renderArtwork } from '../src/engine/artwork.js';
import exampleShow from '../examples/longitude-waves.js';
import exampleTheme from '../examples/blue-hour.js';
import { loadRecoveredTestData } from './helpers/recovered-data.mjs';
await loadRecoveredTestData();

for (const [id, stops] of Object.entries(PALETTES)) {
  assert.equal(stops.length, 5, `${id}: palette walk requires five stops`);
  assert.ok(
    stops.flat().every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    id,
  );
  assert.equal(FLASH_ACCENTS[id]?.length, 3, `${id}: add a flash accent too`);
}

// New shows are automatically exercised over every palette, silence and audio,
// poles and seam neighbors, and both low/high detail settings.
const points = new Float32Array([
  0, 0, 1, 0, 0, -1, 1, 0, 0, -1, 1e-8, 0, -1, -1e-8, 0, 0.3, 0.4, 0.5,
]);
let rendered = 0;
for (const show of Object.values(SHOWS))
  for (const palette of Object.keys(PALETTES)) {
    for (const detail of [0.45, 2.1])
      for (const amount of [0, 1]) {
        const output = new Float32Array(24);
        renderArtwork(
          points,
          37.2,
          { look: show.id, palette, seed: 321, detail, wildness: 1, flashIntensity: 0, showTime: 0.4 },
          output,
          {
            amount,
            energy: amount * 0.7,
            bands: Array(10).fill(amount * 0.6),
            waves: [],
            sparks: [],
            tempo: { pulse: 0.4 },
          },
        );
        assert.ok(
          output.every((v) => Number.isFinite(v) && v >= 0),
          `${show.id}/${palette}: finite nonnegative light`,
        );
        rendered++;
      }
  }

assert.ok(Object.keys(THEMES).length >= 4);
for (const theme of Object.values(THEMES)) {
  const clone = themeState(theme.id);
  assert.deepEqual(clone, theme.state);
  clone.palette = 'changed';
  assert.notEqual(clone.palette, theme.state.palette, 'A caller cannot mutate a registered theme');
}
assert.equal(themeState('missing-theme'), null);
assert.equal(defineShows([exampleShow])[exampleShow.id].name, 'Longitude waves');
assert.equal(defineThemes([exampleTheme])[exampleTheme.id].name, 'Blue hour');
const frame = exampleShow.prepare({ seconds: 12, seed: 4, detail: 1, music: { energy: 0.6 } });
const a = [0, 0, 0],
  b = [0, 0, 0];
const powerA = exampleShow.sample(-1, 1e-10, 0, frame, PALETTES.glacier, a);
const powerB = exampleShow.sample(-1, -1e-10, 0, frame, PALETTES.glacier, b);
assert.ok(Math.abs(powerA - powerB) < 1e-8, 'Example meets at the longitude seam');
assert.ok(a.every((v) => Number.isFinite(v) && v >= 0));
const pole = exampleShow.sample(0, 0, 1, frame, PALETTES.glacier, [0, 0, 0]);
for (const angle of [0, 1, 2, 3, 4]) {
  const nearPole = exampleShow.sample(
    1e-6 * Math.cos(angle),
    1e-6 * Math.sin(angle),
    1,
    frame,
    PALETTES.glacier,
    [0, 0, 0],
  );
  assert.ok(Math.abs(pole - nearPole) < 1e-8, 'Example is continuous at the pole');
}
assert.throws(() => defineShows([exampleShow, exampleShow]), /Duplicate/);
assert.throws(() => defineShows([{ ...exampleShow, palette: 'missing' }]), /unknown palette/);
assert.throws(() => defineShows([{ ...exampleShow, sample: null }]), /sample/);
assert.throws(() => defineThemes([exampleTheme, exampleTheme]), /Duplicate/);
assert.throws(
  () => defineThemes([{ ...exampleTheme, state: { ...exampleTheme.state, distance: 50 } }]),
  /not a theme setting/,
);
assert.throws(
  () => defineThemes([{ ...exampleTheme, state: { ...exampleTheme.state, look: 'missing' } }]),
  /unknown show/,
);
assert.throws(
  () => defineThemes([{ ...exampleTheme, state: { ...exampleTheme.state, detail: NaN } }]),
  /supported range/,
);
console.log(
  JSON.stringify({
    passed: true,
    shows: Object.keys(SHOWS).length,
    themes: Object.keys(THEMES).length,
    rendered,
  }),
);
