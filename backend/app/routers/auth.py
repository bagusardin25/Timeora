import httpx
from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.database import get_pool
from app.models import AuthResponse, LoginRequest, LoginResponse, RegisterRequest

router = APIRouter()

_SUPABASE_HEADERS = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
}


async def _ensure_user_row(user_id: str, email: str) -> None:
    pool = get_pool()
    if pool is None:
        print("[auth] DB pool not available, skipping user row insert")
        return
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
            user_id,
            email,
        )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    payload = {
        "email": body.email,
        "password": body.password,
        "email_confirm": True,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=_SUPABASE_HEADERS)

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
    async with httpx.AsyncClient() as client:
        login_resp = await client.post(
            login_url,
            json={"email": body.email, "password": body.password},
            headers=_SUPABASE_HEADERS,
        )

    if login_resp.status_code == 200:
        login_data = login_resp.json()
        return AuthResponse(access_token=login_data["access_token"])

    return AuthResponse(
        message="Account created. Please sign in with your new credentials."
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    url = f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password"
    payload = {"email": body.email, "password": body.password}

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=_SUPABASE_HEADERS)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    data = resp.json()
    user_id = data["user"]["id"]
    email = data["user"]["email"]

    await _ensure_user_row(user_id, email)

    return LoginResponse(access_token=data["access_token"])
