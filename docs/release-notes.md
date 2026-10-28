# Tiny Sphere · Contributor source preparation

Prepared 28 October 2026 from local source revision `9ffe563`, which includes the accepted 1.1 performance work and the approved camera freedom changes. The separate public camera release was Site version 45, commit `5befac40918ddcabda2ab938523864784944292f`. This prepared source tree has not been pushed to GitHub or deployed.

## In this preparation

- Organize the browser source by light shows, themes, engine, audio, camera, environment, controls, settings, and assets.
- Extract all nine existing shows without changing their sampled artwork output.
- Add a small, validated registry for shows and four named visual-theme presets.
- Add `listThemes()` and `applyTheme()` to the existing browser API.
- Add working examples, content scaffolding, a local contributor studio, portable build/test commands, and a GitHub Actions workflow.
- Add a release introduction, contributor guides, architecture/API documentation, and actual app screenshots with settings.
- Keep generated builds, historical experiments, local QA receipts, hosting identity/configuration, and machine-specific files out of the source package.

## Preserved behavior

The selected arrival state, 212 fixtures, accepted Aggressive geometry, matte white spandex wraps, modeled LED mapping, photo-guided v2 floor, full interior camera, smooth dolly leveling, music path, permanent controls, creator credits, and half-second appearance wipe remain.

New shows join the existing Vibe shift registry. Named theme presets are available through the local studio and API; the production control layout is unchanged. The captured artwork reference test covers all nine built-in shows across 216 time/palette/audio cases.

The original-code license remains undecided at the maintainer's request. See [license status](../LICENSE-STATUS.md) and [credits](../CREDITS.md).
