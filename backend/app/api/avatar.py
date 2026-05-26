"""
D-ID Streams API proxy
──────────────────────
Keeps the D-ID API key server-side and exposes lightweight proxy endpoints
that the dashboard frontend (JWT auth) and embeddable widget (API-key auth)
use to set up WebRTC lip-sync sessions.

D-ID Streams flow:
  1. POST /avatar/stream/create           → D-ID creates session, returns WebRTC offer
  2. POST /avatar/stream/{id}/sdp         → client submits answer SDP
  3. POST /avatar/stream/{id}/ice         → exchange ICE candidates
  4. POST /avatar/stream/{id}/speak       → D-ID generates + streams lip-synced video
  5. DELETE /avatar/stream/{id}           → close session
"""

import base64
import logging
from fastapi import APIRouter, Depends, HTTPException
from ..auth.dependencies import get_current_user
from ..models import TokenPayload
from ..config import get_settings
import httpx

logger = logging.getLogger("webtalk.avatar")

router = APIRouter(prefix="/avatar", tags=["avatar"])

DID_BASE = "https://api.d-id.com"


def _did_headers() -> dict:
    key = get_settings().did_api_key
    if not key:
        raise HTTPException(status_code=503, detail="D-ID API key not configured")
    encoded = base64.b64encode(f"{key}:".encode()).decode()
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


# ── Dashboard endpoints (JWT auth) ───────────────────────────────────────────

@router.post("/stream/create")
async def create_stream(
    body: dict,
    user: TokenPayload = Depends(get_current_user),
):
    """Create a D-ID Streams session. Returns WebRTC offer + ICE servers."""
    headers = _did_headers()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{DID_BASE}/talks/streams", json=body, headers=headers)
        if not r.is_success:
            logger.warning("D-ID create_stream error %s: %s", r.status_code, r.text[:300])
            raise HTTPException(status_code=r.status_code, detail=r.text[:300])
        return r.json()


@router.post("/stream/{stream_id}/sdp")
async def submit_sdp(
    stream_id: str,
    body: dict,
    user: TokenPayload = Depends(get_current_user),
):
    """Submit the WebRTC answer SDP back to D-ID."""
    headers = _did_headers()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{DID_BASE}/talks/streams/{stream_id}/sdp", json=body, headers=headers)
        if not r.is_success:
            raise HTTPException(status_code=r.status_code, detail=r.text[:300])
        return r.json() if r.content else {}


@router.post("/stream/{stream_id}/ice")
async def submit_ice(
    stream_id: str,
    body: dict,
    user: TokenPayload = Depends(get_current_user),
):
    """Forward an ICE candidate to D-ID."""
    headers = _did_headers()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{DID_BASE}/talks/streams/{stream_id}/ice", json=body, headers=headers)
        # D-ID returns 200 or 204 — both are success
        if r.status_code not in (200, 201, 204):
            logger.warning("D-ID ICE error %s", r.status_code)
        return {}


@router.post("/stream/{stream_id}/speak")
async def speak(
    stream_id: str,
    body: dict,
    user: TokenPayload = Depends(get_current_user),
):
    """Send text/audio to D-ID; generates & streams lip-synced video."""
    headers = _did_headers()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{DID_BASE}/talks/streams/{stream_id}/stream", json=body, headers=headers)
        if not r.is_success:
            raise HTTPException(status_code=r.status_code, detail=r.text[:300])
        return r.json() if r.content else {}


@router.delete("/stream/{stream_id}")
async def close_stream(
    stream_id: str,
    user: TokenPayload = Depends(get_current_user),
):
    """Close a D-ID Streams session."""
    headers = _did_headers()
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            await c.delete(f"{DID_BASE}/talks/streams/{stream_id}", headers=headers)
        except Exception:
            pass
    return {}
