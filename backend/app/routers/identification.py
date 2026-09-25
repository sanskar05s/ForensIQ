"""
ForensIQ — Human Object Identification Endpoints

Records investigator/witness identifications of YOLO detections.
Stored SEPARATELY from witness_statements — never modifies original testimony.

Forensic chain:
  AI detection (object_detections JSONB) ← AI output, read-only
  detection_identifications table        ← human identification, separate
"""

import io
import os
import logging
import tempfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from PIL import Image

from app.core.supabase import get_supabase_client
from app.core.auth import require_case_owner
from app.services.activity_logger import log_activity

router = APIRouter(dependencies=[Depends(require_case_owner)])
logger = logging.getLogger(__name__)


# ── Identification CRUD ────────────────────────────────────────────────────────

class IdentificationRequest(BaseModel):
    detection_index:       int
    canonical_name:        str
    alias:                 Optional[str] = None
    identified_by:         str           # witness label or "Investigator"
    identification_source: str           # witness | investigator | document | other
    statement_id:          Optional[str] = None
    notes:                 Optional[str] = None


@router.post("/identification/cases/{case_id}/evidence/{evidence_id}")
def add_identification(
    case_id: str,
    evidence_id: str,
    body: IdentificationRequest,
):
    """
    Records a human identification of a YOLO detection.

    This is a SEPARATE record from witness_statements.
    The original witness statement is NEVER modified.
    This records the act of showing a detection crop to a witness
    and their response: "Yes, that's Anil."
    """
    if not body.canonical_name.strip():
        raise HTTPException(status_code=400, detail="canonical_name is required")

    valid_sources = {"witness", "investigator", "document", "other"}
    if body.identification_source not in valid_sources:
        raise HTTPException(
            status_code=400,
            detail=f"identification_source must be one of: {valid_sources}"
        )

    supabase = get_supabase_client()

    # Verify evidence exists and belongs to case
    ev_res = supabase.table("evidence")\
        .select("id, object_detections")\
        .eq("id", evidence_id)\
        .eq("case_id", case_id)\
        .execute()
    if not ev_res.data:
        raise HTTPException(status_code=404, detail="Evidence not found")
    ev = ev_res.data[0]

    if body.statement_id:
        statement_res = supabase.table("witness_statements")\
            .select("id")\
            .eq("id", body.statement_id)\
            .eq("case_id", case_id)\
            .maybe_single()\
            .execute()
        if not statement_res.data:
            raise HTTPException(status_code=404, detail="Statement not found in case")

    # Verify detection_index is valid
    detections = ev.get("object_detections") or []
    if body.detection_index < 0 or body.detection_index >= len(detections):
        raise HTTPException(
            status_code=400,
            detail=f"detection_index {body.detection_index} out of range "
                   f"(evidence has {len(detections)} detections)"
        )

    # Store identification (separate table — not in witness_statements)
    result = supabase.table("detection_identifications").insert({
        "case_id":               case_id,
        "evidence_id":           evidence_id,
        "detection_index":       body.detection_index,
        "canonical_name":        body.canonical_name.strip(),
        "alias":                 (body.alias or "").strip() or None,
        "identified_by":         body.identified_by.strip(),
        "identification_source": body.identification_source,
        "statement_id":          body.statement_id or None,
        "notes":                 (body.notes or "").strip() or None,
        "created_at":            datetime.now(timezone.utc).isoformat(),
    }).execute()

    try:
        log_activity(
            case_id=case_id,
            event_type="evidence_analyzed",
            description=(
                f"Detection #{body.detection_index} identified as "
                f"'{body.canonical_name}' by {body.identified_by} "
                f"({body.identification_source})"
            ),
            metadata={
                "evidence_id":     evidence_id,
                "detection_index": body.detection_index,
                "canonical_name":  body.canonical_name,
                "identified_by":   body.identified_by,
                "source":          body.identification_source,
            }
        )
    except Exception:
        pass

    return {
        "success":        True,
        "identification": result.data[0] if result.data else {},
        "note": (
            "Identification stored as a separate record. "
            "Original witness statement was NOT modified."
        ),
    }


@router.get("/identification/cases/{case_id}/evidence/{evidence_id}")
def get_identifications(case_id: str, evidence_id: str):
    """Returns all human identifications for a given evidence item."""
    supabase = get_supabase_client()
    result = supabase.table("detection_identifications")\
        .select("*")\
        .eq("evidence_id", evidence_id)\
        .eq("case_id", case_id)\
        .order("created_at", desc=False)\
        .execute()
    return {"identifications": result.data or []}


@router.delete("/identification/cases/{case_id}/evidence/{evidence_id}/{identification_id}")
def delete_identification(
    case_id: str,
    evidence_id: str,
    identification_id: str,
):
    """Removes a human identification record."""
    supabase = get_supabase_client()
    supabase.table("detection_identifications")\
        .delete()\
        .eq("id", identification_id)\
        .eq("evidence_id", evidence_id)\
        .eq("case_id", case_id)\
        .execute()
    return {"success": True}


# ── Detection Crop ─────────────────────────────────────────────────────────────

@router.get("/identification/cases/{case_id}/evidence/{evidence_id}/crop/{detection_index}")
def get_detection_crop(
    case_id: str,
    evidence_id: str,
    detection_index: int,
    padding: int = 20,    # pixels of context padding around bbox
):
    """
    Returns a JPEG crop of the specified detection bounding box.
    Used by the frontend to show investigators exactly which region
    YOLO classified as an object.

    padding: extra pixels added around the bounding box (default 20px)
             provides visual context for the investigator.
    """
    supabase = get_supabase_client()

    # Fetch evidence
    ev_res = supabase.table("evidence")\
        .select("id, storage_path, object_detections")\
        .eq("id", evidence_id)\
        .eq("case_id", case_id)\
        .execute()
    if not ev_res.data:
        raise HTTPException(status_code=404, detail="Evidence not found")
    ev = ev_res.data[0]

    detections = ev.get("object_detections") or []
    if detection_index < 0 or detection_index >= len(detections):
        raise HTTPException(
            status_code=404,
            detail=f"Detection index {detection_index} not found"
        )

    det = detections[detection_index]
    bbox = det.get("bbox")
    if not bbox or len(bbox) < 4:
        raise HTTPException(
            status_code=422,
            detail="Detection has no bounding box data"
        )

    # Download image from Supabase Storage
    storage_path = ev.get("storage_path", "")
    if not storage_path:
        raise HTTPException(status_code=422, detail="No storage path for evidence")

    # Determine bucket from storage_path
    bucket = "evidence"
    file_path = storage_path
    if storage_path.startswith("evidence/"):
        file_path = storage_path[len("evidence/"):]

    try:
        raw = supabase.storage.from_(bucket).download(file_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not download evidence file: {e}"
        )

    # Open with PIL
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Could not open image: {e}"
        )

    w, h = img.size
    x1, y1, x2, y2 = bbox[:4]

    # Check if bbox is normalized (0.0-1.0) or absolute pixels
    # Normalized: all values between 0 and 1
    # Absolute: values > 1 (pixel coordinates)
    if all(0.0 <= v <= 1.0 for v in [x1, y1, x2, y2]):
        # Normalized coordinates — convert to absolute
        x1 = int(x1 * w)
        y1 = int(y1 * h)
        x2 = int(x2 * w)
        y2 = int(y2 * h)
    else:
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

    # Ensure coordinates are properly ordered
    if x1 > x2:
        x1, x2 = x2, x1
    if y1 > y2:
        y1, y2 = y2, y1

    # Apply padding with boundary clamping
    x1_pad = max(0, x1 - padding)
    y1_pad = max(0, y1 - padding)
    x2_pad = min(w, max(x1_pad + 1, x2 + padding))
    y2_pad = min(h, max(y1_pad + 1, y2 + padding))

    crop = img.crop((x1_pad, y1_pad, x2_pad, y2_pad))

    # Return as JPEG
    buf = io.BytesIO()
    crop.save(buf, format="JPEG", quality=85)
    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "max-age=3600",
            "X-Detection-Label": det.get("label", "unknown"),
            "X-Detection-Confidence": str(det.get("confidence", 0)),
        }
    )


# ── Full image with overlay metadata ──────────────────────────────────────────

@router.get("/identification/cases/{case_id}/evidence/{evidence_id}/overlay-data")
def get_overlay_data(case_id: str, evidence_id: str):
    """
    Returns detection data formatted for SVG overlay rendering.
    Frontend uses this to draw bounding boxes over the full image.
    Also includes any human identifications for each detection.
    """
    supabase = get_supabase_client()

    ev_res = supabase.table("evidence")\
        .select("id, object_detections")\
        .eq("id", evidence_id)\
        .eq("case_id", case_id)\
        .execute()
    if not ev_res.data:
        raise HTTPException(status_code=404, detail="Evidence not found")
    ev = ev_res.data[0]

    detections = ev.get("object_detections") or []

    # Fetch all identifications for this evidence item
    id_result = supabase.table("detection_identifications")\
        .select("*")\
        .eq("evidence_id", evidence_id)\
        .execute()
    identifications = id_result.data or []

    # Group identifications by detection_index
    id_by_index: dict = {}
    for ident in identifications:
        idx = ident["detection_index"]
        id_by_index.setdefault(idx, []).append(ident)

    # Build overlay data
    overlay = []
    for det in detections:
        idx = det.get("detection_index",
                       detections.index(det))  # fallback if index missing
        overlay.append({
            "detection_index":   idx,
            "label":             det.get("label", "object"),
            "confidence":        det.get("confidence", 0.0),
            "bbox":              det.get("bbox", []),
            "identifications":   id_by_index.get(idx, []),
            "is_identified":     bool(id_by_index.get(idx)),
        })

    return {"overlay": overlay}
