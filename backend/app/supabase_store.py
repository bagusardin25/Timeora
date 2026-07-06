from datetime import date, datetime, time

import httpx
from fastapi import HTTPException, status

from app.core import conflicts as conflicts_engine
from app.config import settings
from app.models import (
    AlternativeSlot,
    EventCreate,
    EventResponse,
    EventUpdate,
)

_HEADERS = lambda: {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def is_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


def _base() -> str:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected",
        )
    return f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1"


def _parse_time(value) -> time:
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        parts = value.split(":")
        return time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    raise ValueError(f"Invalid time value: {value}")


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise ValueError(f"Invalid date value: {value}")


def _row_to_event(row: dict) -> EventResponse:
    return EventResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        title=row["title"],
        date=_parse_date(row["date"]),
        start_time=_parse_time(row["start_time"]),
        duration_minutes=int(row["duration_minutes"]),
        participants=row.get("participants") or "",
        recurrence_rule=row.get("recurrence_rule"),
        category=row.get("category"),
        description=row.get("description") or "",
        location_url=row.get("location_url"),
        priority=row.get("priority") or "normal",
        tags=list(row.get("tags") or []),
        reminder_minutes=row.get("reminder_minutes"),
        external_ids=row.get("external_ids") or {},
        sync_status=row.get("sync_status") or "not_synced",
        last_synced_at=row.get("last_synced_at"),
    )


def _serialize_event_payload(data: dict) -> dict:
    payload = dict(data)
    if "date" in payload and hasattr(payload["date"], "isoformat"):
        payload["date"] = payload["date"].isoformat()
    if "start_time" in payload and hasattr(payload["start_time"], "isoformat"):
        payload["start_time"] = payload["start_time"].isoformat()
    return payload


def _events_as_dicts(events: list[EventResponse]) -> list[dict]:
    return [event.model_dump(mode="json") for event in events]


def _alternatives_from_engine(
    events: list[EventResponse],
    event_date: date,
    start_time: time,
    duration_minutes: int,
    count: int = 3,
) -> list[AlternativeSlot]:
    raw = conflicts_engine.find_alternatives(
        _events_as_dicts(events),
        event_date,
        start_time,
        duration_minutes,
        count=count,
    )
    slots: list[AlternativeSlot] = []
    for alt in raw:
        hours, minutes = alt["start_time"].split(":", 1)
        slots.append(
            AlternativeSlot(
                start_time=time(int(hours), int(minutes)),
                duration_minutes=alt["duration_minutes"],
                reason=alt.get("reason", ""),
            )
        )
    return slots


async def upsert_user(user_id: str, email: str) -> None:
    url = f"{_base()}/users"
    headers = {**_HEADERS(), "Prefer": "resolution=merge-duplicates"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            json={"id": user_id, "email": email},
            headers=headers,
        )
    if resp.status_code not in (200, 201):
        print(f"[supabase_store] upsert user failed: {resp.status_code} {resp.text[:200]}")


async def list_events(user_id: str) -> list[EventResponse]:
    url = f"{_base()}/events"
    params = {
        "user_id": f"eq.{user_id}",
        "deleted_at": "is.null",
        "order": "date.asc,start_time.asc",
        "select": "*",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params, headers=_HEADERS())
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch events")
    return [_row_to_event(row) for row in resp.json()]


async def has_external_event_id(
    user_id: str, provider: str, external_id: str
) -> bool:
    url = f"{_base()}/events"
    params = {
        "user_id": f"eq.{user_id}",
        f"external_ids->>{provider}": f"eq.{external_id}",
        "deleted_at": "is.null",
        "select": "id",
        "limit": "1",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params, headers=_HEADERS())
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to check imported event")
    return bool(resp.json())


async def get_event(event_id: str, user_id: str) -> EventResponse:
    url = f"{_base()}/events"
    params = {
        "id": f"eq.{event_id}",
        "user_id": f"eq.{user_id}",
        "deleted_at": "is.null",
        "select": "*",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params, headers=_HEADERS())
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch event")
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Event not found")
    return _row_to_event(rows[0])


async def _find_conflict(
    user_id: str,
    event_date: date,
    start_time: time,
    duration_minutes: int,
    exclude_id: str | None = None,
) -> dict | None:
    events = await list_events(user_id)
    hits = conflicts_engine.check_conflicts(
        _events_as_dicts(events),
        event_date,
        start_time,
        duration_minutes,
        exclude_id=exclude_id,
    )
    if hits:
        hit = hits[0]
        return {
            "id": str(hit.get("id")),
            "title": hit.get("title") or "Existing event",
        }
    return None


async def _generate_alternatives(
    user_id: str,
    event_date: date,
    start_time: time,
    duration_minutes: int,
    count: int = 3,
) -> list[AlternativeSlot]:
    events = await list_events(user_id)
    return _alternatives_from_engine(
        events,
        event_date,
        start_time,
        duration_minutes,
        count=count,
    )


async def create_event(user_id: str, body: EventCreate) -> EventResponse:
    conflict = await _find_conflict(
        user_id, body.date, body.start_time, body.duration_minutes
    )
    if conflict:
        alts = await _generate_alternatives(
            user_id,
            body.date,
            body.start_time,
            body.duration_minutes,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Time slot conflicts with existing event",
                "conflicting_event": conflict["title"],
                "alternatives": [a.model_dump(mode="json") for a in alts],
            },
        )

    payload = _serialize_event_payload(
        {
            "user_id": user_id,
            "title": body.title,
            "date": body.date,
            "start_time": body.start_time,
            "duration_minutes": body.duration_minutes,
            "participants": body.participants,
            "recurrence_rule": body.recurrence_rule,
            "category": body.category,
            "description": body.description,
            "location_url": body.location_url,
            "priority": body.priority,
            "tags": body.tags,
            "reminder_minutes": body.reminder_minutes,
            "external_ids": body.external_ids,
        }
    )
    url = f"{_base()}/events"
    headers = {**_HEADERS(), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create event: {resp.text[:200]}",
        )
    rows = resp.json()
    return _row_to_event(rows[0] if isinstance(rows, list) else rows)


async def update_event(
    event_id: str, user_id: str, body: EventUpdate
) -> EventResponse:
    existing = await get_event(event_id, user_id)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    event_date = body.date if body.date is not None else existing.date
    start_time = body.start_time if body.start_time is not None else existing.start_time
    duration_minutes = (
        body.duration_minutes
        if body.duration_minutes is not None
        else existing.duration_minutes
    )
    conflict = await _find_conflict(
        user_id,
        event_date,
        start_time,
        duration_minutes,
        exclude_id=event_id,
    )
    if conflict:
        alts = await _generate_alternatives(
            user_id,
            event_date,
            start_time,
            duration_minutes,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Time slot conflicts with existing event",
                "conflicting_event": conflict["title"],
                "alternatives": [a.model_dump(mode="json") for a in alts],
            },
        )

    url = f"{_base()}/events"
    params = {"id": f"eq.{event_id}", "user_id": f"eq.{user_id}"}
    headers = {**_HEADERS(), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            url,
            params=params,
            json=_serialize_event_payload(update_data),
            headers=headers,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to update event")
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Event not found")
    return _row_to_event(rows[0])


async def delete_event(event_id: str, user_id: str) -> None:
    """Soft-delete via PATCH deleted_at."""
    url = f"{_base()}/events"
    params = {"id": f"eq.{event_id}", "user_id": f"eq.{user_id}", "deleted_at": "is.null"}
    headers = {**_HEADERS(), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            url,
            params=params,
            json={"deleted_at": datetime.utcnow().isoformat() + "Z"},
            headers=headers,
        )
    if resp.status_code != 200 or not resp.json():
        raise HTTPException(status_code=404, detail="Event not found")


async def restore_event(event_id: str, user_id: str) -> EventResponse:
    """Restore a soft-deleted event."""
    url = f"{_base()}/events"
    params = {
        "id": f"eq.{event_id}",
        "user_id": f"eq.{user_id}",
        "deleted_at": "not.is.null",
    }
    headers = {**_HEADERS(), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            url,
            params=params,
            json={"deleted_at": None},
            headers=headers,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=404, detail="Event not found or not deleted")
    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Event not found or not deleted")
    return _row_to_event(rows[0])


async def check_conflict(
    user_id: str, event_date: date, start_time: time, duration_minutes: int
) -> tuple[bool, str | None, list[AlternativeSlot]]:
    conflict = await _find_conflict(user_id, event_date, start_time, duration_minutes)
    if not conflict:
        return False, None, []
    alts = await _generate_alternatives(
        user_id,
        event_date,
        start_time,
        duration_minutes,
    )
    return True, conflict["title"], alts
