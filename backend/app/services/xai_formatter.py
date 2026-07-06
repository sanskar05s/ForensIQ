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
