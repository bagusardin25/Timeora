from datetime import date, datetime, time, timedelta

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


async def list_events(user_id: str) -> list[EventResponse]:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM events WHERE user_id = $1 ORDER BY date, start_time",
                user_id,
            )
            return [_row_to_event(r) for r in rows]
    return await supabase_store.list_events(user_id)


async def get_event(event_id: str, user_id: str) -> EventResponse:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM events WHERE id = $1 AND user_id = $2",
                event_id,
                user_id,
            )
            if not row:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Event not found")
            return _row_to_event(row)
    return await supabase_store.get_event(event_id, user_id)


async def create_event(user_id: str, body: EventCreate) -> EventResponse:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            conflict = await _check_conflict_sql(
                conn, user_id, body.date, body.start_time, body.duration_minutes
            )
            if conflict:
                alts = await _generate_alternatives_sql(
                    conn, user_id, body.date, body.duration_minutes
                )
                from fastapi import HTTPException, status

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
                user_id,
                body.title,
                body.date,
                body.start_time,
                body.duration_minutes,
                body.participants,
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
                "SELECT * FROM events WHERE id = $1 AND user_id = $2",
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
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM events WHERE id = $1 AND user_id = $2",
                event_id,
                user_id,
            )
            if "0" in result:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Event not found")
        return
    await supabase_store.delete_event(event_id, user_id)


async def check_conflict(
    user_id: str, event_date: date, start_time: time, duration_minutes: int
):
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            conflict = await _check_conflict_sql(
                conn, user_id, event_date, start_time, duration_minutes
            )
            if not conflict:
                return False, None, []
            alts = await _generate_alternatives_sql(
                conn, user_id, event_date, duration_minutes
            )
            return True, conflict["title"], alts
    return await supabase_store.check_conflict(
        user_id, event_date, start_time, duration_minutes
    )