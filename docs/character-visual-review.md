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
