from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings

security = HTTPBearer()

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}
REQUIRED_CLAIMS = ["aud", "exp", "iss", "sub"]



def _issuer() -> str:
    if not settings.SUPABASE_URL:
        raise jwt.InvalidIssuerError("SUPABASE_URL is not configured")
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_keys=True, lifespan=600)


def _decode_token(token: str) -> dict:
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

    return jwt.decode(
        token,
        key=key,
        algorithms=[algorithm],
        audience="authenticated",
        issuer=issuer,
        options={"require": REQUIRED_CLAIMS},
    )


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        return _decode_token(credentials.credentials)
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None


def get_current_user(payload: dict = Depends(verify_token)) -> dict:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user id",
        )
    return {"id": user_id, "email": payload.get("email", "")}
