import { emitterGain } from '../engine/tube-emission.js';
// Deterministic spatial clustering of the original fixture positions. Every
// modeled fixture contributes to one live, colored light; no colors are invented.
export function clusterFixtures(positions, count = 24) {
  const total = positions.length / 3;
  if (!Number.isInteger(total) || !total || !positions.every(Number.isFinite))
    throw new Error('Invalid fixture positions');
  count = Math.min(count, total);
  const distance = (i, c) => {
    let d = 0;
    for (let k = 0; k < 3; k++) d += (positions[i * 3 + k] - c[k]) ** 2;
    return d;
  };
  const centers = [[positions[0], positions[1], positions[2]]];
  while (centers.length < count) {
    let best = -1,
      index = 0;
    for (let i = 0; i < total; i++) {
      const d = Math.min(...centers.map((c) => distance(i, c)));
      if (d > best) {
        best = d;
        index = i;
      }
    }
    centers.push(Array.from(positions.slice(index * 3, index * 3 + 3)));
  }
  let groups;
  for (let step = 0; step < 8; step++) {
    groups = centers.map(() => []);
    for (let i = 0; i < total; i++) {
      let nearest = 0,
        d = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const candidate = distance(i, centers[j]);
        if (candidate < d) {
          d = candidate;
          nearest = j;
        }
      }
      groups[nearest].push(i);
    }
    for (let j = 0; j < centers.length; j++)
      if (groups[j].length)
        for (let k = 0; k < 3; k++)
          centers[j][k] =
            groups[j].reduce((sum, i) => sum + positions[i * 3 + k], 0) / groups[j].length;
  }
  return centers
    .map((position, i) => ({ position, fixtures: groups[i] }))
    .filter((g) => g.fixtures.length);
}

export function clusterRadiance(pixels, groups, brightness, spill, output) {
  const scale = (Math.max(0, brightness) * Math.max(0, spill)) / 22;
  for (let j = 0; j < groups.length; j++) {
    const rgb = [0, 0, 0];
    for (const fixture of groups[j].fixtures)
      for (let sample = 0; sample < 22; sample++)
        for (let k = 0; k < 3; k++) rgb[k] += pixels[(fixture * 22 + sample) * 4 + k];
    for (let k = 0; k < 3; k++) output[j * 3 + k] = (rgb[k] * scale) / groups[j].fixtures.length;
  }
  return output;
}

export function diffuseProbe(point, normal, groups, colors, intensity = 65) {
  const rgb = [0, 0, 0];
  for (let j = 0; j < groups.length; j++) {
    const delta = groups[j].position.map((x, k) => x - point[k]),
      r2 = delta.reduce((s, x) => s + x * x, 0),
      r = Math.sqrt(r2);
    const cosine = Math.max(0, delta.reduce((s, x, k) => s + x * normal[k], 0) / r);
    const weight = groups[j].weight ?? groups[j].fixtures.length;
    const attenuation =
      (cosine *
        intensity *
        (weight / 9) *
        emitterGain(
          groups[j],
          delta.map((x) => -x),
        )) /
      Math.max(0.16, r2);
    for (let k = 0; k < 3; k++) rgb[k] += colors[j * 3 + k] * attenuation;
  }
  return rgb;
}
