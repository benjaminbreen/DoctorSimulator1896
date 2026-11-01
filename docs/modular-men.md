# Male templates — October 31, 2026

For the new complete worker donor and the November 1 MPFB test, see
[the worker body notes](worker-body.md). That prototype supersedes the
procedural shirt as the direction for worker anatomy.

The earlier workwear review failed visual inspection. The repair pass removes
the broken wrist layers, refits the neck and apron, and reduces the neutral eye
opening. The current pass narrows the shirt depth and sleeves, fits lined cuffs, softens
the collar and rebuilds the apron bindings and knee drop. These remain
prototypes: cloth folds, hair and eyelid corners still need an art pass. Functional checks are not visual acceptance.

Two new head donors and two new clothed bodies were generated in Tripo Studio.
Neither body reuses Samuel's or the player's mesh or skin weights. Both use a
65-bone Mixamo-compatible skeleton and the project's nine existing motions.

The lean template wears a charcoal three-piece sack suit. The broad template
wears a waistcoat, shirtsleeves and trousers. These are fictional period-informed
clothes, informed by the Metropolitan Museum's [1890–95 suit](https://www.metmuseum.org/art/collection/search/91980)
and [1885–1900 suit](https://www.metmuseum.org/art/collection/search/103793).
They are not reconstructions of one photographed person or occupation.

## Controls

Both templates support belly size, waist width, sixteen facial feature
controls, eye colour, skin treatment, hair colour and fabric tint. Eye spacing
and size move the eyeballs, surrounding sockets and lids together.
Belly reduction has a smaller range than expansion to avoid a concave clothed
abdomen. Extreme combinations still need visual review.

Hair options include a short side part, a receding sweep and bald. Sideburns
are independent: none, short, long or mutton chops. The upper lip can be clean
or have a neat, full or turned moustache. These use overlapping cutout hair
clumps rooted on the skin. They inherit the donor's facial
shape changes and structural edits. Hair, eyebrows and facial hair share the
same colour treatment. Temple strips extend from the scalp toward the ears.

Nineteenth-century moustache and whisker references include the Library of
Congress [Grover Cleveland portrait](https://www.loc.gov/pictures/item/96524269/)
and the Smithsonian's [portrait with side whiskers](https://americanhistory.si.edu/collections/object/nmah_554537).
Their dates and styles cover a wider period than 1896; they inform the range,
not a claim that every style was equally fashionable in that year.

Twelve male appearance recipes are in `shared/characters/modularCast.js`.
These are visual studies with no clinical facts. The new assets can be assigned
to future authored patients independently of the simulation. The lab's
**Save character recipe** button downloads the model ID and its appearance
values as JSON. The `look` object uses the same fields as the game presets.

Each body now has four outfits: its original tailored clothes, a work shirt,
a canvas apron and a leather apron. Changing clothes keeps the face recipe.
The work shirt is built around the measured shoulder, elbow and wrist positions,
then its shoulder intersections are fused and smoothed. Its weights vary
continuously between the chest and arms. Each native hand is extended into its
sleeve as one continuous mesh. Detached donor cuff pieces are removed; a source
audit rejects more than two connected skin components. Cloth colours use
procedural cotton, canvas and leather grain.

The apron has a fitted bib, rolled hem, stitched edging, thick neck webbing and a waist tie with a back knot. Canvas and leather use separate panel and tape textures. The shirt has a shallower chest, tapered sleeves, lined cuffs and a lower band collar. The hands and wrists are colour-matched to sampled cheek skin before applying the shared skin palette. Its lower panel morphs
with the actual thigh angle, rather than switching early with the sit cue.
The seated panel starts from the curved waist across its full width, rather than connecting its sides to one centre point. Its fit is checked against the actual
trouser and waistband surfaces. The bib is fitted to the final shirt mesh, and
covered shirt buttons are hidden under it. All garment layers share the same
body warp, which fades out below the abdomen. This is a fitted animation garment,
not a cloth simulation.
At runtime, two small depth grids follow the actual posed trousers and waist. Contact fitting fades in below the bib so the lap cannot lift the upper panel. Four neighbouring depth samples soften the grid transitions. The standing fit continues smoothly below the shirt hem and checks the actual trouser waist. Conservative depth padding covers the space between garment vertices; removing it exposed trouser folds through the apron.
The apron fits over the lap and around the fronts of the knees. Its hanging
panel stays down while walking. The same correction is applied to its shadows.
The same construction is fitted separately to both rigs, rather than exchanging
an unfitted garment mesh between bodies.

The workwear is informed by the Library of Congress's
[blacksmith image, about 1890](https://www.loc.gov/item/2011661558/), the
Smithsonian's [museum labour force, about 1890](https://siarchives.si.edu/collections/siris_sic_8309),
and the bindery photograph dated about 1900 in the
[GPO history](https://www.govinfo.gov/content/pkg/GOVPUB-GP-PURL-LPS126616/pdf/GOVPUB-GP-PURL-LPS126616.pdf).
The bindery reference is later than the game's 1896 setting. These sources
support the general shirt/apron range; they do not establish one exact uniform.
No reference photograph is used as a garment texture.

## Rebuild and review

Use Blender 5.2 or later. Set `BLENDER_BIN` if needed.

```sh
npm run men:build
npm run men:build -- --assemble-only --reuse-motions --identity=male-a
npm run men:review -- --motion
npm run men:review -- --workwear --output=artifacts/characters/modular-men/workwear-motion
node scripts/characters/benchmark-workwear.mjs
```

The rebuild uses local downloaded FBXs and saved reference textures. It spends
no Tripo credits. The initial Studio work used 520 credits; the last confirmed
balance was 2,325. The exact generation IDs, prompts and source files are in
`assets/source/modular-men-2026-10-31/provenance.json`.

Open these on the Character Lab server:

- `/face-lab.html?model=male-lean-template`
- `/face-lab.html?model=male-broad-template`

The generated head is removed using its connected components. The broad donor
joins its head to the torso; that carrier is trimmed inside its separate shirt
collar. This preserves the raised collars on both bodies. Garment head and neck
weights are transferred to the chest so looking down does not tear the layers
apart. Internal reverse-facing cloth surfaces are culled; hair caps have outward
winding and a closed crown.

The previous neck repair still flattened the lower donor boundary into a long
chin shelf. That assembly failed the user's profile review. The male build now
preserves the donor's actual under-jaw and upper throat. The lower neck is cut below the jaw and higher at the nape, then joined to a ring inside the collar. A horizontal cut and distortion of the donor throat both produced visible projecting skin; those fits were rejected. The head sits 12 mm lower than the previous repair. Retargeted neck lean is bounded relative to the chest, while head orientation retains the performance. Structural face edits fade out before the neck
attachment, so changing the chin does not pull the collar connection forward.
The female build retains its existing fit.

The skull is rigid above a short neck blend. Neck skin is rebaked onto unique
UVs after fitting. A misplaced dark patch above the broad donor's nostril is
cleaned during that bake, while the nostril opening is retained. The eyes have iris and
sclera textures without painted eyelids. Their spherical surfaces do not change
shape when gaze rotates, and the fitted lids stay outside them through expressions.
The seated idle places each palm above its own clothed knee; spoken gestures
can lift the hands from that rest.

The body and head donors retain different topology. Both share the controller
contract, expression names and motion names. That allows recipe reuse; it does
not imply that arbitrary clothes can already be exchanged between bodies.
The waistcoat and coat are skinned surfaces, without a cloth simulation.

Game review uses Samuel's existing consultation flow with an explicitly gated
appearance override. His ordinary model and clinical content remain authored.
For example:

```sh
node game/scripts/gameplay-playtest.mjs --scenario=samuel --offline \
  --url='http://127.0.0.1:5175/?appearancePreset=lean-base'
```

The runner adds `playtest=1`. Use `broad-base` for the second foundation, or any
male preset ID. The override also supplies the new nine-clip map, scale and
seated placement so walking and sitting are exercised with the actual asset.

Artifacts, continuous clips and motion audits are under
`artifacts/characters/modular-men/`. The comparison sheet is made from actual
web renders. Each source audit samples all nine motions at five points and
checks sleeve edge stretching and rigid-skull edge lengths. Builds, control
tests and browser checks complement those measurements; they do not replace
visual inspection.

The first assembly failed visual review despite passing motion checks. Rejected
captures remain under `rejected-neck-carrier` and `rejected-layered-face`.
The repair review includes isolated surfaces, unlit textures, surface normals,
profiles, blinks, gaze extremes, speech and actual consultation playthroughs.
The generated ear detail, cloth seams and procedural grooms still have less
finish than a hand-authored character; these remain editable source assets.

`artifacts/characters/modular-men/anatomy-review` is a rejected review, retained
for comparison. The current focused review is under `cleanup-review`: both
templates at rest, gesturing, standing, in profile, blinking and with a larger
belly. The **Torso** view shows the head, neck, wrists and lap together.

The latest game replays are `artifacts/gameplay/modular-men-surface-fit-canvas`
and `modular-men-surface-fit-leather`. They exercise entry, conversation
and physical examination. Review counts, asset hashes and remaining limitations
are recorded in the source provenance file. These captures do not establish
that every combination of body controls and motion is free of clipping.
The `--workwear` review captures 28 walking, sitting and standing phases without
the dialogue overlay. Its previous output is `workwear-surface-fit`. A separate
real-timer lab measurement is saved as `cleanup-review/fit-timing.json`.

The current garment review is under `garment-review`, with further expression,
body-size and outfit checks under `garment-detail-review`. The motion review is
`workwear-proportions`. The matching game replays are
`modular-men-proportions-canvas` and `modular-men-proportions-leather`.
These supersede the earlier cleanup captures.

The current pass corrects oversized sleeve volume, shirt depth, hollow cuff
edges, collar height, apron webbing and the large rectangular knee drop.
It also preserves the native under-jaw rather than pulling it into the collar.
The apron is still a fitted animation surface, with limited fold detail.
An offline cloth experiment did not produce a usable drape and is not shipped.
A dependable garment bake needs further pattern and collision-body work.
Hair, eyelid corners and the broad donor's formal hip/trouser seams still need
focused art work. Extreme control combinations are not visually accepted.

## November 1 direction: use a complete worker asset

The user rejected the procedural sleeve anatomy. The male body donors were
already generated and rigged in Tripo; replacing their upper clothing with
analytic meshes turned a wardrobe task into an anatomy and skinning project.
Stop extending that reconstruction as the foundation for the worker cast.
The rejected arm work is retained under
`assets/source/modular-men-2026-10-31/rejected-arm-reconstruction-2026-11-01`.
Public models are restored to the preceding verified pass.

Evaluate an established anatomical body and ready clothing assets first.
[MPFB](https://extensions.blender.org/add-ons/mpfb/) supplies a parametric human,
automatic rigs and a clothing library. Its
[core graphical assets are CC0](https://www.makehumancommunity.org/about/license.html);
check each separately downloaded community garment's license.
The official [MPFB MCP bridge](https://github.com/makehumancommunity/mpfb-mcp)
is an early beta, and MPFB can also be scripted directly in Blender.

A complete clothed worker generated in Tripo is the other practical route.
[Current humanoid rigging documentation](https://developers.tripo3d.com/en/models/rig)
recommends `v3.0-20260909`; the API default remains the older v1 model,
so an API workflow must select the current humanoid model explicitly.
These tools still require visual checks of the untouched body through the
actual walk, sit and talking motions before fitting the expressive head.
Keep head controls and colour variation independent of the body/outfit asset.
