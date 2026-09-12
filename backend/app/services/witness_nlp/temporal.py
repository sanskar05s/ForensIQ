from typing import Optional
import re

# Relative temporal markers mapped to ordering hints
# Lower number = earlier in sequence
RELATIVE_MARKERS = {
    "first": 1,
    "initially": 1,
    "to begin with": 1,
    "at first": 1,
    "before": 2,
    "prior to": 2,
    "earlier": 2,
    "previously": 2,
    "then": 5,
    "next": 5,
    "after that": 6,
    "after": 6,
    "afterwards": 6,
    "later": 7,
    "subsequently": 7,
    "following that": 7,
    "finally": 9,
    "eventually": 9,
    "at last": 9,
    "meanwhile": 5,
    "at the same time": 5,
    "simultaneously": 5,
    "at that point": 5,
}

_TIME_PATTERNS = [
    # HH:MM AM/PM
    (re.compile(r'\b(\d{1,2}):(\d{2})\s*(am|pm)\b', re.I),
     lambda m: (int(m.group(1)) % 12 + (12 if m.group(3).lower() == 'pm' else 0),
                int(m.group(2)))),
    # H AM/PM (no minutes)
    (re.compile(r'\b(\d{1,2})\s*(am|pm)\b', re.I),
     lambda m: (int(m.group(1)) % 12 + (12 if m.group(2).lower() == 'pm' else 0),
                0)),
    # HH:MM 24-hour
    (re.compile(r'\b([01]?\d|2[0-3]):([0-5]\d)\b'),
     lambda m: (int(m.group(1)), int(m.group(2)))),
]

_WORD_TIMES = {
    "midnight":   "00:00",
    "noon":       "12:00",
    "midday":     "12:00",
    "morning":    "08:00",
    "afternoon":  "14:00",
    "evening":    "19:00",
    "night":      "21:00",
}


def _normalize_time(raw: str) -> Optional[str]:
    """
    Converts a raw time string to normalized 24-hour HH:MM format.
    Returns None if no parseable time found.

    Examples:
        "8:30 PM"      → "20:30"
        "9 AM"         → "09:00"
        "midnight"     → "00:00"
        "around 9 PM"  → "21:00"
        "21:15"        → "21:15"
    """
    if not raw:
        return None

    lower = raw.lower().strip()

    # Word-based times
    for word, normalized in _WORD_TIMES.items():
        if word in lower:
            return normalized

    # Regex-based times
    for pattern, extractor in _TIME_PATTERNS:
        m = pattern.search(lower)
        if m:
            try:
                h, minute = extractor(m)
                h = max(0, min(23, h))
                minute = max(0, min(59, minute))
                return f"{h:02d}:{minute:02d}"
            except (ValueError, TypeError):
                continue

    return None


def _marker_in_text(marker: str, text: str) -> bool:
    """
    Uses whole-word regex matching to avoid false substring matches.
    e.g. 'after' must not match inside 'aftermath' or 'thereafter'.
    """
    pattern = rf"\b{re.escape(marker)}\b"
    return bool(re.search(pattern, text))


def extract_temporal_sequence(text: str, entities: list) -> list:
    """
    Builds a relative event sequence from witness statement text.

    Strategy:
    1. Split text into sentences
    2. For each sentence, check for relative temporal markers
    3. Also check whether the sentence contains a TIME/DATE entity
    4. Include sentence in sequence if it has either
    5. Sort by relative_order

    Returns list of:
    {event_text, relative_order, absolute_time, marker_type, marker_word}
    """
    # Build mapping of time entity strings for quick lookup (preserving original casing)
    time_entity_map = {
        e["text"].lower(): e["text"] for e in entities if e.get("type") == "TIME"
    }

    # Split into sentences on . ! ? — preserve non-empty sentences
    sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?])\s+", text)
        if s.strip()
    ]

    sequence = []

    for i, sentence in enumerate(sentences):
        lower = sentence.lower()
        marker_found = None
        marker_order = i + 10  # default: sentence position after explicit markers

        # Check for relative markers using whole-word matching
        # (longest marker first to avoid partial matches)
        for marker in sorted(
            RELATIVE_MARKERS.keys(), key=len, reverse=True
        ):
            if _marker_in_text(marker, lower):
                marker_found = marker
                marker_order = RELATIVE_MARKERS[marker]
                break

        # Check for time entities in this sentence
        absolute_time = None
        for time_key, original_time in time_entity_map.items():
            if time_key in lower:
                absolute_time = original_time
                break

        # Fallback check if time pattern exists in sentence
        if not absolute_time:
            for pattern, _ in _TIME_PATTERNS:
                m = pattern.search(sentence)
                if m:
                    absolute_time = m.group(0)
                    break
            if not absolute_time:
                for word in _WORD_TIMES:
                    if _marker_in_text(word, lower):
                        absolute_time = word
                        break

        # Only include if temporally relevant
        if marker_found or absolute_time:
            normalized = _normalize_time(absolute_time) if absolute_time else None
            sequence.append(
                {
                    "event_text": sentence,
                    "relative_order": marker_order,
                    "absolute_time": absolute_time,
                    "absolute_time_normalized": normalized,
                    "marker_type": "absolute" if absolute_time else "relative",
                    "marker_word": marker_found,
                }
            )

    # Sort by relative_order to build the sequence
    sequence.sort(key=lambda x: x["relative_order"])

    return sequence
