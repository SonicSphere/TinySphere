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
| `play()` / `pause()`                         | Start/pause the visual clocks                                                       |
| `seek(seconds)`                              | Set all visual clocks and hold the frame                                            |
| `toggleOrbit()`                              | Toggle automatic camera orbit                                                       |
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

```js
sphereStudio.applyTheme('honey-hour');
sphereStudio.setState({ orbit: false, distance: 0, elevation: -0.5 });
sphereStudio.pauseDefaultMusic();
sphereStudio.seek(24);
```

Appearance changes may be queued while a wipe is active. Wait until both `wipeStatus().active` and `.queued` are false before exporting a comparison image. `applyTheme()` returns the current state immediately, so it is not a transition-completion promise. `setLook()` and `setState()` ignore unsupported values.

Music and visual playback are independent. Audible startup can require a user gesture; a console call cannot bypass that browser rule. Optional tab capture opens the browser's own chooser when supported. The app never requests microphone access.

At the exact center, negative elevation looks upward; `-Math.PI / 2` looks straight up. Positive elevation looks down. The contributor studio's Interior camera starts with a gentle upward view.

Calling `capture()` exports the scene without the HTML controls. For reproducible imagery, pause music, disable orbit, set a seed and camera, hold all clocks with `seek()`, and save the resulting state. The contributor studio provides these controls without console commands.
