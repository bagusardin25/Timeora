import unittest
from datetime import date, time

from app.core import conflicts, nlparser


class TestNLParser(unittest.TestCase):
    def test_flagship_indonesian(self):
        result = nlparser.parse(
            "Jadwalkan meeting tim marketing besok jam 10 selama 45 menit",
            today=date(2026, 7, 3),
        )
        self.assertEqual(result["intent"], "create")
        self.assertEqual(result["date"], "2026-07-04")
        self.assertEqual(result["start_time"], "10:00")
        self.assertEqual(result["duration_minutes"], 45)
        self.assertEqual(result["source"], "fallback")

    def test_intent_query(self):
        result = nlparser.parse("apa jadwal hari jumat", today=date(2026, 7, 3))
        self.assertEqual(result["intent"], "query")


class TestConflicts(unittest.TestCase):
    def test_alternatives_include_reason(self):
        events = [
            {
                "id": "1",
                "title": "Standup",
                "date": "2026-07-04",
                "start_time": "10:00",
                "duration_minutes": 60,
            }
        ]
        alts = conflicts.find_alternatives(
            events, date(2026, 7, 4), time(10, 0), 45, count=2
        )
        self.assertTrue(alts)
        self.assertIn("reason", alts[0])
        self.assertTrue(alts[0]["reason"])


if __name__ == "__main__":
    unittest.main()