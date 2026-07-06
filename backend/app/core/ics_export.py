"""
iCalendar (.ics) export — RFC 5545 compliant.

Generates a VCALENDAR with VEVENT entries from a list of event dicts.
No external dependencies.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4


def _format_dt(d: date, t: time) -> str:
    """Format a date + time as an iCalendar DATETIME value (local time)."""
    dt = datetime.combine(d, t)
    return dt.strftime("%Y%m%dT%H%M%S")


def _escape(text: str) -> str:
    """Escape special characters for iCalendar text values."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def generate_ics(
    events: list[dict],
    calendar_name: str = "Timeora",
) -> str:
    """Generate a valid .ics string from a list of event dicts.

    Each event dict should have: id, title, date, start_time, duration_minutes.
    """
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{calendar_name}//EN",
        f"X-WR-CALNAME:{_escape(calendar_name)}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]

    now_stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    for ev in events:
        ev_date = ev.get("date")
        if isinstance(ev_date, str):
            ev_date = date.fromisoformat(ev_date)

        ev_time = ev.get("start_time")
        if isinstance(ev_time, str):
            parts = ev_time.split(":")
            ev_time = time(int(parts[0]), int(parts[1]),
                          int(parts[2]) if len(parts) > 2 else 0)

        duration = int(ev.get("duration_minutes", 60))
        end_dt = datetime.combine(ev_date, ev_time) + timedelta(minutes=duration)

        uid = ev.get("id", str(uuid4()))
        title = _escape(ev.get("title", "Untitled"))
        participants = ev.get("participants", "")
        description = ev.get("description", "")
        location_url = ev.get("location_url")

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{uid}")
        lines.append(f"DTSTAMP:{now_stamp}")
        lines.append(f"DTSTART:{_format_dt(ev_date, ev_time)}")
        lines.append(f"DTEND:{_format_dt(end_dt.date(), end_dt.time())}")
        lines.append(f"SUMMARY:{title}")
        description_parts = [description] if description else []
        if participants:
            description_parts.append(f"Participants: {participants}")
        if description_parts:
            lines.append(f"DESCRIPTION:{_escape(chr(10).join(description_parts))}")
        if location_url:
            lines.append(f"URL:{location_url}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)
