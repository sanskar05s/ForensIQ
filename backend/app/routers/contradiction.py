from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.services.contradiction.rule_based import run_tier1
from app.services.contradiction.nli_escalation import run_tier2
from app.services.activity_logger import log_activity
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contradiction/cases/{case_id}/run")
async def run_contradiction_check(case_id: str):
    """
    Incremental contradiction detection.
    Only processes witness statements added since last run.
    Compares new statements against ALL existing statements.
    Never reprocesses existing vs existing pairs.
    """
    supabase = get_supabase_client()

    # Get current build_state to find last run timestamp
    case = supabase.table("cases")\
        .select("build_state")\
        .eq("id", case_id)\
        .single()\
        .execute().data

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    build_state = case.get("build_state") or {}
    last_run = build_state.get("last_contradiction_run")

    # Fetch ONLY new statements (analyzed after last run)
    new_query = supabase.table("witness_statements")\
        .select("*")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")

    if last_run:
        new_query = new_query.gt("analyzed_at", last_run)

    new_statements = new_query.execute().data or []

    if not new_statements:
        return {
            "success": True,
            "message": "No new statements to process",
            "new_contradictions": 0
        }

    # Fetch ALL previously analyzed statements for comparison
    existing_query = supabase.table("witness_statements")\
        .select("*")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")

    if last_run:
        existing_query = existing_query.lte("analyzed_at", last_run)

    existing_statements = existing_query.execute().data or []

    # Build comparison pairs:
    # new vs new + new vs existing (never existing vs existing)
    all_to_compare = []

    # New vs existing
    for new_s in new_statements:
        for existing_s in existing_statements:
            if new_s["id"] != existing_s["id"]:
                all_to_compare.append((new_s, existing_s))

    # New vs new (within the new batch)
    for i, s1 in enumerate(new_statements):
        for s2 in new_statements[i+1:]:
            all_to_compare.append((s1, s2))

    new_contradiction_rows = []

    for stmt_a, stmt_b in all_to_compare:
        # Skip if comparing a statement against itself (same row ID).
        # We intentionally allow two rows with the same witness_label to be
        # compared — an investigator may record two separate statements from
        # the same witness at different times, and those can legitimately
        # contradict each other.
        if stmt_a["id"] == stmt_b["id"]:
            continue

        # Tier 1: rule-based
        tier1_results = run_tier1(stmt_a, stmt_b)

        if tier1_results:
            new_contradiction_rows.extend(tier1_results)
        else:
            try:
                from app.services.contradiction.candidate_filter import should_compare_nli
                if should_compare_nli(stmt_a, stmt_b):
                    tier2_results = run_tier2(stmt_a, stmt_b)
                    new_contradiction_rows.extend(tier2_results)
                else:
                    logger.debug(
                        f"NLI skipped: no shared event/entity/attribute "
                        f"between '{stmt_a['witness_label']}' and "
                        f"'{stmt_b['witness_label']}'"
                    )
            except Exception as e:
                logger.warning(f"NLI escalation failed for pair: {e}")
                # Non-fatal — continue with other pairs

    # Fetch existing contradiction fingerprints to prevent duplicates.
    # A duplicate is defined as: same witness pair + same type.
    # This handles re-runs after build_state reset or timestamp changes.
    existing = supabase.table("contradictions")\
        .select("witness_a_id, witness_b_id, type")\
        .eq("case_id", case_id)\
        .execute().data or []

    existing_fingerprints = {
        (row["witness_a_id"], row["witness_b_id"], row["type"])
        for row in existing
    }
    # Also add reversed pair to catch A↔B vs B↔A duplicates
    existing_fingerprints.update(
        (row["witness_b_id"], row["witness_a_id"], row["type"])
        for row in existing
    )

    # Insert new contradiction rows (skip duplicates)
    new_count = 0
    for contradiction in new_contradiction_rows:
        contradiction["case_id"] = case_id
        fingerprint = (
            contradiction.get("witness_a_id"),
            contradiction.get("witness_b_id"),
            contradiction.get("type")
        )
        if fingerprint in existing_fingerprints:
            logger.info(f"Skipping duplicate contradiction: {fingerprint}")
            continue
        try:
            supabase.table("contradictions").insert(contradiction).execute()
            existing_fingerprints.add(fingerprint)
            new_count += 1
        except Exception as e:
            logger.warning(f"Failed to insert contradiction: {e}")

    # Update build_state with current timestamp
    build_state["last_contradiction_run"] = datetime.now(timezone.utc).isoformat()
    supabase.table("cases")\
        .update({"build_state": build_state})\
        .eq("id", case_id)\
        .execute()

    log_activity(
        case_id=case_id,
        event_type="contradictions_run",
        description=f"Contradiction check: {new_count} new contradiction(s) from {len(all_to_compare)} pairs",
        metadata={"new_contradictions": new_count, "pairs_compared": len(all_to_compare), "statements_processed": len(new_statements)},
    )

    return {
        "success": True,
        "statements_processed": len(new_statements),
        "pairs_compared": len(all_to_compare),
        "new_contradictions": new_count
    }


@router.get("/contradiction/cases/{case_id}")
async def list_contradictions(case_id: str):
    """Returns all contradictions for a case, newest first.

    The select uses PostgREST foreign key embedding syntax
    (witness_a:witness_a_id(witness_label)) which requires that the
    contradictions table has FK constraints to witness_statements.
    These constraints exist from the M0 SQL (01_create_tables.sql).
    If this query returns an error, fall back to two separate lookups
    per contradiction row instead.
    """
    supabase = get_supabase_client()
    result = supabase.table("contradictions")\
        .select("*, witness_a:witness_a_id(witness_label), witness_b:witness_b_id(witness_label)")\
        .eq("case_id", case_id)\
        .order("created_at", desc=True)\
        .execute()

    # Deduplicate A↔B vs B↔A pairs
    seen = set()
    unique = []
    for c in (result.data or []):
        key = (
            min(c["witness_a_id"], c["witness_b_id"]),
            max(c["witness_a_id"], c["witness_b_id"]),
            c["type"]
        )
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return {"contradictions": unique}


@router.get("/contradiction/cases/{case_id}/staleness")
async def check_staleness(case_id: str):
    """
    Returns whether new statements have been added since the last
    contradiction run. Used by the frontend stale banner.
    """
    supabase = get_supabase_client()
    case = supabase.table("cases")\
        .select("build_state")\
        .eq("id", case_id)\
        .single()\
        .execute().data

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    build_state = case.get("build_state") or {}
    last_run = build_state.get("last_contradiction_run")

    # Count statements analyzed after last run
    query = supabase.table("witness_statements")\
        .select("id", count="exact")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")

    if last_run:
        query = query.gt("analyzed_at", last_run)

    result = query.execute()
    new_count = result.count or 0

    return {
        "stale": new_count > 0,
        "new_statements_since_last_run": new_count,
        "last_run": last_run
    }


@router.delete("/contradiction/cases/{case_id}/{contradiction_id}")
async def dismiss_contradiction(case_id: str, contradiction_id: str):
    """Dismisses (deletes) a specific contradiction."""
    supabase = get_supabase_client()
    supabase.table("contradictions")\
        .delete()\
        .eq("id", contradiction_id)\
        .eq("case_id", case_id)\
        .execute()
    return {"success": True}
