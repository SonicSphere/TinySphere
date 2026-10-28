# Add a visual theme

A theme is a small, named composition: a light show, a palette, a sky, and optional motion settings. It uses the existing rendering engine and leaves the camera and audio under the viewer's control.

```sh
npm run new:theme -- my-theme
```

Edit the generated `src/themes/my-theme.js`:

```js
export default {
  id: 'my-theme',
  name: 'Blue hour',
  description: 'Glacial blue folds under a quiet night sky.',
  state: {
    look: 'velvet',
    palette: 'glacier',
    atmosphere: 'stars',
    flowSpeed: 0.7,
    detail: 1,
    wildness: 0.3,
  },
};
```

Import it in `src/themes/index.js` and add it to `defineThemes([...])`. Run `npm run check`, then select it in the [contributor studio](http://127.0.0.1:4192/TinySphere/docs/playground.html) or call `sphereStudio.applyTheme('my-theme')` in the app's browser console.

## Supported settings

| Setting      | Values                                     |
| ------------ | ------------------------------------------ |
| `look`       | An id registered in `src/shows/index.js`   |
| `palette`    | A key in `src/themes/palettes.js`          |
| `atmosphere` | `sunrise`, `sunset`, `stars`, `peach-dusk` |
| `flowSpeed`  | Optional, 0.1–10                           |
| `detail`     | Optional, 0.45–2.1                         |
| `wildness`   | Optional, 0–1                              |

The first three fields are required. Unspecified motion settings keep the current value. To make the theme's motion repeatable, specify all three optional values. Camera, playback, seed, model form, brightness, and material controls are outside the theme preset. The registry rejects unsupported keys, duplicate ids, unknown references, and invalid numbers.

Named theme presets are available in the studio/API. Vibe shift continues to combine registered shows, palettes, and skies independently; it does not select a named theme as a unit. Adding a theme does not change the selected first-arrival preset.

## Add a palette

Add an entry to `PALETTES` in `src/themes/palettes.js`. Use five linear-RGB stops, each with three finite components in the 0–1 range. Add a matching three-component `FLASH_ACCENTS` entry under the same id. Existing palette transitions rely on the five-stop shape.

Run `npm run check`. The content checks exercise every registered show with every palette. The palette walk preserves the selected palette's spatial luminance while crossing into new colors; inspect the result during music playback as well as on a held frame.

Custom sky shader work belongs in `src/environment/`. That is a rendering change with a wider testing scope than a theme preset; include exterior, interior, and transition screenshots with such a change.
