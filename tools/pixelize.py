"""Turn raw Qwen renders (art/raw) into game-scale pixel art (public/art) plus src/data/artmeta.json.

- skies: 853x360, 64 colours
- shops/fillers: magenta keyed, cropped, 230 px tall (fillers 190), 56 colours, sign board rectangle detected
- portraits: 240x240, 48 colours
- cinematics: 720x402, 64 colours
- vela_shoulder: keyed, 330 px tall
usage: python tools/pixelize.py [name ...]
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "art" / "raw"
OUT = ROOT / "public" / "art"
META = ROOT / "src" / "data" / "artmeta.json"


def quantize(im: Image.Image, colors: int) -> Image.Image:
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    rgb = rgba.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    q = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = q.convert("RGBA")
    out.putalpha(alpha.point(lambda a: 255 if a >= 128 else 0))
    return out


def key_magenta(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.int32)
    h, w, _ = a.shape
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magentaish = (r > g + 60) & (b > g + 60)
    cand = (dist < 70) | (magentaish & (dist < 140))
    # flood fill from the border so interior magenta-like pixels (neon) survive
    mask = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not mask[y, x]:
                mask[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not mask[y, x]:
                mask[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True; q.append((ny, nx))
    # despill: pull magenta fringe toward neutral
    out = a.copy()
    edge = ~mask & magentaish & (dist < 200)
    out[edge, 0] = np.minimum(r[edge], g[edge] + 30)
    out[edge, 2] = np.minimum(b[edge], g[edge] + 30)
    rgba = np.dstack([out.clip(0, 255).astype(np.uint8), np.where(mask, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def crop_alpha(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").point(lambda v: 255 if v > 0 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def find_sign(im: Image.Image):
    """Largest flat, bright, low-texture rectangle in the upper 70% of a facade (the blank sign board)."""
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    h, w = a.shape[:2]
    lum = a[..., :3].mean(axis=2)
    gy = np.abs(np.diff(lum, axis=0, prepend=lum[:1]))
    gx = np.abs(np.diff(lum, axis=1, prepend=lum[:, :1]))
    flat = (gx + gy < 14) & (lum > 95) & (a[..., 3] > 0)
    flat[int(h * 0.72):] = False
    seen = np.zeros_like(flat)
    best = None
    for y in range(h):
        for x in range(w):
            if flat[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True
                pts = []
                while q:
                    cy, cx = q.popleft(); pts.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and flat[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                if len(pts) > (best[0] if best else 0):
                    ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
                    best = (len(pts), min(xs), min(ys), max(xs), max(ys))
    if not best or best[0] < 300:
        return None
    n, x0, y0, x1, y1 = best
    if (x1 - x0) < 40 or n < 0.45 * (x1 - x0 + 1) * (y1 - y0 + 1):
        return None
    return [int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)]


def resize_h(im, h):
    w = max(1, round(im.width * h / im.height))
    return im.resize((w, h), Image.Resampling.BOX)


def process(name: str, meta: dict):
    src = RAW / f"{name}.png"
    im = Image.open(src).convert("RGBA")
    info = {}
    if name.startswith("sky_"):
        out = quantize(im.resize((853, 360), Image.Resampling.BOX), 64)
    elif name.startswith("shop_"):
        keyed = crop_alpha(key_magenta(im))
        filler = name in ("shop_flat", "shop_shutter", "shop_alley")
        small = resize_h(keyed, 190 if filler else 230)
        out = quantize(small, 56)
        sign = None if filler else find_sign(out)
        info = {"w": out.width, "h": out.height, "sign": sign}
    elif name == "vela_shoulder":
        out = quantize(resize_h(crop_alpha(key_magenta(im)), 330), 48)
        info = {"w": out.width, "h": out.height}
    elif name.startswith("cine_"):
        out = quantize(im.resize((720, 402), Image.Resampling.BOX), 64)
    else:  # portraits
        out = quantize(im.resize((240, 240), Image.Resampling.BOX), 48)
    OUT.mkdir(parents=True, exist_ok=True)
    out.save(OUT / f"{name}.png", optimize=True)
    if info:
        meta[name] = info
    print(name, out.size, info.get("sign", ""))


if __name__ == "__main__":
    meta = json.loads(META.read_text()) if META.exists() else {}
    names = sys.argv[1:] or sorted(p.stem for p in RAW.glob("*.png") if p.stem not in ("vela_sheet",))
    for n in names:
        try:
            process(n, meta)
        except Exception as e:
            print("FAIL", n, e)
    META.parent.mkdir(parents=True, exist_ok=True)
    META.write_text(json.dumps(meta, indent=1))
