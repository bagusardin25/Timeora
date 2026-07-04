from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import integration_store
from app.auth import get_current_user
from app.config import settings
from app.integrations.crypto import (
    IntegrationConfigurationError,
    encrypt_token,
    webhook_secret,
)
from app.integrations.webhooks import validate_webhook_target
from app.models import (
    IntegrationConnectRequest,
    IntegrationResponse,
    WebhookSubscriptionCreate,
    WebhookSubscriptionCreated,
    WebhookSubscriptionResponse,
)

router = APIRouter()

TOKEN_PROVIDERS = {"google", "zoom", "slack", "microsoft", "notion"}
PROVIDER_ORDER = [
    "ics",
    "resend",
    "webhook",
    "google",
    "zoom",
    "slack",
    "microsoft",
    "notion",
]


@router.get("/integrations", response_model=list[IntegrationResponse])
async def list_integrations(user: dict = Depends(get_current_user)):
    connections = {
        item["provider"]: item
        for item in await integration_store.list_connections(user["id"])
    }
    webhook_count = len(
        await integration_store.list_webhooks(user["id"], active_only=True)
    )
    signing_configured = bool(
        settings.INTEGRATION_SIGNING_KEY
        or settings.INTEGRATION_ENCRYPTION_KEY
        or settings.SUPABASE_JWT_SECRET
    )
    resend_configured = bool(
        settings.INTEGRATION_RESEND_API_KEY
        and settings.INTEGRATION_RESEND_FROM_EMAIL
    )

    results: list[IntegrationResponse] = []
    for provider in PROVIDER_ORDER:
        connection = connections.get(provider, {})
        if provider == "ics":
            results.append(
                IntegrationResponse(
                    provider=provider,
                    connected=True,
                    enabled=True,
                    configured=True,
                    status="ready",
                )
            )
        elif provider == "resend":
            results.append(
                IntegrationResponse(
                    provider=provider,
                    connected=(
                        resend_configured
                        and settings.INTEGRATION_EMAIL_NOTIFICATIONS_ENABLED
                    ),
                    enabled=settings.INTEGRATION_EMAIL_NOTIFICATIONS_ENABLED,
                    configured=resend_configured,
                    status="ready" if resend_configured else "configuration_required",
                )
            )
        elif provider == "webhook":
            results.append(
                IntegrationResponse(
                    provider=provider,
                    connected=webhook_count > 0,
                    enabled=webhook_count > 0,
                    configured=signing_configured,
                    status="ready" if signing_configured else "configuration_required",
                    metadata={"active_subscriptions": webhook_count},
                )
            )
        else:
            results.append(
                IntegrationResponse(
                    provider=provider,
                    connected=bool(connection),
                    enabled=bool(connection.get("enabled")),
                    configured=bool(connection),
                    status="connected" if connection else "foundation_ready",
                    metadata=connection.get("metadata") or {},
                    updated_at=connection.get("updated_at"),
                )
            )
    return results


@router.put(
    "/integrations/{provider}",
    response_model=IntegrationResponse,
)
async def connect_integration(
    provider: str,
    body: IntegrationConnectRequest,
    user: dict = Depends(get_current_user),
):
    provider = provider.lower()
    if provider not in TOKEN_PROVIDERS:
        raise HTTPException(
            status_code=422,
            detail="This provider cannot be connected with a provider token",
        )
    try:
        encrypted_access = encrypt_token(body.access_token)
        encrypted_refresh = encrypt_token(body.refresh_token)
    except IntegrationConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    connection = await integration_store.upsert_connection(
        user["id"],
        provider,
        encrypted_access or "",
        encrypted_refresh,
        body.metadata,
    )
    return IntegrationResponse(
        provider=provider,
        connected=True,
        enabled=True,
        configured=True,
        status="connected",
        metadata=connection.get("metadata") or {},
        updated_at=connection.get("updated_at"),
    )


@router.delete(
    "/integrations/{provider}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def disconnect_integration(
    provider: str,
    user: dict = Depends(get_current_user),
):
    provider = provider.lower()
    if provider not in TOKEN_PROVIDERS:
        raise HTTPException(status_code=422, detail="Provider cannot be disconnected")
    await integration_store.delete_connection(user["id"], provider)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/webhooks",
    response_model=list[WebhookSubscriptionResponse],
)
async def list_webhooks(user: dict = Depends(get_current_user)):
    return await integration_store.list_webhooks(user["id"])


@router.post(
    "/webhooks",
    response_model=WebhookSubscriptionCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_webhook(
    body: WebhookSubscriptionCreate,
    user: dict = Depends(get_current_user),
):
    try:
        webhook_secret("configuration-check")
    except IntegrationConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    await validate_webhook_target(body.url)

    subscriptions = await integration_store.list_webhooks(user["id"])
    if len(subscriptions) >= settings.INTEGRATION_WEBHOOK_MAX_PER_USER:
        raise HTTPException(
            status_code=429,
            detail="Webhook subscription limit reached",
        )
    normalized_events = list(dict.fromkeys(body.event_types))
    subscription = await integration_store.create_webhook(
        user["id"],
        body.url,
        normalized_events,
        body.description,
    )
    return WebhookSubscriptionCreated(
        **subscription.model_dump(),
        signing_secret=webhook_secret(subscription.id),
    )


@router.delete("/webhooks/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    subscription_id: str,
    user: dict = Depends(get_current_user),
):
    await integration_store.delete_webhook(subscription_id, user["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)
