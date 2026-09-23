"""Subset Fusion Pixel (OFL) to the characters the Chinese copy uses.

Re-run after editing src/i18n/zh.ts or src/i18n/voice.zh.ts:
  python tools/subset_fonts.py
Source fonts: https://github.com/TakWolf/fusion-pixel-font releases, unzipped into art/fonts/{10px,12px}.
"""
import pathlib, re, shutil
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "art" / "fonts"
OUT = ROOT / "public" / "fonts"

text = ""
for f in ["src/i18n/zh.ts", "src/i18n/voice.zh.ts"]:
    text += (ROOT / f).read_text(encoding="utf-8")
chars = set(re.sub(r"\s", "", text))
chars |= {chr(c) for c in range(32, 127)}
chars |= set("·—…“”‘’「」『』（）：；，。！？、%")
unicodes = sorted(ord(c) for c in chars)
print(len(unicodes), "code points")

for size in ("12px", "10px"):
    src = SRC / size / f"fusion-pixel-{size}-proportional-zh_hans.otf.woff2"
    dst = OUT / f"fusion{size.replace('px', '')}.woff2"
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    subset.save_font(font, str(dst), opts)
    print(dst.name, dst.stat().st_size, "bytes")

licenses = SRC / "12px" / "LICENSES"
if licenses.exists():
    shutil.copytree(licenses, OUT / "fusion-pixel-LICENSES", dirs_exist_ok=True)
