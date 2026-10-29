# Add a light show

A show produces a field of light over a sphere. The renderer samples that field for the fabric and tube LEDs, then applies the shared washes, flashes, and musical phrasing.

## Start with the example

```sh
npm run new:show -- my-show
```

This creates `src/shows/my-show.js` from the tested [Longitude waves example](../examples/longitude-waves.js). Existing files are never overwritten.

Import it in `src/shows/index.js` and add it to `defineShows([...])`:

```js
import myShow from './my-show.js';

export const SHOWS = defineShows([
  lava,
  velvet,
  honey,
  aurora,
  opal,
  ember,
  strobe,
  eq,
  spectral,
  myShow,
]);
```

Keep the existing imports. A unique lowercase id is the key used by saved views and `sphereStudio.setLook()`. Registering the module makes it available to the API, Vibe shift, the studio, and content tests.

## The module contract

```js
export default {
  id: 'my-show',
  name: 'My show',
  description: 'A sentence about what it looks like.',
  palette: 'glacier',
  prepare({ seconds, seed, detail, wildness, music, palette }) {
    return { phase: seconds * 0.2 + seed * 0.001 };
  },
  sample(x, y, z, frame, palette, color) {
    color[0] = 0.1;
    color[1] = 0.5;
    color[2] = 0.8;
    return 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(z * 4 + frame.phase));
  },
};
```

`prepare()` runs once per artwork pass. Precompute animation data and colors here. A transition may evaluate two shows in one display frame.

`sample()` receives a normalized direction in a Z-up coordinate system. Mutate all three components of the reusable `color` array with **linear RGB**, then return a finite, nonnegative intensity multiplier. A sample may be visited thousands of times per frame. Avoid allocation, DOM access, network requests, and side effects in this function.

The palette contains five linear-RGB stops. Import `samplePalette` from `./math.js` to interpolate it. `seconds` is the show clock, already affected by playback speed. `detail` and `wildness` are the validated appearance controls. Use `seed` or the deterministic `hash()` helper when you need variation.

## Music

`music` can be `null`. When present, it can include `amount` (reaction strength), `energy`, ten `bands`, `tempo.pulse`, and musical `structure`. Use a quiet fallback for every value you read. Do not open another audio connection in a show.

Ordinary shows inherit the shared pulse/wash/spark response. A show that directly visualizes frequency bands can set `audioMode: 'bands'`; this suppresses the ambient wash and spark layer. The existing Spectral blobs show also uses `spectralIdle: true` to transition into its own motion in silence. Inspect [Concentric EQ](../src/shows/eq.js) and [Spectral blobs](../src/shows/spectral.js) for those examples.

## See it

### Recovered fixture-based shows

The [recovered BM shows](recovered-shows.md) use the optional
`renderField({ points, seconds, seed, out })` contract in place of
`prepare()`/`sample()`. It fills linear RGBA for every supplied XYZ point and
returns light-field statistics. The fixed 212-fixture renderer uses its exact
angular adapter; direction-only authoring probes sample the nearest fixture's
mean radiance. This path owns its source colors and effects and bypasses the
shared artwork overlays. Keep ordinary new direction-based shows on the simpler
`prepare()`/`sample()` contract.

Asset loading occurs once in the application, before the first field render.
Show evaluation remains synchronous and independent of the DOM and audio player.

```sh
npm run check
```

Open the [contributor studio](http://127.0.0.1:4192/TinySphere/docs/playground.html), choose your show, and press **Apply show**. Use **Hold frame** for repeatable comparisons. Or open the app and call `sphereStudio.setLook('my-show')` in the browser console.

Check silence, music, pause, both poles, the longitude seam, and the exact center of the sphere. Include your settings with a screenshot when proposing the contribution.
