from datetime import datetime, timezone
from typing import List, Dict, Optional
import re
import logging

logger = logging.getLogger(__name__)

# Common timestamp formats found in EXIF metadata
TIMESTAMP_FORMATS = [
    "%Y:%m:%d %H:%M:%S",    # EXIF standard
    "%Y-%m-%dT%H:%M:%S",    # ISO 8601
    "%Y-%m-%d %H:%M:%S",    # common DB format
    "%Y-%m-%dT%H:%M:%S.%f", # ISO with microseconds
    "%Y-%m-%d",              # date-only (common in OCR-extracted text)
]


def parse_timestamp(ts_str: str) -> Optional[str]:
    """
    Attempts to parse a timestamp string into ISO 8601 format.
    Returns None if parsing fails.
    """
    if not ts_str:
        return None
    ts_str = str(ts_str).strip()
    for fmt in TIMESTAMP_FORMATS:
        try:
            dt = datetime.strptime(ts_str, fmt)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def build_timeline(case_id: str, supabase) -> List[Dict]:
    """
    Builds a unified timeline by fusing three event sources:
    1. Hard timestamps from evidence EXIF metadata (Module 2 output)
    2. Relative temporal sequences from witness statements (Module 3 output)
    3. Time contradiction flags from Module 4

    Returns list of timeline event dicts ready for batch insertion
    into the timeline_events table.
    """
    events = []

    # ─── Source 1: Evidence EXIF / metadata timestamps ─────────────────
    evidence_rows = supabase.table("evidence")\
        .select("id, filename, type, exif_metadata, uploaded_at")\
        .eq("case_id", case_id)\
        .eq("status", "analyzed")\
        .execute().data or []

    for ev in evidence_rows:
        exif = ev.get("exif_metadata") or {}
        # Try several EXIF timestamp fields
        ts_raw = (exif.get("capture_timestamp")
                  or exif.get("created_timestamp")
                  or exif.get("creation_date"))

        ts_parsed = parse_timestamp(ts_raw) if ts_raw else None

        if ts_parsed:
            events.append({
                "case_id": case_id,
                "description": f"[Evidence] {ev['filename']} captured",
                "timestamp_hard": ts_parsed,
                "relative_order": None,
                "source": "metadata",
                "confidence_state": "confirmed",
                "conflicts_with": [],
                "source_ids": [{"type": "evidence", "id": ev["id"]}]
            })
        else:
            # Include upload time as a lower-confidence fallback
            events.append({
                "case_id": case_id,
                "description": f"[Evidence] {ev['filename']} uploaded",
                "timestamp_hard": ev.get("uploaded_at"),
                "relative_order": None,
                "source": "metadata",
                "confidence_state": "high",
                "conflicts_with": [],
                "source_ids": [{"type": "evidence", "id": ev["id"]}]
            })

    # ─── Source 2: Witness temporal sequences ──────────────────────────
    statements = supabase.table("witness_statements")\
        .select("id, witness_label, temporal_sequence")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")\
        .execute().data or []

    # IDs of statements involved in time contradictions
    time_contradiction_stmt_ids = set()
    contradictions = supabase.table("contradictions")\
        .select("witness_a_id, witness_b_id")\
        .eq("case_id", case_id)\
        .eq("type", "time")\
        .execute().data or []

    for c in contradictions:
        time_contradiction_stmt_ids.add(c["witness_a_id"])
        time_contradiction_stmt_ids.add(c["witness_b_id"])

    relative_offset = 1000  # Hard timestamps sort first (values 0–999).
    # Relative events start at 1000 so they always appear after all hard-
    # timestamped events in the sort_key function below, regardless of how
    # many hard-timestamp events exist. This assumes no case will have more
    # than 1000 hard-timestamp evidence items — a safe assumption.

    for stmt in statements:
        seq = stmt.get("temporal_sequence") or []
        stmt_is_conflicted = stmt["id"] in time_contradiction_stmt_ids

        for entry in seq:
            absolute_time = entry.get("absolute_time")
            ts_parsed = parse_timestamp(absolute_time) if absolute_time else None

            # Determine confidence state
            if stmt_is_conflicted:
                confidence = "low-conflict"
            elif ts_parsed:
                confidence = "high"
            else:
                confidence = "high"  # relative ordering is still reliable

            events.append({
                "case_id": case_id,
                "description": (
                    f"[{stmt['witness_label']}] "
                    f"{entry.get('event_text', '')[:300]}"
                ),
                "timestamp_hard": ts_parsed,
                "relative_order": relative_offset + entry.get("relative_order", 0),
                "source": "witness-direct" if ts_parsed else "witness-relative",
                "confidence_state": confidence,
                "conflicts_with": [],
                "source_ids": [{"type": "statement", "id": stmt["id"]}]
            })

    # Sort: hard timestamps first (ascending), then relative order
    def sort_key(e):
        if e["timestamp_hard"]:
            return (0, e["timestamp_hard"], 0)
        return (1, "", e.get("relative_order") or 9999)

    events.sort(key=sort_key)

    # Assign final sequential relative_order
    for i, event in enumerate(events):
        event["relative_order"] = i + 1

    return events
