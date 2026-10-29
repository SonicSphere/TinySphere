import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { initializeRecoveredShows } from '../../src/shows/recovered/index.js';

const base = new URL('../../src/assets/recovered-bm/', import.meta.url);
export async function loadRecoveredTestData() {
  const nodes = JSON.parse(await readFile(new URL('nodes.json', base)));
  const meta = JSON.parse(await readFile(new URL('point-image.json', base)));
  const image = { ...meta, data: new Uint8Array(gunzipSync(await readFile(new URL('point.rgb.gz', base)))) };
  initializeRecoveredShows(nodes, image);
  return { nodes, image };
}
