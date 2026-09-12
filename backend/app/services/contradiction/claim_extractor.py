import re
from typing import List, Dict, Optional
# Matches sentences where the witness describes their own static position.
# "I was inside", "I was outside", "we were inside", "I stood inside"
_SELF_LOCATION_RE = re.compile(
    r'\b(i|we)\s+(?:was|were|am|are|stood|remained|stayed)\b',
    re.IGNORECASE
)
# ── Semantic number classification ────────────────────────────────────────────

# Duration — numbers in these contexts are NOT quantities
_DURATION_RE = re.compile(
    r'\b(second|seconds|minute|minutes|min|mins|hour|hours|'
    r'hr|hrs|day|days|week|weeks|month|months)\b',
    re.IGNORECASE
)

# Location/document identifiers — numbers here are NOT quantities
_IDENTIFIER_RE = re.compile(
    r'\b(road\s+no\.?|nh[-\s]?\d|sh[-\s]?\d|route\s+no\.?|'
    r'highway\s+no\.?|case\s+no\.?|fir\s+no\.?|sr\s+no\.?|'
    r'serial\s+no\.?|vehicle\s+no\.?|flat\s+no\.?|'
    r'plot\s+no\.?|house\s+no\.?|door\s+no\.?|'
    r'section\s+\d|article\s+\d|chapter\s+\d|phase\s+\d)|'
    # Vehicle plates: two letters + digits + letters + digits
    r'\b[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}\b',
    re.IGNORECASE
)

# Actor counts — people, criminals, officers: valid quantities
_ACTOR_COUNT_RE = re.compile(
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
    r'(armed|masked|accused|'
    r'men|women|persons?|people|individuals?|'
    r'suspects?|attackers?|robbers?|assailants?|criminals?|'
    r'thieves?|gunm[ae]n|perpetrators?|offenders?|culprits?|'
    r'hijackers?|muggers?|intruders?|kidnappers?|'
    r'officers?|constables?|policem[ae]n|guards?|soldiers?|'
    r'victims?|bystanders?|passengers?|customers?|employees?|'
    r'workers?|staff|witnesses?|civilians?)\b',
    re.IGNORECASE
)

# Object counts — items, bags, weapons: valid quantities
_OBJECT_COUNT_RE = re.compile(
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
    r'(bags?|sacks?|boxes?|items?|packets?|bundles?|pieces?|'
    r'guns?|weapons?|knives?|pistols?|rifles?|revolvers?|'
    r'phones?|mobiles?|laptops?|tablets?|watches?|'
    r'rings?|chains?|bracelets?|necklaces?|jewels?|'
    r'cash\s+bags?|gold\s+(?:bars?|coins?|biscuits?)|'
    r'currency\s+notes?|bundles?\s+of\s+cash)\b',
    re.IGNORECASE
)

# Vehicle counts — valid quantities
_VEHICLE_COUNT_RE = re.compile(
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
    r'(cars?|vehicles?|motorcycles?|motorbikes?|bikes?|scooters?|'
    r'vans?|trucks?|lorr(?:y|ies)|auto(?:rickshaws?)?|'
    r'taxis?|cabs?|jeeps?|buses?)\b',
    re.IGNORECASE
)

# Convert word-numbers to integers for comparison
_WORD_TO_INT = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
}

def _normalize_count(value: str) -> Optional[int]:
    v = value.lower().strip()
    if v in _WORD_TO_INT:
        return _WORD_TO_INT[v]
    try:
        return int(v)
    except ValueError:
        return None

# Time patterns used specifically for masking before quantity extraction.
# More aggressive than TIME_PATTERNS — catches partial forms like "7:10" and "7 PM".
QUANTITY_TIME_MASK = [
    r'\b\d{1,2}:\d{2}\s*(?:am|pm)?\b',          # 7:10 PM, 14:00, 7:10
    r'\b\d{1,2}\s*(?:am|pm)\b',                   # 7pm, 11 AM
    r'\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b', # at 7:10, at 7 PM
]

# Noun prefixes that indicate a number is a label/identifier, not a count.
LOCATION_NUMBER_PREFIXES = [
    'room', 'gate', 'highway', 'floor', 'level', 'exit',
    'platform', 'apartment', 'unit', 'suite', 'sector',
    'block', 'lane', 'avenue', 'route', 'district',
]
# Time patterns — ordered from most specific to least
TIME_PATTERNS = [
    r'\b\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?\b',       # 9:30 PM, 14:00
    r'\b\d{1,2}\s*(?:am|pm|AM|PM)\b',                # 9pm, 11 AM
    r'\b(?:midnight|noon)\b',
    r'\b(?:early\s+morning|late\s+night|late\s+evening)\b',
    r'\b(?:morning|afternoon|evening|night)\b',
]

COLOR_WORDS = [
    'red', 'blue', 'green', 'black', 'white', 'grey', 'gray',
    'yellow', 'orange', 'purple', 'pink', 'brown', 'silver', 'gold', 'dark', 'light'
]

DIRECTION_WORDS = [
    'north', 'south', 'east', 'west',
    'left', 'right', 'up', 'down',
    'towards', 'away from', 'forward', 'backward',
    'upstairs', 'downstairs', 'outside', 'inside',
    'away',
]

NUMBER_WORDS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
}


def split_into_sentences(text: str) -> List[str]:
    """Splits text into sentences on . ! ? boundaries."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]


def extract_time_claims(text: str) -> List[Dict]:
    """
    Returns list of {sentence, time_value, normalized} for sentences
    containing time expressions.
    """
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()
        for pattern in TIME_PATTERNS:
            match = re.search(pattern, lower)
            if match:
                claims.append({
                    "sentence": sentence,
                    "extracted_value": match.group(0).strip(),
                    "claim_type": "time"
                })
                break  # one time claim per sentence
    return claims


def _parse_time_to_hours(time_str: str) -> Optional[float]:
    """
    Converts time string to decimal hours for minute-aware comparison.
    "8:30 PM"  → 20.5
    "8:10 PM"  → 20.167
    "9 AM"     → 9.0
    "midnight" → 0.0
    Returns None if unparseable.
    """
    if not time_str:
        return None
    lower = time_str.lower().strip()

    # Word-based times → exact decimal hours
    WORD_HOURS = {
        'midnight': 0.0,  'noon': 12.0, 'midday': 12.0,
        'morning':  8.0,  'afternoon': 14.0,
        'evening':  19.0, 'night': 21.0,
    }
    for word, val in WORD_HOURS.items():
        if word in lower:
            return val

    # Ambiguous time without AM/PM — skip to avoid false positives
    has_ampm = 'am' in lower or 'pm' in lower
    has_24h = bool(re.search(r'\b([01]?\d|2[0-3]):\d{2}\b', lower))
    if not has_ampm and not has_24h:
        return None

    # HH:MM AM/PM
    m = re.search(r'(\d{1,2}):(\d{2})\s*(am|pm)', lower)
    if m:
        h, minute = int(m.group(1)), int(m.group(2))
        am_pm = m.group(3)
        if am_pm == 'pm' and h != 12:
            h += 12
        elif am_pm == 'am' and h == 12:
            h = 0
        return h + minute / 60.0

    # HH:MM 24-hour
    m = re.search(r'\b([01]?\d|2[0-3]):(\d{2})\b', lower)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 60.0

    # H AM/PM only (no minutes)
    m = re.search(r'(\d{1,2})\s*(am|pm)', lower)
    if m:
        h = int(m.group(1))
        am_pm = m.group(2)
        if am_pm == 'pm' and h != 12:
            h += 12
        elif am_pm == 'am' and h == 12:
            h = 0
        return float(h)

    return None


def _extract_color_context(sentence: str, color: str) -> str:
    """
    Extracts what object a color describes in a sentence.
    Handles both:
      - Forward: "a black car"  → "car"
      - Backward: "the car was black" → "car"
    """
    lower = sentence.lower()
    idx = lower.find(color)
    if idx == -1:
        return ""

    # Forward: word immediately after color
    after = lower[idx + len(color):].strip().split()
    if after:
        candidate = after[0].rstrip(".,;:!?")
        if candidate in {"colored", "coloured"} and len(after) > 1:
            candidate = after[1].rstrip(".,;:!?")
        if len(candidate) > 2 and candidate not in {"a", "an", "the", "and", "or"}:
            return candidate

    # Backward: last noun before color (for "the car was black" syntax)
    before = lower[:idx].strip().split()
    for word in reversed(before[-4:]):   # look back at most 4 words
        word = word.rstrip(".,;:!?")
        if len(word) > 2 and word not in {
            "a", "an", "the", "was", "is", "were", "are", "had", "has", "and", "or", "it",
            "clearly", "obviously", "definitely", "apparently", "very", "quite", "really",
            "mostly", "partially", "so", "too"
        }:
            return word

    return ""


def extract_color_claims(text: str) -> List[Dict]:
    """
    Returns list of {sentence, color, context} for sentences
    containing color + nearby noun.
    """
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()
        for color in COLOR_WORDS:
            pattern = rf'\b{re.escape(color)}\b'
            if re.search(pattern, lower):
                context = _extract_color_context(sentence, color)
                claims.append({
                    "sentence": sentence,
                    "extracted_value": color,
                    "context": context,
                    "claim_type": "color"
                })
                break
    return claims



def extract_quantity_claims(text: str) -> List[Dict]:
    """
    Extracts count-based claims from witness statement text.

    ONLY produces claims for:
      actor_count    — number of people (suspects, victims, officers)
      object_count   — number of items (bags, weapons, phones)
      vehicle_count  — number of vehicles

    NEVER produces claims for:
      duration       — "five minutes later", "two hours ago"
      identifier     — "Road No. 36", "NH48", "TS08EF5678"
      timestamp      — already masked, but belt-and-suspenders
      bare numbers   — lone digits with no surrounding entity context

    This prevents duration values like "5 minutes" from being
    compared against actor counts like "2 suspects".
    """
    claims = []

    for sentence in split_into_sentences(text):
        lower = sentence.lower()

        # Gate 1: Skip sentences that are primarily about identifiers
        if _IDENTIFIER_RE.search(sentence):
            continue

        # Gate 2: Check for actor count first (highest priority)
        actor_m = _ACTOR_COUNT_RE.search(lower)
        if actor_m:
            claims.append({
                "sentence": sentence,
                "extracted_value": actor_m.group(1).strip(),
                "semantic_type": "actor_count",
                "claim_type": "quantity",
            })
            continue   # Don't also check for object/vehicle in same sentence

        # Gate 3: Skip duration sentences AFTER checking actor count
        # (handles "two suspects fled five minutes later" — actor extracted above)
        if _DURATION_RE.search(lower):
            continue

        # Gate 4: Object count
        obj_m = _OBJECT_COUNT_RE.search(lower)
        if obj_m:
            claims.append({
                "sentence": sentence,
                "extracted_value": obj_m.group(1).strip(),
                "semantic_type": "object_count",
                "claim_type": "quantity",
            })
            continue

        # Gate 5: Vehicle count
        veh_m = _VEHICLE_COUNT_RE.search(lower)
        if veh_m:
            claims.append({
                "sentence": sentence,
                "extracted_value": veh_m.group(1).strip(),
                "semantic_type": "vehicle_count",
                "claim_type": "quantity",
            })

    return claims

def extract_direction_claims(text: str) -> List[Dict]:
    """
    Returns sentences containing directional expressions.
    Adds is_self_location flag to distinguish:
    - "I was inside the store" (witness position — should NOT trigger contradiction)
    - "the suspect ran inside" (subject movement — CAN trigger contradiction)
    """
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()
        for direction in sorted(DIRECTION_WORDS, key=len, reverse=True):
            if re.search(rf'\b{re.escape(direction)}\b', lower):
                # Flag self-location: witness describing their own static position.
                is_self_location = bool(_SELF_LOCATION_RE.search(lower))
                claims.append({
                    "sentence": sentence,
                    "extracted_value": direction,
                    "claim_type": "direction",
                    "is_self_location": is_self_location
                })
                break
    return claims


def extract_all_claims(text: str) -> Dict[str, List[Dict]]:
    """
    Extracts all claim types from statement text.
    Returns {time: [...], color: [...], quantity: [...], direction: [...]}
    """
    return {
        "time":      extract_time_claims(text),
        "color":     extract_color_claims(text),
        "quantity":  extract_quantity_claims(text),
        "direction": extract_direction_claims(text),
    }
