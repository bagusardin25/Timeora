"""
Weekly availability heatmap — free/busy score per day and hour.
"""

from __future__ import annotations

from datetime import date, time, timedelta

from app.core.conflicts import _event_range


_DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_DEFAULT_HOURS = list(range(8, 21))


def _week_bounds(ref: date) -> tuple[date, date]:
    monday = ref - timedelta(days=ref.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _parse_event_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def _hour_free_score(day_events: list[dict], hour: int) -> float:
    """Return 0.0 (fully busy) to 1.0 (fully free) for a one-hour slot."""
    slot_start = hour * 60
    slot_end = (hour + 1) * 60
    occupied = 0
    for ev in day_events:
        start_min, end_min = _event_range(ev)
        overlap_start = max(start_min, slot_start)
        overlap_end = min(end_min, slot_end)
        if overlap_end > overlap_start:
            occupied += overlap_end - overlap_start
    occupancy = min(60, occupied) / 60.0
    return round(1.0 - occupancy, 2)


def _find_best_slots(cells: list[dict], min_hours: int = 2) -> list[dict]:
    """Find longest runs of fully-free weekday hours."""
    weekdays = {"Mon", "Tue", "Wed", "Thu", "Fri"}
    by_day: dict[str, list[dict]] = {}
    for cell in cells:
        if cell["day"] not in weekdays:
            continue
        by_day.setdefault(cell["day"], []).append(cell)

    best: list[dict] = []
    for day, day_cells in by_day.items():
        day_cells.sort(key=lambda c: c["hour"])
        run_start = None
        run_len = 0
        for cell in day_cells:
            if cell["score"] >= 0.99:
                if run_start is None:
                    run_start = cell["hour"]
                run_len += 1
            else:
                if run_len >= min_hours and run_start is not None:
                    best.append({
                        "day": day,
                        "start_hour": run_start,
                        "end_hour": run_start + run_len,
                        "duration_hours": run_len,
                    })
                run_start = None
                run_len = 0
        if run_len >= min_hours and run_start is not None:
            best.append({
                "day": day,
                "start_hour": run_start,
                "end_hour": run_start + run_len,
                "duration_hours": run_len,
            })

    best.sort(key=lambda s: (-s["duration_hours"], s["day"], s["start_hour"]))
    return best[:3]


def availability_heatmap(
    events: list[dict],
    reference_date: date | None = None,
    hours: list[int] | None = None,
) -> dict:
    """Build a week grid of availability scores and top free windows."""
    if reference_date is None:
        reference_date = date.today()
    if hours is None:
        hours = _DEFAULT_HOURS

    monday, _ = _week_bounds(reference_date)
    cells: list[dict] = []

    for day_idx, day in enumerate(_DAY_NAMES_SHORT):
        target_date = monday + timedelta(days=day_idx)
        day_events = []
        for ev in events:
            ev_date = _parse_event_date(ev.get("date"))
            if ev_date == target_date:
                day_events.append(ev)

        for hour in hours:
            score = _hour_free_score(day_events, hour)
            cells.append({
                "day": day,
                "hour": hour,
                "score": score,
                "date": target_date.isoformat(),
            })

    best_slots = _find_best_slots(cells)
    free_hours = sum(1 for c in cells if c["score"] >= 0.99)
    total_hours = len(cells)
    availability_pct = round((free_hours / total_hours) * 100, 0) if total_hours else 0.0

    return {
        "days": _DAY_NAMES_SHORT,
        "hours": hours,
        "cells": cells,
        "best_slots": best_slots,
        "availability_pct": availability_pct,
    }