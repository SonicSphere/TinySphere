import { SHOWS, LOOK_INFO, LOOKS } from '../shows/index.js';
import { PALETTES, FLASH_ACCENTS } from '../themes/palettes.js';
import { TAU, smooth, hash, samplePalette as palette } from '../shows/math.js';
export { LOOK_INFO, LOOKS, PALETTES, FLASH_ACCENTS };

// Original surface artwork: independent flow, wash and flash layers. No effect meshes.
const linear = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
export function flashAccent(state) {
  if (state.flashColorMode === 'custom' && /^#[0-9a-f]{6}$/i.test(state.flashColor || ''))
    return [1, 3, 5].map((i) => linear(parseInt(state.flashColor.slice(i, i + 2), 16) / 255));
  return (FLASH_ACCENTS[state.palette] || FLASH_ACCENTS.abyss).map((c) => c * 0.82 + 0.18);
}
function direction(seed) {
  const z = hash(seed) * 1.9 - 0.95,
    a = hash(seed + 9817) * TAU,
    r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}
export function spectralMusicPresence(music) {
  return (music?.amount ?? 0) > 0
    ? smooth(0.015, 0.12, Math.max(music.energy ?? 0, ...(music.bands ?? [])))
    : 0;
}
function burstEnvelope(age, build) {
  if (age < 0 || age > build + 3.6) return { build: 0, pulse: 0 };
  if (age < build) return { build: smooth(0, 1, age / build), pulse: 0 };
  const tail = age - build;
  // A flashbulb fires immediately, then loses energy continuously into the live flow.
  const pulse = Math.exp(-tail * 2.15) * (1 - smooth(3.1, 3.6, tail));
  return { build: 0, pulse };
}
export function effectSnapshot(seconds, state) {
  const seed = Number(state.seed) || 1;
  const washTime = state.washTime ?? seconds * (state.washSpeed ?? 3),
    flashTime = state.flashTime ?? seconds * (state.flashSpeed ?? 1.6),
    realTime = state.realTime ?? seconds;
  const every = state.washEvery ?? 18,
    amount = state.washAmount ?? 0.35,
    washes = [];
  const cycle = Math.floor(washTime / every);
  for (let k = cycle - 1; k <= cycle; k++) {
    const start = k * every + hash(seed + k * 79 + 305) * every * 0.14,
      age = washTime - start,
      duration = 4.5;
    if (age >= 0 && age < duration && amount > 0) {
      const progress = age / duration;
      washes.push({
        axis: direction(seed + k * 137 + 713),
        front: -1.35 + 2.7 * progress,
        width: 0.14 + hash(seed + k * 331) * 0.14,
        power: amount * Math.pow(Math.sin(Math.PI * progress), 0.4) * 1.9,
        tint: hash(seed + k * 41),
      });
    }
  }
  const duration = state.buildTime ?? 4;
  let burst = burstEnvelope(
    Number.isFinite(state.burstAt) ? realTime - state.burstAt : -1,
    duration,
  );
  if (state.autoBurst) {
    const interval = state.burstEvery ?? 24,
      phase = ((realTime % interval) + interval) % interval;
    for (const age of [phase - (interval - duration), phase + duration]) {
      const e = burstEnvelope(age, duration);
      burst = { build: Math.max(burst.build, e.build), pulse: Math.max(burst.pulse, e.pulse) };
    }
  }
  const intensity = state.flashIntensity ?? 0.7,
    count = Math.round(state.flashCount ?? 12),
    size = state.flashSize ?? 0.2,
    flashes = [];
  const lanes = Math.min(100, Math.round(count * (1 + burst.build * 1.6)));
  if (intensity > 0)
    for (let lane = 0; lane < lanes; lane++) {
      const salt = seed + lane * 7919,
        period = 1.8 + hash(salt) * 2.4;
      const clock = flashTime + hash(salt + 53) * period + burst.build * burst.build * 6;
      const cycle = Math.floor(clock / period),
        age = clock - cycle * period;
      const attack = 0.055 + hash(salt + cycle * 19) * 0.065,
        release = 0.34 + hash(salt + cycle * 23) * 0.27;
      if (age < attack + release) {
        const pulse =
          age < attack
            ? smooth(0, attack, age)
            : Math.exp(-Math.pow(((age - attack) / release) * 2.9, 1.4));
        flashes.push({
          axis: direction(salt + cycle * 104729),
          width: size * (0.75 + hash(salt + cycle * 31) * 0.65),
          power:
            pulse * intensity * (0.8 + hash(salt + cycle * 47) * 1.4) * (1 + burst.build * 0.7),
        });
      }
    }
  return {
    washes,
    flashes,
    build: intensity > 0 ? burst.build : 0,
    burst: burst.pulse * intensity * (state.burstIntensity ?? 1.5),
    accent: flashAccent(state),
  };
}
// Call once after constructing the fixed sample field. Float64 preserves both
// historical normalization steps exactly, including their rounding. Raw arrays
// still work and are prepared afresh, so mutable callers cannot get stale data.
export function prepareArtworkPoints(points) {
  const directions = new Float64Array(points.length),
    flowDirections = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const length = Math.hypot(points[i], points[i + 1], points[i + 2]) || 1;
    const x = points[i] / length,
      y = points[i + 1] / length,
      z = points[i + 2] / length;
    directions[i] = x;
    directions[i + 1] = y;
    directions[i + 2] = z;
    const flowLength = Math.hypot(x, y, z) || 1;
    flowDirections[i] = x / flowLength;
    flowDirections[i + 1] = y / flowLength;
    flowDirections[i + 2] = z / flowLength;
  }
  return { directions, flowDirections, length: points.length };
}

export function renderArtwork(points, seconds, state, out, music = null) {
  const { directions, flowDirections } = points.directions ? points : prepareArtworkPoints(points);
  const seed = Number(state.seed) || 1,
    look = Object.hasOwn(LOOK_INFO, state.look) ? state.look : 'lava';
  const p = state.paletteColors || PALETTES[state.palette] || PALETTES[LOOK_INFO[look].palette],
    c = [0, 0, 0];
  const show = SHOWS[look];
  const spectralIdle = show.spectralIdle ? 1 - spectralMusicPresence(music) : 0;
  if (show.spectralIdle && music)
    music = { ...music, amount: (music.amount ?? 0) * (1 - spectralIdle) };
  const reaction = music?.amount ?? 0;
  const phrasing = state.musicalPhrasing !== false && reaction > 0 ? music?.structure : null;
  const rise = phrasing?.crescendo ?? 0,
    build = phrasing?.buildup ?? 0,
    breakdown = phrasing?.breakdown ?? 0,
    drop = phrasing?.drop ?? 0;
  const equalizer = show.audioMode === 'bands',
    pulse = equalizer ? 0 : (music?.tempo?.pulse ?? 0);
  const flow = show.prepare({
      seconds,
      seed,
      detail: (state.detail ?? 1) * (1 + reaction * (pulse * 0.12 + build * 0.22)),
      wildness: state.wildness ?? 0.65,
      music,
      spectralIdle,
      palette: p,
    }),
    fx = effectSnapshot(
      seconds,
      reaction > 0 || equalizer ? { ...state, autoBurst: false } : state,
    );
  const underlying = reaction > 0 || equalizer ? 0 : 1;
  const musicWaves =
    !equalizer && reaction > 0 && (state.washAmount ?? 0.35) > 0 ? music.waves : [];
  const musicSparks =
    !equalizer && reaction > 0 && (state.flashIntensity ?? 0.7) > 0 && (state.flashCount ?? 12) > 0
      ? music.sparks.slice(-Math.round(state.flashCount ?? 12))
      : [];
  const buildPower = 1 - 0.22 * fx.build * fx.build;
  const reactionPower =
    1 + reaction * (-0.7 + (music?.energy ?? 0) * 0.8 + pulse * (phrasing ? 0.55 : 1.35));
  const phrasePower = 1 + reaction * (rise * 0.32 + build * 0.2 - breakdown * 0.55);
  const charge = fx.build ** 5 * 0.1;
  const global =
    fx.burst * 4.5 +
    (equalizer
      ? (music?.subPulse ?? 0) *
        reaction *
        (state.flashIntensity ?? 0.7) *
        (state.burstIntensity ?? 1.5) *
        2.2
      : 0) +
    drop * reaction * (state.flashIntensity ?? 0.7) * (state.burstIntensity ?? 1.5) * 0.8;
  const washes = underlying ? fx.washes : [],
    flashes = underlying ? fx.flashes : [];
  for (const e of washes) {
    e.color = [0, 0, 0];
    palette(p, 0.48 + e.tint * 0.36, e.color);
  }
  const waves = musicWaves.map((e) => {
    const progress = e.age / e.duration,
      color = [0, 0, 0];
    palette(p, 0.4 + e.tint * 0.4, color);
    return { ...e, front: 1 - progress * 2, decay: Math.exp(-progress * 1.6), color };
  });
  const sparks = musicSparks.map((e) => ({ ...e, decay: Math.exp(-e.age * 9) }));
  let flashing = 0,
    washing = 0;
  for (let i = 0, j = 0; i < points.length; i += 3, j += 4) {
    const x = directions[i],
      y = directions[i + 1],
      z = directions[i + 2];
    const power =
      show.sample(flowDirections[i], flowDirections[i + 1], flowDirections[i + 2], flow, p, c) *
      buildPower *
      reactionPower *
      phrasePower;
    let r = c[0] * power,
      g = c[1] * power,
      b = c[2] * power,
      flash = 0,
      wash = 0;
    for (const e of washes) {
      const dot = x * e.axis[0] + y * e.axis[1] + z * e.axis[2],
        v = (dot - e.front) / e.width;
      const light = Math.exp(-v * v) * e.power * underlying;
      wash += light;
      const wc = e.color;
      r += light * (wc[0] * 0.72 + fx.accent[0] * 0.28);
      g += light * (wc[1] * 0.72 + fx.accent[1] * 0.28);
      b += light * (wc[2] * 0.72 + fx.accent[2] * 0.28);
    }
    for (const e of flashes) {
      const dot = x * e.axis[0] + y * e.axis[1] + z * e.axis[2];
      flash +=
        Math.exp((dot - 1) / Math.max(0.0001, e.width * e.width * 0.36)) * e.power * underlying;
    }
    for (const e of waves) {
      const dot = x * e.axis[0] + y * e.axis[1] + z * e.axis[2];
      const light =
        Math.exp(-(((dot - e.front) / 0.3) ** 2)) *
        e.decay *
        e.power *
        reaction *
        (state.washAmount ?? 0.35) *
        3.5;
      const wc = e.color;
      r += light * wc[0];
      g += light * wc[1];
      b += light * wc[2];
      wash += light;
    }
    for (const e of sparks) {
      const dot = x * e.axis[0] + y * e.axis[1] + z * e.axis[2],
        width = state.flashSize ?? 0.2;
      flash +=
        Math.exp((dot - 1) / Math.max(0.0001, width * width * 0.5)) *
        e.decay *
        e.power *
        reaction *
        (state.flashIntensity ?? 0.7) *
        2;
    }
    r += (flash + charge + global) * fx.accent[0];
    g += (flash + charge + global) * fx.accent[1];
    b += (flash + charge + global) * fx.accent[2];
    if (flash + global > 0.3) flashing++;
    if (wash > 0.15) washing++;
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = 1;
  }
  return {
    flashingRegions: flashing,
    washingRegions: washing,
    eventCount: (underlying ? fx.flashes.length : 0) + musicSparks.length,
    washCount: (underlying ? fx.washes.length : 0) + musicWaves.length,
    burstProgress: fx.build,
    burstPeak: fx.burst,
    musicEnergy: music?.energy ?? 0,
    spectralIdle,
    musicalSection: phrasing?.section ?? 'ambient',
    crescendo: rise,
    buildup: build,
    bassReturn: drop,
  };
}
