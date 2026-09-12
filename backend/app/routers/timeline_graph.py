from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.services.timeline_graph.timeline_fusion import build_timeline
from app.services.timeline_graph.graph_builder import build_graph
from app.services.timeline_graph.sna_metrics import (
    compute_sna_metrics, enrich_nodes_with_sna, get_public_metrics
)
from app.services.activity_logger import log_activity
from datetime import datetime, timezone
import logging

timeline_router = APIRouter(tags=["Timeline"])

graph_router = APIRouter(tags=["Knowledge Graph"])

logger = logging.getLogger(__name__)


# ─── TIMELINE ─────────────────────────────────────────────────────────

@timeline_router.post("/timeline/cases/{case_id}/build")
async def build_case_timeline(case_id: str):
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
async def get_timeline(case_id: str):
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
    return {"events": result.data or []}


@timeline_router.get("/timeline/cases/{case_id}/staleness")
async def timeline_staleness(case_id: str):
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
async def build_case_graph(case_id: str):
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
async def get_graph(case_id: str):
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
async def graph_staleness(case_id: str):
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
