#!/usr/bin/env python3
"""Score a captured gamut after Chrome/WebGL has exited.

The ordinary search scores live frames and therefore holds the game renderer
and CLIP in memory together. This offline pass deliberately loads only CLIP,
updates the shared embedding cache, rewrites the durable log with scores, and
exits so its neural-network memory is returned before the rating UI opens.
"""

import argparse
from collections import Counter
import json
import os
import tempfile

import numpy as np

from clip_scorer import ClipScorer
from pairwise_adapter import PairwiseAdapter
from reward_model import RewardModel
from score_server import load_weights, score_image, state
from train_reward import load_embedding_cache, save_embedding_cache

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    parser.add_argument("--weights", default=os.path.join(HERE, "weights.json"))
    parser.add_argument("--references", default=os.path.join(HERE, "references"))
    parser.add_argument("--reward-model", default=None)
    parser.add_argument("--pairwise-model", default=None)
    parser.add_argument("--cache", default=None)
    parser.add_argument("--clip-calibration", default=None)
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    run_dir = os.path.join(out_dir, args.run)
    log_path = os.path.join(run_dir, "all.jsonl")
    if not os.path.exists(log_path):
        raise SystemExit(f"no captured log at {log_path}")
    with open(log_path) as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    if not rows:
        raise SystemExit("captured log is empty")

    cache_path = args.cache or os.path.join(out_dir, ".embedding-cache-v2.npz")
    calibration_path = args.clip_calibration or os.path.join(out_dir, "clip-calibration.json")
    reward_path = args.reward_model or os.path.join(out_dir, "reward-model.json")
    pairwise_path = args.pairwise_model or os.path.join(out_dir, "pairwise-adapter.json")
    cache = load_embedding_cache(cache_path)
    state["weights"] = load_weights(args.weights)
    state["clip"] = ClipScorer(args.references, calibration_path=calibration_path)
    state["reward_model"] = RewardModel.load(reward_path) if os.path.exists(reward_path) else None
    state["pairwise_model"] = None
    if state["reward_model"] and os.path.exists(pairwise_path):
        candidate = PairwiseAdapter.load(pairwise_path)
        if candidate.compatible(state["reward_model"]):
            state["pairwise_model"] = candidate
    state["taste_zones"] = state["reward_model"].training_zones if state["reward_model"] else []
    print(f"CLIP target: {state['clip'].source}", flush=True)
    if state["reward_model"]:
        print(f"reward model: {state['reward_model'].describe()}", flush=True)
    if state["pairwise_model"]:
        print(f"pairwise adapter: {state['pairwise_model'].describe()}", flush=True)

    scored = []
    new_embeddings = 0
    for index, row in enumerate(sorted(rows, key=lambda entry: entry.get("sampleIndex", 0))):
        relative = os.path.join(args.run, row["frame"])
        image_path = os.path.join(out_dir, relative)
        stat = os.stat(image_path)
        stamp = f"{stat.st_size}:{stat.st_mtime_ns}"
        cached = cache.get(relative)
        if cached and cached[0] == stamp:
            embedding = cached[1]
        else:
            from PIL import Image

            with Image.open(image_path) as image:
                embedding = state["clip"].embed(image.convert("RGB"))
            cache[relative] = (stamp, np.asarray(embedding, dtype=np.float32))
            new_embeddings += 1
        with open(image_path, "rb") as handle:
            result = score_image(
                handle.read(),
                row.get("probe"),
                {
                    "zone": row.get("zone"),
                    "sceneFamily": row.get("sceneFamily"),
                    "timeBand": row.get("timeBand"),
                    "vibe": row.get("vibe"),
                    "cameraStratum": row.get("cameraStratum"),
                    "shadowFamily": row.get("shadowFamily"),
                    "sunAzimuthSector": row.get("sunAzimuthSector"),
                },
                embedding=embedding,
            )
        scored.append({**row, **result})
        print(
            f"{index + 1}/{len(rows)} {row.get('sceneFamily')} "
            f"{'valid' if result['valid'] else 'rejected'} {result['total']:.3f}",
            flush=True,
        )

    save_embedding_cache(cache_path, cache)
    state["clip"].save_calibration()
    descriptor, temporary = tempfile.mkstemp(prefix="all-", suffix=".jsonl", dir=run_dir)
    try:
        with os.fdopen(descriptor, "w") as handle:
            for row in scored:
                handle.write(json.dumps(row) + "\n")
        os.replace(temporary, log_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

    valid = [row for row in scored if row["valid"]]
    print(f"\nscored {len(scored)} frames; {len(valid)} valid; {new_embeddings} new embeddings")
    print("valid by family:", dict(sorted(Counter(row["sceneFamily"] for row in valid).items())))


if __name__ == "__main__":
    main()
