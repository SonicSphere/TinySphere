# Browser API

After loading completes, the app exposes `window.sphereStudio`. These methods use the same state and audio paths as the visible controls.

| Method                                       | Purpose                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `listLooks()`                                | Return registered show metadata keyed by id                                         |
| `setLook(id)`                                | Select a registered show and its default palette                                    |
| `listThemes()`                               | Return registered theme metadata and settings                                       |
| `applyTheme(id)`                             | Apply a theme through the existing wipe; return state, or `false` for an unknown id |
| `getState()`                                 | Read a copy of the current appearance, clocks, and camera state                     |
| `setState(patch)`                            | Apply supported, validated state fields                                             |
| `randomizeLook()`                            | Perform the same Vibe shift as the dice button                                      |
| `sphereViewWeights()`                        | Read the independent full/tubes/bare dice weights: 80/10/10                         |
| `play()` / `pause()`                         | Start/pause the visual clocks                                                       |
| `seek(seconds)`                              | Set all visual clocks and hold the frame                                            |
| `toggleOrbit()`                              | Toggle automatic camera orbit                                                       |
| `resetView()`                                | Restore the original arrival camera and framing, preserving appearance, audio and orbit |
| `setSkyPreset(id)`                           | Select a supported sky                                                              |
| `setFormStyle(id)` / `listFormStyles()`      | Select/read the existing model forms                                                |
| `playDefaultMusic()` / `pauseDefaultMusic()` | Control Tree Voices through the existing player                                     |
| `toggleMusic()`                              | Toggle the default track                                                            |
| `connectAudio()` / `disconnectAudio()`       | Connect/disconnect optional supported desktop tab capture                           |
| `musicStatus()` / `defaultMusicStatus()`     | Read playback/source state                                                          |
| `viewURL()`                                  | Get a shareable URL carrying the current validated state                            |
| `save()`                                     | Download the state as JSON                                                          |
| `capture()`                                  | Return a PNG data URL from the actual canvas                                        |
| `wipeStatus()`                               | Inspect active/queued appearance transitions                                        |
| `camera()` / `stats()`                       | Read the current camera and scene summary                                           |
| `setDebugMenuOpen(boolean)`                  | Compatibility no-op; the menu is removed                                                |
| `setDebugFPS(boolean)`                      | Compatibility no-op; the FPS readout is removed                                               |
| `setDebugInfo(boolean)`                     | Compatibility no-op; scene inspection remains available via sceneInfo()             |
| `setClothsVisible(boolean \| null)`           | Temporarily show/hide cloths; `null` restores the selected form                       |
| `setSphereView('full' \| 'tubes' \| 'bare')` / `getSphereView()` | Select/read the desktop sphere visibility mode |
| `debugStatus()` / `clearDebug()`             | Inspect tools (including availability), or clear them and restore the selected form |
| `sceneInfo()`                               | Read current show, palette colours, and labelled scene settings                     |
| `downloadScreenshot()`                      | Save a scene-only PNG through the same action as the desktop S shortcut                      |
| `shotRecipe()` / `restoreShot(recipe)`       | Capture a complete shot recipe, or restore its held still                            |
| `copyShotRecipe()` / `downloadShotRecipe()` | Copy or download the full precision recipe JSON                                      |

```js
sphereStudio.applyTheme('honey-hour');
sphereStudio.setState({ orbit: false, distance: 0, elevation: -0.5 });
sphereStudio.pauseDefaultMusic();
sphereStudio.seek(24);
```

Appearance changes may be queued while a wipe is active. Wait until both `wipeStatus().active` and `.queued` are false before exporting a comparison image. `applyTheme()` returns the current state immediately, so it is not a transition-completion promise. `setLook()` and `setState()` ignore unsupported values.

Music and visual playback are independent. Audible startup can require a user gesture; a console call cannot bypass that browser rule. Optional tab capture opens the browser's own chooser when supported. The app never requests microphone access.

At the exact center, negative elevation looks upward; `-Math.PI / 2` looks straight up. Positive elevation looks down. The contributor studio's Interior camera starts with a gentle upward view.

Continued inward wheel/pinch input at the center widens the lens from 180° to 330° diagonal. `setState({distance:0,lensFov:330})` performs the same action. `distance` stays nonnegative and equals zero during optical travel; `lensFov` records that width in saved views and recipes. Legacy distance-only updates and `resetView()` restore 180°. Reversing the gesture narrows the lens before moving outward.

Scene info reports **Lens** in approximate millimeters, matching the rendered diagonal angle of view to a [35.9 × 23.9 mm full-frame sensor](https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000660153.html). It accounts for the current viewport aspect ratio and dolly zoom. `camera().fullFrameEquivalentMm` returns the unrounded value for exterior perspective and null while the fisheye is active; the existing FOV fields remain in degrees. Exterior values describe field of view, not optical distortion, depth of field, or a specific physical lens. Inside, inspection identifies the 12 mm fisheye reference at 180° and a virtual fisheye at wider settings, with actual diagonal coverage. See [camera rendering](camera.md).

Calling `capture()` exports the scene without the HTML controls. For reproducible imagery, pause music, disable orbit, set a seed and camera, hold all clocks with `seek()`, and save the resulting state. The contributor studio provides these controls without console commands.

The desktop-only **S** shortcut saves a scene-only PNG directly, with a small “Press S for screenshot” footer hint aligned with the credits. There is no menu or M shortcut. Phones, tablets, touch-only devices, text fields, held/repeated keys, composing text and Ctrl/Meta/Alt shortcuts do not trigger screenshots. `debugStatus().available` retains desktop eligibility; `open`, `fps` and `info` remain false. Older menu/readout setters are harmless no-ops. Existing sphere-visibility, scene-inspection and recipe APIs remain available.


## Reproduce a still

`sceneInfo()` returns the current atmosphere, theme, palette, sphere view, camera, lens, and audio title through the browser API. `shotRecipe()` and `copyShotRecipe()` preserve the complete state: camera XYZ position, target, heading, pitch, up vector, quaternion, field of view, projection, clipping distances, control angles, image dimensions, pixel ratio, renderer exposure, all artwork clocks, and appearance/motion settings. Coordinates are metres with +Z up. Heading is clockwise from +Y toward +X; positive pitch looks up. At an exact vertical view, heading follows the camera up-vector yaw because the horizontal look direction is undefined. These APIs remain available without a visible menu or readout.

The recipe also records build/model identity, the palette walk and its pending shuffle, audio features and track position, temporary cloth and light-tube visibility, and all 18,656 linear RGBA values of the rendered lighting field. Saving only the seed and song position would omit the live audio response and palette state.

```js
const recipe = sphereStudio.shotRecipe(); // after an appearance wipe finishes
// In the same application build, model, and viewport aspect ratio:
sphereStudio.restoreShot(recipe);
const png = sphereStudio.capture();
// Resume procedural animation when ready:
sphereStudio.play();
```

`restoreShot()` holds the captured light field and pauses music, orbit, and artwork. It restores the image without relying on another live audio session. Matching the recorded image dimensions, pixel ratio, browser/GPU and build is necessary for pixel-level comparisons. Different aspect ratios, model revisions, or application builds are rejected. `copyShotRecipe()` copies the JSON; `downloadShotRecipe()` downloads it. No recipe data is uploaded.


`setSphereView()` selects **Full sphere / Light tubes / Bare sphere** through a temporary desktop override. Full sphere shows the cloths, Light tubes exposes the LED assemblies, and Bare sphere hides both. These modes preserve the current frame/support selection. Bare sphere also removes the fixture light spill while retaining the selected atmosphere. The complete recipe records both visibility overrides. `setClothsVisible()` retains its earlier two-state behavior for existing callers; `clearDebug()` clears the temporary overrides. `sceneInfo()` retains **Lens** and the track-title-only **Audio** fields for existing callers.

Each Vibe shift independently chooses **Full sphere 80% / Light tubes 10% / Bare sphere 10%**, replacing manual visibility overrides and preserving the frame/support form, camera, and audio. The selected `sphereView` is part of `getState()`, saved-view URLs, the appearance wipe, and shot recipes. `setState({sphereView:'tubes'})` selects the same persistent visibility state on any device. Ordinary arrivals keep the approved full Classic sphere.
