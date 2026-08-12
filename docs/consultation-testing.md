# Consultation testing

This guide describes the current implementation. The final target is in
[patient-system.md](patient-system.md).

The current consultation follows this sequence:

1. The patient gives an authored opening complaint. No model call is needed.
2. Inquiry begins. The player may alternate between consultation and
   examination mode.
3. Private interpretations record the physician's working ideas and cost no
   time.
4. Spoken questions advance the world clock by five minutes. The dialogue renderer
   may phrase a response, but the simulation decides which recorded facts may
   be disclosed.
5. Examinations advance the world clock by three minutes and return a deterministic
   observation and fact.
6. The player selects a diagnosis and treatment.
7. The player writes a case note. The test fixtures require at least twelve
   words and check whether important observed facts appear in the note.
8. Authored cases end with an immediate patient reaction and a separate
   one-month result. Technical fixtures retain simple development scores.

## Current test content

`game/src/consultation/authoredPatients/noraByrne.js` contains the first complete
authored case. `technicalPatients.js` still creates seeded fixtures used to test
procedural identity, appearance, and basic consultation behavior.

Nora is a researched fictional composite. Her sources and invented connective
material are recorded in [patients/nora-byrne.md](patients/nora-byrne.md). The
technical fixtures' diagnosis and treatment mappings remain placeholders.
Animation parameters are not clinical measurements unless the patient record
defines them as such.

## Automated checks

Run:

```sh
npm --prefix game test
```

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
   and with a short case note. Each attempt should be rejected without losing
   state.
5. Use insulting text and confirm that the patient ends the consultation and
   begins to stand.
6. Choose spirit control and continued communications. Confirm that immediate
   acceptance and later health move in different directions.
7. Watch the character during speech and examination. The body and facial cue
   should change without breaking the selected identity or outfit.

The two technical patients should still complete their simpler flows without
errors.

## Final-system gaps

The current tests do not yet cover:

- modular state-based choice selection for procedural patients;
- GPT-5.6 Luna contracts and server failure handling;
- practice-wide reputation and financial outcomes;
- model-rendered William James and modern debrief prose;
- full visual regression automation.
