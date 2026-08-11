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

The search starts the dev server if one is not already up, drives a headless
Chrome at `?shot=1`, and writes `tools/hopper/out/<run>/`:

- `top-NN.png` -- the winning frames
- `top-NN.json` -- the shot that produced each, plus its score breakdown
- `frames/NNNNN.png` -- every frame, for rating (`--no-frames` to skip)
- `all.jsonl` -- every sample, for plotting or re-ranking
- `contact-sheet.png` -- all the winners on one page

Flags: `--zone`, `--samples`, `--climb`, `--keep`, `--seed`, `--width`,
`--height`, `--no-frames`, `--headed` (watch it work). About 2 samples a
second. First run needs `pip install open_clip_torch` for the CLIP term.

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

- Exterior zones. `search.mjs` refuses them; sampling needs terrain height and
  a legality test that is not a room AABB.
- Figure legality is a 2D test, so the figure can end up standing on a desk.
- Pedestrians as figures. `probe()` only knows about the player.
- CMA-ES instead of random search plus hill-climb. Worth it above ~1000
  samples; not worth it below.
- A reward model trained on your own ratings of `all.jsonl`. This is the only
  way to capture what *you* mean by Hopper, and the frames are already saved
  for it.
