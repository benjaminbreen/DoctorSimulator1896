#!/usr/bin/env python3
"""Fit and validate a conservative A/B adapter from a completed session.

This needs no live CLIP process when the compared frames have already passed
through score_gamut.py. It refuses to write an adapter unless family-stratified
cross-validation improves the complete screenshot score and the scalar model's
rating correlation remains stable.
"""

import argparse
from collections import Counter
import glob
import json
import os
import tempfile

import numpy as np

from pairwise_adapter import PairwiseAdapter
from reward_model import RewardModel
from score_server import load_weights
from train_reward import load_embedding_cache, load_exclusions

HERE = os.path.dirname(os.path.abspath(__file__))


def atomic_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="pairwise-", suffix=".json", dir=os.path.dirname(path))
    try:
        with os.fdopen(descriptor, "w") as handle:
            json.dump(payload, handle, indent=2)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def frame_rows(out_dir):
    rows = {}
    for log_path in glob.glob(os.path.join(out_dir, "*", "all.jsonl")):
        run_dir = os.path.dirname(log_path)
        with open(log_path) as handle:
            for line in handle:
                row = json.loads(line)
                if row.get("frame"):
                    relative = os.path.relpath(os.path.join(run_dir, row["frame"]), out_dir)
                    rows[relative] = row
    return rows


def weighted_total(row, taste, weights, training_zones, unseen_scale=0.35):
    parts = dict(row.get("parts") or {})
    parts["taste"] = float(taste)
    used = {key: weights[key] for key in parts if key in weights}
    if "taste" in used and row.get("zone") not in training_zones:
        used["taste"] *= unseen_scale
    denominator = sum(used.values())
    return sum(parts[key] * weight for key, weight in used.items()) / denominator if denominator else 0.0


def choice_total(record, reward_model, adapter, rows, cache, weights):
    def score(path):
        embedding = cache[path][1]
        taste = adapter.score(embedding, reward_model) if adapter else reward_model.score(embedding)
        return weighted_total(rows[path], taste, weights, reward_model.training_zones)
    return score(record["winner"]), score(record["loser"])


def scalar_stability(out_dir, cache, reward_model, adapter):
    ratings_path = os.path.join(out_dir, "ratings.json")
    if not os.path.exists(ratings_path):
        return {"samples": 0, "correlation_before": None, "correlation_after": None}
    with open(ratings_path) as handle:
        ratings = json.load(handle)
    exclusions = load_exclusions(os.path.join(out_dir, "rating-exclusions.json"))
    paths = [path for path in ratings if path not in exclusions and path in cache]
    if len(paths) < 3:
        return {"samples": len(paths), "correlation_before": None, "correlation_after": None}
    embeddings = np.asarray([cache[path][1] for path in paths])
    targets = np.asarray([ratings[path] for path in paths], dtype=np.float64)
    before = embeddings @ reward_model.weights + reward_model.bias
    after = embeddings @ adapter.weights_for(reward_model) + reward_model.bias
    return {
        "samples": len(paths),
        "correlation_before": float(np.corrcoef(before, targets)[0, 1]),
        "correlation_after": float(np.corrcoef(after, targets)[0, 1]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--session",
        action="append",
        required=True,
        help="comparison session name or JSON path; repeat to train on several completed sessions",
    )
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    parser.add_argument("--reward-model", default=None)
    parser.add_argument("--cache", default=None)
    parser.add_argument("--weights", default=os.path.join(HERE, "weights.json"))
    parser.add_argument("--margin", type=float, default=0.5, help="desired winner lead in rating points")
    parser.add_argument("--regularization", type=float, default=1.0, help="anchor strength to the scalar model")
    parser.add_argument("--minimum-cv-gain", type=int, default=1)
    parser.add_argument("--maximum-correlation-drop", type=float, default=0.03)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    session_paths = []
    sessions = []
    for requested in args.session:
        session_path = requested
        if not os.path.exists(session_path):
            session_path = os.path.join(out_dir, "comparison-sessions", f"{requested}.json")
        if not os.path.exists(session_path):
            raise SystemExit(f"comparison session not found: {session_path}")
        with open(session_path) as handle:
            sessions.append(json.load(handle))
        session_paths.append(session_path)
    session_names = [os.path.basename(path) for path in session_paths]
    with open(os.path.join(out_dir, "comparisons.json")) as handle:
        votes = json.load(handle).get("votes", {})

    reward_path = args.reward_model or os.path.join(out_dir, "reward-model.json")
    reward_model = RewardModel.load(reward_path)
    cache = load_embedding_cache(args.cache or os.path.join(out_dir, ".embedding-cache-v2.npz"))
    rows = frame_rows(out_dir)
    weights = load_weights(args.weights)
    occurrences = Counter()
    records = []
    seen_pairs = set()
    for session in sessions:
        for pair in session.get("pairs", []):
            if pair["id"] in seen_pairs:
                continue
            seen_pairs.add(pair["id"])
            vote = votes.get(pair["id"])
            if not vote or vote.get("choice") not in {"left", "right"} or not vote.get("winner"):
                continue
            winner = vote["winner"]
            loser = vote["left"] if winner == vote["right"] else vote["right"]
            missing = [path for path in (winner, loser) if path not in cache or path not in rows]
            if missing:
                raise SystemExit(f"score compared frames before pairwise training; missing {missing[0]}")
            family = pair.get("pair_type", "comparison")
            records.append({
                "id": pair["id"],
                "winner": winner,
                "loser": loser,
                "family": family,
                "fold": occurrences[family],
                "difference": np.asarray(cache[winner][1]) - np.asarray(cache[loser][1]),
            })
            occurrences[family] += 1
    if len(records) < 12:
        raise SystemExit(f"only {len(records)} usable A/B choices; need at least 12")

    differences = np.asarray([record["difference"] for record in records])
    baseline_correct = sum(
        choice_total(record, reward_model, None, rows, cache, weights)[0]
        > choice_total(record, reward_model, None, rows, cache, weights)[1]
        for record in records
    )
    fold_count = min(5, min(occurrences.values()))
    cv_correct = 0
    for fold in range(fold_count):
        train = [record for record in records if record["fold"] % fold_count != fold]
        test = [record for record in records if record["fold"] % fold_count == fold]
        adapter = PairwiseAdapter.fit(
            reward_model,
            np.asarray([record["difference"] for record in train]),
            margin=args.margin,
            regularization=args.regularization,
        )
        cv_correct += sum(
            choice_total(record, reward_model, adapter, rows, cache, weights)[0]
            > choice_total(record, reward_model, adapter, rows, cache, weights)[1]
            for record in test
        )

    adapter = PairwiseAdapter.fit(
        reward_model,
        differences,
        margin=args.margin,
        regularization=args.regularization,
        sessions=session_names,
    )
    full_correct = sum(
        choice_total(record, reward_model, adapter, rows, cache, weights)[0]
        > choice_total(record, reward_model, adapter, rows, cache, weights)[1]
        for record in records
    )
    stability = scalar_stability(out_dir, cache, reward_model, adapter)
    correlation_drop = None
    if stability["correlation_before"] is not None:
        correlation_drop = stability["correlation_before"] - stability["correlation_after"]
    metrics = {
        "baseline_end_to_end_accuracy": baseline_correct / len(records),
        "end_to_end_cv_accuracy": cv_correct / len(records),
        "fitted_end_to_end_accuracy": full_correct / len(records),
        "folds": fold_count,
        "scalar_stability": stability,
        "correlation_drop": correlation_drop,
    }
    adapter.metrics = metrics
    gain = cv_correct - baseline_correct
    stable = correlation_drop is None or correlation_drop <= args.maximum_correlation_drop
    accepted = gain >= args.minimum_cv_gain and stable
    report = {
        "version": 1,
        "session": session_names[0] if len(session_names) == 1 else None,
        "sessions": session_names,
        "choices": len(records),
        "families": dict(sorted(occurrences.items())),
        "margin": args.margin,
        "regularization": args.regularization,
        "metrics": metrics,
        "cv_gain_choices": gain,
        "accepted": accepted or args.force,
        "forced": bool(args.force and not accepted),
    }
    report_path = os.path.join(out_dir, "pairwise-report.json")
    atomic_json(report_path, report)
    print(json.dumps(report, indent=2))
    if not accepted and not args.force:
        raise SystemExit("pairwise adapter failed its validation gate; base model left unchanged")
    destination = os.path.join(out_dir, "pairwise-adapter.json")
    adapter.save(destination)
    print(f"\n{adapter.describe()}")
    print(f"written to {destination}")


if __name__ == "__main__":
    main()
