import json
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.config import settings
from app.models import ParseRequest, ParsedEvent

router = APIRouter()

SYSTEM_PROMPT = """You are a scheduling assistant. Parse the user's natural language input into a structured event.
Return ONLY valid JSON with these fields:
- "title": string (event name)
- "date": string in YYYY-MM-DD format (resolve relative dates like "tomorrow", "next Monday" based on today's date)
- "start_time": string in HH:MM (24-hour) format
- "duration_minutes": integer (default 60 if not specified)
- "participants": string (comma-separated names, empty string if none)

If you cannot determine a field, make a reasonable guess. Never return anything except the JSON object."""

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


async def _call_openroute(text: str, today_iso: str) -> dict:
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nToday's date is {today_iso}."},
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


async def _call_openai(text: str, today_iso: str) -> dict:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nToday's date is {today_iso}."},
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


@router.post("/parse", response_model=ParsedEvent)
async def parse_natural_language(
    body: ParseRequest, user: dict = Depends(get_current_user)
):
    clean_text = _sanitize(body.text)
    today_iso = datetime.now().date().isoformat()

    try:
        if settings.OPENROUTE_API_KEY:
            raw = await _call_openroute(clean_text, today_iso)
        elif settings.OPENAI_API_KEY:
            raw = await _call_openai(clean_text, today_iso)
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No AI provider configured",
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {e.response.status_code}",
        )

    try:
        return ParsedEvent(**raw)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"AI returned invalid schema: {e}",
        )
