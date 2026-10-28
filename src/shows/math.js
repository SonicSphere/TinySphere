// Pure helpers shared by the built-in shows and contributor examples.
export const TAU = Math.PI * 2;
export const clamp = (x) => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => {
  const v = clamp((x - a) / (b - a));
  return v * v * (3 - 2 * v);
};
export function samplePalette(p, v, out) {
  const q = (((v % 1) + 1) % 1) * p.length,
    i = Math.floor(q),
    f = q - i;
  for (let k = 0; k < 3; k++) out[k] = p[i][k] * (1 - f) + p[(i + 1) % p.length][k] * f;
}

export const hash = (n) => {
  let x = (n | 0) + 0x6d2b79f5;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
