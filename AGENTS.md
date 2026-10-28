# Approved center lens continuation — 28 October 2026

Jeremy selected the full **330° diagonal** range and requested promotion to main. At the exact sphere center, continued inward wheel/pinch input widens the stereographic lens from 180° to 330°. Reversing first narrows the lens, then resumes the outward dolly. The eye stays fixed at the center during optical travel; both poles, drag direction, orbit and View reset retain their current behavior. Keep the direct single-scene render, Balanced mesh refinement and shared analytic sky/ground mapping. Existing contributor controls, appearance and music behavior remain.

Public state keeps `distance` nonnegative. The optional `lensFov` field stores 180–330° coverage at the center in saved views and shot recipes. Legacy distance-only views retain the original lens; `resetView()` restores the arrival pose and 180° lens. Negative distances from the local experiment are accepted as input aliases and normalized. Prototype controls, cube-reference renderers and QA meters are excluded from production. The 330° range is a virtual artistic lens; 360° is the stereographic singularity.

Release QA: `output/BM-WideLens/promotion/qa/` in the parent Blender workspace. Local publication candidate: **http://127.0.0.1:4192/BM-WideLens/promotion/site/dist/**. Preserve the separate experiment at **http://127.0.0.1:4192/BM-WideLens/**. Reuse the strict 4192 server.

# Tiny Sphere contributor source

- Permanent local app URL: **http://127.0.0.1:4192/TinySphere/dist/**. Contributor studio: **http://127.0.0.1:4192/TinySphere/docs/playground.html**. Release introduction: **http://127.0.0.1:4192/TinySphere/docs/release.html**. Keep port 4192 strict; report a conflict instead of selecting another port.
- Use Node.js 22+ and Python 3.9+. `npm run check` builds, runs portable tests, and checks distribution integrity. No package installation is required. `npm run dev` builds and serves the project. Rebuild after source edits; the server has no file watcher.
- Source lives in `src/`; generated `dist/`, `src/load-manifest.js`, and prepared runtime geometry are ignored by Git. Do not edit generated files manually.
- Add light shows under `src/shows/` and theme presets under `src/themes/`, then register them explicitly. Follow `CONTRIBUTING.md` and the two authoring guides. Keep shows deterministic, DOM-free, and independent of the camera/audio lifecycle.
- Keep one scene, animation loop, music connection, permanent control bar, and shared appearance wipe. Preserve the selected arrival state and existing saved-view/API compatibility unless a task explicitly changes them.
- Preserve the approved model: 212 fixture centers, 672 geodesic tubes, 15 wooden members, and 215 hardware instances. The rendered Aggressive cloth/terrain mesh inputs are selected; do not introduce an adaptive or more extreme geometry variant as an incidental change. Preserve the matte white wraps, modeled LED sampling, selected photo-guided v2 floor, interior camera freedom, and dolly leveling.
- Keep Three.js/Lucide licenses, creator credits, asset hashes, and provenance. The original-code release license is intentionally undecided; do not assign one without maintainer direction. Model/music release permissions are separate.
- Screenshots must come from the actual app. Keep saved state with release captures; do not pass generated illustrations off as screenshots. Browser automation is separate from human listening and physical-device acceptance.
- This is a standalone source preparation. Do not overwrite the existing viewer or historical experiments, publish a Site, push GitHub, recreate native authoring work, or synchronize Google Drive as part of routine source edits.
- Deliver reports in HTML. Do not produce a PDF unless explicitly requested.

## Approved direct fisheye — 28 October 2026

- Jeremy approved the curved 12 mm reference for main and this contributor tree. `src/camera/fisheye.js` draws one scene pass; `fisheye-lens.js` contains the shared mapping; `fisheye-mesh.js` prepares linear 50 cm refinement and restores original meshes outside. Preserve the exact-pole correction and current camera freedom/dolly leveling.
- Lens is an ideal Samyang-style stereographic approximation normalized to 180° diagonal, not a calibrated optical model. Keep the perspective focal-length readout separate from this curved reference. See `docs/camera.md`. No experiment controls, renderer comparison, timing collector or session logs are included. Existing opt-in desktop tools are preserved.
- Main Site publication is tracked separately from this GitHub preparation. No GitHub remote is configured.
