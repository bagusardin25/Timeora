from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import HTTPException

from app import supabase_store
from app.database import ensure_pool
from app.models import WebhookSubscriptionResponse


def _rest_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": supabase_store.settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": (
            f"Bearer {supabase_store.settings.SUPABASE_SERVICE_ROLE_KEY}"
        ),
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _rest_url(table: str) -> str:
    return f"{supabase_store._base()}/{table}"


def _json_value(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return value


def _webhook_from_row(row: Any) -> WebhookSubscriptionResponse:
    return WebhookSubscriptionResponse(
        id=str(row["id"]),
        url=row["url"],
        event_types=_json_value(row.get("event_types"), []),
        description=row.get("description") or "",
        active=bool(row.get("active", True)),
        created_at=row.get("created_at"),
    )


async def list_webhooks(
    user_id: str, *, active_only: bool = False
) -> list[WebhookSubscriptionResponse]:
    pool = await ensure_pool()
    if pool is not None:
        query = """
            SELECT id, url, event_types, description, active, created_at
            FROM webhook_subscriptions
            WHERE user_id = $1
        """
        if active_only:
            query += " AND active = TRUE"
        query += " ORDER BY created_at DESC"
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, user_id)
        return [_webhook_from_row(row) for row in rows]

    params = {
        "user_id": f"eq.{user_id}",
        "select": "id,url,event_types,description,active,created_at",
        "order": "created_at.desc",
    }
    if active_only:
        params["active"] = "eq.true"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            _rest_url("webhook_subscriptions"),
            params=params,
            headers=_rest_headers(),
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch webhooks")
    return [_webhook_from_row(row) for row in response.json()]


async def create_webhook(
    user_id: str,
    url: str,
    event_types: list[str],
    description: str,
) -> WebhookSubscriptionResponse:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO webhook_subscriptions (
                    user_id, url, event_types, description
                )
                VALUES ($1, $2, $3, $4)
                RETURNING id, url, event_types, description, active, created_at
                """,
                user_id,
                url,
                event_types,
                description,
            )
        return _webhook_from_row(row)

    payload = {
        "user_id": user_id,
        "url": url,
        "event_types": event_types,
        "description": description,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            _rest_url("webhook_subscriptions"),
            json=payload,
            headers=_rest_headers("return=representation"),
        )
    if response.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Failed to create webhook")
    return _webhook_from_row(response.json()[0])


async def delete_webhook(subscription_id: str, user_id: str) -> None:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM webhook_subscriptions
                WHERE id = $1 AND user_id = $2
                """,
                subscription_id,
                user_id,
            )
        if result.endswith("0"):
            raise HTTPException(status_code=404, detail="Webhook not found")
        return

    params = {"id": f"eq.{subscription_id}", "user_id": f"eq.{user_id}"}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.delete(
            _rest_url("webhook_subscriptions"),
            params=params,
            headers=_rest_headers("return=representation"),
        )
    if response.status_code != 200 or not response.json():
        raise HTTPException(status_code=404, detail="Webhook not found")


async def list_connections(user_id: str) -> list[dict]:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT provider, metadata, enabled, updated_at
                FROM integrations
                WHERE user_id = $1
                """,
                user_id,
            )
        return [
            {
                "provider": row["provider"],
                "metadata": _json_value(row.get("metadata"), {}),
                "enabled": bool(row["enabled"]),
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

    params = {
        "user_id": f"eq.{user_id}",
        "select": "provider,metadata,enabled,updated_at",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            _rest_url("integrations"), params=params, headers=_rest_headers()
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch integrations")
    return response.json()


async def upsert_connection(
    user_id: str,
    provider: str,
    access_token_encrypted: str,
    refresh_token_encrypted: str | None,
    metadata: dict,
) -> dict:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO integrations (
                    user_id, provider, access_token_encrypted,
                    refresh_token_encrypted, metadata, enabled
                )
                VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
                ON CONFLICT (user_id, provider) DO UPDATE SET
                    access_token_encrypted = EXCLUDED.access_token_encrypted,
                    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
                    metadata = EXCLUDED.metadata,
                    enabled = TRUE,
                    updated_at = NOW()
                RETURNING provider, metadata, enabled, updated_at
                """,
                user_id,
                provider,
                access_token_encrypted,
                refresh_token_encrypted,
                json.dumps(metadata),
            )
        return {
            "provider": row["provider"],
            "metadata": _json_value(row.get("metadata"), {}),
            "enabled": bool(row["enabled"]),
            "updated_at": row["updated_at"],
        }

    payload = {
        "user_id": user_id,
        "provider": provider,
        "access_token_encrypted": access_token_encrypted,
        "refresh_token_encrypted": refresh_token_encrypted,
        "metadata": metadata,
        "enabled": True,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            _rest_url("integrations"),
            params={"on_conflict": "user_id,provider"},
            json=payload,
            headers=_rest_headers("resolution=merge-duplicates,return=representation"),
        )
    if response.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Failed to save integration")
    return response.json()[0]


async def delete_connection(user_id: str, provider: str) -> None:
    pool = await ensure_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM integrations WHERE user_id = $1 AND provider = $2",
                user_id,
                provider,
            )
        if result.endswith("0"):
            raise HTTPException(status_code=404, detail="Integration not found")
        return

    params = {"user_id": f"eq.{user_id}", "provider": f"eq.{provider}"}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.delete(
            _rest_url("integrations"),
            params=params,
            headers=_rest_headers("return=representation"),
        )
    if response.status_code != 200 or not response.json():
        raise HTTPException(status_code=404, detail="Integration not found")


async def log_sync(
    user_id: str,
    provider: str,
    action: str,
    status: str,
    message: str = "",
    external_id: str | None = None,
) -> None:
    message = message[:1000]
    try:
        pool = await ensure_pool()
        if pool is not None:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO sync_logs (
                        user_id, provider, action, status, message, external_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    user_id,
                    provider,
                    action,
                    status,
                    message,
                    external_id,
                )
            return

        payload = {
            "user_id": user_id,
            "provider": provider,
            "action": action,
            "status": status,
            "message": message,
            "external_id": external_id,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                _rest_url("sync_logs"), json=payload, headers=_rest_headers()
            )
    except Exception as exc:
        print(f"[integrations] failed to write sync log: {exc}")
