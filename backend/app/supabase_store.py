from datetime import date, datetime, time, timedelta

import httpx
from fastapi import HTTPException, status

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
    )


def _serialize_event_payload(data: dict) -> dict:
    payload = dict(data)
    if "date" in payload and hasattr(payload["date"], "isoformat"):
        payload["date"] = payload["date"].isoformat()
    if "start_time" in payload and hasattr(payload["start_time"], "isoformat"):
        payload["start_time"] = payload["start_time"].isoformat()
    return payload


def _event_end(start: time, duration_minutes: int) -> time:
    dt = datetime.combine(date.today(), start) + timedelta(minutes=duration_minutes)
    return dt.time()


def _times_overlap(
    start_a: time, dur_a: int, start_b: time, dur_b: int
) -> bool:
    end_a = _event_end(start_a, dur_a)
    end_b = _event_end(start_b, dur_b)
    return start_a < end_b and start_b < end_a


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
        "order": "date.asc,start_time.asc",
        "select": "*",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params, headers=_HEADERS())
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch events")
    return [_row_to_event(row) for row in resp.json()]


async def get_event(event_id: str, user_id: str) -> EventResponse:
    url = f"{_base()}/events"
    params = {"id": f"eq.{event_id}", "user_id": f"eq.{user_id}", "select": "*"}
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
    for event in events:
        if exclude_id and event.id == exclude_id:
            continue
        if event.date != event_date:
            continue
        if _times_overlap(
            start_time, duration_minutes, event.start_time, event.duration_minutes
        ):
            return {"id": event.id, "title": event.title}
    return None


async def _generate_alternatives(
    user_id: str, event_date: date, duration_minutes: int, count: int = 3
) -> list[AlternativeSlot]:
    slots: list[AlternativeSlot] = []
    candidate = time(8, 0)
    while len(slots) < count and candidate < time(22, 0):
        conflict = await _find_conflict(user_id, event_date, candidate, duration_minutes)
        if not conflict:
            slots.append(
                AlternativeSlot(start_time=candidate, duration_minutes=duration_minutes)
            )
        candidate_dt = datetime.combine(event_date, candidate) + timedelta(minutes=30)
        candidate = candidate_dt.time()
    return slots


async def create_event(user_id: str, body: EventCreate) -> EventResponse:
    conflict = await _find_conflict(
        user_id, body.date, body.start_time, body.duration_minutes
    )
    if conflict:
        alts = await _generate_alternatives(user_id, body.date, body.duration_minutes)
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
    await get_event(event_id, user_id)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

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
    url = f"{_base()}/events"
    params = {"id": f"eq.{event_id}", "user_id": f"eq.{user_id}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(url, params=params, headers=_HEADERS())
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=404, detail="Event not found")


async def check_conflict(
    user_id: str, event_date: date, start_time: time, duration_minutes: int
) -> tuple[bool, str | None, list[AlternativeSlot]]:
    conflict = await _find_conflict(user_id, event_date, start_time, duration_minutes)
    if not conflict:
        return False, None, []
    alts = await _generate_alternatives(user_id, event_date, duration_minutes)
    return True, conflict["title"], alts