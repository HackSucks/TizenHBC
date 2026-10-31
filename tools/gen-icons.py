#!/usr/bin/env python3
"""Generate the Tizen Homebrew Channel icon set.

Run from the repository root:
    python3 tools/gen-icons.py

Everything is drawn at 2x and down-sampled, titles are auto-fitted so nothing
can clip, and all text uses the same Ubuntu typeface as the logo.
No network access is required.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "res", "icons")
FONTS = os.path.join(ROOT, "tools", "fonts")
BOLD = os.path.join(FONTS, "Ubuntu-Bold.ttf")
MED = os.path.join(FONTS, "Ubuntu-Medium.ttf")

BANNER = (512, 192)
SQUARE = (512, 512)
SS = 2


def font(path, size):
    return ImageFont.truetype(path, int(size))


def fit(draw, text, path, max_w, max_size, min_size=12, spacing=0):
    size = max_size
    while size > min_size:
        f = font(path, size)
        if draw.textlength(text, font=f) + spacing * max(0, len(text) - 1) <= max_w:
            return f
        size -= 2
    return font(path, min_size)


def spaced(draw, xy, text, f, fill, spacing):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill, anchor="ls")
        x += draw.textlength(ch, font=f) + spacing


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def diag_gradient(size, c0, c1):
    w, h = size
    g = Image.new("RGB", (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = min(1.0, max(0.0, (x / w * 0.35 + y / h * 0.65)))
            px[x, y] = lerp(c0, c1, t)
    return g


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=r, fill=255)
    return m


def bubbles(layer, seeds, color=(255, 255, 255)):
    d = ImageDraw.Draw(layer)
    for (cx, cy, r, a) in seeds:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color + (a,), width=max(2, r // 9))
        d.arc([cx - r * .72, cy - r * .72, cx + r * .72, cy + r * .72], 205, 300,
              fill=color + (min(255, a + 60),), width=max(2, r // 10))


def finish(im, radius, outline=(190, 235, 255, 110)):
    """Glass highlight + border + rounded corners."""
    w, h = im.size
    im = im.convert("RGBA")
    shine = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shine)
    sd.rounded_rectangle([3 * SS, 3 * SS, w - 3 * SS, h * 0.48], radius=radius - 3 * SS, fill=(255, 255, 255, 26))
    im.alpha_composite(shine)
    ImageDraw.Draw(im).rounded_rectangle([1, 1, w - 2, h - 2], radius=radius, outline=outline, width=2 * SS)
    im.putalpha(rounded_mask(im.size, radius))
    return im


def badge(base, box, accent, glyph):
    """Rounded glass tile on the left that holds a glyph drawn by `glyph(draw, box)`."""
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=26 * SS, fill=lerp((4, 20, 30), accent, 0.16) + (235,),
                        outline=accent + (255,), width=3 * SS)
    glow = layer.filter(ImageFilter.GaussianBlur(10 * SS))
    base.alpha_composite(Image.eval(glow, lambda v: v))
    base.alpha_composite(layer)
    glyph(ImageDraw.Draw(base), box, accent)


def banner(name, title, subtitle, accent, c0, c1, glyph, seed=0):
    W, H = BANNER[0] * SS, BANNER[1] * SS
    im = diag_gradient((W, H), c0, c1).convert("RGBA")
    deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    seeds = []
    for i in range(7):
        r = (10 + ((i * 7 + seed * 3) % 22)) * SS
        seeds.append(((60 + i * 150 + seed * 41) % (W - 20), (30 + (i * 83 + seed * 29) % (H - 60)), r, 36))
    bubbles(deco, seeds)
    im.alpha_composite(deco)
    pad = 22 * SS
    box = (pad, pad, pad + (H - 2 * pad), H - pad)       # square tile
    badge(im, box, accent, glyph)
    d = ImageDraw.Draw(im)
    tx = box[2] + 24 * SS
    avail = W - tx - 22 * SS
    ft = fit(d, title, BOLD, avail, 64 * SS, 22 * SS)
    d.text((tx + 2 * SS, H * 0.55 + 3 * SS), title, font=ft, fill=(0, 0, 0, 150), anchor="ls")
    d.text((tx, H * 0.55), title, font=ft, fill=(246, 252, 255, 255), anchor="ls")
    fs = fit(d, subtitle, MED, avail, 22 * SS, 11 * SS, spacing=3 * SS)
    spaced(d, (tx, H * 0.55 + 36 * SS), subtitle, fs, accent + (255,), 3 * SS)
    out = finish(im, 22 * SS).resize(BANNER, Image.LANCZOS)
    save(out, name)


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, "PNG", optimize=True)
    print("wrote", os.path.relpath(path, ROOT), im.size)
    return path


# ── glyphs ────────────────────────────────────────────────────────────────

def g_welcome(d, box, accent):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    r = (box[2] - box[0]) * 0.30
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=accent + (255,), width=5 * SS)
    t = r * 0.52
    d.polygon([(cx - t * .6, cy - t), (cx - t * .6, cy + t), (cx + t * 1.05, cy)], fill=(240, 252, 255, 255))


def g_programs(d, box, accent):
    cols = [(255, 112, 140), (255, 196, 84), (110, 232, 164), (96, 204, 255)]
    s = (box[2] - box[0])
    gap = s * 0.07
    cell = (s * 0.62 - gap) / 2
    x0 = box[0] + s * 0.19
    y0 = box[1] + s * 0.19
    for i in range(4):
        x = x0 + (i % 2) * (cell + gap)
        y = y0 + (i // 2) * (cell + gap)
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.22, fill=cols[i] + (255,))
        d.rounded_rectangle([x + cell * .2, y + cell * .18, x + cell * .8, y + cell * .42], radius=cell * .1,
                            fill=(255, 255, 255, 70))


def g_settings(d, box, accent):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    R = (box[2] - box[0]) * 0.32
    pts = []
    teeth = 8
    for i in range(teeth * 4):
        a = i * 2 * math.pi / (teeth * 4) - math.pi / (teeth * 4)
        k = i % 4
        rad = R * 1.0 if k in (1, 2) else R * 0.80
        pts.append((cx + math.cos(a) * rad, cy + math.sin(a) * rad))
    d.polygon(pts, fill=(214, 226, 238, 255))
    d.ellipse([cx - R * .58, cy - R * .58, cx + R * .58, cy + R * .58], fill=(10, 20, 30, 255))
    d.ellipse([cx - R * .30, cy - R * .30, cx + R * .30, cy + R * .30], fill=accent + (255,))


def g_about(d, box, accent):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    r = (box[2] - box[0]) * 0.31
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent + (255,))
    f = font(BOLD, r * 1.55)
    d.text((cx, cy + r * 0.56), "i", font=f, fill=(6, 30, 44, 255), anchor="ms")


def g_tv(d, box, accent):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    s = box[2] - box[0]
    w, h = s * 0.66, s * 0.46
    d.line([(cx - w * .18, cy - h / 2), (cx - w * .34, cy - h / 2 - s * .1)], fill=accent + (255,), width=4 * SS)
    d.line([(cx + w * .18, cy - h / 2), (cx + w * .34, cy - h / 2 - s * .1)], fill=accent + (255,), width=4 * SS)
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=s * .06,
                        fill=(6, 18, 26, 255), outline=accent + (255,), width=4 * SS)
    f = font(BOLD, h * 0.62)
    d.text((cx - w * .34, cy + h * .17), ">_", font=f, fill=(120, 238, 170, 255), anchor="ls")
    d.line([(cx - w * .22, cy + h / 2 + s * .07), (cx + w * .22, cy + h / 2 + s * .07)], fill=accent + (255,), width=4 * SS)


def g_fastfetch(d, box, accent):
    """Terminal window: a block logo on the left, key/value lines on the right."""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    s = box[2] - box[0]
    w, h = s * 0.70, s * 0.56
    x0, y0 = cx - w / 2, cy - h / 2
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=s * .06, fill=(22, 12, 4, 255),
                        outline=accent + (255,), width=4 * SS)
    d.line([(x0, y0 + h * .17), (x0 + w, y0 + h * .17)], fill=accent + (255,), width=3 * SS)
    for i, c in enumerate([(255, 96, 96), (255, 200, 80), (110, 220, 140)]):
        r = s * .018
        d.ellipse([x0 + w * .07 + i * s * .06 - r, y0 + h * .085 - r, x0 + w * .07 + i * s * .06 + r, y0 + h * .085 + r], fill=c + (255,))
    lx, ly, lw = x0 + w * .08, y0 + h * .32, w * .26
    for k, c in enumerate([(255, 176, 80), (255, 120, 60), (255, 220, 140)]):
        d.rounded_rectangle([lx, ly + k * h * .2, lx + lw, ly + k * h * .2 + h * .15], radius=s * .02, fill=c + (255,))
    tx = x0 + w * .44
    for k, ww in enumerate([.46, .38, .50]):
        yy = y0 + h * .34 + k * h * .2
        d.rounded_rectangle([tx, yy, tx + w * .12, yy + h * .08], radius=s * .01, fill=accent + (255,))
        d.rounded_rectangle([tx + w * .15, yy, tx + w * (.15 + ww * .6), yy + h * .08], radius=s * .01, fill=(235, 225, 214, 255))


def make_app_icon():
    W = SQUARE[0] * SS
    im = Image.new("RGB", (W, W))
    px = im.load()
    for y in range(W):
        t = y / W
        c = lerp((16, 96, 132), (3, 16, 30), t)
        for x in range(W):
            px[x, y] = c
    im = im.convert("RGBA")
    deco = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    bubbles(deco, [(110, 150, 34, 70), (880, 220, 52, 60), (150, 820, 60, 56), (900, 840, 30, 70),
                   (500, 90, 22, 60), (820, 520, 26, 50), (200, 520, 20, 56)])
    im.alpha_composite(deco)
    d = ImageDraw.Draw(im)
    cx = cy = W / 2
    r = W * 0.37
    halo = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([cx - r, cy - r, cx + r, cy + r], fill=(120, 220, 255, 150))
    im.alpha_composite(halo.filter(ImageFilter.GaussianBlur(34 * SS)))
    ring = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(10, 60, 84, 215), outline=(170, 240, 255, 255), width=8 * SS)
    rd.arc([cx - r * .86, cy - r * .86, cx + r * .86, cy + r * .86], 200, 300, fill=(255, 255, 255, 210), width=12 * SS)
    im.alpha_composite(ring)
    d = ImageDraw.Draw(im)
    inner = r * 1.5
    fh = fit(d, "HBC", BOLD, inner, 400 * SS)
    d.text((cx + 3 * SS, cy + 38 * SS + 5 * SS), "HBC", font=fh, fill=(0, 0, 0, 150), anchor="ms")
    d.text((cx, cy + 38 * SS), "HBC", font=fh, fill=(250, 254, 255, 255), anchor="ms")
    fs = fit(d, "TIZEN", MED, r * 1.1, 60 * SS, 20 * SS, spacing=10 * SS)
    tw = sum(d.textlength(ch, font=fs) for ch in "TIZEN") + 10 * SS * 4
    spaced(d, (cx - tw / 2, cy + r * 0.62), "TIZEN", fs, (150, 232, 255, 255), 10 * SS)
    full = im.resize(SQUARE, Image.LANCZOS)
    rounded = finish(im, 104 * SS).resize(SQUARE, Image.LANCZOS)
    save(rounded, "app-icon.png")
    # Tizen's own app icon is a plain square; the launcher masks it.
    full.convert("RGB").save(os.path.join(ROOT, "app", "icon.png"), optimize=True)
    print("wrote app/icon.png", SQUARE)


def main():
    os.makedirs(OUT, exist_ok=True)
    make_app_icon()
    banner("welcome.png", "Welcome", "START HERE", (110, 226, 255), (14, 74, 104), (3, 16, 28), g_welcome, 1)
    banner("programs.png", "Programs", "BROWSE & INSTALL", (190, 160, 255), (52, 36, 104), (10, 8, 26), g_programs, 2)
    banner("settings.png", "Settings", "SERVICE · AUDIO · VIEW", (170, 200, 228), (46, 56, 76), (10, 14, 22), g_settings, 3)
    banner("about.png", "About", "VERSION & LICENSES", (110, 226, 255), (14, 80, 108), (3, 16, 28), g_about, 4)
    banner("tvfetch.png", "TVFetch", "SYSTEM INFO", (120, 238, 170), (14, 66, 70), (3, 18, 24), g_tv, 5)
    banner("fastfetch.png", "Fastfetch", "SYSTEM INFO", (255, 176, 80), (92, 52, 14), (24, 12, 4), g_fastfetch, 6)
    # Bundled programs ship their own banner as icon.png.
    import shutil
    for prog in ("tvfetch", "fastfetch"):
        shutil.copyfile(os.path.join(OUT, prog + ".png"), os.path.join(ROOT, "programs", prog, "icon.png"))


if __name__ == "__main__":
    main()
