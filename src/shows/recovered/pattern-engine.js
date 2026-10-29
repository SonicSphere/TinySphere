// Ports of the supplied Kugel effects. Source files stay unchanged in reference/.
// Evaluate in original OF units (50 units/metre, Y up) before adapting the field.
export const PATTERNS = Object.freeze([
  {id:1,name:'Wave',description:'A rainbow band sweeps vertically through the sphere.',source:'efWave.cpp'},
  {id:2,name:'Orbit spine circle',description:'A moving point lights the facing side of each fixture.',source:'ofApp::patternOrbitSpineCircle'},
  {id:3,name:'Spinner',description:'One rainbow segment spins around all 212 fixtures together.',source:'ofApp::patternSpinner'},
  {id:4,name:'Ambient points',description:'Two moving virtual lights sweep color through the sphere.',source:'efVirtualPointAmbient.cpp'},
  {id:5,name:'Stars',description:'Six small white light sources wander through the sphere.',source:'efStars.cpp'},
  {id:6,name:'Rotating image',description:'The original point.jpg wraps around the sphere and turns.',source:'ofApp image-map branch'},
  {id:7,name:'Rings',description:'Orange, cyan and plum rings rotate across the cloths.',source:'efRings.cpp'},
  {id:9,name:'Bloom',description:'Individual fixtures rise, hold and fade in soft colors.',source:'efBloom.cpp'},
]);
export const SEGMENTS = 21;
const TAU = Math.PI * 2, FPS = 60, HALF_PI = Math.PI / 2;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const wrap = (x,n) => ((x%n)+n)%n;
const byte = x => Math.trunc(clamp(x,0,255));
const f32 = Math.fround;
const vectorDot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normalize = a => {const r=Math.hypot(...a);return a.map(x=>x/r);};
function spatialNoise(seed,fixture,segment,channel){
  let x=(seed^Math.imul(fixture+1,73856093)^Math.imul(segment+1,19349663)^Math.imul(channel+1,83492791))|0;
  x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);
  return ((x^(x>>>16))>>>0)/4294967296;
}
const RINGS = [
  {color:[201,106,2],frequency:[0,.2,0],width:80},
  {color:[59,176,196],frequency:[0,.3,.09],width:50},
  {color:[151,61,158],frequency:[.1,0,.09],width:50},
];

export function colorWheel(value){
  let x=wrap(Math.trunc(value),256);
  if(x<85)return [x*3,255-x*3,0];
  if(x<170){x-=85;return [255-x*3,0,x*3];}
  x-=170;return [0,x*3,255-x*3];
}
function rgbToHsb(r,g,b){
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),delta=hi-lo;
  let hue=0;
  if(delta){
    hue=hi===r?f32((g-b)/delta):hi===g?f32(2+f32((b-r)/delta)):f32(4+f32((r-g)/delta));
    if(hue<0)hue=f32(hue+6);
    hue=f32(f32(255*hue)/6);
  }
  return [hue,hi?f32(f32(255*delta)/hi):0,hi];
}
function hsbToRgb(h,s,b,fallback=[0,0,0]){
  h=f32(h);s=f32(clamp(s,0,255));b=f32(clamp(b,0,255));
  if(!b)return [0,0,0];
  if(!s)return [byte(b),byte(b),byte(b)];
  const six=f32(f32(h*6)/255),category=Math.floor(six),remainder=f32(six-category),sat=f32(s/255);
  const p=byte(f32(f32(1-sat)*b)),q=byte(f32(f32(1-f32(sat*remainder))*b)),t=byte(f32(f32(1-f32(sat*f32(1-remainder)))*b)),v=byte(b);
  switch(category){
    case 0:case 6:return [v,t,p];case 1:return [q,v,p];case 2:return [p,v,t];
    case 3:return [p,q,v];case 4:return [t,p,v];case 5:return [v,p,q];
    // OF leaves RGB untouched for a negative hue category; preserve that edge.
    default:return fallback.slice();
  }
}
function setBrightness(rgb,brightness){
  const [h,s]=rgbToHsb(...rgb);return hsbToRgb(h,s,brightness,rgb);
}
function rotateX(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c];}
function rotateY(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];}

export function sourceFixtures(nodes){
  return nodes.map(node=>{
    const center=[node.x*50,node.z*50,node.y*50];
    const longitude=Math.atan2(center[0],center[2]);
    const tilt=Math.acos(clamp(center[1]/Math.hypot(...center),-1,1));
    // ofNode::lookAt, then local tiltDeg(90), then local panDeg(rotationDeg).
    const transform=p=>rotateY(rotateX(rotateY(p,node.rotation*Math.PI/180),tilt),longitude);
    const u=transform([1,0,0]),v=transform([0,0,1]),normal=transform([0,1,0]);
    const positions=new Float64Array(SEGMENTS*3),angles=[];
    for(let j=0;j<SEGMENTS;j++){
      const angle=(j+.5)*TAU/SEGMENTS;
      // The recovered constructor truncates these two local coordinates to int.
      const x=Math.trunc(35*Math.sin(angle)),z=Math.trunc(35*Math.cos(angle));
      angles.push(wrap(Math.atan2(x,z),TAU));
      const offset=transform([x,0,z]);
      positions.set(center.map((value,k)=>value+offset[k]),j*3);
    }
    return {center,u,v,normal,positions,angles,node};
  });
}

function eulerNormal(x,y,z){
  // GLM quat(vec3) from the pinned OF bundle; same XYZ Euler convention.
  const cx=Math.cos(x/2),cy=Math.cos(y/2),cz=Math.cos(z/2),sx=Math.sin(x/2),sy=Math.sin(y/2),sz=Math.sin(z/2);
  const qx=sx*cy*cz-cx*sy*sz,qy=cx*sy*cz+sx*cy*sz,qz=cx*cy*sz-sx*sy*cz,qw=cx*cy*cz+sx*sy*sz;
  return [2*(qx*qz+qw*qy),2*(qy*qz-qw*qx),1-2*(qx*qx+qy*qy)];
}

export class PatternEngine{
  constructor(nodes,image,{id=7,seed=2022}={}){
    if(nodes.length!==212)throw Error('Expected all 212 recovered fixtures.');
    if(!image||image.data.length!==image.width*image.height*3)throw Error('Original image pixels are incomplete.');
    this.fixtures=sourceFixtures(nodes);this.image=image;
    this.colors=new Uint8Array(nodes.length*SEGMENTS*3);
    this.speed=1;this.brightness=1;this.trail=true;this.lag=.95;
    this.seed=seed;this.select(id);
  }
  random(a=0,b=1){
    // New seeded generator for repeatable reviews; no historical RNG seed survives.
    let x=this.randomState|0;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;
    return a+(b-a)*(this.randomState/4294967296);
  }
  select(id){
    if(!PATTERNS.some(p=>p.id===Number(id)))throw Error('Only the eight self-contained patterns are enabled.');
    this.id=Number(id);this.restart();
  }
  restart(seed=this.seed){
    if(!Number.isInteger(seed)||seed<1||seed>2147483646)throw Error('Seed must be a positive 31-bit integer.');
    this.seed=seed;this.randomState=seed;this.colors.fill(0);
    this.tick=0;this.time=0;this.accumulator=0;this.spinnerSegment=0;this.generation=(this.generation??0)+1;
    this.stars=Array.from({length:6},()=>({until:0,position:[0,0,0]}));
    this.blooms=Array.from({length:212},()=>({on:false,time:0,color:[255,0,0]}));
    this.step(0);
  }
  configure(options){
    const next={speed:this.speed,brightness:this.brightness,trail:this.trail,lag:this.lag,...options};
    if(!Number.isFinite(next.speed)||next.speed<0||next.speed>1||!Number.isFinite(next.brightness)||next.brightness<0||next.brightness>1||!Number.isFinite(next.lag)||next.lag<0||next.lag>1||typeof next.trail!=='boolean')throw Error('Invalid source-effect parameters.');
    Object.assign(this,{speed:next.speed,brightness:next.brightness,trail:next.trail,lag:next.lag});
  }
  advance(seconds){
    if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid elapsed time.');
    this.accumulator+=seconds;
    const count=Math.floor((this.accumulator+1e-10)*FPS);
    this.accumulator-=count/FPS;
    for(let n=0;n<count;n++){this.tick++;this.time=this.tick/FPS;this.step(1/FPS);}
    return count;
  }
  apply(index,rgb){
    const prior=[this.colors[index],this.colors[index+1],this.colors[index+2]];
    let color=rgb.map(byte);
    const oldBrightness=Math.max(...prior);
    if(this.trail&&oldBrightness>Math.max(...color))color=setBrightness(prior,f32(f32(this.lag)*oldBrightness));
    color=setBrightness(color,f32(Math.max(...color)*f32(this.brightness)));
    this.colors.set(color,index);
  }
  virtual(points,width,white=false){
    const t=this.time;
    for(let f=0;f<212;f++)for(let j=0;j<SEGMENTS;j++){
      const position=this.fixtures[f].positions,offset=j*3;let cap=0,wheel=0;
      for(const point of points){
        const distance=(position[offset]-point[0])**2+(position[offset+1]-point[1])**2+(position[offset+2]-point[2])**2;
        const amount=clamp(1-distance/100000*width,0,1);
        wheel=wrap(Math.trunc(wheel+amount*255*Math.sin(t)),256);cap=Math.max(cap,amount*255);
      }
      this.apply((f*SEGMENTS+j)*3,white?[cap,cap,cap]:colorWheel(wheel).map(x=>Math.min(x,cap)));
    }
  }
  step(dt){
    const t=this.time,speed=this.speed,amplitude=1920*.2;
    if(this.id===4){
      this.virtual([[Math.cos(t*1.5*speed)*amplitude,Math.sin(t*1.5*speed)*amplitude,Math.cos(t*.2*speed)*amplitude],[Math.cos(t*3.5*speed)*amplitude,Math.sin(t*2.5*speed)*amplitude,Math.cos(t*1.2*speed)*amplitude]],2);
    }else if(this.id===5){
      for(const star of this.stars){
        if(star.until<t){
          star.speed=this.random(0,2);star.x=this.random(1,2);star.y=this.random(1,2);star.z=this.random(1,2);star.until=t+this.random(1,3);
        }
        // Defined startup replaces the C++ star struct's uninitialized scalars.
        if(star.speed===undefined){star.speed=0;star.x=1;star.y=1;star.z=1;}
        star.position=[Math.cos(t*star.x*star.speed*speed)*amplitude,Math.sin(t*star.y*star.speed*speed)*amplitude,Math.cos(t*star.z*star.speed*speed)*amplitude];
      }
      this.virtual(this.stars.map(x=>x.position),15,true);
    }else if(this.id===9){
      for(let f=0;f<212;f++){
        const bloom=this.blooms[f];
        if(!bloom.on){
          if(this.random()>=.003*speed)continue;
          bloom.on=true;bloom.time=0;
          const hue=wrap(Math.trunc(this.random(-100,30)),255),sat=128+this.random(-50,50);
          bloom.color=hsbToRgb(hue,sat,255);
        }else{bloom.time+=dt;if(bloom.time>=5)bloom.on=false;}
        const b=bloom.time<1?bloom.time:bloom.time<3?1:bloom.time<5?(5-bloom.time)/2:0,cap=b*255;
        const [h,s]=rgbToHsb(...bloom.color);
        for(let j=0;j<SEGMENTS;j++){
          const hueTexture=(spatialNoise(this.seed,f,j,9)-.5)*20;
          const index=(f*SEGMENTS+j)*3,color=hsbToRgb(h+hueTexture,s,cap,bloom.color);
          this.apply(index,color.map((x,k)=>Math.min(cap,byte(this.colors[index+k]*.8+x*.2))));
        }
      }
    }else{
      const waveAxis=Math.trunc(Math.sin(t*1.5*speed)*amplitude),waveColor=colorWheel(t*200);
      const spinColor=colorWheel(t*50);
      const orbit=[Math.cos(t*1.5*speed)*amplitude,Math.sin(t*1.5*speed)*amplitude,Math.cos(t*.2*speed)*amplitude];
      const normals=this.id===7?RINGS.map(r=>eulerNormal(...r.frequency.map(x=>Math.PI*t*x*speed))):null;
      for(let f=0;f<212;f++){
        const fixture=this.fixtures[f];let lit=-1,distanceU=0;
        if(this.id===2){
          const relative=orbit.map((x,k)=>x-fixture.center[k]);
          distanceU=clamp(1-vectorDot(relative,relative)/100000,0,1);
          const angle=wrap(Math.atan2(vectorDot(relative,fixture.u),vectorDot(relative,fixture.v)),TAU);
          lit=Math.floor(angle/TAU*SEGMENTS);
        }
        for(let j=0;j<SEGMENTS;j++){
          const index=(f*SEGMENTS+j)*3,p=j*3,pos=fixture.positions;let color=[0,0,0];
          if(this.id===1){
            const cap=Math.cos(clamp((pos[p+1]-waveAxis)/50,-HALF_PI,HALF_PI))*255;
            color=waveColor.map(x=>Math.min(x,cap));
          }else if(this.id===2&&j===lit){
            color=[spatialNoise(this.seed,f,0,0)*255*distanceU,spatialNoise(this.seed,f,0,1)*255*distanceU,255*distanceU];
          }else if(this.id===3){
            if(j===this.spinnerSegment)color=spinColor;
          }else if(this.id===6){
            const x=clamp(Math.floor(wrap(Math.atan2(pos[p],pos[p+2])/TAU+t/3,1)*this.image.width),0,this.image.width-1);
            const y=clamp(Math.floor((1-clamp((375+pos[p+1])/750,0,1))*this.image.height),0,this.image.height-1);
            const i=(y*this.image.width+x)*3;color=Array.from(this.image.data.subarray(i,i+3));
          }else if(this.id===7){
            for(let k=0;k<RINGS.length;k++){
              const ring=RINGS[k],n=normals[k],distance=pos[p]*n[0]+pos[p+1]*n[1]+pos[p+2]*n[2];
              const cap=Math.cos(clamp(distance/ring.width,-HALF_PI,HALF_PI))*255;
              // Texture stays fixed in space. Re-rolling it every frame caused
              // visible shimmer absent from Jeremy's physical reference.
              const noise=Math.trunc(-40+spatialNoise(this.seed,f,j,k)*80.01);
              for(let c=0;c<3;c++){
                const varied=byte(ring.color[c]+noise),smoothed=byte(this.colors[index+c]*.5+varied*.5);
                color[c]=byte(color[c]+Math.min(smoothed,cap));
              }
            }
          }
          this.apply(index,color);
        }
      }
      if(this.id===3)this.spinnerSegment=Math.trunc(t*Math.trunc(20*speed))%SEGMENTS;
    }
    this.generation++;
  }
  status(){return {id:this.id,name:PATTERNS.find(p=>p.id===this.id).name,time:this.time,seed:this.seed,speed:this.speed,brightness:this.brightness,trail:this.trail,lag:this.lag,simulationFPS:FPS,sourceFixtures:212,sourceSegments:4452,generation:this.generation};}
}

export function createBMAdapter(fixtures,bmPoints){
  if(bmPoints.length!==212*22*3)throw Error('The BM renderer field has an unexpected size.');
  const map=[],used=new Set();let maximumAngle=0,sine=0,cosine=0;
  for(let id=0;id<212;id++){
    const i=(id*22+21)*3,center=normalize(Array.from(bmPoints.subarray(i,i+3)));
    let best=-1,dot=-Infinity;
    for(let source=0;source<212;source++){
      const node=fixtures[source].node,dir=normalize([node.x,node.y,node.z]),score=vectorDot(center,dir);
      if(score>dot){dot=score;best=source;}
    }
    if(used.has(best)||dot<.9999)throw Error('BM fixture mapping is ambiguous or outside tolerance.');
    used.add(best);map.push(best);maximumAngle=Math.max(maximumAngle,Math.acos(clamp(dot,-1,1)));
    const node=fixtures[best].node;
    sine+=node.x*center[1]-node.y*center[0];cosine+=node.x*center[0]+node.y*center[1];
  }
  const yaw=Math.atan2(sine,cosine),c=Math.cos(-yaw),s=Math.sin(-yaw),entries=[];
  for(let id=0;id<212;id++){
    const fixture=fixtures[map[id]],center=(id*22+21)*3;
    for(let j=0;j<21;j++){
      const i=(id*22+j)*3,dx=bmPoints[i]-bmPoints[center],dy=bmPoints[i+1]-bmPoints[center+1],dz=bmPoints[i+2]-bmPoints[center+2];
      const direction=[dx*c-dy*s,dz,dx*s+dy*c];
      const angle=wrap(Math.atan2(vectorDot(direction,fixture.u),vectorDot(direction,fixture.v)),TAU);
      let right=fixture.angles.findIndex(a=>a>angle);if(right<0)right=0;
      const left=wrap(right-1,21),span=wrap(fixture.angles[right]-fixture.angles[left],TAU);
      entries.push({source:map[id],left,right,mix:wrap(angle-fixture.angles[left],TAU)/span});
    }
  }
  const linear=new Float32Array(256);for(let i=0;i<256;i++){const x=i/255;linear[i]=x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
  return {
    map,entries,stats:{fixtures:212,uniqueMatches:used.size,maximumCenterAngleDegrees:maximumAngle*180/Math.PI,yawDegrees:yaw*180/Math.PI,directionalSamples:21,centerSample:'mean linear radiance of the 21 source segments'},
    write(colors,pixels){
      for(let id=0;id<212;id++){
        const mean=[0,0,0],source=map[id];
        for(let j=0;j<21;j++)for(let k=0;k<3;k++)mean[k]+=linear[colors[(source*21+j)*3+k]]/21;
        for(let j=0;j<21;j++){
          const entry=entries[id*21+j],dst=(id*22+j)*4;
          for(let k=0;k<3;k++)pixels[dst+k]=linear[colors[(entry.source*21+entry.left)*3+k]]*(1-entry.mix)+linear[colors[(entry.source*21+entry.right)*3+k]]*entry.mix;
          pixels[dst+3]=1;
        }
        pixels.set([...mean,1],(id*22+21)*4);
      }
    },
  };
}
