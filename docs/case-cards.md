# Case cards

Status: phase one started 2026-11-02. The decision is recorded in
[decisions.md](decisions.md).

Procedural patients will be built from case cards: cited, structured extracts of
real cases published between 1885 and 1900. Each card is a draft until Ben has
checked it against the page image and marked it `verified`.

## Plan

1. Case cards and a tool for finding and checking them. *18 draft cards.*
2. A condition table (cause, presentation, findings, period diagnoses,
   treatment effects, one-month course) built from the cards, and a seeded
   assembler that turns a condition plus a fitting persona into a normal
   consultation record. *Running for twelve conditions; see below.*
3. Live dialogue: the engine picks topics, the model words the choices and
   replies, and a one-time voice pass writes the patient's wording at creation.
   *The voice pass is running; per-turn choices are not.*
4. Sourced New York demographic tables to replace the guessed weights in
   `shared/patients/data/`, and a mapping from patient profile to 3D look.
   *The mapping is running, on guessed weights.*
5. More cards and conditions, and bounded model scoring for written
   prescriptions.

## Sources

The main source is `~/Code/GhostsCorpus/corpus.sqlite`. It holds the *Journal of
Nervous and Mental Disease* and the *Medical Record* (New York) for every year
from 1885 to 1900. The OCR is moderate. `~/Code/chloralpaper` has about 1,650
coded patients, but they date from 1869–85 and nearly all involve chloral; use it
for drug-habit cases. No corpus has New York census or directory tables, so
those must be fetched separately.

The journals over-represent rare and hospital cases. Card counts must not be
used as the clinic's case mix; that weighting is a separate, stated assumption.

## Tools

```sh
python3 scripts/cases/find_cases.py search 'neurasthenia AND merchant' --years 1885-1900
python3 scripts/cases/find_cases.py packet 3978602 --around 2
npm run cases:check   # every quote appears in its cited passages
npm run cases:test    # every card has the required fields
```

Search uses SQLite FTS5 syntax. It returns only passages that mention an age or
a numbered case.

## Card format

Cards live in `shared/patients/cases/cards/<id>.json`; the validator is
`shared/patients/cases/validateCard.js`. Fields:

- `source`: citation, year, place, corpus source id, and the passage ids used.
- `inferred`: fields that are our inference rather than the source's words.
- `setting`: private-practice, dispensary, hospital, asylum, society-report, or
  unknown.
- `reported`: the patient as the source describes them. Unstated fields are null.
- `presentation`, `findings`, `periodDiagnosis`, `treatments`, `outcome`: what
  the source reports. Nothing is filled in from elsewhere.
- `quotes`: short phrases copied exactly from the OCR, so they can be checked.
- `modernReading`: our interpretation, with a confidence level. It is not part
  of the source.
- `fields`: what the assembler may change. `fixed` cannot change; `constrained`
  can change within a stated rule; `free` can be anything that fits 1896.

## Current drafts

| Card | Condition | Patient |
| --- | --- | --- |
| putnam-1895-telegrapher-cramp | occupational cramp | telegrapher, 30 (Buffalo) |
| starr-1888-carriage-painter-lead | lead palsy | carriage-painter, ~30 (Vanderbilt Clinic) |
| meirowitz-1895-engraver-arsenic | arsenical neuritis | steel engraver, 19 (New York) |
| medrec-1888-merchant-insomnia | insomnia, overwork | merchant, 41 |
| medrec-1888-miss-f-neurasthenia-hypnotics | neurasthenia, hypnotic tolerance | woman, 35 |
| medrec-1888-mrs-k-periodic-melancholy | periodic melancholia, past suicide attempt | married woman, 55 |
| medrec-1893-merchant-douche | cerebral neurasthenia | merchant, 52 |
| medrec-1893-physician-cocaine-spray | cocaine habit from a spray | physician, 25 |
| medrec-1887-young-lady-morphine | morphine habit begun on prescription | young woman |
| medrec-1895-headache-morphine-strabismus | periodic headache, morphine | woman |
| seymour-1890-teacher-chloral-erythromelalgia | erythromelalgia plus chloral habit | teacher, 45, woman |
| medrec-1897-attendant-aphonia | functional loss of voice | asylum attendant, 29, woman |
| medrec-1899-girl-hysterical-cough | functional cough | girl, 15 |
| medrec-1899-tailor-nervous-cough | functional cough | Jewish tailor, 16 |
| barbour-1891-engine-driver-concussion | railway injury (uncertain) | engine-driver, 30 |
| barbour-1891-streetcar-tabes | tabes taken for injury | woman, 35 |
| berndt-1896-exophthalmic-goitre | Graves' disease | married woman, 58 (German, reviewed) |
| turin-1896-epilepsy-drowning-fright | epilepsy | man, 28 (Turin, reviewed) |

Gaps: New York private-practice cases, alcohol, chorea, an American epilepsy
case. Several *Medical Record* drafts still need the author and title.

## Conditions and assembler

The condition table is `shared/patients/cases/conditions.js`. The assembler is
`game/src/consultation/casePatients.js`. Every day, including day one, draws
its patients from this table. The five authored patients appear only in
`?playtest` runs, whose recorded replays expect them.

Each condition fixes the facts, examinations, diagnoses, and treatment results.
The seed chooses the person (within the condition's sex, age, class, and trade
limits), the wording variants, and whether optional facts exist (a lawsuit, a
family history). Each prompt's reply is built from the wording of the facts it
discloses, so a reply never says more than it discloses. Households of limited
means pay a penalty for costly treatments.

Conditions so far: occupational cramp, morphine habit begun on prescription,
periodic melancholia, tabes blamed on an accident, Graves' disease, lead palsy,
neuritis after arsenic poisoning, cocaine habit from a nasal spray, nervous
cough, nervous loss of voice, insomnia from overwork (with an optional hidden
chloral habit), and epilepsy blamed on a fright. Each lists the cards it rests
on. Tests: `game/tests/case-patients.test.js`.

Some examination findings are not in the cards and need checking: the healthy
vocal cords that fail to close (loss of voice), the raw nasal lining (cocaine),
and the bitten tongue (epilepsy).

## Appearance

`shared/characters/profileLook.js` turns a profile into one of the modular
templates and a look. Sex, trade, class, and age choose the template and
outfit (labourers get the worker template; clerks and professionals tailored
clothes; working women an apron). Origin chooses skin, hair, and eye colour.
Age greys and thins the hair. Class chooses hat and accessories; desk trades
and older patients wear glasses more often. The condition still sets posture
and tremor. All weights are guesses.

Known gaps: two female and three male templates, no faces younger than about
eighteen or older than sixty, and a small wardrobe.

## Voice pass

When a day's patients are set, each procedural patient's lines (opening, fact
wording, replies, and the doctor's choices) go to the model once through
`api/consult.mjs` (`render-patient-voice`). The reply replaces wording by line
id only; facts, effects, and outcomes come from the same seed and condition.
It is cached in the browser and applied when the visit starts, never during
one. Offline, the templates stand. Client: `game/src/consultation/patientVoice.js`.
