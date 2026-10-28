import { createFlowFrame, warpField } from './fields.js';
import { samplePalette as palette, smooth } from './math.js';

export default {
  id: 'velvet',
  name: 'Velvet currents',
  description: 'Long folds of liquid violet',
  palette: 'velvet',
  prepare: (input) => createFlowFrame(input),
  sample(x, y, z, ctx, p, c) {
    warpField(x, y, z, ctx);
    const { q, phase, u, v, w, f, sinQ, cosQ, sinQ2, cosQ2 } = ctx;
    let power;

    const fold = Math.sin(u * 2.5 + w * 1.4 + f * 1.6 + sinQ + phase);
    const silk = 0.5 + 0.5 * Math.sin(f * 3.1 + v * 2 - cosQ);
    palette(p, 0.36 + fold * 0.22 + silk * 0.13, c);
    power = 0.23 + 0.65 * smooth(-0.8, 0.8, fold) + 0.28 * Math.pow(silk, 3);

    return power;
  },
};
