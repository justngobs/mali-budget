"""Draws the app icons (PNG) to match app/icons/icon.svg. Run: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
TOP = (29, 35, 72)      # #1d2348
BOTTOM = (42, 91, 214)  # #2a5bd6


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return img


def bars(draw, size, scale=1.0):
    # Bars on a 512 grid, optionally shrunk toward the centre (for the maskable safe zone).
    def tx(v):
        return (v - 256) * scale * size / 512 + size / 2
    spec = [(132, 276, 196, 388, 140), (224, 204, 288, 388, 205), (316, 124, 380, 388, 255)]
    for x0, y0, x1, y1, alpha in spec:
        r = 32 * scale * size / 512
        draw.rounded_rectangle([tx(x0), tx(y0), tx(x1), tx(y1)], radius=r, fill=(255, 255, 255, alpha))


def make(size, rounded=True, scale=1.0):
    big = size * 4
    base = gradient(big).convert("RGBA")
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    bars(ImageDraw.Draw(layer), big, scale)
    base = Image.alpha_composite(base, layer)
    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=round(big * 116 / 512), fill=255)
        out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        out.paste(base, (0, 0), mask)
        base = out
    return base.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
make(192).save(OUT / "icon-192.png")
make(512).save(OUT / "icon-512.png")
make(512, rounded=False, scale=0.72).save(OUT / "icon-maskable-512.png")
make(180, rounded=False, scale=0.86).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
