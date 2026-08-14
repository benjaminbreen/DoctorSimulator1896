import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from compare import (  # noqa: E402
    ComparisonRater,
    select_comparison_pairs,
    select_gamut_pairs,
    select_subject_validation_pairs,
    select_window_validation_pairs,
)


class ComparisonTests(unittest.TestCase):
    def frames(self):
        frames = []
        for stratum_index, stratum in enumerate(["ground", "raised", "rooftop"]):
            for index in range(40):
                frames.append({
                    "path": f"pilot/frames/{stratum}-{index:03}.png",
                    "run": "pilot",
                    "zone": "central-park",
                    "time_band": ["dawn", "morning", "midday", "afternoon", "sunset", "evening"][index % 6],
                    "time": 6 + index % 6 * 3,
                    "composition": "architecture",
                    "vibe": ["raking-clarity", "soft-overcast", "warm-afterglow"][index % 3],
                    "camera_stratum": stratum,
                    "auto": 0.3 + stratum_index * 0.08 + index / 200,
                })
        return frames

    def test_forty_pair_pass_has_the_intended_height_comparisons(self):
        pairs = select_comparison_pairs(self.frames(), 40, seed=813)
        counts = {}
        for pair in pairs:
            counts[pair["pair_type"]] = counts.get(pair["pair_type"], 0) + 1
        self.assertEqual(len(pairs), 40)
        self.assertEqual(counts["ground/raised"], 10)
        self.assertEqual(counts["ground/rooftop"], 10)
        self.assertEqual(counts["raised/rooftop"], 8)
        self.assertEqual(counts["raised/raised"], 6)
        self.assertEqual(counts["rooftop/rooftop"], 6)
        self.assertEqual(len({pair["id"] for pair in pairs}), 40)

    def test_votes_are_durable_and_scoped_to_the_pass(self):
        with tempfile.TemporaryDirectory() as out_dir:
            pairs = select_comparison_pairs(self.frames(), 3, seed=1)
            rater = ComparisonRater(out_dir, pairs)
            first = rater.pick()
            rater.set(first["id"], "left")
            self.assertEqual(rater.rated_count, 1)
            with open(os.path.join(out_dir, "comparisons.json")) as handle:
                saved = json.load(handle)
            self.assertEqual(saved["votes"][first["id"]]["winner"], first["left"]["path"])
            resumed = ComparisonRater(out_dir, pairs)
            self.assertEqual(resumed.rated_count, 1)
            resumed.set(first["id"], None)
            self.assertEqual(resumed.rated_count, 0)

    def test_gamut_pass_balances_within_family_comparisons(self):
        families = [
            "park-landscape", "park-people", "street-people",
            "window-figure", "interior-room", "elevated-architecture",
        ]
        frames = []
        for family in families:
            for index in range(8):
                frames.append({
                    "path": f"gamut/frames/{family}-{index}.png",
                    "run": "gamut",
                    "zone": "central-park" if "park" in family or "street" in family or "elevated" in family else "office",
                    "time_band": ["dawn", "morning", "midday", "afternoon", "sunset", "evening"][index % 6],
                    "time": 6 + index % 6 * 3,
                    "composition": "architecture",
                    "vibe": ["raking-clarity", "soft-overcast", "warm-afterglow"][index % 3],
                    "camera_stratum": "rooftop" if family == "elevated-architecture" else "ground",
                    "scene_family": family,
                    "auto": 0.3 + index / 100,
                })
        pairs = select_gamut_pairs(frames, 30, seed=813)
        counts = {}
        for pair in pairs:
            counts[pair["pair_type"]] = counts.get(pair["pair_type"], 0) + 1
            self.assertEqual(pair["left"]["scene_family"], pair["right"]["scene_family"])
        self.assertEqual(set(counts), set(families))
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

        validation = select_window_validation_pairs(frames, 30, seed=814)
        validation_counts = {}
        for pair in validation:
            validation_counts[pair["pair_type"]] = validation_counts.get(pair["pair_type"], 0) + 1
        self.assertEqual(validation_counts["window-figure"], 10)
        self.assertTrue(all(
            validation_counts[family] == 4
            for family in families
            if family != "window-figure"
        ))

    def test_subject_validation_weights_three_figure_settings(self):
        families = [
            "park-landscape", "park-people", "street-people", "window-figure",
            "doorway-figure", "rooftop-figure", "interior-room", "elevated-architecture",
        ]
        frames = []
        for family in families:
            for index in range(12):
                frames.append({
                    "path": f"subject/frames/{family}-{index}.png",
                    "run": "subject",
                    "zone": "room" if family in {"window-figure", "interior-room"} else "park",
                    "time_band": ["dawn", "morning", "midday", "sunset"][index % 4],
                    "time": 6 + index % 4 * 4,
                    "composition": family,
                    "vibe": ["hard", "soft", "haze"][index % 3],
                    "camera_stratum": "rooftop" if "rooftop" in family else "ground",
                    "scene_family": family,
                    "subject_archetype": ["w", "d", "f", "h"][index % 4],
                    "subject_scenario": family,
                    "auto": 0.3 + index / 100,
                })
        pairs = select_subject_validation_pairs(frames, 30, seed=14)
        counts = {}
        for pair in pairs:
            counts[pair["pair_type"]] = counts.get(pair["pair_type"], 0) + 1
        self.assertEqual(counts["window-figure"], 6)
        self.assertEqual(counts["doorway-figure"], 5)
        self.assertEqual(counts["rooftop-figure"], 5)
        self.assertEqual(sum(counts.values()), 30)


if __name__ == "__main__":
    unittest.main()
