import { SHOWS } from '../src/shows/index.js';
import { THEMES } from '../src/themes/index.js';

console.log(JSON.stringify({ shows: Object.keys(SHOWS), themes: Object.keys(THEMES) }));
