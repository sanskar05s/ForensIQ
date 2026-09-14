import re
import networkx as nx
from typing import Dict, Tuple
import logging
from app.services.gemini_client import _configure_gemini
from app.services.timeline_graph.relationship_extractor import extract_relationships

logger = logging.getLogger(__name__)

GRAPH_ENTITY_TYPES = {"PERSON", "LOCATION", "OBJECT", "ORGANIZATION", "EVENT", "VEHICLE"}

# YOLO COCO categories that are investigatively relevant.
# Anything not in this set is filtered before becoming a graph node.
RELEVANT_YOLO_LABELS = {
    "person", "car", "motorcycle", "bicycle", "truck", "bus",
    "backpack", "handbag", "suitcase", "laptop", "cell phone",
    "knife", "scissors", "umbrella", "baseball bat",
    "bag", "clock", "traffic light", "stop sign", "bottle",
}


def _is_valid_entity_text(text: str) -> bool:
    """
    Returns False for texts that must not become graph nodes:
    - Too short (less than 3 characters)
    - Pure digit strings ("4", "12")
    - Time-only expressions ("7:10", "9 PM", "midnight")
    - Month or day names alone
    """
    t = text.strip()
    if len(t) < 3:
        return False
    if re.match(r'^\d+$', t):
        return False
    if re.match(r'^\d{1,2}:\d{2}', t):
        return False
    if re.match(r'^\d{1,2}\s*(am|pm)$', t, re.IGNORECASE):
        return False
    if t.lower() in {
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "midnight", "noon",
    }:
        return False
    return True


def make_node_id(text: str, entity_type: str) -> str:
    """Creates a clean string node ID from entity text and type."""
    clean = re.sub(r'[^a-z0-9]', '_', text.lower().strip())
    clean = re.sub(r'_+', '_', clean).strip('_')
    return f"{entity_type}_{clean}"


def build_graph(case_id: str, supabase,
                use_gemini_relationships: bool = False) -> Tuple[nx.Graph, list, list]:
    """
    use_gemini_relationships=False: fast rebuild, co-occurrence edges only.
      Use this for auto-rebuilds triggered by statement submission.
    use_gemini_relationships=True: full semantic extraction via Gemini.
      Use this for manual "Rebuild Graph" button clicks.
    """
    G = nx.Graph()

    # Track entity data for final node construction
    entity_data: Dict[str, dict] = {}  # node_id → data dict

    # ─── Source 1: Witness statement entities ─────────────────────────
    statements = supabase.table("witness_statements")\
        .select("id, witness_label, entities, raw_text")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")\
        .execute().data or []

    # Create a WITNESS node for every investigator-labeled witness.
    # Witnesses are first-class citizens in the investigation graph.
    witness_node_map = {}   # maps stmt["id"] → witness_node_id

    for stmt in statements:
        witness_label = (stmt.get("witness_label") or "Unknown Witness").strip()
        witness_node_id = "WITNESS_" + re.sub(r'[^a-z0-9]', '_', witness_label.lower())
        witness_node_id = re.sub(r'_+', '_', witness_node_id).strip('_')

        if witness_node_id not in entity_data:
            entity_data[witness_node_id] = {
                "id":              witness_node_id,
                "label":           witness_label,
                "type":            "WITNESS",
                "mention_count":   0,
                "statement_ids":   [],
                "centrality_score": 0.0,
                "degree":          0,
                "community_id":    0,
            }
        entity_data[witness_node_id]["mention_count"] += 1
        if stmt["id"] not in entity_data[witness_node_id]["statement_ids"]:
            entity_data[witness_node_id]["statement_ids"].append(stmt["id"])
        witness_node_map[stmt["id"]] = witness_node_id

        if not G.has_node(witness_node_id):
            G.add_node(witness_node_id)

    for stmt in statements:
        entities = stmt.get("entities") or []
        stmt_node_ids = []

        for entity in entities:
            # Guard 1: type must be graph-relevant (excludes TIME)
            if entity.get("type") not in GRAPH_ENTITY_TYPES:
                continue

            # Guard 2: text must be a meaningful entity
            if not _is_valid_entity_text(entity.get("text", "")):
                continue

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

            # Connect this witness to each entity they mentioned
            w_nid = witness_node_map.get(stmt["id"])
            if w_nid and G.has_node(w_nid):
                if G.has_edge(w_nid, nid):
                    G[w_nid][nid]["weight"] += 1
                else:
                    G.add_edge(w_nid, nid, weight=1,
                               relation="WITNESS_REPORTED")

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

    # Fetch human identifications for this case (VEI Phase 2)
    id_result = supabase.table("detection_identifications")\
        .select("evidence_id, detection_index, canonical_name, alias, identified_by, identification_source")\
        .eq("case_id", case_id)\
        .execute()
    human_identifications = id_result.data or []

    det_index_map = {}  # (evidence_id, det_index) -> node_id

    for ev in image_evidence:
        detections = ev.get("object_detections")
        if not detections or not isinstance(detections, list):
            continue
        detected_ids = []

        for det_idx, det in enumerate(detections):
            label = (det.get("label") or "").strip()
            confidence = det.get("confidence", 0)
            if not label or confidence < 0.55:
                continue

            # Only investigatively relevant YOLO categories
            if det.get("label", "").lower() not in RELEVANT_YOLO_LABELS:
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
                    "source_ids": [],
                }

            entity_data[node_id]["mention_count"] += 1
            if "source_ids" not in entity_data[node_id]:
                entity_data[node_id]["source_ids"] = []
            ev_source = {"type": "evidence", "id": ev["id"]}
            if ev_source not in entity_data[node_id]["source_ids"]:
                entity_data[node_id]["source_ids"].append(ev_source)

            det_index_map[(ev["id"], det_idx)] = node_id

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

    # ── Semantic relationship extraction via Gemini ────────────────────────────
    # Only runs when use_gemini_relationships=True (manual rebuild).
    # Auto-rebuilds triggered by statement submission use co-occurrence only.

    semantic_edges = []
    if not use_gemini_relationships:
        logger.info("Skipping Gemini relationship extraction (auto-rebuild mode)")
    else:
        try:
            gemini_model = _configure_gemini()
            for stmt in statements:
                stmt_edges = extract_relationships(stmt, gemini_model)
                for edge in stmt_edges:
                    # Add or strengthen edge
                    src = edge["source"]
                    tgt = edge["target"]
                    if G.has_edge(src, tgt):
                        # Keep the more specific relation type
                        existing_rel = G[src][tgt].get("relation", "co-mentioned")
                        if existing_rel == "co-mentioned":
                            G[src][tgt]["relation"] = edge["relation"]
                            G[src][tgt]["source_statement_id"] = edge.get("source_statement_id")
                            G[src][tgt]["source_witness"] = edge.get("source_witness")
                            G[src][tgt]["evidence_text"] = edge.get("evidence_text")
                        G[src][tgt]["weight"] += 1
                        G[src][tgt]["confidence"] = max(
                            G[src][tgt].get("confidence") or 0,
                            edge["confidence"]
                        )
                    else:
                        G.add_edge(src, tgt,
                                   relation=edge["relation"],
                                   weight=edge["weight"],
                                   confidence=edge["confidence"],
                                   source_statement_id=edge["source_statement_id"],
                                   source_witness=edge["source_witness"],
                                   evidence_text=edge["evidence_text"])
                    semantic_edges.append(edge)

            logger.info(
                f"Semantic relationship extraction: "
                f"{len(semantic_edges)} typed edges added for case {case_id}"
            )
        except Exception as e:
            logger.warning(
                f"Semantic relationship extraction skipped (non-fatal): {e}. "
                f"Graph uses co-occurrence edges only."
            )

    # ── Entity Identity Resolution (VEI Phase 2) ─────────────────────────────
    # For each human identification, find the corresponding KG entity node
    # and the YOLO detection node. Create an IDENTIFIED_AS edge connecting them.
    # This does NOT merge nodes — it creates an explicit investigator-confirmed link.

    def _ensure_edge(u: str, v: str, relation: str, weight: int = 1, **kwargs):
        if G.has_edge(u, v):
            G[u][v]["relation"] = relation
            G[u][v]["weight"] = max(G[u][v].get("weight", 1), weight)
            for k, val in kwargs.items():
                if val is not None:
                    G[u][v][k] = val
        else:
            G.add_edge(u, v, relation=relation, weight=weight, **kwargs)

    def _normalize_name(text: str) -> str:
        """Consistent normalization for identity matching."""
        return re.sub(r'[^a-z0-9]', '', text.lower().strip())

    for ident in human_identifications:
        canonical = ident.get("canonical_name", "")
        canonical_norm = _normalize_name(canonical)
        if not canonical_norm:
            continue

        # Find existing entity node that matches the canonical name
        # (PERSON, VEHICLE, OBJECT nodes from witness NLP)
        matching_entity_node = None
        for node_id, node_data in entity_data.items():
            label_norm = _normalize_name(node_data.get("label", ""))
            if label_norm == canonical_norm:
                matching_entity_node = node_id
                break

        # Also check alias if canonical name didn't match
        if not matching_entity_node and ident.get("alias"):
            alias_norm = _normalize_name(ident["alias"])
            if alias_norm:
                for node_id, node_data in entity_data.items():
                    label_norm = _normalize_name(node_data.get("label", ""))
                    if label_norm == alias_norm:
                        matching_entity_node = node_id
                        break

        if not matching_entity_node:
            continue  # No matching entity in KG — skip

        # Find the YOLO detection node for this evidence item
        # YOLO nodes are OBJECT type with label = YOLO class name
        evidence_id = ident.get("evidence_id", "")
        det_index   = ident.get("detection_index", -1)

        yolo_node_id = det_index_map.get((evidence_id, det_index))

        if not yolo_node_id:
            # Find OBJECT nodes that came from this evidence item
            # They have source_ids containing {"type": "evidence", "id": evidence_id}
            for node_id, node_data in entity_data.items():
                if node_data.get("type") != "OBJECT":
                    continue
                source_ids = node_data.get("source_ids") or []
                if not any(
                    s.get("type") == "evidence" and s.get("id") == evidence_id
                    for s in source_ids
                ):
                    continue
                yolo_node_id = node_id
                break

        # This OBJECT node is from the same evidence item
        # Create IDENTIFIED_AS edge from YOLO node to entity node
        if yolo_node_id and G.has_node(yolo_node_id) and G.has_node(matching_entity_node):
            identified_by = ident.get("identified_by") or "Investigator"
            _ensure_edge(
                yolo_node_id,
                matching_entity_node,
                "IDENTIFIED_AS",
                weight=1,
                source_witness=identified_by,
                evidence_text=f"Human identification: '{canonical}'",
            )
            logger.info(
                f"Identity resolved: {yolo_node_id} → {matching_entity_node} "
                f"(confirmed by {identified_by})"
            )

    # Build serialisable nodes list
    nodes = list(entity_data.values())

    # Build serialisable edges list
    edges = [
        {
            "source":              u,
            "target":              v,
            "relation":            data.get("relation", "co-mentioned"),
            "weight":              data.get("weight", 1),
            "confidence":          data.get("confidence"),
            "source_statement_id": data.get("source_statement_id"),
            "source_witness":      data.get("source_witness"),
            "evidence_text":       data.get("evidence_text"),
        }
        for u, v, data in G.edges(data=True)
    ]

    # Add degree to each node
    degrees = dict(G.degree())
    for node in nodes:
        node["degree"] = degrees.get(node["id"], 0)

    return G, nodes, edges
