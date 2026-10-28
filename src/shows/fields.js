import { TAU, clamp, smooth, hash, samplePalette as palette } from './math.js';

export function createFlowFrame({ seconds, seed, detail, wildness }, count = 7) {
  const t = seconds,
    loose = wildness;
  const q = (TAU * t) / 60,
    phase = (seed % 10007) * 0.0017;
  const blobs = [];
  for (let k = 0; k < count; k++) {
    const a = k * 2.39996323 + phase + q * (k % 2 ? 1 : -1);
    const z = 0.76 * Math.sin(q + (k + 1) * 1.71 + phase * 0.7);
    const r = Math.sqrt(1 - z * z);
    blobs.push([r * Math.cos(a), r * Math.sin(a), z, 0.76 + 0.24 * Math.sin(q * 2 + k + phase)]);
  }
  return {
    q,
    phase,
    blobs,
    detail,
    loose,
    sinQ: Math.sin(q),
    cosQ: Math.cos(q),
    sinQ2: Math.sin(q * 2),
    cosQ2: Math.cos(q * 2),
  };
}

export function createBandFrame(
  { seconds, seed, detail, wildness, music, spectralIdle = 0 },
  spectral = false,
) {
  const t = seconds,
    loose = wildness;
  const q = (TAU * t) / 60,
    phase = (seed % 10007) * 0.0017;
  const axis = [0.52 + 0.12 * Math.sin(phase), 0.79 + 0.06 * Math.cos(phase), 0.32],
    length = Math.hypot(...axis);
  const amount = music?.amount ?? 0;
  const bands = Array.from({ length: 10 }, (_, i) => {
    const idle =
      0.14 +
      0.045 * Math.sin(q * 2 + phase + i * 0.7) +
      spectralIdle * (0.15 + 0.04 * Math.sin(q * 3 + phase + i * 1.3));
    return idle * (1 - amount) + clamp(music?.bands?.[i] ?? 0) * amount;
  });
  const blobs = spectral
    ? bands.map((level, k) => {
        const a = k * 2.399963 + phase + q * (k % 2 ? 1 : -1),
          z = 0.8 * Math.sin(k * 1.71 + phase * 0.3 + q * (k % 3 ? 1 : 2)),
          r = Math.sqrt(1 - z * z);
        const clock = t * 3.2 + k * 1.71,
          step = Math.floor(clock),
          blend = smooth(0, 1, clock - step);
        const flicker =
          0.72 +
          0.5 *
            (hash(seed + k * 7919 + step) * (1 - blend) + hash(seed + k * 7919 + step + 1) * blend);
        return {
          center: [r * Math.cos(a), r * Math.sin(a), z],
          tangent: [-Math.sin(a), Math.cos(a), 0],
          level,
          flicker: 1 + spectralIdle * (flicker - 1),
          sharp: (detail * 16) / (0.5 + level * 1.8),
          stretch: 0.3 * Math.sin(q * 2 + phase + k),
          tint: 0.12 + k * 0.075,
        };
      })
    : null;
  return { q, phase, axis: axis.map((v) => v / length), bands, blobs, detail, loose };
}

export function warpField(x, y, z, ctx) {
  const { q, phase, detail: d, loose, sinQ, cosQ, sinQ2, cosQ2 } = ctx;
  const warp = 0.16 + 0.32 * loose;
  const u = (x + warp * Math.sin(2.4 * y + 1.7 * z + sinQ + phase)) * d;
  const v = (y + warp * Math.sin(2.1 * z - 1.8 * x + cosQ + phase * 0.8)) * d;
  const w = (z + warp * Math.sin(2.3 * x + 1.6 * y - sinQ + phase * 0.6)) * d;
  const f =
    Math.sin(2.6 * u + 1.9 * v + sinQ + phase) +
    0.65 * Math.sin(2.3 * v - 2.4 * w + cosQ2 + phase * 0.7) +
    0.4 * Math.sin(2.8 * w - 1.7 * u + sinQ2 + phase * 0.4);
  ctx.u = u;
  ctx.v = v;
  ctx.w = w;
  ctx.f = f;
}

export function sampleMolten(look, x, y, z, ctx, p, c) {
  warpField(x, y, z, ctx);
  const { q, blobs, detail: d, loose, u, v, w, f } = ctx;
  let power;
  let wax = 0;
  const sharp = (look === 'honey' ? 4.4 : look === 'ember' ? 8 : 5.6) * d;
  for (const b of blobs) wax += b[3] * Math.exp((x * b[0] + y * b[1] + z * b[2] - 1) * sharp);
  wax += f * (0.05 + 0.1 * loose);
  const edge = look === 'honey' ? 0.72 : look === 'ember' ? 0.65 : 0.68;
  const body = smooth(edge - 0.24, edge + 0.24, wax);
  const rim = Math.exp(-Math.pow((wax - edge) / 0.16, 2));
  if (look === 'lava') {
    palette(p, 0.18 + body * 0.62 + f * 0.035 + 0.035 * Math.sin(q + w * 2), c);
    power = 0.17 + body * 0.83 + rim * 0.15;
  } else if (look === 'honey') {
    palette(p, 0.13 + body * 0.63 + f * 0.035, c);
    power = 0.12 + body * 0.95 + rim * 0.24;
  } else {
    palette(p, 0.1 + body * 0.55 + rim * 0.12 + 0.04 * Math.sin(q * 2 + u), c);
    power = 0.12 + body * (0.7 + 0.22 * Math.sin(q * 2 + v + w)) + rim * 0.4;
  }

  return power;
}
