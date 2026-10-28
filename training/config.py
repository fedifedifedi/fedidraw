"""Shared configuration for the FediDraw training pipeline."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"          # full Quick Draw .npy files (deleted after sampling by default)
SAMPLED_DIR = DATA_DIR / "sampled"  # SAMPLES_PER_CLASS drawings per category
DATASET_PATH = DATA_DIR / "quickdraw_30.npz"
CHECKPOINT_DIR = ROOT / "checkpoints"
REPORTS_DIR = ROOT / "reports"
WEB_PUBLIC_DIR = ROOT.parent / "web" / "public"

BASE_URL = "https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap"

# Official Quick Draw category names (used in download URLs) -> French display name.
CATEGORIES: dict[str, str] = {
    "airplane": "avion",
    "apple": "pomme",
    "banana": "banane",
    "bicycle": "vélo",
    "butterfly": "papillon",
    "cactus": "cactus",
    "camel": "chameau",
    "car": "voiture",
    "cat": "chat",
    "clock": "horloge",
    "cloud": "nuage",
    "crown": "couronne",
    "eye": "œil",
    "fish": "poisson",
    "flower": "fleur",
    "guitar": "guitare",
    "hammer": "marteau",
    "house": "maison",
    "key": "clé",
    "light bulb": "ampoule",
    "lightning": "éclair",
    "moon": "lune",
    "mushroom": "champignon",
    "palm tree": "palmier",
    "pizza": "pizza",
    "snowman": "bonhomme de neige",
    "star": "étoile",
    "sun": "soleil",
    "tree": "arbre",
    "umbrella": "parapluie",
}
CLASS_NAMES = list(CATEGORIES)  # label index = position in this list

SAMPLES_PER_CLASS = 10_000
IMAGE_SIZE = 28
SEED = 42

# On hybrid Intel CPUs (P + E cores) using only the P-cores is faster: the slow
# E-cores hold back every synchronised step. 6 = P-cores of an i5-14400F.
DEFAULT_THREADS = 6


def file_stem(category: str) -> str:
    """Local file name for a category ("light bulb" -> "light_bulb")."""
    return category.replace(" ", "_")
