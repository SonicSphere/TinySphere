import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SHOWS } from '../src/shows/index.js';
import { THEMES } from '../src/themes/index.js';
import { decodeGeometry } from '../src/engine/geometry-codec.js';
import { geometryAsset, terrainAsset, musicAsset } from '../src/load-manifest.js';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root));
const manifest = JSON.parse(await read('source-assets.json'));
for (const file of manifest.files) {
  const data = await read(`dist/${file.path}`);
  assert.equal(data.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.path);
  assert.ok(data.length < 100 * 1024 ** 2, `${file.path} exceeds GitHub's individual file limit`);
  if (file.path.endsWith('.js') && !file.path.startsWith('vendor/')) {
    // Each relative module entry, including Worker/Worklet URLs, must resolve.
    for (const match of data.toString().matchAll(/['"]([^'"\s]+\.js)(?:\?[^'"]*)?['"]/g)) {
      const url = new URL(match[1], new URL(`dist/${file.path}`, root));
      await stat(url);
    }
  }
}
for (const asset of [geometryAsset, terrainAsset]) {
  const decoded = await decodeGeometry(await read(`dist/${asset.path}`), asset);
  assert.equal(
    createHash('sha256').update(Buffer.from(decoded)).digest('hex'),
    asset.decodedSha256,
  );
}
const model = JSON.parse(await read(`dist/${geometryAsset.metadataPath}`));
assert.equal(model.render_geometry.clothTriangles, 122904);
assert.equal(model.render_geometry.preset, 'aggressive');
assert.equal(musicAsset.bytes, 11412644);
assert.equal(model.parts.find((part) => part.batched_cloth).fixture_ids.length, 212);
assert.ok(
  manifest.files.every((file) => !/\.openai|\.env|qa\/|nashville|playa-color/.test(file.path)),
);
for (const folder of ['shows', 'themes']) {
  for (const file of await readdir(new URL(`src/${folder}/`, root))) {
    if (file.endsWith('.js')) await stat(new URL(`dist/${folder}/${file}`, root));
  }
}
console.log(
  JSON.stringify({
    passed: true,
    build: manifest.revision,
    files: manifest.files.length,
    shows: Object.keys(SHOWS).length,
    themes: Object.keys(THEMES).length,
  }),
);
