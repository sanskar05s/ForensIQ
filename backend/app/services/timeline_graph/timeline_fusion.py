"""
ForensIQ Timeline Fusion v6 — Taxonomy-Driven Temporal Reconstruction

ALGORITHM
=========
Phase 1  Parse every event into a typed _Event dataclass.
         Absolute times → sort_score immediately.
         Relative events → extract (reference_label, relation, offset_sec).
         Evidence → sort_score = inf (always last).

Phase 2  Build anchor_index: canonical_event_type → [sort_score, ...]
         from all absolute events.

Phase 3  Four-pass anchoring for relative events:
         Pass A  taxonomy match (reference_label in anchor_index)
         Pass B  keyword match (reference words in anchor descriptions)
         Pass C  event-type match (this event's types overlap anchor's types)
         Pass D  directional fallback (before→min, during→mid, after→max)

Phase 4  Sort incident events by sort_score.
         Append evidence events at end.
         Reassign relative_order 1..N.

CHANGELOG (this revision)
==========================
Fix 1 (case-date inference): _infer_case_date falls back to evidence
       upload timestamps when no EXIF capture time is available, so
       time-only references (e.g. "8:11 PM") can still be anchored
       to a real calendar date instead of being stranded as relative.
       [Already present in this revision's baseline.]

Fix 2 (timestamp_hard propagation): previously, when Phase 3 resolved
       a relative event's sort_score via _anchor(), the code updated
       ev.sort_score but never ev.timestamp_hard — so the event sorted
       correctly but the frontend still displayed "Relative order #N"
       instead of a real timestamp. Both Phase 3 anchor loops (the
       absolute-anchor pass and the extended-pool pass) now convert
       the resolved score back into an ISO timestamp via
       _score_to_timestamp() and stamp it onto ev.timestamp_hard,
       promoting ev.source to "witness-relative" so the frontend can
       flag it as inferred rather than directly stated.
"""

from __future__ import annotations
from datetime import datetime, date, timedelta
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple
import re
import logging

logger = logging.getLogger(__name__)

# ── Epoch reference ────────────────────────────────────────────────────────────

_EPOCH = datetime(1970, 1, 1)
_EVIDENCE_SCORE = float("inf")   # evidence always after all incident events


def _to_score(dt: datetime) -> float:
    return (dt - _EPOCH).total_seconds()


def _score_to_timestamp(score: float) -> Optional[str]:
    """
    Converts an epoch sort_score back to an ISO timestamp string.
    Returns None if the score does not correspond to a plausible real date
    (guards against directional-fallback scores that have no associated
    calendar date, e.g. pure offsets computed off score_min/score_max
    without a real anchor, or scores that overflow the datetime range).
    """
    try:
        dt = _EPOCH + timedelta(seconds=score)
        if dt.year > 2020:      # real calendar date — safe to display
            return dt.isoformat()
    except (OSError, OverflowError, ValueError):
        pass
    return None


# ── Event Taxonomy ─────────────────────────────────────────────────────────────
# Maps surface words/phrases → canonical event type.
# Longer phrases listed first so greedy matching works correctly.
# Add new entries here to support new case types — no algorithm changes needed.

_TAXONOMY: Dict[str, str] = {
    # Collision / Accident
    "vehicle struck":      "collision", "vehicle hit":        "collision",
    "knocked down":        "collision", "ran over":           "collision",
    "collision":           "collision", "collided":           "collision",
    "crashed into":        "collision", "crash":              "collision",
    "struck":              "collision", "smashed":            "collision",
    "impact":              "collision", "accident":           "collision",
    "ramming":             "collision", "hit":                "collision",
    # Robbery / Theft
    "armed robbery":       "robbery",   "broke in":           "robbery",
    "demanded money":      "robbery",   "robbery":            "robbery",
    "robbed":              "robbery",   "theft":              "robbery",
    "stolen":              "robbery",   "looting":            "robbery",
    "heist":               "robbery",   "snatched":           "robbery",
    "burglary":            "robbery",   "raided":             "robbery",
    # Shooting
    "opened fire":         "shooting",  "gunshot":            "shooting",
    "shooting":            "shooting",  "fired":              "shooting",
    "gunfire":             "shooting",  "shot":               "shooting",
    # Stabbing
    "knife attack":        "stabbing",  "stabbing":           "stabbing",
    "stabbed":             "stabbing",  "slashed":            "stabbing",
    # Escape / Flight — extensive to handle varied phrasing
    "left the scene":      "escape",    "drove away":         "escape",
    "sped away":           "escape",    "speeds away":        "escape",
    "speed away":          "escape",    "rode away":          "escape",
    "ran away":            "escape",    "ran off":            "escape",
    "drove off":           "escape",    "raced away":         "escape",
    "rushed away":         "escape",    "took off":           "escape",
    "fled the scene":      "escape",    "escape":             "escape",
    "escaped":             "escape",    "escaping":           "escape",
    "fled":                "escape",    "fleeing":            "escape",
    "absconded":           "escape",    "motorcycles left":   "escape",
    "vehicle fled":        "escape",    "driven off":         "escape",
    # Assault / Fight
    "altercation":         "assault",   "brawl":              "assault",
    "fight":               "assault",   "assault":            "assault",
    "attacked":            "assault",   "beating":            "assault",
    # Explosion / Fire
    "explosion":           "explosion", "blast":              "explosion",
    "detonated":           "explosion", "bomb":               "explosion",
    "caught fire":         "fire",      "fire":               "fire",
    "flames":              "fire",      "blaze":              "fire",
    "burning":             "fire",      "arson":              "fire",
    # Shouting / Disturbance
    "screaming":           "disturbance", "screamed":         "disturbance",
    "shouting":            "disturbance", "shouted":          "disturbance",
    "yelling":             "disturbance", "commotion":        "disturbance",
    "alarm":               "disturbance", "noise":            "disturbance",
    "loud noise":          "disturbance",
    # Emergency Response
    "ambulance arrived":   "emergency", "police arrived":     "emergency",
    "ambulance":           "emergency", "paramedics":         "emergency",
    "first responders":    "emergency", "emergency":          "emergency",
    "rescue":              "emergency",
    # Arrival / Entry
    "arrived at":          "arrival",   "pulled up":          "arrival",
    "arrived":             "arrival",   "approached":         "arrival",
    "entered":             "arrival",   "appeared":           "arrival",
    "came to":             "arrival",
    # Cyber (for cyber investigations)
    "data breach":         "breach",    "hacked":             "breach",
    "ransomware":          "breach",    "phishing":           "breach",
    "breach":              "breach",    "malware":            "breach",
    # Generic
    "incident":            "incident",  "occurred":           "incident",
    "happened":            "incident",  "took place":         "incident",
}

# Pre-sorted longest → shortest for greedy matching
_TAXONOMY_KEYS = sorted(_TAXONOMY.keys(), key=len, reverse=True)


def _event_types(text: str) -> Set[str]:
    """Returns the set of canonical event types present in text."""
    result: Set[str] = set()
    lower = text.lower()
    for surface in _TAXONOMY_KEYS:
        if surface in lower:
            result.add(_TAXONOMY[surface])
    return result


# ── Timestamp Parsing ──────────────────────────────────────────────────────────

_FULL_FORMATS = [
    "%Y:%m:%d %H:%M:%S",    # EXIF
    "%Y-%m-%dT%H:%M:%S",    # ISO 8601
    "%Y-%m-%d %H:%M:%S",    # DB format
    "%Y-%m-%dT%H:%M:%S.%f", # ISO with microseconds
    "%Y-%m-%d",             # date-only
]
_TIME_FORMATS = [
    "%I:%M %p", "%I:%M%p",
    "%H:%M:%S", "%H:%M",
    "%I %p",    "%I%p",
]
_TIME_IN_TEXT = re.compile(
    r'\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*(?:AM|PM|am|pm))\b',
    re.IGNORECASE
)


def _parse_full(s: str) -> Optional[datetime]:
    """
    Parse a full datetime string.
    Handles EXIF, ISO 8601, and Supabase TIMESTAMPTZ (+HH:MM / Z suffixes).
    """
    if not s:
        return None
    s = str(s).strip()

    # datetime.fromisoformat() handles all ISO 8601 variants including
    # timezone offsets like +05:30 and +00:00.
    # This is the primary fix — Supabase uploaded_at was failing here.
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        if dt.tzinfo is not None:
            from datetime import timezone as _tz
            dt = dt.astimezone(_tz.utc).replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        pass

    # Fallback: explicit format list for non-ISO formats (EXIF etc.)
    for fmt in _FULL_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue

    return None

def _parse_time(s: str) -> Optional[datetime.time]:
    s = re.sub(r'\s+', ' ', str(s).upper().strip())
    s = re.sub(r'(\d{1,2})\.(\d{2})', r'\1:\2', s)
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    return None


def _infer_case_date(evidence_rows: list) -> date:
    """
    Infers the incident date. Never returns None.

    Priority 1: EXIF capture timestamps   (most accurate — actual event time)
    Priority 2: Evidence upload timestamps (practical — fixes timezone issue)
    Priority 3: Today                      (last resort — time-of-day still correct)
    """
    # Priority 1: EXIF
    exif_dates = []
    for ev in evidence_rows:
        exif = ev.get("exif_metadata") or {}
        for f in ("capture_timestamp", "created_timestamp", "creation_date"):
            ts = exif.get(f)
            if ts:
                dt = _parse_full(ts)
                if dt and dt.year > 2020:
                    exif_dates.append(dt.date())
                    break
    if exif_dates:
        chosen = Counter(exif_dates).most_common(1)[0][0]
        logger.info(f"case_date from EXIF: {chosen}")
        return chosen

    # Priority 2: Upload timestamps (timezone fix makes this reliable now)
    upload_dates = []
    for ev in evidence_rows:
        ts = ev.get("uploaded_at")
        if ts:
            dt = _parse_full(ts)
            if dt and dt.year > 2020:
                upload_dates.append(dt.date())
    if upload_dates:
        chosen = Counter(upload_dates).most_common(1)[0][0]
        logger.info(f"case_date from upload timestamps: {chosen}")
        return chosen

    # Priority 3: Today — time-of-day ordering remains correct
    from datetime import date as _date
    today = _date.today()
    logger.warning(
        f"case_date could not be inferred — using today ({today}). "
        f"Displayed dates may be approximate. Time-of-day ordering is reliable."
    )
    return today
# ── Temporal Relation Extraction ───────────────────────────────────────────────
# Returns (relation_label, offset_seconds).
# Checked in order — first match wins.
# Negative offset = before anchor. Zero = simultaneous. Positive = after.

_RELATIONS: List[Tuple[str, str, Optional[int]]] = [
    (r'\bimmediately\s+(?:after|following)\b',     "IMMEDIATELY_AFTER",  30),
    (r'\bright\s+after\b',                         "IMMEDIATELY_AFTER",  30),
    (r'\binstantly?\b',                            "IMMEDIATELY_AFTER",  30),
    (r'\bmoments?\s+after\b',                      "IMMEDIATELY_AFTER",  60),
    (r'\bshortly\s+after(?:wards?)?\b',            "SHORTLY_AFTER",      90),
    (r'\bjust\s+after\b',                          "SHORTLY_AFTER",      60),
    (r'\bsoon\s+after(?:wards?)?\b',               "SHORTLY_AFTER",      90),
    (r'\bwithin\s+a\s+minute\b',                   "SHORTLY_AFTER",      60),
    (r'\ba\s+few\s+minutes?\s+(?:after|later)\b',  "FEW_MINUTES_AFTER",  180),
    (r'\bseveral\s+minutes?\s+(?:after|later)\b',  "FEW_MINUTES_AFTER",  300),
    (r'\b(\d+)\s+minutes?\s+(?:after|later)\b',    "N_MINUTES_AFTER",    None),
    (r'\bhalf\s+an?\s+hour\b',                     "FEW_MINUTES_AFTER",  1800),
    (r'\bminutes?\s+(?:after|later)\b',            "FEW_MINUTES_AFTER",  180),
    (r'\blater\b',                                 "LATER",              180),
    (r'\bafter(?:wards?)?\b',                      "AFTER",              120),
    (r'\bfollowing\b',                             "AFTER",              120),
    (r'\bsubsequently\b',                          "AFTER",              120),
    (r'\bthen\b',                                  "AFTER",               60),
    (r'\bimmediately\s+before\b',                  "SHORTLY_BEFORE",     -15),
    (r'\bjust\s+before\b',                         "SHORTLY_BEFORE",     -30),
    (r'\bshortly\s+before\b',                      "SHORTLY_BEFORE",     -60),
    (r'\bprior\s+to\b',                            "BEFORE",             -60),
    (r'\bbefore\b',                                "BEFORE",             -60),
    (r'\bearlier\b',                               "EARLIER",           -120),
    (r'\bduring\b',                                "DURING",               0),
    (r'\bwhile\b',                                 "WHILE",                0),
    (r'\bthroughout\b',                            "DURING",               0),
    (r'\bat\s+the\s+same\s+time\b',               "DURING",               0),
    (r'\bsimultaneously\b',                        "DURING",               0),
]


def _temporal_relation(text: str) -> Tuple[Optional[str], int]:
    lower = text.lower()
    for pattern, label, offset in _RELATIONS:
        m = re.search(pattern, lower, re.IGNORECASE)
        if m:
            if offset is None:
                n = int(m.group(1)) if m.lastindex else 3
                return (label, n * 60)
            return (label, offset)
    return (None, 0)


# ── Reference Phrase Extraction ────────────────────────────────────────────────

_REF_RE = re.compile(
    r'\b(?:shortly\s+|immediately\s+|just\s+|right\s+|soon\s+)?'
    r'(?:before|after|during|while|following|amid|since)\s+'
    r'(?:the\s+|a\s+|an\s+|hearing\s+|seeing\s+|noticing\s+|'
    r'they\s+|he\s+|she\s+|it\s+|them\s+)?'
    r'([a-z]+(?:\s+[a-z]+){0,2})',
    re.IGNORECASE
)
_REF_STRIP = re.compile(
    r'^(the|a|an|hearing|seeing|noticing|they|he|she|it|them)\s+',
    re.IGNORECASE
)


def _reference_label(text: str) -> Optional[str]:
    """
    Extracts the noun phrase that follows a temporal marker.
    "before the robbery" → "robbery"
    "shortly after hearing shouting" → "shouting"
    "before escaping" → "escaping"
    """
    m = _REF_RE.search(text)
    if not m:
        return None
    phrase = _REF_STRIP.sub('', m.group(1).strip().lower())
    return phrase or None


# ── _Event dataclass ───────────────────────────────────────────────────────────

@dataclass
class _Event:
    description:      str
    source_ids:       list
    source:           str
    confidence_state: str
    explicit_dt:      Optional[datetime]
    sort_score:       Optional[float]
    timestamp_hard:   Optional[str]
    reference_label:  Optional[str]
    relation:         Optional[str]
    offset_sec:       int
    event_types:      Set[str] = field(default_factory=set)
    is_evidence:      bool = False
    is_relative:      bool = True


# ── Anchor helper ──────────────────────────────────────────────────────────────

def _anchor(
    ev: _Event,
    pool: List[Tuple[str, float, Set[str]]],
    idx: Dict[str, List[float]],
) -> Optional[float]:
    """
    Tries to find an anchor sort_score for a relative event using four passes.

    pool items: (description, sort_score, event_types_set)
    idx:  anchor_index
    """
    if not pool:
        return None

    all_scores = [s for _, s, _ in pool]
    score_min, score_max = min(all_scores), max(all_scores)
    off = ev.offset_sec

    # Pass A — taxonomy: ev.reference_label is a canonical type in idx
    if ev.reference_label and ev.reference_label in idx:
        scores = idx[ev.reference_label]
        base = min(scores)
        return base + off

    # Pass B — keyword: reference label words appear in anchor descriptions
    if ev.reference_label:
        ref_words = {
            w for w in re.findall(r'\b[a-z]{4,}\b', ev.reference_label)
            if len(w) >= 4
        }
        if ref_words:
            best_base: Optional[float] = None
            best_hits = 0
            for desc, score, _ in pool:
                desc_words = set(re.findall(r'\b[a-z]{4,}\b', desc.lower()))
                hits = len(ref_words & desc_words)
                if hits > best_hits:
                    best_hits = hits
                    best_base = score
            if best_base is not None:
                return best_base + off

    # Pass C — event-type overlap: this event's own types match an anchor's types
    if ev.event_types:
        best_base = None
        best_hits = 0
        for _, score, atypes in pool:
            hits = len(ev.event_types & atypes)
            if hits > best_hits:
                best_hits = hits
                best_base = score
        if best_base is not None:
            return best_base + off

    # Pass D — directional fallback
    if ev.relation is None:
        return None     # no temporal cue — cannot place
    if off < 0:
        return score_min + off
    elif off == 0:
        return (score_min + score_max) / 2.0
    else:
        return score_max + off


# ── Main entry point ───────────────────────────────────────────────────────────

def build_timeline(case_id: str, supabase) -> List[Dict]:
    """
    Builds a chronologically ordered investigation timeline.
    Returns a list of dicts ready for insertion into timeline_events.
    """

    # ── Fetch ─────────────────────────────────────────────────────────────────
    evidence_rows = supabase.table("evidence")\
        .select("id, filename, exif_metadata, uploaded_at")\
        .eq("case_id", case_id).eq("status", "analyzed")\
        .execute().data or []

    statements = supabase.table("witness_statements")\
        .select("id, witness_label, temporal_sequence")\
        .eq("case_id", case_id).eq("analysis_status", "analyzed")\
        .execute().data or []

    conflict_ids: Set[str] = set()
    for c in supabase.table("contradictions")\
            .select("witness_a_id, witness_b_id")\
            .eq("case_id", case_id).eq("type", "time")\
            .execute().data or []:
        conflict_ids.update([c["witness_a_id"], c["witness_b_id"]])

    case_date = _infer_case_date(evidence_rows)

    events: List[_Event] = []

    # ── Phase 1A: Evidence (upload time, always last) ─────────────────────────
    for ev in evidence_rows:
        upload_dt = _parse_full(ev.get("uploaded_at") or "")
        events.append(_Event(
            description=f"[Evidence] {ev['filename']}",
            source_ids=[{"type": "evidence", "id": ev["id"]}],
            source="metadata",
            confidence_state="confirmed",
            explicit_dt=upload_dt,
            sort_score=_EVIDENCE_SCORE,
            timestamp_hard=upload_dt.isoformat() if upload_dt else None,
            reference_label=None,
            relation=None,
            offset_sec=0,
            event_types=_event_types(ev.get("filename", "")),
            is_evidence=True,
            is_relative=False,
        ))

    # ── Phase 1B: Witness statement events ────────────────────────────────────
    for stmt in statements:
        is_conflict = stmt["id"] in conflict_ids
        for entry in (stmt.get("temporal_sequence") or []):
            raw = entry.get("event_text", "")
            abs_str = entry.get("absolute_time")
            normalized_hhmm = entry.get("absolute_time_normalized")

            # Resolve explicit time
            explicit_dt: Optional[datetime] = None
            had_full_datetime = False

            # Step 1: Try full datetime parse (handles EXIF-style "2026-09-09T20:30:00")
            if abs_str:
                explicit_dt = _parse_full(abs_str)
                if explicit_dt:
                    had_full_datetime = True

            # Step 2: Use pre-normalized HH:MM from temporal.py (most reliable for
            #         time-only expressions like "around 8:10 PM" -> "20:10")
            if not explicit_dt and normalized_hhmm and case_date:
                try:
                    from datetime import time as time_obj
                    h, m = map(int, normalized_hhmm.split(":"))
                    explicit_dt = datetime.combine(case_date, time_obj(h, m))
                except (ValueError, TypeError):
                    pass

            # Step 3: Check abs_str with _parse_time
            if not explicit_dt and abs_str:
                t = _parse_time(abs_str)
                if t and case_date:
                    if 'midnight' in (abs_str or '').lower():
                        explicit_dt = datetime.combine(case_date, datetime.strptime("23:59:59", "%H:%M:%S").time())
                    else:
                        explicit_dt = datetime.combine(case_date, t)

            # Step 4: Regex fallback on raw text
            if not explicit_dt:
                for m in _TIME_IN_TEXT.finditer(raw):
                    t = _parse_time(m.group(0))
                    if t and case_date:
                        if 'midnight' in raw.lower():
                            explicit_dt = datetime.combine(case_date, datetime.strptime("23:59:59", "%H:%M:%S").time())
                        else:
                            explicit_dt = datetime.combine(case_date, t)
                        break

            # RESTORED: Set timestamp_hard for all events with a resolved datetime.
            # Previously suppressed to avoid IST timezone shift — now handled in
            # the frontend by showing only the time portion for witness-direct events.
            ts_hard = explicit_dt.isoformat() if explicit_dt else None
            rel, off = _temporal_relation(raw)
            ref_raw = _reference_label(raw)

            # Normalise reference through taxonomy
            canon_ref: Optional[str] = None
            if ref_raw:
                canon = _event_types(ref_raw)
                canon_ref = next(iter(canon)) if canon else ref_raw

            is_relative = explicit_dt is None

            events.append(_Event(
                description=f"[{stmt['witness_label']}] {raw[:300]}",
                source_ids=[{"type": "statement", "id": stmt["id"]}],
                source="witness-direct" if not is_relative else "witness-relative",
                confidence_state="low-conflict" if is_conflict else "high",
                explicit_dt=explicit_dt,
                sort_score=_to_score(explicit_dt) if explicit_dt else None,
                timestamp_hard=ts_hard,
                reference_label=canon_ref,
                relation=rel,
                offset_sec=off,
                event_types=_event_types(raw),
                is_evidence=False,
                is_relative=is_relative,
            ))

    # ── Phase 2: Build anchor index ───────────────────────────────────────────
    anchor_idx: Dict[str, List[float]] = {}
    for ev in events:
        if ev.is_evidence or ev.is_relative or ev.sort_score is None:
            continue
        for label in ev.event_types:
            anchor_idx.setdefault(label, []).append(ev.sort_score)

    # Pool of (description, sort_score, event_types) for anchor lookup
    def _build_pool(events_list: List[_Event]) -> List[Tuple[str, float, Set[str]]]:
        return [
            (e.description, e.sort_score, e.event_types)
            for e in events_list
            if e.sort_score is not None and not e.is_evidence
        ]

    # ── Phase 3: Anchor relative events ───────────────────────────────────────

    # Pass A + B + C + D: absolute events as anchors
    abs_pool = _build_pool([e for e in events if not e.is_relative and not e.is_evidence])
    for ev in events:
        if ev.is_evidence or ev.sort_score is not None:
            continue
        result = _anchor(ev, abs_pool, anchor_idx)
        if result is not None:
            ev.sort_score = result
            ev.timestamp_hard = _score_to_timestamp(result)   # Fix 2
            if ev.timestamp_hard:
                # Promote source label so frontend knows this is inferred,
                # not just placed by relative order.
                ev.source = "witness-relative"
            # Add to anchor_idx so Pass B downstream can use this result
            for label in ev.event_types:
                anchor_idx.setdefault(label, []).append(result)

    # Second sweep: use Pass A results as additional anchors for
    # events that depend on other relative events
    # (e.g. "shortly after the escape" where escape was itself relative)
    ext_pool = _build_pool([e for e in events if not e.is_evidence])
    for ev in events:
        if ev.is_evidence or ev.sort_score is not None:
            continue
        result = _anchor(ev, ext_pool, anchor_idx)
        if result is not None:
            ev.sort_score = result
            ev.timestamp_hard = _score_to_timestamp(result)   # Fix 2
            if ev.timestamp_hard:
                ev.source = "witness-relative"

    # ── Phase 4: Sort and output ───────────────────────────────────────────────
    incident = [e for e in events if not e.is_evidence]
    evidence = [e for e in events if e.is_evidence]

    # Events still without sort_score (no temporal info at all) go to the end
    incident_max = max((e.sort_score for e in incident if e.sort_score is not None), default=0.0)
    for i, ev in enumerate(incident):
        if ev.sort_score is None:
            ev.sort_score = incident_max + (i + 1) * 30

    incident.sort(key=lambda e: (e.sort_score,))

    final: List[Dict] = []
    order = 1
    for ev in incident:
        final.append({
            "case_id":          case_id,
            "description":      ev.description,
            "timestamp_hard":   ev.timestamp_hard,
            "relative_order":   order,
            "source":           ev.source,
            "confidence_state": ev.confidence_state,
            "conflicts_with":   [],
            "source_ids":       ev.source_ids,
        })
        order += 1

    for ev in evidence:
        final.append({
            "case_id":          case_id,
            "description":      ev.description,
            "timestamp_hard":   ev.timestamp_hard,
            "relative_order":   order,
            "source":           ev.source,
            "confidence_state": ev.confidence_state,
            "conflicts_with":   [],
            "source_ids":       ev.source_ids,
        })
        order += 1

    logger.info(
        f"Timeline [{case_id}]: {len(final)} events — "
        f"{len([e for e in incident if e.explicit_dt])} absolute, "
        f"{len([e for e in incident if e.is_relative])} relative, "
        f"{len(evidence)} evidence"
    )
    return final
