from __future__ import annotations

import asyncio

from app.integrations.email import send_event_email
from app.integrations.webhooks import deliver_event_webhooks


async def notify_event_change(
    user_id: str,
    event_type: str,
    event: dict,
) -> None:
    results = await asyncio.gather(
        deliver_event_webhooks(user_id, event_type, event),
        send_event_email(user_id, event_type, event),
        return_exceptions=True,
    )
    for result in results:
        if isinstance(result, Exception):
            print(f"[integrations] event notification failed: {result}")
