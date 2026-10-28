// Signed zoom positions belong only to input travel. Public camera distance
// stays nonnegative; lensFov records the center lens in saved views and recipes.
export const OPTICAL_TRAVEL_UNIT = 14;
export const MAX_DIAGONAL_DEGREES = 330;
const maxLogScale = Math.log(Math.tan(MAX_DIAGONAL_DEGREES*Math.PI/720));
const travelForLogScale = value => (value+Math.sqrt(value*value+4*value))/2;
export const MIN_ZOOM_POSITION = -OPTICAL_TRAVEL_UNIT*travelForLogScale(maxLogScale);

export function lensAtZoom(position) {
  const travel = Math.max(0,-Math.max(MIN_ZOOM_POSITION,position)/OPTICAL_TRAVEL_UNIT);
  // Zero slope at the physical/optical handoff avoids a sudden lens kick.
  const logScale = travel*travel/(1+travel);
  const scale = Math.exp(logScale);
  return {scale,diagonalDegrees:4*Math.atan(scale)*180/Math.PI};
}

export function zoomForLens(degrees) {
  const angle = Math.max(180,Math.min(MAX_DIAGONAL_DEGREES,degrees));
  const logScale = Math.max(0,Math.log(Math.tan(angle*Math.PI/720)));
  return -OPTICAL_TRAVEL_UNIT*travelForLogScale(logScale);
}

// Keep legacy distance-only APIs and links physical. Negative experimental
// links are accepted as an alias; production exports distance=0 and lensFov.
export function normalizeOpticalInput(input) {
  const next={...input};
  if(Object.hasOwn(next,'distance')&&Number.isFinite(Number(next.distance))){
    const distance=Number(next.distance);
    if(distance<0){next.distance=0;next.lensFov=lensAtZoom(distance).diagonalDegrees;}
    else if(distance>0||!Object.hasOwn(next,'lensFov'))next.lensFov=180;
  }else if(Number.isFinite(Number(next.lensFov))&&Number(next.lensFov)>180){
    next.distance=0;
  }
  return next;
}
export function gestureZoomPosition(state) {
  return state.distance>0?state.distance:zoomForLens(state.lensFov??180);
}
