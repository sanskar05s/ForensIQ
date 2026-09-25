from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.core.auth import require_case_owner
from app.services.hypothesis_analyzer import analyze_hypothesis
from datetime import datetime, timezone

router = APIRouter(dependencies=[Depends(require_case_owner)])


class HypothesisRequest(BaseModel):
    title: str = ""
    description: str = ""


@router.post("/hypotheses/cases/{case_id}")
def create_hypothesis(case_id: str, body: HypothesisRequest):
    hyp_title = (body.title or body.description or "").strip()
    hyp_desc = (body.description or body.title or "").strip()
    if not hyp_title:
        raise HTTPException(status_code=400, detail="Hypothesis is required")

    supabase = get_supabase_client()
    result = analyze_hypothesis(case_id, hyp_title, hyp_desc, supabase)

    # Store the hypothesis and analysis
    db_result = supabase.table("hypotheses").insert({
        "case_id": case_id,
        "title": hyp_title,
        "description": hyp_desc,
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
def list_hypotheses(case_id: str):
    supabase = get_supabase_client()
    result = supabase.table("hypotheses")\
        .select("*").eq("case_id", case_id)\
        .order("created_at", desc=True).execute()
    return {"hypotheses": result.data or []}


@router.delete("/hypotheses/cases/{case_id}/{hypothesis_id}")
def delete_hypothesis(case_id: str, hypothesis_id: str):
    supabase = get_supabase_client()
    supabase.table("hypotheses")\
        .delete().eq("id", hypothesis_id).eq("case_id", case_id).execute()
    return {"success": True}
