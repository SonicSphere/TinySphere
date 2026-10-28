import { createFlowFrame, warpField } from './fields.js';
import { samplePalette as palette, smooth } from './math.js';

export default {
  id: 'aurora',
  name: 'Aurora melt',
  description: 'Soft ribbons wrap the whole sphere',
  palette: 'aurora',
  prepare: (input) => createFlowFrame(input),
  sample(x, y, z, ctx, p, c) {
    warpField(x, y, z, ctx);
    const { q, phase, u, v, w, f, sinQ, cosQ, sinQ2, cosQ2 } = ctx;
    let power;

    const ribbon = Math.sin(w * 3.8 + u * 2 + 1.5 * Math.sin(v * 2.1 + sinQ + phase) + cosQ);
    const veil = 0.5 + 0.5 * Math.sin(ribbon * 2 + f * 0.65 + q * 2);
    palette(p, 0.28 + ribbon * 0.18 + v * 0.09 + 0.04 * sinQ, c);
    power = 0.2 + 0.75 * Math.pow(0.5 + 0.5 * ribbon, 1.6) + 0.18 * veil;

    return power;
  },
};
