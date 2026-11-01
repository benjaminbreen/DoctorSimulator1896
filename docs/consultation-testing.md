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
Samuel Taylor, Carmela Russo, Wilhelmina Otten, and Ferdinand de Chapuys cases.
`technicalPatients.js` still creates seeded fixtures used to test procedural
identity, appearance, and basic consultation behavior, but those fixtures are
no longer in the opening queue.

All five authored patients are researched fictional composites. Their sources and
invented connective material are recorded in
[patients/nora-byrne.md](patients/nora-byrne.md),
[patients/samuel-taylor.md](patients/samuel-taylor.md),
[patients/carmela-russo.md](patients/carmela-russo.md), and
[patients/ferdinand-de-chapuys.md](patients/ferdinand-de-chapuys.md). The technical fixture's
diagnosis and treatment mappings remain placeholders.
Animation parameters are not clinical measurements unless the patient record
defines them as such.

## Dynamic patient answers

Carmela now discusses the prescription before the case note. Select a treatment,
choose **Discuss the plan**, respond to her concern, and then write the record.
The coca-wine discussion supports a trial off the wine, a gradual return to the
counter, or a short period of help before returning. These agreements change
the immediate account, recovery, household cost, and later patient dialogue.
Complete rest can be declined or the prescription revised. Conflicting advice
to stop and continue the wine must be corrected.

In her one-month result, **Talk to Carmela one month later** opens a playable
return-visit preview. Ask about attacks or work, discuss next steps, then return
to the report. The review records only what was asked and agreed. It adds no
appointment minutes, fee, or second completed visit to the casebook.

Replay `carmela-negotiation.jsonl` and `carmela-tonic-trial.jsonl` with
`--scenario=carmela`. Add `--offline` for authored dialogue and the fallback
James letter. The ordinary `carmela-full.jsonl` and emotion replay also include
the prescription discussion.

Carmela’s wording and the shared fallback replies use shorter, plainer speech.
The live prompt asks for ordinary English and contractions, without metaphors,
speeches, forced wit, or invented gestures. James receives the actual treatment
discussion and agreed plan along with the earlier consultation transcript.

A custom question that matches no authored rule is answered by GPT-5.6 Luna at
zero reasoning effort, through the server-side route in `api/consult.mjs`.
Authored prompts and custom questions that match an authored intent stay
offline and instant. Replies take two to three seconds.

Local testing needs nothing but `OPENAI_API_KEY` in the repo-root `.env.local`.
The dev server mounts the same route at `/api/consult`, so `npm run game`
behaves like the deployed build. The key is read into the node process only and
never reaches the browser bundle.

On Vercel, set `OPENAI_API_KEY` in the project's environment variables. The
route is protected three ways: a WAF rate limit rule on `/api/consult`
(60s window, 15 requests, key IP, action Deny), a same-origin check, and a
per-client fixed window in the handler itself. The handler rejects any payload
that is not a dialogue request. A `curl` without an `Origin` header gets 403 by
design; add `-H 'origin: http://127.0.0.1:5175'` to test it by hand.

If the route fails, times out, or is unconfigured, the custom question falls
back to the offline reply and play continues.

Check the live service with the dev server running:

```sh
node game/scripts/check-luna.mjs
node game/scripts/check-luna.mjs --emotions
```

The first command makes one real request and fails if the route fails; it
does not accept the game's offline fallback as success. The second makes
three requests in sequence: kindness, contempt, and an apology, printing the
dialogue, expression, and body cue. It passes the replies as conversation
history for a fictional test patient with no case facts, without running
appointment time, trust, or outcomes. Use `--url=URL`
to check a different server. These commands use the server's key.

On failure, the route returns the upstream status and a safe error code.
`401` with `invalid_api_key` means the configured key was rejected. Put a valid
key in the repo-root `.env.local` and restart the server. An existing
`OPENAI_API_KEY` in the server's launch environment takes precedence over the
file, so replace or unset that variable if it is stale.

## Expressions and posture

The live reply already includes `expression` and `bodyCue` alongside dialogue
and a written behavior. The route constrains them to the renderer's supported
faces and seated gestures. The consultation stores those cues, and the actor
blends its facial morphs and plays the seated gesture. An authored rule's cues
take precedence; generated cues fill turns with no authored match.

For a live experiment, type a custom question in **Ask in your own words**.
A contemptuous remark without an authored match can produce `frowning` with
`sitting-disapproval`, for example; the exact selection is generated. The
literal insults `idiot`, `liar`, and `fraud` trigger a deterministic warning
and trust loss. The first can receive a live angry or hurt response; a second
ends the visit without a model call. The warning offers a one-minute apology
choice, and custom apologies also work. An apology partially restores trust
but leaves the warning on record. Neither an insult nor an apology discloses
clinical facts or answers a pending clinical question. The apology remains
available if the insult uses the last appointment minutes. Cues describe
visible performance, not a new clinical fact.

Live replies also return `expressionIntensity` from 0 to 1 and `gaze`
(`doctor`, `away`, `down`, or `neutral`). Intensity scales the existing
expression recipe before its safety limits and smoothing; it does not scale
speech, blinking, gaze, or identity morphs. Missing intensity keeps the
renderer’s existing full-strength behavior.

Each request includes `currentEmotion`, derived from the latest consultation
cue, plus expression, intensity, gaze, and body cues in recent speech history.
Luna is prompted to carry hurt or fear through neutral questions and soften
reactions gradually when appropriate. This is presentation continuity, not a
new clinical or relationship score. An unmatched custom question whose API
call fails retains the preceding emotional cue while using offline wording.
Rejected disclosures also discard that response’s performance cues.

The renderer keeps downcast or averted eye cues when a seated gesture settles
and releases procedural head tracking for those directions. Authored replies
keep their own cues and reset intensity to the renderer default. The facial
recipes, rig, and morph limits are unchanged by this integration.

Replay the live performance path and inspect its PNGs and `performances`:

```sh
node game/scripts/gameplay-playtest.mjs --scenario=carmela \
  --replay=game/scripts/playthroughs/luna-emotions.jsonl
```

This uses the real API for downcast listening, contempt, a neutral follow-up,
and apology. Cue choices vary by generation; unit tests check the contract and
continuity without depending on a particular generated expression.

`game/scripts/playthroughs/insult-apology.jsonl` checks the first-insult warning,
the apology choice, continuing the interview, and the second-insult exit.
Run it with `--scenario=carmela`; add `--offline` to check the same path using
fallback reactions without depending on the API.

## Automated checks

Run:

```sh
npm --prefix game test
```

`luna-dialogue.test.js` covers the renderer and the route with a stubbed
`fetch`. It never calls the real API.

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
npm --prefix game run playtest:chapuys -- --demo
npm --prefix game run playtest:chapuys -- --compare
```

`playtest:consult` defaults to Nora. `playtest:samuel` selects Samuel and
`playtest:carmela` selects Carmela and `playtest:chapuys` selects Ferdinand.
`--demo` prints every state transition in
the focused path. `--compare` shows three
routes and their time, question count, examination count, satisfaction,
payment, and one-month outcome in one table. Individual prompt and examination
IDs can also be supplied as arguments; run the command without arguments to
see the current available IDs and custom-path syntax.

The tests cover:

- all authored patient records satisfying the contract;
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
- Ferdinand's drink-pattern branch, mandatory response, and twenty-seven-minute
  evidence-led route;
- optional prose notes accepting zero words when the case requirements are met;
- a focused Carmela route filling exactly thirty minutes;
- Carmela's immediate approval diverging from one-month health;
- state-based authored prompt selection;
- custom inquiry finding unlisted but eligible evidence;
- authored rules and repeat-insult exits answering offline without a model call;
- first-insult reactions and apologies preserving a chance to repair trust;
- a failed or unreachable dialogue route falling back to the offline reply;
- the route rejecting cross-origin callers, non-dialogue payloads, and a client
  over the rate limit;
- locked evidence resisting forced prompt ids;
- custom thought classification without time or patient reaction;
- authored examinations and evidence-sensitive scoring;
- immediate satisfaction diverging from one-month health.

## In-game playtest

For a persistent browser session with screenshots, run
`node game/scripts/gameplay-playtest.mjs --scenario=carmela` from the repo root.
See [gameplay testing](gameplay-testing.md) for paused inspection and recorded
UI replays. The headless engine runner above does not exercise this UI.
The full route is `game/scripts/playthroughs/carmela-full.jsonl`; run it with
`--scenario=carmela --offline --replay=game/scripts/playthroughs/carmela-full.jsonl`.
It covers the required response, examination, treatment search, evidence record,
fee, one-month result, and return to the park.

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
5. Use insulting text and confirm that the patient reacts with anger or hurt
   and offers an apology choice. Apologize and continue; a second insult in
   the same visit should end the consultation and begin the standing motion.
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
- practice-wide reputation and financial outcomes;
- model-rendered William James and modern debrief prose;
- full visual regression automation.
