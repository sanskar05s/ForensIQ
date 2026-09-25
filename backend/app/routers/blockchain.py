import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.supabase import get_supabase_client
from app.services.blockchain.sha256_hasher import hash_file
from app.services.blockchain.sepolia_writer import write_hash_to_sepolia
from app.services.activity_logger import log_activity

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

        tx_hash = result.get("tx_hash")

        # Update evidence row with hash + tx
        supabase = get_supabase_client()
        ev_result = supabase.table("evidence").update({
            "file_hash": request.sha256,
            "blockchain_tx_hash": tx_hash,
        }).eq("id", request.evidence_id).select("case_id").execute()

        case_id = "unknown"
        if ev_result.data:
            case_id = ev_result.data[0].get("case_id", "unknown")

        log_activity(
            case_id=case_id,
            event_type="blockchain_anchored",
            description=(
                f"Blockchain certificate recorded for evidence "
                f"(tx: {tx_hash[:10]}...)" if tx_hash
                else "SHA-256 hash computed — blockchain write pending"
            ),
            metadata={
                "evidence_id": request.evidence_id,
                "file_hash": request.sha256,
                "tx_hash": tx_hash,
                "blockchain_success": result.get("success"),
            },
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


@router.get("/cases/{case_id}/audit")
def get_blockchain_audit(case_id: str):
    """
    Returns all evidence items for a case with their blockchain status.
    Used by the frontend Blockchain Audit page.
    """
    supabase = get_supabase_client()

    result = supabase.table("evidence")\
        .select(
            "id, filename, type, file_hash, blockchain_tx_hash, "
            "uploaded_at, analyzed_at, status"
        )\
        .eq("case_id", case_id)\
        .order("uploaded_at", desc=False)\
        .execute()

    evidence_list = result.data or []

    # Build audit summary
    total = len(evidence_list)
    hashed = sum(1 for e in evidence_list if e.get("file_hash"))
    anchored = sum(1 for e in evidence_list if e.get("blockchain_tx_hash"))

    # Classify each evidence item
    for ev in evidence_list:
        if ev.get("blockchain_tx_hash"):
            ev["blockchain_status"] = "VERIFIED"
        elif ev.get("file_hash"):
            ev["blockchain_status"] = "HASH_ONLY"
        else:
            ev["blockchain_status"] = "PENDING"

    return {
        "summary": {
            "total_evidence": total,
            "hashed": hashed,
            "blockchain_anchored": anchored,
            "pending": total - hashed,
            "completion_percent": round((anchored / total * 100) if total > 0 else 0)
        },
        "evidence": evidence_list
    }

