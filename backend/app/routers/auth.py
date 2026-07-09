import httpx
from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app import data_access
from app.models import (
    AuthResponse,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
)

router = APIRouter()
AUTH_PROVIDER_TIMEOUT = httpx.Timeout(8.0, connect=3.0)


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


async def _ensure_user_row(user_id: str, email: str) -> None:
    try:
        await data_access.upsert_user(user_id, email)
    except Exception as exc:
        print(f"[auth] skipped user mirror upsert for {user_id}: {exc}")


async def _post_supabase(url: str, payload: dict) -> httpx.Response:
    try:
        async with httpx.AsyncClient(
            timeout=AUTH_PROVIDER_TIMEOUT,
            trust_env=False,
        ) as client:
            return await client.post(
                url,
                json=payload,
                headers=_supabase_headers(),
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Authentication provider timed out",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication provider unavailable",
        ) from exc


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    payload = {
        "email": body.email,
        "password": body.password,
        "email_confirm": True,
    }

    resp = await _post_supabase(url, payload)

    if resp.status_code not in (200, 201):
        detail = "Registration failed"
        try:
            err = resp.json()
            if isinstance(err.get("msg"), str):
                detail = err["msg"]
            elif isinstance(err.get("error_description"), str):
                detail = err["error_description"]
            elif isinstance(err.get("message"), str):
                detail = err["message"]
        except Exception:
            pass
        status_code = (
            status.HTTP_409_CONFLICT
            if resp.status_code == 422 or "already" in detail.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail)

    data = resp.json()
    user = data.get("user") or data
    user_id = user.get("id")
    email = user.get("email", body.email)

    if user_id:
        await _ensure_user_row(user_id, email)

    login_url = f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password"
    login_resp = await _post_supabase(
        login_url,
        {"email": body.email, "password": body.password},
    )

    if login_resp.status_code == 200:
        login_data = login_resp.json()
        return AuthResponse(
            access_token=login_data["access_token"],
            refresh_token=login_data.get("refresh_token"),
        )

    return AuthResponse(
        message="Account created. Please sign in with your new credentials."
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    url = f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password"
    payload = {"email": body.email, "password": body.password}

    resp = await _post_supabase(url, payload)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    data = resp.json()
    user_id = data["user"]["id"]
    email = data["user"]["email"]

    await _ensure_user_row(user_id, email)

    return LoginResponse(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_session(body: RefreshRequest):
    """Refresh an expired session using a Supabase refresh token."""
    url = f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token"
    resp = await _post_supabase(url, {"refresh_token": body.refresh_token})

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not refresh session",
        )

    data = resp.json()
    return RefreshResponse(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
    )
