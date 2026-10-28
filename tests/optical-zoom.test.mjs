import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';

const cameraRoot=fileURLToPath(new URL('../src/camera',import.meta.url));
if(!cameraRoot)throw Error('Pass the absolute camera source folder');
const optical=await import(pathToFileURL(cameraRoot+'/optical-zoom.js'));
const {orbitPose,zoomCameraDistance}=await import(pathToFileURL(cameraRoot+'/orbit.js'));
const {zoomForLens,lensAtZoom,normalizeOpticalInput,gestureZoomPosition,MIN_ZOOM_POSITION}=optical;
const near=(a,b,label,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} vs ${b}`);
const center=[6.63,6.63,7.0755458997844];let poses=0;
for(const fov of [180,200,220,250,270,300,315,330]){
 const normalized=normalizeOpticalInput({distance:zoomForLens(fov)});
 assert.ok(normalized.distance>=0,'Saved/public distance stays physical');
 near(normalized.distance,0,'Eye reaches center');near(normalized.lensFov,fov,'Negative experimental links remain compatible');
 const state={distance:0,lensFov:fov,elevation:-.45,azimuth:-.9,orbit:true};
 near(gestureZoomPosition(state),zoomForLens(fov),'Input travel is reconstructed');
 for(const aspect of [.45,1,1.8,2.8])for(const elevation of [-Math.PI/2,-.45,0,.45,Math.PI/2]){
  const pose=orbitPose(center,{...state,elevation},aspect);
  assert.deepEqual(pose.position,center);near(pose.diagonalFov,fov,'Selected diagonal coverage');
  assert.ok(pose.up.every(Number.isFinite));poses++;
 }
 const original=gestureZoomPosition(state),out=zoomCameraDistance(original,Math.exp(.01));
 near(zoomCameraDistance(out,Math.exp(-.01)),original,'Optical input reverses');
 const after=normalizeOpticalInput({distance:out});assert.ok(after.distance>=0);
}
for(const input of [{distance:0},{distance:32},{distance:1500,lensFov:330}])assert.equal(normalizeOpticalInput(input).lensFov,180,'Explicit physical distance/reset restores the base lens');
assert.deepEqual(normalizeOpticalInput({lensFov:330}),{distance:0,lensFov:330},'Agent API can perform the same widening');
assert.deepEqual(normalizeOpticalInput({palette:'cherry'}),{palette:'cherry'},'Appearance updates leave the lens alone');
assert.ok(zoomCameraDistance(MIN_ZOOM_POSITION,Math.exp(.01))>MIN_ZOOM_POSITION,'Immediate reversal at 330');
near(lensAtZoom(zoomCameraDistance(MIN_ZOOM_POSITION,Math.exp(-1))).diagonalDegrees,330,'Hard maximum');
for(const distance of [0,1,6,14,75,1500]){
 const before=orbitPose(center,{distance,elevation:.1,azimuth:0},1.8),after=orbitPose(center,{distance,lensFov:180,elevation:.1,azimuth:0},1.8);
 assert.deepEqual(before,after,'Legacy states retain their lens and camera');
}
console.log(JSON.stringify({passed:true,poses,range:[180,330],publicDistanceNonnegative:true,legacyLinks:true,savedLensAndReset:true}));
