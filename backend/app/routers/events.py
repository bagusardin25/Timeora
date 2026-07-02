from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.database import ensure_pool, get_pool
from app.models import (
    AlternativeSlot,
    ConflictCheckRequest,
    ConflictCheckResponse,
    EventCreate,
    EventResponse,
    EventUpdate,
)

router = APIRouter()


def _row_to_event(row) -> EventResponse:
    return EventResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        title=row["title"],
        date=row["date"],
        start_time=row["start_time"],
        duration_minutes=row["duration_minutes"],
        participants=row.get("participants", ""),
    )


async def _check_conflict(
    conn, user_id: str, event_date, start_time, duration_minutes, exclude_id=None
):
    new_end = (
        datetime.combine(event_date, start_time) + timedelta(minutes=duration_minutes)
    ).time()

    query = """
        SELECT id, title, start_time, duration_minutes
        FROM events
        WHERE user_id = $1 AND date = $2
          AND start_time < $3
          AND (start_time + (duration_minutes::text || ' minutes')::interval) > $4
    """
    params = [user_id, event_date, new_end, start_time]
    if exclude_id:
        query += " AND id != $5"
        params.append(exclude_id)

    return await conn.fetchrow(query, *params)


async def _generate_alternatives(
    conn, user_id: str, event_date, duration_minutes, count=3
) -> list[AlternativeSlot]:
    slots: list[AlternativeSlot] = []
    candidate = time(8, 0)
    while len(slots) < count and candidate < time(22, 0):
        conflict = await _check_conflict(
            conn, user_id, event_date, candidate, duration_minutes
        )
        if not conflict:
            slots.append(
                AlternativeSlot(start_time=candidate, duration_minutes=duration_minutes)
            )
        candidate_dt = datetime.combine(event_date, candidate) + timedelta(minutes=30)
        candidate = candidate_dt.time()
    return slots


async def _require_pool():
    pool = await ensure_pool()
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected",
        )
    return pool


@router.get("", response_model=list[EventResponse])
async def list_events(user: dict = Depends(get_current_user)):
    pool = await _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM events WHERE user_id = $1 ORDER BY date, start_time",
            user["id"],
        )
        return [_row_to_event(r) for r in rows]


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(body: EventCreate, user: dict = Depends(get_current_user)):
    pool = await _require_pool()
    async with pool.acquire() as conn:
        conflict = await _check_conflict(
            conn, user["id"], body.date, body.start_time, body.duration_minutes
        )
        if conflict:
            alts = await _generate_alternatives(
                conn, user["id"], body.date, body.duration_minutes
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Time slot conflicts with existing event",
                    "conflicting_event": conflict["title"],
                    "alternatives": [a.model_dump() for a in alts],
                },
            )

        row = await conn.fetchrow(
            """
            INSERT INTO events (user_id, title, date, start_time, duration_minutes, participants)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            user["id"],
            body.title,
            body.date,
            body.start_time,
            body.duration_minutes,
            body.participants,
        )
        return _row_to_event(row)


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    pool = await _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM events WHERE id = $1 AND user_id = $2",
            event_id,
            user["id"],
        )
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        return _row_to_event(row)


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    body: EventUpdate,
    user: dict = Depends(get_current_user),
):
    pool = await _require_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM events WHERE id = $1 AND user_id = $2",
            event_id,
            user["id"],
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")

        update_data = body.model_dump(exclude_unset=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = []
        values = []
        idx = 1
        for key, val in update_data.items():
            set_clauses.append(f"{key} = ${idx}")
            values.append(val)
            idx += 1
        set_clauses.append(f"updated_at = NOW()")
        values.extend([event_id, user["id"]])

        row = await conn.fetchrow(
            f"UPDATE events SET {', '.join(set_clauses)} WHERE id = ${idx} AND user_id = ${idx+1} RETURNING *",
            *values,
        )
        return _row_to_event(row)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    pool = await _require_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM events WHERE id = $1 AND user_id = $2",
            event_id,
            user["id"],
        )
        if "0" in result:
            raise HTTPException(status_code=404, detail="Event not found")


@router.post("/check-conflict", response_model=ConflictCheckResponse)
async def check_conflict(
    body: ConflictCheckRequest, user: dict = Depends(get_current_user)
):
    pool = await _require_pool()
    async with pool.acquire() as conn:
        conflict = await _check_conflict(
            conn, user["id"], body.date, body.start_time, body.duration_minutes
        )
        if conflict:
            alts = await _generate_alternatives(
                conn, user["id"], body.date, body.duration_minutes
            )
            return ConflictCheckResponse(
                conflict=True,
                conflicting_event_title=conflict["title"],
                alternatives=alts,
            )
        return ConflictCheckResponse(conflict=False)
