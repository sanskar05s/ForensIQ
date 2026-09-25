from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.core.supabase import get_supabase_client
from app.core.auth import require_case_owner
from app.services.witness_nlp.ner import extract_entities
from app.services.witness_nlp.temporal import extract_temporal_sequence
from app.services.witness_nlp.hedge_detector import detect_hedge_markers
from app.services.witness_nlp.document_parser import (
    parse_multi_witness_document,
    extract_single_witness_text,
)
from app.services.doc_metadata.text_extractor import extract_text
from app.services.activity_logger import log_activity
from datetime import datetime, timezone
import os
import tempfile
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/witness",
    tags=["Witness NLP"],
    dependencies=[Depends(require_case_owner)],
)


class WitnessStatementRequest(BaseModel):
    witness_label: str
    raw_text: str
    source_evidence_id: Optional[str] = None


@router.post("/cases/{case_id}/statements")
def create_statement(
    case_id: str,
    body: WitnessStatementRequest,
):
    """
    Accepts a witness statement, runs NLP analysis pipeline,
    stores results in witness_statements table.
    """
    supabase = get_supabase_client()

    if body.source_evidence_id:
        source = (
            supabase.table("evidence")
            .select("id")
            .eq("id", body.source_evidence_id)
            .eq("case_id", case_id)
            .maybe_single()
            .execute()
        )
        if not source.data:
            raise HTTPException(status_code=404, detail="Source evidence not found in case.")

    text = body.raw_text.strip()
    witness_label = body.witness_label.strip()

    # Validate witness label
    if not witness_label:
        raise HTTPException(
            status_code=400, detail="Witness label cannot be empty"
        )
    if len(witness_label) > 100:
        raise HTTPException(
            status_code=400,
            detail="Witness label too long (max 100 characters)",
        )

    # Validate statement text
    if not text:
        raise HTTPException(
            status_code=400, detail="Statement text cannot be empty"
        )
    if len(text) < 10:
        raise HTTPException(
            status_code=400,
            detail="Statement is too short to analyze",
        )
    if len(text) > 50000:
        raise HTTPException(
            status_code=400,
            detail="Statement exceeds maximum length of 50,000 characters",
        )

    # Run all three NLP services in sequence
    entities = extract_entities(text)

    # ── Gemini entity type disambiguation & missing entity extraction (non-fatal) ──
    # Reclassifies ambiguous spaCy entities (PRODUCT, ORG) using context,
    # and extracts missing entities if spaCy found fewer than 2 graph entities.
    # Falls back to spaCy-only output if Gemini unavailable.
    try:
        from app.services.witness_nlp.entity_classifier import classify_ambiguous_entities
        from app.services.gemini_client import _configure_gemini

        gemini_model = _configure_gemini()
        entities = classify_ambiguous_entities(text, entities, gemini_model)
    except Exception as e:
        logger.warning(f"Gemini entity classification skipped (non-fatal): {e}")
        # entities remains the spaCy-only output — statement still saved correctly

    temporal_seq = extract_temporal_sequence(text, entities)
    hedge_result = detect_hedge_markers(text)

    # Build XAI summary
    xai_summary = (
        f"{len(entities)} entities extracted. "
        f"{len(temporal_seq)} temporal event(s) identified. "
        f"{hedge_result['hedge_marker_count']} uncertainty marker(s) detected."
        f"{' High uncertainty flagged.' if hedge_result['high_uncertainty'] else ''}"
    )

    # Insert into witness_statements
    result = (
        supabase.table("witness_statements")
        .insert(
            {
                "case_id": case_id,
                "witness_label": witness_label,
                "raw_text": text,
                "source_evidence_id": body.source_evidence_id,
                "entities": entities,
                "temporal_sequence": temporal_seq,
                "hedge_marker_count": hedge_result["hedge_marker_count"],
                "hedge_words_found": hedge_result["hedge_words_found"],
                "hedge_words_xai": hedge_result["xai_reason"],
                "analysis_status": "analyzed",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=500, detail="Failed to save witness statement"
        )

    # Increment witness_count ONLY after confirming the insert succeeded
    supabase.rpc(
        "increment_witness_count", {"case_id_input": case_id}
    ).execute()

    statement_id = result.data[0]["id"]

    log_activity(
        case_id=case_id,
        event_type="witness_analyzed",
        description=f"Statement from '{witness_label}' analyzed: {len(entities)} entities, {len(temporal_seq)} temporal events",
        metadata={"statement_id": statement_id, "witness_label": witness_label, "entity_count": len(entities)},
    )

    # Keep one statement's case-wide checks inside its sequential queue turn.
    # This sync route runs in FastAPI's worker pool, leaving the ASGI event loop
    # available to serve unrelated modules during model and database work.
    _refresh_case_contradictions(case_id, statement_id)

    return {
        "success": True,
        "statement_id": statement_id,
        "entity_count": len(entities),
        "temporal_events": len(temporal_seq),
        "hedge_markers": hedge_result["hedge_marker_count"],
        "high_uncertainty": hedge_result["high_uncertainty"],
        "xai_summary": xai_summary,
    }


def _refresh_case_contradictions(case_id: str, statement_id: str):
    try:
        from app.services.contradiction.rule_based import run_tier1

        supabase_client = get_supabase_client()
        all_statements = supabase_client.table("witness_statements")\
            .select("*").eq("case_id", case_id)\
            .eq("analysis_status", "analyzed").execute().data or []

        new_stmt = next((s for s in all_statements if s["id"] == statement_id), None)
        existing = [s for s in all_statements if s["id"] != statement_id]

        new_contradictions = []
        for existing_stmt in existing:
            if new_stmt and existing_stmt["id"] != new_stmt["id"]:
                tier1 = run_tier1(new_stmt, existing_stmt)
                if tier1:
                    for c in tier1:
                        c["case_id"] = case_id
                    new_contradictions.extend(tier1)
        # Deduplicate before inserting
        existing_fingerprints = set()
        existing_c = supabase_client.table("contradictions")\
            .select("witness_a_id, witness_b_id, type")\
            .eq("case_id", case_id).execute().data or []
        for row in existing_c:
            existing_fingerprints.add((
                min(row["witness_a_id"], row["witness_b_id"]),
                max(row["witness_a_id"], row["witness_b_id"]),
                row["type"]
            ))

        for c in new_contradictions:
            fp = (
                min(c.get("witness_a_id", ""), c.get("witness_b_id", "")),
                max(c.get("witness_a_id", ""), c.get("witness_b_id", "")),
                c.get("type", "")
            )
            if fp not in existing_fingerprints:
                db_payload = {
                    k: v for k, v in c.items()
                    if k in {
                        "case_id", "tier", "type", "witness_a_id", "witness_b_id",
                        "claim_a", "claim_b", "severity", "nli_confidence",
                        "xai_explanation", "id", "created_at", "is_dismissed",
                        "resolution_status", "resolution_reason", "resolved_at", "resolved_by"
                    }
                }
                if "nli_confidence" not in db_payload and "confidence" in c:
                    db_payload["nli_confidence"] = c.get("confidence")
                supabase_client.table("contradictions").insert(db_payload).execute()
                existing_fingerprints.add(fp)

        # This lightweight automatic pass only runs Tier 1. Leave the manual
        # analysis cursor untouched so the investigator's run still includes
        # this statement and can evaluate eligible pairs with Tier 2/NLI.

    except Exception as e:
        logger.warning(f"Auto contradiction check failed (non-fatal): {e}")

    # Graph freshness is tracked by /graph/cases/{case_id}/staleness. The graph
    # is intentionally rebuilt only when requested, avoiding a full-case graph
    # and SNA rebuild for every statement in a batch.


@router.get("/cases/{case_id}/statements")
def list_statements(case_id: str):
    """Returns all witness statements for a case, oldest first."""
    supabase = get_supabase_client()
    result = (
        supabase.table("witness_statements")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"statements": result.data or []}


@router.get("/cases/{case_id}/statements/{statement_id}")
def get_statement(case_id: str, statement_id: str):
    """Returns a single witness statement with full NLP results."""
    supabase = get_supabase_client()
    result = (
        supabase.table("witness_statements")
        .select("*")
        .eq("id", statement_id)
        .eq("case_id", case_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    return result.data[0]


@router.delete("/cases/{case_id}/statements/{statement_id}")
def delete_statement(case_id: str, statement_id: str):
    """Deletes a witness statement and decrements the case witness_count."""
    supabase = get_supabase_client()
    result = (
        supabase.table("witness_statements")
        .delete()
        .eq("id", statement_id)
        .eq("case_id", case_id)
        .execute()
    )

    # Decrement witness_count only if a row was actually deleted
    if result.data:
        supabase.rpc(
            "decrement_witness_count", {"case_id_input": case_id}
        ).execute()
        log_activity(
            case_id=case_id,
            event_type="witness_deleted",
            description=f"Witness statement deleted",
            metadata={"statement_id": statement_id},
        )

    return {"success": True}


@router.post("/cases/{case_id}/parse-document")
def parse_document(case_id: str, file: UploadFile = File(...)):
    """
    Accepts an uploaded document (PDF, DOCX, DOC, TXT), extracts full text,
    and deterministically splits it into individual witness statements.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    suffix = os.path.splitext(file.filename)[1].lower()
    allowed_extensions = {".pdf", ".docx", ".doc", ".txt"}
    if suffix not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{suffix}'. Allowed formats: PDF, DOC, DOCX, TXT."
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = file.file.read()
            tmp.write(content)
            tmp_path = tmp.name

        mime_type = file.content_type or ""
        text_result = extract_text(tmp_path, mime_type)
        extracted_text = text_result.get("text", "")

        if not extracted_text or not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from document or document is empty."
            )

        entries = parse_multi_witness_document(extracted_text)

        if not entries:
            raise HTTPException(
                status_code=400,
                detail="No recognizable 'Witness Name:' and 'Witness Statement:' pairs found in document."
            )

        return {
            "filename": file.filename,
            "total_found": len(entries),
            "valid_count": sum(1 for e in entries if e["valid"]),
            "witnesses": entries,
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/cases/{case_id}/extract-text")
def extract_single_text(case_id: str, file: UploadFile = File(...)):
    """
    Accepts an uploaded document representing a single witness (PDF, DOCX, DOC, TXT),
    extracts the complete text, and extracts/suggests statement and witness name.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    suffix = os.path.splitext(file.filename)[1].lower()
    allowed_extensions = {".pdf", ".docx", ".doc", ".txt"}
    if suffix not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{suffix}'. Allowed formats: PDF, DOC, DOCX, TXT."
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = file.file.read()
            tmp.write(content)
            tmp_path = tmp.name

        mime_type = file.content_type or ""
        text_result = extract_text(tmp_path, mime_type)
        extracted_text = text_result.get("text", "")

        if not extracted_text or not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from document or document is empty."
            )

        single_res = extract_single_witness_text(extracted_text)

        return {
            "filename": file.filename,
            "char_count": len(single_res["raw_text"]),
            "statement_text": single_res["raw_text"],
            "suggested_label": single_res["witness_label"],
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


class ParseTextRequest(BaseModel):
    text: str


@router.post("/cases/{case_id}/parse-text")
def parse_text_endpoint(case_id: str, body: ParseTextRequest):
    """
    Accepts pasted text containing multiple witness statements,
    and deterministically splits it using parse_multi_witness_document.
    """
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="Statement text cannot be empty."
        )

    entries = parse_multi_witness_document(text)
    if not entries:
        raise HTTPException(
            status_code=400,
            detail="No recognizable 'Witness Name:' and 'Witness Statement:' pairs found in text."
        )

    return {
        "filename": "Direct Text Entry",
        "total_found": len(entries),
        "valid_count": sum(1 for e in entries if e["valid"]),
        "witnesses": entries,
    }


