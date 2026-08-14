import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from rate import Rater, select_diverse_frames  # noqa: E402


class DiverseSessionTests(unittest.TestCase):
    def frames(self):
        frames = []
        bands = ["dawn", "morning", "midday", "afternoon", "sunset", "evening"]
        vibes = [
            "raking-clarity", "soft-overcast", "warm-afterglow",
            "quiet-fill", "practical-nocturne", "luminous-haze",
        ]
        for zone_index in range(10):
            for band_index, band in enumerate(bands):
                for variant in range(3):
                    frames.append({
                        "path": f"run/frames/{zone_index}-{band_index}-{variant}.png",
                        "run": "run",
                        "zone": f"zone-{zone_index}",
                        "time_band": band,
                        "time": 6 + band_index * 3,
                        "composition": ["figure", "window", "architecture"][variant],
                        "vibe": vibes[(zone_index * 3 + band_index + variant) % len(vibes)],
                        "auto": variant / 2,
                    })
        return frames

    def test_thirty_frame_pass_balances_zones_and_times(self):
        selected = select_diverse_frames(self.frames(), 30, seed=813)
        zones = {}
        times = {}
        vibes = {}
        for frame in selected:
            zones[frame["zone"]] = zones.get(frame["zone"], 0) + 1
            times[frame["time_band"]] = times.get(frame["time_band"], 0) + 1
            vibes[frame["vibe"]] = vibes.get(frame["vibe"], 0) + 1
        self.assertEqual(len(selected), 30)
        self.assertLessEqual(max(zones.values()) - min(zones.values()), 1)
        self.assertLessEqual(max(times.values()) - min(times.values()), 1)
        self.assertEqual(len(vibes), 6)
        self.assertLessEqual(max(vibes.values()) - min(vibes.values()), 2)
        self.assertEqual(set(frame["composition"] for frame in selected), {"figure", "window", "architecture"})

    def test_rater_progress_is_scoped_to_the_session(self):
        with tempfile.TemporaryDirectory() as out_dir:
            with open(os.path.join(out_dir, "ratings.json"), "w") as handle:
                json.dump({"old/frame.png": 5}, handle)
            frames = self.frames()[:3]
            rater = Rater(out_dir, frames)
            self.assertEqual(rater.rated_count, 0)
            first = rater.pick()
            rater.set(first["path"], 4)
            self.assertEqual(rater.rated_count, 1)
            self.assertEqual(rater.pick()["total"], 3)


if __name__ == "__main__":
    unittest.main()
