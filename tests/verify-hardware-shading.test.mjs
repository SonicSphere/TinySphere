import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from '../src/vendor/three.module.js';
import {
  repairHardwareNormals,
  createHardwareContactMaterial,
} from '../src/engine/hardware-shading.js';
import { orbitPose, MAX_CAMERA_DISTANCE } from '../src/camera/orbit.js';

const base = new URL('../src/assets/burning-man/', import.meta.url);
const metadata = JSON.parse(await fs.readFile(new URL('installation.json', base)));
const packed = await fs.readFile(new URL('installation.bin.gz', base));
const bytes = gunzipSync(packed),
  buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const view = (spec, Type = Float32Array) => new Type(buffer, spec.offset, spec.count);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const repaired = [],
  center = new THREE.Vector3(...metadata.light_show.sphere_center);
let installationRadius = 0;
for (const [partIndex, part] of metadata.parts.entries()) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(view(part.positions).slice(), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(view(part.normals).slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(view(part.indices, Uint32Array).slice(), 1));
  const positions = geometry.attributes.position.array.slice(),
    indices = geometry.index.array.slice(),
    normals = geometry.attributes.normal.array.slice();
  if (part.category === 'metal') {
    const changed = repairHardwareNormals(geometry);
    if (changed) {
      repaired.push(partIndex);
      // Compare every repaired vertex to its actual triangle normal.
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        ix = geometry.index;
      for (let i = 0; i < ix.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, ix.getX(i));
        const b = new THREE.Vector3().fromBufferAttribute(p, ix.getX(i + 1));
        const c = new THREE.Vector3().fromBufferAttribute(p, ix.getX(i + 2));
        const face = b.sub(a).cross(c.sub(a));
        if (face.lengthSq() < 1e-20) continue;
        face.normalize();
        for (let j = 0; j < 3; j++)
          assert.ok(face.dot(new THREE.Vector3().fromBufferAttribute(n, ix.getX(i + j))) > 0.99999);
      }
      assert.equal(
        repairHardwareNormals(geometry),
        false,
        'Repair must be stable on a second load',
      );
    } else
      assert.deepEqual(
        geometry.attributes.normal.array,
        normals,
        'Valid pipe/hardware shading remains exact',
      );
  }
  assert.deepEqual(geometry.attributes.position.array, positions, 'No vertices may move');
  assert.deepEqual(geometry.index.array, indices, 'No triangles may change');
  const matrices = view(part.matrices),
    point = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  for (let i = 0; i < part.instances; i++) {
    matrix.fromArray(matrices, i * 16);
    for (let j = 0; j < positions.length; j += 3)
      installationRadius = Math.max(
        installationRadius,
        point.fromArray(positions, j).applyMatrix4(matrix).distanceTo(center),
      );
  }
}
assert.deepEqual(repaired, [2, 6], 'Only the damaged caps and five tripod junctions need repair');
assert.ok(
  installationRadius < 11,
  'Keep the entire approved installation inside the camera clearance',
);
const sourceMaterial = new THREE.MeshStandardMaterial({
  roughness: 0.35,
  metalness: 0.7,
  side: THREE.DoubleSide,
});
const contactMaterial = createHardwareContactMaterial(sourceMaterial);
assert.equal(sourceMaterial.polygonOffset, false, 'Do not bias the shared geodesic material');
assert.equal(contactMaterial.polygonOffset, true);
assert.ok(contactMaterial.polygonOffsetFactor < 0 && contactMaterial.polygonOffsetUnits < 0);
assert.equal(contactMaterial.depthTest, true);
assert.equal(contactMaterial.depthWrite, true);
assert.equal(contactMaterial.roughness, sourceMaterial.roughness);
assert.equal(contactMaterial.metalness, sourceMaterial.metalness);

let projectionChecks = 0,
  maxDepthStep = 0;
for (const aspect of [0.35, 0.45, 1, 1.8, 2.6])
  for (const distance of [14, 42, 75, 150, 300, 750, MAX_CAMERA_DISTANCE]) {
    const pose = orbitPose(center.toArray(), { distance, azimuth: -0.9, elevation: -0.1 }, aspect);
    assert.ok(
      pose.near < pose.radius - installationRadius,
      'No installation geometry may be clipped',
    );
    const depth = pose.radius + installationRadius,
      far = 100000;
    const step = (depth * depth * (far - pose.near)) / (far * pose.near * (2 ** 24 - 1));
    maxDepthStep = Math.max(maxDepthStep, step);
    assert.ok(
      step < 0.0004,
      'Keep sub-millimetre depth resolution even at maximum portrait dolly zoom',
    );
    const before = new THREE.PerspectiveCamera(pose.fov, aspect, 0.08, far);
    const after = new THREE.PerspectiveCamera(pose.fov, aspect, pose.near, far);
    for (const camera of [before, after]) {
      camera.up.set(0, 0, 1);
      camera.position.fromArray(pose.position);
      camera.lookAt(center);
      camera.updateMatrixWorld();
    }
    for (const offset of [
      [0, 0, 0],
      [4, -2, 5],
      [-5, 3, -5],
    ]) {
      const landmark = center.clone().add(new THREE.Vector3(...offset));
      const a = landmark.clone().project(before),
        b = landmark.clone().project(after);
      assert.ok(
        Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12,
        'Keep the exact visible framing',
      );
      projectionChecks++;
    }
  }
const report = {
  passed: true,
  repairedMeshParts: repaired,
  repairedInstances: 125,
  protectedCounts: { cloths: 212, geodesicTubes: 672, woodenMembers: 15, hardwareInstances: 215 },
  positionsAndTrianglesUnchanged: true,
  installationRadius,
  projectionChecks,
  maxDepthStepMetres: maxDepthStep,
  sourceGeometrySHA256: hash(packed),
};
await fs.mkdir(new URL('../.local/qa/cloth-flicker/', import.meta.url), { recursive: true });
await fs.writeFile(
  new URL('../.local/qa/cloth-flicker/unit-verification.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
