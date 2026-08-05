from pathlib import Path
import shutil
import tempfile
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.supabase import get_supabase_client
from app.services.blockchain.sha256_hasher import hash_file
from app.services.activity_logger import log_activity

router = APIRouter(
    prefix="/evidence",
    tags=["Evidence"]
)


@router.post("/upload")
async def upload_evidence(
    case_id: str = Form(...),
    type: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Upload evidence.

    M1-C
    - Upload to Supabase Storage
    - Compute SHA-256
    - Insert evidence row
    """

    supabase = get_supabase_client()

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
            metadata={"evidence_id": evidence["id"], "type": type, "filename": file.filename},
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
