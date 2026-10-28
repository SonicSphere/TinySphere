import { PALETTES } from '../themes/palettes.js';

// Registration is explicit so every shipped show can be reviewed and tested.
export function defineShows(definitions) {
  const shows = Object.create(null);
  for (const show of definitions) {
    if (!show || !/^[a-z][a-z0-9-]*$/.test(show.id)) throw new Error('A show needs a lowercase id');
    if (Object.hasOwn(shows, show.id)) throw new Error(`Duplicate show: ${show.id}`);
    if (!show.name || !show.description) throw new Error(`${show.id} needs a name and description`);
    if (!Object.hasOwn(PALETTES, show.palette))
      throw new Error(`${show.id} uses an unknown palette`);
    if (typeof show.prepare !== 'function' || typeof show.sample !== 'function') {
      throw new Error(`${show.id} needs prepare() and sample()`);
    }
    if (show.audioMode !== undefined && show.audioMode !== 'bands') {
      throw new Error(`${show.id} has an unknown audioMode`);
    }
    shows[show.id] = Object.freeze({ ...show });
  }
  if (!definitions.length) throw new Error('Register at least one light show');
  return Object.freeze(shows);
}
