import cherryDusk from './cherry-dusk.js';
import auroraAfterDark from './aurora-after-dark.js';
import honeyHour from './honey-hour.js';
import velvetDawn from './velvet-dawn.js';
import { defineThemes } from './registry.js';

export const THEMES = defineThemes([cherryDusk, auroraAfterDark, honeyHour, velvetDawn]);

export function themeState(id) {
  return Object.hasOwn(THEMES, id) ? { ...THEMES[id].state } : null;
}
