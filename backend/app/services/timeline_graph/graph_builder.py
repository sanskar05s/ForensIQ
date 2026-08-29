import re
import networkx as nx
from typing import Dict, Tuple
import logging

logger = logging.getLogger(__name__)

GRAPH_ENTITY_TYPES = {"PERSON", "LOCATION", "OBJECT", "ORGANIZATION", "EVENT"}


def make_node_id(text: str, entity_type: str) -> str:
    """Creates a clean string node ID from entity text and type."""
    clean = re.sub(r'[^a-z0-9]', '_', text.lower().strip())
    clean = re.sub(r'_+', '_', clean).strip('_')
    return f"{entity_type}_{clean}"


def build_graph(case_id: str, supabase) -> Tuple[nx.Graph, list, list]:
    """
    Builds a knowledge graph from:
    - Entity mentions in witness_statements.entities (Module 3)
    - Object detections in evidence.object_detections (Module 1)

    Returns (NetworkX Graph, nodes_list, edges_list) where nodes_list
    and edges_list are JSON-serialisable dicts for storage in Supabase.
    """
    G = nx.Graph()

    # Track entity data for final node construction
    entity_data: Dict[str, dict] = {}  # node_id → data dict

    # ─── Source 1: Witness statement entities ─────────────────────────
    statements = supabase.table("witness_statements")\
        .select("id, witness_label, entities")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")\
        .execute().data or []

    for stmt in statements:
        entities = stmt.get("entities") or []
        stmt_node_ids = []

        for entity in entities:
            if entity.get("type") not in GRAPH_ENTITY_TYPES:
                continue  # Skip TIME, NUMBER, and other non-investigation types
            node_id = make_node_id(entity["text"], entity["type"])

            if node_id not in entity_data:
                entity_data[node_id] = {
                    "id": node_id,
                    "label": entity["text"],
                    "type": entity["type"],
                    "mention_count": 0,
                    "statement_ids": [],
                    "centrality_score": 0.0,
                    "degree": 0,
                    "community_id": 0,
                }

            entity_data[node_id]["mention_count"] += 1
            if stmt["id"] not in entity_data[node_id]["statement_ids"]:
                entity_data[node_id]["statement_ids"].append(stmt["id"])

            if node_id not in stmt_node_ids:
                stmt_node_ids.append(node_id)

        # Add nodes and edges to NetworkX graph
        for nid in stmt_node_ids:
            if not G.has_node(nid):
                G.add_node(nid)

        for i, nid_a in enumerate(stmt_node_ids):
            for nid_b in stmt_node_ids[i+1:]:
                if G.has_edge(nid_a, nid_b):
                    G[nid_a][nid_b]["weight"] += 1
                else:
                    G.add_edge(nid_a, nid_b, weight=1,
                               relation="co-mentioned")

    # ─── Source 2: Object detections from image evidence ──────────────
    image_evidence = supabase.table("evidence")\
        .select("id, object_detections")\
        .eq("case_id", case_id)\
        .eq("type", "image")\
        .eq("status", "analyzed")\
        .execute().data or []

    for ev in image_evidence:
        detections = ev.get("object_detections")
        if not detections or not isinstance(detections, list):
            continue
        detected_ids = []

        for det in detections:
            label = (det.get("label") or "").strip()
            confidence = det.get("confidence", 0)
            if not label or confidence < 0.70:
                continue

            node_id = make_node_id(label, "OBJECT")

            if node_id not in entity_data:
                entity_data[node_id] = {
                    "id": node_id,
                    "label": label,
                    "type": "OBJECT",
                    "mention_count": 0,
                    "statement_ids": [],
                    "centrality_score": 0.0,
                    "degree": 0,
                    "community_id": 0,
                }

            entity_data[node_id]["mention_count"] += 1
            if node_id not in detected_ids:
                detected_ids.append(node_id)

            if not G.has_node(node_id):
                G.add_node(node_id)

        # Connect co-detected objects within same image
        for i, nid_a in enumerate(detected_ids):
            for nid_b in detected_ids[i+1:]:
                if G.has_edge(nid_a, nid_b):
                    G[nid_a][nid_b]["weight"] += 1
                else:
                    G.add_edge(nid_a, nid_b, weight=1,
                               relation="co-detected")

    # Build serialisable nodes list
    nodes = list(entity_data.values())

    # Build serialisable edges list
    edges = [
        {
            "source": u,
            "target": v,
            "relation": data.get("relation", "co-mentioned"),
            "weight": data.get("weight", 1)
        }
        for u, v, data in G.edges(data=True)
    ]

    # Add degree to each node
    degrees = dict(G.degree())
    for node in nodes:
        node["degree"] = degrees.get(node["id"], 0)

    return G, nodes, edges
