# Fire Fast

Fire Fast joins Vibe shift as the eighteenth show. It uses the approved **Scene
palette** treatment and smooth distance-dependent cloth diffusion. Exposed LEDs
use the direct field. Select it with `sphereStudio.setLook('fire-fast')` or in
the contributor studio. Selection and Vibe shift start it at the reviewed 1×
speed; explicit saved settings retain their own speed and simulation time.

This is the Fire Fast preset from the SonicSphere LX Flocking study: 50 boids,
fixed 60 Hz updates, seeded directions, reflecting boundaries and a 12-second
pre-roll. The source's saved velocity exceeds its own maximum; the port keeps
the same 0.05 clamp used by the approved study. Fixture samples retain the
reviewed per-axis normalization, 8-bit grayscale-to-linear conversion and
palette mapping. Each center sample is the mean of its 21 perimeter samples.

The show follows the selected scene palette, including the existing palette
walk during music playback. It bypasses additional studio flashes, washes and
audio overlays. The existing music player continues normally. `showTime` and
the seed reproduce a performance, with bounded catch-up during long seeks and
independent histories on both sides of an appearance wipe. Shot recipes hold
the exact captured light field.

Only Fire Fast is registered. The study's other presets, controls, camera and
sky defaults remain local. The main arrival and its other seventeen shows keep
their existing behavior. No hardware, OSC, MIDI or Art-Net connection is added.

## Attribution and permission

Adapted from `FlockingPattern.java` in SonicSphere/SonicSphere-LX, credited to
Mark C. Slee and Heron Arts LLC. That source credits the
[Processing Flocking example](https://processing.org/examples/flocking.html)
and records its 3D and reflecting-boundary modifications.

On 4 November 2026, the maintainer approved Fire Fast with Scene palette and
confirmed permission from Heron Arts to publish this adapted source. The
[LX license](../src/shows/flocking/LX-LICENSE.txt) and copyright notice remain.
Tiny Sphere's MIT license does not relicense this component. Source hashes,
the selected parameters and adaptation details are recorded in
[`provenance.json`](../src/shows/flocking/provenance.json).
