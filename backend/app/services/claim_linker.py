import re
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation and extra whitespace."""
    return re.sub(r'[^a-z0-9\s]', '', text.lower()).strip()


def _level1_exact(entity_norm: str, target_text: str) -> float | None:
    """
    Level 1: Exact normalized substring match.
    "scorpio" entity in "black Scorpio fled the scene" → match.
    Returns confidence if matched, None if not.
    """
    target_norm = _normalize(target_text)
    if entity_norm and entity_norm in target_norm:
        return 0.92
    return None


def _level2_word_boundary(entity_norm: str, target_text: str) -> float | None:
    """
    Level 2: Whole-word boundary match.
    Prevents "car" matching "cardiac" or "scar".
    "car" entity in "a car was seen" → match.
    "car" entity in "cardiac arrest" → NO match.
    Returns confidence if matched, None if not.
    """
    target_norm = _normalize(target_text)
    if not entity_norm:
        return None
    pattern = r'\b' + re.escape(entity_norm) + r'\b'
    if re.search(pattern, target_norm):
        return 0.85
    return None


def _level3_yolo(entity_norm: str, object_detections: list) -> float | None:
    """
    Level 3: Exact YOLO class label match.
    "motorcycle" entity → YOLO detection label "motorcycle" → match.
    "person" entity → YOLO "person" → match.
    Returns raw YOLO confidence if matched, None if not.
    """
    for det in (object_detections or []):
        label = (det.get("label") or "").lower().strip()
        if entity_norm and entity_norm == label:
            yolo_conf = float(det.get("confidence") or 0.70)
            return round(min(yolo_conf, 0.88), 3)
    return None


def _level4_human_id(entity_norm: str, ev_identifications: list) -> tuple[float | None, dict | None]:
    """
    Level 4: Human-confirmed identity match.
    Investigator/witness identified detection as "Rahul Sharma".
    Witness entity "Rahul Sharma" → matched via detection_identifications record.
    This is the highest-trust match — human explicitly confirmed it.
    Returns (0.98, ident) if matched, (None, None) if not.
    """
    for ident in (ev_identifications or []):
        canon_norm = _normalize(ident.get("canonical_name") or "")
        alias_norm = _normalize(ident.get("alias") or "")
        if entity_norm and (entity_norm == canon_norm or
                            (alias_norm and entity_norm == alias_norm)):
            return 0.98, ident
    return None, None


def build_claim_links(case_id: str, supabase) -> list:
    """
    Cross-references witness statement entities against evidence content.
    Creates evidence_claim_links rows.

    Returns list of new links created.
    """
    statements = supabase.table("witness_statements")\
        .select("id, witness_label, entities, raw_text")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")\
        .execute().data or []

    evidence_list = supabase.table("evidence")\
        .select("id, filename, type, object_detections, ocr_text, extracted_text")\
        .eq("case_id", case_id)\
        .eq("status", "analyzed")\
        .execute().data or []

    # Fetch human identifications (Level 4 match source)
    id_result = supabase.table("detection_identifications")\
        .select("evidence_id, detection_index, canonical_name, alias, identified_by, identification_source")\
        .eq("case_id", case_id)\
        .execute()
    all_identifications = id_result.data or []

    # Build lookup: evidence_id → list of identification dicts
    id_by_evidence: dict = {}
    for ident in all_identifications:
        eid = ident["evidence_id"]
        id_by_evidence.setdefault(eid, []).append(ident)

    # Clear existing links for this case (rebuild from scratch)
    supabase.table("evidence_claim_links")\
        .delete().eq("case_id", case_id).execute()

    new_links = []

    for stmt in statements:
        entities = stmt.get("entities") or []
        meaningful_entities = [
            e for e in entities
            if e.get("type") in (
                "PERSON", "LOCATION", "OBJECT", "ORGANIZATION", "VEHICLE"
            ) and len(e.get("text", "").strip()) > 2
        ]

        for entity in meaningful_entities:
            entity_text = entity.get("text", "").lower().strip()
            entity_norm = _normalize(entity_text)
            if not entity_norm or len(entity_norm) < 3:
                continue

            for ev in evidence_list:
                link_type = None
                confidence = 0.0
                match_source = None
                match_method = None
                claim_text_note = None

                # ── Level 4: Human-confirmed identity (check first — highest trust) ──
                ev_identifications = id_by_evidence.get(ev["id"], [])
                for ident in ev_identifications:
                    canon_norm = _normalize(ident.get("canonical_name") or "")
                    alias_norm = _normalize(ident.get("alias") or "")

                    if entity_norm and (
                        entity_norm == canon_norm or
                        (alias_norm and entity_norm == alias_norm)
                    ):
                        link_type    = "supports"
                        confidence   = 0.98   # Human-confirmed = highest trust
                        match_source = "human_identification"
                        match_method = "human-confirmed"
                        # Store identification provenance in claim_text
                        claim_text_note = (
                            f"[Human identification: '{ident['canonical_name']}' "
                            f"identified by {ident['identified_by']} "
                            f"({ident['identification_source']})]"
                        )
                        break  # One human ID match is sufficient

                # If Level 4 found a match, skip Levels 1-3
                if not link_type:
                    # ── Level 3: YOLO class exact match ──────────────────────────────
                    yolo_dets = ev.get("object_detections") or []
                    conf = _level3_yolo(entity_norm, yolo_dets)
                    if conf:
                        link_type    = "supports"
                        confidence   = conf
                        match_source = "object_detection"
                        match_method = "yolo-exact"

                # ── Level 1 & 2: OCR text matching ───────────────────────────────────
                if not link_type:
                    for ocr_block in (ev.get("ocr_text") or []):
                        ocr_text = ocr_block.get("text", "")
                        ocr_conf = float(ocr_block.get("confidence") or 0.5)

                        # Level 1 first (more specific)
                        conf = _level1_exact(entity_norm, ocr_text)
                        if conf:
                            final_conf = round((conf + ocr_conf) / 2, 3)
                            if not link_type or final_conf > confidence:
                                link_type    = "supports"
                                confidence   = final_conf
                                match_source = "ocr"
                                match_method = "exact"
                            break

                        # Level 2 fallback
                        conf = _level2_word_boundary(entity_norm, ocr_text)
                        if conf:
                            final_conf = round((conf + ocr_conf) / 2, 3)
                            if not link_type or final_conf > confidence:
                                link_type    = "supports"
                                confidence   = final_conf
                                match_source = "ocr"
                                match_method = "word-boundary"
                            break

                # ── Level 1 & 2: Extracted document text ─────────────────────────────
                if not link_type and ev.get("extracted_text"):
                    doc_text = ev["extracted_text"][:3000]

                    conf = _level1_exact(entity_norm, doc_text)
                    if conf:
                        link_type    = "supports"
                        confidence   = conf
                        match_source = "extracted_text"
                        match_method = "exact"
                    else:
                        conf = _level2_word_boundary(entity_norm, doc_text)
                        if conf:
                            link_type    = "supports"
                            confidence   = conf
                            match_source = "extracted_text"
                            match_method = "word-boundary"

                # ── Store if matched (confidence threshold: 0.65) ────────────────────
                if link_type and confidence >= 0.65:
                    claim_text = (stmt.get("raw_text") or "")[:200]
                    if claim_text_note:
                        claim_text = f"{claim_text} {claim_text_note}"[:300]

                    new_links.append({
                        "case_id":      case_id,
                        "evidence_id":  ev["id"],
                        "statement_id": stmt["id"],
                        "claim_text":   claim_text,
                        "entity_text":  entity_text,
                        "link_type":    link_type,
                        "confidence":   confidence,
                        "match_source": match_source,
                        "created_at":   datetime.now(timezone.utc).isoformat()
                    })

    # Dedup: same evidence + same statement + same entity
    # Different entities from the same statement MUST create separate links
    seen_links = set()
    deduped_links = []

    for link in new_links:
        key = (
            link["evidence_id"],
            link["statement_id"],
            link["entity_text"].lower().strip()
        )
        if key not in seen_links:
            seen_links.add(key)
            deduped_links.append(link)

    # Batch insert
    if deduped_links:
        # Insert in chunks of 50 to avoid Supabase payload limits
        for i in range(0, len(deduped_links), 50):
            chunk = deduped_links[i:i+50]
            supabase.table("evidence_claim_links").insert(chunk).execute()

    logger.info(f"Claim linking: {len(deduped_links)} links created for case {case_id}")
    return deduped_links
