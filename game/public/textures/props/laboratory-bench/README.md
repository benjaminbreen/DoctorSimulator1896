# Laboratory bench material proof

`pale-deal-albedo.webp` was generated with the built-in ImageGen tool as a
seamless, flat-lit pale softwood base-colour source. It is provisional art
direction, not evidence for a particular historical bench or timber species.

The prompt requested a square, de-lit, horizontally grained softwood surface
with restrained scrub wear and faint reagent discoloration, and prohibited
shadows, highlights, perspective, text, logos, strong knots, and edge seams.

`scripts/materials/build_wood_pbr.py` resizes that source to 2048 px and creates
separate height, tangent-space normal, roughness, and ambient-occlusion maps.
The runtime loads albedo as sRGB and every data map in linear colour space.
