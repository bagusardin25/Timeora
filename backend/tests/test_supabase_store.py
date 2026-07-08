import unittest
from datetime import date, time
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app import supabase_store
from app.models import EventResponse, EventUpdate


class _FakeResponse:
    status_code = 200

    def __init__(self, body):
        self._body = body

    def json(self):
        return self._body


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def patch(self, *args, **kwargs):
        return _FakeResponse([
            {
                "id": "move",
                "user_id": "user-1",
                "title": "Move me",
                "date": "2026-07-07",
                "start_time": "00:30:00",
                "duration_minutes": 30,
            }
        ])


def _event(
    event_id: str,
    title: str,
    event_date: date,
    start_time: time,
    duration_minutes: int,
) -> EventResponse:
    return EventResponse(
        id=event_id,
        user_id="user-1",
        title=title,
        date=event_date,
        start_time=start_time,
        duration_minutes=duration_minutes,
        participants="",
    )


class TestSupabaseStoreConflicts(unittest.IsolatedAsyncioTestCase):
    async def test_check_conflict_detects_previous_day_overnight_event(self):
        previous_day_event = _event(
            "late",
            "Late deployment",
            date(2026, 7, 6),
            time(23, 30),
            90,
        )

        with patch.object(
            supabase_store,
            "_events_for_conflict_check",
            AsyncMock(return_value=[previous_day_event]),
        ):
            conflict, title, alternatives = await supabase_store.check_conflict(
                "user-1",
                date(2026, 7, 7),
                time(0, 30),
                30,
            )

        self.assertTrue(conflict)
        self.assertEqual(title, "Late deployment")
        self.assertTrue(alternatives)

    async def test_alternatives_avoid_previous_day_overnight_event(self):
        overnight_block = _event(
            "late",
            "Late maintenance",
            date(2026, 7, 6),
            time(23, 30),
            600,
        )

        with patch.object(
            supabase_store,
            "_events_for_conflict_check",
            AsyncMock(return_value=[overnight_block]),
        ):
            conflict, title, alternatives = await supabase_store.check_conflict(
                "user-1",
                date(2026, 7, 7),
                time(8, 0),
                30,
            )

        self.assertTrue(conflict)
        self.assertEqual(title, "Late maintenance")
        self.assertTrue(alternatives)
        self.assertGreaterEqual(alternatives[0].start_time, time(9, 45))

    async def test_update_event_rejects_cross_midnight_conflict_before_request(self):
        existing_event = _event(
            "move",
            "Move me",
            date(2026, 7, 7),
            time(12, 0),
            30,
        )
        previous_day_event = _event(
            "late",
            "Late deployment",
            date(2026, 7, 6),
            time(23, 30),
            90,
        )

        with (
            patch.object(supabase_store, "get_event", AsyncMock(return_value=existing_event)),
            patch.object(
                supabase_store,
                "_events_for_conflict_check",
                AsyncMock(return_value=[previous_day_event, existing_event]),
            ),
            patch.object(supabase_store, "_base", return_value="https://example.test/rest/v1"),
            patch.object(supabase_store.httpx, "AsyncClient", _FakeAsyncClient),
        ):
            with self.assertRaises(HTTPException) as raised:
                await supabase_store.update_event(
                    "move",
                    "user-1",
                    EventUpdate(
                        date=date(2026, 7, 7),
                        start_time=time(0, 30),
                        duration_minutes=30,
                    ),
                )

        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
