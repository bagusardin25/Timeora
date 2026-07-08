"""
Multi-intent assistant endpoint.

Handles reschedule, cancel, query, and find_slot intents.
Tier 3: confirm + execute for cancel/reschedule.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app import data_access
from app.core import assistant_tools, nlparser, conflicts as conflicts_engine
from app.event_ids import base_event_id
from app.models import AssistantRequest, AssistantResponse

router = APIRouter()


def _event_to_dict(ev) -> dict:
    if hasattr(ev, "model_dump"):
        return ev.model_dump(mode="json")
    return ev


def _parse_date_value(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _parse_time_value(value: str | None) -> time | None:
    if not value:
        return None
    try:
        parts = value.split(":")
        h, m = int(parts[0]), int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
        return time(h, m, s)
    except (TypeError, ValueError, IndexError):
        return None


def _event_overlaps_date(ev: dict, target_date: date) -> bool:
    event_date = _parse_date_value(ev.get("date"))
    event_time = _parse_time_value(ev.get("start_time"))
    if event_date is None or event_time is None:
        return False
    try:
        duration = int(ev.get("duration_minutes") or 0)
    except (TypeError, ValueError):
        return False
    if duration <= 0:
        return False

    event_start = datetime.combine(event_date, event_time)
    event_end = event_start + timedelta(minutes=duration)
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)
    return event_start < day_end and event_end > day_start


def _find_matches(all_events, parsed: dict, *, use_date_filter: bool = True) -> list[dict]:
    """Match events by title substring and optional parsed date."""
    title_query = (parsed.get("title") or "").lower().strip()
    target_date = _parse_date_value(parsed.get("date"))
    matches: list[dict] = []

    for ev in all_events:
        ev_dict = _event_to_dict(ev)
        ev_title = (ev_dict.get("title") or "").lower()
        if title_query and title_query not in ev_title:
            continue
        if use_date_filter and target_date is not None and not _event_overlaps_date(ev_dict, target_date):
            continue
        matches.append(ev_dict)

    return matches


@router.post("/assistant", response_model=AssistantResponse)
async def assistant(body: AssistantRequest, user: dict = Depends(get_current_user)):
    """Execute or preview a multi-intent command from the Command Bar."""
    if body.confirm:
        return await _execute_confirmed(user, body)

    if not body.text or not body.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="text is required unless confirm=true",
        )

    parsed = nlparser.parse(body.text, today=datetime.now().date())
    intent = parsed["intent"]

    if intent == "create":
        return AssistantResponse(
            intent="create",
            result={"tool": "create", "event_data": parsed},
            message=f"Create \"{parsed.get('title', 'Event')}\"? Confirm to add it to your calendar.",
            requires_confirmation=True,
            suggested_actions=["confirm", "edit"],
        )

    if intent == "query":
        return await _handle_query(user, parsed)

    if intent == "find_slot":
        return await _handle_find_slot(user, parsed)

    if intent == "cancel":
        return await _handle_cancel(user, parsed, body.selected_event_id or body.context_event_id)

    if intent == "reschedule":
        return await _handle_reschedule(user, parsed, body.selected_event_id or body.context_event_id)

    if intent == "update":
        return await _handle_update(user, parsed, body.selected_event_id or body.context_event_id)

    return AssistantResponse(
        intent=intent,
        result=None,
        message=f"Unknown intent: {intent}",
    )


async def _execute_confirmed(user: dict, body: AssistantRequest) -> AssistantResponse:
    intent, result = await assistant_tools.execute_calendar_tool(user["id"], body)
    serialized = _event_to_dict(result)
    messages = {
        "create": "Event added to your calendar.",
        "cancel": "Event cancelled.",
        "reschedule": f"Event rescheduled to {body.new_date} {body.new_time}.",
        "update": "Event updated.",
    }
    return AssistantResponse(
        intent=intent,
        result=serialized,
        message=messages[intent],
        executed=True,
        events=[serialized] if isinstance(serialized, dict) and not serialized.get("deleted") else [],
        suggested_actions=["open_event"] if intent != "cancel" else [],
    )


async def _handle_query(user: dict, parsed: dict) -> AssistantResponse:
    target_date = _parse_date_value(parsed.get("date"))
    if target_date is None:
        target_date = datetime.now().date()

    all_events = await data_access.list_events_window(
        user["id"],
        target_date - timedelta(days=1),
        target_date,
    )
    matching = []
    for ev in all_events:
        ev_dict = _event_to_dict(ev)
        if _event_overlaps_date(ev_dict, target_date):
            matching.append(ev_dict)

    if not matching:
        return AssistantResponse(
            intent="query",
            result=[],
            message=f"No events found on {target_date.isoformat()}.",
        )

    return AssistantResponse(
        intent="query",
        result=matching,
        message=f"Found {len(matching)} event(s) on {target_date.isoformat()}.",
        events=matching,
        suggested_actions=["open_event", "find_free_slot"],
    )


async def _handle_find_slot(user: dict, parsed: dict) -> AssistantResponse:
    target_date = _parse_date_value(parsed.get("date"))
    if target_date is None:
        target_date = datetime.now().date()

    duration = parsed.get("duration_minutes", 60)
    all_events = await data_access.list_events_window(
        user["id"],
        target_date - timedelta(days=1),
        target_date,
    )
    event_dicts = [_event_to_dict(ev) for ev in all_events]

    requested_time_str = parsed.get("start_time", "09:00")
    requested_time = _parse_time_value(requested_time_str) or time(9, 0)

    alternatives = conflicts_engine.find_alternatives(
        event_dicts, target_date, requested_time, duration, count=5
    )

    if not alternatives:
        return AssistantResponse(
            intent="find_slot",
            result=[],
            message=f"No free {duration}-minute slots found on {target_date.isoformat()}.",
        )

    return AssistantResponse(
        intent="find_slot",
        result=alternatives,
        message=f"Found {len(alternatives)} free slot(s) for {duration} minutes on {target_date.isoformat()}.",
    )


def _clarification(matches: list[dict], action: str) -> AssistantResponse:
    choices = [
        {
            "id": item["id"],
            "title": item.get("title", "Event"),
            "date": item.get("date"),
            "start_time": item.get("start_time"),
        }
        for item in matches
    ]
    return AssistantResponse(
        intent=action,
        result={"events": matches},
        message="I found more than one matching event. Which one did you mean?",
        clarification={
            "type": "event_selection",
            "prompt": "Which event did you mean?",
            "choices": choices,
        },
        events=matches,
        suggested_actions=["select_event"],
    )


def _selected_match(matches: list[dict], selected_event_id: str | None) -> list[dict]:
    if not selected_event_id:
        return matches
    base_id = base_event_id(selected_event_id)
    return [item for item in matches if base_event_id(str(item.get("id", ""))) == base_id]


def _action_matches(
    all_events,
    parsed: dict,
    selected_event_id: str | None = None,
    *,
    use_date_filter: bool = True,
) -> list[dict]:
    if selected_event_id:
        return _selected_match([_event_to_dict(ev) for ev in all_events], selected_event_id)
    return _find_matches(all_events, parsed, use_date_filter=use_date_filter)


async def _handle_cancel(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(all_events, parsed, selected_event_id)

    if not matches:
        return AssistantResponse(
            intent="cancel",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to cancel.",
        )

    if len(matches) > 1:
        return _clarification(matches, "cancel")

    primary = matches[0]
    return AssistantResponse(
        intent="cancel",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
        },
        message=f"Cancel \"{primary.get('title', 'Event')}\"? Confirm to proceed.",
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "cancel"],
    )


async def _handle_reschedule(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(
        all_events,
        parsed,
        selected_event_id,
        use_date_filter=False,
    )

    if not matches:
        return AssistantResponse(
            intent="reschedule",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to reschedule.",
        )

    if len(matches) > 1:
        return _clarification(matches, "reschedule")

    primary = matches[0]
    new_date = parsed.get("date")
    new_time = parsed.get("start_time")
    if not new_date or not new_time:
        return AssistantResponse(
            intent="reschedule",
            result={"events": matches, "primary_event_id": primary["id"]},
            message=(
                f"I found \"{primary.get('title', 'Event')}\", but I need the new date and time "
                "before I can reschedule it."
            ),
            events=matches,
            suggested_actions=["edit"],
        )

    new_date_value = _parse_date_value(new_date)
    new_time_value = _parse_time_value(new_time)
    if new_date_value is None or new_time_value is None:
        return AssistantResponse(
            intent="reschedule",
            result={"events": matches, "primary_event_id": primary["id"]},
            message=(
                f"I found \"{primary.get('title', 'Event')}\", but I need a valid new date and time "
                "before I can reschedule it."
            ),
            events=matches,
            suggested_actions=["edit"],
        )

    new_date = new_date_value.isoformat()
    new_time = new_time_value.strftime("%H:%M:%S")
    return AssistantResponse(
        intent="reschedule",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
            "new_date": new_date,
            "new_time": new_time,
        },
        message=(
            f"Reschedule \"{primary.get('title', 'Event')}\" to "
            f"{new_date} {new_time}? Confirm to proceed."
        ),
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "cancel"],
    )


async def _handle_update(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(all_events, parsed, selected_event_id)

    if not matches:
        return AssistantResponse(
            intent="update",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to update.",
        )

    if len(matches) > 1:
        return _clarification(matches, "update")

    event_data = parsed.get("event_data") or {}
    if not isinstance(event_data, dict) or not event_data:
        return AssistantResponse(
            intent="update",
            result={"events": matches},
            message="I found the event, but I need more detail about what to update.",
            events=matches,
            suggested_actions=["edit"],
        )

    primary = matches[0]
    return AssistantResponse(
        intent="update",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
            "event_data": event_data,
        },
        message=f"Update \"{primary.get('title', 'Event')}\"? Confirm to proceed.",
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "edit"],
    )
