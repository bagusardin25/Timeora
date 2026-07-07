"""
iCalendar (.ics) export endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.auth import get_current_user
from app import data_access
from app.core.ics_export import generate_ics
from app.core.ics_import import parse_ics
from app.config import settings
from app.integrations.events import notify_event_change
from app.models import IcsImportResult

router = APIRouter()
MAX_ICS_BYTES = 1024 * 1024


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
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=timeora.ics",
        },
    )


@router.post("/events/import-ics", response_model=IcsImportResult)
async def import_ics(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".ics"):
        raise HTTPException(status_code=422, detail="Upload must be an .ics file")
    raw = await file.read(MAX_ICS_BYTES + 1)
    await file.close()
    if len(raw) > MAX_ICS_BYTES:
        raise HTTPException(status_code=413, detail="ICS file exceeds the 1 MB limit")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = raw.decode("latin-1")
    try:
        parsed_events, errors = parse_ics(
            content,
            default_timezone=settings.INTEGRATION_DEFAULT_TIMEZONE,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    imported = []
    skipped = 0
    for parsed_event in parsed_events:
        external_id = parsed_event.external_ids.get("ics")
        if external_id and await data_access.has_external_event_id(
            user["id"], "ics", external_id
        ):
            skipped += 1
            errors.append(f"{parsed_event.title}: duplicate UID skipped")
            continue
        try:
            event = await data_access.create_event(user["id"], parsed_event)
        except HTTPException as exc:
            skipped += 1
            if exc.status_code == 409:
                errors.append(f"{parsed_event.title}: conflicting time slot")
                continue
            errors.append(f"{parsed_event.title}: {exc.detail}")
            continue
        imported.append(event)
        background_tasks.add_task(
            notify_event_change,
            user["id"],
            "event.created",
            event.model_dump(mode="json"),
        )

    return IcsImportResult(
        imported=len(imported),
        skipped=skipped,
        errors=errors,
        events=imported,
    )
