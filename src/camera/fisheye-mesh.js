import * as THREE from '../vendor/three.module.js';

// Longest-edge bisection preserves the original planar triangles. All vertex
// attributes are interpolated at exact midpoints; per-instance attributes stay
// untouched. Terrain uses a distance-based edge limit around the installation.
function refineGeometry(original,limit,metric,anchor=null){
 const positions=original.getAttribute('position'),indices=original.index;
 if(!indices||!positions)return original;
 const attrs=Object.fromEntries(Object.entries(original.attributes).filter(([,a])=>!a.isInstancedBufferAttribute));
 const arrays=Object.fromEntries(Object.entries(attrs).map(([k,a])=>[k,Array.from(a.array)]));
 const output=[],groups=[],edgeCache=new Map(),p=arrays.position,limit2=limit*limit;
 let splits=0;
 const length2=(a,b)=>{const x=Math.abs(p[a*3]-p[b*3]),y=Math.abs(p[a*3+1]-p[b*3+1]),z=Math.abs(p[a*3+2]-p[b*3+2]);return x*x*metric[0]+y*y*metric[1]+z*z*metric[2]+2*(x*y*metric[3]+x*z*metric[4]+y*z*metric[5]);};
 function midpoint(a,b){const key=a<b?a+':'+b:b+':'+a;if(edgeCache.has(key))return edgeCache.get(key);
   if(edgeCache.size>1000000)throw Error('Fisheye refinement exceeded the geometry budget');
   const id=p.length/3;for(const [name,attr] of Object.entries(attrs)){const data=arrays[name];for(let k=0;k<attr.itemSize;k++)data.push((data[a*attr.itemSize+k]+data[b*attr.itemSize+k])*.5);}edgeCache.set(key,id);splits++;return id;}
 function triangle(a,b,c,depth=0){
   const ab=length2(a,b),bc=length2(b,c),ca=length2(c,a),longest=Math.max(ab,bc,ca);
   let threshold=limit2;
   if(anchor){
     const distance=id=>Math.hypot(p[id*3]-anchor.x,p[id*3+1]-anchor.y,p[id*3+2]-anchor.z);
     const cx=(p[a*3]+p[b*3]+p[c*3])/3-anchor.x,cy=(p[a*3+1]+p[b*3+1]+p[c*3+1])/3-anchor.y,cz=(p[a*3+2]+p[b*3+2]+p[c*3+2])/3-anchor.z;
     const localLimit=Math.max(1,Math.min(distance(a),distance(b),distance(c),Math.hypot(cx,cy,cz))*.04);
     threshold=localLimit*localLimit;
   }
   if(longest<=threshold||depth>=32){output.push(a,b,c);return;}
   if(longest===ab){const m=midpoint(a,b);triangle(a,m,c,depth+1);triangle(m,b,c,depth+1);}
   else if(longest===bc){const m=midpoint(b,c);triangle(a,b,m,depth+1);triangle(a,m,c,depth+1);}
   else{const m=midpoint(c,a);triangle(a,b,m,depth+1);triangle(m,b,c,depth+1);}
 }
 for(const group of original.groups.length?original.groups:[{start:0,count:indices.count,materialIndex:0}]){
   const start=output.length;for(let j=group.start;j<group.start+group.count;j+=3)triangle(indices.getX(j),indices.getX(j+1),indices.getX(j+2));
   groups.push({start,count:output.length-start,materialIndex:group.materialIndex});
 }
 if(!splits)return original;
 const result=new THREE.BufferGeometry();
 for(const [name,attr] of Object.entries(original.attributes))result.setAttribute(name,attr.isInstancedBufferAttribute?attr:new THREE.BufferAttribute(new attr.array.constructor(arrays[name]),attr.itemSize,attr.normalized));
 result.setIndex(new THREE.BufferAttribute(new Uint32Array(output),1));result.groups=groups;
 for(const [name,attribute] of Object.entries(attrs)){
   const next=result.getAttribute(name).array;
   for(let i=0;i<attribute.array.length;i++)if(next[i]!==attribute.array[i])throw Error('Original attribute changed: '+name);
 }
 const fixture=result.getAttribute('fixtureId');
 if(fixture&&!fixture.isInstancedBufferAttribute)for(const id of fixture.array)if(!Number.isInteger(id))throw Error('Refinement crossed a fixture identity boundary');
 result.userData={...original.userData,linearRefinement:true,edgeLimit:limit,splits,originalAttributesExact:true,fixtureIdentitiesExact:true};return result;
}

export async function prepareFisheyeMeshes(scene,anchor){
 const meshes=[];scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{
   if(!mesh.isMesh||mesh.name==='PLAYA / analytic infinite ground and sky')return;
   const metric=[0,0,0,0,0,0];
   function include(matrix){const e=matrix.elements,cols=[[e[0],e[1],e[2]],[e[4],e[5],e[6]],[e[8],e[9],e[10]]],dot=(a,b)=>cols[a].reduce((s,x,i)=>s+x*cols[b][i],0),g=[dot(0,0),dot(1,1),dot(2,2),Math.abs(dot(0,1)),Math.abs(dot(0,2)),Math.abs(dot(1,2))];g.forEach((x,i)=>metric[i]=Math.max(metric[i],x));}
   if(mesh.isInstancedMesh){const matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);include(matrix);}}else include(mesh.matrixWorld);
   meshes.push({mesh,original:mesh.geometry,metric,terrain:/topography/i.test(mesh.name),levels:{raw:mesh.geometry}});
 });

 for(const item of meshes){
  item.refined=refineGeometry(item.original,.5,item.metric,item.terrain?anchor:null);
  await new Promise(requestAnimationFrame);
 }
 let active=false;
 return {
  apply(value){if(value===active)return;active=value;for(const item of meshes)item.mesh.geometry=active?item.refined:item.original;},
  stats:()=>({active,edgeLimitMetres:.5,originalAttributesExact:true,fixtureIdentitiesExact:true}),
  dispose(){for(const item of meshes){item.mesh.geometry=item.original;if(item.refined!==item.original)item.refined.dispose();}},
 };
}
