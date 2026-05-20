from supabase import create_client, Client
from redis.asyncio import Redis
from qdrant_client import AsyncQdrantClient
from .config import get_settings

settings = get_settings()

# Supabase client (service role for server-side operations)
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)


def get_supabase() -> Client:
    return supabase


async def get_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def get_qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )
