# Recovered Burning Man patterns

Eight self-contained patterns from the supplied Kugel source join Vibe shift's
existing shuffle rotation, alongside the nine original looks. The shuffle avoids
immediate repeats and draws from the remaining looks before refilling its bag.

| Browser/API id | Original mode | Show |
| --- | --- | --- |
| `bm-wave` | 1 | Wave |
| `bm-orbit` | 2 | Orbit spine circle |
| `bm-spinner` | 3 | Spinner |
| `bm-ambient` | 4 | Ambient points |
| `bm-stars` | 5 | Stars |
| `bm-image` | 6 | Rotating image |
| `bm-rings` | 7 | Rings |
| `bm-bloom` | 9 | Bloom |

Select one with `sphereStudio.setLook('bm-rings')` or use the contributor studio.
OSC-position lights, video mapping, and the disconnected MIDI layer are excluded.
Rotating image uses the source's still `point.jpg`, decoded losslessly into its
RGB pixel data; it does not play a video.

The shows preserve the original colors, source-coordinate paths, 21 directional
samples, and brightness trails. Each fixture's additional center sample is the
mean linear radiance. They use a fixed 60 Hz simulation with a recorded seed.
The absent historical random seed, undefined star initialization, out-of-range
C++ byte conversion, and source-window sizing have explicit portable choices
recorded in `src/shows/recovered/provenance.json`.

Incidental source color noise remains fixed in space to avoid unintended shimmer.
Transmitted cloth light mixes over a wider angle farther from the tube, with
smooth circular interpolation to avoid radial rays. Exposed LEDs keep the direct
field. This is a visual approximation of spandex transmission, not measured
photometry. Intentional sweeps, spins, star glints, and bloom envelopes remain.

These performances keep their own colors and do not receive the studio's
additional flashes, palette walk, or music overlays. The existing music player
continues through show changes. `flowSpeed` changes playback rate; `showTime`
records the source simulation time in saved views and recipes. Selecting a new
show or seed resets that clock unless an explicit `showTime` is supplied.
`sphereStudio.seek(seconds)` seeks both the source and studio clocks. A seek
replays source simulation from its initial seed. Long saved-view seeks catch up
in bounded chunks while the UI remains responsive; `stats().recoveredSeeking`
reports progress, and shot capture waits for seeking to finish. Shot recipes hold
the exact captured field.

The shared half-second appearance wipe renders independent outgoing and incoming
performances. Existing shows retain their established light field and material
response. The recovered shows share the scene, model, camera, music connection,
visibility choices, and control bar.

The source archive includes later work and is not an untouched BM2022 release.
These ports cannot establish the content of a particular historical performance.
They do not open lighting controllers, MIDI ports, OSC, or Art-Net connections.

## Source and credits

The maintainer supplied the [Kugel archive](https://www.dropbox.com/scl/fi/4pqhpqge43hnffjwotahy/kugel.zip?rlkey=2qlgzwlyh143yryisizq8yq1l&dl=0).
Original source paths, checksums, and the image identity are recorded in the
portable provenance file. Credit belongs to the Sonic Sphere Kugel lighting
source and its contributors. No separate license file was present in the supplied
archive; the recovered source and image retain their original rights. Tiny
Sphere's MIT license does not grant a separate license to that material.
