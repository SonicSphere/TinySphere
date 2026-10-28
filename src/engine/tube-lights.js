import * as THREE from '../vendor/three.module.js';
import { createTubeEmission } from './tube-emission.js';

export const FORM_STYLES = {
  classic: {
    label: 'Classic Sonic Sphere',
    cloth: true,
    legs: true,
    geodesic: true,
    lights: false,
  },
  uncovered: { label: 'No light cloths', cloth: false, legs: true, geodesic: true, lights: true },
  floatingCloths: {
    label: 'Floating cloths',
    cloth: true,
    legs: false,
    geodesic: false,
    lights: false,
  },
  floatingLights: {
    label: 'Floating lights',
    cloth: false,
    legs: false,
    geodesic: false,
    lights: true,
  },
};
export const RADIAL_SEGMENTS = 21;
const TAU = Math.PI * 2;
export function segmentWeights(angle) {
  const wrapped = ((((angle % TAU) + TAU) % TAU) / TAU) * RADIAL_SEGMENTS;
  const left = Math.floor(wrapped) % RADIAL_SEGMENTS;
  return { left, right: (left + 1) % RADIAL_SEGMENTS, mix: wrapped - Math.floor(wrapped) };
}
export function sampleRadial(pixels, fixture, angle) {
  const { left, right, mix } = segmentWeights(angle);
  return [0, 1, 2].map(
    (k) =>
      pixels[(fixture * 22 + left) * 4 + k] * (1 - mix) +
      pixels[(fixture * 22 + right) * 4 + k] * mix,
  );
}
const angularLight = `
uniform sampler2D artwork;
uniform float fixtureCount;
uniform float brightness;
uniform float artVisibility;
uniform float diagnostic;
varying float vFixture;
varying float vAngle;
vec3 tubeLight(){
 float a=mod(mod(vAngle*21./6.28318530718,21.)+21.,21.);
 float i=floor(a),f=fract(a),y=(vFixture+.5)/fixtureCount;
 vec3 left=texture2D(artwork,vec2((i+.5)/22.,y)).rgb;
 vec3 right=texture2D(artwork,vec2((mod(i+1.,21.)+.5)/22.,y)).rgb;
 vec3 light=mix(left,right,f);
 if(diagnostic>0.5){float h=a/21.;light=.5+.5*cos(6.28318530718*(vec3(h)+vec3(0.,.3333333,.6666667)));}
 return light*brightness*12.*artVisibility;
}`;

function cylinder(radius, height) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, height / 2);
  return geometry;
}
function stripGeometry() {
  const positions = [],
    indices = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60,
      angle = ((t * 119) / 20) * TAU;
    for (const sign of [-1, 1])
      positions.push(
        Math.cos(angle) * 0.0527,
        Math.sin(angle) * 0.0527,
        0.07 + t * 0.86 + sign * 0.021,
      );
    if (i < 60) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createTubeLights({ fits, axes, texture, renderer }) {
  if (fits.fixtures.length !== 212 || axes.length !== 212)
    throw Error('Tube mapping does not match the sphere.');
  const group = new THREE.Group();
  group.name = 'Outward LED tubes';
  group.visible = false;
  const count = 212,
    ledCount = count * 120,
    records = [],
    positions = [],
    fixtureIds = [],
    angles = [];
  const uniforms = {
    artwork: { value: texture },
    fixtureCount: { value: count },
    brightness: { value: 1 },
    artVisibility: { value: 1 },
    diagnostic: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float lightFixture;attribute float lightAngle;varying float vFixture;varying float vAngle;
    void main(){vFixture=lightFixture;vAngle=lightAngle;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:
      angularLight +
      `void main(){gl_FragColor=vec4(tubeLight(),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const geometry = new THREE.PlaneGeometry(0.005, 0.005),
    leds = new THREE.InstancedMesh(geometry, material, ledCount);
  leds.name = '25,440 LEDs / angular artwork samples';
  const tube = new THREE.InstancedMesh(
    cylinder(0.0524, 1),
    new THREE.MeshStandardMaterial({ color: 0x87938c, roughness: 0.75, metalness: 0.05 }),
    count,
  );
  const strip = new THREE.InstancedMesh(
    stripGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x121b20, roughness: 0.8, side: THREE.DoubleSide }),
    count,
  );
  const foot = new THREE.InstancedMesh(
    cylinder(0.056, 0.004),
    new THREE.MeshStandardMaterial({ color: 0x384952, roughness: 0.5, metalness: 0.4 }),
    count,
  );
  // Both bottom caps share the same plane. Give the outer foot a stable depth
  // priority, just like the frame contacts, without moving either surface.
  foot.material.polygonOffset = true;
  foot.material.polygonOffsetFactor = -1;
  foot.material.polygonOffsetUnits = -1;
  const matrix = new THREE.Matrix4(),
    localBasis = new THREE.Matrix4(),
    one = new THREE.Vector3(1, 1, 1),
    z = new THREE.Vector3(0, 0, 1);
  for (const f of fits.fixtures) {
    const n = new THREE.Vector3(...f.outward),
      base = new THREE.Vector3(...f.base),
      frame = axes[f.id];
    // Align physical winding to this cloth's source axes; some cloth definitions
    // have the opposite handedness. Compute the shader angle from BOTH axes,
    // rather than assuming a global winding direction or a shared zero angle.
    const u = frame.u.clone().addScaledVector(n, -frame.u.dot(n)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
    matrix.compose(base, q, new THREE.Vector3(1, 1, f.length));
    tube.setMatrixAt(f.id, matrix);
    strip.setMatrixAt(f.id, matrix);
    foot.setMatrixAt(f.id, new THREE.Matrix4().compose(base, q, one));
    for (let index = 0; index < 120; index++) {
      const a = ((index % 20) / 20) * TAU;
      const radial = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      const angle = ((Math.atan2(radial.dot(frame.v), radial.dot(frame.u)) % TAU) + TAU) % TAU;
      const local = new THREE.Vector3(
        0.054 * Math.cos(a),
        0.054 * Math.sin(a),
        f.length * (0.07 + (0.86 * index) / 119),
      );
      const world = local.clone().applyQuaternion(q).add(base);
      localBasis.makeBasis(
        new THREE.Vector3(-Math.sin(a), Math.cos(a), 0),
        z,
        new THREE.Vector3(Math.cos(a), Math.sin(a), 0),
      );
      const chipQ = new THREE.Quaternion().setFromRotationMatrix(localBasis).premultiply(q);
      leds.setMatrixAt(f.id * 120 + index, matrix.compose(world, chipQ, one));
      positions.push(...world.toArray());
      fixtureIds.push(f.id);
      angles.push(angle);
      records.push({
        fixture: f.id,
        index,
        column: index % 20,
        turn: Math.floor(index / 20),
        angle,
        position: world.toArray(),
        normal: radial.toArray(),
        ...segmentWeights(angle),
      });
    }
  }
  geometry.setAttribute(
    'lightFixture',
    new THREE.InstancedBufferAttribute(new Float32Array(fixtureIds), 1),
  );
  geometry.setAttribute(
    'lightAngle',
    new THREE.InstancedBufferAttribute(new Float32Array(angles), 1),
  );
  for (const mesh of [tube, strip, foot, leds]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  // Small screen-space halos keep tiny emitters legible at whole-sphere scale.
  // They share the exact chip positions and radial samples, with depth occlusion.
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  haloGeometry.setAttribute('lightFixture', new THREE.Float32BufferAttribute(fixtureIds, 1));
  haloGeometry.setAttribute('lightAngle', new THREE.Float32BufferAttribute(angles, 1));
  haloGeometry.setAttribute(
    'lightNormal',
    new THREE.Float32BufferAttribute(
      records.flatMap((r) => r.normal),
      3,
    ),
  );
  const haloUniforms = { ...uniforms, pointScale: { value: 1 }, pixelRatio: { value: 1 } };
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float lightFixture;attribute float lightAngle;attribute vec3 lightNormal;uniform float pointScale;uniform float pixelRatio;varying float vFixture;varying float vAngle;varying float vFacing;
      void main(){vFixture=lightFixture;vAngle=lightAngle;vec3 world=(modelMatrix*vec4(position,1.)).xyz;vFacing=max(0.,dot(normalize(mat3(modelMatrix)*lightNormal),normalize(cameraPosition-world)));vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(.008*pointScale/-mv.z,2.2*pixelRatio,7.*pixelRatio);}`,
    fragmentShader:
      angularLight +
      `varying float vFacing;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.||vFacing<=0.)discard;gl_FragColor=vec4(tubeLight(),pow(1.-r,1.4)*.65*vFacing);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const halos = new THREE.Points(haloGeometry, haloMaterial);
  halos.name = 'LED display halos';
  group.add(halos);
  const drawingSize = new THREE.Vector2();
  function updateCamera(camera, height, pixelRatio) {
    haloUniforms.pointScale.value =
      height / (2 * Math.tan(THREE.MathUtils.degToRad(Math.abs(camera.fov)) / 2));
    haloUniforms.pixelRatio.value = pixelRatio;
  }
  return {
    group,
    records,
    axes,
    emitters: createTubeEmission(records),
    updateCamera,
    update(state, camera, light) {
      uniforms.brightness.value = state.brightness;
      uniforms.artVisibility.value = light.artVisibility;
      renderer.getDrawingBufferSize(drawingSize);
      updateCamera(camera, drawingSize.y, renderer.getPixelRatio());
    },
    diagnostic(enabled) {
      uniforms.diagnostic.value = enabled ? 1 : 0;
    },
    stats() {
      return {
        fixtures: count,
        physicalLEDs: ledCount,
        radialSamples: 21,
        physicalColumns: 20,
        turns: 6,
        usesCenterSample: false,
        angularInterpolation: 'cyclic linear',
        diagnostic: uniforms.diagnostic.value === 1,
      };
    },
    colors(pixels) {
      return records.map((r) => sampleRadial(pixels, r.fixture, r.angle));
    },
  };
}
