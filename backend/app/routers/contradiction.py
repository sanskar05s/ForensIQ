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
        tier1_results = run_tier1(
            stmt_a,
            stmt_b,
            hedge_a=stmt_a.get("hedge_marker_count", 0) or 0,
            hedge_b=stmt_b.get("hedge_marker_count", 0) or 0,
        )

        if tier1_results:
            new_contradiction_rows.extend(tier1_results)
        else:
            try:
                from app.services.contradiction.candidate_filter import should_compare_nli
                if should_compare_nli(stmt_a, stmt_b):
                    tier2_results = run_tier2(
                        stmt_a,
                        stmt_b,
                        hedge_a=stmt_a.get("hedge_marker_count", 0) or 0,
                        hedge_b=stmt_b.get("hedge_marker_count", 0) or 0,
                    )
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

    # Fetch ALL existing contradictions including dismissed ones
    existing = supabase.table("contradictions")\
        .select("witness_a_id, witness_b_id, type, claim_a, claim_b")\
        .eq("case_id", case_id)\
        .execute().data or []

    existing_fingerprints = {
        (
            min(str(row.get("witness_a_id") or ""), str(row.get("witness_b_id") or "")),
            max(str(row.get("witness_a_id") or ""), str(row.get("witness_b_id") or "")),
            row.get("type"),
            min((row.get("claim_a") or "")[:50], (row.get("claim_b") or "")[:50]),
            max((row.get("claim_a") or "")[:50], (row.get("claim_b") or "")[:50]),
        )
        for row in existing
    }
    # Note: is_dismissed=True rows are intentionally included —
    # dismissed contradictions should not be resurrected.

    # Insert new contradiction rows (skip duplicates)
    new_count = 0
    for contradiction in new_contradiction_rows:
        contradiction["case_id"] = case_id
        if "nli_confidence" not in contradiction and "confidence" in contradiction:
            contradiction["nli_confidence"] = contradiction.get("confidence")

        wa = str(contradiction.get("witness_a_id") or "")
        wb = str(contradiction.get("witness_b_id") or "")
        ca = (contradiction.get("claim_a") or "")[:50]
        cb = (contradiction.get("claim_b") or "")[:50]

        fingerprint = (
            min(wa, wb),
            max(wa, wb),
            contradiction.get("type"),
            min(ca, cb),
            max(ca, cb),
        )
        if fingerprint in existing_fingerprints:
            logger.info(f"Skipping duplicate contradiction: {fingerprint}")
            continue
        try:
            db_payload = {
                k: v for k, v in contradiction.items()
                if k in {
                    "case_id", "tier", "type", "witness_a_id", "witness_b_id",
                    "claim_a", "claim_b", "severity", "nli_confidence",
                    "xai_explanation", "id", "created_at", "is_dismissed"
                }
            }
            supabase.table("contradictions").insert(db_payload).execute()
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
async def list_contradictions(case_id: str,
                              include_dismissed: bool = False):
    """
    Returns contradictions for a case.
    By default, dismissed contradictions are hidden.
    Pass ?include_dismissed=true to show them (for audit purposes).
    """
    supabase = get_supabase_client()
    query = supabase.table("contradictions")\
        .select("*, "
                "witness_a:witness_a_id(witness_label), "
                "witness_b:witness_b_id(witness_label)")\
        .eq("case_id", case_id)

    if not include_dismissed:
        query = query.eq("is_dismissed", False)

    result = query.order("created_at", desc=True).execute()

    # Deduplicate by min/max witness pair + type + claim
    # (now also considering claim text in fingerprint)
    seen = set()
    unique = []
    for c in (result.data or []):
        wa = str(c.get("witness_a_id") or "")
        wb = str(c.get("witness_b_id") or "")
        ca = (c.get("claim_a") or "")[:50]
        cb = (c.get("claim_b") or "")[:50]
        key = (
            min(wa, wb),
            max(wa, wb),
            c.get("type"),
            min(ca, cb),
            max(ca, cb),
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
    """
    Soft-dismisses a contradiction by setting is_dismissed = TRUE.
    Does NOT delete the row — preserves deduplication fingerprint
    so the contradiction is not resurrected on the next rebuild.
    """
    supabase = get_supabase_client()
    supabase.table("contradictions")\
        .update({"is_dismissed": True})\
        .eq("id", contradiction_id)\
        .eq("case_id", case_id)\
        .execute()
    return {"success": True, "dismissed": True}
