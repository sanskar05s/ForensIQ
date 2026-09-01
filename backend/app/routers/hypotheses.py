from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.services.hypothesis_analyzer import analyze_hypothesis
from datetime import datetime, timezone

router = APIRouter()


class HypothesisRequest(BaseModel):
    title: str
    description: str


@router.post("/hypotheses/cases/{case_id}")
async def create_hypothesis(case_id: str, body: HypothesisRequest):
    if not body.title.strip() or not body.description.strip():
        raise HTTPException(status_code=400, detail="Title and description required")

    supabase = get_supabase_client()
    result = analyze_hypothesis(case_id, body.title, body.description, supabase)

    # Store the hypothesis and analysis
    db_result = supabase.table("hypotheses").insert({
        "case_id": case_id,
        "title": body.title,
        "description": body.description,
        "supporting":       result.get("supporting", []),
        "contradicting":    result.get("contradicting", []),
        "neutral":          result.get("neutral", []),
        "unresolved":       result.get("unresolved", []),
        "confidence_score": result.get("confidence_score", 0),
        "ai_explanation":   result.get("ai_explanation", ""),
        "created_at":       datetime.now(timezone.utc).isoformat(),
        "updated_at":       datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"hypothesis": db_result.data[0] if db_result.data else {}}


@router.get("/hypotheses/cases/{case_id}")
async def list_hypotheses(case_id: str):
    supabase = get_supabase_client()
    result = supabase.table("hypotheses")\
        .select("*").eq("case_id", case_id)\
        .order("created_at", desc=True).execute()
    return {"hypotheses": result.data or []}


@router.delete("/hypotheses/cases/{case_id}/{hypothesis_id}")
async def delete_hypothesis(case_id: str, hypothesis_id: str):
    supabase = get_supabase_client()
    supabase.table("hypotheses")\
        .delete().eq("id", hypothesis_id).eq("case_id", case_id).execute()
    return {"success": True}
