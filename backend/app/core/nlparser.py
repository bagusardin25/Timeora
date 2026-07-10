"""
Deterministic bilingual (Indonesian + English) natural-language parser.

Runs locally with zero external dependencies.  When this handles a request
the response is tagged ``source: "fallback"`` so the frontend can show a
small "offline parse" badge.
"""

from __future__ import annotations

import calendar as _cal
import re
from datetime import date, datetime, time, timedelta
from typing import Any

# ---------------------------------------------------------------------------
# Day / month name mappings
# ---------------------------------------------------------------------------

_DAY_ID = {
    "senin": 0, "selasa": 1, "rabu": 2, "kamis": 3,
    "jumat": 4, "jum'at": 4, "sabtu": 5, "minggu": 6,
}
_DAY_EN = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}
_DAYS = {**_DAY_ID, **_DAY_EN}

_MONTH_ID = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4,
    "mei": 5, "juni": 6, "juli": 7, "agustus": 8,
    "september": 9, "oktober": 10, "november": 11, "desember": 12,
}
_MONTH_EN = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}
_MONTHS = {**_MONTH_ID, **_MONTH_EN}

# Short forms
_MONTH_SHORT = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "agu": 8,
    "sep": 9, "okt": 10, "oct": 10, "nov": 11, "des": 12, "dec": 12,
}
_MONTHS.update(_MONTH_SHORT)

# ---------------------------------------------------------------------------
# Intent detection patterns
# ---------------------------------------------------------------------------

_INTENT_PATTERNS: list[tuple[str, list[str]]] = [
    ("help", [
        r"^\s*(hai|halo|hello|hi|hey)\s*[!.?]*\s*$",
        r"^\s*(help|bantuan|tolong)\s*[!.?]*\s*$",
        r"\bapa yang (bisa|dapat) (kamu|anda|kau)\b",
        r"\b(kamu|anda) bisa apa\b",
        r"\bwhat can you (do|help)\b",
        r"^\s*how can you help\b",
        r"\bfitur\s+(apa|tersedia)\b",
        r"\bcapabilities?\b",
    ]),
    ("reschedule", [
        r"\bpindahkan\b", r"\breschedule\b", r"\bmove\b",
        r"\bubah jadwal\b", r"\bganti jadwal\b", r"\bgeser\b",
    ]),
    ("cancel", [
        r"\bbatalkan\b", r"\bcancel\b", r"\bhapus\b", r"\bdelete\b",
        r"\bremove\b",
    ]),
    ("update", [
        r"\bupdate\b", r"\bedit\b",
        r"\b(?:add|set|change|ubah|tambahkan?|kasih)\b.+\b(?:description|deskripsi|details?|notes?|catatan)\b",
        r"\b(?:tag|tags|label|labeli)\b",
        r"\b(?:set|change|ubah|tambahkan?|kasih)\b.+\b(?:tags?|labels?|tagar)\b",
        r"\b(?:remind me|ingatkan(?:\s+saya)?|beri pengingat)\b",
        r"\b(?:set|change|ubah|tambahkan?|kasih)\b.+\b(?:reminder|pengingat)\b",
        r"\bmake\b.+\b(?:important|normal|low priority|not important)\b",
        r"\bmark\b.+\b(?:important|normal|low priority|not important)\b",
        r"\bset\b.+\bpriority\b",
        r"\bjadikan\b", r"\btandai\b",
        r"\bubah\s+(?!jadwal\b)",
    ]),
    ("find_slot", [
        r"\bcari waktu\b", r"\bfind time\b", r"\bcari slot\b",
        r"\bkapan bisa\b", r"\bfind a slot\b", r"\bfind.*free\b",
        r"\bwaktu kosong\b",
    ]),
    ("query", [
        r"\bapa jadwal\b", r"\bwhat do i have\b", r"\bjadwal hari\b",
        r"\bshow schedule\b", r"\bshow my\b", r"\blihat jadwal\b",
        r"\bwhat's on\b", r"\bapa saja\b",
        # Find/list a named event or task (keep after find_slot so "cari waktu" wins)
        r"\bcari\s+(?:task|event|acara|jadwal)\b",
        r"\bfind\s+(?:task|event|meeting|acara)\b",
        r"\blihat\s+(?:task|event|acara)\b",
        r"\btampilkan\b",
        r"\bsearch\s+(?:for\s+)?(?:task|event|meeting)\b",
    ]),
]

# ---------------------------------------------------------------------------
# Recurrence patterns
# ---------------------------------------------------------------------------

_RECURRENCE_PATTERNS: list[tuple[str, str]] = [
    # ID
    (r"\bsetiap\s+hari\s+kerja\b", "weekdays"),
    (r"\bsetiap\s+hari\b", "daily"),
    (r"\bharian\b", "daily"),
    (r"\bmingguan\b", "weekly"),
    (r"\bbulanan\b", "monthly"),
]

# EN
_RECURRENCE_PATTERNS += [
    (r"\bevery\s+weekday\b", "weekdays"),
    (r"\bevery\s+day\b", "daily"),
    (r"\bdaily\b", "daily"),
    (r"\bweekly\b", "weekly"),
    (r"\bmonthly\b", "monthly"),
]

# "setiap senin" / "every monday"
for day_name, day_idx in _DAYS.items():
    short = _cal.day_abbr[day_idx].lower()
    _RECURRENCE_PATTERNS.append(
        (rf"\b(?:setiap|every)\s+{re.escape(day_name)}\b", f"weekly:{day_name}")
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _detect_intent(text: str) -> str:
    """Return the best-matching intent or 'create'."""
    low = text.lower()
    for intent, patterns in _INTENT_PATTERNS:
        for p in patterns:
            if re.search(p, low):
                return intent
    return "create"


def _parse_date(
    text: str,
    today: date,
    *,
    prefer_past: bool = False,
) -> tuple[date | None, str]:
    """Try to extract a date from *text*.  Returns (date, cleaned_text).

    prefer_past: when True (cancel/query/update of existing events), resolve
    bare day/month references to the most recent matching date (including past
    dates in the current year) instead of always jumping forward.
    """
    low = text.lower()

    def resolve_month_day(
        day_num: int,
        month_num: int,
        explicit_year: str | None,
    ) -> date | None:
        if explicit_year:
            try:
                return date(int(explicit_year), month_num, day_num)
            except ValueError:
                return None

        if prefer_past:
            # Prefer this year even if the date already passed (e.g. cancel on the 7th).
            try:
                this_year = date(today.year, month_num, day_num)
            except ValueError:
                this_year = None
            if this_year is not None:
                # Within the last year or any future date this year → use it.
                if this_year >= today - timedelta(days=366):
                    return this_year
            try:
                last_year = date(today.year - 1, month_num, day_num)
            except ValueError:
                last_year = None
            if last_year is not None and (today - last_year).days <= 366:
                return last_year

        for candidate_year in range(today.year, today.year + 5):
            try:
                result_date = date(candidate_year, month_num, day_num)
            except ValueError:
                continue
            if result_date >= today:
                return result_date
        return None

    def resolve_day_only(day_num: int) -> date | None:
        """Resolve bare day-of-month like 'tanggal 7' / 'the 7th'."""
        if not 1 <= day_num <= 31:
            return None

        def safe(year: int, month: int) -> date | None:
            try:
                return date(year, month, day_num)
            except ValueError:
                return None

        this_month = safe(today.year, today.month)
        if prefer_past:
            if this_month is not None:
                return this_month
            # Day invalid this month (e.g. 31 in June) → previous month.
            prev_month = today.month - 1 or 12
            prev_year = today.year if today.month > 1 else today.year - 1
            return safe(prev_year, prev_month)

        # Scheduling: next occurrence of that day-of-month.
        if this_month is not None and this_month >= today:
            return this_month
        next_month = today.month + 1 if today.month < 12 else 1
        next_year = today.year if today.month < 12 else today.year + 1
        nxt = safe(next_year, next_month)
        if nxt is not None:
            return nxt
        # Skip months where day doesn't exist (e.g. 31).
        for offset in range(2, 14):
            m = ((today.month - 1 + offset) % 12) + 1
            y = today.year + ((today.month - 1 + offset) // 12)
            candidate = safe(y, m)
            if candidate is not None and candidate >= today:
                return candidate
        return None

    # Relative dates — ID
    if re.search(r"\bhari\s+ini\b", low):
        return today, re.sub(r"\bhari\s+ini\b", "", text, flags=re.I).strip()
    if re.search(r"\bbesok\b", low):
        return today + timedelta(days=1), re.sub(r"\bbesok\b", "", text, flags=re.I).strip()
    if re.search(r"\blusa\b", low):
        return today + timedelta(days=2), re.sub(r"\blusa\b", "", text, flags=re.I).strip()

    # Relative dates — EN
    if re.search(r"\btoday\b", low):
        return today, re.sub(r"\btoday\b", "", text, flags=re.I).strip()
    if re.search(r"\bday\s+after\s+tomorrow\b", low):
        return today + timedelta(days=2), re.sub(r"\bday\s+after\s+tomorrow\b", "", text, flags=re.I).strip()
    if re.search(r"\btomorrow\b", low):
        return today + timedelta(days=1), re.sub(r"\btomorrow\b", "", text, flags=re.I).strip()

    # "next <day>" / "this <day>"
    m = re.search(r"\b(?:next|this|depan|ini)\s+(\w+)\b", low)
    if m:
        day_name = m.group(1)
        if day_name in _DAYS:
            target_dow = _DAYS[day_name]
            days_ahead = (target_dow - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7 if "next" in m.group(0) or "depan" in m.group(0) else 0
            result_date = today + timedelta(days=days_ahead)
            cleaned = text[:m.start()] + text[m.end():]
            return result_date, cleaned.strip()

    # Day name alone: "senin", "friday"
    for day_name, dow in _DAYS.items():
        pat = rf"\b(?:hari\s+)?{re.escape(day_name)}\b"
        m = re.search(pat, low)
        if m:
            days_ahead = (dow - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7  # next occurrence
            result_date = today + timedelta(days=days_ahead)
            cleaned = text[:m.start()] + text[m.end():]
            return result_date, cleaned.strip()

    # Absolute: "5 Juli", "July 5", "5 juli 2026", "2026-07-05"
    # DD Month [YYYY] — iterate so false positives like "hapus 1-…" don't hide a later date.
    for m in re.finditer(r"\b(\d{1,2})\s+([a-zA-Z]+)(?:\s+(\d{4}))?\b", low):
        day_num = int(m.group(1))
        month_name = m.group(2)
        if month_name in _MONTHS:
            result_date = resolve_month_day(day_num, _MONTHS[month_name], m.group(3))
            if result_date is not None:
                cleaned = text[:m.start()] + text[m.end():]
                return result_date, cleaned.strip()

    # Month DD [, YYYY]
    for m in re.finditer(r"\b([a-zA-Z]+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b", low):
        month_name = m.group(1)
        day_num = int(m.group(2))
        if month_name in _MONTHS:
            result_date = resolve_month_day(day_num, _MONTHS[month_name], m.group(3))
            if result_date is not None:
                cleaned = text[:m.start()] + text[m.end():]
                return result_date, cleaned.strip()

    # ISO: YYYY-MM-DD
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text)
    if m:
        try:
            result_date = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            cleaned = text[:m.start()] + text[m.end():]
            return result_date, cleaned.strip()
        except ValueError:
            pass

    # Bare day-of-month: "tanggal 7", "tgl 7", "the 7th"
    m = re.search(r"\b(?:tanggal|tgl\.?)\s*(\d{1,2})\b", low)
    if m:
        result_date = resolve_day_only(int(m.group(1)))
        if result_date is not None:
            cleaned = text[: m.start()] + text[m.end() :]
            return result_date, cleaned.strip()

    m = re.search(r"\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b", low)
    if m:
        result_date = resolve_day_only(int(m.group(1)))
        if result_date is not None:
            cleaned = text[: m.start()] + text[m.end() :]
            return result_date, cleaned.strip()

    return None, text


def _safe_time(hour: int, minute: int) -> time | None:
    if not 0 <= hour <= 23:
        return None
    if not 0 <= minute <= 59:
        return None
    return time(hour, minute)


def _parse_day_period_preference(text: str, today: date) -> tuple[time | None, date | None, str]:
    """Extract day-part preferences like 'malam ini' / 'tonight'.

    Returns (preferred_time, forced_date_or_None, cleaned_text).
    """
    low = text.lower()
    patterns: list[tuple[str, time, date | None]] = [
        (r"\bmalam\s+ini\b", time(19, 0), today),
        (r"\btonight\b", time(19, 0), today),
        (r"\bthis\s+evening\b", time(19, 0), today),
        (r"\bsore\s+ini\b", time(16, 0), today),
        (r"\bthis\s+afternoon\b", time(15, 0), today),
        (r"\bsiang\s+ini\b", time(13, 0), today),
        (r"\bpagi\s+ini\b", time(9, 0), today),
        (r"\bthis\s+morning\b", time(9, 0), today),
        (r"\bmalam\s+besok\b", time(19, 0), today + timedelta(days=1)),
        (r"\btomorrow\s+night\b", time(19, 0), today + timedelta(days=1)),
        (r"\bsore\s+besok\b", time(16, 0), today + timedelta(days=1)),
        (r"\bmalam\b", time(19, 0), None),
        (r"\bsore\b", time(16, 0), None),
        (r"\bsiang\b", time(13, 0), None),
        (r"\bevening\b", time(19, 0), None),
        (r"\bafternoon\b", time(15, 0), None),
    ]
    for pattern, preferred, forced_date in patterns:
        m = re.search(pattern, low)
        if not m:
            continue
        # Skip bare "malam/sore" when it is TOD after a clock hour ("jam 12 malam").
        if pattern in {r"\bmalam\b", r"\bsore\b", r"\bsiang\b"}:
            before = low[: m.start()].strip()
            if re.search(r"\bjam\s+\d{1,2}(:\d{2})?\s*$", before):
                continue
        cleaned = text[: m.start()] + text[m.end() :]
        return preferred, forced_date, cleaned.strip()
    return None, None, text


def _parse_time(text: str) -> tuple[time | None, str]:
    """Try to extract a time from *text*."""
    low = text.lower()

    # "jam 3 sore", "jam 10 pagi", "jam 14"
    m = re.search(r"\bjam\s+(\d{1,2})(?::(\d{2}))?\s*(pagi|siang|sore|malam)?\b", low)
    if m:
        h = int(m.group(1))
        mins = int(m.group(2)) if m.group(2) else 0
        period = m.group(3)
        if period == "malam" and h == 12:
            h = 0
        elif period == "siang" and 1 <= h <= 5:
            h += 12
        elif period in ("sore", "malam") and h < 12:
            h += 12
        elif period == "pagi" and h == 12:
            h = 0
        cleaned = text[:m.start()] + text[m.end():]
        return _safe_time(h, mins), cleaned.strip()

    # "at 3pm", "at 10:30am", "at 14:00"
    m = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", low)
    if m:
        h = int(m.group(1))
        mins = int(m.group(2)) if m.group(2) else 0
        period = m.group(3)
        if period == "pm" and h < 12:
            h += 12
        elif period == "am" and h == 12:
            h = 0
        cleaned = text[:m.start()] + text[m.end():]
        return _safe_time(h, mins), cleaned.strip()

    # Bare "3pm", "10am", "3:30pm"
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", low)
    if m:
        h = int(m.group(1))
        mins = int(m.group(2)) if m.group(2) else 0
        period = m.group(3)
        if period == "pm" and h < 12:
            h += 12
        elif period == "am" and h == 12:
            h = 0
        cleaned = text[:m.start()] + text[m.end():]
        return _safe_time(h, mins), cleaned.strip()

    # "pukul 10:00", "pukul 14.30"
    m = re.search(r"\bpukul\s+(\d{1,2})[\.:]\s*(\d{2})\b", low)
    if m:
        h = int(m.group(1))
        mins = int(m.group(2))
        cleaned = text[:m.start()] + text[m.end():]
        return _safe_time(h, mins), cleaned.strip()

    return None, text


def _parse_duration(text: str) -> tuple[int | None, str]:
    """Try to extract duration in minutes from *text*."""
    low = text.lower()

    # "selama 45 menit", "selama 2 jam", "selama 1 jam 30 menit"
    m = re.search(
        r"\bselama\s+(?:(\d+)\s*jam)?\s*(?:(\d+)\s*menit)?\b", low
    )
    if m and (m.group(1) or m.group(2)):
        hours = int(m.group(1)) if m.group(1) else 0
        mins = int(m.group(2)) if m.group(2) else 0
        total = hours * 60 + mins
        if total > 0:
            cleaned = text[:m.start()] + text[m.end():]
            return total, cleaned.strip()

    # "for 2 hours", "for 30 minutes", "for 1.5 hours", "for 1 hour 30 minutes"
    m = re.search(
        r"\bfor\s+(?:(\d+(?:\.\d+)?)\s*hours?)?\s*(?:(\d+)\s*min(?:ute)?s?)?\b", low
    )
    if m and (m.group(1) or m.group(2)):
        hours = float(m.group(1)) if m.group(1) else 0
        mins = int(m.group(2)) if m.group(2) else 0
        total = int(hours * 60) + mins
        if total > 0:
            cleaned = text[:m.start()] + text[m.end():]
            return total, cleaned.strip()

    # "45 menit", "2 jam"
    m = re.search(r"\b(\d+)\s*menit\b", low)
    if m:
        cleaned = text[:m.start()] + text[m.end():]
        return int(m.group(1)), cleaned.strip()

    m = re.search(r"\b(\d+(?:\.\d+)?)\s*jam\b", low)
    if m:
        cleaned = text[:m.start()] + text[m.end():]
        return int(float(m.group(1)) * 60), cleaned.strip()

    # "2 hours", "30 minutes"
    m = re.search(r"\b(\d+(?:\.\d+)?)\s*hours?\b", low)
    if m:
        cleaned = text[:m.start()] + text[m.end():]
        return int(float(m.group(1)) * 60), cleaned.strip()

    m = re.search(r"\b(\d+)\s*min(?:ute)?s?\b", low)
    if m:
        cleaned = text[:m.start()] + text[m.end():]
        return int(m.group(1)), cleaned.strip()

    return None, text


def _parse_recurrence(text: str) -> tuple[str | None, str]:
    """Extract recurrence rule from text."""
    low = text.lower()
    for pattern, rule in _RECURRENCE_PATTERNS:
        m = re.search(pattern, low)
        if m:
            cleaned = text[:m.start()] + text[m.end():]
            return rule, cleaned.strip()
    return None, text


def _parse_update_data(text: str) -> tuple[dict[str, Any], str]:
    """Extract event update fields and return cleaned text for title matching."""
    event_data: dict[str, Any] = {}
    remaining = text

    def parse_minutes(raw_number: str, raw_unit: str) -> int:
        value = int(raw_number)
        return value * 60 if raw_unit.lower() in {"hour", "hours", "jam"} else value

    def split_tags(raw_tags: str) -> list[str]:
        tags: list[str] = []
        seen: set[str] = set()
        for raw_tag in re.split(r"[,;]|\band\b|\bdan\b", raw_tags, flags=re.I):
            tag = raw_tag.strip().strip("#.,;:-–— ")
            key = tag.casefold()
            if not tag or key in seen:
                continue
            seen.add(key)
            tags.append(tag)
        return tags

    field_first_description = re.search(
        r"^\s*(?:add|set|update|edit|change|ubah|tambahkan?|kasih)?\s*"
        r"(?:description|deskripsi|details?|notes?|catatan)\s+"
        r"(?P<description>.+?)\s+(?:to|for|ke|untuk)\s+(?P<title>.+)$",
        remaining,
        flags=re.I,
    )
    if field_first_description:
        event_data["description"] = field_first_description.group("description").strip(" .,:;")
        remaining = field_first_description.group("title").strip()

    if not event_data:
        title_first_description = re.search(
            r"\b(?:description|deskripsi|details?|notes?|catatan)\b\s*"
            r"(?:to|as|jadi|menjadi|dengan|:)?\s*(?P<description>.+)$",
            remaining,
            flags=re.I,
        )
        if title_first_description:
            event_data["description"] = title_first_description.group("description").strip(" .,:;")
            remaining = remaining[:title_first_description.start()].strip()

    if not event_data:
        tag_command = re.search(
            r"^\s*(?:tag|tags|label|labeli|tandai)\s+(?P<title>.+?)\s+"
            r"(?:with|as|dengan|sebagai|:)\s+(?P<tags>.+)$",
            remaining,
            flags=re.I,
        )
        if tag_command:
            tags = split_tags(tag_command.group("tags"))
            if tags:
                event_data["tags"] = tags
                remaining = tag_command.group("title").strip()

    if not event_data:
        title_first_tags = re.search(
            r"\b(?:tags?|labels?|tagar)\b\s*(?:to|as|with|dengan|:)?\s*(?P<tags>.+)$",
            remaining,
            flags=re.I,
        )
        if title_first_tags:
            tags = split_tags(title_first_tags.group("tags"))
            if tags:
                event_data["tags"] = tags
                remaining = remaining[:title_first_tags.start()].strip()

    if not event_data:
        reminder_before = re.search(
            r"^\s*(?:remind me|ingatkan(?:\s+saya)?|beri pengingat)\s+"
            r"(?P<number>\d+)\s*(?P<unit>minutes?|mins?|menit|hours?|jam)\s+"
            r"(?:before|sebelum)\s+(?P<title>.+)$",
            remaining,
            flags=re.I,
        )
        if reminder_before:
            event_data["reminder_minutes"] = parse_minutes(
                reminder_before.group("number"),
                reminder_before.group("unit"),
            )
            remaining = reminder_before.group("title").strip()

    if not event_data:
        title_first_reminder = re.search(
            r"\b(?:reminder|pengingat|ingatkan)\b\s*"
            r"(?:to|for|at|before|sebelum|:)?\s*"
            r"(?P<number>\d+)\s*(?P<unit>minutes?|mins?|menit|hours?|jam)\b",
            remaining,
            flags=re.I,
        )
        if title_first_reminder:
            event_data["reminder_minutes"] = parse_minutes(
                title_first_reminder.group("number"),
                title_first_reminder.group("unit"),
            )
            remaining = f"{remaining[:title_first_reminder.start()]} {remaining[title_first_reminder.end():]}"

    priority_patterns = [
        (r"\b(?:not important|not urgent|tidak penting|gak penting|ga penting|nggak penting|low priority|rendah)\b", "low"),
        (r"\b(?:important|urgent|penting|prioritas tinggi)\b", "important"),
        (r"\b(?:normal|biasa)\b", "normal"),
    ]
    if not event_data:
        for pattern, priority in priority_patterns:
            m = re.search(pattern, remaining, flags=re.I)
            if m:
                event_data["priority"] = priority
                remaining = f"{remaining[:m.start()]} {remaining[m.end():]}"
                break

    if event_data:
        cleanup_patterns = [
            r"\bmake\b", r"\bmark\b", r"\bset\b", r"\bjadikan\b",
            r"\btandai\b", r"\bubah\b", r"\bedit\b", r"\bupdate\b",
            r"\bpriority\b", r"\bprioritas(?:nya)?\b", r"\bas\b",
            r"\bdescription\b", r"\bdeskripsi\b", r"\bdetails?\b",
            r"\bnotes?\b", r"\bcatatan\b", r"\btags?\b", r"\blabels?\b",
            r"\btagar\b", r"\breminder\b", r"\bpengingat\b",
            r"\bto\b", r"\bfor\b", r"\bwith\b", r"\bdengan\b",
            r"\bjadi\b", r"\bmenjadi\b",
        ]
        for pattern in cleanup_patterns:
            remaining = re.sub(pattern, " ", remaining, flags=re.I)

    remaining = re.sub(r"\s+", " ", remaining).strip()
    return event_data, remaining


_EVENT_TYPE_NOUNS = (
    r"standup|stand\s*up|1\s*:\s*1|one\s*on\s*one|one-on-one|"
    r"meeting|rapat|sync|call|demo|review|interview|planning|"
    r"workshop|brainstorm|retro|retrospective|kickoff|focus|"
    r"deployment|maintenance|check-?in|huddle"
)

_FREE_SLOT_PATTERNS = (
    r"\bjam\s+yang\s+kosong\b",
    r"\bwaktu\s+yang\s+kosong\b",
    r"\bslot\s+yang\s+kosong\b",
    r"\bjam\s+kosong\b",
    r"\bwaktu\s+kosong\b",
    r"\bslot\s+kosong\b",
    r"\bfree\s+slot\b",
    r"\bavailable\s+slot\b",
    r"\bdi\s+jam\s+kosong\b",
    r"\bpada\s+jam\s+kosong\b",
)


def _mentions_free_slot(text: str) -> bool:
    low = text.lower()
    return any(re.search(pattern, low) for pattern in _FREE_SLOT_PATTERNS)


def _strip_free_slot_phrases(text: str) -> str:
    result = text
    for pattern in _FREE_SLOT_PATTERNS:
        result = re.sub(pattern, " ", result, flags=re.I)
    return result


def _title_case_phrase(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(".,;:-–—\"' ")
    if not cleaned:
        return "Meeting"
    # Keep short acronyms; otherwise capitalize first letter only (natural titles).
    if cleaned.isupper() and len(cleaned) <= 4:
        return cleaned
    return cleaned[:1].upper() + cleaned[1:]


def _extract_title(text: str) -> str:
    """Clean up remaining text to use as event title."""
    result = _strip_free_slot_phrases(text)

    # Drop relative/absolute date & time phrases that often leak into titles
    temporal_patterns = [
        r"\bhari\s+ini\b", r"\bbesok\b", r"\blusa\b",
        r"\btoday\b", r"\btomorrow\b", r"\bday\s+after\s+tomorrow\b",
        r"\bnext\s+\w+\b", r"\bthis\s+\w+\b",
        r"\b\d{1,2}[:.]\d{2}\b", r"\bjam\s+\d{1,2}([:.]\d{2})?\b",
        r"\b\d{1,2}\s*(am|pm)\b", r"\b\d{4}-\d{2}-\d{2}\b",
        r"\bselama\s+\d+\s*(menit|jam|hours?|minutes?)\b",
        r"\bfor\s+\d+\s*(menit|jam|hours?|minutes?)\b",
        r"\b\d+\s*(menit|jam|hours?|minutes?)\b",
        # Bare day references left when date parse failed or residual tokens
        r"\b(?:tanggal|tgl\.?)\s*\d{1,2}\b",
        r"\bthe\s+\d{1,2}(?:st|nd|rd|th)\b",
        r"\bon\s+\d{1,2}\b",
    ]
    for pattern in temporal_patterns:
        result = re.sub(pattern, " ", result, flags=re.I)

    # Remove common prefixes / conversational create verbs
    prefixes = [
        r"\bjadwalkan\b", r"\bschedule\b", r"\bbuatin\b", r"\bbuatkan\b",
        r"\bbuatlah\b", r"\bbuat\b", r"\bcreate\b",
        r"\badd\b", r"\btambah(?:kan)?\b", r"\bset\b", r"\bbook\b",
        r"\bpindahkan\b", r"\breschedule\b", r"\bmove\b",
        r"\bbatalkan\b", r"\bcancel\b", r"\bhapus\b", r"\bdelete\b", r"\bremove\b",
        r"\bupdate\b", r"\bedit\b", r"\bjadikan\b", r"\btandai\b",
        r"\bjadwal(?:kan)?\b",
        r"\bcari\b", r"\bfind\b", r"\blihat\b", r"\btampilkan\b", r"\bsearch\b",
        r"\btask\b", r"\bevent\b", r"\bacara\b",
        # Availability fluff often left after cancel/query ("meeting yg tersedia")
        r"\b(?:yg|yang)\s+tersedia\b", r"\bavailable\b", r"\byang\s+ada\b",
    ]
    for p in prefixes:
        result = re.sub(p, " ", result, flags=re.I)

    # Conversational fillers common in Indo/English chat
    fillers = [
        r"\boke+\b", r"\bok\b", r"\bokey\b", r"\balright\b", r"\bsure\b",
        r"\bkalo\b", r"\bkalau\b", r"\bgitu\b", r"\bdeh\b",
        r"\bdong\b", r"\bsih\b", r"\bya+\b", r"\byuk\b", r"\bmohon\b",
        r"\btolong\b", r"\bplease\b", r"\bsaya\b", r"\bkita\b", r"\baku\b",
        r"\bdengan\b", r"\buntuk\b", r"\bke\b", r"\bdi\b", r"\bpada\b",
        r"\byang\b", r"\bthen\b", r"\bso\b", r"\bjust\b",
        r"\bthe\b", r"\bmy\b", r"\bme\b",
    ]
    for f in fillers:
        result = re.sub(f, " ", result, flags=re.I)

    result = re.sub(r"\s+", " ", result).strip(".,;:-–—\"' ")
    # Date extraction can leave a trailing preposition ("1-on-1 on" after "July 7").
    result = re.sub(r"\s+\b(?:on|at|di|pada|for|untuk)\s*$", "", result, flags=re.I).strip()

    if result.lower() in {"", "event", "acara", "kegiatan"}:
        return "Meeting"

    # If cleanup still left a long chatty phrase, fall back to event-type noun.
    word_count = len(result.split())
    if word_count > 6:
        noun_match = re.search(rf"\b({_EVENT_TYPE_NOUNS})\b", result, flags=re.I)
        if noun_match:
            return _title_case_phrase(noun_match.group(1))

    # Prefer a known event noun if that is essentially all that remains.
    noun_only = re.fullmatch(rf"({_EVENT_TYPE_NOUNS})", result, flags=re.I)
    if noun_only:
        return _title_case_phrase(noun_only.group(1))

    return result if result else "Meeting"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse(text: str, today: date | None = None) -> dict[str, Any]:
    """Parse natural-language scheduling text.

    Returns a dict with keys:
        intent, title, date, start_time, duration_minutes,
        recurrence, participants, warnings, source
    """
    if today is None:
        today = date.today()

    warnings: list[str] = []
    remaining = text.strip()

    # 1. Intent
    intent = _detect_intent(remaining)

    # 2. Recurrence
    recurrence, remaining = _parse_recurrence(remaining)

    # 3. Date — only default to today for create; cancel/reschedule match by title alone.
    # For cancel/query/update prefer past dates when resolving "tanggal 7" / "7 Juli".
    prefer_past = intent in {"cancel", "query", "update"}
    parsed_date, remaining = _parse_date(remaining, today, prefer_past=prefer_past)
    if parsed_date is None and intent == "create":
        parsed_date = today
        warnings.append("No date found — defaulting to today")

    # 3b. Day-part preference ("malam ini", "tonight") — influences date + preferred clock
    period_time, period_date, remaining = _parse_day_period_preference(remaining, today)
    if period_date is not None and parsed_date is None:
        parsed_date = period_date
    if parsed_date is None and intent in {"find_slot", "query"} and period_time is not None:
        parsed_date = today

    # 4. Free-slot preference (before time/title cleanup so phrases are detected)
    prefer_free_slot = _mentions_free_slot(remaining)
    if prefer_free_slot:
        remaining = _strip_free_slot_phrases(remaining)

    # 5. Time (clock first; day-part is a softer preference for ranking free slots)
    parsed_time, remaining = _parse_time(remaining)
    time_explicit = parsed_time is not None
    if parsed_time is None and period_time is not None:
        parsed_time = period_time
        # Day-part is explicit enough for slot ranking ("malam" → prefer evening).
        time_explicit = intent == "find_slot"
    if parsed_time is None:
        parsed_time = time(9, 0)
        if intent == "create":
            warnings.append("No time found — defaulting to 09:00")

    # 6. Update data
    event_data: dict[str, Any] = {}
    if intent == "update":
        event_data, remaining = _parse_update_data(remaining)

    # 7. Duration
    duration, remaining = _parse_duration(remaining)
    if duration is None:
        duration = 60
        if intent == "create":
            warnings.append("No duration found — defaulting to 60 minutes")

    # 8. Title from remaining text
    title = _extract_title(remaining)

    # 9. Compute ISO datetimes for convenience
    if parsed_date is not None:
        start_dt = datetime.combine(parsed_date, parsed_time)
        end_dt = start_dt + timedelta(minutes=duration)
        start_at = start_dt.isoformat()
        end_at = end_dt.isoformat()
        date_value: str | None = parsed_date.isoformat()
    else:
        start_at = None
        end_at = None
        date_value = None

    result = {
        "intent": intent,
        "title": title,
        "date": date_value,
        "start_time": parsed_time.strftime("%H:%M"),
        "duration_minutes": duration,
        "recurrence": recurrence,
        "participants": "",
        "warnings": warnings,
        "source": "fallback",
        "start_at": start_at,
        "end_at": end_at,
        "time_explicit": time_explicit,
        "prefer_free_slot": prefer_free_slot,
    }
    if event_data:
        result["event_data"] = event_data
    return result
