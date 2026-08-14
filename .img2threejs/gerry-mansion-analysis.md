# Gerry Mansion target analysis

Reference: `codex-clipboard-02166a0c-cdee-4c2b-91fc-610101640a6a.png`

## Identification

- Work type: late-nineteenth-century urban mansion rendered as a three-quarter architectural model.
- Broad class: masonry building with a steep slate château roof and attached entrance/conservatory volumes.
- Primary domain: object (static real-time architecture).
- Confidence: 0.97 for visible massing and façade hierarchy; lower for the hidden rear and exact historical dimensions.

## Overall form and silhouette

- Asymmetric compound cuboid footprint.
- The dominant mass is a nearly square corner pavilion occupying about 45% of the visible frontage and rising one full storey above both wings.
- Pavilion wall-to-roof hierarchy: three masonry levels above the plinth, then an approximately roof-height-equals-one-upper-storey pyramidal/hipped slate cap. The cap is steeper and narrower than the current in-game full-width roof.
- Lower wings extend along both street faces at about 65–75% of pavilion cornice height. Their broken roofline is made from short slate roof runs, wall dormers, gables, and chimneys rather than one continuous shallow prism.
- Silhouette is defined by: central high pavilion; steep narrow roof cap; paired large gabled dormers; finial; four to six capped chimneys; stepped lower wings.

## Macro, meso, and micro hierarchy

### Macro

1. Dark stone plinth and sidewalk base.
2. Rusticated/brick ground storey with round-headed openings.
3. Tall square corner pavilion with two rectangular-window storeys above the ground storey.
4. Lower west/Fifth Avenue wing.
5. Lower north/East 61st Street wing with recessed arched loggia and balcony.
6. Main steep hipped roof.
7. Lower slate roof runs.
8. Glass-and-iron conservatory/entrance canopy attached to the side wing.

### Meso

- Layered stone belt courses at the plinth, ground-storey head, upper-floor division, and pavilion cornice.
- Restrained corner quoins: shallow alternating stones, vertically continuous but not projecting like teeth.
- Tall rectangular sash windows with narrow pale surrounds, lintels, and sills.
- Round-headed ground windows with pale archivolts and masonry jambs.
- Large recessed arched loggia on the north wing, with a shallow stone balcony and balusters.
- Main-roof dormers whose side walls rise into triangular stone gables with flanking pinnacles.
- Lower-wing dormer/gable rhythm rather than evenly spaced generic dormer boxes.
- Tall brick chimneys with two-tier pale caps and recessed dark flue bands.

### Micro

- Roof finial and cross.
- Dormer pinnacle caps.
- Balcony balusters.
- Conservatory mullion grid and shallow metal roof.
- Sash meeting rails.
- Small cornice brackets/panel divisions, represented selectively rather than per historical carving.

## Spatial relationships

- `<corner pavilion, rises above, both lower wings>` with overlapping masonry masses.
- `<main hip roof, seats on, pavilion cornice>` with a broad eave overlap.
- `<large dormers, embedded in, opposing main roof planes>`; their rear housing must overlap the roof rather than float.
- `<lower roof runs, overlap, wing cornices>` and terminate against the pavilion.
- `<chimneys, penetrate, roof planes>` with bodies beginning below the visible roof surface.
- `<loggia, recessed into, north wing>`; balcony projects from the arch base/top of the ground-storey belt.
- `<conservatory, attached to, side wing ground storey>` with butt/overlap contact at the wall and base.

## Materials and finish

- Brick: warm light red-orange albedo, dielectric, matte/satin roughness approximately 0.72–0.82, shallow mortar normal.
- Dressed limestone: warm buff-gray albedo, dielectric, roughness approximately 0.68–0.78, low-frequency stone variation.
- Plinth: medium cool gray-brown stone, roughness approximately 0.8.
- Roof: blue-gray slate, dielectric, roughness approximately 0.68–0.78. Tile lines are visible in the reference but can remain texture/normal detail rather than geometry.
- Window glass: dark blue-gray with restrained reflection; opaque-looking at distance.
- Conservatory metal: dark iron, roughness approximately 0.45–0.6.

## Identity-defining visible features

1. Square high corner pavilion, not a long uniform block.
2. Very steep, narrow pavilion roof capped by a finial.
3. Two large gabled/pinnacled dormers on the pavilion roof.
4. Lower wings visibly step down from the pavilion on both sides.
5. Multiple substantial brick chimneys with pale layered caps.
6. Strong layered pale-stone belts and cornices.
7. Round-headed ground-storey openings.
8. Recessed monumental arch/loggia and balcony on the north façade.
9. Glass-and-iron side conservatory/entrance enclosure.
10. Warm red brick field with controlled pale quoins.

## Current-model mismatch

- The current pavilion is only slightly taller than the wing and reads as one long rectangular façade.
- Its roof is too broad relative to the pavilion and lacks the target's tower-like vertical rise.
- The lower wings do not have enough broken gables/chimney rhythm.
- The target has a third masonry level in the dominant pavilion; the current view gives the pavilion and wings nearly the same two-storey upper grid.
- The current model lacks the north loggia depth, balustrade language, and side conservatory.
- Current quoins are improved from the first pass but remain visually isolated blocks rather than a controlled vertical corner system.

## Uncertainty and approximation

- The reference is a stylized reconstruction, not measured survey geometry; proportions are visual targets.
- Rear massing, rear roof planes, and rear window layout are hidden.
- Exact brick and limestone hues are lighting-dependent.
- The conservatory interior and hidden attachment wall are occluded.
- Implementation should be declared an approximate low-poly interpretation optimized for the game, with fidelity prioritized on the two street faces and skyline.
