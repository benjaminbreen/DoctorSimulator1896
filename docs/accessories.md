# Modular accessories, November 1, 2026

The character lab and Renderer C game actors share the accessory builders in
`shared/characters/accessoryGeometry.js` and fitting code in
`shared/characters/periodAccessories.js`. They support Carmela, the seamstress,
the lean and broad men, and the complete worker. Older actors without the
modular face anchors keep their existing appearance.

## Choices and variations

| Family | Choices | Variation |
| --- | --- | --- |
| Spectacles | Round wire, oval wire, oval pince-nez, rimless pince-nez | Steel, silver, gold, blackened metal; clear, blue, smoke or green lenses; lens size, bridge width, height, depth and wire weight |
| Neckwear | Original garment, none, bow, hanging tie, cravat, work neckerchief | Seven colours; plain, stripe, spots or diamonds; size and cloth wear |
| Brooches | Oval stone, cameo, bar, faceted black | Four metals and five stone colours |
| Earrings | Studs, pearl drops, stone drops, black drops | Metal and stone colours |
| Lockets | Oval or round, with chain | Four metals |
| Tie pins | Plain, pearl or stone stickpin | Metal and stone colours |
| Watch chains | Single or double | Four metals |

Every family also has a none option. Tie pins are suppressed with a bow,
neckerchief or no neckwear. These are small representative period forms,
not replicas of individual museum objects.

Use **Accessories** in the lab for the controls and the **Accessories** camera
button for a close collar/chest view. **Vary accessories** has plain, everyday
and dress ranges. Its seed and all selections are included in the ordinary
saved character recipe. The random stream is independent of the existing face,
hair, body and hat streams, so adding accessories does not scramble those looks.
The 26 curated appearances have explicit accessory selections. Carmela's ordinary
game appearance now includes a small garnet-coloured brooch and studs.

The ranges are authoring conveniences. They do not establish a person's class,
occupation, vision, diagnosis or case facts. Tinted lenses are deliberately
uncommon in generated recipes; that probability is a design choice, not an
estimate of historical prevalence. Every manual option is available to either
cohort.

## Fit and rendering

Spectacles use the deformed eye centres, nasal bridge and temple surface.
Earrings use measured earlobe regions. Frames wrap toward the temples and the
arms follow the side of the head. Pince-nez has bridge pads and no temple arms.
The fitting is rebuilt when the recipe or facial/body proportions change.
Head pieces follow the head bone. Neckwear borrows a smooth blend of nearby
garment skin weights and bends on the existing bones through GPU skinning.
Chest jewellery follows the chest bone through entrances, sitting, speech and
examination poses. Fitting and weight transfer run when the look changes, not
on every animation frame.

A small front-surface grid fits neckwear and chains to the visible garments.
An upper envelope keeps scan bumps from cutting through the cloth. Rigid
brooches use the local maximum depth so collar closures cannot pierce the stone.
The complete worker uses a lower knot position for its open shirt collar.
The neckerchief uses a smooth curved surface between the neck and shirt rather
than copying every bump in the scanned mesh.

The formal bodies contain native ties. The broad body's separate tie and
neckband are hidden as one connected component. The lean body's fused tie
uses a bounded triangle partition and shirt insert. The insert is a practical
repair for these source assets, not a general garment-removal system. Selecting
the original tie restores the original faces. Each actor owns its partition;
shared GLB geometry is restored on disposal.

Geometry is batched by component/material. Double watch chains use individual
linked ovals with four-sided wire sections. Clear lenses use a faint transparent
surface without optical magnification or an extra refraction render pass. Cloth
reuses the project's baked silk/linen textures, with procedural pattern and wear
controls. This pass adds no downloaded textures or models and uses no Tripo
credits.

Current limits: no glasses-removal gesture, clasp animation or swinging-chain
physics; necklaces follow the torso as fitted pieces. Large hairstyles can
cover earrings. Extreme feature or outfit changes still need a visual fit
review. A new base rig needs compatible anchors and its own review; the code
does not promise automatic fit to arbitrary imported humans. The source formal
collars and the lean shirt insert are less detailed than the independent metal
accessories.

## Historical references and uncertainty

- [Met, silk necktie, 1890s, C.I.43.40.4](https://www.metmuseum.org/art/collection/search/86715)
  and [American evening bow tie, ca. 1890](https://www.metmuseum.org/art/collection/search/175557)
  support the hanging and bow families. The wider cravat and work scarf are
  interpretations of period clothing types; their procedural cuts are not
  pattern reconstructions.
- [National Trust, oval pince-nez, ca. 1880–1890](https://www.nationaltrustcollections.org.uk/object/657512)
  supports the oval lens and bridge family. Round, oval, rimless and temple-arm
  choices form a practical late nineteenth-century range rather than a claim
  that every combination was equally common in New York in 1896.
- [Science Museum, dark-blue-lensed spectacles, English, 1860–1900](https://collection.sciencemuseumgroup.org.uk/objects/co151373/sunglasses-with-dark-blue-lenses)
  supports blue tinted lenses. Smoke and green are broader period-inspired
  variants; they are not replicas of this object or modern fashion sunglasses.
- [Met, American brooch, ca. 1850, gold, jet and pearls](https://www.metmuseum.org/art/collection/search/16806)
  is an earlier heirloom reference, not an 1896 specimen.
  [British Museum, French jet jewellery suite](https://www.britishmuseum.org/collection/object/H_1994-0706-1-5)
  informs the dark brooch/drop family. The black material represents glass or
  jet visually and does not identify a character as being in mourning.
- [Historic New England, round gold locket, 1880–1910](https://www.historicnewengland.org/explore/collections-access/gusn/101098)
  and [Maine Historical Society, photo locket, ca. 1880](https://www.mainememory.net/record/48415)
  support the small pendant scale and locket family.
- [Historic New England, jet watch chain, 1890–1920](https://www.historicnewengland.org/explore/collections-access/gusn/102364)
  documents a period watch-chain accessory. The game's metal single/double
  chains are general interpretations, not copies of that jet chain.

These records informed shapes, scale and the available range. No museum image
pixels or meshes are included in the shipped accessories.

## Reproduce the review

Start the lab with `npm run lab`, then run:

```sh
node scripts/characters/capture-accessories.mjs \
  --url=http://127.0.0.1:5186 \
  --output=artifacts/characters/accessories/review --motion
node --test game/tests/accessories.test.js
```

The catalogue covers 107 poses, including profiles, tinted lenses, feature
variations on five bases, all curated looks, blinks and talking, plus three
live motion recordings. It writes labelled contact sheets, individual PNGs
and diagnostics in `review.json`. `--quick` omits the curated cast.

For actual gameplay, use `game/scripts/gameplay-playtest.mjs` with
`modular-men.jsonl` and `?appearancePreset=worker-silver` or `broad-silver`.
Use `carmela-emotions.jsonl` with the ordinary Carmela appearance for her
brooch and earrings. Finish builds before replaying against a dev server.
See `docs/gameplay-testing.md` for the full commands and persistent workflow.
