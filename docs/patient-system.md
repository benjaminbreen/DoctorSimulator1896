# Patient system

Status: final design to implement, approved 2026-08-12.

This document is authoritative. It supersedes earlier descriptions of the
consultation, dialogue flow, procedural patients, immediate scoring, and final
assessment when they conflict with this document.

## Terms

- **Doctor role**: the player runs the practice and treats patients.
- **Patient role**: a future option in which the player receives treatment.
- **Consultation view**: the seated doctor-and-patient interface. Earlier
  documents called this "patient mode." That term is no longer used for the UI.
- **Examination view**: the focused interface for physical examination.
- **Authored patient**: a composite case built from verified historical case
  records, with patient-specific writing and dramatic events.
- **Procedural patient**: a seeded case assembled from verified patient,
  medical, and dialogue modules.

## Product goal

The player gathers evidence, forms private hypotheses, speaks with the patient,
examines the patient, selects a period diagnosis and treatment, and records the
case. The game evaluates both the consultation and its later consequences.

The system has two feedback periods:

1. The immediate result describes the patient's experience of the visit and
   its effect on payment, word of mouth, and reputation.
2. The one-month result describes health outcomes, reputation, practice
   finances, the quality of the player's reasoning, and the modern causal
   explanation.

These results may conflict. A patient can be satisfied by a useless or harmful
treatment. A patient can dislike advice that was reasonable and helpful.

## Rules that do not change

1. The simulation owns facts, causes, disclosure, time, treatment effects,
   satisfaction, reputation, money, and outcomes.
2. The language model interprets custom input and writes prose from resolved
   facts. It does not create or change patient facts.
3. Every patient has a fixed underlying etiology. It may contain several
   causes, but it is not unknown to the simulation.
4. The default consultation works without an API call. Model use is optional
   during play.
5. A procedural patient is fixed by seed when created. Reloading a save cannot
   change the patient's history, hidden facts, or treatment response.
6. Authored and procedural patients use the same consultation engine and are
   not labelled differently in the interface.
7. Historical claims and authored case content require Ben's verification.

## Patient record

The patient record contains enough information to resolve the consultation
without a language model:

- identity, household, work, residence, and relevant relationships;
- underlying etiology and contributing causes;
- symptoms, physical signs, and expected course;
- what the patient believes is wrong;
- open, guarded, and unknown facts;
- conditions for disclosing guarded facts;
- conversational disposition and current social state;
- treatment expectations, practical limits, and likely adherence;
- treatment effects, hazards, and possible acute events;
- immediate satisfaction factors;
- one-month outcomes for the available actions.

A diffuse condition still has a causal record. Its cause may be a combination
of physical, psychological, social, and environmental factors rather than one
modern disease label. The game must still know which factors apply and how they
affect the course of illness.

The player does not need access to a modern diagnostic label during the visit.
Private thoughts may question period categories or propose causes outside the
displayed diagnoses.

## Authored and procedural patients

Authored patients will be composites based on verified case reports from the
1880s and 1890s, especially relevant medical, psychological, and William James
sources. Their content will be added after the engine is stable.

An authored patient adds these elements to the shared patient record:

- exact opening and important lines;
- patient-specific facts and disclosure conditions;
- authored confrontations, silences, reversals, and disclosures;
- patient-specific interpretations and questions;
- return-visit events and consequences.

Procedural patients are assembled from reusable authored modules. A module may
describe a complaint, etiology, symptom group, guarded subject, social problem,
conversational disposition, or treatment preference. Each module supplies
facts, conditions, candidate choices, and response templates.

Procedural generation does not ask the model to invent a complete patient or
decision tree at runtime. It combines verified modules, resolves conflicts, and
freezes the result under one seed.

## Consultation flow

### 1. Opening

The patient begins with a fixed arrival panel. It contains a short narrative
description of the patient's bearing and first words, followed only by a
**Continue** button. It does not show physician thoughts or other choices. No
API call is required. Authored patients use patient-specific prose. Procedural
patients use fixed prose assembled or selected when the patient is created.

### 2. Rumination

After the player continues from the arrival panel, the green interface appears
once. Its three
prepared thoughts represent broad approaches:

- take a history before drawing conclusions;
- examine for a bodily cause first;
- begin with a provisional period diagnosis and test it.

The selected approach opens Interview or Examination. It is a private working
idea, not a final diagnosis. After the opening choice, Interview and
Examination continue without the green interface interrupting each turn.
The player may open it again at any time with **Ruminate**, which replaces the
old **Consult Notes** rail action. The case notebook remains separately
available.

A private thought:

- costs no game time;
- causes no patient reaction;
- records the player's current hypothesis in the event log used for later
  assessment;
- may affect which later questions or examinations are emphasized;
- does not reveal a new patient fact by itself.

Custom thought uses the model to identify the proposed hypothesis, evidence,
and degree of certainty. The simulation records that interpretation. Unsupported
or anachronistic thoughts are allowed because James and the modern debrief may
judge them differently.

### 3. Speech

Each ordinary dialogue round presents four cards in the current layout:

- three pre-written choices selected from the current patient state;
- one lower-right text field labelled **Ask in your own words...**.

Speech advances the clock and may change disclosure, satisfaction, and the
patient's willingness to continue. Custom speech is genuine open inquiry. It
may pursue a subject that none of the three displayed choices mentions.

The appointment has a visible 30-minute action budget. Each card displays its
cost. The meter changes from gold to amber with ten minutes left, red with five
minutes left, and purple in overtime. Hovering or focusing a card previews its
cost on the meter. When authorized time is exhausted, ordinary inquiry is
replaced by a closing decision: diagnose, deliberately take one five-minute
overtime period, or arrange a follow-up. A direct patient question must still
be answered before the player may change the subject or conclude.

No essential diagnosis may depend on guessing a special custom question. The
required evidence must also be reachable through ordinary questions or
examination. A custom question may find it sooner, find it by another route,
or reveal additional context.

### 4. Examination

Examinations return deterministic observations and advance the clock. An
examination may reveal a fact, change the patient's social state, or produce an
uncertain result. Animation values may display a known sign, but they are not
clinical measurements unless the patient record explicitly defines them as
such.

### 5. Diagnosis, treatment, and case record

When the player selects **Consider Treatment**, the three diagnoses and
treatments most relevant to discovered evidence are shown first. The player
may expand the complete lists. The player chooses a diagnosis and treatment,
then signs the record by selecting two or three findings that best support the
decision. Free prose is optional for authored cases that use this concise
record format.

The case notebook begins with name, age, and residence. It adds only information
earned through player actions:

- examination observations;
- concise authored summaries of patient responses;
- facts disclosed in conversation;
- possible diagnoses after treatment consideration begins;
- player-written notes.

New evidence marks the notebook as updated without opening it over the next
decision. Repeated questions do not create duplicate entries. Player notes
remain editable and removable and are saved locally.

### 6. Immediate result

The visit ends with a modal describing the patient's spoken departure and
reaction. It shows the fee actually received, a color-coded satisfaction score
out of ten, questions asked, examinations performed, minutes used, and one
focused strength and improvement. The modal links to the separate one-month
outcome.
For example, it may state that the patient felt heard but considered the fee
poor value and is unlikely to recommend the practice.

The immediate result is based on perceived experience, not medical truth:

- whether the patient felt heard and respected;
- whether the explanation matched the patient's expectations;
- whether the treatment seemed convincing or gave immediate relief;
- whether the visit seemed worth its cost;
- any acute benefit or harm during the visit.

The result creates deterministic events for payment, recommendation, complaint,
and reputation. Strong recommendations can bring new patients and support
higher fees. Serious complaints or acute harms may trigger an investigation or
other event later that day. The exact historical institutions and procedures
must be verified before this becomes content.

## Procedural dialogue

Procedural dialogue is a state graph, not one stored tree containing every
possible order of questions.

At each round the option selector reads:

- the patient's fixed facts;
- disclosed and guarded facts;
- prior questions and examinations;
- trust, satisfaction, fatigue, and willingness to continue;
- the player's recorded hypotheses;
- the amount of consultation time used.

It then selects three eligible dialogue actions. The deterministic resolver
applies the chosen action, decides what the patient discloses, updates state,
and selects the next set of actions. Reusable templates provide ordinary
responses without an API call.

This allows the same fact to have several routes. A guarded medicine may be
revealed after reassurance, denied after accusation, discovered through an
examination, or asked about directly through custom text.

When deterministic material is exhausted, the interface should offer closing
actions such as summarizing, asking whether the patient has anything to add,
considering treatment, or ending the visit. The model may continue the
conversation as a fallback, but it receives the full allowed record. Dialogue
history alone is not enough to prevent invented facts.

## Custom input and model use

The intended runtime model is GPT-5.6 Luna through a server-side Responses API
route. API keys must not be exposed to the browser.

Model calls during play are limited to:

- custom spoken questions;
- custom private thoughts;
- fallback conversation after deterministic content is exhausted.

The model receives the player's text and the permitted patient state. It may
return topic, intent, tone, hypothesis, and prose. The deterministic resolver
decides disclosure and state changes. A model response that asserts an
unauthorized fact is rejected.

If the API is unavailable, the three ordinary choices and all deterministic
gameplay remain usable. The custom control reports that it is unavailable.

For testing and later research, save the player input, structured
interpretation, resolved state change, model identifier, and final prose.

## One-month result

The player may run the practice for as many game days as desired, then choose
to conclude the run. The simulation advances one month and resolves every
patient from the stored etiology, treatment, adherence, hazards, and seeded
variation.

A good decision may still end badly, and a poor decision may get lucky. The
debrief must distinguish the quality of the decision from the realized outcome.

The result contains four parts.

### Patient outcomes

Each case reports what happened to the patient's health and behavior. This may
diverge from the patient's immediate satisfaction.

### Reputation and practice finances

The game summarizes recommendations, complaints, investigations, patient flow,
fees, expenses, rent, and profit or loss. Exact figures come from the
simulation. Generated prose may explain them but cannot change them.

### William James letter

GPT-5.6 Luna writes a letter from William James using the structured gameplay
record. The eventual voice prompt must be grounded in verified James sources.

The letter gives numerical scores and an explanation for:

- observation and evidence;
- diagnostic reasoning;
- treatment and conduct;
- scientific promise.

Period terminology and epistemology affect all four categories. The simulation
supplies evidence and permitted score ranges. Luna makes a judgment within
those ranges and writes the letter. These scores do not change health,
reputation, or money.

James knows only the records available to him in the fiction. He is not given
the modern hidden etiology unless the player discovered and recorded the
relevant evidence.

### Modern debrief

GPT-5.6 Luna also writes a plain explanation from a modern perspective. The
simulation supplies the actual etiology, causal factors, treatment effects,
outcomes, and the distinction between reasonable judgment and luck. The model
may explain these facts but may not add or revise them.

The modern debrief is separate from the James letter so that 1896 knowledge and
modern knowledge are not mixed.

## Future patient role

The patient role is a later extension. It uses the same patient record and
outcome simulation from a different point of view.

The player may:

- disclose, withhold, or clarify information during the visit;
- follow, ignore, or modify the prescribed treatment;
- enter a custom action through the same constrained model path;
- decide what to tell friends about the physician.

The immediate result records the patient's response to the consultation. The
one-month result is written in the second person and covers health, costs,
adherence, and social consequences.

## Current implementation

As of 2026-08-13, the game has:

- a mounted consultation view in the consulting office;
- Nora Byrne, Samuel Taylor, and Carmela Russo, playable research-draft
  authored composites with source provenance and deterministic etiologies;
- fixed interpretation, speech, examination, diagnosis, treatment, and case
  note stages;
- state-based authored prompt selection, three written speech choices, custom
  speech, custom private thought, and an offline dialogue renderer;
- deterministic time, fact authorization, trust, satisfaction, diagnosis and
  treatment evaluation;
- a case notebook that grows from player actions and opens when a new clinical
  entry is recorded;
- editable local player notes;
- an immediate patient-reaction card and a separate one-month outcome for each
  authored case;
- deterministic local versions of the James assessment and modern debrief;
- keyboard, pointer, and narrow-screen support.

The source and design records are in
[patients/nora-byrne.md](patients/nora-byrne.md),
[patients/samuel-taylor.md](patients/samuel-taylor.md), and
[patients/carmela-russo.md](patients/carmela-russo.md). Their connective stories
and modern ground truths are fictional. The separate procedural records remain
test fixtures, not verified historical or medical content.
Animation parameters are not valid clinical observations by themselves.

The following parts of the final design are not yet implemented:

- modular state-based choice assembly for procedural patients;
- the server-side GPT-5.6 Luna route;
- persistent practice-wide reputation effects;
- the multi-day practice economy;
- model-rendered James letters and modern debriefs;
- additional researched authored patients beyond Nora, Samuel, and Carmela;
- the future patient role.

## Acceptance conditions

The final system is complete when:

1. A full doctor-role run works without an API call.
2. Custom speech and thought can address subjects not shown in the three
   choices without creating facts.
3. Authored and procedural patients use the same record and engine.
4. The same seed produces the same patient and outcomes.
5. Immediate satisfaction can diverge from later health.
6. Reputation and finances respond to stored events rather than generated
   prose.
7. James and the modern debrief use the same immutable gameplay record but
   apply different knowledge standards.
8. A failed or unavailable model call cannot corrupt or block the save.
