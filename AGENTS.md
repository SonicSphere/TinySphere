# Public GitHub source and Pages — 28 October 2026

Jeremy requested his current Chrome band/wood material settings as main defaults
on 29 October 2026. `src/settings/material-balance.js` records the five selected
gains: bands 0.30 sky / 0.52 show spill; wood 0.82 sky / 0.55 warm tint / 0.96 show
spill. Keep the approved underlying sky settings. Warm tint is effective in
Sunrise and Sunset only. Apply the existing sleeve mask and wood tags; preserve
white spandex, wood grain, main cloths, metal, model, camera, arrival, show fields,
music and production controls. Study comparison UI, saved query overrides,
blackout and scene/camera defaults remain local. Capture and release evidence:
`../BM-MaterialBalance/promotion/qa/`.

Jeremy approved promotion of the sky-lit appearances on 29 October 2026.
`src/settings/sky-cloth.js` holds the selected material settings: sky fill 0.83,
horizon 0.68, transmission 0.21, vertical falloff 0.74, strut 1.53, wood 2.11,
cloth 0.83, shadows 0.26 and Sunset whiteness 0.58. Apply the shared analytic sky
to cloth, matte-white sleeves, struts and wood, with brighter crown and sheltered
base; no overhead sun. The baked visibility mask is geometry/hash validated.
Preserve the existing arrival camera, show, orbit, music and LED playback.
The local experiment's selected Honey scene, closer camera, master blackout,
sliders, comparison UI and study API are excluded. See `docs/sky-lighting.md`;
release evidence stays outside this repository under
`../BM-SkyCloth/promotion/qa/`. Keep the local experiment intact.

Jeremy approved the eight reviewed `BM-PatternPorts` shows for main and Vibe
shift on 29 October 2026. Register the original nine shows plus modes 1–7 and 9
under `src/shows/`; keep modes 0/8 and MIDI input excluded. Recovered shows retain
their reviewed fixed spatial texture, original colors, fixed 60 Hz simulation,
and distance-dependent cloth diffusion. Direct tube LEDs and existing looks keep
their established response. `showTime` and the seed identify the performance;
source and target clocks remain independent during the half-second wipe.
See `docs/recovered-shows.md` and `src/shows/recovered/provenance.json`.

Jeremy authorized the complete project as a public repository, public GitHub Pages website, and MIT release. The repository is **https://github.com/SonicSphere/TinySphere**; the app is **https://sonicsphere.github.io/TinySphere/**. `main` is the release branch. `.github/workflows/check.yml` checks every pull request and checks, builds, and deploys `main`. Publish only the generated `dist/` artifact to Pages. Never include credentials, local QA, or parent-workspace files. Preserve third-party license notices and creator attribution; see `LICENSE`, `LICENSE-STATUS.md`, and `CREDITS.md`.

The source history and all six selected screenshots are retained. This supersedes the earlier local-only preparation and undecided-license notes. The original Sites publication and parent workspace are tracked separately.

# Approved center lens continuation — 28 October 2026

Jeremy selected the full **330° diagonal** range and requested promotion to main. At the exact sphere center, continued inward wheel/pinch input widens the stereographic lens from 180° to 330°. Reversing first narrows the lens, then resumes the outward dolly. The eye stays fixed at the center during optical travel; both poles, drag direction, orbit and View reset retain their current behavior. Keep the direct single-scene render, Balanced mesh refinement and shared analytic sky/ground mapping. Existing contributor controls, appearance and music behavior remain.

Public state keeps `distance` nonnegative. The optional `lensFov` field stores 180–330° coverage at the center in saved views and shot recipes. Legacy distance-only views retain the original lens; `resetView()` restores the arrival pose and 180° lens. Negative distances from the local experiment are accepted as input aliases and normalized. Prototype controls, cube-reference renderers and QA meters are excluded from production. The 330° range is a virtual artistic lens; 360° is the stereographic singularity.

Release QA: `output/BM-WideLens/promotion/qa/` in the parent Blender workspace. Local publication candidate: **http://127.0.0.1:4192/BM-WideLens/promotion/site/dist/**. Preserve the separate experiment at **http://127.0.0.1:4192/BM-WideLens/**. Reuse the strict 4192 server.

# Desktop screenshot shortcut — 28 October 2026

Jeremy removed the menu entirely and requested **Press S for screenshot**, only on desktop and aligned with the existing credits. S saves a scene-only PNG directly; M does nothing. Phones, tablets and touch-only devices have neither the hint nor the shortcut. Ignore held/repeated keys, composing text, editable fields and Ctrl/Meta/Alt shortcuts. The old menu, FPS and Scene info markup/styles and per-frame readout work are removed. Existing inspection, recipe and sphere-visibility APIs stay compatible; old menu/readout setters cannot reopen UI. Preserve the two camera buttons, reset pose, current dice odds, renderer, music and arrival settings.

# Tiny Sphere contributor source

- Permanent local app URL: **http://127.0.0.1:4192/TinySphere/dist/**. Contributor studio: **http://127.0.0.1:4192/TinySphere/docs/playground.html**. Keep port 4192 strict; report a conflict instead of selecting another port.
- The GitHub introduction is plain Markdown in `README.md`, in Jeremy's direct first-person wording. No separate HTML release page, promotional slogans, or "little world" copy. Keep the six selected screenshots in Jeremy's chosen order. The retired HTML introduction is preserved outside this source tree in `../TinySphere-release-qa/plain-readme/`.
- Use Node.js 22+ and Python 3.9+. `npm run check` builds, runs portable tests, and checks distribution integrity. No package installation is required. `npm run dev` builds and serves the project. Rebuild after source edits; the server has no file watcher.
- Source lives in `src/`; generated `dist/`, `src/load-manifest.js`, and prepared runtime geometry are ignored by Git. Do not edit generated files manually.
- Add light shows under `src/shows/` and theme presets under `src/themes/`, then register them explicitly. Follow `CONTRIBUTING.md` and the two authoring guides. Keep shows deterministic, DOM-free, and independent of the camera/audio lifecycle.
- Keep one scene, animation loop, music connection, permanent control bar, and shared appearance wipe. Preserve the selected arrival state and existing saved-view/API compatibility unless a task explicitly changes them.
- The camera bar has exactly **Slow orbit** and **View reset**. View reset and `sphereStudio.resetView()` restore the approved arrival distance, azimuth, elevation and framing without changing the selected look, music or orbit setting. Close-up is removed.
- Low terrain retains conservative pixel coverage at the eye-height horizon (`topography.js`). Comparing only the center height left a one-pixel sky leak at some viewport heights during extreme dolly pullback. Keep the derivative-based footprint allowance; the 63-case before/after browser regression lives outside the release in `../TinySphere-release-qa/horizon/`.
- Preserve the approved model: 212 fixture centers, 672 geodesic tubes, 15 wooden members, and 215 hardware instances. The rendered Aggressive cloth/terrain mesh inputs are selected; do not introduce an adaptive or more extreme geometry variant as an incidental change. Preserve the matte white wraps, modeled LED sampling, selected photo-guided v2 floor, interior camera freedom, and dolly leveling.
- Keep Three.js/Lucide licenses, creator credits, asset hashes, and provenance. Original project code and materials use MIT; separately credited third-party material retains its own rights and notices.
- Screenshots must come from the actual app. Keep saved state with release captures; do not pass generated illustrations off as screenshots. Browser automation is separate from human listening and physical-device acceptance.
- Keep this standalone project portable. Do not overwrite other viewers or historical experiments, recreate native authoring work, or synchronize Google Drive as part of routine source edits. A push to GitHub `main` automatically publishes Pages; Sites publication remains separate.
- Deliver reports in HTML. Do not produce a PDF unless explicitly requested.

## Approved direct fisheye — 28 October 2026

- Jeremy approved the curved 12 mm reference for main and this contributor tree. `src/camera/fisheye.js` draws one scene pass; `fisheye-lens.js` contains the shared mapping; `fisheye-mesh.js` prepares linear 50 cm refinement and restores original meshes outside. Preserve the exact-pole correction and current camera freedom/dolly leveling.
- Lens is an ideal Samyang-style stereographic approximation normalized to 180° diagonal, not a calibrated optical model. Keep the perspective focal-length readout separate from this curved reference. See `docs/camera.md`. No experiment controls, renderer comparison, timing collector or session logs are included. Existing opt-in desktop tools are preserved.
- The `origin` remote is `https://github.com/SonicSphere/TinySphere.git`. Main Site publication is tracked separately from GitHub Pages.

- Vibe shift independently chooses **Full sphere 80% / Light tubes 10% / Bare sphere 10%**, replaces manual visibility overrides, and preserves the underlying frame/support form, camera, and audio. Bare hides both cloths and LED-tube assemblies and disables fixture spill. `sphereView` participates in the wipe, saved views, and recipes. Normal arrivals retain the approved full Classic sphere. The menu and visible readouts remain removed; their inspection APIs stay compatible.
