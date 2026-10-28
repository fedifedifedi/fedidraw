"""Export the trained model to ONNX for the browser and copy the web assets.

    python export_onnx.py           # exports checkpoints/aug.pt

The exported graph includes the input normalisation, so the web app feeds raw
pixels in [0, 1] (white strokes on black). Outputs:
  probs (N, 30)          class probabilities
  act1  (N, 32, 28, 28)  block 1 activations (after ReLU, before pooling)
  act2  (N, 64, 14, 14)  block 2 activations (after ReLU, before pooling)

Writes web/public/model/{fedidraw.onnx, labels.json, metrics.json, samples.json} and
web/public/img/confusion_matrix.png, after checking that ONNX Runtime and
PyTorch agree on the test set.
"""

import argparse
import base64
import json
import shutil

import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn

from config import (CATEGORIES, CHECKPOINT_DIR, CLASS_NAMES, DEFAULT_THREADS, IMAGE_SIZE, REPORTS_DIR, SEED,
                    WEB_PUBLIC_DIR)
from dataset import load_splits
from model import FediDrawNet

OPSET = 18
BRAIN_MAPS_PER_LAYER = 2
SAMPLES_PER_CLASS_WEB = 4

# Rendering parameters of the Quick Draw bitmaps, measured by inspect_format.py
# (reports/format_report.md). The web preprocessing reads them from labels.json.
PREPROCESSING = {
    "coordinate_range": 255,   # strokes: shift to min 0, scale uniformly so the longest side is 255
    "resample_spacing": 1,     # then resample at 1 unit and simplify with Ramer-Douglas-Peucker
    "rdp_epsilon": 2.0,
    "original_side": 256,      # render: drawing box in drawing units, centred on both axes
    "line_width": 16,          # round caps and joins, in drawing units
    "padding": 16,             # extra margin on each side, plus line_width / 2
    "output_side": IMAGE_SIZE,
    "background": 0.0,
    "stroke": 1.0,
}


class BrowserModel(nn.Module):
    """FediDrawNet with built-in normalisation, softmax and activation outputs."""

    def __init__(self, net: FediDrawNet, mean: float, std: float):
        super().__init__()
        self.net = net
        self.register_buffer("mean", torch.tensor(mean))
        self.register_buffer("std", torch.tensor(std))

    def forward(self, x):
        z = (x - self.mean) / self.std
        act1 = self.net.block1[:3](z)   # conv, batch norm, ReLU
        act2 = self.net.block2[:3](self.net.block1[3](act1))
        probs = self.net.head(self.net.block3(self.net.block2[3](act2))).softmax(1)
        return probs, act1, act2


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", default="aug", help="checkpoint to export")
    args = parser.parse_args()
    torch.set_num_threads(DEFAULT_THREADS)

    ckpt = torch.load(CHECKPOINT_DIR / f"{args.tag}.pt", weights_only=False)
    net = FediDrawNet(len(CLASS_NAMES))
    net.load_state_dict(ckpt["model"])
    model = BrowserModel(net, ckpt["mean"], ckpt["std"]).eval()

    model_dir = WEB_PUBLIC_DIR / "model"
    img_dir = WEB_PUBLIC_DIR / "img"
    model_dir.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = model_dir / "fedidraw.onnx"

    dummy = torch.zeros(1, 1, IMAGE_SIZE, IMAGE_SIZE)
    program = torch.onnx.export(
        model, (dummy,), dynamo=True, opset_version=OPSET,
        input_names=["input"], output_names=["probs", "act1", "act2"],
        dynamic_shapes={"x": {0: torch.export.Dim("batch", min=1, max=4096)}},
    )
    program.save(str(onnx_path), external_data=False)
    onnx.checker.check_model(onnx.load(str(onnx_path)))
    print(f"Exported {onnx_path} ({onnx_path.stat().st_size / 1024:.0f} KB, opset {OPSET})")

    # ONNX Runtime must reproduce PyTorch on the whole test set.
    x_test, y_test = load_splits()["test"]
    x = x_test.unsqueeze(1).float().div(255).numpy()
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    max_diff, onnx_pred, torch_pred = 0.0, [], []
    contrast1, contrast2 = np.zeros(32), np.zeros(64)
    with torch.no_grad():
        for i in range(0, len(x), 1000):
            xb = x[i:i + 1000]
            o_probs, o_act1, o_act2 = session.run(None, {"input": xb})
            t_probs, t_act1, t_act2 = (t.numpy() for t in model(torch.from_numpy(xb)))
            max_diff = max(max_diff, *(float(np.abs(a - b).max()) for a, b in
                                       ((o_probs, t_probs), (o_act1, t_act1), (o_act2, t_act2))))
            onnx_pred.append(o_probs.argmax(1))
            torch_pred.append(t_probs.argmax(1))
            # Spatial contrast of each activation map, relative to its peak: high values make readable maps.
            for act, acc in ((o_act1, contrast1), (o_act2, contrast2)):
                acc += (act.std((2, 3)) / (act.max((2, 3)) + 1e-6)).sum(0)
    onnx_pred, torch_pred = np.concatenate(onnx_pred), np.concatenate(torch_pred)
    agreement = float(np.mean(onnx_pred == torch_pred))
    print(f"ONNX vs PyTorch on {len(x):,} test images: max abs difference {max_diff:.2e}, "
          f"same top-1 for {agreement * 100:.2f}%, ONNX top-1 accuracy {np.mean(onnx_pred == y_test.numpy()) * 100:.2f}%")
    if max_diff > 1e-3 or agreement < 0.999:
        raise SystemExit("ONNX output does not match PyTorch")

    labels = {
        "model": onnx_path.name,
        "classes": [{"id": c, "en": c, "fr": CATEGORIES[c]} for c in CLASS_NAMES],
        "input": {
            "name": "input", "shape": [1, 1, IMAGE_SIZE, IMAGE_SIZE], "range": [0, 1],
            "description": "white strokes (1) on black background (0); normalisation is applied inside the model",
            "normalization": {"mean": ckpt["mean"], "std": ckpt["std"], "applied_in_model": True},
        },
        "outputs": {"probs": [len(CLASS_NAMES)], "act1": [32, IMAGE_SIZE, IMAGE_SIZE],
                    "act2": [64, IMAGE_SIZE // 2, IMAGE_SIZE // 2]},
        "preprocessing": PREPROCESSING,
        # Activation maps shown in the app's "inside my head" view.
        "brain": {"act1_channels": sorted(int(c) for c in np.argsort(-contrast1)[:BRAIN_MAPS_PER_LAYER]),
                  "act2_channels": sorted(int(c) for c in np.argsort(-contrast2)[:BRAIN_MAPS_PER_LAYER])},
    }
    (model_dir / "labels.json").write_text(json.dumps(labels, indent=2, ensure_ascii=False), encoding="utf-8")

    # A few real test drawings per class, for side-by-side comparison in the debug panel.
    rng = np.random.default_rng(SEED)
    y_np = y_test.numpy()
    samples = {c: [base64.b64encode(x_test[i].numpy().tobytes()).decode()
                   for i in rng.choice(np.flatnonzero(y_np == k), SAMPLES_PER_CLASS_WEB, replace=False)]
               for k, c in enumerate(CLASS_NAMES)}
    (model_dir / "samples.json").write_text(json.dumps(samples), encoding="utf-8")

    for src, dst in ((REPORTS_DIR / "metrics.json", model_dir / "metrics.json"),
                     (REPORTS_DIR / "confusion_matrix.png", img_dir / "confusion_matrix.png")):
        if src.exists():
            shutil.copyfile(src, dst)
        else:
            print(f"warning: {src.name} not found, run evaluate.py first")
    print(f"Wrote labels.json, metrics.json and confusion_matrix.png to {WEB_PUBLIC_DIR}")


if __name__ == "__main__":
    main()
