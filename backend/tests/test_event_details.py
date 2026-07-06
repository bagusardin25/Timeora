import unittest
from datetime import date, time

from pydantic import ValidationError

from app.models import AssistantRequest, EventCreate, EventResponse, EventUpdate, ParseRequest


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

    def test_trims_event_title(self):
        event = self._event(title="  Product Sync  ")
        update = EventUpdate(title="  Updated Sync  ")

        self.assertEqual(event.title, "Product Sync")
        self.assertEqual(update.title, "Updated Sync")

    def test_rejects_blank_event_title(self):
        with self.assertRaises(ValidationError):
            self._event(title="   ")
        with self.assertRaises(ValidationError):
            EventUpdate(title="   ")

    def test_rejects_unsafe_location_url(self):
        with self.assertRaises(ValidationError):
            self._event(location_url="javascript:alert(1)")

    def test_normalizes_scheme_less_location_url(self):
        event = self._event(location_url=" zoom.us/j/123 ")
        update = EventUpdate(location_url="meet.google.com/abc-defg-hij")

        self.assertEqual(event.location_url, "https://zoom.us/j/123")
        self.assertEqual(update.location_url, "https://meet.google.com/abc-defg-hij")

    def test_update_normalizes_tags(self):
        update = EventUpdate(tags=["Important", " important ", "Client"])
        self.assertEqual(update.tags, ["Important", "Client"])

    def test_normalizes_unknown_category_to_other(self):
        event = self._event(category=" Work ")
        update = EventUpdate(category="Client")

        self.assertEqual(event.category, "other")
        self.assertEqual(update.category, "other")

    def test_response_normalizes_unknown_category_to_other(self):
        response = EventResponse(
            id="evt_1",
            user_id="user_1",
            title="Imported event",
            date=date(2026, 7, 6),
            start_time=time(9, 0),
            duration_minutes=30,
            participants="",
            category=" Work ",
        )

        self.assertEqual(response.category, "other")

    def test_rejects_excessive_reminder(self):
        with self.assertRaises(ValidationError):
            self._event(reminder_minutes=10081)

    def test_trims_parse_and_assistant_text(self):
        parse_request = ParseRequest(text="  jadwalkan meeting besok  ")
        assistant_request = AssistantRequest(text="  apa jadwal besok  ")

        self.assertEqual(parse_request.text, "jadwalkan meeting besok")
        self.assertEqual(assistant_request.text, "apa jadwal besok")

    def test_rejects_blank_parse_and_assistant_text(self):
        with self.assertRaises(ValidationError):
            ParseRequest(text="   ")
        with self.assertRaises(ValidationError):
            AssistantRequest(text="   ")


if __name__ == "__main__":
    unittest.main()
