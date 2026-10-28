import * as THREE from '../vendor/three.module.js';
import {fisheyeLensGLSL,lensModel} from './fisheye-lens.js';
import {prepareFisheyeMeshes} from './fisheye-mesh.js';

// One-pass vertex projection follows TouchDesigner Render TOP's documented
// technique. Large triangles are linearly refined; original surfaces stay fixed.
const vertexHeader=`
${fisheyeLensGLSL}
uniform float directStrength;
uniform float directAspect;
uniform float directNormalTan;
uniform vec2 directNearFar;
uniform mat4 directInverseProjection;
varying vec3 directViewPosition;
vec4 directProject(vec4 clip){
 vec4 h=directInverseProjection*clip;
 vec3 p=h.xyz/max(.00000001,h.w);
 directViewPosition=p;
 float d=max(.000001,length(p)),xy=length(p.xy);
 // atan(xy,-p.z) returned zero for a positive numerator / negative-zero
 // denominator on this GPU. Exact vertical views put an entire ring of
 // vertices on that plane, collapsing it to the optical axis. The normalized
 // cosine has a defined, continuous value at both signed zeros and both poles.
 float theta=acos(clamp(-p.z/d,-1.,1.)),diag=length(vec2(directAspect,1.));
 float r=fishRadius(theta,diag);
 if(directStrength<.99999){
   float upper=max(diag,r/max(.0001,directStrength));
   for(int i=0;i<8;i++){
     float t=r*directNormalTan;
     float value=mix(atan(t),fishAngle(r,diag),directStrength)-theta;
     float slope=mix(directNormalTan/(1.+t*t),fishSlope(r,diag),directStrength);
     r=clamp(r-value/max(.000001,slope),0.,upper);
   }
 }
 vec2 lens=(xy>.000001?p.xy/xy:vec2(0.))*r;
 vec2 ndc=vec2(lens.x/directAspect,lens.y);
 float n=directNearFar.x,f=directNearFar.y;
 float z=(f+n)/(f-n)-2.*f*n/((f-n)*d);
 return vec4(ndc*d,z*d,d);
}
`;
const fragmentHeader=`uniform float directStrength; uniform float directBackCos; varying vec3 directViewPosition;\n`;

export async function createFisheyeRenderer(renderer, scene, center) {
  const meshes = await prepareFisheyeMeshes(scene, center);
  const uniforms = {
    fishStereographic: {value: 1}, fishScale: {value:1}, directStrength: {value: 0}, directBackCos: {value:0},
    directAspect: {value: 1}, directNormalTan: {value: 1},
    directNearFar: {value: new THREE.Vector2(.05, 20000)},
    directInverseProjection: {value: new THREE.Matrix4()},
  };
  const objects = [], materials = new Set(), restored = [];
  scene.traverse(object => {
    if (!object.isMesh && !object.isPoints) return;
    objects.push({object, culled: object.frustumCulled});
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  const backdrop = objects.find(({object}) => object.name === 'PLAYA / analytic infinite ground and sky')?.object;
  if (!backdrop) throw Error('Missing fisheye analytic background');
  for (const material of materials) {
    const compile = material.onBeforeCompile, cache = material.customProgramCacheKey;
    const key = cache.call(material);
    material.onBeforeCompile = function(shader, activeRenderer) {
      compile.call(this, shader, activeRenderer);
      Object.assign(shader.uniforms, uniforms);
      if (material === backdrop.material) {
        shader.fragmentShader = fisheyeLensGLSL + '\nuniform float directStrength; uniform float directAspect; uniform float directNormalTan;\n' + shader.fragmentShader;
        const ray = 'vec3 d=normalize(mat3(cameraWorld)*viewRay.xyz);';
        if (!shader.fragmentShader.includes(ray)) throw Error('Fisheye background ray contract changed');
        shader.fragmentShader = shader.fragmentShader.replace(ray, `vec3 cameraRay=viewRay.xyz;
          if(directStrength>0.){
            vec2 p=vec2(screen.x*directAspect,screen.y);float r=length(p);
            float theta=mix(atan(r*directNormalTan),fishAngle(r,length(vec2(directAspect,1.))),directStrength);
            cameraRay=vec3(r>.000001?p/r*sin(theta):vec2(0.),-cos(theta));
          }
          vec3 d=normalize(mat3(cameraWorld)*cameraRay);`);
      } else {
        shader.vertexShader = vertexHeader + shader.vertexShader.replace(/void\s+main\s*\(\s*\)/, 'void originalProjectionMain()') + `
          void main(){originalProjectionMain();directViewPosition=vec3(0.,0.,-1.);
            if(directStrength>0.)gl_Position=directProject(gl_Position);}`;
        shader.fragmentShader = fragmentHeader + shader.fragmentShader.replace(/void\s+main\s*\(\s*\)/, 'void originalFragmentMain()') + `
          void main(){if(directStrength>0.&&-directViewPosition.z/max(.000001,length(directViewPosition))<directBackCos)discard;originalFragmentMain();}`;
      }
    };
    material.customProgramCacheKey = () => key + '|direct-stereographic-wide-fisheye-v1';
    material.needsUpdate = true;
    restored.push(() => {material.onBeforeCompile = compile;material.customProgramCacheKey = cache;material.needsUpdate = true;});
  }
  let latestDiagonal=180;
  return {
    render(camera, pose, prepareCamera) {
      const active = pose.fisheye > 0;
      meshes.apply(active);
      uniforms.directStrength.value = pose.fisheye;
      uniforms.fishScale.value=pose.lensScale??1;
      latestDiagonal=pose.diagonalFov;
      uniforms.directBackCos.value=pose.diagonalFov>180.000001?Math.cos(pose.diagonalFov*Math.PI/360):0;
      uniforms.directAspect.value = camera.aspect;
      uniforms.directNormalTan.value = Math.tan(camera.fov * Math.PI / 360);
      uniforms.directNearFar.value.set(.05, camera.far);
      uniforms.directInverseProjection.value.copy(camera.projectionMatrixInverse);
      for (const {object, culled} of objects) object.frustumCulled = active ? false : culled;
      prepareCamera(camera, renderer.domElement.height, renderer.getPixelRatio());
      renderer.render(scene, camera);
    },
    stats: () => ({lens: {...lensModel(),name:latestDiagonal>180.001?Math.round(latestDiagonal)+'° virtual fisheye':'12 mm fisheye reference',diagonalDegrees:latestDiagonal}, renderPasses: 1, refinement: meshes.stats()}),
    dispose() {for (const restore of restored) restore();for (const {object, culled} of objects) object.frustumCulled = culled;meshes.dispose();},
  };
}
