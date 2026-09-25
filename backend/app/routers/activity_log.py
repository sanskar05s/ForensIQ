from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client

router = APIRouter()


@router.get("/activity/cases/{case_id}")
def get_activity_log(case_id: str, limit: int = 50):
    """
    Returns activity log for a case, newest first.
    Limit: max 50 entries (sufficient for display and viva demo).
    """
    supabase = get_supabase_client()
    result = supabase.table("activity_logs")\
        .select("*")\
        .eq("case_id", case_id)\
        .order("created_at", desc=True)\
        .limit(min(limit, 50))\
        .execute()
    return {"activities": result.data or []}
