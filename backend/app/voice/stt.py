import httpx
from ..config import get_settings

settings = get_settings()

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


class DeepgramSTT:
    """Transcribe audio bytes using Deepgram Nova-2."""

    def __init__(self):
        self.api_key = settings.deepgram_api_key
        self.headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "audio/webm",
        }
        self.params = {
            "model": "nova-2",
            "smart_format": "true",
            "punctuate": "true",
            "language": "en-US",
        }

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Send audio bytes and return transcript string."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                DEEPGRAM_URL,
                headers=self.headers,
                params=self.params,
                content=audio_bytes,
            )
            resp.raise_for_status()
            data = resp.json()

        alternatives = data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])
        return alternatives[0].get("transcript", "") if alternatives else ""
