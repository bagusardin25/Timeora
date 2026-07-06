import unittest
from datetime import date, time

from pydantic import ValidationError

from app.models import EventCreate, EventUpdate


class TestEventDetails(unittest.TestCase):
    def _event(self, **overrides):
        values = {
            "title": "Product Sync",
            "date": date(2026, 7, 6),
            "start_time": time(14, 0),
            "duration_minutes": 60,
        }
        values.update(overrides)
        return EventCreate(**values)

    def test_normalizes_rich_event_fields(self):
        event = self._event(
            description="Roadmap review",
            location_url="https://zoom.us/j/123",
            priority="important",
            tags=[" Work ", "planning", "work", ""],
            reminder_minutes=15,
        )

        self.assertEqual(event.description, "Roadmap review")
        self.assertEqual(event.location_url, "https://zoom.us/j/123")
        self.assertEqual(event.priority, "important")
        self.assertEqual(event.tags, ["Work", "planning"])
        self.assertEqual(event.reminder_minutes, 15)

    def test_rejects_unsafe_location_url(self):
        with self.assertRaises(ValidationError):
            self._event(location_url="javascript:alert(1)")

    def test_update_normalizes_tags(self):
        update = EventUpdate(tags=["Important", " important ", "Client"])
        self.assertEqual(update.tags, ["Important", "Client"])

    def test_rejects_excessive_reminder(self):
        with self.assertRaises(ValidationError):
            self._event(reminder_minutes=10081)


if __name__ == "__main__":
    unittest.main()
