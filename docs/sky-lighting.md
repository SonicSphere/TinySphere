# Sky light on the installation

`src/engine/sky-cloth.js` uses the same analytic sky as the environment. On the
first visit to each sky preset, it samples a 64 × 32 upper-hemisphere probe and
integrates nine spherical-harmonic coefficients in linear color. Cached probes
supply diffuse sky and horizon light to the cloth, metal and wood. The existing
show field still supplies the emitted light; its colors and clocks are unchanged.

`src/settings/sky-cloth.js` holds the approved material response: sky fill 0.83,
horizon light 0.68, cloth transmission 0.21, vertical falloff 0.74, strut gain
1.53, wood gain 2.11, cloth gain 0.83, shadow depth 0.26 and Sunset whiteness
0.58. These are material settings, independent of the first-arrival look,
camera, playback, and LED brightness. The public site has no study sliders.

The cloth and matte-white sleeves receive broad sky light with a smooth height
gradient. Lower fabric is more sheltered. Sunset whitening only affects this
reflected cloth light. Starry night bypasses the extra occlusion and whitening
and retains the reviewed faint night response. Metal retains its surface shading;
wood retains its original texture. Each appearance-wipe pass updates the probe
uniforms for its own sky. The same attributes interpolate through center-lens
refinement and return to their original geometry outside the sphere.

The selected band and wood response is in `src/settings/material-balance.js`.
Relative to the base materials, the bands return 30% of sky light and 52% of
grouped show-light spill. Wood returns 82% of its sky light and 96% of its
point-light/ground-bounce show spill. In Sunrise and Sunset, its reflected sky
retains 55% of the original color saturation; the other skies retain their tint.
`src/engine/material-balance.js` applies these fixed gains through the existing
sleeve mask and wood material tags. The unmasked cloth, metal, light-field colors,
wood texture, geometry and sky are unchanged. Each wipe pass updates the warm-sky
response for its own atmosphere. The local comparison controls are excluded.

Soft ambient shade comes from `cloth-sky-visibility.bin.gz`, a per-vertex sky
visibility mask baked against the accepted cloth, frame and supports. Its JSON
metadata records the model hash, decoded hash, 98,683 vertices, 24 upper-sky rays
per vertex and 226,184 occluding triangles. The runtime verifies the mask's hash,
range and geometry before using it. Original positions, triangles and fixture
identities are unchanged.

Normal builds use the included mask and need no Blender installation. To
regenerate it after an intentional model change, run `npm run build`, then use
Blender's Python with factory startup:

```sh
blender --background --factory-startup --python scripts/bake-sky-occlusion.py -- .
```

Rebuild and run `npm run check` afterwards. Review all four skies, a close-up,
the center lens and sky-to-sky wipes when changing shaders or the mask.

This is a diffuse-sky approximation with thin-fabric transmission and a small
ground-bounce term. It adds no direct sun, calibrated photometry or changing
LED shadow rays.
