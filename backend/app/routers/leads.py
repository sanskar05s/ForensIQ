from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.services.lead_generator import generate_investigation_leads
from app.services.activity_logger import log_activity

router = APIRouter()


@router.post("/leads/cases/{case_id}/generate")
def generate_leads(case_id: str):
    supabase = get_supabase_client()
    result = generate_investigation_leads(case_id, supabase)
    try:
        log_activity(case_id, "assistant_queried",
                     "Investigation leads generated",
                     metadata={"lead_count": len(result.get("leads", []))})
    except Exception:
        pass
    return result


@router.get("/leads/cases/{case_id}/generate")
def get_leads(case_id: str):
    # Alias — GET also triggers generation (stateless, Gemini always fresh)
    return generate_leads(case_id)
