"""
Recurring-event expansion engine.

Supports daily, weekly (specific day), weekdays, and monthly rules
with Google-style month-end clamping.
"""

from __future__ import annotations

import calendar as _cal
import copy
import re
from datetime import date, timedelta

# Day-name → weekday index mapping (shared with nlparser)
_DAYS = {
    "senin": 0, "selasa": 1, "rabu": 2, "kamis": 3,
    "jumat": 4, "jum'at": 4, "sabtu": 5, "minggu": 6,
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def parse_recurrence(text: str) -> str | None:
    """Extract a simple recurrence rule from free-form text.

    Returns one of:
        ``'daily'``, ``'weekdays'``, ``'weekly:<dayname>'``,
        ``'weekly'``, ``'monthly'``, or *None*.
    """
    low = text.lower()

    # Weekdays first (more specific)
    if re.search(r"\b(?:setiap\s+hari\s+kerja|every\s+weekday)\b", low):
        return "weekdays"

    # Daily
    if re.search(r"\b(?:setiap\s+hari|every\s+day|harian|daily)\b", low):
        return "daily"

    # Specific day: "setiap senin", "every monday"
    m = re.search(r"\b(?:setiap|every)\s+(\w+)\b", low)
    if m and m.group(1) in _DAYS:
        return f"weekly:{m.group(1)}"

    # Generic weekly / monthly
    if re.search(r"\b(?:mingguan|weekly)\b", low):
        return "weekly"
    if re.search(r"\b(?:bulanan|monthly)\b", low):
        return "monthly"

    return None


def _clamp_day(year: int, month: int, day: int) -> date:
    """Return a valid date, clamping *day* to the last day of *month*."""
    max_day = _cal.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def expand_recurrence(
    event: dict,
    range_start: date,
    range_end: date,
) -> list[dict]:
    """Expand a recurring event into concrete instances.

    *event* must have at least ``date``, ``recurrence_rule``, and the usual
    scheduling fields.  Returns a list of event dicts (shallow copies) with
    the ``date`` field replaced by each occurrence date.  The original
    ``date`` serves as the anchor/start of the series.
    """
    rule: str | None = event.get("recurrence_rule")
    if not rule:
        return []

    anchor_date = event.get("date")
    if isinstance(anchor_date, str):
        anchor_date = date.fromisoformat(anchor_date)

    instances: list[dict] = []

    if rule == "daily":
        d = max(anchor_date, range_start)
        while d <= range_end:
            inst = _make_instance(event, d)
            instances.append(inst)
            d += timedelta(days=1)

    elif rule == "weekdays":
        d = max(anchor_date, range_start)
        while d <= range_end:
            if d.weekday() < 5:  # Mon–Fri
                inst = _make_instance(event, d)
                instances.append(inst)
            d += timedelta(days=1)

    elif rule.startswith("weekly:"):
        day_name = rule.split(":", 1)[1]
        target_dow = _DAYS.get(day_name)
        if target_dow is None:
            return []
        d = max(anchor_date, range_start)
        # Advance to first target day
        days_ahead = (target_dow - d.weekday()) % 7
        d += timedelta(days=days_ahead)
        while d <= range_end:
            inst = _make_instance(event, d)
            instances.append(inst)
            d += timedelta(days=7)

    elif rule == "weekly":
        # Weekly on the same day-of-week as anchor
        target_dow = anchor_date.weekday()
        d = max(anchor_date, range_start)
        days_ahead = (target_dow - d.weekday()) % 7
        d += timedelta(days=days_ahead)
        while d <= range_end:
            inst = _make_instance(event, d)
            instances.append(inst)
            d += timedelta(days=7)

    elif rule == "monthly":
        anchor_day = anchor_date.day
        # Start from anchor month or range_start month, whichever is later
        y, m = range_start.year, range_start.month
        if date(y, m, 1) < date(anchor_date.year, anchor_date.month, 1):
            y, m = anchor_date.year, anchor_date.month

        while True:
            try:
                d = _clamp_day(y, m, anchor_day)
            except ValueError:
                break
            if d > range_end:
                break
            if d >= range_start and d >= anchor_date:
                inst = _make_instance(event, d)
                instances.append(inst)
            # Next month
            m += 1
            if m > 12:
                m = 1
                y += 1

    return instances


def _make_instance(event: dict, occurrence_date: date) -> dict:
    """Create a concrete instance dict for one occurrence."""
    inst = copy.copy(event)
    inst["date"] = occurrence_date.isoformat() if isinstance(occurrence_date, date) else occurrence_date
    # Mark as expanded instance
    inst["_recurring_instance"] = True
    return inst
