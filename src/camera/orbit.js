export const ORBIT_RADIANS_PER_SECOND = 0.014;
export const CAMERA_FOV_DEGREES = 40;
// Start at half the old limit so the smallest sphere is twice as large on screen.
export const DOLLY_ZOOM_START_DISTANCE = 75;
export const MAX_CAMERA_DISTANCE = 1500;
export const FISHEYE_START_DISTANCE = 14;
export const FREE_LOOK_RADIUS = 6.7;
export const ORBIT_LOOK_RADIUS = 18;
export const INTERIOR_DIAGONAL_FOV = 100;

const smooth = (start, end, value) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// A soft knee keeps the eye above the floor without a sudden pitch stop.
function aboveGround(value, minimum) {
  const knee = Math.min(0.12, Math.max(1e-8, -minimum * 0.5)),
    delta = value - minimum;
  if (delta >= knee) return value;
  if (delta <= -knee) return minimum;
  return minimum + (delta + knee) ** 2 / (4 * knee);
}

function groundControl(value, minimum) {
  const knee = Math.min(0.12, Math.max(1e-8, -minimum * 0.5));
  return value >= minimum + knee
    ? value
    : minimum - knee + 2 * Math.sqrt(knee * Math.max(0, value - minimum));
}

// Keep the existing exponential zoom outside, then use finite travel inside.
// Zero is reachable and the very next outward wheel/pinch step leaves it.
export function zoomCameraDistance(distance, factor) {
  if (!Number.isFinite(factor) || factor <= 0) return distance;
  const start = FISHEYE_START_DISTANCE;
  const travel = distance >= start ? Math.log(distance / start) : distance / start - 1;
  const next = travel + Math.log(factor);
  return Math.max(
    0,
    Math.min(MAX_CAMERA_DISTANCE, next >= 0 ? start * Math.exp(next) : start * (next + 1)),
  );
}

export function advanceOrbit(azimuth, elapsedSeconds) {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  return azimuth - ORBIT_RADIANS_PER_SECOND * elapsed;
}

export function orbitPose(center, state, aspect) {
  const radius = state.distance * Math.max(1, 1.05 / aspect);
  const inward = 1 - smooth(0, FISHEYE_START_DISTANCE, radius);
  // A rectilinear lens preserves straight lines and the shape of the sky.
  // Cap its diagonal rather than letting portrait or ultrawide frames stretch.
  const interiorTan = Math.tan((INTERIOR_DIAGONAL_FOV * Math.PI) / 360) / Math.hypot(aspect, 1);
  const normalTan = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  // Beyond the wide framing limit, hold the target plane's framing while
  // retreating. The same aspect correction applies to both endpoint distances.
  const lensZoom = Math.max(1, state.distance / DOLLY_ZOOM_START_DISTANCE);
  const fov =
    (2 * Math.atan((normalTan + (interiorTan - normalTan) * inward) / lensZoom) * 180) / Math.PI;
  // Confinement follows the logarithmic travel of the wheel/pinch. Both ends
  // have zero slope, and maximum pullback is exactly level at any aspect ratio.
  const progress =
    Math.log(Math.max(DOLLY_ZOOM_START_DISTANCE, state.distance) / DOLLY_ZOOM_START_DISTANCE) /
    Math.log(MAX_CAMERA_DISTANCE / DOLLY_ZOOM_START_DISTANCE);
  const angularFreedom = 1 - smooth(0, 1, progress);
  const trackBlend = smooth(0, ORBIT_LOOK_RADIUS, radius);
  const wantedTrack = state.elevation * angularFreedom * trackBlend;
  const groundRatio = radius > 0 ? (0.35 - center[2]) / radius : -Infinity;
  const minimum = groundRatio > -1 && groundRatio < 1 ? Math.asin(groundRatio) : null;
  const trackElevation = minimum === null ? wantedTrack : aboveGround(wantedTrack, minimum);
  const lookBlend = smooth(FREE_LOOK_RADIUS, ORBIT_LOOK_RADIUS, radius);
  // Looking up inside rotates the view independently of the eye's height.
  const elevation = state.elevation * (1 - lookBlend) + trackElevation * lookBlend;
  const azimuth = state.azimuth;
  const horizontalRadius = radius * Math.cos(trackElevation);
  const position = [
    center[0] + horizontalRadius * Math.cos(azimuth),
    center[1] + horizontalRadius * Math.sin(azimuth),
    center[2] + radius * Math.sin(trackElevation),
  ];
  const target =
    lookBlend === 1
      ? [...center]
      : [
          position[0] - Math.cos(elevation) * Math.cos(azimuth) * Math.max(1, radius),
          position[1] - Math.cos(elevation) * Math.sin(azimuth) * Math.max(1, radius),
          position[2] - Math.sin(elevation) * Math.max(1, radius),
        ];
  // This analytic up vector remains perpendicular at both exact poles. World
  // up plus lookAt alone loses the yaw reference when looking straight up/down.
  const up = [
    -Math.sin(elevation) * Math.cos(azimuth),
    -Math.sin(elevation) * Math.sin(azimuth),
    Math.cos(elevation),
  ];
  return {
    position,
    target,
    up,
    radius,
    // The complete installation fits within 11 m of the target. Keep a metre
    // of clearance while retaining millimetre depth precision during dolly zoom.
    near: Math.max(0.08, radius - 12),
    fov,
    lensZoom,
    dollyZoom: lensZoom > 1,
    fisheye: 0,
    projection: 'perspective',
    diagonalFov:
      (2 * Math.atan(Math.hypot(aspect, 1) * Math.tan((fov * Math.PI) / 360)) * 180) / Math.PI,
    elevation,
    trackElevation,
    angularFreedom,
    freeLook: lookBlend < 1,
    controlElevation:
      lookBlend < 1
        ? state.elevation
        : angularFreedom > 1e-8
          ? (minimum === null ? trackElevation : groundControl(trackElevation, minimum)) /
            angularFreedom
          : 0,
    azimuth,
  };
}
