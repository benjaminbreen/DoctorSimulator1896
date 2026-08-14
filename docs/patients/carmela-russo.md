# Carmela Russo

Status: playable research draft, 2026-08-13.

Carmela Russo is the third patient in the opening queue. Her consultation is a
short authored case about distinguishing dangerous heart disease from nervous
palpitation, identifying a commercially advertised stimulant, responding to a
frightened patient without either condescension or collusion, and prescribing a
plan she can actually afford to follow.

## Fictional case

Carmela is a 46-year-old widow who owns a provisions shop and lives above it
with her seventeen-year-old daughter, Elena. She came to New York from Sicily
at eleven and has lived in the city for thirty-five years. She therefore speaks
fluent, idiomatic English; the case deliberately avoids broken-English eye
dialect and stock Italian exclamations.

Three weeks before the consultation, Carmela stopped a man attempting to take
money from her till. She was composed during the struggle, but developed a
sudden attack of palpitation, short breath, tingling, trembling, and dread after
she barred the door. Subsequent attacks peak quickly and pass in about ten
minutes. The shop bell and crowded horse-car have begun to provoke fear, and
she increasingly leaves the counter to Elena.

After the first attack, a customer recommended Mariani coca wine. Carmela now
takes a wineglass three times daily. The attacks became more frequent, often
within an hour of a dose. A focused history finds no syncope, exertional chest
pressure, edema, cyanosis, or sustained irregular rhythm. In the office her
pulse is regular, slows with quiet breathing, and there is no murmur,
enlargement, pulmonary sign, thyroid enlargement, or marked pallor.

The simulation's fixed ground truth is a fictional presentation of panic after
a genuine fright, amplified by coca-wine stimulant exposure and maintained by
avoidance. It excludes structural heart disease, sustained arrhythmia,
hyperthyroidism, marked anaemia, malingering, and prophetic warning. A normal
office examination reduces but cannot eliminate concern about an intermittent
cardiac disorder.

## Consultation design

The consultation is built to reach a meaningful decision in thirty minutes,
without exhausting every card.

1. Reconstructing an attack reveals its rapid course and the attempted theft.
2. Asking what Carmela fears reveals avoidance and provokes an attack in the
   room. The player must answer before collecting more evidence.
3. A steady, concrete response improves trust; dismissing “only nerves” harms
   it; confirming an omen wins immediate approval while reinforcing fear.
4. A three-minute inventory of medicines and cordials reveals the coca wine and
   its timing.
5. Cardiac red flags, a focused examination, and the shop's economic stakes
   compete for the remaining time.
6. Diagnosis and treatment are selected from evidence-ranked short lists. The
   case record requires two or three supporting findings.

The best complete path uses five questions and one examination in exactly
thirty minutes. Shorter paths remain valid, but leave the player with a less
secure diagnosis or a plan poorly matched to Carmela's life.

## Voice

All Carmela dialogue is invented; it is not presented as a quotation from a
historical person. The prose uses late nineteenth-century vocabulary and
sentence structure while keeping her voice brisk, exact, and commercially
minded. Shopkeeping images—an honest account, closing the shutters, who pays the
grocer—give her an individual idiom without treating ethnicity as phonetic
decoration. She is observant, Catholic, and open to the idea of presentiment,
but not generically superstitious. She resents a physician who uses “nerves” as
a way to stop listening.

This is a cautious reconstruction. Published descriptions of Italian New
Yorkers in the 1890s were usually written by reformers or journalists from
outside the community, and dependable verbatim testimony from women in
Carmela's exact circumstances is scarce. Those sources inform setting and
social pressures, not a claimed transcription of immigrant speech.

## Sources

Carmela is a fictional composite. No historical subject below is
retrospectively identified as having her modern ground truth.

- William James, *The Principles of Psychology* (1890), vol. 2,
  [chapter 25](https://psychclassics.yorku.ca/James/Principles/prin25.htm):
  fear accompanied by palpitation, trembling, disturbed breathing, and
  precordial anxiety.
- James, *Principles*,
  [chapter 24](https://psychclassics.yorku.ca/James/Principles/prin24.htm):
  a period account of terror and palpitation associated with crossing an open
  square, used as context for learned situational fear rather than as Carmela's
  biography.
- William A. Anderson, *A Text-book of the Practice of Medicine* (1895),
  [pp. 53–54](https://upload.wikimedia.org/wikipedia/commons/b/bf/A_text-book_of_the_practice_of_medicine_%28electronic_resource%29_-_for_the_use_of_students_and_practitioners_%28IA_b20388482%29.pdf):
  period differential and treatment of functional palpitation; alcohol, tea,
  coffee, opium, cocaine, and tobacco are listed among causes, and removal of
  the cause precedes drug treatment.
- Mariani Wine advertisement, *Texas Medical Journal* 12, no. 2 (August 1896),
  [p. 6](https://texashistory.unt.edu/ark:/67531/metapth1823278/m1/6/):
  contemporary coca-wine ingredients, physician-facing claims, and a
  wineglassful three-times-daily dose.
- National Library of Medicine,
  [1890 Vin Mariani advertisement](https://www.nlm.nih.gov/exhibition/pickyourpoison/exhibition-cocaine.html):
  visual and commercial context for physician endorsements of coca wine.
- Jacob A. Riis, *How the Other Half Lives* (1890),
  [chapter 5](https://www.gutenberg.org/files/45502/45502-h/45502-h.htm):
  contemporary outsider description of Italian settlement and household
  commerce in New York. Riis's stereotypes and reform agenda make this useful
  for material context, not for Carmela's voice.
- Library of Congress,
  [Tenements and Toil](https://www.loc.gov/classroom-materials/immigration/italian/tenements-and-toil/):
  contextual overview of Italian immigrant trades, home work, and fruit and
  vegetable commerce in New York.

The attempted theft, widowhood, daughter, shop, exact symptom course, Mariani
use, dialogue, clinical measurements, and outcomes are invented connective
material. The modern term “panic attack” is used only in ground truth and the
debrief; Carmela and the 1896 physician encounter period descriptions such as
“nervous palpitation” and “morbid fear.”

## Outcome design

The case separates rapport, payment, health, and livelihood.

- Stopping coca wine, explaining the bodily fear cycle, preserving ordinary
  activity, gradually answering the bell again, and reviewing in one week has
  the best health and functional outcome.
- Calling the attacks warnings and prescribing avoidance produces the highest
  immediate satisfaction and full payment, but the sphere of feared places
  widens over the next month.
- Digitalis validates Carmela's cardiac fear but adds avoidable toxicity risk.
- Bromide feels concrete yet causes morning dullness without removing the
  stimulant or avoidance.
- Galvanic treatment consumes money and time without changing the maintaining
  factors.
- Complete rest and seclusion threaten the shop, strengthen avoidance, and can
  reduce the fee even if attacks occur less often in the short term.

The implementation is in
[`game/src/consultation/authoredPatients/carmelaRusso.js`](../../game/src/consultation/authoredPatients/carmelaRusso.js).

The fastest comparison is:

```sh
npm --prefix game run playtest:carmela -- --compare
```
