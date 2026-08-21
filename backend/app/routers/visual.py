import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.supabase import get_supabase_client
from app.services.visual_analyzer.detector import detect_objects
from app.services.visual_analyzer.ocr import extract_text
from app.services.visual_analyzer.scene_classifier import classify_scene
from app.services.activity_logger import log_activity

router = APIRouter(
    prefix="/visual",
    tags=["Visual Analysis"],
)


@router.post("/cases/{case_id}/evidence/{evidence_id}/analyze-image")
def analyze_image(case_id: str, evidence_id: str):
    """
    M1-C: Full image analysis pipeline.

    1. Fetches evidence record and validates type == 'image'
    2. Downloads from Supabase Storage to a temp file
    3. Runs YOLOv8n object detection
    4. Runs EasyOCR text extraction
    5. Runs ResNet50 scene classification
    6. Writes all results + XAI summary back to evidence row
    """

    supabase = get_supabase_client()
    temp_path = None

    try:
        # 1 — Fetch evidence record
        result = (
            supabase.table("evidence")
            .select("*")
            .eq("id", evidence_id)
            .eq("case_id", case_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail=f"Evidence {evidence_id} not found in case {case_id}",
            )

        evidence = result.data[0]

        # 2 — Validate type
        if evidence["type"] != "image":
            raise HTTPException(
                status_code=400,
                detail=f"Evidence type is '{evidence['type']}', expected 'image'",
            )

        # 3 — Set status to 'analyzing'
        supabase.table("evidence").update(
            {"status": "analyzing"}
        ).eq("id", evidence_id).execute()

        # 4 — Download file from Supabase Storage
        storage_path = evidence["storage_path"]
        file_bytes = supabase.storage.from_("evidence").download(storage_path)

        # Write to temp file with correct extension
        suffix = Path(evidence["filename"]).suffix or ".jpg"
        if suffix.lower() in (".jfif", ".jpe"):
            suffix = ".jpg"  # JFIF is JPEG — rename for library compatibility
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            temp_path = tmp.name

        # 5 — Run all three analysis modules
        detections = detect_objects(temp_path)
        ocr_results = extract_text(temp_path)
        scene = classify_scene(temp_path)

        # 6 — Build XAI summary
        scene_label = scene.get("label", "unknown")
        xai_summary = (
            f"{len(detections)} object(s) detected. "
            f"{len(ocr_results)} text block(s) extracted. "
            f"Scene: {scene_label}."
        )

        # 7 — Compute average confidence across all results
        all_confidences = []
        for d in detections:
            all_confidences.append(d.get("confidence", 0.0))
        for o in ocr_results:
            all_confidences.append(o.get("confidence", 0.0))
        scene_conf = scene.get("confidence", 0.0)
        if scene_conf > 0:
            all_confidences.append(scene_conf)

        avg_confidence = (
            sum(all_confidences) / len(all_confidences)
            if all_confidences
            else 0.0
        )

        # 8 — Update evidence row with results
        supabase.table("evidence").update(
            {
                "status": "analyzed",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
                "object_detections": detections,
                "ocr_text": ocr_results,
                "scene_classification": scene,
                "analysis_confidence": round(avg_confidence, 3),
                "xai_summary": xai_summary,
            }
        ).eq("id", evidence_id).execute()

        # 9 — Return summary
        log_activity(
            case_id=case_id,
            event_type="evidence_analyzed",
            description=f"Image analysis complete: {len(detections)} objects, {len(ocr_results)} text blocks, scene: {scene_label}",
            metadata={"evidence_id": evidence_id, "type": "image", "detections": len(detections), "ocr_blocks": len(ocr_results)},
        )

        return {
            "success": True,
            "evidence_id": evidence_id,
            "detections": len(detections),
            "ocr_blocks": len(ocr_results),
            "scene": scene_label,
            "confidence": round(avg_confidence, 3),
            "xai_summary": xai_summary,
        }

    except HTTPException:
        raise

    except Exception as e:
        # Set status to 'failed' on any unexpected error
        try:
            supabase.table("evidence").update(
                {"status": "failed"}
            ).eq("id", evidence_id).execute()
        except Exception:
            pass  # Don't mask the original error

        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Always clean up temp file
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink()
