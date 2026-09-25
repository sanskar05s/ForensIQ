import re
import spacy
import logging
from threading import Lock

logger = logging.getLogger(__name__)

_AGE_ENTITY_RE = re.compile(
    r"^(?:(?:early|mid|late)[ -]?)?\d{2}s$|^\d{1,2}\s+years?\s+old$",
    re.IGNORECASE,
)

_nlp = None
_nlp_lock = Lock()
_inference_lock = Lock()

# Maps spaCy entity labels to our simplified 5-type system
LABEL_MAP = {
    "PERSON": "PERSON",
    "GPE": "LOCATION",
    "LOC": "LOCATION",
    "FAC": "LOCATION",
    "TIME": "TIME",
    "DATE": "TIME",
    "PRODUCT": "OBJECT",
    "ORG": "ORGANIZATION",
    "EVENT": "EVENT",
    "CARDINAL": None,  # pure numbers — no graph value
    "ORDINAL": None,   # "first", "second" — no graph value
    "PERCENT": None,   # percentages
    "MONEY": None,     # monetary values
    "QUANTITY": None,  # measurements
}


def get_nlp():
    global _nlp
    if _nlp is None:
        with _nlp_lock:
            if _nlp is None:
                try:
                    _nlp = spacy.load("en_core_web_trf")
                    logger.info("Loaded spaCy transformer model (en_core_web_trf)")
                except OSError:
                    logger.warning(
                        "Transformer model not found. Falling back to en_core_web_sm."
                    )
                    _nlp = spacy.load("en_core_web_sm")
    return _nlp


def extract_entities(text: str) -> list:
    """
    Extracts named entities from witness statement text using spaCy.
    Filters to only the 5 types relevant to investigation:
    PERSON, LOCATION, TIME, OBJECT, EVENT, ORGANIZATION.

    Each entity: {text, type, start, end, xai_reason}
    """
    nlp = get_nlp()
    with _inference_lock:
        doc = nlp(text)

    entities = []
    seen = set()  # deduplicate identical entity text+type pairs

    for ent in doc.ents:
        entity_type = LABEL_MAP.get(ent.label_)
        if not entity_type:
            continue

        if entity_type == "TIME" and _AGE_ENTITY_RE.fullmatch(ent.text.strip()):
            continue

        key = (ent.text.lower(), entity_type)
        if key in seen:
            continue
        seen.add(key)

        entities.append(
            {
                "text": ent.text.strip(),
                "type": entity_type,
                "_spacy_label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char,
                "confidence": 0.85,
                "xai_reason": (
                    f"'{ent.text}' identified as {entity_type} "
                    f"by spaCy transformer NER (label: {ent.label_})."
                ),
            }
        )

    return entities
