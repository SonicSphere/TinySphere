import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadRecoveredTestData } from './helpers/recovered-data.mjs';
import { SHOWS } from '../src/shows/index.js';
import { RECOVERED_SHOWS } from '../src/shows/recovered/index.js';
import { PatternEngine, createBMAdapter } from '../src/shows/recovered/pattern-engine.js';
import { renderArtwork, prepareArtworkPoints } from '../src/engine/artwork.js';
import { decodeGeometry } from '../src/engine/geometry-codec.js';
import { geometryAsset } from '../src/load-manifest.js';
import { blurClothField, circularKernel, DIFFUSION_SIGMAS, diffusionLevel, createClothDiffusion } from '../src/engine/cloth-diffusion.js';

const { nodes, image } = await loadRecoveredTestData();
for (const id of [1, 3]) for (const trail of [0, 1]) {
  const engine = new PatternEngine(nodes, image, { id });
  engine.configure({ trail: Boolean(trail) });
  engine.restart();
  engine.advance((id === 1 ? 40 : 100) / 60);
  const native = await readFile(new URL(`fixtures/recovered-bm/mode-${id}-trail-${trail}.rgb`, import.meta.url));
  assert.deepEqual(Buffer.from(engine.colors), native, `Original C++ mode ${id}, trail ${trail}`);
}
assert.equal(createHash('sha256').update(image.data).digest('hex'), image.decodedSHA256);
assert.equal(Object.keys(SHOWS).length, 17);
assert.deepEqual(RECOVERED_SHOWS.map((show) => show.sourcePattern), [1, 2, 3, 4, 5, 6, 7, 9]);
const read = (path) => readFile(new URL('../src/' + path, import.meta.url));
const metadata = JSON.parse(await read(geometryAsset.metadataPath));
const binary = await decodeGeometry(await read(geometryAsset.path), geometryAsset);
const points = new Float32Array(212 * 22 * 3);
const center = metadata.light_show.sphere_center, radius = metadata.light_show.field_radius_metres;
for (const part of metadata.parts.filter((part) => part.category === 'sail')) {
  const locations = new Float32Array(binary, part.fixture_positions.offset, part.fixture_positions.count);
  const u = new Float32Array(binary, part.fixture_axes_u.offset, part.fixture_axes_u.count);
  const v = new Float32Array(binary, part.fixture_axes_v.offset, part.fixture_axes_v.count);
  for (let i = 0; i < part.fixture_ids.length; i++) for (let j = 0; j < 22; j++) for (let k = 0; k < 3; k++) {
    const angle = j * Math.PI * 2 / 21;
    points[(part.fixture_ids[i] * 22 + j) * 3 + k] =
      (locations[i * 3 + k] - center[k] + (j < 21 ? .34 * (u[i * 3 + k] * Math.cos(angle) + v[i * 3 + k] * Math.sin(angle)) : 0)) / radius;
  }
}
const prepared = prepareArtworkPoints(points), out = new Float32Array(212 * 22 * 4);
for (const show of RECOVERED_SHOWS) {
  const seed = 2022, seconds = 3.35;
  const engine = new PatternEngine(nodes, image, { id: show.sourcePattern, seed });
  const adapter = createBMAdapter(engine.fixtures, points);
  assert.equal(adapter.stats.uniqueMatches, 212);
  assert.ok(adapter.stats.maximumCenterAngleDegrees < .05);
  engine.advance(seconds);
  const expected = new Float32Array(out.length);
  adapter.write(engine.colors, expected);
  const state = { look: show.id, seed, showTime: seconds };
  renderArtwork(prepared, 11910, state, out);
  assert.deepEqual(out, expected, `${show.id}: exact reviewed port, independent of old studio clock`);
  const held = out.slice();
  renderArtwork(prepared, 11911, state, out, { amount: 1, energy: 1, waves: [], sparks: [], tempo: { pulse: 1 } });
  assert.deepEqual(out, held, `${show.id}: music and paused studio clocks cannot add shimmer`);
  renderArtwork(prepared, 11910, { ...state, showTime: .1 }, out);
  renderArtwork(prepared, 11910, state, out);
  assert.deepEqual(out, held, `${show.id}: backward and forward seek is deterministic`);
  // An outgoing wipe with a different seed cannot mutate the held current look.
  renderArtwork(prepared, 0, { ...state, seed: 99, showTime: .3 }, out);
  renderArtwork(prepared, 0, state, out);
  assert.deepEqual(out, held, `${show.id}: independent wipe performances`);
  renderArtwork(prepared, 0, { ...state, seed: 1.9, showTime: .2 }, out);
  const fractionalSeed = out.slice();
  renderArtwork(prepared, 0, { ...state, seed: 1, showTime: .2 }, out);
  assert.deepEqual(out, fractionalSeed, 'Validated fractional seeds have a defined integer simulation seed');
  assert.ok(held.some((value, i) => i % 4 !== 3 && value > 0), show.id);
}
const seeking = { look: 'bm-rings', seed: 821, showTime: 3.35 };
let seekStats = renderArtwork(prepared, 0, seeking, out, null, { maxSteps: 12 });
assert.equal(seekStats.recoveredPending, true, 'A long seek is split into bounded work');
for (let i = 0; i < 20 && seekStats.recoveredPending; i++)
  seekStats = renderArtwork(prepared, 0, seeking, out, null, { maxSteps: 12 });
assert.equal(seekStats.recoveredPending, false);
const caughtUp = out.slice();
renderArtwork(prepared, 0, seeking, out);
assert.deepEqual(out, caughtUp, 'Bounded catch-up reaches the same deterministic field');

for (const sigma of DIFFUSION_SIGMAS) {
  const weights = circularKernel(sigma);
  assert.ok(weights.every((value) => value > 0));
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
}
const uniform = new Float32Array(22 * 4).fill(1);
assert.ok(blurClothField(uniform, 1).every((value) => Math.abs(value - 1) < 1e-6));
const impulse = new Float32Array(22 * 4);
impulse[0] = 1;
const blurred = blurClothField(impulse, 1);
let previousPeak = Infinity;
for (let level = 0; level < 4; level++) {
  const values = Array.from({ length: 21 }, (_, i) => blurred[level * 22 * 4 + i * 4]);
  assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.ok(Math.max(...values) < previousPeak);
  previousPeak = Math.max(...values);
}
assert.ok(diffusionLevel(.6) > diffusionLevel(.15));
// Both sides of a wipe can have the same clock. Cache identity must include
// the field array, rather than retaining the outgoing side's blurred texture.
class DataTexture { constructor(data) { this.image = { data }; } }
const diffusion = createClothDiffusion({ DataTexture, NearestFilter: 1 }, 1);
diffusion.update(uniform, 5);
const first = diffusion.texture.image.data.slice();
diffusion.update(impulse, 5);
assert.notDeepEqual(diffusion.texture.image.data, first);
diffusion.update(uniform, 5);
assert.deepEqual(diffusion.texture.image.data, first);
console.log(JSON.stringify({ passed: true, recoveredShows: 8, fixtureMatches: 212,
  originalPortParity: true, deterministicSeekAndWipe: true, diffusionEnergyPreserved: true }));
