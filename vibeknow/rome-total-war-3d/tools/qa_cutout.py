"""QA: composite cutout gear icons onto dark bg + parchment bg, side by side
with original, so we can see white halos or over-cut."""
import os, glob
from PIL import Image

GEAR_ORIG = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gear')
GEAR_CUT  = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gear_cutout')
OUT       = os.path.join(os.path.dirname(__file__), '..', 'assets', '_qa_cutout.png')

SAMPLES = [
    'scutum', 'montefortino', 'gladius', 'javelin', 'sarissa',
    'round-shield', 'silver-shield', 'linen-cuirass', 'coarse-tunic',
    'horse', 'war-dog', 'elephant', 'sling', 'cataphract-plate',
    'beast-hood', 'pelta',
]

CELL = 160
PAD = 8
COLS = 4
ROWS = (len(SAMPLES) + COLS - 1) // COLS

# two rows of panels: top = on dark bg, bottom = on parchment-ish bg
W = COLS * (CELL + PAD) + PAD
H = ROWS * 2 * (CELL + PAD) + PAD + 30
canvas = Image.new('RGB', (W, H), (40, 36, 32))

from PIL import ImageDraw
d = ImageDraw.Draw(canvas)
d.text((PAD, 4), 'TOP: on dark bg   BOTTOM: on light parchment', fill=(200, 200, 200))

dark_bg = (30, 26, 22)
light_bg = (220, 210, 190)

for i, name in enumerate(SAMPLES):
    r = i // COLS
    c = i % COLS
    x0 = PAD + c * (CELL + PAD)
    y0 = PAD + 20 + r * 2 * (CELL + PAD)

    orig = Image.open(os.path.join(GEAR_ORIG, name + '.webp')).convert('RGBA')
    cut  = Image.open(os.path.join(GEAR_CUT,  name + '.webp')).convert('RGBA')

    # top: cutout on dark
    top = Image.new('RGBA', (CELL, CELL), dark_bg + (255,))
    top.alpha_composite(cut.resize((CELL, CELL)), (0, 0))
    canvas.paste(top, (x0, y0))

    # bottom: cutout on light
    bot = Image.new('RGBA', (CELL, CELL), light_bg + (255,))
    bot.alpha_composite(cut.resize((CELL, CELL)), (0, 0))
    canvas.paste(bot, (x0, y0 + CELL + PAD))

canvas.save(OUT)
print(f'Saved QA sheet -> {OUT}')
