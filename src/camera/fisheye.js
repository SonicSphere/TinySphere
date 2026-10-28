import * as THREE from '../vendor/three.module.js';

// A full-frame 180-degree diagonal equidistant lens. Cube views from one eye
// avoid the missing edges and stretched center of warping a perspective image.
export function createFisheyeRenderer(renderer, scene) {
  let target,
    cube,
    faceSize = 0,
    captureViews = 0;
  const drawingSize = new THREE.Vector2();
  const exposure = { value: renderer.toneMappingExposure };
  const restored = [];
  const uniforms = {
    view: { value: null },
    aspect: { value: 1 },
    normalHalfFov: { value: Math.PI / 9 },
    strength: { value: 0 },
    frontScale: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader:
      'varying vec2 screen; void main(){screen=position.xy;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform samplerCube view; uniform float aspect;
      uniform float normalHalfFov; uniform float strength; uniform float frontScale; varying vec2 screen;
      void main(){
        vec2 p=vec2(screen.x*aspect,screen.y);float r=length(p);
        float normalAngle=atan(r*tan(normalHalfFov));
        float fishAngle=r/length(vec2(aspect,1.))*1.570796326794897;
        float theta=mix(normalAngle,fishAngle,strength);
        vec3 ray=vec3(r>0.000001?p/r*sin(theta):vec2(0.),-cos(theta));
        gl_FragColor=textureCube(view,vec3(ray.xy/frontScale,ray.z));
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const screenScene = new THREE.Scene(),
    screenCamera = new THREE.Camera();
  const screen = new THREE.Mesh(geometry, material);
  screen.frustumCulled = false;
  screenScene.add(screen);

  // Three omits display tone mapping when rendering to a texture. Preserve it
  // per material in the cube, including the terrain's deliberate opt-out, so
  // entering the fisheye doesn't change the approved lighting or sky colors.
  const materials = new Set();
  scene.traverse((object) => {
    for (const m of [object.material].flat()) if (m?.toneMapped) materials.add(m);
  });
  for (const m of materials) {
    const compile = m.onBeforeCompile,
      cacheKey = m.customProgramCacheKey;
    const key = cacheKey.call(m);
    m.onBeforeCompile = function (shader, activeRenderer) {
      compile.call(this, shader, activeRenderer);
      if (!target || activeRenderer.getRenderTarget() !== target) return;
      shader.uniforms.toneMappingExposure = exposure;
      shader.fragmentShader =
        '#define TONE_MAPPING\n' +
        THREE.ShaderChunk.tonemapping_pars_fragment +
        '\nvec3 toneMapping(vec3 color){return ACESFilmicToneMapping(color);}\n' +
        shader.fragmentShader;
    };
    m.customProgramCacheKey = () => key + '|fisheye-display-cube-v1';
    m.needsUpdate = true;
    restored.push(() => {
      m.onBeforeCompile = compile;
      m.customProgramCacheKey = cacheKey;
      m.needsUpdate = true;
    });
  }

  function render(camera, pose, prepareCamera) {
    if (!pose.fisheye) {
      renderer.render(scene, camera);
      return;
    }
    renderer.getDrawingBufferSize(drawingSize);
    const size = Math.min(
      2048,
      Math.max(
        512,
        Math.ceil(Math.max(drawingSize.x, drawingSize.y) / (1 + 1.5 * pose.fisheye) / 256) * 256,
      ),
    );
    if (!target) {
      target = new THREE.WebGLCubeRenderTarget(size, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      cube = new THREE.CubeCamera(0.05, camera.far, target);
      cube.coordinateSystem = renderer.coordinateSystem;
      cube.updateCoordinateSystem();
      uniforms.view.value = target.texture;
      faceSize = size;
    } else if (size !== faceSize) {
      target.setSize(size, size);
      faceSize = size;
    }
    exposure.value = renderer.toneMappingExposure;
    cube.position.copy(camera.position);
    cube.quaternion.copy(camera.quaternion);
    cube.updateMatrixWorld(true);
    // While every ray fits the forward face, tighten that face's lens and
    // render only it. This keeps the narrow-lens handoff crisp and inexpensive.
    const frontScale = Math.min(1, Math.tan((pose.diagonalFov * Math.PI) / 360));
    uniforms.frontScale.value = frontScale;
    cube.children[5].fov = (-2 * Math.atan(frontScale) * 180) / Math.PI;
    cube.children[5].updateProjectionMatrix();
    uniforms.aspect.value = camera.aspect;
    uniforms.normalHalfFov.value = (camera.fov * Math.PI) / 360;
    uniforms.strength.value = pose.fisheye;
    const previousTarget = renderer.getRenderTarget(),
      previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel(),
      autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      // Camera-aligned capture never samples the rear (+Z) face: even the
      // corners of the final lens stop at 90 degrees from the forward axis.
      const faces = frontScale < 1 ? [5] : [0, 1, 2, 3, 5];
      captureViews = faces.length;
      for (const face of faces) {
        const view = cube.children[face];
        prepareCamera(view, faceSize, 1);
        renderer.setRenderTarget(target, face);
        renderer.render(scene, view);
      }
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      renderer.render(screenScene, screenCamera);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      renderer.info.autoReset = autoReset;
      prepareCamera(camera, drawingSize.y, renderer.getPixelRatio());
    }
  }
  return {
    render,
    stats: () => ({ faceSize, projection: '180-degree diagonal equidistant', captureViews }),
    dispose() {
      target?.dispose();
      geometry.dispose();
      material.dispose();
      for (const restore of restored) restore();
    },
  };
}
