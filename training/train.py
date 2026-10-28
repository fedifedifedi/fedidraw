"""Train the FediDraw CNN.

    python train.py                  # with augmentation  -> checkpoints/aug.pt
    python train.py --no-augment     # baseline            -> checkpoints/noaug.pt

Each run also writes reports/history_<tag>.json and reports/curves_<tag>.png, and
evaluates the best checkpoint on the clean test set and on a fixed, perturbed copy
of it (same transforms as the augmentation) to measure robustness.
"""

import argparse
import json
import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F
from tqdm import tqdm

from config import CHECKPOINT_DIR, CLASS_NAMES, DEFAULT_THREADS, REPORTS_DIR, SEED
from dataset import Batches, load_splits, pixel_stats
from model import FediDrawNet, count_parameters

SLOW_EPOCH_S = 4 * 60
PERTURBED_SEED = 1234


@torch.no_grad()
def evaluate(model, batches, device) -> dict:
    model.eval()
    loss = top1 = top5 = n = 0
    for xb, yb in batches:
        xb, yb = xb.to(device), yb.to(device)
        logits = model(xb)
        loss += F.cross_entropy(logits, yb, reduction="sum").item()
        best5 = logits.topk(5, 1).indices
        top1 += (best5[:, 0] == yb).sum().item()
        top5 += (best5 == yb[:, None]).any(1).sum().item()
        n += len(yb)
    return {"loss": loss / n, "top1": top1 / n, "top5": top5 / n}


def plot_curves(history: list[dict], tag: str) -> None:
    epochs = [h["epoch"] for h in history]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 3.8))
    ax1.plot(epochs, [h["train_loss"] for h in history], "o-", label="train")
    ax1.plot(epochs, [h["val_loss"] for h in history], "o-", label="validation")
    ax1.set(xlabel="epoch", ylabel="cross-entropy", title="Loss")
    ax2.plot(epochs, [h["train_acc"] * 100 for h in history], "o-", label="train (top-1)")
    ax2.plot(epochs, [h["val_top1"] * 100 for h in history], "o-", label="validation top-1")
    ax2.plot(epochs, [h["val_top5"] * 100 for h in history], "o--", label="validation top-5")
    ax2.set(xlabel="epoch", ylabel="accuracy (%)", title="Accuracy")
    for ax in (ax1, ax2):
        ax.grid(alpha=0.3)
        ax.legend()
    fig.suptitle(f"FediDraw training — {tag}")
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / f"curves_{tag}.png", dpi=110)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-augment", action="store_true", help="train without data augmentation")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-3, help="peak learning rate (one-cycle schedule)")
    parser.add_argument("--threads", type=int, default=DEFAULT_THREADS, help="CPU threads")
    parser.add_argument("--device", default="auto", help="auto, cpu or cuda")
    parser.add_argument("--tag", help="run name (default: aug / noaug)")
    args = parser.parse_args()
    augment = not args.no_augment
    tag = args.tag or ("aug" if augment else "noaug")

    torch.manual_seed(SEED)
    torch.set_num_threads(args.threads)
    device = torch.device("cuda" if args.device == "auto" and torch.cuda.is_available()
                          else "cpu" if args.device == "auto" else args.device)
    CHECKPOINT_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)

    splits = load_splits()
    (x_train, y_train), (x_val, y_val), (x_test, y_test) = splits["train"], splits["val"], splits["test"]
    mean, std = pixel_stats(x_train)
    train_batches = Batches(x_train, y_train, args.batch_size, mean, std, shuffle=True,
                            augment_seed=SEED if augment else None)
    val_batches = Batches(x_val, y_val, 1024, mean, std)

    model = FediDrawNet(len(CLASS_NAMES)).to(device).to(memory_format=torch.channels_last)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=args.lr,
                                                    total_steps=args.epochs * len(train_batches))
    print(f"Run '{tag}': augmentation {'on' if augment else 'off'}, device {device}, {args.threads} threads, "
          f"{count_parameters(model):,} parameters")
    print(f"Split: train {len(y_train):,} / val {len(y_val):,} / test {len(y_test):,}; "
          f"pixel mean {mean:.4f}, std {std:.4f}")

    history, best_top1 = [], -1.0
    ckpt_path = CHECKPOINT_DIR / f"{tag}.pt"
    start = time.time()
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        model.train()
        loss_sum = correct = seen = 0
        bar = tqdm(train_batches, desc=f"epoch {epoch}/{args.epochs}", leave=False, mininterval=2)
        for xb, yb in bar:
            xb, yb = xb.to(device), yb.to(device)
            logits = model(xb)
            loss = F.cross_entropy(logits, yb, label_smoothing=0.1)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            scheduler.step()
            loss_sum += loss.item() * len(yb)
            correct += (logits.argmax(1) == yb).sum().item()
            seen += len(yb)
            bar.set_postfix(loss=f"{loss_sum / seen:.3f}", acc=f"{correct / seen:.3f}")
        train_time = time.time() - t0
        val = evaluate(model, val_batches, device)
        duration = time.time() - t0

        history.append({"epoch": epoch, "train_loss": loss_sum / seen, "train_acc": correct / seen,
                        "val_loss": val["loss"], "val_top1": val["top1"], "val_top5": val["top5"],
                        "seconds": round(duration, 1)})
        improved = val["top1"] > best_top1
        if improved:
            best_top1 = val["top1"]
            torch.save({"model": model.state_dict(), "mean": mean, "std": std, "classes": CLASS_NAMES,
                        "augment": augment, "epoch": epoch, "args": vars(args)}, ckpt_path)
        print(f"epoch {epoch:2d}/{args.epochs} | {duration / 60:4.1f} min (train {train_time:.0f}s) | "
              f"train loss {loss_sum / seen:.3f} acc {correct / seen * 100:5.2f}% | "
              f"val loss {val['loss']:.3f} top-1 {val['top1'] * 100:5.2f}% top-5 {val['top5'] * 100:5.2f}%"
              f"{'  *best' if improved else ''}", flush=True)
        if duration > SLOW_EPOCH_S:
            print(f"  WARNING: epoch took more than {SLOW_EPOCH_S // 60} min -> consider the CUDA build of PyTorch",
                  flush=True)

    total = time.time() - start
    ckpt = torch.load(ckpt_path, weights_only=False)
    model.load_state_dict(ckpt["model"])
    test_clean = evaluate(model, Batches(x_test, y_test, 1024, mean, std), device)
    test_perturbed = evaluate(model, Batches(x_test, y_test, 1024, mean, std, augment_seed=PERTURBED_SEED), device)
    result = {"tag": tag, "augment": augment, "best_epoch": ckpt["epoch"], "train_minutes": round(total / 60, 1),
              "parameters": count_parameters(model), "mean": mean, "std": std,
              "test_clean": test_clean, "test_perturbed": test_perturbed, "history": history}
    (REPORTS_DIR / f"history_{tag}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    plot_curves(history, tag)

    print(f"\nTraining time {total / 60:.1f} min, best epoch {ckpt['epoch']}")
    print(f"Test (clean)     top-1 {test_clean['top1'] * 100:.2f}%  top-5 {test_clean['top5'] * 100:.2f}%")
    print(f"Test (perturbed) top-1 {test_perturbed['top1'] * 100:.2f}%  top-5 {test_perturbed['top5'] * 100:.2f}%")


if __name__ == "__main__":
    main()
