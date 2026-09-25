from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.core.auth import require_case_owner
from app.services.gemini_client import (
    query_assistant, generate_investigation_update
)

router = APIRouter(dependencies=[Depends(require_case_owner)])


class AssistantQueryRequest(BaseModel):
    query: str


class UpdateRequest(BaseModel):
    trigger: str  # 'contradictions' | 'timeline' | 'graph'


@router.post("/assistant/cases/{case_id}/query")
def query(case_id: str, body: AssistantQueryRequest):
    """Answers an investigator query using structured case data."""
    query_text = body.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if len(query_text) > 2000:
        raise HTTPException(status_code=400, detail="Query too long (max 2000 chars)")

    supabase = get_supabase_client()
    result = query_assistant(case_id, query_text, supabase)
    return result


@router.post("/assistant/cases/{case_id}/update")
def get_investigation_update(case_id: str, body: UpdateRequest):
    """
    Generates a brief AI update paragraph after a module rebuild.
    Called by the frontend immediately after a successful rebuild.
    Non-fatal — returns null update if Gemini is unavailable.
    """
    if body.trigger not in ("contradictions", "timeline", "graph"):
        raise HTTPException(status_code=400, detail="Invalid trigger value")
    supabase = get_supabase_client()
    update_text = generate_investigation_update(case_id, body.trigger, supabase)
    return {"update": update_text}


@router.get("/assistant/cases/{case_id}/history")
def get_history(case_id: str):
    """Returns past assistant interactions for this case, oldest first."""
    supabase = get_supabase_client()
    result = supabase.table("assistant_interactions")\
        .select("id, query, response, created_at")\
        .eq("case_id", case_id)\
        .order("created_at", desc=False)\
        .execute()
    return {"history": result.data or []}
