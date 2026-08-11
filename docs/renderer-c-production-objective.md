# Renderer C production objective

Date: 2026-08-08

## Decision

Renderer C is the production human system. The current objective is no longer
to compare three renderers. It is to turn the working GNM-to-MPFB pipeline into
an asset-backed, deterministic casting system for patients and NPCs in Three.js.

The central quality requirement is **recognizable facial diversity within the
same demographic cohort**. Eight White women in their twenties or thirties, for
example, must read as eight different people when shown bald, without ornaments,
in the same lighting and with the same neutral material. Different hair, skin,
clothing, age, or sex cannot be used to conceal repeated facial structure.

Renderer C should combine authored foundations with bounded procedural
variation. It should not generate arbitrary anatomy, and it should not ship a
separate complete model for every possible patient.

## Character recipe

Each patient or NPC is represented by a reproducible recipe containing:

- a demographic and body cohort;
- one dominant curated face anchor and, where useful, a restrained secondary
  anchor blend;
- bounded structural face and body controls;
- a character-specific resting-face signature;
- skin, eye, hair, and surface parameters;
- compatible hair, facial hair, clothing, and ornament assets;
- an animation state and required level of detail;
- stable identity and appearance seeds.

The patient generator creates the record and constraints. The Renderer C
adapter resolves that record into visual assets and morph weights. Blender
creates or updates the asset library offline; it is never required during play.

## Face diversity is not optional polish

The initial target is roughly 12 to 24 curated structural face anchors across
the production population. These are logical identities, not necessarily 12 to
24 separate GLB files. Multiple anchors can share topology, skeleton, materials,
and a consultation master, as the current male and female masters do.

Every common cohort must contain several genuinely different anchors. A face is
constructed in this order:

1. Select one dominant GNM-derived anchor.
2. Apply restrained local MPFB controls across independent regions: cranium,
   forehead, orbit and eyelids, nose, cheeks, mouth, ears, jaw, and chin.
3. Clamp lower-face projection and other known failure regions. A large jaw or
   chin must never be the primary source of difference.
4. Apply skin and age detail independently from structural identity.
5. Apply a bounded resting-face signature as a final identity layer.

Blending many anchors equally is prohibited because it converges toward an
average face. Structural anchors must also remain distinct with all resting
expression offsets set to zero. Resting offsets add specificity; they do not
compensate for inadequate anatomy.

## Bounded resting-face signatures

The 52 named MPFB face units are useful for more than temporary emotions. A
person can have a habitual brow set, slight eyelid tension, an uneven mouth
corner, mild lip pressure, or another subtle resting tendency. These defaults
help two structurally similar people read differently.

The renderer must keep three facial layers separate:

| Layer | Examples | Lifetime |
|---|---|---|
| Structural identity | nose profile, eye spacing, jaw shape | permanent |
| Resting signature | mild `browDownLeft`, lip press, eyelid tension | persistent but suppressible |
| Performance | blink, smile, speech, fatigue, pain | temporary |

Resting signatures follow these rules:

- Use target-specific bounds rather than one global random range.
- Select a small number of compatible action families. Do not combine a smile,
  frown, lip press, sneer, jaw opening, and squint merely because the targets
  exist.
- Keep paired features broadly coordinated while allowing mild natural
  asymmetry. Perfect bilateral mirroring should not be mandatory.
- Sample routine generated values conservatively. A stronger value such as
  `browDownLeft: 0.5` may be retained as a curated character choice when it
  looks like plausible habitual anatomy rather than anger or a broken pose, but
  it must not become a general automatic maximum.
- Do not use blinks, `tongueOut`, strong jaw opening, extreme eye convergence,
  or similarly transient actions as ordinary identity defaults.
- Store the complete signature in the deterministic character recipe so the
  same person keeps the same resting face in every encounter.
- Resolve conflicts by target family. A performance should temporarily replace
  or suppress the relevant resting tendency instead of blindly adding weights
  until the face deforms.

Every automatically generated signature must be checked in a plain neutral
pose and during blink, gaze, speech, smile, sadness, and fatigue. The face must
not appear stuck in an emotion when no performance is active.

## Asset and delivery model

The web build should use a small number of reusable GLB foundations plus
modular assets, not one large bespoke GLB per generated person.

- **Consultation:** retain the selected face anchor, useful structural morphs,
  all required face units, detailed eyes and hair, and high-quality clothing.
- **Nearby:** bake identity into reduced geometry and keep only the animation
  and expression controls visible at that distance.
- **Crowd:** use a baked low-detail body, hair, and outfit combination with
  minimal facial controls.

Hair, facial hair, garments, hats, spectacles, jewelry, and other ornaments are
selected from compatibility-tagged libraries. Clothing is chosen as a coherent
period outfit constrained by sex, age, occupation, social class, season, and
formality; it is not assembled from unrestricted random pieces or colors.

Meshes, textures, and animation clips should be shared wherever possible.
Production assets should use measured triangle and texture budgets, compressed
geometry and textures, lazy loading, and caching. The game loads only the
foundations and modules needed for the current scene.

## Age and complexion

Age changes both geometry and surface appearance. The existing young and old
face morphs handle volume and shape. A separate shared surface layer handles
wrinkles, fine texture, complexion variation, freckles, mottling, and
under-eye depth. These values are explicit parts of the character recipe and
therefore render the same way in Character Lab and the game.

The age scale covers 16 through 90. `Later-life face shape` exposes the old
geometry morph separately from surface age and permits a bounded extension
beyond its original endpoint. This is a diagnostic and art-direction control;
chronological age still supplies its deterministic default.

Chronological age sets deterministic defaults with individual variation. It
does not fix every value. Wrinkles, mottling, under-eye depth, and hair greying
usually increase with age; freckles remain primarily an individual trait. The
lab sliders can override every generated value, and moving the apparent-age
control recalculates the defaults from the same appearance seed.

Hair greying is a continuous colour gradient applied to the existing hair
surface. It begins around the hairline and temples and spreads through the hair
as the amount increases. It must preserve the source texture and must not expose
the texture atlas as white bands or isolated rectangular strands.

Wrinkle masks also perturb the surface normal so furrows respond to scene
lighting instead of reading only as dark lines. Later-life defaults gradually
reduce the contrast of brows and lashes and slightly warm the sclerae and teeth.

## Acceptance gates

The Renderer C production casting system is ready for game use only when:

- an eight-face sheet from one narrow cohort reads as eight different people
  under identical bald, neutral conditions;
- the same eight faces remain distinct with all resting offsets disabled;
- bounded resting signatures increase specificity without fixed grimaces,
  crossed eyes, habitual blinking, or deformed jaws;
- no generated cohort relies on oversized chins, extreme sliders, hair, or
  pigmentation to create apparent diversity;
- eyes, sclerae, irises, brows, lashes, teeth, and representative hairstyles
  fit every approved anchor;
- surface controls produce an obvious zero-to-maximum change, remain stable on
  every anchor, and do not lighten dark skin into a different complexion;
- grey hair shades continuously from the original colour without visible atlas
  stripes;
- face units and Mixamo body animations remain credible across the approved
  anchor and body ranges;
- representative garments pass slim, average, and heavy body tests plus
  seated, sit-to-stand, standing, and walking poses;
- consultation, nearby, and crowd assets meet agreed mobile web budgets.

The Character Lab remains the approval surface for these gates. Contact sheets
are useful regression artifacts, but Ben's live review in the lab decides
whether a face, resting signature, garment, or animation is accepted.

## Current implementation

Renderer C already has two reusable consultation masters with eight approved
GNM-derived anchors each, fixed MPFB topology, named face units, live identity
controls, fitted facial assets, deterministic cohort grids, and a shared Mixamo
motion library. The versioned recipe, shared game/lab controller, actor layer,
validated publication command, bounded face-performance rules, and shared
complexion and iris palettes are now implemented. Phase 1 of
`m1-work-plan.md` is complete.

The six complexion choices are calibrated for the current skin texture and
material path. Each face anchor keeps the eye geometry fitted to that face. The
six eye choices recolour only that fitted asset's iris texture while preserving
the sclera, pupil, and catchlight; eye colour must never select geometry from a
different anchor. Procedural casting samples ancestry-aware subsets; these are
visual defaults for this asset bank, not claims that ancestry fixes a person's
colour. All approved choices remain available for manual review in Character
Lab.

Renderer C now also consumes the shared age-appearance recipe. Generated
patients receive reproducible but varied surface and greying values, and the
Character Lab exposes the same values as live controls under Age & complexion
and Hair.

The women master now also contains a Golden day-dress prototype. It is built
from retained fitted sources as separate skinned bodice, standing skirt,
seated lower garment, and fitted detail meshes. It retains the existing body
build morphs, uses the common Mixamo skeleton, and uses explicit material slots
for its main, secondary, and accent colours. Its collar, cuffs, and fitted
front inset have closed edge geometry; live morphs control bust coverage,
collar height, cuff width, and collar and cuff material thickness. The previous fitted dress,
procedural shells, detail geometry, and shader experiments remain available
for comparison. The Golden dress is a technical garment base pending
historical review, not approved 1896 content.

The immediate work is the Phase 2 consultation MVP. The Golden dress can serve
as its women’s technical outfit while historical clothing details are reviewed.
One approved outfit for each patient, broader wardrobe families, a larger
anchor bank, and nearby and crowd packages remain later work.
