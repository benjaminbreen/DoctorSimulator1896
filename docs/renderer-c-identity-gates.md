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
