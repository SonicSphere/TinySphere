# How Tiny Sphere fits together

The app is a static site built from native JavaScript modules. `src/app.js` connects a single scene, animation loop, camera, audio session, and control bar.

```text
audio element / optional tab capture
           ↓
shared worklet + analysis worker → music features
                                      ↓
show.prepare() → show.sample() → shared effects → radial light texture
                                                     ↓
                                    fabric + tube LEDs + grouped spill
                                                     ↓
                                   one scene + camera → browser canvas
```

`src/shows/` owns animation math. A show prepares per-frame data and samples linear RGB plus intensity over normalized sphere directions. The field drives 21 angular samples and one center sample per fixture. The same angular field colors the tube LEDs; cloth-center light is excluded from exposed-tube illumination.

`src/themes/` owns named appearance presets and palettes. Registries provide explicit, reviewable content lists. The app exposes them through its browser API. The theme preset changes appearance through the existing half-second wipe and preserves camera and audio.

`src/engine/` loads and decodes geometry, prepares the sample field, applies shared artwork effects, maps LED colors, and composites transitions. During a wipe, both looks use the same scene and camera. The accepted performance geometry keeps 212 fixtures and the original frame layout while reducing displayed cloth and terrain detail.

`src/audio/` owns default-track playback, optional desktop tab capture, the worklet, and analysis worker. Playback has one direct speaker route. Preparation, playback, and analysis readiness are separate; a delayed analysis worker must not delay or duplicate the audible music. Browser autoplay policy still applies.

`src/camera/` owns orbit, gestures, full interior viewing, and dolly-lens math. Input gestures preserve the viewer's orbit choice. `src/environment/` owns the skies, photo-guided playa, terrain, and grouped light spill. `src/ui/` holds the permanent controls and loading state. `src/settings/arrival-defaults.js` preserves the selected first-arrival look; explicit saved-view links can override it.

## Assets and builds

`src/assets/` contains the original browser model, terrain, textures, and bundled track. `assets/geometry-aggressive/` contains accepted mesh inputs and their manifest. Both are required to reproduce the build without the original authoring applications.

`scripts/build.py` validates the content registries, prepares the accepted geometry, and writes generated metadata and `src/load-manifest.js`. It then emits `dist/`, applying one revision to the entire module graph, including workers and worklets. Unchanged model, texture, and music URLs use their own content revisions. Full source geometry, old venue assets, development pages, and source-only inputs are excluded from `dist/`.

Generated files are ignored by Git and reconstructed with `npm run build`. The source release has no dependency on sibling projects, absolute workstation paths, hosting credentials, or old QA folders.

## Boundaries

Keep new shows independent of the DOM, audio capture, camera, and model. Prefer a small registered module over a new rendering layer or generic plugin framework. Model edits, shader edits, and playback changes need focused regression coverage beyond content tests.

The fixture geometry, LED winding, material response, grouped spill, and contextual terrain are visual approximations. This viewer is not a calibrated lighting simulation or a surveyed installation plan. Original project code is MIT licensed; asset provenance and third-party rights are recorded in [the license status](../LICENSE-STATUS.md) and [credits](../CREDITS.md).
