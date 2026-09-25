import re

import easyocr
import numpy as np
from threading import Lock
from PIL import Image, ImageOps

from app.services.xai_formatter import format_ocr_xai

_reader = None
_reader_lock = Lock()
_inference_lock = Lock()

OCR_MIN_CONFIDENCE = 0.25       # Reject below this — pure noise
OCR_WARN_CONFIDENCE = 0.60      # Flag as low-confidence in UI above this


def get_reader():
    global _reader

    if _reader is None:
        with _reader_lock:
            if _reader is None:
                _reader = easyocr.Reader(["en"], gpu=False)

    return _reader


def extract_text(image_path: str) -> list:
    """
    Runs EasyOCR on an image file.

    Pre-processes the image to a consistent RGB numpy array
    to prevent shape unpacking errors when the image has an
    alpha channel or unusual format.

    Applies EXIF orientation correction so rotated images from
    mobile phones or CCTV cameras are handled correctly.

    Filters out OCR noise: low-confidence results, non-alphanumeric
    artifacts, and single characters unless very high confidence.

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

    # EXIF orientation fix — mobile/CCTV images may be rotated
    img = Image.open(image_path).convert("RGB")
    img = ImageOps.exif_transpose(img)
    img_array = np.array(img)

    with _inference_lock:
        results = reader.readtext(img_array)

    output = []

    for (_, text, confidence) in results:
        text = text.strip()
        if not text:
            continue

        conf_float = float(confidence)

        # Hard reject: below minimum threshold — texture noise, not text
        if conf_float < OCR_MIN_CONFIDENCE:
            continue

        # Hard reject: no alphanumeric characters at all
        if not re.search(r'[a-zA-Z0-9]', text):
            continue

        # Hard reject: single character unless very high confidence
        # (legitimate single chars: room numbers, floor signs)
        if len(text) == 1 and conf_float < 0.85:
            continue

        xai = format_ocr_xai(text, conf_float)
        output.append({
            "text":           text,
            "confidence":     round(conf_float, 3),
            "low_confidence": bool(conf_float < OCR_WARN_CONFIDENCE),
            "xai_reason":     xai["xai_reason"],
        })

    return output
