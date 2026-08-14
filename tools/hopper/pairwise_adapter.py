"""A small, reversible update learned from A/B screenshot choices.

The scalar reward model remains the durable base. A/B comparisons only learn
a delta in the span of the observed CLIP embedding differences, with an L2
anchor back to that base. This is deliberately conservative: thirty pairs can
correct a preference direction, but should not replace 299 absolute ratings.
"""

import hashlib
import json

import numpy as np


def reward_fingerprint(model):
    payload = json.dumps({
        "weights": np.asarray(model.weights, dtype=np.float64).tolist(),
        "bias": model.bias,
        "low": model.low,
        "high": model.high,
        "samples": model.samples,
    }, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()[:20]


class PairwiseAdapter:
    def __init__(
        self,
        delta_weights,
        base_fingerprint,
        samples,
        margin,
        regularization,
        sessions=None,
        metrics=None,
    ):
        self.delta_weights = np.asarray(delta_weights, dtype=np.float64)
        self.base_fingerprint = str(base_fingerprint)
        self.samples = int(samples)
        self.margin = float(margin)
        self.regularization = float(regularization)
        self.sessions = sorted(set(sessions or []))
        self.metrics = dict(metrics or {})

    @classmethod
    def fit(
        cls,
        reward_model,
        differences,
        margin=0.5,
        regularization=1.0,
        sessions=None,
        metrics=None,
    ):
        matrix = np.asarray(differences, dtype=np.float64)
        if matrix.ndim != 2 or matrix.shape[0] == 0:
            raise ValueError("pairwise fitting needs at least one embedding difference")
        if matrix.shape[1] != len(reward_model.weights):
            raise ValueError("pairwise embeddings do not match the scalar reward model")
        if regularization <= 0:
            raise ValueError("pairwise regularization must be positive")
        residual = np.full(matrix.shape[0], float(margin)) - matrix @ reward_model.weights
        # Woodbury form: solve one matrix sized by the number of comparisons,
        # not one sized by the 512-dimensional CLIP representation.
        delta = matrix.T @ np.linalg.solve(
            matrix @ matrix.T + float(regularization) * np.eye(matrix.shape[0]),
            residual,
        )
        return cls(
            delta,
            reward_fingerprint(reward_model),
            matrix.shape[0],
            margin,
            regularization,
            sessions=sessions,
            metrics=metrics,
        )

    def compatible(self, reward_model):
        return (
            len(self.delta_weights) == len(reward_model.weights)
            and self.base_fingerprint == reward_fingerprint(reward_model)
        )

    def weights_for(self, reward_model):
        if not self.compatible(reward_model):
            raise ValueError("pairwise adapter was trained for a different scalar reward model")
        return reward_model.weights + self.delta_weights

    def score(self, embedding, reward_model):
        weights = self.weights_for(reward_model)
        raw = float(np.asarray(embedding, dtype=np.float64) @ weights + reward_model.bias)
        span = max(reward_model.high - reward_model.low, 1e-6)
        return float(np.clip((raw - reward_model.low) / span, 0.0, 1.0))

    def describe(self):
        accuracy = self.metrics.get("end_to_end_cv_accuracy")
        suffix = f", pair CV={accuracy:.0%}" if isinstance(accuracy, (int, float)) else ""
        return f"{self.samples} A/B choices{suffix}"

    def save(self, path):
        with open(path, "w") as handle:
            json.dump({
                "version": 1,
                "delta_weights": self.delta_weights.tolist(),
                "base_fingerprint": self.base_fingerprint,
                "samples": self.samples,
                "margin": self.margin,
                "regularization": self.regularization,
                "sessions": self.sessions,
                "metrics": self.metrics,
            }, handle)

    @classmethod
    def load(cls, path):
        with open(path) as handle:
            data = json.load(handle)
        return cls(
            data["delta_weights"],
            data["base_fingerprint"],
            data["samples"],
            data["margin"],
            data["regularization"],
            sessions=data.get("sessions"),
            metrics=data.get("metrics"),
        )
