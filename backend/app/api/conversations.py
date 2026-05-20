from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from ..database import get_supabase
from ..auth.dependencies import get_current_user, get_client_from_api_key
from ..models import ChatRequest, ChatResponse, TokenPayload

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/", response_model=list[dict])
async def list_conversations(
    limit: int = 50,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    result = (
        db.table("conversations")
        .select("*")
        .eq("client_id", client.data["id"])
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
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    result = (
        db.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("client_id", client.data["id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result.data


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
    )

    # Persist conversation
    _upsert_conversation(db, str(client["id"]), payload.session_id, payload.message, result["answer"])

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        session_id=payload.session_id,
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
