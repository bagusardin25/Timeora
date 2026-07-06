from __future__ import annotations

from datetime import date as DateType, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.auth import get_current_user
from app import data_access
from app.core.recurrence import expand_recurrence
from app.integrations.events import notify_event_change
from app.models import (
    ConflictCheckRequest,
    ConflictCheckResponse,
    EventCreate,
    EventResponse,
    EventUpdate,
)

router = APIRouter()
MAX_EVENT_LOOKBACK_DAYS = 1


def _parse_query_date(value: str | None, field_name: str) -> DateType | None:
    if value is None:
        return None
    try:
        return DateType.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a valid YYYY-MM-DD date",
        ) from exc


def _event_overlaps_range(
    event: EventResponse,
    range_start: DateType | None,
    range_end: DateType | None,
) -> bool:
    event_start = datetime.combine(event.date, event.start_time)
    event_end = event_start + timedelta(minutes=event.duration_minutes)

    if range_start is not None:
        start_boundary = datetime.combine(range_start, time.min)
        if event_end <= start_boundary:
            return False

    if range_end is not None:
        end_boundary = datetime.combine(range_end + timedelta(days=1), time.min)
        if event_start >= end_boundary:
            return False

    return True


def _expand_events(
    events: list[EventResponse],
    range_start: DateType,
    range_end: DateType,
) -> list[EventResponse]:
    """Expand recurring events into concrete instances within the date range."""
    expanded: list[EventResponse] = []
    expansion_start = range_start - timedelta(days=MAX_EVENT_LOOKBACK_DAYS)
    for event in events:
        if not event.recurrence_rule:
            if _event_overlaps_range(event, range_start, range_end):
                expanded.append(event)
            continue

        event_dict = event.model_dump(mode="json")
        instances = expand_recurrence(event_dict, expansion_start, range_end)
        for inst in instances:
            inst_date = DateType.fromisoformat(inst["date"])
            inst_id = f"{event.id}_{inst_date.isoformat()}"
            instance = EventResponse(
                id=inst_id,
                user_id=event.user_id,
                title=event.title,
                date=inst_date,
                start_time=event.start_time,
                duration_minutes=event.duration_minutes,
                participants=event.participants,
                recurrence_rule=event.recurrence_rule,
                category=event.category,
                description=event.description,
                location_url=event.location_url,
                priority=event.priority,
                tags=event.tags,
                reminder_minutes=event.reminder_minutes,
                external_ids=event.external_ids,
                sync_status=event.sync_status,
                last_synced_at=event.last_synced_at,
            )
            if _event_overlaps_range(instance, range_start, range_end):
                expanded.append(instance)
    expanded.sort(key=lambda e: (e.date, e.start_time))
    return expanded


@router.get("", response_model=list[EventResponse])
async def list_events(
    from_date: str | None = Query(None, alias="from", description="Filter from date (YYYY-MM-DD)"),
    to_date: str | None = Query(None, alias="to", description="Filter to date (YYYY-MM-DD)"),
    q: str | None = Query(None, description="Search query for title"),
    expand: bool = Query(False, description="Expand recurring events into instances"),
    user: dict = Depends(get_current_user),
):
    fd = _parse_query_date(from_date, "from")
    td = _parse_query_date(to_date, "to")
    if fd and td and fd > td:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from must be on or before to",
        )

    events = await data_access.list_events(user["id"])

    if q:
        q_lower = q.lower()
        events = [e for e in events if q_lower in e.title.lower()]

    if expand and fd and td:
        return _expand_events(events, fd, td)

    if fd or td:
        events = [e for e in events if _event_overlaps_range(e, fd, td)]

    return events


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    event = await data_access.create_event(user["id"], body)
    background_tasks.add_task(
        notify_event_change,
        user["id"],
        "event.created",
        event.model_dump(mode="json"),
    )
    return event


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    return await data_access.get_event(event_id, user["id"])


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    body: EventUpdate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    event = await data_access.update_event(event_id, user["id"], body)
    background_tasks.add_task(
        notify_event_change,
        user["id"],
        "event.updated",
        event.model_dump(mode="json"),
    )
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Soft-delete an event (sets deleted_at)."""
    event = await data_access.get_event(event_id, user["id"])
    await data_access.delete_event(event_id, user["id"])
    background_tasks.add_task(
        notify_event_change,
        user["id"],
        "event.deleted",
        event.model_dump(mode="json"),
    )


@router.post("/{event_id}/restore", response_model=EventResponse)
async def restore_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Restore a soft-deleted event."""
    event = await data_access.restore_event(event_id, user["id"])
    background_tasks.add_task(
        notify_event_change,
        user["id"],
        "event.restored",
        event.model_dump(mode="json"),
    )
    return event


@router.post("/check-conflict", response_model=ConflictCheckResponse)
async def check_conflict(
    body: ConflictCheckRequest, user: dict = Depends(get_current_user)
):
    if not data_access.db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected",
        )
    conflict, title, alts = await data_access.check_conflict(
        user["id"], body.date, body.start_time, body.duration_minutes
    )
    if conflict:
        return ConflictCheckResponse(
            conflict=True,
            conflicting_event_title=title,
            alternatives=alts,
        )
    return ConflictCheckResponse(conflict=False)
