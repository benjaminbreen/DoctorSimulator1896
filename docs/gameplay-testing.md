# Playing the game as an agent

Use the gameplay runner for changes to the player experience. It runs the
ordinary game with the HUD, appointments, conversations, and consultation UI.
The separate `?shot=1` harness is for composed art captures.

## Setup

From the repository root:

```sh
npm ci
npm --prefix game ci
git lfs pull --include='game/public/**' --exclude=''
```

Google Chrome must be installed. The runner uses the root `playwright-core`
dependency. Missing LFS assets are pointer files, not usable models; npm does
not fetch them.

## Keep a session open

```sh
node game/scripts/gameplay-playtest.mjs --scenario=carmela
```

The runner starts Vite if needed and opens an isolated browser profile. Add
`--headed` to see Chrome. It prints a JSON result with an absolute screenshot
path, state file, visible text, controls, clock, and interaction prompt. Open
the PNG to assess the actual rendered game; read the state for exact labels.

Keep the process's stdin open and send one JSON object per line. In a terminal
tool, use a persistent session with a PTY and send subsequent commands to that
session. Do not start a browser for each action.

```jsonl
{"type":"click","name":"Continue"}
{"type":"click","name":"I should ask what happens before, during, and after each attack.","exact":false}
{"type":"click","name":"Ask how the attacks start, how long they last, and what she feels.","exact":false}
{"type":"observe"}
{"type":"press","key":"Tab"}
{"type":"quit"}
```

The default pauses browser timers and animation frames between actions. Time,
passive recovery, crowds, and patient animation do not run while the agent
reads a screenshot. `observe` and `assert` keep the current frame paused.
Actions resume the browser, wait for the destination's loading stages, patient
models, and any pending consultation reply, then pause and capture again.
Use `wait` when a speech or entrance animation needs more time to play.

The opening world clock stays at 9:30 until scenario setup finishes. This only
applies to `?playtest=1`; the runner starts the clock before its first capture.
Seeds are also opt-in through `?playtest=1&seed=4`. Normal sessions keep their
random casts and normal clock behavior.

For the modular Carmela appearance study, use
`--url='http://127.0.0.1:5175/?appearanceSeed=17'`. The runner preserves this
parameter when adding its scenario flags. It selects a repeatable face and
colour recipe only under `playtest=1`; the clinical case stays the same.
Use `?appearancePreset=auburn-curls` to select a curated look and its head asset.
The 26 choices are in `shared/characters/modularCast.js`. Capture state
records `assetPath` and `appearancePreset` in each performance entry so a review
can confirm which geometry was actually rendered.
Carmela's smaller lower face and stronger expressions are now the ordinary
default, so they need no appearance parameter.
Hair seeds also select style and grooming: seed 1 uses the waved knot, seed 5
soft side waves and seed 11 curled side rolls. Capture state records visible
hairstyles, applied grooming weights and material cutout settings beside each
patient's expression weights.

## Actions and targets

```jsonl
{"type":"move","keys":["KeyW","ShiftLeft"],"ms":800}
{"type":"look","dx":150,"dy":-20}
{"type":"scroll","dy":200}
{"type":"press","key":"KeyM"}
{"type":"click","name":"Fast Travel","index":0}
{"type":"click","name":"Your Consulting Room","exact":false}
{"type":"fill","label":"Ask in your own words","value":"What medicines do you take?"}
{"type":"click","name":"Ask custom question"}
{"type":"wait","ms":3000}
{"type":"resize","width":390,"height":844}
{"type":"assert","selector":".ghud-travel-menu","visible":false}
```

Click defaults to an exact button name. Set `role` for another accessible role,
`exact:false` for a partial name, or `selector` for a CSS target. An ambiguous
name fails; use the returned controls and an explicit `index` or selector.
Fill uses an exact accessible `label`, or a selector. Assertions accept visible
`text` or a selector, with `visible:false` to check absence. Movement releases
every held key even when an action fails. Durations are limited to 60 seconds.

Scenarios: `park`, `appointment`, `office`, `waiting-room`, `nora`, `samuel`, `carmela`,
`wilhelmina`, and `chapuys`. Patient scenarios use ordinary casebook buttons to
start a visit. Their default seeds include that patient; an overriding seed
can produce a cast that does not. The runner does not select diagnoses,
disclose hidden evidence, or decide outcomes for the player.
The `appointment` scenario starts in the park shortly before the first visit,
so a short wait can exercise the appointment reminder.

## Replay and review a change

```sh
node game/scripts/gameplay-playtest.mjs --scenario=carmela \
  --replay=game/scripts/playthroughs/carmela.jsonl
node game/scripts/gameplay-playtest.mjs --scenario=park \
  --replay=game/scripts/playthroughs/park.jsonl
node game/scripts/gameplay-playtest.mjs --scenario=appointment \
  --replay=game/scripts/playthroughs/appointment.jsonl
```

The first script checks inquiry and notebook disclosure. The second walks,
turns, changes camera mode, travels through the HUD, and checks the destination.
The third reproduces an appointment arriving while Fast Travel is open, then
checks that returning to the office clears the travel dialog.
These are short UI smoke paths, not complete clinical playthroughs.

For curtain contact from both sides, a jump against a sconce shade, and
pushing a patient chair:

```sh
node game/scripts/gameplay-playtest.mjs --scenario=office --video \
  --replay=game/scripts/playthroughs/material-affordances.jsonl
```

Captures include `materialResponses`: curtain contact, displacement and entry
direction, sconce hit counts and current tilt, and furniture scrape counts
and speed. Inspect the PNGs as well.
The fabric uses body contact and damped vertex motion; it does not simulate
cloth tangling or self-collision. Sconce burners stay fixed while the shades
rock on their fittings. Contact sounds use the existing master, effects and
mute controls.

For the full Carmela route, including the in-room attack, examination,
treatment search, case record, both outcomes, and return to the street:

```sh
node game/scripts/gameplay-playtest.mjs --scenario=carmela --offline \
  --replay=game/scripts/playthroughs/carmela-full.jsonl
```

`--offline` intercepts `/api/consult` with an empty successful response. The
game then uses its authored dialogue and fallback James letter. This keeps
the UI replay independent of model access; it does not test the live service.
The original live playthrough reached the same outcomes but recorded a 502
from the optional James-letter request.

`carmela-emotions.jsonl` pauses on the theft, attack and reassurance, then waits
for each spoken gesture to settle. `carmela-dismissal.jsonl` reviews the opposing
response. Capture state includes `performances`: the rendered actor's current
cue and actual nonzero morph weights. This makes speech release and expression
strength inspectable alongside the PNGs. Finish production builds before a dev
server replay; build output can trigger a page reload during the visit.

Each run saves an initial capture, numbered PNG/JSON pairs, `actions.jsonl`,
`steps.jsonl`, and `run.json` under `artifacts/gameplay/`. Output is ignored by
Git. `--output=DIR` selects a destination; use a fresh directory each run.
Replay a recorded `actions.jsonl` with the same scenario and seed. The run
metadata records those settings. Seeds repeat cast and choices, not exact
animation frames or GPU timing.

After a change, replay the affected path, inspect the screenshots, and compare
the visible states. Unit tests alone cannot verify clipping, competing
overlays, camera placement, or readability. A failed action or assertion,
JavaScript error, console error, or failed resource makes the process exit
nonzero. Failed actions retain a capture when the page is still available.
The expected local Vercel analytics 404 is ignored.

## Motion and continuous play

Use `--video` to save a WebM and `--trace` for a Playwright trace. Both are
finalized when the session closes. A short replay with `--video` is useful for
reviewing camera and animation changes. Traces include loaded 3D assets and
can be large.

`resume` lets time run between commands; `pause` returns to paused inspection.
For a run using real browser timers throughout, start with `--continuous`.
That mode cannot pause; it is useful for pacing and spontaneous events. The
default mode emulates browser time, so its FPS and boot times are not valid
performance measurements. Use `game/scripts/performance-playtest.mjs` for
performance comparisons.

Paused runs default to `--quality=quality` at DPR 1, so emulated timing cannot
make adaptive resolution blur a visual comparison. Continuous runs default
to `--quality=auto`. Set `--quality=performance` to review that preset. The
chosen profile is recorded in `run.json`.

EOF, `quit`, or Ctrl+C closes the browser and the Vite process owned by the
runner. An existing dev server is left running. `--url=URL` uses an existing
server; `--port=5176` starts or reuses another local port. `--help` lists the
command syntax.

For the two new male templates, run the Samuel scenario with
`?appearancePreset=lean-base` or `?appearancePreset=broad-base` in `--url`.
This is a playtest-only visual override; it keeps Samuel's clinical facts.
It supplies the new body, facial features and nine-clip motion map, including
walking into the room and sitting. Other male appearance IDs, with selectable
moustaches and sideburns, are in `shared/characters/modularCast.js`.
Add `--offline --replay=game/scripts/playthroughs/modular-men.jsonl` for the
repeatable entrance, dialogue, wrist/gum examination and return path. The replay
waits for the full entrance before opening the interview. Use `broad-silver` to
review a moustache and mutton chops through the same actions.

Accessories are included in performance capture state: style and fit fields,
triangle/draw-call counts, measured anchors and native-tie partition mode.
`worker-silver` reviews oval spectacles with a work neckerchief; `broad-silver`
reviews rimless pince-nez, a cravat, stickpin and double watch chain. Carmela's
ordinary appearance includes her brooch and studs. The lab's accessory
catalogue runner and historical sources are in `docs/accessories.md`.

For character defects, use the lab's **Torso** view to keep the face, collar,
wrists and lap in one capture. `window.__faceLab.pickSurface(x,y)` identifies
the visible mesh, material and position at a screen point. Unlit texture and
normal views are available through `inspectShading('texture')` and
`inspectShading('normal')`; restore with `inspectShading('original')`.
These debug materials show the source mesh. They do not run the male apron's
contact shader, and surface picks on that panel report its underlying skinned
mesh rather than the final displaced contact point.

To distinguish a texture fault from a received shadow in the game, add
`--inspect-shadows=0008` to a replay. It saves `0008-shadow-on.png` and
`0008-shadow-off.png` at the same paused pose, then restores the actor's flags.
This is an inspection option; ordinary replays keep the normal lighting.
