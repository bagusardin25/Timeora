"""
Multi-intent assistant endpoint.

Handles reschedule, cancel, query, and find_slot intents.
Tier 3: confirm + execute for cancel/reschedule.
"""

from __future__ import annotations

from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app import data_access
from app.core import nlparser, conflicts as conflicts_engine
from app.models import AssistantRequest, AssistantResponse, EventUpdate

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
        return date.fromisoformat(value[:10])
    return None


def _parse_time_value(value: str | None) -> time | None:
    if not value:
        return None
    parts = value.split(":")
    h, m = int(parts[0]), int(parts[1])
    s = int(parts[2]) if len(parts) > 2 else 0
    return time(h, m, s)


def _find_matches(all_events, parsed: dict) -> list[dict]:
    """Match events by title substring and optional parsed date."""
    title_query = (parsed.get("title") or "").lower().strip()
    target_date = _parse_date_value(parsed.get("date"))
    matches: list[dict] = []

    for ev in all_events:
        ev_dict = _event_to_dict(ev)
        ev_title = (ev_dict.get("title") or "").lower()
        if title_query and title_query not in ev_title:
            continue
        if target_date is not None:
            ev_date = _parse_date_value(ev_dict.get("date"))
            if ev_date != target_date:
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
            result=parsed,
            message="Use the parse endpoint to create events.",
        )

    if intent == "query":
        return await _handle_query(user, parsed)

    if intent == "find_slot":
        return await _handle_find_slot(user, parsed)

    if intent == "cancel":
        return await _handle_cancel(user, parsed)

    if intent == "reschedule":
        return await _handle_reschedule(user, parsed)

    return AssistantResponse(
        intent=intent,
        result=None,
        message=f"Unknown intent: {intent}",
    )


async def _execute_confirmed(user: dict, body: AssistantRequest) -> AssistantResponse:
    if not body.event_id or not body.action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="event_id and action are required when confirm=true",
        )

    base_id = body.event_id.split("_")[0]

    if body.action == "cancel":
        await data_access.delete_event(base_id, user["id"])
        return AssistantResponse(
            intent="cancel",
            result={"event_id": base_id, "deleted": True},
            message="Event cancelled.",
            executed=True,
        )

    if body.action == "reschedule":
        if not body.new_date or not body.new_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="new_date and new_time are required for reschedule",
            )
        new_time = _parse_time_value(body.new_time)
        if new_time is None:
            raise HTTPException(status_code=400, detail="Invalid new_time")
        updated = await data_access.update_event(
            base_id,
            user["id"],
            EventUpdate(
                date=date.fromisoformat(body.new_date[:10]),
                start_time=new_time,
            ),
        )
        return AssistantResponse(
            intent="reschedule",
            result=_event_to_dict(updated),
            message=f"Rescheduled to {body.new_date} {body.new_time}.",
            executed=True,
        )

    raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")


async def _handle_query(user: dict, parsed: dict) -> AssistantResponse:
    target_date = _parse_date_value(parsed.get("date"))
    if target_date is None:
        target_date = datetime.now().date()

    all_events = await data_access.list_events(user["id"])
    matching = []
    for ev in all_events:
        ev_date = _parse_date_value(
            ev.date if hasattr(ev, "date") else ev.get("date")
        )
        if ev_date == target_date:
            matching.append(_event_to_dict(ev))

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
    )


async def _handle_find_slot(user: dict, parsed: dict) -> AssistantResponse:
    target_date = _parse_date_value(parsed.get("date"))
    if target_date is None:
        target_date = datetime.now().date()

    duration = parsed.get("duration_minutes", 60)
    all_events = await data_access.list_events(user["id"])
    event_dicts = [_event_to_dict(ev) for ev in all_events]

    requested_time_str = parsed.get("start_time", "09:00")
    parts = requested_time_str.split(":")
    requested_time = time(int(parts[0]), int(parts[1]))

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


async def _handle_cancel(user: dict, parsed: dict) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _find_matches(all_events, parsed)

    if not matches:
        return AssistantResponse(
            intent="cancel",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to cancel.",
        )

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
    )


async def _handle_reschedule(user: dict, parsed: dict) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _find_matches(all_events, parsed)

    if not matches:
        return AssistantResponse(
            intent="reschedule",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to reschedule.",
        )

    primary = matches[0]
    new_date = parsed.get("date")
    new_time = parsed.get("start_time")
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
    )