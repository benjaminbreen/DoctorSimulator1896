# Current decisions and open questions

This file records binding project decisions. Superseded proposals and implementation
history remain available in Git.

## Project scope

- The game is a non-commercial teaching project about medicine, psychology, and
  patient experience in 1896.
- The setting begins on Monday, June 15, 1896.
- The player is a fictional young physician. George Beard and William James are
  historical figures within the setting, not player characters.

## Historical content

- Historical content should identify its sources and distinguish documented
  material from fictional connective material. Review happens through normal
  research and playtesting.
- Authored patients will be composites based on verified case reports from the
  1880s and 1890s, especially medical and psychological literature connected to
  William James.
- Procedural patients use seeded simulation data. Their underlying conditions,
  motives, symptoms, and outcomes are deterministic ground truth.
- Period terms may appear in dialogue and diagnosis choices, but the modern
  debrief must distinguish historical categories from current medical knowledge.

## Patient system

The final specification is [patient-system.md](patient-system.md). It supersedes
earlier consultation proposals.

- Every patient has a known underlying etiology, including cases expressed through
  historically diffuse diagnoses.
- Authored and procedural patients use the same consultation state and outcome
  model. Authored cases provide hand-written branches; procedural cases assemble
  branches from compatible question, clue, response, and treatment modules.
- Ordinary dialogue presents three written choices and one custom-text field.
- Thought mode presents three written interpretations plus a smaller custom option.
- Custom text is genuine open inquiry. It may discover relevant facts that no
  displayed choice states explicitly.
- The simulation decides what is true and what changes. An LLM may classify player
  intent and render a response, but it may not invent ground truth or assign rewards.
- LLM calls are optional fallbacks for custom input or exhausted branches. The
  authored and procedural systems must remain playable without them.
- The runtime model is GPT-5.6 Luna at zero reasoning effort, reached through a
  server-side route at `api/consult.mjs`. A custom question is sent only when it
  matches no authored rule, so written answers always win.
- The end of each visit gives immediate feedback about patient experience,
  satisfaction, payment, and likely word of mouth.
- A one-month follow-up separately resolves health, reputation, and economic
  consequences. A pleased patient may still have a poor medical outcome.
- The final debrief combines in-period results, a William James assessment, and a
  modern explanation of what happened. Numerical results come from the simulation;
  the LLM writes the presentation.
- A future patient role uses the same patient and outcome model from the other side
  of the consultation.

## Consultation interface

- The current playable perspective is the doctor role in consultation view.
- The final interface and case-notebook behavior are part of
  [patient-system.md](patient-system.md), not separate decision records here.

## Time and outcomes

- The simulation clock advances at four game seconds per real second during active
  play.
- Dialogue advances time by five game minutes.
- Examination advances time by three game minutes.
- A close examination of an object advances time by the minutes its procedures
  cost, and lowers neurasthenia once per subject, capped at five points.
- Thought choices do not advance time.
- Immediate patient satisfaction and later health are separate variables.
- Reputation affects referrals and fees. Serious harm may also trigger legal or
  licensing consequences.
- The current prototype resolves a delayed outcome for each encounter. A wider
  multi-day practice may later combine those stored outcomes.

## Character system

- Renderer C is the final character system.
- It uses two shared consultation masters, one per sex, with approved identity
  anchors and deterministic appearance recipes.
- Procedural patients use the shared masters. Authored anchor patients may use a
  dedicated model and rig, but they must use the same semantic animation cues
  and character recipe contract. Nora Byrne is the reference implementation.
- Technical wardrobe examples prove the system; they are not verified 1896 costume
  references.
- Current rules are in
  [renderer-c-production-objective.md](renderer-c-production-objective.md) and
  [facial-animation.md](facial-animation.md).

## World and engine

- World geometry uses metres. Imported models record their measured size.
  Deliberate enlargement uses an explicit `presence` factor.
- The current first-person field of view is 66 degrees.
- Interaction uses a small shared contract for prompts, actions, and instrument
  views. See [engine-architecture.md](engine-architecture.md).
- Engine reuse comes from selected modules in Darwin Game v1, never by copying its
  large store or scene components whole. See [engine-reuse.md](engine-reuse.md).
- The present pond is a deliberate simplification of the modern OpenStreetMap shape.
  Ben decides whether later historical evidence justifies changing it.
- Gapstow Bridge remains at 0.58 of real size unless a measured replacement is
  adopted.
- FXAA is rejected for the main game renderer. It has produced substantial
  full-scene graphical regressions in two playtests and should not be
  reintroduced. Address shimmering through geometry, material, LOD, or a
  separately reviewed antialiasing method instead.

## Open questions

- Final title.
- How James's archive and mentor role enter ordinary play.
- Exact day structure and end condition for the wider practice game.
- Which authored patient composites to build first after source verification.
