from ultralytics import YOLO
from app.services.xai_formatter import build_analysis

# Load model once at module level (cached)
_model = None


def get_model():
    global _model

    if _model is None:
        _model = YOLO("yolov8n.pt")  # downloads automatically on first run

    return _model


def detect_objects(image_path: str, threshold: float = 0.70) -> list:
    """
    Runs YOLOv8n on an image file.
    Returns list of detections above threshold.
    """

    model = get_model()

    results = model(image_path, conf=threshold)

    detections = []

    for result in results:
        for box in result.boxes:

            confidence = float(box.conf[0])

            if confidence >= threshold:

                label = result.names[int(box.cls[0])]
                bbox = box.xyxy[0].tolist()

                analysis = build_analysis(
                    model="YOLOv8n",
                    findings=[label],
                    confidence=confidence,
                    summary=f"Detected {label} in the image.",
                    metadata={
                        "bbox": [round(x, 1) for x in bbox]
                    },
                )

                detections.append(
                    {
                        "label": label,
                        "confidence": round(confidence, 3),
                        "bbox": [round(x, 1) for x in bbox],
                        "analysis": analysis,
                        "model_used": "YOLOv8n",
                    }
                )

    return detections
