"""
ForensIQ Activity Log Router — Read-only endpoint for the activity log page.

Endpoints:
    GET /activity/cases/{case_id}    List activity entries (newest first)

Schema (from database.sql):
    activity_logs(id, case_id, event_type, description, actor_id, metadata, created_at)
"""

from fastapi import APIRouter

from app.core.supabase import get_supabase_client

router = APIRouter(
    prefix="/activity",
    tags=["Activity Log"],
)


@router.get("/cases/{case_id}")
async def list_activity(case_id: str, limit: int = 100):
    """
    Returns activity log entries for a case, newest first.

    Query params:
        limit: max rows to return (default 100, max 500)
    """
    limit = min(max(limit, 1), 500)

    supabase = get_supabase_client()
    result = (
        supabase.table("activity_logs")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    return {"activities": result.data or []}
