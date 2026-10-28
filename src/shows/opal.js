import { createFlowFrame, warpField } from './fields.js';
import { samplePalette as palette, smooth } from './math.js';

export default {
  id: 'opal',
  name: 'Opal drift',
  description: 'Pearlescent eddies, rose and jade',
  palette: 'pearl',
  prepare: (input) => createFlowFrame(input),
  sample(x, y, z, ctx, p, c) {
    warpField(x, y, z, ctx);
    const { q, phase, u, v, w, f, sinQ, cosQ, sinQ2, cosQ2 } = ctx;
    let power;
    const eddy = Math.sin(f * 2.1 + u * 2 - w * 1.6 + sinQ2);
    const sheen = 0.5 + 0.5 * Math.cos(v * 2.3 + w + f + cosQ);
    palette(p, 0.55 + eddy * 0.24 + sheen * 0.1, c);
    power = 0.3 + 0.55 * (0.5 + 0.5 * eddy) + 0.2 * sheen;
    return power;
  },
};
