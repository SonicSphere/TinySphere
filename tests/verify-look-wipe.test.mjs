import assert from 'node:assert/strict';
import { LookWipe, WIPE_SECONDS, wipeEase } from '../src/engine/look-wipe.js';

assert.equal(WIPE_SECONDS, 0.5);
const wipe = new LookWipe({});
const source = { atmosphere: 'sunset' };
wipe.start(source);
assert.equal(wipe.source, source);
wipe.advance(-1);
assert.equal(wipe.status().progress, 0);
wipe.advance(0.25);
assert.equal(wipe.status().progress, 0.5);
wipe.advance(10);
assert.equal(wipe.status().progress, 1);
// Completing the sweep draws only the new look and releases its old state.
let before = 0,
  after = 0;
wipe.resize = () => {};
assert.equal(
  wipe.render(
    () => before++,
    () => after++,
  ),
  true,
);
assert.equal(before, 0);
assert.equal(after, 1);
assert.equal(wipe.status().active, false);
assert.equal(wipe.source, null);
assert.equal(wipe.status().completed, 1);
wipe.start({}, { reducedMotion: true });
assert.equal(wipe.status().active, false);
wipe.start({});
wipe.cancel();
assert.equal(wipe.status().active, false);
assert.equal(wipe.source, null);
wipe.dispose();
let previous = -1;
for (let i = 0; i <= 1000; i++) {
  const next = wipeEase(i / 1000);
  assert.ok(next >= previous && next >= 0 && next <= 1);
  previous = next;
}
console.log(
  JSON.stringify({
    passed: true,
    durationSeconds: WIPE_SECONDS,
    easingSamples: 1001,
    reducedMotion: true,
  }),
);
