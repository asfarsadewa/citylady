"""Build the pedestrian atlas (public/art/npc_atlas.png + src/data/npc_atlas.json).

Each sheet row is one character. Every row is scaled to that character's own height
(umbrellas and hats add to the frame height, so targets differ), anchored on the hips
and feet, and all frames share one quantized palette.
usage: <python with scipy> tools/npc_atlas.py
"""
import json, pathlib
import numpy as np
from PIL import Image, ImageFilter
from atlas import slice_sheet, SRC, ROOT

CELL_W, CELL_H = 150, 130
AX, AY = 75, 124
# (sheet, row) -> character id and spawn tags.
# Walkers use one-row walk sheets (walk_<id>.png) drawn with explicit contact/down/passing/up
# frames per leg: the first 2x8 sheets repeated one scissor stride, so the feet never swapped.
CHARS = [
    ("walk_umbrella_man.png", 0, "umbrella_man", ["wet"]),
    ("walk_fur_lady.png", 0, "fur_lady", []),
    ("walk_grocer.png", 0, "grocer", []),
    ("walk_raincoat.png", 0, "raincoat", ["wet"]),
    ("walk_docker.png", 0, "docker", []),
    ("walk_suit.png", 0, "suit", []),
    ("npc_d.png", 0, "smoker", ["idle"]),
    ("npc_d.png", 1, "cat", ["cat"]),
]
# person height in px when standing (Vela is 88): targets for the full frame are derived below
PERSON = {"umbrella_man": 90, "fur_lady": 82, "grocer": 86, "raincoat": 80, "docker": 92, "suit": 88, "smoker": 88, "cat": 26}


def hip_x(frame):
    a = np.asarray(frame)[..., 3] >= 128
    h = a.shape[0]
    band = a[int(h * 0.55):int(h * 0.72)]
    xs = np.where(band.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2 if len(xs) else frame.width / 2


def person_height(frame, cid):
    """Frame height minus what sits above the head (umbrella canopy): measured as the first row
    whose opaque width drops below 45% of the widest canopy row, for umbrella carriers."""
    if cid not in ("umbrella_man", "raincoat"):
        return frame.height
    a = np.asarray(frame)[..., 3] >= 128
    widths = a.sum(axis=1)
    top = int(np.argmax(widths[: int(len(widths) * 0.4)]))  # canopy's widest row
    below = np.where(widths[top:] < widths[top] * 0.45)[0]
    head_top = top + (below[0] if len(below) else 0)
    return frame.height - head_top * 0.6  # the head sits partly under the canopy


def main():
    sheets = {}
    for sheet, *_ in CHARS:
        if sheet not in sheets:
            sheets[sheet] = slice_sheet(SRC / sheet, [8] if sheet.startswith("walk_") else [8, 8])
            print(sheet, len(sheets[sheet]), "frames")
    order, meta = [], {"cell": [CELL_W, CELL_H], "anchor": [AX, AY], "chars": {}}
    for sheet, row, cid, tags in CHARS:
        frames = sheets[sheet][row * 8:(row + 1) * 8]
        scale = PERSON[cid] / np.median([person_height(f, cid) for f in frames])
        idxs = []
        for f in frames:
            small = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.Resampling.BOX)
            order.append((small, hip_x(f) * scale))
            idxs.append(len(order) - 1)
        meta["chars"][cid] = {"frames": idxs, "tags": tags}
    cols = 8
    rows = (len(order) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    for i, (small, hx) in enumerate(order):
        cx, cy = (i % cols) * CELL_W, (i // cols) * CELL_H
        cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        cell.paste(small, (round(AX - hx), AY - small.height), small)
        atlas.alpha_composite(cell, (cx, cy))
    alpha = atlas.getchannel("A").point(lambda v: 255 if v >= 110 else 0)
    # drop specks left behind where touching figures were cut apart
    from scipy import ndimage
    solid = np.asarray(alpha) > 0
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    specks = np.isin(lab, np.where(sizes < 4)[0] + 1)
    alpha = Image.fromarray(np.where(specks, 0, np.asarray(alpha)).astype(np.uint8), "L")
    rgb = atlas.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=2))
    q = rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    q.putalpha(alpha)
    q.save(ROOT / "public" / "art" / "npc_atlas.png", optimize=True)
    meta["cols"] = cols
    (ROOT / "src" / "data" / "npc_atlas.json").write_text(json.dumps(meta, indent=1))
    print("npc atlas", q.size, "frames", len(order))


if __name__ == "__main__":
    main()
