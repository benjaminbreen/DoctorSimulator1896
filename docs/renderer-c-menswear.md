# Renderer C men's wardrobe

Status: working implementation with provisional historical labels. Ben must
approve the historical interpretation before these labels become game content.

## Runtime architecture

Renderer C exports two fitted MPFB garments with each male cohort: one tailored
carrier for suits and one simpler shirt-and-trouser carrier for working clothes.
Both keep their original skeleton weights and body-build morphs. This gives the
clothing continuous deformation across the neck, shoulders, elbows, waist,
hips, knees, and ankles.

At runtime, Character Lab identifies each carrier's connected cloth regions and
assigns separate materials for coat, trousers, waistcoat, shirt, collar, and
hardware. The wardrobe families switch between and reshape those weighted
regions. Only one carrier is rendered at a time. They do not add rigid limb
tubes, derive clothes from masked body polygons, or replace the current patient
with a fixed body.

Body and identity changes follow this sequence:

1. Renderer C applies the selected identity anchor and body morphs.
2. Both garments' matching morph targets follow the current body immediately.
3. When the slider is released, Three.js reapplies the chosen coat and trouser
   silhouette to the fitted carrier. Blender is not involved.

Material, palette, pattern, and wear controls update immediately. Coat length,
coat fullness, lapel width, trouser width, waistcoat fit, collar proportions,
working layer, and professional coat cut rebuild only the small runtime
silhouette state and do not require a GLB export.

## Provisional wardrobe families

- `mens-working-clothes`: the dedicated shirt-and-trouser carrier, with braces
  or waistcoat material blocking; a practical jacket switches to the tailored
  carrier.
- `mens-sack-suit`: sack coat, waistcoat, shirt, and trousers with restrained
  neck and lapel proportions.
- `mens-formal-suit`: morning-cutaway or frock-coat treatment with a sober
  professional palette.
- `mens-mourning-suit`: the professional construction with a controlled black
  palette.

These are art-direction categories, not final historical claims. Useful review
references include the Metropolitan Museum's 1894 American morning suit and
1890–95 American suit, the Library of Congress's 1895 tailoring manual, and the
Smithsonian's 1875–96 work-trouser object record.

## Curated palettes

The deterministic patient generator selects from class-appropriate muted
families: two working palettes, three tradesman palettes, two professional
palettes, and mourning. `custom` is available for manual art direction and is
activated automatically when the existing main or trim color is edited.

Pattern choices are plain, twill, herringbone, and pinstripe. They are subtle
procedural shader treatments so they remain lightweight on the web and do not
depend on a separate texture download per outfit.

## Validation gate

Before treating an outfit as approved, check:

- light, average, and heavy Renderer C body builds;
- all eight male identity anchors;
- seated front, side, and three-quarter views;
- idle shoulder, elbow, wrist, hip, and knee motion;
- no exposed body seam at the neck, shoulder, elbow, waist, or knee;
- no garment vertex outside a finite and bounded envelope;
- consultation LOD readability and mobile frame cost.

Both Renderer C cohort masters now contain `StandUp`, `StandingIdle`, and
in-place `Walk` clips in addition to their seated idle clips. Character Lab
exposes all three in the Perform row. `StandUp` is a one-shot clip and hands off
to `StandingIdle`; `Walk` closes as a two-second loop so the game can supply
world-space locomotion independently.

The fitted garments and shoes remain attached to the same weighted rig during
all three clips. Crowd LODs, gameplay navigation/root motion, authored cloth
fold normals, and final collision review remain separate gates.
