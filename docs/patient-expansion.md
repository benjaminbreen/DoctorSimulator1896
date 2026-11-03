# Patient expansion, November 2, 2026

Five new fictional head donors and five complete clothed bodies extend the
existing Carmela, seamstress and male templates. The user approved ten original
ImageGen references before generation in the user’s Tripo Studio account.

## Sources and combinations

| Head | Donor | Compatible clothes |
| --- | --- | --- |
| H1 | Young European-American woman | C1, C2, C3 |
| H2 | Young European-American man | C4, C5 |
| H3 | Older European-American woman | C1, C2, C3 |
| H4 | Adult Black woman | C1, C2, C3 |
| H5 | Adult Chinese man | C4, C5 |

| Body | Complete outfit |
| --- | --- |
| C1 | Ivory shirtwaist, navy gored skirt, boots |
| C2 | Brown checked working dress, boots |
| C3 | Green walking jacket, ivory blouse, matching skirt, boots |
| C4 | Indigo work jacket, band-collar shirt, brown trousers, boots |
| C5 | Black frock coat, waistcoat, stand-collar shirt, striped trousers, boots |

There are 13 fitted combinations. Each selected character loads one optimized
GLB, rather than downloading the whole catalogue. This duplicates source parts
on disk but avoids runtime stitching and repeated fitting work during a visit.
The registry is `shared/characters/patientExpansion.js`.

The immutable source FBX files, original 4k textures, approved references,
prompts, export hashes and generation IDs are under
`assets/source/patient-expansion-2026-11-02`. `provenance.json` records the
Studio balance: 2,385 credits before and 1,085 after, a cost of 1,300 credits.
All ten sources used Smart Mesh P2.0, quad topology and a requested 10,000
polygons. The five bodies were auto-rigged with the Mixamo skeleton in Studio.
The generated heads on those bodies are placeholders, removed during assembly.

## Fitting and procedural controls

Each head has measured eyes, mouth, chin and native skin colour. The builder
adds fitted eyes, eyelids, lashes, lips, teeth, blink and expression controls.
Nose and chin anchors are supplied to the existing runtime identity deformer;
new donors use smaller default lower-face changes than Carmela.

The complete head is positioned from the body’s cervical joint and measured
chin, not the highest edge of the back collar. A short, textured neck join
continues into the garment. Separate placeholder heads are removed as whole
mesh islands; welded necks are removed using their UV charts. The original
collars remain part of the garment mesh. Skin and lips are opaque and
nonmetallic. The donor texture remains intact outside the neck atlas panel.
Hand colour is matched to the donor before runtime complexion adjustments.

Male grooms have independent hairline height, central peak, temple recession,
asymmetry and crown-loss controls. The default front hairline is raised clear
of the brows; the peak control changes its shape without lowering the whole
forehead. A corrective shape keeps combined height and recession changes on
the skull. Fine edge strands soften the boundary. Sideburns use measured ear
fronts and heights rather than a shared patch position. Crown loss tapers hair
volume and uses the same coverage mask for visible geometry and shadows.

Existing procedural hair, sideburns, moustaches, eyelashes, hats, spectacles,
neckwear and jewellery remain available. Garment colours can vary. The male
bodies have bounded belly and waist controls. Female skirts have a separate
seated drape fitted to the hips, lap and boots. The walking suit uses a clean
wool region for that drape so painted sleeve/hand remnants cannot appear on it.

Nine existing Mixamo clips are retargeted per body: ClinicIdle, StandingIdle,
Walk, SitDown, StandUp, SittingTalking, SittingDisbelief, SittingDisapproval and
SittingSelfSoothing. ClinicIdle places the hands on the knees. The work jacket has a short linen
band fitted inside its collar opening. Frock-coat panels render both sides;
the optimizer preserves their lining instead of culling it into thin outlines.
Sleeve and hand weights retain the source body rig. These are fitted
animation and drape approximations, not a cloth simulation.

Generated profiles select a compatible donor and outfit using their seed, age,
origin, class and occupation. This changes presentation only; it does not alter
clinical facts, disclosure, diagnosis, scores or outcomes. A donor is one
fictional individual, not a comprehensive representation of an origin group.
Middle-aged and other uncovered profiles still use existing donors.

## Rebuild and inspect

```sh
node scripts/characters/build-patient-expansion.mjs
node scripts/characters/build-patient-expansion.mjs --assemble-only --rebuild-bodies
node scripts/characters/build-patient-expansion.mjs --check
```

Set `BLENDER_BIN` if Blender is not found automatically. Head fitting is reused
with `--assemble-only`; the prepared clothing rigs are reused unless
`--rebuild-bodies` is supplied. Intermediate blends and raw GLBs are ignored.
Raw exports are staged outside the public directory; only complete meshopt and
WebP optimized files replace the served assets.

Start Face Lab with `npm run lab`, then select a new model. For a focused
capture, use:

```sh
node scripts/characters/capture-expansion-review.mjs --url=http://127.0.0.1:5186
node scripts/characters/capture-expansion-review.mjs --url=http://127.0.0.1:5186 --poses=profile,seated,standing
node scripts/characters/capture-male-grooms.mjs --url=http://127.0.0.1:5186
```

The full review covers front/profile, blink, speech, sitting, standing, sitting
down, emotional speech, feature changes, accessories and hat removal for every
combination. Export checks validate clips, facial controls, native skin
materials, donor/garment identity, anchors and file size. Inspect the resulting
PNGs; a passing export check cannot establish anatomical or visual quality.
Use the ordinary gameplay runner described in `docs/gameplay-testing.md` for
entrance, conversation and examination review. Under `playtest=1`,
`appearancePreset=female-black-walking-suit` (or any of the 13 IDs) overrides
appearance while preserving the selected clinical case.

## Historical basis and limits

The [Met shirtwaist, 1896–98](https://www.metmuseum.org/art/collection/search/109506)
and [Met suit, 1890–95](https://www.metmuseum.org/art/collection/search/91980)
informed the female garment range. The Fashion Archives museum catalogue
[Our New Old Clothes](https://fashionarchives.org/wp-content/uploads/2023/02/Our-New-Old-Clothes.pdf)
includes an 1895–96 wool walking suit. The green colour and exact cut here are
project choices, not a reproduction of that object.

The [NGV frock coat, 1890](https://www.ngv.vic.gov.au/explore/collection/work/45224/)
and [Smithsonian frock coat, 1890](https://americanhistory.si.edu/collections/object/nmah_366739)
informed the formal male range. C2 and C4 are generalized period-informed
working clothes. The [National Museums Scotland working-clothes discussion](https://blog.nms.ac.uk/2017/01/17/james-mains-and-sons-of-carnwath-a-walk-down-memory-lane/)
covers a broader date range; it does not establish every detail as 1896.
Museum reference images are not shipped as textures.

These are game assets with generated topology and bounded procedural edits.
They do not support arbitrary anatomical transformations or every garment
across every body. Existing grooms are reused; they do not yet cover the full
historical hair range for the new donors. New wardrobe families still need a
complete source body, fitting measurements and visual checks.

## Verification

The final review captures every one of the 13 fitted combinations in 147
poses. The male grooming study captures 110 views across the lean, broad,
complete worker and two new male donors. A separate mouth review checked the
five new donors in 75 poses, including the lip boundary and closed-mouth tooth
visibility. Review images and machine-readable results are under
`artifacts/characters/patient-expansion-2026-11-02`.

The game suite passes all 806 tests. The focused character runtime, hair,
wardrobe and expansion suites pass 33 tests. Both production apps build.
The older renderer-comparison suite cannot complete in this checkout: several
comparison GLBs are still LFS pointers, and a concept-dress test lacks a DOM.
These failures are outside the shipped modular asset checks.

Five ordinary gameplay replays cover H1/C1, H3/C2, H4/C3, H2/C4 and H5/C5.
They complete entrance, dialogue and examination paths with no failed actions
or browser errors, and preserve the authored Carmela/Samuel case facts. Their
PNG and state captures are under
`artifacts/gameplay/patient-expansion-2026-11-02/verified`.
