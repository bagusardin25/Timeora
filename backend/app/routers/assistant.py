"""
Multi-intent assistant endpoint.

Handles reschedule, cancel, query, and find_slot intents.
Tier 3: confirm + execute for cancel/reschedule.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.auth import get_current_user
from app import data_access
from app.core import assistant_tools, conflicts as conflicts_engine
from app.core.ai_parse import parse_assistant_command
from app.core.i18n_messages import msg, resolve_locale
from app.event_ids import base_event_id
from app.models import AssistantRequest, AssistantResponse

router = APIRouter()

# Collapse common 1:1 / 1-on-1 spellings so cancel/query match calendar titles.
_ONE_ON_ONE_RE = re.compile(r"\b1\s*(?:[:\-–—]\s*1|on\s*1)\b", re.I)
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
# Leading container words only — keep "meeting"/"rapat" as real title tokens.
_TITLE_NOISE_RE = re.compile(
    r"^(?:task|event|acara|jadwal)\s+",
    re.I,
)
_TITLE_FLUFF_RE = re.compile(
    r"\b(?:yg|yang)\s+tersedia\b|\bavailable\b|\byang\s+ada\b",
    re.I,
)


def _event_to_dict(ev) -> dict:
    if hasattr(ev, "model_dump"):
        return ev.model_dump(mode="json")
    return ev


def _parse_date_value(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _parse_time_value(value: str | None) -> time | None:
    if not value:
        return None
    try:
        parts = value.split(":")
        h, m = int(parts[0]), int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
        return time(h, m, s)
    except (TypeError, ValueError, IndexError):
        return None


def _clean_title_query(value: str | None) -> str:
    """Normalize a user/AI title query for matching calendar events."""
    text = (value or "").strip()
    if not text:
        return ""
    text = _TITLE_NOISE_RE.sub("", text).strip()
    text = _TITLE_FLUFF_RE.sub(" ", text)
    # Residual date tokens sometimes leak from partial parses.
    text = re.sub(r"\b(?:tanggal|tgl\.?)\s*\d{1,2}\b", " ", text, flags=re.I)
    text = re.sub(r"\bthe\s+\d{1,2}(?:st|nd|rd|th)\b", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(".,;:-–—\"' ")
    text = re.sub(r"\s+\b(?:on|at|di|pada)\s*$", "", text, flags=re.I).strip()
    return text


def _normalize_title_key(value: str | None) -> str:
    text = (value or "").lower().strip()
    if not text:
        return ""
    text = _ONE_ON_ONE_RE.sub("1on1", text)
    text = _NON_ALNUM_RE.sub("", text)
    return text


def _title_matches(query: str | None, title: str | None) -> bool:
    """True if query matches event title (substring + normalized 1-on-1 variants)."""
    q_raw = _clean_title_query(query)
    if not q_raw:
        return True
    t_raw = (title or "").strip()
    if not t_raw:
        return False

    q = q_raw.lower()
    t = t_raw.lower()
    if q in t or t in q:
        return True

    qn = _normalize_title_key(q_raw)
    tn = _normalize_title_key(t_raw)
    return bool(qn) and (qn in tn or tn in qn)


def _event_overlaps_date(ev: dict, target_date: date) -> bool:
    event_date = _parse_date_value(ev.get("date"))
    event_time = _parse_time_value(ev.get("start_time"))
    if event_date is None:
        return False
    # All-day / missing time: still match by calendar date.
    if event_time is None:
        return event_date == target_date
    try:
        duration = int(ev.get("duration_minutes") or 0)
    except (TypeError, ValueError):
        duration = 0
    if duration <= 0:
        return event_date == target_date

    event_start = datetime.combine(event_date, event_time)
    event_end = event_start + timedelta(minutes=duration)
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)
    return event_start < day_end and event_end > day_start


def _event_date_value(ev: dict) -> date | None:
    return _parse_date_value(ev.get("date"))


# Generic titles must never expand beyond the requested day — otherwise
# "hapus meeting hari ini" dumps every Meeting in the calendar.
_GENERIC_TITLE_KEYS = frozenset(
    {
        "meeting",
        "rapat",
        "event",
        "acara",
        "sync",
        "call",
        "jadwal",
        "standup",
        "stand-up",
    }
)


def _is_generic_title(title_query: str) -> bool:
    key = _normalize_title_key(title_query)
    if not key:
        return True
    generic_keys = {_normalize_title_key(item) for item in _GENERIC_TITLE_KEYS}
    return key in generic_keys


def _find_matches(all_events, parsed: dict, *, use_date_filter: bool = True) -> list[dict]:
    """Match events by title (fuzzy) and optional parsed date.

    When a date is present, prefer exact day hits. Soft nearby fallback is only
    for *specific* titles (e.g. "1-on-1") when the day resolution may have
    drifted — never for generic "meeting"/"rapat".
    """
    title_query = _clean_title_query(parsed.get("title"))
    target_date = _parse_date_value(parsed.get("date"))
    title_matches: list[dict] = []

    for ev in all_events:
        ev_dict = _event_to_dict(ev)
        if not _title_matches(title_query, ev_dict.get("title")):
            continue
        title_matches.append(ev_dict)

    if use_date_filter and target_date is not None:
        dated = [ev for ev in title_matches if _event_overlaps_date(ev, target_date)]
        if dated:
            return dated

        # Explicit day + generic title ("meeting hari ini") → empty, not history.
        if not title_query or _is_generic_title(title_query):
            return []

        # Specific title, day miss: try a tight window, then title-only.
        nearby: list[dict] = []
        for ev in title_matches:
            event_date = _event_date_value(ev)
            if event_date is None:
                continue
            if abs((event_date - target_date).days) <= 7:
                nearby.append(ev)
        if nearby:
            return nearby
        return title_matches

    return title_matches


@router.post("/assistant", response_model=AssistantResponse)
async def assistant(
    body: AssistantRequest,
    user: dict = Depends(get_current_user),
    accept_language: str | None = Header(default=None, alias="Accept-Language"),
):
    """Execute or preview a multi-intent command from the Command Bar."""
    locale = resolve_locale(accept_language)
    if body.confirm:
        return await _execute_confirmed(user, body, locale=locale)

    if not body.text or not body.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="text is required unless confirm=true",
        )

    # Prefer strengthened AI multi-intent parse; falls back to deterministic nlparser.
    parsed = await parse_assistant_command(body.text, today=datetime.now().date())
    intent = parsed["intent"]

    if intent == "help":
        return _handle_help(locale)

    if intent == "create":
        return await _handle_create(user, parsed, locale=locale)

    if intent == "query":
        return await _handle_query(user, parsed, locale=locale)

    if intent == "find_slot":
        return await _handle_find_slot(user, parsed, locale=locale)

    if intent == "cancel":
        return await _handle_cancel(
            user, parsed, body.selected_event_id or body.context_event_id, locale=locale
        )

    if intent == "reschedule":
        return await _handle_reschedule(
            user, parsed, body.selected_event_id or body.context_event_id, locale=locale
        )

    if intent == "update":
        return await _handle_update(
            user, parsed, body.selected_event_id or body.context_event_id, locale=locale
        )

    return AssistantResponse(
        intent=intent,
        result=None,
        message=msg("unknown_intent", locale, intent=intent),
        suggested_actions=["help", "find_free_slot", "query"],
    )


def _handle_help(locale: str = "en") -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    return AssistantResponse(
        intent="help",
        result={
            "capabilities": [
                "query",
                "find_slot",
                "create",
                "reschedule",
                "cancel",
                "update",
            ]
        },
        message=msg("help", loc),
        suggested_actions=["query", "find_free_slot", "create"],
    )


async def _execute_confirmed(
    user: dict,
    body: AssistantRequest,
    locale: str = "en",
) -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    try:
        intent, result = await assistant_tools.execute_calendar_tool(user["id"], body)
    except HTTPException as exc:
        # Surface calendar conflicts as recoverable chat UI (alternatives), not a hard crash.
        if exc.status_code == status.HTTP_409_CONFLICT:
            return _conflict_recovery_response(body, exc.detail, locale=loc)
        raise

    serialized = _event_to_dict(result)
    messages = {
        "create": msg("create_ok", loc),
        "cancel": msg("cancel_ok", loc),
        "reschedule": msg(
            "reschedule_ok",
            loc,
            date=body.new_date or "",
            time=body.new_time or "",
        ),
        "update": msg("update_ok", loc),
    }
    return AssistantResponse(
        intent=intent,
        result=serialized,
        message=messages.get(intent, msg("create_ok", loc)),
        executed=True,
        events=[serialized] if isinstance(serialized, dict) and not serialized.get("deleted") else [],
        suggested_actions=["open_event"] if intent != "cancel" else [],
    )


def _conflict_recovery_response(
    body: AssistantRequest,
    detail: object,
    locale: str = "en",
) -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    data = detail if isinstance(detail, dict) else {"message": str(detail)}
    conflicting = data.get("conflicting_event") or ("another event" if loc == "en" else "event lain")
    alternatives = data.get("alternatives") if isinstance(data.get("alternatives"), list) else []
    event_data = body.event_data if isinstance(body.event_data, dict) else {}
    target_date = event_data.get("date")
    duration = event_data.get("duration_minutes") or 60
    title = event_data.get("title") or "Meeting"

    slots = []
    for alt in alternatives:
        if not isinstance(alt, dict):
            continue
        start = alt.get("start_time") or alt.get("start")
        if not start:
            continue
        slots.append(
            {
                "start_time": str(start)[:5] if len(str(start)) >= 5 else str(start),
                "duration_minutes": alt.get("duration_minutes") or duration,
                "reason": alt.get("reason") or ("Alternative slot" if loc == "en" else "Slot alternatif"),
            }
        )

    message = (
        msg("conflict", loc, title=conflicting)
        if slots
        else msg("conflict_no_slots", loc, title=conflicting)
    )
    return AssistantResponse(
        intent="conflict",
        result={
            "conflict": True,
            "conflicting_event": conflicting,
            "date": target_date,
            "duration_minutes": duration,
            "title": title,
            "event_data": event_data,
            "slots": slots,
            "alternatives": alternatives,
        },
        message=message,
        suggested_actions=["pick_slot", "find_free_slot", "edit"],
    )


async def _handle_query(user: dict, parsed: dict, locale: str = "en") -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    title_query = _clean_title_query(parsed.get("title"))
    target_date = _parse_date_value(parsed.get("date"))
    date_was_explicit = target_date is not None

    # Title-only search ("cari task 1-on-1") should scan the full calendar, not
    # default to "today's agenda" which hides events on other days.
    if title_query and not date_was_explicit:
        all_events = await data_access.list_events(user["id"])
        matching = [
            ev_dict
            for ev in all_events
            for ev_dict in [_event_to_dict(ev)]
            if _title_matches(title_query, ev_dict.get("title"))
        ]
        if not matching:
            return AssistantResponse(
                intent="query",
                result=[],
                message=msg("query_title_empty", loc, title=title_query),
            )
        return AssistantResponse(
            intent="query",
            result=matching,
            message=msg(
                "query_title_found",
                loc,
                count=len(matching),
                title=title_query,
            ),
            events=matching,
            suggested_actions=["open_event", "cancel", "find_free_slot"],
        )

    if target_date is None:
        target_date = datetime.now().date()

    all_events = await data_access.list_events_window(
        user["id"],
        target_date - timedelta(days=1),
        target_date,
    )
    matching = []
    for ev in all_events:
        ev_dict = _event_to_dict(ev)
        if not _event_overlaps_date(ev_dict, target_date):
            continue
        if title_query and not _title_matches(title_query, ev_dict.get("title")):
            continue
        matching.append(ev_dict)

    # If user asked for a named event on a day and nothing matched, broaden to
    # title-only across all events (date resolution often drifts for past days).
    if not matching and title_query:
        all_events = await data_access.list_events(user["id"])
        matching = [
            ev_dict
            for ev in all_events
            for ev_dict in [_event_to_dict(ev)]
            if _title_matches(title_query, ev_dict.get("title"))
        ]
        if matching:
            return AssistantResponse(
                intent="query",
                result=matching,
                message=msg(
                    "query_title_found",
                    loc,
                    count=len(matching),
                    title=title_query,
                ),
                events=matching,
                suggested_actions=["open_event", "cancel", "find_free_slot"],
            )

    if not matching:
        empty_msg = (
            msg("query_title_empty", loc, title=title_query)
            if title_query
            else msg("query_empty", loc, date=target_date.isoformat())
        )
        return AssistantResponse(
            intent="query",
            result=[],
            message=empty_msg,
        )

    found_msg = (
        msg(
            "query_title_on_date_found",
            loc,
            count=len(matching),
            title=title_query,
            date=target_date.isoformat(),
        )
        if title_query
        else msg("query_found", loc, count=len(matching), date=target_date.isoformat())
    )
    return AssistantResponse(
        intent="query",
        result=matching,
        message=found_msg,
        events=matching,
        suggested_actions=["open_event", "find_free_slot"],
    )


def _normalize_start_time(value: str | time | None, default: time = time(9, 0)) -> time:
    if isinstance(value, time):
        return value
    return _parse_time_value(value if isinstance(value, str) else None) or default


def _build_create_event_data(
    *,
    title: str,
    target_date: date,
    start_time: time,
    duration: int,
    participants: str = "",
    recurrence: str | None = None,
) -> dict:
    """Clean EventCreate-compatible payload (no parser metadata)."""
    payload: dict = {
        "title": title,
        "date": target_date.isoformat(),
        "start_time": start_time.strftime("%H:%M:%S"),
        "duration_minutes": duration,
        "participants": participants or "",
    }
    if recurrence:
        payload["recurrence_rule"] = recurrence
    return payload


async def _free_slots_for_day(
    user_id: str,
    target_date: date,
    duration: int,
    requested_time: time,
    count: int = 5,
) -> list[dict]:
    all_events = await data_access.list_events_window(
        user_id,
        target_date - timedelta(days=1),
        target_date,
    )
    event_dicts = [_event_to_dict(ev) for ev in all_events]
    return conflicts_engine.find_alternatives(
        event_dicts,
        target_date,
        requested_time,
        duration,
        count=count,
    )


async def _handle_create(user: dict, parsed: dict, locale: str = "en") -> AssistantResponse:
    """Preview a create action with cleaned title and a conflict-safe slot."""
    loc = resolve_locale(explicit=locale)
    target_date = _parse_date_value(parsed.get("date")) or datetime.now().date()
    duration = int(parsed.get("duration_minutes") or 60)
    if duration < 5:
        duration = 60
    requested_time = _normalize_start_time(parsed.get("start_time"))
    title = (parsed.get("title") or "Meeting").strip() or "Meeting"

    prefer_free = bool(parsed.get("prefer_free_slot"))
    time_explicit = bool(parsed.get("time_explicit"))
    # If the user did not name a clock time, or asked for a free slot, auto-place.
    needs_free = prefer_free or not time_explicit

    all_events = await data_access.list_events_window(
        user["id"],
        target_date - timedelta(days=1),
        target_date,
    )
    event_dicts = [_event_to_dict(ev) for ev in all_events]
    has_conflict = bool(
        conflicts_engine.check_conflicts(
            event_dicts,
            target_date,
            requested_time,
            duration,
        )
    )

    auto_adjusted = False
    adjustment_note = ""
    alternatives = conflicts_engine.find_alternatives(
        event_dicts,
        target_date,
        requested_time,
        duration,
        count=5,
    )

    chosen_time = requested_time
    if needs_free or has_conflict:
        if not alternatives:
            return AssistantResponse(
                intent="create",
                result={
                    "tool": "create",
                    "requested": {
                        "title": title,
                        "date": target_date.isoformat(),
                        "start_time": requested_time.strftime("%H:%M:%S"),
                        "duration_minutes": duration,
                    },
                    "alternatives": [],
                },
                message=msg(
                    "create_no_slots",
                    loc,
                    duration=duration,
                    date=target_date.isoformat(),
                    title=title,
                ),
                suggested_actions=["find_free_slot", "edit"],
            )

        first = alternatives[0]
        chosen_time = _normalize_start_time(first.get("start_time"), requested_time)
        if chosen_time != requested_time or needs_free or has_conflict:
            auto_adjusted = True
            if has_conflict and time_explicit:
                adjustment_note = msg(
                    "create_conflict_suggest",
                    loc,
                    time=requested_time.strftime("%H:%M"),
                    suggested=chosen_time.strftime("%H:%M"),
                )
            elif prefer_free or not time_explicit:
                adjustment_note = msg(
                    "create_free_picked",
                    loc,
                    time=chosen_time.strftime("%H:%M"),
                )

    event_data = _build_create_event_data(
        title=title,
        target_date=target_date,
        start_time=chosen_time,
        duration=duration,
        participants=str(parsed.get("participants") or ""),
        recurrence=parsed.get("recurrence"),
    )

    warnings = list(parsed.get("warnings") or [])
    if auto_adjusted:
        warnings.append("Slot adjusted to avoid conflicts / honor free-slot request")

    message = adjustment_note + msg(
        "create_confirm",
        loc,
        title=title,
        date=target_date.isoformat(),
        time=chosen_time.strftime("%H:%M"),
        duration=duration,
    )

    return AssistantResponse(
        intent="create",
        result={
            "tool": "create",
            "event_data": event_data,
            "alternatives": alternatives,
            "auto_adjusted": auto_adjusted,
            "warnings": warnings,
        },
        message=message,
        requires_confirmation=True,
        suggested_actions=["confirm", "edit", "pick_slot"],
    )


async def _handle_find_slot(user: dict, parsed: dict, locale: str = "en") -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    target_date = _parse_date_value(parsed.get("date"))
    if target_date is None:
        target_date = datetime.now().date()

    duration = int(parsed.get("duration_minutes") or 60)
    requested_time = _normalize_start_time(parsed.get("start_time"))

    alternatives = await _free_slots_for_day(
        user["id"],
        target_date,
        duration,
        requested_time,
        count=5,
    )

    # Preserve requested event title so free-slot → create keeps "TS FreeSlot Create"
    # instead of falling back to generic "Meeting" on the client.
    title_hint = _clean_title_query(parsed.get("title"))
    if not title_hint or _is_generic_title(title_hint):
        # Prefer non-generic raw title if cleaner failed (e.g. still useful phrase).
        raw_title = str(parsed.get("title") or "").strip()
        if raw_title and not _is_generic_title(raw_title):
            title_hint = raw_title
        else:
            title_hint = ""

    if not alternatives:
        empty_result: dict = {
            "date": target_date.isoformat(),
            "duration_minutes": duration,
            "slots": [],
        }
        if title_hint:
            empty_result["title"] = title_hint
        return AssistantResponse(
            intent="find_slot",
            result=empty_result,
            message=msg(
                "find_slot_empty",
                loc,
                duration=duration,
                date=target_date.isoformat(),
            ),
            suggested_actions=["edit"],
        )

    slot_lines = ", ".join(
        str(slot.get("start_time", ""))[:5] for slot in alternatives[:5] if slot.get("start_time")
    )
    found_result: dict = {
        "date": target_date.isoformat(),
        "duration_minutes": duration,
        "slots": alternatives,
    }
    if title_hint:
        found_result["title"] = title_hint
    return AssistantResponse(
        intent="find_slot",
        result=found_result,
        message=msg(
            "find_slot_found",
            loc,
            count=len(alternatives),
            duration=duration,
            date=target_date.isoformat(),
            slots=slot_lines,
        ),
        suggested_actions=["create", "pick_slot"],
    )


def _clarification(matches: list[dict], action: str, locale: str = "en") -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    choices = [
        {
            "id": item["id"],
            "title": item.get("title", "Event"),
            "date": item.get("date"),
            "start_time": item.get("start_time"),
        }
        for item in matches
    ]
    return AssistantResponse(
        intent=action,
        result={"events": matches},
        message=msg("clarification", loc),
        clarification={
            "type": "event_selection",
            "prompt": msg("clarification", loc),
            "choices": choices,
        },
        events=matches,
        suggested_actions=["select_event"],
    )


def _selected_match(matches: list[dict], selected_event_id: str | None) -> list[dict]:
    if not selected_event_id:
        return matches
    base_id = base_event_id(selected_event_id)
    return [item for item in matches if base_event_id(str(item.get("id", ""))) == base_id]


def _action_matches(
    all_events,
    parsed: dict,
    selected_event_id: str | None = None,
    *,
    use_date_filter: bool = True,
) -> list[dict]:
    if selected_event_id:
        return _selected_match([_event_to_dict(ev) for ev in all_events], selected_event_id)
    return _find_matches(all_events, parsed, use_date_filter=use_date_filter)


async def _handle_cancel(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
    locale: str = "en",
) -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(all_events, parsed, selected_event_id)

    if not matches:
        return AssistantResponse(
            intent="cancel",
            result=[],
            message=msg("cancel_not_found", loc, title=parsed.get("title", "")),
        )

    if len(matches) > 1:
        return _clarification(matches, "cancel", locale=loc)

    primary = matches[0]
    return AssistantResponse(
        intent="cancel",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
        },
        message=msg("cancel_confirm", loc, title=primary.get("title", "Event")),
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "cancel"],
    )


async def _handle_reschedule(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
    locale: str = "en",
) -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(
        all_events,
        parsed,
        selected_event_id,
        use_date_filter=False,
    )

    if not matches:
        return AssistantResponse(
            intent="reschedule",
            result=[],
            message=msg("reschedule_not_found", loc, title=parsed.get("title", "")),
        )

    if len(matches) > 1:
        return _clarification(matches, "reschedule", locale=loc)

    primary = matches[0]
    new_date = parsed.get("date")
    new_time = parsed.get("start_time")
    if not new_date or not new_time:
        return AssistantResponse(
            intent="reschedule",
            result={"events": matches, "primary_event_id": primary["id"]},
            message=msg("reschedule_need_time", loc, title=primary.get("title", "Event")),
            events=matches,
            suggested_actions=["edit"],
        )

    new_date_value = _parse_date_value(new_date)
    new_time_value = _parse_time_value(new_time)
    if new_date_value is None or new_time_value is None:
        return AssistantResponse(
            intent="reschedule",
            result={"events": matches, "primary_event_id": primary["id"]},
            message=msg("reschedule_need_time", loc, title=primary.get("title", "Event")),
            events=matches,
            suggested_actions=["edit"],
        )

    new_date = new_date_value.isoformat()
    new_time = new_time_value.strftime("%H:%M:%S")
    return AssistantResponse(
        intent="reschedule",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
            "new_date": new_date,
            "new_time": new_time,
        },
        message=msg(
            "reschedule_confirm",
            loc,
            title=primary.get("title", "Event"),
            date=new_date,
            time=new_time,
        ),
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "cancel"],
    )


async def _handle_update(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
    locale: str = "en",
) -> AssistantResponse:
    loc = resolve_locale(explicit=locale)
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(all_events, parsed, selected_event_id)

    if not matches:
        return AssistantResponse(
            intent="update",
            result=[],
            message=msg("update_not_found", loc, title=parsed.get("title", "")),
        )

    if len(matches) > 1:
        return _clarification(matches, "update", locale=loc)

    event_data = parsed.get("event_data") or {}
    if not isinstance(event_data, dict) or not event_data:
        return AssistantResponse(
            intent="update",
            result={"events": matches},
            message=msg("update_need_detail", loc),
            events=matches,
            suggested_actions=["edit"],
        )

    primary = matches[0]
    return AssistantResponse(
        intent="update",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
            "event_data": event_data,
        },
        message=msg("update_confirm", loc, title=primary.get("title", "Event")),
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "edit"],
    )
