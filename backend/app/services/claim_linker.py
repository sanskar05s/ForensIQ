import re
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    return re.sub(r'[^a-z0-9\s]', '', text.lower()).strip()


def build_claim_links(case_id: str, supabase) -> list:
    """
    Cross-references witness statement entities against evidence content.
    Creates evidence_claim_links rows.

    Matching strategy:
    - Entity text from NER vs OCR text from evidence
    - Entity text vs object detection labels from evidence
    - Entity text vs extracted_text from documents

    Returns list of new links created.
    """
    statements = supabase.table("witness_statements")\
        .select("id, witness_label, entities")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")\
        .execute().data or []

    evidence_list = supabase.table("evidence")\
        .select("id, filename, type, object_detections, ocr_text, extracted_text")\
        .eq("case_id", case_id)\
        .eq("status", "analyzed")\
        .execute().data or []

    # Clear existing links for this case (rebuild from scratch)
    supabase.table("evidence_claim_links")\
        .delete().eq("case_id", case_id).execute()

    new_links = []

    for stmt in statements:
        entities = stmt.get("entities") or []
        meaningful_entities = [
            e for e in entities
            if e.get("type") in ("PERSON","LOCATION","OBJECT","ORGANIZATION")
            and len(e.get("text","")) > 3
        ]

        for entity in meaningful_entities:
            entity_text = entity.get("text","").lower().strip()
            entity_norm = _normalize(entity_text)
            if not entity_norm or len(entity_norm) < 3:
                continue

            for ev in evidence_list:
                link_type = None
                confidence = 0.0
                match_source = None

                # Check OCR text
                for ocr_block in (ev.get("ocr_text") or []):
                    ocr_norm = _normalize(ocr_block.get("text",""))
                    if entity_norm in ocr_norm:
                        link_type = "supports"
                        confidence = float(ocr_block.get("confidence", 0.7))
                        match_source = "ocr"
                        break

                # Check object detections
                if not link_type:
                    for det in (ev.get("object_detections") or []):
                        det_label = _normalize(det.get("label",""))
                        if entity_norm in det_label or det_label in entity_norm:
                            link_type = "supports"
                            confidence = float(det.get("confidence", 0.7))
                            match_source = "object_detection"
                            break

                # Check extracted document text
                if not link_type and ev.get("extracted_text"):
                    doc_norm = _normalize(ev["extracted_text"][:3000])
                    if entity_norm in doc_norm:
                        link_type = "supports"
                        confidence = 0.75
                        match_source = "extracted_text"

                if link_type and confidence >= 0.70:
                    new_links.append({
                        "case_id": case_id,
                        "evidence_id": ev["id"],
                        "statement_id": stmt["id"],
                        "claim_text": (stmt.get("raw_text",""))[:200],
                        "entity_text": entity_text,
                        "link_type": link_type,
                        "confidence": round(confidence, 3),
                        "match_source": match_source,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })

    # Batch insert
    if new_links:
        # Insert in chunks of 50 to avoid Supabase payload limits
        for i in range(0, len(new_links), 50):
            chunk = new_links[i:i+50]
            supabase.table("evidence_claim_links").insert(chunk).execute()

    logger.info(f"Claim linking: {len(new_links)} links created for case {case_id}")
    return new_links
