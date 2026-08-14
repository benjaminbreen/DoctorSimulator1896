import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pairwise_adapter import PairwiseAdapter  # noqa: E402
from reward_model import RewardModel  # noqa: E402


class PairwiseAdapterTests(unittest.TestCase):
    def model(self):
        return RewardModel([0.0, 0.0, 0.0], 3.0, 1.0, 5.0, 100, 0.6, ["room"])

    def test_adapter_learns_a_regularized_preference_direction(self):
        model = self.model()
        differences = np.array([[1.0, 0.0, 0.0], [0.8, 0.1, 0.0]])
        adapter = PairwiseAdapter.fit(model, differences, margin=0.5, regularization=1.0)
        self.assertTrue(adapter.compatible(model))
        self.assertGreater(adapter.score([1.0, 0.0, 0.0], model), adapter.score([-1.0, 0.0, 0.0], model))
        self.assertLess(np.linalg.norm(adapter.delta_weights), 1.0)

    def test_adapter_round_trip_and_base_fingerprint(self):
        model = self.model()
        adapter = PairwiseAdapter.fit(model, [[1.0, 0.0, 0.0]], sessions=["pass.json"])
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "adapter.json")
            adapter.save(path)
            loaded = PairwiseAdapter.load(path)
        self.assertTrue(loaded.compatible(model))
        changed = RewardModel([0.1, 0.0, 0.0], 3.0, 1.0, 5.0, 100, 0.6, ["room"])
        self.assertFalse(loaded.compatible(changed))


if __name__ == "__main__":
    unittest.main()
