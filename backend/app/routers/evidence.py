from pathlib import Path
import shutil
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.blockchain.sha256_hasher import hash_file

router = APIRouter(
    prefix="/evidence",
    tags=["Evidence"]
)


@router.post("/upload")
async def upload_evidence(file: UploadFile = File(...)):
    """
    Uploads an evidence file.

    M1-C:
    - Saves file temporarily
    - Computes SHA-256 hash
    - Returns hash

    Future milestones:
    - OCR
    - Object Detection
    - Scene Classification
    - Database insert
    - Blockchain write
    """

    try:
        suffix = Path(file.filename).suffix

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name

        file_hash = hash_file(temp_path)

        return {
            "success": True,
            "filename": file.filename,
            "sha256": file_hash
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        try:
            Path(temp_path).unlink(missing_ok=True)
        except Exception:
            pass
