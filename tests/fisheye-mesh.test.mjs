import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../src/vendor/three.module.js';
import {prepareFisheyeMeshes} from '../src/camera/fisheye-mesh.js';

test('fisheye refinement bounds world edges and restores the exact exterior mesh', async () => {
  const originalRAF = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => setImmediate(callback);
  const scene = new THREE.Scene(), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('fixtureId',new THREE.Float32BufferAttribute([7,7,7],1));
  geometry.setIndex([0,1,2]);geometry.addGroup(0,3,0);
  const mesh = new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),2);
  mesh.setMatrixAt(0,new THREE.Matrix4().makeScale(3,2,1));
  mesh.setMatrixAt(1,new THREE.Matrix4().makeScale(1,4,1));scene.add(mesh);
  try {
    const result = await prepareFisheyeMeshes(scene,new THREE.Vector3());
    assert.equal(mesh.geometry,geometry,'preparing keeps exterior geometry');
    result.apply(true);const refined=mesh.geometry,positions=refined.getAttribute('position');
    assert.ok(refined.index.count>geometry.index.count);
    assert.deepEqual(Array.from(positions.array.slice(0,9)),Array.from(geometry.attributes.position.array));
    assert.ok(Array.from(refined.attributes.fixtureId.array).every(id=>id===7));
    const matrix = new THREE.Matrix4();
    for(let instance=0;instance<2;instance++){
      mesh.getMatrixAt(instance,matrix);
      for(let index=0;index<refined.index.count;index+=3){
        const vertices=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,refined.index.getX(index+offset)).applyMatrix4(matrix));
        for(let edge=0;edge<3;edge++)assert.ok(vertices[edge].distanceTo(vertices[(edge+1)%3])<=.500001);
      }
    }
    assert.equal(refined.groups[0].count,refined.index.count,'material group covers inserted triangles');
    result.apply(false);assert.equal(mesh.geometry,geometry,'exterior uses exact source object');
    result.apply(true);assert.equal(mesh.geometry,refined,'reentry reuses prepared geometry');
    result.dispose();assert.equal(mesh.geometry,geometry);
  } finally {globalThis.requestAnimationFrame = originalRAF;}
});
