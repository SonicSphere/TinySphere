import assert from 'node:assert/strict';
import { bindCameraGestures } from '../src/camera/gestures.js';
import { DOLLY_ZOOM_START_DISTANCE, MAX_CAMERA_DISTANCE, orbitPose } from '../src/camera/orbit.js';

class Canvas extends EventTarget {
  clientHeight = 800;
  captured = new Set();
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
    this.fire('lostpointercapture', { pointerId: id });
  }
  fire(type, values = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerType: 'touch', button: 0, ...values });
    this.dispatchEvent(event);
    return event;
  }
}
const canvas = new Canvas();
let state = { distance: 42, azimuth: -0.9, elevation: -0.1, orbit: true, playing: true };
const updates = [];
const unbind = bindCameraGestures(canvas, {
  getState: () => ({ ...state }),
  setState: (update) => {
    updates.push(update);
    Object.assign(state, update);
    state.distance = Math.max(0, Math.min(MAX_CAMERA_DISTANCE, state.distance));
  },
});
const touch = (type, pointerId, x, y) => canvas.fire(type, { pointerId, clientX: x, clientY: y });
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

canvas.fire('pointerdown', { pointerId: 90, pointerType: 'mouse', button: 2 });
assert.equal(canvas.captured.size, 0, 'Right mouse button cannot start a drag');
assert.equal(updates.length, 0);
assert.equal(touch('pointerdown', 1, 100, 100).defaultPrevented, true);
assert.equal(state.orbit, true, 'Touching the sphere preserves slow orbit');
assert.ok(canvas.captured.has(1));
touch('pointermove', 1, 120, 110);
near(state.azimuth, -1);
near(state.elevation, -0.06);
const orbit = { azimuth: state.azimuth, elevation: state.elevation };
touch('pointerdown', 2, 220, 110);
touch('pointermove', 2, 320, 110);
near(state.distance, 21);
assert.equal(state.azimuth, orbit.azimuth, 'A pinch cannot rotate the camera');
assert.equal(state.elevation, orbit.elevation);
touch('pointermove', 2, 220, 110);
near(state.distance, 42);

const count = updates.length;
touch('pointerdown', 3, 500, 500);
touch('pointermove', 3, 600, 600);
touch('pointercancel', 3, 600, 600);
assert.equal(updates.length, count, 'Third or untracked pointers cannot change the gesture');
assert.equal(canvas.captured.has(3), false);
touch('pointermove', 2, 1000, 110);
assert.equal(state.distance, 0, 'Pinch continues inside the old limit to the center');
touch('pointermove', 2, 560, 110);
near(state.distance, 14 * Math.log(2));
touch('pointermove', 2, 121, 110);
assert.equal(state.distance, MAX_CAMERA_DISTANCE);
touch('pointermove', 2, 122, 110);
near(state.distance, MAX_CAMERA_DISTANCE / 2);
const beforeCoincidence = state.distance;
touch('pointermove', 2, 120, 110);
assert.equal(
  state.distance,
  beforeCoincidence,
  'Coincident fingers cannot create infinite distance',
);
touch('pointermove', 2, 220, 110);
assert.equal(
  state.distance,
  beforeCoincidence,
  'Fingers separating from coincidence rebase safely',
);

touch('pointerup', 2, 220, 110);
assert.equal(canvas.captured.has(2), false);
touch('pointermove', 1, 120, 110);
assert.equal(state.azimuth, orbit.azimuth, 'Two-to-one transition has no jump');
touch('pointermove', 1, 130, 120);
const turnScale = Math.min(1, DOLLY_ZOOM_START_DISTANCE / state.distance);
near(state.azimuth, orbit.azimuth - 0.05 * turnScale);
near(state.elevation, orbit.elevation + 0.04 * turnScale);
touch('pointercancel', 1, 130, 120);
assert.equal(canvas.captured.size, 0);
const cancelled = { ...state };
touch('pointermove', 1, 200, 200);
assert.deepEqual(state, cancelled, 'Cancelled pointer cannot keep moving the camera');

touch('pointerdown', 4, 100, 100);
canvas.releasePointerCapture(4);
touch('pointermove', 4, 130, 130);
assert.deepEqual(state, cancelled, 'Lost capture cancels a drag');
const beforeWheel = state.distance;
assert.equal(canvas.fire('wheel', { deltaY: -100 }).defaultPrevented, true);
near(state.distance, beforeWheel * Math.exp(-0.1));
state.distance = DOLLY_ZOOM_START_DISTANCE;
canvas.fire('wheel', { deltaY: Math.log(2) * 1000 });
near(state.distance, DOLLY_ZOOM_START_DISTANCE * 2);
const dolly = orbitPose([0, 0, 7], state, 1.8);
assert.ok(dolly.fov < 40 && dolly.dollyZoom, 'Wheel beyond the former limit narrows the lens');
canvas.fire('wheel', { deltaY: -Math.log(2) * 1000 });
near(state.distance, DOLLY_ZOOM_START_DISTANCE);
near(orbitPose([0, 0, 7], state, 1.8).fov, 40);
canvas.fire('wheel', { deltaY: Number.MAX_VALUE });
assert.equal(
  state.distance,
  MAX_CAMERA_DISTANCE,
  'Large finite wheel deltas reach the bounded maximum',
);
canvas.fire('wheel', { deltaY: -100 });
near(state.distance, MAX_CAMERA_DISTANCE * Math.exp(-0.1));
for (const [deltaMode, deltaY] of [
  [0, 48],
  [1, 3],
  [2, 0.06],
]) {
  state.distance = 150;
  canvas.fire('wheel', { deltaMode, deltaY });
  near(state.distance, 150 * Math.exp(0.048));
}
const beforeInvalid = { ...state };
canvas.fire('wheel', { deltaY: NaN });
canvas.fire('wheel', { deltaY: Infinity });
assert.deepEqual(state, beforeInvalid, 'Invalid wheel events do not change the camera');
for (const distance of [0, 7, 30, DOLLY_ZOOM_START_DISTANCE, 150, MAX_CAMERA_DISTANCE]) {
  for (const pointerType of ['mouse', 'touch']) {
    state.distance = distance;
    const before = { ...state };
    const sensitivity = Math.min(1, DOLLY_ZOOM_START_DISTANCE / distance);
    canvas.fire('pointerdown', { pointerId: 10, pointerType, clientX: 100, clientY: 100 });
    canvas.fire('pointermove', { pointerId: 10, pointerType, clientX: 120, clientY: 110 });
    canvas.fire('pointerup', { pointerId: 10, pointerType, clientX: 120, clientY: 110 });
    near(state.azimuth - before.azimuth, -0.1 * sensitivity);
    near(state.elevation - before.elevation, 0.04 * sensitivity);
    const lens = orbitPose([0, 0, 7], state, 1.8).lensZoom;
    near((state.azimuth - before.azimuth) * lens, -0.1);
    assert.equal(state.orbit, before.orbit, 'Fine dolly dragging preserves automatic orbit');
  }
}
state.distance = 14;
canvas.fire('wheel', { deltaY: -1000 });
assert.equal(state.distance, 0, 'One finite inward travel reaches the exact center');
canvas.fire('wheel', { deltaY: -1000 });
assert.equal(state.distance, 0, 'Inward overscroll stays at the center');
canvas.fire('wheel', { deltaY: 100 });
near(state.distance, 1.4);
canvas.fire('wheel', { deltaY: 900 });
near(state.distance, 14);
touch('pointerdown', 20, 100, 100);
touch('pointerdown', 21, 200, 100);
touch('pointermove', 21, 1000, 100);
assert.equal(state.distance, 0, 'Pinch can reach the exact center');
touch('pointermove', 21, 900, 100);
assert.ok(state.distance > 0, 'Pinch reverses immediately after reaching center');
touch('pointerup', 21, 900, 100);
touch('pointerup', 20, 100, 100);
assert.equal(canvas.fire('keydown', { code: 'Space' }).defaultPrevented, true);
assert.equal(state.playing, false);
canvas.fire('keydown', { code: 'Space' });
assert.equal(state.playing, true);
const beforeArrow = state.azimuth;
canvas.fire('keydown', { key: 'ArrowLeft' });
near(state.azimuth, beforeArrow + 0.08);
canvas.fire('keydown', { key: 'ArrowRight' });
near(state.azimuth, beforeArrow);

assert.equal(state.orbit, true, 'Drag, pinch, wheel and keyboard preserve slow orbit');
state.orbit = false;
canvas.fire('wheel', { deltaY: 1 });
canvas.fire('keydown', { key: 'ArrowLeft' });
assert.equal(state.orbit, false, 'Manual camera changes also preserve orbit off');
for (const enabled of [false, true]) {
  state.orbit = enabled;
  const before = updates.length;
  touch('pointerdown', 7, 100, 100);
  touch('pointerup', 7, 100, 100);
  touch('pointerdown', 7, 100, 100);
  touch('pointermove', 7, 120, 110);
  touch('pointerdown', 8, 220, 110);
  touch('pointermove', 8, 280, 110);
  touch('pointerup', 8, 280, 110);
  touch('pointermove', 7, 125, 115);
  touch('pointercancel', 7, 125, 115);
  canvas.fire('wheel', { deltaY: 1 });
  canvas.fire('keydown', { key: 'ArrowLeft' });
  canvas.fire('keydown', { code: 'Space' });
  assert.equal(
    state.orbit,
    enabled,
    'Tap, drag, pinch, cancellation and keyboard preserve either orbit setting',
  );
  assert.ok(
    updates.slice(before).every((update) => !Object.hasOwn(update, 'orbit')),
    'Camera gestures must never write the automatic-orbit preference',
  );
}
touch('pointerdown', 5, 100, 100);
unbind();
assert.equal(canvas.captured.size, 0, 'Cleanup releases pointer captures');
const disposed = { ...state };
touch('pointerdown', 6, 100, 100);
touch('pointermove', 6, 300, 300);
canvas.fire('wheel', { deltaY: 100 });
canvas.fire('keydown', { code: 'Space' });
assert.deepEqual(state, disposed, 'Cleanup removes every input listener');
console.log(
  JSON.stringify({
    passed: true,
    cases: [
      'single-finger orbit',
      'pinch both ways',
      'zoom limit reversal',
      'wheel and pinch reach and leave exact center',
      'center drag both axes',
      'coincident fingers',
      'third pointer',
      'two-to-one transition',
      'pointer cancellation',
      'lost capture',
      'nonprimary mouse',
      'wheel',
      'wheel dolly zoom and reversal',
      'maximum reversal',
      'pixel-line-page wheel normalization',
      'invalid wheel deltas',
      'lens-matched mouse and touch drag sensitivity',
      'keyboard',
      'orbit on and off preserved by every gesture',
      'cleanup',
    ],
  }),
);
