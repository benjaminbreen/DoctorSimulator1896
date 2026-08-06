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
   consultation loop and exposed its failure mode (ungrounded drift).
3. **Cheapest writing-as-gameplay.** A graded case note is 150 words, not a
   five-act play.
4. **Engine fit.** Uses the interior/examine/library half of the Darwin
   engine; avoids the missing city pipeline (block + park + lab only).
5. **Real secondary market.** Medical humanities / history-of-medicine
   teaching; possibly bedside-manner training.

Shakespeare remains the best pure experiment in an LLM-native mechanic
(collaborative playwriting with resistant co-authors); shelved, not killed.
Plague simulator's deterministic-model-under-LLM architecture was adopted
here instead. Cybernetic Spies and Spice Voyager: shelved. MKULTRA-scale
"short, finished, formally coherent piece" is the sizing model for the
anthropometric lab episode.

## Rules adopted

- **Two durable results per phase** (from the GPT critique): each phase must
  produce at least two of — a complete short playable experience, an essay,
  classroom evidence, book material, a reusable capability. Open-ended polish
  counts as zero.
- **Darwin visual scope is frozen** except for bugs and legibility/perf
  problems. Darwin's remaining budget goes to its pedagogical spine (NPCs,
  assessment loop, classroom deployment).
- **Deterministic ground truth beneath every LLM surface.** The LLM renders;
  the sim decides.
- **New repo, not a fork; copy modules on demand; no speculative engine
  extraction.** See [engine-reuse.md](engine-reuse.md).

## Leading proposals (2026-08-05, Ben's second pass — not yet final)

1. **Date**: Ben floated 1892; current recommendation is **1896** (peyote,
   proto-Freud, X-ray mania, Lowell Lectures — receipts in
   [research.md](research.md#chronology)). Awaiting Ben's call.
2. **Player**: a young M.D. hanging a shingle in NYC after a falling-out
   with Cattell's Columbia program. Beard appears only as a referenced
   presence (he died in 1883, so a direct protégé would be middle-aged by
   the mid-1890s). Proposed falling-out seed: the player saw early what
   Wissler proved in 1901 — Cattell's mental tests predict nothing.
   Male and female versions of the same character, differentiated by mentor
   lineage and by how the reputation system treats them: the male version
   under an aging Beard intimate (A.D. Rockwell, Beard's real co-author,
   still practicing in NYC), the female version under Mary Putnam Jacobi
   (real, NYC, the era's sharpest critic of rest-cure reasoning; roughly one
   in twenty US physicians were women by 1900). Mentors real, player and
   patients composite.
3. **Patients**: procedurally generated composites — the
   [historical-persona-generator](../../historical-persona-generator/)
   becomes the upstream, recombining real case-record material so patients
   are historically grounded but never stock. See research.md.
4. **Patient rendering**: hybrid. Mid-fidelity 3D bodies carry staging and
   symptoms (gait, tremor, posture, pallor — procedural-animation territory
   the Darwin engine is genuinely good at); faces and emotion live in a 2D
   period-portrait layer (cabinet-card / albumen-print style, generated per
   patient with a small expression set, diegetic as the case-file
   photograph). Do NOT put realistic 3D facial animation on the critical
   path — it is the one asset class agent+Blender pipelines cannot reliably
   deliver, and the uncanny valley punishes near-misses hardest in a game
   about reading patients.

## Mockup review (2026-08-05)

Three Claude HTML concepts (Case File / Examination / Desk — published
artifact "first-three-concepts") plus seven GPT image mockups in `mockups/`.
Convergent architecture across both sets: 3D world view + observation
annotations + 2D portrait plate + casebook commit layer + queue and Herald
as physical objects.

Ben's calls after the review (these override the first-pass takes below):

- **Core patient-facing view**: hybrid of "GOTMA the Game mockup 1" and
  "version 2" — patient front-facing and central in the painted/3D room,
  case notebook rail left, instrument/action verbs right, dialogue band
  below. The from-behind window shot is a *moment* (arrivals, key beats),
  not the default camera. Filler text in those mockups is placeholder; judge
  layout only.
- **Portrait pipeline — generated art only.** Hand-authored SVG/Canvas
  portraits were mockup placeholders and are dead for production; nothing
  procedural approaches the AI-generated painterly style (see the Ostrander
  card). Two tiers, one locked style (muted palette, dark ground, flat
  light; never hyperreal — slop risk):
  1. Anchor patients (~8–12): a generated expression set each (~6–12
     states), produced by reference-conditioned edits of one canonical
     neutral portrait, one human curation pass. Expression taxonomy is
     locked to the affect tags the encounter route emits — portraits and
     prompts share one vocabulary.
  2. Procedural minors: unanimated stock portraits (~24) in the same style,
     assigned by the casting system.
- **3D faces**: coarse acting only (gaze, head tilt, posture) at medium
  distance; camera never goes closer than the 3D face survives. Close-up
  emotion always lives on the static generated portrait badge. Body acting
  (hands, tremor, posture) stays in 3D.
- **Reputation is in.** Not a header scoreboard — a casting input: standing
  determines the social strata of incoming patients and routes word-of-mouth
  through the contagion graph (referrals travel within a stratum). Make it
  plural per William James's "social selves" (Principles, ch. X): separate
  standing with society patients, the medical establishment, the psychical
  circle, the ward. Different doors open per audience.

Still adopted from the first pass:

- Verb-tagged stances (QUESTION / REASSURE / TREATMENT …) — player picks
  the stance, LLM voices the line; stance history feeds assessment.
- Casebook right page carries retrospective notes and the next-appointment
  slip — the case page is the longitudinal timeline.
- A differential list may appear as the player's own accumulating notebook
  reference, but *committing* a diagnosis stays a written/inked act, never
  a list click.
- Full Art Nouveau chrome ("interesting but impossible"): steal plate
  borders and chapter-screen ornament only.

## 2026-08-06 — UI modes and the 1896 Character Lab

**Mode architecture (Ben's call).** Three modes, per design.md "UI modes":
patient mode (first-person desk view, button-rich; reference images now the
two "NEW patient mode" mockups — see the dialogue-architecture section
below), examination mode (static
silhouette scene + symptom overlay + stance band; the round-two "Sitting"
concept, retitled), exploration mode (over-the-shoulder third person for
traversal areas).

**Character lab assessment** (`character-lab/`, built by GPT 5.6; reviewed by
Claude 2026-08-06):

What is real and right:
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

**Lab overhaul (Claude, 2026-08-06 pm).** The plan above is largely done:
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

**No refusal path.** The contract has no "I don't understand" slot. Every input
is classified into the appraisal taxonomy, and the persona is a person in a
room in 1896 who cannot fail to parse the player — only be frightened,
confused, offended or amused. Player anachronism becomes in-fiction
consequence: ask about the telephone in her pocket and she asks what you mean,
and it costs standing for talking gibberish.

## Still open

- **Title**: does sharing the book's exact title help (promotion) or hurt
  (search collision, FSG's view of it)?
- **Jamesiana integration**: link out to the public site, or embed corpus
  excerpts directly in the in-game library?
- Exact falling-out backstory beats; whether mentors speak LLM dialogue or
  stay scripted (real-person dialogue raises the Vintage-LLMs concern).
