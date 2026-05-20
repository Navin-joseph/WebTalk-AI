"""
Public widget endpoints — called directly from JS embedded on customer websites.

All endpoints authenticate via the X-API-Key header (no user JWT).
Tenant isolation is enforced by resolving api_key → client_id, then scoping
every Qdrant search and database write to that client_id.
"""
import json
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from ..database import get_supabase
from ..auth.dependencies import get_client_from_api_key
from ..models import ChatRequest

router = APIRouter(prefix="/widget", tags=["widget"])


class TTSRequest(BaseModel):
    text: str


@router.get("/config")
async def widget_config(api_key: str, db: Client = Depends(get_supabase)):
    """
    Bootstrap endpoint — widget calls this once on load to fetch
    tenant info (name, branding) and verify the API key.

    Note: takes api_key as a query string so we can also use this from
    contexts where setting headers is awkward.
    """
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    result = (
        db.table("api_keys")
        .select("client_id, is_active, clients(id, name, website_url)")
        .eq("key_hash", key_hash)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid API key")

    client = result.data["clients"]
    return {
        "client_id": client["id"],
        "company_name": client["name"],
        "website_url": client["website_url"],
        "voice_enabled": True,
    }


@router.post("/chat/stream")
async def widget_chat_stream(
    payload: ChatRequest,
    client: dict = Depends(get_client_from_api_key),
    db: Client = Depends(get_supabase),
):
    """Streaming chat for the embedded widget (SSE)."""
    from ..rag.pipeline import RAGPipeline

    client_id = str(client["id"])
    company_name = client.get("name", "this site")
    rag = RAGPipeline()

    async def event_generator():
        full_answer = ""
        try:
            async for event in rag.stream_query(
                client_id=client_id,
                question=payload.message,
                session_id=payload.session_id,
                company_name=company_name,
            ):
                if event["type"] == "done":
                    full_answer = event["answer"]
                yield f"data: {json.dumps(event)}\n\n"

            if full_answer:
                _upsert_conversation(db, client_id, payload.session_id, payload.message, full_answer, "text")
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

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
    Stream MP3 audio of the given text. Used when the widget should also
    speak its text reply (so typed conversations have a voice).
    """
    from ..voice.tts import ElevenLabsTTS

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text required")
    # Hard cap to control cost
    text = text[:1200]

    tts = ElevenLabsTTS()

    async def audio_stream():
        async for chunk in tts.synthesize_stream(text):
            yield chunk

    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


def _upsert_conversation(
    db: Client, client_id: str, session_id: str,
    user_msg: str, ai_msg: str, channel: str = "text",
):
    existing = (
        db.table("conversations")
        .select("id, messages")
        .eq("client_id", client_id)
        .eq("session_id", session_id)
        .execute()
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
            "client_id": client_id,
            "session_id": session_id,
            "messages": new_msgs,
            "channel": channel,
        }).execute()
