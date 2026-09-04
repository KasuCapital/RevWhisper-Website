#!/usr/bin/env python3
"""Reconvert drop-folder photos whose source is newer than the served WebP."""
import os, sys
from PIL import Image

ROOT = "/Users/bryan/Coding/website-redesign"
SRC = os.path.join(ROOT, "images/properties/photo-tours")
OUT = os.path.join(ROOT, "images/properties/tours")

SLUGS = {
    "01-moonlit-peak": "moonlit-peak",
    "02-candler-estate": "candler-estate",
    "03-gulfstream-villa": "gulfstream-villa",
    "04-waters-edge": "waters-edge",
    "05-bears-tale": "bears-tale",
    "06-1820-house": "1820-house",
    "07-20-guest-villa": "20-guest-villa",
    "08-soluna-haus": "soluna-haus",
    "09-austin-mansion": "austin-mansion",
    "10-cabin-haiku": "cabin-haiku",
}

force = "--all" in sys.argv
changed = []
for folder, slug in SLUGS.items():
    for phase in ("before", "after"):
        d = os.path.join(SRC, folder, phase)
        if not os.path.isdir(d):
            continue
        files = sorted(f for f in os.listdir(d) if f.lower().endswith((".jpg", ".jpeg", ".png", ".heic")))
        if not files:
            continue
        if len(files) != 5:
            print(f"  ! {folder}/{phase}: {len(files)} images (expected 5) — skipping")
            continue
        for i, f in enumerate(files, 1):
            src = os.path.join(d, f)
            dst = os.path.join(OUT, slug, f"{phase}-{i}.webp")
            if not force and os.path.exists(dst) and os.path.getmtime(src) <= os.path.getmtime(dst):
                continue
            im = Image.open(src)
            im = im.convert("RGB")
            cap = 1000 if i == 1 else 720
            if im.height > cap:
                im = im.resize((round(im.width * cap / im.height), cap), Image.LANCZOS)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im.save(dst, "WEBP", quality=82, method=6)
            w, h = Image.open(src).size
            changed.append(f"{folder}/{phase}/{f} ({w}x{h}) -> {slug}/{phase}-{i}.webp")

print("\n".join(changed) if changed else "nothing newer than its webp — no source changes detected")
print(f"\n{len(changed)} reconverted")
