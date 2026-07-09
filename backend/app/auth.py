from functools import lru_cache
import asyncio
import threading
import time

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError

from app.config import settings

security = HTTPBearer()

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}
REQUIRED_CLAIMS = ["aud", "exp", "iss", "sub"]
# Keep well under the frontend fetch timeout so JWKS lag returns a real error.
JWKS_TIMEOUT_SECONDS = 5.0
# Cache successful decodes so concurrent dashboard requests skip JWKS work.
_DECODE_CACHE_TTL_SECONDS = 45.0
_decode_cache: dict[str, tuple[float, dict]] = {}
_decode_cache_lock = threading.Lock()


def _issuer() -> str:
    if not settings.SUPABASE_URL:
        raise jwt.InvalidIssuerError("SUPABASE_URL is not configured")
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(
        jwks_url,
        cache_keys=True,
        lifespan=600,
        timeout=JWKS_TIMEOUT_SECONDS,
    )


def _decode_token(token: str) -> dict:
    now = time.time()
    with _decode_cache_lock:
        cached = _decode_cache.get(token)
        if cached and cached[0] > now:
            return cached[1]

    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    issuer = _issuer()

    if algorithm == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise jwt.InvalidKeyError("SUPABASE_JWT_SECRET is not configured")
        key = settings.SUPABASE_JWT_SECRET
    elif algorithm in ASYMMETRIC_ALGORITHMS:
        jwks_url = f"{issuer}/.well-known/jwks.json"
        key = _jwks_client(jwks_url).get_signing_key_from_jwt(token).key
    else:
        raise jwt.InvalidAlgorithmError("Unsupported JWT signing algorithm")

    payload = jwt.decode(
        token,
        key=key,
        algorithms=[algorithm],
        audience="authenticated",
        issuer=issuer,
        options={"require": REQUIRED_CLAIMS},
    )

    exp = payload.get("exp")
    cache_until = now + _DECODE_CACHE_TTL_SECONDS
    if isinstance(exp, (int, float)):
        cache_until = min(cache_until, float(exp) - 1)
    if cache_until > now:
        with _decode_cache_lock:
            _decode_cache[token] = (cache_until, payload)
            # Bound memory if many distinct tokens show up.
            if len(_decode_cache) > 256:
                stale = [k for k, (until, _) in _decode_cache.items() if until <= now]
                for key_name in stale[:128] or list(_decode_cache.keys())[:64]:
                    _decode_cache.pop(key_name, None)

    return payload


def warm_jwks_cache() -> None:
    """Best-effort JWKS prefetch so the first authenticated request is not blocked."""
    if not settings.SUPABASE_URL:
        return
    jwks_url = f"{_issuer()}/.well-known/jwks.json"
    try:
        _jwks_client(jwks_url).fetch_data()
    except Exception as exc:  # noqa: BLE001 — startup warm must never crash the API
        print(f"[auth] JWKS warm failed: {exc}")


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        # PyJWKClient uses blocking urllib; never run it on the event loop.
        return await asyncio.to_thread(_decode_token, credentials.credentials)
    except PyJWKClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication key service unavailable. Please try again.",
        ) from exc
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None


async def get_current_user(payload: dict = Depends(verify_token)) -> dict:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user id",
        )
    return {"id": user_id, "email": payload.get("email", "")}
