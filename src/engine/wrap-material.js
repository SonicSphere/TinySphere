// Jeremy selected A / Matte white from BM-WrapStudy on 27 October 2026.
// This changes only the selected sleeve/shoulder pixels, using the existing
// grouped light field. Geometry, center halos and unselected cloth stay intact.
export const WRAP_MATERIAL = {
  id: 'matte-white-a-2026-10-27',
  option: 'a',
  name: 'Matte white',
  sleeves: 1230,
};

const reflectedWrap = `
uniform vec3 wrapLightPosition[16];
uniform vec3 wrapRadiance[16];
uniform float wrapDaylight;
varying float vWrapMask; varying vec3 vWrapPosition; varying vec3 vWrapNormal;
vec3 reflectedMatteWrap(){
  vec3 n=normalize(vWrapNormal),irradiance=vec3(0.);
  for(int i=0;i<16;i++){
    vec3 delta=wrapLightPosition[i]-vWrapPosition;
    float r2=dot(delta,delta),r=sqrt(max(r2,.000001));
    float diffuse=max(0.,dot(n,delta/r));
    float range=pow(clamp(1.-pow(r/38.,4.),0.,1.),2.);
    irradiance+=wrapRadiance[i]*diffuse*range/max(.16,r2);
  }
  vec3 reflected=irradiance*vec3(.91,.92,.90)/3.14159265359;
  float facing=abs(dot(n,normalize(vec3(-.7,.7,1.))));
  reflected+=vec3(.91,.92,.90)*wrapDaylight*(.52+.38*facing);
  return reflected;
}
`;

export function applyMatteWrapMaterial(material, lighting) {
  if (lighting?.position?.value?.length !== 16 || lighting?.radiance?.value?.length !== 16)
    throw Error('The wrap material needs the existing 16-light field.');
  if (
    !material.vertexShader.includes('void main(){') ||
    !material.fragmentShader.includes('#include <tonemapping_fragment>')
  )
    throw Error('Review the cloth shader before applying the selected wrap material.');
  material.vertexShader =
    'attribute float wrapMask; varying float vWrapMask; varying vec3 vWrapPosition; varying vec3 vWrapNormal;\n' +
    material.vertexShader.replace(
      'void main(){',
      'void main(){vWrapMask=wrapMask;vWrapPosition=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;vWrapNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);',
    );
  material.fragmentShader =
    reflectedWrap +
    material.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      'if(vWrapMask>0.)gl_FragColor.rgb=mix(gl_FragColor.rgb,reflectedMatteWrap(),vWrapMask);\n#include <tonemapping_fragment>',
    );
  Object.assign(material.uniforms, {
    wrapLightPosition: lighting.position,
    wrapRadiance: lighting.radiance,
    wrapDaylight: material.uniforms.daylight ?? { value: 0 },
  });
  material.needsUpdate = true;
}

export function validateWrapMask(mask, vertexCount) {
  if (mask.length !== vertexCount || !mask.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw Error('The wrap material does not match the sphere geometry.');
  return mask;
}
