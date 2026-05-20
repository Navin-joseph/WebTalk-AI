import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    SearchRequest,
)
from ..database import get_qdrant

VECTOR_DIM = 384  # bge-small-en-v1.5 dimension (fastembed)


class VectorStore:
    def __init__(self):
        self.client: AsyncQdrantClient = get_qdrant()

    def _collection_name(self, client_id: str) -> str:
        return f"client_{client_id.replace('-', '_')}"

    async def ensure_collection(self, client_id: str):
        name = self._collection_name(client_id)
        existing = await self.client.get_collections()
        names = [c.name for c in existing.collections]
        if name not in names:
            await self.client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
            )

    async def upsert(self, client_id: str, documents: list[dict]):
        """documents: list of {text, url, title, vector}"""
        name = self._collection_name(client_id)
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=doc["vector"],
                payload={"text": doc["text"], "url": doc["url"], "title": doc["title"]},
            )
            for doc in documents
        ]
        await self.client.upsert(collection_name=name, points=points)

    async def search(self, client_id: str, query_vector: list[float], top_k: int = 5) -> list[dict]:
        name = self._collection_name(client_id)
        results = await self.client.search(
            collection_name=name,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True,
        )
        return [
            {
                "text": r.payload["text"],
                "url": r.payload["url"],
                "title": r.payload["title"],
                "score": r.score,
            }
            for r in results
        ]

    async def delete_collection(self, client_id: str):
        await self.client.delete_collection(self._collection_name(client_id))
