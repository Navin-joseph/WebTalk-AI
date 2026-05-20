from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import get_settings
from .auth.router import router as auth_router
from .api.clients import router as clients_router
from .api.training import router as training_router
from .api.conversations import router as conversations_router
from .api.analytics import router as analytics_router
from .websocket.handler import voice_websocket_handler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing to initialize (clients created on demand)
    yield
    # Shutdown


app = FastAPI(
    title="WebTalk AI",
    description="Multi-Tenant AI Voice Agent SaaS Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(auth_router, prefix="/api/v1")
app.include_router(clients_router, prefix="/api/v1")
app.include_router(training_router, prefix="/api/v1")
app.include_router(conversations_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "webtalk-ai"}


@app.websocket("/ws/voice/{client_id}")
async def websocket_voice(
    websocket: WebSocket,
    client_id: str,
    session_id: str = Query(...),
    api_key: str = Query(...),
):
    await voice_websocket_handler(websocket, client_id, session_id, api_key)
