import torch
from ultralytics import YOLO
from app.services.xai_formatter import build_analysis
from threading import Lock

# Load model once at module level (cached)
_model = None
_model_lock = Lock()
_inference_lock = Lock()


def get_model():
    global _model

    if _model is None:
        with _model_lock:
            if _model is None:
                _model = YOLO("yolov8n.pt")  # downloads automatically on first run

    return _model


def detect_objects(image_path: str, threshold: float = 0.40) -> list:
    """
    Runs YOLOv8n object detection.
    Threshold lowered to 0.40 for forensic use — recovers distant,
    occluded, and small objects that 0.70 would discard.
    High-resolution inference (imgsz=1280) preserves detail in
    multi-megapixel crime scene and CCTV images.
    """

    model = get_model()
    device = 0 if torch.cuda.is_available() else "cpu"

    with _inference_lock:
        results = model(
            image_path,
            device=device,
            conf=threshold,     # 0.40 — forensic recall optimized
            imgsz=1280,         # was 640 — preserves fine detail
            iou=0.45,           # slightly permissive NMS for dense scenes
            max_det=300,        # was default 100 — allows dense parking/crowd
            verbose=False,
        )

    detections = []
    det_idx = 0

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
                        "detection_index": det_idx,
                        "analysis": analysis,
                        "model_used": "YOLOv8n",
                    }
                )
                det_idx += 1

    return detections
