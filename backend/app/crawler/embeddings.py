import httpx
from ..config import get_settings

settings = get_settings()

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64


class EmbeddingService:
    """Uses Groq's embedding endpoint (nomic-embed-text) to generate vectors."""

    def __init__(self):
        self.api_key = settings.groq_api_key
        self.model = settings.groq_embedding_model
        self.base_url = "https://api.groq.com/openai/v1"

    def chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""
        words = text.split()
        chunks = []
        start = 0
        while start < len(words):
            end = min(start + CHUNK_SIZE, len(words))
            chunks.append(" ".join(words[start:end]))
            start += CHUNK_SIZE - CHUNK_OVERLAP
        return chunks

    async def embed_chunks(self, chunks: list[str]) -> list[list[float]]:
        """Embed a batch of text chunks. Returns list of float vectors."""
        if not chunks:
            return []

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": chunks},
            )
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]

    async def embed_query(self, query: str) -> list[float]:
        vectors = await self.embed_chunks([query])
        return vectors[0]
