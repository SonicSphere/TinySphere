// Sony α7 IV full-frame sensor reference (35.9 × 23.9 mm):
// https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000660153.html
const sensorDiagonalMm = Math.hypot(35.9, 23.9);

// Match diagonal angle of view so arbitrary browser aspect ratios have an
// explicit full-frame equivalent. This is a readout, not a projection change.
export function sonyA7EquivalentMm(verticalFovDegrees, aspect) {
  const diagonalTan = Math.hypot(aspect, 1) * Math.tan(verticalFovDegrees * Math.PI / 360);
  return sensorDiagonalMm / (2 * diagonalTan);
}
