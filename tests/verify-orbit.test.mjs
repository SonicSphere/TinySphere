import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from '../src/vendor/three.module.js';

const moduleURL = process.argv[2]
  ? pathToFileURL(process.argv[2]).href
  : new URL('../src/camera/orbit.js', import.meta.url).href;
const {
  orbitPose,
  zoomCameraDistance,
  MAX_CAMERA_DISTANCE,
  DOLLY_ZOOM_START_DISTANCE,
  advanceOrbit,
} = await import(moduleURL);
const center = [6.63, 6.63, 7.0755458997844];
const near = (a, b, label, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);
const cameraFor = (pose) => {
  const camera = new THREE.PerspectiveCamera(pose.fov, 1.8, pose.near, 100000);
  camera.up.fromArray(pose.up);
  camera.position.fromArray(pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  return camera;
};
let poses = 0;
for (const aspect of [0.45, 1, 1.8, 2.8])
  for (const elevation of [-Math.PI / 2, -1.3, -0.6, 0, 0.6, 1.35, Math.PI / 2])
    for (const azimuth of [-7, -0.9, 0, Math.PI, 8]) {
      let previousFreedom = 1;
      for (const distance of [
        0, 0.001, 1, 3, 5, 6.7, 7, 10, 13.999999, 14, 18, 30, 65, 75, 80, 150, 300, 750, 1499.99,
        1500,
      ]) {
        const pose = orbitPose(center, { distance, elevation, azimuth }, aspect);
        assert.equal(
          pose.projection,
          'perspective',
          'All camera distances must use a natural perspective lens',
        );
        assert.equal(pose.fisheye, 0, 'No fisheye image warp');
        assert.ok(pose.position[2] >= 0.35 - 1e-10, 'Eye remains above the playa');
        assert.ok(
          pose.angularFreedom <= previousFreedom + 1e-10,
          'Pullback only confines the available angle',
        );
        previousFreedom = pose.angularFreedom;
        const camera = cameraFor(pose),
          direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        near(direction.z, -Math.sin(pose.elevation), 'Look elevation survives both exact poles');
        near(direction.x, -Math.cos(pose.elevation) * Math.cos(azimuth), 'Look azimuth is stable');
        near(direction.y, -Math.cos(pose.elevation) * Math.sin(azimuth), 'Look azimuth is stable');
        assert.ok(
          camera.matrixWorld.elements.every(Number.isFinite),
          'Camera matrix remains finite',
        );
        near(new THREE.Vector3(...pose.up).dot(direction), 0, 'Up vector stays perpendicular');
        if (pose.radius <= 6.7)
          near(
            pose.elevation,
            elevation,
            'Looking anywhere inside does not change eye height constraints',
          );
        if (distance === 0) {
          assert.deepEqual(pose.position, center);
          near(pose.diagonalFov, 100, 'Comfortable interior diagonal field of view');
        }
        if (distance === MAX_CAMERA_DISTANCE) {
          near(pose.elevation, 0, 'Full pullback is exactly level');
          near(
            pose.position[2],
            center[2],
            'Full pullback is horizontally aligned with the sphere',
          );
        }
        poses++;
      }
    }

// No threshold introduces a discontinuity in position, lens, or look direction.
let continuityChecks = 0;
for (const aspect of [0.45, 1, 1.8])
  for (const elevation of [-Math.PI / 2, -0.6, 0.1, Math.PI / 2])
    for (const radius of [0, 6.7, 14, 18, 75, 1500]) {
      const distance = radius / Math.max(1, 1.05 / aspect),
        epsilon = 1e-6;
      const a = orbitPose(
        center,
        { distance: Math.max(0, distance - epsilon), elevation, azimuth: -0.9 },
        aspect,
      );
      const b = orbitPose(
        center,
        { distance: distance + epsilon, elevation, azimuth: -0.9 },
        aspect,
      );
      assert.ok(
        Math.hypot(...a.position.map((v, i) => v - b.position[i])) < 1e-4,
        'No position step',
      );
      assert.ok(Math.abs(a.elevation - b.elevation) < 1e-5, 'No orientation step');
      assert.ok(Math.abs(a.fov - b.fov) < 1e-4, 'No lens step');
      continuityChecks++;
    }

// Check actual screen coordinates: the level dolly retains subject framing
// while objects behind it grow. Perspective also keeps straight lines straight.
let framingChecks = 0;
for (const aspect of [0.45, 1, 1.8]) {
  let reference,
    previousBackground = 0;
  for (const distance of [75, 150, 300, 750, 1500]) {
    const pose = orbitPose(center, { distance, elevation: 0, azimuth: 0 }, aspect);
    const camera = cameraFor(pose);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const landmark = new THREE.Vector3(center[0], center[1] + 5, center[2] + 5).project(camera);
    const behind = new THREE.Vector3(center[0] - 1000, center[1] + 5, center[2] + 5).project(
      camera,
    );
    reference ??= landmark;
    near(landmark.x, reference.x, 'Dolly horizontal framing');
    near(landmark.y, reference.y, 'Dolly vertical framing');
    assert.ok(Math.abs(behind.x) > previousBackground, 'Background compression survives');
    previousBackground = Math.abs(behind.x);
    framingChecks++;
  }
}
for (const elevation of [-Math.PI / 2, 0, Math.PI / 2]) {
  const camera = cameraFor(orbitPose(center, { distance: 0, elevation, azimuth: 0.8 }, 1.8));
  const a = new THREE.Vector3(-2, -1, -5),
    b = new THREE.Vector3(2, 1, -5),
    m = a.clone().lerp(b, 0.5);
  const projected = [a, m, b].map((p) => p.applyMatrix4(camera.matrixWorld).project(camera));
  near(
    (projected[1].x - projected[0].x) * (projected[2].y - projected[0].y) -
      (projected[1].y - projected[0].y) * (projected[2].x - projected[0].x),
    0,
    'Straight lines remain straight',
  );
}
near(zoomCameraDistance(0, Math.exp(0.1)), 1.4, 'Wheel immediately leaves the center');
near(zoomCameraDistance(14, Math.exp(-1)), 0, 'Wheel reaches the center');
for (const distance of [0, 1, 7, 14, 75, 750])
  near(
    zoomCameraDistance(zoomCameraDistance(distance, Math.exp(0.05)), Math.exp(-0.05)),
    distance,
    'Zoom remains reversible',
  );
near(advanceOrbit(1, 10), 0.86, 'Approved slow orbit is unchanged');
assert.equal(DOLLY_ZOOM_START_DISTANCE, 75);
let dragRebaseChecks = 0;
for (const distance of [18, 30, 75, 150, 300, 750, 1450, 1500])
  for (const elevation of [-Math.PI / 2, -0.6, -0.1, 0, 0.1, Math.PI / 2]) {
    const pose = orbitPose(center, { distance, elevation, azimuth: -0.9 }, 1.8);
    const rebased = orbitPose(
      center,
      { distance, elevation: pose.controlElevation, azimuth: -0.91 },
      1.8,
    );
    near(
      rebased.elevation,
      pose.elevation,
      'A horizontal drag must not jump the ground-constrained pitch',
    );
    dragRebaseChecks++;
  }
console.log(
  JSON.stringify({
    passed: true,
    poses,
    continuityChecks,
    framingChecks,
    dragRebaseChecks,
    inside: 'Full yaw and exact ±90° pitch',
    projection: 'Rectilinear perspective; 100° diagonal at center',
    pullback: 'Exactly level at 1500; dolly framing and immediate center reversal retained',
  }),
);
