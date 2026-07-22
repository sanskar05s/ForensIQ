from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.supabase import get_supabase_client
from app.services.witness_nlp.ner import extract_entities
from app.services.witness_nlp.temporal import extract_temporal_sequence
from app.services.witness_nlp.hedge_detector import detect_hedge_markers
from datetime import datetime, timezone

router = APIRouter(
    prefix="/witness",
    tags=["Witness NLP"],
)


class WitnessStatementRequest(BaseModel):
    witness_label: str
    raw_text: str
    source_evidence_id: Optional[str] = None


@router.post("/cases/{case_id}/statements")
async def create_statement(case_id: str, body: WitnessStatementRequest):
    """
    Accepts a witness statement, runs NLP analysis pipeline,
    stores results in witness_statements table.
    """
    supabase = get_supabase_client()

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

    return {
        "success": True,
        "statement_id": statement_id,
        "entity_count": len(entities),
        "temporal_events": len(temporal_seq),
        "hedge_markers": hedge_result["hedge_marker_count"],
        "high_uncertainty": hedge_result["high_uncertainty"],
        "xai_summary": xai_summary,
    }


@router.get("/cases/{case_id}/statements")
async def list_statements(case_id: str):
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
async def get_statement(case_id: str, statement_id: str):
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
async def delete_statement(case_id: str, statement_id: str):
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

    return {"success": True}
