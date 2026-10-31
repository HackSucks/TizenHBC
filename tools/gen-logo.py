#!/usr/bin/env python3
"""Render the "the Tizen Homebrew Channel" logo.

The original Homebrew Channel wordmark is a soft-edged bold humanist sans with a
small "the" in front. Its letterforms match the Ubuntu typeface (Ubuntu Font
Licence 1.0, see tools/fonts), which is what this script uses, so the new logo
is real vector text rather than a re-used bitmap.

    python3 tools/gen-logo.py

Writes app/res/img/logo.png and app/res/img/logo_glow.png (a pre-blurred halo
that the intro fades in on every beat instead of using a CSS filter).
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "tools", "fonts")
OUT = os.path.join(ROOT, "app", "res", "img")

W = 2048                      # final width
SS = 2                        # supersampling
PAD_X, PAD_TOP, PAD_BOT = 60, 40, 90


def fnt(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def vgrad(size, top, bottom):
    w, h = size
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        col.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return col.resize((w, h))


def main():
    big = fnt("Ubuntu-Bold.ttf", 230 * SS)
    small = fnt("Ubuntu-Medium.ttf", 150 * SS)
    parts = [("the", small, "plain"), ("Tizen", big, "tint"), ("Homebrew", big, "plain"), ("Channel", big, "plain")]
    gap = 62 * SS

    # Measure and lay out on one baseline.
    d0 = ImageDraw.Draw(Image.new("L", (10, 10)))
    widths = [d0.textlength(t, font=f) for t, f, _ in parts]
    total = int(sum(widths) + gap * (len(parts) - 1))
    asc, desc = big.getmetrics()
    H = asc + desc
    base = asc

    mask_plain = Image.new("L", (total, H), 0)
    mask_tint = Image.new("L", (total, H), 0)
    x = 0
    for (t, f, kind), w in zip(parts, widths):
        target = mask_tint if kind == "tint" else mask_plain
        ImageDraw.Draw(target).text((x, base), t, font=f, fill=255, anchor="ls")
        x += w + gap

    both = ImageChops.lighter(mask_plain, mask_tint)
    bbox = both.getbbox()
    pad = (PAD_X * SS, PAD_TOP * SS, PAD_X * SS, PAD_BOT * SS)
    cw = bbox[2] - bbox[0] + pad[0] + pad[2]
    ch = bbox[3] - bbox[1] + pad[1] + pad[3]
    canvas_mask_p = Image.new("L", (cw, ch), 0)
    canvas_mask_t = Image.new("L", (cw, ch), 0)
    canvas_mask_p.paste(mask_plain.crop(bbox), (pad[0], pad[1]))
    canvas_mask_t.paste(mask_tint.crop(bbox), (pad[0], pad[1]))
    canvas_both = ImageChops.lighter(canvas_mask_p, canvas_mask_t)

    # Metallic white->grey fill (like the original), "Tizen" tinted toward the HBC cyan.
    grad_plain = vgrad((cw, ch), (255, 255, 255), (178, 188, 196))
    grad_tint = vgrad((cw, ch), (236, 252, 255), (96, 188, 224))
    fill = Image.composite(grad_tint, grad_plain, canvas_mask_t.point(lambda v: 255 if v > 127 else 0))
    # Soft bevel: bright top edge, darker bottom edge.
    up = ImageChops.offset(canvas_both, 0, -3 * SS)
    dn = ImageChops.offset(canvas_both, 0, 3 * SS)
    hi = ImageChops.subtract(canvas_both, up).filter(ImageFilter.GaussianBlur(1.2 * SS))
    lo = ImageChops.subtract(canvas_both, dn).filter(ImageFilter.GaussianBlur(1.2 * SS))

    logo = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    # drop shadow
    sh = canvas_both.filter(ImageFilter.GaussianBlur(9 * SS))
    shadow = Image.new("RGBA", (cw, ch), (0, 20, 40, 0))
    shadow.putalpha(sh.point(lambda v: int(v * 0.75)))
    logo.alpha_composite(ImageChops.offset(shadow, 0, 7 * SS))
    body = fill.convert("RGBA")
    body.putalpha(canvas_both)
    logo.alpha_composite(body)
    hl = Image.new("RGBA", (cw, ch), (255, 255, 255, 0)); hl.putalpha(hi.point(lambda v: int(v * 0.55)))
    logo.alpha_composite(hl)
    dk = Image.new("RGBA", (cw, ch), (20, 50, 70, 0)); dk.putalpha(lo.point(lambda v: int(v * 0.45)))
    logo.alpha_composite(dk)

    scale = W / cw
    final = logo.resize((W, max(1, round(ch * scale))), Image.LANCZOS)
    final.save(os.path.join(OUT, "logo.png"), optimize=True)
    print("logo.png", final.size)

    # Halo for beat flashes: logo centred in a canvas 1.2x wide and 3.2x tall so the
    # blur fades to nothing before the edge (no visible box when it is shown).
    gw, gh = int(cw * 1.2), int(ch * 3.2)
    big_mask = Image.new("L", (gw, gh), 0)
    big_mask.paste(canvas_both, ((gw - cw) // 2, (gh - ch) // 2))
    small = big_mask.resize((gw // 4, gh // 4), Image.LANCZOS)
    glow = small.filter(ImageFilter.GaussianBlur(ch / 4 * 0.55)).point(lambda v: min(255, int(v * 2.4)))
    gimg = Image.new("RGBA", glow.size, (110, 215, 255, 0))
    gimg.putalpha(glow)
    gimg.save(os.path.join(OUT, "logo_glow.png"), optimize=True)
    print("logo_glow.png", gimg.size)


def make_intro_logo():
    """Stacked flat-white wordmark for the intro (the / Tizen Homebrew / Channel),
    laid out like the original Wii intro logo. Writes app/res/img/logo_intro.png."""
    S = 2
    big = fnt("Ubuntu-Bold.ttf", 200 * S)
    mid = fnt("Ubuntu-Medium.ttf", 140 * S)
    small = fnt("Ubuntu-Medium.ttf", 120 * S)
    d0 = ImageDraw.Draw(Image.new("L", (10, 10)))
    main_w = d0.textlength("Tizen Homebrew", font=big)
    chan_w = d0.textlength("Channel", font=mid)
    pad = 60 * S
    cw = int(main_w + 2 * pad)
    y_the, y_main, y_chan = 150 * S, 330 * S, 490 * S
    ch = 560 * S + pad
    m = Image.new("L", (cw, ch), 0)
    d = ImageDraw.Draw(m)
    d.text((pad + main_w * 0.15, y_the + 60 * S), "the", font=small, fill=255, anchor="ls")
    d.text((pad, y_main + 60 * S), "Tizen Homebrew", font=big, fill=255, anchor="ls")
    d.text((pad + main_w * 0.30, y_chan + 40 * S), "Channel", font=mid, fill=255, anchor="ls")
    bbox = m.getbbox()
    m = m.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(cw, bbox[2] + pad), min(ch, bbox[3] + pad)))
    cw, ch = m.size
    logo = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sh = m.filter(ImageFilter.GaussianBlur(7 * S))
    shadow = Image.new("RGBA", (cw, ch), (0, 40, 80, 0))
    shadow.putalpha(sh.point(lambda v: int(v * 0.45)))
    logo.alpha_composite(ImageChops.offset(shadow, 0, 6 * S))
    body = Image.new("RGBA", (cw, ch), (255, 255, 255, 255))
    body.putalpha(m)
    logo.alpha_composite(body)
    W2 = 1400
    final = logo.resize((W2, round(ch * W2 / cw)), Image.LANCZOS)
    final.save(os.path.join(OUT, "logo_intro.png"), optimize=True)
    print("logo_intro.png", final.size)


if __name__ == "__main__":
    main()
    make_intro_logo()
