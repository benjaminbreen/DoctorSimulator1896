#!/usr/bin/env python3
"""Tile a run's winning frames into one sheet, captioned with their scores."""

import glob
import json
import os
import sys

from PIL import Image, ImageDraw

COLUMNS = 4
CELL_WIDTH = 420
CAPTION = 26
PAD = 8


def main(run_dir):
    stems = sorted(glob.glob(os.path.join(run_dir, "top-*.png")))
    if not stems:
        print(f"no frames in {run_dir}")
        return
    first = Image.open(stems[0])
    cell_height = round(CELL_WIDTH * first.height / first.width)
    rows = (len(stems) + COLUMNS - 1) // COLUMNS
    sheet = Image.new(
        "RGB",
        (COLUMNS * (CELL_WIDTH + PAD) + PAD, rows * (cell_height + CAPTION + PAD) + PAD),
        (18, 18, 20),
    )
    draw = ImageDraw.Draw(sheet)

    for index, png_path in enumerate(stems):
        column, row = index % COLUMNS, index // COLUMNS
        x = PAD + column * (CELL_WIDTH + PAD)
        y = PAD + row * (cell_height + CAPTION + PAD)
        sheet.paste(Image.open(png_path).resize((CELL_WIDTH, cell_height), Image.LANCZOS), (x, y))
        meta_path = png_path[:-4] + ".json"
        label = os.path.basename(png_path)
        if os.path.exists(meta_path):
            with open(meta_path) as handle:
                meta = json.load(handle)
            top_parts = sorted(meta["parts"].items(), key=lambda kv: -kv[1])[:3]
            label = f"{label[:-4]}  {meta['total']:.3f}  " + " ".join(
                f"{k}:{v:.2f}" for k, v in top_parts
            )
        draw.text((x + 2, y + cell_height + 6), label, fill=(190, 190, 195))

    out = os.path.join(run_dir, "contact-sheet.png")
    sheet.save(out)
    print(f"contact sheet: {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
