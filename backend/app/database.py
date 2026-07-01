import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global pool
    ssl_mode: str | bool = "require" if "supabase" in settings.DATABASE_URL or "railway" in settings.DATABASE_URL else False
    try:
        pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=1,
            max_size=10,
            ssl=ssl_mode,
        )
        print(f"[db] asyncpg pool created (ssl={ssl_mode})")
    except Exception as e:
        print(f"[db] WARNING: could not connect to DB — {e}")
        print("[db] Server will start, but DB endpoints will fail until DB is available")
        pool = None


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool
