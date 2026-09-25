from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.services.provenance_builder import build_evidence_provenance

router = APIRouter()


@router.get("/provenance/cases/{case_id}/evidence/{evidence_id}")
def get_provenance(case_id: str, evidence_id: str):
    supabase = get_supabase_client()
    journey = build_evidence_provenance(evidence_id, case_id, supabase)
    if not journey:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {
        "journey": journey,   # keep original key
        "steps":   journey,   # alias key for frontend compatibility
    }
