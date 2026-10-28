# Contributing to Tiny Sphere

The best first contribution is a light show or a theme. Start with something small, get it moving, then try it from inside the sphere and with music playing.

## Get running

Clone [SonicSphere/TinySphere](https://github.com/SonicSphere/TinySphere) and enter its directory. Use Node.js 22+ and Python 3.9+. Run `npm run dev` and open <http://127.0.0.1:4192/TinySphere/dist/>. No package installation is required. Keep port 4192 fixed.

Source edits take effect after `npm run build` and a browser refresh. The server serves the generated build; it does not watch files.

## Choose a path

- **Light show:** follow [Adding a show](docs/adding-a-show.md). Your module controls motion and light over the sphere. New shows join Vibe shift through the registry.
- **Visual theme:** follow [Adding a theme](docs/adding-a-theme.md). A small preset combines an existing show, palette, sky, and motion. Themes are available in the contributor studio and browser API.
- **Engine change:** read the [architecture](docs/architecture.md) and explain the behavior you are changing before adding abstractions.

The [contributor studio](http://127.0.0.1:4192/TinySphere/docs/playground.html) provides theme/show selection, exterior/interior cameras, a fixed-time preview, and canvas export. It is a development page and is excluded from `dist/`.

## Keep a show comfortable to use

Sample the existing sphere field instead of adding effect meshes or starting another animation loop. Reuse the shared audio analysis. Handle silence and a missing music frame. Keep a predictable seeded result so another person can reproduce your image.

Try a quiet section, an energetic section, and paused music. Check the longitude seam, both poles, and an interior view. Avoid abrupt full-screen brightness changes; include a note if a contribution intentionally changes flashing behavior.

## Check your work

Run `npm run check`. New registered shows automatically join content tests over all palettes, poles/seam positions, and quiet/active music inputs. Captured artwork references protect the existing shows; do not regenerate those references to conceal a visual change.

Then open the browser. Check desktop and compact layouts, playback/pause, Vibe shift, and any behavior you touched. Automated camera, gesture, and audio mocks do not establish physical-device or human-listening acceptance.

## Send a focused change

Include a short description, a screenshot or recording, and the state or seed used for it. Explain any intended change to existing behavior. Add source and permission information for new assets to `src/asset-provenance.json` and `CREDITS.md`.

Keep generated `dist/`, `.local/`, `.openai/`, private credentials, and machine-specific paths out of the source commit. Preserve the vendored licenses. Original project contributions use the [MIT license](LICENSE); see [LICENSE-STATUS.md](LICENSE-STATUS.md) for third-party material.

## Publishing

Every push to `main` runs `npm run check`, then publishes the verified `dist/` build to [GitHub Pages](https://sonicsphere.github.io/TinySphere/). Pull requests run the same checks without publishing. The workflow can also be run manually from the repository's Actions tab. No deployment secrets or npm publication are needed.
