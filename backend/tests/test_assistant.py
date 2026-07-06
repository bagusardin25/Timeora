import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.core import assistant_tools
from app.models import AssistantRequest, EventResponse
from app.routers import assistant


def event(event_id: str, title: str, hour: int) -> EventResponse:
    return EventResponse(
        id=event_id,
        user_id="user-1",
        title=title,
        date="2026-07-06",
        start_time=f"{hour:02d}:00:00",
        duration_minutes=60,
        participants="",
    )


class TestAssistantClarification(unittest.IsolatedAsyncioTestCase):
    async def test_ambiguous_cancel_returns_choices(self):
        events = [event("one", "Team Sync", 10), event("two", "Team Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_cancel(
                {"id": "user-1"},
                {"title": "Team Sync", "date": None},
            )

        self.assertFalse(response.requires_confirmation)
        self.assertEqual(response.clarification["type"], "event_selection")
        self.assertEqual([choice["id"] for choice in response.clarification["choices"]], ["one", "two"])

    async def test_selected_ambiguous_event_can_be_confirmed(self):
        events = [event("one", "Team Sync", 10), event("two", "Team Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_cancel(
                {"id": "user-1"},
                {"title": "Team Sync", "date": None},
                selected_event_id="two",
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["primary_event_id"], "two")

    async def test_query_exposes_structured_events(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_query(
                {"id": "user-1"},
                {"date": "2026-07-06"},
            )

        self.assertEqual(response.events[0]["title"], "Product Sync")
        self.assertIn("open_event", response.suggested_actions)

    async def test_update_preview_returns_confirmation_with_event_data(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_update(
                {"id": "user-1"},
                {
                    "title": "Product Sync",
                    "date": None,
                    "event_data": {"priority": "important"},
                },
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.intent, "update")
        self.assertEqual(response.result["primary_event_id"], "one")
        self.assertEqual(response.result["event_data"], {"priority": "important"})


class TestAssistantNativeTools(unittest.IsolatedAsyncioTestCase):
    async def test_confirmed_create_uses_calendar_data_access(self):
        created = event("new", "Planning", 9)
        body = AssistantRequest(
            confirm=True,
            action="create",
            event_data={
                "title": "Planning",
                "date": "2026-07-07",
                "start_time": "09:00:00",
                "duration_minutes": 30,
            },
        )
        with patch.object(
            assistant.data_access,
            "create_event",
            AsyncMock(return_value=created),
        ) as create_event:
            response = await assistant._execute_confirmed({"id": "user-1"}, body)

        self.assertTrue(response.executed)
        self.assertEqual(response.intent, "create")
        self.assertEqual(create_event.await_args.args[0], "user-1")

    async def test_reschedule_rejects_invalid_time_as_bad_request(self):
        body = AssistantRequest(
            confirm=True,
            action="reschedule",
            event_id="event-1",
            new_date="2026-07-07",
            new_time="not-a-time",
        )
        with patch.object(assistant_tools.data_access, "update_event", AsyncMock()) as update_event:
            with self.assertRaises(HTTPException) as raised:
                await assistant_tools.execute_calendar_tool("user-1", body)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("new_date and new_time", raised.exception.detail)
        update_event.assert_not_awaited()

    async def test_reschedule_rejects_invalid_date_as_bad_request(self):
        body = AssistantRequest(
            confirm=True,
            action="reschedule",
            event_id="event-1",
            new_date="not-a-date",
            new_time="09:00",
        )
        with patch.object(assistant_tools.data_access, "update_event", AsyncMock()) as update_event:
            with self.assertRaises(HTTPException) as raised:
                await assistant_tools.execute_calendar_tool("user-1", body)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("new_date and new_time", raised.exception.detail)
        update_event.assert_not_awaited()

    async def test_create_rejects_invalid_event_data_as_bad_request(self):
        body = AssistantRequest(
            confirm=True,
            action="create",
            event_data={
                "date": "2026-07-07",
                "start_time": "09:00:00",
                "duration_minutes": 30,
            },
        )
        with patch.object(assistant_tools.data_access, "create_event", AsyncMock()) as create_event:
            with self.assertRaises(HTTPException) as raised:
                await assistant_tools.execute_calendar_tool("user-1", body)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Invalid event data", raised.exception.detail)
        create_event.assert_not_awaited()

    async def test_update_rejects_invalid_event_data_as_bad_request(self):
        body = AssistantRequest(
            confirm=True,
            action="update",
            event_id="event-1",
            event_data={"reminder_minutes": 10081},
        )
        with patch.object(assistant_tools.data_access, "update_event", AsyncMock()) as update_event:
            with self.assertRaises(HTTPException) as raised:
                await assistant_tools.execute_calendar_tool("user-1", body)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Invalid event data", raised.exception.detail)
        update_event.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
