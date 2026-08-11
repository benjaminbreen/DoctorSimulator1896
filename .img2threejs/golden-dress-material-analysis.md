# Golden dress material correction

## Screenshot observations

- Target: the Renderer C golden dress, shown seated in Character Lab.
- The garment geometry and silhouette are readable enough for a material-only correction.
- White, continuous highlights cover the sleeves, lap, lower skirt and trim.
- The highlights are broad and smooth rather than broken by cloth roughness.
- The silk weave normal is visible as large diagonal ridges, especially on the skirt.
- The selected roughness control is 1.35, yet the garment remains strongly reflective.
- Skin, hair, chair and background do not show the same continuous plastic response, so the main fault is in the garment material stack rather than scene exposure alone.

## Root-cause hypothesis to verify in code

- The runtime may be multiplying a low material roughness by a low-valued roughness map, producing a much lower final roughness than either value suggests.
- Cloth sheen, anisotropy, specular intensity, environment response or clearcoat may then amplify the highlight.
- The normal-map amplitude may be too high for the intended weave scale.

## Correction contract

- Preserve all dress geometry, rigging, palettes and earlier material assets.
- Keep albedo, roughness and normal maps independent.
- Make cotton and wool matte; velvet softly directional; brocade moderately reflective; silk satin restrained but visibly smoother than wool.
- No fabric may use clearcoat or metallic response.
- The full sheen range must remain cloth-like rather than becoming coated plastic.
- Verify at least wool, silk, velvet and brocade under the same Character Lab lighting.

## Suitability

Conditional pass. The screenshot is a negative material reference rather than a target appearance, but it clearly identifies the defect and provides sufficient geometry, lighting and UI state for a bounded material correction.

## Geometry correction and review

The later screenshots showed three geometry defects that material work could
not solve: the body mask removed pixels beside the neck, the fitted front inset
ended above the waist, and sleeve faces produced jagged cuffs. The correction:

- preserves the neck and centre chest in the under-clothing body mask;
- replaces the 7 by 8 front patch with a fitted 13 by 15 inset that overlaps
  the waist, bends back to meet the collar, and has a closed shallow edge;
- removes the legacy collar fragments and irregular cuff material selection;
- builds the collar and cuffs as hollow skinned shells with inner, outer, and
  connecting edge faces;
- adds live morphs for bust coverage, collar height, cuff width, collar
  material thickness, and cuff material thickness.

The default and deliberately exaggerated maximum thickness settings were
checked in front, hand, side, and seated three-quarter views. Minimum and
maximum bust coverage both retain the throat connection. The browser console
reported no rendering errors. The focused asset test confirms the five dress
morphs and retained solid-shell triangle count after compression.

Practical fidelity estimate: 0.75 for the current technical base. It now reads
as a coherent constructed garment at gameplay distance, but the fitted front
inset and standing collar remain stylized, the skirt has no cloth simulation,
and historical cut and seam placement still need review before the dress can
be treated as approved 1896 content. Review action: stop this correction pass.
