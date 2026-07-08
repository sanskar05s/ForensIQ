import easyocr
import numpy as np
from PIL import Image

from app.services.xai_formatter import format_ocr_xai

_reader = None


def get_reader():
    global _reader

    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False)

    return _reader


def extract_text(image_path: str, threshold: float = 0.70) -> list:
    """
    Runs EasyOCR on an image file.

    Pre-processes the image to a consistent RGB numpy array
    to prevent shape unpacking errors when the image has an
    alpha channel or unusual format.

    Returns:
    [
        {
            "text": "...",
            "confidence": 0.98,
            "low_confidence": False,
            "xai_reason": "..."
        }
    ]
    """

    reader = get_reader()

    # Pre-process to RGB numpy array — prevents shape unpacking
    # errors when image has alpha channel or unusual format
    img = Image.open(image_path).convert("RGB")
    img_array = np.array(img)

    results = reader.readtext(img_array)

    output = []

    for (_, text, confidence) in results:

        text = text.strip()

        if not text:
            continue

        xai = format_ocr_xai(text, confidence)

        output.append(
            {
                "text": text,
                "confidence": round(float(confidence), 3),
                "low_confidence": bool(confidence < threshold),
                "xai_reason": xai["xai_reason"],
            }
        )

    return output
