import * as THREE from '../vendor/three.module.js';

export const PLAYA_MATERIAL = Object.freeze({
  revision: 'photo-guided-v2-seed19',
  size: 1024,
  patchMetres: 6,
  lookups: 2,
  bytesWithMipmaps: 5592404,
  generatedAtRuntime: false,
});

// Original RGBA bytes from the approved study, saved ahead of time. DataTexture
// avoids image alpha premultiplication and sRGB conversion of the packed normals.
export async function loadPhotoPlaya(renderer, loadBytes) {
  const packed = await loadBytes('assets/burning-man/playa-photo-v2.rgba.gz');
  const raw = await new Response(
    new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer();
  if (raw.byteLength !== 1024 * 1024 * 4) throw Error('The playa material has an invalid size.');
  const texture = new THREE.DataTexture(
    new Uint8Array(raw),
    1024,
    1024,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = 'Photo-guided playa / seed 19';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

const photoFunctions = `
float playaHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float playaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(playaHash(i),playaHash(i+vec2(1,0)),f.x),mix(playaHash(i+vec2(0,1)),playaHash(i+vec2(1,1)),f.x),f.y);}
`;
const oldSurface = `vec3 texel=texture2D(clay,position/1.5).rgb;
     float luminance=dot(texel,vec3(.2126,.7152,.0722));
     vec3 albedo=mix(vec3(luminance),texel,.10)*vec3(.83,.83,.84);
     albedo*=.90+.18*fbm(position*.045);`;
const photoSurface = `vec4 texel=texture2D(clay,position/6.);
     vec2 xy=texel.gb*2.-1.;
     vec3 groundNormal=normalize(vec3(xy,sqrt(max(.001,1.-dot(xy,xy)))));
     vec3 albedo=texel.r*vec3(1.045,1.,.935);
     vec2 dx=dFdx(position),dy=dFdy(position);
     float fade=1.-smoothstep(.004,.025,max(length(dx),length(dy)));
     float detail=texture2D(clay,position*1.783333+vec2(.17,.63)).a;
     albedo*=1.+(detail-.51)*1.6*fade;
     float determinant=dx.x*dy.y-dx.y*dy.x;
     float dhx=dFdx(detail),dhy=dFdy(detail);
     vec2 slope=vec2(dhx*dy.y-dhy*dx.y,dhy*dx.x-dhx*dy.x)/max(abs(determinant),1e-10)*sign(determinant);
     slope=clamp(slope,vec2(-85.),vec2(85.));
     groundNormal=normalize(vec3(groundNormal.xy-slope*.012*fade,groundNormal.z));
     albedo*=.92+.16*playaNoise(position*.045);`;

export function photoPlayaFragment(original) {
  const cosine = 'max(0.,delta.z)*range';
  if (!original.includes(oldSurface) || !original.includes(cosine))
    throw Error('The ground shader changed; review the playa integration.');
  return original
    .replace('void main(){', photoFunctions + '\nvoid main(){')
    .replace(oldSurface, photoSurface)
    .replace(cosine, 'max(0.,dot(groundNormal,delta))*range');
}
