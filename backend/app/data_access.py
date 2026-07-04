from datetime import date, datetime, time, timedelta

from app.core import conflicts as conflicts_engine
from app.database import ensure_pool
from app.models import (
    AlternativeSlot,
    EventCreate,
    EventResponse,
    EventUpdate,
)
from app import supabase_store


def db_available() -> bool:
    if supabase_store.is_configured():
        return True
    from app.database import get_pool

    return get_pool() is not None


async def upsert_user(user_id: str, email: str) -> None:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
                user_id,
                email,
            )
        return
    if supabase_store.is_configured():
        await supabase_store.upsert_user(user_id, email)


def _row_to_event(row) -> EventResponse:
    return EventResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        title=row["title"],
        date=row["date"],
        start_time=row["start_time"],
        duration_minutes=row["duration_minutes"],
        participants=row.get("participants", ""),
        recurrence_rule=row.get("recurrence_rule"),
    )


async def _check_conflict_sql(
    conn, user_id: str, event_date, start_time, duration_minutes, exclude_id=None
):
    new_end = (
        datetime.combine(event_date, start_time) + timedelta(minutes=duration_minutes)
    ).time()
    query = """
        SELECT id, title, start_time, duration_minutes
        FROM events
        WHERE user_id = $1 AND date = $2
          AND (deleted_at IS NULL)
          AND start_time < $3
          AND (start_time + (duration_minutes::text || ' minutes')::interval) > $4
    """
    params = [user_id, event_date, new_end, start_time]
    if exclude_id:
        query += " AND id != $5"
        params.append(exclude_id)
    return await conn.fetchrow(query, *params)


async def _generate_alternatives_sql(
    conn, user_id: str, event_date, duration_minutes, count=3
) -> list[AlternativeSlot]:
    slots: list[AlternativeSlot] = []
    candidate = time(8, 0)
    while len(slots) < count and candidate < time(22, 0):
        conflict = await _check_conflict_sql(
            conn, user_id, event_date, candidate, duration_minutes
        )
        if not conflict:
            slots.append(
                AlternativeSlot(start_time=candidate, duration_minutes=duration_minutes)
            )
        candidate_dt = datetime.combine(event_date, candidate) + timedelta(minutes=30)
        candidate = candidate_dt.time()
    return slots


async def _events_as_dicts(user_id: str) -> list[dict]:
    events = await list_events(user_id)
    return [e.model_dump(mode="json") for e in events]


def _alternatives_from_engine(
    event_dicts: list[dict],
    event_date,
    start_time: time,
    duration_minutes: int,
) -> list[AlternativeSlot]:
    raw = conflicts_engine.find_alternatives(
        event_dicts, event_date, start_time, duration_minutes
    )
    slots: list[AlternativeSlot] = []
    for alt in raw:
        parts = alt["start_time"].split(":")
        slots.append(
            AlternativeSlot(
                start_time=time(int(parts[0]), int(parts[1])),
                duration_minutes=alt["duration_minutes"],
                reason=alt.get("reason", ""),
            )
        )
    return slots


async def _conflict_detail(
    user_id: str,
    event_date,
    start_time: time,
    duration_minutes: int,
    exclude_id: str | None = None,
) -> tuple[str, list[AlternativeSlot]] | None:
    event_dicts = await _events_as_dicts(user_id)
    hits = conflicts_engine.check_conflicts(
        event_dicts,
        event_date,
        start_time,
        duration_minutes,
        exclude_id=exclude_id,
    )
    if not hits:
        return None
    title = hits[0].get("title", "Existing event")
    alts = _alternatives_from_engine(
        event_dicts, event_date, start_time, duration_minutes
    )
    return title, alts


async def list_events(user_id: str) -> list[EventResponse]:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM events WHERE user_id = $1 AND (deleted_at IS NULL) ORDER BY date, start_time",
                user_id,
            )
            return [_row_to_event(r) for r in rows]
    return await supabase_store.list_events(user_id)


async def get_event(event_id: str, user_id: str) -> EventResponse:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM events WHERE id = $1 AND user_id = $2 AND (deleted_at IS NULL)",
                event_id,
                user_id,
            )
            if not row:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Event not found")
            return _row_to_event(row)
    return await supabase_store.get_event(event_id, user_id)


async def create_event(user_id: str, body: EventCreate) -> EventResponse:
    detail = await _conflict_detail(
        user_id, body.date, body.start_time, body.duration_minutes
    )
    if detail:
        title, alts = detail
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Time slot conflicts with existing event",
                "conflicting_event": title,
                "alternatives": [a.model_dump(mode="json") for a in alts],
            },
        )

    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO events (user_id, title, date, start_time, duration_minutes, participants, recurrence_rule)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
                """,
                user_id,
                body.title,
                body.date,
                body.start_time,
                body.duration_minutes,
                body.participants,
                body.recurrence_rule,
            )
            return _row_to_event(row)
    return await supabase_store.create_event(user_id, body)


async def update_event(
    event_id: str, user_id: str, body: EventUpdate
) -> EventResponse:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT * FROM events WHERE id = $1 AND user_id = $2 AND (deleted_at IS NULL)",
                event_id,
                user_id,
            )
            if not existing:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Event not found")
            update_data = body.model_dump(exclude_unset=True)
            if not update_data:
                from fastapi import HTTPException

                raise HTTPException(status_code=400, detail="No fields to update")
            set_clauses = []
            values = []
            idx = 1
            for key, val in update_data.items():
                set_clauses.append(f"{key} = ${idx}")
                values.append(val)
                idx += 1
            set_clauses.append("updated_at = NOW()")
            values.extend([event_id, user_id])
            row = await conn.fetchrow(
                f"UPDATE events SET {', '.join(set_clauses)} WHERE id = ${idx} AND user_id = ${idx+1} RETURNING *",
                *values,
            )
            return _row_to_event(row)
    return await supabase_store.update_event(event_id, user_id, body)


async def delete_event(event_id: str, user_id: str) -> None:
    """Soft-delete: sets deleted_at instead of removing the row."""
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE events SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
                event_id,
                user_id,
            )
            if "0" in result:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Event not found")
        return
    await supabase_store.delete_event(event_id, user_id)


async def restore_event(event_id: str, user_id: str) -> EventResponse:
    """Restore a soft-deleted event by clearing deleted_at."""
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "UPDATE events SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING *",
                event_id,
                user_id,
            )
            if not row:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Event not found or not deleted")
            return _row_to_event(row)
    return await supabase_store.restore_event(event_id, user_id)


async def check_conflict(
    user_id: str, event_date: date, start_time: time, duration_minutes: int
):
    detail = await _conflict_detail(
        user_id, event_date, start_time, duration_minutes
    )
    if not detail:
        return False, None, []
    title, alts = detail
    return True, title, alts