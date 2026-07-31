"""
ForensIQ Patch 2.3 — Subject-Attribute-Value Candidate Filter

PURPOSE
=======
Gate before NLI. Two witness statements reach the NLI model only when
they make descriptive claims about the same kind of subject.

CORE PRINCIPLE
==============
Statements can logically contradict only when they describe the SAME
ATTRIBUTE of the SAME SUBJECT with DIFFERENT VALUES.

    "black Scorpio"   (VEHICLE, COLOR=black)
    "white Scorpio"   (VEHICLE, COLOR=white)
    → Shared (VEHICLE, COLOR) → compare ✓

    "Scorpio approaching at 8:11"   (VEHICLE, ACTION=approaching)
    "Scorpio hit pedestrian at 8:12" (VEHICLE, ACTION=collision)
    → No shared DESCRIPTIVE attribute → skip ✓

    "two suspects entered"   (SUSPECT, COUNT=2)
    "three suspects entered"  (SUSPECT, COUNT=3)
    → Shared (SUSPECT, COUNT) → compare ✓

    "ambulance arrived at 8:18"  (EMERGENCY, ACTION=arrival)
    "Scorpio hit victim at 8:12" (VEHICLE, ACTION=collision)
    → No shared (subject, descriptive_attr) → skip ✓

ATTRIBUTE TAXONOMY
==================
DESCRIPTIVE attributes — can have conflicting values, NLI meaningful:
    COLOR       black / white / red / silver ...
    COUNT       number of suspects / victims / vehicles
    DIRECTION   north / south / fled east / escaped west
    APPEARANCE  tall / masked / bearded / armed
    BEHAVIOR    calm / agitated / threatening / cooperative
    CONDITION   conscious / unconscious / injured / armed

ACTION attributes — sequential facts, never contradictions:
    MOVEMENT    approaching, driving, speeding
    COLLISION   hit, struck, rammed, crashed
    ESCAPE      fled, drove away, escaped
    ARRIVAL     arrived, reached, came to
    RESPONSE    treated, attended, reported

SUBJECT TAXONOMY
================
    VEHICLE     car, motorcycle, SUV, van, specific models
    SUSPECT     attacker, robber, gunman, perpetrator, armed man
    VICTIM      pedestrian, customer, employee, injured person
    WEAPON      gun, knife, rod, firearm
    EMERGENCY   ambulance, paramedic, police officer, fire brigade

SUPERSEDES
==========
Patches 2.1 and 2.2 — this file replaces candidate_filter.py entirely.
The call site in contradiction.py is unchanged.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Set
import re


# ── Subject patterns ───────────────────────────────────────────────────────────

_SUBJECTS: dict[str, re.Pattern] = {
    "VEHICLE": re.compile(
        r'\b(car|vehicle|motorcycle|motorbike|scooter|van|truck|lorry|'
        r'suv|sedan|hatchback|cab|taxi|auto|rickshaw|'
        r'scorpio|swift|fortuner|bolero|creta|nexon|brezza|alto|'
        r'dzire|innova|thar|xuv|endeavour|'
        r'hyundai|toyota|maruti|mahindra|honda|ford|'
        r'two.wheeler|four.wheeler)\b', re.I
    ),
    "SUSPECT": re.compile(
        r'\b(suspect|attacker|robber|assailant|perpetrator|accused|'
        r'criminal|thief|gunman|masked man|armed man|'
        r'offender|culprit|hijacker|mugger|intruder)\b', re.I
    ),
    "VICTIM": re.compile(
        r'\b(victim|pedestrian|injured|deceased|patient|'
        r'customer|employee|staff|cashier|guard|manager|'
        r'bystander|witness|civilian)\b', re.I
    ),
    "WEAPON": re.compile(
        r'\b(gun|pistol|rifle|revolver|shotgun|'
        r'knife|blade|machete|sword|dagger|'
        r'rod|bat|stick|lathi|pipe)\b', re.I
    ),
    "EMERGENCY": re.compile(
        r'\b(ambulance|paramedic|emt|first responder|'
        r'fire brigade|fire engine|'
        r'police officer|constable|inspector|'
        r'medical team|hospital staff)\b', re.I
    ),
    "SUSPECT_GEAR": re.compile(
        r'\b(helmet|jacket|shirt|hoodie|mask|gloves|shoes|cap|hat|'
        r'vest|uniform|clothing|outfit|attire|wore|wearing)\b', re.I
    ),
    "MOVING_ENTITY": re.compile(
        r'\b(fled|escaped|ran|drove|sped|rushed|ran away|drove away|'
        r'was going|heading|moving|traveling)\b', re.I
    ),
}

# ── Descriptive attributes (can logically contradict) ─────────────────────────

_DESCRIPTIVE: dict[str, re.Pattern] = {
    "COLOR": re.compile(
        r'\b(red|blue|green|black|white|silver|grey|gray|yellow|'
        r'orange|purple|brown|dark|light|navy|maroon|golden|beige|cream)\b',
        re.I
    ),
    "COUNT": re.compile(
        r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
        r'(suspect|attacker|person|people|man|men|woman|women|'
        r'individual|robber|assailant|masked|armed|gunman|perpetrator)\b',
        re.I
    ),
    "DIRECTION": re.compile(
        r'\b(north|south|east|west|'
        r'left|right|'
        r'towards the|away from|'
        r'uphill|downhill|clockwise|anticlockwise)\b',
        re.I
    ),
    "APPEARANCE": re.compile(
        r'\b(tall|short|fat|thin|slim|stout|heavy|lean|'
        r'bald|bearded|clean.shaven|helmeted|masked|hooded|'
        r'young|old|elderly|middle.aged|'
        r'dark.skinned|fair.skinned|light.complexioned)\b',
        re.I
    ),
    "BEHAVIOR": re.compile(
        r'\b(calm|agitated|panicked|aggressive|violent|'
        r'nervous|confident|threatening|cooperative|'
        r'shouting|silent|speaking|communicating|arguing)\b',
        re.I
    ),
    "CONDITION": re.compile(
        r'\b(conscious|unconscious|injured|uninjured|'
        r'alive|dead|deceased|stable|critical|serious|minor)\b',
        re.I
    ),
    "QUANTITY_ITEMS": re.compile(
        r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
        r'(bag|bags|item|items|bundle|bundles|packet|packets|'
        r'box|boxes|gun|guns|weapon|weapons|vehicle|vehicles)\b',
        re.I
    ),
}

# ── Action attributes (sequential, never NLI candidates alone) ────────────────
# Not used for filtering — listed here for documentation and to ensure
# future modifications don't accidentally promote these to descriptive.

_ACTION_ATTRS = frozenset([
    "MOVEMENT",   # approaching, driving, speeding
    "COLLISION",  # hit, struck, rammed
    "ESCAPE",     # fled, drove away, sped away
    "ARRIVAL",    # arrived, reached, came to
    "RESPONSE",   # treated, attended, investigated
])


# ── SAV pair dataclass ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SAVPair:
    """
    Subject-Attribute pair — the atomic unit of comparison.
    Two statements are NLI candidates when their SAVPair sets overlap.
    """
    subject:   str    # VEHICLE | SUSPECT | VICTIM | WEAPON | EMERGENCY
    attribute: str    # COLOR | COUNT | DIRECTION | APPEARANCE | BEHAVIOR | CONDITION


def _extract_sav_pairs(statement: dict) -> Set[SAVPair]:
    """
    Extracts (subject, descriptive_attribute) pairs from a statement.

    Algorithm:
    1. Identify which subject categories appear in the text.
    2. For each descriptive attribute found, pair it with every subject present.

    Only descriptive attributes produce pairs — action attributes are excluded.
    A statement about "Scorpio approaching" produces no SAV pairs because
    MOVEMENT is an action attribute, not a descriptive one.

    Returns an empty set when the statement contains no descriptive attributes
    (e.g., pure narrative action or administrative statements).
    """
    text = (statement.get("raw_text") or "").strip()
    if not text:
        return set()

    # Step 1: Which subjects are present?
    present_subjects: Set[str] = set()
    for subject_name, pattern in _SUBJECTS.items():
        if pattern.search(text):
            present_subjects.add(subject_name)

    if not present_subjects:
        return set()

    # Step 2: Which descriptive attributes are present?
    present_descriptive: Set[str] = set()
    for attr_name, pattern in _DESCRIPTIVE.items():
        if pattern.search(text):
            present_descriptive.add(attr_name)

    if not present_descriptive:
        return set()

    # Step 3: Cross-product of subjects × descriptive attributes
    pairs: Set[SAVPair] = set()
    for subj in present_subjects:
        for attr in present_descriptive:
            pairs.add(SAVPair(subject=subj, attribute=attr))

    return pairs

def _named_person_overlap(stmt_a: dict, stmt_b: dict) -> bool:
    """
    Returns True when both statements explicitly name the same individual.
    Named persons are specific enough that behavioral or attribute differences
    between the two descriptions warrant NLI comparison.

    Uses Module 3 NER PERSON entities only.
    Generic pronouns (he, she, they) are excluded — they identify no one.
    """
    def _person_names(stmt: dict) -> Set[str]:
        return {
            e["text"].lower().strip()
            for e in (stmt.get("entities") or [])
            if (e.get("type") == "PERSON"
                and len(e.get("text", "").strip()) > 3
                and e["text"].lower().strip() not in {
                    "he", "she", "they", "it", "him", "her", "them",
                    "his", "her", "their", "the man", "the woman"
                })
        }

    names_a = _person_names(stmt_a)
    names_b = _person_names(stmt_b)
    return bool(names_a & names_b)


def should_compare_nli(stmt_a: dict, stmt_b: dict) -> bool:
    """
    Gate before NLI. Returns True only when stmt_a and stmt_b are
    plausible contradiction candidates.

    GATE 1 — SAV pair overlap (primary):
        Both statements describe the same descriptive attribute
        of the same kind of subject.
        "black Scorpio" ↔ "white Scorpio" → (VEHICLE, COLOR) shared → True
        "Scorpio approaching" ↔ "Scorpio hit victim" → no descriptive attr → False

    GATE 2 — Named person overlap (fallback):
        Both statements name the same specific individual.
        Used to catch behavioral/condition contradictions about witnesses.

    Statements failing both gates are sequential observations and
    must not reach NLI.
    """
    # Gate 1 — SAV pairs
    pairs_a = _extract_sav_pairs(stmt_a)
    pairs_b = _extract_sav_pairs(stmt_b)

    if pairs_a and pairs_b and (pairs_a & pairs_b):
        return True

    # Gate 2 — Named person
    if _named_person_overlap(stmt_a, stmt_b):
        return True

    return False
