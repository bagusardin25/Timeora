"""
iCalendar (.ics) export endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.auth import get_current_user
from app import data_access
from app.core.ics_export import generate_ics

router = APIRouter()


@router.get("/export/ics")
async def export_ics(user: dict = Depends(get_current_user)):
    """Download all user events as an .ics file."""
    all_events = await data_access.list_events(user["id"])

    event_dicts = []
    for ev in all_events:
        if hasattr(ev, "model_dump"):
            event_dicts.append(ev.model_dump(mode="json"))
        else:
            event_dicts.append(ev)

    ics_content = generate_ics(event_dicts)

    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": "attachment; filename=timeora.ics",
        },
    )
