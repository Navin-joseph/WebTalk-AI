import json
import base64
import logging
import httpx
from ..config import get_settings

logger = logging.getLogger("webtalk.tts")
settings = get_settings()

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_URL = "https://api.cartesia.ai/tts"
CARTESIA_VERSION = "2025-04-16"


class TTSError(Exception):
    """Raised when TTS synthesis fails."""
    def __init__(self, provider: str, status: int, body: str):
        super().__init__(f"{provider} error {status}: {body[:200]}")
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
        """One-shot synthesis. Returns MP3 bytes."""
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
                raise TTSError("ElevenLabs", resp.status_code, body)
            return resp.content

    async def synthesize_stream(self, text: str):
        """Yield MP3 chunks."""
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
                    raise TTSError("ElevenLabs", resp.status_code, body)

                total = 0
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        total += len(chunk)
                        yield chunk
                logger.info("ElevenLabs stream done: %d bytes", total)


class CartesiaTTS:
    """Convert text to speech using Cartesia's API (sonic-2 model, SSE streaming)."""

    def __init__(self, voice_id: str | None = None):
        self.api_key = settings.cartesia_api_key
        self.voice_id = voice_id or settings.cartesia_voice_id
        self.model_id = settings.cartesia_model_id
        self.headers = {
            "X-API-Key": self.api_key,
            "Cartesia-Version": CARTESIA_VERSION,
            "Content-Type": "application/json",
        }

    def _payload(self, text: str) -> dict:
        return {
            "transcript": text,
            "model_id": self.model_id,
            "voice": {"mode": "id", "id": self.voice_id},
            "output_format": {
                "container": "mp3",
                "encoding": "mp3",
                "sample_rate": 44100,
            },
        }

    async def synthesize(self, text: str) -> bytes:
        """One-shot synthesis. Returns MP3 bytes."""
        url = f"{CARTESIA_URL}/bytes"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self.headers, json=self._payload(text))
            if resp.status_code != 200:
                body = resp.text
                logger.error("Cartesia synth failed %s: %s", resp.status_code, body[:300])
                raise TTSError("Cartesia", resp.status_code, body)
            return resp.content

    async def synthesize_stream(self, text: str):
        """Yield MP3 chunks via SSE."""
        url = f"{CARTESIA_URL}/sse"
        sse_headers = {**self.headers, "Accept": "text/event-stream"}

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=sse_headers, json=self._payload(text)) as resp:
                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    body = body_bytes.decode("utf-8", errors="replace")
                    logger.error(
                        "Cartesia stream failed %s voice=%s: %s",
                        resp.status_code, self.voice_id, body[:400],
                    )
                    raise TTSError("Cartesia", resp.status_code, body)

                total = 0
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    if event.get("type") == "chunk":
                        audio = base64.b64decode(event["data"])
                        total += len(audio)
                        yield audio
                    elif event.get("type") == "error":
                        raise TTSError("Cartesia", 500, event.get("message", "unknown"))

                logger.info("Cartesia stream done: %d bytes", total)


def get_tts(voice_id: str | None = None) -> ElevenLabsTTS | CartesiaTTS:
    """Return the configured TTS provider instance."""
    provider = settings.tts_provider.lower()
    if provider == "cartesia":
        return CartesiaTTS(voice_id=voice_id)
    return ElevenLabsTTS(voice_id=voice_id)
