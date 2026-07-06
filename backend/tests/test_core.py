import unittest
import warnings
from datetime import date, time
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from app import data_access
from app.core.analytics import plan_block_focus_time, weekly_summary
from app.core.availability import availability_heatmap
from app.core.conflicts import check_conflicts, find_alternatives
from app.core.ics_export import generate_ics
from app.core.nlparser import parse
from app.core.recurrence import expand_recurrence, parse_recurrence
from app.models import AlternativeSlot, EventResponse, EventUpdate


class TestNaturalLanguageParser(unittest.TestCase):
    today = date(2026, 7, 4)

    def test_parses_english_date_time_and_duration(self):
        result = parse(
            "Schedule product review tomorrow at 3:30pm for 90 minutes",
            today=self.today,
        )

        self.assertEqual(result["intent"], "create")
        self.assertEqual(result["date"], "2026-07-05")
        self.assertEqual(result["start_time"], "15:30")
        self.assertEqual(result["duration_minutes"], 90)

    def test_parses_indonesian_day_after_tomorrow(self):
        result = parse("jadwalkan demo lusa jam 2 siang selama 30 menit", self.today)

        self.assertEqual(result["date"], "2026-07-06")
        self.assertEqual(result["start_time"], "14:00")
        self.assertEqual(result["duration_minutes"], 30)

    def test_parses_english_day_after_tomorrow_before_tomorrow(self):
        result = parse("review day after tomorrow at 11am", self.today)

        self.assertEqual(result["date"], "2026-07-06")

    def test_cancel_without_date_matches_by_title(self):
        result = parse("batalkan lunch", self.today)

        self.assertEqual(result["intent"], "cancel")
        self.assertIsNone(result["date"])
        self.assertEqual(result["title"].lower(), "lunch")

    def test_detects_find_slot_intent(self):
        result = parse("cari waktu kosong 2 jam besok", self.today)

        self.assertEqual(result["intent"], "find_slot")
        self.assertEqual(result["duration_minutes"], 120)
        self.assertEqual(result["date"], "2026-07-05")

    def test_extracts_weekly_recurrence(self):
        result = parse("standup setiap senin jam 9 pagi", self.today)

        self.assertEqual(result["recurrence"], "weekly:senin")
        self.assertEqual(result["start_time"], "09:00")

    def test_defaults_create_and_emits_warnings(self):
        result = parse("focus session", self.today)

        self.assertEqual(result["date"], "2026-07-04")
        self.assertEqual(result["start_time"], "09:00")
        self.assertEqual(result["duration_minutes"], 60)
        self.assertEqual(len(result["warnings"]), 3)

    def test_detects_priority_update_intent(self):
        result = parse("make Product Sync important", self.today)

        self.assertEqual(result["intent"], "update")
        self.assertEqual(result["title"], "Product Sync")
        self.assertEqual(result["event_data"], {"priority": "important"})

    def test_detects_description_update_intent(self):
        result = parse("set Product Sync description to Bring Q3 notes", self.today)

        self.assertEqual(result["intent"], "update")
        self.assertEqual(result["title"], "Product Sync")
        self.assertEqual(result["event_data"], {"description": "Bring Q3 notes"})

    def test_detects_tag_update_intent(self):
        result = parse("tag Product Sync with client, roadmap", self.today)

        self.assertEqual(result["intent"], "update")
        self.assertEqual(result["title"], "Product Sync")
        self.assertEqual(result["event_data"], {"tags": ["client", "roadmap"]})

    def test_detects_reminder_update_intent(self):
        result = parse("set Product Sync reminder to 30 minutes", self.today)

        self.assertEqual(result["intent"], "update")
        self.assertEqual(result["title"], "Product Sync")
        self.assertEqual(result["event_data"], {"reminder_minutes": 30})


class TestConflictEngine(unittest.TestCase):
    event_date = date(2026, 7, 6)
    events = [
        {
            "id": "event-1",
            "title": "Standup",
            "date": "2026-07-06",
            "start_time": "10:00",
            "duration_minutes": 60,
        }
    ]

    def test_detects_overlap_with_buffer(self):
        hits = check_conflicts(
            self.events,
            self.event_date,
            time(9, 55),
            10,
        )

        self.assertEqual(len(hits), 1)

    def test_excludes_current_event_on_update(self):
        hits = check_conflicts(
            self.events,
            self.event_date,
            time(10, 0),
            60,
            exclude_id="event-1",
        )

        self.assertEqual(hits, [])

    def test_alternatives_are_ranked_and_explained(self):
        alternatives = find_alternatives(
            self.events,
            self.event_date,
            time(10, 0),
            60,
            count=3,
        )

        self.assertEqual(len(alternatives), 3)
        self.assertTrue(all(slot["reason"] for slot in alternatives))
        self.assertNotEqual(alternatives[0]["start_time"], "10:00")

    def test_lunch_slots_are_deprioritized(self):
        alternatives = find_alternatives(
            [],
            self.event_date,
            time(12, 0),
            60,
            count=1,
        )

        self.assertFalse(alternatives[0]["start_time"].startswith("12:"))

    def test_detects_previous_day_event_crossing_midnight(self):
        hits = check_conflicts(
            [
                {
                    "id": "overnight",
                    "title": "Late deployment",
                    "date": "2026-07-05",
                    "start_time": "23:30",
                    "duration_minutes": 90,
                }
            ],
            self.event_date,
            time(0, 30),
            30,
        )

        self.assertEqual([item["id"] for item in hits], ["overnight"])

    def test_detects_next_day_event_when_new_slot_crosses_midnight(self):
        hits = check_conflicts(
            [
                {
                    "id": "early-call",
                    "title": "Early call",
                    "date": "2026-07-07",
                    "start_time": "00:30",
                    "duration_minutes": 30,
                }
            ],
            self.event_date,
            time(23, 30),
            90,
        )

        self.assertEqual([item["id"] for item in hits], ["early-call"])

    def test_alternatives_avoid_previous_day_overnight_events(self):
        alternatives = find_alternatives(
            [
                {
                    "id": "overnight",
                    "title": "Overnight maintenance",
                    "date": "2026-07-05",
                    "start_time": "23:30",
                    "duration_minutes": 600,
                }
            ],
            self.event_date,
            time(8, 0),
            60,
            count=1,
        )

        self.assertGreaterEqual(alternatives[0]["start_time"], "09:45")


class TestRecurrenceEngine(unittest.TestCase):
    def _event(self, rule, anchor="2026-07-01"):
        return {
            "id": "series-1",
            "title": "Recurring",
            "date": anchor,
            "start_time": "09:00",
            "duration_minutes": 60,
            "recurrence_rule": rule,
        }

    def test_parse_recurrence_is_bilingual(self):
        self.assertEqual(parse_recurrence("setiap hari kerja"), "weekdays")
        self.assertEqual(parse_recurrence("every monday"), "weekly:monday")

    def test_daily_expansion_respects_range(self):
        instances = expand_recurrence(
            self._event("daily"),
            date(2026, 7, 3),
            date(2026, 7, 5),
        )

        self.assertEqual(
            [item["date"] for item in instances],
            ["2026-07-03", "2026-07-04", "2026-07-05"],
        )

    def test_weekdays_skip_weekend(self):
        instances = expand_recurrence(
            self._event("weekdays"),
            date(2026, 7, 3),
            date(2026, 7, 6),
        )

        self.assertEqual(
            [item["date"] for item in instances],
            ["2026-07-03", "2026-07-06"],
        )

    def test_specific_weekday_expansion(self):
        instances = expand_recurrence(
            self._event("weekly:monday"),
            date(2026, 7, 1),
            date(2026, 7, 20),
        )

        self.assertEqual(
            [item["date"] for item in instances],
            ["2026-07-06", "2026-07-13", "2026-07-20"],
        )

    def test_monthly_expansion_clamps_month_end(self):
        instances = expand_recurrence(
            self._event("monthly", anchor="2026-01-31"),
            date(2026, 1, 1),
            date(2026, 3, 31),
        )

        self.assertEqual(
            [item["date"] for item in instances],
            ["2026-01-31", "2026-02-28", "2026-03-31"],
        )

    def test_missing_rule_does_not_expand(self):
        self.assertEqual(
            expand_recurrence(
                self._event(None),
                date(2026, 7, 1),
                date(2026, 7, 7),
            ),
            [],
        )


class TestAnalyticsEngine(unittest.TestCase):
    reference = date(2026, 7, 8)

    def test_weekly_totals_and_deep_work(self):
        events = [
            {
                "id": "a",
                "date": "2026-07-06",
                "start_time": "09:00",
                "duration_minutes": 60,
            },
            {
                "id": "b",
                "date": "2026-07-06",
                "start_time": "10:05",
                "duration_minutes": 60,
            },
        ]

        result = weekly_summary(events, self.reference)

        self.assertEqual(result["hours_per_day"]["Mon"], 2.0)
        self.assertEqual(result["total_hours"], 2.0)
        self.assertEqual(result["deep_work_blocks"][0]["duration_minutes"], 125)

    def test_fragmentation_detects_short_gaps(self):
        events = [
            {
                "id": "a",
                "date": "2026-07-07",
                "start_time": "09:00",
                "duration_minutes": 30,
            },
            {
                "id": "b",
                "date": "2026-07-07",
                "start_time": "10:00",
                "duration_minutes": 30,
            },
        ]

        result = weekly_summary(events, self.reference)

        self.assertEqual(result["fragmentation_score"], 100.0)

    def test_empty_week_recommends_focus_action(self):
        result = weekly_summary([], self.reference)

        self.assertEqual(result["total_hours"], 0.0)
        self.assertEqual(result["actions"][0]["type"], "block_focus_time")

    def test_focus_plan_chooses_a_free_weekday(self):
        plan = plan_block_focus_time([], self.reference)

        self.assertEqual(plan["title"], "Focus Block")
        self.assertEqual(plan["duration_minutes"], 120)
        self.assertLess(plan["start_time"], time(22, 0))


class TestAvailabilityEngine(unittest.TestCase):
    reference = date(2026, 7, 8)

    def test_partial_hour_has_fractional_score(self):
        result = availability_heatmap(
            [
                {
                    "date": "2026-07-06",
                    "start_time": "09:30",
                    "duration_minutes": 30,
                }
            ],
            self.reference,
            hours=[9],
        )
        monday = next(cell for cell in result["cells"] if cell["day"] == "Mon")

        self.assertEqual(monday["score"], 0.5)

    def test_empty_calendar_is_fully_available(self):
        result = availability_heatmap([], self.reference, hours=[9, 10])

        self.assertEqual(result["availability_pct"], 100.0)
        self.assertTrue(result["best_slots"])

    def test_fully_busy_hour_is_zero(self):
        result = availability_heatmap(
            [
                {
                    "date": "2026-07-06",
                    "start_time": "09:00",
                    "duration_minutes": 60,
                }
            ],
            self.reference,
            hours=[9],
        )
        monday = next(cell for cell in result["cells"] if cell["day"] == "Mon")

        self.assertEqual(monday["score"], 0.0)


class TestIcsExport(unittest.TestCase):
    def test_generation_does_not_use_deprecated_utcnow(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error", DeprecationWarning)
            output = generate_ics([])

        self.assertIn("BEGIN:VCALENDAR", output)

    def test_generates_valid_calendar_boundaries(self):
        output = generate_ics([])

        self.assertTrue(output.startswith("BEGIN:VCALENDAR\r\n"))
        self.assertTrue(output.endswith("END:VCALENDAR"))

    def test_escapes_text_and_includes_participants(self):
        output = generate_ics(
            [
                {
                    "id": "event-1",
                    "title": "Review, plan; ship",
                    "date": "2026-07-06",
                    "start_time": "09:00",
                    "duration_minutes": 60,
                    "participants": "a@example.com,b@example.com",
                }
            ]
        )

        self.assertIn("SUMMARY:Review\\, plan\\; ship", output)
        self.assertIn(
            "DESCRIPTION:Participants: a@example.com\\,b@example.com",
            output,
        )

    def test_event_end_can_cross_midnight(self):
        output = generate_ics(
            [
                {
                    "id": "event-1",
                    "title": "Late work",
                    "date": "2026-07-06",
                    "start_time": "23:30",
                    "duration_minutes": 90,
                }
            ]
        )

        self.assertIn("DTSTART:20260706T233000", output)
        self.assertIn("DTEND:20260707T010000", output)


class TestEventUpdateConflicts(unittest.IsolatedAsyncioTestCase):
    existing = EventResponse(
        id="event-1",
        user_id="user-1",
        title="Planning",
        date=date(2026, 7, 6),
        start_time=time(9, 0),
        duration_minutes=60,
        participants="",
    )

    @patch("app.data_access._conflict_detail", new_callable=AsyncMock)
    @patch("app.data_access.get_event", new_callable=AsyncMock)
    async def test_update_rejects_conflicting_slot(
        self,
        get_event,
        conflict_detail,
    ):
        get_event.return_value = self.existing
        conflict_detail.return_value = (
            "Standup",
            [
                AlternativeSlot(
                    start_time=time(11, 0),
                    duration_minutes=60,
                    reason="Same day, 1h later",
                )
            ],
        )

        with self.assertRaises(HTTPException) as caught:
            await data_access.update_event(
                "event-1",
                "user-1",
                EventUpdate(start_time=time(10, 0)),
            )

        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(
            caught.exception.detail["conflicting_event"],
            "Standup",
        )


if __name__ == "__main__":
    unittest.main()
