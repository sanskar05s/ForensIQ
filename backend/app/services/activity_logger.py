"""
ForensIQ Activity Logger

Non-fatal utility for writing audit entries to the activity_logs table.
Failures are logged to stderr but NEVER propagated to the caller —
a logging failure must not crash an investigation endpoint.

Schema (from database.sql):
    activity_logs(id, case_id, event_type, description, actor_id, metadata, created_at)
"""

import logging
from typing import Optional

from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def log_activity(
    case_id: str,
    event_type: str,
    description: str,
    actor_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """
    Insert one row into activity_logs.

    Parameters
    ----------
    case_id : str
        UUID of the case this event belongs to.
    event_type : str
        Machine-readable event key, e.g. "evidence_uploaded",
        "contradictions_run", "timeline_rebuilt".
    description : str
        Human-readable description shown in the activity log UI.
    actor_id : str | None
        UUID of the auth.users row that triggered the action.
        None for system-initiated actions (analysis pipelines, etc.).
    metadata : dict | None
        Arbitrary JSON payload with event-specific details.
        Stored in the JSONB metadata column.
    """
    try:
        supabase = get_supabase_client()
        row = {
            "case_id": case_id,
            "event_type": event_type,
            "description": description,
            "metadata": metadata or {},
        }
        if actor_id:
            row["actor_id"] = actor_id

        supabase.table("activity_logs").insert(row).execute()

    except Exception as e:
        # Non-fatal — log and continue.  The caller must never see this error.
        logger.warning(
            f"Activity log write failed (case={case_id}, "
            f"event={event_type}): {e}"
        )
