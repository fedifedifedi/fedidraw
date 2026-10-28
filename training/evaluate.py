"""Evaluate a trained checkpoint on the test set and produce the report figures.

    python evaluate.py              # evaluates checkpoints/aug.pt

Writes to reports/:
  confusion_matrix.png, per_class_accuracy.png, augmentation_comparison.png/.md,
  metrics.json (consumed by the web app's "How it works" page)
"""

import argparse
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from matplotlib.colors import LinearSegmentedColormap
from sklearn.metrics import confusion_matrix

from config import CATEGORIES, CHECKPOINT_DIR, CLASS_NAMES, DEFAULT_THREADS, REPORTS_DIR
from dataset import Batches, load_splits
from model import FediDrawNet

# Chart palette (validated: categorical slots 1-2, sequential blue ramp).
SURFACE, INK, INK_2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9"
SERIES = {"aug": "#2a78d6", "noaug": "#eb6834"}
BLUES = LinearSegmentedColormap.from_list(
    "seq_blue", [SURFACE, "#cde2fb", "#86b6ef", "#3987e5", "#256abf", "#184f95", "#0d366b"])
CM_CAP = 10  # % — colour scale is capped so off-diagonal confusions stay visible

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "text.color": INK, "axes.labelcolor": INK_2, "axes.edgecolor": GRID,
    "xtick.color": INK_2, "ytick.color": INK_2, "axes.titleweight": "bold",
})


@torch.no_grad()
def predict(model, batches) -> np.ndarray:
    model.eval()
    return torch.cat([model(xb).softmax(1) for xb, _ in batches]).numpy()


def plot_confusion(cm_pct: np.ndarray, top1: float) -> None:
    n = len(CLASS_NAMES)
    fig, ax = plt.subplots(figsize=(12, 11))
    im = ax.imshow(np.minimum(cm_pct, CM_CAP), cmap=BLUES, vmin=0, vmax=CM_CAP)
    for i in range(n):
        for j in range(n):
            v = cm_pct[i, j]
            if i == j or v >= 2:
                ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=7,
                        color="#ffffff" if v >= CM_CAP * 0.55 else INK)
    ax.set_xticks(range(n), CLASS_NAMES, rotation=60, ha="right", fontsize=8)
    ax.set_yticks(range(n), CLASS_NAMES, fontsize=8)
    ax.set_xlabel("predicted class")
    ax.set_ylabel("true class")
    ax.set_title(f"Confusion matrix — test set, {top1 * 100:.1f}% top-1\n"
                 f"row-normalised (%); numbers shown on the diagonal and for confusions ≥ 2%",
                 fontsize=11, loc="left")
    for s in ax.spines.values():
        s.set_visible(False)
    cbar = fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label(f"share of the true class (%), scale capped at {CM_CAP}%", color=INK_2)
    cbar.outline.set_visible(False)
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "confusion_matrix.png", dpi=120)
    plt.close(fig)


def plot_per_class(acc: np.ndarray) -> None:
    order = np.argsort(acc)
    fig, ax = plt.subplots(figsize=(7, 8.5))
    ax.barh(range(len(acc)), acc[order] * 100, color=SERIES["aug"], height=0.7)
    ax.set_yticks(range(len(acc)), [CLASS_NAMES[i] for i in order], fontsize=8)
    for k, i in enumerate(order[:5]):  # label only the weakest classes
        ax.text(acc[i] * 100 + 0.5, k, f"{acc[i] * 100:.1f}%", va="center", fontsize=8, color=INK_2)
    ax.set_xlim(0, 100)
    ax.set_xlabel("top-1 accuracy on the test set (%)")
    ax.set_title("Accuracy per class", fontsize=11, loc="left")
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "per_class_accuracy.png", dpi=120)
    plt.close(fig)


def compare_runs() -> dict | None:
    """Dot plot + markdown table comparing the runs with and without augmentation."""
    runs = {}
    for tag in ("aug", "noaug"):
        path = REPORTS_DIR / f"history_{tag}.json"
        if not path.exists():
            return None
        runs[tag] = json.loads(path.read_text(encoding="utf-8"))
    labels = {"aug": "with augmentation", "noaug": "without augmentation"}
    rows = [("test_clean", "Clean test set"), ("test_perturbed", "Perturbed test set")]

    fig, ax = plt.subplots(figsize=(7.5, 2.6))
    for y, (key, _) in enumerate(rows):
        a, b = (runs[t][key]["top1"] * 100 for t in ("aug", "noaug"))
        ax.plot([a, b], [y, y], color=GRID, linewidth=2, zorder=1)
        for tag, v in (("aug", a), ("noaug", b)):
            ax.scatter(v, y, s=90, color=SERIES[tag], edgecolor=SURFACE, linewidth=2, zorder=2,
                       label=labels[tag] if y == 0 else None)
            ax.annotate(f"{v:.1f}%", (v, y), xytext=(0, 10), textcoords="offset points",
                        ha="center", fontsize=8, color=INK_2)
    ax.set_yticks(range(len(rows)), [r[1] for r in rows])
    ax.set_ylim(-0.6, len(rows) - 0.3)
    ax.invert_yaxis()
    ax.set_xlabel("top-1 accuracy (%)")
    ax.set_title("Data augmentation: clean vs. perturbed test accuracy", fontsize=11, loc="left", pad=22)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.legend(loc="lower right", frameon=False, fontsize=8, ncol=2, bbox_to_anchor=(1, 1.0),
              borderaxespad=0.2)
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "augmentation_comparison.png", dpi=120)
    plt.close(fig)

    table = ["| Model | Clean test top-1 | Clean test top-5 | Perturbed test top-1 | Perturbed test top-5 |",
             "|---|---|---|---|---|"]
    for tag in ("aug", "noaug"):
        r = runs[tag]
        table.append(f"| {labels[tag].capitalize()} | {r['test_clean']['top1'] * 100:.2f}% | "
                     f"{r['test_clean']['top5'] * 100:.2f}% | {r['test_perturbed']['top1'] * 100:.2f}% | "
                     f"{r['test_perturbed']['top5'] * 100:.2f}% |")
    (REPORTS_DIR / "augmentation_comparison.md").write_text("\n".join(table) + "\n", encoding="utf-8")
    return {tag: {k: runs[tag][k] for k in ("test_clean", "test_perturbed", "train_minutes", "best_epoch")}
            for tag in runs}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", default="aug", help="checkpoint to evaluate")
    args = parser.parse_args()
    torch.set_num_threads(DEFAULT_THREADS)

    ckpt = torch.load(CHECKPOINT_DIR / f"{args.tag}.pt", weights_only=False)
    model = FediDrawNet(len(CLASS_NAMES)).to(memory_format=torch.channels_last)
    model.load_state_dict(ckpt["model"])
    x_test, y_test = load_splits()["test"]
    probs = predict(model, Batches(x_test, y_test, 1024, ckpt["mean"], ckpt["std"]))
    y = y_test.numpy()

    top5 = np.argsort(-probs, 1)[:, :5]
    pred = top5[:, 0]
    top1_acc, top5_acc = float(np.mean(pred == y)), float(np.mean((top5 == y[:, None]).any(1)))
    cm = confusion_matrix(y, pred, labels=range(len(CLASS_NAMES)))
    cm_pct = cm / cm.sum(1, keepdims=True) * 100
    per_class = np.diag(cm) / cm.sum(1)

    off = cm_pct.copy()
    np.fill_diagonal(off, 0)
    pairs = np.dstack(np.unravel_index(np.argsort(-off, axis=None)[:10], off.shape))[0]
    confusions = [{"true": CLASS_NAMES[i], "predicted": CLASS_NAMES[j], "percent": round(float(off[i, j]), 2)}
                  for i, j in pairs]

    REPORTS_DIR.mkdir(exist_ok=True)
    plot_confusion(cm_pct, top1_acc)
    plot_per_class(per_class)
    comparison = compare_runs()

    history_path = REPORTS_DIR / f"history_{args.tag}.json"
    run = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else {}
    metrics = {
        "model": {"checkpoint": f"{args.tag}.pt", "parameters": sum(p.numel() for p in model.parameters()),
                  "augmentation": ckpt["augment"], "epochs": ckpt["args"]["epochs"], "best_epoch": ckpt["epoch"],
                  "train_minutes": run.get("train_minutes")},
        "test": {"samples": int(len(y)), "top1": top1_acc, "top5": top5_acc},
        "test_perturbed": run.get("test_perturbed"),
        "per_class": [{"id": c, "en": c, "fr": CATEGORIES[c], "accuracy": round(float(a), 4)}
                      for c, a in zip(CLASS_NAMES, per_class)],
        "confusion_matrix": cm.tolist(),
        "top_confusions": confusions,
        "augmentation_comparison": comparison,
        "history": run.get("history"),
    }
    (REPORTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"Test top-1 {top1_acc * 100:.2f}%  top-5 {top5_acc * 100:.2f}%  ({len(y):,} images)")
    print("Weakest classes:", ", ".join(f"{CLASS_NAMES[i]} {per_class[i] * 100:.1f}%" for i in np.argsort(per_class)[:5]))
    print("Top confusions (true -> predicted, % of the true class):")
    for c in confusions:
        print(f"  {c['true']:>10s} -> {c['predicted']:<10s} {c['percent']:.1f}%")


if __name__ == "__main__":
    main()
