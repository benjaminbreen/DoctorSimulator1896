# Consultation testing

This guide describes the current implementation. The final target is in
[patient-system.md](patient-system.md).

The current consultation follows this sequence:

1. The patient gives an authored opening complaint. No model call is needed.
2. Inquiry begins. The player may alternate between consultation and
   examination mode.
3. Private interpretations record the physician's working ideas and cost no
   time.
4. Spoken questions normally advance the world clock by five minutes. The dialogue renderer
   may phrase a response, but the simulation decides which recorded facts may
   be disclosed.
5. Focused examinations display their cost and return one or more deterministic
   observations.
6. At the 30-minute limit the player must decide, take one five-minute overtime
   period, or arrange a follow-up.
7. The player selects a diagnosis and treatment from a short evidence-ranked
   list, with the complete list still available.
8. Authored case records ask the player to select two or three supporting
   findings; free prose is optional. Technical fixtures also allow the prose
   field to remain empty.
9. Authored cases end with an immediate patient reaction and a separate
   one-month result. Technical fixtures retain simple development scores.

## Current test content

`game/src/consultation/authoredPatients/` contains the complete Nora Byrne,
Samuel Taylor, and Carmela Russo authored cases. `technicalPatients.js` still
creates seeded fixtures used to test procedural identity, appearance, and
basic consultation behavior, but those fixtures are no longer in the opening
queue.

All three authored patients are researched fictional composites. Their sources and
invented connective material are recorded in
[patients/nora-byrne.md](patients/nora-byrne.md),
[patients/samuel-taylor.md](patients/samuel-taylor.md), and
[patients/carmela-russo.md](patients/carmela-russo.md). The technical fixture's
diagnosis and treatment mappings remain placeholders.
Animation parameters are not clinical measurements unless the patient record
defines them as such.

## Automated checks

Run:

```sh
npm --prefix game test
```

## Headless design playtest

The consultation can be played without the 3D app. This is the fastest way to
inspect affordances, action costs, disclosure, and outcomes:

```sh
npm --prefix game run playtest:consult -- --demo
npm --prefix game run playtest:consult -- --compare
npm --prefix game run playtest:samuel -- --demo
npm --prefix game run playtest:samuel -- --compare
npm --prefix game run playtest:carmela -- --demo
npm --prefix game run playtest:carmela -- --compare
```

`playtest:consult` defaults to Nora. `playtest:samuel` selects Samuel and
`playtest:carmela` selects Carmela. `--demo` prints every state transition in
the focused path. `--compare` shows three
routes and their time, question count, examination count, satisfaction,
payment, and one-month outcome in one table. Individual prompt and examination
IDs can also be supplied as arguments; run the command without arguments to
see the current available IDs and custom-path syntax.

The tests cover:

- all three patient records satisfying the contract;
- seeded patient and appearance generation being reproducible;
- the generated draft presentation remaining connected to the playable case;
- interpretation taking no time;
- speech and examination advancing time;
- questions unlocking only eligible facts;
- rejection of facts invented or released early by a dialogue model;
- deterministic examinations;
- the case notebook beginning with identity and growing from player actions;
- a complete opening-to-ledgers playthrough;
- actor cues following speech, examination, results, and termination;
- severe misconduct ending the consultation;
- Nora satisfying the authored-patient contract;
- Carmela satisfying the authored-patient contract in the third queue slot;
- Carmela's state-based tonic branch and mandatory in-room attack response;
- Samuel's state-based occupational branch and mandatory foreman response;
- Samuel's focused route concluding in twenty-three minutes without exhausting
  his bereavement and safety history;
- optional prose notes accepting zero words when the case requirements are met;
- a focused Carmela route filling exactly thirty minutes;
- Carmela's immediate approval diverging from one-month health;
- state-based authored prompt selection;
- custom inquiry finding unlisted but eligible evidence;
- locked evidence resisting forced prompt ids;
- custom thought classification without time or patient reaction;
- authored examinations and evidence-sensitive scoring;
- immediate satisfaction diverging from one-month health.

## In-game playtest

The production consultation view is mounted in the consulting office. For a
direct test URL use `?zone=consulting-office`. The raw engine panel is available
with `?zone=consulting-office&devconsult=1`.

For Nora, test these paths:

1. Complete a careful history and examination, choose support and continued
   occupation, write a complete note, and reach the immediate and one-month
   results.
2. Ask an unrelated question and confirm that no hidden fact is disclosed.
3. Interpret several cards and confirm that the clock does not advance.
   Then ask a question and confirm that both the numeric time and the hands on
   the dial wind forward together.
4. Try to proceed without inquiry, without a diagnosis, without a treatment,
   and without two selected findings. Each attempt should be rejected without losing
   state.
5. Use insulting text and confirm that the patient ends the consultation and
   begins to stand.
6. Choose spirit control and continued communications. Confirm that immediate
   acceptance and later health move in different directions.
7. Watch the character during speech and examination. The body and facial cue
   should change without breaking the selected identity or outfit.

For Carmela, test these paths:

1. Reconstruct an attack, ask about calamity, and confirm that the in-room
   attack requires a response before another question or examination.
2. Ground her, inventory medicines, exclude cardiac red flags, examine heart
   and breathing, and ask about the shop. Confirm that the visit reaches exactly
   thirty minutes and offers a strong evidence-ranked diagnosis.
3. Confirm the attacks as warnings, prescribe avoidance, and compare high
   immediate satisfaction with the worse one-month result.
4. Call the attack “only nerves,” prescribe seclusion, and confirm that trust,
   payment, and shop function suffer.

For Samuel, test these paths:

1. Reconstruct the course, ask what changed in the shop, and confirm that his
   question about the foreman's note must be answered before another action.
2. Give a provisional answer, ask about his bowels, examine gums and hands,
   and ask what work arrangement preserves wages. Confirm that a well-supported
   decision is possible after twenty minutes, or twenty-three with the abdominal
   examination.
3. Explore bereavement and safety, prescribe companionship without changing the
   shop exposure, and compare high immediate satisfaction with the worse
   one-month outcome.
4. Moralize about a “steady mind,” prescribe seclusion, and confirm the reduced
   fee and damaged function.
5. Leave the written case-note field empty, select the required evidence, and
   confirm that the result screen opens.
6. From the result screen, separately confirm that next patient, waiting room,
   and street return to the correct world state.

## Final-system gaps

The current tests do not yet cover:

- modular state-based choice selection for procedural patients;
- GPT-5.6 Luna contracts and server failure handling;
- practice-wide reputation and financial outcomes;
- model-rendered William James and modern debrief prose;
- full visual regression automation.
