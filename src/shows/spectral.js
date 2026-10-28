import { createBandFrame } from './fields.js';
import { samplePalette as palette } from './math.js';

export default {
  id: 'spectral',
  name: 'Spectral blobs',
  description: 'Frequency bands become drifting liquid color',
  palette: 'cherry',
  audioMode: 'bands',
  spectralIdle: true,
  prepare(input) {
    const frame = createBandFrame(input, true);
    for (const blob of frame.blobs) {
      blob.color = [0, 0, 0];
      palette(input.palette, blob.tint, blob.color);
    }
    return frame;
  },
  sample(x, y, z, ctx, p, c) {
    const { q, blobs, detail: d, loose } = ctx;
    palette(p, 0.5, c);
    for (let k = 0; k < 3; k++) c[k] *= 0.035;
    for (let k = 0; k < blobs.length; k++) {
      const b = blobs[k],
        dot = x * b.center[0] + y * b.center[1] + z * b.center[2],
        u = x * b.tangent[0] + y * b.tangent[1];
      const shape = 1 + b.stretch + 0.26 * loose * Math.sin(5 * x - 4 * y + 3 * z + q * 2 + k);
      const field = Math.max(0, (1 - dot) * b.sharp * shape + u * u * b.sharp * b.stretch * 0.5);
      const light = Math.exp(-(field ** 1.35)) * (0.08 + b.level * b.level * 2.4) * b.flicker;
      for (let channel = 0; channel < 3; channel++) c[channel] += light * b.color[channel];
    }
    return 1;
  },
};
