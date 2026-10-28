import { SHOWS } from '../shows/index.js';
import { PALETTES } from './palettes.js';
import { SKY_PRESETS } from '../environment/time-of-day.js';

// Theme presets change appearance; camera, playback and model remain user choices.
const ranges = { flowSpeed: [0.1, 10], detail: [0.45, 2.1], wildness: [0, 1] };
const keys = new Set(['look', 'palette', 'atmosphere', ...Object.keys(ranges)]);

export function defineThemes(definitions) {
  const themes = Object.create(null);
  for (const theme of definitions) {
    if (!theme || !/^[a-z][a-z0-9-]*$/.test(theme.id))
      throw new Error('A theme needs a lowercase id');
    if (Object.hasOwn(themes, theme.id)) throw new Error(`Duplicate theme: ${theme.id}`);
    if (!theme.name || !theme.description || !theme.state)
      throw new Error(`${theme.id} needs metadata and state`);
    const { state } = theme;
    if (!Object.hasOwn(SHOWS, state.look)) throw new Error(`${theme.id} uses an unknown show`);
    if (!Object.hasOwn(PALETTES, state.palette))
      throw new Error(`${theme.id} uses an unknown palette`);
    if (!SKY_PRESETS.includes(state.atmosphere)) throw new Error(`${theme.id} uses an unknown sky`);
    for (const [key, value] of Object.entries(state)) {
      if (!keys.has(key)) throw new Error(`${theme.id}: ${key} is not a theme setting`);
      if (
        key in ranges &&
        (!Number.isFinite(value) || value < ranges[key][0] || value > ranges[key][1])
      ) {
        throw new Error(`${theme.id}: ${key} is outside its supported range`);
      }
    }
    themes[theme.id] = Object.freeze({ ...theme, state: Object.freeze({ ...state }) });
  }
  return Object.freeze(themes);
}
