import httpx
from ..config import get_settings

settings = get_settings()

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"


class ElevenLabsTTS:
    """Convert text to speech using ElevenLabs streaming API."""

    def __init__(self, voice_id: str | None = None):
        self.api_key = settings.elevenlabs_api_key
        self.voice_id = voice_id or settings.elevenlabs_voice_id
        self.headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

    async def synthesize(self, text: str) -> bytes:
        """Synthesize text and return MP3 audio bytes."""
        url = f"{ELEVENLABS_URL}/{self.voice_id}"
        payload = {
            "text": text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            return resp.content

    async def synthesize_stream(self, text: str):
        """Yield audio chunks as they stream from ElevenLabs."""
        url = f"{ELEVENLABS_URL}/{self.voice_id}/stream"
        payload = {
            "text": text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=self.headers, json=payload) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        yield chunk
