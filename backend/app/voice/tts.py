"""
tts.py — Text-to-Speech providers for WebTalk AI

Cartesia endpoint rules (IMPORTANT):
  /tts/bytes  → accepts any container (mp3, wav, etc.)  — used for one-shot blob
  /tts/sse    → ONLY accepts container="raw"            — used for streaming + MuseTalk
                output_format must be:
                  container  = "raw"
                  encoding   = "pcm_s16le"   (16-bit signed little-endian PCM)
                  sample_rate = 16000        (required by MuseTalk lip-sync model)
"""

import json
import base64
import logging
import httpx
from ..config import get_settings

logger = logging.getLogger("webtalk.tts")
settings = get_settings()

ELEVENLABS_URL  = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_URL    = "https://api.cartesia.ai/tts"
CARTESIA_VERSION = "2025-04-16"

# ── Cartesia output formats ───────────────────────────────────────────────────
# /tts/bytes  → MP3 at 44100 Hz  (full quality, returned as a complete blob)
_FMT_MP3 = {
    "container":   "mp3",
    "encoding":    "mp3",
    "sample_rate": 44100,
}

# /tts/sse    → raw PCM s16le at 16000 Hz  (streaming + MuseTalk lip-sync)
# The SSE endpoint ONLY accepts container="raw"; any other value returns HTTP 400.
# 16 kHz mono s16le is the exact format expected by MuseTalk and Simli PCM-16 pipeline.
_FMT_RAW_PCM = {
    "container":   "raw",
    "encoding":    "pcm_s16le",
    "sample_rate": 16000,
}


class TTSError(Exception):
    """Raised when TTS synthesis fails."""

    def __init__(self, provider: str, status: int, body: str):
        super().__init__(f"{provider} error {status}: {body[:200]}")
        self.status = status
        self.body   = body


# ─────────────────────────────────────────────────────────────────────────────
# ElevenLabs
# ─────────────────────────────────────────────────────────────────────────────

class ElevenLabsTTS:
    """Convert text to speech using ElevenLabs streaming API."""

    def __init__(self, voice_id: str | None = None):
        self.api_key  = settings.elevenlabs_api_key
        self.voice_id = voice_id or settings.elevenlabs_voice_id
        self.headers  = {
            "xi-api-key":    self.api_key,
            "Content-Type":  "application/json",
            "Accept":        "audio/mpeg",
        }

    async def synthesize(self, text: str) -> bytes:
        """One-shot synthesis — returns MP3 bytes."""
        url     = f"{ELEVENLABS_URL}/{self.voice_id}"
        payload = {
            "text":     text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {
                "stability":        0.5,
                "similarity_boost": 0.75,
                "style":            0.0,
                "use_speaker_boost": True,
            },
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
            if resp.status_code != 200:
                body = resp.text
                logger.error(
                    "ElevenLabs synth failed %s voice=%s: %s",
                    resp.status_code, self.voice_id, body[:300],
                )
                raise TTSError("ElevenLabs", resp.status_code, body)
            return resp.content

    async def synthesize_stream(self, text: str):
        """Yield MP3 chunks for streaming playback."""
        url     = f"{ELEVENLABS_URL}/{self.voice_id}/stream"
        payload = {
            "text":     text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=self.headers, json=payload) as resp:
                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    body       = body_bytes.decode("utf-8", errors="replace")
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


# ─────────────────────────────────────────────────────────────────────────────
# Cartesia
# ─────────────────────────────────────────────────────────────────────────────

class CartesiaTTS:
    """
    Convert text to speech using Cartesia Sonic-3.5.

    Two distinct output formats are used depending on the endpoint:

      synthesize()        → /tts/bytes  → MP3 (44100 Hz)
                            Full audio blob; used by widget one-shot TTS and
                            Simli PCM-16 conversion path.

      synthesize_stream() → /tts/sse    → raw PCM s16le (16000 Hz)
                            Chunked raw audio for streaming playback and
                            MuseTalk / Simli lip-sync pipeline.
    """

    def __init__(self, voice_id: str | None = None):
        self.api_key  = settings.cartesia_api_key
        self.voice_id = voice_id or settings.cartesia_voice_id
        self.model_id = settings.cartesia_model_id
        self._base_headers = {
            "X-API-Key":         self.api_key,
            "Cartesia-Version":  CARTESIA_VERSION,
            "Content-Type":      "application/json",
        }

    def _build_payload(self, text: str, output_format: dict) -> dict:
        """Build a Cartesia TTS request payload with the given output_format."""
        return {
            "transcript":    text,
            "model_id":      self.model_id,
            "voice":         {"mode": "id", "id": self.voice_id},
            "output_format": output_format,
        }

    # ── One-shot synthesis (MP3 blob) ─────────────────────────────────────────

    async def synthesize(self, text: str) -> bytes:
        """
        One-shot synthesis via /tts/bytes.

        Returns complete MP3 bytes (44100 Hz).
        Used by:
          - Widget /tts endpoint (full blob for browser Audio element)
          - Simli PCM-16 path (blob is decoded + resampled in the frontend)
        """
        url     = f"{CARTESIA_URL}/bytes"
        payload = self._build_payload(text, _FMT_MP3)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self._base_headers, json=payload)
            if resp.status_code != 200:
                body = resp.text
                logger.error(
                    "Cartesia synth failed HTTP %s voice=%s model=%s | %s",
                    resp.status_code, self.voice_id, self.model_id, body[:400],
                )
                raise TTSError("Cartesia", resp.status_code, body)

            logger.debug("Cartesia synth OK: %d bytes (MP3 44100 Hz)", len(resp.content))
            return resp.content

    # ── Streaming synthesis (raw PCM s16le) ───────────────────────────────────

    async def synthesize_stream(self, text: str):
        """
        Streaming synthesis via /tts/sse.

        Yields raw PCM s16le chunks at 16000 Hz.

        IMPORTANT — format rationale:
          The /tts/sse endpoint ONLY accepts container="raw".
          Requesting any other container (mp3, wav, etc.) returns HTTP 400:
            "Invalid request: only 'raw' container is supported for this endpoint"
          pcm_s16le @ 16000 Hz is the exact format consumed by:
            - MuseTalk lip-sync model
            - Simli.ai sendAudioData() (PCM-16, 16kHz mono)
            - WebSocket voice pipeline
        """
        url         = f"{CARTESIA_URL}/sse"
        payload     = self._build_payload(text, _FMT_RAW_PCM)
        sse_headers = {**self._base_headers, "Accept": "text/event-stream"}

        logger.debug(
            "Cartesia SSE stream — voice=%s model=%s format=%s",
            self.voice_id, self.model_id, _FMT_RAW_PCM,
        )

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=sse_headers, json=payload) as resp:

                # ── HTTP-level error (400 / 401 / 429 / 500 etc.) ─────────────
                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    body       = body_bytes.decode("utf-8", errors="replace")
                    logger.error(
                        "Cartesia SSE failed HTTP %s voice=%s model=%s | %s",
                        resp.status_code, self.voice_id, self.model_id, body[:400],
                    )
                    raise TTSError("Cartesia", resp.status_code, body)

                total = 0

                async for line in resp.aiter_lines():
                    # SSE lines are "data: <json>" or empty keep-alives
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue

                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError as exc:
                        logger.warning("Cartesia SSE — malformed JSON line: %s | %s", exc, raw[:80])
                        continue

                    event_type = event.get("type")

                    if event_type == "chunk":
                        # Audio data is base64-encoded raw PCM bytes
                        try:
                            audio = base64.b64decode(event["data"])
                        except (KeyError, Exception) as exc:
                            logger.warning("Cartesia SSE — failed to decode chunk: %s", exc)
                            continue
                        total += len(audio)
                        yield audio

                    elif event_type == "done":
                        # Cartesia sends a final "done" event — stream is complete
                        logger.info(
                            "Cartesia SSE stream done: %d bytes raw PCM (16kHz s16le) voice=%s",
                            total, self.voice_id,
                        )
                        break

                    elif event_type == "error":
                        # Application-level error from Cartesia (inside 200 response)
                        msg = event.get("message", "unknown Cartesia error")
                        logger.error("Cartesia SSE app-error: %s", msg)
                        raise TTSError("Cartesia", 500, msg)

                    # Any other event types (timestamps, etc.) are silently ignored


# ─────────────────────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────────────────────

def get_tts(voice_id: str | None = None) -> ElevenLabsTTS | CartesiaTTS:
    """Return the configured TTS provider instance (Cartesia or ElevenLabs)."""
    provider = settings.tts_provider.lower()
    if provider == "cartesia":
        return CartesiaTTS(voice_id=voice_id)
    return ElevenLabsTTS(voice_id=voice_id)
