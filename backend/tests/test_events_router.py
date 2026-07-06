import unittest
from datetime import date, time
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.models import EventResponse
from app.routers import events


class TestEventsRouter(unittest.IsolatedAsyncioTestCase):
    def _event(
        self,
        event_id: str,
        event_date: date,
        start_time: time,
        duration_minutes: int,
        recurrence_rule: str | None = None,
    ) -> EventResponse:
        return EventResponse(
            id=event_id,
            user_id="user-1",
            title=event_id,
            date=event_date,
            start_time=start_time,
            duration_minutes=duration_minutes,
            participants="",
            recurrence_rule=recurrence_rule,
        )

    async def test_list_events_rejects_invalid_from_date(self):
        with patch.object(events.data_access, "list_events", AsyncMock(return_value=[])):
            with self.assertRaises(HTTPException) as raised:
                await events.list_events(
                    from_date="not-a-date",
                    to_date=None,
                    q=None,
                    expand=False,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("from", raised.exception.detail)

    async def test_list_events_rejects_invalid_to_date(self):
        with patch.object(events.data_access, "list_events", AsyncMock(return_value=[])):
            with self.assertRaises(HTTPException) as raised:
                await events.list_events(
                    from_date=None,
                    to_date="2026-99-99",
                    q=None,
                    expand=False,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("to", raised.exception.detail)

    async def test_list_events_rejects_inverted_date_range(self):
        list_events = AsyncMock(return_value=[])
        with patch.object(events.data_access, "list_events", list_events):
            with self.assertRaises(HTTPException) as raised:
                await events.list_events(
                    from_date="2026-07-08",
                    to_date="2026-07-07",
                    q=None,
                    expand=False,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("from", raised.exception.detail)
        list_events.assert_not_awaited()

    async def test_list_events_includes_overnight_event_overlapping_from_date(self):
        overnight = self._event(
            "overnight",
            date(2026, 7, 6),
            time(23, 30),
            90,
        )
        stale = self._event(
            "stale",
            date(2026, 7, 6),
            time(20, 0),
            60,
        )

        with patch.object(
            events.data_access,
            "list_events",
            AsyncMock(return_value=[overnight, stale]),
        ):
            result = await events.list_events(
                from_date="2026-07-07",
                to_date="2026-07-07",
                q=None,
                expand=False,
                user={"id": "user-1"},
            )

        self.assertEqual([event.id for event in result], ["overnight"])

    async def test_expanded_recurrence_includes_previous_day_overnight_instance(self):
        recurring = self._event(
            "series",
            date(2026, 7, 1),
            time(23, 30),
            90,
            recurrence_rule="daily",
        )

        with patch.object(
            events.data_access,
            "list_events",
            AsyncMock(return_value=[recurring]),
        ):
            result = await events.list_events(
                from_date="2026-07-07",
                to_date="2026-07-07",
                q=None,
                expand=True,
                user={"id": "user-1"},
            )

        self.assertEqual(
            [event.id for event in result],
            ["series_2026-07-06", "series_2026-07-07"],
        )


if __name__ == "__main__":
    unittest.main()
