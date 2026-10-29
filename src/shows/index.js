import lava from './lava.js';
import velvet from './velvet.js';
import honey from './honey.js';
import aurora from './aurora.js';
import opal from './opal.js';
import ember from './ember.js';
import strobe from './strobe.js';
import eq from './eq.js';
import spectral from './spectral.js';
import { RECOVERED_SHOWS } from './recovered/index.js';
import { defineShows } from './registry.js';

// Add an import and one entry here. No renderer changes are needed.
export const SHOWS = defineShows([lava, velvet, honey, aurora, opal, ember, strobe, eq, spectral, ...RECOVERED_SHOWS]);
export const LOOK_INFO = Object.freeze(
  Object.fromEntries(
    Object.values(SHOWS).map(({ id, name, description, palette }) => [
      id,
      { name, description, palette },
    ]),
  ),
);
export const LOOKS = Object.freeze(
  Object.fromEntries(Object.values(SHOWS).map(({ id, name }) => [id, name])),
);
