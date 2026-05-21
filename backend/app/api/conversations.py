import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client
from ..database import get_supabase
from ..auth.dependencies import get_current_user, get_client_from_api_key
from ..models import ChatRequest, ChatResponse, TokenPayload

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _get_client_row(user: TokenPayload, db: Client) -> dict:
    result = db.table("clients").select("id, name").eq("owner_user_id", user.sub).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    return result.data


@router.get("/", response_model=list[dict])
async def list_conversations(
    limit: int = 50,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = _get_client_row(user, db)
    result = (
        db.table("conversations")
        .select("*")
        .eq("client_id", client["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@router.get("/{conversation_id}", response_model=dict)
async def get_conversation(
    conversation_id: str,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = _get_client_row(user, db)
    result = (
        db.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("client_id", client["id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result.data


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = _get_client_row(user, db)
    result = (
        db.table("conversations")
        .delete()
        .eq("id", conversation_id)
        .eq("client_id", client["id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation deleted"}


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    client: dict = Depends(get_client_from_api_key),
    db: Client = Depends(get_supabase),
):
    """Text chat endpoint for the widget. Requires API key auth."""
    from ..rag.pipeline import RAGPipeline

    rag = RAGPipeline()
    result = await rag.query(
        client_id=str(client["id"]),
        question=payload.message,
        session_id=payload.session_id,
        company_name=client.get("name") or "the company",
    )

    _upsert_conversation(db, str(client["id"]), payload.session_id, payload.message, result["answer"])

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        session_id=payload.session_id,
    )


@router.post("/playground", response_model=ChatResponse)
async def playground_chat(
    payload: ChatRequest,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Dashboard playground — chat with your own agent using your JWT (no API key needed)."""
    from ..rag.pipeline import RAGPipeline

    client = _get_client_row(user, db)
    client_id = str(client["id"])
    company_name = client.get("name") or "the company"

    rag = RAGPipeline()
    result = await rag.query(
        client_id=client_id,
        question=payload.message,
        session_id=payload.session_id,
        company_name=company_name,
    )

    _upsert_conversation(db, client_id, payload.session_id, payload.message, result["answer"])

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        session_id=payload.session_id,
    )


@router.post("/playground/stream")
async def playground_stream(
    payload: ChatRequest,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Streaming playground. Returns Server-Sent Events."""
    from ..rag.pipeline import RAGPipeline

    client = _get_client_row(user, db)
    client_id = str(client["id"])
    company_name = client.get("name") or "the company"
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
                _upsert_conversation(
                    db, client_id, payload.session_id, payload.message, full_answer
                )
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
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


_DASHBOARD_SYSTEM_PROMPT = """You are the WebTalk AI Dashboard Assistant — a helpful, knowledgeable guide for the WebTalk AI platform.

WebTalk AI is a SaaS platform that lets businesses deploy AI voice and text chat agents trained on their own website content.

Key features you know well:
- Training: Users crawl their website via the Training page (supports up to 500 pages). The crawler extracts text, embeds it into a Qdrant vector database, and makes it searchable for the AI agent.
- Widget: An embeddable JavaScript widget that end-users interact with via text or voice on the client's website. Embed via a <script> tag using the client's API key.
- Conversations: All user sessions are stored and viewable in the dashboard. Voice and text sessions are tracked separately.
- Analytics: Shows total conversations, messages, average response time, and voice vs text split.
- API Keys: Clients generate API keys to authenticate their embedded widget. Keys can be created and deleted from the dashboard.
- Voice pipeline: Deepgram for speech-to-text, ElevenLabs or Cartesia for text-to-speech, real-time via WebSocket.
- LLM: Groq (llama-3.3-70b-versatile) powers all AI responses with RAG context injection.

RULES:
- Be concise and practical. Answer questions about using the platform, debugging issues, and best practices.
- If asked something unrelated to WebTalk AI or general software/AI topics, you can still help — you are a general assistant.
- Never make up API endpoints or features that don't exist in the platform.
- Be warm and direct. No unnecessary preamble."""


class AssistantMessage(BaseModel):
    role: str
    content: str


class AssistantRequest(BaseModel):
    message: str
    session_id: str
    history: list[AssistantMessage] = []


@router.post("/assistant/stream")
async def assistant_stream(
    payload: AssistantRequest,
    user: TokenPayload = Depends(get_current_user),
):
    """Direct LLM stream for the Dashboard Assistant — no RAG, Groq with platform system prompt."""
    from groq import AsyncGroq, APIConnectionError, APITimeoutError, RateLimitError, InternalServerError
    from ..config import get_settings

    settings = get_settings()
    client = AsyncGroq(api_key=settings.groq_api_key, timeout=25.0, max_retries=2)

    messages = [{"role": "system", "content": _DASHBOARD_SYSTEM_PROMPT}]
    for h in payload.history[-20:]:  # keep last 20 turns as context
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": payload.message})

    async def event_generator():
        full_answer = ""
        try:
            stream = await client.chat.completions.create(
                model=settings.groq_model,
                messages=messages,
                stream=True,
                temperature=0.7,
                max_tokens=800,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full_answer += delta
                    yield f"data: {json.dumps({'type': 'token', 'text': delta})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'answer': full_answer})}\n\n"
        except (APIConnectionError, APITimeoutError, RateLimitError, InternalServerError) as e:
            err_msg = "I'm having trouble reaching the AI service right now. Please try again in a moment."
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


class _TTSRequest(BaseModel):
    text: str


@router.post("/tts")
async def dashboard_tts(
    payload: _TTSRequest,
    user: TokenPayload = Depends(get_current_user),
):
    """TTS for the Dashboard AI — JWT auth, returns MP3 bytes via configured provider."""
    from ..voice.tts import get_tts, TTSError
    from fastapi.responses import Response

    text = payload.text.strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="Text required")

    try:
        tts = get_tts()
        audio = await tts.synthesize(text)
    except TTSError as e:
        raise HTTPException(status_code=502, detail=str(e)[:300])
    except Exception:
        raise HTTPException(status_code=500, detail="TTS failed")

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "Content-Length": str(len(audio))},
    )


def _upsert_conversation(db: Client, client_id: str, session_id: str, user_msg: str, ai_msg: str):
    existing = db.table("conversations").select("id, messages").eq("client_id", client_id).eq("session_id", session_id).execute()

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
            "channel": "text",
        }).execute()
