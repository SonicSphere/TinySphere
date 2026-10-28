// Copy to src/shows/longitude-waves.js, then register in src/shows/index.js.
// This example is tested, but deliberately absent from the default shuffle.
import { samplePalette } from '../src/shows/math.js';

export default {
  id: 'longitude-waves',
  name: 'Longitude waves',
  description: 'A slow helix of light with a gentle response to music.',
  palette: 'glacier',
  prepare({ seconds, seed, detail, music }) {
    return { phase: seconds * 0.18 + seed * 0.001, detail, energy: music?.energy ?? 0 };
  },
  sample(x, y, z, frame, palette, color) {
    // The integer angular multiplier meets cleanly at the longitude seam.
    // Fade the angular variation at the poles, where longitude has no single value.
    const wave =
      0.5 +
      0.5 *
        Math.hypot(x, y) ** 3 *
        Math.sin(3 * Math.atan2(y, x) + z * 4 * frame.detail - frame.phase);
    samplePalette(palette, 0.15 + wave * 0.65, color);
    return 0.1 + wave ** 3 * (0.8 + frame.energy * 0.2);
  },
};
