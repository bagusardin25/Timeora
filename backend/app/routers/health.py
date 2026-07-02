from fastapi import APIRouter

from app.database import get_active_db_host, get_pool

router = APIRouter()


@router.get("/health")
def health():
    db_pool = get_pool()
    payload = {
        "status": "ok",
        "service": "timeora-api",
        "auth": "jwt-v2",
        "db": "connected" if db_pool is not None else "disconnected",
    }
    if get_active_db_host():
        payload["db_host"] = get_active_db_host()
    return payload
