"""
Multi-intent assistant endpoint.

Handles reschedule, cancel, query, and find_slot intents
that the Command Bar now supports in addition to create.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app import data_access
from app.core import nlparser, conflicts as conflicts_engine
from app.models import AssistantRequest, AssistantResponse

router = APIRouter()


@router.post("/assistant", response_model=AssistantResponse)
async def assistant(body: AssistantRequest, user: dict = Depends(get_current_user)):
    """Execute a multi-intent command from the Command Bar."""
    parsed = nlparser.parse(body.text, today=datetime.now().date())
    intent = parsed["intent"]

    if intent == "create":
        # For create intent, redirect to /parse — the assistant
        # endpoint handles the other four intents.
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


async def _handle_query(user: dict, parsed: dict) -> AssistantResponse:
    """Search events for the parsed date."""
    from datetime import date

    target_date = parsed.get("date")
    if isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)

    all_events = await data_access.list_events(user["id"])
    matching = []
    for ev in all_events:
        ev_date = ev.date if hasattr(ev, "date") else ev.get("date")
        if isinstance(ev_date, str):
            ev_date = date.fromisoformat(ev_date)
        if ev_date == target_date:
            if hasattr(ev, "model_dump"):
                matching.append(ev.model_dump(mode="json"))
            else:
                matching.append(ev)

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
    """Find free time slots on the parsed date."""
    from datetime import date, time

    target_date = parsed.get("date")
    if isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)

    duration = parsed.get("duration_minutes", 60)

    # Get existing events as dicts
    all_events = await data_access.list_events(user["id"])
    event_dicts = []
    for ev in all_events:
        if hasattr(ev, "model_dump"):
            event_dicts.append(ev.model_dump(mode="json"))
        elif isinstance(ev, dict):
            event_dicts.append(ev)

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
    """Find matching event(s) to cancel (soft-delete)."""
    title_query = parsed.get("title", "").lower()
    all_events = await data_access.list_events(user["id"])

    matches = []
    for ev in all_events:
        ev_title = ev.title if hasattr(ev, "title") else ev.get("title", "")
        if title_query and title_query in ev_title.lower():
            if hasattr(ev, "model_dump"):
                matches.append(ev.model_dump(mode="json"))
            else:
                matches.append(ev)

    if not matches:
        return AssistantResponse(
            intent="cancel",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to cancel.",
        )

    # Return matches for user to confirm
    return AssistantResponse(
        intent="cancel",
        result=matches,
        message=f"Found {len(matches)} event(s) matching '{parsed.get('title', '')}'. Confirm to cancel.",
    )


async def _handle_reschedule(user: dict, parsed: dict) -> AssistantResponse:
    """Find matching event(s) to reschedule."""
    title_query = parsed.get("title", "").lower()
    all_events = await data_access.list_events(user["id"])

    matches = []
    for ev in all_events:
        ev_title = ev.title if hasattr(ev, "title") else ev.get("title", "")
        if title_query and title_query in ev_title.lower():
            if hasattr(ev, "model_dump"):
                matches.append(ev.model_dump(mode="json"))
            else:
                matches.append(ev)

    if not matches:
        return AssistantResponse(
            intent="reschedule",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to reschedule.",
        )

    return AssistantResponse(
        intent="reschedule",
        result={
            "events": matches,
            "new_date": parsed.get("date"),
            "new_time": parsed.get("start_time"),
        },
        message=f"Found {len(matches)} event(s) to reschedule to {parsed.get('date')} {parsed.get('start_time')}.",
    )
