"""
Local embeddings via fastembed (ONNX-backed BGE-small).

Why local: Groq has no embeddings endpoint, and remote APIs add latency +
cost + an extra failure point. fastembed runs entirely in-process,
downloads ~33 MB on first use, and emits 384-dim vectors.
"""
import asyncio
from typing import Optional
from fastembed import TextEmbedding

CHUNK_SIZE = 400        # words per chunk
CHUNK_OVERLAP = 50      # word overlap between adjacent chunks
MODEL_NAME = "BAAI/bge-small-en-v1.5"   # 384-dim, fast, high quality
VECTOR_DIM = 384

_embedder: Optional[TextEmbedding] = None


def _get_embedder() -> TextEmbedding:
    global _embedder
    if _embedder is None:
        _embedder = TextEmbedding(model_name=MODEL_NAME)
    return _embedder


class EmbeddingService:
    def chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping word chunks."""
        words = text.split()
        if not words:
            return []
        chunks: list[str] = []
        start = 0
        step = max(1, CHUNK_SIZE - CHUNK_OVERLAP)
        while start < len(words):
            end = min(start + CHUNK_SIZE, len(words))
            chunks.append(" ".join(words[start:end]))
            if end == len(words):
                break
            start += step
        return chunks

    async def embed_chunks(self, chunks: list[str]) -> list[list[float]]:
        if not chunks:
            return []
        # fastembed is synchronous — run in thread pool to avoid blocking event loop
        vectors = await asyncio.to_thread(lambda: list(_get_embedder().embed(chunks)))
        return [v.tolist() for v in vectors]

    async def embed_query(self, query: str) -> list[float]:
        vectors = await self.embed_chunks([query])
        return vectors[0]
