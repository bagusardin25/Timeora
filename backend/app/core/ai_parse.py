"""Shared AI parse helpers for /parse and /assistant."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, time, timedelta
from typing import Any, Callable, Awaitable

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core import nlparser
from app.core.prompts import build_assistant_system_message, build_parse_system_message

INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)",
    r"disregard\s+(all\s+)?(previous|prior|above)",
    r"forget\s+(everything|all\s+instructions?)",
    r"system\s+prompt",
    r"you\s+are\s+now\b",
    r"new\s+instructions?\s*:",
    r"override\s+(the\s+)?system",
    r"developer\s+mode",
    r"jailbreak",
    r"reveal\s+(your\s+)?(hidden\s+)?prompt",
    r"act\s+as\s+(if\s+you\s+are|DAN|developer)",
]


def sanitize_user_text(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="text is required",
        )
    lowered = cleaned.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, lowered):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Input contains disallowed content",
            )
    # Soft-strip common injection prefixes without rejecting whole scheduling text
    cleaned = re.sub(
        r"^(please\s+)?(ignore|disregard).{0,40}:\s*",
        "",
        cleaned,
        flags=re.I,
    ).strip()
    return cleaned[:1000]


def extract_json_object(text: str) -> dict[str, Any]:
    """Extract JSON object from model output (raw or fenced)."""
    payload = (text or "").strip()
    if not payload:
        raise ValueError("Empty AI response")

    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", payload, re.DOTALL)
    if fenced:
        data = json.loads(fenced.group(1).strip())
        if isinstance(data, dict):
            return data

    # Balanced-ish first object
    match = re.search(r"\{.*\}", payload, re.DOTALL)
    if match:
        data = json.loads(match.group(0))
        if isinstance(data, dict):
            return data

    raise ValueError(f"Could not extract valid JSON from AI response: {payload[:300]}")


_TITLE_FLUFF_RE = re.compile(
    r"\b(oke+|ok|okey|kalo|kalau|gitu|buatin|buatkan|buatlah|tolong|please|"
    r"mohon|saya|aku|dong|deh|ya+|yuk|ignore|disregard)\b",
    re.I,
)


def _looks_clean_title(title: str) -> bool:
    cleaned = (title or "").strip()
    if not cleaned or cleaned.lower() in {"null", "none", "untitled", "untitled event"}:
        return False
    if len(cleaned) > 60 or len(cleaned.split()) > 8:
        return False
    if _TITLE_FLUFF_RE.search(cleaned):
        return False
    return True


def _resolve_title(model_title: Any, original_text: str) -> str:
    candidate = str(model_title or "").strip()
    if _looks_clean_title(candidate):
        return candidate
    fallback = nlparser._extract_title(original_text)  # noqa: SLF001
    return fallback or "Meeting"


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        low = value.strip().lower()
        if low in {"true", "1", "yes", "y"}:
            return True
        if low in {"false", "0", "no", "n"}:
            return False
    return default


def _as_int(value: Any, default: int = 60) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(5, min(1440, number))


def _normalize_time_str(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, time):
        return value.strftime("%H:%M")
    text = str(value).strip()
    match = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?$", text)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _normalize_date_str(value: Any, today: date) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def normalize_event_parse(
    raw: dict[str, Any],
    *,
    today: date,
    original_text: str,
    source: str = "ai",
) -> dict[str, Any]:
    """Normalize AI/create parse into nlparser-compatible event dict."""
    title = _resolve_title(raw.get("title"), original_text)

    date_value = _normalize_date_str(raw.get("date"), today) or today.isoformat()
    time_value = _normalize_time_str(raw.get("start_time")) or "09:00"
    duration = _as_int(raw.get("duration_minutes"), 60)
    participants = raw.get("participants")
    if participants is None:
        participants = ""
    else:
        participants = str(participants).strip()

    prefer_free = _as_bool(raw.get("prefer_free_slot"), False)
    if not prefer_free and nlparser._mentions_free_slot(original_text):  # noqa: SLF001
        prefer_free = True

    time_explicit = _as_bool(raw.get("time_explicit"), False)
    if raw.get("start_time") in (None, "", "null") and not time_explicit:
        time_explicit = False
    elif _normalize_time_str(raw.get("start_time")) and "time_explicit" not in raw:
        # If model omitted the flag but provided a time, treat as explicit unless free-slot.
        time_explicit = not prefer_free

    recurrence = raw.get("recurrence")
    if recurrence in ("", "null", None):
        recurrence = None
    else:
        recurrence = str(recurrence)

    start_at = None
    end_at = None
    try:
        start_dt = datetime.fromisoformat(f"{date_value}T{time_value}")
        start_at = start_dt.isoformat()
        end_at = (start_dt + timedelta(minutes=duration)).isoformat()
    except ValueError:
        pass

    warnings: list[str] = []
    if not _normalize_time_str(raw.get("start_time")):
        warnings.append("No time found — defaulting to 09:00")
    if raw.get("duration_minutes") in (None, "", "null", 0):
        warnings.append("No duration found — defaulting to 60 minutes")

    return {
        "intent": "create",
        "title": title,
        "date": date_value,
        "start_time": time_value,
        "duration_minutes": duration,
        "participants": participants,
        "source": source,
        "start_at": start_at,
        "end_at": end_at,
        "warnings": warnings,
        "recurrence": recurrence,
        "prefer_free_slot": prefer_free,
        "time_explicit": time_explicit,
    }


def normalize_assistant_parse(
    raw: dict[str, Any],
    *,
    today: date,
    original_text: str,
    source: str = "ai",
) -> dict[str, Any]:
    """Normalize multi-intent AI parse for assistant handlers."""
    intent = str(raw.get("intent") or "create").strip().lower()
    allowed = {"create", "query", "find_slot", "cancel", "reschedule", "update", "help"}
    if intent not in allowed:
        # Fall back to deterministic intent if model drifts.
        intent = nlparser.parse(original_text, today=today)["intent"]

    title = _resolve_title(raw.get("title"), original_text)
    query_title_junk = {
        "meeting",
        "untitled event",
        "event",
        "acara",
        "jadwal",
        "schedule",
        "apa",
        "apa saja",
        "hari",
        "today",
        "hari ini",
        "",
    }
    if intent in {"query", "find_slot"} and title.lower().strip() in query_title_junk:
        # Avoid polluting query/find with default create title or agenda fluff.
        title = ""

    date_value = _normalize_date_str(raw.get("date"), today)
    # Deterministic parse often catches "hari ini" / "tanggal 7" more reliably
    # than the model — use it to backfill missing fields for match intents.
    fallback_parse: dict[str, Any] | None = None
    if intent in {"cancel", "update", "query", "reschedule"} and (
        date_value is None or not title
    ):
        fallback_parse = nlparser.parse(original_text, today=today)

    if date_value is None and fallback_parse and fallback_parse.get("date"):
        date_value = fallback_parse.get("date")

    if (not title or title.lower().strip() in {"meeting", "event", "acara"}) and fallback_parse:
        fb_title = str(fallback_parse.get("title") or "").strip()
        if fb_title and fb_title.lower() not in {"meeting", "event", "acara", "untitled event"}:
            title = fb_title
        elif not title and fb_title:
            title = fb_title

    # Create/find_slot always need a day. Query only defaults to today when
    # listing a day's agenda — keep date null for named-event searches
    # ("cari task 1-on-1") so the handler can scan the full calendar.
    if date_value is None:
        if intent in {"create", "find_slot"}:
            date_value = today.isoformat()
        elif intent == "query" and not title:
            date_value = today.isoformat()

    time_value = _normalize_time_str(raw.get("start_time"))
    time_explicit = _as_bool(raw.get("time_explicit"), time_value is not None)
    prefer_free = _as_bool(raw.get("prefer_free_slot"), False)
    if not prefer_free and nlparser._mentions_free_slot(original_text):  # noqa: SLF001
        prefer_free = True

    if intent == "create":
        if time_value is None:
            time_value = "09:00"
            time_explicit = False
        if prefer_free:
            time_explicit = False if not time_explicit else time_explicit

    duration = _as_int(raw.get("duration_minutes"), 60)
    participants = str(raw.get("participants") or "")
    recurrence = raw.get("recurrence")
    if recurrence in ("", "null", None):
        recurrence = None

    new_date = _normalize_date_str(raw.get("new_date"), today)
    new_time = _normalize_time_str(raw.get("new_time"))

    event_data = raw.get("event_data")
    if not isinstance(event_data, dict):
        event_data = {}

    # Reschedule convenience: if model stuffed destination into date/start_time
    if intent == "reschedule":
        if new_date is None and date_value is not None:
            new_date = date_value
        if new_time is None and time_value is not None:
            new_time = time_value
        # Handlers match events by title; destination lives in date/start_time fields too.
        date_for_handler = new_date
        time_for_handler = new_time
    else:
        date_for_handler = date_value
        time_for_handler = time_value

    result: dict[str, Any] = {
        "intent": intent,
        "title": title,
        "date": date_for_handler if intent == "reschedule" else date_value,
        "start_time": time_for_handler if intent == "reschedule" else time_value,
        "duration_minutes": duration,
        "participants": participants,
        "recurrence": recurrence,
        "warnings": [],
        "source": source,
        "prefer_free_slot": prefer_free,
        "time_explicit": bool(time_explicit),
        "new_date": new_date,
        "new_time": new_time,
    }
    if event_data:
        result["event_data"] = event_data

    # ISO convenience for create previews
    if intent == "create" and result.get("date") and result.get("start_time"):
        try:
            start_dt = datetime.fromisoformat(f"{result['date']}T{result['start_time']}")
            result["start_at"] = start_dt.isoformat()
            result["end_at"] = (start_dt + timedelta(minutes=duration)).isoformat()
        except ValueError:
            result["start_at"] = None
            result["end_at"] = None

    return result


async def _call_chat_completions(
    *,
    url: str,
    headers: dict[str, str],
    model: str,
    system_message: str,
    user_text: str,
    force_json: bool,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.1,
        "max_tokens": 700,
    }
    if force_json:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        if force_json:
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise ValueError("AI JSON was not an object")
            return parsed
        return extract_json_object(content)


async def call_openai(system_message: str, user_text: str) -> dict[str, Any]:
    return await _call_chat_completions(
        url="https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        model=settings.OPENAI_MODEL,
        system_message=system_message,
        user_text=user_text,
        force_json=True,
    )


async def call_openrouter(system_message: str, user_text: str) -> dict[str, Any]:
    return await _call_chat_completions(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://timeora.app",
            "X-Title": "Timeora",
        },
        model=settings.OPENROUTER_MODEL,
        system_message=system_message,
        user_text=user_text,
        force_json=False,
    )


def _provider_chain() -> list[tuple[str, Callable[[str, str], Awaitable[dict[str, Any]]]]]:
    providers: list[tuple[str, Callable[[str, str], Awaitable[dict[str, Any]]]]] = []
    if settings.OPENAI_API_KEY:
        providers.append(("OpenAI", call_openai))
    if settings.openrouter_api_key:
        providers.append(("OpenRouter", call_openrouter))
    return providers


async def parse_event_with_ai(text: str, *, today: date | None = None) -> dict[str, Any]:
    """Parse create-oriented natural language via AI providers, else deterministic fallback."""
    clean = sanitize_user_text(text)
    today = today or datetime.now().date()
    today_iso = today.isoformat()
    timezone = settings.INTEGRATION_DEFAULT_TIMEZONE or "Asia/Jakarta"
    system_message = build_parse_system_message(today_iso, timezone)

    errors: list[str] = []
    for name, provider in _provider_chain():
        try:
            raw = await provider(system_message, clean)
            print(f"[ai] {name} event parse: {raw}")
            return normalize_event_parse(raw, today=today, original_text=clean, source="ai")
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response.text else "no body"
            errors.append(f"{name} HTTP {exc.response.status_code}: {body}")
            print(f"[ai] {errors[-1]}")
        except Exception as exc:  # noqa: BLE001 — providers are best-effort
            errors.append(f"{name} error: {type(exc).__name__}: {exc}")
            print(f"[ai] {errors[-1]}")

    print(f"[parse] AI unavailable ({len(errors)} errors), using fallback parser")
    fallback = nlparser.parse(clean, today=today)
    if errors:
        fallback.setdefault("warnings", [])
        fallback["warnings"].insert(0, "Parsed offline — verify times")
    return fallback


async def parse_assistant_command(text: str, *, today: date | None = None) -> dict[str, Any]:
    """Parse multi-intent assistant command via AI providers, else deterministic fallback."""
    clean = sanitize_user_text(text)
    today = today or datetime.now().date()
    today_iso = today.isoformat()
    timezone = settings.INTEGRATION_DEFAULT_TIMEZONE or "Asia/Jakarta"
    system_message = build_assistant_system_message(today_iso, timezone)

    errors: list[str] = []
    for name, provider in _provider_chain():
        try:
            raw = await provider(system_message, clean)
            print(f"[ai] {name} assistant parse: {raw}")
            return normalize_assistant_parse(raw, today=today, original_text=clean, source="ai")
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response.text else "no body"
            errors.append(f"{name} HTTP {exc.response.status_code}: {body}")
            print(f"[ai] {errors[-1]}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name} error: {type(exc).__name__}: {exc}")
            print(f"[ai] {errors[-1]}")

    print(f"[assistant] AI unavailable ({len(errors)} errors), using fallback parser")
    fallback = nlparser.parse(clean, today=today)
    if errors:
        fallback.setdefault("warnings", [])
        fallback["warnings"].insert(0, "Parsed offline — verify times")
    return fallback
