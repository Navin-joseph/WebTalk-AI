from fastapi import APIRouter, Depends, Query
from supabase import Client
from datetime import datetime, timedelta
from ..database import get_supabase
from ..auth.dependencies import get_current_user
from ..models import AnalyticsResponse, TokenPayload

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/", response_model=AnalyticsResponse)
async def get_analytics(
    days: int = Query(30, ge=1, le=365),
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    client_id = client.data["id"]

    period_start = datetime.utcnow() - timedelta(days=days)
    period_end = datetime.utcnow()

    convos = (
        db.table("conversations")
        .select("id, messages, channel, created_at")
        .eq("client_id", client_id)
        .gte("created_at", period_start.isoformat())
        .execute()
    )

    total_conversations = len(convos.data)
    total_messages = sum(len(c["messages"]) for c in convos.data)
    voice_sessions = sum(1 for c in convos.data if c.get("channel") == "voice")
    text_sessions = total_conversations - voice_sessions

    # Pull avg response time from analytics table
    analytics_rows = (
        db.table("analytics")
        .select("response_time_ms")
        .eq("client_id", client_id)
        .gte("created_at", period_start.isoformat())
        .execute()
    )
    times = [r["response_time_ms"] for r in analytics_rows.data if r.get("response_time_ms")]
    avg_response_time = sum(times) / len(times) if times else 0.0

    return AnalyticsResponse(
        client_id=client_id,
        total_conversations=total_conversations,
        total_messages=total_messages,
        avg_response_time_ms=avg_response_time,
        voice_sessions=voice_sessions,
        text_sessions=text_sessions,
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/events")
async def list_events(
    days: int = Query(7, ge=1, le=90),
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    period_start = datetime.utcnow() - timedelta(days=days)

    result = (
        db.table("analytics")
        .select("*")
        .eq("client_id", client.data["id"])
        .gte("created_at", period_start.isoformat())
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    return result.data
