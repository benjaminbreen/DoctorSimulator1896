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

state = {
    "weights": {},
    "clip": None,
    "reward_model": None,
    "pairwise_model": None,
    "taste_zones": [],
    "unseen_taste_scale": 0.35,
}


def load_weights(path):
    with open(path) as handle:
        return {k: v for k, v in json.load(handle).items() if not k.startswith("_")}


def score_image(png_bytes, probe, context=None, embedding=None):
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    scale = ANALYSIS_WIDTH / image.width
    small = image.resize((ANALYSIS_WIDTH, max(1, round(image.height * scale))), Image.LANCZOS)
    pixels = np.asarray(small, dtype=np.float32) / 255.0
    parts = pixel_metrics(pixels)
    parts.update(probe_metrics(probe))
    if state["clip"]:
        if embedding is None:
            embedding = state["clip"].embed(image)
        parts["clip"] = state["clip"].score_embedding(embedding)
        if state["reward_model"]:
            if state["pairwise_model"]:
                parts["taste"] = state["pairwise_model"].score(embedding, state["reward_model"])
            else:
                parts["taste"] = state["reward_model"].score(embedding)

    weights = state["weights"]
    used = {k: weights[k] for k in parts if k in weights}
    zone = (context or {}).get("zone")
    if "taste" in used and (not zone or zone not in state["taste_zones"]):
        # A strong office-only taste model should help bootstrap a new zone,
        # not overrule its CLIP and composition scores before it has examples.
        used["taste"] *= state["unseen_taste_scale"]
    total_weight = sum(used.values())
    total = sum(parts[k] * w for k, w in used.items()) / total_weight if total_weight else 0.0
    luminance = pixels @ np.array([0.2126, 0.7152, 0.0722])
    black_fraction = float(np.mean(luminance < 0.015))
    white_fraction = float(np.mean(luminance > 0.985))
    # A narrow nocturne can contain real black, and a sunlit wall can contain
    # real white. When either consumes most of the frame, though, the search
    # has usually parked behind a roof slab or blown out a lobby rather than
    # discovered a composition.
    valid = (
        parts.get("tonal_range", 0) > 0.02
        and float(np.percentile(luminance, 95)) > 0.08
        and black_fraction < 0.55
        and white_fraction < 0.55
    )
    parts["black_fraction"] = black_fraction
    parts["white_fraction"] = white_fraction
    return {
        "total": round(float(total), 5),
        "valid": bool(valid),
        "parts": {k: round(float(v), 4) for k, v in parts.items()},
    }


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
                "taste_zones": state["taste_zones"],
                "pairwise": state["pairwise_model"].describe() if state["pairwise_model"] else None,
                "unseen_taste_scale": state["unseen_taste_scale"],
            })
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            request = json.loads(self.rfile.read(length))
            png = base64.b64decode(request["png_b64"])
            if self.path.startswith("/score"):
                self._send(score_image(png, request.get("probe"), request.get("context")))
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
    parser.add_argument(
        "--pairwise-model",
        default=os.path.join(HERE, "out", "pairwise-adapter.json"),
        help="optional conservative A/B adapter layered over the scalar reward model",
    )
    parser.add_argument(
        "--unseen-taste-scale",
        type=float,
        default=0.35,
        help="taste-weight multiplier outside the reward model's training zones",
    )
    args = parser.parse_args()

    state["weights"] = load_weights(args.weights)
    state["unseen_taste_scale"] = max(0.0, min(1.0, args.unseen_taste_scale))
    if args.clip:
        from clip_scorer import ClipScorer

        print("loading CLIP...", flush=True)
        os.makedirs(os.path.dirname(args.clip_calibration), exist_ok=True)
        state["clip"] = ClipScorer(args.references, calibration_path=args.clip_calibration)
        print(f"CLIP target: {state['clip'].source}", flush=True)
        if os.path.exists(args.reward_model):
            from reward_model import RewardModel

            state["reward_model"] = RewardModel.load(args.reward_model)
            state["taste_zones"] = state["reward_model"].training_zones
            # The original 182-rating model predates coverage metadata and all
            # of its surviving labels belong to the consulting office.
            if not state["taste_zones"] and state["reward_model"].samples == 182:
                state["taste_zones"] = ["consulting-office"]
            print(f"reward model: {state['reward_model'].describe()}", flush=True)
            print(f"full taste weight in: {', '.join(state['taste_zones']) or 'no zones yet'}", flush=True)
            if os.path.exists(args.pairwise_model):
                from pairwise_adapter import PairwiseAdapter

                adapter = PairwiseAdapter.load(args.pairwise_model)
                if adapter.compatible(state["reward_model"]):
                    state["pairwise_model"] = adapter
                    print(f"pairwise adapter: {adapter.describe()}", flush=True)
                else:
                    print("pairwise adapter ignored: scalar reward model has changed", flush=True)
    else:
        state["weights"].pop("clip", None)
    if not state.get("reward_model"):
        state["weights"].pop("taste", None)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"scorer on http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if state["clip"]:
            state["clip"].save_calibration()


if __name__ == "__main__":
    main()
