from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models import EventCreate

_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?"
    r"(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)


def _unfold_lines(content: str) -> list[str]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for line in normalized.split("\n"):
        if line.startswith((" ", "\t")) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _unescape(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def _parse_property(line: str) -> tuple[str, dict[str, str], str]:
    head, separator, value = line.partition(":")
    if not separator:
        return line.upper(), {}, ""
    parts = head.split(";")
    params: dict[str, str] = {}
    for part in parts[1:]:
        key, equals, parameter_value = part.partition("=")
        if equals:
            params[key.upper()] = parameter_value.strip('"')
    return parts[0].upper(), params, value


def _parse_datetime(
    value: str,
    params: dict[str, str],
    default_timezone: str,
) -> datetime:
    if params.get("VALUE", "").upper() == "DATE" or (
        len(value) == 8 and "T" not in value
    ):
        parsed_date = datetime.strptime(value[:8], "%Y%m%d").date()
        return datetime.combine(parsed_date, time(9, 0))

    raw = value.rstrip("Z")
    date_format = "%Y%m%dT%H%M%S" if len(raw) >= 15 else "%Y%m%dT%H%M"
    parsed = datetime.strptime(raw[:15] if len(raw) >= 15 else raw, date_format)
    try:
        target_zone = ZoneInfo(default_timezone)
    except ZoneInfoNotFoundError:
        target_zone = ZoneInfo("UTC")

    if value.endswith("Z"):
        return parsed.replace(tzinfo=ZoneInfo("UTC")).astimezone(target_zone).replace(
            tzinfo=None
        )

    timezone_id = params.get("TZID")
    if timezone_id:
        try:
            source_zone = ZoneInfo(timezone_id)
            return parsed.replace(tzinfo=source_zone).astimezone(target_zone).replace(
                tzinfo=None
            )
        except ZoneInfoNotFoundError:
            pass
    return parsed


def _duration_minutes(value: str) -> int:
    match = _DURATION_RE.fullmatch(value.upper())
    if not match:
        raise ValueError("Unsupported DURATION value")
    values = {key: int(item or 0) for key, item in match.groupdict().items()}
    seconds = (
        values["days"] * 86400
        + values["hours"] * 3600
        + values["minutes"] * 60
        + values["seconds"]
    )
    return max(5, round(seconds / 60))


def _recurrence_rule(value: str | None) -> str | None:
    if not value:
        return None
    parts = dict(
        item.split("=", 1)
        for item in value.upper().split(";")
        if "=" in item
    )
    frequency = parts.get("FREQ")
    if frequency == "DAILY":
        return "daily"
    if frequency == "MONTHLY":
        return "monthly"
    if frequency == "WEEKLY":
        days = parts.get("BYDAY", "").split(",")
        weekday_names = {
            "MO": "monday",
            "TU": "tuesday",
            "WE": "wednesday",
            "TH": "thursday",
            "FR": "friday",
            "SA": "saturday",
            "SU": "sunday",
        }
        if days == ["MO", "TU", "WE", "TH", "FR"]:
            return "weekdays"
        if len(days) == 1 and days[0] in weekday_names:
            return f"weekly:{weekday_names[days[0]]}"
        return "weekly"
    return None


def parse_ics(
    content: str,
    *,
    default_timezone: str = "Asia/Jakarta",
) -> tuple[list[EventCreate], list[str]]:
    if "BEGIN:VCALENDAR" not in content.upper():
        raise ValueError("File is not a valid iCalendar document")

    raw_events: list[list[str]] = []
    current: list[str] | None = None
    for line in _unfold_lines(content):
        if line.upper() == "BEGIN:VEVENT":
            current = []
        elif line.upper() == "END:VEVENT" and current is not None:
            raw_events.append(current)
            current = None
        elif current is not None:
            current.append(line)

    events: list[EventCreate] = []
    errors: list[str] = []
    for index, lines in enumerate(raw_events, start=1):
        properties: dict[str, list[tuple[dict[str, str], str]]] = {}
        for line in lines:
            name, params, value = _parse_property(line)
            properties.setdefault(name, []).append((params, value))
        try:
            if "DTSTART" not in properties:
                raise ValueError("DTSTART is required")
            start_params, start_value = properties["DTSTART"][0]
            start = _parse_datetime(
                start_value, start_params, default_timezone
            )

            if "DTEND" in properties:
                end_params, end_value = properties["DTEND"][0]
                end = _parse_datetime(end_value, end_params, default_timezone)
                duration = round((end - start).total_seconds() / 60)
            elif "DURATION" in properties:
                duration = _duration_minutes(properties["DURATION"][0][1])
            else:
                duration = 60
            if not 5 <= duration <= 1440:
                raise ValueError("Event duration must be between 5 and 1440 minutes")

            title = _unescape(
                properties.get("SUMMARY", [({}, "Untitled event")])[0][1]
            ).strip()
            uid = properties.get("UID", [({}, "")])[0][1].strip()
            attendees: list[str] = []
            for _, value in properties.get("ATTENDEE", []):
                attendee = value.removeprefix("mailto:").removeprefix("MAILTO:")
                if attendee:
                    attendees.append(attendee)
            categories = properties.get("CATEGORIES", [({}, "")])[0][1]
            category = categories.split(",", 1)[0].strip().lower() or None
            recurrence = properties.get("RRULE", [({}, "")])[0][1]
            description = _unescape(
                properties.get("DESCRIPTION", [({}, "")])[0][1]
            ).strip()
            location_url = properties.get("URL", [({}, "")])[0][1].strip() or None

            events.append(
                EventCreate(
                    title=title or "Untitled event",
                    date=start.date(),
                    start_time=start.time(),
                    duration_minutes=duration,
                    participants=", ".join(attendees),
                    recurrence_rule=_recurrence_rule(recurrence),
                    category=category,
                    description=description,
                    location_url=location_url,
                    external_ids={"ics": uid} if uid else {},
                )
            )
        except (ValueError, TypeError) as exc:
            errors.append(f"Event {index}: {exc}")

    if not raw_events:
        errors.append("No VEVENT entries found")
    return events, errors
