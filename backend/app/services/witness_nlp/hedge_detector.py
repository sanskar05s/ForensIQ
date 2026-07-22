# Ordered from most specific to least specific
HEDGE_PHRASES = [
    "i'm not 100% sure",
    "i am not 100% sure",
    "as far as i can remember",
    "as far as i remember",
    "if i recall correctly",
    "if i recall",
    "i could be wrong",
    "i'm not certain",
    "i am not certain",
    "i'm not sure",
    "i am not sure",
    "i don't know exactly",
    "i think",
    "i believe",
    "i suppose",
    "i guess",
    "it seemed like",
    "it looked like",
    "it appeared",
    "maybe",
    "perhaps",
    "possibly",
    "probably",
    "might have",
    "could have",
    "may have",
    "approximately",
    "around",
    "roughly",
    "sort of",
    "kind of",
    "something like",
    "more or less",
]


def detect_hedge_markers(text: str) -> dict:
    """
    Counts uncertainty and hedge markers in a witness statement.

    Returns:
    {
        hedge_marker_count: int,
        hedge_words_found: [list of matched phrases],
        high_uncertainty: bool,  (True if count >= 3)
        xai_reason: str
    }
    """
    lower = text.lower()
    found = []

    for phrase in HEDGE_PHRASES:
        if phrase in lower:
            found.append(phrase)

    count = len(found)
    high_uncertainty = count >= 3

    if found:
        xai_reason = (
            f"{count} uncertainty marker(s) detected: "
            f"{', '.join([repr(f) for f in found[:5]])}."
            f"{' High uncertainty — investigator attention recommended.' if high_uncertainty else ''}"
        )
    else:
        xai_reason = "No uncertainty markers detected in this statement."

    return {
        "hedge_marker_count": count,
        "hedge_words_found": found,
        "high_uncertainty": high_uncertainty,
        "xai_reason": xai_reason,
    }
