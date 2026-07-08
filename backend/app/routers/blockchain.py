import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.supabase import get_supabase_client
from app.services.blockchain.sha256_hasher import hash_file
from app.services.blockchain.sepolia_writer import write_hash_to_sepolia

router = APIRouter(
    prefix="/blockchain",
    tags=["Blockchain"],
)


class BlockchainRequest(BaseModel):
    sha256: str
    evidence_id: str


@router.post("/write")
def write_hash(request: BlockchainRequest):
    """
    M1-C Blockchain Endpoint

    Writes a SHA-256 hash to the Sepolia blockchain.
    """

    try:
        result = write_hash_to_sepolia(
            request.sha256,
            request.evidence_id,
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cases/{case_id}/evidence/{evidence_id}/verify")
def verify_evidence(case_id: str, evidence_id: str):
    """
    M1-C Blockchain Verify Endpoint

    Re-downloads the file from Supabase Storage, computes its
    current SHA-256, and compares against the stored file_hash.
    Returns integrity status.
    """

    supabase = get_supabase_client()
    temp_path = None

    try:
        # Fetch evidence record
        result = (
            supabase.table("evidence")
            .select("file_hash, storage_path, filename")
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
        stored_hash = evidence.get("file_hash")

        if not stored_hash:
            raise HTTPException(
                status_code=400,
                detail="No file hash recorded for this evidence. "
                       "Upload or hash the file first.",
            )

        # Download file from Supabase Storage
        storage_path = evidence["storage_path"]
        file_bytes = supabase.storage.from_("evidence").download(storage_path)

        # Write to temp file
        suffix = Path(evidence.get("filename", "file")).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            temp_path = tmp.name

        # Compute current hash
        current_hash = hash_file(temp_path)

        # Compare
        verified = current_hash == stored_hash
        status = "INTEGRITY VERIFIED" if verified else "INTEGRITY COMPROMISED"

        return {
            "success": True,
            "verified": verified,
            "stored_hash": stored_hash,
            "current_hash": current_hash,
            "status": status,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink()


@router.get("/cases/{case_id}/evidence/{evidence_id}/signed-url")
def get_signed_url(case_id: str, evidence_id: str):
    """
    M1-C Signed URL Endpoint

    Generates a 1-hour signed URL for direct browser access
    to the evidence file in Supabase Storage.
    Used for video/audio playback and image preview.
    """

    supabase = get_supabase_client()

    try:
        # Fetch storage_path from evidence record
        result = (
            supabase.table("evidence")
            .select("storage_path")
            .eq("id", evidence_id)
            .eq("case_id", case_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail=f"Evidence {evidence_id} not found in case {case_id}",
            )

        storage_path = result.data[0]["storage_path"]

        # Generate signed URL (3600 seconds = 1 hour)
        signed = supabase.storage.from_("evidence").create_signed_url(
            storage_path, 3600
        )

        # Supabase returns {"signedURL": "..."} or {"signedUrl": "..."}
        url = signed.get("signedURL") or signed.get("signedUrl")

        if not url:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate signed URL",
            )

        return {
            "success": True,
            "url": url,
            "expires_in": 3600,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
