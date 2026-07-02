import asyncio

import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


def _ssl_mode() -> str | bool:
    url = settings.DATABASE_URL.lower()
    if "supabase" in url or "pooler" in url or "railway" in url:
        return "require"
    return False


async def init_pool(retries: int = 3) -> None:
    global pool
    if pool is not None:
        return

    ssl_mode = _ssl_mode()
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=1,
                max_size=10,
                ssl=ssl_mode,
                statement_cache_size=0,
                command_timeout=30,
            )
            print(f"[db] asyncpg pool created (ssl={ssl_mode}, attempt={attempt + 1})")
            return
        except Exception as e:
            last_error = e
            print(f"[db] connect attempt {attempt + 1}/{retries} failed — {e}")
            if attempt < retries - 1:
                await asyncio.sleep(2**attempt)

    print(f"[db] WARNING: could not connect to DB — {last_error}")
    print("[db] Server will start, but DB endpoints will fail until DB is available")
    pool = None


async def ensure_pool() -> asyncpg.Pool | None:
    if pool is None:
        await init_pool()
    return pool


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool | None:
    return pool
