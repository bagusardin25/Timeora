from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import cors_origins
from app.database import close_pool, init_pool
from app.routers import (
    analytics,
    assistant,
    auth,
    events,
    export,
    health,
    integrations,
    parse,
)


@asynccontextmanager
async def lifespan(_app):
    await init_pool()
    # Prefetch Supabase JWKS off the request path (ES256 verify uses blocking I/O).
    from app.auth import warm_jwks_cache
    import asyncio

    await asyncio.to_thread(warm_jwks_cache)
    yield
    await close_pool()

app = FastAPI(
    title="Timeora API",
    version="2.0.0",
    description="Your Intelligent Time Companion",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(parse.router, prefix="/api", tags=["parse"])
app.include_router(assistant.router, prefix="/api", tags=["assistant"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])
app.include_router(export.router, prefix="/api", tags=["export"])
app.include_router(integrations.router, prefix="/api", tags=["integrations"])


@app.get("/")
def root():
    return {"name": "Timeora API", "version": "2.0.0", "status": "running"}
