import * as THREE from '../vendor/three.module.js';

export const WIPE_SECONDS = 0.5;
export const wipeEase = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// Two live lighting passes use the same scene, camera and drawing buffer.
// Copy on the GPU after the normal output transform, preserving the existing
// antialiasing, additive LEDs and tone mapping at both ends of the transition.
export class LookWipe {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = new THREE.Vector2();
    this.active = false;
    this.elapsed = 0;
    this.completed = 0;
    this.uniforms = {
      before: { value: null },
      after: { value: null },
      resolution: { value: this.size },
      progress: { value: 0 },
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `
        uniform sampler2D before;
        uniform sampler2D after;
        uniform vec2 resolution;
        uniform float progress;
        vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
        vec3 toDisplay(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
        void main(){
          vec2 uv=gl_FragCoord.xy/resolution;
          float front=mix(-.10,1.10,progress);
          float position=uv.x+.05*(uv.y-.5);
          float reveal=1.-smoothstep(front-.07,front+.07,position);
          vec3 a=texture2D(before,uv).rgb,b=texture2D(after,uv).rgb;
          // Blend light in the soft edge; the fully revealed regions retain
          // the exact display colors of the original render, without a grade.
          vec3 color=reveal<=0.?a:reveal>=1.?b:toDisplay(mix(toLinear(a),toLinear(b),reveal));
          gl_FragColor=vec4(color,1.);
        }`,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(geometry, this.material));
    this.camera = new THREE.Camera();
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.before && size.equals(this.size)) return;
    this.before?.dispose();
    this.after?.dispose();
    this.size.copy(size);
    this.before = new THREE.FramebufferTexture(size.x, size.y);
    this.after = new THREE.FramebufferTexture(size.x, size.y);
    this.uniforms.before.value = this.before;
    this.uniforms.after.value = this.after;
    this.renderer.initTexture(this.before);
    this.renderer.initTexture(this.after);
  }

  async prepare() {
    this.resize();
    if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
  }

  start(source, { reducedMotion = false } = {}) {
    this.source = source;
    this.active = !reducedMotion;
    this.elapsed = 0;
    this.uniforms.progress.value = 0;
  }

  advance(seconds) {
    if (!this.active) return;
    this.elapsed = Math.min(WIPE_SECONDS, this.elapsed + Math.max(0, seconds));
    this.uniforms.progress.value = wipeEase(this.elapsed / WIPE_SECONDS);
  }

  render(drawBefore, drawAfter) {
    if (!this.active) {
      drawAfter();
      return false;
    }
    this.resize();
    if (this.uniforms.progress.value >= 1) {
      drawAfter();
      this.active = false;
      this.source = null;
      this.completed++;
      return true;
    }
    drawBefore(this.source);
    this.renderer.copyFramebufferToTexture(this.before);
    drawAfter();
    this.renderer.copyFramebufferToTexture(this.after);
    this.renderer.render(this.scene, this.camera);
    return false;
  }

  cancel() {
    this.active = false;
    this.source = null;
  }
  status() {
    return {
      active: this.active,
      seconds: WIPE_SECONDS,
      elapsed: this.elapsed,
      progress: this.uniforms.progress.value,
      completed: this.completed,
      from: this.source?.atmosphere ?? null,
      direction: 'left-to-right',
      sharedScene: true,
      sharedCamera: true,
      liveBothSides: true,
      bufferSize: this.size.toArray(),
    };
  }
  dispose() {
    this.before?.dispose();
    this.after?.dispose();
    this.scene.children[0].geometry.dispose();
    this.material.dispose();
  }
}
