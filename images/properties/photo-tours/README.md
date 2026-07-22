# Case-study photo tours — drop photos here

One folder per property, in the same order they appear on the case-study page.
Each has a `before/` and an `after/` folder.

**Drop 5 photos in each**, named by display order:

```
┌─────────────┬──────┬──────┐
│             │  2   │  3   │
│      1      ├──────┼──────┤
│   (cover)   │  4   │  5   │
└─────────────┴──────┴──────┘
```

- `1` is the big cover on the left; `2`–`5` read left-to-right, top-to-bottom
  (2 = top tile next to the cover, 5 = bottom-right corner).
- JPG or PNG straight from export is fine (HEIC works too — it gets converted).
- Don't worry about resizing or compressing — that happens when they're wired into the page.

When a property's set is in, tell Claude and it'll convert to WebP and
add the `<img>` tags to that property's gallery in `case-study.html`.

## Status (2026-07-20)

Filled by extraction from the Canva deck "Before  After - 6 Hero Photos.pptx"
(before = sliced from the Airbnb-hero screenshot on each slide; after = the 5
individual photos placed on the slide):

| folder | deck slide |
|---|---|
| 01-moonlit-peak | 22 (Moonlit) |
| 02-candler-estate | 45 (ASH 2) |
| 03-gulfstream-villa | 28 |
| 04-waters-edge | — filled from `images/properties/pocono/` |
| 05-bears-tale | 8 |
| 06-1820-house | 6 |
| 07-20-guest-villa | 44 (CLR 2) |
| 08-soluna-haus | 23 |
| 09-austin-mansion | **MISSING — AUS1 has no slide in the deck** |
| 10-cabin-haiku | 1 |

Note: every extracted `before/5.jpg` has Airbnb's "Show all photos" pill baked
in (it's part of the screenshot). Replace with clean exports if undesired.
