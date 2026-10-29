import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { validateClothOcclusion } from '../src/engine/cloth-occlusion.js';
import { clothResponseSettings } from '../src/engine/sky-cloth.js';
import { SKY_CLOTH_APPEARANCE as SKY_CLOTH_DEFAULTS } from '../src/settings/sky-cloth.js';
import { geometryAsset } from '../src/load-manifest.js';

const metadata = JSON.parse(readFileSync(new URL('../src/assets/burning-man/cloth-sky-visibility.json', import.meta.url)));
const raw = gunzipSync(readFileSync(new URL('../src/' + metadata.path, import.meta.url)));
assert.equal(createHash('sha256').update(raw).digest('hex'), metadata.decodedSHA256);
const copied = Uint8Array.from(raw).buffer;
const values = new Float32Array(copied);
validateClothOcclusion(metadata, values, geometryAsset.decodedSha256);
assert.ok(values.some((v) => v < 0.2), 'Sheltered parts receive less sky');
assert.ok(values.some((v) => v > 0.95), 'Exposed parts retain open sky');
assert.throws(() => validateClothOcclusion(metadata, values, 'wrong-geometry'), /do not match/);
assert.throws(() => validateClothOcclusion({ ...metadata, vertices: 1 }, values, geometryAsset.decodedSha256), /do not match/);
assert.deepEqual(clothResponseSettings(SKY_CLOTH_DEFAULTS, 'stars'),
  { gain: SKY_CLOTH_DEFAULTS.clothLight, shadowDepth: 0, whiteness: 0, nightUnchanged: true });
for (const atmosphere of ['sunrise', 'peach-dusk', 'sunset']) {
  const response = clothResponseSettings(SKY_CLOTH_DEFAULTS, atmosphere);
  assert.equal(response.shadowDepth, SKY_CLOTH_DEFAULTS.shadowDepth);
  assert.equal(response.whiteness, atmosphere === 'sunset' ? SKY_CLOTH_DEFAULTS.clothWhiteness : 0);
}
console.log(JSON.stringify({ passed: true, vertices: values.length, triangleOccluders: metadata.triangles,
  rays: metadata.skyRaysPerVertex, checks: ['occlusion hash and geometry match', 'sheltered and exposed samples',
    'night response preserved', 'Sunset-only cloth whitening'] }));
