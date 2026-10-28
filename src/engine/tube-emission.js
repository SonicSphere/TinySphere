// A bounded real-time approximation of the actual LED chips. Six chips in a
// winding column share a color; their measured model positions form its center.
// Spatial AND facing-direction clustering avoids treating a tube as a sail.
export function createTubeEmission(records, budget = 16) {
  const columns = new Map();
  for (const r of records) {
    const key = r.fixture + ':' + r.column;
    if (!columns.has(key))
      columns.set(key, {
        fixture: r.fixture,
        left: r.left,
        right: r.right,
        mix: r.mix,
        count: 0,
        position: [0, 0, 0],
        direction: [0, 0, 0],
      });
    const e = columns.get(key);
    e.count++;
    for (let k = 0; k < 3; k++) {
      e.position[k] += r.position[k];
      e.direction[k] += r.normal[k];
    }
  }
  const emitters = [...columns.values()];
  if (!emitters.length) throw Error('LED emission requires actual chip records.');
  const normalize = (v) => {
    const length = Math.hypot(...v);
    if (length < 1e-8) throw Error('LED columns need a consistent facing direction.');
    return v.map((x) => x / length);
  };
  for (const e of emitters) {
    e.position = e.position.map((x) => x / e.count);
    e.direction = normalize(e.direction);
  }
  const distance = (e, c) =>
    e.position.reduce(
      (d, x, k) => d + (x - c.position[k]) ** 2 + 16 * (e.direction[k] - c.direction[k]) ** 2,
      0,
    );
  const centers = [{ position: [...emitters[0].position], direction: [...emitters[0].direction] }];
  while (centers.length < Math.min(budget, emitters.length)) {
    let best = -1,
      selected;
    for (const e of emitters) {
      const d = Math.min(...centers.map((c) => distance(e, c)));
      if (d > best) {
        best = d;
        selected = e;
      }
    }
    centers.push({ position: [...selected.position], direction: [...selected.direction] });
  }
  let groups;
  for (let step = 0; step < 8; step++) {
    groups = centers.map((c) => ({
      position: [...c.position],
      direction: [...c.direction],
      emitters: [],
    }));
    for (const e of emitters) {
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = distance(e, centers[i]);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      groups[nearest].emitters.push(e);
    }
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g.emitters.length) continue;
      g.ledCount = g.emitters.reduce((sum, e) => sum + e.count, 0);
      g.weight = g.ledCount / 120;
      g.fixtures = [...new Set(g.emitters.map((e) => e.fixture))];
      g.position = [0, 1, 2].map(
        (k) => g.emitters.reduce((sum, e) => sum + e.position[k] * e.count, 0) / g.ledCount,
      );
      const direction = [0, 1, 2].map((k) =>
        g.emitters.reduce((sum, e) => sum + e.direction[k] * e.count, 0),
      );
      g.direction =
        Math.hypot(...direction) > 1e-8 ? normalize(direction) : [...g.emitters[0].direction];
      centers[i] = { position: g.position, direction: g.direction };
    }
  }
  groups = groups.filter((g) => g.emitters.length);
  return {
    groups,
    ledCount: records.length,
    fixtureCount: new Set(records.map((r) => r.fixture)).size,
    usesCenterSample: false,
    update(pixels, brightness, spill, output) {
      const scale = Math.max(0, brightness) * Math.max(0, spill);
      output.fill(0);
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        for (const e of g.emitters)
          for (let k = 0; k < 3; k++) {
            const left = pixels[(e.fixture * 22 + e.left) * 4 + k],
              right = pixels[(e.fixture * 22 + e.right) * 4 + k];
            output[i * 3 + k] +=
              (((left * (1 - e.mix) + right * e.mix) * e.count) / g.ledCount) * scale;
          }
      }
      return output;
    },
  };
}

// Hemisphere emission normalized to retain total power relative to an omni
// light. The same lobe is used by the ground, material shader and CPU probes.
export function emitterGain(group, fromLight) {
  if (!group.direction) return 1;
  const length = Math.hypot(...fromLight);
  return length > 0
    ? 4 *
        Math.max(
          0,
          group.direction.reduce((sum, n, k) => sum + (n * fromLight[k]) / length, 0),
        )
    : 0;
}
