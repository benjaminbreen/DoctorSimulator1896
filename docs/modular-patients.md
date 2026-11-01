# Modular patient prototype — October 29, 2026

Carmela now uses an authored Tripo head and body. A second fictional head
uses the same body, bone hierarchy, clothing parts and nine motion clips.
The clinical simulation still owns Carmela's facts, disclosures and outcomes.

## What the prototype supports

- Two head bases, 14 independent feature controls, and seven older proportion presets.
- Separate skin, hair and iris treatments, plus repeatable appearance seeds.
- Twelve curated looks using both heads, with complete face, hair and clothing recipes.
- Five fitted hairstyles with volume, wave, bun-height, part and ear-coverage controls.
- A day dress and a work apron, each available in four fabric treatments.
- Separate eyeballs and closing lid rings, gaze controls, brows, cheeks,
  an oral cavity, individual teeth, and open, wide and rounded speech shapes.
- Standing, walking, sitting, standing up and five consultation performances.
- Exact pose and expression capture in the web renderer, plus ordinary gameplay
  replays for the complete consultation.

These are appearance recipes, not independently written characters. Body
shape is held constant so the clothes and animation fit stay predictable.

## Rebuild and review

Use Blender 5.2 or later. The working installation for this session is
`/private/tmp/ghosts-character-tools/Blender52.app/Contents/MacOS/Blender`.
Set `BLENDER_BIN` if Blender is installed somewhere else.

```sh
npm run patients:build
npm run patients:review
npm run patients:face-review
npm run patients:variants -- --output=artifacts/characters/identity-studies/review
node game/scripts/gameplay-playtest.mjs --scenario=carmela --offline \
  --replay=game/scripts/playthroughs/carmela-full.jsonl
```

For binding or wardrobe changes with an unchanged fitted head, use
`npm run patients:build -- --assemble-only` to reuse the saved head sources.
Add `--identity=carmela` or `--identity=seamstress` to rebuild and audit just
one character during visual iteration.

The rebuild is offline. It uses the downloaded source FBXs and existing
Mixamo motions; it does not spend Tripo credits. Regenerating a source head
is a separate Studio operation.

Open `/face-lab.html?model=carmela-russo` or
`/face-lab.html?model=seamstress-prototype` on the Character Lab server.
The controls expose face structure, outfit, fabric, expressions and body clips.
**Start from look** selects one of the twelve recipes in
`shared/characters/modularCast.js`. A recipe can then be edited with the usual
controls. Direct links accept `&preset=auburn-curls`, for example; the model
parameter must match the recipe's head. These are appearance studies, not new
clinical cases. The second head still shares Carmela's body and motion rig.
Raw sliders and frozen captures apply to every facial mesh, including the lids.
Review captures and `review.json` are under `artifacts/characters/`.
The gallery run also creates neutral, half-blink, full-blink and wardrobe
contact sheets, so an agent can inspect the cast without opening 122 files.

The capture runner samples neutral, half blink, complete blink, speech,
concern and relief from the front and three-quarter view. It also samples all
nine body clips, the hair in profile and from behind, and wardrobe combinations.
`--gallery` adds neutral and blink captures for every structural preset. Missing requested morphs fail the
web capture instead of silently producing an unchanged portrait.

The current review is in `artifacts/characters/carmela-polish/accepted-review/`.
Its `identities.png`, `blinks.png` and `wardrobe.png` are contact sheets made
from the web renderer's actual screenshots. Tripo Studio screenshots are in
`artifacts/characters/carmela-prototype/tripo/`.

## Face and colour studies

The current feature comparisons are in
`artifacts/characters/identity-studies/lower-face-final/`. The front and profile
sheets compare the original face with coordinated lower-face reductions and
three compact variants. Separate sheets cover nose shapes, skin, hair, irises,
ears, brows and 16 combined appearances from the two bases. `recipes.json`
records the settings used. Portrait crops keep their original aspect ratio.

The earlier jaw-only narrowing studies were rejected. They made the chin look
larger by narrowing its surroundings. The whole lower-face control now reduces
chin width, height and projection together with the jaw and mouth, fading into
the cheeks and neck. The 10%, 15% and 20% labels describe the central width and
height reduction; the blend fades at the boundary and uses a gentler depth change.
Jaw width, chin width, chin length and chin projection remain separate controls
for deliberate local adjustments.

The nose has width, length, projection, bridge and tip-lift controls. Cheek
fullness, jaw softness, brow prominence and ear prominence complete the feature
set. Each control is bounded to −1 through 1. New combinations still need visual
review; a mathematical bound does not guarantee a convincing face.

The controller edits instance-owned neutral geometry and transports each full
expression through the same deformation. It preserves the source normals across
UV seams. Skin bind transforms put every part in the same rest-space frame,
including the lips, lids, teeth and hair. Geometry is rebuilt only when feature
values change. It does not mutate the cached GLB used by another character.

Colour treatments use shader uniforms over the existing textures. Skin detail,
hair strands, pupils and eye whites remain visible; the eyebrows follow hair
colour. Hands and lips follow the skin treatment. These are colour treatments,
not new age, ancestry or clinical classifications.

Use Apply seed or New variation in the lab to generate a repeatable combination
of face, nose, ears, colours, outfit and fabric. For an in-game appearance review,
pass `?appearanceSeed=17` to the gameplay runner's `--url`; the runner adds
`playtest=1`. This affects Carmela's preview appearance only. Her clinical facts
stay as authored. The ordinary game now uses the 15% whole lower-face reduction.
`?appearancePreset=auburn-curls` selects a curated recipe and its actual head
asset under the same playtest gate. Capture state records the loaded asset path
and preset ID, so this checks both the appearance and the model selection.

## Carmela's performance

The fitted heads use a separate expression profile with larger brow, lid,
cheek and mouth movements. The older cohort faces retain their previous limits.
Smiles and frowns ease between cues; speaking keeps the emotional mouth corners
and upper face, while reducing competing mouth movements. The lab and game
use the same expression weights and limits.

Carmela enters guarded, recalls the theft with discouragement, becomes anxious
during the attack and shows relief after the grounded response. Dismissal keeps
her disapproving. Authored body clips play once and return to idle, ending the
speech envelope and releasing her gaze. Writing notes or opening the decision
screen does not restart the spoken gesture. The departure face follows her
immediate satisfaction, not the hidden medical quality of the treatment.

Her default appearance includes the smaller lower face and a neutral resting
shape without the generated cohort's random mouth offsets. Her initial
consultation view is closer so the expressions read at ordinary play distance;
the mouse wheel still adjusts the view.

Lid outside edges now follow the brow and cheek shapes so larger expressions
do not open gaps around the eyes. The oral cavity follows the mouth shapes,
and the tooth rows use receding arches behind the lips. This fixes the exposed
lip-corner tooth from the previous study.

`scripts/characters/capture-emotion-review.mjs` captures all ten emotions plus
neutral, both speaking and listening, and three mouth stress poses. `--legacy`
uses the old expression profile on the same mesh for comparison. Frozen captures
hold both body and face time; the runner checks that a paused pose stays still.
The full game remains procedural speech animation without recorded audio.

The first emotion pass exposed a separate binding fault: the chin was partly
weighted to the neck and shoulders. Head pitch stretched the lower face even
with speech shapes at zero. The face above the neck transition now follows the
head rigidly, as do the separate eyes, lips, teeth and hair. The neck alone
blends into the shoulders. The source rig and both exported characters include
this correction.

`capture-chin-motion.mjs` compares neutral, open-mouth, relieved, disapproving
and anxious poses in front and profile views. The same tilted-head comparison
is in `artifacts/characters/carmela-chin/rebound/comparison.png`. The motion
audit now checks lower-face edge lengths as well as sleeves. The rejected rig
stretched some lower-face edges to 2.47 times their rest length; the corrected
rig keeps those ratios between 0.9999 and 1.0001 across 45 samples per head.

## Construction decisions

Tripo's Mixamo preset supplies the body skeleton. The exporter retargets the
existing motions in world space, corrects resting hands that intersect the
lap, and limits the borrowed seated head pitch. The generated body's detached
head and ear islands are removed before the replacement head is fitted.

The head keeps the generated main facial surface. Detached eyebrow and lash
geometry is baked into its colour texture; leaving those fragments as skin
produced spikes during expression changes. The eyes and eyelid rings are
separate meshes with a continuous projected texture atlas. Structural morphs
affect the face, eyes, lids and hair together and are kept separate from
expression weights.

The assembly script reduces both heads to 88% of their original size. Face,
eyes, lids, hair and every shape key follow the same transform. A short blend
at the lower neck preserves the collar fit. The body and skeleton stay at
their original size.

The body exporter welds and fills small sleeve openings present in the Tripo
source. Boots retain their foot weights when the lower bodice is rebound;
including their upper edges in the hip binding produced spikes below the floor.
The bodice fit also excludes the arm region and existing arm weights. Rebinding
inner elbows to the hips was the cause of the long sleeve spikes. The lower
neck follows the shoulders, keeping its edge inside the collar during motion.

The generated upper dress is retained. A separate continuous seated skirt
prevents leg weights from pulling the lap into separate mounds. The original
standing skirt remains available for walking. The apron has a carrier for
each posture. Its standing carrier fits the outside of the dress folds and
uses the underlying dress weights; rays from inside the skirt and rigid hip binding
had left most of it hidden inside the skirt. Fabric changes leave hands, boots
and the ivory collar alone.

The MPFB canonical-head fitting experiment was rejected: its automatic fit
lost the likeness and damaged the eyelids. It is not a dependency of the
working prototype. This comparison supports keeping a shared body rig while
using individually fitted head surfaces for now.

## Procedural hair

Both heads have five interchangeable updos. The centre-parted low chignon,
waved knot and braided knot remain available. Soft side waves and curled side
rolls add draped volume over the ears and continue down behind them into the nape. The soft
waves leave some of the lobe visible; the curled style covers most of the ear.
The side surfaces use a smooth envelope rather than copying ear folds from
the source head. Both new styles gather into a rear knot. Their lower edge
continues behind the ears into the nape without the rejected upward notch.
The nape fits horizontally at its intended height; radial skull projection
had raised the edges and left a pointed centre tail.

The material pass uses two OpenAI-generated fine-fibre albedo maps: combed hair
and loose curls. Normal maps are derived at 512 pixels. Project-authored
strand coverage maps provide cutout edges and overlapping fine locks. The
curled mass is continuous geometry with small surface variation; the separate
wire-like curl experiments were rejected. Prompts and source images are under
`assets/source/carmela-russo-2026-10-29/references/hair-*`.

Face Lab exposes **Hairstyle** and **Hair grooming**, with volume, waves, bun
height, part position and ear coverage. Ear coverage affects the two draped
styles. Hair colour and greying remain separate controls.
Appearance seeds now choose these alongside face, skin, eyes and clothing;
the choices have no relationship to clinical facts or ancestry. Carmela's
authored default is soft side waves with ear coverage at 0.3. No new Tripo
generation was needed.

`scripts/characters/carmela_hair.py` builds all five fitted meshes and their
five grooming targets. `shared/characters/modularHair.js` selects one complete
style and writes its targets. Hidden styles do not submit draw calls. Hair
follows the head bone and the same structural identity edits as the face;
grooming does not rebuild geometry each frame or alter emotional expressions.
The main banks are opaque. Fine strand cards use a two-sided alpha mask;
the game preserves this mask when it makes the character's skin opaque.
There is no strand dynamics or cloth physics.

The silhouette is a period-informed interpretation. The Museum of the Earth's
[Carlotta Maury photographs](https://www.museumoftheearth.org/daring-to-dig/bio/helen-plummer-new-828dk)
include a profile dated ca. 1895 used to study swept volume and pinned-up hair.
This documents one contemporary example, not Carmela's specific community or
wardrobe. The reference photograph is kept in local review artifacts and is
not bundled in a web asset.
The supplied fashion plate directs the new side coverage; its exact date has
not been established. The University of Louisville's
[Woman with pin curls](https://digital.library.louisville.edu/concern/images/ulpa_1980_020_0971?locale=en)
is catalogued to 1889–1899. These are period-informed interpretations rather
than reconstructions of a particular person's hairstyle. No historical image
is embedded in a hair texture.

Run `npm run patients:hair-review` with Face Lab on port 5186. It captures both
heads from six directions, grooming extremes, sixteen seeded appearances and
walking, sitting, talking, self-soothing and standing poses. Results are in
`artifacts/characters/carmela-hair-over-ear/nape-review/`. For a quick first-head
check, use `--quick --styles=soft-side-waves,curled-side-rolls`. The optional
`--asset=PATH` loads a staged Carmela GLB without replacing the public model.

## Speech

A fitted lip ring replaces the closed mouth patch. It surrounds a dark oral
cavity and individual upper and lower teeth. The `speechOpen`, `speechWide` and
`speechRound` targets deform skin and lips together, while the lower teeth
follow the opening. Rounded rectangular crowns form continuous arches; their
roots and the lower row recede behind the lip. Muted gums and a tongue fill the
interior. The lip surface samples depth at its actual height rather than its
texture coordinates, avoiding the projecting lower-lip shelf.

The game and lab share a timed syllable pattern with closed rests and longer
phrase pauses. Each speaking cue starts its own phase. Relief uses a smaller
mouth smile with cheeks and lids carrying more of the reaction. Older
characters keep their restrained jaw driver.

Automatic blinks include a brief complete closure and a slower reopening.
Wide-eye and squint weights yield during the blink, then return to the selected
expression. Small attention shifts apply only while looking toward the doctor;
authored down and away gazes retain their direction. The exporter retains
changing normals on lids and lips, and identity edits transport them with the
posed surface. Dropping those normals made closed lids shade almost black.

`npm run patients:face-review` captures both heads, sixteen speech phases,
mouth stress poses, half and full blinks, and all twelve curated looks in
neutral, speaking, anxious, relieved, closed-eye and standing views. The
contact sheets and exact settings are saved under
`artifacts/characters/carmela-face-polish/review/`.
Add `--motion` to save an eight-second continuous speaking and blinking video
of each head. These run the body clip as well, so head-tilt defects remain
visible. The final recordings are in `artifacts/characters/carmela-face-polish/motion/`.

These are procedural speech shapes, not audio-synchronised phonemes.

## Verification

The latest face pass has 134 captures of both heads and all twelve curated
looks in `artifacts/characters/carmela-face-polish/review/`, plus 25 emotion
captures in `artifacts/characters/carmela-face-polish/final/`. Mouth, blink,
speech-cycle, cast and standing-outfit sheets were inspected. No browser errors
were recorded. The fitted lip and recessed lower teeth were checked in profile
and in the game, including the examination camera and head tilt.

All 766 game tests pass, including blink closure, phrase timing, preset bounds
and posed-normal transport. The nine character-runtime tests pass. Game and
Character Lab production builds pass. The root `npm test` command still stops
at an older wardrobe preset missing required fields; 18 legacy renderer tests
also need their Git LFS model files. Those are separate from the working game
assets and this face review.

The final default completed 45 offline gameplay captures in
`artifacts/gameplay/carmela-face-accepted/`, including the new treatment
discussion, both outcomes and return to the street. The auburn-curls recipe
completed a 13-capture dismissal and examination path in
`artifacts/gameplay/carmela-face-alternate/`. Both runs have zero failed actions
and browser errors. Capture state confirms that the alternate uses the second
head asset with the selected grooming weights and strand cutout. Videos are
saved beside both runs. This verifies authored dialogue and fallback text,
not the live consultation API.

The earlier prototype passed 740 game tests. Game and Character Lab production builds passed with
their existing large-chunk warning. The earlier art gallery captured 122 expression,
motion, hair, wardrobe and structural-preset images without browser errors; the
contact sheets and in-game examination capture were visually inspected.

The complete offline Carmela replay finished 36 steps without failed actions
or browser errors, including the attack, examination, treatment, case record,
both outcomes and return to the park. Its captures and `run.json` are in
`artifacts/gameplay/carmela-polish-accepted/`. This checks authored fallbacks,
not the live consultation API.

The feature study captured 180 images without browser errors. The lower-face,
nose, colour and cast sheets, plus representative blink and speech poses, were
visually inspected. A fresh 36-step offline replay with appearance seed 17
also completed without failed actions or browser errors in
`artifacts/gameplay/carmela-lower-face-seed17/`. Its examination image confirms
the compact appearance is used in the actual game. A rounded speech stress pose
exposed a tooth near the lip corner in that earlier build. The emotion pass
repairs its tooth arch and mouth fit.

The final emotion review is in `artifacts/characters/carmela-emotions/rig-fixed/`
with 25 captures and no browser errors. The corrected rig completed a 42-step
offline consultation, including explicit waits for speech and gaze to release,
in `artifacts/gameplay/carmela-emoting-rig-fixed/`. The same head tilt that
exposed the chin fault was inspected in the game as well as the lab. A complete
video is saved with that replay.

The October 30 hair review captured 80 images without browser errors. Style,
grooming and cast sheets, plus tilted and bent-forward poses, were inspected.
The part was corrected to close between the raised hair banks when the head
tilts. The final default completed 42 offline gameplay steps in
`artifacts/gameplay/carmela-hair-final/`. Seeded waved and braided styles each
completed a 10-step reaction replay in `carmela-hair-waved-final/` and
`carmela-hair-braided-final/` under the same gameplay directory. Capture state
confirmed one visible style and the expected grooming weights for each run.
The same-pose old/new comparison is
`artifacts/characters/carmela-hair/review/comparison.png`.

The final ear and nape review has 144 captures in
`artifacts/characters/carmela-hair-over-ear/nape-review/`. It includes both
profiles, rear and rear-quarter views, greying and colour variants, coverage
extremes and rear views during head tilt. The sheets and representative motion
captures were inspected. `nape-comparison.png` compares the rejected arch with
the lower continuous edge. The new soft waves completed the 42-step offline
case in `artifacts/gameplay/carmela-nape-final/`; the curled seed completed a
10-step reaction path in `artifacts/gameplay/carmela-nape-curled/`. Both runs
had no failed actions or browser errors. Captures confirm that the strand
material keeps its 0.35 cutout threshold in the actual game.

The Blender motion audit samples all nine clips at five points each. The
worst sleeve edge stretch is 1.75 times its rest length, down from 11.77 in the
broken standing pose. Rebuilds also fail if head motion changes neutral
lower-face edge lengths by more than 5%. Audit output
is under `artifacts/characters/carmela-prototype/*-motion.json`.

The web assets are now about 8 MB each, including all five hairstyles. See [performance.md](performance.md) for
the production measurements. A full consultation video is saved beside the
accepted gameplay captures.
The latest machine-readable record is
`assets/source/carmela-russo-2026-10-29/validation-face-polish.json`.

## Sources, cost and limits

Source IDs, exports, reference briefs, exact saved prompts, credit deltas and
licence links are in `assets/source/carmela-russo-2026-10-29/provenance.json`.
The account menu confirmed Tripo Pro, and generations were private. The run
used 355 Studio credits, leaving 2,845 of the starting 3,200.

The dress follows features seen in the Met's [ca. 1895 dress](https://www.metmuseum.org/art/collection/search/92343),
[1894–96 dress](https://www.metmuseum.org/art/collection/search/157291) and
[1896–98 shirtwaist](https://www.metmuseum.org/art/collection/search/109506).
This is a period-informed prototype, not a documented reconstruction of
Carmela's wardrobe. No museum imagery is shipped.

Hair uses opaque meshes and a strand texture. The seated garment is an authored
carrier rather than cloth simulation. The cloth retains some baked shading
from the generated source. These remain prototype art assets.

## How to expand the cast

Keep this body and animation contract while adding individually fitted heads.
Each new head needs measured eye and mouth anchors, a neutral and blink review,
and an entrance and examination capture before it becomes a patient asset.
The second head demonstrates that path without buying a second body rig.

New hairstyles and garment pieces can now be added to this shared rig and
reviewed through the same captures. More detailed speech needs an audio and
phoneme pipeline. Broader body variation needs its own clothing-fit work;
multiplying face presets alone will not create a convincing cast of unrelated
people.

## New male foundations

Two independently generated male bodies and heads, body variation, short hair,
sideburns and moustaches are documented in [modular-men.md](modular-men.md).
They use the same facial controller contract, with measured donor-specific
anchors, and add twelve male appearance recipes to the twelve female studies.
