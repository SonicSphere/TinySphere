import { createFlowFrame, warpField } from './fields.js';
import { samplePalette as palette, smooth } from './math.js';

export default {
  id: 'strobe',
  name: 'Broken Stars',
  description: 'Nebula silk and scattered, breathing glints',
  palette: 'abyss',
  prepare: (input) => createFlowFrame(input),
  sample(x, y, z, ctx, p, c) {
    warpField(x, y, z, ctx);
    const { q, phase, u, v, w, f, sinQ, cosQ, sinQ2, cosQ2 } = ctx;
    let power;

    // Slow, luminous nebula silk beneath the scattered glints.
    const cloud = 0.5 + 0.5 * Math.sin(f * 1.35 + u * 0.8 - w + sinQ);
    const vein = Math.exp(-Math.pow((f + 0.25 * sinQ2) / 0.32, 2));
    palette(p, 0.19 + cloud * 0.3 + vein * 0.06 + 0.035 * Math.sin(q + v), c);
    power = 0.19 + 0.38 * cloud + 0.23 * vein;

    return power;
  },
};
