import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderArtwork, prepareArtworkPoints } from '../src/engine/artwork.js';

// Captured before extraction, from the approved local 1.1 artwork engine.
const reference = JSON.parse(
  readFileSync(new URL('fixtures/artwork-reference.json', import.meta.url)),
);
const points = Float32Array.from(reference.points);
const prepared = prepareArtworkPoints(points);
let samples = 0;
for (const { seconds, state, music, pixels, stats } of reference.cases) {
  for (const field of [points, prepared]) {
    const output = new Float32Array(pixels.length);
    const actual = renderArtwork(field, seconds, state, output, music);
    for (let i = 0; i < pixels.length; i++) {
      assert.ok(
        Math.abs(output[i] - pixels[i]) <= 1e-6 * Math.max(1, Math.abs(pixels[i])),
        `${state.look}/${state.palette} at ${seconds}s, sample ${i}`,
      );
    }
    assert.deepEqual(actual, stats);
    samples += pixels.length / 4;
  }
}
console.log(
  JSON.stringify({ passed: true, referenceCases: reference.cases.length, spatialSamples: samples }),
);
