# Decisions and open questions

Record of the 2026-08-05 strategy conversation (Ben + Claude Fable, with a
GPT 5.6 Pro critique in the loop). Future agents: read this before proposing
scope changes.

## Why this project

Ranked against Young Shakespeare, the plague simulator, Cybernetic Spies,
MKULTRA, and Spice Voyager, the 1880s–90s medical game won because:

1. **Book alignment.** *Ghosts of the Machine Age* (FSG, 2029) covers the
   James siblings, Galton, and the battle for consciousness — this game's
   exact milieu. Game research is book research; the game is book publicity.
2. **Proven loop.** The Apothecary Simulator already validated the
   consultation loop and exposed its failure mode (ungrounded drift/sort of boring).
3. **Cheapest writing-as-gameplay.** A graded case note is 150 words, not a
   five-act play.
4. **Engine fit.** Uses the interior/examine/library half of the Darwin
   engine; avoids the missing city pipeline (block + park + lab only).
5. **Real secondary market.** Medical humanities / history-of-medicine
   teaching; possibly bedside-manner training.

Shakespeare remains the best pure experiment in an LLM-native mechanic
(collaborative playwriting with resistant co-authors); shelved, not killed.
Plague simulator's deterministic-model-under-LLM architecture was adopted
here instead. Cybernetic Spies and Spice Voyager: shelved.

## Leading proposals (2026-08-05, Ben's second pass — not yet final)

1. **Date**: Ben floated 1892; current recommendation is **1896** (peyote,
   proto-Freud, X-ray mania, Lowell Lectures — receipts in
   [research.md](research.md#chronology)). Awaiting Ben's call.
2. **Player**: a young M.D. hanging a shingle in NYC after a falling-out
   with Cattell's Columbia program. Beard appears only as a referenced
   presence (he died in 1883, so a direct protégé would be middle-aged by
   the mid-1890s). Possibly the option to play as either
   male or female versions of the same character, differentiated in part by how the reputation system treats them. Mentors real, player and
   patients composite.
3. **Patients**: procedurally generated composites — the
   [historical-persona-generator](../../historical-persona-generator/)
   becomes the upstream, recombining real case-record material so patients
   are historically grounded but never stock. See research.md.
4. **Patient rendering**: hybrid. Mid-fidelity 3D bodies carry staging and
   symptoms (gait, tremor, posture, pallor, etc).


## 2026-08-06 — UI modes and the 1896 Character Lab

**Mode architecture (Ben's call, / not yet pinned down though! -Ben / ).** Three modes, per design.md "UI modes":
patient mode (first-person desk view, button-rich; reference images now the
two "NEW patient mode" mockups — see the dialogue-architecture section
below), examination mode (static
silhouette scene + symptom overlay + stance band; the round-two "Sitting"
concept, retitled), exploration mode (over-the-shoulder third person for
traversal areas).

**Character lab assessment** (`character-lab/`, built by GPT 5.6; reviewed by
Claude 2026-08-06):


- MPFB (free MakeHuman-in-Blender) parametric body + face; macro sliders
  (gender/age/height/weight/muscle/proportions/phenotype) and real face
  morphs, exported as **named GLB morph targets** the runtime can drive.
- Game-engine rig; authored looping "ClinicIdle" clip (breath/fidget keyed
  on spine/neck/head/arms, bezier-smoothed) embedded in the GLB.
- Deterministic preset contract (schemaVersion, seed, 56 values) →
  `make character` headless rebuild → GLB + contact sheet. Viewer separates
  27 live controls from 29 rebuild controls, has a fallback mannequin, seeded
  randomize, preset export. MPFB helper/mask baking handled (a real gotcha).
- This is the right harness: the persona generator can emit preset JSONs and
  the Makefile becomes the minors' body foundry.

Known gaps (all in the costume/pose layer, as predicted):
- Sleeve puffs are unparented uv-spheres — they float behind the shoulders
  and will not follow arm animation. Hair cap sits like a loose helmet;
  skirt is a rigid cone parented to the pelvis (no drape, clips when
  seated). Garment base is a recolored modern MakeHuman suit, not an 1896
  bodice. Period costume remains the true asset gap.
- "Seated" is a 20 cm downward translate (viewer) — there is no actual
  sitting pose; legs never bend.
- Identity morphs only — **no expression morphs yet.** MakeHuman expression
  targets can be exported the same way; key them to the same affect
  vocabulary as the portrait sets so 3D face and card agree.
- 41k triangles / 11.5 MB GLB per patient — needs the Darwin
  gltf-transform optimize pass before game use (~≤15k tris for background
  patients).
- Hygiene: `.blend1` and `.DS_Store` files belong in `.gitignore`.

Adopted plan: fix costume parenting/skinning and a real seated pose; add
expression morph export; map persona-generator output → preset JSON; run
GLBs through the Darwin optimize pipeline. The portrait-card decision stands
— the lab serves scene-distance bodies, not close-up emotion.

**Lab overhaul (Claude, 2026-08-06 pm).** The plan above is partly done:
costume moved out of Blender into a live procedural three.js layer
(`character-lab/src/costume.js` — skirt with seated lap drape, leg-of-mutton
sleeves, cuffs, collar, buttons, four hair styles; rebuilt on slider input,
bone-attached so it follows animation), a real seated pose baked in Blender
(thigh/calf/foot keyed inside both exported clips), two idle clips
(ClinicIdle, RestlessIdle), and a layered tunable performance system
(`src/idle.js`: breathing rate/amplitude, weight shift, fidget, gaze
saccades, finger-curling hand tension, hand tremor as symptom display,
kneesTogether decorum control, nod/shake/sigh/glance gestures). 66 preset
values, 42 live. Traps recorded in `character-lab/README.md`. Still open:
period base garment, expression morphs, GLB optimization pass.

## 2026-08-06 — Consultation dialogue architecture

**Reference mockups (settled direction).** `mockups/NEW patient mode
introspection mockup start of decision tree.png` and `mockups/NEW patient mode
dialogue mockup.png`. These are the closest images to the intended patient
mode and supersede the earlier patient-view mockups. Judge chrome, colour
grammar and band layout from them; the 3D figure is placeholder fidelity.

**Warm start.** The consultation does not open with an API call. Each patient
has a pre-written opening complaint plus one authored branch round; only after
that does the player type freely and the LLM take over. Rationale, in order of
weight:

1. Grounding. The model inherits a disclosure state instead of inventing one,
   which is what actually prevents anachronism and drift.
2. A canonical first beat, identical for every player — quotable in the book,
   usable in a classroom.
3. Zero latency on arrival, and cost that does not scale with players.

Procedural minors get the same treatment: their openers are generated once at
**casting** time, batched and cached to disk, never at runtime. Hand-authored
and generated patients then behave identically at the table.

**The eye/mouth grammar.** One band below the patient, two modes, distinguished
by glyph and colour:

- **Green eye — interpretation.** Private. Costs no clock time, the patient
  does not react, nothing is spoken. These set the player's working hypothesis,
  feed the case notebook and the assessor, and bias what the examine layer
  surfaces.
- **Amber dialogue bubble — speech.** Advances the clock, always answered,
  cannot be taken back. The free-text field lives in this mode: typing is
  speaking. (Currently drawn as a speech bubble, not a mouth; keep the bubble.)

Interpretation cards are the *reads* ("The tremor is real"), not lines of
dialogue. Spoken cards carry the verb-stances already adopted above
(QUESTION / REASSURE / …) and stance history feeds assessment.

**Fact channel vs reaction channel.** This is the leash, and the thing to get
right:

- **Facts** — biography, symptoms, history, what happened last Tuesday — come
  from the deterministic record. The prompt supplies a *disclosed* set and a
  *withheld* set; the model may release withheld facts only when the player
  earns them, and may never invent outside the sets. Backstory or symptoms the
  model coins are unrecorded and therefore ungrounded — the Apothecary
  Simulator failure mode.
- **Reactions** — tone, colour draining, standing up, walking out — are the
  model's to write freely. Nothing it does to behaviour corrupts the record,
  so there is no reason to constrain it there.

**Appraisal contract.** The encounter response carries an appraisal channel
alongside the dialogue:

```
{ dialogue, behavior, disclosedNow: [...],
  appraisal: { register, decorumBreach, intent, terminates } }
```

The model classifies what the player did; the **sim** decides what it costs.
The LLM never asserts a trust or reputation number. Worked example: the player
types "stare at her, then bark like a dog." The model returns a frightened
patient rising to leave and `decorumBreach: 3, terminates: true`; the sim
collapses trust, ends the encounter, and writes a `scandal` event to the
contagion graph, which the weekly Herald column and the society-strata
reputation both read next tick.


## 2026-08-08 — Metres, and why a correct size can still look wrong

Props kept being judged "too small" after being built to real measurements.
The measurements were right; the metre is simply not what the eye reads. What
it reads is pixels, and those depend on the field of view, how far the camera
sits behind the player, and how deep the room is. The player is the only thing
at a fixed camera distance, so its apparent size never changes while everything
else shrinks with the room. A 0.76m desk ten metres away rendered 41px against
the player's 151px — a 3.7:1 ratio on screen for objects 2.2:1 apart in life.

**Metres stay the ground truth.** Rapier, the terrain, the capsule, walk speed
and every period claim in the research all depend on them, and no other unit
fixes a projection problem — it only relabels the numbers.

Three things carry the difference instead:

- **`presence` in the pack manifest.** A model's `scale` comes from a real
  measurement and stays put; `presence` (default 1) is the one place a piece is
  allowed to be enlarged, and the manifest records both `size` (what ships) and
  `measured` (the truth). A test fails if an enlarged piece does not record what
  it really measures. The exaggeration is deliberate, in one field, with a
  reason written beside it.
- **`game/model-check.html?view=game`.** The game's own field of view and
  shoulder rig, the player figure beside the prop, and each piece's rendered
  height quoted at 2.5m and 8m. Judge a prop here before it ships; do not judge
  it from a number.
- **Field of view 66 -> 50.** One value, and it does more for how a room reads
  than any per-prop tuning, because it flattens the distance falloff for
  everything at once.

## 2026-08-09 — Start date: 3 August 1896

Settles the date left open on 2026-08-05. The game opens on **Monday
3 August 1896** in New York.

The great New York heat wave begins the following day and runs about ten
days. The era reads its casualties through heat prostration and nervous
exhaustion; what actually kills people is hyperthermia in airless top-floor
tenement rooms. The reputation/record split is therefore live in the first
week, and stratified by class, without anyone having to explain it. It also
gives the opening a bounded arc — ten days of pressure, then the city cools
and the year opens out: the Bryan/McKinley campaign to November, James's
Lowell Lectures in the autumn, Mitchell's peyote paper in December.

**Ben to verify before any of this becomes content**: heat-wave dates and
death toll (Kohn, *Hot Time in the Old Town*), Roosevelt's role as police
commissioner during it, and the Lowell Lecture dates.

Consequences already in code:

- `world/solar.js` computes a real solar position for 40.78 N on day 216.
  Sunrise 05:00 ENE, apparent noon 12:02 due south at 66 degrees, sunset
  19:06 WNW — matching an almanac for the date to a few minutes. No daylight
  saving: the US does not adopt it until 1918, so the clock is Eastern
  Standard and the sun peaks near noon, not near one.
- The previous model had the sun rising north-northwest and crossing due east
  at its highest, so every shadow pointed the wrong way.
- `START_DAY_OF_YEAR` and `solarDeclination()` are exported, so a calendar can
  drive the season later without touching the rest.

Note: field of view is back to 66 after tuning, reversing the 66 -> 50 line
in the 2026-08-08 entry.

## 2026-08-09 — The Pond from OSM; Gapstow in placed stones

The Pond outline is now the OpenStreetMap polygon (way 22726524), projected
into the world frame: rotated to the Manhattan grid, scaled 0.4, anchored at
the Fifth/CPS corner. **Ben's call: the modern outline stands in for 1896.**
The real 1896 pond ran further northeast (Wollman Rink, 1950, covered that
arm), so this is a knowing simplification, not an oversight.

- Everything the pond displaced moved to match the real geography: drives,
  shore walks, the Dairy, the Kinderberg, the Green, Hallett's knoll.
- Gapstow Bridge is built in `world/gapstow.js` as ~250 placed stones
  (arch ring, spandrel courses, curved parapet, coping, wing stones) from
  the documented measures: 76 ft run, 44 ft over water, 12 ft rise, at 0.4
  scale. Collision is a separate invisible staircase under the 0.32
  autostep; `render: false` on an item now means collider-only.
- Terrain carve gained a -0.55 depth floor so narrow water (the west hook,
  the bridge neck) stays submerged; grid is 280x230.
- Overhead camera got its own wheel zoom (to ~256 m) and fog fades out
  above 45 m, so the map view can be checked against a real map.
- The bridge is built at 0.58 of real size (`BRIDGE_SCALE` in
  `world/gapstow.js`), not the map's 0.4: people are full size, and at map
  scale the bridge read as a garden ornament next to them. The collider
  staircase is generated from the walk profile, so it follows any rescale.

## 2026-08-10 — Engine seams: scene/lib, zone features

The reusable-engine direction is now written down in
`docs/engine-architecture.md` (the "would it move to Shakespeare's London
unchanged?" test). The first shared modules added the same day were
`scene/lib/instances.js` (one InstancedMesh filler after the same culling bug
had to be fixed in five copies), `scene/lib/StaticColliders.jsx`, and zone
`features` lists resolved by `scene/ZoneFeatures.jsx`. GameCanvas therefore no
longer needs a separate mount for each landmark. The world/ → engine +
content/park1896 file split is deliberately deferred until the instrument work
lands, to avoid colliding with it.

## 2026-08-10 — M1 implementation order

M1 is divided into three implementation phases. The full scope and acceptance
criteria are in `docs/m1-work-plan.md`.

1. Build the reusable character recipe, Renderer C resolver, game actor layer,
   and validated asset publication path.
2. Build the complete three-patient consultation with basic placeholder
   controls. Deterministic code owns the record and outcomes; the LLM renders
   dialogue, behavior, appraisal, and prose.
3. Replace the placeholder controls with the settled patient-mode and
   examination-mode UI.

This order replaces the earlier implication that more open-ended Character Lab
polish or the park file move should precede the consultation. Renderer C already
has the face anchors, named face units, and body animations needed for the M1
runtime. Phase 1 integrates that work; it does not restart character research.

The proposed Tripo and Mixamo crowd trial is deferred until after M1. Crowd
figures do not need facial morphs, but each generated model must pass polygon,
material, rig, walk-cycle, and long-garment deformation checks before use.

## Still open

- **Title**: does sharing the book's exact title help (promotion) or hurt
  (search collision, FSG's view of it)?
- **Jamesiana integration**: link out to the public site, or embed corpus
  excerpts directly in the in-game library?
- Exact falling-out backstory beats; whether mentors speak LLM dialogue or
  stay scripted (real-person dialogue raises the Vintage-LLMs concern).
