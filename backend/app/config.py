from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

# .env lives at the project root (two levels above this file: app/ → backend/ → project root)
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    # App
    app_name: str = "WebTalk AI"
    debug: bool = False
    secret_key: str

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # Groq — LLM inference (fastest reasoning, best low-latency)
    # https://console.groq.com/docs/models
    groq_api_key: str
    groq_model: str = "llama-3.1-8b-instant"  # fast, accurate, low latency
    groq_embedding_model: str = "nomic-embed-text-v1_5"  # unused (we use fastembed)

    # Deepgram — Speech-to-text (STT)
    # https://developers.deepgram.com/docs/flux/quickstart
    deepgram_api_key: str
    deepgram_stt_model: str = "nova-3"  # latest Flux model, best accuracy

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel

    # Cartesia — Text-to-speech (TTS) [DEPRECATED — using HeyGen now]
    # https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "694f9389-aac1-45b6-b726-9d9369183238"
    cartesia_model_id: str = "sonic-3.5"
    tts_provider: str = "cartesia"

    # HeyGen — Interactive Avatar (TTS + lip-sync + animation)
    # https://docs.heygen.com/reference/interactive-avatar-api
    heygen_api_key: str
    heygen_avatar_id: str  # e.g., "78dc3d8016223f50a9bdb4ce"

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"  # ignore NEXT_PUBLIC_* and other frontend-only vars


@lru_cache
def get_settings() -> Settings:
    return Settings()
