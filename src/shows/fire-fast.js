import { FlockingEngine, TICKS_PER_SECOND } from './flocking/engine.js';

const performances = new WeakMap();

function engineAt(points, seed, seconds, maxSteps) {
  let engines = performances.get(points);
  if (!engines) performances.set(points, engines = new Map());
  seed = Math.max(1, Math.min(2147483646, Math.trunc(seed)));
  let engine = engines.get(seed);
  if (!engine) engine = new FlockingEngine(points, {
    seed, samplesPerFixture: points.length === 212 * 22 * 3 ? 22 : 1,
  });
  engines.delete(seed);
  engines.set(seed, engine);
  // Current and outgoing wipe fields keep independent, bounded histories.
  if (engines.size > 4) engines.delete(engines.keys().next().value);
  const target = Math.floor(Math.max(0, seconds) * TICKS_PER_SECOND + 1e-9);
  if (target < engine.tick) engine.restart(seed);
  const steps = Math.min(target - engine.tick, maxSteps);
  for (let i = 0; i < steps; i++) engine.step();
  if (steps) engine.sample();
  return { engine, pending: engine.tick < target };
}

export default {
  id: 'fire-fast',
  name: 'Fire Fast',
  description: 'Quick-moving flocks of light in the scene palette.',
  palette: 'cherry',
  defaultFlowSpeed: 1,
  clothDiffusion: true,
  renderField({ points, seconds, seed, palette, out, maxSteps = Infinity }) {
    const { engine, pending } = engineAt(points, seed, seconds, maxSteps);
    engine.writeField(out, palette);
    return { burstPeak: 0, spectralIdle: 0, flockingPreset: 'fire-fast',
      recoveredPending: pending };
  },
};
