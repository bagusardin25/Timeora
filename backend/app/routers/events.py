from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.rows import dict_row

from app.auth import get_current_user
from app.database import get_pool
from app.models import (
    AlternativeSlot,
    ConflictCheckRequest,
    ConflictCheckResponse,
    EventCreate,
    EventResponse,
    EventUpdate,
)

router = APIRouter()


def _row_to_event(row: dict) -> EventResponse:
    return EventResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        title=row["title"],
        date=row["date"],
        start_time=row["start_time"],
        duration_minutes=row["duration_minutes"],
        participants=row.get("participants", ""),
    )


def _check_conflict(
    pool, user_id: str, event_date, start_time, duration_minutes, exclude_id=None
) -> dict | None:
    new_end = (
        datetime.combine(event_date, start_time) + timedelta(minutes=duration_minutes)
).time()

    query = """
        SELECT id, title, start_time, duration_minutes
        FROM events
        WHERE user_id = %s AND date = %s
          AND start_time < %s
          AND (start_time + (duration_minutes || ' minutes')::interval) > %s
    """
    params: list = [user_id, event_date, new_end, start_time]
    if exclude_id:
        query += " AND id != %s"
        params.append(exclude_id)

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            return cur.fetchone()


def _generate_alternatives(
    pool, user_id: str, event_date, duration_minutes, count=3
) -> list[AlternativeSlot]:
    slots: list[AlternativeSlot] = []
    candidate = time(8, 0)
    while len(slots) < count and candidate < time(22, 0):
        conflict = _check_conflict(
            pool, user_id, event_date, candidate, duration_minutes
        )
        if not conflict:
            slots.append(
                AlternativeSlot(start_time=candidate, duration_minutes=duration_minutes)
            )
        candidate_dt = datetime.combine(event_date, candidate) + timedelta(
            minutes=30
        )
        candidate = candidate_dt.time()
    return slots


@router.get("", response_model=list[EventResponse])
def list_events(user: dict = Depends(get_current_user)):
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM events WHERE user_id = %s ORDER BY date, start_time",
                (user["id"],),
            )
            return [_row_to_event(row) for row in cur.fetchall()]


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreate, user: dict = Depends(get_current_user)
):
    pool = get_pool()
    conflict = _check_conflict(
        pool, user["id"], body.date, body.start_time, body.duration_minutes
    )
    if conflict:
        alts = _generate_alternatives(
            pool, user["id"], body.date, body.duration_minutes
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Time slot conflicts with existing event",
                "conflicting_event": conflict["title"],
                "alternatives": [a.model_dump() for a in alts],
            },
        )

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO events (user_id, title, date, start_time, duration_minutes, participants)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    user["id"],
                    body.title,
                    body.date,
                    body.start_time,
                    body.duration_minutes,
                    body.participants,
                ),
            )
            return _row_to_event(cur.fetchone())


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str, user: dict = Depends(get_current_user)):
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM events WHERE id = %s AND user_id = %s",
                (event_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Event not found")
            return _row_to_event(row)


@router.put("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: str,
    body: EventUpdate,
    user: dict = Depends(get_current_user),
):
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM events WHERE id = %s AND user_id = %s",
                (event_id, user["id"]),
            )
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Event not found")

            update_data = body.model_dump(exclude_unset=True)
            if not update_data:
                raise HTTPException(status_code=400, detail="No fields to update")

            set_clauses = []
            values = []
            for key, val in update_data.items():
                set_clauses.append(f"{key} = %s")
                values.append(val)
            set_clauses.append("updated_at = NOW()")
            values.extend([event_id, user["id"]])

            cur.execute(
                f"UPDATE events SET {', '.join(set_clauses)} WHERE id = %s AND user_id = %s RETURNING *",
                values,
            )
            return _row_to_event(cur.fetchone())


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM events WHERE id = %s AND user_id = %s",
                (event_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Event not found")


@router.post("/check-conflict", response_model=ConflictCheckResponse)
def check_conflict(
    body: ConflictCheckRequest, user: dict = Depends(get_current_user)
):
    pool = get_pool()
    conflict = _check_conflict(
        pool, user["id"], body.date, body.start_time, body.duration_minutes
    )
    if conflict:
        alts = _generate_alternatives(
            pool, user["id"], body.date, body.duration_minutes
        )
        return ConflictCheckResponse(
            conflict=True,
            conflicting_event_title=conflict["title"],
            alternatives=alts,
        )
    return ConflictCheckResponse(conflict=False)
