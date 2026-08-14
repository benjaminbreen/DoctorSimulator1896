#!/usr/bin/env python3
"""Fit the reward model to out/ratings.json.

    python3 tools/hopper/train_reward.py

Needs the scorer running with --clip: embeddings come from it, so there is
only ever one copy of CLIP in memory. Writes out/reward-model.json, which the
scorer picks up on its next start.
"""

import argparse
import base64
import glob
import json
import os
import urllib.request

import numpy as np

from reward_model import RewardModel

HERE = os.path.dirname(os.path.abspath(__file__))


def frame_index(out_dir):
    index = {}
    for log_path in glob.glob(os.path.join(out_dir, "*", "all.jsonl")):
        run_dir = os.path.dirname(log_path)
        fallback = os.path.basename(run_dir).split("-seed")[0]
        with open(log_path) as handle:
            for line in handle:
                entry = json.loads(line)
                if not entry.get("frame"):
                    continue
                relative = os.path.relpath(os.path.join(run_dir, entry["frame"]), out_dir)
                index[relative] = {
                    "zone": entry.get("zone", fallback),
                    "timeBand": entry.get("timeBand") or entry.get("shot", {}).get("meta", {}).get("timeBand"),
                }
    return index


def load_embedding_cache(path):
    if not os.path.exists(path):
        return {}
    saved = np.load(path, allow_pickle=False)
    required = {"paths", "stamps", "embeddings"}
    if not required.issubset(saved.files):
        return {}
    return {
        str(relative): (str(stamp), embedding)
        for relative, stamp, embedding in zip(saved["paths"], saved["stamps"], saved["embeddings"])
    }


def load_exclusions(path):
    """Paths kept as raw ratings but omitted from model fitting."""
    if not os.path.exists(path):
        return set()
    with open(path) as handle:
        saved = json.load(handle)
    paths = saved.get("paths", saved) if isinstance(saved, dict) else saved
    return set(paths)


def save_embedding_cache(path, cache):
    rows = sorted(cache.items())
    if not rows:
        return
    np.savez_compressed(
        path,
        paths=np.asarray([relative for relative, _ in rows]),
        stamps=np.asarray([value[0] for _, value in rows]),
        embeddings=np.asarray([value[1] for _, value in rows], dtype=np.float32),
    )


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
    parser.add_argument("--cache", default=None, help="embedding cache (defaults inside out/)")
    parser.add_argument(
        "--exclusions",
        default=None,
        help="rated paths to preserve but omit from training (defaults inside out/)",
    )
    args = parser.parse_args()

    ratings_path = os.path.join(args.out, "ratings.json")
    if not os.path.exists(ratings_path):
        raise SystemExit(f"no ratings at {ratings_path} -- run rate.py first")
    with open(ratings_path) as handle:
        ratings = json.load(handle)
    exclusions_path = args.exclusions or os.path.join(args.out, "rating-exclusions.json")
    exclusions = load_exclusions(exclusions_path)
    eligible_ratings = {
        relative: rating for relative, rating in ratings.items() if relative not in exclusions
    }
    if len(eligible_ratings) < 30:
        raise SystemExit(
            f"only {len(eligible_ratings)} eligible ratings; 150+ is where this starts to work"
        )
    if exclusions:
        print(f"excluding {len(ratings) - len(eligible_ratings)} flagged ratings", flush=True)

    metadata = frame_index(args.out)
    cache_path = args.cache or os.path.join(args.out, ".embedding-cache-v2.npz")
    cache = load_embedding_cache(cache_path)
    embeddings, targets, zones = [], [], []
    embedded = 0
    for index, (relative, rating) in enumerate(sorted(eligible_ratings.items())):
        path = os.path.join(args.out, relative)
        if not os.path.exists(path):
            continue
        stat = os.stat(path)
        stamp = f"{stat.st_size}:{stat.st_mtime_ns}"
        cached = cache.get(relative)
        if cached and cached[0] == stamp:
            embedding = cached[1]
        else:
            embedding = np.asarray(embed(args.scorer, path), dtype=np.float32)
            cache[relative] = (stamp, embedding)
            embedded += 1
        embeddings.append(embedding)
        targets.append(rating)
        zones.append(metadata.get(relative, {}).get("zone", "unknown"))
        if (index + 1) % 50 == 0:
            print(
                f"loaded {index + 1}/{len(eligible_ratings)} embeddings ({embedded} new)",
                flush=True,
            )

    save_embedding_cache(cache_path, cache)
    model = RewardModel.fit(
        np.array(embeddings),
        np.array(targets),
        alpha=args.alpha,
        groups=np.asarray(zones),
    )
    destination = os.path.join(args.out, "reward-model.json")
    model.save(destination)
    print(f"\n{model.describe()}")
    print(f"written to {destination} -- restart the scorer to use it")
    if not np.isnan(model.holdout_r) and model.holdout_r < 0.4:
        print("holdout correlation is weak: rate more frames, or more consistently")


if __name__ == "__main__":
    main()
