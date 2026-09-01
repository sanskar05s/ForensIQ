import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def build_evidence_provenance(evidence_id: str, case_id: str, supabase) -> list:
    """
    Builds the complete investigative journey of an evidence item.
    Returns ordered list of provenance events.
    """
    events = []

    # Get evidence row
    ev = supabase.table("evidence")\
        .select("*").eq("id", evidence_id).single().execute().data
    if not ev:
        return []

    # Step 1: Upload event
    events.append({
        "step": "Uploaded",
        "timestamp": ev.get("uploaded_at"),
        "description": f"Evidence '{ev['filename']}' uploaded to case",
        "icon": "Upload",
        "status": "complete"
    })

    # Step 2: Hash computation
    if ev.get("file_hash"):
        events.append({
            "step": "Hash Computed",
            "timestamp": ev.get("uploaded_at"),  # happens right after upload
            "description": f"SHA-256 hash computed: {ev['file_hash'][:16]}...",
            "icon": "Hash",
            "status": "complete"
        })

    # Step 3: Analysis
    if ev.get("analyzed_at"):
        if ev.get("type") == "image":
            det_count = len(ev.get("object_detections") or [])
            ocr_count = len(ev.get("ocr_text") or [])
            desc = f"Image analyzed: {det_count} objects detected, {ocr_count} text blocks extracted"
        elif ev.get("type") == "document":
            char_count = len(ev.get("extracted_text") or "")
            desc = f"Document analyzed: {char_count} characters extracted"
        else:
            desc = f"{ev.get('type', 'File').capitalize()} metadata extracted"

        events.append({
            "step": "AI Analysis Complete",
            "timestamp": ev.get("analyzed_at"),
            "description": desc,
            "icon": "Cpu",
            "status": "complete"
        })

    # Step 4: Blockchain anchoring
    if ev.get("blockchain_tx_hash"):
        events.append({
            "step": "Blockchain Anchored",
            "timestamp": ev.get("analyzed_at"),
            "description": f"Integrity certificate recorded on Sepolia testnet: {ev['blockchain_tx_hash'][:16]}...",
            "icon": "Shield",
            "status": "complete"
        })

    # Step 5: Evidence involved in contradictions
    # Check if any contradiction's claim mentions this evidence's entities
    contradictions = supabase.table("contradictions")\
        .select("type, severity, xai_explanation, created_at")\
        .eq("case_id", case_id)\
        .execute().data or []

    # Check if entities from this evidence appear in any contradiction
    ev_entities = set()
    for det in (ev.get("object_detections") or []):
        if det.get("label"):
            ev_entities.add(det["label"].lower())
    for ocr in (ev.get("ocr_text") or []):
        if ocr.get("text"):
            for word in ocr["text"].lower().split():
                if len(word) > 3:
                    ev_entities.add(word)

    for c in contradictions:
        claim_text = f"{c.get('claim_a','')} {c.get('claim_b','')}".lower()
        if any(ent in claim_text for ent in ev_entities if len(ent) > 3):
            events.append({
                "step": "Linked to Contradiction",
                "timestamp": c.get("created_at"),
                "description": f"{c['type'].upper()} contradiction detected involving entities from this evidence ({c['severity']} severity)",
                "icon": "GitMerge",
                "status": "flagged"
            })
            break  # one notification is enough

    # Step 6: Knowledge Graph
    # REMOVE THIS:
    # REPLACE WITH THIS:
    kg_result = supabase.table("knowledge_graphs")\
        .select("nodes, generated_at")\
        .eq("case_id", case_id)\
        .execute()

    kg = kg_result.data[0] if kg_result.data else None

    if kg:
        nodes = kg.get("nodes") or []
        obj_labels = {
            d.get("label", "").lower()
            for d in (ev.get("object_detections") or [])
        }
        linked_nodes = [
            n for n in nodes
            if n.get("label", "").lower() in obj_labels
        ]
        if linked_nodes:
            events.append({
                "step": "Knowledge Graph Linked",
                "timestamp": kg.get("generated_at"),
                "description": (
                    f"{len(linked_nodes)} entities from this evidence "
                    "added to the Knowledge Graph"
                ),
                "icon": "Share2",
                "status": "complete"
            })

    if kg:
        nodes = kg.get("nodes") or []
        obj_labels = {d.get("label","").lower() for d in (ev.get("object_detections") or [])}
        linked_nodes = [n for n in nodes if n.get("label","").lower() in obj_labels]
        if linked_nodes:
            events.append({
                "step": "Knowledge Graph Linked",
                "timestamp": kg.get("generated_at"),
                "description": f"{len(linked_nodes)} entities from this evidence added to the Knowledge Graph",
                "icon": "Share2",
                "status": "complete"
            })

    # Step 7: Claim links (if table exists and has data)
    try:
        links = supabase.table("evidence_claim_links")\
            .select("link_type, claim_text, created_at")\
            .eq("evidence_id", evidence_id)\
            .execute().data or []
        if links:
            supports = sum(1 for l in links if l["link_type"] == "supports")
            contradicts = sum(1 for l in links if l["link_type"] == "contradicts")
            events.append({
                "step": "Claim Links Established",
                "timestamp": links[0].get("created_at"),
                "description": f"Linked to witness claims: {supports} supporting, {contradicts} contradicting",
                "icon": "Link",
                "status": "complete"
            })
    except Exception:
        pass  # table may not have data yet

    # Sort by timestamp
    def sort_key(e):
        ts = e.get("timestamp")
        return ts or "1970-01-01T00:00:00"

    events.sort(key=sort_key)
    return events
