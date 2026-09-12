from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

MODEL_NAME = "cross-encoder/nli-deberta-v3-small"
CONFIDENCE_THRESHOLD = 0.70

_model = None
_tokenizer = None


def get_model():
    global _model, _tokenizer
    if _model is None:
        logger.info(f"Loading NLI model: {MODEL_NAME}")
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        _model.eval()
        logger.info("NLI model loaded successfully")
    return _model, _tokenizer


def predict_nli(premise: str, hypothesis: str) -> Dict:
    """
    Predicts NLI relationship between two claims.
    Returns {label, contradiction_confidence, scores}
    label is one of: 'contradiction', 'entailment', 'neutral'
    """
    model, tokenizer = get_model()

    inputs = tokenizer(
        premise, hypothesis,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True
    )

    with torch.no_grad():
        outputs = model(**inputs)

    probs = F.softmax(outputs.logits, dim=-1)
    id2label = model.config.id2label

    scores = {
        id2label[i]: round(float(probs[0][i]), 3)
        for i in range(len(id2label))
    }

    predicted_label = max(scores, key=scores.get)

    # Robust contradiction score lookup.
    # cross-encoder/nli-deberta-v3-small exposes labels as lowercase strings
    # ('contradiction', 'entailment', 'neutral'). Some checkpoint versions
    # expose 'LABEL_0' / 'LABEL_1' / 'LABEL_2' instead.
    # We look up by exact name first, then fall back to position 0
    # (which is 'contradiction' in all known MNLI-trained checkpoints).
    contradiction_score = scores.get(
        "contradiction",
        scores.get(
            "CONTRADICTION",
            float(probs[0][0])   # position 0 = contradiction in MNLI ordering
        )
    )

    return {
        "label": predicted_label,
        "contradiction_confidence": contradiction_score,
        "scores": scores
    }


def run_tier2(statement_a: Dict,
              statement_b: Dict,
              hedge_a: Optional[int] = None,
              hedge_b: Optional[int] = None) -> List[Dict]:
    """
    Runs NLI on the full statement text pair.
    Only called when Tier 1 finds no rule-based contradiction.
    Returns list of NLI contradictions above CONFIDENCE_THRESHOLD.
    """
    from app.services.contradiction.claim_extractor import split_into_sentences

    h_a = hedge_a if hedge_a is not None else (statement_a.get("hedge_marker_count", 0) or 0)
    h_b = hedge_b if hedge_b is not None else (statement_b.get("hedge_marker_count", 0) or 0)

    sentences_a = split_into_sentences(statement_a["raw_text"])
    sentences_b = split_into_sentences(statement_b["raw_text"])

    contradictions = []

    # Compare each sentence pair — cap at 5x5 to avoid excessive inference
    for sa in sentences_a[:5]:
        for sb in sentences_b[:5]:
            if len(sa) < 10 or len(sb) < 10:
                continue  # skip very short sentences

            result = predict_nli(sa, sb)

            if result["label"] == "contradiction":
                contradiction_score = result["contradiction_confidence"]

                # Apply hedge discount to NLI confidence
                if h_a >= 3 and h_b >= 3:
                    contradiction_score = round(contradiction_score * 0.88, 3)
                elif h_a >= 3 or h_b >= 3:
                    contradiction_score = round(contradiction_score * 0.93, 3)

                if contradiction_score < CONFIDENCE_THRESHOLD:
                    continue   # Discarded after hedge adjustment — was borderline

                xai = (
                    f"Semantic contradiction detected by NLI model "
                    f"({MODEL_NAME}) with "
                    f"{contradiction_score*100:.0f}% confidence. "
                    f"The statements are semantically incompatible but do not "
                    f"trigger rule-based detection. "
                    f"Investigator judgment required."
                )
                if h_a >= 3 or h_b >= 3:
                    xai += (
                        f" Confidence adjusted for witness uncertainty "
                        f"(hedge markers: A={h_a}, B={h_b})."
                    )

                contradictions.append({
                    "type": "nli",
                    "tier": 2,
                    "claim_a": sa,
                    "claim_b": sb,
                    "severity": (
                        "HIGH"   if contradiction_score >= 0.90 else
                        "MEDIUM" if contradiction_score >= 0.75 else
                        "LOW"
                    ),
                    "nli_confidence": contradiction_score,
                    "witness_a_id": statement_a["id"],
                    "witness_b_id": statement_b["id"],
                    "xai_explanation": xai
                })

    # Return only the highest-confidence NLI contradiction per pair
    # to avoid flooding the report
    if contradictions:
        contradictions.sort(key=lambda x: x["nli_confidence"], reverse=True)
        return [contradictions[0]]

    return []
