"""
ForensIQ Entity Classifier

Uses Gemini to resolve ambiguous entity types that spaCy cannot
reliably determine:
- PRODUCT: Scorpio (VEHICLE) vs iPhone (OBJECT) vs Pepsi (DISCARD)
- ORG: Jubilee Hills (LOCATION) vs HDFC Bank (ORGANIZATION)
- Location recognition: worldwide, no hardcoded lists

Called once per statement after spaCy NER.
Results stored in witness_statements.entities.
If Gemini fails, the unclassified entities are dropped from the graph
but the statement is still saved — graceful degradation.
"""

import json
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

# spaCy labels where classification is ambiguous enough to need Gemini.
# Clear labels (PERSON, GPE, LOC, FAC) pass through without Gemini.
NEEDS_GEMINI = {"PRODUCT", "ORG", "WORK_OF_ART", "LAW", "NORP"}

# spaCy labels to exclude entirely — no graph value regardless of context.
EXCLUDE_ALWAYS = {"CARDINAL", "ORDINAL", "PERCENT", "MONEY", "QUANTITY",
                  "TIME", "DATE"}

# ForensIQ graph-relevant output types from Gemini
VALID_OUTPUT_TYPES = {
    "PERSON", "LOCATION", "VEHICLE", "OBJECT", "ORGANIZATION", "EVENT"
}

CLASSIFICATION_PROMPT = """You are a forensic entity classifier for an AI investigation platform.

TASK:
Given a witness statement and a list of candidate entities extracted by spaCy NER,
classify each entity into the correct investigation type.

RULES — follow all of these strictly:
1. Do NOT invent new entities. Only classify entities from the candidate list.
2. Do NOT change entity text. Return it exactly as given.
3. Classify based on how the entity is used in THIS statement, not in general.
4. If an entity is irrelevant or nonsensical in investigation context, use DISCARD.

ENTITY TYPES:
- PERSON      Any individual human — named, titled, or described
- LOCATION    Any real-world physical place (worldwide): city, area, road, building,
              landmark, airport, neighborhood, country, region
- VEHICLE     Any vehicle or transport: car model names (Scorpio, Swift, Innova,
              Honda, BMW, etc.), motorcycle, bicycle, auto-rickshaw, bus, truck
- OBJECT      Physical item relevant to investigation: weapon, bag, electronics,
              currency, document, clothing item, tool
- ORGANIZATION Company, institution, government body, shop, hospital, named business
- EVENT       A specific named event or occurrence
- DISCARD     Time expressions, dates, ordinals, pure numbers, zodiac signs,
              brand mascots, anything not useful for investigation

EXAMPLES:
"He drove the Scorpio" → Scorpio = VEHICLE
"He is a Scorpio zodiac" → Scorpio = DISCARD
"She carried an iPhone" → iPhone = OBJECT
"Near Jubilee Hills" → Jubilee Hills = LOCATION
"Reported to HDFC Bank" → HDFC Bank = ORGANIZATION
"Around 9 PM" → 9 PM = DISCARD (already handled as TIME)
"London" → London = LOCATION
"Times Square" → Times Square = LOCATION
"Eiffel Tower" → Eiffel Tower = LOCATION

WITNESS STATEMENT:
{statement_text}

CANDIDATE ENTITIES FROM spaCy:
{candidates_json}

Return ONLY valid JSON. No explanation. No markdown. No preamble:
{{"classified": [{{"text": "entity text", "type": "TYPE", "confidence": 0.95}}]}}"""


FULL_EXTRACTION_PROMPT = """You are a forensic entity extractor for an investigation platform.

Extract all investigatively relevant entities from this witness statement.
This includes named entities AND generic descriptions.

EXTRACT THESE:
- PERSON: named individuals AND generic descriptions ("a man", "the suspect",
  "a woman", "two men", "someone", "the attacker", "the victim")
- LOCATION: named places AND generic descriptions ("the entrance", "office",
  "building", "the corridor", "main road", "the shop", "junction")
- VEHICLE: any vehicle (named model OR generic: "a motorcycle", "a car",
  "the vehicle", "a two-wheeler")
- OBJECT: physical items ("a bag", "a knife", "the laptop", "cash")

DO NOT extract:
- Time expressions ("8 PM", "midnight", "around 5")
- Actions or verbs
- Conjunctions, articles, pronouns
- Anything not physically present in the scene

EXISTING ENTITIES (do not duplicate these):
{existing_json}

STATEMENT:
{statement_text}

Return ONLY valid JSON, no explanation:
{{"entities": [{{"text": "exact phrase from statement", "type": "TYPE"}}]}}

If nothing relevant found, return: {{"entities": []}}"""


def extract_missing_entities(
    statement_text: str,
    existing_entities: list,
    gemini_model
) -> list:
    """
    Stage 2 extraction: finds entities that spaCy missed entirely.
    Called only when classify_ambiguous_entities produces fewer than 2 results.
    Returns additional entity dicts in the same format as extract_entities().
    """
    existing_texts = {e["text"].lower() for e in existing_entities}

    existing_json = json.dumps(
        [{"text": e["text"], "type": e["type"]} for e in existing_entities],
        indent=2
    )

    prompt = FULL_EXTRACTION_PROMPT.format(
        existing_json=existing_json,
        statement_text=statement_text[:1200]
    )

    try:
        response = gemini_model.generate_content(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:-1])

        result = json.loads(raw)
        new_entities = []

        for ent in result.get("entities", []):
            text = (ent.get("text") or "").strip()
            etype = ent.get("type", "")

            if not text or len(text) < 2:
                continue
            if etype not in VALID_OUTPUT_TYPES:
                continue
            if text.lower() in existing_texts:
                continue  # already in entity list

            new_entities.append({
                "text":         text,
                "type":         etype,
                "_spacy_label": "GEMINI_EXTRACTED",
                "start":        0,
                "end":          0,
                "xai_reason":   (
                    f"'{text}' extracted as {etype} by Gemini "
                    f"(not detected by spaCy NER)."
                )
            })

        return new_entities

    except Exception as e:
        logger.warning(f"Gemini full entity extraction failed (non-fatal): {e}")
        return []


def classify_ambiguous_entities(
    statement_text: str,
    all_entities: List[dict],
    gemini_model
) -> List[dict]:
    """
    Takes all spaCy entities for a statement.
    Passes only ambiguous ones to Gemini.
    Returns the full merged list with reclassified types.

    Clear types (PERSON, GPE, LOC, FAC) pass through unchanged.
    Ambiguous types (PRODUCT, ORG) are sent to Gemini.
    Excluded types (TIME, DATE, CARDINAL) are dropped.
    """
    clear_entities = []
    ambiguous_entities = []

    for ent in all_entities:
        spacy_label = ent.get("_spacy_label", "")
        entity_type = ent.get("type", "")

        # Always exclude these
        if spacy_label in EXCLUDE_ALWAYS or entity_type == "TIME":
            continue

        # Clear types — pass through directly
        if spacy_label not in NEEDS_GEMINI:
            clear_entities.append(ent)
        else:
            # Ambiguous — needs Gemini
            ambiguous_entities.append(ent)

    reclassified = []
    if ambiguous_entities:
        # Prepare candidates for Gemini
        candidates = [
            {
                "text":         e["text"],
                "spacy_label":  e.get("_spacy_label", ""),
            }
            for e in ambiguous_entities
        ]

        prompt = CLASSIFICATION_PROMPT.format(
            statement_text=statement_text[:1000],  # cap to avoid token waste
            candidates_json=json.dumps(candidates, indent=2)
        )

        try:
            response = gemini_model.generate_content(prompt)
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:-1])

            result = json.loads(raw)
            classified = result.get("classified", [])

            # Build a lookup from the Gemini result
            gemini_map = {
                item["text"].lower(): item
                for item in classified
                if item.get("type") in VALID_OUTPUT_TYPES
            }

            # Merge Gemini results back
            for ent in ambiguous_entities:
                text_lower = ent["text"].lower()
                if text_lower in gemini_map:
                    gemini_result = gemini_map[text_lower]
                    reclassified.append({
                        **ent,
                        "type": gemini_result["type"],
                        "xai_reason": (
                            f"'{ent['text']}' classified as {gemini_result['type']} "
                            f"by Gemini semantic classifier "
                            f"(confidence: {gemini_result.get('confidence', 0):.0%}). "
                            f"spaCy original label: {ent.get('_spacy_label', 'unknown')}."
                        )
                    })
                # If Gemini returned DISCARD or didn't return it, skip entirely

        except Exception as e:
            logger.warning(
                f"Gemini entity classification failed (non-fatal): {e}. "
                f"Falling back to spaCy-only entities."
            )

    # Stage 2: if result still has fewer than 2 graph-relevant entities,
    # run full Gemini extraction to find entities spaCy missed entirely
    graph_relevant = [
        e for e in (clear_entities + reclassified)
        if e.get("type") in VALID_OUTPUT_TYPES
    ]

    if len(graph_relevant) < 2:
        try:
            extra = extract_missing_entities(
                statement_text,
                clear_entities + reclassified,
                gemini_model
            )
            reclassified = reclassified + extra
        except Exception as e:
            logger.warning(f"Stage 2 extraction failed (non-fatal): {e}")

    return clear_entities + reclassified
