"""
Public widget endpoints — called directly from JS embedded on customer sites.

All endpoints authenticate via the X-API-Key header (no user JWT).
Tenant isolation is enforced by resolving api_key -> client_id, then scoping
every Qdrant search and database write to that client_id.
"""
import json
import time
import hashlib
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body, Request, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from ..database import get_supabase
from ..auth.dependencies import get_client_from_api_key, _hash_key
from ..models import ChatRequest

logger = logging.getLogger("webtalk.widget")
router = APIRouter(prefix="/widget", tags=["widget"])


class TTSRequest(BaseModel):
    text: str


# Public-facing chat schema — matches what's documented in the install snippet
class WidgetChatRequest(BaseModel):
    api_key: Optional[str] = None  # also accepts X-API-Key header
    message: str
    conversation_id: Optional[str] = None  # alias for session_id


class WidgetChatResponse(BaseModel):
    success: bool
    response: str
    sources: list[str] = []
    conversation_id: str


@router.get("/config")
async def widget_config(api_key: str, db: Client = Depends(get_supabase)):
    """Bootstrap endpoint — widget calls this once on load."""
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    try:
        result = (
            db.table("api_keys")
            .select("client_id, is_active, clients(id, name, website_url)")
            .eq("key_hash", key_hash)
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.exception("widget_config: API key lookup failed")
        raise HTTPException(status_code=500, detail=f"Lookup failed: {type(e).__name__}")

    if not result or not result.data:
        logger.warning("widget_config: invalid API key (prefix=%s)", api_key[:8])
        raise HTTPException(status_code=401, detail="Invalid API key")

    client = result.data["clients"]
    logger.info("widget_config: OK client=%s", client["id"])
    return {
        "client_id": client["id"],
        "company_name": client["name"],
        "website_url": client["website_url"],
        "voice_enabled": True,
    }


@router.post("/chat", response_model=WidgetChatResponse)
async def widget_chat(
    payload: WidgetChatRequest,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Client = Depends(get_supabase),
):
    """
    REST (NOT WebSocket) chat endpoint for the embedded widget.

    Auth: either body.api_key OR X-API-Key header.

    Request:  { api_key?: string, message: string, conversation_id?: string }
    Response: { success: bool, response: string, sources: string[], conversation_id: string }

    Never streams. Always returns a complete JSON response. Falls back to a
    soft answer if RAG retrieval is empty (rather than refusing to reply).
    """
    from ..rag.pipeline import RAGPipeline

    # 1. Resolve & validate API key (body wins, header is fallback)
    api_key = (payload.api_key or x_api_key or "").strip()
    if not api_key:
        logger.warning("chat REJECT: no api_key")
        raise HTTPException(status_code=401, detail="API key required (body.api_key or X-API-Key header)")

    try:
        key_result = (
            db.table("api_keys")
            .select("client_id, is_active, clients(id, name, website_url)")
            .eq("key_hash", _hash_key(api_key))
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.exception("chat REJECT: api_key lookup failed")
        raise HTTPException(status_code=500, detail=f"Auth lookup failed: {type(e).__name__}")

    if not key_result or not key_result.data:
        logger.warning("chat REJECT: invalid api_key prefix=%s", api_key[:8])
        raise HTTPException(status_code=401, detail="Invalid API key")

    client = key_result.data["clients"]
    client_id = str(client["id"])
    company_name = client.get("name") or "this site"
    conversation_id = payload.conversation_id or f"c_{int(time.time()*1000)}"

    origin = request.headers.get("origin", "?")
    t0 = time.monotonic()
    logger.info(
        "[REST chat] IN  client=%s origin=%s convo=%s msg=%r",
        client_id, origin, conversation_id, payload.message[:80],
    )

    # 2. RAG query (with fallback on failure)
    answer: str = ""
    sources: list[str] = []
    try:
        rag = RAGPipeline()
        # Inline timing breakdown so logs show what's slow
        result = await rag.query(
            client_id=client_id,
            question=payload.message,
            session_id=conversation_id,
            company_name=company_name,
        )
        answer = (result.get("answer") or "").strip()
        sources = result.get("sources", []) or []
        logger.info(
            "[REST chat] RAG client=%s chunks=%d answer_len=%d",
            client_id, len(sources), len(answer),
        )
    except Exception as e:
        logger.exception("[REST chat] RAG FAILED client=%s err=%s", client_id, e)
        # Soft fallback — never let the widget hang or error out
        answer = (
            "I'm having trouble accessing my knowledge base right now. "
            "Please try again in a moment, or contact support if this persists."
        )

    # 3. Final-fallback: if RAG returned empty answer, give a friendly message
    if not answer:
        answer = "I don't have enough information about that yet. Could you rephrase your question?"

    dt_ms = (time.monotonic() - t0) * 1000
    logger.info(
        "[REST chat] OUT client=%s dt=%.0fms sources=%d",
        client_id, dt_ms, len(sources),
    )

    # 4. Persist conversation (best-effort, non-fatal)
    try:
        _upsert_conversation(db, client_id, conversation_id, payload.message, answer, "text")
    except Exception:
        logger.exception("[REST chat] persistence failed (non-fatal)")

    return WidgetChatResponse(
        success=True,
        response=answer,
        sources=sources,
        conversation_id=conversation_id,
    )


@router.post("/chat/stream")
async def widget_chat_stream(
    payload: ChatRequest,
    request: Request,
    client: dict = Depends(get_client_from_api_key),
    db: Client = Depends(get_supabase),
):
    """SSE streaming chat for the embedded widget. Authenticated via X-API-Key header."""
    from ..rag.pipeline import RAGPipeline

    client_id = str(client["id"])
    company_name = client.get("name") or "this site"
    session_id = payload.session_id
    rag = RAGPipeline()
    logger.info("widget stream IN client=%s session=%s", client_id, session_id)

    async def event_generator():
        full_answer = ""
        try:
            async for event in rag.stream_query(
                client_id=client_id,
                question=payload.message,
                session_id=session_id,
                company_name=company_name,
            ):
                if event["type"] == "done":
                    full_answer = event["answer"]
                yield f"data: {json.dumps(event)}\n\n"

            if full_answer:
                try:
                    _upsert_conversation(db, client_id, session_id, payload.message, full_answer, "text")
                except Exception:
                    logger.exception("widget stream: conversation persist failed (non-fatal)")

        except Exception:
            logger.exception("widget stream FAIL client=%s", client_id)
            err_msg = "I'm having trouble right now. Please try again."
            yield f"data: {json.dumps({'type': 'token', 'text': err_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'answer': err_msg})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/tts")
async def widget_tts(
    payload: TTSRequest = Body(...),
    client: dict = Depends(get_client_from_api_key),
):
    """
    Return MP3 audio bytes (one-shot — no streaming).

    Streaming is fragile across Render's proxy. One-shot returns the whole
    audio file in a single response, which the client decodes via Web Audio.
    Surfaces real errors (auth, quota, bad voice) as 502 with details.
    """
    from ..voice.tts import get_tts, TTSError
    from fastapi.responses import Response

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text required")
    text = text[:1200]

    client_id = client.get("id", "?")
    logger.info("tts IN client=%s len=%d", client_id, len(text))

    try:
        tts = get_tts()
        audio = await tts.synthesize(text)
    except TTSError as e:
        logger.error("tts provider error: %s", e)
        raise HTTPException(status_code=502, detail=str(e)[:300])
    except Exception as e:
        logger.exception("tts unexpected failure")
        raise HTTPException(status_code=500, detail=f"TTS failed: {type(e).__name__}")

    logger.info("tts OUT client=%s bytes=%d", client_id, len(audio))
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "Content-Length": str(len(audio)),
        },
    )


@router.post("/tts/stream")
async def widget_tts_stream(
    payload: TTSRequest = Body(...),
    client: dict = Depends(get_client_from_api_key),
):
    """
    Streaming TTS — pipes Cartesia SSE chunks directly to the browser.
    First audio bytes arrive in ~100-150 ms instead of ~500-800 ms (one-shot).
    The browser plays via MediaSource API and hears audio almost immediately.
    """
    from ..voice.tts import get_tts
    from fastapi.responses import StreamingResponse

    text = payload.text.strip()[:1200]
    if not text:
        raise HTTPException(status_code=400, detail="Text required")

    client_id = client.get("id", "?")
    logger.info("tts/stream IN client=%s len=%d", client_id, len(text))

    tts = get_tts()

    async def gen():
        try:
            async for chunk in tts.synthesize_stream(text):
                yield chunk
        except Exception:
            logger.exception("tts/stream gen failed client=%s", client_id)

    return StreamingResponse(
        gen(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def _upsert_conversation(
    db: Client, client_id: str, session_id: str,
    user_msg: str, ai_msg: str, channel: str = "text",
):
    existing = (
        db.table("conversations").select("id, messages")
        .eq("client_id", client_id).eq("session_id", session_id).execute()
    )
    new_msgs = [
        {"role": "user", "content": user_msg},
        {"role": "assistant", "content": ai_msg},
    ]
    if existing.data:
        messages = existing.data[0]["messages"] + new_msgs
        db.table("conversations").update({"messages": messages}).eq("id", existing.data[0]["id"]).execute()
    else:
        db.table("conversations").insert({
            "client_id": client_id, "session_id": session_id,
            "messages": new_msgs, "channel": channel,
        }).execute()
