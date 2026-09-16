"""
ForensIQ Canonical Event Taxonomy

Central, zero-dependency taxonomy of canonical incident and crime event types.
Used by Timeline Generation and Contradiction Detection to classify event descriptions
and prevent cross-module circular dependencies.
"""

from typing import Dict, Set
import re

EVENT_TAXONOMY: Dict[str, str] = {
    # Collision / Accident
    "vehicle struck":      "collision", "vehicle hit":        "collision",
    "knocked down":        "collision", "ran over":           "collision",
    "collision":           "collision", "collided":           "collision",
    "crashed into":        "collision", "crash":              "collision",
    "struck":              "collision", "smashed":            "collision",
    "impact":              "collision", "accident":           "collision",
    "ramming":             "collision", "hit":                "collision",

    # Robbery / Theft
    "armed robbery":       "robbery",   "broke in":           "robbery",
    "demanded money":      "robbery",   "robbery":            "robbery",
    "robbed":              "robbery",   "theft":              "robbery",
    "stolen":              "robbery",   "looting":            "robbery",
    "heist":               "robbery",   "snatched":           "robbery",
    "burglary":            "robbery",   "raided":             "robbery",
    "grabbed":             "robbery",

    # Shooting
    "opened fire":         "shooting",  "gunshot":            "shooting",
    "shooting":            "shooting",  "fired":              "shooting",
    "gunfire":             "shooting",  "shot":               "shooting",

    # Stabbing
    "knife attack":        "stabbing",  "stabbing":           "stabbing",
    "stabbed":             "stabbing",  "slashed":            "stabbing",

    # Escape / Flight
    "left the scene":      "escape",    "drove away":         "escape",
    "sped away":           "escape",    "speeds away":        "escape",
    "speed away":          "escape",    "rode away":          "escape",
    "ran away":            "escape",    "ran off":            "escape",
    "drove off":           "escape",    "raced away":         "escape",
    "rushed away":         "escape",    "took off":           "escape",
    "fled the scene":      "escape",    "escape":             "escape",
    "escaped":             "escape",    "escaping":           "escape",
    "fled":                "escape",    "fleeing":            "escape",
    "absconded":           "escape",    "motorcycles left":   "escape",
    "vehicle fled":        "escape",    "driven off":         "escape",

    # Assault / Fight
    "altercation":         "assault",   "brawl":              "assault",
    "fight":               "assault",   "assault":            "assault",
    "attacked":            "assault",   "beating":            "assault",

    # Explosion / Fire
    "explosion":           "explosion", "blast":              "explosion",
    "detonated":           "explosion", "bomb":               "explosion",
    "caught fire":         "fire",      "fire":               "fire",
    "flames":              "fire",      "blaze":              "fire",
    "burning":             "fire",      "arson":              "fire",

    # Shouting / Disturbance
    "screaming":           "disturbance", "screamed":         "disturbance",
    "shouting":            "disturbance", "shouted":          "disturbance",
    "yelling":             "disturbance", "commotion":        "disturbance",
    "alarm":               "disturbance", "noise":            "disturbance",
    "loud noise":          "disturbance",

    # Emergency Response
    "ambulance arrived":   "emergency", "police arrived":     "emergency",
    "ambulance":           "emergency", "paramedics":         "emergency",
    "first responders":    "emergency", "emergency":          "emergency",
    "rescue":              "emergency",

    # Arrival / Entry
    "arrived at":          "arrival",   "pulled up":          "arrival",
    "arrived":             "arrival",   "approached":         "arrival",
    "entered":             "arrival",   "appeared":           "arrival",
    "came to":             "arrival",

    # Supervision / Duty
    "supervision":         "supervision",
    "supervising":         "supervision",
    "school group":        "supervision",

    # Cyber
    "data breach":         "breach",    "hacked":             "breach",
    "ransomware":          "breach",    "phishing":           "breach",
    "breach":              "breach",    "malware":            "breach",

    # Generic Incident
    "withdrawing cash":    "incident",
    "incident":            "incident",  "occurred":           "incident",
    "happened":            "incident",  "took place":         "incident",
}

# Pre-sorted longest -> shortest for greedy matching
_TAXONOMY_KEYS = sorted(EVENT_TAXONOMY.keys(), key=len, reverse=True)


def get_event_types(text: str) -> Set[str]:
    """Returns the set of canonical event types present in text."""
    if not text:
        return set()
    result: Set[str] = set()
    lower = text.lower()
    for surface in _TAXONOMY_KEYS:
        if surface in lower:
            result.add(EVENT_TAXONOMY[surface])
    return result
