"""Measure the exact format of the Quick Draw 28x28 bitmaps.

Part 1 - statistics over the dataset: background/stroke values, bounding box,
margins, centering, stroke width.
Part 2 - reconstruction: fetch the first drawings of a few categories in vector
form (simplified ndjson) and the matching first rows of the bitmap files, then
search for the rendering parameters (margin, alignment, line width) that
reproduce the bitmaps.

    python inspect_format.py    # -> reports/format_report.md, reports/format_reconstruction.png
"""

import io
import json
import time
from urllib.parse import quote

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import requests
import torch

from config import BASE_URL, DATASET_PATH, IMAGE_SIZE, REPORTS_DIR

SIDE = IMAGE_SIZE
SIMPLIFIED_URL = "https://storage.googleapis.com/quickdraw_dataset/full/simplified"
RECON_CLASSES = ["cat", "sun", "camel", "house", "banana"]
RECON_PER_CLASS = 60
SUPERSAMPLE = 6  # sub-pixel samples per axis used to compute anti-aliased coverage


# ---------------------------------------------------------------- part 1: statistics

def run_lengths(b: np.ndarray, axis: int) -> np.ndarray:
    """Length of the run of True values each pixel belongs to, along axis (b: N x 28 x 28 bool)."""
    b = np.moveaxis(b, axis, -1)
    fwd = np.zeros(b.shape, np.int16)
    bwd = np.zeros(b.shape, np.int16)
    n = b.shape[-1]
    for j in range(n):
        fwd[..., j] = (fwd[..., j - 1] + 1) * b[..., j] if j else b[..., j]
        k = n - 1 - j
        bwd[..., k] = (bwd[..., k + 1] + 1) * b[..., k] if j else b[..., k]
    return np.moveaxis(fwd + bwd - 1, -1, axis)


def pct(a, qs=(5, 25, 50, 75, 95)) -> str:
    return " / ".join(f"{v:.2f}" for v in np.percentile(a, qs))


def dataset_stats(x: np.ndarray) -> list[str]:
    n = len(x)
    ink = x > 0
    rows, cols = ink.any(2), ink.any(1)
    top, bottom = rows.argmax(1), rows[:, ::-1].argmax(1)       # margins (empty rows/cols)
    left, right = cols.argmax(1), cols[:, ::-1].argmax(1)
    w, h = SIDE - left - right, SIDE - top - bottom
    longest = np.maximum(w, h)

    # Asymmetry on the axis with slack: centered -> ~0, top-left aligned -> strongly negative.
    wide, tall = w >= h + 4, h >= w + 4
    asym_v = (top - bottom)[wide]
    asym_h = (left - right)[tall]
    cx = (left + (SIDE - 1 - right)) / 2
    cy = (top + (SIDE - 1 - bottom)) / 2

    corners = np.concatenate([x[:, 0, 0], x[:, 0, -1], x[:, -1, 0], x[:, -1, -1]])
    border = np.concatenate([x[:, 0], x[:, -1], x[:, :, 0], x[:, :, -1]], 1)
    vals = x[ink]
    mass = x.reshape(n, -1).sum(1) / 255

    b = x >= 128
    width = np.minimum(run_lengths(b, 1), run_lengths(b, 2))[b]

    lines = [
        f"Images analysed: {n:,}",
        "",
        "### Pixel values",
        f"- background: {np.mean(x == 0) * 100:.1f}% of all pixels are exactly 0; corner pixels == 0 in {np.mean(corners == 0) * 100:.2f}% of cases",
        f"- border rows/columns with any ink: {np.mean(border.max(1) > 0) * 100:.1f}% of images",
        f"- per-image max value == 255 in {np.mean(x.reshape(n, -1).max(1) == 255) * 100:.1f}% of images",
        f"- ink pixels (>0): {np.mean(vals == 255) * 100:.1f}% are 255, {np.mean(vals < 255) * 100:.1f}% intermediate (anti-aliasing); "
        f"ink pixels per image p5/p25/p50/p75/p95 = {pct(ink.reshape(n, -1).sum(1))}",
        f"- ink mass (sum/255) per image p5..p95 = {pct(mass)}",
        "",
        "### Bounding box of ink (>0), in pixels",
        f"- margin top    p5..p95 = {pct(top)}",
        f"- margin bottom p5..p95 = {pct(bottom)}",
        f"- margin left   p5..p95 = {pct(left)}",
        f"- margin right  p5..p95 = {pct(right)}",
        f"- longest side  p5..p95 = {pct(longest)}; longest side == 28 in {np.mean(longest == SIDE) * 100:.1f}% of images",
        f"- bbox centre x p5..p95 = {pct(cx)}, y p5..p95 = {pct(cy)} (image centre = 13.5)",
        "",
        "### Alignment on the short axis",
        f"- wide drawings ({wide.sum():,}): top - bottom margin p5..p95 = {pct(asym_v)}",
        f"- tall drawings ({tall.sum():,}): left - right margin p5..p95 = {pct(asym_h)}",
        "",
        "### Stroke width (pixels >= 128, min of horizontal/vertical run length)",
        f"- p5..p95 = {pct(width)}, mean = {width.mean():.2f} px",
        f"- relative to longest side: median {np.median(width) / np.median(longest):.4f}",
    ]
    return lines


# ---------------------------------------------------------------- part 2: reconstruction

def fetch(url: str, start: int, end: int) -> bytes:
    for attempt in range(1, 21):
        try:
            r = requests.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=60)
            r.raise_for_status()
            if r.status_code != 206:
                raise RuntimeError("server ignored the Range header")
            return r.content
        except requests.RequestException:
            time.sleep(min(attempt, 5))
    raise RuntimeError(f"could not fetch {url}")


def first_bitmaps(name: str, n: int) -> np.ndarray:
    url = f"{BASE_URL}/{quote(name)}.npy"
    f = io.BytesIO(fetch(url, 0, 1023))
    major, _ = np.lib.format.read_magic(f)
    read_header = np.lib.format.read_array_header_1_0 if major == 1 else np.lib.format.read_array_header_2_0
    shape, _, dtype = read_header(f)
    assert dtype == np.uint8 and shape[1] == SIDE * SIDE
    offset = f.tell()
    data = fetch(url, offset, offset + n * SIDE * SIDE - 1)
    return np.frombuffer(data, np.uint8).reshape(n, SIDE, SIDE)


def first_drawings(name: str, n: int) -> list[list]:
    url = f"{SIMPLIFIED_URL}/{quote(name)}.ndjson"
    size = n * 3000
    while True:
        lines = fetch(url, 0, size).decode("utf-8").split("\n")[:-1]  # last line may be partial
        if len(lines) >= n:
            return [json.loads(line)["drawing"] for line in lines[:n]]
        size *= 2


def to_segments(drawing: list) -> np.ndarray:
    """Strokes [[xs], [ys]] -> (M, 2, 2) array of segments in drawing units."""
    segs = []
    for xs, ys in drawing:
        p = np.stack([xs, ys], 1).astype(np.float32)
        if len(p) == 1:
            p = np.vstack([p, p])
        segs.append(np.stack([p[:-1], p[1:]], 1))
    return np.concatenate(segs)


_sub = (np.arange(SIDE * SUPERSAMPLE, dtype=np.float32) + 0.5) / SUPERSAMPLE
_u, _v = np.meshgrid(_sub, _sub)
SAMPLES = np.stack([_u.ravel(), _v.ravel()], 1)
SAMPLES_T = torch.from_numpy(SAMPLES)


def distance_field(segs: np.ndarray, margin: float, center: bool) -> np.ndarray:
    """Distance (in output pixels) from every sub-pixel sample to the drawing.

    The drawing (coordinates 0..255) is scaled so its 255-unit box spans SIDE - 2*margin
    pixels, offset by margin, and optionally centred on the axis with slack.
    """
    pts = segs.reshape(-1, 2)
    lo = pts.min(0)
    ext = pts.max(0) - lo
    scale = (SIDE - 2 * margin) / 255
    off = np.full(2, margin, np.float32)
    if center:
        off += (255 - ext) * scale / 2
    a = (segs[:, 0] - lo) * scale + off
    ab = (segs[:, 1] - lo) * scale + off - a
    a, ab = torch.from_numpy(a.astype(np.float32)), torch.from_numpy(ab.astype(np.float32))
    l2 = (ab ** 2).sum(1).clamp_min(1e-9)
    best = torch.full((len(SAMPLES),), float("inf"))
    for i in range(0, len(a), 256):
        ap = SAMPLES_T[:, None, :] - a[None, i:i + 256]
        t = ((ap * ab[None, i:i + 256]).sum(2) / l2[None, i:i + 256]).clamp(0, 1)
        d2 = ((ap - t[..., None] * ab[None, i:i + 256]) ** 2).sum(2).amin(1)
        best = torch.minimum(best, d2)
    return best.sqrt().numpy()


def coverage(dist: np.ndarray, widths: np.ndarray) -> np.ndarray:
    """Anti-aliased images (len(widths), 28, 28) in 0..255 for round-capped strokes of the given widths."""
    inside = dist[None, :] <= widths[:, None] / 2
    s = SUPERSAMPLE
    return inside.reshape(len(widths), SIDE, s, SIDE, s).mean((2, 4)) * 255


def reconstruct() -> tuple[list[str], dict]:
    targets, segments = [], []
    for name in RECON_CLASSES:
        print(f"  fetching first {RECON_PER_CLASS} drawings of {name}")
        targets.append(first_bitmaps(name, RECON_PER_CLASS).astype(np.float32))
        segments += [to_segments(d) for d in first_drawings(name, RECON_PER_CLASS)]
    target = np.concatenate(targets)

    def search(centers, margins, widths, idx):
        err = np.zeros((len(centers), len(margins), len(widths)))
        for i in idx:
            for c, center in enumerate(centers):
                for m, margin in enumerate(margins):
                    img = coverage(distance_field(segments[i], margin, center), widths)
                    err[c, m] += np.abs(img - target[i]).mean((1, 2))
        return err / len(idx)

    t0 = time.time()
    margins, widths = np.arange(0, 3.01, 0.25), np.arange(0.5, 3.01, 0.1)
    err = search([False, True], margins, widths, range(0, len(target), 5))
    c, m, wi = np.unravel_index(err.argmin(), err.shape)
    coarse = dict(center=bool(c), margin=margins[m], width=widths[wi], mae=err[c, m, wi],
                  other_alignment_mae=err[1 - c].min())
    print(f"  coarse search done in {time.time() - t0:.0f}s: {coarse}", flush=True)

    margins = np.arange(max(0, margins[m] - 0.25), margins[m] + 0.26, 0.05)
    widths = np.arange(max(0.3, widths[wi] - 0.2), widths[wi] + 0.21, 0.02)
    err = search([bool(c)], margins, widths, range(len(target)))
    _, m, wi = np.unravel_index(err.argmin(), err.shape)
    best = dict(center=bool(c), margin=float(margins[m]), width=float(widths[wi]))
    print(f"  fine search done in {time.time() - t0:.0f}s: {best}", flush=True)

    recon = np.stack([coverage(distance_field(s, best["margin"], best["center"]), np.array([best["width"]]))[0]
                      for s in segments])
    diff = np.abs(recon - target)
    per_image = diff.mean((1, 2))
    shifted = np.abs(recon - np.roll(target, 1, axis=0)).mean((1, 2))  # wrong pairing, as a baseline
    ink = target > 0
    drawing_px = SIDE - 2 * best["margin"]

    lines = [
        f"Drawings compared: {len(target)} ({RECON_PER_CLASS} first drawings of {', '.join(RECON_CLASSES)})",
        "",
        f"- best alignment: **{'centred' if best['center'] else 'top-left'}** "
        f"(MAE {coarse['mae']:.2f} vs {coarse['other_alignment_mae']:.2f} for {'top-left' if best['center'] else 'centred'}, coarse search)",
        f"- best margin: **{best['margin']:.2f} px** on each side -> the 0..255 drawing box spans {drawing_px:.2f} px",
        f"- best line width: **{best['width']:.2f} px** = **{best['width'] / drawing_px:.4f} x** the drawing box "
        f"(= {best['width'] / drawing_px * 256:.1f} units in Quick Draw's 256-unit space)",
        f"- mean absolute error per pixel (0..255): **{per_image.mean():.2f}** "
        f"(median image {np.median(per_image):.2f}); same renders against the wrong bitmaps: {shifted.mean():.2f}",
        f"- pixels within ±16 of the original: {np.mean(diff <= 16) * 100:.1f}%; on ink pixels only: {np.mean(diff[ink] <= 16) * 100:.1f}%",
        f"- images whose reconstruction is clearly wrong (MAE > 3x median): {np.sum(per_image > 3 * np.median(per_image))}",
    ]
    return lines, dict(best=best, target=target, recon=recon, per_image=per_image)


def plot_reconstruction(r: dict) -> None:
    idx = np.linspace(0, len(r["target"]) - 1, 10).astype(int)
    fig, axes = plt.subplots(3, len(idx), figsize=(len(idx) * 1.2, 4))
    for j, i in enumerate(idx):
        for row, (img, cmap, vmax) in enumerate([(r["target"][i], "gray", 255), (r["recon"][i], "gray", 255),
                                                 (np.abs(r["recon"][i] - r["target"][i]), "magma", 255)]):
            axes[row, j].imshow(img, cmap=cmap, vmin=0, vmax=vmax, interpolation="nearest")
            axes[row, j].set_xticks([])
            axes[row, j].set_yticks([])
        axes[2, j].set_xlabel(f"MAE {r['per_image'][i]:.1f}", fontsize=8)
    for row, label in enumerate(["Quick Draw", "re-rendered", "|difference|"]):
        axes[row, 0].set_ylabel(label, fontsize=9)
    b = r["best"]
    fig.suptitle(f"Vector re-rendering: {'centred' if b['center'] else 'top-left'}, "
                 f"margin {b['margin']:.2f}px, line width {b['width']:.2f}px", fontsize=10)
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "format_reconstruction.png", dpi=110)


def main() -> None:
    REPORTS_DIR.mkdir(exist_ok=True)
    x = np.load(DATASET_PATH)["x"]
    print("Part 1: dataset statistics")
    report = ["# Quick Draw bitmap format", "", "## 1. Statistics over the dataset", ""] + dataset_stats(x)

    print("Part 2: reconstruction from vector data")
    lines, r = reconstruct()
    report += ["", "## 2. Re-rendering the original vector drawings", ""] + lines
    plot_reconstruction(r)

    text = "\n".join(report) + "\n"
    (REPORTS_DIR / "format_report.md").write_text(text, encoding="utf-8")
    print()
    print(text)


if __name__ == "__main__":
    main()
