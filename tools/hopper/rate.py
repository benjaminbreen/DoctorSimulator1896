#!/usr/bin/env python3
"""Rate frames 1-5 so the reward can learn what you mean by Hopper.

    python3 tools/hopper/rate.py          # then open http://127.0.0.1:8778

Frames are drawn from every run in out/, stratified across the automatic
score so you rate the bottom of the range as well as the top -- a model
trained only on winners cannot tell you which way is up.

Ratings live in out/ratings.json, keyed by frame path, and survive re-runs.
Feed them to train_reward.py when you have a couple of hundred.
"""

import argparse
import glob
import json
import os
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
BUCKETS = 5

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
  .meta { color:#666; font-variant-numeric:tabular-nums; }
</style>
<header>
  <h1>How Hopper is this?</h1>
  <span class="meta" id="stats"></span>
  <span class="key">1 not at all &middot; 5 very &middot; u undo &middot; s skip</span>
</header>
<main><img id="frame" alt=""></main>
<footer id="buttons"></footer>
<script>
let current = null, previous = null;

async function next() {
  const res = await fetch('/next');
  current = await res.json();
  if (current.done) {
    document.getElementById('frame').removeAttribute('src');
    document.getElementById('stats').textContent = 'nothing left to rate';
    return;
  }
  document.getElementById('frame').src = '/frame?path=' + encodeURIComponent(current.path);
  document.getElementById('stats').textContent =
    `${current.rated} rated of ${current.total} · ${current.zone} · auto ${current.auto.toFixed(3)}`;
}

async function rate(value) {
  if (!current || current.done) return;
  previous = current.path;
  await fetch('/rate', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ path: current.path, rating: value }) });
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

addEventListener('keydown', (event) => {
  if (event.key >= '1' && event.key <= '5') rate(Number(event.key));
  else if (event.key === 'u') undo();
  else if (event.key === 's') next();
});
next();
</script>
"""


def collect_frames(out_dir):
    """Every logged frame with its automatic score and zone, across all runs."""
    frames = []
    for log_path in glob.glob(os.path.join(out_dir, "*", "all.jsonl")):
        run_dir = os.path.dirname(log_path)
        with open(log_path) as handle:
            for line in handle:
                entry = json.loads(line)
                if not entry.get("frame"):
                    continue
                absolute = os.path.join(run_dir, entry["frame"])
                if os.path.exists(absolute):
                    frames.append({
                        "path": os.path.relpath(absolute, out_dir),
                        "auto": entry["total"],
                        # Runs from before multi-zone search carry no zone.
                        "zone": entry.get("zone", os.path.basename(run_dir).split("-seed")[0]),
                    })
    frames.sort(key=lambda f: f["auto"])
    return frames


class Rater:
    def __init__(self, out_dir):
        self.out_dir = out_dir
        self.ratings_path = os.path.join(out_dir, "ratings.json")
        self.ratings = {}
        if os.path.exists(self.ratings_path):
            with open(self.ratings_path) as handle:
                self.ratings = json.load(handle)
        self.frames = collect_frames(out_dir)
        self.random = random.Random(0)

    def pick(self):
        unrated = [f for f in self.frames if f["path"] not in self.ratings]
        if not unrated:
            return None
        # Round-robin over zones first, then over score bands within the zone.
        # Without the zone pass, a space the automatic score dislikes -- the
        # park, which the reward barely understands -- never comes up.
        zones = sorted({f["zone"] for f in unrated})
        pool = [f for f in unrated if f["zone"] == zones[len(self.ratings) % len(zones)]]
        size = max(1, len(pool) // BUCKETS)
        bands = [b for b in (pool[i * size:(i + 1) * size] for i in range(BUCKETS)) if b]
        return self.random.choice(bands[(len(self.ratings) // len(zones)) % len(bands)])

    def set(self, path, rating):
        if rating is None:
            self.ratings.pop(path, None)
        else:
            self.ratings[path] = rating
        with open(self.ratings_path, "w") as handle:
            json.dump(self.ratings, handle, indent=1)


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
                if not frame:
                    self._send({"done": True})
                else:
                    self._send({**frame, "rated": len(rater.ratings), "total": len(rater.frames)})
            elif url.path == "/frame":
                relative = url.query.split("path=", 1)[-1]
                from urllib.parse import unquote

                target = os.path.normpath(os.path.join(rater.out_dir, unquote(relative)))
                if not target.startswith(rater.out_dir) or not os.path.exists(target):
                    self._send({"error": "not found"}, status=404)
                    return
                with open(target, "rb") as handle:
                    self._send(handle.read(), "image/png")
            else:
                self._send({"error": "not found"}, status=404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            request = json.loads(self.rfile.read(length))
            rater.set(request["path"], request.get("rating"))
            self._send({"ok": True, "rated": len(rater.ratings)})

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8778)
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    args = parser.parse_args()

    rater = Rater(os.path.abspath(args.out))
    if not rater.frames:
        print(f"no frames in {args.out} -- run a search first")
        return
    print(f"{len(rater.frames)} frames, {len(rater.ratings)} already rated")
    print(f"open http://127.0.0.1:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(rater)).serve_forever()


if __name__ == "__main__":
    main()
