"""
Weekly analytics endpoint and actionable insight apply routes.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import get_current_user
from app import data_access
from app.core.analytics import plan_block_focus_time, plan_spread_load, weekly_summary
from app.models import EventCreate, EventUpdate, InsightActionResponse, WeeklyInsight

router = APIRouter()


def _events_as_dicts(events) -> list[dict]:
    event_dicts = []
    for ev in events:
        if hasattr(ev, "model_dump"):
            event_dicts.append(ev.model_dump(mode="json"))
        else:
            event_dicts.append(ev)
    return event_dicts


def _reference_date(ref_date: str | None) -> date:
    if ref_date:
        return date.fromisoformat(ref_date)
    return datetime.now().date()


@router.get("/analytics/week", response_model=WeeklyInsight)
async def get_weekly_insights(
    ref_date: str | None = Query(None, alias="date", description="YYYY-MM-DD reference date; defaults to today"),
    user: dict = Depends(get_current_user),
):
    """Return weekly analytics for the authenticated user."""
    reference = _reference_date(ref_date)
    all_events = await data_access.list_events(user["id"])
    result = weekly_summary(_events_as_dicts(all_events), reference_date=reference)
    return WeeklyInsight(**result)


@router.post("/analytics/actions/block-focus", response_model=InsightActionResponse)
async def apply_block_focus(
    ref_date: str | None = Query(None, alias="date"),
    user: dict = Depends(get_current_user),
):
    """Create a 2-hour focus block on the lightest weekday."""
    reference = _reference_date(ref_date)
    all_events = await data_access.list_events(user["id"])
    event_dicts = _events_as_dicts(all_events)

    plan = plan_block_focus_time(event_dicts, reference_date=reference)
    created = await data_access.create_event(
        user["id"],
        EventCreate(
            title=plan["title"],
            date=plan["date"],
            start_time=plan["start_time"],
            duration_minutes=plan["duration_minutes"],
            participants="",
        ),
    )
    return InsightActionResponse(
        action_type="block_focus_time",
        message=f"Focus block added on {plan['day']} at {plan['start_time'].strftime('%H:%M')}.",
        event=created,
    )


@router.post("/analytics/actions/spread-load", response_model=InsightActionResponse)
async def apply_spread_load(
    ref_date: str | None = Query(None, alias="date"),
    user: dict = Depends(get_current_user),
):
    """Move the shortest event from the heaviest weekday to the lightest."""
    reference = _reference_date(ref_date)
    all_events = await data_access.list_events(user["id"])
    event_dicts = _events_as_dicts(all_events)

    plan = plan_spread_load(event_dicts, reference_date=reference)
    updated = await data_access.update_event(
        plan["event_id"],
        user["id"],
        EventUpdate(date=plan["date"], start_time=plan["start_time"]),
    )
    return InsightActionResponse(
        action_type="spread_load",
        message=(
            f"Moved \"{plan['title']}\" from {plan['from_day']} to "
            f"{plan['to_day']} at {plan['start_time'].strftime('%H:%M')}."
        ),
        event=updated,
    )