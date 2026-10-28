import { createBandFrame } from './fields.js';
import { samplePalette as palette } from './math.js';

export default {
  id: 'eq',
  name: 'Concentric EQ',
  description: 'Frequency rings with occasional deep-bass blooms',
  palette: 'aurora',
  audioMode: 'bands',
  prepare: (input) => createBandFrame(input),
  sample(x, y, z, ctx, p, c) {
    const { q, blobs, detail: d, loose } = ctx;
    const dot = Math.abs(x * ctx.axis[0] + y * ctx.axis[1] + z * ctx.axis[2]);
    const radial = ((Math.acos(Math.min(1, dot)) * 2) / Math.PI) * 10;
    const band = Math.min(9, Math.floor(radial)),
      level = ctx.bands[band];
    const distance = Math.abs(radial - (band + 0.5)),
      width = (0.1 + level * 0.3) / Math.sqrt(d);
    const ring = Math.exp(-((distance / width) ** 2));
    palette(p, 0.12 + band * 0.075, c);
    return 0.025 + ring * (0.09 + level * level * 2.6);
  },
};
