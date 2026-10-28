"""Build the fixture for the web preprocessing parity test.

Fetches the first drawings of a few categories in vector form (simplified ndjson)
together with the matching official 28x28 bitmaps. The web test feeds the
strokes through preprocess.ts and checks the result against the bitmaps.

    python make_parity_fixture.py   # -> web/src/preprocess.fixture.json
"""

import base64
import json

from config import WEB_PUBLIC_DIR
from inspect_format import first_bitmaps, first_drawings

CLASSES = ["cat", "sun", "camel", "house", "banana", "moon", "key", "mushroom"]
PER_CLASS = 8
OUT = WEB_PUBLIC_DIR.parent / "src" / "preprocess.fixture.json"


def main() -> None:
    items = []
    for name in CLASSES:
        print(f"fetching {PER_CLASS} drawings of {name}")
        bitmaps = first_bitmaps(name, PER_CLASS)
        for drawing, bitmap in zip(first_drawings(name, PER_CLASS), bitmaps):
            items.append({"class": name, "strokes": drawing, "bitmap": base64.b64encode(bitmap.tobytes()).decode()})
    OUT.write_text(json.dumps(items), encoding="utf-8")
    print(f"Saved {len(items)} drawings to {OUT}")


if __name__ == "__main__":
    main()
