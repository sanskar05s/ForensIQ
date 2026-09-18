import json
import logging
from app.services.gemini_client import _configure_gemini

logger = logging.getLogger(__name__)


def generate_investigation_leads(case_id: str, supabase) -> dict:
    """
    Uses Gemini to identify investigation gaps:
    evidence mentioned by witnesses that is absent from uploaded evidence.

    Returns:
    {
        "leads": [
            {
                "gap": "Description of missing evidence",
                "mentioned_by": ["Witness A", "Witness B"],
                "priority": "HIGH" | "MEDIUM" | "LOW",
                "suggested_action": "What the investigator should do"
            }
        ],
        "summary": "Brief overview of investigation completeness"
    }
    """
    # Fetch witness entity data
    statements = supabase.table("witness_statements")\
        .select("witness_label, entities, raw_text")\
        .eq("case_id", case_id)\
        .eq("analysis_status", "analyzed")\
        .execute().data or []

    # Fetch evidence filenames and summaries
    evidence_list = supabase.table("evidence")\
        .select("filename, type, xai_summary, status")\
        .eq("case_id", case_id)\
        .execute().data or []

    # Build context
    witness_context = []
    for stmt in statements:
        entities = [e.get("text") for e in (stmt.get("entities") or [])
                    if e.get("type") in ("PERSON","LOCATION","OBJECT","ORGANIZATION")]
        witness_context.append({
            "witness": stmt["witness_label"],
            "key_entities": entities[:10],
            "excerpt": (stmt.get("raw_text") or "")[:300]
        })

    evidence_context = [
        {"filename": e["filename"], "type": e["type"],
         "summary": e.get("xai_summary", "No analysis")}
        for e in evidence_list
    ]

    prompt = f"""You are a forensic investigation assistant. Analyze the following
investigation data and identify GAPS — things witnesses mention that have NOT
been collected as physical evidence.

WITNESS DATA:
{json.dumps(witness_context, indent=2)}

COLLECTED EVIDENCE:
{json.dumps(evidence_context, indent=2)}

Identify up to 6 investigation gaps. For each gap:
1. Describe what physical evidence is missing
2. Which witnesses mentioned it
3. Priority (HIGH/MEDIUM/LOW) based on how many witnesses mention it
4. A concrete suggested action for the investigator

IMPORTANT RULES:
- Only identify gaps based on what witnesses EXPLICITLY mention
- Never speculate about guilt or suspects
- Frame everything as "evidence that should be collected"
- Be specific — "CCTV footage from the junction" not "more camera footage"

Respond ONLY with valid JSON in this exact format:
{{
    "leads": [
        {{
            "gap": "Description of missing evidence",
            "mentioned_by": ["Witness A"],
            "priority": "HIGH",
            "suggested_action": "Specific action to take"
        }}
    ],
    "summary": "2-3 sentence overview of investigation completeness"
}}"""

    try:
        model = _configure_gemini()
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:-1])
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "leads" in parsed:
            for lead in parsed["leads"]:
                if "gap" in lead and "gap_description" not in lead:
                    lead["gap_description"] = lead["gap"]
                elif "gap_description" in lead and "gap" not in lead:
                    lead["gap"] = lead["gap_description"]
        return parsed
    except Exception as e:
        logger.error(f"Lead generator failed for case {case_id}: {e}")
        return {
            "leads": [],
            "summary": "Investigation lead generation temporarily unavailable."
        }
