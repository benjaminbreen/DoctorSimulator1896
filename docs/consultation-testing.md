# Consultation MVP testing

The consultation follows one deterministic sequence:

1. The patient gives an authored opening complaint. No model call is needed.
2. Inquiry begins. The player may alternate between patient mode and
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
8. The result shows two scores: period reputation and the patient record.
   They may disagree.

## Current test content

`game/src/consultation/technicalPatients.js` contains three technical fixtures.
They are deliberately generic and are marked `technical-fixture`. They test
the engine and character changes without treating draft historical material as
approved content. They must be replaced by Ben-verified patient records before
the three encounters count as finished consultation content.

## Automated checks

Run:

```sh
node --test game/tests/consultation.test.js
```

The tests cover:

- all three patient records satisfying the contract;
- interpretation taking no time;
- speech and examination advancing time;
- questions unlocking only eligible facts;
- rejection of facts invented or released early by a dialogue model;
- deterministic examinations;
- a complete opening-to-ledgers playthrough;
- actor cues following speech, examination, results, and termination;
- severe misconduct ending the consultation.

## In-game playtest

The temporary consultation panel is mounted only in the consulting office. It
is separate from the main HUD and does not determine the production Phase 3
layout. Enter the room, choose one of the three technical patients, and select
**Begin inquiry**.

For each technical patient, test these paths:

1. Ask a relevant question, perform both examinations, choose a diagnosis and
   treatment, write a complete note, and reach both ledgers.
2. Ask an unrelated question and confirm that no hidden fact is disclosed.
3. Interpret several cards and confirm that the clock does not advance.
   Then ask a question and confirm that both the numeric time and the hands on
   the dial wind forward together.
4. Try to proceed without inquiry, without a diagnosis, without a treatment,
   and with a short case note. Each attempt should be rejected without losing
   state.
5. Use insulting text and confirm that the patient ends the consultation and
   begins to stand.
6. Watch the character during speech and examination. The body and facial cue
   should change without breaking the selected identity or outfit.

During this pass, judge the mechanics and pacing. Do not judge the technical
labels as final writing or historical content.
