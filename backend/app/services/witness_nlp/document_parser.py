import re
from typing import List, Dict, Any

# Regex to match "Witness Name:" headers
# Tolerates:
# - Optional numbering or bullet points ("1.", "-", "•")
# - "Witness Name:", "Witness:", "Witness Label:"
# - Variations in spacing before/after colon: "Witness Name :", "Witness Name:"
# - Case-insensitive
# Negative lookahead (?!statement) ensures it never matches "Witness Statement:"
WITNESS_NAME_RE = re.compile(
    r'(?:^|\n)[ \t]*(?:[-*•\d+.]\s*)?witness(?:\s+name|\s+label)?\s*(?!statement)[ \t]*:[ \t]*',
    re.IGNORECASE
)

# Regex to match "Witness Statement:" headers
# Tolerates:
# - "Witness Statement:", "Statement:"
# - Variations in spacing before/after colon: "Witness Statement :", "Witness Statement:"
# - Case-insensitive
WITNESS_STATEMENT_RE = re.compile(
    r'(?:^|\n)[ \t]*(?:[-*•\d+.]\s*)?(?:witness\s+)?statement\s*:[ \t]*',
    re.IGNORECASE
)


def parse_multi_witness_document(text: str) -> List[Dict[str, Any]]:
    """
    Deterministically parses a multi-witness document into individual witness
    statements using explicit 'Witness Name:' and 'Witness Statement:' labels.

    Rules:
    1. Ignores optional case-level preamble before the first Witness Name.
    2. Identifies every Witness Name: / Witness Statement: pair.
    3. Each Witness Name belongs to the immediately following Witness Statement.
    4. Multi-line and multi-paragraph statements are retained until the next Witness Name.
    5. If a Witness Name exists but its corresponding Witness Statement is missing,
       marks that entry as valid=False with error="Missing witness statement".
    6. If no recognizable pairs are found, returns an empty list.
    """
    if not text or not text.strip():
        return []

    name_matches = list(WITNESS_NAME_RE.finditer(text))
    if not name_matches:
        return []

    entries: List[Dict[str, Any]] = []
    total_matches = len(name_matches)

    for i in range(total_matches):
        current_match = name_matches[i]
        start_pos = current_match.start()
        end_pos = name_matches[i + 1].start() if i + 1 < total_matches else len(text)

        # Extract the chunk corresponding to this witness
        chunk = text[start_pos:end_pos]

        # Calculate offset in chunk where name begins
        header_len = current_match.end() - current_match.start()

        # Search for Witness Statement label within this chunk
        stmt_match = WITNESS_STATEMENT_RE.search(chunk)

        if stmt_match:
            # Everything between Witness Name label and Witness Statement label is the name
            name_raw = chunk[header_len:stmt_match.start()].strip()
            name_lines = [line.strip().strip('"\'') for line in name_raw.splitlines() if line.strip()]
            witness_name = " ".join(name_lines) if name_lines else f"Witness {i + 1}"

            # Everything after Witness Statement label to the end of chunk is the statement
            statement_raw = chunk[stmt_match.end():].strip()

            # Strip matching enclosing outer quotes if present
            if (statement_raw.startswith('"') and statement_raw.endswith('"')) or \
               (statement_raw.startswith("'") and statement_raw.endswith("'")):
                statement_raw = statement_raw[1:-1].strip()

            if not statement_raw:
                entries.append({
                    "witness_label": witness_name,
                    "raw_text": "",
                    "valid": False,
                    "error": "Missing witness statement",
                })
            else:
                entries.append({
                    "witness_label": witness_name,
                    "raw_text": statement_raw,
                    "valid": True,
                    "error": None,
                })
        else:
            # Witness Name exists but no Witness Statement label was found before next witness
            name_raw = chunk[header_len:].strip()
            name_lines = [line.strip().strip('"\'') for line in name_raw.splitlines() if line.strip()]
            witness_name = name_lines[0] if name_lines else f"Witness {i + 1}"

            entries.append({
                "witness_label": witness_name,
                "raw_text": "",
                "valid": False,
                "error": "Missing witness statement",
            })

    return entries


def extract_single_witness_text(text: str) -> Dict[str, Any]:
    """
    Extracts text for a single witness from document text.
    If 'Witness Statement:' is present, extracts the text following it.
    Also extracts a suggested witness name if 'Witness Name:' is present.
    If no labels are present, returns the entire document text as the statement.
    """
    if not text:
        return {"witness_label": "", "raw_text": ""}

    suggested_label = ""
    statement_text = text.strip()

    name_match = WITNESS_NAME_RE.search(text)
    stmt_match = WITNESS_STATEMENT_RE.search(text)

    if stmt_match:
        if name_match and name_match.start() < stmt_match.start():
            raw_name = text[name_match.end():stmt_match.start()].strip()
            name_lines = [l.strip().strip('"\'') for l in raw_name.splitlines() if l.strip()]
            if name_lines:
                suggested_label = " ".join(name_lines)

        statement_text = text[stmt_match.end():].strip()
    elif name_match:
        # Only name match, but no statement label -> if there are subsequent lines, treat them as statement
        lines = text[name_match.end():].strip().splitlines()
        if lines:
            suggested_label = lines[0].strip().strip('"\'')
            remaining = "\n".join(lines[1:]).strip()
            if remaining:
                statement_text = remaining

    # Strip matching outer quotes
    if (statement_text.startswith('"') and statement_text.endswith('"')) or \
       (statement_text.startswith("'") and statement_text.endswith("'")):
        statement_text = statement_text[1:-1].strip()

    return {
        "witness_label": suggested_label,
        "raw_text": statement_text
    }
