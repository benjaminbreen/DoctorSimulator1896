# Character attachment review

The wrist defect exposed two gaps in the review process: full-figure captures
made the join too small to assess, and tests of finger orientation did not
check whether skin fitted inside the cuff. Inspect the close-ups as well as
the ordinary gameplay captures before reporting a visual change as finished.

The lab now has **Left wrist** and **Right wrist** camera buttons. The same
views are available through `__faceLab.show({view:'right-wrist', ...})`.

```sh
node scripts/characters/capture-wrist-review.mjs --url=http://127.0.0.1:5196
node --test tests/wrist-binding.test.mjs tests/standing-posture.test.mjs
```

The capture script reviews both wrists on all eighteen templates. Distinct
bodies also get two walking phases, seated idle and talking. The older male
templates get work-shirt, apron and side views. The PNG sheets keep wrists
large enough to see penetrations and seams; individual crops remain available.
Some side views can be occluded by the torso. Use the opposite angle or orbit
the camera before deciding that an obscured join has passed.

The older male wrists inherited thumb weights from the donor hand boundary.
Those weights were propagated into the generated forearm skin, so curling
the thumb pulled skin through the sleeve. The hand atlas was also shared with
native cuff fragments, making cloth receive skin colours. The build now makes
closed cloth cuffs with their own material, fits the covered wrist inside
them and blends both cloth and skin from forearm to hand outside the sleeve.
Finger influence stays out of the covered wrist.

`repair-wrist-binding.mjs` runs in the normal patient optimizer. It preserves
the rig, clips, facial controls and texture images. The Blender workwear builder
owns the replacement cuff geometry. Rebuild that geometry with:

```sh
node scripts/characters/build-modular-men.mjs --assemble-only --reuse-motions
```

For existing exports that already have the new cuffs, apply only the binding
and wrist fit repair with `node scripts/characters/fix-wrist-binding.mjs`.
The repair is versioned and idempotent. Its regression checks curl finger
joints in standing, walking and seated clips and verify that protected wrist
vertices stay still. They also check cuff closure, cloth-only materials and
clearance for the covered skin.

The initial cast review produced 128 close-ups. The repaired male templates
were reviewed again in 44 close-ups, including body-size variants and a hat grip.
Both male gameplay replays completed entrance, conversation and wrist examination
with no failed actions or browser errors. Focused tests and both production
builds passed. The review also exposed rough native
sleeve borders and coat/lap intersections, especially on the broad male and
frock coat. Those remain separate garment cleanup work; the wider wardrobe
should not be described as fully polished on the strength of the wrist fix.

## Napes and sideburns

All seven male templates now use a collar-based nape fit and rebuilt short
sideburns, long sideburns and mutton chops. The fit measures the garment's back
opening, tapers the lower neck and hair into it, preserves the ears and updates
the deformed surface normals. Facial shape targets receive the same fit.

The sideburns reuse the scalp's colour and normal textures. A dense surface
provides coverage; fine tapered strands soften its borders. The temple fans
back into the scalp above the ear and stays in front of the ear below it.
A smooth ear contour avoids the jagged edges produced by separate measurements
at each height. Barycentric transfer preserves facial feature and expression
changes on the new geometry. These are build-time changes, with no new runtime
fit solver or texture downloads.

```sh
node scripts/characters/fix-male-attachments.mjs
node scripts/characters/capture-male-attachments.mjs --url=http://127.0.0.1:5196
node --test tests/male-attachments.test.mjs tests/procedural-character-assets.test.mjs
```

The normal modular-patient optimizer runs the same repair after Blender export.
The review covers 84 side, rear, standing, seated, emotional and feature-variation
captures, followed by a separate worker-collar check. Tests cover collar clearance,
ear clearance, temple coverage, shared hair textures, retained facial shapes and
idempotence. Generated case patients also have a contract check that their
selected clothing and animation clips exist in the shipped model.

Validation passed 27 focused tests and both production builds. A ten-step
generated-patient gameplay check (`office`, seed 2, `?procedural=1`) selected
the updated young male work jacket without a preset override, then exercised
arrival, seating, dialogue and examination. Its captures were inspected and
the run recorded no failed steps or runtime errors.

The combined fabric and exterior checkpoint also passed all 77 root tests,
813 game tests and both builds. Production gameplay replays cover eight park
and travel steps and ten generated-patient consultation steps, with no errors.
Generated patients use initials and silhouette fallbacks in the Casebook and
appointment bar instead of requesting photographs that only authored patients
have. Captures are in `artifacts/gameplay/main-final-park-verified/` and
`artifacts/gameplay/main-final-patient-verified/`.

## Patient seat contact

The patient now follows the chair's live transform, with seat height fitted
from the animated thighs instead of the asset's fixed root offset. Seated
skirts and aprons also wrap around the cushion corners. Colour and shadow
passes use the same correction; standing garments keep their original shape.

Carmela, the young walking suit, and the broad male were checked in gameplay.
The latter two also received standing and walking reviews from both sides and
an oblique angle. Captures are in `artifacts/gameplay/seat-carmela-final/`,
`seat-walking-suit-final/`, and `seat-broad-final/`. All replays completed without
browser errors. The production build and all 815 game tests passed.

The broad male still has visible waist and trouser mesh defects in low side
views; this change does not repair those garments. The standing/walking review
cues keep the actor at the chair anchor, so the chair intersects the legs in
those inspection frames. The ordinary walking entrance is reviewed separately
before these pose overrides.

## Resting hands and closed doors

Idle hands now fit to the visible lap surface. The fit excludes arm-weighted
triangles, measures each hand's palm pad, preserves arm lengths, and allows
the wrist to follow the lap slope. It releases during speech gestures,
examinations and other directed gestures. The existing hat controller still
owns the hand carrying a removed hat. Standing and walking clips keep their
authored arm poses.

Closed door panels now overlap their rails and stiles and cast shadows.
This removes the bright gaps while preserving the recessed panel faces.

The walking suit and original Carmela were reviewed at the wrists from both
sides and an oblique angle in seated, standing and walking poses. Samuel's
lean body completed conversation, wrist examination and return to rest.
Captures are in `artifacts/gameplay/hands-doors-walking-suit-verified/`,
`hands-doors-carmela-verified/`, and `hands-doors-lean-examination/`.
All three replays completed without failed steps or browser errors. The
production build and all 819 game tests passed, including arm-length, palm
clearance, model-scale and gesture-release checks.

Native coat cuts, some cuff borders and the rigid seated skirt shape still
need garment cleanup. The contact fit does not repair missing cloth or change
the authored finger curls. As in the seat review, stationary standing/walking
inspection cues can intersect the chair because they keep its position.


## Centered consultation chair

Solo consultations now use one visitor chair, directly opposite the doctor's
chair at x = -0.45. Authored, generated and technical patients share that
position. The seat-contact transform moves with it. The default field of view
is about 50 degrees; drag and wheel controls still allow manual inspection.
The patient-seat replay now uses relative inspection cameras.

Wilhelmina's entrance, seated dialogue, hand examination and return to dialogue
were played and their PNGs inspected in
`artifacts/gameplay/centered-consultation-wilhelmina-review/`. The face stays
centered above the dialogue, and the examination keeps its patient target.
Existing collar and cuff gaps remain visible. No rig or garment geometry was
changed. The production build and all 819 game tests passed.

Carmela's conversation replay also completed all nine steps, including its
notebook assertions, in `artifacts/gameplay/centered-consultation-carmela/`.
The seated and spoken-response PNGs were inspected. Her baked speaking clips
still include large head turns; centering the chair does not change those.

Both gameplay runs completed every action but exit nonzero because the existing
atlas-prefetch loader plugin lacks a name and logs
`THREE.GLTFLoader: Invalid plugin found: missing name`. This warning is also
present in the committed renderer; it did not prevent the models from loading.
