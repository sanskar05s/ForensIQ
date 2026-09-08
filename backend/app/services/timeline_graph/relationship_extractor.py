"""
ForensIQ Semantic Relationship Extractor

Uses Gemini to extract Subject-Verb-Object triples from witness statements.
Produces typed, provenance-bearing graph edges.

Each triple states what a WITNESS REPORTED — not established facts.
This is critical for forensic integrity.

Called during knowledge graph rebuild (not during statement submission).
If Gemini fails, the graph still generates using co-occurrence edges only.
"""

import json
import logging
from typing import List

logger = logging.getLogger(__name__)

# Allowed relationship types — specific enough to be meaningful,
# general enough to work across case types.
ALLOWED_RELATIONS = {
    # Violence / collision
    "HIT", "STRUCK", "COLLIDED_WITH", "ATTACKED", "GRABBED", "STABBED",
    "PUSHED", "SHOT_AT",
    # Movement
    "FLED_TO", "FLED_VIA", "ENTERED", "EXITED", "LEFT_SCENE",
    "APPROACHED", "FOLLOWED", "CHASED", "DROVE", "RODE",
    # Possession / use
    "USED_VEHICLE", "CARRIED", "HELD", "TOOK",
    # Observation
    "SAW", "OBSERVED", "NOTICED", "HEARD", "REPORTED",
    # Location
    "LOCATED_AT", "PARKED_AT", "WAITED_AT",
    # Communication
    "CALLED", "REPORTED_TO",
}

RELATIONSHIP_PROMPT = """You are a forensic relationship extractor for an AI investigation platform.

TASK:
Extract explicit subject-verb-object relationships from a witness statement.
Only extract relationships clearly and directly stated in the text.
Do NOT infer, speculate, or add anything not explicitly in the statement.

CRITICAL FORENSIC RULE:
This represents what a WITNESS REPORTED — not established facts.
You are helping document testimony, not determining what happened.

RELATIONSHIP TYPES (use only these):
HIT, STRUCK, COLLIDED_WITH, ATTACKED, GRABBED, STABBED, PUSHED, SHOT_AT,
FLED_TO, FLED_VIA, ENTERED, EXITED, LEFT_SCENE, APPROACHED, FOLLOWED,
CHASED, DROVE, RODE, USED_VEHICLE, CARRIED, HELD, TOOK,
SAW, OBSERVED, NOTICED, HEARD, REPORTED, LOCATED_AT, PARKED_AT,
WAITED_AT, CALLED, REPORTED_TO

RULES:
1. subject and object must be exact text of entities from the entity list below
2. confidence reflects how clearly the relationship is stated (0.0 to 1.0)
3. evidence_text is the exact phrase from the statement supporting the triple
4. If a relationship is implied but not stated, do not include it
5. Prefer specific relation types over generic ones

WITNESS LABEL: {witness_label}

WITNESS STATEMENT:
{statement_text}

TYPED ENTITIES IN THIS STATEMENT:
{entities_json}

Return ONLY valid JSON. No explanation. No markdown:
{{
  "triples": [
    {{
      "subject": "exact entity text from list",
      "relation": "RELATION_TYPE",
      "object": "exact entity text from list",
      "confidence": 0.88,
      "evidence_text": "exact supporting phrase from statement"
    }}
  ]
}}

If no clear explicit relationships found, return: {{"triples": []}}"""


def extract_relationships(
    statement: dict,
    gemini_model
) -> List[dict]:
    """
    Extracts SVO triples from a single witness statement.

    statement: full row from witness_statements table (with entities field)
    gemini_model: configured Gemini model instance

    Returns list of edge dicts, each with:
    {source_id, target_id, relation, weight, confidence,
     source_statement_id, source_witness, evidence_text}
    """
    from app.services.timeline_graph.graph_builder import make_node_id

    raw_text = (statement.get("raw_text") or "").strip()
    entities = statement.get("entities") or []
    witness_label = statement.get("witness_label", "Unknown")
    stmt_id = statement.get("id", "")

    if not raw_text or not entities:
        return []

    # Filter to graph-relevant entities only (no TIME etc.)
    graph_entities = [
        e for e in entities
        if e.get("type") in {
            "PERSON", "LOCATION", "VEHICLE", "OBJECT",
            "ORGANIZATION", "EVENT", "WITNESS"
        }
    ]

    if len(graph_entities) < 2:
        return []  # Need at least 2 entities to form a relationship

    entities_for_prompt = [
        {"text": e["text"], "type": e["type"]}
        for e in graph_entities
    ]

    prompt = RELATIONSHIP_PROMPT.format(
        witness_label=witness_label,
        statement_text=raw_text[:1200],
        entities_json=json.dumps(entities_for_prompt, indent=2)
    )

    try:
        response = gemini_model.generate_content(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:-1])

        result = json.loads(raw)
        triples = result.get("triples", [])

        # Build entity text → node_id lookup
        entity_lookup = {}
        for e in graph_entities:
            entity_lookup[e["text"].lower()] = (e["text"], e["type"])

        edges = []
        for triple in triples:
            relation = triple.get("relation", "").upper()
            if relation not in ALLOWED_RELATIONS:
                continue

            confidence = float(triple.get("confidence") or 0.0)
            if confidence < 0.65:
                continue  # Low confidence triples are noise

            subj_text = triple.get("subject", "").lower()
            obj_text = triple.get("object", "").lower()

            subj_match = entity_lookup.get(subj_text)
            obj_match = entity_lookup.get(obj_text)

            if not subj_match or not obj_match:
                continue  # Must reference actual entities

            source_id = make_node_id(subj_match[0], subj_match[1])
            target_id = make_node_id(obj_match[0], obj_match[1])

            if source_id == target_id:
                continue

            edges.append({
                "source":              source_id,
                "target":              target_id,
                "relation":            relation,
                "weight":              1,
                "confidence":          round(confidence, 3),
                "source_statement_id": stmt_id,
                "source_witness":      witness_label,
                "evidence_text":       triple.get("evidence_text", ""),
            })

        return edges

    except Exception as e:
        logger.warning(
            f"Relationship extraction failed for stmt {stmt_id} (non-fatal): {e}"
        )
        return []
