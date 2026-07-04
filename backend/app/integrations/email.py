from __future__ import annotations

import html
import re

import httpx

from app.config import settings
from app.integration_store import log_sync

_EMAIL_RE = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")


def participant_emails(value: str) -> list[str]:
    candidates = re.split(r"[,;\s]+", value.strip())
    result: list[str] = []
    for candidate in candidates:
        email = candidate.strip().lower()
        if email and _EMAIL_RE.fullmatch(email) and email not in result:
            result.append(email)
    return result[:50]


async def send_event_email(
    user_id: str,
    event_type: str,
    event: dict,
) -> None:
    if not settings.INTEGRATION_EMAIL_NOTIFICATIONS_ENABLED:
        return
    if (
        not settings.INTEGRATION_RESEND_API_KEY
        or not settings.INTEGRATION_RESEND_FROM_EMAIL
    ):
        await log_sync(
            user_id,
            "resend",
            event_type,
            "skipped",
            "Resend API key or sender is not configured",
        )
        return

    recipients = participant_emails(str(event.get("participants") or ""))
    if not recipients:
        return

    action = {
        "event.created": "New event",
        "event.updated": "Event updated",
        "event.deleted": "Event cancelled",
        "event.restored": "Event restored",
    }.get(event_type, "Event notification")
    title = str(event.get("title") or "Untitled event")
    event_date = str(event.get("date") or "")
    start_time = str(event.get("start_time") or "")[:5]
    duration = int(event.get("duration_minutes") or 60)

    payload = {
        "from": settings.INTEGRATION_RESEND_FROM_EMAIL,
        "to": recipients,
        "subject": f"{action}: {title}",
        "html": (
            f"<h2>{html.escape(action)}</h2>"
            f"<p><strong>{html.escape(title)}</strong></p>"
            f"<p>{html.escape(event_date)} at {html.escape(start_time)} "
            f"({duration} minutes)</p>"
            "<p>Sent by Timeora.</p>"
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": (
                        f"Bearer {settings.INTEGRATION_RESEND_API_KEY}"
                    ),
                    "Content-Type": "application/json",
                },
            )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Resend returned HTTP {response.status_code}")
        response_data = response.json()
        await log_sync(
            user_id,
            "resend",
            event_type,
            "success",
            external_id=response_data.get("id"),
        )
    except Exception as exc:
        await log_sync(
            user_id,
            "resend",
            event_type,
            "failed",
            str(exc),
        )
