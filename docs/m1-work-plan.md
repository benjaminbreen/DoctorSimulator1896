# M1 work plan

M1 proves the consultation in one room with three patients. It does not include
the social pool, Central Park, the anthropometric laboratory, or production
crowds. Work is divided into three phases inside M1.

## Phase 1: character runtime foundation

Status: complete on 2026-08-10. Ben approved the Renderer C facial review
states in Character Lab.

Build the smallest reusable path from a deterministic patient record to a
rendered character in the game.

Deliverables:

1. A versioned character recipe and a deterministic Renderer C resolver. The
   resolver selects a cohort master, curated face anchor, supported live morphs,
   resting face, wardrobe identifiers, animation, and level of detail.
2. A game actor layer that loads Renderer C assets once, clones rigged actors,
   applies recipes, and accepts semantic body and facial cues.
3. A validation and publication command that copies approved runtime models and
   manifests from Character Lab into the game. The game never launches Blender.
4. Tests for reproducibility, anchor coverage, manifest validity, and actor
   state. Character Lab and the game use the same recipe contract.
5. Facial safety rules that cap live action units and prevent incompatible
   mouth controls from being applied together. Neutral, blink, guarded, and
   restrained jaw-open close-ups must pass review for both cohorts.
6. One shared six-tone complexion palette and six-colour eye palette. Patient
   generation uses bounded ancestry-aware subsets, while Character Lab keeps
   every approved option available for deliberate review.
7. Deterministic age appearance values for wrinkles, fine texture, complexion
   variation, freckles, mottling, under-eye depth, and hair greying. Age sets
   varied defaults; the lab keeps every value available for manual review.

This phase adds character-specific modules without moving unrelated park and
instrument files. The larger `world/` and `content/park1896/` split remains a
later maintenance task.

Phase 1 is complete when either of two distinct Renderer C recipes can place a
character in the consulting office, the game can swap between them, and the
actor interface can change body animation and facial cues.

Durable results:

- a reusable character contract and resolver;
- a reusable game actor renderer and asset publication path, including shared
  complexion, eye, age-surface, and hair-greying handling.

## Phase 2: three-patient consultation MVP

Status: in progress. The deterministic engine, offline dialogue renderer,
three technical fixtures, and isolated developer panel exist. The panel is not
mounted in `App.jsx` while the top navigation work is active. Technical
fixtures exercise the mechanics but do not count as verified patient content.

Build the complete consultation with plain placeholder controls. The UI must be
usable enough to test the loop, but it is not the final patient-mode design.

Deliverables:

1. A framework-independent consultation state machine covering the authored
   opening, questioning, examination, diagnosis, treatment, case note, and the
   two-ledger result.
2. A constrained LLM boundary. The LLM may render dialogue, behavior, and
   appraisal, but deterministic code owns facts, disclosure, trust, time,
   disease, treatment effects, reputation, and outcomes.
3. Three authored patients with explicit Renderer C recipes and one approved
   outfit each. Historical claims require Ben's verification before they become
   game content.
4. Basic controls for dialogue, examination, diagnosis, treatment, and the case
   note, plus a developer view of state transitions and validation failures.
5. Semantic performance cues such as `sitting-talking`, `distressed`, `blink`,
   and `look-away`. Full lip synchronization is not required.

Phase 2 is complete when all three consultations can be played from opening to
both ledger results, including an offline deterministic test renderer for the
LLM contract.

Durable results:

- a tested consultation engine with deterministic ground truth;
- three complete playable encounters.

## Phase 3: production patient UI

Replace the Phase 2 controls with the settled patient-mode and examination-mode
interface. This is an implementation phase, not an open-ended visual redesign.

Deliverables:

1. The production patient-mode layout: top bar, case overview, action verbs,
   case file, patient information, interpretation and speech controls, and the
   casebook.
2. The production examination mode with the patient view, symptom annotations,
   and the established interpretation/speech grammar.
3. Keyboard, pointer, focus, loading, error, and narrow-screen behavior.
4. Visual and interaction regression coverage for the three M1 encounters.

Phase 3 is complete when the three Phase 2 encounters can be played through the
production interface without developer controls.

Durable results:

- a reusable consultation UI shell;
- a classroom-ready M1 presentation of the three encounters.

## Deferred until after M1

- the social graph, weekly tick, and newspaper column;
- production crowd assets, including the proposed Tripo and Mixamo trial;
- Central Park and laboratory gameplay;
- full facial motion capture and phoneme-level lip synchronization;
- additional wardrobe families beyond the three M1 patients;
- the broad park-content file move described in `engine-architecture.md`.
