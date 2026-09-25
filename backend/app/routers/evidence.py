from pathlib import Path
import shutil
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.supabase import get_supabase_client
from app.core.auth import assert_case_owner, get_current_user_id, require_case_owner
from app.services.blockchain.sha256_hasher import hash_file
from app.services.activity_logger import log_activity
from app.services.evidence_scorer import compute_priority_score


router = APIRouter(
    prefix="/evidence",
    tags=["Evidence"],
    dependencies=[Depends(get_current_user_id)],
)


@router.post("/upload")
def upload_evidence(
    case_id: str = Form(...),
    type: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    Upload evidence.

    M1-C
    - Upload to Supabase Storage
    - Compute SHA-256
    - Insert evidence row
    """

    supabase = get_supabase_client()
    assert_case_owner(case_id, user_id)

    temp_path = None

    try:
        suffix = Path(file.filename).suffix

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            shutil.copyfileobj(file.file, temp)
            temp_path = temp.name

        # SHA256
        file_hash = hash_file(temp_path)

        # Generate storage path
        storage_name = f"{case_id}/{uuid.uuid4()}{suffix}"

        # Upload to Supabase Storage
        with open(temp_path, "rb") as f:
            response = supabase.storage.from_("evidence").upload(
                storage_name,
                f,
                {
                    "content-type": file.content_type
                }
            )

        # Insert database row
        result = (
            supabase.table("evidence")
            .insert({
                "case_id": case_id,
                "type": type,
                "filename": file.filename,
                "storage_path": storage_name,
                "file_size": Path(temp_path).stat().st_size,
                "mime_type": file.content_type,
                "status": "uploaded",
                "file_hash": file_hash
            })
            .execute()
        )

        evidence = result.data[0]

        log_activity(
            case_id=case_id,
            event_type="evidence_uploaded",
            description=f"Evidence '{file.filename}' uploaded ({type})",
            metadata={
                "evidence_id": evidence["id"],
                "type": type,
                "filename": file.filename
            },
        )

        return {
            "success": True,
            "evidence_id": evidence["id"],
            "sha256": file_hash,
            "storage_path": storage_name
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink()


@router.get("/cases/{case_id}", dependencies=[Depends(require_case_owner)])
def list_evidence(case_id: str):
    """
    List all evidence for a case with priority scoring.
    """

    supabase = get_supabase_client()

    try:
        result = (
            supabase.table("evidence")
            .select("*")
            .eq("case_id", case_id)
            .order("uploaded_at", desc=True)
            .execute()
        )

        evidence_list = result.data or []

        # Fetch data needed for scoring
        case_contradictions = (
            supabase.table("contradictions")
            .select("claim_a, claim_b")
            .eq("case_id", case_id)
            .execute()
            .data
            or []
        )

        # Knowledge graph may not exist yet, so do not use .single()
        kg_result = (
            supabase.table("knowledge_graphs")
            .select("nodes")
            .eq("case_id", case_id)
            .execute()
        )

        kg_nodes = (
            (kg_result.data[0].get("nodes") or [])
            if kg_result.data
            else []
        )

        # Add priority to each evidence item
        # A scoring failure should not break the entire evidence list.
        for ev in evidence_list:
            try:
                priority_data = compute_priority_score(
                    ev,
                    case_contradictions,
                    kg_nodes
                )

                ev["priority_score"] = priority_data["score"]
                ev["priority"] = priority_data["priority"]
                ev["priority_breakdown"] = priority_data["breakdown"]

            except Exception:
                ev["priority_score"] = 0
                ev["priority"] = "LOW"
                ev["priority_breakdown"] = {}

        return {
            "success": True,
            "evidence": evidence_list
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
