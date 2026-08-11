# Laboratory bench reference analysis

## Suitability

Conditional pass for a real-time browser prop. The screenshot clearly shows
the complete outer silhouette, the stated dimensions, and the major component
layout. It does not show real timber, joinery, rear construction, underside, or
wear. Those regions must remain marked as inferred rather than reconstructed.

## Observations

- Identification: a long rectangular laboratory work bench or table with a
  lower storage shelf. Primary domain `object`; hard-surface furnishing;
  confidence 0.98.
- Overall form: bilateral assembled cuboids. Displayed dimensions are 2.4 m
  wide, 0.9 m high, and 0.72 m deep. The width is 2.67 times the height.
- Macro parts: thick rectangular worktop, four square legs, and a long lower
  shelf.
- Meso parts: shallow apron rails directly under the top; the screenshot
  suggests a front and rear rail, though the rear rail is partly occluded.
- Spatial relationships: legs overlap the underside/aprons and terminate at
  the floor; the shelf spans between the legs near the lower quarter; every
  visible structural part is in contact with another part.
- Visible material: one flat beige placeholder material with high roughness
  and no visible grain, pores, stains, fasteners, seams, or edge wear.
- Silhouette-defining features: long overhanging top, narrow square legs,
  broad open knee space, and one low shelf set inside the leg rectangle.

## Inferences to test, not source evidence

- Scrubbed deal or another pale softwood is suggested by the catalog note, not
  visually established by the screenshot.
- Slight board-edge bevels, top plank seams, darker end grain, bolt heads,
  corner blocks, and localized chemical/ink wear are plausible improvements.
- Rear stretcher construction and hidden joints cannot be recovered from this
  view. The implementation may expose them as optional parameters but must not
  present them as an exact reconstruction.

## Quality contract

The proof succeeds when it preserves the stated outer dimensions and open
silhouette, exposes editable construction parameters, renders separate named
parts, carries independent albedo/roughness/normal maps, reads as timber under
neutral and grazing light, and stays within the prop workbench budget. It fails
if the shelf floats, the legs do not contact the top/apron, the generated grain
is visibly baked with lighting, PBR channels are aliased, or texture scale
changes when the bench dimensions change.

Required review views: reference-like three-quarter, opposite three-quarter,
front elevation, and grazing material close-up.
