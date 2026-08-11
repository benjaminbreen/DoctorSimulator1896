"""Build seamless Renderer C fabric maps from neutral generated sources.

Albedo comes from the reviewed source images. Roughness and normal maps are
independent deterministic weave fields, so one image is never reused across
unrelated PBR channels.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageOps


FABRICS = {
    "cotton": {"variation": 0.035, "normal": 0.82, "albedo": 0.78},
    "wool": {"variation": 0.045, "normal": 0.76, "albedo": 0.72},
    "silk": {"variation": 0.025, "normal": 0.42, "albedo": 0.58},
    "velvet": {"variation": 0.060, "normal": 0.36, "albedo": 0.86},
    "brocade": {"variation": 0.075, "normal": 1.06, "albedo": 1.0},
}


def periodic_albedo(name: str, source: Path, size: int) -> Image.Image:
    tile_size = size // 2
    source_image = Image.open(source).convert("L").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
    tiled = Image.new("L", (size, size))
    tiled.paste(source_image, (0, 0))
    tiled.paste(ImageOps.mirror(source_image), (tile_size, 0))
    tiled.paste(ImageOps.flip(source_image), (0, tile_size))
    tiled.paste(ImageOps.flip(ImageOps.mirror(source_image)), (tile_size, tile_size))
    values = np.asarray(tiled, dtype=np.float32) / 255.0
    centered = values - float(values.mean())
    neutral = np.clip(0.86 + centered * FABRICS[name]["albedo"], 0.56, 0.99)
    rgb = np.repeat((neutral * 255).astype(np.uint8)[..., None], 3, axis=2)
    return Image.fromarray(rgb, "RGB")


def periodic_noise(x: np.ndarray, y: np.ndarray, seed: float) -> np.ndarray:
    return (
        np.sin(math.tau * (x * 3 + y * 2 + seed)) * 0.45
        + np.sin(math.tau * (x * 7 - y * 5 + seed * 1.7)) * 0.30
        + np.sin(math.tau * (x * 13 + y * 11 + seed * 2.3)) * 0.18
        + np.sin(math.tau * (x * 29 - y * 23 + seed * 0.7)) * 0.07
    )


def weave_height(name: str, size: int) -> np.ndarray:
    axis = np.arange(size, dtype=np.float32) / size
    x, y = np.meshgrid(axis, axis)
    noise = periodic_noise(x, y, {"cotton": 0.11, "wool": 0.23, "silk": 0.37, "velvet": 0.51, "brocade": 0.73}[name])
    if name == "cotton":
        warp = np.sin(math.tau * x * 46) * 0.48
        weft = np.sin(math.tau * y * 46) * 0.48
        return (warp * weft) * 0.72 + noise * 0.28
    if name == "wool":
        twill = np.sin(math.tau * (x + y) * 54)
        return twill * 0.72 + np.sin(math.tau * (x - y) * 18) * 0.12 + noise * 0.16
    if name == "silk":
        satin = np.sin(math.tau * (x * 72 + y * 20))
        return satin * 0.80 + noise * 0.20
    if name == "velvet":
        pile = np.sin(math.tau * (x * 67 + y * 61)) * np.sin(math.tau * (x * 59 - y * 71))
        return pile * 0.28 + noise * 0.72
    # Independent woven relief: a small periodic leaf-and-stem rhythm.
    leaf = np.sin(math.tau * x * 6) * np.sin(math.tau * y * 8)
    stem = np.sin(math.tau * (x * 6 + y * 4))
    weave = np.sin(math.tau * x * 52) * np.sin(math.tau * y * 52)
    return leaf * 0.46 + stem * 0.24 + weave * 0.18 + noise * 0.12


def pbr_maps(name: str, size: int) -> tuple[Image.Image, Image.Image]:
    settings = FABRICS[name]
    height = weave_height(name, size)
    height = height / max(1e-6, float(np.max(np.abs(height))))
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    strength = settings["normal"] * 1.8
    normal = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normal_image = Image.fromarray(np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB")

    slow = periodic_noise(*np.meshgrid(np.arange(size) / size, np.arange(size) / size), seed=0.91)
    # The runtime material owns the fabric's base roughness. This map is a
    # near-white modulation field; encoding the base value here as well would
    # multiply roughness twice and make every cloth preset look lacquered.
    roughness = np.clip(0.94 + height * settings["variation"] + slow * 0.012, 0.82, 0.99)
    roughness_image = Image.fromarray((roughness * 255).astype(np.uint8), "L")
    return roughness_image, normal_image


def edge_delta_ratio(image: Image.Image) -> float:
    values = np.asarray(image.convert("RGB"), dtype=np.float32)
    seam = (
        np.abs(values[:, 0] - values[:, -1]).mean()
        + np.abs(values[0] - values[-1]).mean()
    ) * 0.5
    adjacent = (
        np.abs(values[:, 1:] - values[:, :-1]).mean()
        + np.abs(values[1:] - values[:-1]).mean()
    ) * 0.5
    if seam <= 2.0:
        return 0.0
    return float(seam / max(1e-6, adjacent))


def build(source_root: Path, lab_output: Path, game_output: Path, size: int) -> None:
    lab_output.mkdir(parents=True, exist_ok=True)
    game_output.mkdir(parents=True, exist_ok=True)
    for name in FABRICS:
        source = source_root / f"{name}-source.png"
        if not source.exists():
            raise FileNotFoundError(source)
        albedo = periodic_albedo(name, source, size)
        roughness, normal = pbr_maps(name, size)
        outputs = {
            f"{name}-albedo.png": albedo,
            f"{name}-roughness.png": roughness,
            f"{name}-normal.png": normal,
        }
        for filename, image in outputs.items():
            lab_path = lab_output / filename
            image.save(lab_path, optimize=True)
            shutil.copy2(lab_path, game_output / filename)
            if edge_delta_ratio(image) > 1.25:
                raise RuntimeError(f"{filename} failed the seamless-edge check")
        print(f"{name}: albedo, roughness, normal ({size}px)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="assets/source/renderer-c/fabrics")
    parser.add_argument("--lab-output", default="character-lab/public/textures/renderer-c/fabrics")
    parser.add_argument("--game-output", default="game/public/textures/renderer-c/fabrics")
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()
    build(Path(args.source), Path(args.lab_output), Path(args.game_output), args.size)


if __name__ == "__main__":
    main()
