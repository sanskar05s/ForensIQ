from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.services.doc_metadata.text_extractor import extract_text
from app.services.doc_metadata.exif_extractor import extract_metadata
from app.services.doc_metadata.integrity_check import check_integrity
import tempfile
import os
from datetime import datetime, timezone
from app.services.activity_logger import log_activity

router = APIRouter(
    prefix="/doc",
    tags=["Document Metadata"],
)


@router.post("/cases/{case_id}/evidence/{evidence_id}/extract-document")
async def extract_document(case_id: str, evidence_id: str):
    """
    Downloads document from Supabase Storage.
    Runs text extraction, metadata extraction, and integrity check.
    Writes results to evidence row and sets status = 'analyzed'.
    """
    supabase = get_supabase_client()

    # Fetch evidence record — filter by both evidence_id and case_id
    result = (
        supabase.table("evidence")
        .select("*")
        .eq("id", evidence_id)
        .eq("case_id", case_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Evidence not found")

    ev = result.data[0]

    if ev["type"] != "document":
        raise HTTPException(
            status_code=400,
            detail=f"Evidence type is '{ev['type']}'. Expected 'document'.",
        )

    # Set status to analyzing
    supabase.table("evidence").update({"status": "analyzing"}).eq(
        "id", evidence_id
    ).execute()

    tmp_path = None
    try:
        # Download from Supabase Storage
        file_bytes = supabase.storage.from_("evidence").download(
            ev["storage_path"]
        )
        suffix = os.path.splitext(ev["storage_path"])[1] or ".tmp"

        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix
        ) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        mime_type = ev.get("mime_type") or ""

        # Run all three services
        text_result = extract_text(tmp_path, mime_type)
        metadata_result = extract_metadata(tmp_path, mime_type)
        integrity_result = check_integrity(tmp_path, mime_type)

        # Build XAI summary
        char_count = text_result.get("char_count", 0)
        method = text_result.get("method", "unknown")
        flagged = integrity_result.get("flagged", False)

        xai_summary = (
            f"{char_count} characters extracted using {method}. "
            f"Integrity check: "
            f"{'⚠ Issues detected' if flagged else 'No issues detected'}."
        )

        # Derive confidence from extraction method
        method_confidence = {
            "text_layer": 0.99,
            "docx_parser": 1.00,
            "plain_text": 1.00,
            "ocr_fallback": 0.80,
            "failed": 0.00,
        }
        confidence = method_confidence.get(method, 0.85)

        # Write results to evidence row
        supabase.table("evidence").update(
            {
                "status": "analyzed",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
                "extracted_text": text_result.get("text", ""),
                "exif_metadata": metadata_result,
                "integrity_flag": integrity_result,
                "xai_summary": xai_summary,
                "analysis_confidence": confidence,
            }
        ).eq("id", evidence_id).execute()

        log_activity(
            case_id=case_id,
            event_type="evidence_analyzed",
            description=f"Document analysis complete: {char_count} chars via {method}",
            metadata={"evidence_id": evidence_id, "type": "document", "method": method, "flagged": flagged},
        )

        return {
            "success": True,
            "char_count": char_count,
            "extraction_method": method,
            "analysis_confidence": confidence,
            "integrity_flagged": flagged,
            "integrity_note": integrity_result.get("note"),
        }

    except HTTPException:
        raise

    except Exception as e:
        supabase.table("evidence").update({"status": "failed"}).eq(
            "id", evidence_id
        ).execute()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
