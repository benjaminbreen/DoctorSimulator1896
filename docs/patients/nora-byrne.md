# Nora Byrne

Status: playable research draft, 2026-08-12.

Nora Byrne is the reference authored patient. She demonstrates the patient
format, deterministic disclosure, custom inquiry, diagnosis and treatment
evaluation, immediate reaction, and one-month outcome.

## Fictional case

Nora is a 28-year-old copyist living in a Greenwich Village boarding house. She
opens with poor sleep and trembling hands. Careful inquiry may establish:

- her sister Mary died six months earlier;
- a fellow boarder introduced her to a spiritualist circle;
- her left hand sometimes writes without a felt intention to write;
- she has had three brief gaps in memory during otherwise orderly behavior;
- the writing contains no knowledge unavailable to her;
- prolonged seclusion would cost her work and lodging.

Examination may find a variable tremor, glove-like sensory loss, normal strength
and reflexes, and no supporting signs of Basedow's disease.

The simulation's ground truth is a fictional presentation of dissociative
amnesia with functional neurological symptoms after bereavement, overwork, and
sleep disruption. Spiritualist expectations shape the symptoms. The case does
not contain malingering, epilepsy, structural nervous disease, intoxication, or
supernatural knowledge.

## Sources

Nora is a fictional composite. No historical subject below is retrospectively
identified as having Nora's modern ground truth.

- William James, *The Principles of Psychology* (1890), vol. 1,
  [pp. 391–393](https://www.gutenberg.org/cache/epub/57628/pg57628-images.html#Page_391):
  Ansel Bourne's purposeful behavior during a period later lost to memory, and
  James's discussion of spontaneous hypnotic trance.
- James, *Principles*,
  [p. 228](https://www.gutenberg.org/cache/epub/57628/pg57628-images.html#Page_228):
  Janet's Lucie answering in writing with an insensible hand, and James's note
  that some automatic writers understood the apparent agent as a departed
  spirit.
- Pierre Janet, *L'Automatisme psychologique* (1889),
  [p. 200 and surrounding experiments](https://books.google.com/books?id=Fwlujzu_LNsC&pg=PA200):
  divided awareness and automatic writing in Lucie.
- Charles L. Dana, *Text-book of Nervous Diseases* (1892),
  [pp. 416–430](https://archive.org/details/textbookofnervo00dana/page/416/mode/2up):
  period descriptions of hysteria, tremor, sensory loss, trance, amnesia, and
  cerebral automatism, with contemporary differential diagnosis and treatment.

The New York setting, family history, occupation, séance circle, exact symptom
course, causal model, and outcomes are fictional connective material.

## Outcome design

The case is designed so patient satisfaction and health can disagree.

- Support, regular sleep and food, continued occupation, reduced séance
  exposure, and follow-up have the best health and functional outcome.
- Endorsing spirit communication produces high immediate acceptance and useful
  word of mouth, but reinforces the episodes and harms work.
- Full rest and seclusion can quiet visible symptoms while costing Nora her job
  and lodging.
- Bromides sedate without addressing the cause.
- repeated suggestive hypnosis risks contaminating the account;
- accusation or dismissal harms both the relationship and the later course.

The implementation is in
[`game/src/consultation/authoredPatients/noraByrne.js`](../../game/src/consultation/authoredPatients/noraByrne.js).
