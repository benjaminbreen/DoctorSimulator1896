"""Hand-written composition metrics for a rendered frame.

These are the deterministic half of the reward. Each returns 0..1, higher
meaning more Hopper-like, and each measures one thing you can name and argue
about: how much of the frame is unbroken plane, how cleanly it splits into
sun and shade, how hard the shadow edges are, and so on.

CLIP (clip_scorer.py) is the learned half and is optional. Keeping the two
apart is the point: when a frame scores well you can see which half liked it.
"""

import numpy as np
from scipy import ndimage

# Colors sampled by eye from Hopper reproductions: sunlit cream, warm ochre
# light, brick, the green-black of a shadowed interior, slate sky, a dark
# window, white cloth, shutter green.
PALETTE_HEX = [
    "#e8d9a8", "#d9a441", "#9e3b2e", "#2e4a4a",
    "#4a6b8a", "#14161a", "#f2efe6", "#3f5b3a",
]


def _hex_to_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def srgb_to_lab(rgb):
    """rgb: (..., 3) in 0..1. Returns CIE Lab, D65."""
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    xyz = linear @ m.T / np.array([0.95047, 1.0, 1.08883])
    eps = 216 / 24389
    kappa = 24389 / 27
    f = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16) / 116)
    return np.stack([
        116 * f[..., 1] - 16,
        500 * (f[..., 0] - f[..., 1]),
        200 * (f[..., 1] - f[..., 2]),
    ], axis=-1)


PALETTE_LAB = srgb_to_lab(np.stack([_hex_to_rgb(h) for h in PALETTE_HEX]))


def plateau(value, low, high, slack):
    """1 inside [low, high], falling linearly to 0 `slack` outside it."""
    if low <= value <= high:
        return 1.0
    distance = low - value if value < low else value - high
    return float(max(0.0, 1.0 - distance / slack))


def otsu(values, bins=128):
    """Returns (threshold, separability) — Otsu's between-class variance ratio."""
    hist, edges = np.histogram(values, bins=bins, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 0.5, 0.0
    p = hist / total
    centers = (edges[:-1] + edges[1:]) / 2
    omega = np.cumsum(p)
    mu = np.cumsum(p * centers)
    mu_total = mu[-1]
    denominator = omega * (1 - omega)
    with np.errstate(divide="ignore", invalid="ignore"):
        between = np.where(denominator > 1e-9, (mu_total * omega - mu) ** 2 / denominator, 0.0)
    index = int(np.argmax(between))
    variance = float(np.sum(p * (centers - mu_total) ** 2))
    separability = float(between[index] / variance) if variance > 1e-9 else 0.0
    return float(centers[index]), min(separability, 1.0)


def pixel_metrics(rgb):
    """rgb: HxWx3 float 0..1. Returns a dict of named 0..1 scores."""
    height, width = rgb.shape[:2]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    smooth = ndimage.gaussian_filter(lum, sigma=1.0)
    gy = ndimage.sobel(smooth, axis=0)
    gx = ndimage.sobel(smooth, axis=1)
    magnitude = np.hypot(gx, gy)

    # Unbroken plane: low local gradient. Hopper's walls carry no detail --
    # but a frame that is nothing but wall is not a painting, so both of
    # these are plateaus, not "more is better".
    flat_mask = magnitude < 0.06
    flatness = plateau(float(flat_mask.mean()), 0.40, 0.80, 0.25)

    # One big empty area beats the same area scattered as noise, so the
    # largest connected flat region is scored separately.
    labels, count = ndimage.label(flat_mask)
    if count:
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        emptiness = plateau(float(sizes.max() / (height * width)), 0.15, 0.55, 0.25)
    else:
        emptiness = 0.0

    # Otsu is scale-invariant, so a near-black frame still "splits" cleanly.
    # This is the guard against winning by turning the lights off.
    low, high = np.percentile(lum, [5, 95])
    tonal_range = plateau(float(high - low), 0.35, 0.95, 0.25) * plateau(float(lum.mean()), 0.10, 0.55, 0.10)

    # Sun and shade as two populations, not a gradient.
    threshold, separability = otsu(lum)
    lit = lum > threshold
    lit_fraction = float(lit.mean())
    light_balance = plateau(lit_fraction, 0.15, 0.55, 0.2)

    # Hard-edged shadow: gradient along the sun/shade boundary.
    boundary = ndimage.binary_dilation(lit, iterations=1) & ndimage.binary_dilation(~lit, iterations=1)
    shadow_edge = float(np.clip(magnitude[boundary].mean() / 0.22, 0, 1)) if boundary.any() else 0.0

    # Rectilinear architecture: strong edges that run vertical or horizontal.
    strong = magnitude > np.percentile(magnitude, 85)
    if strong.any():
        theta = np.arctan2(gy[strong], gx[strong])
        off_axis = np.abs(((theta + np.pi / 4) % (np.pi / 2)) - np.pi / 4)
        rectilinear = float((off_axis < np.deg2rad(12)).mean())
    else:
        rectilinear = 0.0

    # Raking light: one strong luminance slope across the whole frame,
    # arriving off the horizontal and vertical axes.
    coarse = ndimage.gaussian_filter(lum, sigma=max(width, height) / 12)
    ys, xs = np.mgrid[0:height, 0:width]
    design = np.stack([xs.ravel() / width, ys.ravel() / height, np.ones(xs.size)], axis=1)
    slope, *_ = np.linalg.lstsq(design, coarse.ravel(), rcond=None)
    strength = float(np.clip(np.hypot(slope[0], slope[1]) / 0.45, 0, 1))
    angle = np.arctan2(slope[1], slope[0])
    diagonality = float(np.abs(((angle + np.pi / 4) % (np.pi / 2)) - np.pi / 4) / (np.pi / 4))
    raking = strength * (0.35 + 0.65 * diagonality)

    # Palette: how close the frame's colors sit to Hopper's.
    sample = rgb[::3, ::3].reshape(-1, 3)
    lab = srgb_to_lab(sample)
    distance = np.linalg.norm(lab[:, None, :] - PALETTE_LAB[None, :, :], axis=2).min(axis=1)
    palette = float(np.clip(1 - distance / 55.0, 0, 1).mean())

    return {
        "flatness": flatness,
        "emptiness": emptiness,
        "tonal_range": tonal_range,
        "light_split": separability,
        "light_balance": light_balance,
        "shadow_edge": shadow_edge,
        "rectilinear": rectilinear,
        "raking": raking,
        "palette": palette,
    }


def probe_metrics(probe):
    """Composition scores from the scene graph rather than the pixels."""
    if not probe:
        return {}
    figure = probe.get("figure") or {}
    windows = probe.get("windows") or []

    if not figure.get("onScreen"):
        # An empty room is a legitimate Hopper, just not the target.
        figure_score = 0.3
    else:
        size = plateau(figure.get("heightFrac", 0), 0.18, 0.55, 0.18)
        thirds = min(abs(figure.get("x", 0.5) - 1 / 3), abs(figure.get("x", 0.5) - 2 / 3))
        placement = float(max(0.0, 1 - thirds / 0.18))
        grounded = plateau(figure.get("footY", 0.5), 0.5, 0.95, 0.2)
        # Facing away or in profile, rarely at the viewer.
        turned = float(np.clip(0.45 + 0.55 * figure.get("awayness", 0), 0, 1))
        figure_score = 0.34 * size + 0.28 * placement + 0.22 * grounded + 0.16 * turned

    if windows:
        biggest = max(w.get("heightFrac", 0) for w in windows)
        window_score = plateau(biggest, 0.15, 0.7, 0.25)
        # One window is the Hopper count; a wall of them is an office block.
        window_score *= 1.0 if len(windows) <= 2 else 0.7
    else:
        window_score = 0.15

    return {"figure": float(figure_score), "window": float(window_score)}
