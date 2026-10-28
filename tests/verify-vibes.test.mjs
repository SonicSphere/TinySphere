import assert from 'node:assert/strict';
import { PaletteWalk } from '../src/engine/palette-walk.js';
import { PALETTES, renderArtwork } from '../src/engine/artwork.js';
import { skyPresetLighting, presetFromTime } from '../src/environment/time-of-day.js';
const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const walk = new PaletteWalk(PALETTES, 'velvet', () => 0.37);
assert.equal(walk.status().mix, 0);
walk.advance(10);
assert.equal(walk.status().mix, 0);
walk.advance(2.5);
assert.equal(walk.status().mix, 0.5);
const points = Float32Array.from({ length: 300 }, (_, i) => Math.sin(i * 2.3));
const state = {
  look: 'spectral',
  palette: 'velvet',
  seed: 9271,
  detail: 1,
  wildness: 0.65,
  realTime: 20,
  flowTime: 4,
  flashTime: 3,
  washTime: 6,
  brightness: 1,
};
const before = new Float32Array(400),
  after = new Float32Array(400);
renderArtwork(points, 4, state, before);
let maxLuminanceError = 0,
  colorChanges = 0;
for (let frame = 0; frame < 900; frame++) {
  walk.advance(1 / 30);
  const colors = walk.colors(state.palette);
  colors.forEach((color, i) =>
    assert.ok(Math.abs(luminance(color) - luminance(PALETTES.velvet[i])) < 1e-10),
  );
  renderArtwork(points, 4, { ...state, paletteColors: colors }, after);
  for (let i = 0; i < before.length; i += 4) {
    const difference = Math.abs(
      luminance(before.subarray(i, i + 3)) - luminance(after.subarray(i, i + 3)),
    );
    maxLuminanceError = Math.max(maxLuminanceError, difference);
    assert.ok(difference < 1e-7, 'Spatial luminance stays unchanged during palette transitions');
    if (Math.abs(before[i] - after[i]) > 1e-6) colorChanges++;
  }
}
assert.ok(colorChanges > 0);
const unique = new PaletteWalk(PALETTES, 'velvet', () => 0.37),
  seen = new Set(['velvet']);
for (let i = 0; i < 13; i++) {
  unique.advance(15);
  assert.ok(!seen.has(unique.current));
  seen.add(unique.current);
}
const sequences = Array.from({ length: 6 }, () => {
  const randomWalk = new PaletteWalk(PALETTES, 'velvet');
  return Array.from({ length: 8 }, () => randomWalk.advance(15).current).join(',');
});
assert.equal(
  new Set(sequences).size,
  sequences.length,
  'Fresh sessions get different random orders',
);
const continuity = new PaletteWalk(PALETTES, 'velvet', () => 0.37);
continuity.advance(15 - 1e-6);
const end = continuity.colors('velvet');
continuity.advance(1e-6);
const start = continuity.colors('velvet');
end.flat().forEach((value, i) => assert.ok(Math.abs(value - start.flat()[i]) < 1e-8));
walk.reset('ember');
assert.equal(walk.mix, 0);
assert.equal(walk.elapsed, 0);
assert.equal(walk.current, 'ember');
for (const preset of ['stars', 'sunrise', 'sunset']) {
  const light = skyPresetLighting(preset);
  assert.equal(light.daylight, 0);
  assert.equal(light.artVisibility, 1);
  assert.equal(light.stars, preset === 'stars' ? 1 : 0);
  assert.equal(light.sunset, preset === 'sunset' ? 1 : 0);
}
assert.equal(skyPresetLighting().sunset, 1);
assert.equal(presetFromTime(1), 'stars');
assert.equal(presetFromTime(0.62), 'sunset');
assert.equal(presetFromTime(0.35), 'sunrise');
console.log(
  JSON.stringify({
    passed: true,
    paletteFrames: 900,
    spatialSamples: 100,
    maxLuminanceError,
    randomSequences: 6,
    skyPresets: 3,
  }),
);
