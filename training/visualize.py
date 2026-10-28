"""Plot random examples from the dataset, exactly as stored (no inversion).

    python visualize.py              # 8 examples per category -> reports/samples.png
    python visualize.py --per-class 12
"""

import argparse

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from config import DATASET_PATH, REPORTS_DIR, SAMPLES_PER_CLASS, SEED


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-class", type=int, default=8)
    args = parser.parse_args()

    data = np.load(DATASET_PATH)
    x, y, classes = data["x"], data["y"], data["classes"]
    rng = np.random.default_rng(SEED)
    k = args.per_class

    fig, axes = plt.subplots(len(classes), k, figsize=(k * 0.9, len(classes) * 0.9))
    for c, name in enumerate(classes):
        idx = rng.choice(np.flatnonzero(y == c), k, replace=False)
        for j, i in enumerate(idx):
            ax = axes[c, j]
            ax.imshow(x[i], cmap="gray", vmin=0, vmax=255, interpolation="nearest")
            ax.set_xticks([])
            ax.set_yticks([])
        axes[c, 0].set_ylabel(name, rotation=0, ha="right", va="center", fontsize=9)

    fig.suptitle(f"Quick Draw samples — {len(classes)} classes × {SAMPLES_PER_CLASS:,} drawings (raw pixels)")
    fig.tight_layout(rect=(0, 0, 1, 0.985))
    REPORTS_DIR.mkdir(exist_ok=True)
    out = REPORTS_DIR / "samples.png"
    fig.savefig(out, dpi=110)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
