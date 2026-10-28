# Camera and fisheye rendering

Tiny Sphere uses a curved, frame-filling fisheye at the exact sphere center. It is a Samyang/Rokinon-style 12 mm reference: an ideal stereographic curve normalized to a 180° diagonal. It is not calibrated lens optics, and the frame adapts to the viewport aspect ratio.

The renderer follows TouchDesigner Render TOP’s documented direct vertex-projection technique. The model is drawn once into the antialiased canvas. Large triangles receive linear refinement with 50 cm sphere edges and distance-based terrain edges; original positions and fixture identities remain exact. No geometric smoothing is applied. Ordinary exterior perspective uses the original mesh, and reentry reuses the prepared refinement.

The analytic sky and ground use the same ray mapping as the model. Exact vertical views use a signed-zero-safe normalized cosine for the polar angle. Both ±90° poles remain available, with the existing analytic up vector.

The lens eases toward the ordinary exterior view over 14 physical metres. Free interior viewing, ground clearance, smooth target reacquisition and exactly level dolly pullback remain. Lens settings are part of the viewer, not light shows or themes.

`camera().projection` identifies `stereographic-fisheye`, `fisheye-transition`, or `perspective`. `camera().diagonalFov` gives the actual blended diagonal coverage; `camera().fov` is the underlying perspective camera’s vertical angle. `camera().lens` records the selected approximation and calibration status. `camera().refinement` records whether the prepared mesh is active. The optional desktop lens readout reports the 12 mm reference while inside. `fullFrameEquivalentMm` is null for the curved projection because its rectilinear equivalence formula does not describe that lens.

## Sources

- [TouchDesigner Render TOP](https://docs.derivative.ca/Render_TOP): single-render fisheye projection and the need for well-tessellated geometry. This project independently implements that approach; it does not contain TouchDesigner’s internal shader source.
- [Samyang 12 mm specifications](https://samyangus.com/collections/pentax-k/products/12mm-f2-8-full-frame-fisheye): manufacturer’s nominal focal length and 180° full-frame coverage.
- [Keith Cooper’s firsthand lens test](https://www.northlight-images.co.uk/samyang-12mm-fisheye-lens-review/): stereographic geometry and comparison photographs. The review used a loaned lens and includes affiliate links.

Fewer scene renders do not guarantee a particular FPS. Refinement and fill rate still cost GPU time. Browser playback checks do not substitute for human listening or physical-device acceptance.
