import json
import re
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError

from app.auth import get_current_user
from app.config import settings
from app.core import nlparser
from app.models import ParseRequest, ParseResponseV2

router = APIRouter()

SYSTEM_PROMPT = """You are a scheduling assistant. Parse the user's natural language input into a structured event.
You MUST respond with ONLY a valid json object containing ALL of these fields — no exceptions, no extra text:
{
  "title": "string - event name derived from user input",
  "date": "YYYY-MM-DD - resolve relative dates like tomorrow or next Monday based on today; if unclear use today",
  "start_time": "HH:MM in 24-hour format - if unclear default to 09:00",
  "duration_minutes": 60,
  "participants": "comma-separated names or empty string if none"
}

Rules:
- Always return valid json with ALL five fields. Never omit any field.
- Never return an empty json object {}.
- If the input is vague (e.g. just "hi" or "hello"), create a placeholder event with title based on what the user said, today's date, start_time "09:00", duration_minutes 60, and participants "".
- Only output the json object, no markdown, no explanation."""

INJECTION_PATTERNS = [
    "ignore previous",
    "ignore all",
    "disregard",
    "system prompt",
    "you are now",
    "new instructions",
]


def _sanitize(text: str) -> str:
    lowered = text.lower()
    for pattern in INJECTION_PATTERNS:
        if pattern in lowered:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Input contains disallowed content",
            )
    return text.strip()


def _extract_json(text: str) -> dict:
    """Extract JSON from response text, handling markdown code blocks and extra text."""
    text = text.strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block ```json ... ```
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try finding first { ... } block
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from AI response: {text[:300]}")


def _fill_defaults(raw: dict, today_iso: str, original_text: str) -> dict:
    """Ensure all required fields exist with sensible defaults."""
    raw.setdefault("title", original_text.strip()[:100] or "Untitled Event")
    raw.setdefault("date", today_iso)
    raw.setdefault("start_time", "09:00")
    raw.setdefault("duration_minutes", 60)
    raw.setdefault("participants", "")

    # Fix common AI response quirks
    if raw.get("title") in (None, "", "null"):
        raw["title"] = original_text.strip()[:100] or "Untitled Event"
    if raw.get("date") in (None, "", "null"):
        raw["date"] = today_iso
    if raw.get("start_time") in (None, "", "null"):
        raw["start_time"] = "09:00"
    if raw.get("duration_minutes") in (None, "", "null", 0):
        raw["duration_minutes"] = 60
    if raw.get("participants") is None:
        raw["participants"] = ""

    return raw


async def _call_openrouter(text: str, today_iso: str) -> dict:
    """Call OpenRouter API with configurable model and proper headers."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://timeora.app",
        "X-Title": "Timeora",
    }
    payload = {
        "model": settings.OPENROUTER_MODEL,
        "messages": [
            {
                "role": "system",
                "content": f"{SYSTEM_PROMPT}\n\nToday's date is {today_iso}.",
            },
            {"role": "user", "content": text},
        ],
        "temperature": 0.1,
        "max_tokens": 500,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return _extract_json(content)


async def _call_openai(text: str, today_iso: str) -> dict:
    """Call OpenAI API with structured JSON output."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.OPENAI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": f"{SYSTEM_PROMPT}\n\nToday's date is {today_iso}.",
            },
            {"role": "user", "content": text},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return json.loads(data["choices"][0]["message"]["content"])


def _ai_raw_to_response(raw: dict, today_iso: str, original_text: str) -> dict:
    raw = _fill_defaults(raw, today_iso, original_text)
    start_at = None
    end_at = None
    try:
        dt = datetime.fromisoformat(f"{raw['date']}T{raw['start_time']}")
        start_at = dt.isoformat()
        end_at = (dt + timedelta(minutes=int(raw["duration_minutes"]))).isoformat()
    except Exception:
        pass
    return {
        "intent": "create",
        "title": raw["title"],
        "date": raw["date"],
        "start_time": raw["start_time"],
        "duration_minutes": raw["duration_minutes"],
        "participants": raw.get("participants", ""),
        "source": "ai",
        "start_at": start_at,
        "end_at": end_at,
        "warnings": [],
        "recurrence": None,
    }


@router.post("/parse", response_model=ParseResponseV2)
async def parse_natural_language(
    body: ParseRequest, user: dict = Depends(get_current_user)
):
    clean_text = _sanitize(body.text)
    today_iso = datetime.now().date().isoformat()

    providers: list[tuple[str, object]] = []
    if settings.OPENAI_API_KEY:
        providers.append(("OpenAI", _call_openai))
    if settings.openrouter_api_key:
        providers.append(("OpenRouter", _call_openrouter))

    errors: list[str] = []
    for provider_name, call_fn in providers:
        try:
            raw = await call_fn(clean_text, today_iso)
            print(f"[ai] {provider_name} raw response: {raw}")
            return ParseResponseV2(**_ai_raw_to_response(raw, today_iso, clean_text))
        except httpx.HTTPStatusError as e:
            error_body = e.response.text[:300] if e.response.text else "no body"
            msg = f"{provider_name} HTTP {e.response.status_code}: {error_body}"
            errors.append(msg)
            print(f"[ai] {msg}")
            continue
        except (ValueError, ValidationError, Exception) as e:
            msg = f"{provider_name} error: {type(e).__name__}: {e}"
            errors.append(msg)
            print(f"[ai] {msg}")
            continue

    print(f"[parse] AI unavailable ({len(errors)} errors), using fallback parser")
    fallback = nlparser.parse(clean_text, today=datetime.now().date())
    if errors:
        fallback["warnings"].insert(0, "Parsed offline — verify times")
    return ParseResponseV2(**fallback)
