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
