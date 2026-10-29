import { PATTERNS, PatternEngine, createBMAdapter } from './pattern-engine.js';

let source = null;
const engines = new Map();
let adapters = new WeakMap();
const linear = Float32Array.from({ length: 256 }, (_, i) => {
  const x = i / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
});

// Loading is owned by the application, alongside its existing asset downloads.
// The simulation and field renderer remain synchronous, DOM-free and portable.
export function initializeRecoveredShows(nodes, image) {
  const check = new PatternEngine(nodes, image);
  source = { nodes, image, fixtures: check.fixtures };
  engines.clear();
  adapters = new WeakMap();
}

export async function loadRecoveredShows(loadJSON, loadBytes) {
  const base = 'assets/recovered-bm/';
  const [nodes, meta, packed] = await Promise.all([
    loadJSON(base + 'nodes.json'),
    loadJSON(base + 'point-image.json'),
    loadBytes(base + 'point.rgb.gz'),
  ]);
  const data = new Uint8Array(await new Response(
    new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
    (value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== meta.decodedSHA256) throw new Error('The recovered show image is incomplete.');
  initializeRecoveredShows(nodes, { ...meta, data });
}

function engineAt(id, seed, seconds, maxSteps) {
  if (!source) throw new Error('Load the recovered show assets before rendering.');
  seed = Math.trunc(seed);
  const key = `${id}:${seed}`;
  let engine = engines.get(key);
  if (!engine) engine = new PatternEngine(source.nodes, source.image, { id, seed });
  engines.delete(key);
  engines.set(key, engine);
  // Only the current and outgoing wipe performances need live simulation state.
  if (engines.size > 4) engines.delete(engines.keys().next().value);
  const target = Math.max(0, seconds);
  const current = engine.time + engine.accumulator;
  if (target < current - 1e-8) engine.restart(seed);
  engine.advance(Math.min(maxSteps / 60,
    Math.max(0, target - engine.time - engine.accumulator)));
  return engine;
}

function adapterFor(points) {
  let adapter = adapters.get(points);
  if (adapter) return adapter;
  if (points.length === 212 * 22 * 3) {
    adapter = createBMAdapter(source.fixtures, points);
  } else {
    // Direction-only callers (including authoring probes at the poles and seam)
    // sample the nearest source fixture's mean emitted radiance.
    const matches = [];
    for (let i = 0; i < points.length; i += 3) {
      const length = Math.hypot(points[i], points[i + 1], points[i + 2]) || 1;
      let best = 0, score = -Infinity;
      for (let f = 0; f < source.nodes.length; f++) {
        const node = source.nodes[f], radius = Math.hypot(node.x, node.y, node.z);
        const dot = (points[i] * node.x + points[i + 1] * node.y + points[i + 2] * node.z) / (length * radius);
        if (dot > score) { score = dot; best = f; }
      }
      matches.push(best);
    }
    adapter = { write(colors, out) {
      for (let i = 0; i < matches.length; i++) {
        for (let c = 0; c < 3; c++) {
          let mean = 0;
          for (let j = 0; j < 21; j++) mean += linear[colors[(matches[i] * 21 + j) * 3 + c]] / 21;
          out[i * 4 + c] = mean;
        }
        out[i * 4 + 3] = 1;
      }
    } };
  }
  adapters.set(points, adapter);
  return adapter;
}

export const RECOVERED_SHOWS = Object.freeze(PATTERNS.map((pattern) => ({
  id: `bm-${({ 1: 'wave', 2: 'orbit', 3: 'spinner', 4: 'ambient', 5: 'stars', 6: 'image', 7: 'rings', 9: 'bloom' })[pattern.id]}`,
  name: pattern.name,
  description: pattern.description,
  palette: 'glacier',
  sourcePattern: pattern.id,
  clothDiffusion: true,
  // Original colors, trails and intentional motion bypass the studio's random
  // flashes and audio overlays. The shared music player continues uninterrupted.
  renderField({ points, seconds, seed, out, maxSteps = Infinity }) {
    const engine = engineAt(pattern.id, seed, seconds, maxSteps);
    adapterFor(points).write(engine.colors, out);
    return { burstPeak: 0, spectralIdle: 0, sourcePattern: pattern.id,
      recoveredPending: engine.time + engine.accumulator < seconds - 1e-8 };
  },
})));
