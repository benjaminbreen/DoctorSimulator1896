"""Compose MPFB identity renders into review sheets and image diagnostics."""

import argparse
import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


BACKGROUND = "#17191d"
PANEL = "#22252b"
TEXT = "#f0e8d8"
MUTED = "#b8ac98"


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir")
    return parser.parse_args()


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def fitted(image, size):
    return ImageOps.fit(image.convert("RGB"), size, method=Image.Resampling.LANCZOS)


def paired_sheet(root, cohort, data, columns):
    entries = data["entries"]
    portrait_size = (230, 281)
    gutter = 4
    tile_width = portrait_size[0] * 2 + gutter + 18
    tile_height = portrait_size[1] + 66
    rows = math.ceil(len(entries) / columns)
    header_height = 132
    sheet = Image.new("RGB", (columns * tile_width + 36, header_height + rows * tile_height + 24), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    title_font = font(34, True)
    body_font = font(18)
    label_font = font(18, True)
    small_font = font(14)
    title = {
        "narrow": "MPFB2 narrow-cohort identity gate",
        "expanded": "MPFB2 expanded-target identity gate",
        "broad": "MPFB2 broad-cohort identity gate",
    }[cohort]
    subtitle = {
        "narrow": "Same sex, age, ancestry, clay material, lighting, eyes, brows and lashes. Renderer A target map.",
        "expanded": "Same cohort and presentation, adding 39 built-in forehead, eye, nose, lip, chin and ear controls.",
        "broad": "Age, sex, ancestry, build and facial structure vary. Presentation remains bald and standardized.",
    }[cohort]
    draw.text((24, 18), title, fill=TEXT, font=title_font)
    draw.text((24, 68), subtitle, fill=MUTED, font=body_font)
    draw.text((24, 98), "Each tile: front / three-quarter", fill=MUTED, font=small_font)
    for index, entry in enumerate(entries):
        column = index % columns
        row = index // columns
        left = 18 + column * tile_width
        top = header_height + row * tile_height
        draw.rounded_rectangle((left, top, left + tile_width - 8, top + tile_height - 10), radius=10, fill=PANEL)
        front = Image.open(root / cohort / f"{entry['id']}-front.png")
        quarter = Image.open(root / cohort / f"{entry['id']}-three-quarter.png")
        sheet.paste(fitted(front, portrait_size), (left + 6, top + 6))
        sheet.paste(fitted(quarter, portrait_size), (left + 6 + portrait_size[0] + gutter, top + 6))
        draw.text((left + 8, top + portrait_size[1] + 13), f"{entry['id']} · {entry['label']}", fill=TEXT, font=label_font)
        detail = "woman · age 30 · demographic controls held constant" if cohort in ("narrow", "expanded") else f"{entry['sex']} · {entry['ageYears']} · {entry['ancestry']}"
        draw.text((left + 8, top + portrait_size[1] + 39), detail, fill=MUTED, font=small_font)
    output = root / f"mpfb-identity-gate-{cohort}.png"
    sheet.save(output, optimize=True)
    return output


def body_sheet(root, data):
    entries = data["entries"]
    columns = 6
    portrait_size = (190, 304)
    tile_width = 208
    tile_height = 365
    rows = math.ceil(len(entries) / columns)
    header_height = 116
    sheet = Image.new("RGB", (columns * tile_width + 28, header_height + rows * tile_height + 24), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((22, 16), "MPFB2 broad-cohort body gate", fill=TEXT, font=font(34, True))
    draw.text((22, 66), "Same neutral presentation. Stature, mass, muscle, proportions, age and sex vary.", fill=MUTED, font=font(18))
    for index, entry in enumerate(entries):
        column = index % columns
        row = index // columns
        left = 14 + column * tile_width
        top = header_height + row * tile_height
        draw.rounded_rectangle((left, top, left + tile_width - 8, top + tile_height - 10), radius=10, fill=PANEL)
        image = Image.open(root / "broad" / f"{entry['id']}-body.png")
        sheet.paste(fitted(image, portrait_size), (left + 5, top + 5))
        draw.text((left + 7, top + portrait_size[1] + 12), f"{entry['id']} · {entry['sex'][0].upper()} · {entry['ageYears']}", fill=TEXT, font=font(17, True))
        draw.text((left + 7, top + portrait_size[1] + 37), entry["label"], fill=MUTED, font=font(14))
    output = root / "mpfb-identity-gate-bodies.png"
    sheet.save(output, optimize=True)
    return output


def image_vector(path):
    image = Image.open(path).convert("L")
    image = ImageOps.fit(image, (72, 88), method=Image.Resampling.LANCZOS)
    values = np.asarray(image, dtype=np.float64) / 255.0
    # The fixed dark background should not dominate the similarity score.
    values = np.where(values > 0.11, values, 0.0)
    vector = values.reshape(-1)
    norm = np.linalg.norm(vector)
    return vector / max(norm, 1e-12)


def image_metrics(root, cohort, entries):
    vectors = [image_vector(root / cohort / f"{entry['id']}-front.png") for entry in entries]
    similarities = []
    nearest = {}
    for index, vector in enumerate(vectors):
        best = None
        for other_index, other in enumerate(vectors):
            if index == other_index:
                continue
            similarity = float(np.dot(vector, other))
            if other_index > index:
                similarities.append(similarity)
            if best is None or similarity > best[0]:
                best = (similarity, entries[other_index]["id"])
        nearest[entries[index]["id"]] = {"id": best[1], "similarity": round(best[0], 6)}
    similarities.sort()
    return {
        "pairCount": len(similarities),
        "minimumSimilarity": round(similarities[0], 6),
        "medianSimilarity": round(similarities[len(similarities) // 2], 6),
        "maximumSimilarity": round(similarities[-1], 6),
        "nearDuplicatePairsAbove0.995": sum(value > 0.995 for value in similarities),
        "nearest": nearest,
    }


def main():
    args = arguments()
    root = Path(args.output_dir).resolve()
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    outputs = []
    for cohort, columns in (("narrow", 4), ("expanded", 4), ("broad", 4)):
        if cohort not in manifest["cohorts"]:
            continue
        data = manifest["cohorts"][cohort]
        data["images"] = image_metrics(root, cohort, data["entries"])
        outputs.append(paired_sheet(root, cohort, data, columns))
    if "broad" in manifest["cohorts"] and (root / "broad" / "B01-body.png").exists():
        outputs.append(body_sheet(root, manifest["cohorts"]["broad"]))
    manifest["contactSheets"] = [path.name for path in outputs]
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
