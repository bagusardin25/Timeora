"""
Smart conflict detection with buffer zones and ranked alternatives.

All functions work on plain dicts/lists — no database required.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

MINUTES_PER_DAY = 24 * 60


def _to_minutes(t: time) -> int:
    """Convert a time to minutes since midnight."""
    return t.hour * 60 + t.minute


def _from_minutes(m: int) -> time:
    """Convert minutes since midnight back to a time object."""
    m = max(0, min(m, 23 * 60 + 59))
    return time(m // 60, m % 60)


def _event_date(ev: dict) -> date | None:
    value = ev.get("date")
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def _event_range(ev: dict, reference_date: date | None = None) -> tuple[int, int]:
    """Return (start_min, end_min), optionally relative to a reference date."""
    st = ev["start_time"]
    if isinstance(st, str):
        parts = st.split(":")
        start_min = int(parts[0]) * 60 + int(parts[1])
    else:
        start_min = _to_minutes(st)
    if reference_date is not None:
        ev_date = _event_date(ev)
        if ev_date is not None:
            start_min += (ev_date - reference_date).days * MINUTES_PER_DAY
    end_min = start_min + int(ev["duration_minutes"])
    return start_min, end_min


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_conflicts(
    events: list[dict],
    new_date: date,
    new_start: time,
    new_duration: int,
    exclude_id: str | None = None,
    buffer_minutes: int = 10,
) -> list[dict]:
    """Return list of events that conflict with the proposed slot.

    A conflict occurs when the new event (including *buffer_minutes* on each
    side) overlaps with an existing event.
    """
    new_start_min = _to_minutes(new_start) - buffer_minutes
    new_end_min = _to_minutes(new_start) + new_duration + buffer_minutes

    conflicts = []
    for ev in events:
        if exclude_id and str(ev.get("id")) == str(exclude_id):
            continue

        ev_start, ev_end = _event_range(ev, reference_date=new_date)
        if ev_start < new_end_min and ev_end > new_start_min:
            conflicts.append(ev)
    return conflicts


def find_alternatives(
    events: list[dict],
    requested_date: date,
    requested_time: time,
    duration: int,
    count: int = 3,
    buffer_minutes: int = 10,
    day_start: int = 8 * 60,   # 08:00
    day_end: int = 22 * 60,    # 22:00
) -> list[dict]:
    """Find *count* free slots on *requested_date*, ranked by closeness.

    Each result dict contains:
        start_time (str HH:MM), duration_minutes, reason (str)
    Lunch hour 12:00–13:00 slots are deprioritised (moved to end).
    """
    # Scan candidates in 15-min increments
    requested_min = _to_minutes(requested_time)
    candidates: list[dict] = []

    candidate_min = day_start
    while candidate_min + duration <= day_end:
        slot_start = candidate_min
        slot_end = candidate_min + duration

        free = not check_conflicts(
            events,
            requested_date,
            _from_minutes(slot_start),
            duration,
            buffer_minutes=buffer_minutes,
        )

        if free:
            # Build reason
            diff = slot_start - requested_min
            t = _from_minutes(slot_start)
            if diff == 0:
                reason = "Requested time is available"
            elif 0 < diff <= 60:
                reason = f"Same day, {diff} min later"
            elif -60 <= diff < 0:
                reason = f"Same day, {abs(diff)} min earlier"
            elif diff > 60:
                hours = diff // 60
                reason = f"Same day, {hours}h later"
            else:
                hours = abs(diff) // 60
                reason = f"Same day, {hours}h earlier"

            if slot_start >= 12 * 60 and slot_start < 13 * 60:
                reason = "During lunch break"
            elif slot_start >= 13 * 60 and slot_start < 14 * 60 and requested_min < 12 * 60:
                reason = "After lunch break"

            if slot_start >= 6 * 60 and slot_start < 10 * 60 and requested_min >= 12 * 60:
                reason = "Morning slot available"

            candidates.append({
                "start_time": t.strftime("%H:%M"),
                "duration_minutes": duration,
                "reason": reason,
                "is_lunch": 12 * 60 <= slot_start < 13 * 60,
                "_distance": abs(diff),
            })

        candidate_min += 15

    # Sort: non-lunch first, then by distance from requested time
    candidates.sort(key=lambda c: (c["is_lunch"], c["_distance"]))

    # Clean up internal keys and return top N
    results = []
    for c in candidates[:count]:
        results.append({
            "start_time": c["start_time"],
            "duration_minutes": c["duration_minutes"],
            "reason": c["reason"],
        })
    return results
