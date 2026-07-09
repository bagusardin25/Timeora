import unittest
from datetime import date, time
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


def event_on(
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

    async def test_selected_recurring_instance_preserves_underscored_base_id(self):
        events = [
            event("team_sync", "Team Sync", 10),
            event("team_review", "Team Sync", 14),
        ]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_cancel(
                {"id": "user-1"},
                {"title": "Team Sync", "date": None},
                selected_event_id="team_sync_2026-07-06",
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["primary_event_id"], "team_sync")

    async def test_context_event_can_be_cancelled_without_title_match(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_cancel(
                {"id": "user-1"},
                {"title": "this", "date": None},
                selected_event_id="one",
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["primary_event_id"], "one")

    async def test_query_exposes_structured_events(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events_window", AsyncMock(return_value=events)):
            response = await assistant._handle_query(
                {"id": "user-1"},
                {"date": "2026-07-06"},
            )

        self.assertEqual(response.events[0]["title"], "Product Sync")
        self.assertIn("open_event", response.suggested_actions)

    async def test_query_includes_events_overlapping_target_day(self):
        events = [
            event_on(
                "overnight",
                "Late deployment",
                date(2026, 7, 5),
                time(23, 30),
                90,
            )
        ]
        with patch.object(assistant.data_access, "list_events_window", AsyncMock(return_value=events)):
            response = await assistant._handle_query(
                {"id": "user-1"},
                {"date": "2026-07-06"},
            )

        self.assertEqual(response.message, "Found 1 event(s) on 2026-07-06.")
        self.assertEqual(response.events[0]["id"], "overnight")

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

    async def test_context_event_can_be_updated_without_title_match(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_update(
                {"id": "user-1"},
                {
                    "title": "this",
                    "date": None,
                    "event_data": {"priority": "important"},
                },
                selected_event_id="one",
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["primary_event_id"], "one")
        self.assertEqual(response.result["event_data"], {"priority": "important"})

    async def test_reschedule_preview_requires_new_date_and_time(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_reschedule(
                {"id": "user-1"},
                {"title": "Product Sync", "date": None, "start_time": None},
            )

        self.assertFalse(response.requires_confirmation)
        self.assertEqual(response.intent, "reschedule")
        self.assertIn("new date and time", response.message)
        self.assertIn("edit", response.suggested_actions)

    async def test_reschedule_preview_requires_valid_new_date_and_time(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_reschedule(
                {"id": "user-1"},
                {
                    "title": "Product Sync",
                    "date": "not-a-date",
                    "start_time": "not-a-time",
                },
            )

        self.assertFalse(response.requires_confirmation)
        self.assertEqual(response.intent, "reschedule")
        self.assertIn("valid new date and time", response.message)
        self.assertIn("edit", response.suggested_actions)

    async def test_reschedule_matches_event_by_title_not_new_target_date(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_reschedule(
                {"id": "user-1"},
                {
                    "title": "Product Sync",
                    "date": "2026-07-07",
                    "start_time": "15:00",
                },
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["primary_event_id"], "one")
        self.assertEqual(response.result["new_date"], "2026-07-07")
        self.assertEqual(response.result["new_time"], "15:00:00")

    async def test_context_event_can_be_rescheduled_without_title_match(self):
        events = [event("one", "Product Sync", 14)]
        with patch.object(assistant.data_access, "list_events", AsyncMock(return_value=events)):
            response = await assistant._handle_reschedule(
                {"id": "user-1"},
                {
                    "title": "this",
                    "date": "2026-07-07",
                    "start_time": "15:00",
                },
                selected_event_id="one",
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["primary_event_id"], "one")
        self.assertEqual(response.result["new_date"], "2026-07-07")
        self.assertEqual(response.result["new_time"], "15:00:00")

    async def test_find_slot_ignores_invalid_requested_time(self):
        with patch.object(assistant.data_access, "list_events_window", AsyncMock(return_value=[])):
            response = await assistant._handle_find_slot(
                {"id": "user-1"},
                {
                    "date": "2026-07-06",
                    "start_time": "not-a-time",
                    "duration_minutes": 60,
                },
            )

        self.assertEqual(response.intent, "find_slot")
        self.assertIsInstance(response.result, dict)
        self.assertGreater(len(response.result["slots"]), 0)

    async def test_help_intent_lists_capabilities(self):
        response = assistant._handle_help()
        self.assertEqual(response.intent, "help")
        self.assertIn("asisten kalender", response.message.lower())
        self.assertIn("find_free_slot", response.suggested_actions)

    async def test_conflict_recovery_returns_alternative_slots(self):
        body = AssistantRequest(
            confirm=True,
            action="create",
            event_data={
                "title": "Meeting",
                "date": "2026-07-10",
                "start_time": "09:00:00",
                "duration_minutes": 60,
            },
        )
        response = assistant._conflict_recovery_response(
            body,
            {
                "message": "Time slot conflicts with existing event",
                "conflicting_event": "Standup",
                "alternatives": [
                    {"start_time": "10:00", "duration_minutes": 60, "reason": "Same day, 60 min later"},
                    {"start_time": "10:30", "duration_minutes": 60, "reason": "Same day, 90 min later"},
                ],
            },
        )
        self.assertEqual(response.intent, "conflict")
        self.assertIn("Standup", response.message)
        self.assertEqual(len(response.result["slots"]), 2)
        self.assertEqual(response.result["slots"][0]["start_time"], "10:00")

    async def test_create_auto_picks_free_slot_when_default_time_conflicts(self):
        busy = [event_on("busy", "Standup", date(2026, 7, 10), time(9, 0), 60)]
        with patch.object(assistant.data_access, "list_events_window", AsyncMock(return_value=busy)):
            response = await assistant._handle_create(
                {"id": "user-1"},
                {
                    "title": "Meeting",
                    "date": "2026-07-10",
                    "start_time": "09:00",
                    "duration_minutes": 60,
                    "time_explicit": False,
                    "prefer_free_slot": True,
                    "participants": "",
                    "warnings": ["No time found — defaulting to 09:00"],
                },
            )

        self.assertTrue(response.requires_confirmation)
        self.assertEqual(response.result["event_data"]["title"], "Meeting")
        self.assertEqual(response.result["event_data"]["date"], "2026-07-10")
        # 09:00 is busy → must not propose the conflicting default.
        self.assertNotEqual(response.result["event_data"]["start_time"][:5], "09:00")
        self.assertTrue(response.result["auto_adjusted"])
        self.assertGreater(len(response.result["alternatives"]), 0)


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

    async def test_confirmed_create_maps_parser_recurrence_to_event_field(self):
        created = event("new", "Weekly Standup", 9)
        body = AssistantRequest(
            confirm=True,
            action="create",
            event_data={
                "title": "Weekly Standup",
                "date": "2026-07-07",
                "start_time": "09:00",
                "duration_minutes": 30,
                "recurrence": "weekly:senin",
            },
        )
        with patch.object(
            assistant.data_access,
            "create_event",
            AsyncMock(return_value=created),
        ) as create_event:
            await assistant._execute_confirmed({"id": "user-1"}, body)

        created_body = create_event.await_args.args[1]
        self.assertEqual(created_body.recurrence_rule, "weekly:senin")

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

    async def test_confirmed_cancel_preserves_underscored_recurring_base_id(self):
        body = AssistantRequest(
            confirm=True,
            action="cancel",
            event_id="team_sync_2026-07-06",
        )
        with patch.object(assistant_tools.data_access, "delete_event", AsyncMock()) as delete_event:
            intent, result = await assistant_tools.execute_calendar_tool("user-1", body)

        self.assertEqual(intent, "cancel")
        self.assertEqual(result["event_id"], "team_sync")
        delete_event.assert_awaited_once_with("team_sync", "user-1")

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
