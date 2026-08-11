#!/usr/bin/env python3
"""Fit the reward model to out/ratings.json.

    python3 tools/hopper/train_reward.py

Needs the scorer running with --clip: embeddings come from it, so there is
only ever one copy of CLIP in memory. Writes out/reward-model.json, which the
scorer picks up on its next start.
"""

import argparse
import base64
import json
import os
import urllib.request

import numpy as np

from reward_model import RewardModel

HERE = os.path.dirname(os.path.abspath(__file__))


def embed(scorer, path):
    with open(path, "rb") as handle:
        payload = json.dumps({"png_b64": base64.b64encode(handle.read()).decode()}).encode()
    request = urllib.request.Request(
        f"{scorer}/embed", payload, {"Content-Type": "application/json"}
    )
    body = json.loads(urllib.request.urlopen(request).read())
    if "error" in body:
        raise SystemExit(f"scorer: {body['error']}")
    return body["embedding"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    parser.add_argument("--scorer", default="http://127.0.0.1:8777")
    parser.add_argument("--alpha", type=float, default=1.0, help="ridge penalty")
    args = parser.parse_args()

    ratings_path = os.path.join(args.out, "ratings.json")
    if not os.path.exists(ratings_path):
        raise SystemExit(f"no ratings at {ratings_path} -- run rate.py first")
    with open(ratings_path) as handle:
        ratings = json.load(handle)
    if len(ratings) < 30:
        raise SystemExit(f"only {len(ratings)} ratings; 150+ is where this starts to work")

    embeddings, targets = [], []
    for index, (relative, rating) in enumerate(sorted(ratings.items())):
        path = os.path.join(args.out, relative)
        if not os.path.exists(path):
            continue
        embeddings.append(embed(args.scorer, path))
        targets.append(rating)
        if (index + 1) % 50 == 0:
            print(f"embedded {index + 1}/{len(ratings)}", flush=True)

    model = RewardModel.fit(np.array(embeddings), np.array(targets), alpha=args.alpha)
    destination = os.path.join(args.out, "reward-model.json")
    model.save(destination)
    print(f"\n{model.describe()}")
    print(f"written to {destination} -- restart the scorer to use it")
    if not np.isnan(model.holdout_r) and model.holdout_r < 0.4:
        print("holdout correlation is weak: rate more frames, or more consistently")


if __name__ == "__main__":
    main()
