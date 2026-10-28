# Quick Draw bitmap format

## 1. Statistics over the dataset

Images analysed: 300,000

### Pixel values
- background: 72.1% of all pixels are exactly 0; corner pixels == 0 in 100.00% of cases
- border rows/columns with any ink: 0.0% of images
- per-image max value == 255 in 100.0% of images
- ink pixels (>0): 15.8% are 255, 84.2% intermediate (anti-aliasing); ink pixels per image p5/p25/p50/p75/p95 = 147.00 / 185.00 / 212.00 / 246.00 / 312.00
- ink mass (sum/255) per image p5..p95 = 85.78 / 107.36 / 124.15 / 145.46 / 190.73

### Bounding box of ink (>0), in pixels
- margin top    p5..p95 = 1.00 / 1.00 / 2.00 / 5.00 / 8.00
- margin bottom p5..p95 = 1.00 / 1.00 / 2.00 / 5.00 / 8.00
- margin left   p5..p95 = 1.00 / 1.00 / 1.00 / 4.00 / 7.00
- margin right  p5..p95 = 1.00 / 1.00 / 1.00 / 4.00 / 7.00
- longest side  p5..p95 = 26.00 / 26.00 / 26.00 / 26.00 / 26.00; longest side == 28 in 0.0% of images
- bbox centre x p5..p95 = 13.50 / 13.50 / 13.50 / 13.50 / 13.50, y p5..p95 = 13.50 / 13.50 / 13.50 / 13.50 / 13.50 (image centre = 13.5)

### Alignment on the short axis
- wide drawings (125,283): top - bottom margin p5..p95 = 0.00 / 0.00 / 0.00 / 0.00 / 0.00
- tall drawings (103,577): left - right margin p5..p95 = 0.00 / 0.00 / 0.00 / 0.00 / 0.00

### Stroke width (pixels >= 128, min of horizontal/vertical run length)
- p5..p95 = 1.00 / 2.00 / 2.00 / 3.00 / 6.00, mean = 2.61 px
- relative to longest side: median 0.0769

## 2. Re-rendering the original vector drawings

Drawings compared: 300 (60 first drawings of cat, sun, camel, house, banana)

- best alignment: **centred** (MAE 1.59 vs 39.75 for top-left, coarse search)
- best margin: **2.25 px** on each side -> the 0..255 drawing box spans 23.50 px
- best line width: **1.46 px** = **0.0621 x** the drawing box (= 15.9 units in Quick Draw's 256-unit space)
- mean absolute error per pixel (0..255): **1.42** (median image 1.27); same renders against the wrong bitmaps: 58.73
- pixels within ±16 of the original: 98.2%; on ink pixels only: 93.8%
- images whose reconstruction is clearly wrong (MAE > 3x median): 3
