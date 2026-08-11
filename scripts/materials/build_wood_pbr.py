#!/usr/bin/env python3
"""Build independent wood data maps from a flat-lit authored albedo source."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def blur(field: np.ndarray, radius: float) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(field, 0, 1) * 255), mode="L")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def save_gray(path: Path, field: np.ndarray) -> None:
    Image.fromarray(np.uint8(np.clip(field, 0, 1) * 255), mode="L").save(path, quality=92, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("albedo")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=1896)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(args.albedo).convert("RGB")
    source = source.resize((args.size, args.size), Image.Resampling.LANCZOS)
    source.save(out_dir / "pale-deal-albedo.webp", quality=92, method=6)

    rgb = np.asarray(source, dtype=np.float32) / 255.0
    # Linear-light luminance is used only as evidence for relief; it is not
    # copied into any data map unchanged.
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luminance = linear[..., 0] * 0.2126 + linear[..., 1] * 0.7152 + linear[..., 2] * 0.0722
    fine_base = blur(luminance, 2.2)
    meso_base = blur(luminance, 14.0)
    fine = luminance - fine_base
    meso = fine_base - meso_base

    height = np.clip(0.5 + fine * 2.5 + meso * 0.65, 0.16, 0.84)
    save_gray(out_dir / "pale-deal-height.webp", height)

    dy, dx = np.gradient(height)
    strength = 10.0
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal = np.uint8(np.clip(normal * 0.5 + 0.5, 0, 1) * 255)
    Image.fromarray(normal, mode="RGB").save(out_dir / "pale-deal-normal.webp", quality=94, method=6)

    rng = np.random.default_rng(args.seed)
    noise_small = rng.random(height.shape, dtype=np.float32)
    noise_small = blur(noise_small, 4.0) - 0.5
    # Roughness uses local variance and seeded surface noise. It is deliberately
    # not the albedo or height image reused under a different name.
    roughness = 0.76 + np.abs(fine) * 1.1 + np.abs(meso) * 0.35 + noise_small * 0.16
    roughness = np.clip(roughness, 0.56, 0.94)
    save_gray(out_dir / "pale-deal-roughness.webp", roughness)

    cavity = np.maximum(0.0, blur(height, 5.0) - height)
    ao = np.clip(1.0 - cavity * 2.2, 0.72, 1.0)
    save_gray(out_dir / "pale-deal-ao.webp", ao)


if __name__ == "__main__":
    main()
