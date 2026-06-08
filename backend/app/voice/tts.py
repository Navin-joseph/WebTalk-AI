"""
tts.py — Text-to-Speech providers for WebTalk AI

Cartesia endpoint rules (IMPORTANT):
  /tts/bytes  → accepts any container (mp3, wav, etc.)  — used for one-shot blob
  /tts/sse    → ONLY accepts container="raw"            — used for streaming + MuseTalk
                output_format must be:
                  container   = "raw"
                  encoding    = "pcm_s16le"  (16-bit signed little-endian PCM)
                  sample_rate = 16000        (required by MuseTalk lip-sync model)

WAV wrapping (synthesize_stream):
  The SSE endpoint yields raw bytes with no container metadata.  Browsers that
  receive those bytes guess the sample rate (usually 44100 Hz) and play at
  ≈36 % of normal speed — the "slow robotic voice" distortion.  MuseTalk also
  receives the same headerless bytes and builds lip-sync timing at the wrong
  rate, causing desync.

  synthesize_stream() therefore:
    1. Collects all raw PCM chunks from the SSE response.
    2. Prepends a standards-compliant 44-byte RIFF/WAV header that encodes the
       exact sample rate (16000 Hz), channel count (1), and bit depth (16).
    3. Yields header + PCM so every consumer (browser, MuseTalk, etc.) knows
       the exact playback parameters without guessing.
"""

import json
import struct
import base64
import logging
import httpx
from ..config import get_settings

logger = logging.getLogger("webtalk.tts")
settings = get_settings()

ELEVENLABS_URL   = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_URL     = "https://api.cartesia.ai/tts"
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

# ── WAV constants (must match _FMT_RAW_PCM exactly) ──────────────────────────
_WAV_SAMPLE_RATE     = 16_000   # Hz
_WAV_CHANNELS        = 1        # mono
_WAV_BITS_PER_SAMPLE = 16       # s16le
_WAV_HEADER_SIZE     = 44       # standard RIFF/WAV header is always 44 bytes


# ── WAV helpers ───────────────────────────────────────────────────────────────

def pcm_to_wav_header(data_len: int) -> bytes:
    """
    Build a 44-byte RIFF/WAV file header for the project's fixed PCM format:
      16000 Hz · 1 channel · 16-bit signed little-endian.

    Args:
        data_len: exact byte length of the raw PCM payload that follows.
                  This value is encoded directly in the header so that every
                  decoder (browser, ffmpeg, MuseTalk) knows the sample count
                  without having to scan the stream.

    Returns:
        44 bytes — the complete RIFF/WAV header, ready to prepend to the PCM.

    Header layout (all fields little-endian):
      Offset  Size  Field            Value
      ──────  ────  ───────────────  ──────────────────────────────────
          0     4   ChunkID          b"RIFF"
          4     4   ChunkSize        36 + data_len
          8     4   Format           b"WAVE"
         12     4   Subchunk1ID      b"fmt "
         16     4   Subchunk1Size    16  (PCM — no extra params)
         20     2   AudioFormat      1   (Linear PCM)
         22     2   NumChannels      1
         24     4   SampleRate       16000
         28     4   ByteRate         32000  (= 16000 × 1 × 2)
         32     2   BlockAlign       2      (= 1 × 16 / 8)
         34     2   BitsPerSample    16
         36     4   Subchunk2ID      b"data"
         40     4   Subchunk2Size    data_len
    """
    sample_rate     = _WAV_SAMPLE_RATE
    channels        = _WAV_CHANNELS
    bits_per_sample = _WAV_BITS_PER_SAMPLE
    byte_rate       = sample_rate * channels * bits_per_sample // 8   # 32000
    block_align     = channels * bits_per_sample // 8                  # 2
    chunk_size      = 36 + data_len

    return struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",          # ChunkID
        chunk_size,       # ChunkSize
        b"WAVE",          # Format
        b"fmt ",          # Subchunk1ID
        16,               # Subchunk1Size (16 = PCM, no extensions)
        1,                # AudioFormat  (1 = Linear PCM)
        channels,         # NumChannels
        sample_rate,      # SampleRate
        byte_rate,        # ByteRate
        block_align,      # BlockAlign
        bits_per_sample,  # BitsPerSample
        b"data",          # Subchunk2ID
        data_len,         # Subchunk2Size
    )


def pcm_to_wav(pcm_bytes: bytes) -> bytes:
    """
    Wrap a complete raw PCM payload in a RIFF/WAV container.

    Use this when you already have the full PCM buffer in memory and need
    a single bytes object that can be saved, sent as a blob, or handed to
    an audio decoder (MuseTalk, ffmpeg, Web Audio API, etc.).

    Example:
        wav_bytes = pcm_to_wav(my_pcm_data)
        # wav_bytes is a valid .wav file at 16 kHz, mono, 16-bit
    """
    return pcm_to_wav_header(len(pcm_bytes)) + pcm_bytes


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

    # ── Streaming synthesis (WAV-wrapped output) ─────────────────────────────

    async def synthesize_stream(self, text: str):
        """
        Synthesis via Cartesia SSE → RIFF/WAV output.

        WHY we collect first, then yield:
          WAV format requires the exact PCM data length encoded in the file
          header (Subchunk2Size at byte offset 40).  We cannot write a correct
          header until we know the total byte count, so we must accumulate all
          PCM chunks before emitting the first output byte.

          The alternative — a streaming WAV with Subchunk2Size = 0xFFFFFFFF —
          works in some players but causes MuseTalk and most browser Audio
          elements to report "unknown duration" and miscompute playback timing,
          which is exactly the desync bug this change is meant to fix.

        Output layout:
          Bytes 0-43   : 44-byte RIFF/WAV header
                           Format      : PCM (AudioFormat = 1)
                           SampleRate  : 16000 Hz
                           NumChannels : 1 (mono)
                           BitsPerSample: 16
          Bytes 44+    : raw s16le PCM payload from Cartesia, streamed in
                         4096-byte pages for memory efficiency.

        Consumers:
          - Browser (fallback audio path): fetch as blob → audio/wav MIME type
            → new Audio(objectURL) decodes at exactly 16 kHz.
          - MuseTalk backend: receives complete WAV file with correct duration
            → lip-sync frames are timed to the actual audio length.
        """
        url         = f"{CARTESIA_URL}/sse"
        payload     = self._build_payload(text, _FMT_RAW_PCM)
        sse_headers = {**self._base_headers, "Accept": "text/event-stream"}

        logger.debug(
            "Cartesia SSE → WAV  voice=%s  model=%s  format=%s",
            self.voice_id, self.model_id, _FMT_RAW_PCM,
        )

        # ── Phase 1: collect all raw PCM from Cartesia SSE ────────────────────
        pcm_chunks: list[bytes] = []
        pcm_total = 0

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", url, headers=sse_headers, json=payload) as resp:

                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    body       = body_bytes.decode("utf-8", errors="replace")
                    logger.error(
                        "Cartesia SSE failed HTTP %s voice=%s model=%s | %s",
                        resp.status_code, self.voice_id, self.model_id, body[:400],
                    )
                    raise TTSError("Cartesia", resp.status_code, body)

                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue

                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError as exc:
                        logger.warning(
                            "Cartesia SSE — malformed JSON: %s | %s", exc, raw[:80]
                        )
                        continue

                    event_type = event.get("type")

                    if event_type == "chunk":
                        try:
                            audio_bytes = base64.b64decode(event["data"])
                        except (KeyError, Exception) as exc:
                            logger.warning(
                                "Cartesia SSE — could not decode chunk: %s", exc
                            )
                            continue
                        pcm_chunks.append(audio_bytes)
                        pcm_total += len(audio_bytes)

                    elif event_type == "done":
                        logger.info(
                            "Cartesia SSE done: %d raw PCM bytes  (16 kHz s16le)  voice=%s",
                            pcm_total, self.voice_id,
                        )
                        break

                    elif event_type == "error":
                        msg = event.get("message", "unknown Cartesia error")
                        logger.error("Cartesia SSE app-error: %s", msg)
                        raise TTSError("Cartesia", 500, msg)

        # ── Phase 2: build WAV header + stream the payload ────────────────────
        pcm_data   = b"".join(pcm_chunks)
        wav_header = pcm_to_wav_header(len(pcm_data))

        logger.debug(
            "WAV output: %d-byte header + %d-byte PCM = %d bytes total",
            _WAV_HEADER_SIZE, len(pcm_data), _WAV_HEADER_SIZE + len(pcm_data),
        )

        # Yield the header first so consumers can start decoding immediately
        yield wav_header

        # Stream the PCM in pages to avoid one giant allocation in the caller
        page = 4096
        for offset in range(0, len(pcm_data), page):
            yield pcm_data[offset : offset + page]


# ─────────────────────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────────────────────

def get_tts(voice_id: str | None = None) -> ElevenLabsTTS | CartesiaTTS:
    """Return the configured TTS provider instance (Cartesia or ElevenLabs)."""
    provider = settings.tts_provider.lower()
    if provider == "cartesia":
        return CartesiaTTS(voice_id=voice_id)
    return ElevenLabsTTS(voice_id=voice_id)
