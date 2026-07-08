from datetime import datetime


def build_analysis(
    *,
    model: str,
    findings: list,
    confidence: float,
    summary: str,
    metadata: dict | None = None,
):
    """
    Standardizes AI analysis responses for all models.
    """

    return {
        "model": model,
        "summary": summary,
        "confidence": round(float(confidence), 3),
        "findings": findings,
        "metadata": metadata or {},
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def format_ocr_xai(text: str, confidence: float) -> dict:
    """
    XAI explanation for a single OCR text extraction result.
    Returns a dict with xai_reason, model_used, and confidence.
    """
    return {
        "xai_reason": (
            f"Text \"{text}\" extracted with {confidence * 100:.0f}% confidence "
            f"by the EasyOCR engine."
        ),
        "model_used": "EasyOCR",
        "confidence": round(float(confidence), 3),
    }


def build_error(message: str):
    return {
        "success": False,
        "error": message,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def build_success(result: dict):
    return {
        "success": True,
        "result": result,
    }
