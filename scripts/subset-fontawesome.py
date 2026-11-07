#!/usr/bin/env python3
"""Regenerate the subset Font Awesome woff2 files the pages actually load.

assets/webfonts/fa-solid-900.woff2 and fa-regular-400.woff2 contain only the glyphs the
site uses (found by scanning every *.html and assets/js/main.js for fa-* classes, plus the
CSS ::before codepoints below). The full fonts stay in the repo as the .ttf files (browsers
never load them) and are the source this script subsets from.

Run it whenever a page starts using a new icon:

    pip install fonttools brotli
    python3 scripts/subset-fontawesome.py
"""
import glob
import os
import re
import sys

from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Codepoints used by main.css ::before rules (accordion minus/plus and close icon).
EXTRA = {0x2B, 0xF068, 0xF00D}
# Added by main.js at runtime (class toggles on accordion icons).
JS_CLASSES = {"fa-chevron-up", "fa-chevron-down"}
FONTS = {"fa-solid-900": 900, "fa-regular-400": 400}


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8", errors="ignore") as fh:
        return fh.read()


def class_codepoints():
    css = read("assets/css/all.min.css")
    table = {}
    for m in re.finditer(r"((?:\.fa-[a-z0-9-]+,?)+)\{--fa:\"\\?([^\"]+)\"\}", css):
        for name in re.findall(r"\.(fa-[a-z0-9-]+)", m.group(1)):
            table[name] = m.group(2)
    used = set(JS_CLASSES)
    files = [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "*.html"))]
    for page in files + ["assets/js/main.js"]:
        for m in re.finditer(r"class\s*=\s*[\"']([^\"']*)[\"']", read(page)):
            used.update(c for c in m.group(1).split() if c.startswith("fa-"))
    points = set(EXTRA)
    unresolved = []
    for name in sorted(used):
        if name in table:
            val = table[name]
            points.add(ord(val) if len(val) == 1 else int(val, 16))
        elif name not in {"fa-solid", "fa-regular", "fa-brands"}:
            unresolved.append(name)
    if unresolved:
        sys.exit("unresolved icon classes: " + ", ".join(unresolved))
    return points


def main():
    points = class_codepoints()
    for font in FONTS:
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.hinting = False
        # Keep the .notdef outline: Chrome draws it for icons whose glyph the face lacks (the
        # live site shows it for fa-regular icons the Free regular font does not ship).
        opts.notdef_outline = True
        src = os.path.join(ROOT, "assets/webfonts", font + ".ttf")
        dst = os.path.join(ROOT, "assets/webfonts", font + ".woff2")
        f = subset.load_font(src, opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=sorted(points))
        sub.subset(f)
        subset.save_font(f, dst, opts)
        print("%s: %d glyphs, %d bytes" % (font, len(f.getGlyphOrder()), os.path.getsize(dst)))


if __name__ == "__main__":
    main()
