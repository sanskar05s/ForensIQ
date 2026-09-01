import json
import logging
from app.services.gemini_client import _configure_gemini

logger = logging.getLogger(__name__)


def analyze_hypothesis(
    case_id: str,
    hypothesis_title: str,
    hypothesis_description: str,
    supabase
) -> dict:
    """
    Evaluates a proposed hypothesis against all collected evidence.

    Returns dict with supporting, contradicting, neutral, unresolved,
    confidence_score (0-100), and ai_explanation.

    IMPORTANT: Never concludes guilt. Only assesses evidence strength.
    """
    # Gather all case data
    evidence_list = supabase.table("evidence")\
        .select("id, filename, type, xai_summary, object_detections, ocr_text, extracted_text")\
        .eq("case_id", case_id)\
        .eq("status", "analyzed")\
        .execute().data or []

    statements = supabase.table("witness_statements")\
        .select("id, witness_label, raw_text, entities")\
        .eq("case_id", case_id)\
        .execute().data or []

    contradictions = supabase.table("contradictions")\
        .select("type, severity, claim_a, claim_b, xai_explanation")\
        .eq("case_id", case_id)\
        .execute().data or []

    timeline = supabase.table("timeline_events")\
        .select("description, confidence_state, source")\
        .eq("case_id", case_id)\
        .order("relative_order").execute().data or []

    # Build condensed context
    ev_context = [
        {
            "id": e["id"],
            "filename": e["filename"],
            "type": e["type"],
            "summary": e.get("xai_summary") or "No summary",
            "ocr_text_preview": str(e.get("ocr_text") or "")[:200],
        }
        for e in evidence_list
    ]

    stmt_context = [
        {
            "id": s["id"],
            "witness": s["witness_label"],
            "excerpt": (s.get("raw_text") or "")[:300],
        }
        for s in statements
    ]

    prompt = f"""You are a forensic analysis assistant. Evaluate the following hypothesis
against the available evidence. You must be objective and evidence-based.

HYPOTHESIS:
Title: {hypothesis_title}
Description: {hypothesis_description}

AVAILABLE EVIDENCE:
{json.dumps(ev_context, indent=2)}

WITNESS STATEMENTS:
{json.dumps(stmt_context, indent=2)}

DETECTED CONTRADICTIONS:
{json.dumps(contradictions[:8], indent=2)}

TIMELINE:
{json.dumps(timeline[:10], indent=2)}

For each piece of evidence and each statement, classify it as:
- SUPPORTING: It is consistent with and supports the hypothesis
- CONTRADICTING: It conflicts with or undermines the hypothesis
- NEUTRAL: It neither supports nor contradicts

STRICT RULES:
- Never say anyone is guilty or innocent
- Use language like "evidence supports" or "evidence is inconsistent with"
- Base confidence_score on the ratio of supporting vs contradicting evidence
- confidence_score should be 0-100 (50 = completely inconclusive)
- List specific questions that remain unresolved by current evidence

Respond ONLY with valid JSON:
{{
    "supporting": [{{"id": "evidence-uuid-or-statement-uuid", "reason": "why it supports", "confidence": 0.85}}],
    "contradicting": [{{"id": "uuid", "reason": "why it contradicts", "confidence": 0.75}}],
    "neutral": [{{"id": "uuid"}}],
    "unresolved": ["Question 1", "Question 2"],
    "confidence_score": 65,
    "ai_explanation": "2-3 sentence objective summary. Never name suspects as guilty."
}}"""

    try:
        model = _configure_gemini()
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:-1])
        result = json.loads(text)
        return result
    except Exception as e:
        logger.error(f"Hypothesis analysis failed: {e}")
        return {
            "supporting": [], "contradicting": [], "neutral": [],
            "unresolved": ["Analysis temporarily unavailable"],
            "confidence_score": 0,
            "ai_explanation": "Hypothesis analysis temporarily unavailable."
        }
