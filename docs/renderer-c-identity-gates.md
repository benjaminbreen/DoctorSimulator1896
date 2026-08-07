# Renderer C identity gates

## First viable gate: White women around age 30

The first viable contact sheet and Ben's annotated review are preserved at:

- `docs/artifacts/renderer-c-identity-gate/viable-women-30s-contact-sheet.png`
- `docs/artifacts/renderer-c-identity-gate/viable-women-30s-review.png`

It is reproduced by `scripts/characters/render_renderer_c_face_range_grid.py`.
The ignored working render remains under
`character-lab/.generated/renderer-c-face-range-grid/`. Do not overwrite either
output when testing another demographic.

Ben's review:

- 01 aquiline/narrow: very good; distinct and realistic.
- 02 soft/round: acceptable.
- 03 heart/high-cheek: very good.
- 04 broad/straight: acceptable.
- 06 wide-eyed/delicate: needs thicker eyebrows.
- The set is the first MPFB-based result judged viable for identity diversity.

### Process that worked

1. Start with one fixed MPFB demographic cohort rather than varying age, sex,
   clothing, and lighting at the same time.
2. Define coordinated face anchors. Each anchor changes multiple independent
   regions: head shape, forehead, eye aperture/spacing/depth, brow geometry,
   nose family, cheeks, mouth, ears, and restrained jaw/chin values.
3. Use the GNM semantic sampler offline to produce a conditioned identity
   donor. Transfer its deformation onto the baked MPFB topology; never ship the
   GNM mesh, eyes, or materials.
4. Fit MPFB eyes, irises, brows, lashes, hair, skin, and clothing after identity
   transfer. Use several brow meshes, iris colors, lash assets, and the two
   available cohort-appropriate skin maps.
5. Clamp chin height and projection explicitly. Do not use jaw magnitude as the
   main source of identity diversity.
6. Render a fixed two-row contact sheet. Judge it by whether the portraits read
   as different people, not by numeric morph distance or silhouette alone.

The gate is about neutral identity. Blink and facial-expression compatibility
remain a separate acceptance test.

## Male follow-up

`scripts/characters/render_renderer_c_male_face_range_grid.py` applies the same
method to eight White men around age 30. It uses the released GNM male/White
semantic cohort without changing those donor samples. Additional MPFB jaw and
chin controls are constrained because the male macro already enlarges the lower
face. Its accepted contact sheet is preserved at
`docs/artifacts/renderer-c-identity-gate/white-men-30s-contact-sheet.png`.

## Character Lab implementation

Renderer C now uses two reusable consultation masters rather than baking a new
GLB for every patient. Build them with `npm run renderer-c:masters`.

- `renderer-c-women.glb` and `renderer-c-men.glb` each contain the eight
  approved GNM-derived anchors on fixed MPFB topology.
- Each master exports 58 signed face endpoints, six body endpoints, four
  demographic endpoints, 52 MPFB face units, and two idle clips. Face, age,
  ancestry, stature, body mass, muscularity, and proportions update in Three.js
  without launching Blender.
- Every identity anchor has its own fitted MPFB eyes, sclerae/irises, brows,
  lashes, hair, and teeth. The selected set changes with the anchor. MPFB's
  asset correspondence maps transfer the demographic and live anatomy deltas
  to those fitted parts. The base garment also carries matching age, ancestry,
  mass, muscle, and proportion morphs.
- The Character Lab can generate a deterministic eight-face grid from cohort,
  age-band, ancestry, and seed controls. Each grid uses every approved anchor
  once, then adds restrained local variation. Selecting a card makes it the
  live-editable patient.
- Hair style, garment choice, accessories, and other topology-changing choices
  remain asset swaps or Blender rebuilds. Crowd and nearby LODs should remain
  baked; the parametric master is the consultation LOD.

The runtime manifest is `character-lab/public/models/renderer-c-cohorts.json`.
Do not replace the curated anchors with stock MPFB randomization; that recreates
the repeated-face problem this pipeline is intended to solve.
