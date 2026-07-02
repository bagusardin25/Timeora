from fastapi import APIRouter

from app.database import get_pool

router = APIRouter()


@router.get("/health")
def health():
    db_pool = get_pool()
    return {
        "status": "ok",
        "service": "timeora-api",
        "auth": "jwt-v2",
        "db": "connected" if db_pool is not None else "disconnected",
    }
