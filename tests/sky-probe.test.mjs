import assert from 'node:assert/strict';
import { integrateSkyProbe } from '../src/engine/sky-cloth.js';

const width = 64, height = 32;
const encoded = Math.round((0.5 ** (1 / 2.2)) * 255);
const bytes = new Uint8Array(width * height * 4).fill(encoded);
const probe = integrateSkyProbe(bytes, width, height);
const radiance = (encoded / 255) ** 2.2 * 2;
function evaluate(coefficients, [x, y, z]) {
  const basis = [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x,
    1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
    1.092548 * x * z, 0.546274 * (x * x - y * y)];
  return basis.reduce((sum, weight, i) => sum + weight * coefficients[i][0], 0);
}
const full = probe.sky.map((rgb, i) => rgb.map((c, k) => c + probe.horizon[i][k]));
// An evenly luminous upper hemisphere has known diffuse irradiance: 1 upward,
// 1/2 sideways, 0 downward. SH9 is approximate, so allow its band-limit error.
assert.ok(Math.abs(evaluate(full, [0, 0, 1]) / radiance - 1) < 0.065);
assert.ok(Math.abs(evaluate(full, [1, 0, 0]) / radiance - 0.5) < 0.001);
assert.ok(Math.abs(evaluate(full, [0, 0, -1]) / radiance) < 0.065);
for (const normal of [[1, 0, 0], [0, 0, 1], [0.6, 0, 0.8]]) {
  const sum = evaluate(full, normal) + evaluate(full, normal.map((x) => -x));
  assert.ok(Math.abs(sum / radiance - 1) < 0.002, 'Front/back blend preserves energy');
}
assert.ok([...probe.sky, ...probe.horizon].flat().every(Number.isFinite));
const dark = integrateSkyProbe(new Uint8Array(width * height * 4), width, height);
assert.ok([...dark.sky, ...dark.horizon, dark.ground].flat().every((value) => value === 0));
console.log(JSON.stringify({ passed: true, samples: width * height,
  checks: ['known hemispheric irradiance', 'front/back energy', 'finite coefficients', 'zero incident light'] }));
