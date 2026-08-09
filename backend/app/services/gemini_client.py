import os
import json
import logging
from datetime import datetime, timezone

import google.generativeai as genai

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3.1-flash-lite"

SYSTEM_PROMPT = """You are ForensIQ, an AI assistant embedded in a digital evidence investigation platform.
Your role is to help investigators understand the evidence collected in a case.

STRICT RULES — follow all of these without exception:
1. Only use the structured case data provided. Never invent facts.
2. If data is insufficient, say so clearly.
3. Never name any person as a suspect or imply guilt or innocence.
4. Be concise. Investigators are busy professionals.
5. When suggesting next steps, base them only on gaps or conflicts visible in the data.
6. Do not reproduce entire evidence contents — summarise and reference.

RESPONSE FORMAT (use this structure every time):
**Analysis:** [Your answer, 2-4 sentences maximum]
**Evidence referenced:** [Specific items, statements, or events your answer draws from]
**Suggested actions:** [1-3 concrete next steps based on data gaps — omit if not asked]"""


def _configure_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set in environment")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(GEMINI_MODEL)


def assemble_context(case_id: str, supabase) -> dict:
    """
    Assembles structured case data from PostgreSQL for the Gemini prompt.
    Capped at reasonable limits to stay within free-tier token budget.
    """
    # Case summary
    case = supabase.table("cases")\
        .select("title, description, investigator_name, status, priority, "
                "evidence_count, witness_count, created_at")\
        .eq("id", case_id).single().execute().data or {}

    # Evidence summary (max 10 items)
    evidence = supabase.table("evidence")\
        .select("filename, type, status, analysis_confidence, xai_summary")\
        .eq("case_id", case_id)\
        .limit(10).execute().data or []

    # Witness statements (labels + entity counts only — not full text)
    statements = supabase.table("witness_statements")\
        .select("witness_label, hedge_marker_count, entities")\
        .eq("case_id", case_id).execute().data or []

    # Contradictions (max 10)
    contradictions = supabase.table("contradictions")\
        .select("type, severity, claim_a, claim_b, xai_explanation, tier")\
        .eq("case_id", case_id)\
        .order("created_at", desc=True)\
        .limit(10).execute().data or []

    # Timeline events (max 15, most recent)
    timeline = supabase.table("timeline_events")\
        .select("description, confidence_state, source, timestamp_hard, relative_order")\
        .eq("case_id", case_id)\
        .order("relative_order", desc=False)\
        .limit(15).execute().data or []

    # Unique entity list across all statements
    all_entities = []
    for stmt in statements:
        for ent in (stmt.get("entities") or []):
            text = ent.get("text", "")
            etype = ent.get("type", "")
            if text and f"{text}({etype})" not in all_entities:
                all_entities.append(f"{text}({etype})")
    entity_list = all_entities[:40]  # cap at 40

    return {
        "case": {
            "title": case.get("title"),
            "status": case.get("status"),
            "priority": case.get("priority"),
            "investigator": case.get("investigator_name"),
            "evidence_count": case.get("evidence_count", 0),
            "witness_count": case.get("witness_count", 0),
        },
        "evidence": [
            {
                "filename": e.get("filename"),
                "type": e.get("type"),
                "status": e.get("status"),
                "confidence": e.get("analysis_confidence"),
                "summary": e.get("xai_summary"),
            }
            for e in evidence
        ],
        "witnesses": [
            {
                "label": s.get("witness_label"),
                "hedge_markers": s.get("hedge_marker_count", 0),
                "entity_count": len(s.get("entities") or []),
            }
            for s in statements
        ],
        "contradictions": [
            {
                "type": c.get("type"),
                "tier": c.get("tier"),
                "severity": c.get("severity"),
                "claim_a": c.get("claim_a"),
                "claim_b": c.get("claim_b"),
                "explanation": c.get("xai_explanation"),
            }
            for c in contradictions
        ],
        "timeline": [
            {
                "description": t.get("description"),
                "confidence": t.get("confidence_state"),
                "source": t.get("source"),
                "time": str(t.get("timestamp_hard") or f"Order {t.get('relative_order')}"),
            }
            for t in timeline
        ],
        "entities_mentioned": entity_list,
    }


def query_assistant(case_id: str, query: str, supabase) -> dict:
    """
    Main function called by the assistant router.
    Assembles context, calls Gemini, stores and returns the response.
    """
    try:
        model = _configure_gemini()
    except ValueError as e:
        return {
            "response": f"AI assistant is not configured: {str(e)}",
            "error": True
        }

    context = assemble_context(case_id, supabase)

    prompt = f"""{SYSTEM_PROMPT}

--- CASE DATA (structured, from database) ---
{json.dumps(context, indent=2, default=str)}

--- INVESTIGATOR QUERY ---
{query}"""

    functions_called = [
        "get_case_summary", "get_evidence_summary", "get_witnesses",
        "get_contradictions", "get_timeline_events", "get_entity_list"
    ]

    try:
        response = model.generate_content(prompt)
        response_text = response.text
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "rate" in error_msg.lower():
            response_text = (
                "The AI assistant is temporarily unavailable due to rate limits. "
                "Please wait 60 seconds and try again."
            )
        else:
            response_text = f"Unable to generate response. Please try again. ({error_msg})"
        logger.warning(f"Gemini API error for case {case_id}: {e}")

    # Store interaction
    try:
        supabase.table("assistant_interactions").insert({
            "case_id": case_id,
            "query": query,
            "response": response_text,
            "functions_called": functions_called,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to store assistant interaction: {e}")

    # Activity log
    try:
        from app.services.activity_logger import log_activity
        log_activity(
            case_id=case_id,
            event_type="assistant_queried",
            description=f"AI assistant consulted: '{query[:60]}{'...' if len(query) > 60 else ''}'",
            metadata={"query_length": len(query)}
        )
    except Exception:
        pass

    return {"response": response_text, "error": False}


def generate_investigation_update(case_id: str, trigger: str, supabase) -> str | None:
    """
    Called after a rebuild (contradictions/timeline/graph) to generate
    a brief investigation update paragraph shown as an assistant notification.
    trigger: 'contradictions' | 'timeline' | 'graph'
    Returns the paragraph string or None if Gemini is unavailable.
    """
    try:
        model = _configure_gemini()
        context = assemble_context(case_id, supabase)

        prompt = f"""{SYSTEM_PROMPT}

--- CASE DATA ---
{json.dumps(context, indent=2, default=str)}

--- TASK ---
The {trigger} analysis was just updated with new data.
Write a single short paragraph (2-3 sentences maximum) summarising the
most important new finding and one concrete next step for the investigator.
Be specific. Reference actual data. Do not use the RESPONSE FORMAT structure
for this task — just write a plain paragraph."""

        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.warning(f"Investigation update generation failed: {e}")
        return None
