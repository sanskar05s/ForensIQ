import re
from datetime import datetime
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

# Police / authority role
_POLICE_COUNT_RE = re.compile(
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
    r'(?:police\s+)?'
    r'(officers?|constables?|policem[ae]n|cops?|detectives?|'
    r'inspectors?|guards?|soldiers?|troopers?)\b',
    re.IGNORECASE
)

# Suspect / criminal role
_SUSPECT_COUNT_RE = re.compile(
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
    r'(suspects?|attackers?|robbers?|criminals?|thieves?|gunm[ae]n|'
    r'perpetrators?|offenders?|culprits?|intruders?|assailants?|'
    r'masked\s+men?|armed\s+men?)\b',
    re.IGNORECASE
)

# Victim role
_VICTIM_COUNT_RE = re.compile(
    r'\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+'
    r'(victims?|injured|casualties|hostages?|patients?)\b',
    re.IGNORECASE
)

# Generic actor counts — fallback when specific role is unknown
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
# Time patterns — restricted strictly to valid clock values
TIME_PATTERNS = [
    r"\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*[ap]\.?m\.?\b",
    r"\b(?:0?[1-9]|1[0-2])\s*[ap]\.?m\.?\b",
    r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b",
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
    Returns None for broad periods and invalid clock values.
    """
    if not time_str:
        return None

    cleaned = re.sub(r"\.", "", time_str.strip().upper())
    for pattern, fmt in [
        (r"(?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M", "%I:%M %p"),
        (r"(?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M", "%I:%M%p"),
        (r"(?:0?[1-9]|1[0-2])\s*[AP]M", "%I %p"),
        (r"(?:0?[1-9]|1[0-2])\s*[AP]M", "%I%p"),
        (r"(?:[01]?\d|2[0-3]):[0-5]\d", "%H:%M"),
    ]:
        m = re.search(pattern, cleaned)
        if m:
            val = m.group(0).strip()
            val_norm = re.sub(r"\s+", " ", val)
            for f in (fmt, fmt.replace(" ", "")):
                try:
                    dt = datetime.strptime(val_norm, f)
                    return dt.hour + dt.minute / 60.0
                except ValueError:
                    pass
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

        # Gate 2: Check for role-specific actor count first (more precise)
        role_matched = False
        for role_pattern, role_type in [
            (_POLICE_COUNT_RE,  "police_count"),
            (_SUSPECT_COUNT_RE, "suspect_count"),
            (_VICTIM_COUNT_RE,  "victim_count"),
        ]:
            role_m = role_pattern.search(lower)
            if role_m:
                claims.append({
                    "sentence":        sentence,
                    "extracted_value": role_m.group(1).strip(),
                    "semantic_type":   role_type,
                    "claim_type":      "quantity",
                })
                role_matched = True
                break

        if role_matched:
            continue

        # Fall back to generic actor_count only if no role match
        actor_m = _ACTOR_COUNT_RE.search(lower)
        if actor_m:
            claims.append({
                "sentence":        sentence,
                "extracted_value": actor_m.group(1).strip(),
                "semantic_type":   "actor_count",
                "claim_type":      "quantity",
            })
            continue

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

_DIRECTION_TARGET_RE = re.compile(
    r"\b(?:left|right)\s+(?:\w+\s+){0,2}"
    r"(hand|arm|leg|foot|pocket|sidewalk|lane|side|door|entrance|"
    r"window|counter|street|road|vehicle|car)\b",
    re.IGNORECASE,
)

_MOVEMENT_RE = re.compile(
    r"\b(walk(?:ed|ing)?|run(?:ning)?|ran|head(?:ed|ing)?|"
    r"travel(?:ed|ling)?|mov(?:ed|ing))\b",
    re.IGNORECASE,
)


def _direction_context(sentence: str, direction: str) -> Optional[str]:
    lower = sentence.lower()
    matches = list(re.finditer(rf"\b{re.escape(direction)}\b", lower))
    if not matches:
        return None

    for match in matches:
        start, end = match.span()
        after = lower[end:end + 24]

        # "Right before/after" is temporal language, not direction.
        if direction in {"left", "right"} and re.match(
            r"\s+(before|after|away|now)\b", after
        ):
            continue

        if direction in {"left", "right"}:
            target = _DIRECTION_TARGET_RE.search(sentence[max(0, start - 4):])
            if target and target.start() <= 4:
                return f"object:{target.group(1).lower()}"

            before = lower[max(0, start - 30):start]
            if re.search(r"\bturn(?:ed|s|ing)?\s*$", before):
                return "action:turn"
            continue

        # Cardinal directions only count when attached to movement.
        nearby = lower[max(0, start - 50):min(len(lower), end + 30)]
        if _MOVEMENT_RE.search(nearby):
            return "action:travel"

    return None


def extract_direction_claims(text: str) -> List[Dict]:
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()
        is_self_location = bool(_SELF_LOCATION_RE.search(lower))

        for direction in sorted(DIRECTION_WORDS, key=len, reverse=True):
            if not re.search(rf"\b{re.escape(direction)}\b", lower):
                continue

            context = _direction_context(sentence, direction)
            if not context:
                continue

            claims.append({
                "sentence": sentence,
                "extracted_value": direction,
                "claim_type": "direction",
                "is_self_location": is_self_location,
                "context": context,
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
