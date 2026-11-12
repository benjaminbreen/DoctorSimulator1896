# Playing the game as text

Two runners play the game without a browser. They are for fast playtesting
and for studying how a model diagnoses and plays a physician of 1896.

- `game/scripts/agent-play.mjs` plays one run, one action at a time.
- `game/scripts/agent-batch.mjs` plays many runs and tabulates them.

A consultation takes a few milliseconds offline. A thousand random
consultations take about three seconds; a two-day practice run about 40 ms.
The browser runner in [gameplay-testing.md](gameplay-testing.md) is still the
only way to check what the game looks like.

## What is the same game and what is not

A text consultation drives `createConsultationRuntime`, the same runtime the
consultation screen drives. Rules, minutes, disclosure, and outcomes cannot
differ from the game.

A text day uses the game's own schedule, callers, street events, purse,
standing, nerves, and errand modules, with the same seeds as `App.jsx`. Seed
4 gives the same patients, appointment times, callers, and events in both.
The glue between those modules is repeated in
`game/scripts/agent/daySession.js`. It mirrors `App.jsx` and `DayFlow.jsx`;
a day rule changed there must be changed here too.

The text day leaves out:

- walking, and everything found only by walking (shops, street talk, objects
  to examine, instruments to operate);
- the casebook, letters, and newspaper;
- recalling a patient already seen that day.

Park rest and laboratory measurements are single actions. Their recovery and
errand effects are the game's; their minute costs are stand-ins set at the
top of `daySession.js`. The world modules keep one shared state, so a process
runs one day session at a time.

## One run

```sh
node game/scripts/agent-play.mjs --patient=carmela
node game/scripts/agent-play.mjs --patient=case:5:2
node game/scripts/agent-play.mjs --day --seed=4 --authored
```

Authored patients are `nora`, `samuel`, `carmela`, `wilhelmina`, and
`chapuys`. `case:SEED:INDEX` is a procedural patient from the case cards.
`--day` plays the practice day and the days after it; `--authored` gives day
one the authored patients, as the browser playtest does.

The runner prints one JSON observation per line and reads one JSON action per
line. Every observation lists the actions available now. Send one back:

```jsonl
{"type":"ask","n":1}
{"type":"say","text":"What medicines or tonics do you take?"}
{"type":"think","text":"The tonic may be feeding the attacks."}
{"type":"examine","n":1}
{"type":"decide"}
{"type":"diagnose","n":1}
{"type":"treatments","query":"coca wine"}
{"type":"prescribe","id":"drug-stop-tonic"}
{"type":"sign"}
{"type":"respond","n":1}
{"type":"settle","id":"cash"}
{"type":"finish"}
```

`n` is the position in the list just shown. An authored id also works, which
suits recorded replays (`--replay=FILE`). A refused action returns the same
observation with an `error` and changes nothing. `{"type":"observe"}` repeats
the observation; `{"type":"quit"}` or end of input stops the run.

In a day the same consultation actions apply while a patient is in the room.
Outside it the actions are `see-patient`, `travel`, `wait`, `park`,
`measure`, `retire`, and `sleep`, and `choose` answers a card (an appointment
due, a caller, a messenger, a street event, the evening prompt).

Options:

- `--live` sends custom questions and the James letter to the model through
  the same route handler the deployed game uses (`api/consult.mjs`). It needs
  `OPENAI_API_KEY` in `.env.local`. Without it, authored wording and
  templates are used and nothing touches the network.
- `--hints=full` lists every diagnosis in authored order. The default shows
  the game's three evidence-ranked diagnoses, with the full list one action
  away, as the screen does.
- `--log=FILE` sets where the run log goes. The default is `artifacts/agent/`.

## What the player sees, and the log

An observation holds what is on screen: the patient's words and manner, the
notebook, the clock, and the choices. It does not hold trust, satisfaction,
fact ids, diagnosis scores, or the underlying condition. A test checks this
on every authored patient (`game/tests/agent-play.test.js`).

The log is written when the run ends. It holds every action with the
player's stated reasoning, the transcript, the outcome, and a `groundTruth`
block: the underlying condition, the best diagnosis on the list, whether the
player chose it, and how much of the key evidence was found.

Keep a model under study away from the repository. The authored cases and
their answers are in `game/src/consultation/authoredPatients/`, and a log
holds the answers for its run. The batch runner gives a model only the
observations.

## Many runs

```sh
node game/scripts/agent-batch.mjs --patients=all --players=random --runs=200
node game/scripts/agent-batch.mjs --patients=carmela,samuel,case:5:0 \
  --players=claude-opus-5-5,gpt-5.6-luna --personas=period,modern --runs=3 \
  --judge=claude-opus-5-5
node game/scripts/agent-batch.mjs --day --seeds=1,2,3 --days=2 --players=random
```

Each run writes its log to `artifacts/agent/batch-<time>/`, with
`summary.json` and `summary.csv` beside them, and the totals are printed.

Players:

- `random` chooses among the offered actions with a seeded generator. It
  costs nothing and is the quick check after an engine or content change:
  it finds refused actions, dead ends, and visits that cannot be finished.
  The totals also show how each case treats an unguided player.
- A name beginning `claude` is played through the Anthropic API
  (`ANTHROPIC_API_KEY`). Any other name is played through the OpenAI
  Responses API (`OPENAI_API_KEY`). Either key may be set in `.env.local`.

Personas (`--personas`):

- `period` tells the model to be a New York physician of 1896 and to know
  nothing later.
- `modern` tells it to use present-day medicine to find the real condition
  and then pick the best available option.
- `plain` only tells it to play well.

`--judge=MODEL` has a model read each transcript for anachronism and bedside
manner. It scores only the player's own words and reasoning, not the choices
the game wrote. Its scores are a model's opinion and are not a verified
historical judgment.

Model players are not given a fallback model. A refusal ends that run and is
recorded as its error, so a table never mixes answers from two models.

Things to hold fixed or vary on purpose in a study:

- hints (`--hints`), since the ranked shortlist points at the answer;
- offline or `--live` patient replies;
- authored cases, which a model may have seen if the repository is public,
  against procedural `case:` patients, which it has not.

## Checking the text runner against the browser

```sh
node game/scripts/agent-parity.mjs
```

This plays one Carmela visit in the browser and the same choices as text,
then compares diagnosis, prescription, minutes, fee, and one-month result.
Run it after changing consultation rules or the consultation screen.
