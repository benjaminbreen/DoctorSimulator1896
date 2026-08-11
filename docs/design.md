# Design

## Concept

The player is a physician in New York beginning on 3 August 1896. Patients
arrive with complaints the era
reads through its own categories: neurasthenia, hysteria, nervous exhaustion,
spirit communication. The player examines, diagnoses in period vocabulary,
treats with period modalities, and writes case notes. The game scores both how
the era judges the player and what actually happens to the patients. The gap
between those two ledgers is the point.

The game is the book's argument made playable: consciousness *treated* (the
consulting room) versus consciousness *counted* (the anthropometric lab).

## Core loop: the consultation

1. A patient arrives (encounter system; social-graph sim decides who comes).
2. Observe and examine — pulse, tongue, pupils, tremor, affect. Uses the
   Darwin examine contract: `{reply, fact{label, value, confidence,
   measurement}, behavior, uncertainty}`.
3. Take a history through dialogue. Warm start: an authored opening complaint
   and one authored branch round, then free text handed to the LLM with the
   disclosure state already set. The patient is played by the LLM but carries
   a deterministic ground-truth condition the LLM cannot alter. See
   [decisions.md](decisions.md#2026-08-06--consultation-dialogue-architecture).
4. Diagnose in period terms. Choose a modality: electrotherapy, bromides,
   tinctures (incl. coca preparations), rest cure, talk, placebo, referral.
5. Write the case note. An LLM assessor grades it against period diagnostic
   epistemology — the writing is the gameplay.

## The dual ledger

- **Reputation**: standing with 1880s–90s peers, scored by period standards.
  Prescribing fashionable treatments raises it. Refusing them can lower it.
- **Record**: the retrospective, historian's-eye outcome for each patient.
  Ground truth decides it; charm never cures anyone.

Some era-approved treatments harm. Some quack tinctures are merely inert. The
divergence between the ledgers teaches the historiography of medicine.

## Patient casting model

Roughly **eight deeply authored anchor patients**, each returning several
times across the game — 3–4 of them actual historical figures, the rest
composites built from real case records. Procedurally generated minor
patients (via the historical-persona-generator) supply queue pressure and
social texture and populate the contagion graph. The generator is a casting
and variation system, not the author of the central cases.

Body pipeline for 3D patients: Renderer C in `character-lab/`. It combines
curated GNM-derived face anchors with MPFB topology, rigging, live morphs, and
modular hair and clothing. Deterministic character recipes select a reusable
foundation, bounded anatomy and resting-face variation, presentation assets,
and a scene-appropriate LOD. Facial diversity within the same demographic
cohort is a primary acceptance requirement, not optional polish. See the
[Renderer C production objective](renderer-c-production-objective.md) for the
current architecture and gates.

## Ground truth beneath the LLM

Every patient has a deterministic condition assigned at creation — some match
their era-label (a "neurasthenic" with no organic disease), some do not (early
TB, syphilis, lead poisoning, thyroid disease presenting as nerves). The LLM
renders dialogue, narration, and prose; the simulation decides sickness,
response to treatment, and outcomes. This is the anti-sycophancy architecture:
the player cannot talk the disease out of behaving like a disease.

## Social contagion simulation

The patient pool is a social graph (~50–100 tracked people in households,
congregations, clubs, workplaces) updated on a deterministic weekly tick.
Player practice patterns feed back:

- Repeated neurasthenia diagnoses make associates of the diagnosed present
  with nervous complaints — diagnosis manufactures demand.
- Repeated coca/cocaine prescriptions produce returning and drug-seeking
  patients.
- Harms and deaths propagate through the graph as reputation damage.

The scholarly anchor is Ian Hacking's looping effect: categories of people
change the people categorized. The sim makes the player enact it. All feedback
is triggered by the deterministic sim, never by the LLM.

**Legibility device**: a weekly period newspaper health column, written by the
LLM from sim facts only (grounded generation). It is how the player sees the
pool shifting — who is talking about nerves, what is fashionable, what rumors
attach to the player's practice.

## Locations

- **Hero interiors**: consulting office, waiting room, study. 90% of play.
  Uses the Darwin interiors blueprint system.
- **Central Park**: one outdoor zone reusing Darwin wilderness assets
  (ecology renderers, weather, sky). Walks, encounters, a breather between
  consultations. Designed parkland, so scatter layers need park species and
  path discipline, but the machinery carries.
- **Anthropometric laboratory** (Cattell-style, Columbia): bounded
  measurement gameplay — a queue, instruments, classification decisions whose
  purpose dawns on the player procedurally. Victorian *Papers, Please*.
  Chronology constraint: Cattell reaches Columbia in 1891 — see
  [research.md](research.md#chronology).
- Possible: pharmacy counter (materia medica shelves as examinables).

## UI modes

Four presentation modes over one world state:

1. **Patient mode** — first-person at the physician's desk, patient seated
   across in 3D, full working chrome: top bar (clinic nameplate, clock, date,
   patient queue, incoming letters), right rail (case overview, action verbs,
   case file), portrait card and patient panel lower left, casebook on the
   desk. Reference: `mockups/NEW patient mode introspection mockup start of
   decision tree.png` and `mockups/NEW patient mode dialogue mockup.png` —
   the settled direction, superseding the earlier patient-view images. Used
   for consultations.
2. **Examination mode** — a static, zoomed-out reading of the same scene:
   the patient further away, in silhouette, symptom annotations arrayed
   around the figure, minimalist chrome (no verb buttons), bottom band for
   questioning stances. Entered from patient mode via the Examine verb.
   Reference: round-two HTML concept IV, formerly titled "The Sitting."
3. **Exploration mode** — close third-person over-the-shoulder hero camera
   for areas with 3D movement (the street, Central Park, house calls, the
   lab). Patient-mode chrome density, minus the consultation panels.
4. **Instrument mode** — the camera leaves the player, moves to a framing
   pose stored on the apparatus, and hands input to the instrument. Entered
   with E from exploration mode, left with Escape. Used for the laboratory
   apparatus, where operating the thing *is* the mechanic.

### What E does, and to what

One field on a furniture item, three tiers:

| `affordance` | Example | What happens |
|---|---|---|
| absent | table, wall, carpet | no prompt at all |
| `{ verb, kind: 'act' }` | chair, couch, lamp, vase | prompt, then an action in place — sit, extinguish, take a flower. The camera does not move. |
| `{ verb, kind: 'instrument' }` | tachistoscope, colour wheel, chronoscope | prompt, then instrument mode |

The prompt and the proximity test are shared; only the payload differs. This
is the same channel the door triggers already use.

### The rule instrument mode has to keep

An instrument view is **a view onto a simulation, not a scripted animation**
— the same constraint the LLM systems work under. The tachistoscope has a
shutter position, a drop height and a slot width; the exposure the player
gets is whatever those produce, computed from `v = sqrt(2gd)`. A hard-coded
"40ms flash" would teach nothing, could not be tuned, and could not be got
wrong — and being able to get it wrong is the point of an instrument.

Each instrument is therefore a module with `{ framing, state, step(dt, input) }`
and no renderer, so its physics is unit-tested like the movement math is. The
3D view reads that state and draws it.

## LLM roles (all JSON-contract, all on deterministic ground truth)

| Role | Carries from Darwin |
|---|---|
| Patient dialogue | encounter route contract (dialogue, trustDelta, flags), plus a new appraisal channel — the model classifies what the player did, the sim prices it |
| Physician narrator (stream of consciousness) | narrator profile templating |
| Examination feedback | examine route contract |
| Case-note assessment | finalAssessment pattern |
| Weekly newspaper column | new, but pure grounded generation |

## Design principles

1. Deterministic ground truth beneath every LLM surface.
2. Resistant NPCs — patients, rivals, and assessors push back; no sycophancy.
3. Primary sources in-world via the library reader; reading unlocks and
   justifies modalities.
4. Every phase must yield two durable results (playable piece, essay,
   classroom evidence, book material, or reusable capability). Open-ended
   polish counts as zero.
5. Scope stop-losses set in advance. The Darwin lesson: art direction can
   absorb unlimited time.

## Milestones

**M1 — the consultation, proven.** One consulting room. Three patients: one
organic disease mislabeled as nerves, one true neurasthenia presentation, one
psychical-research case (hears a dead sibling). One modality set. Case-note
assessment working end to end. No contagion sim, no park, no lab. M1 has three
internal phases: the character runtime foundation, the consultation MVP with
basic placeholder controls, and the production patient UI. See
[m1-work-plan.md](m1-work-plan.md).

**M2 — the pool.** Weekly tick, social graph, newspaper column, dual ledger
surfaced in UI.

**M3 — the lab and the park.** Anthropometric lab as a bounded episode;
Central Park zone from Darwin assets.
