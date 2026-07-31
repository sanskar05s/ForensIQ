import re
from typing import List, Dict, Optional
from app.services.contradiction.claim_extractor import extract_all_claims, _normalize_count

# Opposite direction pairs
OPPOSITE_DIRECTIONS = {
    frozenset(['north', 'south']),
    frozenset(['east', 'west']),
    frozenset(['left', 'right']),
    frozenset(['up', 'down']),
    frozenset(['forward', 'backward']),
    frozenset(['upstairs', 'downstairs']),
    frozenset(['inside', 'outside']),
}

# Time normalization map
TIME_NORMALIZATION = {
    'midnight': 0,
    'morning': 9,
    'noon': 12,
    'afternoon': 14,
    'evening': 18,
    'night': 21,
    'late night': 23,
    'early morning': 6,
    'late evening': 20,
}


def normalize_time_value(time_str: str) -> Optional[int]:
    """
    Converts a time string to an hour integer (0-23).
    Returns None if cannot normalize.
    """
    lower = time_str.lower().strip()

    # Check word-based times
    for key, hour in TIME_NORMALIZATION.items():
        if key in lower:
            return hour

    # Parse HH:MM or HH am/pm formats
    match_colon = re.search(r'(\d{1,2}):(\d{2})\s*(am|pm)?', lower)
    if match_colon:
        hour = int(match_colon.group(1))
        am_pm = match_colon.group(3)
        if am_pm == 'pm' and hour != 12:
            hour += 12
        elif am_pm == 'am' and hour == 12:
            hour = 0
        return hour

    match_simple = re.search(r'(\d{1,2})\s*(am|pm)', lower)
    if match_simple:
        hour = int(match_simple.group(1))
        am_pm = match_simple.group(2)
        if am_pm == 'pm' and hour != 12:
            hour += 12
        elif am_pm == 'am' and hour == 12:
            hour = 0
        return hour

    return None


def check_time_contradiction(claims_a: List[Dict],
                              claims_b: List[Dict]) -> Optional[Dict]:
    """
    Compares time claims from two statements.
    Flags if normalized times differ by more than 60 minutes.
    """
    for ca in claims_a:
        for cb in claims_b:
            hour_a = normalize_time_value(ca["extracted_value"])
            hour_b = normalize_time_value(cb["extracted_value"])
            if hour_a is not None and hour_b is not None:
                diff = abs(hour_a - hour_b)
                if diff > 1:  # more than 1 hour difference
                    severity = "HIGH" if diff > 3 else "MEDIUM"
                    return {
                        "type": "time",
                        "tier": 1,
                        "claim_a": ca["sentence"],
                        "claim_b": cb["sentence"],
                        "severity": severity,
                        "xai_explanation": (
                            f"Rule-based TIME contradiction detected. "
                            f"Witness A references '{ca['extracted_value']}' "
                            f"(~{hour_a}:00), "
                            f"Witness B references '{cb['extracted_value']}' "
                            f"(~{hour_b}:00). "
                            f"Difference: approximately {diff} hour(s) "
                            f"for the same described event."
                        )
                    }
    return None


def check_color_contradiction(claims_a: List[Dict],
                               claims_b: List[Dict]) -> Optional[Dict]:
    """
    Compares color claims. Flags if different colors with same context.
    """
    for ca in claims_a:
        for cb in claims_b:
            color_a = ca["extracted_value"]
            color_b = cb["extracted_value"]
            context_a = ca.get("context", "")
            context_b = cb.get("context", "")
            # Only flag if colors differ AND context words match or overlap
            if color_a != color_b:
                # If both mention the same object (context word), it's a contradiction
                if context_a and context_b and context_a == context_b:
                    return {
                        "type": "color",
                        "tier": 1,
                        "claim_a": ca["sentence"],
                        "claim_b": cb["sentence"],
                        "severity": "HIGH",
                        "xai_explanation": (
                            f"Rule-based COLOR contradiction detected. "
                            f"Witness A describes the {context_a} as '{color_a}'. "
                            f"Witness B describes the {context_b} as '{color_b}'. "
                            f"Different colors reported for the same object."
                        )
                    }
                elif not context_a and not context_b:
                    # No context, still flag but lower severity
                    return {
                        "type": "color",
                        "tier": 1,
                        "claim_a": ca["sentence"],
                        "claim_b": cb["sentence"],
                        "severity": "MEDIUM",
                        "xai_explanation": (
                            f"Rule-based COLOR contradiction detected. "
                            f"Witness A mentions '{color_a}'. "
                            f"Witness B mentions '{color_b}'. "
                            f"Conflicting color descriptions."
                        )
                    }
    return None


def check_quantity_contradiction(claims_a: List[Dict],
                                  claims_b: List[Dict]) -> Optional[Dict]:
    """
    Flags quantity contradictions only between the same semantic type.

    actor_count vs actor_count    ← valid
    object_count vs object_count  ← valid
    vehicle_count vs vehicle_count ← valid
    actor_count vs duration       ← NEVER compared (different types)
    """
    for ca in claims_a:
        for cb in claims_b:

            # Enforce semantic type match — never compare across types
            type_a = ca.get("semantic_type", "unknown")
            type_b = cb.get("semantic_type", "unknown")
            if type_a != type_b:
                continue

            val_a = _normalize_count(ca["extracted_value"])
            val_b = _normalize_count(cb["extracted_value"])

            if val_a is None or val_b is None:
                continue
            if val_a == val_b:
                continue

            diff = abs(val_a - val_b)
            severity = "HIGH" if diff > 1 else "MEDIUM"

            type_labels = {
                "actor_count":   "number of people",
                "object_count":  "number of items",
                "vehicle_count": "number of vehicles",
            }
            label = type_labels.get(type_a, "quantity")

            return {
                "type": "quantity",
                "tier": 1,
                "claim_a": ca["sentence"],
                "claim_b": cb["sentence"],
                "severity": severity,
                "xai_explanation": (
                    f"Rule-based QUANTITY contradiction detected. "
                    f"Witnesses report different {label}. "
                    f"Witness A states: {val_a}. "
                    f"Witness B states: {val_b}. "
                    f"Difference: {diff}."
                )
            }
    return None

def check_direction_contradiction(claims_a: List[Dict],
                                   claims_b: List[Dict]) -> Optional[Dict]:
    """
    Flags directly opposing directional claims.

    Skips pairs where BOTH claims are self-location statements.
    Rationale: "I was inside the store" vs "I was outside the store"
    describes two different witnesses at different locations — not a
    contradiction about the same event or subject.

    Only flags when at least one claim describes a subject's movement
    (not just the witness's own static position).
    """
    for ca in claims_a:
        for cb in claims_b:

            # Skip: both witnesses describing their own static positions.
            if ca.get("is_self_location") and cb.get("is_self_location"):
                continue

            dir_a = ca["extracted_value"]
            dir_b = cb["extracted_value"]

            if frozenset([dir_a, dir_b]) in OPPOSITE_DIRECTIONS:
                return {
                    "type": "direction",
                    "tier": 1,
                    "claim_a": ca["sentence"],
                    "claim_b": cb["sentence"],
                    "severity": "HIGH",
                    "xai_explanation": (
                        f"Rule-based DIRECTION contradiction detected. "
                        f"Witness A states direction '{dir_a}'. "
                        f"Witness B states direction '{dir_b}'. "
                        f"These are directly opposing directions describing "
                        f"the same event or subject."
                    )
                }
    return None

def run_tier1(statement_a: Dict, statement_b: Dict) -> List[Dict]:
    """
    Runs all four Tier 1 rule checks on a pair of witness statements.
    Returns list of detected contradictions (may be empty).

    statement_a and statement_b are full rows from witness_statements table.
    """
    text_a = statement_a["raw_text"]
    text_b = statement_b["raw_text"]

    claims_a = extract_all_claims(text_a)
    claims_b = extract_all_claims(text_b)

    contradictions = []

    checks = [
        (check_time_contradiction,     "time"),
        (check_color_contradiction,    "color"),
        (check_quantity_contradiction, "quantity"),
        (check_direction_contradiction,"direction"),
    ]

    for check_fn, claim_type in checks:
        result = check_fn(
            claims_a.get(claim_type, []),
            claims_b.get(claim_type, [])
        )
        if result:
            result["witness_a_id"] = statement_a["id"]
            result["witness_b_id"] = statement_b["id"]
            contradictions.append(result)

    return contradictions
