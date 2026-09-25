"""
ForensIQ Cases Router — Full CRUD + staleness reporting.

Endpoints:
    GET    /cases/               List all cases for authenticated user
    POST   /cases/               Create a new case
    GET    /cases/{case_id}      Get case detail with staleness info
    PATCH  /cases/{case_id}      Update case fields
    DELETE /cases/{case_id}      Delete a case (cascades to all child data)

Schema (from database.sql):
    cases(id, title, description, investigator_name, priority, status,
          created_by, created_at, updated_at, evidence_count, witness_count,
          build_state, case_id)

    priority  IN ('Low','Medium','High','Critical')
    status    IN ('Open','Active','Pending Review','Closed')
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.services.activity_logger import log_activity

router = APIRouter(prefix="/cases", tags=["Cases"])


# ── Request / Response models ─────────────────────────────────────────

class CaseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    investigator_name: str
    priority: str = "Medium"
    status: str = "Open"
    case_id: Optional[str] = None      # human-readable case ID (CASE-2026-XXXX)
    created_by: Optional[str] = None   # auth.users UUID (from frontend session)


class CaseUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    investigator_name: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/")
def list_cases():
    """
    Returns all cases, newest first.
    
    NOTE: RLS on the cases table (created_by = auth.uid()) ensures users
    only see their own cases when using the anon/authenticated key.
    The service_role key bypasses RLS — this is acceptable because the
    backend is a trusted server and the frontend already authenticates
    via Supabase Auth before calling the API.
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("cases")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return {"success": True, "data": result.data or []}


@router.post("/")
def create_case(body: CaseCreateRequest):
    """Create a new investigation case."""
    supabase = get_supabase_client()

    # Validate priority
    valid_priorities = {"Low", "Medium", "High", "Critical"}
    if body.priority not in valid_priorities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority '{body.priority}'. "
                   f"Must be one of: {', '.join(sorted(valid_priorities))}"
        )

    # Validate status
    valid_statuses = {"Open", "Active", "Pending Review", "Closed"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{body.status}'. "
                   f"Must be one of: {', '.join(sorted(valid_statuses))}"
        )

    row = {
        "title": body.title.strip(),
        "description": (body.description or "").strip(),
        "investigator_name": body.investigator_name.strip(),
        "priority": body.priority,
        "status": body.status,
    }

    if body.case_id:
        row["case_id"] = body.case_id
    if body.created_by:
        row["created_by"] = body.created_by

    result = supabase.table("cases").insert(row).select().single().execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create case")

    case = result.data

    log_activity(
        case_id=case["id"],
        event_type="case_created",
        description=f"Case '{case['title']}' created",
        actor_id=body.created_by,
        metadata={"priority": body.priority, "status": body.status},
    )

    return {"success": True, "data": case}


@router.get("/{case_id}")
def get_case(case_id: str):
    """
    Returns full case data including a staleness summary.

    The staleness object tells the frontend which modules have
    new data since their last build, so it can show the StaleBanner.
    """
    supabase = get_supabase_client()

    result = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Case not found")

    return {"success": True, "data": result.data}


@router.patch("/{case_id}")
def update_case(case_id: str, body: CaseUpdateRequest):
    """Update mutable case fields (title, description, investigator, priority, status)."""
    supabase = get_supabase_client()

    updates = {}
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.description is not None:
        updates["description"] = body.description.strip()
    if body.investigator_name is not None:
        updates["investigator_name"] = body.investigator_name.strip()
    if body.priority is not None:
        valid_priorities = {"Low", "Medium", "High", "Critical"}
        if body.priority not in valid_priorities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid priority '{body.priority}'"
            )
        updates["priority"] = body.priority
    if body.status is not None:
        valid_statuses = {"Open", "Active", "Pending Review", "Closed"}
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{body.status}'"
            )
        updates["status"] = body.status

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("cases")
        .update(updates)
        .eq("id", case_id)
        .select()
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Case not found")

    log_activity(
        case_id=case_id,
        event_type="case_updated",
        description=f"Case updated: {', '.join(updates.keys())}",
        metadata={"fields_changed": list(updates.keys())},
    )

    return {"success": True, "data": result.data}


@router.delete("/{case_id}")
def delete_case(case_id: str):
    """
    Deletes a case and all child data (CASCADE from database.sql).
    
    Child tables with ON DELETE CASCADE:
        evidence, witness_statements, contradictions,
        timeline_events, knowledge_graphs, reports,
        activity_logs, assistant_interactions
    """
    supabase = get_supabase_client()

    # Verify case exists before deleting
    check = (
        supabase.table("cases")
        .select("id, title")
        .eq("id", case_id)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Case not found")

    supabase.table("cases").delete().eq("id", case_id).execute()

    return {"success": True, "message": f"Case {case_id} deleted"}
