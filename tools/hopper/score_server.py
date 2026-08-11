#!/usr/bin/env python3
"""Scoring service for the Hopper shot search.

POST /score  {"png_b64": "...", "probe": {...}}  ->  {"total": 0.63, "parts": {...}}
GET  /health                                     ->  what is loaded

Run it with --clip to add the CLIP term (needs open_clip_torch installed and,
ideally, reference paintings in tools/hopper/references/).
"""

import argparse
import base64
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from metrics import pixel_metrics, probe_metrics  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ANALYSIS_WIDTH = 384

state = {"weights": {}, "clip": None, "reward_model": None}


def load_weights(path):
    with open(path) as handle:
        return {k: v for k, v in json.load(handle).items() if not k.startswith("_")}


def score_image(png_bytes, probe):
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    scale = ANALYSIS_WIDTH / image.width
    small = image.resize((ANALYSIS_WIDTH, max(1, round(image.height * scale))), Image.LANCZOS)
    parts = pixel_metrics(np.asarray(small, dtype=np.float32) / 255.0)
    parts.update(probe_metrics(probe))
    if state["clip"]:
        embedding = state["clip"].embed(image)
        parts["clip"] = state["clip"].score_embedding(embedding)
        if state["reward_model"]:
            parts["taste"] = state["reward_model"].score(embedding)

    weights = state["weights"]
    used = {k: weights[k] for k in parts if k in weights}
    total_weight = sum(used.values())
    total = sum(parts[k] * w for k, w in used.items()) / total_weight if total_weight else 0.0
    return {"total": round(float(total), 5), "parts": {k: round(float(v), 4) for k, v in parts.items()}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/health"):
            clip = state["clip"]
            self._send({
                "ok": True,
                "clip": clip.status() if clip else None,
                "weights": state["weights"],
            })
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            request = json.loads(self.rfile.read(length))
            png = base64.b64decode(request["png_b64"])
            if self.path.startswith("/score"):
                self._send(score_image(png, request.get("probe")))
            elif self.path.startswith("/embed"):
                # The reward-model trainer borrows the already-loaded CLIP
                # rather than starting a second copy.
                if not state["clip"]:
                    self._send({"error": "scorer running without --clip"}, 400)
                    return
                image = Image.open(io.BytesIO(png)).convert("RGB")
                self._send({"embedding": state["clip"].embed(image).tolist()})
            else:
                self._send({"error": "not found"}, 404)
        except Exception as error:  # noqa: BLE001 - report and keep serving
            self._send({"error": f"{type(error).__name__}: {error}"}, 500)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8777)
    parser.add_argument("--weights", default=os.path.join(HERE, "weights.json"))
    parser.add_argument("--clip", action="store_true", help="add the CLIP similarity term")
    parser.add_argument("--references", default=os.path.join(HERE, "references"))
    parser.add_argument(
        "--clip-calibration",
        default=os.path.join(HERE, "out", "clip-calibration.json"),
        help="carry the CLIP score calibration between runs so totals stay comparable",
    )
    parser.add_argument("--reward-model", default=os.path.join(HERE, "out", "reward-model.json"))
    args = parser.parse_args()

    state["weights"] = load_weights(args.weights)
    if args.clip:
        from clip_scorer import ClipScorer

        print("loading CLIP...", flush=True)
        os.makedirs(os.path.dirname(args.clip_calibration), exist_ok=True)
        state["clip"] = ClipScorer(args.references, calibration_path=args.clip_calibration)
        print(f"CLIP target: {state['clip'].source}", flush=True)
        if os.path.exists(args.reward_model):
            from reward_model import RewardModel

            state["reward_model"] = RewardModel.load(args.reward_model)
            print(f"reward model: {state['reward_model'].describe()}", flush=True)
    else:
        state["weights"].pop("clip", None)
    if not state.get("reward_model"):
        state["weights"].pop("taste", None)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"scorer on http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        if state["clip"]:
            state["clip"].save_calibration()


if __name__ == "__main__":
    main()
