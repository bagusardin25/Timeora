from __future__ import annotations

import base64
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class IntegrationConfigurationError(RuntimeError):
    pass


def _configured_encryption_material() -> str:
    if not settings.INTEGRATION_ENCRYPTION_KEY:
        raise IntegrationConfigurationError(
            "INTEGRATION_ENCRYPTION_KEY is required to store provider tokens"
        )
    return settings.INTEGRATION_ENCRYPTION_KEY


def _fernet() -> Fernet:
    digest = hashlib.sha256(_configured_encryption_material().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_token(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise IntegrationConfigurationError(
            "Stored integration token cannot be decrypted with the configured key"
        ) from exc


def _signing_material() -> bytes:
    value = (
        settings.INTEGRATION_SIGNING_KEY
        or settings.INTEGRATION_ENCRYPTION_KEY
        or settings.SUPABASE_JWT_SECRET
    )
    if not value:
        raise IntegrationConfigurationError(
            "INTEGRATION_SIGNING_KEY is required to register webhooks"
        )
    return value.encode("utf-8")


def webhook_secret(subscription_id: str) -> str:
    digest = hmac.new(
        _signing_material(),
        f"timeora-webhook:{subscription_id}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def webhook_signature(subscription_id: str, body: bytes) -> str:
    return hmac.new(
        webhook_secret(subscription_id).encode("ascii"),
        body,
        hashlib.sha256,
    ).hexdigest()
