"""Train/validation/test split, normalisation, batching and data augmentation."""

import math

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.model_selection import train_test_split

from config import DATASET_PATH, SEED

# Augmentation ranges. Quick Draw bitmaps are always centred with a constant
# relative stroke width (see reports/format_report.md), so we only perturb what
# varies between real users: slant, size, proportions, and a ±1 px jitter.
MAX_ROTATION_DEG = 10.0
SCALE_RANGE = (0.9, 1.1)
ASPECT_RANGE = (0.9, 1.1)
MAX_SHIFT_PX = 1.0


def load_splits() -> dict[str, tuple[torch.Tensor, torch.Tensor]]:
    """Stratified 80/10/10 split. Images stay uint8 (N, 28, 28) to save memory."""
    data = np.load(DATASET_PATH)
    x, y = data["x"], data["y"]
    idx = np.arange(len(y))
    train_idx, rest = train_test_split(idx, test_size=0.2, stratify=y, random_state=SEED)
    val_idx, test_idx = train_test_split(rest, test_size=0.5, stratify=y[rest], random_state=SEED)
    return {
        name: (torch.from_numpy(x[i]), torch.from_numpy(y[i].astype(np.int64)))
        for name, i in (("train", train_idx), ("val", val_idx), ("test", test_idx))
    }


def pixel_stats(x: torch.Tensor) -> tuple[float, float]:
    """Mean and std of the training pixels after scaling to [0, 1]."""
    v = x.float().div_(255)
    return v.mean().item(), v.std().item()


def augment(x: torch.Tensor, generator: torch.Generator) -> torch.Tensor:
    """Random affine transform of a batch (N, 1, 28, 28) in [0, 1], around the image centre."""
    n, _, h, w = x.shape

    def uniform(lo, hi):
        return torch.empty(n).uniform_(lo, hi, generator=generator)

    angle = uniform(-MAX_ROTATION_DEG, MAX_ROTATION_DEG) * math.pi / 180
    scale = uniform(*SCALE_RANGE)
    aspect = uniform(*ASPECT_RANGE).sqrt()
    sx, sy = scale * aspect, scale / aspect
    shift = torch.stack([uniform(-MAX_SHIFT_PX, MAX_SHIFT_PX) * 2 / w,
                         uniform(-MAX_SHIFT_PX, MAX_SHIFT_PX) * 2 / h], 1)

    # affine_grid maps output coordinates to input coordinates, so we build the
    # inverse of "scale, then rotate, then shift".
    cos, sin = torch.cos(angle), torch.sin(angle)
    inv = torch.stack([torch.stack([cos / sx, sin / sx], 1),
                       torch.stack([-sin / sy, cos / sy], 1)], 1)       # (N, 2, 2)
    theta = torch.cat([inv, -(inv @ shift.unsqueeze(2))], 2)            # (N, 2, 3)
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    return F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)


class Batches:
    """Iterates over (images, labels) as normalised float batches (N, 1, 28, 28), channels-last."""

    def __init__(self, x, y, batch_size, mean, std, shuffle=False, augment_seed=None, seed=SEED):
        self.x, self.y = x, y
        self.batch_size, self.mean, self.std, self.shuffle = batch_size, mean, std, shuffle
        self.order_gen = torch.Generator().manual_seed(seed)
        self.aug_gen = torch.Generator().manual_seed(augment_seed) if augment_seed is not None else None

    def __len__(self):
        return math.ceil(len(self.y) / self.batch_size)

    def __iter__(self):
        order = torch.randperm(len(self.y), generator=self.order_gen) if self.shuffle else torch.arange(len(self.y))
        for i in range(0, len(order), self.batch_size):
            idx = order[i:i + self.batch_size]
            xb = self.x[idx].unsqueeze(1).float().div_(255)
            if self.aug_gen is not None:
                xb = augment(xb, self.aug_gen)
            xb = xb.sub_(self.mean).div_(self.std).contiguous(memory_format=torch.channels_last)
            yield xb, self.y[idx]
