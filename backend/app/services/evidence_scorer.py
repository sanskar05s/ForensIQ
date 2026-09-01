import logging

logger = logging.getLogger(__name__)


def compute_priority_score(ev: dict, case_contradictions: list,
                           kg_nodes: list) -> dict:
    """
    Computes a priority score for an evidence item.
    Score 0-100. Returns {score, priority, breakdown}.
    """
    score = 0
    breakdown = {}

    # Component 1: Analysis confidence (0-30 points)
    confidence = ev.get("analysis_confidence") or 0
    if confidence >= 0.85:
        conf_points = 30
    elif confidence >= 0.70:
        conf_points = 20
    elif confidence > 0:
        conf_points = 10
    else:
        conf_points = 0
    score += conf_points
    breakdown["analysis_confidence"] = conf_points

    # Component 2: Blockchain integrity (0-20 points)
    if ev.get("blockchain_tx_hash"):
        score += 20
        breakdown["blockchain"] = 20
    elif ev.get("file_hash"):
        score += 10
        breakdown["blockchain"] = 10
    else:
        breakdown["blockchain"] = 0

    # Component 3: Object detections (0-15 points)
    det_count = len(ev.get("object_detections") or [])
    if det_count >= 8:
        det_points = 15
    elif det_count >= 4:
        det_points = 10
    elif det_count >= 1:
        det_points = 5
    else:
        det_points = 0
    score += det_points
    breakdown["detections"] = det_points

    # Component 4: Contradiction involvement (0-20 points)
    ev_labels = {(d.get("label") or "").lower()
                 for d in (ev.get("object_detections") or [])
                 if d.get("label")}
    ev_labels.update(
        word.lower()
        for ocr in (ev.get("ocr_text") or [])
        for word in (ocr.get("text") or "").split()
        if len(word) > 3
    )
    contradiction_involvement = 0
    for c in case_contradictions:
        claim_text = f"{c.get('claim_a','')} {c.get('claim_b','')}".lower()
        if any(label in claim_text for label in ev_labels if len(label) > 3):
            contradiction_involvement = 20
            break
    score += contradiction_involvement
    breakdown["contradiction_involvement"] = contradiction_involvement

    # Component 5: Knowledge Graph centrality (0-15 points)
    ev_label_set = {l.lower() for l in ev_labels if len(l) > 3}
    kg_points = 0
    for node in kg_nodes:
        if node.get("label", "").lower() in ev_label_set:
            centrality = node.get("centrality_score", 0) or 0
            if centrality >= 0.3:
                kg_points = 15
                break
            elif centrality >= 0.1:
                kg_points = 8
    score += kg_points
    breakdown["kg_centrality"] = kg_points

    score = min(score, 100)

    if score >= 75:
        priority = "CRITICAL"
    elif score >= 50:
        priority = "HIGH"
    elif score >= 25:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return {"score": score, "priority": priority, "breakdown": breakdown}
