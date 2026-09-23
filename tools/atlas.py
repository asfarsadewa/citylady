"""Build Vela's animation atlas from the GPT Image sprite sheets in art/sprite.

Frames are sliced by alpha (rows, then empty-column gaps), scaled by one shared factor,
anchored on torso centre + feet baseline, quantized to one shared palette and packed into
public/art/vela_atlas.png with src/data/vela_atlas.json (clip -> frame rects + anchors).
"""
import json, pathlib
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "art" / "sprite"
TARGET_H = 88          # in-game height of a standing Vela, feet to crown
CELL_W, CELL_H = 150, 112
AX, AY = 75, 106       # anchor inside each cell: torso centre x, feet y

# upright frames of each sheet (start, count) used to calibrate its scale, so Vela keeps one size across clips
CALIBRATE = {
    "vela_sheet_v1.png": (8, 6),
    "vela_walk2_b.png": (0, 8),
    "vela_run.png": (8, 4),
    "vela_extra.png": (10, 2),
    "vela_hair.png": (0, 8),
}
# sheet -> list of (row, expected frames) and clip assignment in reading order
SHEETS = {
    "vela_sheet_v1.png": [8, 6],
    "vela_walk2_b.png": [8],
    "vela_run.png": [8, 4],
    "vela_extra.png": [6, 6],
    "vela_hair.png": [8, 8],
}
CLIPS = {
    "idle": ("vela_sheet_v1.png", 8, 6),
    "walk": ("vela_walk2_b.png", 0, 8),
    "run": ("vela_run.png", 0, 8),
    "turn": ("vela_run.png", 8, 4),
    "toss": ("vela_extra.png", 0, 6),
    "enter": ("vela_extra.png", 6, 4),
    "read": ("vela_extra.png", 10, 2),
    "wind": ("vela_hair.png", 0, 8),
    "stop": ("vela_hair.png", 8, 4),
    "start": ("vela_hair.png", 12, 4),
}


def slice_sheet(path, rows):
    """Split a sheet into frames with connected components; small blobs join the nearest frame."""
    from scipy import ndimage
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    alpha = a[..., 3] >= 128
    h = a.shape[0]
    # row boundaries: the widest run of empty rows near each expected split (figures may cross the midline)
    occupied = alpha.any(axis=1)
    bounds = [0]
    for i in range(1, len(rows)):
        exp = h * i // len(rows)
        lo, hi = exp - h // 4, exp + h // 4
        best, run_start, best_mid = 0, None, exp
        for y in range(lo, hi + 1):
            if not occupied[y] and run_start is None:
                run_start = y
            if (occupied[y] or y == hi) and run_start is not None:
                if y - run_start > best:
                    best, best_mid = y - run_start, (run_start + y) // 2
                run_start = None
        bounds.append(best_mid)
    bounds.append(h)
    frames = []
    for r, count in enumerate(rows):
        y0 = bounds[r]
        band = alpha[y0:bounds[r + 1]]
        lab, n = ndimage.label(band)
        sizes = ndimage.sum(band, lab, range(1, n + 1))
        order = np.argsort(sizes)[::-1]
        big = sorted(order[:count] + 1, key=lambda k: ndimage.center_of_mass(band, lab, k)[1])
        cents = [ndimage.center_of_mass(band, lab, k)[1] for k in big]
        owner = np.zeros(n + 1, int)
        for k in range(1, n + 1):
            if sizes[k - 1] < 30:
                continue
            cx = ndimage.center_of_mass(band, lab, k)[1]
            owner[k] = big[int(np.argmin([abs(cx - c) for c in cents]))]
        for k in big:
            mask = np.isin(lab, [j for j in range(1, n + 1) if owner[j] == k])
            ys = np.where(mask.any(axis=1))[0]
            xs = np.where(mask.any(axis=0))[0]
            crop = a[y0 + ys[0]: y0 + ys[-1] + 1, xs[0]: xs[-1] + 1].copy()
            crop[..., 3] = np.where(mask[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1], crop[..., 3], 0)
            frames.append(Image.fromarray(crop, "RGBA"))
    return frames


def torso_x(frame):
    a = np.asarray(frame)[..., 3] >= 128
    h = a.shape[0]
    band = a[int(h * 0.30):int(h * 0.42)]
    # the torso is the rightmost solid mass of the chest band (hair trails to the left)
    cols = np.where(band.sum(axis=0) > band.shape[0] * 0.6)[0]
    if len(cols) == 0:
        cols = np.where(band.any(axis=0))[0]
    right = cols.max()
    return right - (cols.max() - cols.min()) * 0.35 if len(cols) > 8 else cols.mean()


def main():
    all_frames = {n: slice_sheet(SRC / n, rows) for n, rows in SHEETS.items()}
    for n, fr in all_frames.items():
        print(n, len(fr), "frames")
    scales = {}
    for n, (st, cnt) in CALIBRATE.items():
        scales[n] = TARGET_H / np.median([f.height for f in all_frames[n][st:st + cnt]])
    print("sheet scales", {k: round(v, 4) for k, v in scales.items()})
    order, meta = [], {"cell": [CELL_W, CELL_H], "anchor": [AX, AY], "clips": {}}
    for clip, (sheet, start, count) in CLIPS.items():
        idxs = []
        scale = scales[sheet]
        for f in all_frames[sheet][start:start + count]:
            tx = torso_x(f) if clip != "enter" else f.width / 2
            w, h = max(1, round(f.width * scale)), max(1, round(f.height * scale))
            small = f.resize((w, h), Image.Resampling.BOX)
            order.append((small, tx * scale))
            idxs.append(len(order) - 1)
        meta["clips"][clip] = idxs
    # pack into a grid and quantize with a shared palette
    cols = 10
    rows = (len(order) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    for i, (small, tx) in enumerate(order):
        cx, cy = (i % cols) * CELL_W, (i // cols) * CELL_H
        x = round(cx + AX - tx)
        y = cy + AY - small.height
        cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        cell.paste(small, (x - cx, y - cy), small)  # paste clips at the cell edges
        atlas.alpha_composite(cell, (cx, cy))
    alpha = atlas.getchannel("A").point(lambda v: 255 if v >= 110 else 0)
    rgb = atlas.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=2))
    q = rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    q.putalpha(alpha)
    out = ROOT / "public" / "art" / "vela_atlas.png"
    q.save(out, optimize=True)
    meta["cols"] = cols
    meta["count"] = len(order)
    (ROOT / "src" / "data" / "vela_atlas.json").write_text(json.dumps(meta, indent=1))
    print("atlas", q.size, "frames", len(order))


if __name__ == "__main__":
    main()
