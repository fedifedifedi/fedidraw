"""Download Quick Draw numpy_bitmap files and keep a random subset per category.

Downloads are resumable (HTTP Range) and verified against the MD5 published by
Google Cloud Storage, so an interrupted run can simply be restarted.

    python download.py              # download, sample, build data/quickdraw_30.npz
    python download.py --keep-raw   # keep the full .npy files (~3 GB)
"""

import argparse
import base64
import hashlib
import time
from pathlib import Path
from urllib.parse import quote

import numpy as np
import requests
from tqdm import tqdm

from config import (
    BASE_URL, CLASS_NAMES, DATASET_PATH, IMAGE_SIZE, RAW_DIR, SAMPLED_DIR,
    SAMPLES_PER_CLASS, SEED, file_stem,
)

CHUNK = 1 << 20
MAX_ATTEMPTS = 50


def remote_info(url: str) -> tuple[int, str | None]:
    """Return (size, base64 md5) from the GCS object headers."""
    r = requests.head(url, timeout=30)
    r.raise_for_status()
    md5 = None
    # requests joins repeated x-goog-hash headers with ", "
    for part in r.headers.get("x-goog-hash", "").split(","):
        key, _, value = part.strip().partition("=")
        if key == "md5":
            md5 = value
    return int(r.headers["Content-Length"]), md5


def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return base64.b64encode(h.digest()).decode()


def download(url: str, dest: Path, desc: str) -> None:
    """Resumable download of url into dest, verified by size and MD5."""
    size, md5 = remote_info(url)
    if dest.exists() and dest.stat().st_size == size and (md5 is None or file_md5(dest) == md5):
        print(f"{desc}: already downloaded")
        return

    part = dest.with_suffix(dest.suffix + ".part")
    with tqdm(total=size, unit="B", unit_scale=True, unit_divisor=1024, desc=desc) as bar:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            have = part.stat().st_size if part.exists() else 0
            if have > size:
                part.unlink()
                have = 0
            bar.n = have
            bar.refresh()
            if have < size:
                try:
                    headers = {"Range": f"bytes={have}-"} if have else {}
                    with requests.get(url, headers=headers, stream=True, timeout=60) as r:
                        r.raise_for_status()
                        if have and r.status_code != 206:  # server ignored the range: restart
                            have = 0
                            bar.n = 0
                        with part.open("ab" if have else "wb") as f:
                            for chunk in r.iter_content(CHUNK):
                                f.write(chunk)
                                bar.update(len(chunk))
                except (requests.RequestException, OSError) as e:
                    bar.write(f"  {desc}: interrupted ({type(e).__name__}), resuming (attempt {attempt})")
                    time.sleep(min(2 * attempt, 10))
                    continue

            if part.stat().st_size != size:
                continue
            if md5 is not None and file_md5(part) != md5:
                bar.write(f"  {desc}: MD5 mismatch, downloading again")
                part.unlink()
                continue
            part.replace(dest)
            return
    raise RuntimeError(f"{desc}: failed after {MAX_ATTEMPTS} attempts")


def sample(raw_path: Path, out_path: Path, rng: np.random.Generator) -> int:
    """Pick SAMPLES_PER_CLASS random drawings and save them. Returns the total count in the file."""
    data = np.load(raw_path, mmap_mode="r", allow_pickle=False)
    assert data.dtype == np.uint8 and data.shape[1] == IMAGE_SIZE * IMAGE_SIZE, (data.dtype, data.shape)
    idx = np.sort(rng.choice(len(data), SAMPLES_PER_CLASS, replace=False))
    np.save(out_path, np.ascontiguousarray(data[idx]))
    return len(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep-raw", action="store_true", help="keep the full .npy files after sampling")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLED_DIR.mkdir(parents=True, exist_ok=True)
    n = len(CLASS_NAMES)
    start = time.time()

    for i, name in enumerate(CLASS_NAMES):
        desc = f"[{i + 1:2d}/{n}] {name}"
        stem = file_stem(name)
        sampled = SAMPLED_DIR / f"{stem}.npy"
        if sampled.exists():
            print(f"{desc}: already sampled")
            continue
        raw = RAW_DIR / f"{stem}.npy"
        download(f"{BASE_URL}/{quote(name)}.npy", raw, desc)
        # One generator per category so re-running a single category gives the same subset.
        total = sample(raw, sampled, np.random.default_rng([SEED, i]))
        print(f"{desc}: kept {SAMPLES_PER_CLASS:,} of {total:,} drawings")
        if not args.keep_raw:
            raw.unlink()

    print("Building dataset...")
    x = np.concatenate([np.load(SAMPLED_DIR / f"{file_stem(c)}.npy") for c in CLASS_NAMES])
    y = np.repeat(np.arange(n, dtype=np.uint8), SAMPLES_PER_CLASS)
    np.savez(DATASET_PATH, x=x.reshape(-1, IMAGE_SIZE, IMAGE_SIZE), y=y, classes=np.array(CLASS_NAMES))
    print(f"Saved {DATASET_PATH} ({len(x):,} images, {DATASET_PATH.stat().st_size / 2**20:.0f} MB) "
          f"in {(time.time() - start) / 60:.1f} min")


if __name__ == "__main__":
    main()
