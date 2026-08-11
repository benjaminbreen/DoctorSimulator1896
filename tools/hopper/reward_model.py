"""A reward model fitted to your own ratings.

Ridge regression from a CLIP image embedding to a 1-5 score. Five hundred
floats and a couple of hundred labels is not much of a model, but the input is
already a good representation and the target is one number, so it does not
need to be. It is the only term in the reward that knows what *you* mean by
Hopper rather than what CLIP's training data means.

Fit with rate.py; the scorer loads out/reward-model.json if it exists.
"""

import json

import numpy as np


class RewardModel:
    def __init__(self, weights, bias, low, high, samples, holdout_r):
        self.weights = np.asarray(weights, dtype=np.float64)
        self.bias = float(bias)
        self.low = float(low)
        self.high = float(high)
        self.samples = int(samples)
        self.holdout_r = float(holdout_r)

    @classmethod
    def fit(cls, embeddings, ratings, alpha=1.0, holdout=0.2, seed=0):
        x = np.asarray(embeddings, dtype=np.float64)
        y = np.asarray(ratings, dtype=np.float64)
        rng = np.random.default_rng(seed)
        order = rng.permutation(len(y))
        cut = max(1, int(len(y) * holdout))
        test, train = order[:cut], order[cut:]

        def solve(rows):
            design = np.hstack([x[rows], np.ones((len(rows), 1))])
            gram = design.T @ design
            # The bias is not penalised; shrinking it just biases the mean.
            penalty = alpha * np.eye(gram.shape[0])
            penalty[-1, -1] = 0.0
            return np.linalg.solve(gram + penalty, design.T @ y[rows])

        solution = solve(train)
        predicted = x[test] @ solution[:-1] + solution[-1]
        if len(test) > 2 and predicted.std() > 1e-9:
            holdout_r = float(np.corrcoef(predicted, y[test])[0, 1])
        else:
            holdout_r = float("nan")

        final = solve(order)
        return cls(final[:-1], final[-1], y.min(), y.max(), len(y), holdout_r)

    def score(self, embedding):
        """0..1, with the rating scale's own range as the endpoints."""
        raw = float(np.asarray(embedding, dtype=np.float64) @ self.weights + self.bias)
        span = max(self.high - self.low, 1e-6)
        return float(np.clip((raw - self.low) / span, 0.0, 1.0))

    def describe(self):
        return f"{self.samples} ratings, holdout r={self.holdout_r:.2f}"

    def save(self, path):
        with open(path, "w") as handle:
            json.dump({
                "weights": self.weights.tolist(),
                "bias": self.bias,
                "low": self.low,
                "high": self.high,
                "samples": self.samples,
                "holdout_r": self.holdout_r,
            }, handle)

    @classmethod
    def load(cls, path):
        with open(path) as handle:
            data = json.load(handle)
        return cls(data["weights"], data["bias"], data["low"], data["high"],
                   data["samples"], data["holdout_r"])
