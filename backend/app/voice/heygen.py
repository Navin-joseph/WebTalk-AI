"""
heygen.py — HeyGen Interactive Avatar integration

HeyGen handles:
  - Real-time text-to-speech (TTS)
  - Mouth movement animation  (lip-sync)
  - Avatar expressiveness (blinks, nods, natural movements)
  - WebRTC video streaming

All in one native pipeline — no separate TTS provider, no separate lip-sync model.

Flow:
  1. Backend creates a HeyGen session via POST /v1/streaming.create
  2. HeyGen returns: {session_id, access_token, video_stream_url}
  3. Frontend connects to the WebRTC video_stream_url
  4. Backend sends text chunks to HeyGen via /v1/streaming.chat_stream
  5. HeyGen speaks + animates, streams video back to frontend
  6. When done, session is destroyed

Env vars required:
  HEYGEN_API_KEY      — HeyGen authentication token
  HEYGEN_AVATAR_ID    — Avatar ID (e.g., "78dc3d8016223f50a9bdb4ce")
"""

import json
import logging
import httpx
from ..config import get_settings

logger = logging.getLogger("webtalk.heygen")
settings = get_settings()

HEYGEN_API_URL = "https://api.heygen.com"
HEYGEN_API_VERSION = "v1"


class HeyGenError(Exception):
    """Raised when HeyGen API fails."""

    def __init__(self, msg: str, status: int | None = None, body: str = ""):
        super().__init__(msg)
        self.status = status
        self.body = body


class HeyGenSession:
    """Manages a single HeyGen interactive avatar session."""

    def __init__(self, session_id: str, access_token: str, video_stream_url: str):
        """
        Args:
            session_id: Unique HeyGen session ID
            access_token: JWT token for this session
            video_stream_url: WebRTC stream URL (pass to frontend)
        """
        self.session_id = session_id
        self.access_token = access_token
        self.video_stream_url = video_stream_url
        self.api_key = settings.heygen_api_key
        self.base_url = f"{HEYGEN_API_URL}/{HEYGEN_API_VERSION}"

    async def send_text(self, text: str) -> dict:
        """
        Send text to the avatar for TTS + animation.

        Args:
            text: Speech text (HeyGen will generate audio + mouth movements)

        Returns:
            Response dict from HeyGen (typically {"code": 0} on success)
        """
        url = f"{self.base_url}/streaming.chat_stream"
        headers = {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "session_id": self.session_id,
            "text": text.strip(),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code != 200:
                body = resp.text
                logger.error(
                    "HeyGen chat_stream failed HTTP %s: %s",
                    resp.status_code, body[:400],
                )
                raise HeyGenError(
                    f"HeyGen chat_stream failed: {resp.status_code}",
                    status=resp.status_code,
                    body=body,
                )

            try:
                data = resp.json()
            except Exception as e:
                logger.error("HeyGen response not JSON: %s", e)
                raise HeyGenError(f"HeyGen response parse error: {e}")

            logger.debug("HeyGen chat_stream OK: %s", data)
            return data

    async def destroy(self) -> None:
        """End the session and clean up resources."""
        url = f"{self.base_url}/streaming.stop"
        headers = {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {"session_id": self.session_id}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 200:
                    logger.warning(
                        "HeyGen session stop failed HTTP %s", resp.status_code
                    )
        except Exception as e:
            logger.warning("HeyGen session destroy error: %s", e)


async def create_session() -> HeyGenSession:
    """
    Create a new HeyGen interactive avatar session.

    Returns:
        HeyGenSession instance with video_stream_url ready for WebRTC

    Raises:
        HeyGenError: if session creation fails
    """
    api_key = settings.heygen_api_key
    avatar_id = settings.heygen_avatar_id

    if not api_key:
        raise HeyGenError(
            "Missing HEYGEN_API_KEY environment variable"
        )

    if not avatar_id:
        raise HeyGenError(
            "Missing HEYGEN_AVATAR_ID environment variable"
        )

    # Use the exact public avatar look ID from HeyGen dashboard
    # Plain text format is correct for Interactive Avatar Streaming API

    # Official HeyGen Interactive Avatar Streaming endpoint
    url = f"{HEYGEN_API_URL}/{HEYGEN_API_VERSION}/streaming.create"
    headers = {
        "X-Api-Key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "avatar_id": avatar_id,
    }

    logger.info(
        "HeyGen Interactive Avatar session - avatar_id: %s, endpoint: %s",
        avatar_id, url,
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code != 200:
            body = resp.text
            logger.error(
                "HeyGen streaming.create failed HTTP %s: %s",
                resp.status_code, body[:400],
            )
            logger.error(
                "Request payload was: %s",
                payload,
            )
            raise HeyGenError(
                f"HeyGen session creation failed: {resp.status_code}",
                status=resp.status_code,
                body=body,
            )

        try:
            data = resp.json()
        except Exception as e:
            logger.error("HeyGen response not JSON: %s", e)
            raise HeyGenError(f"HeyGen response parse error: {e}")

        # HeyGen returns: {code, data: {session_id, access_token, video_stream_url}}
        if data.get("code") != 0:
            error_msg = data.get("message", "unknown error")
            logger.error("HeyGen API error: %s", error_msg)
            raise HeyGenError(f"HeyGen API error: {error_msg}")

        session_data = data.get("data", {})
        session_id = session_data.get("session_id")
        access_token = session_data.get("access_token")
        video_stream_url = session_data.get("video_stream_url")

        if not all([session_id, access_token, video_stream_url]):
            logger.error("HeyGen response missing required fields: %s", data)
            raise HeyGenError("HeyGen response missing session_id/token/video_url")

        logger.info("HeyGen session created: %s", session_id)
        return HeyGenSession(session_id, access_token, video_stream_url)
