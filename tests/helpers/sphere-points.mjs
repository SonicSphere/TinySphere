import { readFile } from 'node:fs/promises';
import { decodeGeometry } from '../../src/engine/geometry-codec.js';
import { geometryAsset } from '../../src/load-manifest.js';

export async function loadSpherePoints() {
  const read = path => readFile(new URL('../../src/' + path, import.meta.url));
  const metadata = JSON.parse(await read(geometryAsset.metadataPath));
  const binary = await decodeGeometry(await read(geometryAsset.path), geometryAsset);
  const points = new Float32Array(212 * 22 * 3);
  const center = metadata.light_show.sphere_center, radius = metadata.light_show.field_radius_metres;
  for (const part of metadata.parts.filter(part => part.category === 'sail')) {
    const positions = new Float32Array(binary, part.fixture_positions.offset, part.fixture_positions.count);
    const u = new Float32Array(binary, part.fixture_axes_u.offset, part.fixture_axes_u.count);
    const v = new Float32Array(binary, part.fixture_axes_v.offset, part.fixture_axes_v.count);
    for (let i = 0; i < part.fixture_ids.length; i++) for (let j = 0; j < 22; j++) for (let k = 0; k < 3; k++) {
      const angle = j * Math.PI * 2 / 21;
      points[(part.fixture_ids[i] * 22 + j) * 3 + k] =
        (positions[i * 3 + k] - center[k] + (j < 21 ? .34 * (u[i * 3 + k] * Math.cos(angle) + v[i * 3 + k] * Math.sin(angle)) : 0)) / radius;
    }
  }
  return points;
}
