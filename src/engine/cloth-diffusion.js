// A smooth transmission approximation for the tube-lit spandex. Angular color
// fields mix increasingly with surface distance from the 52 mm tube radius.
// Geometry and exposed LED rendering retain their original direct light field.
export const DIFFUSION_SIGMAS=Object.freeze([1.6,2.8,4.2,7]);
const DIRECTIONS=21,WIDTH=22,LEVELS=DIFFUSION_SIGMAS.length;
const wrap=x=>((x%DIRECTIONS)+DIRECTIONS)%DIRECTIONS;
export function circularKernel(sigma){
  const weights=Array.from({length:DIRECTIONS},(_,i)=>Math.exp(-.5*(Math.min(i,DIRECTIONS-i)/sigma)**2));
  const sum=weights.reduce((a,b)=>a+b,0);return weights.map(x=>x/sum);
}
const kernels=DIFFUSION_SIGMAS.map(circularKernel);
const neighbors=Array.from({length:DIRECTIONS},(_,i)=>Array.from({length:DIRECTIONS},(_,k)=>wrap(i+k)));
export function blurClothField(source,fixtures,target=new Float32Array(source.length*LEVELS)){
  if(source.length!==fixtures*WIDTH*4||target.length!==source.length*LEVELS)throw Error('Incomplete cloth diffusion field.');
  for(let level=0;level<LEVELS;level++)for(let fixture=0;fixture<fixtures;fixture++){
    const kernel=kernels[level],row=(level*fixtures+fixture)*WIDTH*4,sourceRow=fixture*WIDTH*4;
    for(let angle=0;angle<DIRECTIONS;angle++){
      let r=0,g=0,b=0;
      for(let k=0;k<DIRECTIONS;k++){
        const from=sourceRow+neighbors[angle][k]*4,w=kernel[k];
        r+=source[from]*w;g+=source[from+1]*w;b+=source[from+2]*w;
      }
      const to=row+angle*4;target[to]=r;target[to+1]=g;target[to+2]=b;target[to+3]=1;
    }
    target.set(source.subarray(sourceRow+DIRECTIONS*4,sourceRow+WIDTH*4),row+DIRECTIONS*4);
  }
  return target;
}
export function diffusionLevel(radius){return (LEVELS-1)*(1-Math.exp(-Math.max(0,radius-.0524)/.32));}
export const DIFFUSION_GLSL=`
uniform sampler2D diffusedArtwork;
vec3 clothTap(float angle,float y){
 float index=mod(mod(angle,21.)+21.,21.);
 return texture2D(diffusedArtwork,vec2((index+.5)/22.,y)).rgb;
}
vec3 smoothClothRing(float a,float fixture,float level){
 float y=(fixture+level*fixtureCount+.5)/(fixtureCount*4.);
 float i=floor(a),f=fract(a),f2=f*f,f3=f2*f;
 // Positive cubic B-spline weights remove interpolation spokes while keeping
 // the circular seam and radiance continuous, without ringing or overshoot.
 vec4 w=vec4(pow(1.-f,3.),3.*f3-6.*f2+4.,-3.*f3+3.*f2+3.*f+1.,f3)/6.;
 return clothTap(i-1.,y)*w.x+clothTap(i,y)*w.y+clothTap(i+1.,y)*w.z+clothTap(i+2.,y)*w.w;
}
vec3 transmittedClothLight(float angle,float fixture,float radius){
 float distanceFromTube=max(0.,radius-.0524);
 float level=3.*(1.-exp(-distanceFromTube/.32));
 float lo=floor(level),hi=min(3.,lo+1.);
 return mix(smoothClothRing(angle,fixture,lo),smoothClothRing(angle,fixture,hi),fract(level));
}
`;
export function createClothDiffusion(THREE,fixtures){
  const data=new Float32Array(fixtures*WIDTH*4*LEVELS);
  const texture=new THREE.DataTexture(data,WIDTH,fixtures*LEVELS,THREE.RGBAFormat,THREE.FloatType);
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;
  let lastGeneration=-1,lastSource=null;
  return {texture,update(source,generation){
    if(source===lastSource&&generation===lastGeneration)return;
    blurClothField(source,fixtures,data);texture.needsUpdate=true;lastGeneration=generation;lastSource=source;
  }};
}
