"""
Weekly analytics endpoint.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app import data_access
from app.core.analytics import weekly_summary
from app.models import WeeklyInsight

router = APIRouter()


@router.get("/analytics/week", response_model=WeeklyInsight)
async def get_weekly_insights(
    ref_date: str | None = Query(None, alias="date", description="YYYY-MM-DD reference date; defaults to today"),
    user: dict = Depends(get_current_user),
):
    """Return weekly analytics for the authenticated user."""
    if ref_date:
        reference = date.fromisoformat(ref_date)
    else:
        reference = datetime.now().date()

    all_events = await data_access.list_events(user["id"])

    # Convert EventResponse objects to dicts for the analytics engine
    event_dicts = []
    for ev in all_events:
        if hasattr(ev, "model_dump"):
            event_dicts.append(ev.model_dump(mode="json"))
        else:
            event_dicts.append(ev)

    result = weekly_summary(event_dicts, reference_date=reference)
    return WeeklyInsight(**result)
