from fastapi import APIRouter

from app import data_access
from app.database import get_active_db_host, get_pool
from app import supabase_store

router = APIRouter()


@router.get("/health")
def health():
    db_pool = get_pool()
    if db_pool is not None:
        db_mode = "postgres"
    elif supabase_store.is_configured():
        db_mode = "supabase_rest"
    else:
        db_mode = "none"

    payload = {
        "status": "ok",
        "service": "timeora-api",
        "auth": "jwt-v2",
        "db": "connected" if data_access.db_available() else "disconnected",
        "db_mode": db_mode,
    }
    if get_active_db_host():
        payload["db_host"] = get_active_db_host()
    return payload
