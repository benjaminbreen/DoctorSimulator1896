"""Optional CLIP half of the reward.

Needs `pip install open_clip_torch`. With reference paintings in
tools/hopper/references/ it scores similarity to their embedding centroid;
with none it falls back to text prompts, which is weaker.

Raw CLIP cosine similarity sits in a narrow band whose position depends on the
model, the prompts, and whether the target is text or images -- a fixed rescale
guessed wrong and clamped every frame to zero. So the score is calibrated
against the run's own distribution: a running mean and variance of the raw
similarity, then a sigmoid on the z-score. That gives a reward that always
spreads across 0..1 and always pushes toward the better tail, which is what a
search wants.

The cost is that the CLIP term is relative, not absolute. Two runs' totals are
not comparable unless the calibration is reused (--clip-calibration).
"""

import glob
import json
import math
import os
import threading

WARMUP = 25
SPREAD = 1.2

POSITIVE_PROMPTS = [
    "a painting by Edward Hopper",
    "an oil painting of a quiet room with hard sunlight on the wall",
    "an American realist painting, a solitary figure by a window",
    "a still, empty interior painted in flat planes of light and shadow",
]
NEGATIVE_PROMPTS = [
    "a video game screenshot",
    "a 3d render of a room",
    "a cluttered photograph",
    "a dark blurry image of nothing",
]


class Calibration:
    """Welford running mean and variance, so the z-score needs no second pass."""

    def __init__(self, count=0, mean=0.0, m2=0.0):
        self.lock = threading.Lock()
        self.count, self.mean, self.m2 = count, mean, m2

    def observe(self, value):
        with self.lock:
            self.count += 1
            delta = value - self.mean
            self.mean += delta / self.count
            self.m2 += delta * (value - self.mean)
            return self.count, self.mean, math.sqrt(self.m2 / self.count) if self.count > 1 else 0.0

    def as_dict(self):
        return {"count": self.count, "mean": self.mean, "m2": self.m2}


class ClipScorer:
    def __init__(self, reference_dir, model_name="ViT-B-32", pretrained="laion2b_s34b_b79k",
                 calibration_path=None):
        import torch
        import open_clip

        self.torch = torch
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            model_name, pretrained=pretrained
        )
        self.model = self.model.to(self.device).eval()
        tokenizer = open_clip.get_tokenizer(model_name)

        with torch.no_grad():
            positive = self._embed_text(tokenizer, POSITIVE_PROMPTS)
            negative = self._embed_text(tokenizer, NEGATIVE_PROMPTS).mean(0, keepdim=True)
        self.negative = negative / negative.norm(dim=-1, keepdim=True)

        self.reference_count = 0
        centroid = self._embed_references(reference_dir)
        if centroid is not None:
            self.target = centroid
            # Image-to-image similarity carries no "is this a photo" baseline
            # to subtract, so the negative prompts only apply to the text path.
            self.negative_weight = 0.0
            self.source = f"{self.reference_count} reference images"
        else:
            target = positive.mean(0, keepdim=True)
            self.target = target / target.norm(dim=-1, keepdim=True)
            self.negative_weight = 0.5
            self.source = "text prompts (no reference images found)"

        self.calibration_path = calibration_path
        self.calibration = self._load_calibration()

    def _embed_text(self, tokenizer, prompts):
        tokens = tokenizer(prompts).to(self.device)
        features = self.model.encode_text(tokens).float()
        return features / features.norm(dim=-1, keepdim=True)

    def _embed_references(self, reference_dir):
        from PIL import Image

        paths = []
        for pattern in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            paths.extend(glob.glob(os.path.join(reference_dir, pattern)))
        if not paths:
            return None
        batch = self.torch.stack([
            self.preprocess(Image.open(p).convert("RGB")) for p in sorted(paths)
        ]).to(self.device)
        with self.torch.no_grad():
            features = self.model.encode_image(batch).float()
        features /= features.norm(dim=-1, keepdim=True)
        self.reference_count = len(paths)
        centroid = features.mean(0, keepdim=True)
        return centroid / centroid.norm(dim=-1, keepdim=True)

    def _load_calibration(self):
        if self.calibration_path and os.path.exists(self.calibration_path):
            with open(self.calibration_path) as handle:
                saved = json.load(handle)
            if saved.get("source") == self.source:
                return Calibration(saved["count"], saved["mean"], saved["m2"])
        return Calibration()

    def save_calibration(self):
        if not self.calibration_path:
            return
        with open(self.calibration_path, "w") as handle:
            json.dump({"source": self.source, **self.calibration.as_dict()}, handle)

    def embed(self, image):
        """Unit-norm image embedding, also used by the rating tool."""
        tensor = self.preprocess(image).unsqueeze(0).to(self.device)
        with self.torch.no_grad():
            features = self.model.encode_image(tensor).float()
        return (features / features.norm(dim=-1, keepdim=True)).squeeze(0).cpu().numpy()

    def raw(self, embedding):
        features = self.torch.from_numpy(embedding).to(self.device).unsqueeze(0)
        similarity = float((features @ self.target.T).item())
        if self.negative_weight:
            similarity -= self.negative_weight * float((features @ self.negative.T).item())
        return similarity

    def score(self, image):
        return self.score_embedding(self.embed(image))

    def score_embedding(self, embedding):
        """Returns 0..1, calibrated against the distribution seen so far."""
        value = self.raw(embedding)
        count, mean, deviation = self.calibration.observe(value)
        if count < WARMUP or deviation < 1e-6:
            return 0.5
        return float(1 / (1 + math.exp(-SPREAD * (value - mean) / deviation)))

    def status(self):
        return {
            "source": self.source,
            "samples": self.calibration.count,
            "mean_similarity": round(self.calibration.mean, 4),
            "warm": self.calibration.count >= WARMUP,
        }
