from __future__ import annotations

import asyncio
import ipaddress
import json
import socket
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import HTTPException

from app.config import settings
from app.integration_store import list_webhooks, log_sync
from app.integrations.crypto import webhook_signature


def _is_public_ip(address: str) -> bool:
    try:
        return ipaddress.ip_address(address).is_global
    except ValueError:
        return False


async def validate_webhook_target(url: str) -> None:
    parsed = urlparse(url)
    allowed_schemes = {"https"}
    if settings.INTEGRATION_ALLOW_HTTP_WEBHOOKS:
        allowed_schemes.add("http")
    if parsed.scheme.lower() not in allowed_schemes:
        raise HTTPException(
            status_code=422,
            detail="Webhook URL must use HTTPS",
        )
    if not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="Invalid webhook URL")

    host = parsed.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith(".local"):
        raise HTTPException(
            status_code=422,
            detail="Webhook URL cannot target a private host",
        )

    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        try:
            info = await asyncio.to_thread(
                socket.getaddrinfo,
                host,
                parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise HTTPException(
                status_code=422,
                detail="Webhook hostname could not be resolved",
            ) from exc
        addresses = list({item[4][0] for item in info})

    if not addresses or any(not _is_public_ip(address) for address in addresses):
        raise HTTPException(
            status_code=422,
            detail="Webhook URL cannot target private or reserved networks",
        )


async def deliver_event_webhooks(
    user_id: str,
    event_type: str,
    event: dict,
) -> None:
    subscriptions = await list_webhooks(user_id, active_only=True)
    matching = [
        subscription
        for subscription in subscriptions
        if event_type in subscription.event_types
    ]
    for subscription in matching:
        payload = {
            "id": str(uuid4()),
            "type": event_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "data": {"event": event},
        }
        body = json.dumps(
            payload, separators=(",", ":"), default=str
        ).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Timeora-Webhooks/1.0",
            "X-Timeora-Event": event_type,
            "X-Timeora-Signature": (
                f"sha256={webhook_signature(subscription.id, body)}"
            ),
        }

        try:
            await validate_webhook_target(subscription.url)
            delivered = False
            last_message = "Delivery failed"
            async with httpx.AsyncClient(
                timeout=settings.INTEGRATION_WEBHOOK_TIMEOUT_SECONDS,
                follow_redirects=False,
            ) as client:
                for attempt in range(3):
                    try:
                        response = await client.post(
                            subscription.url,
                            content=body,
                            headers=headers,
                        )
                        if 200 <= response.status_code < 300:
                            delivered = True
                            break
                        last_message = f"HTTP {response.status_code}"
                        if response.status_code not in (408, 429) and (
                            response.status_code < 500
                        ):
                            break
                    except httpx.HTTPError as exc:
                        last_message = str(exc)
                    if attempt < 2:
                        await asyncio.sleep(0.25 * (2**attempt))

            await log_sync(
                user_id,
                "webhook",
                event_type,
                "success" if delivered else "failed",
                "" if delivered else last_message,
                subscription.id,
            )
        except Exception as exc:
            await log_sync(
                user_id,
                "webhook",
                event_type,
                "failed",
                str(exc),
                subscription.id,
            )
