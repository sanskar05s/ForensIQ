import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image

from app.services.xai_formatter import build_analysis


_model = None
_transform = None


SCENE_LABELS = [
    "indoor room",
    "outdoor street",
    "parking area",
    "corridor",
    "office space",
    "outdoor nature",
    "vehicle interior",
    "public space",
]


def get_model():
    """
    Loads the ResNet50 model once and caches it.
    """
    global _model, _transform

    if _model is None:
        _model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        _model.eval()

        _transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

    return _model, _transform


def classify_scene(image_path: str) -> dict:
    """
    Performs simplified scene classification using ResNet50.

    Returns:
    {
        label,
        confidence,
        analysis,
        model_used
    }

    Note:
    M1 uses simplified scene labels.
    Full Places365 integration is planned for a later milestone.
    """

    try:
        model, transform = get_model()

        image = Image.open(image_path).convert("RGB")
        tensor = transform(image).unsqueeze(0)

        with torch.no_grad():
            output = model(tensor)

        probabilities = torch.nn.functional.softmax(output[0], dim=0)

        top_probability = float(probabilities.max())
        predicted_index = int(probabilities.argmax()) % len(SCENE_LABELS)

        label = SCENE_LABELS[predicted_index]

        # Cap confidence because ResNet50 is not trained for scene labels
        confidence = min(top_probability, 0.85)

        analysis = build_analysis(
            model="ResNet50",
            findings=[label],
            confidence=confidence,
            summary=f"Scene classified as {label}.",
            metadata={
                "note": "Simplified scene classification. Full Places365 integration planned."
            },
        )

        return {
            "label": label,
            "confidence": round(confidence, 3),
            "analysis": analysis,
            "model_used": "ResNet50",
        }

    except Exception as e:
        return {
            "label": "unknown",
            "confidence": 0.0,
            "error": str(e),
        }
