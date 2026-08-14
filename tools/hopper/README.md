# Hopper shot search

Renders the game from thousands of camera positions, scores each frame for how
Hopper-like it is, and keeps the best. The winners are saved as reproducible
shot files you can load back into the game.

There is no policy network and no training loop. The reward is immediate --
render, score, done -- so random search plus a hill-climb finds better frames
per minute than RL would.

## Run it

```bash
python3 tools/hopper/score_server.py
```

```bash
node tools/hopper/search.mjs --zone consulting-office --samples 400
```

For a balanced pass over every registered interior and exterior, including
dawn, sunset and evening:

```bash
node tools/hopper/search.mjs --zone all --samples 300 --time-bands all --keep 30
```

The search starts the dev server if one is not already up, drives a headless
Chrome at `?shot=1`, and writes `tools/hopper/out/<run>/`:

- `top-NN.png` -- the winning frames
- `top-NN.json` -- the shot that produced each, plus its score breakdown
- `frames/NNNNN.png` -- every frame, for rating (`--no-frames` to skip)
- `all.jsonl` -- every sample, for plotting or re-ranking
- `contact-sheet.png` -- all the winners on one page

Search writes every result immediately. If a long run is interrupted, finish
its deliverables without restarting Chrome, WebGL, CLIP, or the scorer:

```bash
npm run hopper:finalize -- \
  --run rooftop-pilot-180 --keep 30 --requested-samples 180
```

This selects winners from the frames already present, writes a manifest that
records whether the render budget completed, and creates the contact sheet.

Flags: `--zone` (a comma list or `all`), `--samples`, `--climb`, `--keep`,
`--seed`, `--width`, `--height`, `--time-bands`, `--vibes`, `--compositions`,
`--camera-strata`, `--shadow-families`, `--sun-azimuths`,
`--leaders-per-zone`,
`--run-name`, `--no-frames`, `--headed` (watch it work). Time bands are
`dawn,morning,midday,afternoon,sunset,evening`; `all` balances all six. About
2 samples a second. First run needs `pip install open_clip_torch` for CLIP.

Lighting is sampled in six coherent vibe families: `raking-clarity`,
`soft-overcast`, `warm-afterglow`, `quiet-fill`, `practical-nocturne`, and
`luminous-haze`. A family correlates direct-light strength and elevation,
ambient/environment fill, shadow softness, bounce, bloom, glow, haze, cloud
cover, window color, and practical light. `--vibes all` balances all six.
Composition strata are `figure,window,architecture`; outdoor runs omit the
impossible window stratum automatically.

Outdoor cameras default to `--camera-strata ground` for reproducibility. Use
`--camera-strata all` to balance ground, raised façade/fire-escape and rooftop
vantages derived from existing building collider boxes. Elevated lenses are
validated in 3D and become architecture studies with the player hidden. They
do not change player navigation or add special scene assets.

The ordinary game keeps its historically calculated solar direction. Shot
search can rotate the whole outdoor sun/sky system with `--sun-azimuths all`,
which balances four 90-degree sectors. `--shadow-families all` balances hard,
medium and soft outdoor shadows. The defaults `physical` and `profile` retain
the former behaviour. Camera height, shadow family and azimuth are scheduled
in shuffled full-factorial blocks so none of those controls becomes a proxy
for another one in a rating pass.

Camera candidates are aimed toward a nearby figure, a window, or the room's
architectural centre. Outdoors, the figure is sampled near its camera instead
of independently across the whole park. Final winners are balanced across
zones, time bands, vibes and composition families before local near-duplicates
are removed.

## The reward

Two halves, deliberately kept apart so you can see which one liked a frame.

**Composition metrics** (`metrics.py`) -- hand-written, each 0..1, each
measuring one nameable thing:

| metric | what it measures |
| --- | --- |
| `flatness` | fraction of frame with no local detail |
| `emptiness` | largest single unbroken region |
| `tonal_range` | that the frame is actually lit, not just dark |
| `light_split` | Otsu separability: sun and shade as two populations |
| `light_balance` | the lit fraction sits between 15% and 55% |
| `shadow_edge` | how hard the sun/shade boundary is |
| `rectilinear` | strong edges running vertical or horizontal |
| `raking` | one strong luminance slope, arriving off-axis |
| `palette` | Lab distance to eight colors sampled from Hopper |
| `figure` | size, thirds placement, and facing, from the scene graph |
| `window` | one or two windows in frame at a readable size |

`figure` and `window` come from `window.__shot.probe()`, which reads the actual
scene rather than guessing from pixels. That is the deterministic ground truth
the rest of the project runs on.

**CLIP** (`clip_scorer.py`) -- optional and off by default:

```bash
python3 tools/hopper/score_server.py --clip
```

Drop Hopper reproductions into `references/` and it scores similarity to their
embedding centroid. With no references it falls back to text prompts, which is
weaker but still works -- it subtracts similarity to "a video game screenshot"
so the optimizer cannot collect reward for merely being an image.

The score is calibrated against the run's own distribution (running mean and
variance, then a sigmoid on the z-score). A fixed rescale was tried first and
clamped every frame to zero: raw cosine similarity sits in a narrow band whose
position depends on the model, the prompts, and whether the target is text or
images. The cost is that the CLIP term is relative -- totals are only
comparable between runs that share `out/clip-calibration.json`.

**Taste** (`reward_model.py`) -- your own ratings, also optional. See below.

Weights live in `weights.json`. Only the terms the server can compute are used,
and they are renormalized, so turning CLIP off does not change the scale.

## Teaching it your taste

CLIP knows what the internet means by Hopper. This is how you tell it what you
mean.

```bash
python3 tools/hopper/rate.py        # then open http://127.0.0.1:8778
```

Frames come from every run in `out/`, stratified across the automatic score so
you see the bottom of the range as well as the top. Keys 1-5 to rate, `u` to
undo, `s` to skip. Ratings go to `out/ratings.json`, keyed by frame path, and
survive re-runs.

`ratings.json`, `rating-exclusions.json`, and `reward-model.json` are the small
durable record of the experiment and are not ignored by Git. Exclusions keep a
raw answer while preventing a known rendering defect from becoming a taste
preference. Rendered frames, embedding caches and rating-session manifests
remain local because they are large or reproducible.

For a fixed, blind 30-frame pass from one run:

```bash
python3 tools/hopper/rate.py \
  --run mixed-pilot \
  --session pilot-30 \
  --session-size 30
```

The saved session balances zone, time of day, lighting vibe, automatic-score
strata and composition family. The UI hides both automatic score and vibe label
while you rate. Named sessions live in `out/rating-sessions/` and resume after
the server restarts.

```bash
python3 tools/hopper/train_reward.py
```

Fits a ridge regression from the CLIP embedding to your 1-5 score and writes
`out/reward-model.json`; restart the scorer to pick it up as the `taste` term.
It needs the scorer running with `--clip` (embeddings come from it, so there is
only ever one copy of CLIP in memory) and reports a holdout correlation. Below
about 0.4, rate more frames or rate more consistently.

A couple of hundred ratings is enough. The input is already a good
representation and the target is one number.

## Comparing a widened search

For a camera-space experiment, A/B choices are easier to interpret than more
absolute 1-5 labels:

```bash
python3 tools/hopper/compare.py \
  --run rooftop-pilot-120 \
  --session rooftop-pilot-40 \
  --session-size 40
```

The durable session balances ground/raised, ground/rooftop,
raised/rooftop and within-elevated pairs. Click either image or use the arrow
keys; `n` means neither, `u` undoes and `s` skips. Votes are written separately
to `out/comparisons.json`, without mixing them ambiguously into the 1-5 scale.

After a completed pass, fit the reversible A/B adapter:

```bash
python3 tools/hopper/train_pairwise.py --session rooftop-pilot-40
```

The adapter learns only a regularized delta from winner-minus-loser CLIP
embeddings. The 1-5 reward model stays unchanged underneath it. Training uses
family-stratified cross-validation against the complete automatic score and
refuses to write `out/pairwise-adapter.json` unless held-out choices improve
without materially damaging agreement with the scalar ratings. The scorer and
`score_gamut.py` load a compatible adapter automatically; a base-model
fingerprint prevents an old adapter from being applied after scalar retraining.

For the full scene gamut rather than the camera-height diagnostic, use the
memory-separated pipeline. Capture four small batches first (the game closes
after each), then score them only after WebGL is gone:

```bash
node tools/hopper/gamut_search.mjs --run hopper-gamut-60 --batch-index 0 --reset
node tools/hopper/gamut_search.mjs --run hopper-gamut-60 --batch-index 1
node tools/hopper/gamut_search.mjs --run hopper-gamut-60 --batch-index 2
node tools/hopper/gamut_search.mjs --run hopper-gamut-60 --batch-index 3
python3 tools/hopper/score_gamut.py --run hopper-gamut-60
npm run hopper:finalize -- --run hopper-gamut-60 --keep 30 --requested-samples 60
```

The 60-frame plan fixes the proportions at 20% park landscapes/people, 25%
street people, 25% women at windows, 15% other interiors, and only 15%
raised/rooftop architecture. It reuses the game's existing pedestrians and
rooms. A family-balanced comparison pass is:

```bash
python3 tools/hopper/compare.py --profile gamut --run hopper-gamut-60 \
  --session hopper-gamut-30 --session-size 30
```

For a fresh blind check that concentrates ten of its thirty comparisons on
woman-at-window compositions and assigns four to every other family:

```bash
python3 tools/hopper/compare.py --profile window-validation \
  --run hopper-gamut-holdout-60 --session hopper-window-holdout-30 \
  --session-size 30
```

Embeddings are cached in `out/.embedding-cache-v2.npz`, so scalar or pairwise
retraining after a new pass only embeds new or changed frames. Mixed-zone
models use a stratified holdout and record their zone coverage. Until a zone
appears in the training data, the scorer uses only 35% of the taste term's
normal weight there.

## Walking into a found shot

The game shows a **Load shot** bar at the bottom left. Give it a `top-NN.json`
and it switches zone if needed, poses the figure, sets the lighting, and puts
the camera exactly where the search found it. **Release camera** hands control
back so you can walk around from there; **Copy shot** puts the current framing
on the clipboard as a shot file, so a found frame you have nudged by hand can
go back into `out/` or into a lighting preset.

## Reward hacking

Expect it. The first run found that a dark empty wall with one window scores
perfectly on flatness, emptiness and light-split, which is why `flatness` and
`emptiness` are plateaus rather than "more is better" and why `tonal_range`
exists. Every degenerate winner tells you something your reward function does
not measure. Look at the losers too.

## Game side

Three hooks, all inert unless the page is loaded with `?shot=1`:

- `gameDebug.freeCamera` -- `CameraRig` hands the camera over when it is set
- `gameDebug.pendingYaw` -- poses the figure
- `game/src/shots/harness.js` -- installs `window.__shot` with `world()`,
  `legal()`, `apply()`, `probe()`, `clear()`

`?shot=1` also hides the tuning panel and HUD so the canvas fills the window.

## Not done yet

- Figure legality is still a 2D collider test; elevated shot cameras use their
  own 3D check, but figures remain on authored walkable ground.
- Existing pedestrians are selectable exterior anchors. Window studies reuse
  the existing working-woman model in `?shot=1`; neither changes ordinary play.
- CMA-ES instead of random search plus hill-climb. Worth it above ~1000
  samples; not worth it below.
