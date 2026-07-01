from contextlib import asynccontextmanager

from psycopg_pool import ConnectionPool

from app.config import settings

pool: ConnectionPool | None = None


def init_pool() -> None:
    global pool
    pool = ConnectionPool(
        conninfo=settings.DATABASE_URL,
        min_size=1,
        max_size=10,
        open=False,
    )
    print("[db] Connection pool created (lazy connect)")


def close_pool() -> None:
    global pool
    if pool is not None:
        pool.close()
        pool = None


def get_pool() -> ConnectionPool:
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool


@asynccontextmanager
async def lifespan(_app):
    init_pool()
    yield
    close_pool()
