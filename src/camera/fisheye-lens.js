// Samyang/Rokinon 12 mm reference: ideal stereographic shape normalized to
// its advertised 180-degree full-frame diagonal. This is not an optical
// calibration or a literal 36 x 24 mm sensor crop on every viewport aspect.
export const DEFAULT_FISHEYE_LENS = 'stereographic12';
export function lensModel(id = DEFAULT_FISHEYE_LENS) {
  if (id === 'stereographic12') return {id, name:'12 mm fisheye reference', projection:'stereographic', diagonalDegrees:180, stereographic:1, calibrated:false};
  if (id === 'equidistant') return {id, name:'Previous angle-based lens', projection:'equidistant', diagonalDegrees:180, stereographic:0, calibrated:false};
  throw Error('Unknown fisheye lens: '+id);
}

// Shared by direct mesh projection, analytic backdrop, and cube resampling.
// Radius is in screen-height units; the screen corner has radius diagonal.
export const fisheyeLensGLSL = `
uniform float fishStereographic;
uniform float fishScale;
float fishAngle(float radius,float diagonal){
 float q=radius/diagonal*fishScale;
 return mix(q*1.570796326794897,2.*atan(q),fishStereographic);
}
float fishSlope(float radius,float diagonal){
 float q=radius/diagonal*fishScale;
 return mix(1.570796326794897,2./(1.+q*q),fishStereographic)*fishScale/diagonal;
}
float fishRadius(float theta,float diagonal){
 return diagonal/fishScale*mix(theta/1.570796326794897,tan(min(theta,3.141592-0.0001)*.5),fishStereographic);
}
`;
