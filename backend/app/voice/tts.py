import logging
import httpx
from ..config import get_settings

logger = logging.getLogger("webtalk.tts")
settings = get_settings()

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"


class TTSError(Exception):
    """Raised when ElevenLabs synthesis fails. Includes status + body so we
    can surface the actual issue (auth, quota, bad voice id, etc)."""
    def __init__(self, status: int, body: str):
        super().__init__(f"ElevenLabs error {status}: {body[:200]}")
        self.status = status
        self.body = body


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
        """One-shot synthesis. Returns MP3 bytes. Raises TTSError on failure."""
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
            if resp.status_code != 200:
                body = resp.text
                logger.error("ElevenLabs synth failed %s: %s", resp.status_code, body[:300])
                raise TTSError(resp.status_code, body)
            return resp.content

    async def synthesize_stream(self, text: str):
        """Yield MP3 chunks. Raises TTSError on failure (BEFORE yielding any chunks)."""
        url = f"{ELEVENLABS_URL}/{self.voice_id}/stream"
        payload = {
            "text": text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=self.headers, json=payload) as resp:
                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    body = body_bytes.decode("utf-8", errors="replace")
                    logger.error(
                        "ElevenLabs stream failed %s voice=%s: %s",
                        resp.status_code, self.voice_id, body[:400],
                    )
                    raise TTSError(resp.status_code, body)

                total = 0
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        total += len(chunk)
                        yield chunk
                logger.info("ElevenLabs stream done: %d bytes", total)
