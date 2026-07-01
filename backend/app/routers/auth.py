import httpx
from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.database import get_pool
from app.models import LoginRequest, LoginResponse

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    url = f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }
    payload = {"email": body.email, "password": body.password}

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    data = resp.json()
    user_id = data["user"]["id"]
    email = data["user"]["email"]

    pool = get_pool()
    if pool is not None:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
                user_id,
                email,
            )
    else:
        print("[auth] DB pool not available, skipping user row insert")

    return LoginResponse(access_token=data["access_token"])
