# Design

## Concept

The player is a physician in New York beginning on 15 June 1896. Patients
arrive with complaints the era
reads through its own categories: neurasthenia, hysteria, nervous exhaustion,
spirit communication. The player examines, diagnoses in period vocabulary,
treats with period modalities, and writes case notes. The game records both how
patients and peers judge the player and what later happens to the patients. The
gap between approval and outcome is the point.

The game is the book's argument made playable: consciousness *treated* (the
consulting room) versus consciousness *counted* (the anthropometric lab).

The final patient and consultation design is in
[patient-system.md](patient-system.md). That document takes precedence over
older consultation notes.

## Core loop: the consultation

1. A patient arrives. The later social simulation decides who comes.
2. A fixed arrival panel describes the patient's bearing and gives their short
   opening complaint. The player continues when ready; no model call is required.
3. The next panel presents one required rumination: take a history,
   examine first, or begin with a provisional diagnosis. Afterward, Ruminate
   is optional and never interrupts the consultation automatically.
4. The player takes a history through three deterministic questions plus an
   optional custom question handled by GPT-5.6 Luna.
5. The player examines the patient. Observations and facts come from the fixed
   patient record.
6. The player selects a period diagnosis, treatment, and directions, then
   writes the case note.
7. The visit ends with the patient's immediate reaction. This affects payment,
   recommendation, complaints, and reputation.
8. When the player ends the run, the game advances one month and reports
   health, reputation, finances, a William James assessment, and a separate
   modern explanation.

## Two kinds of outcome

- **Immediate experience**: whether the patient felt heard, considered the
  visit worth its cost, and would recommend the practice.
- **Later record**: what happened to the patient's health and to the practice
  one month later.

The month-later report keeps period reputation, practice finances, and the
modern health record separate. A satisfied patient may have been harmed. A
dissatisfied patient may have received reasonable advice.

## Patient casting model

Roughly **eight deeply authored anchor patients** return several times. They
are composites built from verified medical and psychological case reports.
Procedurally generated patients supply queue pressure and social texture and
later populate the social graph. Both kinds of patient use the same record and
consultation engine. The interface does not label them as authored or
procedural.

Body pipeline for 3D patients: Renderer C in `character-lab/`. It combines
curated GNM-derived face anchors with MPFB topology, rigging, live morphs, and
modular hair and clothing. Deterministic character recipes select a reusable
foundation, bounded anatomy and resting-face variation, presentation assets,
and a scene-appropriate LOD. Facial diversity within the same demographic
cohort is a primary acceptance requirement, not optional polish. See the
[Renderer C production objective](renderer-c-production-objective.md) for the
current architecture and gates.

## Ground truth beneath the LLM

Every patient has a fixed etiology assigned at creation. It may contain several
physical, psychological, social, or environmental causes. The model renders
language; the simulation decides facts, disclosure, treatment response, and
outcomes.

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

**Weekly feedback**: a period newspaper health column, written from simulation
facts, shows changes in public language, medical fashion, and rumors about the
practice.

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

1. **Consultation view** — first-person at the physician's desk, patient seated
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
   questioning stances. Entered from consultation view via the Examine verb.
   Reference: round-two HTML concept IV, formerly titled "The Sitting."
3. **Exploration mode** — close third-person over-the-shoulder hero camera
   for areas with 3D movement (the street, Central Park, house calls, the
   lab). Patient-mode chrome density, minus the consultation panels.
4. **Instrument mode** — the camera leaves the player, moves to a framing
   pose stored on the apparatus, and hands input to the instrument. Entered
   with E from exploration mode, left with Escape. Used for the laboratory
   apparatus, where operating the thing *is* the mechanic.
5. **Close examination** — the same camera takeover pointed at an object
   rather than an apparatus: a long lens, drag to orbit, wheel to draw
   closer, depth of field throwing the room away behind it. A notebook rail
   holds the direct observation, the procedures on offer, and the findings
   recorded so far. Left with Escape.

   Two ways in. **E** on an object with an examine affordance opens its
   authored record in `examine/examinables.js` — the opium pipe, the waiting
   room flowers, the glove on the Pond walk. **Enter** arms the eye instead,
   and the next click picks whatever is under it: the click resolves against
   the world's own item list, and `examine/subjects.js` builds a record from
   what the simulation already knows about the thing — its class, its
   measured size, where it stands — rolled on its own id so the same boulder
   reads the same way every time. Not everything answers; a surface with no
   item behind it gets no examination rather than a wrong one.

   The only model-written text either way is the answer to a custom question,
   and it may state nothing outside the record's facts.

   Running a procedure lowers neurasthenia a little, once per subject. A few
   minutes of attention on one thing is the cheapest rest in the game, and it
   is the counterweight to the laboratory: the same act of close looking, put
   to a use that is not measurement.

   Close examination is for objects, not for patients. The consulting room
   keeps mode 2 above, where a person is read at a distance and annotated
   rather than turned under a lens. The one place a person may be examined
   this way is the anthropometric laboratory, where measuring somebody as an
   object is the mechanic and the reuse of the interface is the argument.

Exploration interactions use shared action and instrument affordances.
Instrument views display real simulation state rather than scripted outcomes.
The implementation contract is in
[engine-architecture.md](engine-architecture.md#interaction-and-instrument-contract).

## LLM roles (all JSON-contract)

| Role | Carries from Darwin |
|---|---|
| Custom patient dialogue | Classify topic, intent, and tone; write the resolved response |
| Custom private thought | Classify the player's hypothesis and supporting evidence |
| William James letter | Explain scores within ranges set from the stored gameplay record |
| Modern debrief | Explain the fixed etiology, treatment effects, and outcome |
| Weekly newspaper column | Write from social-simulation facts |

## Design principles

1. Patient facts, scores, and disclosure stay deterministic. Outside the
   consultation, the model may decide outcomes where surprise is the point.
2. Patients, rivals, and assessors may disagree with the player.
3. Primary sources in-world via the library reader; reading unlocks and
   justifies modalities.

## Development direction

The current playable focus is the consultation. Nora Byrne, Samuel Taylor,
Carmela Russo, and Wilhelmina Otten are the reference authored encounters. More researched patients and stronger
procedural cases can use the same engine. Consultation results can then feed the
wider practice, social graph, laboratory, and park without imposing a fixed
milestone scheme.
