import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { renderArtwork, prepareArtworkPoints } from '../src/engine/artwork.js';
import { SHOWS } from '../src/shows/index.js';
import { PALETTES } from '../src/themes/palettes.js';
import { PRESETS } from '../src/shows/flocking/presets.js';
import { loadSpherePoints } from './helpers/sphere-points.mjs';

const points = await loadSpherePoints(), prepared = prepareArtworkPoints(points);
const out = new Float32Array(points.length / 3 * 4);
const hash = field => createHash('sha256').update(Buffer.from(field.buffer, field.byteOffset, field.byteLength)).digest('hex');
const reference = JSON.parse(await readFile(new URL('fixtures/fire-fast.json', import.meta.url)));
assert.equal(Object.keys(SHOWS).length, 18);
assert.deepEqual(PRESETS.map(preset => preset.id), ['fire-fast']);
assert.equal(SHOWS['fire-fast'].clothDiffusion, true);
assert.equal(SHOWS['fire-fast'].defaultFlowSpeed, 1);
for (const sample of reference.fields) {
  const state = { look: 'fire-fast', seed: sample.seed, showTime: sample.seconds, palette: sample.palette };
  renderArtwork(prepared, 11910, state, out);
  assert.equal(hash(out), sample.sha256, 'Exact approved study field: ' + JSON.stringify(sample));
  const expected = out.slice();
  renderArtwork(prepared, 99999, { ...state, flashIntensity: 4, washAmount: 1.5, autoBurst: true }, out,
    { amount: 1, energy: 1, waves: [], sparks: [], tempo: { pulse: 1 } });
  assert.deepEqual(out, expected, 'Extra studio effects cannot change the approved field');
  renderArtwork(prepared, 0, { ...state, showTime: 0 }, out);
  renderArtwork(prepared, 0, state, out);
  assert.deepEqual(out, expected, 'Backward seek reproduces the exact field');
}

const state = { look: 'fire-fast', seed: 731, showTime: 3.35, palette: 'cherry' };
let result = renderArtwork(prepared, 0, state, out, null, { maxSteps: 12 });
assert.equal(result.recoveredPending, true);
for (let i = 0; i < 20 && result.recoveredPending; i++)
  result = renderArtwork(prepared, 0, state, out, null, { maxSteps: 12 });
assert.equal(result.recoveredPending, false);
const held = out.slice();
renderArtwork(prepared, 0, { ...state, seed: 99 }, out);
renderArtwork(prepared, 0, state, out);
assert.deepEqual(out, held, 'Wipe source and target histories stay independent');
const outgoing = new Float32Array(out.length), incoming = new Float32Array(out.length);
for (let i = 0; i < 20; i++) {
  renderArtwork(prepared, 0, { ...state, seed: 431, showTime: .5 }, outgoing, null, { maxSteps: 12 });
  result = renderArtwork(prepared, 0, { ...state, seed: 431 }, incoming, null, { maxSteps: 12 });
}
assert.equal(result.recoveredPending, false, 'A same-seed wipe cannot restart the other clock every frame');
renderArtwork(prepared, 0, { ...state, seed: 431 }, out);
assert.deepEqual(incoming, out, 'Bounded incoming wipe reaches its own timestamp');
renderArtwork(prepared, 0, { ...state, seed: 431, showTime: .5 }, out);
assert.deepEqual(outgoing, out, 'Outgoing wipe retains its independent timestamp');
for (const seed of [11, 12, 13, 14, 15]) renderArtwork(prepared, 0, { ...state, seed }, out);
renderArtwork(prepared, 0, state, out);
assert.deepEqual(out, held, 'Cache eviction can reconstruct the same performance');

renderArtwork(prepared, 0, { ...state, paletteColors: PALETTES.glacier }, out);
assert.notDeepEqual(out, held, 'The live palette walk colors the field even at a held time');
renderArtwork(prepared, 0, state, out);
assert.deepEqual(out, held, 'Changing color cannot change the underlying flock motion');
assert.ok(out.some((v, i) => i % 4 !== 3 && v > 0));
for (let fixture = 0; fixture < 212; fixture++) for (let c = 0; c < 3; c++) {
  let mean = 0;
  for (let angle = 0; angle < 21; angle++) mean += out[(fixture * 22 + angle) * 4 + c] / 21;
  assert.ok(Math.abs(out[(fixture * 22 + 21) * 4 + c] - mean) < 1e-6);
}
console.log(JSON.stringify({ passed: true, approvedStudyFields: reference.fields.length,
  seededReplay: true, boundedSeek: true, independentWipes: true, paletteWalk: true }));
