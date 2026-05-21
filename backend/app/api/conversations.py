import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
