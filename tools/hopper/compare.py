#!/usr/bin/env python3
"""Run a durable A/B comparison pass over Hopper-search frames.

    python3 tools/hopper/compare.py \
      --run rooftop-pilot-120 --session rooftop-pilot-40 --session-size 40

Pairs emphasize ground-versus-raised, ground-versus-rooftop and
raised-versus-rooftop comparisons. Votes are separate from the older 1-5
ratings so a future pairwise reward head can consume them without guessing
how the two scales relate.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import random
import re
from urllib.parse import unquote, urlparse

from rate import collect_frames

HERE = os.path.dirname(os.path.abspath(__file__))

PAGE = """<!doctype html>
<meta charset="utf-8"><title>Hopper A/B</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; background:#111; color:#bbb; font:13px/1.5 ui-sans-serif,system-ui;
         display:flex; flex-direction:column; height:100vh; }
  header { display:flex; gap:1.5rem; align-items:baseline; padding:.65rem 1rem; }
  h1 { font-size:13px; font-weight:600; color:#eee; margin:0; }
  main { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:12px;
         min-height:0; padding:0 12px; }
  figure { min-width:0; min-height:0; margin:0; display:grid; place-items:center;
           border:1px solid #292929; background:#0b0b0b; cursor:pointer; }
  figure:hover { border-color:#777; }
  img { max-width:100%; max-height:100%; object-fit:contain; }
  footer { padding:.8rem 1rem; display:flex; gap:.5rem; align-items:center; }
  button { background:#222; color:#ddd; border:1px solid #383838; border-radius:4px;
           padding:.5rem .9rem; font:inherit; cursor:pointer; }
  button:hover { background:#2c2c2c; }
  .key { color:#666; }
  .meta { color:#777; font-variant-numeric:tabular-nums; }
</style>
<header>
  <h1>Which composition feels more Hopper-like?</h1>
  <span class="meta" id="stats"></span>
  <span class="key">←/1 left · →/2 right · n neither · u undo · s skip</span>
</header>
<main>
  <figure id="choose-left"><img id="left" alt="Left composition"></figure>
  <figure id="choose-right"><img id="right" alt="Right composition"></figure>
</main>
<footer>
  <button id="left-button">← left</button>
  <button id="neither-button">neither</button>
  <button id="right-button">right →</button>
  <button id="undo-button">undo</button>
  <button id="skip-button">skip</button>
</footer>
<script>
let current = null, previous = null;

async function next() {
  const res = await fetch('/next');
  current = await res.json();
  if (current.done) {
    document.querySelector('main').style.visibility = 'hidden';
    document.getElementById('stats').textContent =
      `complete · ${current.rated} comparisons${current.skipped ? ` · ${current.skipped} skipped` : ''}`;
    return;
  }
  document.querySelector('main').style.visibility = 'visible';
  document.getElementById('left').src = '/image?path=' + encodeURIComponent(current.left.path);
  document.getElementById('right').src = '/image?path=' + encodeURIComponent(current.right.path);
  document.getElementById('stats').textContent = `${current.position}/${current.total}`;
}

async function vote(choice) {
  if (!current || current.done) return;
  previous = current.id;
  await fetch('/vote', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: current.id, choice }) });
  next();
}

async function skip() {
  if (!current || current.done) return;
  await fetch('/skip', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: current.id }) });
  next();
}

async function undo() {
  if (!previous) return;
  await fetch('/vote', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: previous, choice: null }) });
  previous = null;
  next();
}

document.getElementById('choose-left').onclick = () => vote('left');
document.getElementById('choose-right').onclick = () => vote('right');
document.getElementById('left-button').onclick = () => vote('left');
document.getElementById('right-button').onclick = () => vote('right');
document.getElementById('neither-button').onclick = () => vote('neither');
document.getElementById('undo-button').onclick = undo;
document.getElementById('skip-button').onclick = skip;
addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === '1' || event.key === 'a') vote('left');
  else if (event.key === 'ArrowRight' || event.key === '2' || event.key === 'd') vote('right');
  else if (event.key === 'n') vote('neither');
  else if (event.key === 'u') undo();
  else if (event.key === 's') skip();
});
next();
</script>
"""


def comparison_session_path(out_dir, name):
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-.")
    if not safe:
        raise ValueError("session name must contain a letter or number")
    return os.path.join(out_dir, "comparison-sessions", f"{safe}.json")


def stable_pair_id(left, right):
    paths = sorted([left["path"], right["path"]])
    return hashlib.sha1("\n".join(paths).encode()).hexdigest()[:16]


def desired_pair_types(size):
    counts = [
        (("ground", "raised"), round(size * 0.25)),
        (("ground", "rooftop"), round(size * 0.25)),
        (("raised", "rooftop"), round(size * 0.20)),
        (("raised", "raised"), round(size * 0.15)),
    ]
    used = sum(count for _, count in counts)
    counts.append((("rooftop", "rooftop"), max(0, size - used)))
    sequence = []
    remaining = dict(counts)
    order = [pair_type for pair_type, _ in counts]
    while len(sequence) < size:
        for pair_type in order:
            if remaining[pair_type] > 0:
                sequence.append(pair_type)
                remaining[pair_type] -= 1
    return sequence


def select_comparison_pairs(frames, size, seed=0):
    """Select informative, mostly unique pairs across camera-height strata."""
    if size <= 0:
        raise ValueError("comparison session size must be positive")
    pair_types = desired_pair_types(size)
    needed = Counter(stratum for pair_type in pair_types for stratum in pair_type)
    pools = {
        stratum: sorted(
            [frame for frame in frames if frame.get("camera_stratum", "ground") == stratum],
            key=lambda frame: (-frame["auto"], frame["path"]),
        )
        for stratum in ("ground", "raised", "rooftop")
    }
    for stratum, pool in pools.items():
        minimum = max(2, needed[stratum])
        if len(pool) < minimum:
            raise ValueError(f"only {len(pool)} {stratum} frames; need {minimum}")
        # Keep the comparison pass out of each stratum's obvious bottom
        # quartile while retaining enough unique images to avoid repetition.
        pools[stratum] = pool[:max(minimum, round(len(pool) * 0.75))]

    rng = random.Random(seed)
    tie = {frame["path"]: rng.random() for frame in frames}
    usage = Counter()
    time_usage = Counter()
    vibe_usage = Counter()
    pairs = []

    for left_stratum, right_stratum in pair_types:
        candidates = []
        for left in pools[left_stratum]:
            for right in pools[right_stratum]:
                if left["path"] == right["path"]:
                    continue
                pair_id = stable_pair_id(left, right)
                if any(pair["id"] == pair_id for pair in pairs):
                    continue
                same_time = left["time_band"] == right["time_band"]
                same_vibe = left["vibe"] == right["vibe"]
                candidates.append((
                    max(usage[left["path"]], usage[right["path"]]),
                    usage[left["path"]] + usage[right["path"]],
                    0 if same_time else 1,
                    time_usage[left["time_band"]] + time_usage[right["time_band"]],
                    0 if same_vibe else 1,
                    vibe_usage[left["vibe"]] + vibe_usage[right["vibe"]],
                    abs(left["auto"] - right["auto"]),
                    tie[left["path"]] + tie[right["path"]],
                    left["path"],
                    right["path"],
                    left,
                    right,
                ))
        if not candidates:
            raise ValueError(f"could not build enough {left_stratum}/{right_stratum} pairs")
        *_, left, right = min(candidates)
        if rng.random() < 0.5:
            left, right = right, left
        pair = {
            "id": stable_pair_id(left, right),
            "pair_type": "/".join(sorted([left_stratum, right_stratum])),
            "left": left,
            "right": right,
        }
        pairs.append(pair)
        for frame in (left, right):
            usage[frame["path"]] += 1
            time_usage[frame["time_band"]] += 1
            vibe_usage[frame["vibe"]] += 1

    return pairs


def select_gamut_pairs(frames, size, seed=0, family_schedule=None):
    """Build within-family comparisons across the complete scene gamut."""
    if size <= 0:
        raise ValueError("comparison session size must be positive")
    groups = {}
    for frame in frames:
        family = frame.get("scene_family", "legacy")
        groups.setdefault(family, []).append(frame)
    groups = {family: rows for family, rows in groups.items() if family != "legacy"}
    if not groups:
        raise ValueError("run has no scene-family metadata; use --profile height")
    for family, rows in groups.items():
        if len(rows) < 2:
            raise ValueError(f"only {len(rows)} valid {family} frame; need at least 2")
        rows.sort(key=lambda frame: (-frame["auto"], frame["path"]))
        # These family pools are intentionally small (the two park families
        # have six source frames in a 60-shot gamut). Keep every valid frame:
        # trimming even one can leave too few distinct pairs for a balanced
        # 30-comparison pass.
        groups[family] = rows

    # Lead with the human/window subject the experiment is trying hardest to
    # learn, then alternate through the ordinary world before an elevated
    # pair. Alphabetical ordering put two dark roofs on the opening screen.
    preferred_order = [
        "window-figure",
        "doorway-figure",
        "park-people",
        "street-people",
        "rooftop-figure",
        "interior-room",
        "park-landscape",
        "elevated-architecture",
    ]
    families = [family for family in preferred_order if family in groups]
    families.extend(sorted(set(groups) - set(families)))
    schedule = list(family_schedule) if family_schedule is not None else [
        families[index % len(families)] for index in range(size)
    ]
    if len(schedule) != size:
        raise ValueError(f"family schedule has {len(schedule)} entries; expected {size}")
    missing = sorted(set(schedule) - set(groups))
    if missing:
        raise ValueError(f"run has no valid frames for scheduled family: {missing[0]}")
    rng = random.Random(seed)
    tie = {frame["path"]: rng.random() for frame in frames}
    usage = Counter()
    pairs = []
    for family in schedule:
        candidates = []
        pool = groups[family]
        for left_index, left in enumerate(pool):
            for right in pool[left_index + 1:]:
                pair_id = stable_pair_id(left, right)
                if any(pair["id"] == pair_id for pair in pairs):
                    continue
                candidates.append((
                    max(usage[left["path"]], usage[right["path"]]),
                    usage[left["path"]] + usage[right["path"]],
                    0 if left["time_band"] == right["time_band"] else 1,
                    0 if left["vibe"] == right["vibe"] else 1,
                    abs(left["auto"] - right["auto"]),
                    tie[left["path"]] + tie[right["path"]],
                    left["path"],
                    right["path"],
                    left,
                    right,
                ))
        if not candidates:
            raise ValueError(f"could not build {size} unique comparisons; {family} pool is exhausted")
        *_, left, right = min(candidates)
        if rng.random() < 0.5:
            left, right = right, left
        pairs.append({
            "id": stable_pair_id(left, right),
            "pair_type": family,
            "left": left,
            "right": right,
        })
        usage[left["path"]] += 1
        usage[right["path"]] += 1
    return pairs


def select_window_validation_pairs(frames, size, seed=0):
    """A 30-pair blind gamut with extra evidence for window compositions."""
    if size != 30:
        raise ValueError("window-validation profile requires --session-size 30")
    window = "window-figure"
    others = [
        "park-people",
        "street-people",
        "interior-room",
        "park-landscape",
        "elevated-architecture",
    ]
    schedule = []
    other_index = 0
    for index in range(size):
        if index % 3 == 0:
            schedule.append(window)
        else:
            schedule.append(others[other_index % len(others)])
            other_index += 1
    return select_gamut_pairs(frames, size, seed, family_schedule=schedule)


def select_subject_validation_pairs(frames, size, seed=0):
    """A 30-pair gamut weighted toward the three placed-woman scenarios."""
    if size != 30:
        raise ValueError("subject-validation profile requires --session-size 30")
    remaining = {
        "window-figure": 6,
        "doorway-figure": 5,
        "rooftop-figure": 5,
        "street-people": 4,
        "park-people": 3,
        "interior-room": 3,
        "park-landscape": 2,
        "elevated-architecture": 2,
    }
    schedule = []
    while len(schedule) < size:
        for family in remaining:
            if remaining[family] > 0:
                schedule.append(family)
                remaining[family] -= 1
    return select_gamut_pairs(frames, size, seed, family_schedule=schedule)


def load_or_create_session(out_dir, name, frames, size, seed, profile="height"):
    path = comparison_session_path(out_dir, name)
    if os.path.exists(path):
        with open(path) as handle:
            return json.load(handle)["pairs"], path, False
    selectors = {
        "height": select_comparison_pairs,
        "gamut": select_gamut_pairs,
        "window-validation": select_window_validation_pairs,
        "subject-validation": select_subject_validation_pairs,
    }
    selector = selectors[profile]
    pairs = selector(frames, size, seed)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as handle:
        json.dump({
            "version": 1,
            "created": datetime.now(timezone.utc).isoformat(),
            "seed": seed,
            "profile": profile,
            "pairs": pairs,
        }, handle, indent=2)
    return pairs, path, True


class ComparisonRater:
    def __init__(self, out_dir, pairs):
        self.out_dir = os.path.abspath(out_dir)
        self.pairs = list(pairs)
        self.by_id = {pair["id"]: pair for pair in pairs}
        self.votes_path = os.path.join(self.out_dir, "comparisons.json")
        self.votes = {}
        self.skipped = set()
        if os.path.exists(self.votes_path):
            with open(self.votes_path) as handle:
                saved = json.load(handle)
            self.votes = saved.get("votes", saved)

    @property
    def rated_count(self):
        return sum(pair["id"] in self.votes for pair in self.pairs)

    def pick(self):
        for index, pair in enumerate(self.pairs):
            if pair["id"] not in self.votes and pair["id"] not in self.skipped:
                return {
                    **pair,
                    "position": index + 1,
                    "total": len(self.pairs),
                    "rated": self.rated_count,
                    "skipped": len(self.skipped),
                }
        return None

    def set(self, pair_id, choice):
        pair = self.by_id.get(pair_id)
        if not pair:
            raise ValueError("unknown comparison")
        if choice is None:
            self.votes.pop(pair_id, None)
        elif choice in ("left", "right", "neither"):
            winner = pair[choice]["path"] if choice in ("left", "right") else None
            self.votes[pair_id] = {
                "choice": choice,
                "winner": winner,
                "left": pair["left"]["path"],
                "right": pair["right"]["path"],
                "updated": datetime.now(timezone.utc).isoformat(),
            }
            self.skipped.discard(pair_id)
        else:
            raise ValueError("choice must be left, right, neither, or null")
        with open(self.votes_path, "w") as handle:
            json.dump({"version": 1, "votes": self.votes}, handle, indent=2)

    def skip(self, pair_id):
        if pair_id in self.by_id:
            self.skipped.add(pair_id)


def make_handler(rater):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, body, content_type="application/json", status=200):
            if isinstance(body, (dict, list)):
                body = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlparse(self.path)
            if url.path == "/":
                self._send(PAGE.encode(), "text/html; charset=utf-8")
            elif url.path == "/next":
                pair = rater.pick()
                self._send(pair or {
                    "done": True,
                    "rated": rater.rated_count,
                    "skipped": len(rater.skipped),
                })
            elif url.path == "/image":
                relative = unquote(url.query.split("path=", 1)[-1])
                target = os.path.abspath(os.path.join(rater.out_dir, relative))
                if os.path.commonpath([rater.out_dir, target]) != rater.out_dir or not os.path.exists(target):
                    self._send({"error": "not found"}, status=404)
                    return
                with open(target, "rb") as handle:
                    self._send(handle.read(), "image/png")
            else:
                self._send({"error": "not found"}, status=404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            try:
                request = json.loads(self.rfile.read(length))
                if self.path == "/vote":
                    rater.set(request["id"], request.get("choice"))
                elif self.path == "/skip":
                    rater.skip(request["id"])
                else:
                    self._send({"error": "not found"}, status=404)
                    return
                self._send({"ok": True, "rated": rater.rated_count, "skipped": len(rater.skipped)})
            except (KeyError, ValueError, json.JSONDecodeError) as error:
                self._send({"error": str(error)}, status=400)

    return Handler


def summarize(pairs):
    return {
        "pair_types": dict(sorted(Counter(pair["pair_type"] for pair in pairs).items())),
        "left_strata": dict(sorted(Counter(
            pair["left"].get("camera_stratum", "ground") for pair in pairs
        ).items())),
        "right_strata": dict(sorted(Counter(
            pair["right"].get("camera_stratum", "ground") for pair in pairs
        ).items())),
        "scene_families": dict(sorted(Counter(
            pair["left"].get("scene_family", "legacy") for pair in pairs
        ).items())),
        "subject_archetypes": dict(sorted(Counter(
            frame.get("subject_archetype")
            for pair in pairs for frame in (pair["left"], pair["right"])
            if frame.get("subject_archetype")
        ).items())),
        "subject_scenarios": dict(sorted(Counter(
            frame.get("subject_scenario")
            for pair in pairs for frame in (pair["left"], pair["right"])
            if frame.get("subject_scenario")
        ).items())),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8778)
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    parser.add_argument("--run", required=True, help="use frames from one run directory")
    parser.add_argument("--session", required=True, help="durable comparison session name")
    parser.add_argument("--session-size", type=int, default=40)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--profile",
        choices=("height", "gamut", "window-validation", "subject-validation"),
        default="height",
    )
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    frames = collect_frames(out_dir, args.run)
    if not frames:
        raise SystemExit(f"no frames in run {args.run}")
    try:
        pairs, path, created = load_or_create_session(
            out_dir, args.session, frames, args.session_size, args.seed, args.profile
        )
    except ValueError as error:
        raise SystemExit(str(error)) from error
    rater = ComparisonRater(out_dir, pairs)
    print(f"{'created' if created else 'loaded'} comparison session: {path}")
    print(f"{len(pairs)} pairs, {rater.rated_count} already compared")
    print(json.dumps(summarize(pairs), indent=2))
    print(f"open http://127.0.0.1:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(rater)).serve_forever()


if __name__ == "__main__":
    main()
