import assert from 'node:assert/strict';
import {
  DEFAULT_TIME_OF_DAY,
  timeOfDayLighting,
  legacyTimeOfDay,
} from '../src/environment/time-of-day.js';

const day = timeOfDayLighting(0),
  night = timeOfDayLighting(1);
assert.equal(day.daylight, 1);
assert.equal(day.stars, 0);
assert.ok(Math.abs(day.artVisibility - 0.14) < 1e-12);
assert.equal(night.daylight, 0);
assert.equal(night.dusk, 0);
assert.equal(night.stars, 1);
assert.equal(night.artVisibility, 1);
assert.deepEqual(timeOfDayLighting(-1), day);
assert.deepEqual(timeOfDayLighting(2), night);
for (const value of [NaN, Infinity, -Infinity, undefined]) {
  assert.deepEqual(timeOfDayLighting(value), timeOfDayLighting(DEFAULT_TIME_OF_DAY));
}
assert.equal(legacyTimeOfDay({ atmosphere: 'stars', sky: 1 }), 1);
assert.equal(legacyTimeOfDay({ atmosphere: 'night', sky: 0.8 }), 1);
assert.equal(legacyTimeOfDay({ atmosphere: 'sunrise', sky: 1 }), 0.35);
assert.equal(legacyTimeOfDay({ atmosphere: 'sunset', sky: 1 }), 0.62);
assert.equal(legacyTimeOfDay({ atmosphere: 'sunset', sky: 0 }), 1);
let previous = day;
for (let i = 1; i <= 10000; i++) {
  const sample = timeOfDayLighting(i / 10000);
  for (const value of Object.values(sample))
    assert.ok(value >= 0 && value <= 1 && Number.isFinite(value));
  assert.ok(sample.daylight <= previous.daylight);
  assert.ok(sample.dusk <= previous.dusk);
  assert.ok(sample.sunset >= previous.sunset);
  assert.ok(sample.stars >= previous.stars);
  assert.ok(sample.artVisibility >= previous.artVisibility);
  for (const key of Object.keys(sample)) assert.ok(Math.abs(sample[key] - previous[key]) < 0.001);
  previous = sample;
}
console.log(
  JSON.stringify({
    passed: true,
    continuousSamples: 10001,
    endpoints: { day, night },
    legacyMigration: true,
  }),
);
