import re
from typing import List, Dict

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
    'upstairs', 'downstairs', 'outside', 'inside'
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


def extract_color_claims(text: str) -> List[Dict]:
    """
    Returns list of {sentence, color, context_word} for sentences
    containing color + nearby noun.
    """
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()
        for color in COLOR_WORDS:
            pattern = rf'\b{re.escape(color)}\b'
            if re.search(pattern, lower):
                # Extract the word immediately after the color as context
                match = re.search(rf'\b{re.escape(color)}\s+(\w+)', lower)
                context = match.group(1) if match else ""
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
    Returns sentences containing numeric quantities.
    Extracts both digit numbers and word numbers.
    """
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()

        # Check digit numbers
        digit_match = re.search(r'\b(\d+)\b', lower)
        if digit_match:
            claims.append({
                "sentence": sentence,
                "extracted_value": digit_match.group(1),
                "claim_type": "quantity"
            })
            continue

        # Check word numbers
        for word, num in NUMBER_WORDS.items():
            if re.search(rf'\b{word}\b', lower):
                claims.append({
                    "sentence": sentence,
                    "extracted_value": str(num),
                    "claim_type": "quantity"
                })
                break
    return claims


def extract_direction_claims(text: str) -> List[Dict]:
    """Returns sentences containing directional expressions."""
    claims = []
    for sentence in split_into_sentences(text):
        lower = sentence.lower()
        for direction in sorted(DIRECTION_WORDS, key=len, reverse=True):
            if re.search(rf'\b{re.escape(direction)}\b', lower):
                claims.append({
                    "sentence": sentence,
                    "extracted_value": direction,
                    "claim_type": "direction"
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
