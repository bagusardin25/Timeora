import asyncio

import asyncpg

from app.config import settings
from app.db_url import candidate_database_dsns

pool: asyncpg.Pool | None = None
_active_dsn: str | None = None


def _ssl_mode(dsn: str) -> str | bool:
    url = dsn.lower()
    if "supabase" in url or "pooler" in url or "railway" in url:
        return "require"
    return False


async def init_pool(retries: int = 3) -> None:
    global pool, _active_dsn
    if pool is not None:
        return
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        print("[db] Supabase REST store configured; skipping direct database pool")
        pool = None
        _active_dsn = None
        return

    candidates = candidate_database_dsns()
    if not candidates:
        print("[db] WARNING: no database connection candidates configured")
        pool = None
        return

    last_error: Exception | None = None

    for dsn in candidates:
        ssl_mode = _ssl_mode(dsn)
        host_hint = dsn.split("@")[-1].split("/")[0] if "@" in dsn else "unknown"

        for attempt in range(retries):
            try:
                pool = await asyncpg.create_pool(
                    dsn=dsn,
                    min_size=1,
                    max_size=10,
                    ssl=ssl_mode,
                    statement_cache_size=0,
                    command_timeout=30,
                )
                _active_dsn = dsn.split("@")[-1].split("/")[0] if "@" in dsn else dsn
                print(
                    f"[db] pool connected via {host_hint} "
                    f"(ssl={ssl_mode}, attempt={attempt + 1})"
                )
                return
            except Exception as e:
                last_error = e
                print(
                    f"[db] {host_hint} attempt {attempt + 1}/{retries} failed — {e}"
                )
                if attempt < retries - 1:
                    await asyncio.sleep(2**attempt)

        pool = None

    print(f"[db] WARNING: all connection candidates failed — {last_error}")
    print("[db] Server will start, but DB endpoints will fail until DB is available")
    pool = None


async def ensure_pool() -> asyncpg.Pool | None:
    if pool is None:
        await init_pool()
    return pool


async def close_pool() -> None:
    global pool, _active_dsn
    if pool is not None:
        await pool.close()
        pool = None
        _active_dsn = None


def get_pool() -> asyncpg.Pool | None:
    return pool


def get_active_db_host() -> str | None:
    return _active_dsn
