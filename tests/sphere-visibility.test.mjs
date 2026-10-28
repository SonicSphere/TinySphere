import assert from 'node:assert/strict';
import { chooseSphereView, SPHERE_VIEWS, SPHERE_VIEW_WEIGHTS } from '../src/engine/form-choice.js';

assert.deepEqual(SPHERE_VIEW_WEIGHTS, { full: 80, tubes: 10, bare: 10 });
const counts = { full: 0, tubes: 0, bare: 0 };
for (let i = 0; i < 10000; i++) counts[chooseSphereView(() => (i + 0.5) / 10000)]++;
assert.deepEqual(counts, { full: 8000, tubes: 1000, bare: 1000 });
for (const [sample, expected] of [[0, 'full'], [0.799999, 'full'], [0.8, 'tubes'], [0.899999, 'tubes'], [0.9, 'bare'], [0.999999, 'bare']])
  assert.equal(chooseSphereView(() => sample), expected);
assert.equal(SPHERE_VIEWS.full.cloths, true);
assert.equal(SPHERE_VIEWS.tubes.cloths, false);
assert.equal(SPHERE_VIEWS.tubes.tubes, true);
assert.equal(SPHERE_VIEWS.bare.cloths, false);
assert.equal(SPHERE_VIEWS.bare.tubes, false);
console.log(JSON.stringify({ passed: true, samples: 10000, counts }));
