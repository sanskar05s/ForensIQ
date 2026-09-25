from fastapi import APIRouter, Depends, HTTPException
from app.core.supabase import get_supabase_client
from app.core.auth import require_case_owner
from app.services.timeline_graph.timeline_fusion import build_timeline
from app.services.timeline_graph.graph_builder import build_graph
from app.services.timeline_graph.sna_metrics import (
    compute_sna_metrics, enrich_nodes_with_sna, get_public_metrics
)
from app.services.activity_logger import log_activity
from datetime import datetime, timezone
import logging

timeline_router = APIRouter(
    tags=["Timeline"], dependencies=[Depends(require_case_owner)]
)

graph_router = APIRouter(
    tags=["Knowledge Graph"], dependencies=[Depends(require_case_owner)]
)

logger = logging.getLogger(__name__)


# ─── TIMELINE ─────────────────────────────────────────────────────────

@timeline_router.post("/timeline/cases/{case_id}/build")
def build_case_timeline(case_id: str):
    """
    Rebuilds the timeline from scratch using all current case data.
    Clears existing timeline events and inserts fresh ones.
    Updates build_state.last_timeline_build.
    """
    supabase = get_supabase_client()

    # Verify case exists
    case = supabase.table("cases")\
        .select("id, build_state")\
        .eq("id", case_id)\
        .single()\
        .execute().data

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Clear existing timeline events for this case
    supabase.table("timeline_events")\
        .delete()\
        .eq("case_id", case_id)\
        .execute()

    # Build new timeline
    events = build_timeline(case_id, supabase)

    if not events:
        return {
            "success": True,
            "message": "No events found to build timeline",
            "event_count": 0
        }

    # Batch insert (Supabase supports list insert)
    supabase.table("timeline_events").insert(events).execute()

    # Update build_state
    build_state = case.get("build_state") or {}
    build_state["last_timeline_build"] = datetime.now(timezone.utc).isoformat()
    supabase.table("cases")\
        .update({"build_state": build_state})\
        .eq("id", case_id)\
        .execute()

    confirmed = sum(1 for e in events if e["confidence_state"] == "confirmed")
    conflicts = sum(1 for e in events if e["confidence_state"] == "low-conflict")

    log_activity(
        case_id=case_id,
        event_type="timeline_rebuilt",
        description=f"Timeline rebuilt: {len(events)} events ({confirmed} confirmed, {conflicts} conflicts)",
        metadata={"event_count": len(events), "confirmed": confirmed, "conflicts": conflicts},
    )

    return {
        "success": True,
        # Primary key (correct)
        "event_count": len(events),
        # Alias keys for frontend compatibility (Timeline.jsx reads these)
        "events_created": len(events),
        "total_events": len(events),
        # Breakdown
        "confirmed_events": confirmed,
        "conflict_events": conflicts,
        "relative_events": sum(1 for e in events if e.get("source") == "witness-relative"),
    }


@timeline_router.get("/timeline/cases/{case_id}")
def get_timeline(case_id: str):
    """
    Returns all timeline events in investigation order.
    Primary sort: timestamp_hard ascending (NULLS LAST — hard timestamps first).
    Secondary sort: relative_order ascending (for relative/witness events).
    This is more deterministic than ordering by relative_order alone.
    """
    supabase = get_supabase_client()
    result = supabase.table("timeline_events")\
        .select("*")\
        .eq("case_id", case_id)\
        .order("relative_order", desc=False)\
        .execute()
    events = result.data or []
    return {
        "events":          events,
        "event_count":     len(events),
        "confirmed_count": sum(1 for e in events if e.get("confidence_state") == "confirmed"),
        "conflict_count":  sum(1 for e in events if e.get("confidence_state") == "low-conflict"),
        "relative_count":  sum(1 for e in events if e.get("source") == "witness-relative"),
    }


@timeline_router.get("/timeline/cases/{case_id}/staleness")
def timeline_staleness(case_id: str):
    """
    Returns whether new evidence or statements exist
    since the last timeline build.
    """
    supabase = get_supabase_client()
    case = supabase.table("cases")\
        .select("build_state")\
        .eq("id", case_id)\
        .single()\
        .execute().data

    build_state = (case or {}).get("build_state") or {}
    last_build = build_state.get("last_timeline_build")

    query = supabase.table("evidence")\
        .select("id", count="exact")\
        .eq("case_id", case_id)\
        .eq("status", "analyzed")

    if last_build:
        query = query.gt("analyzed_at", last_build)

    new_evidence = query.execute().count or 0

    query2 = supabase.table("witness_statements")\
        .select("id", count="exact")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")

    if last_build:
        query2 = query2.gt("analyzed_at", last_build)

    new_statements = query2.execute().count or 0

    return {
        "stale": (new_evidence + new_statements) > 0,
        "new_evidence_count": new_evidence,
        "new_statements_count": new_statements,
        "last_build": last_build
    }


# ─── KNOWLEDGE GRAPH ───────────────────────────────────────────────────

@graph_router.post("/graph/cases/{case_id}/build")
def build_case_graph(case_id: str):
    """
    Builds or rebuilds the knowledge graph with SNA metrics.
    Upserts the knowledge_graphs row for this case.
    Updates build_state.last_graph_build.
    """
    supabase = get_supabase_client()

    case = supabase.table("cases")\
        .select("id, build_state")\
        .eq("id", case_id)\
        .single()\
        .execute().data

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Build graph (manual rebuild uses full semantic extraction via Gemini)
    G, nodes, edges = build_graph(case_id, supabase,
                                   use_gemini_relationships=True)

    if len(nodes) == 0:
        return {
            "success": True,
            "message": "No entities found to build graph",
            "node_count": 0,
            "edge_count": 0
        }

    # Compute SNA metrics
    sna = compute_sna_metrics(G)

    # Enrich nodes with centrality and community
    nodes = enrich_nodes_with_sna(nodes, sna)

    # Store only public metrics (no internal _prefixed fields)
    public_sna = get_public_metrics(sna, node_count=len(nodes),
                                    edge_count=len(edges))

    # Upsert knowledge_graphs (one row per case)
    supabase.table("knowledge_graphs").upsert({
        "case_id": case_id,
        "nodes": nodes,
        "edges": edges,
        "sna_metrics": public_sna,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }, on_conflict="case_id").execute()

    # Update build_state
    build_state = case.get("build_state") or {}
    build_state["last_graph_build"] = datetime.now(timezone.utc).isoformat()
    supabase.table("cases")\
        .update({"build_state": build_state})\
        .eq("id", case_id)\
        .execute()

    log_activity(
        case_id=case_id,
        event_type="graph_rebuilt",
        description=f"Knowledge graph rebuilt: {len(nodes)} nodes, {len(edges)} edges, {public_sna.get('community_count', 0)} communities",
        metadata={"node_count": len(nodes), "edge_count": len(edges), "community_count": public_sna.get("community_count", 0)},
    )

    return {
        "success": True,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "community_count": public_sna.get("community_count", 0),
        "density": public_sna.get("density", 0),
        "top_central_nodes": public_sna.get("top_central_nodes", [])
    }


@graph_router.get("/graph/cases/{case_id}")
def get_graph(case_id: str):
    """Returns the knowledge graph with nodes, edges, and SNA metrics."""
    supabase = get_supabase_client()
    result = supabase.table("knowledge_graphs")\
        .select("*")\
        .eq("case_id", case_id)\
        .execute()
    rows = result.data or []
    if not rows:
        return {"nodes": [], "edges": [], "sna_metrics": {}, "message": "Graph not yet built for this case"}
    row = rows[0]
    return {
        "nodes": row.get("nodes") or [],
        "edges": row.get("edges") or [],
        "sna_metrics": row.get("sna_metrics") or {},
    }


@graph_router.get("/graph/cases/{case_id}/staleness")
def graph_staleness(case_id: str):
    """Returns whether new statements exist since the last graph build."""
    supabase = get_supabase_client()
    case = supabase.table("cases")\
        .select("build_state")\
        .eq("id", case_id)\
        .single()\
        .execute().data

    build_state = (case or {}).get("build_state") or {}
    last_build = build_state.get("last_graph_build")

    query = supabase.table("witness_statements")\
        .select("id", count="exact")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")

    if last_build:
        query = query.gt("analyzed_at", last_build)

    new_count = query.execute().count or 0

    return {
        "stale": new_count > 0,
        "new_statements_count": new_count,
        "last_build": last_build
    }


@graph_router.get("/graph/cases/{case_id}/entity-intelligence/{entity_label}")
def get_entity_intelligence(case_id: str, entity_label: str):
    """
    Cross-module intelligence summary for a named entity.
    Aggregates data from: witness_statements, detection_identifications,
    timeline_events, contradictions, evidence_claim_links.
    No LLM. Pure database aggregation.
    """
    supabase = get_supabase_client()
    label_lower = entity_label.lower().strip()

    # 1. Witness statement mentions (from entities JSONB)
    stmts = supabase.table("witness_statements")\
        .select("id, witness_label, entities")\
        .eq("case_id", case_id)\
        .execute().data or []

    witness_mentions = []
    for stmt in stmts:
        entities = stmt.get("entities") or []
        if isinstance(entities, str):
            import json
            try:
                entities = json.loads(entities)
            except Exception:
                entities = []
        for ent in entities:
            if ent.get("text", "").lower().strip() == label_lower:
                witness_mentions.append({
                    "witness_label": stmt["witness_label"],
                    "statement_id":  stmt["id"],
                })
                break

    # 2. Visual detections (from object_detections JSONB)
    evidence_list = supabase.table("evidence")\
        .select("id, filename, object_detections")\
        .eq("case_id", case_id)\
        .eq("type", "image")\
        .execute().data or []

    visual_detections = []
    for ev in evidence_list:
        dets = ev.get("object_detections") or []
        if isinstance(dets, str):
            import json
            try:
                dets = json.loads(dets)
            except Exception:
                dets = []
        for idx, det in enumerate(dets):
            if det.get("label", "").lower().strip() == label_lower:
                visual_detections.append({
                    "evidence_id":    ev["id"],
                    "filename":       ev["filename"],
                    "confidence":     det.get("confidence"),
                    "detection_index": det.get("detection_index", idx),
                })

    # 3. Human identifications (canonical name match)
    id_result = supabase.table("detection_identifications")\
        .select("*")\
        .eq("case_id", case_id)\
        .execute().data or []

    human_ids = [
        i for i in id_result
        if (i.get("canonical_name") or "").lower().strip() == label_lower
        or (i.get("alias") or "").lower().strip() == label_lower
    ]

    # 4. Timeline events mentioning this entity
    timeline = supabase.table("timeline_events")\
        .select("id, description, timestamp_hard, relative_order, source")\
        .eq("case_id", case_id)\
        .execute().data or []

    timeline_mentions = [
        t for t in timeline
        if label_lower in (t.get("description") or "").lower()
    ]

    # 5. Contradictions involving this entity
    contradictions = supabase.table("contradictions")\
        .select("id, type, severity, claim_a, claim_b, resolution_status")\
        .eq("case_id", case_id)\
        .execute().data or []

    related_contradictions = [
        c for c in contradictions
        if label_lower in (c.get("claim_a") or "").lower()
        or label_lower in (c.get("claim_b") or "").lower()
    ]

    # 6. Claim links
    claims = supabase.table("evidence_claim_links")\
        .select("id, evidence_id, link_type, confidence, match_source, entity_text")\
        .eq("case_id", case_id)\
        .execute().data or []

    related_claims = [
        c for c in claims
        if label_lower in (c.get("entity_text") or "").lower()
    ]

    # Compute cross-module presence score
    source_count = sum([
        1 if witness_mentions   else 0,
        1 if visual_detections  else 0,
        1 if human_ids          else 0,
        1 if timeline_mentions  else 0,
        1 if related_contradictions else 0,
        1 if related_claims     else 0,
    ])

    return {
        "entity_label":      entity_label,
        "case_id":           case_id,
        "witness_mentions":  witness_mentions,
        "visual_detections": visual_detections,
        "human_ids":         human_ids,
        "timeline_mentions": timeline_mentions,
        "related_contradictions": related_contradictions,
        "related_claims":    related_claims,
        "source_count":      source_count,
        "cross_module_note": (
            f"Entity appears across {source_count} independent evidence source(s)."
            if source_count > 1 else
            "Entity appears in one evidence source."
        ),
    }

