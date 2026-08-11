#!/usr/bin/env python3
"""Derive restrained PBR data maps from a flat-lit authored albedo image."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def blur(field: np.ndarray, radius: float) -> np.ndarray:
    source = Image.fromarray(np.uint8(np.clip(field, 0, 1) * 255), mode="L")
    return np.asarray(source.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def save_gray(path: Path, field: np.ndarray) -> None:
    Image.fromarray(np.uint8(np.clip(field, 0, 1) * 255), mode="L").save(path, quality=92, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("albedo")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--normal-strength", type=float, default=5.0)
    parser.add_argument("--roughness", type=float, default=0.82)
    parser.add_argument("--seed", type=int, default=1896)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(args.albedo).convert("RGB")
    source = source.resize((args.size, args.size), Image.Resampling.LANCZOS)
    source.save(out_dir / f"{args.prefix}-albedo.webp", quality=92, method=6)

    rgb = np.asarray(source, dtype=np.float32) / 255.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luminance = linear[..., 0] * 0.2126 + linear[..., 1] * 0.7152 + linear[..., 2] * 0.0722
    fine_base = blur(luminance, 2.0)
    meso_base = blur(luminance, 13.0)
    fine = luminance - fine_base
    meso = fine_base - meso_base
    height = np.clip(0.5 + fine * 2.0 + meso * 0.55, 0.2, 0.8)

    dy, dx = np.gradient(height)
    nx = -dx * args.normal_strength
    ny = -dy * args.normal_strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal = np.uint8(np.clip(normal * 0.5 + 0.5, 0, 1) * 255)
    Image.fromarray(normal, mode="RGB").save(out_dir / f"{args.prefix}-normal.webp", quality=94, method=6)

    rng = np.random.default_rng(args.seed)
    noise = blur(rng.random(height.shape, dtype=np.float32), 4.0) - 0.5
    roughness = args.roughness + np.abs(fine) * 0.8 + np.abs(meso) * 0.25 + noise * 0.12
    save_gray(out_dir / f"{args.prefix}-roughness.webp", np.clip(roughness, 0.5, 0.98))


if __name__ == "__main__":
    main()
