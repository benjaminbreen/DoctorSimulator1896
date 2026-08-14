#!/usr/bin/env python3
"""Rate a balanced session of frames so the reward learns your Hopper taste.

    python3 tools/hopper/rate.py --run mixed-pilot --session pilot-30 --session-size 30

The session builder balances zones, named time bands, lighting vibes, score
levels and shot families. Automatic scores and vibe labels are deliberately
hidden while rating. All ratings still accumulate in out/ratings.json, keyed
by the original frame path.
"""

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import glob
import json
import os
import random
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
TIME_BANDS = [
    ("dawn", 5.5, 7.25),
    ("morning", 7.25, 10.5),
    ("midday", 10.5, 14.5),
    ("afternoon", 14.5, 17.25),
    ("sunset", 17.25, 19.5),
    ("evening", 19.5, 22.25),
]
SCORE_QUANTILES = [0.85, 0.50, 0.15, 0.70, 0.30]

PAGE = """<!doctype html>
<meta charset="utf-8"><title>Hopper ratings</title>
<style>
  body { margin:0; background:#111; color:#bbb; font:13px/1.5 ui-sans-serif,system-ui;
         display:flex; flex-direction:column; height:100vh; }
  header { display:flex; gap:1.5rem; align-items:baseline; padding:.6rem 1rem; }
  h1 { font-size:13px; font-weight:600; color:#eee; margin:0; }
  main { flex:1; display:grid; place-items:center; min-height:0; padding:0 1rem; }
  img { max-width:100%; max-height:100%; object-fit:contain; }
  footer { padding:.8rem 1rem; display:flex; gap:.5rem; align-items:center; }
  button { background:#222; color:#ddd; border:1px solid #333; border-radius:4px;
           padding:.5rem .9rem; font:inherit; cursor:pointer; }
  button:hover { background:#2c2c2c; }
  .key { color:#666; }
  .meta { color:#777; font-variant-numeric:tabular-nums; }
</style>
<header>
  <h1>How Hopper is this?</h1>
  <span class="meta" id="stats"></span>
  <span class="key">1 not at all &middot; 5 very &middot; u undo &middot; s skip</span>
</header>
<main><img id="frame" alt="Game composition to rate"></main>
<footer id="buttons"></footer>
<script>
let current = null, previous = null;

async function next() {
  const res = await fetch('/next');
  current = await res.json();
  if (current.done) {
    document.getElementById('frame').removeAttribute('src');
    document.getElementById('stats').textContent =
      `complete · ${current.rated} rated${current.skipped ? ` · ${current.skipped} skipped` : ''}`;
    return;
  }
  document.getElementById('frame').src = '/frame?path=' + encodeURIComponent(current.path);
  const hour = Number.isFinite(current.time) ? ` · ${current.time.toFixed(1)}h` : '';
  document.getElementById('stats').textContent =
    `${current.position}/${current.total} · ${current.zone} · ${current.time_band}${hour}`;
}

async function rate(value) {
  if (!current || current.done) return;
  previous = current.path;
  await fetch('/rate', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ path: current.path, rating: value }) });
  next();
}

async function skip() {
  if (!current || current.done) return;
  await fetch('/skip', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ path: current.path }) });
  next();
}

async function undo() {
  if (!previous) return;
  await fetch('/rate', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ path: previous, rating: null }) });
  previous = null;
  next();
}

const labels = ['1 no', '2', '3', '4', '5 yes'];
labels.forEach((label, index) => {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = () => rate(index + 1);
  document.getElementById('buttons').append(button);
});
const undoButton = document.createElement('button');
undoButton.textContent = 'undo';
undoButton.onclick = undo;
document.getElementById('buttons').append(undoButton);
const skipButton = document.createElement('button');
skipButton.textContent = 'skip';
skipButton.onclick = skip;
document.getElementById('buttons').append(skipButton);

addEventListener('keydown', (event) => {
  if (event.key >= '1' && event.key <= '5') rate(Number(event.key));
  else if (event.key === 'u') undo();
  else if (event.key === 's') skip();
});
next();
</script>
"""


def time_band_for_hour(hour):
    try:
        value = float(hour)
    except (TypeError, ValueError):
        return "other"
    for name, low, high in TIME_BANDS:
        if low <= value < high:
            return name
    return "other"


def collect_frames(out_dir, run_filter=None):
    """Every logged frame with the metadata needed for balanced selection."""
    frames = []
    for log_path in sorted(glob.glob(os.path.join(out_dir, "*", "all.jsonl"))):
        run_dir = os.path.dirname(log_path)
        run = os.path.basename(run_dir)
        if run_filter and run != run_filter:
            continue
        fallback_zone = run.split("-seed")[0]
        with open(log_path) as handle:
            for line in handle:
                entry = json.loads(line)
                if not entry.get("frame"):
                    continue
                if entry.get("valid") is False:
                    continue
                absolute = os.path.join(run_dir, entry["frame"])
                if not os.path.exists(absolute):
                    continue
                shot = entry.get("shot") or {}
                meta = shot.get("meta") or {}
                time = (shot.get("tuning") or {}).get("timeOfDay")
                frames.append({
                    "path": os.path.relpath(absolute, out_dir),
                    "run": run,
                    "auto": float(entry.get("total", 0)),
                    "zone": entry.get("zone", fallback_zone),
                    "time": float(time) if time is not None else None,
                    "time_band": entry.get("timeBand") or meta.get("timeBand") or time_band_for_hour(time),
                    "composition": entry.get("composition") or meta.get("composition") or "other",
                    "vibe": entry.get("vibe") or meta.get("vibe") or "legacy",
                    "camera_stratum": entry.get("cameraStratum") or meta.get("cameraStratum") or "ground",
                    "shadow_family": entry.get("shadowFamily") or meta.get("shadowFamily") or "profile",
                    "sun_azimuth_sector": entry.get("sunAzimuthSector") or meta.get("sunAzimuthSector") or "physical",
                    "scene_family": entry.get("sceneFamily") or meta.get("sceneFamily") or "legacy",
                })
    return frames


def select_diverse_frames(frames, size, seed=0, excluded=None):
    """Greedy balance over zone/time, with varied score and composition levels."""
    excluded = set(excluded or [])
    candidates = [frame for frame in frames if frame["path"] not in excluded]
    if len(candidates) < size:
        raise ValueError(f"only {len(candidates)} unrated frames available for a {size}-frame session")

    groups = defaultdict(list)
    for frame in candidates:
        groups[(frame["zone"], frame["time_band"])].append(frame)
    for pool in groups.values():
        pool.sort(key=lambda frame: (frame["auto"], frame["path"]))

    rng = random.Random(seed)
    tie_order = {key: rng.random() for key in groups}
    zone_counts = Counter()
    time_counts = Counter()
    pair_counts = Counter()
    composition_counts = Counter()
    vibe_counts = Counter()
    vibe_total = len({frame["vibe"] for frame in candidates})
    composition_total = len({frame["composition"] for frame in candidates})
    vibe_cap = (size + vibe_total - 1) // max(1, vibe_total)
    composition_cap = (size + composition_total - 1) // max(1, composition_total)
    selected = []

    while len(selected) < size:
        available = [key for key, pool in groups.items() if pool]
        if not available:
            break
        key = min(available, key=lambda item: (
            time_counts[item[1]],
            zone_counts[item[0]],
            min(vibe_counts[frame["vibe"]] for frame in groups[item]),
            pair_counts[item],
            tie_order[item],
        ))
        pool = groups[key]
        quantile = SCORE_QUANTILES[pair_counts[key] % len(SCORE_QUANTILES)]
        target = quantile * max(0, len(pool) - 1)
        rankable = [
            (index, frame) for index, frame in enumerate(pool)
            if vibe_counts[frame["vibe"]] < vibe_cap
            and composition_counts[frame["composition"]] < composition_cap
        ]
        if not rankable:
            rankable = list(enumerate(pool))
        ranked = sorted(
            rankable,
            key=lambda item: (
                vibe_counts[item[1]["vibe"]],
                composition_counts[item[1]["composition"]],
                abs(item[0] - target),
                item[1]["path"],
            ),
        )
        pool_index, chosen = ranked[0]
        pool.pop(pool_index)
        selected.append(chosen)
        zone_counts[chosen["zone"]] += 1
        time_counts[chosen["time_band"]] += 1
        pair_counts[key] += 1
        composition_counts[chosen["composition"]] += 1
        vibe_counts[chosen["vibe"]] += 1

    if len(selected) != size:
        raise ValueError(f"could only select {len(selected)} of {size} requested frames")
    return selected


def session_path(out_dir, name):
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-.")
    if not safe:
        raise ValueError("session name must contain a letter or number")
    return os.path.join(out_dir, "rating-sessions", f"{safe}.json")


def load_or_create_session(out_dir, name, frames, size, seed, ratings):
    path = session_path(out_dir, name)
    if os.path.exists(path):
        with open(path) as handle:
            saved = json.load(handle)
        return saved["frames"], path, False
    if size <= 0:
        raise ValueError("a new named session needs --session-size")
    selected = select_diverse_frames(frames, size, seed=seed, excluded=ratings)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as handle:
        json.dump({
            "version": 2,
            "created": datetime.now(timezone.utc).isoformat(),
            "seed": seed,
            "frames": selected,
        }, handle, indent=2)
    return selected, path, True


class Rater:
    def __init__(self, out_dir, frames):
        self.out_dir = out_dir
        self.frames = list(frames)
        self.ratings_path = os.path.join(out_dir, "ratings.json")
        self.ratings = {}
        self.skipped = set()
        if os.path.exists(self.ratings_path):
            with open(self.ratings_path) as handle:
                self.ratings = json.load(handle)

    @property
    def rated_count(self):
        return sum(frame["path"] in self.ratings for frame in self.frames)

    def pick(self):
        for index, frame in enumerate(self.frames):
            if frame["path"] not in self.ratings and frame["path"] not in self.skipped:
                return {
                    **frame,
                    "position": index + 1,
                    "rated": self.rated_count,
                    "skipped": len(self.skipped),
                    "total": len(self.frames),
                }
        return None

    def set(self, path, rating):
        if rating is None:
            self.ratings.pop(path, None)
        elif rating in (1, 2, 3, 4, 5):
            self.ratings[path] = rating
            self.skipped.discard(path)
        else:
            raise ValueError("rating must be 1 through 5")
        with open(self.ratings_path, "w") as handle:
            json.dump(self.ratings, handle, indent=1)

    def skip(self, path):
        if any(frame["path"] == path for frame in self.frames):
            self.skipped.add(path)


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
                frame = rater.pick()
                if frame:
                    self._send(frame)
                else:
                    self._send({"done": True, "rated": rater.rated_count, "skipped": len(rater.skipped)})
            elif url.path == "/frame":
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
                if self.path == "/rate":
                    rater.set(request["path"], request.get("rating"))
                elif self.path == "/skip":
                    rater.skip(request["path"])
                else:
                    self._send({"error": "not found"}, status=404)
                    return
                self._send({"ok": True, "rated": rater.rated_count, "skipped": len(rater.skipped)})
            except (KeyError, ValueError, json.JSONDecodeError) as error:
                self._send({"error": str(error)}, status=400)

    return Handler


def summarize(frames):
    return {
        "zones": dict(sorted(Counter(frame["zone"] for frame in frames).items())),
        "times": dict(sorted(Counter(frame["time_band"] for frame in frames).items())),
        "vibes": dict(sorted(Counter(frame.get("vibe", "legacy") for frame in frames).items())),
        "compositions": dict(sorted(Counter(frame["composition"] for frame in frames).items())),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8778)
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    parser.add_argument("--run", help="use frames from one run directory")
    parser.add_argument("--session", help="load or create a durable named rating session")
    parser.add_argument("--session-size", type=int, default=0)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    frames = collect_frames(out_dir, args.run)
    if not frames:
        raise SystemExit(f"no frames in {args.out} -- run a search first")
    ratings_path = os.path.join(out_dir, "ratings.json")
    ratings = {}
    if os.path.exists(ratings_path):
        with open(ratings_path) as handle:
            ratings = json.load(handle)

    if args.session:
        try:
            frames, path, created = load_or_create_session(
                out_dir, args.session, frames, args.session_size, args.seed, ratings
            )
        except ValueError as error:
            raise SystemExit(str(error)) from error
        print(f"{'created' if created else 'loaded'} session: {path}")
    elif args.session_size:
        frames = select_diverse_frames(frames, args.session_size, seed=args.seed, excluded=ratings)

    rater = Rater(out_dir, frames)
    print(f"{len(frames)} frames in pass, {rater.rated_count} already rated")
    print(json.dumps(summarize(frames), indent=2))
    print(f"open http://127.0.0.1:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(rater)).serve_forever()


if __name__ == "__main__":
    main()
