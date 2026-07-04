"""
Weekly insights / analytics engine.

Computes hours per day, deep-work block detection,
schedule fragmentation, and a human-readable suggestion.
"""

from __future__ import annotations

import calendar as _cal
from datetime import date, datetime, time, timedelta

from app.core import conflicts as conflicts_engine


def _to_minutes(t) -> int:
    """Convert time or HH:MM string to minutes since midnight."""
    if isinstance(t, time):
        return t.hour * 60 + t.minute
    if isinstance(t, str):
        parts = t.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    return 0


def _week_bounds(ref: date) -> tuple[date, date]:
    """Return (Monday, Sunday) of the week containing *ref*."""
    monday = ref - timedelta(days=ref.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def weekly_summary(
    events: list[dict],
    reference_date: date | None = None,
) -> dict:
    """Compute weekly analytics for the week containing *reference_date*.

    Parameters
    ----------
    events : list[dict]
        Each dict must have ``date``, ``start_time``, ``duration_minutes``.
    reference_date : date, optional
        Defaults to today.

    Returns
    -------
    dict with keys:
        hours_per_day, total_hours, deep_work_blocks,
        fragmentation_score, suggestion
    """
    if reference_date is None:
        reference_date = date.today()

    monday, sunday = _week_bounds(reference_date)

    # Filter events to this week
    week_events: list[dict] = []
    for ev in events:
        ev_date = ev.get("date")
        if isinstance(ev_date, str):
            ev_date = date.fromisoformat(ev_date)
        if monday <= ev_date <= sunday:
            week_events.append({**ev, "_date": ev_date})

    # ---- Hours per day ----
    hours_per_day: dict[str, float] = {}
    day_events: dict[str, list[dict]] = {}
    for i, day_name in enumerate(_DAY_NAMES_SHORT):
        d = monday + timedelta(days=i)
        day_evts = [e for e in week_events if e["_date"] == d]
        total_mins = sum(int(e["duration_minutes"]) for e in day_evts)
        hours_per_day[day_name] = round(total_mins / 60, 1)
        day_events[day_name] = sorted(day_evts, key=lambda e: _to_minutes(e["start_time"]))

    total_hours = round(sum(hours_per_day.values()), 1)

    # ---- Deep work blocks (≥ 2h contiguous) ----
    deep_work_blocks: list[dict] = []
    for day_name, evts in day_events.items():
        if not evts:
            continue
        # Merge consecutive events (gap ≤ 10 min)
        blocks: list[tuple[int, int]] = []
        for ev in evts:
            s = _to_minutes(ev["start_time"])
            e = s + int(ev["duration_minutes"])
            if blocks and s - blocks[-1][1] <= 10:
                blocks[-1] = (blocks[-1][0], max(blocks[-1][1], e))
            else:
                blocks.append((s, e))

        for s, e in blocks:
            duration = e - s
            if duration >= 120:
                d_idx = _DAY_NAMES_SHORT.index(day_name)
                block_date = monday + timedelta(days=d_idx)
                deep_work_blocks.append({
                    "date": block_date.isoformat(),
                    "start": f"{s // 60:02d}:{s % 60:02d}",
                    "end": f"{e // 60:02d}:{e % 60:02d}",
                    "duration_minutes": duration,
                })

    # ---- Fragmentation score ----
    total_gaps = 0
    total_events = 0
    for day_name, evts in day_events.items():
        if len(evts) < 2:
            continue
        total_events += len(evts)
        for i in range(1, len(evts)):
            prev_end = _to_minutes(evts[i - 1]["start_time"]) + int(evts[i - 1]["duration_minutes"])
            curr_start = _to_minutes(evts[i]["start_time"])
            gap = curr_start - prev_end
            if 0 < gap <= 60:  # Small gaps indicate fragmentation
                total_gaps += 1

    if total_events > 1:
        fragmentation_score = round(min(100, (total_gaps / (total_events - 1)) * 100), 0)
    else:
        fragmentation_score = 0.0

    # ---- Suggestion ----
    suggestion = _generate_suggestion(hours_per_day, deep_work_blocks, fragmentation_score)

    actions = recommend_actions(
        hours_per_day, week_events, monday, deep_work_blocks
    )

    return {
        "hours_per_day": hours_per_day,
        "total_hours": total_hours,
        "deep_work_blocks": deep_work_blocks,
        "fragmentation_score": fragmentation_score,
        "suggestion": suggestion,
        "actions": actions,
    }


def _generate_suggestion(
    hours_per_day: dict[str, float],
    deep_work_blocks: list[dict],
    fragmentation: float,
) -> str:
    """Generate a short actionable suggestion based on the week's data."""
    if sum(hours_per_day.values()) == 0:
        return "No events scheduled this week. Start by adding your key meetings and focus blocks."

    # Find lightest weekday
    weekdays = {k: v for k, v in hours_per_day.items() if k in ("Mon", "Tue", "Wed", "Thu", "Fri")}
    if weekdays:
        lightest = min(weekdays, key=weekdays.get)  # type: ignore
        lightest_hours = weekdays[lightest]

        if lightest_hours < 2 and len(deep_work_blocks) == 0:
            return f"{lightest} is light ({lightest_hours}h). Consider blocking it for deep work — no focus blocks detected this week."

    if fragmentation > 60:
        return "Your schedule is fragmented with many short gaps. Try grouping meetings back-to-back to create longer focus blocks."

    if len(deep_work_blocks) >= 3:
        return f"Great week! You have {len(deep_work_blocks)} deep-work blocks. Keep protecting those focus windows."

    if len(deep_work_blocks) == 0:
        return "No deep-work blocks (≥2h) this week. Try reserving a morning for uninterrupted focus."

    heaviest = max(hours_per_day, key=hours_per_day.get)  # type: ignore
    return f"Busiest day is {heaviest} ({hours_per_day[heaviest]}h). Balance your load by moving non-urgent items to lighter days."


def recommend_actions(
    hours_per_day: dict[str, float],
    week_events: list[dict],
    monday: date,
    deep_work_blocks: list[dict],
) -> list[dict]:
    """Return one-click insight actions for the current week."""
    weekdays = {k: v for k, v in hours_per_day.items() if k in _DAY_NAMES_SHORT[:5]}
    actions: list[dict] = []

    if sum(weekdays.values()) == 0:
        actions.append({
            "type": "block_focus_time",
            "label": "Block focus time",
            "description": "Reserve a 2-hour focus block this week",
        })
        return actions

    lightest = min(weekdays, key=weekdays.get)  # type: ignore[arg-type]
    heaviest = max(weekdays, key=weekdays.get)  # type: ignore[arg-type]

    if len(deep_work_blocks) == 0 or weekdays[lightest] < 3:
        actions.append({
            "type": "block_focus_time",
            "label": "Block focus time",
            "description": f"Reserve 2h on {lightest} for deep work",
        })

    if (
        heaviest != lightest
        and weekdays[heaviest] - weekdays[lightest] >= 2
        and weekdays[heaviest] >= 3
    ):
        actions.append({
            "type": "spread_load",
            "label": "Spread load",
            "description": f"Move an event from {heaviest} to {lightest}",
        })

    return actions


def _weekday_date(monday: date, day_short: str) -> date:
    idx = _DAY_NAMES_SHORT.index(day_short)
    return monday + timedelta(days=idx)


def _parse_time_str(value: str) -> time:
    parts = value.split(":")
    return time(int(parts[0]), int(parts[1]))


def plan_block_focus_time(
    events: list[dict],
    reference_date: date | None = None,
    duration_minutes: int = 120,
) -> dict:
    """Pick the lightest weekday and a free slot for a focus block."""
    if reference_date is None:
        reference_date = date.today()

    summary = weekly_summary(events, reference_date)
    weekdays = {
        k: v
        for k, v in summary["hours_per_day"].items()
        if k in _DAY_NAMES_SHORT[:5]
    }
    lightest = min(weekdays, key=weekdays.get)  # type: ignore[arg-type]
    monday, _ = _week_bounds(reference_date)
    target_date = _weekday_date(monday, lightest)

    alternatives = conflicts_engine.find_alternatives(
        events, target_date, time(9, 0), duration_minutes, count=1
    )
    if not alternatives:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No free {duration_minutes}-minute slot on {lightest}",
        )

    slot = alternatives[0]
    return {
        "title": "Focus Block",
        "date": target_date,
        "start_time": _parse_time_str(slot["start_time"]),
        "duration_minutes": duration_minutes,
        "day": lightest,
    }


def plan_spread_load(
    events: list[dict],
    reference_date: date | None = None,
) -> dict:
    """Pick the shortest event on the heaviest day and a slot on the lightest day."""
    if reference_date is None:
        reference_date = date.today()

    summary = weekly_summary(events, reference_date)
    weekdays = {
        k: v
        for k, v in summary["hours_per_day"].items()
        if k in _DAY_NAMES_SHORT[:5]
    }
    if not weekdays:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No weekday events to rebalance")

    lightest = min(weekdays, key=weekdays.get)  # type: ignore[arg-type]
    heaviest = max(weekdays, key=weekdays.get)  # type: ignore[arg-type]
    if heaviest == lightest or weekdays[heaviest] - weekdays[lightest] < 2:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Schedule is already balanced")

    monday, _ = _week_bounds(reference_date)
    heavy_date = _weekday_date(monday, heaviest)
    light_date = _weekday_date(monday, lightest)

    heavy_events: list[dict] = []
    for ev in events:
        ev_date = ev.get("date")
        if isinstance(ev_date, str):
            ev_date = date.fromisoformat(ev_date)
        if ev_date == heavy_date:
            heavy_events.append(ev)

    if not heavy_events:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"No events on {heaviest} to move")

    movable = min(heavy_events, key=lambda e: int(e["duration_minutes"]))
    start_val = movable["start_time"]
    if isinstance(start_val, str):
        requested_time = _parse_time_str(start_val)
    else:
        requested_time = start_val

    alternatives = conflicts_engine.find_alternatives(
        events,
        light_date,
        requested_time,
        int(movable["duration_minutes"]),
        count=3,
    )
    slot = None
    for alt in alternatives:
        slot_time = _parse_time_str(alt["start_time"])
        conflicts = conflicts_engine.check_conflicts(
            events,
            light_date,
            slot_time,
            int(movable["duration_minutes"]),
            exclude_id=str(movable.get("id")),
        )
        if not conflicts:
            slot = alt
            break

    if slot is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No free slot on {lightest} for this event",
        )

    return {
        "event_id": str(movable["id"]),
        "title": movable.get("title", "Event"),
        "from_day": heaviest,
        "to_day": lightest,
        "date": light_date,
        "start_time": _parse_time_str(slot["start_time"]),
    }
