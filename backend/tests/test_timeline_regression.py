import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from unittest.mock import MagicMock

from app.services.witness_nlp.temporal import (
    extract_temporal_sequence,
    _relative_offset,
    _CLOCK_RE,
)
from app.services.witness_nlp.ner import extract_entities, _AGE_ENTITY_RE
from app.services.contradiction.claim_extractor import (
    extract_direction_claims,
    extract_color_claims,
    extract_time_claims,
    _parse_time_to_hours,
)
from app.services.contradiction.rule_based import (
    check_color_contradiction,
    check_direction_contradiction,
)
from app.services.timeline_graph.timeline_fusion import (
    build_timeline,
    _case_timestamp,
    _to_score,
)
from app.core.config import settings


class TestTimelineRegression(unittest.TestCase):
    def test_relative_offset_range_and_ordering(self):
        """'Less than two minutes later' gets an offset range of 0-120 seconds and is ordered after its preceding explicit time."""
        offset_info = _relative_offset("He left less than two minutes later.")
        self.assertIsNotNone(offset_info)
        self.assertEqual(offset_info["offset_min_seconds"], 0)
        self.assertEqual(offset_info["offset_max_seconds"], 120)
        self.assertEqual(offset_info["offset_seconds"], 60)

        statements = [
            {
                "id": "stmt-1",
                "witness_label": "Witness A",
                "temporal_sequence": [
                    {
                        "event_text": "At 10:00 PM the suspect entered the building.",
                        "relative_order": 1,
                        "absolute_time": "10:00 PM",
                        "absolute_time_normalized": "22:00",
                        "event_date": "2026-10-15",
                        "marker_type": "absolute",
                        "temporal_kind": "clock",
                        "time_precision": "stated",
                    },
                    {
                        "event_text": "He left less than two minutes later.",
                        "relative_order": 2,
                        "absolute_time": None,
                        "absolute_time_normalized": None,
                        "event_date": "2026-10-15",
                        "marker_type": "relative",
                        "temporal_kind": "relative",
                        "offset_seconds": 60,
                        "offset_min_seconds": 0,
                        "offset_max_seconds": 120,
                    },
                ],
            }
        ]

        class MockQuery:
            def __init__(self, data):
                self._data = data

            def select(self, *args, **kwargs):
                return self

            def eq(self, *args, **kwargs):
                return self

            def order(self, *args, **kwargs):
                return self

            def execute(self):
                mock_res = MagicMock()
                mock_res.data = self._data
                return mock_res

        class MockSupabase:
            def table(self, name):
                if name == "evidence":
                    return MockQuery([])
                elif name == "witness_statements":
                    return MockQuery(statements)
                elif name == "contradictions":
                    return MockQuery([])
                return MockQuery([])

        mock_supabase = MockSupabase()

        timeline = build_timeline("case-123", mock_supabase)
        self.assertEqual(len(timeline), 2)
        # Event 1: 10:00 PM, Event 2: Relative
        ev1 = timeline[0]
        ev2 = timeline[1]

        self.assertIn("10:00 PM", ev1["description"])
        self.assertIsNotNone(ev1["timestamp_hard"])

        self.assertIn("less than two minutes later", ev2["description"])
        # Requirement 2: The timeline does not display that relative event as an exact timestamp
        self.assertIsNone(ev2["timestamp_hard"])
        self.assertEqual(ev2["source"], "witness-relative")

        # Check metadata stored in source_ids
        source_meta = next((s for s in ev2["source_ids"] if s.get("type") == "statement"), {})
        self.assertEqual(source_meta.get("temporal_kind"), "relative")
        self.assertEqual(source_meta.get("offset_min_seconds"), 0)
        self.assertEqual(source_meta.get("offset_max_seconds"), 120)

    def test_approximate_time_precision(self):
        """'Around 11:15 PM' displays as approximate."""
        text = "I saw the car around 11:15 PM near the gate."
        seq = extract_temporal_sequence(text, [])
        self.assertEqual(len(seq), 1)
        self.assertEqual(seq[0]["time_precision"], "approximate")
        self.assertEqual(seq[0]["absolute_time_normalized"], "23:15")

    def test_non_clock_events(self):
        """'mid-20s,' 'evening,' and 'less than 90 seconds' do not become clock events."""
        text = "In the evening, a mid-20s man ran out in less than 90 seconds."
        seq = extract_temporal_sequence(text, [])
        clock_events = [e for e in seq if e.get("temporal_kind") == "clock"]
        self.assertEqual(len(clock_events), 0)

        # Also check ner entity filtering for mid-20s
        self.assertTrue(_AGE_ENTITY_RE.fullmatch("mid-20s"))
        self.assertTrue(_AGE_ENTITY_RE.fullmatch("25 years old"))

    def test_idiom_right_before_not_direction(self):
        """'right before' is not a direction claim."""
        text = "He escaped right before the alarm sounded."
        claims = extract_direction_claims(text)
        self.assertEqual(len(claims), 0)

    def test_direction_contradiction_spatial_target_matching(self):
        """'right sweatshirt pocket' and 'left hand' do not produce a direction contradiction."""
        s1 = "The suspect concealed the item in his right sweatshirt pocket."
        s2 = "He was holding a phone in his left hand."
        c1 = extract_direction_claims(s1)
        c2 = extract_direction_claims(s2)

        self.assertEqual(c1[0]["context"], "object:pocket")
        self.assertEqual(c2[0]["context"], "object:hand")

        contra = check_direction_contradiction(c1, c2)
        self.assertIsNone(contra)

    def test_color_contradiction_keeps_vehicle_types_distinct(self):
        suv = extract_color_claims(
            "Just before the collision, I saw a white SUV moving along the road."
        )
        sedan = extract_color_claims(
            "Just before the collision, I saw a black sedan moving along the road."
        )
        car = extract_color_claims(
            "I saw a black car leave the accident location."
        )

        self.assertIsNone(check_color_contradiction(suv, sedan))
        self.assertIsNone(check_color_contradiction(suv, car))

        red_bag = extract_color_claims("I saw the man carrying a red backpack.")
        blue_bag = extract_color_claims("I saw the same man carrying a blue backpack.")
        self.assertIsNotNone(check_color_contradiction(red_bag, blue_bag))

    def test_timezone_display_format(self):
        """11:13 PM displays as 23:13 in the configured case timezone."""
        dt_naive = datetime(2026, 10, 15, 23, 13, 0)
        ts_iso = _case_timestamp(dt_naive)
        # Parse and format back in case timezone
        tz = ZoneInfo(settings.CASE_TIMEZONE)
        dt_zoned = datetime.fromisoformat(ts_iso).astimezone(tz)
        formatted_24h = dt_zoned.strftime("%H:%M")
        self.assertEqual(formatted_24h, "23:13")


if __name__ == "__main__":
    unittest.main()
