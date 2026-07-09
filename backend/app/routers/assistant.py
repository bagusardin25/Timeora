"""
Multi-intent assistant endpoint.

Handles reschedule, cancel, query, and find_slot intents.
Tier 3: confirm + execute for cancel/reschedule.
"""

from __future__ import annotations

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


def _event_to_dict(ev) -> dict:
    if hasattr(ev, "model_dump"):
        return ev.model_dump(mode="json")
    return ev


def _parse_date_value(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
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


def _event_overlaps_date(ev: dict, target_date: date) -> bool:
    event_date = _parse_date_value(ev.get("date"))
    event_time = _parse_time_value(ev.get("start_time"))
    if event_date is None or event_time is None:
        return False
    try:
        duration = int(ev.get("duration_minutes") or 0)
    except (TypeError, ValueError):
        return False
    if duration <= 0:
        return False

    event_start = datetime.combine(event_date, event_time)
    event_end = event_start + timedelta(minutes=duration)
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)
    return event_start < day_end and event_end > day_start


def _find_matches(all_events, parsed: dict, *, use_date_filter: bool = True) -> list[dict]:
    """Match events by title substring and optional parsed date."""
    title_query = (parsed.get("title") or "").lower().strip()
    target_date = _parse_date_value(parsed.get("date"))
    matches: list[dict] = []

    for ev in all_events:
        ev_dict = _event_to_dict(ev)
        ev_title = (ev_dict.get("title") or "").lower()
        if title_query and title_query not in ev_title:
            continue
        if use_date_filter and target_date is not None and not _event_overlaps_date(ev_dict, target_date):
            continue
        matches.append(ev_dict)

    return matches


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
        return _handle_help()

    if intent == "create":
        return await _handle_create(user, parsed)

    if intent == "query":
        return await _handle_query(user, parsed)

    if intent == "find_slot":
        return await _handle_find_slot(user, parsed)

    if intent == "cancel":
        return await _handle_cancel(user, parsed, body.selected_event_id or body.context_event_id)

    if intent == "reschedule":
        return await _handle_reschedule(user, parsed, body.selected_event_id or body.context_event_id)

    if intent == "update":
        return await _handle_update(user, parsed, body.selected_event_id or body.context_event_id)

    return AssistantResponse(
        intent=intent,
        result=None,
        message=(
            f"Saya belum mengerti permintaan itu ({intent}). "
            "Coba: cek jadwal, cari slot kosong, buat/pindah/batalkan event, atau tanya “kamu bisa apa?”."
        ),
        suggested_actions=["help", "find_free_slot", "query"],
    )


def _handle_help() -> AssistantResponse:
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
        message=(
            "Saya asisten kalender Timeora. Saya bisa:\n"
            "• Cek jadwal (“Apa jadwal saya hari ini?”)\n"
            "• Cari slot kosong (“Cari waktu kosong malam ini”)\n"
            "• Buat event (“Jadwalkan meeting besok jam 10”)\n"
            "• Pindahkan atau batalkan event\n"
            "• Ubah detail (prioritas, catatan, tag)\n\n"
            "Semua perubahan penting tetap minta konfirmasi dulu. "
            "Coba ketuk contoh di bawah atau ketik/ucapkan permintaan Anda."
        ),
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


async def _handle_query(user: dict, parsed: dict) -> AssistantResponse:
    target_date = _parse_date_value(parsed.get("date"))
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
        if _event_overlaps_date(ev_dict, target_date):
            matching.append(ev_dict)

    if not matching:
        return AssistantResponse(
            intent="query",
            result=[],
            message=f"No events found on {target_date.isoformat()}.",
        )

    return AssistantResponse(
        intent="query",
        result=matching,
        message=f"Found {len(matching)} event(s) on {target_date.isoformat()}.",
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


async def _handle_create(user: dict, parsed: dict) -> AssistantResponse:
    """Preview a create action with cleaned title and a conflict-safe slot."""
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
                message=(
                    f'Tidak ada slot kosong {duration} menit pada {target_date.isoformat()} '
                    f'untuk "{title}". Coba hari atau durasi lain.'
                ),
                suggested_actions=["find_free_slot", "edit"],
            )

        first = alternatives[0]
        chosen_time = _normalize_start_time(first.get("start_time"), requested_time)
        if chosen_time != requested_time or needs_free or has_conflict:
            auto_adjusted = True
            if has_conflict and time_explicit:
                adjustment_note = (
                    f"Jam {requested_time.strftime('%H:%M')} bentrok. "
                    f"Saya usulkan {chosen_time.strftime('%H:%M')} yang kosong. "
                )
            elif prefer_free or not time_explicit:
                adjustment_note = (
                    f"Saya pilih slot kosong {chosen_time.strftime('%H:%M')}. "
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

    message = (
        f'{adjustment_note}Buat "{title}" pada {target_date.isoformat()} '
        f'jam {chosen_time.strftime("%H:%M")} ({duration} menit)? '
        f"Konfirmasi untuk menambah ke kalender."
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


async def _handle_find_slot(user: dict, parsed: dict) -> AssistantResponse:
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

    if not alternatives:
        return AssistantResponse(
            intent="find_slot",
            result={"date": target_date.isoformat(), "duration_minutes": duration, "slots": []},
            message=f"Tidak ada slot kosong {duration} menit pada {target_date.isoformat()}.",
            suggested_actions=["edit"],
        )

    slot_lines = ", ".join(
        str(slot.get("start_time", ""))[:5] for slot in alternatives[:5] if slot.get("start_time")
    )
    return AssistantResponse(
        intent="find_slot",
        result={
            "date": target_date.isoformat(),
            "duration_minutes": duration,
            "slots": alternatives,
        },
        message=(
            f"Ditemukan {len(alternatives)} slot kosong ({duration} menit) "
            f"pada {target_date.isoformat()}: {slot_lines}. "
            f"Ketuk slot untuk menjadwalkan meeting."
        ),
        suggested_actions=["create", "pick_slot"],
    )


def _clarification(matches: list[dict], action: str) -> AssistantResponse:
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
        message="I found more than one matching event. Which one did you mean?",
        clarification={
            "type": "event_selection",
            "prompt": "Which event did you mean?",
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
) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(all_events, parsed, selected_event_id)

    if not matches:
        return AssistantResponse(
            intent="cancel",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to cancel.",
        )

    if len(matches) > 1:
        return _clarification(matches, "cancel")

    primary = matches[0]
    return AssistantResponse(
        intent="cancel",
        result={
            "events": matches,
            "primary_event_id": primary["id"],
            "primary_title": primary.get("title", "Event"),
        },
        message=f"Cancel \"{primary.get('title', 'Event')}\"? Confirm to proceed.",
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "cancel"],
    )


async def _handle_reschedule(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
) -> AssistantResponse:
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
            message=f"No event matching '{parsed.get('title', '')}' found to reschedule.",
        )

    if len(matches) > 1:
        return _clarification(matches, "reschedule")

    primary = matches[0]
    new_date = parsed.get("date")
    new_time = parsed.get("start_time")
    if not new_date or not new_time:
        return AssistantResponse(
            intent="reschedule",
            result={"events": matches, "primary_event_id": primary["id"]},
            message=(
                f"I found \"{primary.get('title', 'Event')}\", but I need the new date and time "
                "before I can reschedule it."
            ),
            events=matches,
            suggested_actions=["edit"],
        )

    new_date_value = _parse_date_value(new_date)
    new_time_value = _parse_time_value(new_time)
    if new_date_value is None or new_time_value is None:
        return AssistantResponse(
            intent="reschedule",
            result={"events": matches, "primary_event_id": primary["id"]},
            message=(
                f"I found \"{primary.get('title', 'Event')}\", but I need a valid new date and time "
                "before I can reschedule it."
            ),
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
        message=(
            f"Reschedule \"{primary.get('title', 'Event')}\" to "
            f"{new_date} {new_time}? Confirm to proceed."
        ),
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "cancel"],
    )


async def _handle_update(
    user: dict,
    parsed: dict,
    selected_event_id: str | None = None,
) -> AssistantResponse:
    all_events = await data_access.list_events(user["id"])
    matches = _action_matches(all_events, parsed, selected_event_id)

    if not matches:
        return AssistantResponse(
            intent="update",
            result=[],
            message=f"No event matching '{parsed.get('title', '')}' found to update.",
        )

    if len(matches) > 1:
        return _clarification(matches, "update")

    event_data = parsed.get("event_data") or {}
    if not isinstance(event_data, dict) or not event_data:
        return AssistantResponse(
            intent="update",
            result={"events": matches},
            message="I found the event, but I need more detail about what to update.",
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
        message=f"Update \"{primary.get('title', 'Event')}\"? Confirm to proceed.",
        requires_confirmation=True,
        events=matches,
        suggested_actions=["confirm", "edit"],
    )
