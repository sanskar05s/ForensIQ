import unittest

from app.services.contradiction.candidate_filter import (
    SAVPair,
    _extract_sav_pairs,
    should_compare_nli,
)


class TestContradictionCandidateFilter(unittest.TestCase):
    def test_different_vehicle_types_do_not_reach_nli(self):
        sedan = {"raw_text": "I saw a black sedan moving along the main road."}
        suv = {"raw_text": "I saw a white SUV moving along the main road."}
        generic_car = {"raw_text": "I saw a black car leave the accident location."}

        self.assertFalse(should_compare_nli(sedan, suv))
        self.assertFalse(should_compare_nli(suv, generic_car))

    def test_same_generic_vehicle_type_remains_an_nli_candidate(self):
        black_car = {"raw_text": "I saw a black car leave the accident location."}
        white_car = {"raw_text": "I saw a white car leave the accident location."}

        self.assertTrue(should_compare_nli(black_car, white_car))
        self.assertIn(
            SAVPair(subject="VEHICLE:GENERIC", attribute="COLOR"),
            _extract_sav_pairs(black_car),
        )


if __name__ == "__main__":
    unittest.main()
