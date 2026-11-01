# Procedural patient hats

Implemented November 1, 2026. The same geometry and performance controller run
in Face Lab and the game. All 26 curated modular appearances have a hat choice.
Seeded variations also include hats; the clinical case remains unchanged.

## Range

| Figure | Plain / working range | Everyday / dress range |
| --- | --- | --- |
| Men | Cloth cap, panelled cap, broad straw, service cap | Derby/bowler, soft Homburg, straw boater, silk top hat |
| Women | Plain straw, cloth work bonnet, ribbon sailor | Walking hat, flower-trimmed straw, velvet toque, ribbon capote, mourning bonnet |

These are 16 adjustable families, not 16 museum replicas. Bowlers, boaters,
sailors and mourning styles deliberately overlap the ranges. Class labels are
authoring filters for plausible ensembles; a hat does not establish a person's
income, occupation, marital status or bereavement. The generator's black bonnet
is an appearance option, not a new fact about a patient.

## Controls and integration

Face Lab has a **Hats** panel for style, holding hand, class range, colour,
ribbon colour, crown height, brim width, forward tilt, trimming, wear and seed.
**Vary hat** produces a repeatable choice within the selected range. The saved
character recipe includes these settings alongside face, hair and clothing.
The range does not restrict manual style selection.

`headwearGeometry.js` builds fabric crowns, curved brims and bound rims,
lining, sweatbands, cap seams, ribbon strips, flowers and feather vanes.
Typed-array textures supply woven cloth, straw, velvet-like relief, feather
barbs and mourning netting. These textures are shared across hats. Geometry
and materials are disposed when the look changes; shared textures remain
cached. The catalogue's ordinary settings stay below 12,000 triangles per hat.

`headwearPerformance.js` measures visible head-weighted vertices in the bind
frame, including the chosen hair. It excludes hidden hairstyles and facial
hair. The fit therefore follows changes to head shape and coiffure instead of
measuring a body bounding box. Low caps fit the scalp and mask covered hair in
the shader; the hair becomes visible again as the cap rises.

A reversible 3.6-second sequence reaches for the brim, closes the fingers,
lifts clear of the head, and lowers the hat beside the hip. Tied bonnets add a
two-hand release before the lift. Replacement reverses the sequence and
restores the knot. The hat stays at the measured grip contact after the hand
reaches it. Arm lengths and head transforms are preserved. The default holding
hand is left; the right wrist remains free for examination. During a two-arm
examination a held hat follows the current left-hand pose rather than pulling
the arm back to the hip.

The game removes men's hats after the entrance completes. Women keep their
hats by default. `presentation.hat.removeInside` overrides that convention;
`remove-hat` and `put-on-hat` are explicit animation gestures. A `stand-up` body
cue also requests replacement. This is an animation capability: a hat does
not add a new conversation choice or decide a clinical outcome.

The ordinary authored cast uses a work bonnet for Carmela, plain straw for
Nora, soft felt hat for Ferdinand and the existing mourning-bonnet choice for
Wilhelmina. Review presets can override these looks. Samuel's old one-piece
asset has a fused cap, so it receives no second hat. His new worker/template
review appearances have separate removable caps and hats.

## Historical references and uncertainty

- The [New York Journal fashion page, March 8, 1896](https://tile.loc.gov/storage-services/service/sgp/sgpbatches/batch_dlc_archibald_ver01/data/sn84031792/print2429/1896030801/0034.pdf)
  describes spring walking hats, sailors, tilted shapes, ribbons, violets and
  small bonnets. It informs the silhouette and trim vocabulary. Fashion
  journalism presents promoted styles, not a census of everyday dress.
- [London Museum straw hat, 1890, object 61.88/1](https://www.londonmuseum.org.uk/collections/v/object-75262/hat/)
  combines a shaped brim, artificial roses, feathers and ribbons. Its measured
  width is 322 mm. This informs the broad straw family and decorative scale.
- [Historic New England bonnet, 1890–1892, GUSN-52925](https://www.historicnewengland.org/explore/collections-access/gusn/52925)
  has a velvet-covered foundation, ribbon trim, net, ties and lining; its maker
  label names a Fulton Street, Brooklyn shop. It informs the tied velvet family.
- [London Museum bowler/riding hat, 1890](https://www.londonmuseum.org.uk/collections/v/object-128666/hat-bowler-hat-riding-hat/)
  provides a dated reference for the hard domed crown. Its riding context does
  not make the game's class assignment a historical fact.
- [Smithsonian uniform-cap record, 1881 and 1886](https://siarchives.si.edu/collections/siris_sic_108)
  describes blue cloth caps for several building occupations. This earlier
  Washington example supports a service-cap option; it is not evidence that a
  New York typesetter wore that uniform in 1896.
- [USPS letter-carrier hat images, 1894–1903](https://about.usps.com/who/profile/history/pdf/letter-carrier-hat-images1.pdf)
  reproduces period cap and helmet advertisements, including 1896 examples.
  These are occupation-specific references, not a universal worker's outfit.

The plain work bonnet, exact cap cuts, Homburg proportions, mourning veil and
colour/class combinations remain broad period interpretations. The panel cap
is an optional variant; it should not be treated as an exact reconstruction of
a particular 1896 New York trade. Indoor removal is a staging convention, not
a rule applied to every historical person. Museum and newspaper images were
consulted as references; no third-party image pixels ship in these hats.

## Review and limits

```sh
node --test game/tests/headwear.test.js
node scripts/characters/capture-headwear.mjs --motion
```

The capture runner saves all 16 families from front and profile, both gender
catalogues, removal/replacement phases on four body/head combinations, seeded
feature variations, live videos, and diagnostics in `review.json`.

For the ordinary Samuel visit, use the workflow in `gameplay-testing.md` with
`?appearancePreset=worker-base&hatDemo=1`. The playtest-only `hatDemo` flag
cycles worn, removed, replaced and removed after the entrance; it also works
with Carmela. Capture state records style, progress, attachment owner, fitted
size and hand-contact errors. Inspect the PNGs and video as well as the data.

Validation on November 1: both production builds passed, along with 785 game
tests and 18 runtime/wardrobe tests. The lab review captured 70 poses and two
live removal/replacement videos. Game replays completed the worker consultation
(15 steps), Carmela's full consultation (45), and five-step checks for Nora,
Ferdinand and Wilhelmina, with no failed final steps or browser/resource errors.
Those checks caught and fixed Nora's asset-axis alignment, Wilhelmina's mismatched
casebook name and a null-asset actor crash. Samuel's fused cap is excluded from
the removable-hat controls. Captures live under `artifacts/characters/headwear/`
and `artifacts/gameplay/headwear-*`; these generated files are ignored by Git.

The system has no general cloth collision solver, soft cap compression or
explicit animated hatpin object. Bonnet ribbons use controlled curves; net and
feather edges use alpha cutouts. Extreme manual combinations and very large
coiffures still need art review. Existing shoulder weights and finger topology
can limit the silhouette of a high reach. New head or body rigs need a visible
head-weighted surface and Mixamo-style arm/hand bones with finger joints.
