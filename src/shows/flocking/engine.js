/**
 * Browser adaptation of SonicSphere-LX FlockingPattern.java and its Boid class.
 * Original copyright 2023- Mark C. Slee, Heron Arts LLC; original work and
 * Processing flocking attribution are recorded in provenance.json.
 * This adaptation is subject to the original LX terms in LX-LICENSE.txt.
 * Published with permission confirmed by the maintainer on 4 November 2026.
 * Tiny Sphere's MIT license does not relicense this adaptation.
 */
import { PRESETS } from './presets.js';

export const TICKS_PER_SECOND = 60;
export const WARMUP_SECONDS = 12;
const STRIDE = 22, DIRECTIONS = 21;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Processing's normalize() leaves a zero vector at zero. Separation alone
// skips the velocity subtraction for a zero vector; alignment/cohesion do not.
function steer(x, y, z, vx, vy, vz, speed, force, out, offset, separate = false) {
  const length = Math.hypot(x, y, z);
  if (separate && !length) {
    out[offset] = out[offset + 1] = out[offset + 2] = 0;
    return;
  }
  const scale = length ? speed / length : 0;
  x = x * scale - vx; y = y * scale - vy; z = z * scale - vz;
  const magnitude = Math.hypot(x, y, z), limit = magnitude > force ? force / magnitude : 1;
  out[offset] = x * limit; out[offset + 1] = y * limit; out[offset + 2] = z * limit;
}

export function effectiveParameters(raw) {
  return Object.freeze({
    count: Math.trunc(clamp(raw.n_birds, 0, 200)),
    cohesion: clamp(raw.cohesion, 0, 1), alignment: clamp(raw.alignment, 0, 1),
    separation: clamp(raw.separation, 0, 1), radius: clamp(raw.radius, .1, 3),
    speed: clamp(raw.max_v, .001, .05), force: clamp(raw.max_f, .001, .05),
    size: clamp(raw.size, 1.35, 1.95), colorize: clamp(raw.colorize, .001, 1),
  });
}

export class FlockingEngine {
  constructor(points, { preset = 'fire-fast', seed = 2023, speed = 1, color = 'palette', warmup = WARMUP_SECONDS, samplesPerFixture = STRIDE } = {}) {
    if (![1, STRIDE].includes(samplesPerFixture) || !points?.length || points.length % (samplesPerFixture * 3)) throw new Error('Expected fixture samples or individual authoring probes.');
    if (![...points].every(Number.isFinite)) throw new Error('Sample coordinates must be finite.');
    if (!Number.isFinite(warmup) || warmup < 0 || warmup > 30) throw new Error('Invalid warmup.');
    this.samplesPerFixture = samplesPerFixture;
    this.fixtureCount = points.length / (samplesPerFixture * 3);
    this.points = new Float64Array(points.length);
    // The source normalizes each model axis to [-1, 1]. Evaluate this same
    // continuous field at the approved BM samples, without index remapping.
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < points.length; i++) {
      const axis = i % 3;
      minimum[axis] = Math.min(minimum[axis], points[i]);
      maximum[axis] = Math.max(maximum[axis], points[i]);
    }
    // Direction-only authoring probes use the whole normalized cube. Production
    // fixtures retain the exact per-axis normalization of the approved study.
    if (samplesPerFixture === 1) { minimum.fill(-1); maximum.fill(1); }
    for (let i = 0; i < points.length; i++) {
      const axis = i % 3, range = maximum[axis] - minimum[axis];
      this.points[i] = range ? 2 * (points[i] - minimum[axis]) / range - 1 : 0;
    }
    this.values = new Float32Array(this.fixtureCount * samplesPerFixture);
    this.colors = new Float32Array(this.values.length * 4);
    this.forces = new Float64Array(9);
    this.warmupTicks = Math.round(warmup * TICKS_PER_SECOND);
    this.revision = 0;
    this.speed = 1;
    this.color = 'original';
    this.configure({ speed, color });
    this.select(preset, seed);
  }

  select(id, seed = this.seed) {
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) throw new Error('Unknown flocking preset.');
    this.validateSeed(seed);
    this.preset = preset;
    this.parameters = effectiveParameters(preset.parameters);
    this.restart(seed);
  }

  validateSeed(seed) {
    if (!Number.isInteger(seed) || seed < 1 || seed > 2147483646) throw new Error('Invalid seed.');
  }

  configure({ speed = this.speed, color = this.color } = {}) {
    if (!Number.isFinite(speed) || speed < .1 || speed > 3) throw new Error('Speed must be between 0.1 and 3.');
    if (!['original', 'fire', 'ice', 'palette'].includes(color)) throw new Error('Unknown color treatment.');
    this.speed = speed;
    this.color = color;
    this.revision++;
  }

  restart(seed = this.seed) {
    this.validateSeed(seed);
    this.seed = seed;
    this.tick = 0;
    this.accumulator = 0;
    const count = this.parameters.count, random = randomGenerator(seed);
    this.positions = new Float64Array(count * 3);
    this.velocities = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = random() * 2 - 1, angle = random() * Math.PI * 2, radius = Math.sqrt(1 - z * z) * .1;
      this.velocities.set([radius * Math.cos(angle), radius * Math.sin(angle), z * .1], i * 3);
    }
    // Source boids start together at the origin. Pre-roll only the simulation
    // so the slow presets already illuminate the surface when selected.
    for (let i = 0; i < this.warmupTicks; i++) this.step();
    this.tick = 0;
    this.sample();
    this.revision++;
  }

  step() {
    const p = this.positions, v = this.velocities, params = this.parameters, f = this.forces;
    const radius2 = params.radius ** 2;
    // Keep source update ordering: later boids see earlier boids' new positions.
    // One neighbor traversal computes the same three steering aggregates.
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2], vx = v[i], vy = v[i + 1], vz = v[i + 2];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, neighbors = 0;
      for (let j = 0; j < p.length; j += 3) {
        const dx = x - p[j], dy = y - p[j + 1], dz = z - p[j + 2], distance2 = dx * dx + dy * dy + dz * dz;
        if (distance2 > 0 && distance2 < radius2) {
          sx += dx / distance2; sy += dy / distance2; sz += dz / distance2;
          ax += v[j]; ay += v[j + 1]; az += v[j + 2];
          cx += p[j]; cy += p[j + 1]; cz += p[j + 2];
          neighbors++;
        }
      }
      f.fill(0);
      if (neighbors) {
        steer(sx / neighbors, sy / neighbors, sz / neighbors, vx, vy, vz, params.speed, params.force, f, 0, true);
        steer(ax / neighbors, ay / neighbors, az / neighbors, vx, vy, vz, params.speed, params.force, f, 3);
        steer(cx / neighbors - x, cy / neighbors - y, cz / neighbors - z, vx, vy, vz, params.speed, params.force, f, 6);
      }
      let nx = vx + f[0] * params.separation + f[3] * params.alignment + f[6] * params.cohesion;
      let ny = vy + f[1] * params.separation + f[4] * params.alignment + f[7] * params.cohesion;
      let nz = vz + f[2] * params.separation + f[5] * params.alignment + f[8] * params.cohesion;
      const magnitude = Math.hypot(nx, ny, nz), limit = magnitude > params.speed ? params.speed / magnitude : 1;
      nx *= limit; ny *= limit; nz *= limit;
      const px = x + nx, py = y + ny, pz = z + nz;
      v[i] = Math.abs(px) > 1 ? -nx : nx;
      v[i + 1] = Math.abs(py) > 1 ? -ny : ny;
      v[i + 2] = Math.abs(pz) > 1 ? -nz : nz;
      p[i] = clamp(px, -1, 1); p[i + 1] = clamp(py, -1, 1); p[i + 2] = clamp(pz, -1, 1);
    }
    this.tick++;
  }

  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw new Error('Invalid elapsed time.');
    this.accumulator += seconds * this.speed * TICKS_PER_SECOND;
    const steps = Math.floor(this.accumulator + 1e-9);
    if (!steps) return;
    this.accumulator = Math.max(0, this.accumulator - steps);
    for (let i = 0; i < steps; i++) this.step();
    this.sample();
    this.revision++;
  }

  sample() {
    const positions = this.positions, points = this.points, params = this.parameters;
    const stride = this.samplesPerFixture, directions = stride === STRIDE ? DIRECTIONS : 1;
    const distanceLimit2 = (2 - params.size) ** 2;
    for (let fixture = 0; fixture < this.fixtureCount; fixture++) {
      let mean = 0;
      for (let sample = 0; sample < directions; sample++) {
        const index = fixture * stride + sample, at = index * 3;
        let light = 0;
        for (let bird = 0; bird < positions.length; bird += 3) {
          const x = points[at] - positions[bird], y = points[at + 1] - positions[bird + 1], z = points[at + 2] - positions[bird + 2];
          const distance2 = x * x + y * y + z * z;
          if (distance2 < distanceLimit2) light += (1 - Math.sqrt(distance2) / 2) * params.colorize;
        }
        // The source emits an 8-bit grayscale light field. The browser shader
        // consumes linear RGB, so convert that field before applying materials.
        const value = linear(Math.round(clamp(light, 0, 1) * 255) / 255);
        this.values[index] = value;
        mean += value;
      }
      if (stride === STRIDE) this.values[fixture * stride + DIRECTIONS] = mean / DIRECTIONS;
    }
  }

  writeField(out, palette = null) {
    if (out.length !== this.values.length * 4) throw new Error('Wrong light field size.');
    const stride = this.samplesPerFixture, directions = stride === STRIDE ? DIRECTIONS : 1;
    const fire = [[.01, .0004, 0], [.7, .025, .001], [1, .36, .025], [1, .9, .5]];
    const ice = [[.005, .02, .08], [.02, .25, .7], [.25, .7, 1], [.85, .98, 1]];
    const stops = this.color === 'palette' && palette?.length ? palette : this.color === 'fire' ? fire : ice;
    for (let fixture = 0; fixture < this.fixtureCount; fixture++) {
      const mean = [0, 0, 0];
      for (let sample = 0; sample < directions; sample++) {
        const index = fixture * stride + sample, value = this.values[index], at = index * 4;
        let r = value, g = value, b = value;
        if (this.color !== 'original') {
          const t = clamp(.12 + Math.sqrt(value) * .88, 0, 1) * (stops.length - 1);
          const left = Math.min(stops.length - 2, Math.floor(t)), mix = t - left;
          r = value * (stops[left][0] * (1 - mix) + stops[left + 1][0] * mix);
          g = value * (stops[left][1] * (1 - mix) + stops[left + 1][1] * mix);
          b = value * (stops[left][2] * (1 - mix) + stops[left + 1][2] * mix);
        }
        out[at] = r; out[at + 1] = g; out[at + 2] = b; out[at + 3] = 1;
        mean[0] += r; mean[1] += g; mean[2] += b;
      }
      if (stride === STRIDE) {
        const at = (fixture * stride + DIRECTIONS) * 4;
        out[at] = mean[0] / DIRECTIONS; out[at + 1] = mean[1] / DIRECTIONS; out[at + 2] = mean[2] / DIRECTIONS; out[at + 3] = 1;
      }
    }
    this.colors.set(out);
  }

  status() {
    return {
      preset: this.preset.id, name: this.preset.name, seed: this.seed,
      seconds: this.tick / TICKS_PER_SECOND, tick: this.tick, speed: this.speed, color: this.color,
      birds: this.parameters.count, parameters: { ...this.parameters },
      simulationHz: TICKS_PER_SECOND, prerollSeconds: this.warmupTicks / TICKS_PER_SECOND,
      fixtures: this.fixtureCount, samplesPerFixture: this.samplesPerFixture,
    };
  }
}
