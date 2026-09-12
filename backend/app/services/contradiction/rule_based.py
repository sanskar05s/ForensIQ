import re
from typing import List, Dict, Optional
from app.services.contradiction.claim_extractor import extract_all_claims, _normalize_count, _parse_time_to_hours

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

# Synonym groups for color context matching.
# If context_a and context_b are in the SAME synonym group,
# treat them as matching even if the exact words differ.
VEHICLE_SYNONYMS = frozenset([
    "car", "vehicle", "van", "truck", "auto", "automobile",
    "motorcycle", "motorbike", "bike", "scooter", "cab", "taxi",
    "suv", "sedan", "hatchback", "lorry", "bus", "jeep",
])
BAG_SYNONYMS = frozenset([
    "bag", "backpack", "sack", "pouch", "luggage", "suitcase",
    "handbag", "purse", "kit",
])
PERSON_SYNONYMS = frozenset([
    "man", "woman", "person", "individual", "suspect", "attacker",
    "robber", "officer", "guard", "victim", "pedestrian",
])


def _synonym_group(word: str) -> Optional[frozenset]:
    w = word.lower().strip()
    if w in VEHICLE_SYNONYMS: return VEHICLE_SYNONYMS
    if w in BAG_SYNONYMS:     return BAG_SYNONYMS
    if w in PERSON_SYNONYMS:  return PERSON_SYNONYMS
    return None


def _contexts_match(ctx_a: str, ctx_b: str) -> bool:
    """True if contexts refer to the same category of subject."""
    if not ctx_a and not ctx_b:
        return True   # both empty → both contextless, compare anyway
    if not ctx_a or not ctx_b:
        return False  # one has context, other doesn't → uncertain
    if ctx_a.lower().strip() == ctx_b.lower().strip():
        return True   # exact match
    # Synonym match
    group_a = _synonym_group(ctx_a)
    group_b = _synonym_group(ctx_b)
    if group_a and group_b and group_a is group_b:
        return True
    return False


# Time normalization map (legacy reference)
TIME_NORMALIZATION = {
    'midnight': 23.99,
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
    val = _parse_time_to_hours(time_str)
    if val is not None:
        return int(val)
    return None


def check_time_contradiction(claims_a: List[Dict],
                              claims_b: List[Dict]) -> Optional[Dict]:
    """
    Detects time contradictions between two witness statements.
    Uses minute-aware decimal hour comparison to catch conflicts
    like "8:10 PM" vs "8:30 PM" (previously both normalized to 20).

    Thresholds:
    - diff > 0.25 hours (15 min) → MEDIUM contradiction
    - diff > 3 hours             → HIGH contradiction
    - diff <= 0.25 hours         → No contradiction (acceptable imprecision)
    """
    for ca in claims_a:
        for cb in claims_b:
            val_a = _parse_time_to_hours(ca.get("extracted_value") or ca.get("sentence", ""))
            if val_a is None and "sentence" in ca:
                val_a = _parse_time_to_hours(ca["sentence"])

            val_b = _parse_time_to_hours(cb.get("extracted_value") or cb.get("sentence", ""))
            if val_b is None and "sentence" in cb:
                val_b = _parse_time_to_hours(cb["sentence"])

            if val_a is None or val_b is None:
                continue

            diff = abs(val_a - val_b)
            # Overnight wrap: 11 PM vs midnight = 1 hour not 23
            if diff > 12:
                diff = 24 - diff

            # Minimum threshold: 15 minutes
            if diff <= 0.25:
                continue

            severity = "HIGH" if diff > 3 else "MEDIUM"
            diff_minutes = int(round(diff * 60))
            diff_display = (
                f"{diff:.1f} hour(s)" if diff >= 1
                else f"{diff_minutes} minute(s)"
            )

            # Confidence scales with diff magnitude
            if diff > 6:
                confidence = 0.95
            elif diff > 3:
                confidence = 0.90
            elif diff > 1:
                confidence = 0.82
            else:  # 15min - 1h
                confidence = 0.72

            return {
                "type":           "time",
                "tier":           1,
                "claim_a":        ca["sentence"],
                "claim_b":        cb["sentence"],
                "severity":       severity,
                "confidence":     confidence,
                "nli_confidence": confidence,
                "xai_explanation": (
                    f"Rule-based TIME contradiction detected. "
                    f"Witness A references approximately {val_a:.2f}h, "
                    f"Witness B references approximately {val_b:.2f}h. "
                    f"Difference: approximately {diff_display} for the same described event."
                ),
            }
    return None


def check_color_contradiction(claims_a: List[Dict],
                               claims_b: List[Dict]) -> Optional[Dict]:
    """
    Compares color claims. Flags if different colors with same context or matching synonym context.
    """
    for ca in claims_a:
        for cb in claims_b:
            color_a = ca["extracted_value"]
            color_b = cb["extracted_value"]
            context_a = ca.get("context", "")
            context_b = cb.get("context", "")
            # Only flag if colors differ AND contexts match (exact or synonym)
            if color_a != color_b:
                if _contexts_match(context_a, context_b):
                    severity = "HIGH" if (context_a and context_b) else "MEDIUM"
                    target_a = f"the {context_a}" if context_a else "the object"
                    target_b = f"the {context_b}" if context_b else "the object"
                    is_exact = bool(context_a and context_b and context_a.lower().strip() == context_b.lower().strip())
                    confidence = 0.93 if is_exact else 0.80
                    return {
                        "type":           "color",
                        "tier":           1,
                        "claim_a":        ca["sentence"],
                        "claim_b":        cb["sentence"],
                        "severity":       severity,
                        "confidence":     confidence,
                        "nli_confidence": confidence,
                        "xai_explanation": (
                            f"Rule-based COLOR contradiction detected. "
                            f"Witness A describes {target_a} as '{color_a}'. "
                            f"Witness B describes {target_b} as '{color_b}'. "
                            f"Different colors reported for the same object."
                        )
                    }
    return None


def check_quantity_contradiction(claims_a: List[Dict],
                                  claims_b: List[Dict]) -> Optional[Dict]:
    """
    Flags quantity contradictions only between the same semantic type.

    actor_count vs actor_count    ← valid
    police_count vs police_count  ← valid
    suspect_count vs suspect_count← valid
    victim_count vs victim_count  ← valid
    object_count vs object_count  ← valid
    vehicle_count vs vehicle_count ← valid
    police_count vs suspect_count ← NEVER compared (different roles)
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
            confidence = 0.92 if diff > 1 else 0.78

            type_labels = {
                "police_count":  "number of police officers",
                "suspect_count": "number of suspects",
                "victim_count":  "number of victims",
                "actor_count":   "number of people",
                "object_count":  "number of items",
                "vehicle_count": "number of vehicles",
            }
            label = type_labels.get(type_a, "quantity")

            return {
                "type":           "quantity",
                "tier":           1,
                "claim_a":        ca["sentence"],
                "claim_b":        cb["sentence"],
                "severity":       severity,
                "confidence":     confidence,
                "nli_confidence": confidence,
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
                confidence = 0.88
                return {
                    "type":           "direction",
                    "tier":           1,
                    "claim_a":        ca["sentence"],
                    "claim_b":        cb["sentence"],
                    "severity":       "HIGH",
                    "confidence":     confidence,
                    "nli_confidence": confidence,
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
