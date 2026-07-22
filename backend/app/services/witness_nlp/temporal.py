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
    # Build set of time entity strings for quick lookup
    time_entity_texts = {
        e["text"].lower() for e in entities if e["type"] == "TIME"
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
        for time_text in time_entity_texts:
            if time_text in lower:
                absolute_time = time_text
                break

        # Only include if temporally relevant
        if marker_found or absolute_time:
            sequence.append(
                {
                    "event_text": sentence,
                    "relative_order": marker_order,
                    "absolute_time": absolute_time,
                    "marker_type": "relative" if marker_found else "absolute",
                    "marker_word": marker_found,
                }
            )

    # Sort by relative_order to build the sequence
    sequence.sort(key=lambda x: x["relative_order"])

    return sequence
