import easyocr
from app.services.xai_formatter import build_analysis

_reader = None

def get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(['en'], gpu=False)
    return _reader

import easyocr

from app.services.xai_formatter import build_analysis

# Load EasyOCR once (cached)
_reader = None


def get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def extract_text(image_path: str, threshold: float = 0.70) -> list:
    """
    Runs EasyOCR on an image.

    Returns:
    [
        {
            "text": "...",
            "confidence": 0.98,
            "low_confidence": False,
            "analysis": {...},
            "model_used": "EasyOCR"
        }
    ]
    """

    reader = get_reader()
    results = reader.readtext(image_path)

    output = []

    for (_, text, confidence) in results:

        if not text.strip():
            continue

        analysis = build_analysis(
            model="EasyOCR",
            findings=[text.strip()],
            confidence=confidence,
            summary=f'Extracted text "{text.strip()}".',
            metadata={
                "low_confidence": confidence < threshold
            }
        )

        output.append(
            {
                "text": text.strip(),
                "confidence": round(confidence, 3),
                "low_confidence": confidence < threshold,
                "analysis": analysis,
                "model_used": "EasyOCR",
            }
        )

    return output
