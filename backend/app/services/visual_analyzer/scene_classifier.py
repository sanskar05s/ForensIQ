"""
ForensIQ Scene Classifier — Places365-ResNet18

Uses ResNet18 pretrained on MIT Places365 (365 scene categories)
instead of ImageNet (object categories). Places365 understands
environments: parking lots, offices, streets, corridors, bedrooms.

The previous implementation used ResNet50 + ImageNet with argmax()%8
modulo hashing, which was effectively random (a car-dominated image
hashed to whatever ImageNet class index % 8 produced).

Graceful degradation: if Places365 weights are not found, logs a
warning and returns a 'unknown' classification with low confidence.
The system continues to function — scene is not required for other
modules to work.
"""

import os
import logging
from pathlib import Path
from typing import Optional

import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# ── Model paths ────────────────────────────────────────────────────────────────

_MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models"
_WEIGHTS_PATH = _MODELS_DIR / "resnet18_places365.pth.tar"
_LABELS_PATH  = _MODELS_DIR / "categories_places365.txt"

# ── Lazy-loaded model state ────────────────────────────────────────────────────

_model: Optional[torch.nn.Module] = None
_classes: Optional[list] = None
_model_loaded: bool = False

# ── ForensIQ simplified label mapping ─────────────────────────────────────────
# Maps Places365 category names → 8 ForensIQ scene labels.
# Categories not listed fall back to the closest group via indoor/outdoor flag.

PLACES_TO_FORENSIQ = {
    # Indoor residential
    "bedroom":              "indoor room",
    "bathroom":             "indoor room",
    "living_room":          "indoor room",
    "kitchen":              "indoor room",
    "dining_room":          "indoor room",
    "nursery":              "indoor room",
    "playroom":             "indoor room",

    # Office / commercial indoor
    "office":               "office space",
    "conference_room":      "office space",
    "computer_room":        "office space",
    "library/indoor":       "office space",
    "server_room":          "office space",
    "reception":            "office space",
    "waiting_room":         "office space",

    # Corridor / transit indoor
    "corridor":             "corridor",
    "hallway":              "corridor",
    "staircase":            "corridor",
    "elevator_lobby":       "corridor",
    "subway_station/platform": "corridor",

    # Vehicle interior
    "bus_interior":         "vehicle interior",
    "train_interior":       "vehicle interior",
    "car_interior":         "vehicle interior",
    "airplane_cabin":       "vehicle interior",
    "cockpit":              "vehicle interior",

    # Outdoor street / urban
    "street":               "outdoor street",
    "road":                 "outdoor street",
    "highway":              "outdoor street",
    "crosswalk":            "outdoor street",
    "sidewalk":             "outdoor street",
    "alley":                "outdoor street",
    "traffic_island":       "outdoor street",
    "downtown":             "outdoor street",

    # Parking
    "parking_lot":          "parking area",
    "gas_station":          "parking area",
    "parking_garage/indoor": "parking area",
    "parking_garage/outdoor": "parking area",

    # Public spaces
    "plaza":                "public space",
    "market/outdoor":       "public space",
    "shopping_mall/indoor": "public space",
    "airport_terminal":     "public space",
    "train_station/platform": "public space",
    "bank_vault":           "public space",
    "hospital":             "public space",
    "supermarket":          "public space",
    "restaurant":           "public space",
    "bar":                  "public space",
    "shop/indoor":          "public space",

    # Outdoor nature
    "park":                 "outdoor nature",
    "forest/broadleaf":     "outdoor nature",
    "field/wild":           "outdoor nature",
    "beach":                "outdoor nature",
    "mountain":             "outdoor nature",
    "river":                "outdoor nature",
    "sky":                  "outdoor nature",
    "cliff":                "outdoor nature",
}

# Standard 8 ForensIQ scene labels (unchanged from original)
FORENSIQ_SCENES = [
    "indoor room", "outdoor street", "parking area", "corridor",
    "office space", "outdoor nature", "vehicle interior", "public space"
]


def _load_model():
    """Loads Places365-ResNet18. Fails gracefully if weights absent."""
    global _model, _classes, _model_loaded

    if _model_loaded:
        return _model, _classes

    _model_loaded = True  # Set before loading to prevent retry loops

    # Load class labels
    if _LABELS_PATH.exists():
        with open(_LABELS_PATH) as f:
            # Format: "/a/abbey 0" — extract the name part
            _classes = [
                line.strip().split(" ")[0].split("/")[-1].replace("_", " ")
                for line in f if line.strip()
            ]
    else:
        logger.warning(
            "Places365 labels not found at %s. "
            "Download from https://raw.githubusercontent.com/csailvision/"
            "places365/master/categories_places365.txt", _LABELS_PATH
        )
        _classes = [str(i) for i in range(365)]

    # Load model
    if not _WEIGHTS_PATH.exists():
        logger.warning(
            "Places365 weights not found at %s. "
            "Scene classification will return 'unknown'. "
            "Download resnet18_places365.pth.tar from "
            "http://places2.csail.mit.edu/models_places365/", _WEIGHTS_PATH
        )
        _model = None
        return None, _classes

    try:
        m = models.resnet18(num_classes=365)
        checkpoint = torch.load(str(_WEIGHTS_PATH), map_location="cpu")

        # Handle both direct state_dict and checkpoint dict formats
        state = checkpoint.get("state_dict", checkpoint)
        state = {k.replace("module.", ""): v for k, v in state.items()}
        m.load_state_dict(state)
        m.eval()
        _model = m
        logger.info("Places365-ResNet18 loaded from %s", _WEIGHTS_PATH)
    except Exception as e:
        logger.error("Failed to load Places365 weights: %s", e)
        _model = None

    return _model, _classes


# ── Image transform (scene-optimized, no destructive center crop) ──────────────

_TRANSFORM = transforms.Compose([
    # Resize shorter edge to 256 — preserves floor/ceiling context
    transforms.Resize(256),
    # Center crop to 224 for ResNet input
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    ),
])


def classify_scene(image_path: str) -> dict:
    """
    Classifies the scene depicted in an image using Places365-ResNet18.

    Returns:
    {
        label:      ForensIQ simplified scene label (e.g. "outdoor street")
        confidence: float 0.0-1.0
        environment: "indoor" | "outdoor" | "unknown"
        xai_reason: human-readable explanation
    }
    """
    model, classes = _load_model()

    # Graceful degradation — weights not available
    if model is None:
        return {
            "label":       "unknown",
            "confidence":  0.0,
            "environment": "unknown",
            "xai_reason":  (
                "Scene classification unavailable. "
                "Places365 model weights not found. "
                "Download resnet18_places365.pth.tar to backend/models/."
            ),
            "note": "Simplified scene classification. Places365 weights required."
        }

    # Load and preprocess image
    img = Image.open(image_path).convert("RGB")
    img = ImageOps.exif_transpose(img)  # Fix EXIF rotation from mobile/CCTV
    tensor = _TRANSFORM(img).unsqueeze(0)

    # Run inference
    with torch.no_grad():
        logits = model(tensor)
        probs  = torch.nn.functional.softmax(logits, dim=1)[0]

    # Top-5 predictions
    top5_vals, top5_idx = probs.topk(5)
    top5_vals = top5_vals.tolist()
    top5_idx  = top5_idx.tolist()

    # Get top raw category name
    top_raw = classes[top5_idx[0]] if top5_idx[0] < len(classes) else "unknown"
    top_conf = top5_vals[0]

    # Accumulate ForensIQ scores across top-5
    forensiq_scores: dict = {}
    for idx, conf in zip(top5_idx, top5_vals):
        raw = classes[idx] if idx < len(classes) else "unknown"
        forensiq = PLACES_TO_FORENSIQ.get(raw)

        # Fallback: use indoor/outdoor heuristic from class name
        if forensiq is None:
            is_indoor = any(k in raw for k in [
                "indoor", "room", "office", "hall", "bath", "bed",
                "kitchen", "living", "dining", "shop", "store", "bar",
                "restaurant", "hospital", "library", "studio", "gym"
            ])
            forensiq = "indoor room" if is_indoor else "public space"

        forensiq_scores[forensiq] = forensiq_scores.get(forensiq, 0) + conf

    best_label = max(forensiq_scores, key=forensiq_scores.get)
    best_conf  = forensiq_scores[best_label]

    # Environment tag
    indoor_labels = {"indoor room", "office space", "corridor", "vehicle interior"}
    environment = "indoor" if best_label in indoor_labels else "outdoor"

    # Top-3 for XAI
    top3_raw = [
        f"{classes[i]} ({v:.0%})"
        for i, v in zip(top5_idx[:3], top5_vals[:3])
        if i < len(classes)
    ]

    return {
        "label":       best_label,
        "confidence":  round(float(best_conf), 3),
        "environment": environment,
        "xai_reason":  (
            f"Scene classified as '{best_label}' ({environment}) "
            f"by Places365-ResNet18 (confidence: {best_conf:.0%}). "
            f"Top Places365 categories: {', '.join(top3_raw)}."
        ),
        "note": "Scene classification using Places365 (365 scene categories)."
    }
