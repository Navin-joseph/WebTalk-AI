import logging
import asyncio
import time
from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import get_settings
from .auth.router import router as auth_router
from .api.clients import router as clients_router
from .api.training import router as training_router
from .api.conversations import router as conversations_router
from .api.analytics import router as analytics_router
from .api.widget import router as widget_router
from .api.avatar import router as avatar_router
from .websocket.handler import voice_websocket_handler

# Set up logging early
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("webtalk")

settings = get_settings()
APP_BOOT_TIME = time.time()


async def _preload_embedder():
    """Download the embedding model in the background after the server is already up."""
    try:
        from .crawler.embeddings import _get_embedder
        t0 = time.time()
        await asyncio.to_thread(_get_embedder)
        logger.info("Embedding model loaded in %.1fs", time.time() - t0)
    except Exception as e:
        logger.warning("Failed to pre-load embedding model: %s — will load on first use", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting WebTalk AI backend")
    logger.info("Groq model: %s", settings.groq_model)
    logger.info("Qdrant URL: %s", settings.qdrant_url.split("://")[0] + "://...")
    logger.info("Allowed origins: open (auth-gated)")

    # Fire-and-forget: server binds the port immediately, model loads in background.
    # This prevents Render from timing out on port detection during the 3-5min model download.
    asyncio.create_task(_preload_embedder())

    yield
    logger.info("Shutting down")


app = FastAPI(
    title="WebTalk AI",
    description="Multi-Tenant AI Voice Agent SaaS Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — open because the widget is meant to load on ANY customer site.
# Security is enforced by JWT (dashboard) and API keys (widget).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# REST routes
app.include_router(auth_router, prefix="/api/v1")
app.include_router(clients_router, prefix="/api/v1")
app.include_router(training_router, prefix="/api/v1")
app.include_router(conversations_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(widget_router, prefix="/api/v1")
app.include_router(avatar_router, prefix="/api/v1")


@app.get("/health")
async def health(deep: bool = False):
    """
    Health endpoint with optional deep dependency checks.

    GET /health         — fast OK ping
    GET /health?deep=1  — checks env vars + Qdrant + embedder + Groq config
    """
    info: dict = {
        "status": "ok",
        "service": "webtalk-ai",
        "uptime_sec": int(time.time() - APP_BOOT_TIME),
    }

    if not deep:
        return info

    checks: dict = {}

    # Env vars (does NOT leak values — only "set" booleans)
    checks["env"] = {
        "groq_key_set":       bool(settings.groq_api_key),
        "deepgram_key_set":   bool(settings.deepgram_api_key),
        "elevenlabs_key_set": bool(settings.elevenlabs_api_key),
        "qdrant_url_set":     bool(settings.qdrant_url) and "localhost" not in settings.qdrant_url,
        "qdrant_key_set":     bool(settings.qdrant_api_key),
        "supabase_url_set":   bool(settings.supabase_url),
        "supabase_srv_set":   bool(settings.supabase_service_role_key),
    }

    # Embedding model
    try:
        from .crawler.embeddings import _embedder
        checks["embedder"] = {"loaded": _embedder is not None}
    except Exception as e:
        checks["embedder"] = {"loaded": False, "error": str(e)[:120]}

    # Qdrant reachable?
    try:
        from .database import get_qdrant
        qd = get_qdrant()
        cols = await asyncio.wait_for(qd.get_collections(), timeout=8)
        checks["qdrant"] = {"ok": True, "collections": len(cols.collections)}
    except Exception as e:
        checks["qdrant"] = {"ok": False, "error": str(e)[:200]}
        info["status"] = "degraded"

    # Groq reachable? (cheap test)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            )
            checks["groq"] = {"ok": r.status_code == 200, "status": r.status_code}
    except Exception as e:
        checks["groq"] = {"ok": False, "error": str(e)[:120]}

    info["checks"] = checks
    return info


@app.websocket("/ws/voice/{client_id}")
async def websocket_voice(
    websocket: WebSocket,
    client_id: str,
    session_id: str = Query(...),
    api_key: str = Query(...),
):
    await voice_websocket_handler(websocket, client_id, session_id, api_key)
