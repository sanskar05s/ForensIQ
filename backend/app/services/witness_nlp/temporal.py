import re
from datetime import datetime
from typing import Optional

# Accept only valid clock forms. Do not infer a clock from "evening",
# "night", ages, dates, or durations.
_CLOCK_RE = re.compile(
    r"(?<![\w/.-])"
    r"(?P<clock>"
    r"(?:0?[1-9]|1[0-2]):[0-5]\d\s*[ap]\.?m\.?"
    r"|(?:0?[1-9]|1[0-2])\s*[ap]\.?m\.?"
    r"|(?:[01]?\d|2[0-3]):[0-5]\d"
    r")\b",
    re.IGNORECASE,
)

_DATE_RE = re.compile(
    r"\b(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*)?"
    r"(?P<day>\d{1,2})\s+"
    r"(?P<month>January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s*,?\s*(?P<year>\d{4})\b",
    re.IGNORECASE,
)

_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

_RELATIVE_DURATION_RE = re.compile(
    r"\b(?P<qualifier>less than|within|about|approximately|around)?\s*"
    r"(?P<number>\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+"
    r"(?P<unit>seconds?|minutes?|hours?)\s+"
    r"(?P<relation>later|afterwards?)\b",
    re.IGNORECASE,
)


def _normalize_time(raw: str) -> Optional[str]:
    """Return a validated HH:MM value, or None."""
    value = re.sub(r"\.", "", (raw or "").strip().upper())
    for fmt in ("%I:%M %p", "%I:%M%p", "%I %p", "%I%p", "%H:%M"):
        try:
            return datetime.strptime(value, fmt).strftime("%H:%M")
        except ValueError:
            pass
    return None


def _incident_date(text: str) -> Optional[str]:
    match = _DATE_RE.search(text or "")
    if not match:
        return None
    try:
        parsed = datetime.strptime(
            f"{match.group('day')} {match.group('month')} {match.group('year')}",
            "%d %B %Y",
        )
        return parsed.date().isoformat()
    except ValueError:
        return None


def _relative_offset(sentence: str) -> Optional[dict]:
    match = _RELATIVE_DURATION_RE.search(sentence or "")
    if not match:
        return None

    raw_number = match.group("number").lower()
    amount = int(raw_number) if raw_number.isdigit() else _NUMBER_WORDS[raw_number]
    unit = match.group("unit").lower()
    seconds = amount * (3600 if unit.startswith("hour") else
                        60 if unit.startswith("minute") else 1)
    qualifier = (match.group("qualifier") or "").lower()

    # Keep uncertainty as bounds. The midpoint is only an ordering hint.
    if qualifier in {"less than", "within"}:
        lower, upper = 0, seconds
    elif qualifier in {"about", "approximately", "around"}:
        lower, upper = max(0, seconds - 30), seconds + 30
    else:
        lower = upper = seconds

    return {
        "offset_seconds": (lower + upper) // 2,
        "offset_min_seconds": lower,
        "offset_max_seconds": upper,
    }


def extract_temporal_sequence(text: str, entities: list) -> list:
    # Intentionally do not use spaCy TIME entities as clock candidates.
    # The text itself must contain a validated clock or relative event phrase.
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text or "")
        if sentence.strip()
    ]
    event_date = _incident_date(text)
    sequence = []

    for sentence in sentences:
        clock_matches = list(_CLOCK_RE.finditer(sentence))

        if clock_matches:
            for match in clock_matches:
                raw_clock = match.group("clock")
                normalized = _normalize_time(raw_clock)
                if not normalized:
                    continue

                prefix = sentence[max(0, match.start() - 24):match.start()].lower()
                approximate = bool(re.search(
                    r"\b(around|approximately|approx\.?|about|roughly)\s*$",
                    prefix,
                ))

                sequence.append({
                    "event_text": sentence,
                    "relative_order": len(sequence) + 1,
                    "absolute_time": raw_clock,
                    "absolute_time_normalized": normalized,
                    "event_date": event_date,
                    "marker_type": "absolute",
                    "marker_word": None,
                    "temporal_kind": "clock",
                    "time_precision": "approximate" if approximate else "stated",
                })
            continue

        offset = _relative_offset(sentence)
        if offset:
            sequence.append({
                "event_text": sentence,
                "relative_order": len(sequence) + 1,
                "absolute_time": None,
                "absolute_time_normalized": None,
                "event_date": event_date,
                "marker_type": "relative",
                "marker_word": "later",
                "temporal_kind": "relative",
                **offset,
            })

    return sequence
