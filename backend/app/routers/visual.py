from pathlib import Path
import shutil
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.visual_analyzer.detector import detect_objects
from app.services.visual_analyzer.ocr import extract_text
from app.services.visual_analyzer.scene_classifier import classify_scene

router = APIRouter(
    prefix="/visual",
    tags=["Visual Analysis"]
)


@router.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    """
    M1-C Visual Analysis

    Upload an image and run:
    - YOLOv8 Object Detection
    - EasyOCR
    - Scene Classification
    """

    temp_path = None

    try:
        suffix = Path(file.filename).suffix

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name

        detections = detect_objects(temp_path)
        ocr_results = extract_text(temp_path)
        scene = classify_scene(temp_path)

        return {
            "success": True,
            "filename": file.filename,
            "detections": detections,
            "ocr": ocr_results,
            "scene": scene
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
