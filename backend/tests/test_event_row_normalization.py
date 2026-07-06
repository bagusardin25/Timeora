import unittest
from datetime import date, time

from app import data_access, supabase_store


def row(**overrides):
    values = {
        "id": "evt_1",
        "user_id": "user_1",
        "title": "Imported event",
        "date": date(2026, 7, 6),
        "start_time": time(9, 0),
        "duration_minutes": 30,
        "participants": "",
    }
    values.update(overrides)
    return values


class TestEventRowNormalization(unittest.TestCase):
    def test_postgres_row_ignores_malformed_external_ids(self):
        event = data_access._row_to_event(row(external_ids="not-json"))

        self.assertEqual(event.external_ids, {})

    def test_postgres_row_parses_json_encoded_tags(self):
        event = data_access._row_to_event(row(tags='["client", "roadmap"]'))

        self.assertEqual(event.tags, ["client", "roadmap"])

    def test_supabase_row_ignores_malformed_external_ids(self):
        event = supabase_store._row_to_event(
            row(date="2026-07-06", start_time="09:00:00", external_ids="not-json")
        )

        self.assertEqual(event.external_ids, {})

    def test_supabase_row_parses_json_encoded_tags(self):
        event = supabase_store._row_to_event(
            row(date="2026-07-06", start_time="09:00:00", tags='["client", "roadmap"]')
        )

        self.assertEqual(event.tags, ["client", "roadmap"])


if __name__ == "__main__":
    unittest.main()
