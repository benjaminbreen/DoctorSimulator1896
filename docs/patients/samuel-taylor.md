# Samuel Taylor

Status: playable research draft, 2026-08-13.

Samuel Taylor is the second patient in the opening queue. His consultation is
a short occupational-medicine mystery about a skilled printer whose abdominal,
motor, cognitive, and depressive symptoms have been reduced to “melancholia.”
The player must recognize a plausible lead-exposure pattern, assess safety
without treating distress as proof of insanity, and recommend a plan that does
not needlessly destroy the household's income.

## Fictional case

Samuel is a 54-year-old African American widower from an established New York
family. He has worked as a printer for roughly thirty years and supports his
seventeen-year-old son, Daniel. His identity, family, shop, foreman, dialogue,
measurements, and outcome are invented. The case does not claim to reconstruct
a particular historical person.

Samuel is normally a compositor. Six months ago, a small job shop assigned him
to cover an ill stereotyper: breaking old plates, tending molten type metal,
and skimming dross in a cramped room below street level. Grey dust coats his
hands, the nearest basin is two floors away, and he eats bread beside the type
cases. Five months ago he began making uncharacteristic setting errors. He now
has a dull headache, poor concentration, appetite loss, obstinate constipation,
and gripping lower abdominal pain relieved by pressure. Sundays away from the
shop are somewhat better.

A focused examination finds a narrow blue-grey gum line and subtle bilateral
weakness of wrist and finger extension without complete wrist-drop. The abdomen
is not acute; discomfort eases with pressure and the pulse is slow and regular.
These signs support the fixed simulation ground truth of chronic occupational
lead exposure, but no single sign proves it.

His wife Rebecca died three years ago. He distinguishes that grief from the
new five-month decline. He sometimes wishes he would not wake, but reports no
plan, preparation, or current intent to harm himself. His son and faith are
protective, and he agrees to seek help if that changes. This risk assessment is
necessary even though the simulation assigns a toxic cause to much of the
presentation.

## Consultation design

The case is designed around a useful decision at about twenty-three minutes,
not completion of every card.

1. The opening offers three genuinely different routes: course and timing,
   physical symptoms, or bereavement.
2. Reconstructing the course unlocks the printing-shop question. Samuel then
   asks whether the physician will tell his foreman that he is “poisoned or
   merely unfit.” The player must answer before collecting more clues.
3. A provisional, testable explanation earns trust. Moralizing about a weak
   mind damages it. Declaring certain lead poisoning before examination also
   costs trust because it threatens wages without evidence.
4. Constipation and colic, a four-minute gum-and-hand examination, and the
   occupational history form a compact high-value clue cluster.
5. Asking what treatment he can afford reveals a clean-work reassignment to
   proofs and press records. The best plan removes exposure while preserving
   wages, with hygiene, symptom care, and close review.
6. The grief and safety branch remains important but optional. A careful player
   may choose it instead of another physical clue and accept more diagnostic
   uncertainty.

The headless comparison deliberately produces three divergent runs:

- a 23-minute occupational route with four questions, two examinations, full
  payment, and improvement;
- a 17-minute humane mood-only route that satisfies Samuel immediately but
  leaves the lead exposure in place;
- a 20-minute moralizing route with seclusion, reduced payment, and substantial
  social harm.

## Voice

All dialogue is invented. Samuel is written as exact, reserved, and literate,
with an idiom grounded in skilled printing: sorts, formes, clean lines, proofs,
and setting matter square. The writing avoids racial eye dialect, servility,
and generic uplift rhetoric. His guardedness is practical: a physician's note
may decide whether the foreman preserves or ends his wages.

This choice also makes the case educational without turning Samuel into a clue
dispenser. He knows his own shop and symptoms; he does not arrive knowing a
modern toxicologic diagnosis.

## Sources and uncertainty

Samuel is a fictional composite. The sources support period signs, diagnostic
possibilities, and workplace mechanisms, not his biography.

- Horatio C. Wood Jr. and Reginald H. Fitz, *The Practice of Medicine* (1896),
  [section on chronic poisoning](https://books.google.com/books/about/The_Practice_of_Medicine.html?hl=en&id=ZlcQAAAAYAAJ&output=html_text):
  contemporary medical context for chronic lead poisoning and its bodily
  signs.
- Daniel Hack Tuke, ed., *A Dictionary of Psychological Medicine* (1892),
  [Internet Archive record](https://openlibrary.org/books/OL7124803M/A_dictionary_of_psychological_medicine):
  period mental-history practice, including investigation of supposed cause
  and danger to self or others.
- “Saturnine Encephalopathy,” *Dublin Journal of Medical Science* 95 (1893),
  [digitized volume](https://upload.wikimedia.org/wikipedia/commons/1/1c/The_Dublin_journal_of_medical_science._Volume_95%2C_January_-_June_1893._%28IA_s2400id1378650%29.pdf):
  a contemporary account linking lead illness with colic, a slate-coloured gum
  line, and wrist-drop, while reserving “encephalopathy” for more severe states
  such as delirium, convulsions, and coma.
- Alice Hamilton and Charles H. Verrill, *Hygiene of the Printing Trades*, U.S.
  Bureau of Labor Statistics Bulletin 209 (1917),
  [full text](https://fraser.stlouisfed.org/title/hygiene-printing-trades-3851/fulltext):
  retrospective evidence for lead dust, dross, and molten-metal hazards in
  printing. It emphasizes that risk was higher in type founding and
  stereotyping than in ordinary composing rooms and that presentations could
  be slow and obscure.
- Herbert Needleman, “The Removal of Lead from Gasoline: Historical and
  Personal Reflections” (2012),
  [historical review](https://pmc.ncbi.nlm.nih.gov/articles/PMC3430923/):
  modern context for the long recognition of neuropsychiatric effects from
  chronic lead exposure.

Hamilton and Verrill postdate the game's 1896 setting by twenty-one years. The
source is used retrospectively for shop processes and the distribution of risk,
not as evidence that a 1917 regulation or statistic was known in 1896. To avoid
implying that all compositors faced the same hazard, Samuel is specifically
given temporary stereotype and metal-pot duties.

The blue gum line is supportive rather than universal or diagnostic. The mild
extensor weakness is deliberately short of classic wrist-drop. The office has
no modern blood-lead measurement, so the best 1896 decision remains a
provisional diagnosis, exposure removal, and close follow-up. Historical
iodides and purgatives appear as a period option; the modern debrief makes clear
that they are not substitutes for source control or modern toxicologic care.

## Outcome design

- Clean reassignment, handwashing, meals away from type, constipation relief,
  and close review produce the strongest combined health, function, and income
  outcome.
- Ordering Samuel to abandon the entire trade protects him from lead but
  needlessly sacrifices wages when a clean assignment exists.
- Medicine while leaving him at the metal pot feels concrete and preserves
  wages, but symptoms continue.
- Companionship addresses real isolation and can produce high immediate
  satisfaction, yet the toxic syndrome worsens.
- Seclusion treats honest disclosure of a passive death wish as grounds for
  punishment, damages protective ties, and ends wages.
- Galvanism spends time and money while the exposure continues.

The implementation is in
[`game/src/consultation/authoredPatients/samuelTaylor.js`](../../game/src/consultation/authoredPatients/samuelTaylor.js).

The fastest comparison is:

```sh
npm --prefix game run playtest:samuel -- --compare
```
