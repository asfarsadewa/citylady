"""Render the 1200x630 social share card (public/og.png) and the touch icon.

The card is composed at quarter size with non-antialiased pixel fonts, then scaled 4x
with nearest-neighbour so every pixel stays crisp.
Needs art/raw/cine_rooftop.png and TTF copies of the fonts in art/og (see the README).
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
W, H = 300, 158  # quarter of 1200x630 (632 before the final crop)
CRIMSON, PAPER, GOLD, INK = (216, 58, 71), (244, 233, 220), (242, 193, 78), (11, 7, 20)

art = Image.open(ROOT / "art/raw/cine_rooftop.png").convert("RGB")
art = ImageOps.mirror(art)  # put Vela right of centre, leaving the left for the title
art = art.crop((0, 0, int(art.width * 0.9), art.height))
scale = max(W / art.width, H / art.height)
art = art.resize((round(art.width * scale), round(art.height * scale)), Image.Resampling.BOX)
art = art.crop((0, (art.height - H) // 2, W, (art.height - H) // 2 + H))
art = art.quantize(64, dither=Image.Dither.NONE).convert("RGB")

# left-side shade so the title reads over the city
shade = Image.new("L", (W, H))
for x in range(W):
    a = max(0, min(215, int(215 * (1 - x / (W * 0.62)))))
    for y in range(H):
        shade.putpixel((x, y), a)
card = Image.composite(Image.new("RGB", (W, H), INK), art, shade)

d = ImageDraw.Draw(card)
d.fontmode = "1"  # hard pixel edges
big = ImageFont.truetype(str(ROOT / "art/og/jersey10.ttf"), 40)
small = ImageFont.truetype(str(ROOT / "art/og/tiny5.ttf"), 10)
for (x, y, s, col) in [(16, 22, "CITY", PAPER), (16, 58, "LADY", CRIMSON)]:
    d.text((x + 2, y + 2), s, font=big, fill=(26, 0, 6))
    d.text((x, y), s, font=big, fill=col)
d.rectangle((17, 104, 150, 104), fill=GOLD)
d.text((17, 110), "TEN NIGHTS. TEN DISTRICTS.", font=small, fill=GOLD)
d.text((17, 121), "ONE LEDGER.", font=small, fill=GOLD)

# a thin VCR frame and a PLAY mark, matching the game's pre-title screen
d.text((W - 44, 8), "PLAY", font=small, fill=(232, 240, 255))
d.polygon([(W - 16, 9), (W - 16, 17), (W - 11, 13)], fill=(232, 240, 255))

out = card.resize((W * 4, H * 4), Image.Resampling.NEAREST).crop((0, 0, 1200, 630))
out.save(ROOT / "public/og.png", optimize=True)

# 180x180 touch icon: Vela's face, pixel-sharp
face = Image.open(ROOT / "public/art/vela_face.png").convert("RGB").crop((30, 10, 210, 190))
face.resize((180, 180), Image.Resampling.NEAREST).save(ROOT / "public/apple-touch-icon.png", optimize=True)
print("og.png", out.size, "apple-touch-icon.png")
