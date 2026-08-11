#!/usr/bin/env python3
"""Turn reviewed ImageGen street swatches into seamless game PBR maps."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


MATERIALS = {
    "carriage-setts": {"source": "carriage-setts.png", "normal": 6.2, "roughness": 0.86},
    "intersection-setts": {"source": "intersection-setts.png", "normal": 6.8, "roughness": 0.79},
    "sidewalk-flags": {"source": "sidewalk-flags.png", "normal": 4.0, "roughness": 0.9},
    "gutter-stones": {"source": "gutter-stones.png", "normal": 7.0, "roughness": 0.94},
}


def smoothstep(value: np.ndarray) -> np.ndarray:
    return value * value * (3.0 - 2.0 * value)


def periodic_edges(values: np.ndarray, border: int) -> np.ndarray:
    """Blend opposite border pairs to the same value without a hard seam."""

    result = values.copy()
    for axis in (1, 0):
        length = result.shape[axis]
        width = min(border, length // 4)
        for offset in range(width):
            blend = float(smoothstep(np.array(offset / max(1, width - 1), dtype=np.float32)))
            left_slice = [slice(None)] * result.ndim
            right_slice = [slice(None)] * result.ndim
            left_slice[axis] = offset
            right_slice[axis] = length - 1 - offset
            left = result[tuple(left_slice)].copy()
            right = result[tuple(right_slice)].copy()
            average = (left + right) * 0.5
            result[tuple(left_slice)] = average * (1.0 - blend) + left * blend
            result[tuple(right_slice)] = average * (1.0 - blend) + right * blend
    return result


def blur(field: np.ndarray, radius: float) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(field, 0, 1) * 255), mode="L")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def save_rgb(path: Path, values: np.ndarray, quality: int = 92) -> None:
    image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255), mode="RGB")
    image.save(path, quality=quality, method=6)


def save_gray(path: Path, values: np.ndarray, quality: int = 92) -> None:
    image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255), mode="L")
    image.save(path, quality=quality, method=6)


def seam_metrics(values: np.ndarray) -> tuple[float, float]:
    horizontal = np.abs(values[:, 0].astype(np.float32) - values[:, -1].astype(np.float32)).mean()
    vertical = np.abs(values[0].astype(np.float32) - values[-1].astype(np.float32)).mean()
    adjacent = (
        np.abs(values[:, 1].astype(np.float32) - values[:, 0].astype(np.float32)).mean()
        + np.abs(values[1].astype(np.float32) - values[0].astype(np.float32)).mean()
    ) * 0.5
    edge = float((horizontal + vertical) * 0.5)
    return edge, float(edge / max(adjacent, 1e-4))


def build(name: str, settings: dict[str, float | str], source_dir: Path, out_dir: Path, size: int) -> None:
    source = Image.open(source_dir / str(settings["source"])).convert("RGB")
    source = source.resize((size, size), Image.Resampling.LANCZOS)
    source = ImageEnhance.Contrast(source).enhance(1.06)
    rgb = np.asarray(source, dtype=np.float32) / 255.0
    rgb = periodic_edges(rgb, max(48, size // 12))

    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luminance = linear[..., 0] * 0.2126 + linear[..., 1] * 0.7152 + linear[..., 2] * 0.0722
    fine_base = blur(luminance, 2.0)
    stone_base = blur(luminance, 11.0)
    broad_base = blur(luminance, 35.0)
    height = np.clip(0.5 + (luminance - fine_base) * 1.6 + (stone_base - broad_base) * 1.9, 0.08, 0.92)
    height = periodic_edges(height, max(32, size // 18))

    dy, dx = np.gradient(height)
    strength = float(settings["normal"])
    normal = np.stack((-dx * strength, -dy * strength, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normal = normal * 0.5 + 0.5
    normal = periodic_edges(normal, max(16, size // 32))

    yy, xx = np.mgrid[0:size, 0:size]
    tile_noise = (
        np.sin(xx * np.pi * 2 * 3 / size + 0.7) * np.sin(yy * np.pi * 2 * 5 / size + 1.9)
        + np.sin(xx * np.pi * 2 * 7 / size - yy * np.pi * 2 * 2 / size + 2.4) * 0.45
    ) / 1.45
    detail = np.abs(luminance - fine_base)
    roughness = float(settings["roughness"]) + detail * 0.65 + tile_noise * 0.025
    if name == "intersection-setts":
        roughness -= np.clip(height - 0.52, 0, 0.3) * 0.24
    roughness = periodic_edges(np.clip(roughness, 0.52, 0.98), max(24, size // 24))

    out_dir.mkdir(parents=True, exist_ok=True)
    save_rgb(out_dir / f"{name}_col.webp", rgb, 91)
    save_rgb(out_dir / f"{name}_nrm.webp", normal, 94)
    save_gray(out_dir / f"{name}_rough.webp", roughness, 92)
    save_gray(out_dir / f"{name}_height.webp", height, 92)

    for suffix in ("col", "nrm", "rough", "height"):
        image = np.asarray(Image.open(out_dir / f"{name}_{suffix}.webp"))
        edge, ratio = seam_metrics(image)
        # Lossy WebP blocks introduce a sub-pixel edge delta after the exact
        # periodic blend. Keep it well below an ordinary adjacent-pixel step.
        if edge > 3.0 and ratio > 0.65:
            raise RuntimeError(
                f"{name}_{suffix}.webp failed seamless-edge check: {edge:.2f}px / {ratio:.3f}"
            )
    print(f"{name}: albedo, normal, roughness, height ({size}px)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()
    for name, settings in MATERIALS.items():
        build(name, settings, args.source_dir, args.out_dir, args.size)


if __name__ == "__main__":
    main()
